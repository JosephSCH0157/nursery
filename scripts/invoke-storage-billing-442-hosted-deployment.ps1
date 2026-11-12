[CmdletBinding()]
param(
  [Parameter(Mandatory)][ValidateSet('Preflight','Apply','PostVerify')][string]$Action,
  [string]$RecoveryEvidencePath,
  [string]$PredecessorAuthorizationSha256,
  [Parameter(Mandatory)][string]$Operator,
  [string]$Authorization,
  [string]$AuthorizationSha256=$env:FORGE_442_APPLY_AUTHORIZATION_SHA256,
  [string]$RepositoryRoot=(Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference='Stop'
$repo=[IO.Path]::GetFullPath($RepositoryRoot)
$projectRef='wtvdjndyxegudufrompx'
$certifiedPayloadCommit='d3a481eaf5b688cbefe4ad1314a52446d5bd6a22'
$predecessorVersion='20261111180013'
$targetVersion='20261111185031'
$migrationFile='supabase/migrations/20261111185031_storage_capacity_statement_enforcement.sql'
$migrationSha256='6f857b1cf4c971054cc01d268737496229b516048ed8119deb87d113f0f67080'
$toolingFiles=[ordered]@{
  'scripts/lib/forge-managed-credential.ps1'='0ee16772df82974e687331598cabccf9383833a843df36d3c6b8d978e03e65cb'
  'scripts/lib/forge-supabase-cli.ps1'='0dfef4516e848f1eadcebfe6b5f4a7084b5e187a53a95c83fe0b6cfc16bd7ec2'
  'scripts/lib/forge-node-runtime.ps1'='ac8fa576285b0c86dca2a5b22b8b4d1b1b7a38c2d2a7ddcb7e3e55c61f931ee8'
  'scripts/lib/forge-git-runtime.ps1'='ae9f00b08f767933b6eef3871d604170801d5b9e5382c9f6ae6a8040afc1f3fe'
  'scripts/lib/forge-strict-csv-boolean.ps1'='c945f862c7d19ec9d9c0456b915356b63d7073a9dab741226044843c1bce526c'
  'scripts/invoke-frozen-git-evidence.ps1'='dc9ca51ce59b1d8ee446c6c34cb8c1d3223825871bdf96bd4d934581c170d6ce'
  'scripts/verify-supabase-lineage.ps1'='8b65b650337271ff3e0798706f46ca0fc96068063d0051c56b5bd2468721b8bc'
  'scripts/collect-hosted-recovery-readiness-evidence.mjs'='aa92b1b0e5fe84a331fb98ff1c2d9f1cd489befa934ab5c9b17d097aac565dd2'
  'scripts/lib/hosted-recovery-readiness-policy.mjs'='753a235140a77e3c3e85f2eb3a6ca74957430e1848f1ec8be01770c3b0eb45d3'
}
$releaseToolingPaths=@('scripts/invoke-storage-billing-441-hosted-deployment.ps1','scripts/invoke-storage-billing-442-hosted-deployment.ps1','scripts/invoke-storage-billing-443-hosted-deployment.ps1','scripts/invoke-storage-billing-444-hosted-deployment.ps1','scripts/verify-storage-billing-441-hosted-deployment-policy.mjs','scripts/verify-storage-billing-442-hosted-deployment-policy.mjs','scripts/verify-storage-billing-443-hosted-deployment-policy.mjs','scripts/verify-storage-billing-444-hosted-deployment-policy.mjs','scripts/lib/storage-hosted-release-contract.mjs','scripts/prepare-storage-hosted-workdir.mjs','supabase/tests/storage_billing_hosted_release_contract.sql')
. (Join-Path $PSScriptRoot 'lib/forge-managed-credential.ps1')
. (Join-Path $PSScriptRoot 'lib/forge-supabase-cli.ps1')
. (Join-Path $PSScriptRoot 'lib/forge-node-runtime.ps1')
. (Join-Path $PSScriptRoot 'lib/forge-git-runtime.ps1')
. (Join-Path $PSScriptRoot 'lib/forge-strict-csv-boolean.ps1')

function Invoke-Supabase([string[]]$Arguments){Invoke-ForgeSupabaseCli -Arguments $Arguments}
function Read-LinkedCsv([string]$Sql,[string[]]$Columns,[string]$Context){
  $result=Invoke-Supabase @('db','query','--linked','--agent=no','--output','csv','--workdir',$repo,$Sql)
  @(ConvertFrom-ForgeSupabaseCsv -StandardOutput $result.StandardOutput -ExpectedColumns $Columns -Context $Context)
}
function Assert-StaticPrerequisites {
  foreach($path in $releaseToolingPaths){
    $tracked=(Invoke-ForgeGit -Arguments @('-C',$repo,'ls-files','--error-unmatch','--',$path)).StandardOutput.Trim()
    if($tracked -cne $path){throw 'Release tooling must be committed.'}
    Invoke-ForgeGit -Arguments @('-C',$repo,'diff','--exit-code','HEAD','--',$path)|Out-Null
  }
  $linked=(Get-Content -LiteralPath (Join-Path $repo 'supabase/.temp/project-ref') -Raw).Trim()
  if($linked -cne $projectRef){throw 'Linked project does not match the pinned Forge project.'}
  if((Invoke-Supabase @('--version')).StandardOutput.Trim() -cne '2.84.2'){throw 'Supabase CLI 2.84.2 is required.'}
  foreach($entry in $toolingFiles.GetEnumerator()){
    $path=Join-Path $repo $entry.Key
    if(-not(Test-Path -LiteralPath $path -PathType Leaf) -or
       (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant() -cne $entry.Value){
      throw "Governed tooling dependency drifted: $($entry.Key)"
    }
  }
  $migrationPath=Join-Path $repo $migrationFile
  if(-not(Test-Path -LiteralPath $migrationPath -PathType Leaf) -or
     (Get-FileHash -LiteralPath $migrationPath -Algorithm SHA256).Hash.ToLowerInvariant() -cne $migrationSha256){
    throw 'Migration 442 SHA-256 mismatch.'
  }
  $head=(Invoke-ForgeGit -Arguments @('-C',$repo,'rev-parse','HEAD')).StandardOutput.Trim()
  Invoke-ForgeGit -Arguments @('-C',$repo,'merge-base','--is-ancestor',$certifiedPayloadCommit,$head)|Out-Null
  $tracked=(Invoke-ForgeGit -Arguments @('-C',$repo,'ls-tree','-r','--name-only','HEAD','--',$migrationFile)).StandardOutput.Trim()
  if($tracked -cne $migrationFile){throw 'Migration 442 is not the reviewed committed artifact.'}
  Invoke-ForgeGit -Arguments @('-C',$repo,'diff','--quiet',$certifiedPayloadCommit,'--',$migrationFile)|Out-Null
}
function New-TrustedRecoveryApiObservation([string]$EvidencePath){
  $evidence=Get-Content -LiteralPath $EvidencePath -Raw|ConvertFrom-Json
  if([string]$evidence.schema -cne 'forge.hosted-recovery-readiness.v2' -or [string]::IsNullOrWhiteSpace([string]$evidence.management_api.backup_id)){
    throw 'Migration 442 requires authenticated Management API recovery evidence.'
  }
  $collector=Join-Path $PSScriptRoot 'collect-hosted-recovery-readiness-evidence.mjs'
  $observation=Invoke-WithForgeManagedSupabaseCapacityReadCredential -Operation {
    $result=Invoke-ForgeNode -RepositoryRoot $repo -Arguments @($collector,'--action','Observe','--project-ref',$projectRef,'--expected-backup-id',([string]$evidence.management_api.backup_id))
    $result.StandardOutput.Trim()
  }
  $path=Join-Path ([IO.Path]::GetTempPath()) ('forge-storage-billing-442-observation-'+[guid]::NewGuid().ToString('N')+'.json')
  [IO.File]::WriteAllText($path,$observation,[Text.UTF8Encoding]::new($false));$path
}
function Get-Containment {
  $sql=Get-Content -LiteralPath (Join-Path $repo 'supabase/tests/storage_billing_hosted_release_contract.sql') -Raw
  $rows=@(Read-LinkedCsv $sql @('storage_stage','financial_mode','storage_contract_ok') 'Storage release contract')
  if($rows.Count -ne 1){throw 'Storage release contract unavailable.'}
  $lineage=@(Read-LinkedCsv 'select lineage from forge_meta.database_lineage where singleton' @('lineage') 'Lineage')
  if($lineage.Count -ne 1){throw 'Lineage unavailable.'}
  @{lineage=[string]$lineage[0].lineage;storageStage=[int]$rows[0].storage_stage;financialMode=[string]$rows[0].financial_mode;
    storageContractOk=(ConvertFrom-ForgeStrictCsvBoolean -Value $rows[0].storage_contract_ok -FieldName 'storage_contract_ok')}
}
function Get-ProtectedAuthorityFingerprint {
  $sql=@'
with protected(value) as (
 select 'scope|'||to_jsonb(x)::text from tongs.customer_paid_execution_scope_authorizations x
 union all select 'activation|'||to_jsonb(x)::text from tongs.owner_paid_execution_canary_activation_revisions x
 union all select 'capacity|'||to_jsonb(x)::text from tongs.hammer_first_transcription_capacity_authorities x
 union all select 'hammer_activation|'||to_jsonb(x)::text from tongs.hammer_first_transcription_activation_authorities x
 union all select 'budget|'||to_jsonb(x)::text from tongs.owner_operating_budgets x
 union all select 'budget_revision|'||to_jsonb(x)::text from tongs.owner_operating_budget_revisions x
 union all select 'funding_preference|'||to_jsonb(x)::text from tongs.ai_funding_preference_revisions x
 union all select 'openai_binding|'||to_jsonb(x)::text from tongs.openai_text_funding_bindings x
 union all select 'runway_binding|'||to_jsonb(x)::text from tongs.runway_funding_bindings x
 union all select 'aggregate_assignment|'||to_jsonb(x)::text from tongs.paid_execution_aggregate_assignments x
 union all select 'aggregate_policy|'||to_jsonb(x)::text from tongs.restricted_beta_policy_revisions x
 union all select 'aggregate_capability|'||to_jsonb(x)::text from tongs.restricted_beta_policy_capabilities x
 union all select 'cost_evidence|'||to_jsonb(x)::text from tongs.restricted_beta_cost_evidence_revisions x
 union all select 'quote|'||to_jsonb(x)::text from tongs.customer_spending_quotes x
 union all select 'reservation|'||to_jsonb(x)::text from tongs.funding_reservations x
 union all select 'operation|'||to_jsonb(x)::text from tongs.hammer_transcription_operations x
 union all select 'attempt|'||to_jsonb(x)::text from tongs.hammer_transcription_provider_attempts x
 union all select 'supplier_expense|'||to_jsonb(x)::text from tongs.supplier_expenses x
 union all select 'journal_event|'||to_jsonb(x)::text from tongs.accounting_journal_events x
 union all select 'billing_subscription|'||to_jsonb(x)::text from tongs.billing_subscriptions x
 union all select 'service_receipt|'||to_jsonb(x)::text from tongs.subscription_cycle_receipts x
 union all select 'financial_mode|'||to_jsonb(x)::text from tongs.financial_runtime_environment_revisions x
 union all select 'journal_entry|'||to_jsonb(x)::text from tongs.accounting_journal_entries x
)
select encode(extensions.digest(coalesce(string_agg(value,E'\n' order by value),''),'sha256'),'hex') as protected_authority_sha256 from protected;
'@
  $rows=@(Read-LinkedCsv $sql @('protected_authority_sha256') 'protected financial authority')
  if($rows.Count -ne 1 -or [string]$rows[0].protected_authority_sha256 -notmatch '^[0-9a-f]{64}$'){throw 'Protected financial authority fingerprint is unavailable.'}
  [string]$rows[0].protected_authority_sha256
}
function Get-HostedState {
  Assert-StaticPrerequisites
  & (Join-Path $PSScriptRoot 'verify-supabase-lineage.ps1') -Lineage historical -Workdir $repo -DatabaseTarget linked -Mode preflight -RepositoryRoot $repo|Out-Null
  $history=@(Read-LinkedCsv 'select version from supabase_migrations.schema_migrations order by version' @('version') 'hosted history');$versions=@($history|ForEach-Object{[string]$_.version})
  $local=@(Get-ChildItem -LiteralPath (Join-Path $releaseWorkdir 'supabase/migrations') -Filter '*.sql' -File|Sort-Object Name|ForEach-Object{if($_.BaseName -match '^(\d{8,14})_'){$Matches[1]}})
  $containment=Get-Containment
  $state=[ordered]@{projectRef=$projectRef;certifiedPayloadCommit=$certifiedPayloadCommit;payloadProvenanceOk=$true;lineage=$containment.lineage;installedCount=$versions.Count;hostedHead=$versions[-1];pendingVersions=@($local|Where-Object{$_ -notin $versions});migrationSha256=$migrationSha256;databasePasswordAvailable=$true;protectedAuthoritySha256=Get-ProtectedAuthorityFingerprint}
  foreach($entry in $containment.GetEnumerator()){$state[$entry.Key]=$entry.Value}
  $state.predecessorVerified=$true
  if($Action -ne 'PostVerify'){
    if($PredecessorAuthorizationSha256 -notmatch '^[0-9a-f]{64}$'){throw 'Previous stage PostVerify commitment required.'}
    $previousPath=Join-Path $repo ('.git/forge-private-evidence/used/storage-billing-441-verified-'+$PredecessorAuthorizationSha256+'.json')
    $previous=Get-Content -LiteralPath $previousPath -Raw | ConvertFrom-Json
    if($previous.project_ref -cne $projectRef -or $previous.payload_commit -cne $certifiedPayloadCommit -or $previous.target_version -cne $predecessorVersion -or $previous.authorization_sha256 -cne $PredecessorAuthorizationSha256 -or $previous.protected_authority_sha256 -cne $state.protectedAuthoritySha256){throw 'Previous stage verification or financial continuity mismatch.'}
  }
  $state
}
function Write-State([object]$State){$path=Join-Path ([IO.Path]::GetTempPath()) ('forge-storage-billing-442-state-'+[guid]::NewGuid().ToString('N')+'.json');[IO.File]::WriteAllText($path,($State|ConvertTo-Json -Depth 8 -Compress),[Text.UTF8Encoding]::new($false));$path}
function Invoke-Policy([object]$State,[string]$ObservationPath=$null,[string]$PolicyAction=$Action){
  $statePath=Write-State $State
  try{
    $args=@((Join-Path $PSScriptRoot 'verify-storage-billing-442-hosted-deployment-policy.mjs'),'--action',$PolicyAction,'--state',$statePath,'--operator',$Operator)
    if($PolicyAction -ne 'PostVerify'){$args+=@('--recovery',([IO.Path]::GetFullPath($RecoveryEvidencePath)),'--observation',$ObservationPath)}
    if($Authorization){$args+=@('--authorization',$Authorization)}
    if($AuthorizationSha256){$args+=@('--authorization-sha256',$AuthorizationSha256)}
    $result=Invoke-ForgeNode -RepositoryRoot $repo -Arguments $args;$result.StandardOutput.Trim()|ConvertFrom-Json
  } finally {Remove-Item -LiteralPath $statePath -Force -ErrorAction SilentlyContinue}
}
function Register-RecoveryEvidenceUse([string]$UseKey){
  if($UseKey -notmatch '^[0-9a-f]{64}$'){throw 'Recovery-evidence use key is invalid.'}
  $usedDirectory=Join-Path $repo '.git/forge-private-evidence/used';[IO.Directory]::CreateDirectory($usedDirectory)|Out-Null
  $markerPath=Join-Path $usedDirectory ("storage-billing-442-$UseKey.json")
  $receipt=[ordered]@{schema='forge.hosted-recovery-evidence-use.v1';target_version=$targetVersion;evidence_file_sha256=(Get-FileHash -LiteralPath $RecoveryEvidencePath -Algorithm SHA256).Hash.ToLowerInvariant();operator=$Operator;consumed_at=[DateTimeOffset]::UtcNow.ToString('O')}|ConvertTo-Json -Compress
  try{
    $stream=[IO.File]::Open($markerPath,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
    try{$bytes=[Text.UTF8Encoding]::new($false).GetBytes($receipt);$stream.Write($bytes,0,$bytes.Length);$stream.Flush($true)}finally{$stream.Dispose()}
  }catch [IO.IOException]{throw 'Migration 442 evidence was already consumed; obtain fresh recovery evidence, authorization, and a new change window.'}
}
function Register-ApplyAuthorizationUse([string]$AuthorizationCommitment,[string]$ProtectedAuthoritySha256){
  if($AuthorizationCommitment -notmatch '^[0-9a-f]{64}$'){throw 'Apply authorization SHA-256 commitment is invalid.'}
  $usedDirectory=Join-Path $repo '.git/forge-private-evidence/used';[IO.Directory]::CreateDirectory($usedDirectory)|Out-Null
  $markerPath=Join-Path $usedDirectory ("storage-billing-442-authorization-$AuthorizationCommitment.json")
  $receipt=[ordered]@{schema='forge.hosted-apply-authorization-use.v1';project_ref=$projectRef;payload_commit=$certifiedPayloadCommit;protected_authority_sha256=$ProtectedAuthoritySha256;target_version=$targetVersion;authorization_sha256=$AuthorizationCommitment;operator=$Operator;consumed_at=[DateTimeOffset]::UtcNow.ToString('O')}|ConvertTo-Json -Compress
  try{
    $stream=[IO.File]::Open($markerPath,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
    try{$bytes=[Text.UTF8Encoding]::new($false).GetBytes($receipt);$stream.Write($bytes,0,$bytes.Length);$stream.Flush($true)}finally{$stream.Dispose()}
  }catch [IO.IOException]{throw 'Migration 442 Apply authorization was already consumed; obtain a distinct owner authorization.'}
}
function Assert-PostApply([string]$ProtectedAuthoritySha256){
  $state=Get-HostedState
  if($state.installedCount -ne 442 -or $state.hostedHead -cne $targetVersion -or @($state.pendingVersions).Count -ne 0){throw 'Post-apply migration history verification failed.'}
  if((Get-ProtectedAuthorityFingerprint) -cne $ProtectedAuthoritySha256){throw 'Protected financial or execution authority changed during migration 442 Apply.'}
  Invoke-Policy $state $null 'PostVerify'|Out-Null;$state
}

function Register-VerifiedStage([object]$State){
  $path=Join-Path $repo ('.git/forge-private-evidence/used/storage-billing-442-verified-'+$AuthorizationSha256+'.json')
  $record=[ordered]@{project_ref=$projectRef;payload_commit=$certifiedPayloadCommit;target_version=$targetVersion;authorization_sha256=$AuthorizationSha256;protected_authority_sha256=$State.protectedAuthoritySha256}
  $json=$record|ConvertTo-Json -Compress
  try{
    $stream=[IO.File]::Open($path,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
    try{$bytes=[Text.UTF8Encoding]::new($false).GetBytes($json);$stream.Write($bytes,0,$bytes.Length);$stream.Flush($true)}finally{$stream.Dispose()}
  }catch [IO.IOException]{
    if((Get-Content -LiteralPath $path -Raw) -cne $json){throw 'Verified-stage receipt conflict.'}
  }
}

if($Action -eq 'Apply' -and ([string]::IsNullOrWhiteSpace($Authorization) -or [string]::IsNullOrWhiteSpace($AuthorizationSha256))){throw 'Owner-issued migration 442 Apply authorization and its approved SHA-256 commitment are required.'}
if($Action -ne 'PostVerify' -and ([string]::IsNullOrWhiteSpace($RecoveryEvidencePath) -or -not(Test-Path -LiteralPath $RecoveryEvidencePath -PathType Leaf))){throw 'Fresh recovery evidence is required.'}

Assert-StaticPrerequisites
& (Join-Path $PSScriptRoot 'invoke-frozen-git-evidence.ps1') -RepositoryRoot $repo -Scope all -RequireExactWorktreeBytes | Out-Null
$releaseWorkdir=(Invoke-ForgeNode -RepositoryRoot $repo -Arguments @((Join-Path $PSScriptRoot 'prepare-storage-hosted-workdir.mjs'),$repo,$targetVersion)).StandardOutput.Trim()
try {
$result=Invoke-WithForgeManagedDatabaseCredential -Operation {
  if($Action -eq 'PostVerify'){
    if($AuthorizationSha256 -notmatch '^[0-9a-f]{64}$'){throw 'PostVerify requires the original Apply authorization commitment.'}
    $receiptPath=Join-Path $repo ('.git/forge-private-evidence/used/storage-billing-442-authorization-'+$AuthorizationSha256+'.json')
    $receipt=Get-Content -LiteralPath $receiptPath -Raw | ConvertFrom-Json
    if($receipt.project_ref -cne $projectRef -or $receipt.payload_commit -cne $certifiedPayloadCommit -or $receipt.target_version -cne $targetVersion -or $receipt.authorization_sha256 -cne $AuthorizationSha256 -or $receipt.protected_authority_sha256 -notmatch '^[0-9a-f]{64}$'){throw 'Apply attempt receipt mismatch.'}
    $state=Assert-PostApply ([string]$receipt.protected_authority_sha256);Register-VerifiedStage $state;return [ordered]@{ok=$true;action=$Action;projectRef=$projectRef;hostedHead=$state.hostedHead;installedCount=$state.installedCount;customerDataReturned=$false;credentialsReturned=$false}}
  $observationPath=New-TrustedRecoveryApiObservation ([IO.Path]::GetFullPath($RecoveryEvidencePath))
  try{
    $state=Get-HostedState;$audit=Invoke-Policy $state $observationPath
    $dryRun=Invoke-Supabase @('db','push','--linked','--dry-run','--workdir',$releaseWorkdir,'--agent=no')
    Assert-ForgeSupabaseDryRunPlan -Result $dryRun -ExpectedMigrationFiles @($migrationFile.Split('/')[-1])|Out-Null
    if($Action -eq 'Preflight'){return [ordered]@{ok=$true;action=$Action;projectRef=$projectRef;hostedHead=$state.hostedHead;pendingVersions=$state.pendingVersions;migrationSha256=$state.migrationSha256;recoveryUseKey=$audit.recoveryUseKey;customerDataReturned=$false;credentialsReturned=$false}}
    Assert-StaticPrerequisites
    Invoke-ForgeNode -RepositoryRoot $repo -Arguments @((Join-Path $PSScriptRoot 'prepare-storage-hosted-workdir.mjs'),$repo,$targetVersion,$releaseWorkdir)|Out-Null
    Register-ApplyAuthorizationUse $AuthorizationSha256 $state.protectedAuthoritySha256
    Register-RecoveryEvidenceUse $audit.recoveryUseKey
    $protected=[string]$state.protectedAuthoritySha256
    Invoke-Supabase @('db','push','--linked','--workdir',$releaseWorkdir,'--agent=no')|Out-Null
    $post=Assert-PostApply $protected
    Register-VerifiedStage $post
    [ordered]@{ok=$true;action=$Action;projectRef=$projectRef;hostedHead=$post.hostedHead;installedCount=$post.installedCount;customerDataReturned=$false;credentialsReturned=$false}
  } finally {if($observationPath){Remove-Item -LiteralPath $observationPath -Force -ErrorAction SilentlyContinue}}
}
$result|ConvertTo-Json -Depth 8 -Compress

} finally {
  # Only the exact private migration-only directory created for this invocation.
  if($releaseWorkdir){Remove-Item -LiteralPath $releaseWorkdir -Recurse -Force}
}
