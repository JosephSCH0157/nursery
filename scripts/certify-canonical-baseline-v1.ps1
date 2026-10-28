[CmdletBinding()]
param(
  [ValidateSet('permissive','restrictive')]
  [string]$DefaultPrivilegeMode = 'permissive',
  [string]$RepositoryRoot = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = 'Stop'
if ($IsWindows) {
  $supabaseExecutable = (Get-Command supabase.exe -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source
  $env:PATH = (Split-Path -Parent $supabaseExecutable) + [IO.Path]::PathSeparator + $env:PATH
}
$requiredCliVersion = '2.84.2'
$repo = [IO.Path]::GetFullPath($RepositoryRoot)
$sourceWorkdir = Join-Path $repo 'database/canonical-baseline-v1'
$temporaryRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd([IO.Path]::DirectorySeparatorChar)
$workdir = Join-Path $temporaryRoot ("forge-baseline-v1-cert-{0}" -f [guid]::NewGuid().ToString('N'))
$projectId = 'forge-baseline-v1-' + [guid]::NewGuid().ToString('N').Substring(0,12)
$portBase = Get-Random -Minimum 58000 -Maximum 59000
$started = $false

function Invoke-Supabase([string[]]$Arguments) {
  & supabase @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Supabase command failed ($LASTEXITCODE): supabase $($Arguments -join ' ')"
  }
}

function Copy-BaselineMigrations {
  foreach ($migration in (Get-ChildItem -LiteralPath (Join-Path $sourceWorkdir 'supabase/migrations') -Filter '*.sql' -File)) {
    Copy-Item -LiteralPath $migration.FullName -Destination (Join-Path $workdir 'supabase/migrations')
  }
  foreach ($migration in (Get-ChildItem -LiteralPath (Join-Path $repo 'supabase/migrations') -Filter '*.sql' -File | Sort-Object Name)) {
    if ($migration.BaseName -match '^(?<version>\d{8,14})_' -and $Matches.version -ge '20261022000000') {
      Copy-Item -LiteralPath $migration.FullName -Destination (Join-Path $workdir 'supabase/migrations')
    }
  }
}

try {
  $actualCliVersion = (& supabase --version 2>$null | Select-Object -First 1).Trim()
  if ($actualCliVersion -ne $requiredCliVersion) {
    throw "Supabase CLI $requiredCliVersion is required; found $actualCliVersion."
  }
  & (Join-Path $repo 'scripts/verify-canonical-database-artifacts.ps1') -RepositoryRoot $repo | Out-Null
  & docker info *> $null
  if ($LASTEXITCODE -ne 0) {
    throw 'Docker Desktop is unavailable. Start it manually; this script will not start or repair it.'
  }

  New-Item -ItemType Directory -Path (Join-Path $workdir 'supabase/migrations') -Force | Out-Null
  Copy-Item -LiteralPath (Join-Path $sourceWorkdir '.forge-database-lineage.json') -Destination $workdir
  $config = Get-Content -LiteralPath (Join-Path $sourceWorkdir 'supabase/config.toml') -Raw
  $config = $config.Replace('project_id = "forge-canonical-baseline-v1"', "project_id = `"$projectId`"")
  $config = $config.Replace('port = 55321', "port = $portBase")
  $config = $config.Replace('port = 55322', "port = $($portBase + 1)")
  $config = $config.Replace('shadow_port = 55320', "shadow_port = $($portBase + 2)")
  [IO.File]::WriteAllText((Join-Path $workdir 'supabase/config.toml'), $config, [Text.UTF8Encoding]::new($false))

  if ($DefaultPrivilegeMode -eq 'permissive') {
    Copy-BaselineMigrations
    & (Join-Path $repo 'scripts/verify-supabase-lineage.ps1') -Lineage baseline -Workdir $workdir -DatabaseTarget none -Mode bootstrap -RepositoryRoot $repo | Out-Null
    Invoke-Supabase @('start','--workdir',$workdir,'--ignore-health-check','--agent=no')
    $started = $true
  }
  else {
    # Start the Supabase platform with no Forge migration, establish a restrictive
    # ambient default-privilege state, then apply the unmodified baseline through
    # the normal CLI migration runner.
    Invoke-Supabase @('start','--workdir',$workdir,'--ignore-health-check','--agent=no')
    $started = $true
    $restrictiveSql = @'
do $restrictive_defaults$
begin
  execute 'alter default privileges for role postgres revoke all on tables from anon, authenticated, service_role';
  execute 'alter default privileges for role postgres revoke all on sequences from anon, authenticated, service_role';
  execute 'alter default privileges for role postgres revoke all on functions from anon, authenticated, service_role';
  execute 'alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated, service_role';
  execute 'alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated, service_role';
  execute 'alter default privileges for role postgres in schema public revoke all on functions from anon, authenticated, service_role';
end
$restrictive_defaults$
'@
    Invoke-Supabase @('db','query','--local','--workdir',$workdir,'--agent=no',$restrictiveSql)
    Copy-BaselineMigrations
    & (Join-Path $repo 'scripts/verify-supabase-lineage.ps1') -Lineage baseline -Workdir $workdir -DatabaseTarget none -Mode bootstrap -RepositoryRoot $repo | Out-Null
    Invoke-Supabase @('migration','up','--local','--workdir',$workdir,'--yes')
  }

  & (Join-Path $repo 'scripts/verify-supabase-lineage.ps1') -Lineage baseline -Workdir $workdir -DatabaseTarget local -Mode upgrade -RepositoryRoot $repo | Out-Null
  Invoke-Supabase @('db','query','--local','--workdir',$workdir,'--agent=no',"notify pgrst, 'reload schema';")
  if ($DefaultPrivilegeMode -eq 'restrictive') {
    # This lane intentionally starts PostgREST before the tongs schema exists.
    # Restart only the disposable lane's REST container after applying the
    # baseline so certification does not depend on PostgREST reconnect backoff.
    & docker restart "supabase_rest_$projectId" | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Unable to restart the disposable PostgREST container.' }
  }

  $container = "supabase_db_$projectId"
  foreach ($test in @(
    'supabase/tests/public_slice_a_catalog_parity.sql',
    'supabase/tests/public_slice_a_security_behavior.sql',
    'supabase/tests/gate6o_episode_storage_tier_contract.sql'
    'supabase/tests/gate6p_storage_bucket_contract.sql'
    'supabase/tests/hammer_h2c_inactive_transcription_contract.sql'
  )) {
    $source = Join-Path $repo $test
    $target = '/tmp/' + [IO.Path]::GetFileName($test)
    & docker cp $source "${container}:$target"
    if ($LASTEXITCODE -ne 0) { throw "Unable to copy $test into the disposable database." }
    & docker exec $container psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres -f $target
    if ($LASTEXITCODE -ne 0) { throw "Database test failed: $test" }
  }

  $savedContainer = $env:SUPABASE_DB_CONTAINER
  try {
    $env:SUPABASE_DB_CONTAINER = $container
    & node (Join-Path $repo 'scripts/verify-barstock-persistence-db.mjs')
    if ($LASTEXITCODE -ne 0) { throw 'Bar Stock successor lifecycle certification failed.' }
  }
  finally { $env:SUPABASE_DB_CONTAINER = $savedContainer }

  & (Join-Path $repo 'scripts/test-canonical-baseline-v1-data-api.ps1') -Workdir $workdir
  if ($LASTEXITCODE -ne 0) { throw 'Disposable Data API behavior test failed.' }

  $actualFingerprint = Join-Path $workdir 'canonical-application-catalog-fingerprint.json'
  Push-Location $workdir
  try {
    $catalogResult = & (Join-Path $repo 'scripts/capture-canonical-baseline-v1-catalog.ps1') -Target local -OutputPath $actualFingerprint -ExpectedPath (Join-Path $repo 'docs/database/baseline/v1-hammer-h2c/successor-catalog-fingerprint.json') -ExtensionCompatibilityPath (Join-Path $repo 'docs/database/baseline/v1-gate3/wrappers-extension-compatibility.json') -RepositoryRoot $repo | ConvertFrom-Json
  }
  finally { Pop-Location }

  [pscustomobject]@{
    ok = $true
    schema = 'forge.hammer-h2c-baseline-successor-certification.v1'
    cliVersion = $actualCliVersion
    defaultPrivilegeMode = $DefaultPrivilegeMode
    catalogObjectCount = $catalogResult.objectCount
    catalogContractSha256 = $catalogResult.contractSha256
    approvedEnvironmentalDifferences = @($catalogResult.approvedEnvironmentalDifferences)
    workdir = $workdir
    projectId = $projectId
  } | ConvertTo-Json -Compress
}
finally {
  if ($started) {
    & supabase stop --workdir $workdir --no-backup --yes --agent=no *> $null
  }
  $resolved = [IO.Path]::GetFullPath($workdir)
  if ($resolved.StartsWith($temporaryRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase) -and
      [IO.Path]::GetFileName($resolved).StartsWith('forge-baseline-v1-cert-', [StringComparison]::Ordinal)) {
    if (Test-Path -LiteralPath $resolved) { Remove-Item -LiteralPath $resolved -Recurse -Force }
  }
}
