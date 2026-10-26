[CmdletBinding()]
param([string]$RepositoryRoot)

$ErrorActionPreference = 'Stop'
$repo = [IO.Path]::GetFullPath($(if ($RepositoryRoot) { $RepositoryRoot } else { Split-Path -Parent $PSScriptRoot }))
Import-Module (Join-Path $repo 'scripts/lib/ForgeGate5D.psm1') -Force
$runner = Join-Path $repo 'scripts/invoke-gate5e-read-only-probe.ps1'
$projectRef = 'a' * 20
$tokenName = 'FORGE_GATE5D_DATABASE_READ_TOKEN'
$syntheticToken = 'sbp_fc_gate5e_synthetic_only_secret_sentinel'
$environmentNames = @($tokenName,'SUPABASE_ACCESS_TOKEN','SUPABASE_DB_PASSWORD','SUPABASE_DB_URL','DATABASE_URL','DIRECT_URL')
$savedEnvironment = @{}
$tempRoot = Join-Path ([IO.Path]::GetTempPath()) "forge-gate5d-attestation-$([guid]::NewGuid().ToString('N'))"
$responsePath = Join-Path ([IO.Path]::GetTempPath()) "forge-gate5e-response-$([guid]::NewGuid().ToString('N')).json"
$checks = [Collections.Generic.List[string]]::new()
$utf8 = [Text.UTF8Encoding]::new($false)

function Write-Attestation([hashtable]$Overrides) {
  $tokenHash = Get-ForgeGate5DSha256Hex -Bytes $utf8.GetBytes($syntheticToken)
  $projectHash = Get-ForgeGate5DSha256Hex -Bytes $utf8.GetBytes($projectRef)
  $value = [ordered]@{
    schema = 'forge.gate5d-scoped-token-attestation.v1'
    tokenSha256 = $tokenHash
    projectRefSha256 = $projectHash
    projectRefSha256Allowlist = @($projectHash)
    permissions = @('database_read')
    verifiedAtUtc = [DateTimeOffset]::UtcNow.ToString('o')
    tokenExpiresAtUtc = [DateTimeOffset]::UtcNow.AddHours(1).ToString('o')
  }
  foreach ($key in $Overrides.Keys) { $value[$key] = $Overrides[$key] }
  $path = Join-Path $tempRoot 'owner-attestation.json'
  [IO.File]::WriteAllText($path, ($value | ConvertTo-Json -Depth 5), $utf8)
  return $path
}

function Set-SyntheticCredential([hashtable]$Overrides = @{}) {
  foreach ($name in $environmentNames) { [Environment]::SetEnvironmentVariable($name, $null, 'Process') }
  [Environment]::SetEnvironmentVariable($tokenName, $syntheticToken, 'Process')
  return Write-Attestation $Overrides
}

function Expect-Failure([scriptblock]$Action, [string]$Pattern) {
  try { & $Action | Out-Null; throw "Expected Gate 5E failure matching $Pattern" }
  catch {
    if ($_.Exception.Message -notmatch $Pattern) { throw }
    if ($_.Exception.Message -match 'synthetic_only_secret_sentinel|gate5e-raw-response-secret') {
      throw 'Gate 5E failure leaked a credential or raw response value.'
    }
  }
  if (-not [string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($tokenName, 'Process'))) {
    throw 'Gate 5E runner did not clear the process token after failure.'
  }
}

try {
  foreach ($name in $environmentNames) { $savedEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }
  New-ForgeGate5DRestrictedDirectory -Path $tempRoot | Out-Null
  $probe = [ordered]@{
    execution_user = 'supabase_read_only_user'
    transaction_read_only = 'on'
    schema_usage = $true
    table_select = $true
    six_columns_select = $true
    zero_row_projection_count = 0
    digest_available = $true
  }
  $successJson = ConvertTo-Json -InputObject @([ordered]@{ gate5d_read_only_probe = $probe }) -Depth 8 -Compress
  [IO.File]::WriteAllText($responsePath, $successJson, $utf8)

  $attestationPath = Set-SyntheticCredential
  $result = & $runner -ProjectRef $projectRef -ScopeAttestationPath $attestationPath -SyntheticTest -SyntheticResponsePath $responsePath -RepositoryRoot $repo | ConvertFrom-Json
  if (-not $result.ok -or $result.hostedRequestMade -or -not $result.syntheticOnly -or
      $result.executionRole -cne 'supabase_read_only_user' -or $result.transactionReadOnly -cne 'on' -or
      $result.zeroRowProjectionCount -ne 0 -or $result.confidentialDataReturned -or
      -not [string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($tokenName, 'Process'))) {
    throw 'Gate 5E successful mock contract changed.'
  }
  $checks.Add('fixed-zero-row-success-response-and-process-token-cleanup')

  $attestationPath = Set-SyntheticCredential
  Expect-Failure { & $runner -ProjectRef $projectRef -ScopeAttestationPath $attestationPath -SyntheticTest -SyntheticResponsePath $responsePath -SyntheticStatusCode 401 -RepositoryRoot $repo } 'HTTP 401'
  $attestationPath = Set-SyntheticCredential
  Expect-Failure { & $runner -ProjectRef $projectRef -ScopeAttestationPath $attestationPath -SyntheticTest -SyntheticResponsePath $responsePath -SyntheticStatusCode 500 -RepositoryRoot $repo } 'HTTP 500'
  $checks.Add('authentication-and-unexpected-status-rejection')

  $badShape = ConvertTo-Json -InputObject @([ordered]@{ gate5d_read_only_probe = $probe; unexpected = 'gate5e-raw-response-secret' }) -Depth 8 -Compress
  [IO.File]::WriteAllText($responsePath, $badShape, $utf8)
  $attestationPath = Set-SyntheticCredential
  Expect-Failure { & $runner -ProjectRef $projectRef -ScopeAttestationPath $attestationPath -SyntheticTest -SyntheticResponsePath $responsePath -RepositoryRoot $repo } 'unexpected row shape'
  [IO.File]::WriteAllText($responsePath, '{malformed gate5e-raw-response-secret', $utf8)
  $attestationPath = Set-SyntheticCredential
  Expect-Failure { & $runner -ProjectRef $projectRef -ScopeAttestationPath $attestationPath -SyntheticTest -SyntheticResponsePath $responsePath -RepositoryRoot $repo } 'malformed'
  [IO.File]::WriteAllText($responsePath, $successJson, $utf8)
  $checks.Add('response-shape-and-raw-body-redaction')

  $attestationPath = Set-SyntheticCredential @{ tokenExpiresAtUtc = [DateTimeOffset]::UtcNow.AddMinutes(-1).ToString('o') }
  Expect-Failure { & $runner -ProjectRef $projectRef -ScopeAttestationPath $attestationPath -SyntheticTest -SyntheticResponsePath $responsePath -RepositoryRoot $repo } 'expired'
  $attestationPath = Set-SyntheticCredential @{ verifiedAtUtc = [DateTimeOffset]::UtcNow.AddDays(-2).ToString('o') }
  Expect-Failure { & $runner -ProjectRef $projectRef -ScopeAttestationPath $attestationPath -SyntheticTest -SyntheticResponsePath $responsePath -RepositoryRoot $repo } 'stale'
  $attestationPath = Set-SyntheticCredential @{ projectRefSha256 = ('0' * 64) }
  Expect-Failure { & $runner -ProjectRef $projectRef -ScopeAttestationPath $attestationPath -SyntheticTest -SyntheticResponsePath $responsePath -RepositoryRoot $repo } 'does not match'
  $attestationPath = Set-SyntheticCredential @{ permissions = @('database_read','database_write') }
  Expect-Failure { & $runner -ProjectRef $projectRef -ScopeAttestationPath $attestationPath -SyntheticTest -SyntheticResponsePath $responsePath -RepositoryRoot $repo } 'does not match'
  $attestationPath = Set-SyntheticCredential @{ tokenSha256 = ('f' * 64) }
  Expect-Failure { & $runner -ProjectRef $projectRef -ScopeAttestationPath $attestationPath -SyntheticTest -SyntheticResponsePath $responsePath -RepositoryRoot $repo } 'does not match'
  $checks.Add('expiration-age-project-permission-and-fingerprint-rejection')

  foreach ($name in $environmentNames) { [Environment]::SetEnvironmentVariable($name, $null, 'Process') }
  [Environment]::SetEnvironmentVariable($tokenName, 'legacy-token', 'Process')
  $attestationPath = Write-Attestation @{}
  Expect-Failure { & $runner -ProjectRef $projectRef -ScopeAttestationPath $attestationPath -SyntheticTest -SyntheticResponsePath $responsePath -RepositoryRoot $repo } 'beginning sbp_fc'
  $attestationPath = Set-SyntheticCredential
  [Environment]::SetEnvironmentVariable('SUPABASE_ACCESS_TOKEN', 'forbidden-broader-secret', 'Process')
  Expect-Failure { & $runner -ProjectRef $projectRef -ScopeAttestationPath $attestationPath -SyntheticTest -SyntheticResponsePath $responsePath -RepositoryRoot $repo } 'Broader Supabase'
  foreach ($name in $environmentNames) { [Environment]::SetEnvironmentVariable($name, $null, 'Process') }
  $attestationPath = Write-Attestation @{}
  Expect-Failure { & $runner -ProjectRef $projectRef -ScopeAttestationPath $attestationPath -SyntheticTest -SyntheticResponsePath $responsePath -RepositoryRoot $repo } 'process-scoped'
  $checks.Add('legacy-broader-and-missing-credential-rejection')

  $attestationPath = Set-SyntheticCredential
  Expect-Failure { & $runner -ProjectRef $projectRef -ScopeAttestationPath (Join-Path $tempRoot 'missing.json') -SyntheticTest -SyntheticResponsePath $responsePath -RepositoryRoot $repo } 'missing or outside'
  $attestationPath = Set-SyntheticCredential
  Expect-Failure { & $runner -ProjectRef $projectRef -ScopeAttestationPath $attestationPath -SyntheticTest -SyntheticResponsePath $responsePath -SyntheticTransportFailure -RepositoryRoot $repo } 'interrupted'
  $checks.Add('missing-attestation-and-interrupted-request-cleanup')

  $source = Get-Content -LiteralPath $runner -Raw
  if ($source -match 'export-gate5d-authentic-history|gate5d_authentic_history_export|(?i)\b(Query|Sql|Endpoint|Uri)Override\b|supabase\s+(login|link|db\s+dump|migration|db\s+push)' -or
      -not $source.Contains('gate5d_read_only_endpoint_probe.sql', [StringComparison]::Ordinal) -or
      -not $source.Contains('d9bf4e0257583e7c8ec865bac73d28f4fbd84ee59197e3867f75d844c6b248fb', [StringComparison]::Ordinal)) {
    throw 'Gate 5E runner can escape the frozen zero-row query boundary.'
  }
  $checks.Add('no-full-history-export-query-endpoint-or-cli-fallback')
}
finally {
  foreach ($name in $environmentNames) { [Environment]::SetEnvironmentVariable($name, $savedEnvironment[$name], 'Process') }
  if (Test-Path -LiteralPath $responsePath) { [IO.File]::Delete($responsePath) }
  if (Test-Path -LiteralPath $tempRoot) { Remove-ForgeGate5DCapsule -Directory $tempRoot }
}

[pscustomobject]@{
  ok = $true
  schema = 'forge.gate5e-read-only-probe-test.v1'
  syntheticOnly = $true
  hostedRequestMade = $false
  checks = @($checks)
  cleanupVerified = (-not (Test-Path -LiteralPath $tempRoot) -and -not (Test-Path -LiteralPath $responsePath))
} | ConvertTo-Json -Depth 5 -Compress
