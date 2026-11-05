[CmdletBinding()]
param(
  [Parameter(Mandatory)][string]$RepositoryRoot,
  [Parameter(Mandatory)][ValidateSet('historical','canonical','pre-slice','gate5d','all')][string]$Scope,
  [switch]$RequireExactWorktreeBytes,
  [switch]$Details
)

$ErrorActionPreference='Stop'
$repo=[IO.Path]::GetFullPath($RepositoryRoot)
. (Join-Path $PSScriptRoot 'lib/forge-node-runtime.ps1')
. (Join-Path $PSScriptRoot 'lib/forge-git-runtime.ps1')
$verifier=Join-Path $repo 'scripts/verify-frozen-git-evidence.mjs'
$arguments=@($verifier,'--repository-root',$repo,'--scope',$Scope)
if($RequireExactWorktreeBytes){$arguments+='--require-exact-worktree-bytes'}
if($Details){$arguments+='--details'}

$gitPointer=Join-Path $repo '.git'
$windowsManagedWslWorktree=(-not $IsWindows -and (Test-Path -LiteralPath $gitPointer -PathType Leaf) -and
  ((Get-Content -LiteralPath $gitPointer -Raw) -match '^gitdir:\s*[A-Za-z]:[\\/]'))

if(-not $windowsManagedWslWorktree){
  $gitExecutable=Resolve-ForgeGitExecutable
  $savedPath=$env:PATH
  try{
    $env:PATH=(Split-Path -Parent $gitExecutable)+[IO.Path]::PathSeparator+$savedPath
    $nodeResult=Invoke-ForgeNode -RepositoryRoot $repo -Arguments $arguments
    $output=$nodeResult.StandardOutput.Trim()
    $output
    return
  }finally{$env:PATH=$savedPath}
}

$windowsRepo=(& wslpath -w -- $repo|Out-String).Trim()
if($LASTEXITCODE -ne 0 -or -not $windowsRepo -or $windowsRepo -match '[&|<>^]'){
  throw 'Unable to resolve a safe Windows path for frozen-evidence verification.'
}
$windowsNode=(@(& '/mnt/c/Windows/System32/cmd.exe' /d /c where node 2>$null)|Select-Object -First 1)
if(-not $windowsNode){throw 'Windows Node is unavailable for frozen-evidence verification.'}
$windowsNodeWsl=(& wslpath -u -- ([string]$windowsNode).Trim()|Out-String).Trim()
$windowsPath=(& '/mnt/c/Windows/System32/cmd.exe' /d /c echo '%PATH%'|Out-String).Trim()
if($LASTEXITCODE -ne 0 -or -not(Test-Path -LiteralPath $windowsNodeWsl -PathType Leaf) -or -not $windowsPath){
  throw 'Unable to resolve the existing Windows Node and Git execution environment.'
}
$windowsArguments=@('scripts\verify-frozen-git-evidence.mjs','--repository-root',$windowsRepo,'--scope',$Scope)
if($RequireExactWorktreeBytes){$windowsArguments+='--require-exact-worktree-bytes'}
if($Details){$windowsArguments+='--details'}
$savedPath=$env:PATH
try{
  $env:PATH=$windowsPath
  $output=(& $windowsNodeWsl @windowsArguments 2>&1|Out-String).Trim()
  if($LASTEXITCODE -ne 0){throw $output}
  $output
}finally{$env:PATH=$savedPath}
