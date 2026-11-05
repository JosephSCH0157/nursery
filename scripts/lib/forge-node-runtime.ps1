Set-StrictMode -Version Latest

function Test-ForgeNodeCandidate {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory)][string]$Executable,
    [Parameter(Mandatory)][string]$ExpectedVersion
  )
  if(-not(Test-Path -LiteralPath $Executable -PathType Leaf)){return $false}
  $start=[Diagnostics.ProcessStartInfo]::new($Executable)
  $start.UseShellExecute=$false;$start.RedirectStandardOutput=$true;$start.RedirectStandardError=$true;$start.CreateNoWindow=$true
  [void]$start.ArgumentList.Add('--version')
  $process=[Diagnostics.Process]::new();$process.StartInfo=$start
  try{
    if(-not $process.Start()){return $false}
    $stdout=$process.StandardOutput.ReadToEnd();$null=$process.StandardError.ReadToEnd();$process.WaitForExit()
    return $process.ExitCode -eq 0 -and $stdout.Trim() -ceq "v$ExpectedVersion"
  }catch{return $false}finally{$process.Dispose()}
}

function Resolve-ForgeNodeExecutable {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory)][string]$RepositoryRoot,
    [switch]$SkipPathLookup,
    [switch]$SkipVoltaFallback
  )
  $repo=[IO.Path]::GetFullPath($RepositoryRoot)
  $manifestPath=Join-Path $repo 'package.json'
  if(-not(Test-Path -LiteralPath $manifestPath -PathType Leaf)){throw 'Repository package manifest is unavailable for Node runtime resolution.'}
  $manifest=Get-Content -LiteralPath $manifestPath -Raw|ConvertFrom-Json
  $expected=[string]$manifest.volta.node
  if($expected -notmatch '^\d+\.\d+\.\d+$'){throw 'Repository Volta Node pin is missing or invalid.'}

  $candidates=[Collections.Generic.List[string]]::new()
  if(-not $SkipPathLookup){
    $command=Get-Command node -CommandType Application -ErrorAction SilentlyContinue|Select-Object -First 1
    if($null -ne $command -and -not[string]::IsNullOrWhiteSpace($command.Source)){$candidates.Add($command.Source)}
  }
  if($IsWindows -and -not $SkipVoltaFallback){
    $voltaHome=[Environment]::GetEnvironmentVariable('VOLTA_HOME','Process')
    if([string]::IsNullOrWhiteSpace($voltaHome)){$voltaHome=Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'Volta'}
    if(-not[string]::IsNullOrWhiteSpace($voltaHome)){$candidates.Add((Join-Path $voltaHome "tools\image\node\$expected\node.exe"))}
    $volta=Get-Command volta -CommandType Application -ErrorAction SilentlyContinue|Select-Object -First 1
    $voltaPath=if($null -ne $volta){$volta.Source}else{Join-Path $env:ProgramFiles 'Volta\volta.exe'}
    if(Test-Path -LiteralPath $voltaPath -PathType Leaf){
      $start=[Diagnostics.ProcessStartInfo]::new($voltaPath);$start.UseShellExecute=$false;$start.RedirectStandardOutput=$true;$start.RedirectStandardError=$true;$start.CreateNoWindow=$true;$start.WorkingDirectory=$repo
      [void]$start.ArgumentList.Add('which');[void]$start.ArgumentList.Add('node')
      $process=[Diagnostics.Process]::new();$process.StartInfo=$start
      try{
        if($process.Start()){$resolved=$process.StandardOutput.ReadToEnd().Trim();$null=$process.StandardError.ReadToEnd();$process.WaitForExit();if($process.ExitCode -eq 0 -and $resolved){$candidates.Add($resolved)}}
      }finally{$process.Dispose()}
    }
  }
  foreach($candidate in @($candidates|Select-Object -Unique)){
    if(Test-ForgeNodeCandidate -Executable $candidate -ExpectedVersion $expected){return [IO.Path]::GetFullPath($candidate)}
  }
  throw "Approved repository Node runtime v$expected is unavailable."
}

function Invoke-ForgeNode {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory)][string]$RepositoryRoot,
    [Parameter(Mandatory)][string[]]$Arguments,
    [string]$Executable
  )
  if([string]::IsNullOrWhiteSpace($Executable)){$Executable=Resolve-ForgeNodeExecutable -RepositoryRoot $RepositoryRoot}
  $start=[Diagnostics.ProcessStartInfo]::new($Executable);$start.UseShellExecute=$false;$start.RedirectStandardOutput=$true;$start.RedirectStandardError=$true;$start.CreateNoWindow=$true;$start.WorkingDirectory=[IO.Path]::GetFullPath($RepositoryRoot)
  foreach($argument in $Arguments){[void]$start.ArgumentList.Add($argument)}
  $process=[Diagnostics.Process]::new();$process.StartInfo=$start
  try{
    if(-not $process.Start()){throw 'Approved Node runtime did not start.'}
    $stdout=$process.StandardOutput.ReadToEnd();$stderr=$process.StandardError.ReadToEnd();$process.WaitForExit()
    if($process.ExitCode -ne 0){throw "Governed Node command failed (exit $($process.ExitCode)). Output withheld."}
    [pscustomobject]@{ExitCode=$process.ExitCode;StandardOutput=$stdout;StandardError=$stderr;Executable=$Executable}
  }finally{$process.Dispose()}
}
