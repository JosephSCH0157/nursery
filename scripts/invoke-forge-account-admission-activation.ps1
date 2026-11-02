[CmdletBinding()]
param(
  [Parameter(Mandatory)][ValidateSet('Preflight','Activate','PostVerify','Deactivate','PostDeactivate')][string]$Action,
  [string]$RecoveryEvidencePath,
  [string]$RuntimeProbeBundlePath,
  [Parameter(Mandatory)][string]$Operator,
  [string]$Authorization,
  [Parameter(Mandatory)][ValidatePattern('^[0-9a-f]{40}$')][string]$ApplicationCommit,
  [string]$RepositoryRoot=(Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference='Stop'
$repo=[IO.Path]::GetFullPath($RepositoryRoot)
$projectRef='wtvdjndyxegudufrompx'
$siteId='d5c7485d-35eb-4c66-b22d-410b09b38a73'
$migrationVersion='20261102032722'
$migrationSha256='12c3688094eeb00bb294339d6ee738c1b52421cb99204df4af32d92fa3f32cbb'
$activationSha256='3210eca3ac26cb073ef188f5d212fd53bbe641d75f5a78bf088e121c5a96230f'
$deactivationSha256='9cf926d1f1caccdcc2e00274df6fd1667c4165e64bc10a04a87328ca4574a9ae'
$surfaceSha256='7818379a0ad7b9ceebf0752247b1aff9be64c7d3e5b4792529a933e17ba78036'
$policySha256='bc4addcb638a6cd10401c73c3d54f5a39698f7a155df384438c7393ec1b357ac'
$externalStatePolicySha256='11261a53c6db0cdc284bb8f6fcf80416f6539ffaf2ff7479c335ea9c60bf4d0e'
$runtimeProbePolicySha256='5e2ebc1d1120540b4ae2be9ce2cecac51a037944c3b9790a22dd7c5defd1a276'
$runtimeProbeRunnerSha256='31b757e76cdeefd0c821d000327dc398ba5b7d84ca9cc418f7ac4e5b7fa18030'
$activateToken='ACTIVATE-FORGE-ACCOUNT-ADMISSION-ENFORCEMENT-V1'
$deactivateToken='DEACTIVATE-FORGE-ACCOUNT-ADMISSION-ENFORCEMENT-V1'
$statePath=$null
$externalStatePath=$null
$apiObservationPath=$null
$operationSqlPath=$null
$runtimeProbeBundleFullPath=$null
. (Join-Path $PSScriptRoot 'lib/forge-managed-credential.ps1')
. (Join-Path $PSScriptRoot 'lib/forge-supabase-cli.ps1')

function Invoke-Supabase([string[]]$Arguments){Invoke-ForgeSupabaseCli -Arguments $Arguments}
function Read-LinkedCsv([string]$Sql,[string[]]$Columns,[string]$Context){
  $result=Invoke-Supabase @('db','query','--linked','--agent=no','--output','csv','--workdir',$repo,$Sql)
  @(ConvertFrom-ForgeSupabaseCsv -StandardOutput $result.StandardOutput -ExpectedColumns $Columns -Context $Context)
}
function Assert-Hash([string]$RelativePath,[string]$Expected,[string]$Label){
  $path=Join-Path $repo $RelativePath
  if(-not(Test-Path -LiteralPath $path -PathType Leaf)){throw "$Label is missing."}
  if((Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant() -cne $Expected){throw "$Label SHA-256 mismatch."}
}
function Assert-StaticPrerequisites {
  if((Invoke-Supabase @('--version')).StandardOutput.Trim() -cne '2.84.2'){throw 'Supabase CLI 2.84.2 is required.'}
  $linkedPath=Join-Path $repo 'supabase/.temp/project-ref'
  if(-not(Test-Path -LiteralPath $linkedPath -PathType Leaf) -or (Get-Content -LiteralPath $linkedPath -Raw).Trim() -cne $projectRef){
    throw 'Linked project does not match the pinned Forge project.'
  }
  Assert-Hash 'supabase/migrations/20261102032722_forge_admission_activation_preparation.sql' $migrationSha256 'Migration 431'
  Assert-Hash 'supabase/activation/forge-account-admission-activation-v1.sql' $activationSha256 'Admission activation transaction'
  Assert-Hash 'supabase/activation/forge-account-admission-deactivation-v1.sql' $deactivationSha256 'Admission deactivation transaction'
  Assert-Hash 'docs/admission/ADMISSION_ACTIVATION_DATABASE_SURFACE.v1.json' $surfaceSha256 'Admission activation surface'
  Assert-Hash 'scripts/lib/forge-account-admission-activation-policy.mjs' $policySha256 'Admission activation policy'
  Assert-Hash 'scripts/lib/forge-account-admission-activation-external-state.mjs' $externalStatePolicySha256 'Admission activation external-state policy'
  Assert-Hash 'scripts/lib/forge-account-admission-runtime-probes.mjs' $runtimeProbePolicySha256 'Admission runtime-probe policy'
  Assert-Hash 'scripts/verify-forge-account-admission-runtime-probes.mjs' $runtimeProbeRunnerSha256 'Admission runtime-probe runner'
  $localHead=(& git -C $repo rev-parse HEAD).Trim()
  if($LASTEXITCODE -ne 0 -or $localHead -cne $ApplicationCommit){throw 'Local HEAD does not match the authorized application commit.'}
  $remoteLine=(& git -C $repo ls-remote --exit-code origin refs/heads/main|Out-String).Trim()
  if($LASTEXITCODE -ne 0 -or $remoteLine -notmatch '^(?<sha>[0-9a-f]{40})\s+refs/heads/main$' -or $Matches.sha -cne $ApplicationCommit){
    throw 'GitHub main does not match the authorized application commit.'
  }
  [ordered]@{localHead=$localHead;remoteMain=$Matches.sha}
}
function New-TrustedRecoveryApiObservation([string]$EvidencePath){
  $evidence=Get-Content -LiteralPath $EvidencePath -Raw|ConvertFrom-Json
  if([string]$evidence.schema -cne 'forge.hosted-recovery-readiness.v2' -or [string]::IsNullOrWhiteSpace([string]$evidence.management_api.backup_id)){
    throw 'Admission activation requires authenticated Management API recovery evidence.'
  }
  $collector=Join-Path $PSScriptRoot 'collect-hosted-recovery-readiness-evidence.mjs'
  $observation=Invoke-WithForgeManagedSupabaseCapacityReadCredential -Operation {
    $lines=@(& node $collector --action Observe --project-ref $projectRef --expected-backup-id ([string]$evidence.management_api.backup_id))
    if($LASTEXITCODE -ne 0){throw 'Authenticated Supabase Management API backup verification failed.'}
    $lines -join [Environment]::NewLine
  }
  $path=Join-Path ([IO.Path]::GetTempPath()) ('forge-admission-activation-recovery-'+[guid]::NewGuid().ToString('N')+'.json')
  [IO.File]::WriteAllText($path,$observation,[Text.UTF8Encoding]::new($false))
  $path
}
function New-ExternalStateObservation {
  $collector=Join-Path $PSScriptRoot 'collect-forge-account-admission-activation-external-state.mjs'
  $observation=Invoke-WithForgeManagedCapacityReadCredentials -Operation {
    $lines=@(& node $collector)
    if($LASTEXITCODE -ne 0){throw 'Authenticated application/Auth activation-state collection failed.'}
    $lines -join [Environment]::NewLine
  }
  $parsed=$observation|ConvertFrom-Json
  if([string]$parsed.siteId -cne $siteId -or [string]$parsed.projectRef -cne $projectRef){throw 'External activation observation identity mismatch.'}
  $path=Join-Path ([IO.Path]::GetTempPath()) ('forge-admission-activation-external-'+[guid]::NewGuid().ToString('N')+'.json')
  [IO.File]::WriteAllText($path,$observation,[Text.UTF8Encoding]::new($false))
  $path
}
function Get-DatabaseState([object]$Static,[object]$ExternalState){
  $catalogPath=Join-Path ([IO.Path]::GetTempPath()) ('forge-admission-activation-catalog-'+[guid]::NewGuid().ToString('N')+'.json')
  try{
    $catalog=& (Join-Path $PSScriptRoot 'capture-canonical-baseline-v1-catalog.ps1') -Target linked -OutputPath $catalogPath -ExpectedPath (Join-Path $repo 'docs/database/baseline/v1-account-admission-activation-preparation/successor-catalog-fingerprint.json') -ExtensionCompatibilityPath (Join-Path $repo 'docs/database/baseline/v1-gate3/wrappers-extension-compatibility.json') -RepositoryRoot $repo|ConvertFrom-Json
    $sql=@'
with relation_rows as (
  select n.nspname as schema_name,c.relname as object_name,
    concat_ws('|',n.nspname,c.relname,
      case c.relkind when 'r' then 'table' when 'p' then 'partitioned_table' when 'v' then 'view' when 'm' then 'materialized_view' end,
      c.relrowsecurity::text,c.relforcerowsecurity::text,
      has_table_privilege('authenticated',c.oid,'SELECT')::text,
      has_table_privilege('authenticated',c.oid,'INSERT')::text,
      has_table_privilege('authenticated',c.oid,'UPDATE')::text,
      has_table_privilege('authenticated',c.oid,'DELETE')::text,
      coalesce(c.relacl::text,'')) as value
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname in ('public','tongs') and c.relkind in ('r','p','v','m')
    and (has_table_privilege('authenticated',c.oid,'SELECT') or has_table_privilege('authenticated',c.oid,'INSERT')
      or has_table_privilege('authenticated',c.oid,'UPDATE') or has_table_privilege('authenticated',c.oid,'DELETE'))
), function_rows as (
  select n.nspname as schema_name,p.oid::regprocedure::text as signature,
    concat_ws('|',n.nspname,p.oid::regprocedure::text,p.proowner::regrole::text,p.prosecdef::text,p.provolatile::text,
      coalesce(array_to_string(p.proconfig,','),''),coalesce(p.proacl::text,'')) as value
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname in ('graphql_public','public','tongs') and has_function_privilege('authenticated',p.oid,'EXECUTE')
), storage_rows as (
  select policyname,
    concat_ws('|',policyname,lower(cmd),permissive,array_to_string(roles,','),coalesce(qual,''),coalesce(with_check,'')) as value
  from pg_policies where schemaname='storage' and tablename='objects' and 'authenticated'=any(roles)
    and policyname not like 'forge_account_admission_storage_%_v1'
), authority_rows as (
  select 'function|'||p.oid::regprocedure::text||'|'||p.proowner::regrole::text||'|'||p.prosecdef::text||'|'||
    coalesce(array_to_string(p.proconfig,','),'')||'|'||coalesce(p.proacl::text,'')||'|'||pg_get_functiondef(p.oid) as value
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('tongs','public','storage','realtime') and p.prokind<>'a'
  union all
  select 'policy|'||schemaname||'.'||tablename||'|'||policyname||'|'||cmd||'|'||permissive||'|'||
    coalesce(array_to_string(roles,','),'')||'|'||coalesce(qual,'')||'|'||coalesce(with_check,'')
  from pg_policies where schemaname in ('tongs','public','storage','realtime') and policyname not like 'forge_account_admission%'
  union all
  select 'relation|'||n.nspname||'.'||c.relname||'|'||c.relowner::regrole::text||'|'||c.relrowsecurity::text||'|'||
    c.relforcerowsecurity::text||'|'||coalesce(c.relacl::text,'')
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname in ('tongs','public','storage','realtime') and c.relkind in ('r','p','v','m','S')
  union all
  select 'trigger|'||n.nspname||'.'||c.relname||'|'||t.tgname||'|'||t.tgenabled::text||'|'||pg_get_triggerdef(t.oid,true)
  from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
  where not t.tgisinternal and n.nspname in ('tongs','public','storage','realtime')
), latest_event as (
  select distinct on (user_id) user_id,revision,event_type from tongs.account_admission_events order by user_id,revision desc
)
select
  (select lineage from forge_meta.database_lineage where singleton=true) as lineage,
  (select count(*) from supabase_migrations.schema_migrations) as migration_count,
  (select max(version) from supabase_migrations.schema_migrations) as migration_head,
  (select count(*) from relation_rows) as relation_count,
  encode(extensions.digest(coalesce((select string_agg(value,E'\n' order by schema_name,object_name) from relation_rows),''),'sha256'),'hex') as relation_sha256,
  (select count(*) from function_rows) as function_count,
  encode(extensions.digest(coalesce((select string_agg(value,E'\n' order by schema_name,signature) from function_rows),''),'sha256'),'hex') as function_sha256,
  (select count(*) from storage_rows) as storage_policy_count,
  encode(extensions.digest(coalesce((select string_agg(value,E'\n' order by policyname) from storage_rows),''),'sha256'),'hex') as storage_policy_sha256,
  coalesce((select split_part(item.value,'=',2) from pg_db_role_setting setting join pg_roles role on role.oid=setting.setrole
    cross join lateral unnest(setting.setconfig) item(value) where role.rolname='authenticator' and item.value like 'pgrst.db_pre_request=%' limit 1),'') as pre_request_setting,
  (select count(*) from pg_policies where schemaname in ('public','tongs') and policyname='forge_account_admission_required_v1') as data_api_policy_count,
  (select count(*) from pg_policies where schemaname='storage' and policyname like 'forge_account_admission_storage_%_v1') as storage_admission_policy_count,
  (select count(*) from pg_policies where schemaname='realtime' and policyname like 'forge_account_admission%') as realtime_admission_policy_count,
  not exists(select 1 from pg_policies where schemaname in ('public','tongs') and policyname='forge_account_admission_required_v1'
    and (permissive<>'RESTRICTIVE' or lower(cmd)<>'all' or roles<>array['authenticated']::name[]
      or qual not like '%current_request_is_admitted()%' or with_check not like '%current_request_is_admitted()%')) as data_api_policy_contract_valid,
  not exists(select 1 from pg_policies where schemaname='storage' and policyname like 'forge_account_admission_storage_%_v1'
    and (permissive<>'RESTRICTIVE' or roles<>array['authenticated']::name[]
      or coalesce(qual,'')||coalesce(with_check,'') not like '%current_request_is_admitted()%')) as storage_policy_contract_valid,
  pg_get_functiondef('tongs.account_admission_pre_request()'::regprocedure) like '%set_config(''forge.account_admission_enforcement'', ''on'', true)%'
    and pg_get_functiondef('tongs._guard_new_customer_financial_authorization()'::regprocedure) like '%effective_state = ''admitted''%'
    as financial_transaction_guard_valid,
  (select count(*) from tongs.legacy_account_admission_cohort) as legacy_cohort_count,
  encode(extensions.digest(coalesce((select string_agg(to_jsonb(row_value)::text,E'\n' order by row_value.user_id) from tongs.legacy_account_admission_cohort row_value),''),'sha256'),'hex') as legacy_cohort_sha256,
  encode(extensions.digest(coalesce((select string_agg(to_jsonb(row_value)::text,E'\n' order by row_value.user_id) from tongs.account_admissions row_value),''),'sha256'),'hex') as admission_projection_sha256,
  not exists(select 1 from latest_event event full join tongs.account_admissions admission using(user_id)
    where event.user_id is null or admission.user_id is null
      or admission.event_revision<>event.revision
      or admission.effective_state<>(case event.event_type when 'revoke' then 'revoked' else 'admitted' end)) as projection_consistent,
  (select count(*) from tongs.beta_access_invitation_events) as invitation_journal_count,
  encode(extensions.digest(coalesce((select string_agg(value,E'\n' order by value) from authority_rows),''),'sha256'),'hex') as financial_authority_sha256;
'@
    $columns=@('lineage','migration_count','migration_head','relation_count','relation_sha256','function_count','function_sha256',
      'storage_policy_count','storage_policy_sha256','pre_request_setting','data_api_policy_count','storage_admission_policy_count',
      'realtime_admission_policy_count','data_api_policy_contract_valid','storage_policy_contract_valid','financial_transaction_guard_valid',
      'legacy_cohort_count','legacy_cohort_sha256','admission_projection_sha256','projection_consistent','invitation_journal_count',
      'financial_authority_sha256')
    $rows=@(Read-LinkedCsv $sql $columns 'account-admission activation state')
    if($rows.Count -ne 1){throw 'Account-admission activation state is unavailable.'}
    $row=$rows[0]
    [ordered]@{
      projectRef=$projectRef;lineage=[string]$row.lineage;migrationCount=[int]$row.migration_count;migrationHead=[string]$row.migration_head
      migrationSha256=$migrationSha256;catalogObjectCount=[int]$catalog.objectCount;catalogSha256=[string]$catalog.contractSha256
      relationCount=[int]$row.relation_count;relationSha256=[string]$row.relation_sha256
      functionCount=[int]$row.function_count;functionSha256=[string]$row.function_sha256
      storagePolicyCount=[int]$row.storage_policy_count;storagePolicySha256=[string]$row.storage_policy_sha256
      preRequestSetting=[string]$row.pre_request_setting;dataApiAdmissionPolicyCount=[int]$row.data_api_policy_count
      storageAdmissionPolicyCount=[int]$row.storage_admission_policy_count;realtimeAdmissionPolicyCount=[int]$row.realtime_admission_policy_count
      dataApiPolicyContractValid=([string]$row.data_api_policy_contract_valid -match '^(t|true)$')
      storagePolicyContractValid=([string]$row.storage_policy_contract_valid -match '^(t|true)$')
      financialTransactionGuardValid=([string]$row.financial_transaction_guard_valid -match '^(t|true)$')
      legacyCohortCount=[int]$row.legacy_cohort_count;legacyCohortSha256=[string]$row.legacy_cohort_sha256
      admissionProjectionSha256=[string]$row.admission_projection_sha256;projectionConsistent=([string]$row.projection_consistent -match '^(t|true)$')
      invitationJournalCount=[int]$row.invitation_journal_count;financialAuthoritySha256=[string]$row.financial_authority_sha256
      applicationCommit=$ApplicationCommit;remoteMain=[string]$Static.remoteMain;externalState=$ExternalState
    }
  } finally {if(Test-Path -LiteralPath $catalogPath){Remove-Item -LiteralPath $catalogPath -Force}}
}
function Invoke-RuntimeProbe([ValidateSet('preflight','active')][string]$Mode){
  if(-not $runtimeProbeBundleFullPath){throw 'BLOCKED: a private governed runtime-probe bundle is required.'}
  $runner=Join-Path $PSScriptRoot 'verify-forge-account-admission-runtime-probes.mjs'
  $lines=@(& node $runner --mode $Mode --environment hosted --project-ref $projectRef --api-origin "https://$projectRef.supabase.co" --bundle $runtimeProbeBundleFullPath)
  if($LASTEXITCODE -ne 0){throw "BLOCKED: authenticated PostgREST runtime-probe $Mode failed."}
  $receipt=($lines -join [Environment]::NewLine)|ConvertFrom-Json
  if(-not $receipt.complete -or -not $receipt.actualPostgrestRequestsExecuted){throw 'BLOCKED: runtime-probe receipt is incomplete.'}
  $receipt
}
function Register-RecoveryEvidenceUse([string]$UseKey){
  if($UseKey -notmatch '^[0-9a-f]{64}$'){throw 'Activation recovery-evidence use key is invalid.'}
  $usedDirectory=Join-Path $repo '.git/forge-private-evidence/used'
  [IO.Directory]::CreateDirectory($usedDirectory)|Out-Null
  $markerPath=Join-Path $usedDirectory ("admission-activation-$UseKey.json")
  $receipt=[ordered]@{schema='forge.account-admission-activation-evidence-use.v1';application_commit=$ApplicationCommit;operator=$Operator;consumed_at=[DateTimeOffset]::UtcNow.ToString('O')}|ConvertTo-Json -Compress
  try{
    $stream=[IO.File]::Open($markerPath,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
    try{$bytes=[Text.UTF8Encoding]::new($false).GetBytes($receipt);$stream.Write($bytes,0,$bytes.Length);$stream.Flush($true)}finally{$stream.Dispose()}
  } catch [IO.IOException] {throw 'Activation recovery evidence was already consumed; obtain a new change window.'}
}
function Invoke-GovernedSql([string]$RelativePath,[string]$SettingName){
  $source=Get-Content -LiteralPath (Join-Path $repo $RelativePath) -Raw
  $safeOperator=$Operator.Replace("'","''")
  $prefix="select set_config('$SettingName','$safeOperator',false);"
  if($SettingName -eq 'forge.activation_operator'){$prefix="select set_config('forge.activation_application_commit','$ApplicationCommit',false);`n$prefix"}
  $script:operationSqlPath=Join-Path ([IO.Path]::GetTempPath()) ('forge-account-admission-operation-'+[guid]::NewGuid().ToString('N')+'.sql')
  [IO.File]::WriteAllText($script:operationSqlPath,"$prefix`n$source",[Text.UTF8Encoding]::new($false))
  Invoke-Supabase @('db','query','--linked','--agent=no','--workdir',$repo,'--file',$script:operationSqlPath)|Out-Null
}

if($Action -eq 'Activate' -and $Authorization -cne $activateToken){throw 'Exact owner activation authorization is required.'}
if($Action -eq 'Deactivate' -and $Authorization -cne $deactivateToken){throw 'Exact owner deactivation authorization is required.'}
if($Action -in @('Preflight','Activate')){
  if(-not $RecoveryEvidencePath -or -not(Test-Path -LiteralPath $RecoveryEvidencePath -PathType Leaf)){throw 'Fresh recovery-readiness evidence is required.'}
  $recoveryEvidenceFullPath=[IO.Path]::GetFullPath($RecoveryEvidencePath)
  $privateEvidenceRoot=[IO.Path]::GetFullPath((Join-Path $repo '.git/forge-private-evidence'))
  if(-not $recoveryEvidenceFullPath.StartsWith($privateEvidenceRoot+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){
    throw 'Recovery evidence must be private under .git/forge-private-evidence.'
  }
}
if($Action -in @('Preflight','Activate','PostVerify')){
  if(-not $RuntimeProbeBundlePath -or -not(Test-Path -LiteralPath $RuntimeProbeBundlePath -PathType Leaf)){
    throw 'BLOCKED: a fresh runtime-probe bundle is required for activation Preflight/Activate/PostVerify.'
  }
  $runtimeProbeBundleFullPath=[IO.Path]::GetFullPath($RuntimeProbeBundlePath)
  $privateEvidenceRoot=[IO.Path]::GetFullPath((Join-Path $repo '.git/forge-private-evidence'))
  if(-not $runtimeProbeBundleFullPath.StartsWith($privateEvidenceRoot+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){
    throw 'Runtime-probe bundle must be private under .git/forge-private-evidence.'
  }
}

try{
  $static=Assert-StaticPrerequisites
  $externalStatePath=New-ExternalStateObservation
  $externalState=Get-Content -LiteralPath $externalStatePath -Raw|ConvertFrom-Json
  if($Action -in @('Preflight','Activate')){$apiObservationPath=New-TrustedRecoveryApiObservation -EvidencePath $recoveryEvidenceFullPath}
  Invoke-WithForgeManagedDatabaseCredential -Operation {
    $state=Get-DatabaseState -Static $static -ExternalState $externalState
    if($Action -in @('Preflight','Activate')){$state['runtimeProbeReadiness']=Invoke-RuntimeProbe -Mode preflight}
    if($Action -eq 'PostVerify'){$state['runtimeProbeExecution']=Invoke-RuntimeProbe -Mode active}
    $script:statePath=Join-Path ([IO.Path]::GetTempPath()) ('forge-account-admission-activation-state-'+[guid]::NewGuid().ToString('N')+'.json')
    [IO.File]::WriteAllText($script:statePath,($state|ConvertTo-Json -Depth 12 -Compress),[Text.UTF8Encoding]::new($false))
    $verifyArgs=@((Join-Path $PSScriptRoot 'verify-forge-account-admission-activation-policy.mjs'),'--action',$Action,'--state',$script:statePath,'--operator',$Operator)
    if($Authorization){$verifyArgs+=@('--authorization',$Authorization)}
    if($Action -in @('Preflight','Activate')){$verifyArgs+=@('--recovery',$recoveryEvidenceFullPath,'--api-observation',$apiObservationPath)}
    $audit=@(& node @verifyArgs);if($LASTEXITCODE -ne 0){throw 'Account-admission activation policy rejected the operation.'}
    if($Action -eq 'Preflight'){return ($audit -join [Environment]::NewLine)}
    if($Action -eq 'Activate'){
      $receipt=($audit -join [Environment]::NewLine)|ConvertFrom-Json
      Register-RecoveryEvidenceUse -UseKey ([string]$receipt.recoveryUseKey).Trim()
      Invoke-GovernedSql 'supabase/activation/forge-account-admission-activation-v1.sql' 'forge.activation_operator'
      $post=Get-DatabaseState -Static $static -ExternalState $externalState
      foreach($field in @('legacyCohortSha256','admissionProjectionSha256','financialAuthoritySha256')){
        if([string]$state.$field -cne [string]$post.$field){throw "Activation changed protected fingerprint $field."}
      }
      $post['runtimeProbeExecution']=Invoke-RuntimeProbe -Mode active
      $postPath=Join-Path ([IO.Path]::GetTempPath()) ('forge-account-admission-post-state-'+[guid]::NewGuid().ToString('N')+'.json')
      try{
        [IO.File]::WriteAllText($postPath,($post|ConvertTo-Json -Depth 12 -Compress),[Text.UTF8Encoding]::new($false))
        & node (Join-Path $PSScriptRoot 'verify-forge-account-admission-activation-policy.mjs') --action PostVerify --state $postPath --operator $Operator|Out-Null
        if($LASTEXITCODE -ne 0){throw 'Activation PostVerify failed; retain fail-closed application flags and investigate.'}
      } finally {if(Test-Path -LiteralPath $postPath){Remove-Item -LiteralPath $postPath -Force}}
      return [pscustomobject]@{ok=$true;schema='forge.account-admission-activation-receipt.v1';action='Activate';applicationCommit=$ApplicationCommit;recoveryEvidenceConsumed=$true;admissionEnforcementActive=$true;structuralValidationPassed=$true;runtimeProbesExecuted=$true;runtimeProbeEvidenceSha256=[string]$post.runtimeProbeExecution.evidenceSha256;unverifiedExternalState=@('netlify_configuration','hosted_auth_configuration');customerDataReturned=$false;credentialsReturned=$false}|ConvertTo-Json -Compress
    }
    if($Action -eq 'Deactivate'){
      Invoke-GovernedSql 'supabase/activation/forge-account-admission-deactivation-v1.sql' 'forge.deactivation_operator'
      $post=Get-DatabaseState -Static $static -ExternalState $externalState
      foreach($field in @('legacyCohortSha256','admissionProjectionSha256','financialAuthoritySha256')){
        if([string]$state.$field -cne [string]$post.$field){throw "Deactivation changed protected fingerprint $field."}
      }
      $postPath=Join-Path ([IO.Path]::GetTempPath()) ('forge-account-admission-post-deactivate-state-'+[guid]::NewGuid().ToString('N')+'.json')
      try{
        [IO.File]::WriteAllText($postPath,($post|ConvertTo-Json -Depth 12 -Compress),[Text.UTF8Encoding]::new($false))
        & node (Join-Path $PSScriptRoot 'verify-forge-account-admission-activation-policy.mjs') --action PostDeactivate --state $postPath --operator $Operator|Out-Null
        if($LASTEXITCODE -ne 0){throw 'Deactivation PostVerify failed; keep application flags enabled and investigate.'}
      } finally {if(Test-Path -LiteralPath $postPath){Remove-Item -LiteralPath $postPath -Force}}
      return [pscustomobject]@{ok=$true;schema='forge.account-admission-deactivation-receipt.v1';postDeactivatePassed=$true;protectedFingerprintsPreserved=$true;applicationFlagsMustRemainEnabled=$true;databaseAdmissionEnforcementActive=$false}|ConvertTo-Json -Compress
    }
    return ($audit -join [Environment]::NewLine)
  }
} finally {
  foreach($path in @($statePath,$externalStatePath,$apiObservationPath,$operationSqlPath)){if($path -and(Test-Path -LiteralPath $path)){Remove-Item -LiteralPath $path -Force}}
}
