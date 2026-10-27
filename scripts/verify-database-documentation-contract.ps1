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
$successorRelativePath = 'docs/database/baseline/v1-gate6h/successor-contract.v1.json'
$successorPath = Join-Path $repo $successorRelativePath
$successorSha256 = 'a424d05912c808467dd13957d0690d3f95a3f11cafe0089bcd7f87712cc8fd32'
$successor = Get-Content -LiteralPath $successorPath -Raw | ConvertFrom-Json
$gate6oRelativePath = 'docs/database/baseline/v1-gate6o/successor-contract.v1.json'
$gate6oPath = Join-Path $repo $gate6oRelativePath
$gate6oSha256 = '6faf15bd24a3b9b398ffd42027bdb7a993fdc51f40cfc46b084018ecbda2c87e'
$gate6o = Get-Content -LiteralPath $gate6oPath -Raw | ConvertFrom-Json
$gate6pRelativePath = 'docs/database/baseline/v1-gate6p/successor-contract.v1.json'
$gate6pPath = Join-Path $repo $gate6pRelativePath
$gate6pSha256 = 'dc27fb7a84a6cbeb44bc9af91f1db51a6c82ff6fa7db32863a6f32e9c2963219'
$gate6p = Get-Content -LiteralPath $gate6pPath -Raw | ConvertFrom-Json
$recordingAuthorityRelativePath = 'docs/database/baseline/v1-recording-authority/successor-contract.v1.json'
$recordingAuthorityPath = Join-Path $repo $recordingAuthorityRelativePath
$recordingAuthoritySha256 = '24a6e2c7039f723ac6a61e236da961f7c11c7a98a18e202a184630e281aa2625'
$recordingAuthority = Get-Content -LiteralPath $recordingAuthorityPath -Raw | ConvertFrom-Json
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
  $trustAnchorRelativePath,
  $successorRelativePath
  $gate6oRelativePath
  $gate6pRelativePath
  $recordingAuthorityRelativePath
)) {
  $documentReference = $reference -replace '^docs/database/',''
  if ($architectureText -notmatch [regex]::Escape($documentReference)) { $failures.Add("docs/database/DATABASE_ARCHITECTURE.md omits authority link: $documentReference") }
  if (-not (Test-Path -LiteralPath (Join-Path $repo $reference) -PathType Leaf)) { $failures.Add("Missing linked authority: $reference") }
}
if ((Get-FileHash -LiteralPath $successorPath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $successorSha256) {
  $failures.Add('Gate 6H successor-contract SHA-256 differs from the approved commitment.')
}
if ($successor.sharedTailAddition.version -ne '20261024164519' -or $successor.historicalSuccessor.finalRows -ne 416) {
  $failures.Add('Gate 6H successor contract has unexpected chronology.')
}
if ((Get-FileHash -LiteralPath $gate6oPath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $gate6oSha256) {
  $failures.Add('Gate 6O successor-contract SHA-256 differs from the approved commitment.')
}
if ($gate6o.predecessor.contractSha256 -ne $successorSha256 -or
    $gate6o.sharedTailAddition.version -ne '20261025070300' -or
    $gate6o.historicalSuccessor.finalRows -ne 417) {
  $failures.Add('Gate 6O successor contract has unexpected predecessor or chronology.')
}
if ((Get-FileHash -LiteralPath $gate6pPath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $gate6pSha256) {
  $failures.Add('Gate 6P successor-contract SHA-256 differs from the approved commitment.')
}
if ($gate6p.predecessor.contractSha256 -ne $gate6oSha256 -or
    $gate6p.sharedTailAddition.version -ne '20261025080943' -or
    $gate6p.historicalSuccessor.finalRows -ne 418 -or
    $gate6p.provisioningSuccessor.sha256 -ne '18722cbd2a747e456b882e5069b05772bc560acf2ee25e42af2d4d4d8c2dd939') {
  $failures.Add('Gate 6P successor contract has unexpected predecessor, chronology, or provisioning evidence.')
}
if ((Get-FileHash -LiteralPath $recordingAuthorityPath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $recordingAuthoritySha256) {
  $failures.Add('Recording authority successor-contract SHA-256 differs from the approved commitment.')
}
if ($recordingAuthority.predecessor.contractSha256 -ne $gate6pSha256 -or
    $recordingAuthority.sharedTailAddition.version -ne '20261027030139' -or
    $recordingAuthority.historicalSuccessor.finalRows -ne 419 -or
    $recordingAuthority.sharedTailAddition.sha256 -ne '876278448329ff5a8900923e309d3489bf7cce590c157526e054ff3433b3c8fa') {
  $failures.Add('Recording authority successor contract has unexpected predecessor, chronology, or migration evidence.')
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
  'pnpm certify:db:gate6h-successor',
  'pnpm certify:db:gate6o-successor',
  'pnpm certify:db:gate6p-successor',
  'pnpm certify:db:gate6p-browser',
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
  '6953a105d5f7fbfe2813c5e3349cd5364ba9c273f3dc023f042f86c6e7c9c5d5',
  'dd364abfe6fcdb726148d209431d2476461b040d17cfd1c8bc45e23c8785bb9e',
  '15903',
  '766361f8b22a131952808335ca0719c8ddccff8f15ba50a0f348b32e88f489cd',
  '37c7bb1483dfa11f7aaf32ce5071d8614074b64e488bad074e028935453714ef',
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
