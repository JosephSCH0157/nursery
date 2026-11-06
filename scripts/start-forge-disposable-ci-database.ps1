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
$target = Join-Path $selected 'supabase/migrations'
$files = @(Get-ChildItem -LiteralPath $target -Filter '*.sql' -File | Sort-Object Name)
$hashes = @{}
foreach ($file in $files) { $hashes[$file.Name] = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash }
$pending = @($files | Where-Object { $_.BaseName.Substring(0,14) -gt $prefixHead })
if (-not ($pending.Name -contains '20261104143249_align_provider_requests_and_luna_financial_authority.sql')) {
  throw 'Reviewed Luna alignment migration is missing from the unchanged tail.'
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
  Invoke-SqlFile (Join-Path $repo 'supabase/tests/fixtures/canonical_luna_provider_alignment_authority.sql') 'forge.provider_alignment_fixture'
  & (Join-Path $repo 'scripts/test-forge-disposable-ci-guards.ps1') -Container $container -Workdir $selected -Stage alignment -RepositoryRoot $repo

  Restore-PendingMigrations
  & (Join-Path $repo 'scripts/verify-supabase-lineage.ps1') -Lineage baseline -Workdir $selected -DatabaseTarget local -Mode preflight -RepositoryRoot $repo | Out-Null
  Invoke-LocalSupabase @('migration','up','--local','--workdir',$selected,'--yes','--agent=no')
  Assert-ExactHistory @($files | ForEach-Object Name)
  & (Join-Path $repo 'scripts/verify-supabase-lineage.ps1') -Lineage baseline -Workdir $selected -DatabaseTarget local -Mode upgrade -RepositoryRoot $repo | Out-Null
  foreach ($test in @('provider_request_financial_alignment.sql','owner_hearth_aggregate_admission_enforcement.sql')) {
    Invoke-SqlFile (Join-Path $repo "supabase/tests/$test") ''
  }
  & (Join-Path $repo 'scripts/test-forge-disposable-ci-guards.ps1') -Container $container -Workdir $selected -Stage successor -RepositoryRoot $repo
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
  Remove-Item -LiteralPath $staging
}
