[CmdletBinding()]
param(
  [Parameter(Mandatory)]
  [ValidateSet('local','linked')]
  [string]$Target,
  [Parameter(Mandatory)]
  [string]$OutputPath,
  [string]$ExpectedPath,
  [string]$RepositoryRoot = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = 'Stop'
$requiredCliVersion = '2.84.2'
$actualCliVersion = (& supabase --version 2>$null | Select-Object -First 1).Trim()
if ($actualCliVersion -ne $requiredCliVersion) {
  throw "Supabase CLI $requiredCliVersion is required; found $actualCliVersion."
}

$queryPath = Join-Path $RepositoryRoot 'supabase/tests/catalog/canonical_baseline_v1_contract_rows.sql'
if (-not (Test-Path -LiteralPath $queryPath -PathType Leaf)) { throw "Catalog query is missing: $queryPath" }

$resolvedOutput = [IO.Path]::GetFullPath($OutputPath)
$outputParent = Split-Path -Parent $resolvedOutput
if (-not (Test-Path -LiteralPath $outputParent -PathType Container)) { throw "Output parent does not exist: $outputParent" }

$temporaryCsv = Join-Path ([IO.Path]::GetTempPath()) ("forge-catalog-{0}.csv" -f [guid]::NewGuid().ToString('N'))
try {
  $arguments = @('db','query',"--$Target",'--agent=no','--output','csv','--file',$queryPath)
  & supabase @arguments 2>$null | Set-Content -LiteralPath $temporaryCsv -Encoding utf8
  if ($LASTEXITCODE -ne 0) { throw "Read-only catalog query failed for target $Target." }
  $rows = @(Import-Csv -LiteralPath $temporaryCsv)
  if ($rows.Count -eq 0) { throw 'Catalog query returned no objects.' }

  $seen = [System.Collections.Generic.Dictionary[string,string]]::new([System.StringComparer]::Ordinal)
  $entryList = [System.Collections.Generic.List[object]]::new()
  foreach ($row in ($rows | Sort-Object category,identity,canonical)) {
    $key = '{0}|{1}' -f $row.category,$row.identity
    $bytes = [Text.Encoding]::UTF8.GetBytes([string]$row.canonical)
    $hash = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($bytes)).ToLowerInvariant()
    if ($seen.ContainsKey($key)) {
      if ($seen[$key] -ne $hash) { throw "Conflicting normalized catalog identity: $key" }
      continue
    }
    $seen[$key] = $hash
    $entryList.Add([pscustomobject][ordered]@{ category=[string]$row.category; identity=[string]$row.identity; sha256=$hash })
  }
  $entries = @($entryList)

  $lineBytes = [Text.Encoding]::UTF8.GetBytes((($entries | ForEach-Object { '{0}|{1}|{2}' -f $_.category,$_.identity,$_.sha256 }) -join "`n"))
  $contractHash = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($lineBytes)).ToLowerInvariant()
  $categoryCounts = [ordered]@{}
  foreach ($group in ($entries | Group-Object category | Sort-Object Name)) { $categoryCounts[$group.Name] = $group.Count }
  $queryHash = (Get-FileHash -LiteralPath $queryPath -Algorithm SHA256).Hash.ToLowerInvariant()

  $result = [ordered]@{
    schema = 'forge.canonical-baseline-application-catalog-fingerprint.v1'
    sourceCommit = '716c4f54d759202ebc00315c5d16fb93f66d64c1'
    supabaseCliVersion = $requiredCliVersion
    querySha256 = $queryHash
    objectCount = $entries.Count
    categoryCounts = $categoryCounts
    contractSha256 = $contractHash
    entries = @($entries)
  }
  $result | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $resolvedOutput -Encoding utf8

  if ($ExpectedPath) {
    $expected = Get-Content -LiteralPath ([IO.Path]::GetFullPath($ExpectedPath)) -Raw | ConvertFrom-Json
    $differences = [System.Collections.Generic.List[string]]::new()
    if ($expected.schema -ne $result.schema) { $differences.Add('schema') }
    if ($expected.querySha256 -ne $result.querySha256) { $differences.Add('query_sha256') }
    if ($expected.objectCount -ne $result.objectCount) { $differences.Add('object_count') }
    if ($expected.contractSha256 -ne $result.contractSha256) { $differences.Add('contract_sha256') }
    if ($differences.Count -gt 0) { throw "Catalog fingerprint mismatch: $($differences -join ', ')." }
  }

  [pscustomobject]@{ ok=$true; target=$Target; objectCount=$entries.Count; contractSha256=$contractHash; output=$resolvedOutput } | ConvertTo-Json -Compress
}
finally {
  if (Test-Path -LiteralPath $temporaryCsv) { Remove-Item -LiteralPath $temporaryCsv -Force }
}
