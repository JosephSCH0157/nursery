[CmdletBinding()]
param(
  [Parameter(Mandatory)][ValidatePattern('^[a-z0-9]{20}$')][string]$ProjectRef,
  [Parameter(Mandatory)][string]$ScopeAttestationPath,
  [switch]$AuthorizeHostedProbe,
  [switch]$SyntheticTest,
  [string]$SyntheticResponsePath,
  [ValidateRange(100,599)][int]$SyntheticStatusCode = 201,
  [switch]$SyntheticTransportFailure,
  [string]$RepositoryRoot
)

$ErrorActionPreference = 'Stop'
$repo = [IO.Path]::GetFullPath($(if ($RepositoryRoot) { $RepositoryRoot } else { Split-Path -Parent $PSScriptRoot }))
Import-Module (Join-Path $repo 'scripts/lib/ForgeGate5D.psm1') -Force

$tokenName = 'FORGE_GATE5D_DATABASE_READ_TOKEN'
$expectedQueryHash = 'd9bf4e0257583e7c8ec865bac73d28f4fbd84ee59197e3867f75d844c6b248fb'
$expectedProbeFields = @(
  'digest_available','execution_user','schema_usage','six_columns_select',
  'table_select','transaction_read_only','zero_row_projection_count'
)
$forbiddenCredentialNames = @('SUPABASE_ACCESS_TOKEN','SUPABASE_DB_PASSWORD','SUPABASE_DB_URL','DATABASE_URL','DIRECT_URL')
$utf8 = [Text.UTF8Encoding]::new($false)
$token = $null
$body = $null
$responseText = $null
$request = $null
$response = $null
$client = $null
$handler = $null
$hostedRequestMade = $false

function Resolve-Gate5ESyntheticResponse([string]$Path) {
  if (-not $Path) { throw 'Synthetic Gate 5E testing requires a response file.' }
  $full = [IO.Path]::GetFullPath($Path)
  $temp = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
  if (-not $full.StartsWith($temp, [StringComparison]::OrdinalIgnoreCase) -or
      (Split-Path -Leaf $full) -notlike 'forge-gate5e-*' -or
      -not (Test-Path -LiteralPath $full -PathType Leaf)) {
    throw 'Synthetic Gate 5E response must be an existing forge-gate5e-* file beneath the OS temporary directory.'
  }
  return $full
}

function Read-Gate5EAttestation([string]$Path, [string]$ExpectedTokenHash, [string]$ExpectedProjectHash) {
  $full = [IO.Path]::GetFullPath($Path)
  $temp = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
  $parent = Split-Path -Parent $full
  if (-not $full.StartsWith($temp, [StringComparison]::OrdinalIgnoreCase) -or
      (Split-Path -Leaf $parent) -notlike 'forge-gate5d-attestation-*' -or
      (Split-Path -Leaf $full) -cne 'owner-attestation.json' -or
      -not (Test-Path -LiteralPath $full -PathType Leaf)) {
    throw 'Gate 5E owner attestation is missing or outside the approved restricted temporary location.'
  }
  $acl = Get-Acl -LiteralPath $parent
  if (-not $acl.AreAccessRulesProtected) { throw 'Gate 5E owner-attestation directory still inherits access rules.' }
  $allowedSids = @([Security.Principal.WindowsIdentity]::GetCurrent().User.Value, 'S-1-5-18')
  foreach ($rule in $acl.Access) {
    if ($rule.AccessControlType -eq [Security.AccessControl.AccessControlType]::Allow) {
      $sid = $rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value
      if ($sid -notin $allowedSids) { throw 'Gate 5E owner-attestation directory grants access to an unapproved identity.' }
    }
  }
  try { $attestation = Get-Content -LiteralPath $full -Raw | ConvertFrom-Json }
  catch { throw 'Gate 5E owner attestation is malformed.' }
  $expectedFields = @(
    'permissions','projectRefSha256','projectRefSha256Allowlist','schema',
    'tokenExpiresAtUtc','tokenSha256','verifiedAtUtc'
  )
  $actualFields = @($attestation.psobject.Properties.Name | Sort-Object)
  if (($actualFields -join ',') -cne (($expectedFields | Sort-Object) -join ',')) {
    throw 'Gate 5E owner attestation contains missing or unexpected fields.'
  }
  if ($attestation.schema -cne 'forge.gate5d-scoped-token-attestation.v1' -or
      [string]$attestation.tokenSha256 -cne $ExpectedTokenHash -or
      [string]$attestation.projectRefSha256 -cne $ExpectedProjectHash -or
      (@($attestation.projectRefSha256Allowlist) -join ',') -cne $ExpectedProjectHash -or
      (@($attestation.permissions) -join ',') -cne 'database_read') {
    throw 'Gate 5E owner attestation does not match the one-project database_read credential contract.'
  }
  try {
    $verifiedAt = [DateTimeOffset]::Parse([string]$attestation.verifiedAtUtc)
    $expiresAt = [DateTimeOffset]::Parse([string]$attestation.tokenExpiresAtUtc)
  } catch { throw 'Gate 5E owner attestation has an invalid review or expiration time.' }
  $now = [DateTimeOffset]::UtcNow
  if (($now - $verifiedAt).TotalHours -gt 24 -or $verifiedAt -gt $now.AddMinutes(5)) {
    throw 'Gate 5E owner attestation is stale or future-dated.'
  }
  if ($expiresAt -le $now) { throw 'Gate 5E scoped token is expired.' }
  return $attestation
}

function ConvertFrom-Gate5EProbeResponse([string]$Json) {
  try { $parsed = $Json | ConvertFrom-Json -Depth 10 }
  catch { throw 'Gate 5E response was malformed; raw response content is suppressed.' }
  $rows = @($parsed)
  if ($rows.Count -ne 1) { throw 'Gate 5E response must contain exactly one row.' }
  $rowFields = @($rows[0].psobject.Properties.Name)
  if (($rowFields -join ',') -cne 'gate5d_read_only_probe') {
    throw 'Gate 5E response contained an unexpected row shape or additional columns.'
  }
  $probe = $rows[0].gate5d_read_only_probe
  if ($null -eq $probe -or $probe -is [string]) { throw 'Gate 5E response omitted the structured probe result.' }
  $probeFields = @($probe.psobject.Properties.Name | Sort-Object)
  if (($probeFields -join ',') -cne (($expectedProbeFields | Sort-Object) -join ',')) {
    throw 'Gate 5E probe result contained missing or unexpected fields.'
  }
  foreach ($field in @('schema_usage','table_select','six_columns_select','digest_available')) {
    if ($probe.$field -isnot [bool] -or -not $probe.$field) { throw "Gate 5E compatibility check failed for $field." }
  }
  if ([string]$probe.execution_user -cne 'supabase_read_only_user' -or
      [string]$probe.transaction_read_only -cne 'on' -or
      [int64]$probe.zero_row_projection_count -ne 0) {
    throw 'Gate 5E execution identity, transaction mode, or zero-row contract failed.'
  }
  return $probe
}

try {
  if ($SyntheticTest) {
    if ($AuthorizeHostedProbe) { throw 'Hosted authorization is forbidden in synthetic Gate 5E mode.' }
    if ($ProjectRef -cne ('a' * 20)) { throw 'Synthetic Gate 5E mode requires the reserved synthetic project reference.' }
    $syntheticPath = Resolve-Gate5ESyntheticResponse $SyntheticResponsePath
  } else {
    if ($SyntheticResponsePath -or $SyntheticTransportFailure -or $PSBoundParameters.ContainsKey('SyntheticStatusCode')) {
      throw 'Synthetic Gate 5E inputs are forbidden for a hosted probe.'
    }
    if (-not $AuthorizeHostedProbe) { throw 'Hosted Gate 5E probe is disabled without explicit -AuthorizeHostedProbe.' }
  }

  $contract = Get-ForgeGate5DContract -RepositoryRoot $repo
  $endpoint = $contract.dedicatedReadOnlyManagementApi
  if ($endpoint.origin -cne 'https://api.supabase.com' -or
      $endpoint.pathTemplate -cne '/v1/projects/{ref}/database/query/read-only' -or
      $endpoint.method -cne 'POST' -or
      $endpoint.executionRole -cne 'supabase_read_only_user' -or
      $endpoint.requiredFineGrainedPermission -cne 'database_read' -or
      $endpoint.documentedSuccessStatus -ne 201) {
    throw 'Gate 5E dedicated endpoint contract changed.'
  }

  $queryPath = Join-Path $repo 'supabase/tests/catalog/gate5d_read_only_endpoint_probe.sql'
  $queryHash = (Get-FileHash -LiteralPath $queryPath -Algorithm SHA256).Hash.ToLowerInvariant()
  $query = Get-Content -LiteralPath $queryPath -Raw
  if ($queryHash -cne $expectedQueryHash -or
      ([regex]::Matches($query, ';')).Count -ne 1 -or
      $query -notmatch 'where\s+false' -or
      $query -notmatch 'from\s+supabase_migrations\.schema_migrations' -or
      $query -match '(?im)^\s*(begin|commit|rollback|set|insert|update|delete|merge|alter|create|drop|truncate|grant|revoke|copy|call|do)\b') {
    throw 'Gate 5E frozen zero-row query changed or is not one read-only SELECT.'
  }

  $token = [Environment]::GetEnvironmentVariable($tokenName, 'Process')
  if ([string]::IsNullOrWhiteSpace($token) -or -not $token.StartsWith('sbp_fc', [StringComparison]::Ordinal)) {
    throw 'Gate 5E requires a process-scoped Supabase PAT beginning sbp_fc.'
  }
  if (@($forbiddenCredentialNames | Where-Object {
    -not [string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($_, 'Process'))
  }).Count -ne 0) {
    throw 'Broader Supabase or database credentials are present in the Gate 5E process.'
  }

  $tokenHash = Get-ForgeGate5DSha256Hex -Bytes $utf8.GetBytes($token)
  $projectHash = Get-ForgeGate5DSha256Hex -Bytes $utf8.GetBytes($ProjectRef)
  $attestation = Read-Gate5EAttestation -Path $ScopeAttestationPath -ExpectedTokenHash $tokenHash -ExpectedProjectHash $projectHash
  if ([DateTimeOffset]::Parse([string]$attestation.tokenExpiresAtUtc) -le [DateTimeOffset]::UtcNow) {
    throw 'Gate 5E scoped token expired immediately before request construction.'
  }

  $bodyObject = [ordered]@{ query = $query; parameters = @() }
  $body = $bodyObject | ConvertTo-Json -Depth 4 -Compress
  if ((@($bodyObject.Keys) -join ',') -cne 'query,parameters' -or $body -match '"read_only"\s*:') {
    throw 'Gate 5E request body changed from the fixed query-and-parameters contract.'
  }

  if ($SyntheticTest) {
    if ($SyntheticTransportFailure) { throw 'Gate 5E request was interrupted; confidential details are suppressed.' }
    $statusCode = $SyntheticStatusCode
    if ($statusCode -ne 201) { throw "Gate 5E dedicated endpoint returned HTTP $statusCode; response content is suppressed." }
    $responseText = Get-Content -LiteralPath $syntheticPath -Raw
  } else {
    $uri = "https://api.supabase.com/v1/projects/$ProjectRef/database/query/read-only"
    $handler = [Net.Http.HttpClientHandler]::new()
    $client = [Net.Http.HttpClient]::new($handler)
    $client.Timeout = [TimeSpan]::FromSeconds(30)
    $request = [Net.Http.HttpRequestMessage]::new([Net.Http.HttpMethod]::Post, $uri)
    $request.Headers.Authorization = [Net.Http.Headers.AuthenticationHeaderValue]::new('Bearer', $token)
    $request.Content = [Net.Http.StringContent]::new($body, $utf8, 'application/json')
    $hostedRequestMade = $true
    try { $response = $client.SendAsync($request).GetAwaiter().GetResult() }
    catch { throw 'Gate 5E request was interrupted; confidential details are suppressed.' }
    $statusCode = [int]$response.StatusCode
    if ($statusCode -ne 201) { throw "Gate 5E dedicated endpoint returned HTTP $statusCode; response content is suppressed." }
    $responseText = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
  }

  $probe = ConvertFrom-Gate5EProbeResponse -Json $responseText
  [pscustomobject]@{
    ok = $true
    schema = 'forge.gate5e-read-only-probe-result.v1'
    httpStatus = 201
    endpoint = '/v1/projects/{ref}/database/query/read-only'
    executionRole = [string]$probe.execution_user
    transactionReadOnly = [string]$probe.transaction_read_only
    schemaUsage = [bool]$probe.schema_usage
    tableSelect = [bool]$probe.table_select
    sixColumnsSelect = [bool]$probe.six_columns_select
    digestAvailable = [bool]$probe.digest_available
    zeroRowProjectionCount = [int64]$probe.zero_row_projection_count
    querySha256 = $expectedQueryHash
    hostedRequestMade = $hostedRequestMade
    syntheticOnly = [bool]$SyntheticTest
    confidentialDataReturned = $false
  } | ConvertTo-Json -Depth 4 -Compress
}
catch {
  $message = $_.Exception.Message
  if ($message -match '^(Gate 5E|Hosted Gate 5E|Broader Supabase|Synthetic Gate 5E)') { throw $message }
  throw 'Gate 5E probe failed; credentials and raw response content are suppressed.'
}
finally {
  [Environment]::SetEnvironmentVariable($tokenName, $null, 'Process')
  if ($request) {
    $request.Headers.Authorization = $null
    $request.Dispose()
  }
  if ($response) { $response.Dispose() }
  if ($client) { $client.Dispose() }
  if ($handler) { $handler.Dispose() }
  $token = $null
  $body = $null
  $query = $null
  $responseText = $null
  $attestation = $null
}
