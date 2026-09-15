# Fresh read-only per-target non-process dependencies. No app-state mutations.
param([Parameter(Mandatory=$true)][string]$Id)
$ErrorActionPreference='Stop'
$privateRoot='D:\nursery\nursery\.git\forge-consolidation-private'
$p=Get-Content -LiteralPath "$privateRoot\final-removal-proposal.json" -Raw | ConvertFrom-Json
$target=$p.rows | Where-Object id -eq $Id
if(-not $target -or $p.checkedAt -ne '2026-09-13T09:40:07.646605+00:00'){throw 'Unapproved dependency target'}
function N([string]$v){$v.Replace('/','\').TrimEnd('\').ToLowerInvariant()}
function Within([string]$v,[string]$root){$v=N $v;$root=N $root;($v -eq $root -or $v.StartsWith($root+'\'))}
docker info --format '{{.ServerVersion}}' | Out-Null
if($LASTEXITCODE -ne 0){throw 'Docker Desktop must be started manually; mount authority unavailable'}
$mounts=@()
foreach($cid in @(docker ps -aq)){
    $rows=docker inspect --format '{{json .Mounts}}' $cid | ConvertFrom-Json
    if($LASTEXITCODE -ne 0){throw 'Fresh mount inspection failed'}
    foreach($r in $rows){if($r.Type -eq 'bind'){$source=([string]$r.Source -replace '^/run/desktop/mnt/host/([a-z])/', '$1:/');if(Within $source $target.path){$mounts+=$source}}}
}
$scheduled=@(Get-ScheduledTask | Where-Object {
    @($_.Actions | Where-Object {(N ([string]$_.Execute+' '+[string]$_.Arguments+' '+[string]$_.WorkingDirectory)).Contains((N $target.path))}).Count -gt 0
} | Select-Object TaskPath,TaskName)
$shell=New-Object -ComObject Shell.Application
$explorer=@($shell.Windows() | Where-Object {$_.LocationURL -like 'file:*' -and (Within ([uri]$_.LocationURL).LocalPath $target.path)} | ForEach-Object {$_.LocationURL})
$result=@{id=$Id;at=[DateTime]::UtcNow.ToString('o');mounts=$mounts;scheduledTasks=$scheduled;explorer=$explorer}
[IO.File]::WriteAllText("$privateRoot\final-batch-fresh-dependencies-$Id.json",(ConvertTo-Json -InputObject $result -Depth 6))
if($mounts.Count -or $scheduled.Count -or $explorer.Count){throw 'Fresh dependency detected'}
