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
$projectRef='wtvdjndyxegudufrompx'
$predecessorVersion='20261101201817'
$targetVersion='20261102032722'
$targetSha256='12c3688094eeb00bb294339d6ee738c1b52421cb99204df4af32d92fa3f32cbb'
$token='APPLY-FORGE-ADMISSION-ACTIVATION-PREPARATION-431'
$releaseOrder='database-before-coordinated-activation'
$statePath=$null
$apiObservationPath=$null
. (Join-Path $PSScriptRoot 'lib/forge-managed-credential.ps1')
. (Join-Path $PSScriptRoot 'lib/forge-supabase-cli.ps1')

function Invoke-Supabase([string[]]$Arguments){Invoke-ForgeSupabaseCli -Arguments $Arguments}
function Assert-FileHash([string]$RelativePath,[string]$ExpectedHash,[string]$Context){
  $path=Join-Path $repo $RelativePath
  if(-not(Test-Path -LiteralPath $path -PathType Leaf)){throw "$Context is missing."}
  $sha=(Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()
  if($sha -cne $ExpectedHash){throw "$Context SHA-256 mismatch."}
  return $path
}
function New-TrustedRecoveryApiObservation([string]$EvidencePath){
  $evidence=Get-Content -LiteralPath $EvidencePath -Raw|ConvertFrom-Json
  if([string]$evidence.schema -cne 'forge.hosted-recovery-readiness.v2' -or
     [string]::IsNullOrWhiteSpace([string]$evidence.management_api.backup_id)){
    throw 'Migration 431 requires authenticated Management API recovery evidence.'
  }
  $collector=Join-Path $PSScriptRoot 'collect-hosted-recovery-readiness-evidence.mjs'
  $observation=Invoke-WithForgeManagedSupabaseCapacityReadCredential -Operation {
    $lines=@(& node $collector --action Observe --project-ref $projectRef --expected-backup-id ([string]$evidence.management_api.backup_id))
    if($LASTEXITCODE -ne 0){throw 'Authenticated Supabase Management API backup verification failed.'}
    return ($lines -join [Environment]::NewLine)
  }
  $parsed=$observation|ConvertFrom-Json
  if([string]$parsed.project_ref -cne $projectRef -or [string]$parsed.backup_status -cne 'COMPLETED'){
    throw 'Authenticated Supabase Management API observation is invalid.'
  }
  $path=Join-Path ([IO.Path]::GetTempPath()) ('forge-admission-activation-preparation-431-recovery-observation-'+[guid]::NewGuid().ToString('N')+'.json')
  $stream=[IO.File]::Open($path,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
  try{
    $bytes=[Text.UTF8Encoding]::new($false).GetBytes($observation)
    $stream.Write($bytes,0,$bytes.Length);$stream.Flush($true)
  } finally {$stream.Dispose()}
  return $path
}
function Read-LinkedCsv([string]$Sql,[string[]]$Columns,[string]$Context){
  $result=Invoke-Supabase @('db','query','--linked','--agent=no','--output','csv','--workdir',$repo,$Sql)
  @(ConvertFrom-ForgeSupabaseCsv -StandardOutput $result.StandardOutput -ExpectedColumns $Columns -Context $Context)
}
function Assert-StaticPrerequisites {
  $linkedPath=Join-Path $repo 'supabase/.temp/project-ref'
  if(-not(Test-Path -LiteralPath $linkedPath -PathType Leaf)){throw 'Linked project reference is unavailable.'}
  $linked=(Get-Content -LiteralPath $linkedPath -Raw).Trim()
  if($linked -cne $projectRef){throw 'Linked project does not match the pinned Forge project.'}
  if((Invoke-Supabase @('--version')).StandardOutput.Trim() -cne '2.84.2'){throw 'Supabase CLI 2.84.2 is required.'}

  $migrationPath=Assert-FileHash 'supabase/migrations/20261102032722_forge_admission_activation_preparation.sql' $targetSha256 'Migration 431'
  Assert-FileHash 'supabase/activation/forge-account-admission-activation-v1.sql' '3210eca3ac26cb073ef188f5d212fd53bbe641d75f5a78bf088e121c5a96230f' 'Admission activation SQL'|Out-Null
  Assert-FileHash 'supabase/activation/forge-account-admission-deactivation-v1.sql' '9cf926d1f1caccdcc2e00274df6fd1667c4165e64bc10a04a87328ca4574a9ae' 'Admission deactivation SQL'|Out-Null
  Assert-FileHash 'docs/admission/ADMISSION_ACTIVATION_DATABASE_SURFACE.v1.json' '7818379a0ad7b9ceebf0752247b1aff9be64c7d3e5b4792529a933e17ba78036' 'Admission activation surface'|Out-Null
  $contractPath=Assert-FileHash 'docs/database/baseline/v1-account-admission-activation-preparation/successor-contract.v1.json' '7b24841db08a09a8156056314c5939884cba82a5c8b256096dd26bfb6223bd24' 'Migration 431 successor contract'
  Assert-FileHash 'docs/database/baseline/v1-account-admission-activation-preparation/successor-catalog-fingerprint.json' 'bf7ff82d76f30d1eee461b04f41c4ad9c41ab22a9e56636eda37e4d0a9ef3157' 'Migration 431 successor catalog'|Out-Null

  $contract=Get-Content -LiteralPath $contractPath -Raw|ConvertFrom-Json
  if([string]$contract.sharedTailAddition.version -cne $targetVersion -or
     [string]$contract.sharedTailAddition.sha256 -cne $targetSha256 -or
     [int]$contract.catalogSuccessor.objectCount -ne 16612 -or
     [string]$contract.catalogSuccessor.normalizedContractSha256 -cne '6cffa82600d1898621de9abb70000f82b723128de853bbddb6e08b58056ed3a1' -or
     [bool]$contract.inactivityContract.admissionEnforcementActivated -or
     [bool]$contract.inactivityContract.postgrestPreRequestRegistered -or
     [int]$contract.inactivityContract.storagePoliciesInstalled -ne 0){
    throw 'Migration 431 successor and inactivity contract mismatch.'
  }

  $serverSource=Get-Content -LiteralPath (Join-Path $repo 'apps/nursery/server/auth/admission-enforcement.ts') -Raw
  $uiSource=Get-Content -LiteralPath (Join-Path $repo 'apps/nursery/src/components/AdmissionBoundary.tsx') -Raw
  $migrationSource=Get-Content -LiteralPath $migrationPath -Raw
  if($serverSource -notmatch 'FORGE_ADMISSION_ENFORCEMENT_ENABLED' -or
     $serverSource -notmatch '=== "true"' -or
     $uiSource -notmatch 'VITE_FORGE_ADMISSION_ENFORCEMENT_ENABLED' -or
     $uiSource -notmatch '=== "true"'){
    throw 'Slice 2C application enforcement is not disabled by default.'
  }
  if($migrationSource -match '(?im)^\s*(alter\s+(?:role|database).*pgrst\.db_pre_request|create\s+policy)' -or
     @([regex]::Matches($migrationSource,'(?im)^\s*create\s+or\s+replace\s+function\s+')).Count -ne 2 -or
     $migrationSource -notmatch 'forge\.account-admission-enforcement\.v2' -or
     $migrationSource -notmatch 'rpc/resolve_bellows_join_link'){
    throw 'Migration 431 no longer preserves the exact inactive preparation contract.'
  }
  [ordered]@{linked=$linked;sha=$targetSha256;releaseOrder=$releaseOrder}
}
function Assert-InstalledPredecessorContract {
  $sql=Get-Content -LiteralPath (Join-Path $repo 'supabase/tests/account_admission_enforcement_hosted_postverify.sql') -Raw
  $columns=@(
    'lineage','function_ownership_and_path','complete_function_acl_contract',
    'function_effective_acl_contract','financial_trigger_contract','service_guard_contract',
    'pre_request_contract','financial_guard_inert_contract','pre_request_unregistered',
    'financial_enforcement_inactive','storage_policy_uninstalled','realtime_policy_uninstalled',
    'projection_consistent','no_invitation_dispatch'
  )
  $rows=@(Read-LinkedCsv $sql $columns 'migration 430 predecessor contract')
  if($rows.Count -ne 1){throw 'Migration 430 predecessor contract is unavailable.'}
  if([string]$rows[0].lineage -cne 'historical-v1'){throw 'Migration 430 predecessor lineage mismatch.'}
  foreach($name in ($columns|Select-Object -Skip 1)){
    if([string]$rows[0].$name -notmatch '^(t|true)$'){throw "Migration 430 predecessor $name failed."}
  }
}
function Get-AuthoritySnapshot {
  $sql=@'
with changed_functions(signature) as (values
  ('tongs.account_admission_enforcement_version()'),
  ('tongs.account_admission_pre_request()')
), authority_parts as (
  select 'function|'||p.oid::regprocedure::text||'|'||p.proowner::regrole::text||'|'||p.prosecdef::text||'|'||
         coalesce(array_to_string(p.proconfig,','),'')||'|'||coalesce(p.proacl::text,'')||'|'||pg_get_functiondef(p.oid) as value
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname in ('tongs','public','storage','realtime') and p.prokind<>'a'
    and p.oid::regprocedure::text not in (select signature from changed_functions)
  union all
  select 'policy|'||schemaname||'.'||tablename||'|'||policyname||'|'||cmd||'|'||permissive||'|'||
         coalesce(array_to_string(roles,','),'')||'|'||coalesce(qual,'')||'|'||coalesce(with_check,'')
  from pg_policies where schemaname in ('tongs','public','storage','realtime')
  union all
  select 'relation|'||n.nspname||'.'||c.relname||'|'||c.relowner::regrole::text||'|'||c.relrowsecurity::text||'|'||
         c.relforcerowsecurity::text||'|'||coalesce(c.relacl::text,'')
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname in ('tongs','public','storage','realtime') and c.relkind in ('r','p','v','m','S')
  union all
  select 'trigger|'||n.nspname||'.'||c.relname||'|'||t.tgname||'|'||t.tgenabled::text||'|'||pg_get_triggerdef(t.oid,true)
  from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
  where not t.tgisinternal and n.nspname in ('tongs','public','storage','realtime')
  union all
  select 'role_setting|'||setdatabase::text||'|'||setrole::text||'|'||array_to_string(setconfig,',')
  from pg_db_role_setting
), auth_parts as (
  select 'function|'||p.oid::regprocedure::text||'|'||p.proowner::regrole::text||'|'||p.prosecdef::text||'|'||
         coalesce(array_to_string(p.proconfig,','),'')||'|'||coalesce(p.proacl::text,'')||'|'||pg_get_functiondef(p.oid) as value
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='auth' and p.prokind<>'a'
  union all
  select 'trigger|'||c.relname||'|'||t.tgname||'|'||t.tgenabled::text||'|'||pg_get_triggerdef(t.oid,true)
  from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
  where not t.tgisinternal and n.nspname='auth'
), application_parts as (
  select 'application|'||to_jsonb(application)::text as value from tongs.beta_access_applications application
  union all select 'decision|'||to_jsonb(decision)::text from tongs.beta_access_application_decisions decision
  union all select 'binding|'||to_jsonb(binding)::text from tongs.beta_access_identity_bindings binding
), operator_parts as (
  select to_jsonb(operator)::text as value from tongs.platform_operators operator
)
select
  encode(extensions.digest(coalesce((select string_agg(value,E'\n' order by value) from authority_parts),''),'sha256'),'hex') as unaffected_authority_sha256,
  encode(extensions.digest(coalesce((select string_agg(value,E'\n' order by value) from auth_parts),''),'sha256'),'hex') as auth_authority_sha256,
  encode(extensions.digest(coalesce((select string_agg(to_jsonb(cohort)::text,E'\n' order by cohort.user_id) from tongs.legacy_account_admission_cohort cohort),''),'sha256'),'hex') as legacy_cohort_sha256,
  encode(extensions.digest(coalesce((select string_agg(to_jsonb(admission)::text,E'\n' order by admission.user_id) from tongs.account_admissions admission),''),'sha256'),'hex') as admission_projection_sha256,
  encode(extensions.digest(coalesce((select string_agg(to_jsonb(event)::text,E'\n' order by event.user_id,event.revision) from tongs.account_admission_events event),''),'sha256'),'hex') as admission_event_sha256,
  encode(extensions.digest(coalesce((select string_agg(value,E'\n' order by value) from application_parts),''),'sha256'),'hex') as application_authority_sha256,
  encode(extensions.digest(coalesce((select string_agg(value,E'\n' order by value) from operator_parts),''),'sha256'),'hex') as platform_operator_authority_sha256,
  (select count(*) from auth.users) as auth_user_count,
  (select count(*) from public.profiles) as profile_count,
  (select count(*) from tongs.workspaces) as workspace_count,
  (select count(*) from tongs.workspace_members) as workspace_member_count,
  (select count(*) from tongs.legacy_account_admission_cohort) as legacy_cohort_count,
  (select count(*) from tongs.account_admissions) as admission_projection_count,
  (select count(*) from tongs.account_admission_events) as admission_event_count,
  (select count(*) from tongs.beta_access_applications) as application_count,
  (select count(*) from tongs.beta_access_application_decisions) as decision_count,
  (select count(*) from tongs.beta_access_identity_bindings) as binding_count,
  (select count(*) from tongs.beta_access_invitation_events) as invitation_event_count,
  (select count(*) from tongs.platform_operators) as platform_operator_count,
  (select count(*) from tongs.funding_reservations) as funding_reservations,
  (select count(*) from tongs.funding_reservation_events) as funding_reservation_events,
  (select count(*) from tongs.paid_media_provider_attempts) as paid_media_provider_attempts,
  (select count(*) from tongs.owner_cost_provider_attempts) as owner_cost_provider_attempts,
  (select count(*) from tongs.hammer_transcription_provider_attempts) as hammer_transcription_provider_attempts;
'@
  $columns=@(
    'unaffected_authority_sha256','auth_authority_sha256','legacy_cohort_sha256',
    'admission_projection_sha256','admission_event_sha256','application_authority_sha256',
    'platform_operator_authority_sha256','auth_user_count','profile_count','workspace_count',
    'workspace_member_count','legacy_cohort_count','admission_projection_count','admission_event_count',
    'application_count','decision_count','binding_count','invitation_event_count','platform_operator_count',
    'funding_reservations','funding_reservation_events','paid_media_provider_attempts',
    'owner_cost_provider_attempts','hammer_transcription_provider_attempts'
  )
  $rows=@(Read-LinkedCsv $sql $columns 'migration 431 authority snapshot')
  if($rows.Count -ne 1){throw 'Migration 431 authority snapshot is unavailable.'}
  $row=$rows[0]
  [ordered]@{
    unaffectedAuthoritySha256=[string]$row.unaffected_authority_sha256
    authAuthoritySha256=[string]$row.auth_authority_sha256
    legacyCohortSha256=[string]$row.legacy_cohort_sha256
    admissionProjectionSha256=[string]$row.admission_projection_sha256
    admissionEventSha256=[string]$row.admission_event_sha256
    applicationAuthoritySha256=[string]$row.application_authority_sha256
    platformOperatorAuthoritySha256=[string]$row.platform_operator_authority_sha256
    authUserCount=[int64]$row.auth_user_count;profileCount=[int64]$row.profile_count
    workspaceCount=[int64]$row.workspace_count;workspaceMemberCount=[int64]$row.workspace_member_count
    legacyCohortCount=[int64]$row.legacy_cohort_count;admissionProjectionCount=[int64]$row.admission_projection_count
    admissionEventCount=[int64]$row.admission_event_count;applicationCount=[int64]$row.application_count
    decisionCount=[int64]$row.decision_count;bindingCount=[int64]$row.binding_count
    invitationEventCount=[int64]$row.invitation_event_count;platformOperatorCount=[int64]$row.platform_operator_count
    financialCounters=[ordered]@{
      fundingReservations=[int64]$row.funding_reservations
      fundingReservationEvents=[int64]$row.funding_reservation_events
      paidMediaProviderAttempts=[int64]$row.paid_media_provider_attempts
      ownerCostProviderAttempts=[int64]$row.owner_cost_provider_attempts
      hammerTranscriptionProviderAttempts=[int64]$row.hammer_transcription_provider_attempts
    }
  }
}
function Get-HostedState {
  $static=Assert-StaticPrerequisites
  & (Join-Path $PSScriptRoot 'verify-canonical-database-artifacts.ps1') -RepositoryRoot $repo|Out-Null
  & (Join-Path $PSScriptRoot 'verify-supabase-lineage.ps1') -Lineage historical -Workdir $repo -DatabaseTarget linked -Mode preflight -RepositoryRoot $repo|Out-Null
  $history=@(Read-LinkedCsv 'select version from supabase_migrations.schema_migrations order by version' @('version') 'hosted history')
  $versions=@($history|ForEach-Object{[string]$_.version})
  $lineage=@(Read-LinkedCsv 'select lineage from forge_meta.database_lineage where singleton=true' @('lineage') 'hosted lineage')
  if($lineage.Count -ne 1){throw 'Hosted lineage singleton is unavailable.'}
  $local=@(Get-ChildItem -LiteralPath (Join-Path $repo 'supabase/migrations') -Filter '*.sql' -File|Sort-Object Name|ForEach-Object{if($_.BaseName -match '^(\d{8,14})_'){$Matches[1]}})
  $snapshot=Get-AuthoritySnapshot
  $state=[ordered]@{
    projectRef=$static.linked;lineage=[string]$lineage[0].lineage;installedCount=$versions.Count
    hostedHead=$versions[-1];pendingVersions=@($local|Where-Object{$_ -notin $versions})
    migrationSha256=$static.sha;databasePasswordAvailable=$true
  }
  foreach($entry in $snapshot.GetEnumerator()){$state[$entry.Key]=$entry.Value}
  $state
}
function Assert-UnchangedSnapshot([object]$Before,[object]$After){
  if(-not $Before){return}
  foreach($name in @(
    'unaffectedAuthoritySha256','authAuthoritySha256','legacyCohortSha256',
    'admissionProjectionSha256','admissionEventSha256','applicationAuthoritySha256',
    'platformOperatorAuthoritySha256','authUserCount','profileCount','workspaceCount',
    'workspaceMemberCount','legacyCohortCount','admissionProjectionCount','admissionEventCount',
    'applicationCount','decisionCount','bindingCount','invitationEventCount','platformOperatorCount'
  )){
    if([string]$Before.$name -cne [string]$After.$name){throw "Migration 431 changed protected snapshot field $name."}
  }
  foreach($name in @('fundingReservations','fundingReservationEvents','paidMediaProviderAttempts','ownerCostProviderAttempts','hammerTranscriptionProviderAttempts')){
    if([int64]$Before.financialCounters.$name -ne [int64]$After.financialCounters.$name){throw "Unexpected financial or provider operation changed $name during migration 431."}
  }
}
function Register-RecoveryEvidenceUse([string]$UseKey){
  if($UseKey -notmatch '^[0-9a-f]{64}$'){throw 'Migration 431 recovery-evidence use key is invalid.'}
  $usedDirectory=Join-Path $repo '.git/forge-private-evidence/used'
  [IO.Directory]::CreateDirectory($usedDirectory)|Out-Null
  $markerPath=Join-Path $usedDirectory ("migration-431-$UseKey.json")
  $receipt=[ordered]@{
    schema='forge.hosted-recovery-evidence-use.v1';target_version=$targetVersion
    evidence_file_sha256=(Get-FileHash -LiteralPath $recoveryEvidenceFullPath -Algorithm SHA256).Hash.ToLowerInvariant()
    operator=$Operator;consumed_at=[DateTimeOffset]::UtcNow.ToString('O')
  }|ConvertTo-Json -Compress
  try{
    $stream=[IO.File]::Open($markerPath,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
    try{
      $bytes=[Text.UTF8Encoding]::new($false).GetBytes($receipt)
      $stream.Write($bytes,0,$bytes.Length);$stream.Flush($true)
    } finally {$stream.Dispose()}
  } catch [IO.IOException] {
    throw 'Migration 431 recovery evidence was already consumed; obtain fresh recovery evidence and a new change window.'
  }
}
function Assert-PostApply([object]$PreApplyState=$null) {
  $static=Assert-StaticPrerequisites
  $history=@(Read-LinkedCsv 'select version from supabase_migrations.schema_migrations order by version' @('version') 'post-apply history')
  $versions=@($history|ForEach-Object{[string]$_.version})
  if($versions.Count -ne 431 -or $versions[-1] -cne $targetVersion -or @($versions|Where-Object{$_ -eq $targetVersion}).Count -ne 1){throw 'Post-apply migration history verification failed.'}
  $local=@(Get-ChildItem -LiteralPath (Join-Path $repo 'supabase/migrations') -Filter '*.sql' -File|Sort-Object Name|ForEach-Object{if($_.BaseName -match '^(\d{8,14})_'){$Matches[1]}})
  $lineage=@(Read-LinkedCsv 'select lineage from forge_meta.database_lineage where singleton=true' @('lineage') 'post-apply lineage')
  $postState=[ordered]@{
    projectRef=$projectRef;lineage=[string]$lineage[0].lineage;installedCount=$versions.Count
    hostedHead=$versions[-1];pendingVersions=@($local|Where-Object{$_ -notin $versions})
    migrationSha256=$static.sha
  }
  $postStatePath=Join-Path ([IO.Path]::GetTempPath()) ('forge-admission-activation-preparation-431-post-state-'+[guid]::NewGuid().ToString('N')+'.json')
  try{
    [IO.File]::WriteAllText($postStatePath,($postState|ConvertTo-Json -Depth 4 -Compress),[Text.UTF8Encoding]::new($false))
    & node (Join-Path $PSScriptRoot 'verify-forge-account-admission-activation-preparation-431-hosted-deployment-policy.mjs') --action PostVerify --state $postStatePath|Out-Null
    if($LASTEXITCODE -ne 0){throw 'Migration 431 PostVerify policy rejected hosted state.'}
  } finally {
    if(Test-Path -LiteralPath $postStatePath){Remove-Item -LiteralPath $postStatePath -Force}
  }

  $snapshot=Get-AuthoritySnapshot
  Assert-UnchangedSnapshot -Before $PreApplyState -After $snapshot
  $postflightSql=Get-Content -LiteralPath (Join-Path $repo 'supabase/tests/account_admission_activation_preparation_hosted_postverify.sql') -Raw
  $columns=@(
    'lineage','prepared_contract_v2','function_ownership_and_path','complete_function_acl_contract',
    'function_effective_acl_contract','exact_pre_request_paths','pre_request_contract',
    'financial_trigger_contract','service_guard_contract','financial_guard_inert_contract',
    'pre_request_unregistered','financial_enforcement_inactive','data_api_policy_uninstalled',
    'storage_policy_uninstalled','realtime_policy_uninstalled','projection_consistent',
    'no_invitation_dispatch'
  )
  $rows=@(Read-LinkedCsv $postflightSql $columns 'migration 431 post-apply contract')
  if($rows.Count -ne 1){throw 'Migration 431 post-apply contract is unavailable.'}
  $row=$rows[0]
  foreach($name in ($columns|Select-Object -Skip 1)){
    if([string]$row.$name -notmatch '^(t|true)$'){throw "Migration 431 post-apply $name failed."}
  }
  if([string]$row.lineage -cne 'historical-v1'){throw 'Migration 431 lineage verification failed.'}
  [pscustomobject]@{
    ok=$true;schema='forge.account-admission-activation-preparation-431-hosted-postverify.v1'
    projectRef=$projectRef;installedCount=431;hostedHead=$targetVersion;lineage='historical-v1'
    releaseOrder=$releaseOrder;admissionEnforcementActive=$false;preRequestRegistered=$false
    dataApiPolicyInstalled=$false;storagePolicyInstalled=$false;realtimePolicyInstalled=$false
    invitationDispatchPerformed=$false;bellowsPublicGuestSignalingExceptionDocumented=$true
    protectedAuthorityComparedToPreApply=($null -ne $PreApplyState)
    netlifyConfigurationVerified=$false;authConfigurationVerified=$false
    customerDataReturned=$false;credentialsReturned=$false
  }|ConvertTo-Json -Compress
}

if($Action -eq 'PostVerify'){
  Assert-StaticPrerequisites|Out-Null
  Invoke-WithForgeManagedDatabaseCredential -Operation {Assert-PostApply}
  exit 0
}
if(-not $RecoveryEvidencePath -or -not(Test-Path -LiteralPath $RecoveryEvidencePath -PathType Leaf)){throw 'A recovery-readiness evidence file is required.'}
if(-not $Operator){throw 'Operator identity is required.'}
if($Action -eq 'Apply' -and $Authorization -cne $token){throw 'Exact migration 431 operator authorization is required.'}
$recoveryEvidenceFullPath=[IO.Path]::GetFullPath($RecoveryEvidencePath)
$privateEvidenceRoot=[IO.Path]::GetFullPath((Join-Path $repo '.git/forge-private-evidence'))
$privateEvidencePrefix=$privateEvidenceRoot.TrimEnd([IO.Path]::DirectorySeparatorChar,[IO.Path]::AltDirectorySeparatorChar)+[IO.Path]::DirectorySeparatorChar
if(-not $recoveryEvidenceFullPath.StartsWith($privateEvidencePrefix,[StringComparison]::OrdinalIgnoreCase)){
  throw 'Migration 431 recovery evidence must be stored under .git/forge-private-evidence.'
}
Assert-StaticPrerequisites|Out-Null
try{
  $apiObservationPath=New-TrustedRecoveryApiObservation -EvidencePath $recoveryEvidenceFullPath
  $verify=Join-Path $PSScriptRoot 'verify-forge-account-admission-activation-preparation-431-hosted-deployment-policy.mjs'
  $localArgs=@($verify,'--local-only','--action',$Action,'--recovery',$recoveryEvidenceFullPath,'--api-observation',$apiObservationPath,'--operator',$Operator)
  if($Authorization){$localArgs+=@('--authorization',$Authorization)}
  & node @localArgs|Out-Null
  if($LASTEXITCODE -ne 0){throw 'Local migration 431 hosted policy rejected the operation.'}
  Invoke-WithForgeManagedDatabaseCredential -Operation {
    Assert-InstalledPredecessorContract
    $state=Get-HostedState
    $script:statePath=Join-Path ([IO.Path]::GetTempPath()) ('forge-admission-activation-preparation-431-state-'+[guid]::NewGuid().ToString('N')+'.json')
    [IO.File]::WriteAllText($script:statePath,($state|ConvertTo-Json -Depth 6 -Compress),[Text.UTF8Encoding]::new($false))
    $args=@($verify,'--action',$Action,'--state',$script:statePath,'--recovery',$recoveryEvidenceFullPath,'--api-observation',$apiObservationPath,'--operator',$Operator)
    if($Authorization){$args+=@('--authorization',$Authorization)}
    $audit=@(& node @args);if($LASTEXITCODE -ne 0){throw 'Hosted migration 431 deployment policy rejected the operation.'}
    $auditReceipt=($audit -join [Environment]::NewLine)|ConvertFrom-Json
    if($Action -eq 'Preflight'){
      Invoke-Supabase @('migration','list','--linked','--workdir',$repo,'--agent=no')|Out-Null
      Invoke-Supabase @('db','push','--linked','--dry-run','--workdir',$repo,'--agent=no')|Out-Null
      return ($audit -join [Environment]::NewLine)
    }
    Register-RecoveryEvidenceUse -UseKey ([string]$auditReceipt.recoveryUseKey)
    Invoke-Supabase @('db','push','--linked','--workdir',$repo,'--agent=no')|Out-Null
    Assert-PostApply -PreApplyState $state
  }
} finally {
  if($statePath -and(Test-Path -LiteralPath $statePath)){Remove-Item -LiteralPath $statePath -Force}
  if($apiObservationPath -and(Test-Path -LiteralPath $apiObservationPath)){Remove-Item -LiteralPath $apiObservationPath -Force}
}
