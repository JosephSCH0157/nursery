[CmdletBinding()]
param([string]$RepositoryRoot = (Split-Path -Parent $PSScriptRoot))

$ErrorActionPreference = 'Stop'
$repo = [IO.Path]::GetFullPath($RepositoryRoot)
$manifestPath = Join-Path $repo 'docs/database/baseline/v1-gate5b/pre-slice-a-fixture.manifest.json'
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
if ($manifest.schema -ne 'forge.pre-slice-a-schema-fixture-manifest.v1') {
  throw 'Unexpected pre-Slice-A fixture manifest schema.'
}
if ($manifest.requiredSupabaseCliVersion -ne '2.84.2') {
  throw 'Unexpected pre-Slice-A fixture CLI contract.'
}

function Assert-Hash([string]$RelativePath, [string]$ExpectedHash) {
  $path = Join-Path $repo $RelativePath
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Fixture artifact is missing: $RelativePath" }
  $actual = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($actual -ne $ExpectedHash) { throw "Fixture artifact hash mismatch for ${RelativePath}: expected $ExpectedHash; found $actual." }
}

Assert-Hash $manifest.fixture.path $manifest.fixture.sha256
Assert-Hash $manifest.structuralSource.path $manifest.structuralSource.sha256
Assert-Hash $manifest.hostedCatalogEvidence.queryPath $manifest.hostedCatalogEvidence.querySha256
Assert-Hash $manifest.hostedCatalogEvidence.fingerprintPath $manifest.hostedCatalogEvidence.fingerprintFileSha256
Assert-Hash $manifest.referenceData.allowlistPath $manifest.referenceData.allowlistSha256
Assert-Hash $manifest.referenceData.hostedVerificationQuery $manifest.referenceData.hostedVerificationQuerySha256

foreach ($property in $manifest.pendingMigrationHashes.psobject.Properties) {
  $migration = Get-ChildItem -LiteralPath (Join-Path $repo 'supabase/migrations') -Filter "$($property.Name)_*.sql" -File
  if (@($migration).Count -ne 1) { throw "Expected one pending migration for version $($property.Name)." }
  Assert-Hash ([IO.Path]::GetRelativePath($repo, $migration.FullName)) ([string]$property.Value)
}

& (Join-Path $PSScriptRoot 'build-pre-slice-a-fixture.ps1') -RepositoryRoot $repo -VerifyOnly | Out-Null

[pscustomobject]@{
  ok = $true
  schema = $manifest.schema
  fixtureSha256 = $manifest.fixture.sha256
  fixtureBytes = $manifest.fixture.bytes
  hostedObjectCount = $manifest.hostedCatalogEvidence.objectCount
  hostedContractSha256 = $manifest.hostedCatalogEvidence.contractSha256
  pendingVersions = @($manifest.historicalPrefix.pendingVersions)
} | ConvertTo-Json -Compress
