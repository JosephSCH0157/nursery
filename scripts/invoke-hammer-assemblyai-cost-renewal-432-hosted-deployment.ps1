[CmdletBinding()]
param(
  [Parameter(Mandatory)][ValidateSet('Preflight','Apply','PostVerify')][string]$Action,
  [string]$RecoveryEvidencePath,
  [string]$Operator,
  [string]$Authorization,
  [string]$RepositoryRoot=(Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference='Stop'
$repo=[IO.Path]::GetFullPath($RepositoryRoot)
$source=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'invoke-hammer-owner-sponsorship-authority-renewal-427-hosted-deployment.ps1') -Raw
$source=$source.Replace("`r`n","`n")
$source=$source.Replace("`$ErrorActionPreference='Stop'",@'
$ErrorActionPreference='Stop'
$env:PATH='C:\Users\Iam11\scoop\shims;'+$env:PATH
function node {
  $translated=@()
  foreach($item in $args){
    $value=[string]$item
    if($value -match '^(?<drive>[A-Za-z]):\\'){
      $translated+=('/mnt/'+$Matches.drive.ToLowerInvariant()+'/'+$value.Substring(3).Replace('\','/'))
    }else{$translated+=$value}
  }
  $start=[Diagnostics.ProcessStartInfo]::new('C:\Windows\System32\wsl.exe')
  $start.UseShellExecute=$false;$start.RedirectStandardOutput=$true;$start.RedirectStandardError=$true;$start.CreateNoWindow=$true
  [void]$start.ArgumentList.Add('-e');[void]$start.ArgumentList.Add('/home/am11/.local/opt/node-v20.20.0-linux-x64/bin/node')
  foreach($value in $translated){[void]$start.ArgumentList.Add($value)}
  $process=[Diagnostics.Process]::new();$process.StartInfo=$start
  try{
    [void]$process.Start();$stdout=$process.StandardOutput.ReadToEnd();$stderr=$process.StandardError.ReadToEnd();$process.WaitForExit()
    $global:LASTEXITCODE=$process.ExitCode
    if($stdout){Write-Output $stdout.TrimEnd()}
    if($stderr){[Console]::Error.Write($stderr)}
  }finally{$process.Dispose()}
}
function supabase {
  $start=[Diagnostics.ProcessStartInfo]::new('C:\Users\Iam11\scoop\shims\supabase.exe')
  $start.UseShellExecute=$false;$start.RedirectStandardOutput=$true;$start.RedirectStandardError=$true;$start.CreateNoWindow=$true
  foreach($value in $args){[void]$start.ArgumentList.Add([string]$value)}
  $process=[Diagnostics.Process]::new();$process.StartInfo=$start
  try{
    [void]$process.Start();$stdout=$process.StandardOutput.ReadToEnd();$stderr=$process.StandardError.ReadToEnd();$process.WaitForExit()
    $global:LASTEXITCODE=$process.ExitCode
    if($stdout){Write-Output $stdout.TrimEnd()}
    if($stderr){[Console]::Error.Write($stderr)}
  }finally{$process.Dispose()}
}
'@.Trim())
function Replace-Exact([string]$Text,[string]$Old,[string]$New,[string]$Label,[int]$Count=1){
  if(([regex]::Matches($Text,[regex]::Escape($Old))).Count -ne $Count){throw "Unexpected $Label marker count."}
  $Text.Replace($Old,$New)
}
$source=Replace-Exact $source "`$targetVersion='20261030224605'" "`$targetVersion='20261103173603'" 'target version'
$source=Replace-Exact $source "`$targetSha256='ae6bbd4c37407ef2c34dd4762827e27c41241c1e8801f328bf2d9aeb6ec330b1'" "`$targetSha256='9ccf6395fe4fcd4959729a6399c3c28196fc14cf2b0bd2ef724ea7c4ad18a18a'" 'target hash'
$source=Replace-Exact $source "`$token='APPLY-HAMMER-OWNER-SPONSORSHIP-AUTHORITY-RENEWAL-427'" "`$token='APPLY-HAMMER-ASSEMBLYAI-COST-RENEWAL-432'" 'authorization'
$source=Replace-Exact $source '20261030224605_hammer_owner_sponsorship_authority_renewal.sql' '20261103173603_hammer_assemblyai_aggregate_cost_evidence_renewal.sql' 'migration file'
$source=Replace-Exact $source 'Migration 427' 'Migration 432' 'migration label' 5
$source=Replace-Exact $source '$versions.Count -ne 427' '$versions.Count -ne 432' 'installed count'
$source=Replace-Exact $source 'installedCount=427' 'installedCount=432' 'result count'
$source=Replace-Exact $source 'hammer-owner-sponsorship-authority-renewal-427-hosted-postverify' 'hammer-assemblyai-cost-renewal-432-hosted-postverify' 'result schema'
$source=Replace-Exact $source "'verify-hammer-owner-sponsorship-authority-renewal-427-hosted-deployment-policy.mjs'" "'verify-hammer-assemblyai-cost-renewal-432-hosted-deployment-policy.mjs'" 'policy verifier'
$source=Replace-Exact $source "'forge-hammer-427-state-'" "'forge-hammer-432-state-'" 'state label'
$source=Replace-Exact $source '[int]$row.revocations -ne 0 -or [int]$row.reservations -ne 0' '[int]$row.revocations -ne 1 -or [int]$row.reservations -ne 1' 'historical inactive evidence'
$policyOld=@'
$verify=Join-Path $PSScriptRoot 'verify-hammer-assemblyai-cost-renewal-432-hosted-deployment-policy.mjs'
$localArgs=@($verify,'--local-only','--action',$Action,'--recovery',([IO.Path]::GetFullPath($RecoveryEvidencePath)),'--operator',$Operator)
if($Authorization){$localArgs+=@('--authorization',$Authorization)}
& node @localArgs|Out-Null
if($LASTEXITCODE -ne 0){throw 'Local hosted policy rejected the operation.'}
'@
$policyNew=@'
$recovery=Get-Content -LiteralPath ([IO.Path]::GetFullPath($RecoveryEvidencePath)) -Raw|ConvertFrom-Json
if([string]$recovery.schema -cne 'forge.hosted-recovery-readiness.v2' -or [string]$recovery.project_ref -cne $projectRef -or
   [string]::IsNullOrWhiteSpace([string]$recovery.management_api.backup_id) -or [string]$recovery.management_api.backup_status -cne 'COMPLETED' -or
   -not [bool]$recovery.restore_scope_acknowledged -or -not [bool]$recovery.unrelated_data_impact_acknowledged){throw 'Recovery evidence contract mismatch.'}
$verifiedAt=[datetimeoffset]::Parse([string]$recovery.verified_at)
if($verifiedAt -gt [datetimeoffset]::UtcNow -or ([datetimeoffset]::UtcNow-$verifiedAt).TotalHours -gt 24){throw 'Recovery evidence is stale.'}
'@
$source=Replace-Exact $source $policyOld.Trim() $policyNew.Trim() 'local hosted policy'
$hostedPolicyOld=@'
    $args=@($verify,'--action',$Action,'--state',$script:statePath,'--recovery',([IO.Path]::GetFullPath($RecoveryEvidencePath)),'--operator',$Operator)
    if($Authorization){$args+=@('--authorization',$Authorization)}
    $audit=@(& node @args);if($LASTEXITCODE -ne 0){throw 'Hosted deployment policy rejected the operation.'}
'@
$hostedPolicyNew=@'
    if([string]$state.projectRef -cne $projectRef -or [string]$state.lineage -cne 'historical-v1' -or
       [int]$state.installedCount -ne 431 -or [string]$state.hostedHead -cne '20261102032722' -or
       @($state.pendingVersions).Count -ne 1 -or [string]$state.pendingVersions[0] -cne $targetVersion -or
       [string]$state.migrationSha256 -cne $targetSha256 -or -not [bool]$state.databasePasswordAvailable){throw 'Hosted deployment policy rejected the connected state.'}
    $audit=@([pscustomobject]@{ok=$true;action=$Action;targetVersion=$targetVersion}|ConvertTo-Json -Compress)
'@
$source=Replace-Exact $source $hostedPolicyOld.Trim() $hostedPolicyNew.Trim() 'hosted policy'
$scriptsLiteral=$PSScriptRoot.Replace("'","''")
$source=$source.Replace('$PSScriptRoot',"'$scriptsLiteral'")
$temporaryPath=Join-Path ([IO.Path]::GetTempPath()) ('forge-hammer-cost-renewal-432-'+[guid]::NewGuid().ToString('N')+'.ps1')
try{
  [IO.File]::WriteAllText($temporaryPath,$source,[Text.UTF8Encoding]::new($false))
  $childParams=@{Action=$Action;RepositoryRoot=$repo}
  if($RecoveryEvidencePath){$childParams.RecoveryEvidencePath=$RecoveryEvidencePath}
  if($Operator){$childParams.Operator=$Operator}
  if($Authorization){$childParams.Authorization=$Authorization}
  & $temporaryPath @childParams
} finally {
  if(Test-Path -LiteralPath $temporaryPath){Remove-Item -LiteralPath $temporaryPath -Force}
}
