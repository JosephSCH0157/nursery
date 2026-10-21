[CmdletBinding()]
param([string]$RepositoryRoot = (Split-Path -Parent $PSScriptRoot))

$ErrorActionPreference = 'Stop'
$repo = [IO.Path]::GetFullPath($RepositoryRoot)
$contractPath = Join-Path $repo 'docs/database/baseline/v1-gate2/lineage-contract.json'
$contract = Get-Content -LiteralPath $contractPath -Raw | ConvertFrom-Json
$baselineManifest = Get-Content -LiteralPath (Join-Path $repo 'docs/database/baseline/v1-gate3/canonical-baseline-v1.manifest.json') -Raw | ConvertFrom-Json
$wrappersContract = Get-Content -LiteralPath (Join-Path $repo 'docs/database/baseline/v1-gate3/wrappers-extension-compatibility.json') -Raw | ConvertFrom-Json
$failures = [System.Collections.Generic.List[string]]::new()

$documents = [ordered]@{
  'AGENTS.md' = Join-Path $repo 'AGENTS.md'
  'DATABASE_ARCHITECTURE.md' = Join-Path $repo 'DATABASE_ARCHITECTURE.md'
  'DATABASE_OPERATIONS.md' = Join-Path $repo 'DATABASE_OPERATIONS.md'
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

$architectureText = [string]$contents['DATABASE_ARCHITECTURE.md']
foreach ($reference in @(
  'docs/database/baseline/v1-gate1/historical-migrations.sha256.json',
  'docs/database/baseline/v1-gate3/canonical-baseline-v1.manifest.json',
  'docs/database/baseline/v1-gate3/canonical-application-catalog-fingerprint.json',
  'docs/database/baseline/v1-gate3/wrappers-extension-compatibility.json',
  'docs/database/baseline/v1-gate2/FINANCIAL_INACTIVE_CONTRACT.md'
)) {
  if ($architectureText -notmatch [regex]::Escape($reference)) { $failures.Add("DATABASE_ARCHITECTURE.md omits authority link: $reference") }
  if (-not (Test-Path -LiteralPath (Join-Path $repo $reference) -PathType Leaf)) { $failures.Add("Missing linked authority: $reference") }
}
foreach ($value in @(
  [string]$baselineManifest.referenceData.includedRows,
  [string]$baselineManifest.sharedTailMinimumVersion,
  [string]$wrappersContract.environments.linked.requiredVersion,
  [string]$wrappersContract.environments.local.requiredVersion
)) {
  if ($architectureText -notmatch [regex]::Escape($value)) { $failures.Add("DATABASE_ARCHITECTURE.md omits baseline evidence value: $value") }
}

$operationsText = [string]$contents['DATABASE_OPERATIONS.md']
$operationsNormalized = $operationsText.Replace(',','')
foreach ($command in @(
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
if ($operationsText -notmatch 'Not yet implemented/certified') {
  $failures.Add('DATABASE_OPERATIONS.md does not label unavailable historical-upgrade execution.')
}
foreach ($value in @(
  '15901',
  '49d06bfb75f11053662c5966e021b13e96ac78006759ca39b33bede71db7266f',
  [string]$wrappersContract.environments.linked.requiredVersion,
  [string]$wrappersContract.environments.local.requiredVersion
)) {
  if ($operationsNormalized -notmatch [regex]::Escape($value)) { $failures.Add("DATABASE_OPERATIONS.md omits certification evidence value: $value") }
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
