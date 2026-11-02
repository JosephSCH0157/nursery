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
$predecessorVersion='20261101084703'
$targetVersion='20261101201817'
$targetSha256='ed35a3138ba4b15f63a50b5b8e8624ad45dcb9fdd2a6a9d990d52db42017c1bb'
$token='APPLY-FORGE-INACTIVE-ADMISSION-ENFORCEMENT-430'
$releaseOrder='database-before-application'
$statePath=$null
$apiObservationPath=$null
. (Join-Path $PSScriptRoot 'lib/forge-managed-credential.ps1')
. (Join-Path $PSScriptRoot 'lib/forge-supabase-cli.ps1')

function Invoke-Supabase([string[]]$Arguments){Invoke-ForgeSupabaseCli -Arguments $Arguments}
function New-TrustedRecoveryApiObservation([string]$EvidencePath){
  $evidence=Get-Content -LiteralPath $EvidencePath -Raw|ConvertFrom-Json
  if([string]$evidence.schema -cne 'forge.hosted-recovery-readiness.v2' -or
     [string]::IsNullOrWhiteSpace([string]$evidence.management_api.backup_id)){
    throw 'Migration 430 requires authenticated Management API recovery evidence.'
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
  $path=Join-Path ([IO.Path]::GetTempPath()) ('forge-inactive-admission-430-recovery-observation-'+[guid]::NewGuid().ToString('N')+'.json')
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
  $migrationPath=Join-Path $repo 'supabase/migrations/20261101201817_forge_inactive_admission_enforcement.sql'
  if(-not(Test-Path -LiteralPath $migrationPath -PathType Leaf)){throw 'Migration 430 is missing.'}
  $sha=(Get-FileHash -LiteralPath $migrationPath -Algorithm SHA256).Hash.ToLowerInvariant()
  if($sha -cne $targetSha256){throw 'Migration 430 SHA-256 mismatch.'}

  $pins=@(
    @('apps/nursery/server/auth/admission-enforcement.ts','a3a6c81636a904d358307e46d84a46a81240e0dfcf73dd5d0b2c1b1f3599ceeb'),
    @('apps/nursery/src/components/AdmissionBoundary.tsx','7b18b2ab2a90337a64ff75d1d054d41e0422b0df1c7dc75320e70dcc7f773e61'),
    @('apps/nursery/src/main.tsx','8fa739d1a6bfb9524355dacaf7c492c0a44f586e6e19fe0f8d4e5b450c54bc8e'),
    @('apps/nursery/netlify/_hammer-handler.ts','1143704dfd4f324fc61706a4d61e8de958dc923932de445a120d31e9901f87bf'),
    @('apps/nursery/netlify/functions/_anvil-handler.ts','26ee18150ca517740d6fb20020d95151927415c292b03057f650c3bc6b6355f7'),
    @('apps/nursery/netlify/functions/_hearth-handler.ts','0622a6f33874989d13d8b1d13b5672b4c0b24914ded8c710012ac02232f0566f'),
    @('apps/nursery/netlify/functions/_publishing-youtube-handler.ts','b7733b17d408829e46c3dc063e2731a475bddc53e1fdbc813b25c981b5a3c708'),
    @('apps/nursery/netlify/functions/_tongs-handler.ts','48272e0255511f6e20732a469f5678bc0587b2170854460b7840c268ddce41fe'),
    @('apps/nursery/netlify/functions/ai-keys-disconnect.ts','75a0cb1520d937dcd2f1dcbe1ada37673e08b291cf90791ebf68d000ce2cd396'),
    @('apps/nursery/netlify/functions/ai-keys-status.ts','18d978af1f90d72c09fbc138fb78b28a70ded0075951f9088dfe66b9b70d8b84'),
    @('apps/nursery/netlify/functions/hearth-chat-status.ts','6fb933fb7e2d98255fa9c6628788b6602f79ed90f1bf555158b0ef3afdc540d7'),
    @('apps/nursery/netlify/functions/hearth-topic-discovery.ts','4aeeee75350672686e46980fe8b53d52c96cc998e936dfbebcaaf86ba3b56e23')
  )
  foreach($pin in $pins){
    $path=Join-Path $repo $pin[0]
    if(-not(Test-Path -LiteralPath $path -PathType Leaf) -or
       (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant() -cne $pin[1]){
      throw "Slice 2B release-compatibility bytes changed: $($pin[0])"
    }
  }

  $serverSource=Get-Content -LiteralPath (Join-Path $repo $pins[0][0]) -Raw
  $uiSource=Get-Content -LiteralPath (Join-Path $repo $pins[1][0]) -Raw
  $migrationSource=Get-Content -LiteralPath $migrationPath -Raw
  if($serverSource -notmatch 'FORGE_ADMISSION_ENFORCEMENT_ENABLED' -or
     $serverSource -notmatch '=== "true"' -or
     $serverSource -notmatch 'TONGS_SUPABASE_URL' -or
     $serverSource -notmatch 'TONGS_SERVICE_ROLE_KEY' -or
     $uiSource -notmatch 'VITE_FORGE_ADMISSION_ENFORCEMENT_ENABLED' -or
     $uiSource -notmatch '=== "true"'){
    throw 'Slice 2B application enforcement is not pinned disabled-by-default.'
  }
  if($migrationSource -match '(?im)^\s*(alter\s+(?:role|database).*pgrst\.db_pre_request|create\s+policy)' -or
     $migrationSource -notmatch 'current_setting\(''forge\.account_admission_enforcement'', true\)' -or
     $migrationSource -notmatch '<> ''on'''){
    throw 'Migration 430 no longer preserves inactive database enforcement.'
  }
  [ordered]@{linked=$linked;sha=$sha;releaseOrder=$releaseOrder}
}
function Assert-InstalledPredecessorContract {
  $predecessor=Join-Path $PSScriptRoot 'invoke-forge-beta-invitation-provisioning-429-hosted-deployment.ps1'
  & $predecessor -Action PostVerify -RepositoryRoot $repo|Out-Null
  if(-not $? -or $LASTEXITCODE -ne 0){throw 'Migration 429 predecessor PostVerify failed.'}
}
function Get-AuthoritySnapshot {
  $sql=@'
with new_functions(signature) as (values
  ('tongs.account_admission_enforcement_version()'),
  ('tongs.require_account_admission(uuid)'),
  ('tongs.current_request_is_admitted()'),
  ('tongs.account_admission_pre_request()'),
  ('tongs._guard_new_customer_financial_authorization()')
), new_triggers(name) as (values
  ('customer_spending_acceptance_admission_guard'),
  ('funding_reservation_admission_guard')
), authority_parts as (
  select 'function|'||p.oid::regprocedure::text||'|'||p.proowner::regrole::text||'|'||p.prosecdef::text||'|'||
         coalesce(array_to_string(p.proconfig,','),'')||'|'||coalesce(p.proacl::text,'')||'|'||pg_get_functiondef(p.oid) as value
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname in ('tongs','public','storage','realtime') and p.prokind<>'a'
    and p.oid::regprocedure::text not in (select signature from new_functions)
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
    and t.tgname not in (select name from new_triggers)
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
)
select
  encode(extensions.digest(coalesce((select string_agg(value,E'\n' order by value) from authority_parts),''),'sha256'),'hex') as unaffected_authority_sha256,
  encode(extensions.digest(coalesce((select string_agg(value,E'\n' order by value) from auth_parts),''),'sha256'),'hex') as auth_authority_sha256,
  encode(extensions.digest(coalesce((select string_agg(to_jsonb(cohort)::text,E'\n' order by cohort.user_id) from tongs.legacy_account_admission_cohort cohort),''),'sha256'),'hex') as legacy_cohort_sha256,
  encode(extensions.digest(coalesce((select string_agg(to_jsonb(admission)::text,E'\n' order by admission.user_id) from tongs.account_admissions admission),''),'sha256'),'hex') as admission_projection_sha256,
  encode(extensions.digest(coalesce((select string_agg(to_jsonb(event)::text,E'\n' order by event.user_id,event.revision) from tongs.account_admission_events event),''),'sha256'),'hex') as admission_event_sha256,
  encode(extensions.digest(coalesce((select string_agg(value,E'\n' order by value) from application_parts),''),'sha256'),'hex') as application_authority_sha256,
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
  (select count(*) from tongs.funding_reservations) as funding_reservations,
  (select count(*) from tongs.funding_reservation_events) as funding_reservation_events,
  (select count(*) from tongs.paid_media_provider_attempts) as paid_media_provider_attempts,
  (select count(*) from tongs.owner_cost_provider_attempts) as owner_cost_provider_attempts,
  (select count(*) from tongs.hammer_transcription_provider_attempts) as hammer_transcription_provider_attempts;
'@
  $columns=@(
    'unaffected_authority_sha256','auth_authority_sha256','legacy_cohort_sha256',
    'admission_projection_sha256','admission_event_sha256','application_authority_sha256',
    'auth_user_count','profile_count','workspace_count','workspace_member_count',
    'legacy_cohort_count','admission_projection_count','admission_event_count',
    'application_count','decision_count','binding_count','invitation_event_count',
    'funding_reservations','funding_reservation_events','paid_media_provider_attempts',
    'owner_cost_provider_attempts','hammer_transcription_provider_attempts'
  )
  $rows=@(Read-LinkedCsv $sql $columns 'migration 430 authority snapshot')
  if($rows.Count -ne 1){throw 'Migration 430 authority snapshot is unavailable.'}
  $row=$rows[0]
  [ordered]@{
    unaffectedAuthoritySha256=[string]$row.unaffected_authority_sha256
    authAuthoritySha256=[string]$row.auth_authority_sha256
    legacyCohortSha256=[string]$row.legacy_cohort_sha256
    admissionProjectionSha256=[string]$row.admission_projection_sha256
    admissionEventSha256=[string]$row.admission_event_sha256
    applicationAuthoritySha256=[string]$row.application_authority_sha256
    authUserCount=[int64]$row.auth_user_count;profileCount=[int64]$row.profile_count
    workspaceCount=[int64]$row.workspace_count;workspaceMemberCount=[int64]$row.workspace_member_count
    legacyCohortCount=[int64]$row.legacy_cohort_count;admissionProjectionCount=[int64]$row.admission_projection_count
    admissionEventCount=[int64]$row.admission_event_count;applicationCount=[int64]$row.application_count
    decisionCount=[int64]$row.decision_count;bindingCount=[int64]$row.binding_count
    invitationEventCount=[int64]$row.invitation_event_count
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
    'authUserCount','profileCount','workspaceCount','workspaceMemberCount',
    'legacyCohortCount','admissionProjectionCount','admissionEventCount',
    'applicationCount','decisionCount','bindingCount','invitationEventCount'
  )){
    if([string]$Before.$name -cne [string]$After.$name){throw "Migration 430 changed protected snapshot field $name."}
  }
  foreach($name in @('fundingReservations','fundingReservationEvents','paidMediaProviderAttempts','ownerCostProviderAttempts','hammerTranscriptionProviderAttempts')){
    if([int64]$Before.financialCounters.$name -ne [int64]$After.financialCounters.$name){throw "Unexpected financial or provider operation changed $name during migration 430."}
  }
}
function Register-RecoveryEvidenceUse([string]$UseKey){
  if($UseKey -notmatch '^[0-9a-f]{64}$'){throw 'Migration 430 recovery-evidence use key is invalid.'}
  $usedDirectory=Join-Path $repo '.git/forge-private-evidence/used'
  [IO.Directory]::CreateDirectory($usedDirectory)|Out-Null
  $markerPath=Join-Path $usedDirectory ("migration-430-$UseKey.json")
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
    throw 'Migration 430 recovery evidence was already consumed; obtain fresh recovery evidence and a new change window.'
  }
}
function Assert-PostApply([object]$PreApplyState=$null) {
  $static=Assert-StaticPrerequisites
  $history=@(Read-LinkedCsv 'select version from supabase_migrations.schema_migrations order by version' @('version') 'post-apply history')
  $versions=@($history|ForEach-Object{[string]$_.version})
  if($versions.Count -ne 430 -or $versions[-1] -cne $targetVersion -or @($versions|Where-Object{$_ -eq $targetVersion}).Count -ne 1){throw 'Post-apply migration history verification failed.'}
  $local=@(Get-ChildItem -LiteralPath (Join-Path $repo 'supabase/migrations') -Filter '*.sql' -File|Sort-Object Name|ForEach-Object{if($_.BaseName -match '^(\d{8,14})_'){$Matches[1]}})
  $lineage=@(Read-LinkedCsv 'select lineage from forge_meta.database_lineage where singleton=true' @('lineage') 'post-apply lineage')
  $postState=[ordered]@{
    projectRef=$projectRef;lineage=[string]$lineage[0].lineage;installedCount=$versions.Count
    hostedHead=$versions[-1];pendingVersions=@($local|Where-Object{$_ -notin $versions})
    migrationSha256=$static.sha
  }
  $postStatePath=Join-Path ([IO.Path]::GetTempPath()) ('forge-inactive-admission-430-post-state-'+[guid]::NewGuid().ToString('N')+'.json')
  try{
    [IO.File]::WriteAllText($postStatePath,($postState|ConvertTo-Json -Depth 4 -Compress),[Text.UTF8Encoding]::new($false))
    & node (Join-Path $PSScriptRoot 'verify-forge-inactive-admission-enforcement-430-hosted-deployment-policy.mjs') --action PostVerify --state $postStatePath|Out-Null
    if($LASTEXITCODE -ne 0){throw 'Migration 430 PostVerify policy rejected hosted state.'}
  } finally {
    if(Test-Path -LiteralPath $postStatePath){Remove-Item -LiteralPath $postStatePath -Force}
  }

  $snapshot=Get-AuthoritySnapshot
  Assert-UnchangedSnapshot -Before $PreApplyState -After $snapshot
  $postflightSql=Get-Content -LiteralPath (Join-Path $repo 'supabase/tests/account_admission_enforcement_hosted_postverify.sql') -Raw
  $columns=@(
    'lineage','function_ownership_and_path','complete_function_acl_contract',
    'function_effective_acl_contract','financial_trigger_contract','service_guard_contract',
    'pre_request_contract','financial_guard_inert_contract','pre_request_unregistered',
    'financial_enforcement_inactive','storage_policy_uninstalled','realtime_policy_uninstalled',
    'projection_consistent','no_invitation_dispatch'
  )
  $rows=@(Read-LinkedCsv $postflightSql $columns 'migration 430 post-apply contract')
  if($rows.Count -ne 1){throw 'Migration 430 post-apply contract is unavailable.'}
  $row=$rows[0]
  foreach($name in ($columns|Select-Object -Skip 1)){
    if([string]$row.$name -notmatch '^(t|true)$'){throw "Migration 430 post-apply $name failed."}
  }
  if([string]$row.lineage -cne 'historical-v1'){throw 'Migration 430 lineage verification failed.'}
  [pscustomobject]@{
    ok=$true;schema='forge.inactive-admission-enforcement-430-hosted-postverify.v1'
    projectRef=$projectRef;installedCount=430;hostedHead=$targetVersion;lineage='historical-v1'
    releaseOrder=$releaseOrder;admissionEnforcementActive=$false;preRequestRegistered=$false
    storagePolicyInstalled=$false;realtimePolicyInstalled=$false;invitationDispatchPerformed=$false
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
if($Action -eq 'Apply' -and $Authorization -cne $token){throw 'Exact migration 430 operator authorization is required.'}
$recoveryEvidenceFullPath=[IO.Path]::GetFullPath($RecoveryEvidencePath)
$privateEvidenceRoot=[IO.Path]::GetFullPath((Join-Path $repo '.git/forge-private-evidence'))
$privateEvidencePrefix=$privateEvidenceRoot.TrimEnd([IO.Path]::DirectorySeparatorChar,[IO.Path]::AltDirectorySeparatorChar)+[IO.Path]::DirectorySeparatorChar
if(-not $recoveryEvidenceFullPath.StartsWith($privateEvidencePrefix,[StringComparison]::OrdinalIgnoreCase)){
  throw 'Migration 430 recovery evidence must be stored under .git/forge-private-evidence.'
}
Assert-StaticPrerequisites|Out-Null
try{
  $apiObservationPath=New-TrustedRecoveryApiObservation -EvidencePath $recoveryEvidenceFullPath
  $verify=Join-Path $PSScriptRoot 'verify-forge-inactive-admission-enforcement-430-hosted-deployment-policy.mjs'
  $localArgs=@($verify,'--local-only','--action',$Action,'--recovery',$recoveryEvidenceFullPath,'--api-observation',$apiObservationPath,'--operator',$Operator)
  if($Authorization){$localArgs+=@('--authorization',$Authorization)}
  & node @localArgs|Out-Null
  if($LASTEXITCODE -ne 0){throw 'Local migration 430 hosted policy rejected the operation.'}
  Assert-InstalledPredecessorContract
  Invoke-WithForgeManagedDatabaseCredential -Operation {
    $state=Get-HostedState
    $script:statePath=Join-Path ([IO.Path]::GetTempPath()) ('forge-inactive-admission-430-state-'+[guid]::NewGuid().ToString('N')+'.json')
    [IO.File]::WriteAllText($script:statePath,($state|ConvertTo-Json -Depth 6 -Compress),[Text.UTF8Encoding]::new($false))
    $args=@($verify,'--action',$Action,'--state',$script:statePath,'--recovery',$recoveryEvidenceFullPath,'--api-observation',$apiObservationPath,'--operator',$Operator)
    if($Authorization){$args+=@('--authorization',$Authorization)}
    $audit=@(& node @args);if($LASTEXITCODE -ne 0){throw 'Hosted migration 430 deployment policy rejected the operation.'}
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
