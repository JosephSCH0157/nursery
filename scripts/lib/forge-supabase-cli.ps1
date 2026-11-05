Set-StrictMode -Version Latest

function Resolve-ForgeSupabaseExecutable {
  [CmdletBinding()]
  param(
    [string]$RepositoryRoot = (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)),
    [string]$ExpectedVersion,
    [switch]$SkipPathLookup,
    [switch]$SkipScoopFallback
  )
  $repo = [IO.Path]::GetFullPath($RepositoryRoot)
  if ([string]::IsNullOrWhiteSpace($ExpectedVersion)) {
    $contractPath = Join-Path $repo 'docs/database/baseline/v1-gate2/lineage-contract.json'
    $manifestPath = Join-Path $repo 'package.json'
    if (-not (Test-Path -LiteralPath $contractPath -PathType Leaf) -or -not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
      throw 'Repository Supabase CLI authority is unavailable.'
    }
    $contract = Get-Content -LiteralPath $contractPath -Raw | ConvertFrom-Json
    $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
    $ExpectedVersion = [string]$contract.requiredSupabaseCliVersion
    if ($ExpectedVersion -notmatch '^\d+\.\d+\.\d+$' -or [string]$manifest.devDependencies.supabase -cne $ExpectedVersion) {
      throw 'Repository Supabase CLI pins are missing or inconsistent.'
    }
  }
  $candidates = [Collections.Generic.List[string]]::new()
  if ($IsWindows -and -not $SkipScoopFallback -and -not [string]::IsNullOrWhiteSpace($env:USERPROFILE)) {
    $scoopRoot = Join-Path $env:USERPROFILE 'scoop'
    $candidates.Add((Join-Path $scoopRoot "apps\supabase\$ExpectedVersion\supabase.exe"))
    $candidates.Add((Join-Path $scoopRoot 'apps\supabase\current\supabase.exe'))
  }
  if (-not $SkipPathLookup) {
    $command = Get-Command supabase -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($null -eq $command -and $IsWindows) {
      $command = Get-Command supabase.exe -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    }
    if ($null -ne $command -and -not [string]::IsNullOrWhiteSpace($command.Source)) { $candidates.Add($command.Source) }
  }
  foreach ($candidate in @($candidates | Select-Object -Unique)) {
    if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) { continue }
    $start = [Diagnostics.ProcessStartInfo]::new($candidate)
    $start.UseShellExecute = $false
    $start.CreateNoWindow = $true
    $start.RedirectStandardOutput = $true
    $start.RedirectStandardError = $true
    [void]$start.ArgumentList.Add('--version')
    $process = [Diagnostics.Process]::new(); $process.StartInfo = $start
    try {
      if (-not $process.Start()) { continue }
      $stdout = $process.StandardOutput.ReadToEnd(); $null = $process.StandardError.ReadToEnd(); $process.WaitForExit()
      if ($process.ExitCode -eq 0 -and $stdout.Trim() -ceq $ExpectedVersion) { return [IO.Path]::GetFullPath($candidate) }
    } catch {
      continue
    } finally {
      $process.Dispose()
    }
  }
  throw "Approved Supabase CLI $ExpectedVersion is unavailable."
}

function Get-ForgeSupabaseDiagnosticCategories {
  [CmdletBinding()]
  param([AllowEmptyString()][string]$StandardError)
  $categories = [Collections.Generic.List[string]]::new()
  if ($StandardError -match '(?i)auth|password|credential|permission|unauthorized|forbidden') { $categories.Add('authentication_or_permission') }
  if ($StandardError -match '(?i)timeout|connection|network|dns|host|socket|tls') { $categories.Add('connectivity') }
  if ($StandardError -match '(?i)sqlstate|database|postgres|migration') { $categories.Add('database_or_migration') }
  if ($StandardError -match '(?i)error|fatal|failed|panic') { $categories.Add('cli_failure') }
  if ($categories.Count -eq 0) { $categories.Add('unclassified') }
  return @($categories | Select-Object -Unique)
}

function Invoke-ForgeSupabaseCli {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory)][string[]]$Arguments,
    [string]$Executable
  )
  if ([string]::IsNullOrWhiteSpace($Executable)) { $Executable = Resolve-ForgeSupabaseExecutable }
  $start = [Diagnostics.ProcessStartInfo]::new()
  $start.FileName = $Executable
  $start.UseShellExecute = $false
  $start.CreateNoWindow = $true
  $start.RedirectStandardOutput = $true
  $start.RedirectStandardError = $true
  foreach ($argument in $Arguments) { [void]$start.ArgumentList.Add($argument) }
  $process = [Diagnostics.Process]::new()
  $process.StartInfo = $start
  try {
    if (-not $process.Start()) { throw 'Supabase CLI process did not start.' }
    $stdoutTask = $process.StandardOutput.ReadToEndAsync()
    $stderrTask = $process.StandardError.ReadToEndAsync()
    $process.WaitForExit()
    $stdout = $stdoutTask.GetAwaiter().GetResult()
    $stderr = $stderrTask.GetAwaiter().GetResult()
    if ($process.ExitCode -ne 0) {
      $categories = @(Get-ForgeSupabaseDiagnosticCategories -StandardError $stderr)
      throw "Supabase command failed (exit $($process.ExitCode); diagnostics: $($categories -join ',')). Output withheld."
    }
    return [pscustomobject]@{
      ExitCode = $process.ExitCode
      StandardOutput = $stdout
      StandardError = $stderr
    }
  } finally {
    $process.Dispose()
  }
}

function Assert-ForgeSupabaseDryRunPlan {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory)][object]$Result,
    [Parameter(Mandatory)][string[]]$ExpectedMigrationFiles
  )
  if ($Result.ExitCode -ne 0) { throw "Supabase dry run failed (exit $($Result.ExitCode))." }
  if ($ExpectedMigrationFiles.Count -eq 0 -or $ExpectedMigrationFiles.Count -ne @($ExpectedMigrationFiles | Select-Object -Unique).Count) {
    throw 'Expected migration plan is empty or duplicated.'
  }
  foreach ($expected in $ExpectedMigrationFiles) {
    if ($expected -notmatch '^\d{8,14}_[A-Za-z0-9][A-Za-z0-9_-]*\.sql$') { throw 'Expected migration plan contains an invalid filename.' }
  }
  $plans = [Collections.Generic.List[object]]::new()
  foreach ($stream in @([string]$Result.StandardOutput,[string]$Result.StandardError)) {
    $normalized = [regex]::Replace($stream, "`e\[[0-?]*[ -/]*[@-~]", '') -replace "`r`n", "`n" -replace "`r", "`n"
    $windowsMojibakeBullet = [string]::Concat([char]915,[char]199,[char]243)
    $normalized = $normalized.Replace($windowsMojibakeBullet,[string][char]0x2022)
    $lines = @($normalized -split "`n")
    for ($index = 0; $index -lt $lines.Count; $index++) {
      if ($lines[$index].Trim() -cne 'Would push these migrations:') { continue }
      $files = [Collections.Generic.List[string]]::new()
      $cursor = $index + 1
      while ($cursor -lt $lines.Count -and [string]::IsNullOrWhiteSpace($lines[$cursor])) { $cursor++ }
      while ($cursor -lt $lines.Count) {
        if ($lines[$cursor] -match '^\s*[•*-]\s+(?<file>\d{8,14}_[A-Za-z0-9][A-Za-z0-9_-]*\.sql)\s*$') {
          $files.Add($Matches.file); $cursor++; continue
        }
        break
      }
      if ($files.Count -eq 0) { throw 'Supabase dry-run plan is malformed or incomplete.' }
      $plans.Add(@($files))
    }
  }
  if ($plans.Count -ne 1) { throw 'Supabase dry-run output contains no unique migration plan.' }
  $actual = [string[]]$plans[0]
  if ($actual.Count -ne $ExpectedMigrationFiles.Count) { throw 'Supabase dry-run migration count mismatch.' }
  for ($index = 0; $index -lt $ExpectedMigrationFiles.Count; $index++) {
    if ($actual[$index] -cne $ExpectedMigrationFiles[$index]) { throw "Supabase dry-run migration plan mismatch at position $index." }
  }
  return @($actual)
}

function ConvertFrom-ForgeSupabaseCsv {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory)][AllowEmptyString()][string]$StandardOutput,
    [Parameter(Mandatory)][string[]]$ExpectedColumns,
    [Parameter(Mandatory)][string]$Context
  )
  if ([string]::IsNullOrWhiteSpace($StandardOutput)) { throw "$Context returned empty CSV output." }
  $reader = [IO.StringReader]::new($StandardOutput.TrimStart([char]0xFEFF))
  $parser = [Microsoft.VisualBasic.FileIO.TextFieldParser]::new($reader)
  $parser.TextFieldType = [Microsoft.VisualBasic.FileIO.FieldType]::Delimited
  $parser.SetDelimiters(',')
  $parser.HasFieldsEnclosedInQuotes = $true
  $records = [Collections.Generic.List[object]]::new()
  try {
    while (-not $parser.EndOfData) { $records.Add(@($parser.ReadFields())) }
  } catch {
    throw "$Context returned malformed CSV output."
  } finally {
    $parser.Dispose()
    $reader.Dispose()
  }
  if ($records.Count -lt 2) { throw "$Context returned no CSV data rows." }
  $header = [string[]]$records[0]
  if ($header.Count -ne $ExpectedColumns.Count) { throw "$Context returned an unexpected CSV header." }
  for ($index = 0; $index -lt $ExpectedColumns.Count; $index++) {
    if ($header[$index] -cne $ExpectedColumns[$index]) { throw "$Context returned an unexpected CSV header." }
  }
  $rows = [Collections.Generic.List[object]]::new()
  for ($recordIndex = 1; $recordIndex -lt $records.Count; $recordIndex++) {
    $fields = [string[]]$records[$recordIndex]
    if ($fields.Count -ne $ExpectedColumns.Count) { throw "$Context returned malformed CSV output." }
    $row = [ordered]@{}
    for ($fieldIndex = 0; $fieldIndex -lt $ExpectedColumns.Count; $fieldIndex++) {
      $row[$ExpectedColumns[$fieldIndex]] = $fields[$fieldIndex]
    }
    $rows.Add([pscustomobject]$row)
  }
  return @($rows)
}
