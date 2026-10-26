[CmdletBinding()]
param(
  [Parameter(Mandatory)][ValidatePattern('^[a-z0-9]{20}$')][string]$ProjectRef,
  [string]$ScopeAttestationPath,
  [switch]$AuthorizeAuthenticExport,
  [switch]$SyntheticTest,
  [string]$SyntheticContractPath,
  [string]$SyntheticResponsePath,
  [ValidateSet('None','AfterResponseRead')][string]$SyntheticFailureInjection='None',
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
$response = $null
$client = $null
$handler = $null
$hostedRequestMade = $false
$maximumResponseBytes = 12MB

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

function Read-Gate5DAttestation([string]$Path,[string]$ExpectedTokenHash,[string]$ExpectedProjectHash) {
  $full = [IO.Path]::GetFullPath($Path)
  $temp = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
  $parent = Split-Path -Parent $full
  if (-not $full.StartsWith($temp,[StringComparison]::OrdinalIgnoreCase) -or
      (Split-Path -Leaf $parent) -notlike 'forge-gate5d-attestation-*' -or
      (Split-Path -Leaf $full) -cne 'owner-attestation.json' -or
      -not (Test-Path -LiteralPath $full -PathType Leaf)) {
    throw 'Gate 5D owner attestation is missing or outside the approved restricted temporary location.'
  }
  if ($IsWindows) {
    $acl = Get-Acl -LiteralPath $parent
    if (-not $acl.AreAccessRulesProtected) { throw 'Gate 5D owner-attestation directory still inherits access rules.' }
    $allowedSids = @([Security.Principal.WindowsIdentity]::GetCurrent().User.Value,'S-1-5-18')
    foreach ($rule in $acl.Access) {
      if ($rule.AccessControlType -eq [Security.AccessControl.AccessControlType]::Allow) {
        $sid = $rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value
        if ($sid -notin $allowedSids) { throw 'Gate 5D owner-attestation directory grants access to an unapproved identity.' }
      }
    }
  } else {
    Assert-ForgeGate5DUnixPathProtection -Path $parent -ExpectedMode '700' -ExpectedType 'directory'
    Assert-ForgeGate5DUnixPathProtection -Path $full -ExpectedMode '600' -ExpectedType 'file'
  }
  try { $attestation = Get-Content -LiteralPath $full -Raw | ConvertFrom-Json }
  catch { throw 'Gate 5D owner attestation is malformed.' }
  $expectedFields = @(
    'permissions','projectRefSha256','projectRefSha256Allowlist','schema',
    'tokenExpiresAtUtc','tokenSha256','verifiedAtUtc'
  )
  $actualFields = @($attestation.psobject.Properties.Name | Sort-Object)
  if (($actualFields -join ',') -cne (($expectedFields | Sort-Object) -join ',')) {
    throw 'Gate 5D owner attestation contains missing or unexpected fields.'
  }
  if ($attestation.schema -cne 'forge.gate5d-scoped-token-attestation.v1' -or
      [string]$attestation.tokenSha256 -cne $ExpectedTokenHash -or
      [string]$attestation.projectRefSha256 -cne $ExpectedProjectHash -or
      (@($attestation.projectRefSha256Allowlist) -join ',') -cne $ExpectedProjectHash -or
      (@($attestation.permissions) -join ',') -cne 'database_read') {
    throw 'Gate 5D owner attestation does not match the one-project database_read credential contract.'
  }
  try {
    $verifiedAt = [DateTimeOffset]::Parse([string]$attestation.verifiedAtUtc)
    $expiresAt = [DateTimeOffset]::Parse([string]$attestation.tokenExpiresAtUtc)
  } catch { throw 'Gate 5D owner attestation has an invalid review or expiration time.' }
  $now = [DateTimeOffset]::UtcNow
  if (($now - $verifiedAt).TotalHours -gt 24 -or $verifiedAt -gt $now.AddMinutes(5)) {
    throw 'Gate 5D owner attestation is stale or future-dated.'
  }
  if ($expiresAt -le $now) { throw 'Gate 5D scoped token is expired.' }
  return $attestation
}

try {
  if ($SyntheticTest) {
    if ($AuthorizeAuthenticExport -or $ScopeAttestationPath) { throw 'Authentic authorization inputs are forbidden in synthetic-test mode.' }
    $contractPath = Resolve-SyntheticInput $SyntheticContractPath 'contract'
    $responsePath = Resolve-SyntheticInput $SyntheticResponsePath 'response'
    $contract = Get-Content -LiteralPath $contractPath -Raw | ConvertFrom-Json
    if ($contract.schema -ne 'forge.gate5d-authentic-history-contract.v1') { throw 'Unexpected synthetic Gate 5D contract.' }
  } else {
    if ($SyntheticContractPath -or $SyntheticResponsePath -or $SyntheticFailureInjection -ne 'None') { throw 'Synthetic overrides are forbidden outside synthetic-test mode.' }
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
    $handler = [Net.Http.HttpClientHandler]::new()
    $client = [Net.Http.HttpClient]::new($handler)
    $client.Timeout = [TimeSpan]::FromMinutes(2)
    $client.MaxResponseContentBufferSize = $maximumResponseBytes
    $request = [Net.Http.HttpRequestMessage]::new([Net.Http.HttpMethod]::Post, $uri)
    $request.Headers.Authorization = [Net.Http.Headers.AuthenticationHeaderValue]::new('Bearer', $token)
    $request.Content = [Net.Http.StringContent]::new($body, $utf8, 'application/json')
    # Re-read and validate the restricted attestation immediately before the only network request.
    $null = Read-Gate5DAttestation -Path $ScopeAttestationPath -ExpectedTokenHash $tokenHash -ExpectedProjectHash $projectHash
    $hostedRequestMade = $true
    $response = $client.SendAsync($request).GetAwaiter().GetResult()
    if ([int]$response.StatusCode -ne 201) {
      throw "Dedicated read-only Management API export failed with HTTP $([int]$response.StatusCode); response content is suppressed."
    }
    if ($response.Content.Headers.ContentLength -and $response.Content.Headers.ContentLength -gt $maximumResponseBytes) {
      throw 'Dedicated read-only Management API export response exceeded the approved size bound.'
    }
    $responseText = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
  }

  if ($utf8.GetByteCount($responseText) -gt $maximumResponseBytes) {
    throw 'Dedicated read-only Management API export response exceeded the approved size bound.'
  }
  if ($SyntheticFailureInjection -eq 'AfterResponseRead') {
    throw 'Synthetic interrupted export after bounded response read.'
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
  [Environment]::SetEnvironmentVariable('FORGE_GATE5D_DATABASE_READ_TOKEN',$null,'Process')
  if ($request -and $request.Headers) { $request.Headers.Authorization = $null }
  $token=$null; $body=$null; $query=$null; $responseText=$null
  if ($response) { $response.Dispose() }
  if ($request) { $request.Dispose() }
  if ($client) { $client.Dispose() }
  if ($handler) { $handler.Dispose() }
}
