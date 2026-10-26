[CmdletBinding()]
param(
  [Parameter(Mandatory)][string]$RepositoryRoot,
  [Parameter(Mandatory)][ValidateSet('historical','canonical','pre-slice','gate5d','all')][string]$Scope,
  [switch]$RequireExactWorktreeBytes,
  [switch]$Details
)

$ErrorActionPreference='Stop'
$repo=[IO.Path]::GetFullPath($RepositoryRoot)
$verifier=Join-Path $repo 'scripts/verify-frozen-git-evidence.mjs'
$arguments=@($verifier,'--repository-root',$repo,'--scope',$Scope)
if($RequireExactWorktreeBytes){$arguments+='--require-exact-worktree-bytes'}
if($Details){$arguments+='--details'}

$gitPointer=Join-Path $repo '.git'
$windowsManagedWslWorktree=(-not $IsWindows -and (Test-Path -LiteralPath $gitPointer -PathType Leaf) -and
  ((Get-Content -LiteralPath $gitPointer -Raw) -match '^gitdir:\s*[A-Za-z]:[\\/]'))

if(-not $windowsManagedWslWorktree){
  $output=(& node @arguments 2>&1|Out-String).Trim()
  if($LASTEXITCODE -ne 0){throw $output}
  $output
  return
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
