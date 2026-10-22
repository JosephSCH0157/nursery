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
if (-not $query.StartsWith('begin transaction read only;', [StringComparison]::OrdinalIgnoreCase) -or
    $query -notmatch "from supabase_migrations\.schema_migrations" -or
    $query -match '(?i)\b(insert|update|delete|merge|alter|create|drop|truncate|grant|revoke|copy)\b') {
  throw 'Gate 5D export SQL is not the approved read-only query.'
}
$exporter = Get-Content -LiteralPath (Join-Path $repo 'scripts/export-gate5d-authentic-history.ps1') -Raw
foreach ($required in @("read_only=`$true",'FORGE_GATE5D_DATABASE_READ_TOKEN','sbp_fc','AuthorizeAuthenticExport')) {
  if (-not $exporter.Contains($required,[StringComparison]::Ordinal)) { throw "Gate 5D exporter guard is missing: $required" }
}
[pscustomobject]@{
  ok=$true; schema=$manifest.schema; fileCount=@($manifest.files).Count
  authenticRequestMade=$false
} | ConvertTo-Json -Compress
