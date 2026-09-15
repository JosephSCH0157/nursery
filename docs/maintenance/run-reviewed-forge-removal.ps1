# One-shot execution of the 55 IDs approved on 2026-09-13; no scope expansion.
# Default is verification only. Never retries a removal with force.
param([switch]$ExecuteApprovedBatch, [string[]]$TargetIds)
$ErrorActionPreference = 'Stop'
$forgeRoot = 'D:\nursery\nursery'
$privateRoot = 'D:\nursery\nursery\.git\forge-consolidation-private'
. "$forgeRoot\docs\maintenance\forge-removal-process-audit.ps1"
$before = Get-Content -LiteralPath "$privateRoot\removal-batch-before.json" -Raw | ConvertFrom-Json
$taskContext = Get-Content -LiteralPath "$privateRoot\removal-task-context.json" -Raw | ConvertFrom-Json
$approved = @($before.targets)
if ($approved.Count -ne 55 -or $before.held.Count -ne 24) { throw 'Approval snapshot count mismatch' }
if ($TargetIds) {
    foreach ($id in $TargetIds) { if ($id -notin $approved.id) { throw 'Unapproved target ID' } }
    $approved = @($approved | Where-Object id -In $TargetIds)
}
$journalFile = "$privateRoot\removal-batch-journal.json"
$journal = [Collections.Generic.List[object]]::new()
if (Test-Path -LiteralPath $journalFile) {
    foreach ($entry in (Get-Content -LiteralPath $journalFile -Raw | ConvertFrom-Json)) { $journal.Add($entry) }
}
if ($ExecuteApprovedBatch) {
    $latestById = @{}
    foreach ($entry in $journal) { $latestById[$entry.id] = $entry }
    $terminalCount = @($before.targets | Where-Object {
        $latestById.ContainsKey($_.id) -and $latestById[$_.id].status -in @('removed','skipped','removal_refused_or_incomplete')
    }).Count
    if ($terminalCount -eq 55) { throw 'This reviewed batch is closed. Fresh review is required before any later removal batch.' }
}
function Save-Journal {
    [IO.File]::WriteAllText($journalFile, (ConvertTo-Json -InputObject @($journal.ToArray()) -Depth 12))
}
function Assert-Canonical {
    if ((Get-FileHash -LiteralPath "$forgeRoot\.git\index").Hash.ToLowerInvariant() -ne $before.indexSha256) { throw 'Canonical staging/index changed' }
    if ((git -C $forgeRoot rev-parse HEAD) -ne $before.head) { throw 'Canonical HEAD changed' }
    $listeners = @(Get-NetTCPConnection -State Listen -LocalPort 5173,5199 -ErrorAction SilentlyContinue)
    if (@($listeners | Where-Object { $_.LocalPort -eq 5173 -and $_.OwningProcess -eq 272572 }).Count -ne 1 -or @($listeners | Where-Object LocalPort -EQ 5199).Count) { throw 'Server state changed; batch halted without touching processes' }
}
function Normalize-PathText([string]$value) { $value.Replace('/', '\').TrimEnd('\').ToLowerInvariant() }
function Test-Within([string]$value,[string]$parent) {
    $v = Normalize-PathText $value
    $p = Normalize-PathText $parent
    $v -eq $p -or $v.StartsWith($p+'\')
}
# Docker is inspected only after availability succeeds; never start/repair it.
$dockerVersion = docker info --format '{{.ServerVersion}}' 2>$null
if ($LASTEXITCODE -ne 0) { throw 'Docker Desktop must be started manually; no Docker action attempted' }
$containerIds = @(docker ps -aq)
$mountSources = @()
foreach ($container in $containerIds) {
    $mounts = docker inspect --format '{{json .Mounts}}' $container | ConvertFrom-Json
    if ($LASTEXITCODE -ne 0) { throw 'Container mount inspection failed' }
    foreach ($mount in $mounts) {
        if ($mount.Type -eq 'bind') {
            $mountSources += ([string]$mount.Source -replace '^/run/desktop/mnt/host/([a-z])/', '$1:/')
        }
    }
}
$scheduledReferences = @()
foreach ($task in Get-ScheduledTask) {
    foreach ($action in $task.Actions) {
        $scheduledReferences += [pscustomobject]@{name=$task.TaskName;value=([string]$action.Execute+' '+[string]$action.Arguments+' '+[string]$action.WorkingDirectory)}
    }
}
$explorer = New-Object -ComObject Shell.Application
foreach ($target in $approved) {
    if (@($journal | Where-Object { $_.id -eq $target.id -and $_.status -eq 'removed' }).Count) { continue }
    Assert-Canonical
    $record = [ordered]@{id=$target.id;path=$target.path;type=$target.type;checkedAt=[DateTime]::UtcNow.ToString('o');status='skipped';reason=$null;method=$null;verifiedFiles=0;processReferences=@();resourceUsers=@()}
    try {
        node "$forgeRoot\docs\maintenance\verify-forge-removal-target.cjs" $target.id | Out-Null
        if ($LASTEXITCODE -ne 0) { throw 'Verification program failed' }
        $check = Get-Content -LiteralPath "$privateRoot\removal-check-$($target.id).json" -Raw | ConvertFrom-Json
        if (-not $check.ok) { throw $check.reason }
        if ($check.path -cne $target.path) { throw 'Target binding mismatch' }
        $record.verifiedFiles = $check.verifiedFiles
        $literalTarget = [IO.Path]::GetFullPath($target.path)
        if ((Normalize-PathText $literalTarget) -ne (Normalize-PathText $target.resolved)) { throw 'Resolved target mismatch' }
        if (Test-Within $literalTarget $forgeRoot) {
            if ($target.id -ne 'T079' -or $literalTarget -cne 'D:\nursery\nursery\%SystemDrive%') { throw 'Canonical-root exclusion' }
        }
        foreach ($held in $before.held) {
            if (Test-Within $held.path $literalTarget) { throw "Contains protected HOLD $($held.id)" }
        }
        foreach ($task in $taskContext.tasks) {
            if (Test-Within $task.cwd $literalTarget) { throw "Task still depends on target: $($task.id)" }
        }
        foreach ($mount in $mountSources) { if (Test-Within $mount $literalTarget) { throw 'Container bind mount depends on target' } }
        foreach ($task in $scheduledReferences) {
            if ((Normalize-PathText $task.value).Contains((Normalize-PathText $literalTarget))) { throw "Scheduled task depends on target: $($task.name)" }
        }
        foreach ($window in $explorer.Windows()) {
            if ($window.LocationURL -like 'file:*' -and (Test-Within ([uri]$window.LocationURL).LocalPath $literalTarget)) { throw 'Explorer window depends on target' }
        }
        $users = Get-ForgePathUsers -Target $literalTarget -Files @($check.files)
        $record.processReferences = @($users.processReferences)
        $record.resourceUsers = @($users.resourceUsers)
        if ($users.processReferences.Count -or $users.resourceUsers.Count) { throw 'Active process, terminal, or open-file dependency' }
        # Recheck every directory and file immediately before removal. Enumeration
        # never descends into a reparse point and must reproduce the checked tree.
        $expected = @{}
        foreach ($entry in $check.entries) { $expected[(Normalize-PathText $entry.path)] = $entry }
        $pending = [Collections.Generic.Stack[string]]::new()
        $pending.Push($literalTarget)
        $seen = 0
        while ($pending.Count) {
            $item = Get-Item -LiteralPath $pending.Pop() -Force
            if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Junction/symlink appeared after verification' }
            $key = Normalize-PathText $item.FullName
            if (-not $expected.ContainsKey($key)) { throw 'New item appeared after verification' }
            $previous = $expected[$key]
            if ($item.PSIsContainer -ne $previous.directory) { throw 'Item type changed after verification' }
            $mtime = ([DateTimeOffset]$item.LastWriteTimeUtc).ToUnixTimeMilliseconds()
            if ([Math]::Abs($mtime - $previous.mtimeMs) -gt 2 -or (-not $item.PSIsContainer -and $item.Length -ne $previous.size)) { throw 'Item changed after content verification' }
            $seen++
            if ($target.type -ne 'linked_worktree' -and ($item.Attributes -band ([IO.FileAttributes]::ReadOnly -bor [IO.FileAttributes]::Hidden -bor [IO.FileAttributes]::System))) { throw 'Protected attributes require separate removal review; no forced filesystem deletion' }
            if ($item.PSIsContainer) {
                foreach ($child in Get-ChildItem -LiteralPath $item.FullName -Force) { $pending.Push($child.FullName) }
            }
        }
        if ($seen -ne $expected.Count) { throw 'Item disappeared after verification' }
        Assert-Canonical
        if (-not $ExecuteApprovedBatch) { $record.status='verified_not_removed'; $record.reason='Verification-only run' }
        else {
            $record.status='removing'
            $record.method= if ($target.type -eq 'linked_worktree') { 'git worktree remove (no force)' } else { 'PowerShell Remove-Item -LiteralPath (no force, no directory links)' }
            $journal.Add([pscustomobject]$record); Save-Journal
            if ($target.type -eq 'linked_worktree') {
                $gitOutput = @(& git -C $forgeRoot worktree remove $literalTarget 2>&1)
                if ($LASTEXITCODE -ne 0) { throw ('Git refused unforced removal: '+($gitOutput -join ' ')) }
            } else {
                if ((Get-Item -LiteralPath $literalTarget -Force).PSIsContainer) { Remove-Item -LiteralPath $literalTarget -Recurse -ErrorAction Stop }
                else { Remove-Item -LiteralPath $literalTarget -ErrorAction Stop }
            }
            if (Test-Path -LiteralPath $literalTarget) { throw 'Removal returned but target remains' }
            $record.status='removed'
            $record.reason='Exact approved target removed after preservation and dependency checks'
        }
    } catch {
        $record.reason=$_.Exception.Message
        if ($record.status -eq 'removing') { $record.status='removal_refused_or_incomplete' } else { $record.status='skipped' }
    }
    $record.finishedAt=[DateTime]::UtcNow.ToString('o')
    $journal.Add([pscustomobject]$record); Save-Journal
    Write-Output "$($record.id): $($record.status) — $($record.reason)"
}
Assert-Canonical
