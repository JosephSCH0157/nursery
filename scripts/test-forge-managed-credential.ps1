$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'lib/forge-managed-credential.ps1')

function Initialize-ForgeCredentialNativeType {}

Add-Type -TypeDefinition @'
namespace Forge {
  public static class WindowsCredentialNative {
    public static string Secret;
    public static int Reads;
    public static bool Exists(string target) { return Secret != null; }
    public static string Read(string target) { Reads++; if (System.String.IsNullOrEmpty(Secret)) throw new System.InvalidOperationException("not enrolled"); return Secret; }
    public static void Write(string target, string userName, string secret) { Secret = secret; }
    public static bool Delete(string target) { bool found = Secret != null; Secret = null; return found; }
  }
}
'@

function Assert-True([bool]$Condition, [string]$Message) { if (-not $Condition) { throw $Message } }
function Assert-Throws([scriptblock]$Operation, [string]$Pattern) {
  try { & $Operation; throw 'Expected operation to fail.' }
  catch { if ($_.Exception.Message -notmatch $Pattern) { throw "Unexpected error: $($_.Exception.Message)" } }
}

$first = ConvertTo-SecureString 'fixture-enrollment-value' -AsPlainText -Force
try { Set-ForgeManagedCredential -Secret $first }
finally { $first.Dispose() }
Assert-True ([Forge.WindowsCredentialNative]::Secret -eq 'fixture-enrollment-value') 'Credential enrollment did not update the managed store.'
$rotated = ConvertTo-SecureString 'fixture-rotation-value' -AsPlainText -Force
try { Set-ForgeManagedCredential -Secret $rotated }
finally { $rotated.Dispose() }
Assert-True ([Forge.WindowsCredentialNative]::Secret -eq 'fixture-rotation-value') 'Credential rotation did not replace the managed value.'
Assert-True (Remove-ForgeManagedCredential) 'Credential revocation did not remove the managed value.'
Assert-True (-not [Forge.WindowsCredentialNative]::Exists('unused')) 'Credential remained after revocation.'

[Forge.WindowsCredentialNative]::Secret = 'fixture-database-password'
$captured = @()
$result = Invoke-WithForgeManagedDatabaseCredential -Operation {
  Assert-True ($env:SUPABASE_DB_PASSWORD -eq 'fixture-database-password') 'Managed credential was not injected.'
  $captured += 'operation-ran'
  return [pscustomobject]@{ok=$true;secretReturned=$false}
}
Assert-True ($result.ok -eq $true) 'Managed operation did not return its result.'
Assert-True ([string]::IsNullOrWhiteSpace($env:SUPABASE_DB_PASSWORD)) 'Managed credential was not cleared after success.'
Assert-True ([Forge.WindowsCredentialNative]::Reads -eq 1) 'Managed credential should be read exactly once.'

[Forge.WindowsCredentialNative]::Secret = 'rotation-value'
Assert-Throws {
  Invoke-WithForgeManagedDatabaseCredential -Operation { throw 'synthetic-operation-failure' }
} 'synthetic-operation-failure'
Assert-True ([string]::IsNullOrWhiteSpace($env:SUPABASE_DB_PASSWORD)) 'Managed credential was not cleared after failure.'

$env:SUPABASE_DB_PASSWORD = 'preexisting-value'
Assert-Throws { Invoke-WithForgeManagedDatabaseCredential -Operation { 'unreachable' } } 'Refusing to overwrite'
Assert-True ($env:SUPABASE_DB_PASSWORD -eq 'preexisting-value') 'Preexisting process credential was modified.'
$env:SUPABASE_DB_PASSWORD = $null

[Forge.WindowsCredentialNative]::Secret = $null
Assert-Throws { Invoke-WithForgeManagedDatabaseCredential -Operation { 'unreachable' } } 'not enrolled'
Assert-True ([string]::IsNullOrWhiteSpace($env:SUPABASE_DB_PASSWORD)) 'Missing credential path left process state behind.'

$source = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'lib/forge-managed-credential.ps1') -Raw
$entrypoint = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'invoke-forge-managed-credential.ps1') -Raw
Assert-True ($source -notmatch 'Write-Host|Write-Output.*secret|ConvertFrom-SecureString') 'Credential library contains a secret-output or persistence primitive.'
Assert-True ($source -notmatch 'SUPABASE_ACCESS_TOKEN') 'Credential library must not create or consume a personal access token.'
Assert-True ($entrypoint -match "Read-Host 'Existing Forge database password' -AsSecureString") 'Enrollment must use a non-echoing secure prompt.'
Assert-True ($entrypoint -notmatch '\[string\]\s*\$Secret|\[Security\.SecureString\]\s*\$Secret') 'Enrollment must not accept the secret as a command argument.'

[pscustomobject]@{
  ok = $true
  schema = 'forge.managed-credential-certification.v1'
  successCleanup = $true
  failureCleanup = $true
  rotationSupported = $true
  revocationSupported = $true
  missingCredentialFailsClosed = $true
  existingProcessSecretProtected = $true
  secretReturned = $false
  hostedRequests = 0
  paidProviderOperations = 0
} | ConvertTo-Json -Compress
