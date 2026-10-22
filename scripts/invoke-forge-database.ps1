[CmdletBinding()]
param(
  [Parameter(Mandatory)][ValidateSet('baseline','historical')][string]$Lineage,
  [Parameter(Mandatory)][ValidateSet('Validate','Start','Reset','Stop','Types','CertifyFresh','HistoricalPreflight')][string]$Action,
  [string]$Workdir,
  [string]$OutputPath,
  [string[]]$Schema = @('public'),
  [string]$RepositoryRoot = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = 'Stop'
$repo = [IO.Path]::GetFullPath($RepositoryRoot)
$requiredCliVersion = '2.84.2'
$actualCliVersion = (& supabase --version 2>$null | Select-Object -First 1).Trim()
if ($actualCliVersion -ne $requiredCliVersion) { throw "Supabase CLI $requiredCliVersion is required; found $actualCliVersion." }
& (Join-Path $PSScriptRoot 'verify-canonical-database-artifacts.ps1') -RepositoryRoot $repo | Out-Null

function Require-Workdir {
  if (-not $Workdir) { throw "Action $Action requires an explicit Workdir." }
  return [IO.Path]::GetFullPath($Workdir)
}
function Invoke-Supabase([string[]]$Arguments) {
  & supabase @Arguments
  if ($LASTEXITCODE -ne 0) { throw "Supabase command failed: supabase $($Arguments -join ' ')" }
}

switch ($Action) {
  'Validate' {
    $selectedWorkdir = Require-Workdir
    $mode = if ($Lineage -eq 'baseline') { 'bootstrap' } else { 'preflight' }
    & (Join-Path $PSScriptRoot 'verify-supabase-lineage.ps1') -Lineage $Lineage -Workdir $selectedWorkdir -DatabaseTarget none -Mode $mode -RepositoryRoot $repo
  }
  'Start' {
    if ($Lineage -ne 'baseline') { throw 'Historical-root bootstrap is prohibited. Start supports only an assembled baseline workdir.' }
    $selectedWorkdir = Require-Workdir
    & docker info *> $null
    if ($LASTEXITCODE -ne 0) { throw 'Docker Desktop is unavailable. Start it manually; this entrypoint will not start or repair it.' }
    & (Join-Path $PSScriptRoot 'verify-supabase-lineage.ps1') -Lineage baseline -Workdir $selectedWorkdir -DatabaseTarget none -Mode bootstrap -RepositoryRoot $repo | Out-Null
    Invoke-Supabase @('start','--workdir',$selectedWorkdir,'--agent=no')
    & (Join-Path $PSScriptRoot 'verify-supabase-lineage.ps1') -Lineage baseline -Workdir $selectedWorkdir -DatabaseTarget local -Mode upgrade -RepositoryRoot $repo | Out-Null
  }
  'Reset' {
    if ($Lineage -ne 'baseline') { throw 'Historical-root reset is prohibited.' }
    $selectedWorkdir = Require-Workdir
    & (Join-Path $PSScriptRoot 'verify-supabase-lineage.ps1') -Lineage baseline -Workdir $selectedWorkdir -DatabaseTarget local -Mode upgrade -RepositoryRoot $repo | Out-Null
    Invoke-Supabase @('db','reset','--local','--no-seed','--workdir',$selectedWorkdir,'--agent=no')
    & (Join-Path $PSScriptRoot 'verify-supabase-lineage.ps1') -Lineage baseline -Workdir $selectedWorkdir -DatabaseTarget local -Mode upgrade -RepositoryRoot $repo | Out-Null
  }
  'Stop' {
    if ($Lineage -ne 'baseline') { throw 'Only disposable baseline stacks are managed by this stop entrypoint.' }
    $selectedWorkdir = Require-Workdir
    & (Join-Path $PSScriptRoot 'verify-supabase-lineage.ps1') -Lineage baseline -Workdir $selectedWorkdir -DatabaseTarget none -Mode bootstrap -RepositoryRoot $repo | Out-Null
    Invoke-Supabase @('stop','--workdir',$selectedWorkdir,'--no-backup','--yes','--agent=no')
  }
  'Types' {
    if ($Lineage -ne 'baseline') { throw 'Type generation is supported only from a certified disposable baseline database.' }
    if (-not $OutputPath) { throw 'Types requires an explicit OutputPath.' }
    $selectedWorkdir = Require-Workdir
    & (Join-Path $PSScriptRoot 'verify-supabase-lineage.ps1') -Lineage baseline -Workdir $selectedWorkdir -DatabaseTarget local -Mode upgrade -RepositoryRoot $repo | Out-Null
    $arguments = @('gen','types','typescript','--local','--workdir',$selectedWorkdir,'--agent=no')
    foreach ($item in $Schema) { $arguments += @('--schema',$item) }
    $generated = (& supabase @arguments | Out-String)
    if ($LASTEXITCODE -ne 0) { throw 'Supabase type generation failed.' }
    $resolvedOutput = [IO.Path]::GetFullPath($OutputPath)
    if (-not (Test-Path -LiteralPath (Split-Path -Parent $resolvedOutput) -PathType Container)) { throw 'Type output parent does not exist.' }
    [IO.File]::WriteAllText($resolvedOutput, $generated, [Text.UTF8Encoding]::new($false))
    [pscustomobject]@{ok=$true;lineage='baseline-v1';output=$resolvedOutput;sha256=(Get-FileHash $resolvedOutput -Algorithm SHA256).Hash.ToLowerInvariant()} | ConvertTo-Json -Compress
  }
  'CertifyFresh' {
    if ($Lineage -ne 'baseline') { throw 'Fresh certification requires baseline lineage.' }
    & (Join-Path $PSScriptRoot 'certify-canonical-baseline-v1.ps1') -DefaultPrivilegeMode permissive -RepositoryRoot $repo
    & (Join-Path $PSScriptRoot 'certify-canonical-baseline-v1.ps1') -DefaultPrivilegeMode restrictive -RepositoryRoot $repo
  }
  'HistoricalPreflight' {
    if ($Lineage -ne 'historical') { throw 'HistoricalPreflight requires historical lineage.' }
    if ([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable('SUPABASE_DB_PASSWORD', 'Process'))) {
      throw 'HistoricalPreflight requires SUPABASE_DB_PASSWORD. Passwordless Supabase CLI 2.84.2 creates or rotates a write-capable temporary login role.'
    }
    $selectedWorkdir = Require-Workdir
    $expectedRoot = [IO.Path]::GetFullPath($repo).TrimEnd([IO.Path]::DirectorySeparatorChar)
    if ($selectedWorkdir.TrimEnd([IO.Path]::DirectorySeparatorChar) -ne $expectedRoot) { throw 'Historical preflight must use the repository root workdir.' }
    & (Join-Path $PSScriptRoot 'verify-supabase-lineage.ps1') -Lineage historical -Workdir $selectedWorkdir -DatabaseTarget linked -Mode preflight -RepositoryRoot $repo
    Invoke-Supabase @('migration','list','--linked','--workdir',$selectedWorkdir,'--agent=no')
    Invoke-Supabase @('db','push','--linked','--dry-run','--workdir',$selectedWorkdir,'--agent=no')
  }
}
