[CmdletBinding()]
param(
  [ValidateSet('permissive','restrictive')]
  [string]$DefaultPrivilegeMode = 'permissive',
  [string]$RepositoryRoot = (Split-Path -Parent $PSScriptRoot),
  [switch]$SyntheticUpgrade
)

$ErrorActionPreference = 'Stop'
$repo = [IO.Path]::GetFullPath($RepositoryRoot)
$requiredCliVersion = '2.84.2'
$runId = [guid]::NewGuid().ToString('N').Substring(0,12)
$projectId = "forge-gate5b-$DefaultPrivilegeMode-$runId"
$databaseContainer = "supabase_db_$projectId"
$internalNetwork = "forge-gate5b-net-$runId"
$defaultNetwork = "supabase_network_$projectId"
$temporaryRoot = Join-Path ([IO.Path]::GetTempPath()) "forge-gate5b-$DefaultPrivilegeMode-$runId"
$workdir = Join-Path $temporaryRoot 'fixture'
$fixture = Join-Path $repo 'database/historical-pre-slice-a-v1/pre-slice-a-schema.sql'
$expectedFixtureHash = 'abf0d6f03dd25dc9d4af3f30bcca8d8be6047045033b399d6ba2918315bc9751'
$excludedServices = 'gotrue,realtime,storage-api,imgproxy,kong,mailpit,postgrest,postgres-meta,studio,edge-runtime,logflare,vector,supavisor'
$started = $false
$createdNetwork = $false
$defaultNetworkAttached = $false
$sensitiveEnvironmentNames = @(
  'SUPABASE_ACCESS_TOKEN','SUPABASE_DB_URL','SUPABASE_SERVICE_ROLE_KEY',
  'DATABASE_URL','DIRECT_URL','STRIPE_SECRET_KEY','STRIPE_WEBHOOK_SECRET',
  'OPENAI_API_KEY','RUNWAY_API_KEY'
)
$savedEnvironment = @{}

function Get-FreePortBlock {
  foreach ($candidate in (62010..64000 | Sort-Object { Get-Random })) {
    if ($candidate + 8 -gt 65535) { continue }
    $probes = [System.Collections.Generic.List[System.Net.Sockets.TcpListener]]::new()
    try {
      foreach ($port in $candidate..($candidate + 8)) {
        $probe = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Any, $port)
        $probe.Start()
        $probes.Add($probe)
      }
      return $candidate
    }
    catch {
      continue
    }
    finally {
      foreach ($probe in $probes) { $probe.Stop() }
    }
  }
  throw 'Unable to find an unused nine-port block.'
}

function Invoke-PsqlFile([string]$SourcePath) {
  $target = '/tmp/' + [IO.Path]::GetFileName($SourcePath)
  & docker cp $SourcePath "${databaseContainer}:$target"
  if ($LASTEXITCODE -ne 0) { throw "Unable to copy $SourcePath into the disposable database." }
  & docker exec $databaseContainer psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres -f $target
  if ($LASTEXITCODE -ne 0) { throw "Disposable database test failed: $SourcePath" }
}

function Invoke-Psql([string]$Sql) {
  $output = ($Sql | & docker exec -i $databaseContainer psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres 2>&1 | Out-String)
  if ($LASTEXITCODE -ne 0) { throw "Disposable psql command failed.`n$output" }
  return $output.Trim()
}

function ConvertTo-SqlLiteral([AllowNull()][string]$Value) {
  if ($null -eq $Value) { return 'null' }
  return "'$($Value.Replace("'", "''"))'"
}

function Get-TaskResources {
  $containers = @(docker ps -a --filter "label=com.supabase.cli.project=$projectId" --format '{{.ID}}|{{.Names}}')
  $volumes = @(docker volume ls --filter "label=com.supabase.cli.project=$projectId" --format '{{.Name}}')
  $networks = @(
    docker network ls --filter "label=com.supabase.cli.project=$projectId" --format '{{.Name}}'
    docker network ls --filter "name=^$([regex]::Escape($internalNetwork))$" --format '{{.Name}}'
  ) | Select-Object -Unique
  return [pscustomobject]@{ containers=$containers; volumes=$volumes; networks=$networks }
}

$result = [ordered]@{
  ok = $false
  cliVersion = $null
  defaultPrivilegeMode = $DefaultPrivilegeMode
  fixtureSha256 = $null
  catalogObjectCount = $null
  catalogContractSha256 = $null
  approvedEnvironmentalDifferences = @()
  lineageMarkerAbsent = $false
  migrationHistoryRows = $null
  financiallyInactive = $false
  tests = @()
  syntheticUpgradeAttempted = [bool]$SyntheticUpgrade
  syntheticHistoryRows = $null
  syntheticDryRunPendingVersions = @()
  postUpgradeHistoryRows = $null
  postUpgradeLineage = $null
  postUpgradeCatalogObjectCount = $null
  postUpgradeCatalogContractSha256 = $null
  cleanupVerified = $false
  nurseryDatabaseUnchanged = $false
  projectId = $projectId
  temporaryRoot = $temporaryRoot
}

try {
  foreach ($name in $sensitiveEnvironmentNames) {
    $savedEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
    [Environment]::SetEnvironmentVariable($name, $null, 'Process')
  }

  $actualCliVersion = (& supabase --version 2>$null | Select-Object -First 1).Trim()
  $result.cliVersion = $actualCliVersion
  if ($actualCliVersion -ne $requiredCliVersion) {
    throw "Supabase CLI $requiredCliVersion is required; found $actualCliVersion."
  }
  & docker info *> $null
  if ($LASTEXITCODE -ne 0) { throw 'Docker Desktop is unavailable. Start it manually.' }
  & (Join-Path $PSScriptRoot 'verify-canonical-database-artifacts.ps1') -RepositoryRoot $repo | Out-Null
  & (Join-Path $PSScriptRoot 'verify-pre-slice-a-fixture.ps1') -RepositoryRoot $repo | Out-Null
  $actualFixtureHash = (Get-FileHash -LiteralPath $fixture -Algorithm SHA256).Hash.ToLowerInvariant()
  $result.fixtureSha256 = $actualFixtureHash
  if ($actualFixtureHash -ne $expectedFixtureHash) { throw 'Pre-Slice-A fixture hash mismatch.' }

  $nurseryContainersBefore = @(docker ps -a --filter 'label=com.supabase.cli.project=nursery' --format '{{.ID}}|{{.Names}}' | Sort-Object)
  $nurseryVolumesBefore = @(docker volume ls --filter 'label=com.supabase.cli.project=nursery' --format '{{.Name}}' | Sort-Object)
  $portBase = Get-FreePortBlock

  New-Item -ItemType Directory -Path (Join-Path $workdir 'supabase/migrations') -Force | Out-Null
  $config = @"
project_id = "$projectId"
[api]
enabled = false
port = $portBase
schemas = ["public", "graphql_public"]
extra_search_path = ["public", "extensions"]
[db]
port = $($portBase + 1)
shadow_port = $($portBase + 2)
major_version = 17
[db.seed]
enabled = false
[studio]
enabled = false
[inbucket]
enabled = false
[analytics]
enabled = false
"@
  [IO.File]::WriteAllText((Join-Path $workdir 'supabase/config.toml'), $config, [Text.UTF8Encoding]::new($false))

  & docker network create --internal --label forge.gate=5b --label "forge.run=$runId" $internalNetwork | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Unable to create the task-scoped internal Docker network.' }
  $createdNetwork = $true

  $startOutput = (& supabase start --workdir $workdir --exclude $excludedServices --ignore-health-check --yes --agent=no 2>&1 | Out-String)
  if ($LASTEXITCODE -ne 0) { throw "Unable to start the disposable database.`n$startOutput" }
  $started = $true
  $labels = docker inspect $databaseContainer --format '{{json .Config.Labels}}'
  if ($LASTEXITCODE -ne 0 -or $labels -notmatch [regex]::Escape($projectId)) {
    throw 'Disposable database container identity could not be proven.'
  }
  & docker network connect $internalNetwork $databaseContainer
  if ($LASTEXITCODE -ne 0) { throw 'Unable to attach the disposable database to its internal network.' }
  & docker network disconnect $defaultNetwork $databaseContainer
  if ($LASTEXITCODE -ne 0) { throw 'Unable to disconnect the disposable database from its default network.' }

  $ambient = if ($DefaultPrivilegeMode -eq 'permissive') { 'grant all' } else { 'revoke all' }
  $ambientDirection = if ($DefaultPrivilegeMode -eq 'permissive') { 'to' } else { 'from' }
  $preconditionSql = @"
alter default privileges for role postgres $ambient on tables $ambientDirection anon, authenticated, service_role;
alter default privileges for role postgres $ambient on sequences $ambientDirection anon, authenticated, service_role;
alter default privileges for role postgres $ambient on functions $ambientDirection anon, authenticated, service_role;
alter default privileges for role postgres in schema public $ambient on tables $ambientDirection anon, authenticated, service_role;
alter default privileges for role postgres in schema public $ambient on sequences $ambientDirection anon, authenticated, service_role;
alter default privileges for role postgres in schema public $ambient on functions $ambientDirection anon, authenticated, service_role;
"@
  Invoke-Psql $preconditionSql | Out-Null
  Invoke-PsqlFile $fixture

  $tests = @(
    'supabase/tests/public_slice_a_catalog_parity.sql',
    'supabase/tests/public_slice_a_security_behavior.sql',
    'supabase/tests/pre_slice_a_fixture_behavior.sql'
  )
  foreach ($test in $tests) {
    Invoke-PsqlFile (Join-Path $repo $test)
    $result.tests += $test
  }

  $markerCount = [int](Invoke-Psql "select count(*) from pg_namespace where nspname='forge_meta';")
  if ($markerCount -ne 0) { throw 'Fixture unexpectedly created forge_meta.' }
  $result.lineageMarkerAbsent = $true
  $historyRelation = Invoke-Psql "select coalesce(to_regclass('supabase_migrations.schema_migrations')::text,'');"
  $historyRows = if ($historyRelation) { [int](Invoke-Psql 'select count(*) from supabase_migrations.schema_migrations;') } else { 0 }
  $result.migrationHistoryRows = $historyRows
  if ($historyRows -ne 0) { throw 'Fixture unexpectedly created migration-history rows.' }
  $result.financiallyInactive = $true

  & docker network connect $defaultNetwork $databaseContainer
  if ($LASTEXITCODE -ne 0) { throw 'Unable to open the temporary local CLI catalog window.' }
  $defaultNetworkAttached = $true
  $actualFingerprint = Join-Path $workdir 'pre-slice-a-local-fingerprint.json'
  Push-Location $workdir
  try {
    $catalogResult = & (Join-Path $repo 'scripts/capture-canonical-baseline-v1-catalog.ps1') `
      -Target local `
      -OutputPath $actualFingerprint `
      -ExpectedPath (Join-Path $repo 'docs/database/baseline/v1-gate3/canonical-application-catalog-fingerprint.json') `
      -ExtensionCompatibilityPath (Join-Path $repo 'docs/database/baseline/v1-gate3/wrappers-extension-compatibility.json') `
      -RepositoryRoot $repo | ConvertFrom-Json
  }
  finally { Pop-Location }
  $result.catalogObjectCount = $catalogResult.objectCount
  $result.catalogContractSha256 = $catalogResult.contractSha256
  $result.approvedEnvironmentalDifferences = @($catalogResult.approvedEnvironmentalDifferences)

  if ($SyntheticUpgrade) {
    $manifestPath = Join-Path $repo 'docs/database/baseline/v1-gate1/historical-migrations.sha256.json'
    $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
    $prefix = @($manifest.migrations | Select-Object -First 411)
    if ($prefix.Count -ne 411) { throw 'Unable to construct the synthetic 411-version history prefix.' }
    $valueRows = @($prefix | ForEach-Object {
      $version = [string]$_.version
      '(' + (@(
        (ConvertTo-SqlLiteral $version),
        ('array[' + (ConvertTo-SqlLiteral "select '$version'::text as gate5b_synthetic_history") + ']::text[]'),
        (ConvertTo-SqlLiteral "gate5b_synthetic_$version"),
        (ConvertTo-SqlLiteral 'gate5b-local-integration'),
        (ConvertTo-SqlLiteral "gate5b-$version"),
        ('array[' + (ConvertTo-SqlLiteral "select '$version'::text as gate5b_synthetic_rollback") + ']::text[]')
      ) -join ',') + ')'
    })
    Invoke-Psql @"
begin;
create schema if not exists supabase_migrations authorization postgres;
create table if not exists supabase_migrations.schema_migrations (
  version text primary key,
  statements text[],
  name text,
  created_by text,
  idempotency_key text,
  rollback text[]
);
alter table supabase_migrations.schema_migrations add column if not exists statements text[];
alter table supabase_migrations.schema_migrations add column if not exists name text;
alter table supabase_migrations.schema_migrations add column if not exists created_by text;
alter table supabase_migrations.schema_migrations add column if not exists idempotency_key text;
alter table supabase_migrations.schema_migrations add column if not exists rollback text[];
insert into supabase_migrations.schema_migrations(version,statements,name,created_by,idempotency_key,rollback)
values
$($valueRows -join ",`n");
commit;
"@ | Out-Null
    $result.syntheticHistoryRows = [int](Invoke-Psql 'select count(*) from supabase_migrations.schema_migrations;')
    if ($result.syntheticHistoryRows -ne 411) { throw 'Synthetic history restoration did not produce 411 rows.' }

    Copy-Item -Path (Join-Path $repo 'supabase/migrations/*.sql') -Destination (Join-Path $workdir 'supabase/migrations')
    $contract = Get-Content -LiteralPath (Join-Path $repo 'docs/database/baseline/v1-gate2/lineage-contract.json') -Raw | ConvertFrom-Json
    $contract.historical.rootWorkdir = $workdir
    $contract.historical.manifestPath = $manifestPath
    $contract.sharedTail.canonicalMigrationsDirectory = Join-Path $repo 'supabase/migrations'
    $configurationPath = Join-Path $temporaryRoot 'lineage-contract.json'
    [IO.File]::WriteAllText($configurationPath, ($contract | ConvertTo-Json -Depth 8), [Text.UTF8Encoding]::new($false))

    $preflightJson = (& (Join-Path $repo 'scripts/verify-supabase-lineage.ps1') `
      -Lineage historical -Workdir $workdir -DatabaseTarget local -Mode preflight `
      -ConfigurationPath $configurationPath -RepositoryRoot $repo | Out-String)
    $preflight = $preflightJson | ConvertFrom-Json
    if (-not $preflight.ok -or $preflight.databaseState -ne 'historical-preflight') {
      throw 'Synthetic fixture/history integration was not recognized as historical preflight.'
    }

    $dryRunOutput = (& supabase db push --local --dry-run --workdir $workdir --agent=no 2>&1 | Out-String)
    if ($LASTEXITCODE -ne 0) { throw "Synthetic upgrade dry-run failed.`n$dryRunOutput" }
    $pending = @([regex]::Matches($dryRunOutput, '(?m)2026\d{10}') | ForEach-Object Value | Select-Object -Unique)
    $expectedPending = @('20261020171517','20261020171519','20261020171522','20261022000000')
    if (($pending -join ',') -ne ($expectedPending -join ',')) {
      throw "Unexpected synthetic upgrade dry-run order: $($pending -join ',')"
    }
    $result.syntheticDryRunPendingVersions = $pending

    $upgradeOutput = (& supabase migration up --local --workdir $workdir --yes --agent=no 2>&1 | Out-String)
    if ($LASTEXITCODE -ne 0) { throw "Synthetic normal-order upgrade failed.`n$upgradeOutput" }
    $result.postUpgradeHistoryRows = [int](Invoke-Psql 'select count(*) from supabase_migrations.schema_migrations;')
    if ($result.postUpgradeHistoryRows -ne 415) { throw 'Synthetic upgrade did not record the expected 415 total versions.' }
    $marker = Invoke-Psql "select lineage from forge_meta.database_lineage where singleton;"
    if ($marker -ne 'historical-v1') { throw "Unexpected post-upgrade lineage marker: $marker" }
    $result.postUpgradeLineage = $marker
    & (Join-Path $repo 'scripts/verify-supabase-lineage.ps1') `
      -Lineage historical -Workdir $workdir -DatabaseTarget local -Mode upgrade `
      -ConfigurationPath $configurationPath -RepositoryRoot $repo | Out-Null
    Invoke-PsqlFile (Join-Path $repo 'supabase/tests/public_slice_a_catalog_parity.sql')
    Invoke-PsqlFile (Join-Path $repo 'supabase/tests/public_slice_a_security_behavior.sql')
    $postUpgradeFingerprint = Join-Path $workdir 'post-upgrade-local-fingerprint.json'
    Push-Location $workdir
    try {
      $postUpgradeCatalog = & (Join-Path $repo 'scripts/capture-canonical-baseline-v1-catalog.ps1') `
        -Target local `
        -OutputPath $postUpgradeFingerprint `
        -ExpectedPath (Join-Path $repo 'docs/database/baseline/v1-gate3/canonical-application-catalog-fingerprint.json') `
        -ExtensionCompatibilityPath (Join-Path $repo 'docs/database/baseline/v1-gate3/wrappers-extension-compatibility.json') `
        -RepositoryRoot $repo | ConvertFrom-Json
    }
    finally { Pop-Location }
    $result.postUpgradeCatalogObjectCount = $postUpgradeCatalog.objectCount
    $result.postUpgradeCatalogContractSha256 = $postUpgradeCatalog.contractSha256
  }

  & docker network disconnect $defaultNetwork $databaseContainer
  if ($LASTEXITCODE -ne 0) { throw 'Unable to close the temporary local CLI catalog window.' }
  $defaultNetworkAttached = $false

  $result.ok = $true
}
finally {
  if ($defaultNetworkAttached -and (docker ps -a --filter "name=^$([regex]::Escape($databaseContainer))$" -q)) {
    & docker network disconnect $defaultNetwork $databaseContainer 2>$null | Out-Null
  }
  if ($started -or (docker ps -a --filter "label=com.supabase.cli.project=$projectId" -q)) {
    & supabase stop --workdir $workdir --no-backup --yes --agent=no 2>$null | Out-Null
  }
  if ($createdNetwork -and (docker network ls --filter "name=^$([regex]::Escape($internalNetwork))$" -q)) {
    & docker network rm $internalNetwork 2>$null | Out-Null
  }
  if (docker network ls --filter "name=^$([regex]::Escape($defaultNetwork))$" -q) {
    & docker network rm $defaultNetwork 2>$null | Out-Null
  }
  $resolvedTemp = [IO.Path]::GetFullPath($temporaryRoot)
  $systemTemp = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
  if (-not $resolvedTemp.StartsWith($systemTemp, [StringComparison]::OrdinalIgnoreCase) -or
      (Split-Path -Leaf $resolvedTemp) -notlike 'forge-gate5b-*') {
    throw "Refusing unsafe temporary cleanup target: $resolvedTemp"
  }
  if (Test-Path -LiteralPath $resolvedTemp) { Remove-Item -LiteralPath $resolvedTemp -Recurse -Force }
  $remaining = Get-TaskResources
  $nurseryContainersAfter = @(docker ps -a --filter 'label=com.supabase.cli.project=nursery' --format '{{.ID}}|{{.Names}}' | Sort-Object)
  $nurseryVolumesAfter = @(docker volume ls --filter 'label=com.supabase.cli.project=nursery' --format '{{.Name}}' | Sort-Object)
  $result.cleanupVerified = $remaining.containers.Count -eq 0 -and $remaining.volumes.Count -eq 0 -and $remaining.networks.Count -eq 0 -and -not (Test-Path -LiteralPath $resolvedTemp)
  $result.nurseryDatabaseUnchanged = (($nurseryContainersBefore -join ',') -eq ($nurseryContainersAfter -join ',')) -and (($nurseryVolumesBefore -join ',') -eq ($nurseryVolumesAfter -join ','))
  foreach ($name in $sensitiveEnvironmentNames) {
    [Environment]::SetEnvironmentVariable($name, $savedEnvironment[$name], 'Process')
  }
}

$result | ConvertTo-Json -Depth 8 -Compress
if (-not $result.ok -or -not $result.cleanupVerified -or -not $result.nurseryDatabaseUnchanged) { exit 1 }
