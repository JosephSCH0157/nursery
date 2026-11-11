[CmdletBinding()]
param(
  [Parameter(Mandatory)][string]$Workdir,
  [switch]$DisposableCI,
  [string]$RepositoryRoot = (Split-Path -Parent $PSScriptRoot)
)

# Test setup only. Ordinary provisioning and all hosted entrypoints stay unchanged.
$ErrorActionPreference = 'Stop'
$repo = [IO.Path]::GetFullPath($RepositoryRoot)
$selected = [IO.Path]::GetFullPath($Workdir).TrimEnd([IO.Path]::DirectorySeparatorChar)
if (-not $DisposableCI -or $env:GITHUB_ACTIONS -cne 'true' -or
    $env:GITHUB_REPOSITORY -cne 'JosephSCH0157/nursery' -or
    $env:GITHUB_RUN_ID -notmatch '^\d+$' -or $env:GITHUB_RUN_ATTEMPT -notmatch '^\d+$' -or
    [string]::IsNullOrWhiteSpace($env:RUNNER_TEMP)) {
  throw 'Disposable database setup requires explicit opt-in and the Forge GitHub Actions identity.'
}
$runnerRoot = [IO.Path]::GetFullPath($env:RUNNER_TEMP).TrimEnd([IO.Path]::DirectorySeparatorChar)
$browserId = "forge-he3-browser-$($env:GITHUB_RUN_ID)-$($env:GITHUB_RUN_ATTEMPT)"
$leaf = Split-Path -Leaf $selected
if ((Split-Path -Parent $selected) -cne $runnerRoot -or $leaf -cnotin @('forge-barstock-baseline',$browserId)) {
  throw 'Disposable database workdir is not an exact job-owned path under RUNNER_TEMP.'
}
foreach ($item in @($selected,(Join-Path $selected 'supabase'),(Join-Path $selected 'supabase/migrations'))) {
  if ((Get-Item -LiteralPath $item -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) {
    throw 'Disposable database paths must not be links.'
  }
}
if (Test-Path -LiteralPath (Join-Path $selected 'supabase/.temp/project-ref')) {
  throw 'Linked database state is prohibited in disposable CI setup.'
}
$config = Get-Content -LiteralPath (Join-Path $selected 'supabase/config.toml') -Raw
$expectedProject = if ($leaf -eq 'forge-barstock-baseline') { 'nursery' } else { $browserId }
$projectMatch = [regex]::Match($config,'(?m)^project_id\s*=\s*"([^"]+)"\s*$')
if (-not $projectMatch.Success -or $projectMatch.Groups[1].Value -cne $expectedProject) {
  throw 'Disposable Supabase project identity differs from the exact job-owned identity.'
}
$container = "supabase_db_$expectedProject"
& docker info *> $null
if ($LASTEXITCODE -ne 0) { throw 'Docker is unavailable; this script will not start or repair it.' }
$existing = @(& docker ps -a --filter "name=^/$container$" --format '{{.Names}}')
if ($LASTEXITCODE -ne 0 -or $existing.Count -ne 0) { throw 'Disposable setup requires an absent job-owned database container.' }
$version = (& supabase --version 2>$null | Select-Object -First 1).Trim()
if ($version -cne '2.84.2') { throw "Supabase CLI 2.84.2 is required; found $version." }
& supabase start --help *> $null
if ($LASTEXITCODE -ne 0) { throw 'Unable to inspect Supabase start.' }
& supabase migration up --help *> $null
if ($LASTEXITCODE -ne 0) { throw 'Unable to inspect Supabase migration up.' }
& (Join-Path $repo 'scripts/verify-supabase-lineage.ps1') -Lineage baseline -Workdir $selected -DatabaseTarget none -Mode bootstrap -RepositoryRoot $repo | Out-Null

$prefixHead = '20261104071802'
$authCompatibilityHead = '20261105025313'
$target = Join-Path $selected 'supabase/migrations'
$files = @(Get-ChildItem -LiteralPath $target -Filter '*.sql' -File | Sort-Object Name)
$hashes = @{}
foreach ($file in $files) { $hashes[$file.Name] = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash }
$pending = @($files | Where-Object { $_.BaseName.Substring(0,14) -gt $prefixHead })
if (-not ($pending.Name -contains '20261104143249_align_provider_requests_and_luna_financial_authority.sql')) {
  throw 'Reviewed Luna alignment migration is missing from the unchanged tail.'
}
if (-not ($files.BaseName -match "^${authCompatibilityHead}_")) {
  throw 'Reviewed disposable Auth compatibility predecessor is missing.'
}
$staging = Join-Path $selected '.ci-pending-migrations'
if (Test-Path -LiteralPath $staging) { throw 'Refusing to reuse a pending-migration staging directory.' }
New-Item -ItemType Directory -Path $staging | Out-Null

function Invoke-LocalSupabase([string[]]$Arguments) {
  & supabase @Arguments
  if ($LASTEXITCODE -ne 0) { throw "Disposable Supabase command failed: $($Arguments -join ' ')" }
}
function Invoke-SqlFile([string]$Path, [string]$Setting) {
  $remote = '/tmp/forge-ci-' + [IO.Path]::GetFileName($Path)
  & docker cp $Path "$($container):$remote"
  if ($LASTEXITCODE -ne 0) { throw "Unable to copy disposable SQL: $Path" }
  $arguments = @('exec',$container,'psql','-X','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres')
  if ($Setting) { $arguments += @('-c',"select set_config('$Setting','disposable-baseline-v1',false);") }
  & docker @arguments -f $remote
  if ($LASTEXITCODE -ne 0) { throw "Disposable SQL failed: $Path" }
}
function Assert-ExactHistory([string[]]$Names) {
  $expected = @($Names | Sort-Object | ForEach-Object { $_.Substring(0,14) })
  $actual = @(& docker exec $container psql -X -A -t -U postgres -d postgres -c 'select version from supabase_migrations.schema_migrations order by version')
  if ($LASTEXITCODE -ne 0) { throw 'Unable to inspect disposable migration history.' }
  $actual = @($actual | ForEach-Object { $_.Trim() } | Where-Object { $_ })
  if (($actual -join ',') -cne ($expected -join ',')) { throw 'Disposable database history is not the exact staged migration prefix.' }
}

function Assert-DisposableAuthUsers {
  param([switch]$AllowCompatibilityRepair)
  # Keep status/keys and Auth logs private. Requests must target loopback only.
  $statusText = (& supabase status --workdir $selected --output json 2>$null | Out-String)
  if ($LASTEXITCODE -ne 0) { throw 'Unable to inspect disposable Auth status.' }
  $status = $statusText | ConvertFrom-Json
  $uri = [uri]$status.API_URL
  if ($uri.Scheme -cne 'http' -or $uri.Host -cne '127.0.0.1') { throw 'Auth regression rejects a non-loopback endpoint.' }
  $headers = @{apikey=$status.SERVICE_ROLE_KEY;Authorization="Bearer $($status.SERVICE_ROLE_KEY)"}
  $endpoint = $status.API_URL.TrimEnd('/') + '/auth/v1/admin/users?page=1&per_page=1000'
  try {
    $users = Invoke-RestMethod -Uri $endpoint -Headers $headers -Method Get
  } catch {
    # Repair only the observed nullable-string scan incompatibility, never a
    # network/auth/configuration failure. Do not echo the underlying log/body.
    $authLogs = (& docker logs "supabase_auth_$expectedProject" --tail 100 2>&1 | Out-String)
    if (-not $AllowCompatibilityRepair -or $LASTEXITCODE -ne 0 -or $authLogs -notmatch 'converting NULL to string') {
      throw 'Disposable Auth list failed without the reviewed null-string scan signature.'
    }
    Invoke-SqlFile (Join-Path $repo 'supabase/tests/fixtures/disposable_ci_luna_auth_compatibility.sql') 'forge.ci_luna_auth_fixture'
    $users = Invoke-RestMethod -Uri $endpoint -Headers $headers -Method Get
    Write-Output '{"ok":true,"disposableAuthNullStringRepair":"verified"}'
  }
  if (@($users.users | Where-Object { $_.id -ceq 'fe000000-0000-4000-8000-000000000001' }).Count -ne 1) {
    throw 'Disposable Auth list did not return the exact synthetic Luna principal.'
  }
}

function Restore-PendingMigrations {
  foreach ($file in @(Get-ChildItem -LiteralPath $staging -Filter '*.sql' -File)) {
    if (Test-Path -LiteralPath (Join-Path $target $file.Name)) { throw "Refusing to overwrite restored migration $($file.Name)." }
    Move-Item -LiteralPath $file.FullName -Destination $target
  }
}

try {
  # Hold back the entire suffix, including every migration after alignment.
  foreach ($file in $pending) { Move-Item -LiteralPath $file.FullName -Destination $staging }
  Invoke-LocalSupabase @('start','--workdir',$selected,'--agent=no')
  Assert-ExactHistory @($files | Where-Object { $_.BaseName.Substring(0,14) -le $prefixHead } | ForEach-Object Name)

  & (Join-Path $repo 'scripts/test-forge-disposable-ci-guards.ps1') -Container $container -Workdir $selected -Stage fixture -RepositoryRoot $repo
  # Both reviewed fixtures retain their original SQL guards and bytes.
  Invoke-SqlFile (Join-Path $repo 'supabase/tests/fixtures/canonical_owner_hearth_aggregate_policy_prerequisites.sql') 'forge.owner_hearth_policy_fixture'
  # This predecessor contract assumes no Luna markup publication yet; it rolls back.
  Invoke-SqlFile (Join-Path $repo 'supabase/tests/owner_hearth_aggregate_admission_enforcement.sql') 'forge.owner_request_certification'
  Invoke-SqlFile (Join-Path $repo 'supabase/tests/fixtures/canonical_luna_provider_alignment_authority.sql') 'forge.provider_alignment_fixture'
  & (Join-Path $repo 'scripts/test-forge-disposable-ci-guards.ps1') -Container $container -Workdir $selected -Stage alignment -RepositoryRoot $repo

  Restore-PendingMigrations
  & (Join-Path $repo 'scripts/verify-supabase-lineage.ps1') -Lineage baseline -Workdir $selected -DatabaseTarget local -Mode preflight -RepositoryRoot $repo | Out-Null
  # Preserve the fixture's exact-head guard: complete Auth preparation at its
  # reviewed predecessor before applying any later shared-tail migration.
  foreach ($file in @($files | Where-Object { $_.BaseName.Substring(0,14) -gt $authCompatibilityHead })) {
    Move-Item -LiteralPath (Join-Path $target $file.Name) -Destination $staging
  }
  Invoke-LocalSupabase @('migration','up','--local','--workdir',$selected,'--yes','--agent=no')
  Assert-ExactHistory @($files | Where-Object { $_.BaseName.Substring(0,14) -le $authCompatibilityHead } | ForEach-Object Name)
  Assert-DisposableAuthUsers -AllowCompatibilityRepair

  Restore-PendingMigrations
  & (Join-Path $repo 'scripts/verify-supabase-lineage.ps1') -Lineage baseline -Workdir $selected -DatabaseTarget local -Mode preflight -RepositoryRoot $repo | Out-Null
  Invoke-LocalSupabase @('migration','up','--local','--workdir',$selected,'--yes','--agent=no')
  Assert-ExactHistory @($files | ForEach-Object Name)
  & (Join-Path $repo 'scripts/verify-supabase-lineage.ps1') -Lineage baseline -Workdir $selected -DatabaseTarget local -Mode upgrade -RepositoryRoot $repo | Out-Null
  foreach ($test in @('provider_request_financial_alignment.sql')) {
    Invoke-SqlFile (Join-Path $repo "supabase/tests/$test") ''
  }
  & (Join-Path $repo 'scripts/test-forge-disposable-ci-guards.ps1') -Container $container -Workdir $selected -Stage successor -RepositoryRoot $repo
  Assert-DisposableAuthUsers
  [pscustomobject]@{ok=$true;scope='disposable-ci-only';lineage='baseline-v1';head=$files[-1].BaseName.Substring(0,14);financialAlignment='passed';negativeGuards='passed'} | ConvertTo-Json -Compress
}
finally {
  # Restore the original manifest even on failure, so guarded teardown still works.
  Restore-PendingMigrations
  foreach ($file in $files) {
    if ((Get-FileHash -LiteralPath (Join-Path $target $file.Name) -Algorithm SHA256).Hash -cne $hashes[$file.Name]) {
      throw "Disposable migration bytes changed: $($file.Name)"
    }
  }
  Remove-Item -LiteralPath $staging -Force
}
