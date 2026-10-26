[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)]
  [string]$SupabaseWorkdir
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$workdir = [System.IO.Path]::GetFullPath((Join-Path $repoRoot $SupabaseWorkdir))
if (-not $workdir.StartsWith($repoRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw 'Supabase workdir must remain inside the canonical repository.'
}

$status = (& npx supabase status --workdir $workdir -o json | ConvertFrom-Json)
if ($LASTEXITCODE -ne 0) {
  throw 'Unable to read disposable Supabase status.'
}

$email = 'slice-a-data-api-' + [guid]::NewGuid().ToString('N') + '@example.invalid'
$signupBody = @{ email = $email; password = 'SliceA!Test12345' } | ConvertTo-Json -Compress
$signup = Invoke-RestMethod -Method Post -Uri ($status.API_URL + '/auth/v1/signup') `
  -Headers @{ apikey = $status.ANON_KEY; 'Content-Type' = 'application/json' } `
  -Body $signupBody
if ([string]::IsNullOrWhiteSpace($signup.access_token)) {
  throw 'Data API test signup did not return an access token.'
}

$userHeaders = @{
  apikey = $status.ANON_KEY
  Authorization = 'Bearer ' + $signup.access_token
}
$profiles = Invoke-RestMethod -Method Get -Uri ($status.REST_URL + '/profiles?select=user_id,email') -Headers $userHeaders
if (@($profiles).Count -ne 1 -or [string]@($profiles)[0].user_id -ne [string]$signup.user.id) {
  throw 'Authenticated Data API profile visibility changed.'
}

$workspaces = Invoke-RestMethod -Method Get -Uri ($status.REST_URL + '/workspaces?select=id,name') -Headers $userHeaders
if (@($workspaces).Count -ne 1) {
  throw 'Authenticated Data API workspace visibility changed.'
}

$pairs = Invoke-RestMethod -Method Get -Uri ($status.REST_URL + '/display_pair_sessions?select=id') -Headers $userHeaders
if ($null -ne $pairs -and @($pairs).Count -ne 0) {
  throw 'Authenticated Data API unexpectedly sees pairing rows.'
}

$anonProfiles = Invoke-RestMethod -Method Get -Uri ($status.REST_URL + '/profiles?select=user_id') `
  -Headers @{ apikey = $status.ANON_KEY }
if ($null -ne $anonProfiles -and @($anonProfiles).Count -ne 0) {
  throw 'Anonymous Data API unexpectedly sees profiles.'
}

$anonWorkspaceDenied = $false
try {
  Invoke-WebRequest -Method Get -Uri ($status.REST_URL + '/workspaces?select=id') `
    -Headers @{ apikey = $status.ANON_KEY } -ErrorAction Stop | Out-Null
}
catch {
  if ($_.Exception.Response.StatusCode.value__ -in 401, 403) {
    $anonWorkspaceDenied = $true
  }
  else {
    throw
  }
}
if (-not $anonWorkspaceDenied) {
  throw 'Anonymous Data API workspace access was not denied.'
}

$serviceEvents = Invoke-WebRequest -Method Get -Uri ($status.REST_URL + '/stripe_event_log?select=*&limit=1') `
  -Headers @{
    apikey = $status.SERVICE_ROLE_KEY
    Authorization = 'Bearer ' + $status.SERVICE_ROLE_KEY
  }
if ($serviceEvents.StatusCode -ne 200) {
  throw 'Service role lost Stripe event compatibility.'
}

Write-Output 'FORGE_PUBLIC_SLICE_A_DATA_API_PASSED'
