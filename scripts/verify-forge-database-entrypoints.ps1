[CmdletBinding()]
param([string]$RepositoryRoot = (Split-Path -Parent $PSScriptRoot))

$ErrorActionPreference = 'Stop'
$repo = [IO.Path]::GetFullPath($RepositoryRoot)
$failures = [System.Collections.Generic.List[string]]::new()
$workflowFiles = @(Get-ChildItem -LiteralPath (Join-Path $repo '.github/workflows') -Filter '*.yml' -File)
$workflowText = ($workflowFiles | ForEach-Object { Get-Content -LiteralPath $_.FullName -Raw }) -join "`n"
$package = Get-Content -LiteralPath (Join-Path $repo 'package.json') -Raw | ConvertFrom-Json

if ($workflowText -match '(?m)^\s*run:\s*supabase\s+(start|db\s+reset|migration\s+up|db\s+push)\b') {
  $failures.Add('A workflow contains a raw state-changing Supabase entrypoint.')
}
foreach ($match in [regex]::Matches($workflowText, '(?s)supabase/setup-cli@v1.{0,180}?version:\s*([^\s#]+)')) {
  $configuredVersion = $match.Groups[1].Value.Trim('''','"')
  if ($configuredVersion -cne '2.84.2') {
    $failures.Add("A workflow uses unapproved Supabase CLI version '$configuredVersion'.")
  }
}
if ($workflowText -match '--include-all|migration\s+repair') {
  $failures.Add('A workflow uses prohibited migration-history behavior.')
}
if ([string]$package.devDependencies.supabase -cne '2.84.2') {
  $failures.Add('package.json must pin the Supabase CLI package exactly to 2.84.2.')
}
if ([string]$package.scripts.'supabase:types' -notmatch 'generate-forge-database-types\.ps1\s+-Lineage\s+baseline') {
  $failures.Add('Type generation is not routed through an explicit certified baseline lineage.')
}
if ([string]$package.scripts.'supabase:types' -match '--project-id|--linked') {
  $failures.Add('Type generation still targets a hosted database.')
}
if ([string]$package.scripts.'certify:db:gate6o-successor' -notmatch 'certify-gate6h-successor\.ps1') {
  $failures.Add('Gate 6O historical successor certification is not routed through the approved two-lineage harness.')
}
if ([string]$package.scripts.'certify:db:gate6o-browser' -notmatch 'certify-gate6o-browser\.ps1') {
  $failures.Add('Gate 6O authenticated browser certification is not routed through its isolated baseline harness.')
}

$approvedExecutablePaths = @(
  '.github/workflows/pr-smoke.yml',
  'package.json',
  'scripts/invoke-forge-database.ps1',
  'scripts/new-forge-database-workdir.ps1',
  'scripts/generate-forge-database-types.ps1',
  'scripts/certify-canonical-baseline-v1.ps1'
  'scripts/certify-gate6h-successor.ps1'
  'scripts/certify-gate6o-browser.ps1'
)
foreach ($relativePath in $approvedExecutablePaths) {
  $path = Join-Path $repo $relativePath
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { $failures.Add("Missing database entrypoint: $relativePath"); continue }
  $text = Get-Content -LiteralPath $path -Raw
  if ($text -match '--include-all|migration\s+repair') { $failures.Add("Prohibited migration-history operation in $relativePath") }
}

$result = [ordered]@{
  ok = ($failures.Count -eq 0)
  requiredSupabaseCliVersion = '2.84.2'
  auditedEntrypoints = $approvedExecutablePaths
  failures = @($failures)
}
$result | ConvertTo-Json -Depth 4
if (-not $result.ok) { throw "Database entrypoint verification failed: $($failures -join '; ')" }
