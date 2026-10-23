[CmdletBinding()]
param([string]$RepositoryRoot)

$ErrorActionPreference = 'Stop'
$repo = [IO.Path]::GetFullPath($(if ($RepositoryRoot) { $RepositoryRoot } else { Split-Path -Parent $PSScriptRoot }))
Import-Module (Join-Path $repo 'scripts/lib/ForgeGate5D.psm1') -Force

$tokenName = 'FORGE_GATE5D_DATABASE_READ_TOKEN'
$forbiddenNames = @('SUPABASE_ACCESS_TOKEN','SUPABASE_DB_PASSWORD','SUPABASE_DB_URL','DATABASE_URL','DIRECT_URL')
$secureToken = $null
$plainToken = $null
$bstr = [IntPtr]::Zero
$attestationDirectory = $null
$completed = $false

try {
  if (-not [string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($tokenName, 'Process'))) {
    throw 'A Gate 5E token is already loaded in this process; use a fresh PowerShell session.'
  }
  if (@($forbiddenNames | Where-Object {
    -not [string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($_, 'Process'))
  }).Count -ne 0) {
    throw 'Broader Supabase or database credentials are present; use a clean PowerShell process.'
  }

  $projectRef = (Read-Host 'Enter the reviewed 20-character Forge project reference').Trim()
  if ($projectRef -cnotmatch '^[a-z0-9]{20}$') { throw 'Unexpected Supabase project-reference format.' }

  $expirationText = (Read-Host 'Enter the reviewed token expiration in UTC (ISO 8601, for example 2026-10-23T22:00:00Z)').Trim()
  try {
    $expiration = [DateTimeOffset]::Parse(
      $expirationText,
      [Globalization.CultureInfo]::InvariantCulture,
      [Globalization.DateTimeStyles]::RoundtripKind
    )
  } catch {
    throw 'The reviewed token expiration is not valid ISO-8601 date-time text.'
  }
  if ($expiration -le [DateTimeOffset]::UtcNow) { throw 'The reviewed scoped token is already expired.' }

  $secureToken = Read-Host 'Paste the reviewed one-project database_read scoped PAT' -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)
  $plainToken = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  if ([string]::IsNullOrWhiteSpace($plainToken) -or
      -not $plainToken.StartsWith('sbp_fc', [StringComparison]::Ordinal)) {
    throw 'The supplied value is not a scoped Supabase PAT.'
  }

  $utf8 = [Text.UTF8Encoding]::new($false)
  $tokenHash = Get-ForgeGate5DSha256Hex -Bytes $utf8.GetBytes($plainToken)
  $projectHash = Get-ForgeGate5DSha256Hex -Bytes $utf8.GetBytes($projectRef)
  $attestationDirectory = Join-Path ([IO.Path]::GetTempPath()) "forge-gate5d-attestation-$([guid]::NewGuid().ToString('N'))"
  New-ForgeGate5DRestrictedDirectory -Path $attestationDirectory | Out-Null
  $attestationPath = Join-Path $attestationDirectory 'owner-attestation.json'
  $attestation = [ordered]@{
    schema = 'forge.gate5d-scoped-token-attestation.v1'
    tokenSha256 = $tokenHash
    projectRefSha256 = $projectHash
    projectRefSha256Allowlist = @($projectHash)
    permissions = @('database_read')
    verifiedAtUtc = [DateTimeOffset]::UtcNow.ToString('o')
    tokenExpiresAtUtc = $expiration.ToUniversalTime().ToString('o')
  }
  [IO.File]::WriteAllText($attestationPath, ($attestation | ConvertTo-Json -Depth 5), $utf8)

  [Environment]::SetEnvironmentVariable($tokenName, $plainToken, 'Process')
  $completed = $true
  [pscustomobject]@{
    ok = $true
    schema = 'forge.gate5e-owner-preparation.v1'
    projectRef = $projectRef
    attestationPath = $attestationPath
    permissions = @('database_read')
    singleProject = $true
    tokenExpiresAtUtc = $expiration.ToUniversalTime().ToString('o')
    processTokenLoaded = $true
  } | ConvertTo-Json -Depth 4 -Compress
}
finally {
  if (-not $completed) {
    [Environment]::SetEnvironmentVariable($tokenName, $null, 'Process')
    if ($attestationDirectory -and (Test-Path -LiteralPath $attestationDirectory)) {
      Remove-ForgeGate5DCapsule -Directory $attestationDirectory
    }
  }
  if ($bstr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
  $plainToken = $null
  $tokenHash = $null
  if ($secureToken) { $secureToken.Dispose() }
}
