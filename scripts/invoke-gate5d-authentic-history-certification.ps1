[CmdletBinding()]
param(
  [ValidateSet('Stage1Synthetic','Authentic')][string]$Mode = 'Stage1Synthetic',
  [string]$CapsuleDirectory,
  [string]$ProjectId,
  [string]$Workdir,
  [switch]$AuthorizeAuthenticCertification,
  [string]$RepositoryRoot
)

$ErrorActionPreference = 'Stop'
$repo = [IO.Path]::GetFullPath($(if ($RepositoryRoot) { $RepositoryRoot } else { Split-Path -Parent $PSScriptRoot }))
$requiredCli = '2.84.2'
$actualCli = (& supabase --version 2>$null | Select-Object -First 1).Trim()
if ($actualCli -ne $requiredCli) { throw "Supabase CLI $requiredCli is required; found $actualCli." }
& (Join-Path $PSScriptRoot 'verify-canonical-database-artifacts.ps1') -RepositoryRoot $repo | Out-Null
& (Join-Path $PSScriptRoot 'verify-pre-slice-a-fixture.ps1') -RepositoryRoot $repo | Out-Null
& (Join-Path $PSScriptRoot 'verify-gate5d-authentic-history-tooling.ps1') -RepositoryRoot $repo | Out-Null

function ConvertFrom-LastJson([object[]]$Output) {
  $line = @($Output | ForEach-Object { [string]$_ } | Where-Object { $_.TrimStart().StartsWith('{') })[-1]
  if (-not $line) { throw 'Certification child process did not return a JSON result.' }
  return $line | ConvertFrom-Json
}

if ($Mode -eq 'Stage1Synthetic') {
  $tooling = ConvertFrom-LastJson @(& (Join-Path $PSScriptRoot 'test-gate5d-authentic-history-tooling.ps1') -RepositoryRoot $repo)
  if (-not $tooling.ok -or $tooling.authenticRequestMade) { throw 'Gate 5D component tests failed or made an authentic request.' }
  $dedicatedReadOnly = ConvertFrom-LastJson @(& (Join-Path $PSScriptRoot 'test-gate5d-read-only-endpoint-adapter.ps1') -RepositoryRoot $repo)
  if (-not $dedicatedReadOnly.ok -or $dedicatedReadOnly.hostedRequestMade) { throw 'Gate 5D dedicated read-only adapter tests failed or made a hosted request.' }
  $integrated = ConvertFrom-LastJson @(& (Join-Path $PSScriptRoot 'certify-gate5d-integrated-synthetic.ps1') -RepositoryRoot $repo)
  if (-not $integrated.ok -or $integrated.authenticRequestMade -or @($integrated.lanes).Count -ne 2) { throw 'Integrated Gate 5D synthetic certification failed.' }
  [pscustomobject]@{
    ok=$true; schema='forge.gate5d-stage1b-certification.v1'; syntheticOnly=$true
    authenticRequestMade=$false; cliVersion=$actualCli; tooling=$tooling
    dedicatedReadOnly=$dedicatedReadOnly; integrated=$integrated
  } | ConvertTo-Json -Depth 8 -Compress
  exit 0
}

if (-not $AuthorizeAuthenticCertification) { throw 'Authentic certification requires separate owner authorization.' }
if (-not $CapsuleDirectory -or -not $ProjectId -or -not $Workdir) { throw 'Authentic certification requires an encrypted capsule and a prepared task-created disposable target.' }

$restore = & (Join-Path $PSScriptRoot 'restore-gate5d-authentic-history.ps1') `
  -CapsuleDirectory $CapsuleDirectory -ProjectId $ProjectId -Workdir $Workdir -RepositoryRoot $repo | ConvertFrom-Json
if (-not $restore.ok -or $restore.rowCount -ne 411) { throw 'Authentic history restoration failed.' }

$migrationDir = Join-Path $Workdir 'supabase/migrations'
if (@(Get-ChildItem -LiteralPath $migrationDir -Filter '*.sql' -File -ErrorAction SilentlyContinue).Count -ne 0) {
  throw 'Prepared disposable migration directory is not empty.'
}
Copy-Item -Path (Join-Path $repo 'supabase/migrations/*.sql') -Destination $migrationDir
$contract = Get-Content -LiteralPath (Join-Path $repo 'docs/database/baseline/v1-gate2/lineage-contract.json') -Raw | ConvertFrom-Json
$contract.historical.rootWorkdir = $Workdir
$contract.historical.manifestPath = Join-Path $repo 'docs/database/baseline/v1-gate1/historical-migrations.sha256.json'
$contract.sharedTail.canonicalMigrationsDirectory = Join-Path $repo 'supabase/migrations'
$configurationPath = Join-Path (Split-Path -Parent $Workdir) 'gate5d-lineage-contract.json'
[IO.File]::WriteAllText($configurationPath,($contract | ConvertTo-Json -Depth 10),[Text.UTF8Encoding]::new($false))
$preflight = & (Join-Path $PSScriptRoot 'verify-supabase-lineage.ps1') -Lineage historical -Workdir $Workdir -DatabaseTarget local -Mode preflight -ConfigurationPath $configurationPath -RepositoryRoot $repo | ConvertFrom-Json
if (-not $preflight.ok -or $preflight.databaseState -ne 'historical-preflight') { throw 'Restored target was not recognized as historical preflight.' }
$dryRun = (& supabase db push --local --dry-run --workdir $Workdir --agent=no 2>&1 | Out-String)
if ($LASTEXITCODE -ne 0) { throw 'Normal CLI pending-migration discovery failed; output suppressed.' }
$pending = @([regex]::Matches($dryRun,'(?m)2026\d{10}') | ForEach-Object Value | Select-Object -Unique)
$expected = @('20261020171517','20261020171519','20261020171522','20261022000000')
if (($pending -join ',') -ne ($expected -join ',')) { throw 'Normal CLI discovery did not find exactly the approved four migrations.' }
$upgrade = (& supabase migration up --local --workdir $Workdir --yes --agent=no 2>&1 | Out-String)
if ($LASTEXITCODE -ne 0) { throw 'Normal CLI four-migration upgrade failed; output suppressed.' }

$container = "supabase_db_$ProjectId"
foreach ($test in @('supabase/tests/public_slice_a_catalog_parity.sql','supabase/tests/public_slice_a_security_behavior.sql')) {
  $sql = Get-Content -LiteralPath (Join-Path $repo $test) -Raw
  $null = ($sql | & docker exec -i $container psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres 2>$null)
  if ($LASTEXITCODE -ne 0) { throw "Post-upgrade certification failed: $test" }
}
$final = ("select count(*)||':'||(select lineage from forge_meta.database_lineage where singleton) from supabase_migrations.schema_migrations;" | & docker exec -i $container psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres 2>$null | Out-String).Trim()
if ($final -ne '415:historical-v1') { throw 'Post-upgrade history or lineage marker mismatch.' }
[pscustomobject]@{
  ok=$true; schema='forge.gate5d-authentic-certification.v1'; authenticHistory=$true
  restoredRows=411; pendingVersions=$pending; finalHistoryRows=415; lineage='historical-v1'
  residualLimitation='No production customer or financial rows were exercised.'
} | ConvertTo-Json -Depth 5 -Compress
