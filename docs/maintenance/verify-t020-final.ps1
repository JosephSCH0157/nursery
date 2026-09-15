# Post-removal audit only. Never starts a server or changes checkout state.
$ErrorActionPreference='Stop'
$forgeRoot='D:\nursery\nursery'
$privateRoot=Join-Path $forgeRoot '.git\forge-consolidation-private'
$env:GIT_OPTIONAL_LOCKS='0'
& py -3 (Join-Path $forgeRoot 'docs\maintenance\audit-final-removal-after.py')
if($LASTEXITCODE -ne 0){throw 'Preservation audit failed'}
$audit=Get-Content -LiteralPath "$privateRoot\final-batch-after.json" -Raw | ConvertFrom-Json
if($audit.removed -ne 45 -or $audit.remaining -ne 0){throw 'Removal incomplete'}
if(Test-Path -LiteralPath 'D:\nursery\forge-beta-preparation'){throw 'T020 still exists'}
if($audit.worktrees.Count -ne 1 -or $audit.remainingSources.Count -ne 1){throw 'Additional inventoried checkout remains'}
$pre=Get-Content -LiteralPath "$privateRoot\t020-resumption-prestate.json" -Raw | ConvertFrom-Json
if((Get-FileHash -LiteralPath "$forgeRoot\.git\config").Hash.ToLowerInvariant() -ne $pre.gitConfigSha256){throw 'Canonical Git configuration changed'}
$allowed=@('FORGE_EXACT_PATH_REMOVAL_REVIEW.md','FORGE_CONSOLIDATION_PRESERVATION_REPORT.md','FORGE_SINGLE_ROOT_CONSOLIDATION_REVIEW.md','run-final-forge-removal.ps1')
foreach($file in $pre.maintenance){
    if([IO.Path]::GetFileName($file.path) -notin $allowed -and (Get-FileHash -LiteralPath $file.path).Hash.ToLowerInvariant() -ne $file.sha256){throw 'Unrelated maintenance content changed'}
    $saved=Join-Path "$privateRoot\t020-resumption-prestate" ([IO.Path]::GetFileName($file.path))
    if((Get-FileHash -LiteralPath $saved).Hash.ToLowerInvariant() -ne $file.sha256){throw 'Maintenance prestate not preserved'}
}
$oldSource=@($pre.status | Where-Object {$_ -notmatch 'docs/maintenance/'})
$newSource=@(git -C $forgeRoot status --porcelain=v1 --untracked-files=all | Where-Object {$_ -notmatch 'docs/maintenance/'})
if(($oldSource -join "`n") -cne ($newSource -join "`n")){throw 'Non-maintenance working state changed'}
$listeners=@(Get-NetTCPConnection -State Listen -LocalPort 5173,5199 -ErrorAction SilentlyContinue)
if($listeners.Count){throw 'Both servers must remain stopped'}
$result=[pscustomobject]@{
    checkedAt=[DateTime]::UtcNow.ToString('o');T020Absent=$true
    soleRegisteredWorktree=$audit.worktrees[0].worktree;soleInventoriedSource=$audit.remainingSources[0].path
    refs=$audit.preservationRefs;retainedFiles=$audit.retainedFiles;gitObjects=$audit.gitContentObjects
    canonicalSourceStagingConfigurationUnchanged=$true;maintenancePrestateVerified=$true
    ports5173And5199Stopped=$true;noCommitPushDeploymentOrPaidCall=$true
}
[IO.File]::WriteAllText("$privateRoot\t020-final-postcheck.json",($result | ConvertTo-Json -Depth 5))
$result | ConvertTo-Json -Depth 5
