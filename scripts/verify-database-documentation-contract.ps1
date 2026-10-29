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
$recordingAuthoritySha256 = '0f43b227ad3714c33afc80fef9907a8a7fcb5a2ce69d851f28312c06c44fa74f'
$recordingAuthority = Get-Content -LiteralPath $recordingAuthorityPath -Raw | ConvertFrom-Json
$hammerH2CRelativePath = 'docs/database/baseline/v1-hammer-h2c/successor-contract.v1.json'
$hammerH2CPath = Join-Path $repo $hammerH2CRelativePath
$hammerH2CSha256 = '945872c2516e433e0526f08c4ca531f4b3bb46fbb5806c501166a21b11781e17'
$hammerH2C = Get-Content -LiteralPath $hammerH2CPath -Raw | ConvertFrom-Json
$hammerFirstTranscriptionRelativePath = 'docs/database/baseline/v1-hammer-first-transcription/successor-contract.v1.json'
$hammerFirstTranscriptionPath = Join-Path $repo $hammerFirstTranscriptionRelativePath
$hammerFirstTranscriptionSha256 = '8836c293a402affb79c0b435d7f702b7bccd5a9d256ecd8f4474dd9ab526f255'
$hammerFirstTranscription = Get-Content -LiteralPath $hammerFirstTranscriptionPath -Raw | ConvertFrom-Json
$hammerScopedLiveFundingRelativePath = 'docs/database/baseline/v1-hammer-scoped-live-funding/successor-contract.v1.json'
$hammerScopedLiveFundingPath = Join-Path $repo $hammerScopedLiveFundingRelativePath
$hammerScopedLiveFundingSha256 = '9a06c5a28f0de670bd87864d67086b18acefb82d891a7b18c6f85ad247926a21'
$hammerScopedLiveFunding = Get-Content -LiteralPath $hammerScopedLiveFundingPath -Raw | ConvertFrom-Json
$hammerTriggerAclHardeningRelativePath = 'docs/database/baseline/v1-hammer-trigger-acl-hardening/successor-contract.v1.json'
$hammerTriggerAclHardeningPath = Join-Path $repo $hammerTriggerAclHardeningRelativePath
$hammerTriggerAclHardeningSha256 = '9cd5212ea429b6b55d2ad742b3cd3417030c67dc6967dfc519af7931c73c8311'
$hammerTriggerAclHardening = Get-Content -LiteralPath $hammerTriggerAclHardeningPath -Raw | ConvertFrom-Json
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
  $hammerH2CRelativePath
  $hammerFirstTranscriptionRelativePath
  $hammerScopedLiveFundingRelativePath
  $hammerTriggerAclHardeningRelativePath
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
    $recordingAuthority.sharedTailAddition.sha256 -ne '876278448329ff5a8900923e309d3489bf7cce590c157526e054ff3433b3c8fa' -or
    $recordingAuthority.catalogSuccessor.fileSha256 -ne 'a46bb67287868b8f7f568b75962593cd2b367d5395865d9c63e0870b85e1e5ae' -or
    $recordingAuthority.catalogSuccessor.normalizedContractSha256 -ne '38f8a14b90e52ee876e0615084c036d286e0e280832685e07e20dcbabf86ae47') {
  $failures.Add('Recording authority successor contract has unexpected predecessor, chronology, or migration evidence.')
}
if ((Get-FileHash -LiteralPath $hammerH2CPath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $hammerH2CSha256) {
  $failures.Add('Hammer H2-C successor-contract SHA-256 differs from the approved commitment.')
}
if ($hammerH2C.predecessor.contractSha256 -ne $recordingAuthoritySha256 -or
    $hammerH2C.sharedTailAddition.version -ne '20261028092438' -or
    $hammerH2C.historicalSuccessor.finalRows -ne 420 -or
    $hammerH2C.sharedTailAddition.sha256 -ne 'df8988b8bb12e17cc7113d116e3cbc89397b7d9dec6de4c2ec92f979bbf1dcf1' -or
    $hammerH2C.catalogSuccessor.fileSha256 -ne '84eba2e4ead2c2372dce6626eac1918be4afb6b78cb2f975728aa69c801ee333' -or
    $hammerH2C.catalogSuccessor.normalizedContractSha256 -ne '803e02df1c18228aee39f5e56b9158f74c6c370386fcd2cafd1552314a288807') {
  $failures.Add('Hammer H2-C successor contract has unexpected predecessor, chronology, or migration evidence.')
}
if ((Get-FileHash -LiteralPath $hammerFirstTranscriptionPath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $hammerFirstTranscriptionSha256) {
  $failures.Add('Hammer first-transcription successor-contract SHA-256 differs from the approved commitment.')
}
if ($hammerFirstTranscription.predecessor.contractSha256 -ne $hammerH2CSha256 -or
    $hammerFirstTranscription.sharedTailAddition.version -ne '20261029004958' -or
    $hammerFirstTranscription.historicalSuccessor.finalRows -ne 421 -or
    $hammerFirstTranscription.sharedTailAddition.sha256 -ne '318c81bf74cef3c3124641b2b9f62c240a55dd4b3d375d5ac61bf1a588659803' -or
    $hammerFirstTranscription.catalogSuccessor.fileSha256 -ne 'a8e8be7eb110d520e29b61e552d76f0378b268cc50ff4ca59c7ed11d524173d5' -or
    $hammerFirstTranscription.catalogSuccessor.normalizedContractSha256 -ne '6d4c9fbea2f11e3562130384ea6da5d0ce95d561668f31dc317ae0a8e42bd293') {
  $failures.Add('Hammer first-transcription successor contract has unexpected predecessor, chronology, or migration evidence.')
}
if ((Get-FileHash -LiteralPath $hammerScopedLiveFundingPath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $hammerScopedLiveFundingSha256) {
  $failures.Add('Hammer scoped-Live-funding successor-contract SHA-256 differs from the approved commitment.')
}
if ($hammerScopedLiveFunding.predecessor.contractSha256 -ne $hammerFirstTranscriptionSha256 -or
    $hammerScopedLiveFunding.sharedTailAddition.version -ne '20261029033827' -or
    $hammerScopedLiveFunding.historicalSuccessor.finalRows -ne 422 -or
    $hammerScopedLiveFunding.sharedTailAddition.sha256 -ne 'd395a843a9ab29029404749d187236d3a40efddbf6eb96cd6560c3a46b20f0d2' -or
    $hammerScopedLiveFunding.catalogSuccessor.fileSha256 -ne '06440d61d53ec3858afa58acddf2808f68514e738fbd59dd3070c17b531e7f51' -or
    $hammerScopedLiveFunding.catalogSuccessor.normalizedContractSha256 -ne '930606ea7dd389ad15c519d1fb9a1b3692c328314c62ae6422af53b9e9430de8') {
  $failures.Add('Hammer scoped-Live-funding successor contract has unexpected predecessor, chronology, or migration evidence.')
}
if ((Get-FileHash -LiteralPath $hammerTriggerAclHardeningPath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $hammerTriggerAclHardeningSha256) {
  $failures.Add('Hammer trigger-ACL-hardening successor-contract SHA-256 differs from the approved commitment.')
}
if ($hammerTriggerAclHardening.predecessor.contractSha256 -ne $hammerScopedLiveFundingSha256 -or
    $hammerTriggerAclHardening.sharedTailAddition.version -ne '20261029110858' -or
    $hammerTriggerAclHardening.historicalSuccessor.finalRows -ne 423 -or
    $hammerTriggerAclHardening.sharedTailAddition.sha256 -ne 'e28ea66618cb681a06323174f6390cd8eeb7afb1d5c744d9ea6cd12290949a7a' -or
    $hammerTriggerAclHardening.catalogSuccessor.fileSha256 -ne 'a07a57421d39330de31170bc7046e72beb768fc6ef97dbe6350620839934c873' -or
    $hammerTriggerAclHardening.catalogSuccessor.normalizedContractSha256 -ne '47b134565e3c1ef88567dbee027fff6a5a0ab48e9c8126948ccd15ae145d6a0f') {
  $failures.Add('Hammer trigger-ACL-hardening successor contract has unexpected predecessor, chronology, or migration evidence.')
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
  'pnpm certify:db:hammer-h2c:historical',
  'pnpm test:db:hammer-h2c:historical-tooling',
  'pnpm test:db:hammer-h2c:hosted-deployment',
  'pnpm certify:db:hammer-first-transcription:historical',
  'pnpm test:db:hammer-first-transcription:historical-tooling',
  'pnpm certify:db:hammer-scoped-live-funding:historical',
  'pnpm test:db:hammer-scoped-live-funding:historical-tooling',
  'pnpm certify:db:hammer-trigger-acl-hardening:historical',
  'pnpm test:db:hammer-trigger-acl-hardening:historical-tooling',
  'pnpm test:db:hammer-first-transcription:hosted-deployment',
  'pnpm preflight:db:hammer-first-transcription:hosted',
  'pnpm test:db:hammer-scoped-live-funding:hosted-deployment',
  'pnpm preflight:db:hammer-scoped-live-funding:hosted',
  'prepare:db:recovery-evidence',
  'invoke-hammer-h2c-420-hosted-deployment.ps1',
  'invoke-hammer-first-transcription-421-hosted-deployment.ps1',
  'invoke-hammer-scoped-live-funding-422-hosted-deployment.ps1',
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
