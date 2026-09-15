# Read-only dependency audit. Does not close tabs, change task/configuration state,
# unlink directories, stop servers, or alter Docker.
$ErrorActionPreference = 'Stop'
$forgePrivate = 'D:\nursery\nursery\.git\forge-consolidation-private'
. 'D:\nursery\nursery\docs\maintenance\forge-removal-process-audit.ps1'
$targets = Get-Content -LiteralPath "$forgePrivate\final-review-scan.json" -Raw | ConvertFrom-Json
$results = [Collections.Generic.List[object]]::new()
$taskRecords = Get-Content -LiteralPath "$forgePrivate\removal-task-context.json" -Raw | ConvertFrom-Json
function Forge-Normalize([string]$p) { $p.Replace('/','\').TrimEnd('\').ToLowerInvariant() }
function Forge-Within([string]$p,[string]$root) { $v=Forge-Normalize $p; $r=Forge-Normalize $root; $v -eq $r -or $v.StartsWith($r+'\') }
$mounts=@()
docker info --format '{{.ServerVersion}}' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Docker Desktop must be started manually; no repair attempted' }
foreach ($id in @(docker ps -aq)) {
    $data = docker inspect --format '{{json .Mounts}}' $id | ConvertFrom-Json
    if ($LASTEXITCODE -ne 0) { throw 'Mount inspection failed' }
    foreach ($mount in $data) {
        if ($mount.Type -eq 'bind') { $mounts += ([string]$mount.Source -replace '^/run/desktop/mnt/host/([a-z])/', '$1:/') }
    }
}
$scheduled=Get-ScheduledTask
$explorer=New-Object -ComObject Shell.Application
foreach ($target in $targets) {
    $files=@($target.files | ForEach-Object { Join-Path $target.path $_.path })
    $users=Get-ForgePathUsers -Target $target.path -Files $files
    $taskDependencies=@($taskRecords.tasks | Where-Object { Forge-Within $_.cwd $target.path } | Select-Object id,cwd,status)
    $mountDependencies=@($mounts | Where-Object { Forge-Within $_ $target.path })
    $scheduleDependencies=@($scheduled | Where-Object {
        $needle=Forge-Normalize $target.path
        @($_.Actions | Where-Object { (Forge-Normalize ([string]$_.Execute+' '+[string]$_.Arguments+' '+[string]$_.WorkingDirectory)).Contains($needle) }).Count -gt 0
    } | Select-Object TaskPath,TaskName)
    $explorerDependencies=@($explorer.Windows() | Where-Object { $_.LocationURL -like 'file:*' -and (Forge-Within ([uri]$_.LocationURL).LocalPath $target.path) } | ForEach-Object { $_.LocationURL })
    $row=[pscustomobject]@{id=$target.id;checkedAt=[DateTime]::UtcNow.ToString('o');processReferences=@($users.processReferences);resourceUsers=@($users.resourceUsers);tasks=$taskDependencies;mounts=$mountDependencies;scheduledTasks=$scheduleDependencies;explorer=$explorerDependencies}
    $results.Add($row)
    [IO.File]::WriteAllText("$forgePrivate\final-review-dependencies.json",(ConvertTo-Json -InputObject @($results.ToArray()) -Depth 12))
    Write-Output "$($row.id): process=$($row.processReferences.Count) fileUsers=$($row.resourceUsers.Count) tasks=$($row.tasks.Count) mounts=$($row.mounts.Count) scheduled=$($row.scheduledTasks.Count) explorer=$($row.explorer.Count)"
}
