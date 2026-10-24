[CmdletBinding()]
param([string]$RepositoryRoot = (Split-Path -Parent $PSScriptRoot))

$ErrorActionPreference = 'Stop'
$repo = [IO.Path]::GetFullPath($RepositoryRoot)
$canonicalVerifier = Join-Path $repo 'scripts/verify-frozen-git-evidence.mjs'
$manifestPath = Join-Path $repo 'docs/database/baseline/v1-gate5b/pre-slice-a-fixture.manifest.json'
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
if ($manifest.schema -ne 'forge.pre-slice-a-schema-fixture-manifest.v1') {
  throw 'Unexpected pre-Slice-A fixture manifest schema.'
}
if ($manifest.requiredSupabaseCliVersion -ne '2.84.2') {
  throw 'Unexpected pre-Slice-A fixture CLI contract.'
}

$canonicalOutput = (& node $canonicalVerifier --repository-root $repo --scope pre-slice 2>&1 | Out-String).Trim()
if ($LASTEXITCODE -ne 0) { throw $canonicalOutput }
$canonical = $canonicalOutput | ConvertFrom-Json

& (Join-Path $PSScriptRoot 'build-pre-slice-a-fixture.ps1') -RepositoryRoot $repo -VerifyOnly | Out-Null

[pscustomobject]@{
  ok = $true
  schema = $manifest.schema
  fixtureSha256 = $manifest.fixture.sha256
  fixtureBytes = $manifest.fixture.bytes
  hostedObjectCount = $manifest.hostedCatalogEvidence.objectCount
  hostedContractSha256 = $manifest.hostedCatalogEvidence.contractSha256
  pendingVersions = @($manifest.historicalPrefix.pendingVersions)
  canonicalGitCommit = $canonical.verifiedCommit
  canonicalGitFileCount = $canonical.fileCount
} | ConvertTo-Json -Compress
