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
$predecessorVersion='20261030224605'
$targetVersion='20261031123320'
$targetSha256='d59bc289ccd2b14f39e811586b9588e3fedc76bcdd9336c318b9c87453689d0d'
$token='APPLY-FORGE-ACCOUNT-ADMISSION-AUTHORITY-428'
$intakeFunctionSha256='f31337bbf9acb5fdddda8e64f5776237ce2304ae50c3c0bc22ccc5f0859007dd'
$intakeServiceSha256='cabf8aae6415640493ceb819ec996a2cbb82b64800f2628479d6651d53038208'
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
  $migrationPath=Join-Path $repo 'supabase/migrations/20261031123320_forge_beta_admission_foundation.sql'
  if(-not(Test-Path -LiteralPath $migrationPath -PathType Leaf)){throw 'Migration 428 is missing.'}
  $sha=(Get-FileHash -LiteralPath $migrationPath -Algorithm SHA256).Hash.ToLowerInvariant()
  if($sha -cne $targetSha256){throw 'Migration 428 SHA-256 mismatch.'}
  $intakeFunction=Join-Path $repo 'apps/nursery/netlify/functions/beta-admission.ts'
  $intakeService=Join-Path $repo 'apps/nursery/server/auth/beta-admission-service.ts'
  if((Get-FileHash -LiteralPath $intakeFunction -Algorithm SHA256).Hash.ToLowerInvariant() -cne $intakeFunctionSha256){throw 'Netlify admission handler bytes changed.'}
  if((Get-FileHash -LiteralPath $intakeService -Algorithm SHA256).Hash.ToLowerInvariant() -cne $intakeServiceSha256){throw 'Admission intake guard bytes changed.'}
  $serviceSource=Get-Content -LiteralPath $intakeService -Raw
  $handlerSource=Get-Content -LiteralPath $intakeFunction -Raw
  if($serviceSource -notmatch 'FORGE_BETA_INTAKE_ENABLED' -or $serviceSource -notmatch '\?\.trim\(\)\.toLowerCase\(\) === "true"' -or $handlerSource -notmatch 'if \(!isBetaAdmissionIntakeEnabled\(\)\) return;'){
    throw 'Netlify admission intake is not pinned fail-closed.'
  }
  [ordered]@{linked=$linked;sha=$sha}
}
function Get-UnaffectedSnapshot {
  $sql=@'
with admission_relations(name) as (values
  ('beta_access_applications'),('beta_access_application_decisions'),
  ('beta_access_identity_bindings'),('legacy_account_admission_cohort'),
  ('account_admission_events'),('account_admissions')
), admission_functions(name) as (values
  ('_reject_account_admission_immutable_mutation'),('_guard_account_admissions_projection'),
  ('_project_account_admission_event'),('account_admission_authority_version'),
  ('ingest_beta_access_application'),('list_beta_access_applications'),
  ('decide_beta_access_application'),('bind_beta_access_application'),
  ('set_account_admission_state'),('is_account_admitted')
), authority_parts as (
  select 'function|'||p.oid::regprocedure::text||'|'||p.proowner::regrole::text||'|'||p.prosecdef::text||'|'||
         coalesce(array_to_string(p.proconfig,','),'')||'|'||coalesce(p.proacl::text,'')||'|'||pg_get_functiondef(p.oid) as value
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname in ('tongs','public','storage')
    and p.prokind<>'a'
    and not (n.nspname='tongs' and p.proname in (select name from admission_functions))
  union all
  select 'policy|'||schemaname||'.'||tablename||'|'||policyname||'|'||cmd||'|'||permissive||'|'||
         coalesce(array_to_string(roles,','),'')||'|'||coalesce(qual,'')||'|'||coalesce(with_check,'')
  from pg_policies
  where schemaname in ('tongs','public','storage')
    and not (schemaname='tongs' and tablename in (select name from admission_relations))
  union all
  select 'relation|'||n.nspname||'.'||c.relname||'|'||c.relowner::regrole::text||'|'||c.relrowsecurity::text||'|'||
         c.relforcerowsecurity::text||'|'||coalesce(c.relacl::text,'')
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname in ('tongs','public','storage') and c.relkind in ('r','p','v','m','S')
    and not (n.nspname='tongs' and c.relname in (select name from admission_relations))
  union all
  select 'trigger|'||n.nspname||'.'||c.relname||'|'||t.tgname||'|'||t.tgenabled||'|'||pg_get_triggerdef(t.oid,true)
  from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
  where not t.tgisinternal and n.nspname in ('tongs','public','storage')
    and not (n.nspname='tongs' and c.relname in (select name from admission_relations))
), auth_parts as (
  select 'function|'||p.oid::regprocedure::text||'|'||p.proowner::regrole::text||'|'||p.prosecdef::text||'|'||
         coalesce(array_to_string(p.proconfig,','),'')||'|'||coalesce(p.proacl::text,'')||'|'||pg_get_functiondef(p.oid) as value
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='auth' and p.prokind<>'a'
  union all
  select 'trigger|'||c.relname||'|'||t.tgname||'|'||t.tgenabled||'|'||pg_get_triggerdef(t.oid,true)
  from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
  where not t.tgisinternal and n.nspname='auth'
)
select
  encode(extensions.digest(coalesce((select string_agg(value,E'\n' order by value) from authority_parts),''),'sha256'),'hex') as unaffected_authority_sha256,
  encode(extensions.digest(coalesce((select string_agg(value,E'\n' order by value) from auth_parts),''),'sha256'),'hex') as auth_signup_sha256,
  (select count(*) from auth.users) as auth_user_count,
  (select count(*) from tongs.funding_reservations) as funding_reservations,
  (select count(*) from tongs.funding_reservation_events) as funding_reservation_events,
  (select count(*) from tongs.paid_media_provider_attempts) as paid_media_provider_attempts,
  (select count(*) from tongs.owner_cost_provider_attempts) as owner_cost_provider_attempts,
  (select count(*) from tongs.hammer_transcription_provider_attempts) as hammer_transcription_provider_attempts;
'@
  $columns=@('unaffected_authority_sha256','auth_signup_sha256','auth_user_count','funding_reservations','funding_reservation_events','paid_media_provider_attempts','owner_cost_provider_attempts','hammer_transcription_provider_attempts')
  $rows=@(Read-LinkedCsv $sql $columns 'unaffected authority snapshot')
  if($rows.Count -ne 1){throw 'Unaffected authority snapshot is unavailable.'}
  $row=$rows[0]
  [ordered]@{
    unaffectedAuthoritySha256=[string]$row.unaffected_authority_sha256
    authSignupSha256=[string]$row.auth_signup_sha256
    authUserCount=[int64]$row.auth_user_count
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
  $snapshot=Get-UnaffectedSnapshot
  [ordered]@{
    projectRef=$static.linked;lineage=[string]$lineage[0].lineage;installedCount=$versions.Count
    hostedHead=$versions[-1];pendingVersions=@($local|Where-Object{$_ -notin $versions})
    migrationSha256=$static.sha;databasePasswordAvailable=$true
    unaffectedAuthoritySha256=$snapshot.unaffectedAuthoritySha256;authSignupSha256=$snapshot.authSignupSha256
    authUserCount=$snapshot.authUserCount;financialCounters=$snapshot.financialCounters
  }
}
function Assert-UnchangedSnapshot([object]$Before,[object]$After){
  if(-not $Before){return}
  if([string]$Before.unaffectedAuthoritySha256 -cne [string]$After.unaffectedAuthoritySha256){throw 'Existing workspace or financial authority changed during migration 428.'}
  if([string]$Before.authSignupSha256 -cne [string]$After.authSignupSha256){throw 'Existing Auth signup authority changed during migration 428.'}
  foreach($name in @('fundingReservations','fundingReservationEvents','paidMediaProviderAttempts','ownerCostProviderAttempts','hammerTranscriptionProviderAttempts')){
    if([int64]$Before.financialCounters.$name -ne [int64]$After.financialCounters.$name){throw "Unexpected financial or provider operation changed $name during migration 428."}
  }
}
function Register-RecoveryEvidenceUse([string]$UseKey){
  if($UseKey -notmatch '^[0-9a-f]{64}$'){throw 'Migration 428 recovery-evidence use key is invalid.'}
  $usedDirectory=Join-Path $repo '.git/forge-private-evidence/used'
  [IO.Directory]::CreateDirectory($usedDirectory)|Out-Null
  $markerPath=Join-Path $usedDirectory ("migration-428-$UseKey.json")
  $receipt=[ordered]@{
    schema='forge.hosted-recovery-evidence-use.v1'
    target_version=$targetVersion
    evidence_file_sha256=(Get-FileHash -LiteralPath $recoveryEvidenceFullPath -Algorithm SHA256).Hash.ToLowerInvariant()
    operator=$Operator
    consumed_at=[DateTimeOffset]::UtcNow.ToString('O')
  }|ConvertTo-Json -Compress
  try{
    $stream=[IO.File]::Open($markerPath,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
    try{
      $bytes=[Text.UTF8Encoding]::new($false).GetBytes($receipt)
      $stream.Write($bytes,0,$bytes.Length)
      $stream.Flush($true)
    } finally {$stream.Dispose()}
  } catch [IO.IOException] {
    throw 'Migration 428 recovery evidence was already consumed; obtain fresh recovery evidence and a new change window.'
  }
}
function Assert-PostApply([object]$PreApplyState=$null) {
  $static=Assert-StaticPrerequisites
  $history=@(Read-LinkedCsv 'select version from supabase_migrations.schema_migrations order by version' @('version') 'post-apply history')
  $versions=@($history|ForEach-Object{[string]$_.version})
  if($versions.Count -ne 428 -or $versions[-1] -cne $targetVersion -or @($versions|Where-Object{$_ -eq $targetVersion}).Count -ne 1){throw 'Post-apply migration history verification failed.'}
  $snapshot=Get-UnaffectedSnapshot
  Assert-UnchangedSnapshot -Before $PreApplyState -After $snapshot
  $sql=@'
with admission_relations(name) as (values
  ('beta_access_applications'),('beta_access_application_decisions'),
  ('beta_access_identity_bindings'),('legacy_account_admission_cohort'),
  ('account_admission_events'),('account_admissions')
), relation_contract as (
  select c.oid,c.relname,c.relrowsecurity,c.relforcerowsecurity,c.relacl,c.relowner
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='tongs' and c.relname in (select name from admission_relations) and c.relkind='r'
), forbidden_table_acl as (
  select 1
  from relation_contract c
  cross join lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) acl
  left join pg_roles role on role.oid=acl.grantee
  where acl.grantee=0 or role.rolname in ('anon','authenticated','service_role')
), admission_functions as (
  select p.oid,p.proname,p.proowner,p.prosecdef,p.proconfig
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='tongs' and p.proname in (
    '_reject_account_admission_immutable_mutation','_guard_account_admissions_projection',
    '_project_account_admission_event','account_admission_authority_version',
    'ingest_beta_access_application','list_beta_access_applications',
    'decide_beta_access_application','bind_beta_access_application',
    'set_account_admission_state','is_account_admitted'
  )
), function_acl_expectations(signature,public_execute,anon_execute,authenticated_execute,service_execute) as (values
  ('tongs._reject_account_admission_immutable_mutation()',false,false,false,false),
  ('tongs._guard_account_admissions_projection()',false,false,false,false),
  ('tongs._project_account_admission_event()',false,false,false,false),
  ('tongs.account_admission_authority_version()',false,false,false,true),
  ('tongs.ingest_beta_access_application(text,text,text,text,text,text,text,text,text,text,timestamptz)',false,false,false,true),
  ('tongs.list_beta_access_applications(text,integer)',false,false,true,false),
  ('tongs.decide_beta_access_application(uuid,text,text,uuid)',false,false,true,false),
  ('tongs.bind_beta_access_application(uuid,uuid,text,uuid)',false,false,true,false),
  ('tongs.set_account_admission_state(uuid,text,text,uuid)',false,false,true,false),
  ('tongs.is_account_admitted(uuid)',false,false,true,true)
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
)
select
  (select lineage from forge_meta.database_lineage where singleton=true) as lineage,
  (select count(*)=6 and bool_and(relowner='postgres'::regrole and relrowsecurity and relforcerowsecurity) from relation_contract) as six_forced_rls_tables,
  not exists(select 1 from forbidden_table_acl) as table_acl_denied,
  (select count(*)=10 and bool_and(proowner='postgres'::regrole) and bool_and(proconfig @> array['search_path=pg_catalog'])
    and bool_and(prosecdef=(proname in ('_project_account_admission_event','ingest_beta_access_application',
      'list_beta_access_applications','decide_beta_access_application','bind_beta_access_application',
      'set_account_admission_state','is_account_admitted'))) from admission_functions) as function_ownership_and_path,
  (select count(*)=10 and bool_and(
    has_function_privilege('public',signature,'EXECUTE')=public_execute
    and has_function_privilege('anon',signature,'EXECUTE')=anon_execute
    and has_function_privilege('authenticated',signature,'EXECUTE')=authenticated_execute
    and has_function_privilege('service_role',signature,'EXECUTE')=service_execute
  ) from function_acl_expectations) as complete_function_acl_contract,
  has_function_privilege('service_role','tongs.account_admission_authority_version()','EXECUTE')
    and has_function_privilege('service_role','tongs.ingest_beta_access_application(text,text,text,text,text,text,text,text,text,text,timestamptz)','EXECUTE')
    and not has_function_privilege('anon','tongs.ingest_beta_access_application(text,text,text,text,text,text,text,text,text,text,timestamptz)','EXECUTE')
    and not has_function_privilege('authenticated','tongs.ingest_beta_access_application(text,text,text,text,text,text,text,text,text,text,timestamptz)','EXECUTE') as intake_service_only,
  has_function_privilege('authenticated','tongs.list_beta_access_applications(text,integer)','EXECUTE')
    and has_function_privilege('authenticated','tongs.decide_beta_access_application(uuid,text,text,uuid)','EXECUTE')
    and has_function_privilege('authenticated','tongs.bind_beta_access_application(uuid,uuid,text,uuid)','EXECUTE')
    and has_function_privilege('authenticated','tongs.set_account_admission_state(uuid,text,text,uuid)','EXECUTE')
    and not has_function_privilege('anon','tongs.list_beta_access_applications(text,integer)','EXECUTE') as operator_execute_contract,
  has_function_privilege('authenticated','tongs.is_account_admitted(uuid)','EXECUTE')
    and has_function_privilege('service_role','tongs.is_account_admitted(uuid)','EXECUTE')
    and not has_function_privilege('anon','tongs.is_account_admitted(uuid)','EXECUTE') as admission_check_contract,
  (select count(*) from tongs.legacy_account_admission_cohort) as legacy_count,
  (select count(*) from tongs.account_admission_events where origin_kind='legacy' and event_type='grant' and revision=1) as legacy_grants,
  (select count(*) from tongs.account_admissions where origin_kind='legacy') as legacy_projections,
  not exists(select 1 from projection_mismatch) as projection_consistent,
  not exists(select 1 from tongs.account_admission_events where origin_kind<>'legacy') as no_application_admission_events,
  (select count(*) from tongs.beta_access_applications)=0
    and (select count(*) from tongs.beta_access_application_decisions)=0
    and (select count(*) from tongs.beta_access_identity_bindings)=0 as no_application_backfill,
  not exists(
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname in ('tongs','public','storage','auth')
      and p.prokind<>'a'
      and p.proname not in (select proname from admission_functions)
      and lower(pg_get_functiondef(p.oid)) ~ '(is_account_admitted|account_admissions)'
  ) and not exists(
    select 1 from pg_policies
    where lower(coalesce(qual,'')||' '||coalesce(with_check,'')) ~ '(is_account_admitted|account_admissions)'
  ) and not exists(
    select 1 from pg_db_role_setting where lower(array_to_string(setconfig,',')) ~ '(is_account_admitted|account_admissions)'
  ) as admission_enforcement_inactive;
'@
  $columns=@('lineage','six_forced_rls_tables','table_acl_denied','function_ownership_and_path','complete_function_acl_contract','intake_service_only','operator_execute_contract','admission_check_contract','legacy_count','legacy_grants','legacy_projections','projection_consistent','no_application_admission_events','no_application_backfill','admission_enforcement_inactive')
  $rows=@(Read-LinkedCsv $sql $columns 'migration 428 post-apply contract')
  if($rows.Count -ne 1){throw 'Migration 428 post-apply contract is unavailable.'}
  $row=$rows[0]
  foreach($name in @('six_forced_rls_tables','table_acl_denied','function_ownership_and_path','complete_function_acl_contract','intake_service_only','operator_execute_contract','admission_check_contract','projection_consistent','no_application_admission_events','no_application_backfill','admission_enforcement_inactive')){
    if([string]$row.$name -notmatch '^(t|true)$'){throw "Migration 428 post-apply $name failed."}
  }
  if([string]$row.lineage -cne 'historical-v1' -or [int64]$row.legacy_count -ne [int64]$row.legacy_grants -or [int64]$row.legacy_count -ne [int64]$row.legacy_projections){throw 'Migration 428 legacy snapshot or projection verification failed.'}
  if($PreApplyState -and [int64]$row.legacy_count -ne [int64]$PreApplyState.authUserCount){throw 'Migration 428 legacy cohort does not match the migration-time Auth population.'}
  [pscustomobject]@{
    ok=$true;schema='forge.account-admission-authority-428-hosted-postverify.v1';projectRef=$projectRef
    installedCount=428;hostedHead=$targetVersion;lineage='historical-v1';legacyCohortCount=[int64]$row.legacy_count
    admissionEnforcementActive=$false;netlifyIntakeEnabled=$false;customerDataReturned=$false;credentialsReturned=$false
  }|ConvertTo-Json -Compress
}

if($Action -eq 'PostVerify'){
  Assert-StaticPrerequisites|Out-Null
  Invoke-WithForgeManagedDatabaseCredential -Operation {Assert-PostApply}
  exit 0
}
if(-not $RecoveryEvidencePath -or -not(Test-Path -LiteralPath $RecoveryEvidencePath -PathType Leaf)){throw 'A recovery-readiness evidence file is required.'}
if(-not $Operator){throw 'Operator identity is required.'}
if($Action -eq 'Apply' -and $Authorization -cne $token){throw 'Exact migration 428 operator authorization is required.'}
$recoveryEvidenceFullPath=[IO.Path]::GetFullPath($RecoveryEvidencePath)
$privateEvidenceRoot=[IO.Path]::GetFullPath((Join-Path $repo '.git/forge-private-evidence'))
$privateEvidencePrefix=$privateEvidenceRoot.TrimEnd([IO.Path]::DirectorySeparatorChar,[IO.Path]::AltDirectorySeparatorChar)+[IO.Path]::DirectorySeparatorChar
if(-not $recoveryEvidenceFullPath.StartsWith($privateEvidencePrefix,[StringComparison]::OrdinalIgnoreCase)){
  throw 'Migration 428 recovery evidence must be stored under .git/forge-private-evidence.'
}
Assert-StaticPrerequisites|Out-Null
$verify=Join-Path $PSScriptRoot 'verify-forge-account-admission-authority-428-hosted-deployment-policy.mjs'
$localArgs=@($verify,'--local-only','--action',$Action,'--recovery',$recoveryEvidenceFullPath,'--operator',$Operator)
if($Authorization){$localArgs+=@('--authorization',$Authorization)}
& node @localArgs|Out-Null
if($LASTEXITCODE -ne 0){throw 'Local migration 428 hosted policy rejected the operation.'}
try{
  Invoke-WithForgeManagedDatabaseCredential -Operation {
    $state=Get-HostedState
    $script:statePath=Join-Path ([IO.Path]::GetTempPath()) ('forge-account-admission-428-state-'+[guid]::NewGuid().ToString('N')+'.json')
    [IO.File]::WriteAllText($script:statePath,($state|ConvertTo-Json -Depth 6 -Compress),[Text.UTF8Encoding]::new($false))
    $args=@($verify,'--action',$Action,'--state',$script:statePath,'--recovery',$recoveryEvidenceFullPath,'--operator',$Operator)
    if($Authorization){$args+=@('--authorization',$Authorization)}
    $audit=@(& node @args);if($LASTEXITCODE -ne 0){throw 'Hosted migration 428 deployment policy rejected the operation.'}
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
