# Read-only filesystem tests against approved evidence; only protected audit JSON
# is written. Never invokes Unlink or deletion, creates links, or changes settings.
$ErrorActionPreference='Stop'
$root='D:\nursery\nursery'
$private=Join-Path $root '.git\forge-consolidation-private'
$source=Get-Content -LiteralPath (Join-Path $root 'docs\maintenance\run-final-forge-removal.ps1') -Raw
$native=[regex]::Match($source,"(?s)Add-Type -TypeDefinition @'\r?\n(.*?)\r?\n'@").Groups[1].Value
if(-not $native){throw 'Native contract not found'}
Add-Type -TypeDefinition $native
$ordinary=@()
foreach($p in @((Join-Path $root 'AGENTS.md'),(Join-Path $root 'docs\maintenance'))){
  $a=[ForgeFinalLinkRemoval]::Describe($p);$b=Get-Item -LiteralPath $p
  if($a.FullName -cne $p -or $a.Attributes -ne $b.Attributes -or $a.PSIsContainer -ne $b.PSIsContainer -or $a.LastWriteTimeUtc -ne $b.LastWriteTimeUtc -or (-not $b.PSIsContainer -and $a.Length -ne $b.Length)){throw 'Ordinary metadata parity failed'}
  if([ForgeFinalLinkRemoval]::ExtendedPath($p) -cne ('\\?\'+$p)){throw 'Ordinary path identity changed'}
  $ordinary+=$p
}
$invalid=@('relative\file','C:relative','\\server\share\file','\\.\PhysicalDrive0','\\?\C:\already-prefixed','D:\nursery\..\outside','D:\nursery\.\file','D:\nursery\*','D:\nursery\file:stream','D:\nursery\trailing.','D:\nursery\trailing ','D:\nursery\\duplicate')
foreach($p in $invalid){$rejected=$false;try{[ForgeFinalLinkRemoval]::ExtendedPath($p)|Out-Null}catch{$rejected=$true};if(-not $rejected){throw 'Non-canonical path accepted'}}
$targets=@();$longRecords=@()
foreach($id in @('T018','T043')){
  $check=Get-Content -LiteralPath (Join-Path $private "continuation-before-final-batch-check-$id.json") -Raw | ConvertFrom-Json
  $diagnostic=Get-Content -LiteralPath (Join-Path $private "final-batch-$id-diagnostic.json") -Raw | ConvertFrom-Json
  $expected=@{};foreach($e in $check.entries){$expected[$e.path]=$e}
  $required=if($id -eq 'T018'){502}else{147}
  if($diagnostic.Count -ne $required){throw 'Wrong diagnostic population'}
  foreach($d in $diagnostic){
    $e=$expected[$d.path];if(-not $e){throw 'Long path missing reviewed entry'}
    if(-not $d.path.StartsWith($check.path+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Long path escaped exact target'}
    $a=[ForgeFinalLinkRemoval]::Describe($d.path)
    if($a.FullName -cne $d.path -or ($a.Attributes -band [IO.FileAttributes]::ReparsePoint) -or $a.PSIsContainer -ne $e.directory -or (-not $e.directory -and $a.Length -ne $e.size)){throw 'Long-path type/size changed'}
    $ns=([DateTimeOffset]$a.LastWriteTimeUtc).ToUnixTimeMilliseconds()*1000000
    if([Math]::Abs($ns-[double]$e.mtimeNs) -gt 1000000){throw 'Long-path write time changed'}
    if($e.relative -notmatch '^node_modules/'){throw 'Unexpected non-generated long-path disposition'}
    $hash=$null
    if(-not $a.PSIsContainer){
      $stream=[IO.File]::OpenRead([ForgeFinalLinkRemoval]::ExtendedPath($d.path))
      try{$hash=[Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($stream)).ToLowerInvariant()}finally{$stream.Dispose()}
    }
    $longRecords+=@{id=$id;path=$d.path;reviewedDisposition='reproducible node_modules; prior approved size/type/write-time match';sha256Now=$hash;historicalContentHashClaimed=$false}
  }
  foreach($link in $check.links){
    $a=[ForgeFinalLinkRemoval]::Describe($link.path)
    if(-not ($a.Attributes -band [IO.FileAttributes]::ReparsePoint) -or $a.FullName -cne $link.path){throw 'Reparse entry not detected'}
    if([ForgeFinalLinkRemoval]::ExtendedPath($link.path) -cne ('\\?\'+$link.path.Replace('/','\'))){throw 'Link identity changed'}
  }
  $targets+=@{id=$id;longPaths=$required;reparseEntriesDetected=$check.links.Count;metadataMatches=$true;reviewedGeneratedDispositionMatches=$true}
}
$result=@{checkedAt=[DateTime]::UtcNow.ToString('o');ordinary=$ordinary;invalidPathsRejected=$invalid.Count;targets=$targets;longRecords=$longRecords;noDeletionOrLinkTraversal=$true;guardSha256=(Get-FileHash -LiteralPath (Join-Path $root 'docs\maintenance\run-final-forge-removal.ps1')).Hash.ToLowerInvariant()}
[IO.File]::WriteAllText((Join-Path $private 'continuation-long-path-tests.json'),(ConvertTo-Json -Depth 8 -InputObject $result))
$result | Select-Object checkedAt,invalidPathsRejected,targets,noDeletionOrLinkTraversal,guardSha256 | ConvertTo-Json -Depth 5
