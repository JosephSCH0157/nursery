[CmdletBinding()]
param(
  [Parameter(Mandatory)][string]$Workdir
)

$ErrorActionPreference = 'Stop'
$status = (& supabase status --workdir ([IO.Path]::GetFullPath($Workdir)) --output json --agent=no 2>$null | Out-String) | ConvertFrom-Json
$apiUrl = [string]$status.API_URL
$publishableKey = [string]$status.PUBLISHABLE_KEY
if (-not $publishableKey) { $publishableKey = [string]$status.ANON_KEY }
if (-not $apiUrl -or -not $publishableKey) { throw 'Supabase status did not return the local API URL and publishable/anon key.' }

function Invoke-Api([string]$Method,[string]$Path,[string]$Token,[string]$Profile='public',[object]$Body=$null) {
  $headers = @{ apikey=$publishableKey; Authorization="Bearer $Token"; 'Accept-Profile'=$Profile; 'Content-Profile'=$Profile }
  $parameters = @{ Method=$Method; Uri=($apiUrl + $Path); Headers=$headers }
  if ($null -ne $Body) {
    $parameters.ContentType = 'application/json'
    $parameters.Body = ($Body | ConvertTo-Json -Compress)
  }
  Invoke-RestMethod @parameters
}

function Assert-True([bool]$Condition,[string]$Message) {
  if (-not $Condition) { throw $Message }
}

function Assert-Denied([scriptblock]$Request,[string]$Message) {
  try { & $Request | Out-Null }
  catch {
    $statusCode = [int]$_.Exception.Response.StatusCode
    if ($statusCode -in @(401,403,404)) { return }
    throw
  }
  throw $Message
}

$schemaReady = $false
foreach ($attempt in 1..30) {
  try {
    Invoke-WebRequest -Method GET -Uri ($apiUrl + '/rest/v1/') -Headers @{ apikey=$publishableKey; Authorization="Bearer $publishableKey" } | Out-Null
    $schemaReady = $true
    break
  }
  catch {
    if ($attempt -eq 30) { throw }
    Start-Sleep -Milliseconds 500
  }
}
Assert-True $schemaReady 'PostgREST schema cache did not become ready.'

Assert-Denied { Invoke-Api GET '/rest/v1/workspaces?select=id' $publishableKey } 'anon unexpectedly accessed public.workspaces.'

$users = @()
foreach ($ordinal in 1..2) {
  $email = "forge-gate3b-$ordinal-$([guid]::NewGuid().ToString('N'))@example.test"
  $signup = Invoke-Api POST '/auth/v1/signup' $publishableKey 'public' @{ email=$email; password="ForgeGate3B!$ordinal-Verified" }
  Assert-True ([bool]$signup.access_token) "Signup $ordinal did not return an access token."
  $users += [pscustomobject]@{ id=[string]$signup.user.id; token=[string]$signup.access_token }
}

foreach ($user in $users) {
  $profiles = Invoke-Api GET '/rest/v1/profiles?select=id,user_id' $user.token
  Assert-True ($profiles.Count -eq 1 -and [string]$profiles[0].user_id -eq $user.id) 'Profile bootstrap or profile isolation failed through the Data API.'

  $workspaces = Invoke-Api GET '/rest/v1/workspaces?select=id' $user.token
  Assert-True ($workspaces.Count -eq 1) 'Workspace bootstrap or workspace isolation failed through the Data API.'

  $scopeResponse = Invoke-Api GET '/rest/v1/quench_destination_scopes?select=id,workspace_id' $user.token 'tongs'
  $scopes = $scopeResponse
  Assert-True ($scopes.Count -eq 3) "Authenticated Quench capability discovery changed through the Data API (rows=$($scopes.Count), body=$($scopes | ConvertTo-Json -Compress))."
  Assert-True (-not @($scopes | Where-Object { $null -ne $_.workspace_id }).Count) 'Quench baseline unexpectedly exposed a customer-bound destination scope.'
}

[pscustomobject]@{ ok=$true; users=2; isolatedProfiles=2; isolatedWorkspaces=2; globalQuenchScopes=3 } | ConvertTo-Json -Compress
