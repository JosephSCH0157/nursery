[CmdletBinding()]
param(
  [Parameter(Mandatory)][ValidatePattern('^[a-z0-9]{20}$')][string]$ProjectRef,
  [Parameter(Mandatory)][string]$ScopeAttestationPath,
  [switch]$AuthorizeAuthenticExport,
  [string]$RepositoryRoot
)

$ErrorActionPreference = 'Stop'
if (-not $AuthorizeAuthenticExport) {
  throw 'Authentic export is disabled. A separate owner authorization and -AuthorizeAuthenticExport are required.'
}
$module = Join-Path $PSScriptRoot 'lib/ForgeGate5D.psm1'
Import-Module $module -Force
$repo = [IO.Path]::GetFullPath($(if ($RepositoryRoot) { $RepositoryRoot } else { Split-Path -Parent $PSScriptRoot }))
$contract = Get-ForgeGate5DContract -RepositoryRoot $repo
$tokenName = 'FORGE_GATE5D_DATABASE_READ_TOKEN'
$token = [Environment]::GetEnvironmentVariable($tokenName, 'Process')
if ([string]::IsNullOrWhiteSpace($token) -or -not $token.StartsWith('sbp_fc', [StringComparison]::Ordinal)) {
  throw 'A scoped Supabase PAT is required in FORGE_GATE5D_DATABASE_READ_TOKEN; legacy and generic credentials are rejected.'
}
if (@('SUPABASE_ACCESS_TOKEN','SUPABASE_DB_PASSWORD','SUPABASE_DB_URL','DATABASE_URL','DIRECT_URL') | Where-Object {
  -not [string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($_, 'Process'))
}) {
  throw 'Broader Supabase or database credentials are present in the process environment.'
}

$utf8 = [Text.UTF8Encoding]::new($false)
$tokenHash = Get-ForgeGate5DSha256Hex -Bytes $utf8.GetBytes($token)
$projectHash = Get-ForgeGate5DSha256Hex -Bytes $utf8.GetBytes($ProjectRef)
$attestation = Get-Content -LiteralPath $ScopeAttestationPath -Raw | ConvertFrom-Json
if ($attestation.schema -ne 'forge.gate5d-scoped-token-attestation.v1' -or
    [string]$attestation.tokenSha256 -cne $tokenHash -or
    [string]$attestation.projectRefSha256 -cne $projectHash -or
    (@($attestation.permissions) -join ',') -cne 'database_read' -or
    (@($attestation.projectRefSha256Allowlist) -join ',') -cne $projectHash) {
  throw 'Scoped-token attestation does not prove one-project database_read-only authority.'
}
$verifiedAt = [DateTimeOffset]::Parse([string]$attestation.verifiedAtUtc)
if (([DateTimeOffset]::UtcNow - $verifiedAt).TotalHours -gt 24 -or $verifiedAt -gt [DateTimeOffset]::UtcNow.AddMinutes(5)) {
  throw 'Scoped-token attestation is stale or future-dated.'
}

$query = Get-Content -LiteralPath (Join-Path $repo 'supabase/tests/catalog/gate5d_authentic_history_export.sql') -Raw
if (-not $query.StartsWith('begin transaction read only;', [StringComparison]::OrdinalIgnoreCase)) {
  throw 'The reviewed export query no longer begins with a read-only transaction.'
}
$body = [ordered]@{ query=$query; parameters=@(); read_only=$true } | ConvertTo-Json -Depth 5 -Compress
$uri = "https://api.supabase.com/v1/projects/$ProjectRef/database/query"
$handler = [Net.Http.HttpClientHandler]::new()
$client = [Net.Http.HttpClient]::new($handler)
$client.Timeout = [TimeSpan]::FromMinutes(2)
$request = [Net.Http.HttpRequestMessage]::new([Net.Http.HttpMethod]::Post, $uri)
$request.Headers.Authorization = [Net.Http.Headers.AuthenticationHeaderValue]::new('Bearer', $token)
$request.Content = [Net.Http.StringContent]::new($body, $utf8, 'application/json')
$responseText = $null
$parsed = $null
$payload = $null
$directory = $null
try {
  $response = $client.SendAsync($request).GetAwaiter().GetResult()
  if (-not $response.IsSuccessStatusCode) {
    throw "Management API export failed with HTTP $([int]$response.StatusCode); response content is suppressed."
  }
  $responseText = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
  $parsed = ConvertFrom-ForgeGate5DResponse -ResponseJson $responseText -Contract $contract
  $payload = $parsed.Payload
  Test-ForgeGate5DPayload -Payload $payload -Contract $contract -RepositoryRoot $repo | Out-Null
  $directory = Join-Path ([IO.Path]::GetTempPath()) "forge-gate5d-authentic-$([guid]::NewGuid().ToString('N'))"
  New-ForgeGate5DRestrictedDirectory -Path $directory | Out-Null
  $capsule = Protect-ForgeGate5DCapsule -Payload $payload -Directory $directory -Contract $contract -ProjectRefHash $projectHash
  [pscustomobject]@{
    ok=$true
    schema='forge.gate5d-export-result.v1'
    capsuleDirectory=$directory
    rowCount=[int]$contract.history.rowCount
    payloadSha256=[string]$contract.history.hashes.allColumns
    endpoint='/v1/projects/{ref}/database/query'
    readOnlyRequest=$true
    transactionReadOnly=$true
    confidential=$true
  } | ConvertTo-Json -Compress
}
catch {
  if ($directory -and (Test-Path -LiteralPath $directory)) { Remove-ForgeGate5DCapsule -Directory $directory }
  if ($_.Exception.Message -match 'HTTP \d{3}|Authentic export|scoped|attestation|credential|contract|hash|payload|response|transaction') { throw }
  throw 'Authentic export failed; confidential details are suppressed.'
}
finally {
  if ($payload) { [Array]::Clear($payload,0,$payload.Length) }
  $token = $null; $body = $null; $query = $null; $responseText = $null
  if ($request) { $request.Dispose() }
  if ($client) { $client.Dispose() }
  if ($handler) { $handler.Dispose() }
}
