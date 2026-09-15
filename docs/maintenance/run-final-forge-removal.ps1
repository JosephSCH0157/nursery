# Exact approved checkpoint only. No recursive link traversal, ACL/attribute
# changes, process shutdown, Git cleanup/pruning, or raw app-state writes.
param([switch]$ExecuteApprovedBatch, [string[]]$TargetIds, [switch]$ResumeApprovedHolds, [switch]$ResumeT020AfterReboot)
$ErrorActionPreference='Stop'
$forgeRoot='D:\nursery\nursery'
$privateRoot=Join-Path $forgeRoot '.git\forge-consolidation-private'
$env:GIT_OPTIONAL_LOCKS='0'
if($ResumeT020AfterReboot -and (-not $ResumeApprovedHolds -or @($TargetIds).Count -ne 1 -or $TargetIds[0] -cne 'T020')){throw 'Post-reboot approval is T020 only'}
. (Join-Path $forgeRoot 'docs\maintenance\forge-removal-process-audit.ps1')
$proposal=Get-Content -LiteralPath "$privateRoot\final-removal-proposal.json" -Raw | ConvertFrom-Json
$before=Get-Content -LiteralPath "$privateRoot\final-batch-before.json" -Raw | ConvertFrom-Json
if ($proposal.checkedAt -cne '2026-09-13T09:40:07.646605+00:00' -or $proposal.rows.Count -ne 45) {throw 'Approval checkpoint mismatch'}
$journalFile="$privateRoot\final-batch-journal.json"
$journal=[Collections.Generic.List[object]]::new()
if (Test-Path -LiteralPath $journalFile) {foreach($row in (Get-Content -LiteralPath $journalFile -Raw | ConvertFrom-Json)){$journal.Add($row)}}
function Save-Journal { [IO.File]::WriteAllText($journalFile,(ConvertTo-Json -InputObject @($journal.ToArray()) -Depth 12)) }
function N([string]$v) {$v.Replace('/','\').TrimEnd('\').ToLowerInvariant()}
function Within([string]$v,[string]$r) { $a=N $v;$b=N $r;($a -eq $b -or $a.StartsWith($b+'\')) }
function Assert-Canonical {
    if((Get-FileHash -LiteralPath "$privateRoot\final-removal-proposal.json").Hash.ToLowerInvariant() -ne $before.proposalSha256){throw 'Proposal changed'}
    if((Get-FileHash -LiteralPath "$forgeRoot\.git\index").Hash.ToLowerInvariant() -ne 'c3559dc7358d98f4a94007084bae5e1db4b310ff0c1d067c4f9bc25395833da1'){throw 'Staging changed'}
    if((git -C $forgeRoot rev-parse HEAD) -ne $before.head){throw 'Canonical HEAD changed'}
    $listeners=@(Get-NetTCPConnection -State Listen -LocalPort 5173,5199 -ErrorAction SilentlyContinue)
    if($ResumeT020AfterReboot){
        if($listeners.Count){throw 'Both development servers must remain stopped'}
    } elseif(@($listeners | Where-Object {$_.LocalPort -eq 5173 -and $_.OwningProcess -eq 272572}).Count -ne 1 -or @($listeners | Where-Object LocalPort -eq 5199).Count){throw 'Server state changed'}
    foreach($f in $before.privateConfiguration){if((Get-FileHash -LiteralPath (Join-Path $forgeRoot $f.path)).Hash.ToLowerInvariant() -ne $f.sha256){throw 'Private configuration changed'}}
}
if(-not ('ForgeFinalLinkRemoval' -as [type])) {
Add-Type -TypeDefinition @'
using System;
using System.IO;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
public static class ForgeFinalLinkRemoval {
 // Prefix only canonical absolute drive paths. No device/UNC namespace,
 // normalization of dot segments, alternate streams, or wildcard expansion.
 // Keep the original spelling in Entry.FullName for exact manifest binding.
 public static string ExtendedPath(string p) {
   if(String.IsNullOrEmpty(p))throw new IOException("Empty path");
   string q=p.Replace('/','\\');
   if(q.Length<4 || !Char.IsLetter(q[0]) || q[1]!=':' || q[2]!='\\')
     throw new IOException("Only absolute drive paths are supported");
   foreach(string part in q.Substring(3).Split('\\')) {
     if(part.Length==0 || part=="." || part==".." || part.EndsWith(".") || part.EndsWith(" ") ||
        part.IndexOfAny(new char[]{':','*','?','\0'})>=0)
       throw new IOException("Non-canonical path component");
   }
   return @"\\?\"+q;
 }
 public class Entry {
   public string FullName; public bool PSIsContainer; public FileAttributes Attributes;
   public long Length; public DateTime LastWriteTimeUtc;
 }
 [StructLayout(LayoutKind.Sequential)] struct AttributeData {
   public uint attributes,creationLow,creationHigh,accessLow,accessHigh,writeLow,writeHigh,sizeHigh,sizeLow;
 }
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool GetFileAttributesExW(string p,int level,out AttributeData data);
 public static Entry Describe(string p) {
   AttributeData data;
   if(!GetFileAttributesExW(ExtendedPath(p),0,out data))throw new Win32Exception(Marshal.GetLastWin32Error());
   return new Entry {FullName=p,PSIsContainer=(data.attributes&16)!=0,Attributes=(FileAttributes)data.attributes,
     Length=(data.attributes&16)!=0?0:((long)data.sizeHigh<<32)|data.sizeLow,
     LastWriteTimeUtc=DateTime.FromFileTimeUtc(((long)data.writeHigh<<32)|data.writeLow)};
 }
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern IntPtr CreateFileW(string p,uint a,uint s,IntPtr sec,uint c,uint flags,IntPtr template);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool DeviceIoControl(IntPtr h,uint op,IntPtr i,int il,byte[] o,int ol,out int used,IntPtr ov);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool CloseHandle(IntPtr h);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool RemoveDirectoryW(string p);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool SetFileInformationByHandle(IntPtr h,int cls,ref int data,int size);
 public static void Unlink(string p,string hash,string kind) {
   // DELETE permission only for Linux link-handle deletion. No destination is opened.
   string exactPath=ExtendedPath(p);
   IntPtr h=CreateFileW(exactPath,kind=="LX_symlink"?0x10000u:0u,7,IntPtr.Zero,3,0x02200000,IntPtr.Zero);
   if(h==new IntPtr(-1))throw new Win32Exception(Marshal.GetLastWin32Error());
   try {
    byte[] b=new byte[16384];int used;
    if(!DeviceIoControl(h,0x900A8,IntPtr.Zero,0,b,b.Length,out used,IntPtr.Zero))throw new Win32Exception(Marshal.GetLastWin32Error());
    byte[] exact=new byte[used];Array.Copy(b,exact,used);
    string actual=BitConverter.ToString(SHA256.Create().ComputeHash(exact)).Replace("-","").ToLowerInvariant();
    if(actual!=hash)throw new IOException("Link metadata changed");
    uint tag=BitConverter.ToUInt32(b,0);
    if(kind=="junction") {
      if(tag!=0xa0000003)throw new IOException("Not the approved junction type");
      if(!RemoveDirectoryW(exactPath))throw new Win32Exception(Marshal.GetLastWin32Error());
    } else if(kind=="LX_symlink") {
      if(tag!=0xa000001d)throw new IOException("Not the approved LX type");
      int delete=1;
      if(!SetFileInformationByHandle(h,4,ref delete,4))throw new Win32Exception(Marshal.GetLastWin32Error());
    } else throw new IOException("Unsupported link type; no fallback");
   } finally {CloseHandle(h);}
 }
}
'@
}
Assert-Canonical
docker info --format '{{.ServerVersion}}' | Out-Null
if($LASTEXITCODE -ne 0){throw 'Docker Desktop must be started manually; no repair attempted'}
$mounts=@()
foreach($container in @(docker ps -aq)) {
    $list=docker inspect --format '{{json .Mounts}}' $container | ConvertFrom-Json
    if($LASTEXITCODE -ne 0){throw 'Mount inspection failed'}
    foreach($m in $list){if($m.Type -eq 'bind'){$mounts+=([string]$m.Source -replace '^/run/desktop/mnt/host/([a-z])/', '$1:/')}}
}
$scheduled=Get-ScheduledTask
$explorer=New-Object -ComObject Shell.Application
$tasks=(Get-Content -LiteralPath "$privateRoot\final-review-task-context.json" -Raw | ConvertFrom-Json).tasks
if($TargetIds){foreach($id in $TargetIds){if($id -notin $proposal.order){throw 'Unapproved ID'}}}
if($ResumeApprovedHolds){
    if(-not $TargetIds){throw 'Resumption requires explicit target IDs'}
    foreach($id in $TargetIds){if($id -notin @('T018','T043','T031','T020')){throw 'Target outside continuation approval'}}
}
foreach($id in $proposal.order) {
    if($TargetIds -and $id -notin $TargetIds){continue}
    $prior=@($journal | Where-Object id -eq $id)
    if($prior.Count -gt 1){throw 'Duplicate authoritative target records'}
    if($prior.Count){
        if($prior[0].status -eq 'removed'){continue}
        if(-not $ResumeApprovedHolds){continue}
        if($prior[0].status -ne 'skipped' -or $prior[0].linksRemoved -ne 0){throw 'Cannot resume a mutated or incomplete target'}
    }
    $t=$proposal.rows | Where-Object id -eq $id
    $r=[pscustomobject]@{id=$id;path=$t.path;status='checking';startedAt=[DateTime]::UtcNow.ToString('o');finishedAt=$null;reason=$null;linksRemoved=0;method=$null;verifiedFiles=0;dependencies=$null;previousAttempts=$prior}
    try {
        Assert-Canonical
        $literal=[IO.Path]::GetFullPath($t.path)
        if((N $literal) -ne (N $t.path) -or (Within $literal $forgeRoot)){throw 'Invalid or canonical target'}
        $parents=@($proposal.edges | Where-Object {$_[1] -eq $id} | ForEach-Object {$_[0]})
        foreach($child in $parents){if(-not @($journal | Where-Object {$_.id -eq $child -and $_.status -eq 'removed'}).Count){throw "Child/dependency $child was not removed"}}
        $app=Get-Content -LiteralPath "$privateRoot\final-batch-app-actions.json" -Raw | ConvertFrom-Json
        if($id -eq 'T020'){
            if($ResumeT020AfterReboot){
                # User reports reboot/no visible tabs. Recheck live task authority;
                # saved tab routes are not proof of an active editor. Do not write
                # raw app state or claim inaccessible buffers were inspected.
                & py -3 "$forgeRoot\docs\maintenance\inspect-t020-resumption.py" | Out-Null
                if($LASTEXITCODE -ne 0){throw 'Fresh T020 reference/task inspection failed'}
                $reference=Get-Content -LiteralPath "$privateRoot\t020-current-reference-inspection.json" -Raw | ConvertFrom-Json
                if((N $reference.target) -ne (N $literal) -or $reference.activeTaskDependencies.Count -or $reference.appStateModified){throw 'T020 reference evidence mismatch'}
            } elseif(-not $app.T020.tabClosed -or -not $app.T020.unsavedContentVerified){throw 'Obsolete app tab: unsaved-content check and closure not completed'}
        }
        foreach($task in $tasks){
            if(Within $task.cwd $literal){
                if($task.id -eq '01a094cb-ddd3-7f63-9552-a34de271f485' -and $app.T031.archived){continue}
                throw "Task dependency remains: $($task.id)"
            }
        }
        & py -3 "$forgeRoot\docs\maintenance\verify-final-removal.py" target $id
        if($LASTEXITCODE -ne 0){
            $failure=Get-Content -LiteralPath "$privateRoot\final-batch-check-$id.json" -Raw | ConvertFrom-Json
            throw "Content/link verification failed: $($failure.error)"
        }
        $check=Get-Content -LiteralPath "$privateRoot\final-batch-check-$id.json" -Raw | ConvertFrom-Json
        if(-not $check.ok -or (N $check.path) -ne (N $literal)){throw 'Verification binding failed'}
        $r.verifiedFiles=$check.verified
        foreach($m in $mounts){if(Within $m $literal){throw 'Container mount dependency'}}
        foreach($job in $scheduled){foreach($a in $job.Actions){if((N ([string]$a.Execute+' '+[string]$a.Arguments+' '+[string]$a.WorkingDirectory)).Contains((N $literal))){throw 'Scheduled-task dependency'}}}
        foreach($window in $explorer.Windows()){if($window.LocationURL -like 'file:*' -and (Within ([uri]$window.LocationURL).LocalPath $literal)){throw 'Explorer location dependency'}}
        $sourceFiles=@($check.entries | Where-Object {-not $_.directory -and $_.relative -notmatch '(^|/)(node_modules|dist|build|coverage|\.pnpm-store|\.vite)/'} | ForEach-Object {$_.path})
        $users=Get-ForgePathUsers -Target $literal -Files $sourceFiles
        $r.dependencies=[pscustomobject]@{at=[DateTime]::UtcNow.ToString('o');processes=@($users.processReferences);fileUsers=@($users.resourceUsers);mounts=0;scheduledTasks=0;explorer=0}
        if($users.processReferences.Count -or $users.resourceUsers.Count){throw 'Active process, terminal, or open-file dependency'}
        # Final metadata check: every regular item from the no-follow scan must
        # retain its type, size and write time immediately before unlinking.
        foreach($e in $check.entries){
            $item=[ForgeFinalLinkRemoval]::Describe($e.path)
            if($item.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Regular entry became a link'}
            if($item.PSIsContainer -ne $e.directory -or (-not $e.directory -and $item.Length -ne $e.size)){throw 'Entry type/size changed'}
            $ns=([DateTimeOffset]$item.LastWriteTimeUtc).ToUnixTimeMilliseconds()*1000000
            if([Math]::Abs($ns-[double]$e.mtimeNs) -gt 1000000){throw 'Entry write time changed'}
        }
        Assert-Canonical
        if(-not $ExecuteApprovedBatch){Write-Output "$id verified only";continue}
        $r.status='unlinking';foreach($old in $prior){[void]$journal.Remove($old)};$journal.Add($r);Save-Journal
        $linkLog=[IO.StreamWriter]::new("$privateRoot\final-batch-links-$id.jsonl",$true)
        try {
            foreach($link in $check.links){
                if(-not (Within $link.path $literal) -or (N $link.path) -eq (N $literal)){throw 'Link escaped target'}
                [ForgeFinalLinkRemoval]::Unlink($link.path,$link.metadataSha256,$link.kind)
                $r.linksRemoved++
                $linkLog.WriteLine((ConvertTo-Json -Compress -InputObject @{path=$link.path;metadataSha256=$link.metadataSha256;kind=$link.kind;removedAt=[DateTime]::UtcNow.ToString('o')}));$linkLog.Flush()
            }
        } finally {$linkLog.Dispose();Save-Journal}
        # Never hand a surviving link to Git or a recursive file remover.
        $pending=[Collections.Generic.Stack[string]]::new();$pending.Push($literal);$current=[Collections.Generic.List[object]]::new()
        $expected=@{};foreach($e in $check.entries){$expected[(N $e.path)]=$e}
        while($pending.Count){
            $item=[ForgeFinalLinkRemoval]::Describe($pending.Pop())
            if($item.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Surviving/unexpected link; no recursive fallback'}
            if(-not $expected.ContainsKey((N $item.FullName))){throw 'New item appeared after verification'}
            $e=$expected[(N $item.FullName)]
            if($item.PSIsContainer -ne $e.directory -or (-not $e.directory -and ($item.Length -ne $e.size -or [Math]::Abs(([DateTimeOffset]$item.LastWriteTimeUtc).ToUnixTimeMilliseconds()*1000000-[double]$e.mtimeNs) -gt 1000000))){throw 'File changed after verification'}
            $current.Add($item)
            if($item.PSIsContainer){foreach($child in [IO.Directory]::EnumerateFileSystemEntries($item.FullName)){$pending.Push($child)}}
        }
        if($current.Count -ne $expected.Count){throw 'Entry disappeared after verification'}
        Assert-Canonical
        $r.status='removing';Save-Journal
        if($t.type -eq 'linked_worktree') {
            # Invocation-only Windows path support; no Git/system setting is written.
            $args=@('-c','core.longpaths=true','-C',$forgeRoot,'worktree','remove')
            if($id -in @('T018','T022','T026')){$args+='--force';$r.method='git worktree remove --force (explicit three-target exception)'}else{$r.method='git worktree remove (no force)'}
            $args+=$literal
            $output=@(& git @args 2>&1)
            if($LASTEXITCODE -ne 0){throw ('Git removal refused: '+($output -join ' '))}
        } else {
            $r.method='PowerShell literal-path File.Delete/Directory.Delete(false), postorder, no force/attribute changes'
            # Delete only individually enumerated literal entries. These .NET
            # APIs do not expand wildcards and never recursively follow links.
            foreach($item in ($current | Sort-Object @{Expression={$_.FullName.Length};Descending=$true})) {
                $fresh=[ForgeFinalLinkRemoval]::Describe($item.FullName)
                if($fresh.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Link appeared during removal'}
                $exactPath=[ForgeFinalLinkRemoval]::ExtendedPath($fresh.FullName)
                if($fresh.PSIsContainer){[IO.Directory]::Delete($exactPath,$false)}else{[IO.File]::Delete($exactPath)}
            }
        }
        if(Test-Path -LiteralPath $literal){throw 'Target still present after removal'}
        $r.status='removed';$r.reason='Approved exact target removed; preserved evidence retained'
    } catch {
        $r.reason=$_.Exception.Message
        $r.status=if($r.linksRemoved -gt 0 -or $r.status -in @('unlinking','removing')){'partial_or_refused'}else{'skipped'}
    }
    $r.finishedAt=[DateTime]::UtcNow.ToString('o')
    if(-not $journal.Contains($r)){foreach($old in $prior){[void]$journal.Remove($old)};$journal.Add($r)}
    Save-Journal
    Write-Output "$id $($r.status): $($r.reason); links=$($r.linksRemoved)"
}
Assert-Canonical
