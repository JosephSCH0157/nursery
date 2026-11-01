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
$predecessorVersion='20261031123320'
$targetVersion='20261101084703'
$targetSha256='12989ba74c00c2bdc8a9d4c5d38ee4e3be3f1f4d23b9b0f8d2a1b145c7b7dbc7'
$token='APPLY-FORGE-BETA-INVITATION-PROVISIONING-429'
$releaseOrder='database-before-application'
$handlerSha256='aae80e48b3f0b4d7837c3bcc3d2b738674425f4afb7f4110ad568cf157da28cf'
$serviceSha256='0c0becfe0ce2397e7fc4721e9d68c2d17b22ff202715378d41e2be5a94c74d2a'
$hubSha256='7783984c6bd0347052f00337a4a12eba7880a6fdf65b77523b3fa5d53d3bd800'
$clientSha256='1322269852dd11db322674b094bfde2849f97f575a479f1d15d87ff56bded59f'
$welcomeSha256='16159df8765e1d498249eaec7bf75c6def4f63cb8bb7a7257ea09912d7dca99a'
$statePath=$null
. (Join-Path $PSScriptRoot 'lib/forge-managed-credential.ps1')
. (Join-Path $PSScriptRoot 'lib/forge-supabase-cli.ps1')

function Invoke-Supabase([string[]]$Arguments){Invoke-ForgeSupabaseCli -Arguments $Arguments}
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
  $migrationPath=Join-Path $repo 'supabase/migrations/20261101084703_forge_beta_invitation_provisioning.sql'
  if(-not(Test-Path -LiteralPath $migrationPath -PathType Leaf)){throw 'Migration 429 is missing.'}
  $sha=(Get-FileHash -LiteralPath $migrationPath -Algorithm SHA256).Hash.ToLowerInvariant()
  if($sha -cne $targetSha256){throw 'Migration 429 SHA-256 mismatch.'}

  $pins=@(
    @('apps/nursery/netlify/functions/beta-invitations.mts',$handlerSha256),
    @('apps/nursery/server/auth/beta-invitation-service.ts',$serviceSha256),
    @('apps/nursery/src/routes/ForgeHub.tsx',$hubSha256),
    @('apps/nursery/src/lib/admission/betaInvitation.ts',$clientSha256),
    @('apps/nursery/src/routes/InvitationWelcome.tsx',$welcomeSha256)
  )
  foreach($pin in $pins){
    $path=Join-Path $repo $pin[0]
    if(-not(Test-Path -LiteralPath $path -PathType Leaf) -or
       (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant() -cne $pin[1]){
      throw "Slice 2A release-compatibility bytes changed: $($pin[0])"
    }
  }
  $serviceSource=Get-Content -LiteralPath (Join-Path $repo $pins[1][0]) -Raw
  $handlerSource=Get-Content -LiteralPath (Join-Path $repo $pins[0][0]) -Raw
  $flagIndex=$serviceSource.IndexOf('if (!config.mutationsEnabled)')
  $authIndex=$serviceSource.IndexOf('const token = bearer(request)')
  if($flagIndex -lt 0 -or $authIndex -lt 0 -or $flagIndex -ge $authIndex -or
     $serviceSource -notmatch 'FORGE_BETA_INVITATIONS_ENABLED' -or
     $serviceSource -notmatch '\?\.trim\(\)\.toLowerCase\(\) === "true"' -or
     $handlerSource -notmatch 'environment\("FORGE_BETA_INVITATIONS_ENABLED"\)'){
    throw 'Beta invitation endpoint is not pinned fail-closed before Auth or database access.'
  }
  [ordered]@{linked=$linked;sha=$sha;releaseOrder=$releaseOrder}
}
function Get-AuthoritySnapshot {
  $sql=@'
with admission_relations(name) as (values
  ('beta_access_applications'),('beta_access_application_decisions'),
  ('beta_access_identity_bindings'),('legacy_account_admission_cohort'),
  ('account_admission_events'),('account_admissions'),
  ('beta_access_invitation_events')
), admission_functions(name) as (values
  ('_reject_account_admission_immutable_mutation'),('_guard_account_admissions_projection'),
  ('_project_account_admission_event'),('account_admission_authority_version'),
  ('ingest_beta_access_application'),('list_beta_access_applications'),
  ('decide_beta_access_application'),('bind_beta_access_application'),
  ('set_account_admission_state'),('is_account_admitted'),
  ('_reject_beta_access_invitation_event_mutation'),('_append_beta_access_invitation_event'),
  ('_provision_bound_beta_account'),('_bind_beta_access_application_core'),
  ('list_beta_invitation_applications'),('claim_beta_invitation_dispatch'),
  ('record_beta_invitation_dispatch'),('bind_beta_access_application_as_operator'),
  ('bind_existing_beta_access_application_as_operator'),
  ('record_beta_invitation_binding_failure'),('read_my_admission_onboarding')
), authority_parts as (
  select 'function|'||p.oid::regprocedure::text||'|'||p.proowner::regrole::text||'|'||p.prosecdef::text||'|'||
         coalesce(array_to_string(p.proconfig,','),'')||'|'||coalesce(p.proacl::text,'')||'|'||pg_get_functiondef(p.oid) as value
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname in ('tongs','public','storage','realtime') and p.prokind<>'a'
    and not (n.nspname='tongs' and p.proname in (select name from admission_functions))
    and not (n.nspname='public' and p.proname='handle_new_user')
  union all
  select 'policy|'||schemaname||'.'||tablename||'|'||policyname||'|'||cmd||'|'||permissive||'|'||
         coalesce(array_to_string(roles,','),'')||'|'||coalesce(qual,'')||'|'||coalesce(with_check,'')
  from pg_policies
  where schemaname in ('tongs','public','storage','realtime')
    and not (schemaname='tongs' and tablename in (select name from admission_relations))
  union all
  select 'relation|'||n.nspname||'.'||c.relname||'|'||c.relowner::regrole::text||'|'||c.relrowsecurity::text||'|'||
         c.relforcerowsecurity::text||'|'||coalesce(c.relacl::text,'')
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname in ('tongs','public','storage','realtime') and c.relkind in ('r','p','v','m','S')
    and not (n.nspname='tongs' and c.relname in (select name from admission_relations))
  union all
  select 'trigger|'||n.nspname||'.'||c.relname||'|'||t.tgname||'|'||t.tgenabled::text||'|'||pg_get_triggerdef(t.oid,true)
  from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
  where not t.tgisinternal and n.nspname in ('tongs','public','storage','realtime')
    and not (n.nspname='tongs' and c.relname in (select name from admission_relations))
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
    'application_count','decision_count','binding_count','funding_reservations',
    'funding_reservation_events','paid_media_provider_attempts','owner_cost_provider_attempts',
    'hammer_transcription_provider_attempts'
  )
  $rows=@(Read-LinkedCsv $sql $columns 'migration 429 authority snapshot')
  if($rows.Count -ne 1){throw 'Migration 429 authority snapshot is unavailable.'}
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
    'applicationCount','decisionCount','bindingCount'
  )){
    if([string]$Before.$name -cne [string]$After.$name){throw "Migration 429 changed protected snapshot field $name."}
  }
  foreach($name in @('fundingReservations','fundingReservationEvents','paidMediaProviderAttempts','ownerCostProviderAttempts','hammerTranscriptionProviderAttempts')){
    if([int64]$Before.financialCounters.$name -ne [int64]$After.financialCounters.$name){throw "Unexpected financial or provider operation changed $name during migration 429."}
  }
}
function Register-RecoveryEvidenceUse([string]$UseKey){
  if($UseKey -notmatch '^[0-9a-f]{64}$'){throw 'Migration 429 recovery-evidence use key is invalid.'}
  $usedDirectory=Join-Path $repo '.git/forge-private-evidence/used'
  [IO.Directory]::CreateDirectory($usedDirectory)|Out-Null
  $markerPath=Join-Path $usedDirectory ("migration-429-$UseKey.json")
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
    throw 'Migration 429 recovery evidence was already consumed; obtain fresh recovery evidence and a new change window.'
  }
}
function Assert-PostApply([object]$PreApplyState=$null) {
  $static=Assert-StaticPrerequisites
  $history=@(Read-LinkedCsv 'select version from supabase_migrations.schema_migrations order by version' @('version') 'post-apply history')
  $versions=@($history|ForEach-Object{[string]$_.version})
  if($versions.Count -ne 429 -or $versions[-1] -cne $targetVersion -or @($versions|Where-Object{$_ -eq $targetVersion}).Count -ne 1){throw 'Post-apply migration history verification failed.'}
  $snapshot=Get-AuthoritySnapshot
  Assert-UnchangedSnapshot -Before $PreApplyState -After $snapshot
  $sql=@'
with admission_relations(name) as (values
  ('beta_access_applications'),('beta_access_application_decisions'),
  ('beta_access_identity_bindings'),('legacy_account_admission_cohort'),
  ('account_admission_events'),('account_admissions'),('beta_access_invitation_events')
), relation_contract as (
  select c.oid,c.relname,c.relrowsecurity,c.relforcerowsecurity,c.relacl,c.relowner
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='tongs' and c.relname in (select name from admission_relations) and c.relkind='r'
), unexpected_table_acl as (
  select 1 from relation_contract relation
  cross join lateral aclexplode(coalesce(relation.relacl,acldefault('r',relation.relowner))) acl
  where acl.grantee<>relation.relowner
), table_privileges(privilege_name) as (values
  ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER')
), function_acl_expectations(signature,allowed_grantees,security_definer) as (values
  ('tongs._reject_account_admission_immutable_mutation()',array['postgres']::text[],false),
  ('tongs._guard_account_admissions_projection()',array['postgres']::text[],false),
  ('tongs._project_account_admission_event()',array['postgres']::text[],true),
  ('tongs.account_admission_authority_version()',array['postgres','service_role']::text[],false),
  ('tongs.ingest_beta_access_application(text,text,text,text,text,text,text,text,text,text,timestamptz)',array['postgres','service_role']::text[],true),
  ('tongs.list_beta_access_applications(text,integer)',array['postgres','authenticated']::text[],true),
  ('tongs.decide_beta_access_application(uuid,text,text,uuid)',array['postgres','authenticated']::text[],true),
  ('tongs.bind_beta_access_application(uuid,uuid,text,uuid)',array['postgres']::text[],true),
  ('tongs.set_account_admission_state(uuid,text,text,uuid)',array['postgres','authenticated']::text[],true),
  ('tongs.is_account_admitted(uuid)',array['postgres','authenticated','service_role']::text[],true),
  ('tongs._reject_beta_access_invitation_event_mutation()',array['postgres']::text[],false),
  ('tongs._append_beta_access_invitation_event(uuid,bigint,uuid,uuid,text,uuid,uuid,text,text,timestamptz,text,text)',array['postgres']::text[],true),
  ('tongs._provision_bound_beta_account(uuid)',array['postgres']::text[],true),
  ('tongs._bind_beta_access_application_core(uuid,uuid,text,uuid,uuid)',array['postgres']::text[],true),
  ('tongs.list_beta_invitation_applications(text,integer,timestamptz,uuid)',array['postgres','authenticated']::text[],true),
  ('tongs.claim_beta_invitation_dispatch(uuid,uuid,uuid,uuid,text,timestamptz)',array['postgres','service_role']::text[],true),
  ('tongs.record_beta_invitation_dispatch(uuid,uuid,uuid,uuid,text,text,uuid,text)',array['postgres','service_role']::text[],true),
  ('tongs.bind_beta_access_application_as_operator(uuid,uuid,uuid,text,uuid,uuid,uuid)',array['postgres','service_role']::text[],true),
  ('tongs.bind_existing_beta_access_application_as_operator(uuid,uuid,uuid,text,uuid,uuid,uuid,uuid)',array['postgres','service_role']::text[],true),
  ('tongs.record_beta_invitation_binding_failure(uuid,uuid,uuid,uuid,uuid,text)',array['postgres','service_role']::text[],true),
  ('tongs.read_my_admission_onboarding()',array['postgres','authenticated']::text[],true),
  ('public.handle_new_user()',array['postgres','service_role']::text[],true)
), function_contract as (
  select expectation.*,procedure.oid,procedure.proowner,procedure.prosecdef,procedure.proconfig,procedure.proacl
  from function_acl_expectations expectation
  left join pg_proc procedure on procedure.oid=to_regprocedure(expectation.signature)
), function_acl_actual as (
  select contract.signature,coalesce(role.rolname,'PUBLIC') as grantee_name,acl.privilege_type,acl.is_grantable
  from function_contract contract
  cross join lateral aclexplode(coalesce(contract.proacl,acldefault('f',contract.proowner))) acl
  left join pg_roles role on role.oid=acl.grantee
), function_effective_roles(role_name,table_administrative_exempt,function_administrative_exempt) as (
  select rolname,
    rolname=any(array['supabase_admin','supabase_etl_admin','supabase_read_only_user','pg_read_all_data','pg_write_all_data']),
    rolname='supabase_admin'
  from pg_roles
), projection_mismatch as (
  select admission.user_id
  from tongs.account_admissions admission
  left join lateral (
    select event.* from tongs.account_admission_events event
    where event.user_id=admission.user_id order by event.revision desc limit 1
  ) event on true
  where event.id is null or admission.current_event_id<>event.id or admission.event_revision<>event.revision
    or admission.effective_state<>case event.event_type when 'revoke' then 'revoked' else 'admitted' end
    or admission.origin_kind<>event.origin_kind
    or admission.origin_application_id is distinct from event.origin_application_id
    or admission.origin_legacy_user_id is distinct from event.origin_legacy_user_id
), invitation_triggers as (
  select trigger.tgname,trigger.tgenabled::text as enabled
  from pg_trigger trigger
  where trigger.tgrelid='tongs.beta_access_invitation_events'::regclass and not trigger.tgisinternal
), handle_new_user_contract as (
  select lower(pg_get_functiondef('public.handle_new_user()'::regprocedure)) as definition
)
select
  (select lineage from forge_meta.database_lineage where singleton=true) as lineage,
  (select count(*)=7 and bool_and(relowner='postgres'::regrole and relrowsecurity and relforcerowsecurity) from relation_contract) as seven_forced_rls_tables,
  not exists(select 1 from unexpected_table_acl) as table_acl_exact,
  not exists(
    select 1 from relation_contract relation cross join function_effective_roles role cross join table_privileges privilege
    where not (role.table_administrative_exempt or role.role_name='postgres')
      and has_table_privilege(role.role_name,relation.oid,privilege.privilege_name)
  ) as table_effective_acl_contract,
  (select count(*)=22 and bool_and(oid is not null and proowner='postgres'::regrole
    and proconfig @> array['search_path=pg_catalog'] and prosecdef=security_definer) from function_contract) as function_ownership_and_path,
  (select count(*)=22 from function_acl_expectations)
    and not exists(
      select 1 from function_acl_actual actual join function_acl_expectations expectation using(signature)
      where not (actual.grantee_name=any(expectation.allowed_grantees))
        or actual.privilege_type<>'EXECUTE' or actual.is_grantable
    ) and not exists(
      select 1 from function_acl_expectations expectation
      cross join lateral unnest(expectation.allowed_grantees) expected(grantee_name)
      where not exists(
        select 1 from function_acl_actual actual
        where actual.signature=expectation.signature and actual.grantee_name=expected.grantee_name
          and actual.privilege_type='EXECUTE' and not actual.is_grantable
      )
    ) as complete_function_acl_contract,
  (select bool_and(
    has_function_privilege(role.role_name,expectation.signature,'EXECUTE')=
      (role.function_administrative_exempt or role.role_name=any(expectation.allowed_grantees))
  ) from function_acl_expectations expectation cross join function_effective_roles role) as function_effective_acl_contract,
  not has_function_privilege('anon','tongs.bind_beta_access_application(uuid,uuid,text,uuid)','EXECUTE')
    and not has_function_privilege('authenticated','tongs.bind_beta_access_application(uuid,uuid,text,uuid)','EXECUTE')
    and not has_function_privilege('service_role','tongs.bind_beta_access_application(uuid,uuid,text,uuid)','EXECUTE') as legacy_bind_disabled,
  has_function_privilege('authenticated','tongs.list_beta_invitation_applications(text,integer,timestamptz,uuid)','EXECUTE')
    and not has_function_privilege('anon','tongs.list_beta_invitation_applications(text,integer,timestamptz,uuid)','EXECUTE')
    and not has_function_privilege('service_role','tongs.list_beta_invitation_applications(text,integer,timestamptz,uuid)','EXECUTE') as operator_listing_contract,
  has_function_privilege('service_role','tongs.claim_beta_invitation_dispatch(uuid,uuid,uuid,uuid,text,timestamptz)','EXECUTE')
    and not has_function_privilege('authenticated','tongs.claim_beta_invitation_dispatch(uuid,uuid,uuid,uuid,text,timestamptz)','EXECUTE')
    and has_function_privilege('authenticated','tongs.read_my_admission_onboarding()','EXECUTE')
    and not has_function_privilege('service_role','tongs.read_my_admission_onboarding()','EXECUTE') as service_and_onboarding_contract,
  (select count(*)=2 and bool_and(enabled='O') and bool_and(tgname in ('beta_access_invitation_events_immutable_rows','beta_access_invitation_events_immutable_truncate')) from invitation_triggers) as journal_trigger_contract,
  (select position('if new.invited_at is not null' in definition)>0
    and regexp_count(definition,'exception when others')=2 from handle_new_user_contract) as signup_provisioning_contract,
  not exists(select 1 from projection_mismatch) as projection_consistent,
  (select count(*) from tongs.beta_access_invitation_events)=0 as no_invitation_dispatch,
  not exists(
    select 1 from pg_proc procedure join pg_namespace namespace on namespace.oid=procedure.pronamespace
    where namespace.nspname in ('tongs','public','storage','auth','realtime') and procedure.prokind<>'a'
      and not (namespace.nspname='tongs' and procedure.proname in (
        '_reject_account_admission_immutable_mutation','_guard_account_admissions_projection',
        '_project_account_admission_event','account_admission_authority_version',
        'ingest_beta_access_application','list_beta_access_applications','decide_beta_access_application',
        'bind_beta_access_application','set_account_admission_state','is_account_admitted',
        '_reject_beta_access_invitation_event_mutation','_append_beta_access_invitation_event',
        '_provision_bound_beta_account','_bind_beta_access_application_core',
        'list_beta_invitation_applications','claim_beta_invitation_dispatch',
        'record_beta_invitation_dispatch','bind_beta_access_application_as_operator',
        'bind_existing_beta_access_application_as_operator','record_beta_invitation_binding_failure',
        'read_my_admission_onboarding'
      ))
      and lower(pg_get_functiondef(procedure.oid)) ~ '(is_account_admitted|account_admissions)'
  ) and not exists(
    select 1 from pg_policies where lower(coalesce(qual,'')||' '||coalesce(with_check,'')) ~ '(is_account_admitted|account_admissions)'
  ) and not exists(
    select 1 from pg_db_role_setting where lower(array_to_string(setconfig,',')) ~ '(is_account_admitted|account_admissions)'
  ) as admission_enforcement_inactive;
'@
  $columns=@(
    'lineage','seven_forced_rls_tables','table_acl_exact','table_effective_acl_contract',
    'function_ownership_and_path','complete_function_acl_contract','function_effective_acl_contract',
    'legacy_bind_disabled','operator_listing_contract','service_and_onboarding_contract',
    'journal_trigger_contract','signup_provisioning_contract','projection_consistent',
    'no_invitation_dispatch','admission_enforcement_inactive'
  )
  $rows=@(Read-LinkedCsv $sql $columns 'migration 429 post-apply contract')
  if($rows.Count -ne 1){throw 'Migration 429 post-apply contract is unavailable.'}
  $row=$rows[0]
  foreach($name in @(
    'seven_forced_rls_tables','table_acl_exact','table_effective_acl_contract',
    'function_ownership_and_path','complete_function_acl_contract','function_effective_acl_contract',
    'legacy_bind_disabled','operator_listing_contract','service_and_onboarding_contract',
    'journal_trigger_contract','signup_provisioning_contract','projection_consistent',
    'no_invitation_dispatch','admission_enforcement_inactive'
  )){
    if([string]$row.$name -notmatch '^(t|true)$'){throw "Migration 429 post-apply $name failed."}
  }
  if([string]$row.lineage -cne 'historical-v1'){throw 'Migration 429 lineage verification failed.'}
  [pscustomobject]@{
    ok=$true;schema='forge.beta-invitation-provisioning-429-hosted-postverify.v1';projectRef=$projectRef
    installedCount=429;hostedHead=$targetVersion;lineage='historical-v1';releaseOrder=$releaseOrder
    invitationJournalRows=0;invitationDispatchPerformed=$false;admissionEnforcementActive=$false
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
if($Action -eq 'Apply' -and $Authorization -cne $token){throw 'Exact migration 429 operator authorization is required.'}
$recoveryEvidenceFullPath=[IO.Path]::GetFullPath($RecoveryEvidencePath)
$privateEvidenceRoot=[IO.Path]::GetFullPath((Join-Path $repo '.git/forge-private-evidence'))
$privateEvidencePrefix=$privateEvidenceRoot.TrimEnd([IO.Path]::DirectorySeparatorChar,[IO.Path]::AltDirectorySeparatorChar)+[IO.Path]::DirectorySeparatorChar
if(-not $recoveryEvidenceFullPath.StartsWith($privateEvidencePrefix,[StringComparison]::OrdinalIgnoreCase)){
  throw 'Migration 429 recovery evidence must be stored under .git/forge-private-evidence.'
}
Assert-StaticPrerequisites|Out-Null
$verify=Join-Path $PSScriptRoot 'verify-forge-beta-invitation-provisioning-429-hosted-deployment-policy.mjs'
$localArgs=@($verify,'--local-only','--action',$Action,'--recovery',$recoveryEvidenceFullPath,'--operator',$Operator)
if($Authorization){$localArgs+=@('--authorization',$Authorization)}
& node @localArgs|Out-Null
if($LASTEXITCODE -ne 0){throw 'Local migration 429 hosted policy rejected the operation.'}
try{
  Invoke-WithForgeManagedDatabaseCredential -Operation {
    $state=Get-HostedState
    $script:statePath=Join-Path ([IO.Path]::GetTempPath()) ('forge-beta-invitation-429-state-'+[guid]::NewGuid().ToString('N')+'.json')
    [IO.File]::WriteAllText($script:statePath,($state|ConvertTo-Json -Depth 6 -Compress),[Text.UTF8Encoding]::new($false))
    $args=@($verify,'--action',$Action,'--state',$script:statePath,'--recovery',$recoveryEvidenceFullPath,'--operator',$Operator)
    if($Authorization){$args+=@('--authorization',$Authorization)}
    $audit=@(& node @args);if($LASTEXITCODE -ne 0){throw 'Hosted migration 429 deployment policy rejected the operation.'}
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
}
