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
$targetVersion='20261030224605'
$targetSha256='ae6bbd4c37407ef2c34dd4762827e27c41241c1e8801f328bf2d9aeb6ec330b1'
$token='APPLY-HAMMER-OWNER-SPONSORSHIP-AUTHORITY-RENEWAL-427'
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
  $migrationPath=Join-Path $repo 'supabase/migrations/20261030224605_hammer_owner_sponsorship_authority_renewal.sql'
  if(-not(Test-Path -LiteralPath $migrationPath -PathType Leaf)){throw 'Migration 427 is missing.'}
  $sha=(Get-FileHash -LiteralPath $migrationPath -Algorithm SHA256).Hash.ToLowerInvariant()
  if($sha -cne $targetSha256){throw 'Migration 427 SHA-256 mismatch.'}
  [ordered]@{linked=$linked;sha=$sha}
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
  [ordered]@{projectRef=$static.linked;lineage=[string]$lineage[0].lineage;installedCount=$versions.Count;hostedHead=$versions[-1];pendingVersions=@($local|Where-Object{$_ -notin $versions});migrationSha256=$static.sha;databasePasswordAvailable=$true}
}
function Assert-PostApply {
  Assert-StaticPrerequisites|Out-Null
  $history=@(Read-LinkedCsv 'select version from supabase_migrations.schema_migrations order by version' @('version') 'post-apply history')
  $versions=@($history|ForEach-Object{[string]$_.version})
  if($versions.Count -ne 427 -or $versions[-1] -cne $targetVersion -or @($versions|Where-Object{$_ -eq $targetVersion}).Count -ne 1){throw 'Post-apply migration history verification failed.'}
  $sql=@'
with reserve_contract as (
  select pg_get_functiondef('tongs.reserve_operation(uuid,uuid,text,uuid,text)'::regprocedure) as definition
), renewal_contract as (
  select p.prosecdef,p.proowner='postgres'::regrole as postgres_owned,
    pg_get_functiondef(p.oid) as definition
  from pg_proc p
  where p.oid='tongs.renew_hammer_owner_funded_first_transcription_authority(uuid,uuid,uuid,uuid,uuid,uuid,text,timestamptz,timestamptz,bigint,bigint,bigint,boolean,timestamptz,timestamptz,text)'::regprocedure
), hammer_quotes as (
  select q.id,q.normal_maximum_charge_micros
  from tongs.customer_spending_quotes q
  join tongs.hammer_first_transcription_quote_bindings b on b.quote_id=q.id
  join tongs.hammer_first_transcription_activation_authorities activation on activation.id=b.activation_authority_id
  where b.user_id='71daf61b-57b3-4e5f-a8c8-64befecb5950'::uuid
    and activation.workspace_id='cc5478ff-37be-403e-824c-467fa7da061e'::uuid
    and activation.workpiece_id='21d16d6a-905b-491e-8761-028789612ae5'::uuid
)
select
  (select lineage from forge_meta.database_lineage where singleton=true) as lineage,
  (select position('_quote_owner_budget_allows(v_quote.id, v_budget.id)' in definition)>0 and position('_active_hammer_owner_sponsorship_for_quote(v_quote.id)' in definition)>0 and position('sponsorship.owner_budget_id=v_budget.id' in definition)>0 and position('sponsorship.beneficiary_user_id=v_quote.user_id' in definition)>0 from reserve_contract) as owner_sponsorship_guard,
  (select prosecdef and postgres_owned and position('submission_unknown' in definition)>0 and position('provider-attempt allowance is already consumed' in definition)>0 from renewal_contract) as renewal_hardened,
  not has_function_privilege('public','tongs.renew_hammer_owner_funded_first_transcription_authority(uuid,uuid,uuid,uuid,uuid,uuid,text,timestamptz,timestamptz,bigint,bigint,bigint,boolean,timestamptz,timestamptz,text)','EXECUTE') as public_execute_denied,
  not has_function_privilege('anon','tongs.renew_hammer_owner_funded_first_transcription_authority(uuid,uuid,uuid,uuid,uuid,uuid,text,timestamptz,timestamptz,bigint,bigint,bigint,boolean,timestamptz,timestamptz,text)','EXECUTE') as anon_execute_denied,
  not has_function_privilege('authenticated','tongs.renew_hammer_owner_funded_first_transcription_authority(uuid,uuid,uuid,uuid,uuid,uuid,text,timestamptz,timestamptz,bigint,bigint,bigint,boolean,timestamptz,timestamptz,text)','EXECUTE') as authenticated_execute_denied,
  has_function_privilege('service_role','tongs.renew_hammer_owner_funded_first_transcription_authority(uuid,uuid,uuid,uuid,uuid,uuid,text,timestamptz,timestamptz,bigint,bigint,bigint,boolean,timestamptz,timestamptz,text)','EXECUTE') as service_execute_granted,
  (select relrowsecurity and relforcerowsecurity from pg_class where oid='tongs.hammer_first_transcription_activation_revocations'::regclass) as revocation_rls,
  exists(select 1 from pg_trigger where tgrelid='tongs.hammer_first_transcription_activation_authorities'::regclass and tgname='hammer_first_transcription_activation_insert_guard' and tgenabled='O') as overlap_guard,
  exists(select 1 from pg_trigger where tgrelid='tongs.hammer_first_transcription_activation_consumptions'::regclass and tgname='hammer_first_transcription_consumption_insert_guard' and tgenabled='O') as cross_renewal_attempt_guard,
  not exists(select 1 from pg_constraint where conrelid='tongs.hammer_first_transcription_activation_authorities'::regclass and contype='u' and pg_get_constraintdef(oid) like 'UNIQUE (user_id, canonical_recording_id, recording_revision_id)%') as renewal_unique_removed,
  tongs._current_financial_environment() as financial_environment,
  (select count(*) from tongs.hammer_first_transcription_activation_revocations) as revocations,
  (select count(*) from tongs.funding_reservations r join hammer_quotes q on q.id=r.quote_id) as reservations,
  (select count(*) from tongs.hammer_transcription_operations o join hammer_quotes q on q.id=o.quote_id) as operations,
  (select count(*) from tongs.hammer_transcription_provider_attempts a join tongs.hammer_transcription_operations o on o.id=a.operation_id join hammer_quotes q on q.id=o.quote_id) as provider_attempts,
  (select count(*) from tongs.hammer_canonical_transcripts_v2 t join tongs.hammer_transcription_operations o on o.id=t.operation_id join hammer_quotes q on q.id=o.quote_id) as transcripts,
  (select coalesce(sum(event.customer_charge_micros),0)
   from tongs.funding_reservation_events event
   join tongs.funding_reservations reservation on reservation.id=event.reservation_id
   join hammer_quotes q on q.id=reservation.quote_id) as customer_charge_micros;
'@
  $columns=@('lineage','owner_sponsorship_guard','renewal_hardened','public_execute_denied','anon_execute_denied','authenticated_execute_denied','service_execute_granted','revocation_rls','overlap_guard','cross_renewal_attempt_guard','renewal_unique_removed','financial_environment','revocations','reservations','operations','provider_attempts','transcripts','customer_charge_micros')
  $rows=@(Read-LinkedCsv $sql $columns 'migration 427 post-apply contract')
  if($rows.Count -ne 1){throw 'Migration 427 post-apply contract is unavailable.'}
  $row=$rows[0]
  foreach($name in @('owner_sponsorship_guard','renewal_hardened','public_execute_denied','anon_execute_denied','authenticated_execute_denied','service_execute_granted','revocation_rls','overlap_guard','cross_renewal_attempt_guard','renewal_unique_removed')){if([string]$row.$name -notmatch '^(t|true)$'){throw "Migration 427 post-apply $name failed."}}
  if([string]$row.lineage -cne 'historical-v1' -or [string]$row.financial_environment -cne 'test' -or [int]$row.revocations -ne 0 -or [int]$row.reservations -ne 0 -or [int]$row.operations -ne 0 -or [int]$row.provider_attempts -ne 0 -or [int]$row.transcripts -ne 0 -or [int64]$row.customer_charge_micros -ne 0){throw 'Migration 427 financial inactivity verification failed.'}
  [pscustomobject]@{ok=$true;schema='forge.hammer-owner-sponsorship-authority-renewal-427-hosted-postverify.v1';projectRef=$projectRef;installedCount=427;hostedHead=$targetVersion;lineage='historical-v1';customerDataReturned=$false;credentialsReturned=$false}|ConvertTo-Json -Compress
}

if($Action -eq 'PostVerify'){
  Invoke-WithForgeManagedDatabaseCredential -Operation {Assert-PostApply}
  exit 0
}
if(-not $RecoveryEvidencePath -or -not(Test-Path -LiteralPath $RecoveryEvidencePath -PathType Leaf)){throw 'A recovery-readiness evidence file is required.'}
if(-not $Operator){throw 'Operator identity is required.'}
if($Action -eq 'Apply' -and $Authorization -cne $token){throw 'Exact operator authorization is required.'}
Assert-StaticPrerequisites|Out-Null
$verify=Join-Path $PSScriptRoot 'verify-hammer-owner-sponsorship-authority-renewal-427-hosted-deployment-policy.mjs'
$localArgs=@($verify,'--local-only','--action',$Action,'--recovery',([IO.Path]::GetFullPath($RecoveryEvidencePath)),'--operator',$Operator)
if($Authorization){$localArgs+=@('--authorization',$Authorization)}
& node @localArgs|Out-Null
if($LASTEXITCODE -ne 0){throw 'Local hosted policy rejected the operation.'}
try{
  Invoke-WithForgeManagedDatabaseCredential -Operation {
    $state=Get-HostedState
    $script:statePath=Join-Path ([IO.Path]::GetTempPath()) ('forge-hammer-427-state-'+[guid]::NewGuid().ToString('N')+'.json')
    [IO.File]::WriteAllText($script:statePath,($state|ConvertTo-Json -Depth 5 -Compress),[Text.UTF8Encoding]::new($false))
    $args=@($verify,'--action',$Action,'--state',$script:statePath,'--recovery',([IO.Path]::GetFullPath($RecoveryEvidencePath)),'--operator',$Operator)
    if($Authorization){$args+=@('--authorization',$Authorization)}
    $audit=@(& node @args);if($LASTEXITCODE -ne 0){throw 'Hosted deployment policy rejected the operation.'}
    if($Action -eq 'Preflight'){
      Invoke-Supabase @('migration','list','--linked','--workdir',$repo,'--agent=no')|Out-Null
      Invoke-Supabase @('db','push','--linked','--dry-run','--workdir',$repo,'--agent=no')|Out-Null
      return $audit
    }
    Invoke-Supabase @('db','push','--linked','--workdir',$repo,'--agent=no')|Out-Null
    Assert-PostApply
  }
} finally {if($statePath -and(Test-Path -LiteralPath $statePath)){Remove-Item -LiteralPath $statePath -Force}}
