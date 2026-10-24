[CmdletBinding()]
param([string]$RepositoryRoot)

$ErrorActionPreference = 'Stop'
$repo = [IO.Path]::GetFullPath($(if ($RepositoryRoot) { $RepositoryRoot } else { Split-Path -Parent $PSScriptRoot }))
$manifestPath = Join-Path $repo 'docs/database/baseline/v1-gate5d/tooling.sha256.json'
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
if ($manifest.schema -ne 'forge.gate5d-tooling-manifest.v1') { throw 'Unexpected Gate 5D tooling manifest.' }
foreach ($file in $manifest.files) {
  $path = Join-Path $repo ([string]$file.path)
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Gate 5D tooling file is missing: $($file.path)" }
  $actual = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($actual -cne [string]$file.sha256) { throw "Gate 5D tooling hash changed: $($file.path)" }
}
$query = Get-Content -LiteralPath (Join-Path $repo 'supabase/tests/catalog/gate5d_authentic_history_export.sql') -Raw
$contract = Get-Content -LiteralPath (Join-Path $repo 'docs/database/baseline/v1-gate5d/authentic-history-contract.json') -Raw | ConvertFrom-Json
$queryHash = (Get-FileHash -LiteralPath (Join-Path $repo 'supabase/tests/catalog/gate5d_authentic_history_export.sql') -Algorithm SHA256).Hash.ToLowerInvariant()
if (-not $query.StartsWith('begin transaction read only;', [StringComparison]::OrdinalIgnoreCase) -or
    $query -notmatch "from supabase_migrations\.schema_migrations" -or
    $query -match '(?i)\b(insert|update|delete|merge|alter|create|drop|truncate|grant|revoke|copy)\b') {
  throw 'Gate 5D export SQL is not the approved read-only query.'
}
if ($queryHash -cne [string]$contract.managementApi.querySha256 -or
    (@($contract.history.columns) -join ',') -cne 'version,statements,name,created_by,idempotency_key,rollback' -or
    $contract.managementApi.origin -cne 'https://api.supabase.com' -or
    $contract.managementApi.pathTemplate -cne '/v1/projects/{ref}/database/query' -or
    $contract.managementApi.method -cne 'POST' -or
    $contract.managementApi.readOnlyRequestProperty -ne $true) {
  throw 'Gate 5D Management API or exact-query contract changed.'
}
$exporter = Get-Content -LiteralPath (Join-Path $repo 'scripts/export-gate5d-authentic-history.ps1') -Raw
foreach ($required in @("read_only=`$true",'FORGE_GATE5D_DATABASE_READ_TOKEN','sbp_fc','AuthorizeAuthenticExport',
    'https://api.supabase.com/v1/projects/$ProjectRef/database/query','querySha256','SUPABASE_ACCESS_TOKEN','SUPABASE_DB_PASSWORD')) {
  if (-not $exporter.Contains($required,[StringComparison]::Ordinal)) { throw "Gate 5D exporter guard is missing: $required" }
}
if ($exporter -match '(?i)\b(Query|Sql|Endpoint|Uri)Override\b|supabase\s+(login|link|db\s+dump)') {
  throw 'Gate 5D exporter contains an arbitrary-query/endpoint or privileged-CLI fallback.'
}
$dedicatedQueryPath = Join-Path $repo 'supabase/tests/catalog/gate5d_authentic_history_export_read_only.sql'
$dedicatedQuery = Get-Content -LiteralPath $dedicatedQueryPath -Raw
$dedicatedHash = (Get-FileHash -LiteralPath $dedicatedQueryPath -Algorithm SHA256).Hash.ToLowerInvariant()
$dedicated = $contract.dedicatedReadOnlyManagementApi
if ($dedicatedHash -cne [string]$dedicated.querySha256 -or
    $dedicated.origin -cne 'https://api.supabase.com' -or
    $dedicated.pathTemplate -cne '/v1/projects/{ref}/database/query/read-only' -or
    $dedicated.method -cne 'POST' -or
    $dedicated.executionRole -cne 'supabase_read_only_user' -or
    $dedicated.requiredFineGrainedPermission -cne 'database_read' -or
    $dedicated.requestHasReadOnlyProperty -ne $false -or
    $dedicated.documentedSuccessStatus -ne 201 -or
    $dedicated.hostedTableAccessVerified -ne $false) {
  throw 'Gate 5D dedicated read-only endpoint contract changed.'
}
if (-not $dedicatedQuery.TrimStart().StartsWith('with history as materialized',[StringComparison]::OrdinalIgnoreCase) -or
    $dedicatedQuery -notmatch 'from\s+supabase_migrations\.schema_migrations' -or
    ([regex]::Matches($dedicatedQuery,';')).Count -ne 1 -or
    $dedicatedQuery -match '(?im)^\s*(begin|commit|rollback|set|insert|update|delete|merge|alter|create|drop|truncate|grant|revoke|copy|call|do)\b') {
  throw 'Gate 5D dedicated export is not the approved single read-only SELECT.'
}
$dedicatedExporter = Get-Content -LiteralPath (Join-Path $repo 'scripts/export-gate5d-authentic-history-read-only.ps1') -Raw
foreach ($required in @('https://api.supabase.com/v1/projects/$ProjectRef/database/query/read-only',
    'FORGE_GATE5D_DATABASE_READ_TOKEN','sbp_fc','AuthorizeAuthenticExport','supabase_read_only_user',
    "[ordered]@{ query=`$query; parameters=@() }",'tokenExpiresAtUtc','maximumResponseBytes',
    'MaxResponseContentBufferSize',"SetEnvironmentVariable('FORGE_GATE5D_DATABASE_READ_TOKEN',`$null,'Process')")) {
  if (-not $dedicatedExporter.Contains($required,[StringComparison]::Ordinal)) { throw "Dedicated Gate 5D exporter guard is missing: $required" }
}
if ($dedicatedExporter -match '(?i)\b(Query|Sql|Endpoint|Uri)Override\b|supabase\s+(login|link|db\s+dump)' -or
    $dedicatedExporter -match 'read_only\s*=') {
  throw 'Dedicated Gate 5D exporter contains an override, generic body flag, or privileged-CLI fallback.'
}
$probePath = Join-Path $repo 'supabase/tests/catalog/gate5d_read_only_endpoint_probe.sql'
$probe = Get-Content -LiteralPath $probePath -Raw
$probeHash = (Get-FileHash -LiteralPath $probePath -Algorithm SHA256).Hash.ToLowerInvariant()
if (($probeHash -cne 'd9bf4e0257583e7c8ec865bac73d28f4fbd84ee59197e3867f75d844c6b248fb') -or
    ($probe -notmatch 'where\s+false') -or
    ($probe -notmatch 'from\s+supabase_migrations\.schema_migrations') -or
    ([regex]::Matches($probe,';')).Count -ne 1 -or
    $probe -match '(?im)^\s*(begin|commit|rollback|set|insert|update|delete|merge|alter|create|drop|truncate|grant|revoke|copy|call|do)\b') {
  throw 'Gate 5D dedicated endpoint probe is not the approved zero-row SELECT.'
}
$gate5eRunner = Get-Content -LiteralPath (Join-Path $repo 'scripts/invoke-gate5e-read-only-probe.ps1') -Raw
foreach ($required in @(
    'https://api.supabase.com/v1/projects/$ProjectRef/database/query/read-only',
    'd9bf4e0257583e7c8ec865bac73d28f4fbd84ee59197e3867f75d844c6b248fb',
    'gate5d_read_only_endpoint_probe.sql','FORGE_GATE5D_DATABASE_READ_TOKEN','AuthorizeHostedProbe',
    'tokenExpiresAtUtc','projectRefSha256Allowlist',"permissions) -join ',') -cne 'database_read'",
    "SetEnvironmentVariable(`$tokenName, `$null, 'Process')")) {
  if (-not $gate5eRunner.Contains($required, [StringComparison]::Ordinal)) {
    throw "Gate 5E runner guard is missing: $required"
  }
}
if ($gate5eRunner -match 'export-gate5d-authentic-history|gate5d_authentic_history_export|(?i)\b(Query|Sql|Endpoint|Uri)Override\b|supabase\s+(login|link|db\s+dump|migration|db\s+push)') {
  throw 'Gate 5E runner contains a full-history, override, privileged-CLI, or migration path.'
}
$gate5ePreparation = Get-Content -LiteralPath (Join-Path $repo 'scripts/prepare-gate5e-owner-attestation.ps1') -Raw
foreach ($required in @('-AsSecureString',"SetEnvironmentVariable(`$tokenName, `$plainToken, 'Process')",'tokenExpiresAtUtc',
    "permissions = @('database_read')",'New-ForgeGate5DRestrictedDirectory','ZeroFreeBSTR')) {
  if (-not $gate5ePreparation.Contains($required, [StringComparison]::Ordinal)) {
    throw "Gate 5E owner-preparation guard is missing: $required"
  }
}
if ($gate5ePreparation -match '(?i)param\([^)]*(token|pat|secret)' -or
    $gate5ePreparation -match 'SetEnvironmentVariable\([^,]+,[^,]+,\s*["''](?:User|Machine)["'']') {
  throw 'Gate 5E owner preparation accepts a token argument or persists a credential outside process scope.'
}
$gate5fCoordinator = Get-Content -LiteralPath (Join-Path $repo 'scripts/invoke-gate5f-authentic-history-certification.ps1') -Raw
foreach($required in @(
    "[ValidateSet('StageASynthetic','Authentic')]",'AuthorizeAuthenticHistoryTransfer',
    'export-gate5d-authentic-history-read-only.ps1','HistoryMode ExternalAuthentic',
    'HistoryMode SharedSynthetic','Remove-ForgeGate5DCapsule',
    "SetEnvironmentVariable('FORGE_GATE5D_DATABASE_READ_TOKEN',`$null,'Process')")) {
  if(-not $gate5fCoordinator.Contains($required,[StringComparison]::Ordinal)){throw "Gate 5F coordinator guard is missing: $required"}
}
if($gate5fCoordinator -match 'export-gate5d-authentic-history\.ps1|/database/query["'']|(?i)\b(Query|Sql|Endpoint|Uri)Override\b|supabase\s+(login|link|db\s+dump|migration\s+repair|db\s+push\s+--linked)'){
  throw 'Gate 5F coordinator contains a generic exporter, override, privileged fallback, or hosted migration path.'
}
[pscustomobject]@{
  ok=$true; schema=$manifest.schema; fileCount=@($manifest.files).Count
  dedicatedReadOnly=$true; gate5eProbe=$true; gate5fCoordinator=$true; authenticRequestMade=$false; hostedProbeMade=$false
} | ConvertTo-Json -Compress
