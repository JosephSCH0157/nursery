Set-StrictMode -Version Latest

function Test-ForgeGitCandidate {
  [CmdletBinding()]
  param([Parameter(Mandatory)][string]$Executable)
  if (-not (Test-Path -LiteralPath $Executable -PathType Leaf)) { return $false }
  $start = [Diagnostics.ProcessStartInfo]::new($Executable)
  $start.UseShellExecute = $false; $start.CreateNoWindow = $true
  $start.RedirectStandardOutput = $true; $start.RedirectStandardError = $true
  [void]$start.ArgumentList.Add('--version')
  $process = [Diagnostics.Process]::new(); $process.StartInfo = $start
  try {
    if (-not $process.Start()) { return $false }
    $stdout = $process.StandardOutput.ReadToEnd(); $null = $process.StandardError.ReadToEnd(); $process.WaitForExit()
    return $process.ExitCode -eq 0 -and $stdout.Trim() -match '^git version \d+\.\d+\.\d+(?:\.windows\.\d+)?$'
  } catch { return $false } finally { $process.Dispose() }
}

function Resolve-ForgeGitExecutable {
  [CmdletBinding()]
  param([switch]$SkipPathLookup,[switch]$SkipSystemFallback)
  $candidates = [Collections.Generic.List[string]]::new()
  if (-not $SkipPathLookup) {
    $command = Get-Command git -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($null -ne $command -and -not [string]::IsNullOrWhiteSpace($command.Source)) { $candidates.Add($command.Source) }
  }
  if ($IsWindows -and -not $SkipSystemFallback -and -not [string]::IsNullOrWhiteSpace($env:ProgramFiles)) {
    $candidates.Add((Join-Path $env:ProgramFiles 'Git\cmd\git.exe'))
  }
  foreach ($candidate in @($candidates | Select-Object -Unique)) {
    if (Test-ForgeGitCandidate -Executable $candidate) { return [IO.Path]::GetFullPath($candidate) }
  }
  throw 'Approved native Git runtime is unavailable.'
}

function Invoke-ForgeGit {
  [CmdletBinding()]
  param([Parameter(Mandatory)][string[]]$Arguments,[string]$Executable)
  if ([string]::IsNullOrWhiteSpace($Executable)) { $Executable = Resolve-ForgeGitExecutable }
  $start = [Diagnostics.ProcessStartInfo]::new($Executable)
  $start.UseShellExecute = $false; $start.CreateNoWindow = $true
  $start.RedirectStandardOutput = $true; $start.RedirectStandardError = $true
  foreach ($argument in $Arguments) { [void]$start.ArgumentList.Add($argument) }
  $process = [Diagnostics.Process]::new(); $process.StartInfo = $start
  try {
    if (-not $process.Start()) { throw 'Approved Git runtime did not start.' }
    $stdout = $process.StandardOutput.ReadToEnd(); $stderr = $process.StandardError.ReadToEnd(); $process.WaitForExit()
    if ($process.ExitCode -ne 0) { throw "Git command failed (exit $($process.ExitCode)). Output withheld." }
    [pscustomobject]@{ExitCode=$process.ExitCode;StandardOutput=$stdout;StandardError=$stderr;Executable=$Executable}
  } finally { $process.Dispose() }
}
