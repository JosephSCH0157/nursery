[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$runId = [guid]::NewGuid().ToString('N').Substring(0, 12)
$systemTemp = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$temporaryRoot = Join-Path $systemTemp "forge-gate5c-capsule-$runId"
$encryptedPath = Join-Path $temporaryRoot 'dummy.dpapi'
$cleanupVerified = $false

try {
  New-Item -ItemType Directory -Path $temporaryRoot | Out-Null

  $currentSid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  & icacls.exe $temporaryRoot '/inheritance:r' '/grant:r' "*$currentSid`:(OI)(CI)F" '*S-1-5-18:(OI)(CI)F' | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Unable to restrict the capsule directory ACL.' }

  # Exceeds the current 5.35 MB aggregate history payload before JSON/base64
  # transport overhead, without containing any hosted data.
  $plaintext = [byte[]]::new(8388608)
  [Security.Cryptography.RandomNumberGenerator]::Fill($plaintext)
  $plaintextHash = [Convert]::ToHexString(
    [Security.Cryptography.SHA256]::HashData($plaintext)
  ).ToLowerInvariant()

  $entropy = [byte[]]::new(32)
  [Security.Cryptography.RandomNumberGenerator]::Fill($entropy)
  $protected = [Security.Cryptography.ProtectedData]::Protect(
    $plaintext,
    $entropy,
    [Security.Cryptography.DataProtectionScope]::CurrentUser
  )
  [IO.File]::WriteAllBytes($encryptedPath, $protected)
  [Array]::Clear($plaintext, 0, $plaintext.Length)

  $roundTrip = [Security.Cryptography.ProtectedData]::Unprotect(
    [IO.File]::ReadAllBytes($encryptedPath),
    $entropy,
    [Security.Cryptography.DataProtectionScope]::CurrentUser
  )
  $roundTripHash = [Convert]::ToHexString(
    [Security.Cryptography.SHA256]::HashData($roundTrip)
  ).ToLowerInvariant()
  if ($roundTripHash -ne $plaintextHash) { throw 'DPAPI round-trip hash mismatch.' }

  $acl = Get-Acl -LiteralPath $temporaryRoot
  $aclSids = @($acl.Access | ForEach-Object {
    $_.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value
  } | Sort-Object -Unique)
  $expectedSids = @($currentSid, 'S-1-5-18') | Sort-Object
  if (-not $acl.AreAccessRulesProtected -or
      ($aclSids -join ',') -ne ($expectedSids -join ',')) {
    throw "Unable to verify the restricted capsule ACL: $($aclSids -join ',')"
  }

  [Array]::Clear($roundTrip, 0, $roundTrip.Length)
  [Array]::Clear($protected, 0, $protected.Length)
  [Array]::Clear($entropy, 0, $entropy.Length)

  $result = [ordered]@{
    ok = $true
    schema = 'forge.gate5c-confidential-capsule-test.v1'
    encryption = 'Windows DPAPI CurrentUser'
    plaintextWritten = $false
    roundTripHashMatch = $true
    restrictedAcl = $true
    encryptedBytes = (Get-Item -LiteralPath $encryptedPath).Length
    temporaryPathPattern = 'forge-gate5c-capsule-*'
  }
}
finally {
  $resolved = [IO.Path]::GetFullPath($temporaryRoot)
  if (-not $resolved.StartsWith($systemTemp, [StringComparison]::OrdinalIgnoreCase) -or
      (Split-Path -Leaf $resolved) -notlike 'forge-gate5c-capsule-*') {
    throw "Refusing unsafe temporary cleanup target: $resolved"
  }
  if (Test-Path -LiteralPath $resolved) {
    Remove-Item -LiteralPath $resolved -Recurse -Force
  }
  $cleanupVerified = -not (Test-Path -LiteralPath $resolved)
}

$result.cleanupVerified = $cleanupVerified
$result | ConvertTo-Json -Compress
if (-not $cleanupVerified) { exit 1 }
