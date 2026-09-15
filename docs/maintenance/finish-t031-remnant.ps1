# Only the explicit 46-file ReadOnly exception and exact T031 remainder.
param([switch]$ExecuteApprovedRemoval)
$ErrorActionPreference='Stop'
$root='D:\nursery\nursery'
$private=Join-Path $root '.git\forge-consolidation-private'
$target='C:\Users\Iam11\Documents\Codex\2026-09-12\next-bounded-owner-funded-hearth-research'
$env:GIT_OPTIONAL_LOCKS='0'
$manifestPath=Join-Path $private 'continuation-T031-remnant.json'
$manifestHash=(Get-FileHash -LiteralPath $manifestPath).Hash
if($manifestHash -cne '227EEE0E9424FEE807322E348DF1FF0A0937500CE7A72287FD810925A33A1BB3'){throw 'Reviewed partial manifest checksum changed'}
$manifest=Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
$proposal=Get-Content -LiteralPath "$private\final-removal-proposal.json" -Raw | ConvertFrom-Json
$approved=$proposal.rows | Where-Object id -eq T031
if($proposal.checkedAt -cne '2026-09-13T09:40:07.646605+00:00' -or $approved.path.Replace('/','\') -cne $target -or $manifest.target -cne 'T031' -or $manifest.errors.Count -or $manifest.remainingFiles -ne 39137 -or $manifest.remainingDirectories -ne 573){throw 'Exact approval/remnant mismatch'}
$auditPath="$private\t031-final-action.json"
if(Test-Path -LiteralPath $auditPath){throw 'Final action record exists; inspect before any retry'}
$source=Get-Content -LiteralPath "$root\docs\maintenance\run-final-forge-removal.ps1" -Raw
$native=[regex]::Match($source,"(?s)Add-Type -TypeDefinition @'\r?\n(.*?)\r?\n'@").Groups[1].Value
Add-Type -TypeDefinition $native
Add-Type -TypeDefinition @'
using System;using System.IO;using System.ComponentModel;using System.Runtime.InteropServices;
public static class T031Identity {
 [StructLayout(LayoutKind.Sequential)] struct Info {public uint attrs,cl,ch,al,ah,wl,wh,volume,sh,sl,links,ih,il;}
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)]static extern IntPtr CreateFileW(string p,uint a,uint s,IntPtr sec,uint c,uint flags,IntPtr t);
 [DllImport("kernel32.dll",SetLastError=true)]static extern bool GetFileInformationByHandle(IntPtr h,out Info i);
 [DllImport("kernel32.dll")]static extern bool CloseHandle(IntPtr h);
 public static string SingleFile(string p) {
  if(!p.StartsWith(@"\\?\"))throw new IOException("Extended exact path required");
  IntPtr h=CreateFileW(p,0,7,IntPtr.Zero,3,0x02200000,IntPtr.Zero);
  if(h==new IntPtr(-1))throw new Win32Exception(Marshal.GetLastWin32Error());
  try {Info i;if(!GetFileInformationByHandle(h,out i))throw new Win32Exception(Marshal.GetLastWin32Error());
   if((i.attrs&1040)!=0 || i.links!=1)throw new IOException("Not an ordinary single-link file");
   return i.volume.ToString("x8")+":"+i.ih.ToString("x8")+i.il.ToString("x8");
  }finally{CloseHandle(h);}
 }
}
'@
. "$root\docs\maintenance\forge-removal-process-audit.ps1"
function N([string]$p){$p.Replace('/','\').TrimEnd('\').ToLowerInvariant()}
function Assert-Canonical {
 & py -3 "$root\docs\maintenance\verify-final-removal.py" canonical
 if($LASTEXITCODE -ne 0){throw 'Canonical invariants changed'}
 if((Get-FileHash -LiteralPath $manifestPath).Hash -cne $manifestHash){throw 'Partial manifest changed'}
 $ports=@(Get-NetTCPConnection -State Listen -LocalPort 5173,5199 -ErrorAction SilentlyContinue)
 $runtime=Get-Content -LiteralPath "$private\t031-runtime-before.json" -Raw | ConvertFrom-Json
 $current=@($ports|ForEach-Object {"$($_.LocalAddress):$($_.LocalPort):$($_.OwningProcess)"}|Sort-Object)
 if(($current -join '|') -cne ($runtime.listenerIdentities -join '|')){throw 'Server state changed from fresh pre-mutation snapshot'}
}
function Hash-File([string]$p){
 $s=[IO.File]::OpenRead([ForgeFinalLinkRemoval]::ExtendedPath($p))
 try{[Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($s)).ToLowerInvariant()}finally{$s.Dispose()}
}
function Security([string]$p){(Get-Acl -LiteralPath $p).GetSecurityDescriptorSddlForm([Security.AccessControl.AccessControlSections]'Owner,Group,Access')}
# Every ancestor is inspected as an entry; never follow a redirected source root.
$ancestor=$target
while($ancestor.Length -gt 3){if([ForgeFinalLinkRemoval]::Describe($ancestor).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Reparse ancestor'};$ancestor=[IO.Path]::GetDirectoryName($ancestor)}
if($env:GIT_OBJECT_DIRECTORY -or $env:GIT_ALTERNATE_OBJECT_DIRECTORIES){throw 'Unexpected object-store environment'}
$alternates="$root\.git\objects\info\alternates"
if(Test-Path -LiteralPath $alternates){
 if((Get-Item -LiteralPath $alternates -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Canonical alternates link'}
 if((Get-Content -LiteralPath $alternates -Raw).ToLowerInvariant().Contains((N $target))){throw 'Canonical Git depends on T031 alternates'}
 # Relative/indirect alternates require separate dependency resolution.
 if((Get-Content -LiteralPath $alternates -Raw).Trim()){throw 'Nonempty canonical alternates require investigation'}
}
$expected=@{};$readonly=@()
foreach($e in $manifest.remaining){
 $path=[IO.Path]::GetFullPath($e.path)
 if($path -cne $e.path -or ((N $path) -ne (N $target) -and -not (N $path).StartsWith((N $target)+'\'))){throw 'Manifest path escaped target'}
 if($expected.ContainsKey((N $path))){throw 'Duplicate remnant path'}
 $expected[(N $path)]=$e
 if($e.readonly -and -not $e.directory){
   if(-not (N $path).StartsWith((N $target)+'\.git\objects\') -or $e.sha256Now -notmatch '^[0-9a-f]{64}$'){throw 'ReadOnly exception escaped object list'}
   $readonly+=$e
 }
}
if($readonly.Count -ne 46 -or $expected.Count -ne 39710){throw 'Exact remnant population changed'}
Assert-Canonical
# Bind execution to the successfully completed preservation audit from this order.
$preservation=Get-Content -LiteralPath "$private\final-batch-after.json" -Raw | ConvertFrom-Json
if($preservation.preservationRefs -ne 270 -or $preservation.retainedFiles -ne 1380 -or -not $preservation.canonicalIndexSourceAndPrivateConfigurationUnchanged){throw 'Preservation audit prerequisite missing'}
# Hash every remaining file and compare every entry without traversing links.
$pending=[Collections.Generic.Stack[string]]::new();$pending.Push($target)
$seen=@{};$preflight=[Collections.Generic.List[object]]::new()
while($pending.Count){
 $p=$pending.Pop();$item=[ForgeFinalLinkRemoval]::Describe($p);$e=$expected[(N $p)]
 if(-not $e -or $seen.ContainsKey((N $p))){throw 'Unexpected/duplicate entry'}
 if($item.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Unexpected link; no traversal'}
 if($item.PSIsContainer -ne $e.directory -or [int]$item.Attributes -ne $e.attributes -or (-not $e.directory -and $item.Length -ne $e.size)){throw 'Entry attributes/type/size changed'}
 if(-not $e.directory -and (Hash-File $p) -cne $e.sha256Now){throw "Checksum changed: $p"}
 $seen[(N $p)]=$true
 $preflight.Add(@{path=$p;mtime=$item.LastWriteTimeUtc;attributes=[int]$item.Attributes;size=$item.Length;directory=$item.PSIsContainer})
 if($e.directory){foreach($child in [IO.Directory]::EnumerateFileSystemEntries($p)){$pending.Push($child)}}
}
if($seen.Count -ne $expected.Count){throw 'Missing remnant entries'}
$attributeRecords=@()
foreach($e in $readonly){
 $attributeRecords+=@{path=$e.path;sha256=$e.sha256Now;identity=[T031Identity]::SingleFile([ForgeFinalLinkRemoval]::ExtendedPath($e.path));beforeAttributes=$e.attributes;afterAttributes=($e.attributes -band (-bnot 1));securityBefore=(Security $e.path)}
}
& "$root\docs\maintenance\check-final-removal-dependencies.ps1" -Id T031
& py -3 -c "import sqlite3; db=sqlite3.connect('file:C:/Users/Iam11/.codex/state_5.sqlite?mode=ro',uri=True); rows=db.execute('select id,cwd,archived from threads').fetchall(); target='$($target.Replace('\','/').ToLowerInvariant())'; norm=lambda p:p.replace(chr(92),'/').lower().rstrip('/'); assert not any(not a and (norm(p)==target or norm(p).startswith(target+'/')) for i,p,a in rows); assert any(i=='01a094cb-ddd3-7f63-9552-a34de271f485' and a for i,p,a in rows); print('Archived task and no active target task verified')"
if($LASTEXITCODE -ne 0){throw 'Task dependency changed'}
$users=Get-ForgePathUsers -Target $target -Files @($manifest.remaining|Where-Object {-not $_.directory}|ForEach-Object path)
if($users.processReferences.Count -or $users.resourceUsers.Count){throw 'Active process or file user'}
Assert-Canonical
$audit=@{target=$target;manifestSha256=$manifestHash;startedAt=[DateTime]::UtcNow.ToString('o');status='verified';verifiedFiles=39137;readonlyVerified=46;singleLinkFilesVerified=46;canonicalAlternatesDependency=$false;attributesChanged=@();removedFiles=0;removedDirectories=0;error=$null}
function Save-Audit {[IO.File]::WriteAllText($auditPath,(ConvertTo-Json -InputObject $audit -Depth 8))}
if(-not $ExecuteApprovedRemoval){'All remnant checks passed; no mutation';exit}
$beforeJournal=Get-Content -LiteralPath "$private\final-batch-journal.json" -Raw
if(Test-Path -LiteralPath "$private\t031-before-final-journal.json"){throw 'Prior final attempt exists'}
[IO.File]::WriteAllText("$private\t031-before-final-journal.json",$beforeJournal)
$log=[IO.StreamWriter]::new("$private\t031-final-deletions.jsonl",$false)
try {
 Save-Audit
 foreach($record in $attributeRecords){
   $p=$record.path;$item=[ForgeFinalLinkRemoval]::Describe($p)
   if([int]$item.Attributes -ne $record.beforeAttributes -or [T031Identity]::SingleFile([ForgeFinalLinkRemoval]::ExtendedPath($p)) -cne $record.identity -or (Hash-File $p) -cne $record.sha256 -or (Security $p) -cne $record.securityBefore){throw 'ReadOnly file changed before authorized attribute update'}
   [IO.File]::SetAttributes([ForgeFinalLinkRemoval]::ExtendedPath($p),[IO.FileAttributes]$record.afterAttributes)
   $change=@{path=$p;before=$record.beforeAttributes;after=$record.afterAttributes;identity=$record.identity;sha256=$record.sha256;securityBefore=$record.securityBefore;securityPreserved=$false}
   $audit.attributesChanged+=$change;Save-Audit
   $securityAfter=Security $p
   if([int][ForgeFinalLinkRemoval]::Describe($p).Attributes -ne $record.afterAttributes -or $securityAfter -cne $record.securityBefore -or [T031Identity]::SingleFile([ForgeFinalLinkRemoval]::ExtendedPath($p)) -cne $record.identity){throw 'Attribute/ACL/owner verification failed'}
   $change.securityAfter=$securityAfter;$change.securityPreserved=$true;Save-Audit
 }
 $audit.status='removing';Save-Audit
 # Same 39,710 literal entries; directory deletion is non-recursive.
 foreach($item in ($preflight|Sort-Object @{Expression={$_.path.Length};Descending=$true})){
   $p=$item.path;$e=$expected[(N $p)];$fresh=[ForgeFinalLinkRemoval]::Describe($p)
   $allowedAttributes=if($e.readonly -and -not $e.directory){$e.attributes -band (-bnot 1)}else{$e.attributes}
   if([int]$fresh.Attributes -ne $allowedAttributes -or $fresh.PSIsContainer -ne $e.directory -or (-not $e.directory -and ($fresh.Length -ne $e.size -or $fresh.LastWriteTimeUtc -ne $item.mtime))){throw "Late file/link change: $p"}
   if($fresh.PSIsContainer){[IO.Directory]::Delete([ForgeFinalLinkRemoval]::ExtendedPath($p),$false);$audit.removedDirectories++}
   else{[IO.File]::Delete([ForgeFinalLinkRemoval]::ExtendedPath($p));$audit.removedFiles++}
   $log.WriteLine((ConvertTo-Json -Compress -InputObject @{path=$p;directory=$fresh.PSIsContainer}));$log.Flush()
 }
 if(Test-Path -LiteralPath $target){throw 'T031 remains'}
 $audit.status='removed'
}catch{$audit.status='partial_or_refused';$audit.error=$_.Exception.Message}
finally{$log.Dispose();$audit.finishedAt=[DateTime]::UtcNow.ToString('o');Save-Audit}
$journal=Get-Content -LiteralPath "$private\final-batch-journal.json" -Raw | ConvertFrom-Json
$prior=$journal|Where-Object id -eq T031
$entry=[pscustomobject]@{id='T031';path=$target.Replace('\','/');status=$audit.status;linksRemoved=0;reason=if($audit.status -eq 'removed'){'Exact partial remnant removed after authorized 46-file ReadOnly-only change'}else{$audit.error};method='46 exact ReadOnly bits only; literal nonrecursive postorder removal';verifiedFiles=39137;previousAttempts=@($prior);finishedAt=$audit.finishedAt}
$updated=@($journal|Where-Object id -ne T031)+@($entry)
[IO.File]::WriteAllText("$private\final-batch-journal.json",(ConvertTo-Json -InputObject $updated -Depth 16))
Assert-Canonical
$audit|Select-Object status,verifiedFiles,readonlyVerified,singleLinkFilesVerified,removedFiles,removedDirectories,error|ConvertTo-Json
if($audit.status -ne 'removed'){exit 2}
