[CmdletBinding()]
param(
  [Parameter(Mandatory)][ValidateSet('Enroll','Rotate','Status','Revoke')][string]$Action,
  [string]$Authorization,
  [string]$RepositoryRoot = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'lib/forge-managed-credential.ps1')

$target = Get-ForgeDatabaseCredentialTarget
switch ($Action) {
  'Status' {
    [pscustomobject]@{
      ok = $true
      schema = 'forge.managed-credential-status.v1'
      target = $target
      enrolled = [bool](Test-ForgeManagedCredential -Target $target)
      secretReturned = $false
    } | ConvertTo-Json -Compress
  }
  { $_ -in @('Enroll','Rotate') } {
    if ($Authorization -cne 'ENROLL-FORGE-DATABASE-CREDENTIAL') {
      throw 'Exact credential-enrollment authorization is required.'
    }
    $exists = Test-ForgeManagedCredential -Target $target
    if ($Action -eq 'Enroll' -and $exists) { throw 'Forge database credential is already enrolled; use Rotate.' }
    if ($Action -eq 'Rotate' -and -not $exists) { throw 'Forge database credential is not enrolled; use Enroll.' }
    $secret = Read-Host 'Existing Forge database password' -AsSecureString
    try {
      Set-ForgeManagedCredential -Target $target -Secret $secret
    } finally {
      $secret.Dispose()
    }
    [pscustomobject]@{
      ok = $true
      schema = 'forge.managed-credential-change.v1'
      action = $Action.ToLowerInvariant()
      target = $target
      secretReturned = $false
    } | ConvertTo-Json -Compress
  }
  'Revoke' {
    if ($Authorization -cne 'REVOKE-FORGE-DATABASE-CREDENTIAL') {
      throw 'Exact credential-revocation authorization is required.'
    }
    [pscustomobject]@{
      ok = $true
      schema = 'forge.managed-credential-change.v1'
      action = 'revoke'
      target = $target
      removed = [bool](Remove-ForgeManagedCredential -Target $target)
      secretReturned = $false
    } | ConvertTo-Json -Compress
  }
}
