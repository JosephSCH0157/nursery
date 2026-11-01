[CmdletBinding()]
param(
  [Parameter(Mandatory)][ValidateSet('CreateManagementApi')][string]$Action,
  [Parameter(Mandatory)][string]$ProjectRef,
  [Parameter(Mandatory)][string]$RecoveryOperator,
  [Parameter(Mandatory)][string]$RestoreAuthorizer,
  [Parameter(Mandatory)][string]$OwnerApprovalReference,
  [Parameter(Mandatory)][string]$OutputName,
  [switch]$AcknowledgeRestoreScope,
  [switch]$AcknowledgeUnrelatedDataImpact
)

$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'lib/forge-managed-credential.ps1')
if(-not $AcknowledgeRestoreScope){throw 'Whole-database restore-scope acknowledgment is required.'}
if(-not $AcknowledgeUnrelatedDataImpact){throw 'Unrelated-data impact acknowledgment is required.'}
$collector=Join-Path $PSScriptRoot 'collect-hosted-recovery-readiness-evidence.mjs'
Invoke-WithForgeManagedSupabaseCapacityReadCredential -Operation {
  & node $collector --action Create --project-ref $ProjectRef `
    --recovery-operator $RecoveryOperator --restore-authorizer $RestoreAuthorizer `
    --owner-approval-reference $OwnerApprovalReference --output-name $OutputName `
    --acknowledge-restore-scope --acknowledge-unrelated-data-impact
  if($LASTEXITCODE -ne 0){throw 'Authenticated Supabase backup evidence collection failed.'}
}
