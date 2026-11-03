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
function Replace-Exact([string]$Text,[string]$Old,[string]$New,[string]$Label,[int]$Count=1){
  if(([regex]::Matches($Text,[regex]::Escape($Old))).Count -ne $Count){throw "Unexpected $Label marker count."}
  $Text.Replace($Old,$New)
}
$source=Replace-Exact $source "`$targetVersion='20261030224605'" "`$targetVersion='20261103173603'" 'target version'
$source=Replace-Exact $source "`$targetSha256='ae6bbd4c37407ef2c34dd4762827e27c41241c1e8801f328bf2d9aeb6ec330b1'" "`$targetSha256='9ccf6395fe4fcd4959729a6399c3c28196fc14cf2b0bd2ef724ea7c4ad18a18a'" 'target hash'
$source=Replace-Exact $source "`$token='APPLY-HAMMER-OWNER-SPONSORSHIP-AUTHORITY-RENEWAL-427'" "`$token='APPLY-HAMMER-ASSEMBLYAI-COST-RENEWAL-432'" 'authorization'
$source=Replace-Exact $source '20261030224605_hammer_owner_sponsorship_authority_renewal.sql' '20261103173603_hammer_assemblyai_aggregate_cost_evidence_renewal.sql' 'migration file'
$source=Replace-Exact $source 'Migration 427' 'Migration 432' 'migration label' 8
$source=Replace-Exact $source '$versions.Count -ne 427' '$versions.Count -ne 432' 'installed count'
$source=Replace-Exact $source 'installedCount=427' 'installedCount=432' 'result count'
$source=Replace-Exact $source 'hammer-owner-sponsorship-authority-renewal-427-hosted-postverify' 'hammer-assemblyai-cost-renewal-432-hosted-postverify' 'result schema'
$source=Replace-Exact $source "'verify-hammer-owner-sponsorship-authority-renewal-427-hosted-deployment-policy.mjs'" "'verify-hammer-assemblyai-cost-renewal-432-hosted-deployment-policy.mjs'" 'policy verifier'
$source=Replace-Exact $source "'forge-hammer-427-state-'" "'forge-hammer-432-state-'" 'state label'
$scriptsLiteral=$PSScriptRoot.Replace("'","''")
$source=$source.Replace('$PSScriptRoot',"'$scriptsLiteral'")
$temporaryPath=Join-Path ([IO.Path]::GetTempPath()) ('forge-hammer-cost-renewal-432-'+[guid]::NewGuid().ToString('N')+'.ps1')
try{
  [IO.File]::WriteAllText($temporaryPath,$source,[Text.UTF8Encoding]::new($false))
  $arguments=@('-NoProfile','-File',$temporaryPath,'-Action',$Action,'-RepositoryRoot',$repo)
  if($RecoveryEvidencePath){$arguments+=@('-RecoveryEvidencePath',$RecoveryEvidencePath)}
  if($Operator){$arguments+=@('-Operator',$Operator)}
  if($Authorization){$arguments+=@('-Authorization',$Authorization)}
  & pwsh @arguments
  if($LASTEXITCODE -ne 0){throw 'Migration 432 hosted deployment failed.'}
} finally {
  if(Test-Path -LiteralPath $temporaryPath){Remove-Item -LiteralPath $temporaryPath -Force}
}
