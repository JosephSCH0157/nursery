Set-StrictMode -Version Latest

function Resolve-ForgeSupabaseExecutable {
  [CmdletBinding()]
  param()
  $command = Get-Command supabase -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($null -eq $command -and $IsWindows) {
    $command = Get-Command supabase.exe -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
  }
  if ($null -eq $command -or [string]::IsNullOrWhiteSpace($command.Source)) {
    throw 'Supabase CLI executable is unavailable.'
  }
  return $command.Source
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
