[CmdletBinding()]
param(
  [Parameter(Mandatory)][ValidateSet('Enroll','Rotate','Status','Revoke')][string]$Action,
  [string]$Authorization
)

$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'lib/forge-managed-credential.ps1')
$targets=[ordered]@{
  netlify=Get-ForgeNetlifyCapacityReadCredentialTarget
  supabase=Get-ForgeSupabaseCapacityReadCredentialTarget
}
if($Action -eq 'Status'){
  [pscustomobject]@{ok=$true;schema='forge.hammer-capacity-read-credential-status.v1';netlifyEnrolled=[bool](Test-ForgeManagedCredential -Target $targets.netlify);supabaseEnrolled=[bool](Test-ForgeManagedCredential -Target $targets.supabase);secretReturned=$false}|ConvertTo-Json -Compress
  exit 0
}
if($Action -in @('Enroll','Rotate')){
  if($Authorization -cne 'ENROLL-HAMMER-CAPACITY-READ-CREDENTIALS'){throw 'Exact capacity-read credential enrollment authorization is required.'}
  $existing=[ordered]@{netlify=[bool](Test-ForgeManagedCredential -Target $targets.netlify);supabase=[bool](Test-ForgeManagedCredential -Target $targets.supabase)}
  if($Action -eq 'Enroll' -and ($existing.netlify -or $existing.supabase)){throw 'A capacity-read credential is already enrolled; use Rotate.'}
  if($Action -eq 'Rotate' -and (-not $existing.netlify -or -not $existing.supabase)){throw 'Both capacity-read credentials must be enrolled before Rotate.'}
  $netlify=Read-Host 'Netlify account-read access token' -AsSecureString
  $supabase=Read-Host 'Supabase organization billing-read access token' -AsSecureString
  try{
    Set-ForgeManagedCredential -Target $targets.netlify -UserName 'netlify-capacity-reader' -Secret $netlify
    Set-ForgeManagedCredential -Target $targets.supabase -UserName 'supabase-capacity-reader' -Secret $supabase
  }finally{$netlify.Dispose();$supabase.Dispose()}
  [pscustomobject]@{ok=$true;schema='forge.hammer-capacity-read-credential-change.v1';action=$Action.ToLowerInvariant();secretReturned=$false}|ConvertTo-Json -Compress
  exit 0
}
if($Authorization -cne 'REVOKE-HAMMER-CAPACITY-READ-CREDENTIALS'){throw 'Exact capacity-read credential revocation authorization is required.'}
[pscustomobject]@{ok=$true;schema='forge.hammer-capacity-read-credential-change.v1';action='revoke';netlifyRemoved=[bool](Remove-ForgeManagedCredential -Target $targets.netlify);supabaseRemoved=[bool](Remove-ForgeManagedCredential -Target $targets.supabase);secretReturned=$false}|ConvertTo-Json -Compress
