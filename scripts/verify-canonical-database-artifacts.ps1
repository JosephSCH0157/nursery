[CmdletBinding()]
param(
  [string]$RepositoryRoot = (Split-Path -Parent $PSScriptRoot),
  [switch]$Json
)

$ErrorActionPreference = 'Stop'
$repo = [IO.Path]::GetFullPath($RepositoryRoot)
$failures = [System.Collections.Generic.List[string]]::new()

function Assert-FileHash([string]$RelativePath,[string]$ExpectedSha256) {
  $path = Join-Path $repo $RelativePath
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
    $failures.Add("Missing frozen artifact: $RelativePath")
    return
  }
  $actual = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($actual -cne $ExpectedSha256) { $failures.Add("Frozen artifact changed: $RelativePath") }
}

& (Join-Path $PSScriptRoot 'verify-historical-migration-manifest.ps1') -RepositoryRoot $repo | Out-Null

Assert-FileHash 'docs/database/baseline/v1-gate1/historical-migrations.sha256.json' '66a094037af456e95b34ec0ca3fb18bcc791d296fa6c2619af9639a87f7d7f40'
Assert-FileHash 'database/canonical-baseline-v1/supabase/migrations/20261021020814_canonical_baseline_v1.sql' '73d2779c406b9428e7fdf189ab7ad084671cf1d03908041dbbe855816556c62e'
Assert-FileHash 'docs/database/baseline/v1-gate3/canonical-baseline-v1.manifest.json' 'f0eaf080270dde1df59a77fb075f8e363d06ad46a67c0b12dcb84220c258f4c3'
Assert-FileHash 'docs/database/baseline/v1-gate3/canonical-application-catalog-fingerprint.json' 'abeb5876b1acf0b23d6be8594c788e1fe700fe5c1abe44755ea1cf431c2ca3d7'
Assert-FileHash 'docs/database/baseline/v1-gate3/wrappers-extension-compatibility.json' '8b82e58a85b835641c42738a51e695b05b4c7871ae922a48dd192dca303defc1'

$compatibilityPath = Join-Path $repo 'docs/database/baseline/v1-gate3/wrappers-extension-compatibility.json'
if (Test-Path -LiteralPath $compatibilityPath) {
  $compatibility = Get-Content -LiteralPath $compatibilityPath -Raw | ConvertFrom-Json
  if ($compatibility.extension -ne 'wrappers' -or
      $compatibility.environments.linked.requiredVersion -ne '0.5.6' -or
      $compatibility.environments.local.requiredVersion -ne '0.5.7' -or
      $compatibility.rejectAllOtherVersions -ne $true) {
    $failures.Add('The frozen wrappers compatibility exception changed.')
  }
}

$baselineMigrations = @(Get-ChildItem -LiteralPath (Join-Path $repo 'database/canonical-baseline-v1/supabase/migrations') -Filter '*.sql' -File)
$baselineEpoch = @($baselineMigrations | Where-Object { $_.BaseName -match '^(?<version>\d{14})_' -and $Matches.version -ge '20261021000000' -and $Matches.version -le '20261021235959' })
if ($baselineEpoch.Count -ne 1 -or $baselineEpoch[0].Name -ne '20261021020814_canonical_baseline_v1.sql') {
  $failures.Add('The immutable baseline epoch must contain exactly the approved baseline migration.')
}

$rootMigrations = @(Get-ChildItem -LiteralPath (Join-Path $repo 'supabase/migrations') -Filter '*.sql' -File)
foreach ($migration in $rootMigrations) {
  if ($migration.BaseName -notmatch '^(?<version>\d{8,14})_') { $failures.Add("Invalid migration filename: $($migration.Name)"); continue }
  $version = $Matches.version
  if ($version -ge '20261021000000' -and $version -le '20261021235959') {
    $failures.Add("Historical workdir contains reserved baseline version: $version")
  }
}

$result = [ordered]@{
  ok = ($failures.Count -eq 0)
  historicalMigrationCount = 414
  baselineMigrationSha256 = '73d2779c406b9428e7fdf189ab7ad084671cf1d03908041dbbe855816556c62e'
  wrappersCompatibilitySha256 = '8b82e58a85b835641c42738a51e695b05b4c7871ae922a48dd192dca303defc1'
  failures = @($failures)
}
if ($Json) { $result | ConvertTo-Json -Depth 4 } else { $result | ConvertTo-Json -Compress }
if (-not $result.ok) { throw "Canonical database artifact verification failed: $($failures -join '; ')" }
