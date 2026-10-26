[CmdletBinding()]
param(
  [string]$RepositoryRoot = (Split-Path -Parent $PSScriptRoot),
  [switch]$Json
)

$ErrorActionPreference = 'Stop'
$manifestPath = Join-Path $RepositoryRoot 'docs/database/baseline/v1-gate1/historical-migrations.sha256.json'
$migrationRoot = Join-Path $RepositoryRoot 'supabase/migrations'
$canonicalVerifier = Join-Path $RepositoryRoot 'scripts/verify-frozen-git-evidence.mjs'

if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
  throw "Historical manifest is missing: $manifestPath"
}

$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
if ($manifest.schema -ne 'forge.historical-migration-manifest.v1') { throw 'Unexpected manifest schema.' }
if ($manifest.migrationCount -ne 414) { throw "Expected 414 manifest entries, got $($manifest.migrationCount)." }
if ($manifest.migrations.Count -ne 414) { throw "Expected 414 migration records, got $($manifest.migrations.Count)." }

$expectedPaths = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::Ordinal)
$expectedVersions = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::Ordinal)
$previousVersion = ''
$failures = [System.Collections.Generic.List[string]]::new()

$canonicalOutput = (& (Join-Path $PSScriptRoot 'invoke-frozen-git-evidence.ps1') -RepositoryRoot $RepositoryRoot -Scope historical | Out-String).Trim()
$canonical = $canonicalOutput | ConvertFrom-Json
if (-not $canonical.ok -or $canonical.certifiedSourceCommit -ne '87524f872e76f24de631d1cbf58580674c9df2a9') {
  throw 'Canonical historical Git-object verification did not establish the approved source contract.'
}

foreach ($entry in $manifest.migrations) {
  if ($entry.version -notmatch '^\d{8,14}$') { $failures.Add("Invalid version: $($entry.version)") }
  if (-not $expectedVersions.Add([string]$entry.version)) { $failures.Add("Duplicate version: $($entry.version)") }
  if ($previousVersion -and [string]::CompareOrdinal($previousVersion, [string]$entry.version) -gt 0) {
    $failures.Add("Manifest is not version-sorted at $($entry.path)")
  }
  $previousVersion = [string]$entry.version
  if (-not $expectedPaths.Add([string]$entry.path)) { $failures.Add("Duplicate path: $($entry.path)") }
  $fullPath = Join-Path $RepositoryRoot ([string]$entry.path)
  if (-not (Test-Path -LiteralPath $fullPath -PathType Leaf)) {
    $failures.Add("Missing migration: $($entry.path)")
    continue
  }
}

$cutoff = [string]$manifest.historicalCutoffVersion
$actualHistorical = Get-ChildItem -LiteralPath $migrationRoot -Filter '*.sql' -File |
  Where-Object { $_.BaseName -match '^(?<version>\d{8,14})_' -and $Matches.version -le $cutoff } |
  ForEach-Object { ('supabase/migrations/' + $_.Name) }

foreach ($path in $actualHistorical) {
  if (-not $expectedPaths.Contains($path)) { $failures.Add("Unmanifested historical migration: $path") }
}
foreach ($path in $expectedPaths) {
  if ($path -notin $actualHistorical) { $failures.Add("Manifest path is outside current historical set: $path") }
}

foreach ($amendment in $manifest.approvedHistoricalAmendments) {
  foreach ($property in @('amended','original')) {
    $item = $amendment.$property
    $fullPath = Join-Path $RepositoryRoot ([string]$item.path)
    if (-not (Test-Path -LiteralPath $fullPath -PathType Leaf)) {
      $failures.Add("Missing $property artifact: $($item.path)")
      continue
    }
  }
}

$result = [ordered]@{
  ok = ($failures.Count -eq 0)
  migrationCount = $manifest.migrations.Count
  cutoff = $cutoff
  manifestSha256 = '66a094037af456e95b34ec0ca3fb18bcc791d296fa6c2619af9639a87f7d7f40'
  canonicalGitCommit = $canonical.verifiedCommit
  canonicalGitFileCount = $canonical.fileCount
  legacyExpectedModes = $canonical.expectedModes
  worktreeByteDifferences = $canonical.worktreeByteDifferences
  failures = @($failures)
}

if ($Json) { $result | ConvertTo-Json -Depth 5 } else {
  if ($result.ok) { Write-Host "PASS: verified $($result.migrationCount) historical migrations through $cutoff" }
  else { $failures | ForEach-Object { Write-Error $_ } }
  Write-Host "Manifest SHA-256: $($result.manifestSha256)"
}

if (-not $result.ok) { exit 1 }
