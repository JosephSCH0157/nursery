[CmdletBinding()]
param([string]$RepositoryRoot = (Split-Path -Parent $PSScriptRoot))

$ErrorActionPreference = 'Stop'
$repo = [IO.Path]::GetFullPath($RepositoryRoot)
$contractPath = Join-Path $repo 'docs/database/baseline/v1-gate2/lineage-contract.json'
$contract = Get-Content -LiteralPath $contractPath -Raw | ConvertFrom-Json
$baselineManifest = Get-Content -LiteralPath (Join-Path $repo 'docs/database/baseline/v1-gate3/canonical-baseline-v1.manifest.json') -Raw | ConvertFrom-Json
$wrappersContract = Get-Content -LiteralPath (Join-Path $repo 'docs/database/baseline/v1-gate3/wrappers-extension-compatibility.json') -Raw | ConvertFrom-Json
$trustAnchorRelativePath = 'docs/database/baseline/v1-gate6b/frozen-evidence-trust-anchor.v1.json'
$trustAnchorPath = Join-Path $repo $trustAnchorRelativePath
$trustAnchorSha256 = 'fca1dbd9f8d582db01a3cd03720b8feffb75ec243340f042b9df08adbb41ebcb'
$failures = [System.Collections.Generic.List[string]]::new()

$documents = [ordered]@{
  'AGENTS.md' = Join-Path $repo 'AGENTS.md'
  'docs/database/DATABASE_ARCHITECTURE.md' = Join-Path $repo 'docs/database/DATABASE_ARCHITECTURE.md'
  'docs/database/DATABASE_OPERATIONS.md' = Join-Path $repo 'docs/database/DATABASE_OPERATIONS.md'
}
$contents = @{}
foreach ($entry in $documents.GetEnumerator()) {
  if (-not (Test-Path -LiteralPath $entry.Value -PathType Leaf)) {
    $failures.Add("Missing database contract document: $($entry.Key)")
    continue
  }
  $contents[$entry.Key] = Get-Content -LiteralPath $entry.Value -Raw
}

$requiredValues = @(
  [string]$contract.requiredSupabaseCliVersion,
  [string]$contract.historical.lineage,
  [string]$contract.historical.cutoffVersion,
  [string]$contract.baseline.lineage,
  [string]$contract.baseline.reservedStartVersion,
  [string]$contract.baseline.reservedEndVersion,
  [string]$contract.sharedTail.minimumVersion,
  ('{0}.{1}' -f $contract.databaseMarker.schema,$contract.databaseMarker.table)
)
foreach ($document in $contents.GetEnumerator()) {
  foreach ($value in $requiredValues) {
    if ($document.Value -notmatch [regex]::Escape($value)) {
      $failures.Add("$($document.Key) omits contract value $value")
    }
  }
}

$agentText = [string]$contents['AGENTS.md']
foreach ($rule in @('--include-all','migration repair','migration-history','production writes','financially inactive')) {
  if ($agentText -notmatch [regex]::Escape($rule)) { $failures.Add("AGENTS.md omits mandatory rule: $rule") }
}
foreach ($path in @('docs/database/DATABASE_ARCHITECTURE.md','docs/database/DATABASE_OPERATIONS.md')) {
  if ($agentText -notmatch [regex]::Escape($path)) { $failures.Add("AGENTS.md omits canonical database document: $path") }
}

$architectureText = [string]$contents['docs/database/DATABASE_ARCHITECTURE.md']
foreach ($reference in @(
  'docs/database/baseline/v1-gate1/historical-migrations.sha256.json',
  'docs/database/baseline/v1-gate3/canonical-baseline-v1.manifest.json',
  'docs/database/baseline/v1-gate3/canonical-application-catalog-fingerprint.json',
  'docs/database/baseline/v1-gate3/wrappers-extension-compatibility.json',
  'docs/database/baseline/v1-gate2/FINANCIAL_INACTIVE_CONTRACT.md',
  $trustAnchorRelativePath
)) {
  $documentReference = $reference -replace '^docs/database/',''
  if ($architectureText -notmatch [regex]::Escape($documentReference)) { $failures.Add("docs/database/DATABASE_ARCHITECTURE.md omits authority link: $documentReference") }
  if (-not (Test-Path -LiteralPath (Join-Path $repo $reference) -PathType Leaf)) { $failures.Add("Missing linked authority: $reference") }
}
if (-not (Test-Path -LiteralPath $trustAnchorPath -PathType Leaf)) {
  $failures.Add("Missing frozen evidence trust anchor: $trustAnchorRelativePath")
} elseif ((Get-FileHash -LiteralPath $trustAnchorPath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $trustAnchorSha256) {
  $failures.Add('Frozen evidence trust-anchor SHA-256 differs from the approved commitment.')
}
foreach ($relativePath in @('scripts/lib/forge-frozen-evidence.mjs','.github/workflows/database-frozen-evidence.yml')) {
  $contractText = Get-Content -LiteralPath (Join-Path $repo $relativePath) -Raw
  if ($contractText -notmatch [regex]::Escape($trustAnchorSha256)) {
    $failures.Add("$relativePath omits the approved frozen evidence trust-anchor commitment.")
  }
}
foreach ($value in @(
  [string]$baselineManifest.referenceData.includedRows,
  [string]$baselineManifest.sharedTailMinimumVersion,
  [string]$wrappersContract.environments.linked.requiredVersion,
  [string]$wrappersContract.environments.local.requiredVersion
)) {
  if ($architectureText -notmatch [regex]::Escape($value)) { $failures.Add("DATABASE_ARCHITECTURE.md omits baseline evidence value: $value") }
}

$operationsText = [string]$contents['docs/database/DATABASE_OPERATIONS.md']
$operationsNormalized = $operationsText.Replace(',','')
foreach ($command in @(
  'materialize-frozen-git-evidence.mjs',
  'verify-frozen-git-evidence.mjs',
  'invoke-forge-database.ps1',
  'new-forge-database-workdir.ps1',
  'verify-forge-database-entrypoints.ps1',
  'test-supabase-lineage-guard.ps1',
  'pnpm certify:db:canonical-baseline',
  'pnpm verify:db:historical-integrity',
  'pnpm supabase:types'
)) {
  if ($operationsText -notmatch [regex]::Escape($command)) { $failures.Add("DATABASE_OPERATIONS.md omits supported command: $command") }
}
foreach ($evidence in @(
  '87524f872e76f24de631d1cbf58580674c9df2a9',
  '85816e221aa31e05f2ce634a5ee785ae00db20f5',
  'frozen-evidence-trust-anchor.v1.json',
  'fca1dbd9f8d582db01a3cd03720b8feffb75ec243340f042b9df08adbb41ebcb',
  'require-exact-worktree-bytes',
  'Gate 6B.1 cross-platform frozen evidence'
)) {
  if ($operationsText -notmatch [regex]::Escape($evidence)) { $failures.Add("DATABASE_OPERATIONS.md omits frozen-evidence contract: $evidence") }
}
if ($operationsText -notmatch 'Not yet implemented/certified') {
  $failures.Add('docs/database/DATABASE_OPERATIONS.md does not label unavailable historical-upgrade execution.')
}
foreach ($value in @(
  '15901',
  '49d06bfb75f11053662c5966e021b13e96ac78006759ca39b33bede71db7266f',
  [string]$wrappersContract.environments.linked.requiredVersion,
  [string]$wrappersContract.environments.local.requiredVersion
)) {
  if ($operationsNormalized -notmatch [regex]::Escape($value)) { $failures.Add("docs/database/DATABASE_OPERATIONS.md omits certification evidence value: $value") }
}

foreach ($obsoleteRootDocument in @('DATABASE_ARCHITECTURE.md','DATABASE_OPERATIONS.md')) {
  if (Test-Path -LiteralPath (Join-Path $repo $obsoleteRootDocument)) {
    $failures.Add("Obsolete duplicate database document exists at repository root: $obsoleteRootDocument")
  }
}

$branchPreflightPath = Join-Path $repo 'docs/database/baseline/v1-gate4/DASHBOARD_BRANCH_PREFLIGHT.md'
if (-not (Test-Path -LiteralPath $branchPreflightPath -PathType Leaf)) {
  $failures.Add('Missing dashboard branch preflight evidence document.')
}
else {
  $branchPreflightText = Get-Content -LiteralPath $branchPreflightPath -Raw
  $prefixVersions = @($manifest = Get-Content -LiteralPath (Join-Path $repo 'docs/database/baseline/v1-gate1/historical-migrations.sha256.json') -Raw | ConvertFrom-Json; $manifest.migrations | Select-Object -First 411 | ForEach-Object { [string]$_.version })
  $prefixBytes = [Text.Encoding]::UTF8.GetBytes(($prefixVersions -join "`n"))
  $prefixDigest = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($prefixBytes)).ToLowerInvariant()
  foreach ($evidence in @('20260916110806',$prefixDigest,'0.01344','Include data','--dry-run')) {
    if ($branchPreflightText -notmatch [regex]::Escape($evidence)) { $failures.Add("Dashboard branch preflight omits evidence: $evidence") }
  }
  $historicalUpgradePath = Join-Path $repo 'docs/database/baseline/v1-gate4/HISTORICAL_UPGRADE_CERTIFICATION.md'
  $historicalUpgradeText = Get-Content -LiteralPath $historicalUpgradePath -Raw
  if ($historicalUpgradeText -notmatch [regex]::Escape($prefixDigest)) {
    $failures.Add('Historical upgrade certification records the wrong 411-version digest.')
  }
}

$result = [ordered]@{
  ok = ($failures.Count -eq 0)
  schema = [string]$contract.schema
  requiredSupabaseCliVersion = [string]$contract.requiredSupabaseCliVersion
  historicalCutoff = [string]$contract.historical.cutoffVersion
  baselineEpoch = @([string]$contract.baseline.reservedStartVersion,[string]$contract.baseline.reservedEndVersion)
  sharedTailMinimumVersion = [string]$contract.sharedTail.minimumVersion
  documents = @($documents.Keys)
  failures = @($failures)
}
$result | ConvertTo-Json -Depth 4 -Compress
if (-not $result.ok) { throw "Database documentation contract verification failed: $($failures -join '; ')" }
