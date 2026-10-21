[CmdletBinding()]
param([string]$RepositoryRoot = (Split-Path -Parent $PSScriptRoot))

$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath($RepositoryRoot)
$temporaryRoot = Join-Path ([IO.Path]::GetTempPath()) ("forge-lineage-test-{0}" -f [guid]::NewGuid().ToString('N'))
$historicalWorkdir = Join-Path $temporaryRoot 'historical'
$baselineWorkdir = Join-Path $temporaryRoot 'baseline'
$rejectionWorkdir = Join-Path $temporaryRoot 'rejection'
$projectId = 'forge-lineage-' + [guid]::NewGuid().ToString('N').Substring(0,12)
$basePort = Get-Random -Minimum 59100 -Maximum 59600

function Write-TestProject([string]$Workdir,[string]$Id,[int]$Port) {
  New-Item -ItemType Directory -Path (Join-Path $Workdir 'supabase/migrations') -Force | Out-Null
  $config = @"
project_id = "$Id"
[api]
enabled = true
port = $Port
schemas = ["public", "graphql_public"]
extra_search_path = ["public", "extensions"]
[db]
port = $($Port + 1)
shadow_port = $($Port + 2)
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
  Set-Content -LiteralPath (Join-Path $Workdir 'supabase/config.toml') -Value $config -Encoding utf8
}
function Expect-Failure([scriptblock]$Action,[string]$Pattern) {
  try { & $Action | Out-Null; throw "Expected failure containing: $Pattern" }
  catch { if ($_.Exception.Message -notmatch $Pattern) { throw } }
}

New-Item -ItemType Directory -Path $temporaryRoot | Out-Null
try {
  Write-TestProject $historicalWorkdir ($projectId + '-h') $basePort
  Write-TestProject $baselineWorkdir ($projectId + '-b') ($basePort + 10)
  Write-TestProject $rejectionWorkdir ($projectId + '-r') ($basePort + 20)

  & supabase migration new synthetic_history --workdir $historicalWorkdir | Out-Null
  $historicalMigration = Get-ChildItem (Join-Path $historicalWorkdir 'supabase/migrations') -Filter '*.sql' | Select-Object -First 1
  Set-Content -LiteralPath $historicalMigration.FullName -Value 'create schema if not exists synthetic_history;' -Encoding utf8
  $historicalVersion = ($historicalMigration.BaseName -split '_',2)[0]

  Start-Sleep -Milliseconds 1100
  & supabase migration new synthetic_baseline --workdir $baselineWorkdir | Out-Null
  $baselineMigration = Get-ChildItem (Join-Path $baselineWorkdir 'supabase/migrations') -Filter '*.sql' | Select-Object -First 1
  Set-Content -LiteralPath $baselineMigration.FullName -Value @'
create schema if not exists synthetic_baseline;
create schema forge_meta;
create table forge_meta.database_lineage(singleton boolean primary key check(singleton),lineage text not null);
insert into forge_meta.database_lineage values(true,'baseline-v1');
'@ -Encoding utf8
  $baselineVersion = ($baselineMigration.BaseName -split '_',2)[0]
  Set-Content -LiteralPath (Join-Path $baselineWorkdir '.forge-database-lineage.json') -Value '{"lineage":"baseline-v1"}' -Encoding utf8

  $manifest = [ordered]@{ schema='forge.historical-migration-manifest.v1'; migrationCount=1; historicalCutoffVersion=$historicalVersion; migrations=@([ordered]@{version=$historicalVersion;path=('supabase/migrations/'+$historicalMigration.Name);sha256=(Get-FileHash $historicalMigration.FullName -Algorithm SHA256).Hash.ToLowerInvariant()}) }
  $manifestPath = Join-Path $temporaryRoot 'historical.json'; $manifest | ConvertTo-Json -Depth 5 | Set-Content $manifestPath -Encoding utf8
  $configuration = [ordered]@{ schema='forge.database-lineage-contract.v1';requiredSupabaseCliVersion='2.84.2';historical=[ordered]@{lineage='historical-v1';rootWorkdir=$historicalWorkdir;manifestPath=$manifestPath;cutoffVersion=$historicalVersion};baseline=[ordered]@{lineage='baseline-v1';reservedStartVersion=$baselineVersion;reservedEndVersion=$baselineVersion;workdirMarkerFilename='.forge-database-lineage.json'};sharedTail=[ordered]@{canonicalMigrationsDirectory=(Join-Path $temporaryRoot 'canonical-tail');minimumVersion='99999999999999'};databaseMarker=[ordered]@{schema='forge_meta';table='database_lineage';singletonKey=$true} }
  New-Item -ItemType Directory -Path (Join-Path $temporaryRoot 'canonical-tail') | Out-Null
  $configurationPath=Join-Path $temporaryRoot 'lineage.json'; $configuration|ConvertTo-Json -Depth 6|Set-Content $configurationPath -Encoding utf8
  $wrongCliConfiguration = $configuration | ConvertTo-Json -Depth 6 | ConvertFrom-Json
  $wrongCliConfiguration.requiredSupabaseCliVersion = '0.0.0'
  $wrongCliConfigurationPath = Join-Path $temporaryRoot 'wrong-cli-lineage.json'
  $wrongCliConfiguration | ConvertTo-Json -Depth 6 | Set-Content $wrongCliConfigurationPath -Encoding utf8

  Expect-Failure { & (Join-Path $root 'scripts/verify-supabase-lineage.ps1') -Lineage historical -Workdir $historicalWorkdir -DatabaseTarget none -Mode preflight -ConfigurationPath $wrongCliConfigurationPath -RepositoryRoot $temporaryRoot } 'Supabase CLI 0.0.0 is required'
  Expect-Failure { & (Join-Path $root 'scripts/verify-supabase-lineage.ps1') -Lineage historical -Workdir $historicalWorkdir -DatabaseTarget none -Mode bootstrap -ConfigurationPath $configurationPath -RepositoryRoot $temporaryRoot } 'Historical root bootstrap is prohibited'

  & supabase start --workdir $historicalWorkdir --exclude studio,postgres-meta,edge-runtime,logflare,vector,supavisor,imgproxy --yes | Out-Null
  & (Join-Path $root 'scripts/verify-supabase-lineage.ps1') -Lineage historical -Workdir $historicalWorkdir -DatabaseTarget local -Mode upgrade -ConfigurationPath $configurationPath -RepositoryRoot $temporaryRoot | Out-Null
  Expect-Failure { & (Join-Path $root 'scripts/verify-supabase-lineage.ps1') -Lineage baseline -Workdir $historicalWorkdir -DatabaseTarget local -Mode upgrade -ConfigurationPath $configurationPath -RepositoryRoot $temporaryRoot } 'marker|Historical migration'
  & supabase stop --workdir $historicalWorkdir --no-backup --yes | Out-Null

  & supabase start --workdir $baselineWorkdir --exclude studio,postgres-meta,edge-runtime,logflare,vector,supavisor,imgproxy --yes | Out-Null
  & (Join-Path $root 'scripts/verify-supabase-lineage.ps1') -Lineage baseline -Workdir $baselineWorkdir -DatabaseTarget local -Mode upgrade -ConfigurationPath $configurationPath -RepositoryRoot $temporaryRoot | Out-Null
  Expect-Failure { & (Join-Path $root 'scripts/verify-supabase-lineage.ps1') -Lineage historical -Workdir $baselineWorkdir -DatabaseTarget local -Mode upgrade -ConfigurationPath $configurationPath -RepositoryRoot $temporaryRoot } 'Wrong workdir|Unauthorized historical|missing'
  Expect-Failure { & (Join-Path $root 'scripts/verify-supabase-lineage.ps1') -Lineage baseline -Workdir $historicalWorkdir -DatabaseTarget none -Mode bootstrap -ConfigurationPath $configurationPath -RepositoryRoot $temporaryRoot } 'marker|Historical migration'
  & supabase stop --workdir $baselineWorkdir --no-backup --yes | Out-Null

  Copy-Item -LiteralPath (Join-Path $root 'supabase/migrations/20261022000000_establish_database_lineage.sql') -Destination (Join-Path $rejectionWorkdir 'supabase/migrations')
  $rejectionOutput = (& supabase start --workdir $rejectionWorkdir --exclude studio,postgres-meta,edge-runtime,logflare,vector,supavisor,imgproxy --yes 2>&1 | Out-String)
  if ($LASTEXITCODE -eq 0) { throw 'Shared-tail migration unexpectedly bootstrapped a database without an approved lineage.' }
  if ($rejectionOutput -notmatch 'Historical lineage qualification failed') { throw "Unexpected shared-tail rejection: $rejectionOutput" }

  [pscustomobject]@{ok=$true;historicalPass=$true;baselinePass=$true;wrongLineageRejected=$true;rootBootstrapRejected=$true;wrongCliRejected=$true;unqualifiedTailRejected=$true} | ConvertTo-Json -Compress
}
finally {
  foreach ($workdir in @($historicalWorkdir,$baselineWorkdir,$rejectionWorkdir)) {
    if (Test-Path (Join-Path $workdir 'supabase/config.toml')) { & supabase stop --workdir $workdir --no-backup --yes 2>$null | Out-Null }
  }
  if (Test-Path $temporaryRoot) { Remove-Item -LiteralPath $temporaryRoot -Recurse -Force }
}
