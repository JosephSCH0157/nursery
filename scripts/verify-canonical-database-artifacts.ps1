[CmdletBinding()]
param(
  [string]$RepositoryRoot = (Split-Path -Parent $PSScriptRoot),
  [switch]$Json
)

$ErrorActionPreference = 'Stop'
$repo = [IO.Path]::GetFullPath($RepositoryRoot)
$failures = [System.Collections.Generic.List[string]]::new()
$canonicalVerifier = Join-Path $repo 'scripts/verify-frozen-git-evidence.mjs'

& (Join-Path $PSScriptRoot 'verify-database-documentation-contract.ps1') -RepositoryRoot $repo | Out-Null

& (Join-Path $PSScriptRoot 'verify-historical-migration-manifest.ps1') -RepositoryRoot $repo | Out-Null
$canonicalOutput = (& node $canonicalVerifier --repository-root $repo --scope canonical 2>&1 | Out-String).Trim()
if ($LASTEXITCODE -ne 0) { throw $canonicalOutput }
$canonical = $canonicalOutput | ConvertFrom-Json

$compatibilityPath = Join-Path $repo 'docs/database/baseline/v1-gate3/wrappers-extension-compatibility.json'
if (Test-Path -LiteralPath $compatibilityPath) {
  $compatibility = Get-Content -LiteralPath $compatibilityPath -Raw | ConvertFrom-Json
  if ($compatibility.extension -ne 'wrappers' -or
      $compatibility.environments.linked.requiredVersion -ne '0.5.6' -or
      $compatibility.environments.local.requiredVersion -ne '0.5.7' -or
      $compatibility.rejectAllOtherVersions -ne $true) {
    $failures.Add('The frozen wrappers compatibility exception changed.')
  }
}

$baselineMigrations = @(Get-ChildItem -LiteralPath (Join-Path $repo 'database/canonical-baseline-v1/supabase/migrations') -Filter '*.sql' -File)
$baselineEpoch = @($baselineMigrations | Where-Object { $_.BaseName -match '^(?<version>\d{14})_' -and $Matches.version -ge '20261021000000' -and $Matches.version -le '20261021235959' })
if ($baselineEpoch.Count -ne 1 -or $baselineEpoch[0].Name -ne '20261021020814_canonical_baseline_v1.sql') {
  $failures.Add('The immutable baseline epoch must contain exactly the approved baseline migration.')
}

$rootMigrations = @(Get-ChildItem -LiteralPath (Join-Path $repo 'supabase/migrations') -Filter '*.sql' -File)
foreach ($migration in $rootMigrations) {
  if ($migration.BaseName -notmatch '^(?<version>\d{8,14})_') { $failures.Add("Invalid migration filename: $($migration.Name)"); continue }
  $version = $Matches.version
  if ($version -ge '20261021000000' -and $version -le '20261021235959') {
    $failures.Add("Historical workdir contains reserved baseline version: $version")
  }
}

$result = [ordered]@{
  ok = ($failures.Count -eq 0)
  historicalMigrationCount = 414
  baselineMigrationSha256 = '73d2779c406b9428e7fdf189ab7ad084671cf1d03908041dbbe855816556c62e'
  wrappersCompatibilitySha256 = '8b82e58a85b835641c42738a51e695b05b4c7871ae922a48dd192dca303defc1'
  canonicalGitCommit = $canonical.verifiedCommit
  canonicalGitFileCount = $canonical.fileCount
  failures = @($failures)
}
if ($Json) { $result | ConvertTo-Json -Depth 4 } else { $result | ConvertTo-Json -Compress }
if (-not $result.ok) { throw "Canonical database artifact verification failed: $($failures -join '; ')" }
