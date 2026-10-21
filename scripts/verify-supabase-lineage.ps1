[CmdletBinding()]
param(
  [Parameter(Mandatory)][ValidateSet('historical','baseline')][string]$Lineage,
  [Parameter(Mandatory)][string]$Workdir,
  [Parameter(Mandatory)][ValidateSet('none','local','linked')][string]$DatabaseTarget,
  [ValidateSet('upgrade','bootstrap')][string]$Mode = 'upgrade',
  [string]$ConfigurationPath,
  [string]$RepositoryRoot = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = 'Stop'
if (-not $ConfigurationPath) { $ConfigurationPath = Join-Path $RepositoryRoot 'docs/database/baseline/v1-gate2/lineage-contract.json' }
$configuration = Get-Content -LiteralPath ([IO.Path]::GetFullPath($ConfigurationPath)) -Raw | ConvertFrom-Json
if ($configuration.schema -ne 'forge.database-lineage-contract.v1') { throw 'Unsupported lineage configuration schema.' }

$actualCli = (& supabase --version 2>$null | Select-Object -First 1).Trim()
if ($actualCli -ne $configuration.requiredSupabaseCliVersion) { throw "Supabase CLI $($configuration.requiredSupabaseCliVersion) is required; found $actualCli." }

$repo = [IO.Path]::GetFullPath($RepositoryRoot).TrimEnd([IO.Path]::DirectorySeparatorChar)
$resolvedWorkdir = [IO.Path]::GetFullPath($Workdir).TrimEnd([IO.Path]::DirectorySeparatorChar)
$migrationsDirectory = Join-Path $resolvedWorkdir 'supabase/migrations'
if (-not (Test-Path -LiteralPath $migrationsDirectory -PathType Container)) { throw "Wrong workdir: no supabase/migrations at $resolvedWorkdir" }

function Get-Version([IO.FileInfo]$File) {
  if ($File.BaseName -notmatch '^(?<version>\d{8,14})_') { throw "Invalid migration filename: $($File.Name)" }
  return $Matches.version
}
function Get-MigrationMap([string]$Directory) {
  $map = [ordered]@{}
  foreach ($file in (Get-ChildItem -LiteralPath $Directory -Filter '*.sql' -File | Sort-Object Name)) {
    $version = Get-Version $file
    if ($map.Contains($version)) { throw "Duplicate migration version $version in $Directory" }
    $map[$version] = [ordered]@{ path=$file.FullName; name=$file.Name; sha256=(Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant() }
  }
  return $map
}

$workdirMigrations = Get-MigrationMap $migrationsDirectory
$manifestPath = if ([IO.Path]::IsPathFullyQualified([string]$configuration.historical.manifestPath)) { [string]$configuration.historical.manifestPath } else { Join-Path $repo $configuration.historical.manifestPath }
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
$historicalVersions = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::Ordinal)
foreach ($entry in $manifest.migrations) {
  [void]$historicalVersions.Add([string]$entry.version)
  if ($Lineage -eq 'historical') {
    if (-not $workdirMigrations.Contains([string]$entry.version)) { throw "Historical workdir is missing $($entry.path)." }
    if ($workdirMigrations[[string]$entry.version].sha256 -ne $entry.sha256) { throw "Unauthorized historical migration modification: $($entry.path)" }
  }
}

$reservedStart = [string]$configuration.baseline.reservedStartVersion
$reservedEnd = [string]$configuration.baseline.reservedEndVersion
$tailMinimum = [string]$configuration.sharedTail.minimumVersion
$canonicalTailDirectory = if ([IO.Path]::IsPathFullyQualified([string]$configuration.sharedTail.canonicalMigrationsDirectory)) { [string]$configuration.sharedTail.canonicalMigrationsDirectory } else { Join-Path $repo $configuration.sharedTail.canonicalMigrationsDirectory }
$canonicalMigrations = Get-MigrationMap $canonicalTailDirectory

foreach ($version in $canonicalMigrations.Keys) {
  if ($version -ge $reservedStart -and $version -le $reservedEnd) { throw "Baseline reservation collision in canonical migrations: $version" }
}

if ($Lineage -eq 'historical') {
  $configuredRoot = if ([IO.Path]::IsPathFullyQualified([string]$configuration.historical.rootWorkdir)) { [string]$configuration.historical.rootWorkdir } else { Join-Path $repo $configuration.historical.rootWorkdir }
  $expectedRoot = [IO.Path]::GetFullPath($configuredRoot).TrimEnd([IO.Path]::DirectorySeparatorChar)
  if ($resolvedWorkdir -ne $expectedRoot) { throw "Wrong workdir for historical lineage: expected $expectedRoot" }
  if ($Mode -eq 'bootstrap') { throw 'Historical root bootstrap is prohibited. Use the fresh baseline lineage.' }
  foreach ($version in $workdirMigrations.Keys) {
    if ($version -ge $reservedStart -and $version -le $reservedEnd) { throw "Baseline migration $version is present in the historical workdir." }
  }
}
else {
  if ($resolvedWorkdir -eq $repo) { throw 'Refusing to bootstrap or validate a baseline through the historical root workdir.' }
  $markerPath = Join-Path $resolvedWorkdir $configuration.baseline.workdirMarkerFilename
  if (-not (Test-Path -LiteralPath $markerPath -PathType Leaf)) { throw "Baseline workdir marker is missing: $markerPath" }
  $workdirMarker = Get-Content -LiteralPath $markerPath -Raw | ConvertFrom-Json
  if ($workdirMarker.lineage -ne $configuration.baseline.lineage) { throw 'Baseline workdir marker has the wrong lineage.' }
  $baselineVersions = @($workdirMigrations.Keys | Where-Object { $_ -ge $reservedStart -and $_ -le $reservedEnd })
  if ($baselineVersions.Count -eq 0) { throw 'Baseline workdir contains no migration in the reserved baseline range.' }
  foreach ($version in $workdirMigrations.Keys) {
    if ($historicalVersions.Contains($version)) { throw "Historical migration $version is present in the baseline workdir." }
    if ($version -lt $reservedStart -or ($version -gt $reservedEnd -and $version -lt $tailMinimum)) { throw "Migration $version is outside the baseline and shared-tail ranges." }
  }
  $canonicalTail = @($canonicalMigrations.Keys | Where-Object { $_ -ge $tailMinimum })
  $workdirTail = @($workdirMigrations.Keys | Where-Object { $_ -ge $tailMinimum })
  if (($canonicalTail -join ',') -ne ($workdirTail -join ',')) { throw 'Shared-tail migration versions diverge.' }
  foreach ($version in $canonicalTail) {
    if ($canonicalMigrations[$version].sha256 -ne $workdirMigrations[$version].sha256) { throw "Shared-tail bytes diverge for $version." }
  }
}

$databaseState = 'not-queried'
if ($DatabaseTarget -ne 'none') {
  $targetFlag = "--$DatabaseTarget"
  $historySql = 'select version from supabase_migrations.schema_migrations order by version'
  $historyRows = @((& supabase db query $targetFlag --agent=no --output csv --workdir $resolvedWorkdir $historySql 2>$null) | ConvertFrom-Csv)
  if ($LASTEXITCODE -ne 0) { throw 'Unable to read migration history.' }
  $databaseVersions = @($historyRows | ForEach-Object { [string]$_.version })
  foreach ($version in $databaseVersions) {
    if (-not $workdirMigrations.Contains($version)) { throw "Database contains an unknown migration version: $version" }
  }
  $hasHistorical = @($databaseVersions | Where-Object { $historicalVersions.Contains($_) }).Count -gt 0
  $hasBaseline = @($databaseVersions | Where-Object { $_ -ge $reservedStart -and $_ -le $reservedEnd }).Count -gt 0
  if ($hasHistorical -and $hasBaseline) { throw 'Database contains mixed historical and baseline lineage versions.' }
  if ($Lineage -eq 'historical' -and $hasBaseline) { throw 'Wrong-lineage database: baseline versions found.' }
  if ($Lineage -eq 'baseline' -and $hasHistorical) { throw 'Wrong-lineage database: historical versions found.' }
  $markerSchema = [string]$configuration.databaseMarker.schema
  $markerTable = [string]$configuration.databaseMarker.table
  if ($markerSchema -notmatch '^[a-z_][a-z0-9_]*$' -or $markerTable -notmatch '^[a-z_][a-z0-9_]*$') { throw 'Unsafe database-marker identifier in lineage configuration.' }
  $markerIdentity = "$markerSchema.$markerTable"
  $markerExistenceSql = "select to_regclass('$markerIdentity')::text as relation"
  $markerExistence = @((& supabase db query $targetFlag --agent=no --output csv --workdir $resolvedWorkdir $markerExistenceSql 2>$null) | ConvertFrom-Csv)
  if ($LASTEXITCODE -ne 0) { throw 'Unable to inspect database lineage marker.' }
  $markerValue = if ($markerExistence.Count -eq 1) { [string]$markerExistence[0].relation } else { '' }
  $markerExists = $markerValue -ne '' -and $markerValue -ne 'NULL'
  $databaseMarkerLineage = $null
  if ($markerExists) {
    $markerSql = "select lineage from $markerIdentity where singleton=true"
    $markerRows = @((& supabase db query $targetFlag --agent=no --output csv --workdir $resolvedWorkdir $markerSql 2>$null) | ConvertFrom-Csv)
    if ($LASTEXITCODE -ne 0 -or $markerRows.Count -ne 1) { throw 'Database lineage marker must contain exactly one singleton row.' }
    $databaseMarkerLineage = [string]$markerRows[0].lineage
    $expectedMarkerLineage = if ($Lineage -eq 'historical') { [string]$configuration.historical.lineage } else { [string]$configuration.baseline.lineage }
    if ($databaseMarkerLineage -ne $expectedMarkerLineage) { throw "Wrong database lineage marker: $databaseMarkerLineage" }
  }
  if ($Mode -eq 'bootstrap') {
    if ($Lineage -ne 'baseline') { throw 'Only baseline lineage can bootstrap a fresh database.' }
    if ($databaseVersions.Count -ne 0) { throw 'Fresh baseline bootstrap requires empty migration history.' }
    $databaseState = 'empty-baseline-bootstrap'
  } else {
    if ($Lineage -eq 'historical') {
      $missing = @($manifest.migrations | Where-Object { $_.version -notin $databaseVersions })
      if ($missing.Count -gt 0) { throw "Historical database is missing $($missing.Count) manifest versions." }
      if (-not $markerExists -and @($databaseVersions | Where-Object { $_ -ge $tailMinimum }).Count -gt 0) { throw 'Historical database has shared-tail versions but no lineage marker.' }
      $databaseState = 'historical-upgrade'
    } else {
      if (-not $hasBaseline) { throw 'Baseline database has no reserved baseline version.' }
      $missingBaseline = @($baselineVersions | Where-Object { $_ -notin $databaseVersions })
      if ($missingBaseline.Count -gt 0) { throw "Baseline database is missing $($missingBaseline.Count) baseline epoch versions." }
      if (-not $markerExists) { throw 'Baseline database lineage marker is missing.' }
      $databaseState = 'baseline-upgrade'
    }
  }
}

[pscustomobject]@{
  ok=$true
  lineage=$Lineage
  mode=$Mode
  workdir=$resolvedWorkdir
  migrationCount=$workdirMigrations.Count
  databaseState=$databaseState
  databaseMarker=$databaseMarkerLineage
  cliVersion=$actualCli
} | ConvertTo-Json -Compress
