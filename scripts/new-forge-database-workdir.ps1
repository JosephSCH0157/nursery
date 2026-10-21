[CmdletBinding()]
param(
  [Parameter(Mandatory)][string]$OutputPath,
  [Parameter(Mandatory)][ValidatePattern('^[a-z0-9][a-z0-9-]{2,62}$')][string]$ProjectId,
  [ValidateRange(1025,65000)][int]$ApiPort = 55321,
  [string]$SiteUrl = 'http://127.0.0.1:3000',
  [Parameter(Mandatory)][ValidateSet('baseline')][string]$Lineage,
  [string]$RepositoryRoot = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = 'Stop'
$repo = [IO.Path]::GetFullPath($RepositoryRoot)
$output = [IO.Path]::GetFullPath($OutputPath)
if (Test-Path -LiteralPath $output) { throw "Refusing to reuse database workdir: $output" }
if ($ApiPort -lt 1026 -or $ApiPort -gt 64998) { throw 'ApiPort must leave room for the database and shadow ports.' }

& (Join-Path $PSScriptRoot 'verify-canonical-database-artifacts.ps1') -RepositoryRoot $repo | Out-Null

$source = Join-Path $repo 'database/canonical-baseline-v1'
New-Item -ItemType Directory -Path (Join-Path $output 'supabase/migrations') -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $source '.forge-database-lineage.json') -Destination $output

$config = Get-Content -LiteralPath (Join-Path $source 'supabase/config.toml') -Raw
$config = [regex]::Replace($config, '(?m)^project_id\s*=\s*"[^"]+"', "project_id = `"$ProjectId`"")
$config = [regex]::Replace($config, '(?m)^port\s*=\s*55321$', "port = $ApiPort")
$config = [regex]::Replace($config, '(?m)^port\s*=\s*55322$', "port = $($ApiPort + 1)")
$config = [regex]::Replace($config, '(?m)^shadow_port\s*=\s*55320$', "shadow_port = $($ApiPort - 1)")
$config = [regex]::Replace($config, '(?m)^site_url\s*=\s*"[^"]+"', "site_url = `"$SiteUrl`"")
$config = [regex]::Replace($config, '(?m)^additional_redirect_urls\s*=.*$', "additional_redirect_urls = [`"$SiteUrl/auth/callback`"]")
[IO.File]::WriteAllText((Join-Path $output 'supabase/config.toml'), $config, [Text.UTF8Encoding]::new($false))

foreach ($migration in (Get-ChildItem -LiteralPath (Join-Path $source 'supabase/migrations') -Filter '*.sql' -File)) {
  Copy-Item -LiteralPath $migration.FullName -Destination (Join-Path $output 'supabase/migrations')
}
foreach ($migration in (Get-ChildItem -LiteralPath (Join-Path $repo 'supabase/migrations') -Filter '*.sql' -File | Sort-Object Name)) {
  if ($migration.BaseName -notmatch '^(?<version>\d{8,14})_') { throw "Invalid migration filename: $($migration.Name)" }
  if ($Matches.version -ge '20261022000000') {
    Copy-Item -LiteralPath $migration.FullName -Destination (Join-Path $output 'supabase/migrations')
  }
}

$templates = Join-Path $repo 'supabase/templates'
if (Test-Path -LiteralPath $templates -PathType Container) {
  Copy-Item -LiteralPath $templates -Destination (Join-Path $output 'supabase') -Recurse
}

& (Join-Path $PSScriptRoot 'verify-supabase-lineage.ps1') -Lineage baseline -Workdir $output -DatabaseTarget none -Mode bootstrap -RepositoryRoot $repo | Out-Null

[pscustomobject]@{
  ok = $true
  lineage = 'baseline-v1'
  workdir = $output
  projectId = $ProjectId
  migrationCount = @(Get-ChildItem -LiteralPath (Join-Path $output 'supabase/migrations') -Filter '*.sql' -File).Count
  cliVersion = (& supabase --version 2>$null | Select-Object -First 1).Trim()
} | ConvertTo-Json -Compress
