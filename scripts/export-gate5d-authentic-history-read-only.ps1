[CmdletBinding()]
param(
  [Parameter(Mandatory)][ValidatePattern('^[a-z0-9]{20}$')][string]$ProjectRef,
  [string]$ScopeAttestationPath,
  [switch]$AuthorizeAuthenticExport,
  [switch]$SyntheticTest,
  [string]$SyntheticContractPath,
  [string]$SyntheticResponsePath,
  [string]$RepositoryRoot
)

$ErrorActionPreference = 'Stop'
$module = Join-Path $PSScriptRoot 'lib/ForgeGate5D.psm1'
Import-Module $module -Force
$repo = [IO.Path]::GetFullPath($(if ($RepositoryRoot) { $RepositoryRoot } else { Split-Path -Parent $PSScriptRoot }))
$utf8 = [Text.UTF8Encoding]::new($false)
$responseText = $null
$payload = $null
$directory = $null
$token = $null
$request = $null
$client = $null
$handler = $null
$hostedRequestMade = $false

function Resolve-SyntheticInput([string]$Path,[string]$Label) {
  if (-not $Path) { throw "Synthetic tests require $Label." }
  $full = [IO.Path]::GetFullPath($Path)
  $temp = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
  if (-not $full.StartsWith($temp,[StringComparison]::OrdinalIgnoreCase) -or
      (Split-Path -Leaf $full) -notlike 'forge-gate5d-*' -or
      -not (Test-Path -LiteralPath $full -PathType Leaf)) {
    throw "Synthetic $Label must be an existing forge-gate5d-* file beneath the OS temporary directory."
  }
  return $full
}

try {
  if ($SyntheticTest) {
    if ($AuthorizeAuthenticExport -or $ScopeAttestationPath) { throw 'Authentic authorization inputs are forbidden in synthetic-test mode.' }
    $contractPath = Resolve-SyntheticInput $SyntheticContractPath 'contract'
    $responsePath = Resolve-SyntheticInput $SyntheticResponsePath 'response'
    $contract = Get-Content -LiteralPath $contractPath -Raw | ConvertFrom-Json
    if ($contract.schema -ne 'forge.gate5d-authentic-history-contract.v1') { throw 'Unexpected synthetic Gate 5D contract.' }
  } else {
    if ($SyntheticContractPath -or $SyntheticResponsePath) { throw 'Synthetic overrides are forbidden outside synthetic-test mode.' }
    if (-not $AuthorizeAuthenticExport) { throw 'Authentic export is disabled. A separate owner authorization and -AuthorizeAuthenticExport are required.' }
    if (-not $ScopeAttestationPath) { throw 'Authentic export requires a scoped-token attestation.' }
    $contract = Get-ForgeGate5DContract -RepositoryRoot $repo
  }

  $endpoint = $contract.dedicatedReadOnlyManagementApi
  if ($endpoint.origin -cne 'https://api.supabase.com' -or
      $endpoint.pathTemplate -cne '/v1/projects/{ref}/database/query/read-only' -or
      $endpoint.method -cne 'POST' -or
      $endpoint.requiredFineGrainedPermission -cne 'database_read' -or
      $endpoint.requiredTokenPrefix -cne 'sbp_fc' -or
      $endpoint.executionRole -cne 'supabase_read_only_user' -or
      $endpoint.requestHasReadOnlyProperty -ne $false) {
    throw 'The dedicated read-only Management API contract changed.'
  }

  $queryPath = Join-Path $repo 'supabase/tests/catalog/gate5d_authentic_history_export_read_only.sql'
  $query = Get-Content -LiteralPath $queryPath -Raw
  $queryHash = Get-ForgeGate5DSha256Hex -Bytes $utf8.GetBytes($query)
  $trimmedQuery = $query.Trim()
  $withoutFinalSemicolon = $trimmedQuery.TrimEnd(';').TrimEnd()
  if ($queryHash -cne [string]$endpoint.querySha256 -or
      -not $trimmedQuery.StartsWith('with history as materialized', [StringComparison]::OrdinalIgnoreCase) -or
      $withoutFinalSemicolon.Contains(';',[StringComparison]::Ordinal) -or
      $query -notmatch 'from\s+supabase_migrations\.schema_migrations' -or
      $query -match '(?im)^\s*(begin|commit|rollback|set|insert|update|delete|merge|alter|create|drop|truncate|grant|revoke|copy|call|do)\b') {
    throw 'The reviewed dedicated-endpoint export query changed or is not one read-only SELECT.'
  }

  $bodyObject = [ordered]@{ query=$query; parameters=@() }
  $body = $bodyObject | ConvertTo-Json -Depth 5 -Compress
  if (@($bodyObject.Keys) -join ',' -cne 'query,parameters' -or $body -match '"read_only"') {
    throw 'The dedicated endpoint request body is not the approved query-and-parameters contract.'
  }
  $uri = "https://api.supabase.com/v1/projects/$ProjectRef/database/query/read-only"

  if ($SyntheticTest) {
    $responseText = Get-Content -LiteralPath $responsePath -Raw
  } else {
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

    $handler = [Net.Http.HttpClientHandler]::new()
    $client = [Net.Http.HttpClient]::new($handler)
    $client.Timeout = [TimeSpan]::FromMinutes(2)
    $request = [Net.Http.HttpRequestMessage]::new([Net.Http.HttpMethod]::Post, $uri)
    $request.Headers.Authorization = [Net.Http.Headers.AuthenticationHeaderValue]::new('Bearer', $token)
    $request.Content = [Net.Http.StringContent]::new($body, $utf8, 'application/json')
    $hostedRequestMade = $true
    $response = $client.SendAsync($request).GetAwaiter().GetResult()
    if ([int]$response.StatusCode -ne 201) {
      throw "Dedicated read-only Management API export failed with HTTP $([int]$response.StatusCode); response content is suppressed."
    }
    $responseText = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
  }

  $parsed = ConvertFrom-ForgeGate5DResponse -ResponseJson $responseText -Contract $contract
  $payload = $parsed.Payload
  Test-ForgeGate5DPayload -Payload $payload -Contract $contract -RepositoryRoot $repo | Out-Null
  if (-not $projectHash) { $projectHash = Get-ForgeGate5DSha256Hex -Bytes $utf8.GetBytes('gate5d-synthetic-local-only') }
  $directory = Join-Path ([IO.Path]::GetTempPath()) "forge-gate5d-read-only-$([guid]::NewGuid().ToString('N'))"
  New-ForgeGate5DRestrictedDirectory -Path $directory | Out-Null
  $capsule = Protect-ForgeGate5DCapsule -Payload $payload -Directory $directory -Contract $contract -ProjectRefHash $projectHash
  [pscustomobject]@{
    ok=$true; schema='forge.gate5d-read-only-export-result.v1'; capsuleDirectory=$directory
    rowCount=[int]$contract.history.rowCount; payloadSha256=[string]$contract.history.hashes.allColumns
    endpoint='/v1/projects/{ref}/database/query/read-only'; executionRole='supabase_read_only_user'
    requestProperties=@('query','parameters'); singleSelect=$true; hostedRequestMade=$hostedRequestMade
    confidential=$true
  } | ConvertTo-Json -Compress
}
catch {
  if ($directory -and (Test-Path -LiteralPath $directory)) { Remove-ForgeGate5DCapsule -Directory $directory }
  if ($_.Exception.Message -match 'HTTP \d{3}|Authentic export|synthetic|scoped|attestation|credential|contract|query|endpoint|hash|payload|response|transaction|capsule|envelope|column|count|version') { throw }
  throw 'Dedicated read-only export failed; confidential details are suppressed.'
}
finally {
  if ($payload) { [Array]::Clear($payload,0,$payload.Length) }
  $token=$null; $body=$null; $query=$null; $responseText=$null
  if ($request) { $request.Dispose() }
  if ($client) { $client.Dispose() }
  if ($handler) { $handler.Dispose() }
}
