[CmdletBinding()]
param([string]$RepositoryRoot = (Split-Path -Parent $PSScriptRoot))

$ErrorActionPreference = 'Stop'
$repo = [IO.Path]::GetFullPath($RepositoryRoot)
$requiredCliVersion = '2.84.2'
$runId = [guid]::NewGuid().ToString('N').Substring(0,12)
$projectId = "forge-gate5a-$runId"
$networkName = "forge-gate5a-net-$runId"
$defaultNetworkName = "supabase_network_$projectId"
$temporaryRoot = Join-Path ([IO.Path]::GetTempPath()) "forge-gate5a-history-$runId"
$workdir = Join-Path $temporaryRoot 'capsule'
$migrationsDirectory = Join-Path $workdir 'supabase/migrations'
$manifestPath = Join-Path $repo 'docs/database/baseline/v1-gate1/historical-migrations.sha256.json'
$lineageContractPath = Join-Path $repo 'docs/database/baseline/v1-gate2/lineage-contract.json'
$excludedServices = 'gotrue,realtime,storage-api,imgproxy,kong,mailpit,postgrest,postgres-meta,studio,edge-runtime,logflare,vector,supavisor'
$databaseContainer = "supabase_db_$projectId"
$createdNetwork = $false
$stackStarted = $false
$defaultNetworkAttached = $false
$selectedPort = $null
$sensitiveEnvironmentNames = @(
  'SUPABASE_ACCESS_TOKEN','SUPABASE_DB_URL','SUPABASE_SERVICE_ROLE_KEY',
  'DATABASE_URL','DIRECT_URL','STRIPE_SECRET_KEY','STRIPE_WEBHOOK_SECRET',
  'OPENAI_API_KEY','RUNWAY_API_KEY'
)
$savedEnvironment = @{}
try {
foreach ($name in $sensitiveEnvironmentNames) {
  $savedEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
  [Environment]::SetEnvironmentVariable($name, $null, 'Process')
}

function Invoke-Checked([scriptblock]$Action, [string]$FailureMessage) {
  $output = (& $Action 2>&1 | Out-String)
  if ($LASTEXITCODE -ne 0) { throw "$FailureMessage`n$output" }
  return $output
}

function Get-FreePortBlock {
  $listeners = [System.Collections.Generic.HashSet[int]]::new()
  foreach ($listener in (Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue)) {
    [void]$listeners.Add([int]$listener.LocalPort)
  }
  foreach ($candidate in (60000..62000 | Sort-Object { Get-Random })) {
    $available = $true
    foreach ($port in $candidate..($candidate + 8)) {
      if ($listeners.Contains($port)) { $available = $false; break }
    }
    if ($available) { return $candidate }
  }
  throw 'Unable to find an unused nine-port block for the disposable stack.'
}

function ConvertTo-SqlLiteral([AllowNull()][string]$Value) {
  if ($null -eq $Value) { return 'null' }
  return "'$($Value.Replace("'", "''"))'"
}

function Get-CanonicalRecordLine($Record) {
  $utf8 = [Text.UTF8Encoding]::new($false)
  $fields = @(
    [string]$Record.version,
    (ConvertTo-Json -InputObject ([string[]]$Record.statements) -Compress),
    [string]$Record.name,
    [string]$Record.created_by,
    [string]$Record.idempotency_key,
    (ConvertTo-Json -InputObject ([string[]]$Record.rollback) -Compress)
  )
  return (($fields | ForEach-Object { [Convert]::ToBase64String($utf8.GetBytes($_)) }) -join '|')
}

function Get-RecordsHash([object[]]$Records) {
  $canonical = (($Records | Sort-Object version | ForEach-Object { Get-CanonicalRecordLine $_ }) -join "`n")
  $bytes = [Text.Encoding]::UTF8.GetBytes($canonical)
  return [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($bytes)).ToLowerInvariant()
}

function Invoke-Psql([string]$Sql, [switch]$ExpectFailure) {
  $output = ($Sql | & docker exec -i $databaseContainer psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres 2>&1 | Out-String)
  $exitCode = $LASTEXITCODE
  if ($ExpectFailure) {
    if ($exitCode -eq 0) { throw 'Expected psql transaction failure, but the command succeeded.' }
  }
  elseif ($exitCode -ne 0) {
    throw "Disposable psql command failed.`n$output"
  }
  return $output.Trim()
}

function Get-TargetRecords {
  $csv = Invoke-Psql @'
copy (
  select version,
         array_to_json(statements)::text as statements_json,
         name,
         created_by,
         idempotency_key,
         array_to_json(rollback)::text as rollback_json
  from supabase_migrations.schema_migrations
  order by version
) to stdout with (format csv, header true);
'@
  return @($csv | ConvertFrom-Csv | ForEach-Object {
    [pscustomobject]@{
      version = [string]$_.version
      statements = [string[]]([string]$_.statements_json | ConvertFrom-Json)
      name = [string]$_.name
      created_by = [string]$_.created_by
      idempotency_key = [string]$_.idempotency_key
      rollback = [string[]]([string]$_.rollback_json | ConvertFrom-Json)
    }
  })
}

function Expect-LineageFailure([scriptblock]$Action, [string]$Pattern) {
  try {
    & $Action | Out-Null
    throw "Expected lineage rejection containing: $Pattern"
  }
  catch {
    if ($_.Exception.Message -notmatch $Pattern) { throw }
  }
}

function Get-TaskResources {
  $containers = @(docker ps -a --filter "label=com.supabase.cli.project=$projectId" --format '{{.ID}}|{{.Names}}')
  $volumes = @(docker volume ls --filter "label=com.supabase.cli.project=$projectId" --format '{{.Name}}')
  $networks = @(
    docker network ls --filter "label=com.supabase.cli.project=$projectId" --format '{{.Name}}'
    docker network ls --filter "name=^$([regex]::Escape($networkName))$" --format '{{.Name}}'
  ) | Select-Object -Unique
  return [pscustomobject]@{ containers=$containers; volumes=$volumes; networks=$networks }
}

$actualCliVersion = (& supabase --version 2>$null | Select-Object -First 1).Trim()
if ($actualCliVersion -ne $requiredCliVersion) {
  throw "Supabase CLI $requiredCliVersion is required; found $actualCliVersion."
}
& docker info *> $null
if ($LASTEXITCODE -ne 0) { throw 'Docker Desktop is unavailable. Start it manually.' }
& (Join-Path $PSScriptRoot 'verify-canonical-database-artifacts.ps1') -RepositoryRoot $repo | Out-Null

$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
if ($manifest.migrationCount -ne 414) { throw 'The frozen historical manifest does not contain 414 migrations.' }
$prefix = @($manifest.migrations | Select-Object -First 411)
$expectedPending = @(
  '20261020171517',
  '20261020171519',
  '20261020171522',
  '20261022000000'
)
$records = @($prefix | ForEach-Object {
  $version = [string]$_.version
  [pscustomobject]@{
    version = $version
    statements = [string[]]@("select '$version'::text as gate5a_synthetic_history")
    name = "gate5a_synthetic_$version"
    created_by = 'gate5a-local-poc'
    idempotency_key = "gate5a-$version"
    rollback = [string[]]@("select '$version'::text as gate5a_synthetic_rollback")
  }
})
$sourceHash = Get-RecordsHash $records
$nurseryContainersBefore = @(docker ps -a --filter 'label=com.supabase.cli.project=nursery' --format '{{.ID}}|{{.Names}}' | Sort-Object)
$nurseryVolumesBefore = @(docker volume ls --filter 'label=com.supabase.cli.project=nursery' --format '{{.Name}}' | Sort-Object)
$selectedPort = Get-FreePortBlock
$teardownInventory = [ordered]@{
  projectId = $projectId
  network = $networkName
  defaultNetwork = $defaultNetworkName
  temporaryRoot = $temporaryRoot
  expectedContainer = $databaseContainer
  expectedVolume = "supabase_db_$projectId"
  portBlock = @($selectedPort..($selectedPort + 8))
}

$result = [ordered]@{
  ok = $false
  cliVersion = $actualCliVersion
  projectId = $projectId
  selectedPort = $selectedPort
  syntheticRecordCount = $records.Count
  sourceHash = $sourceHash
  targetHash = $null
  transactionalRestore = $false
  rollbackRejected = $false
  corruptionDetected = $false
  incompleteHistoryRejected = $false
  unknownVersionRejected = $false
  cliListRecognized = $false
  dryRunPendingVersions = @()
  lineage = $null
  outboundNetwork = 'internal except temporary credential-free CLI recognition window'
  cliNetworkWindowSeconds = $null
  sanitizedEnvironmentVariables = $sensitiveEnvironmentNames
  teardownInventory = $teardownInventory
  cleanupVerified = $false
  nurseryDatabaseUnchanged = $false
}

New-Item -ItemType Directory -Path $migrationsDirectory -Force | Out-Null
try {
  $config = @"
project_id = "$projectId"
[api]
enabled = false
port = $selectedPort
schemas = ["public", "graphql_public"]
extra_search_path = ["public", "extensions"]
[db]
port = $($selectedPort + 1)
shadow_port = $($selectedPort + 2)
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

  & docker network create --internal --label forge.gate=5a --label "forge.run=$runId" $networkName | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Unable to create the task-scoped internal Docker network.' }
  $createdNetwork = $true

  $startOutput = (& supabase start --workdir $workdir --exclude $excludedServices --yes --agent=no 2>&1 | Out-String)
  if ($LASTEXITCODE -ne 0) { throw "Unable to start the disposable database.`n$startOutput" }
  $stackStarted = $true
  $containerLabels = docker inspect $databaseContainer --format '{{json .Config.Labels}}'
  if ($LASTEXITCODE -ne 0 -or $containerLabels -notmatch [regex]::Escape($projectId)) {
    throw 'Disposable database container identity could not be proven.'
  }
  & docker network connect $networkName $databaseContainer
  if ($LASTEXITCODE -ne 0) { throw 'Unable to attach the disposable database to its internal network.' }
  & docker network disconnect $defaultNetworkName $databaseContainer
  if ($LASTEXITCODE -ne 0) { throw 'Unable to disconnect the disposable database from its default outbound network.' }
  $defaultNetworkAttached = $false
  $networkInternal = docker network inspect $networkName --format '{{.Internal}}'
  if ($networkInternal.Trim() -ne 'true') { throw 'Disposable Docker network is not internal.' }
  $attachedNetworks = @(docker inspect $databaseContainer --format '{{range $name, $value := .NetworkSettings.Networks}}{{$name}}{{"\n"}}{{end}}')
  if (($attachedNetworks | Where-Object { $_ -and $_ -ne $networkName }).Count -ne 0) {
    throw "Disposable database retains an unexpected Docker network: $($attachedNetworks -join ',')"
  }

  $existingRelation = Invoke-Psql "select coalesce(to_regclass('supabase_migrations.schema_migrations')::text,'');"
  $existingCount = if ($existingRelation) { [int](Invoke-Psql "select count(*) from supabase_migrations.schema_migrations;") } else { 0 }
  if ($existingCount -ne 0) { throw "Disposable target unexpectedly contains $existingCount migration rows." }

  $valueRows = @($records | ForEach-Object {
    $statements = 'array[' + (([string[]]$_.statements | ForEach-Object { ConvertTo-SqlLiteral $_ }) -join ',') + ']::text[]'
    $rollback = 'array[' + (([string[]]$_.rollback | ForEach-Object { ConvertTo-SqlLiteral $_ }) -join ',') + ']::text[]'
    '(' + (@(
      (ConvertTo-SqlLiteral $_.version),
      $statements,
      (ConvertTo-SqlLiteral $_.name),
      (ConvertTo-SqlLiteral $_.created_by),
      (ConvertTo-SqlLiteral $_.idempotency_key),
      $rollback
    ) -join ',') + ')'
  })
  $restoreSql = @"
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
"@
  Invoke-Psql $restoreSql | Out-Null
  $targetRecords = Get-TargetRecords
  $targetHash = Get-RecordsHash $targetRecords
  $result.targetHash = $targetHash
  if ($targetRecords.Count -ne 411 -or $targetHash -ne $sourceHash) {
    throw 'Synthetic source-to-target history verification failed.'
  }
  $result.transactionalRestore = $true

  $rollbackProbe = '20990101000000'
  $rollbackSql = @"
begin;
insert into supabase_migrations.schema_migrations(version,name) values('$rollbackProbe','gate5a_rollback_probe');
insert into supabase_migrations.schema_migrations(version,name) values('$($records[0].version)','gate5a_duplicate');
commit;
"@
  Invoke-Psql $rollbackSql -ExpectFailure | Out-Null
  $rollbackCount = [int](Invoke-Psql "select count(*) from supabase_migrations.schema_migrations where version='$rollbackProbe';")
  if ($rollbackCount -ne 0) { throw 'Failed history transaction left a partial row behind.' }
  $result.rollbackRejected = $true

  $corruptVersion = [string]$records[10].version
  $corruptionOutput = Invoke-Psql @"
begin;
update supabase_migrations.schema_migrations set statements=array['gate5a_corrupted'] where version='$corruptVersion';
select array_to_json(statements)::text from supabase_migrations.schema_migrations where version='$corruptVersion';
rollback;
"@
  if ($corruptionOutput -notmatch 'gate5a_corrupted') { throw 'Corruption probe did not modify its transactional view.' }
  if ((Get-RecordsHash (Get-TargetRecords)) -ne $sourceHash) { throw 'Corruption probe was not rolled back.' }
  $result.corruptionDetected = $true

  Copy-Item -Path (Join-Path $repo 'supabase/migrations/*.sql') -Destination $migrationsDirectory
  $contract = Get-Content -LiteralPath $lineageContractPath -Raw | ConvertFrom-Json
  $contract.historical.rootWorkdir = $workdir
  $contract.historical.manifestPath = $manifestPath
  $contract.sharedTail.canonicalMigrationsDirectory = Join-Path $repo 'supabase/migrations'
  $configurationPath = Join-Path $temporaryRoot 'lineage-contract.json'
  [IO.File]::WriteAllText($configurationPath, ($contract | ConvertTo-Json -Depth 8), [Text.UTF8Encoding]::new($false))

  $cliWindowStarted = Get-Date
  & docker network connect $defaultNetworkName $databaseContainer
  if ($LASTEXITCODE -ne 0) { throw 'Unable to open the temporary CLI recognition network window.' }
  $defaultNetworkAttached = $true

  $lineageJson = (& (Join-Path $PSScriptRoot 'verify-supabase-lineage.ps1') -Lineage historical -Workdir $workdir -DatabaseTarget local -Mode preflight -ConfigurationPath $configurationPath -RepositoryRoot $repo | Out-String)
  $lineageResult = $lineageJson | ConvertFrom-Json
  if (-not $lineageResult.ok -or $lineageResult.databaseState -ne 'historical-preflight') {
    throw 'The lineage guard did not identify the synthetic 411-version prefix as historical preflight.'
  }
  $result.lineage = $lineageResult.databaseState

  $listOutput = Invoke-Checked { & supabase migration list --local --workdir $workdir --agent=no } 'Supabase migration list rejected restored history.'
  foreach ($version in $prefix.version) {
    if ($listOutput -notmatch [regex]::Escape([string]$version)) { throw "Migration list omitted restored version $version." }
  }
  $result.cliListRecognized = $true

  $dryRunOutput = Invoke-Checked { & supabase db push --local --dry-run --workdir $workdir --agent=no } 'Supabase dry-run rejected restored history.'
  $pendingFound = @([regex]::Matches($dryRunOutput, '(?m)2026\d{10}') | ForEach-Object Value | Select-Object -Unique)
  if (($pendingFound -join ',') -ne ($expectedPending -join ',')) {
    throw "Unexpected dry-run migration set: $($pendingFound -join ',')"
  }
  $result.dryRunPendingVersions = $pendingFound

  $unknownVersion = '20991231235959'
  Invoke-Psql "insert into supabase_migrations.schema_migrations(version,statements,name,created_by,idempotency_key,rollback) values('$unknownVersion',array['select 1'],'gate5a_unknown','gate5a-local-poc','gate5a-unknown',array['select 1']);" | Out-Null
  Expect-LineageFailure {
    & (Join-Path $PSScriptRoot 'verify-supabase-lineage.ps1') -Lineage historical -Workdir $workdir -DatabaseTarget local -Mode preflight -ConfigurationPath $configurationPath -RepositoryRoot $repo
  } 'unknown migration version'
  Invoke-Psql "delete from supabase_migrations.schema_migrations where version='$unknownVersion';" | Out-Null
  $result.unknownVersionRejected = $true

  $missingRecord = $records[200]
  Invoke-Psql "delete from supabase_migrations.schema_migrations where version='$($missingRecord.version)';" | Out-Null
  Expect-LineageFailure {
    & (Join-Path $PSScriptRoot 'verify-supabase-lineage.ps1') -Lineage historical -Workdir $workdir -DatabaseTarget local -Mode preflight -ConfigurationPath $configurationPath -RepositoryRoot $repo
  } 'not a chronological prefix'
  $missingStatements = 'array[' + (([string[]]$missingRecord.statements | ForEach-Object { ConvertTo-SqlLiteral $_ }) -join ',') + ']::text[]'
  $missingRollback = 'array[' + (([string[]]$missingRecord.rollback | ForEach-Object { ConvertTo-SqlLiteral $_ }) -join ',') + ']::text[]'
  $restoreMissing = "insert into supabase_migrations.schema_migrations(version,statements,name,created_by,idempotency_key,rollback) values(" + (@(
    (ConvertTo-SqlLiteral $missingRecord.version), $missingStatements, (ConvertTo-SqlLiteral $missingRecord.name),
    (ConvertTo-SqlLiteral $missingRecord.created_by), (ConvertTo-SqlLiteral $missingRecord.idempotency_key), $missingRollback
  ) -join ',') + ');'
  Invoke-Psql $restoreMissing | Out-Null
  $result.incompleteHistoryRejected = $true

  if ((Get-RecordsHash (Get-TargetRecords)) -ne $sourceHash) { throw 'History was not restored after rejection probes.' }
  & docker network disconnect $defaultNetworkName $databaseContainer
  if ($LASTEXITCODE -ne 0) { throw 'Unable to close the temporary CLI recognition network window.' }
  $defaultNetworkAttached = $false
  $result.cliNetworkWindowSeconds = [math]::Round(((Get-Date) - $cliWindowStarted).TotalSeconds, 3)
  $finalAttachedNetworks = @(docker inspect $databaseContainer --format '{{range $name, $value := .NetworkSettings.Networks}}{{$name}}{{"\n"}}{{end}}')
  if (($finalAttachedNetworks | Where-Object { $_ -and $_ -ne $networkName }).Count -ne 0) {
    throw 'Disposable database retained outbound network access after CLI recognition.'
  }
  $result.ok = $true
}
finally {
  if ($defaultNetworkAttached -and (docker ps -a --filter "name=^$([regex]::Escape($databaseContainer))$" -q)) {
    & docker network disconnect $defaultNetworkName $databaseContainer 2>$null | Out-Null
    $defaultNetworkAttached = $false
  }
  if ($stackStarted -or (docker ps -a --filter "label=com.supabase.cli.project=$projectId" -q)) {
    & supabase stop --workdir $workdir --no-backup --yes --agent=no 2>$null | Out-Null
  }
  if ($createdNetwork -and (docker network ls --filter "name=^$([regex]::Escape($networkName))$" -q)) {
    & docker network rm $networkName 2>$null | Out-Null
  }
  if (docker network ls --filter "name=^$([regex]::Escape($defaultNetworkName))$" -q) {
    & docker network rm $defaultNetworkName 2>$null | Out-Null
  }
  $resolvedTemp = [IO.Path]::GetFullPath($temporaryRoot)
  $systemTemp = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
  if (-not $resolvedTemp.StartsWith($systemTemp, [StringComparison]::OrdinalIgnoreCase) -or (Split-Path -Leaf $resolvedTemp) -notlike 'forge-gate5a-history-*') {
    throw "Refusing unsafe temporary cleanup target: $resolvedTemp"
  }
  if (Test-Path -LiteralPath $resolvedTemp) { Remove-Item -LiteralPath $resolvedTemp -Recurse -Force }

  $remaining = Get-TaskResources
  $nurseryContainersAfter = @(docker ps -a --filter 'label=com.supabase.cli.project=nursery' --format '{{.ID}}|{{.Names}}' | Sort-Object)
  $nurseryVolumesAfter = @(docker volume ls --filter 'label=com.supabase.cli.project=nursery' --format '{{.Name}}' | Sort-Object)
  $result.cleanupVerified = $remaining.containers.Count -eq 0 -and $remaining.volumes.Count -eq 0 -and $remaining.networks.Count -eq 0 -and -not (Test-Path -LiteralPath $resolvedTemp)
  $result.nurseryDatabaseUnchanged = (($nurseryContainersBefore -join ',') -eq ($nurseryContainersAfter -join ',')) -and (($nurseryVolumesBefore -join ',') -eq ($nurseryVolumesAfter -join ','))
}
}
finally {
  foreach ($name in $sensitiveEnvironmentNames) {
    [Environment]::SetEnvironmentVariable($name, $savedEnvironment[$name], 'Process')
  }
}

$result | ConvertTo-Json -Depth 8 -Compress
if (-not $result.ok -or -not $result.cleanupVerified -or -not $result.nurseryDatabaseUnchanged) { exit 1 }
