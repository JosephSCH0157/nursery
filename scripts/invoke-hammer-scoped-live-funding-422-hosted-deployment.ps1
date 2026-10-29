[CmdletBinding()]
param(
  [Parameter(Mandatory)][ValidateSet('Preflight','Apply','PostVerify')][string]$Action,
  [string]$RecoveryEvidencePath,
  [string]$Operator,
  [string]$Authorization,
  [string]$RepositoryRoot = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference='Stop'
$repo=[IO.Path]::GetFullPath($RepositoryRoot)
$projectRef='wtvdjndyxegudufrompx'
$targetVersion='20261029033827'
$targetSha256='d395a843a9ab29029404749d187236d3a40efddbf6eb96cd6560c3a46b20f0d2'
$statePath=$null
. (Join-Path $PSScriptRoot 'lib/forge-managed-credential.ps1')
. (Join-Path $PSScriptRoot 'lib/forge-supabase-cli.ps1')

function Invoke-Supabase([string[]]$Arguments) { return Invoke-ForgeSupabaseCli -Arguments $Arguments }
function Read-LinkedCsv([string]$Sql,[string[]]$ExpectedColumns,[string]$Context) {
  $result=Invoke-Supabase @('db','query','--linked','--agent=no','--output','csv','--workdir',$repo,$Sql)
  return @(ConvertFrom-ForgeSupabaseCsv -StandardOutput $result.StandardOutput -ExpectedColumns $ExpectedColumns -Context $Context)
}
function Assert-StaticPrerequisites {
  $linkedPath=Join-Path $repo 'supabase/.temp/project-ref'
  if(-not(Test-Path -LiteralPath $linkedPath -PathType Leaf)){throw 'Linked project reference is unavailable.'}
  $linked=((Get-Content -LiteralPath $linkedPath -Raw).Trim())
  if($linked -cne $projectRef){throw 'Linked project does not match the pinned Forge project.'}
  if((Invoke-Supabase @('--version')).StandardOutput.Trim() -cne '2.84.2'){throw 'Supabase CLI 2.84.2 is required.'}
  $migrationPath=Join-Path $repo 'supabase/migrations/20261029033827_hammer_scoped_live_funding.sql'
  if(-not(Test-Path -LiteralPath $migrationPath -PathType Leaf)){throw 'Migration 422 is missing.'}
  $sha=(Get-FileHash -LiteralPath $migrationPath -Algorithm SHA256).Hash.ToLowerInvariant()
  if($sha -cne $targetSha256){throw 'Migration 422 SHA-256 mismatch.'}
  return [ordered]@{linked=$linked;sha=$sha}
}
function Get-HostedState {
  $static=Assert-StaticPrerequisites
  & (Join-Path $PSScriptRoot 'verify-canonical-database-artifacts.ps1') -RepositoryRoot $repo|Out-Null
  & (Join-Path $PSScriptRoot 'verify-supabase-lineage.ps1') -Lineage historical -Workdir $repo -DatabaseTarget linked -Mode preflight -RepositoryRoot $repo|Out-Null
  $history=@(Read-LinkedCsv 'select version from supabase_migrations.schema_migrations order by version' @('version') 'hosted migration history')
  $versions=@($history|ForEach-Object{[string]$_.version})
  $lineageRows=@(Read-LinkedCsv "select lineage from forge_meta.database_lineage where singleton=true" @('lineage') 'hosted lineage')
  if($lineageRows.Count -ne 1){throw 'Hosted lineage singleton is unavailable.'}
  $localVersions=@(Get-ChildItem -LiteralPath (Join-Path $repo 'supabase/migrations') -Filter '*.sql' -File|Sort-Object Name|ForEach-Object{if($_.BaseName -match '^(\d{8,14})_'){$Matches[1]}})
  $pending=@($localVersions|Where-Object{$_ -notin $versions})
  return [ordered]@{projectRef=$static.linked;lineage=[string]$lineageRows[0].lineage;installedCount=$versions.Count;hostedHead=$(if($versions.Count){$versions[-1]}else{$null});pendingVersions=$pending;migrationSha256=$static.sha;databasePasswordAvailable=$true}
}
function Assert-PostApply {
  Assert-StaticPrerequisites|Out-Null
  $history=@(Read-LinkedCsv 'select version from supabase_migrations.schema_migrations order by version' @('version') 'post-apply migration history')
  $versions=@($history|ForEach-Object{[string]$_.version})
  if($versions.Count -ne 422 -or $versions[-1] -cne $targetVersion -or @($versions|Where-Object{$_ -eq $targetVersion}).Count -ne 1){throw 'Post-apply migration history verification failed.'}
  $postSql=@'
select
  (select lineage from forge_meta.database_lineage where singleton=true) as lineage,
  (select count(*) from pg_class where oid in (
    'tongs.hammer_scoped_live_funding_authorities'::regclass,
    'tongs.hammer_scoped_live_checkout_claims'::regclass
  ) and relrowsecurity and relforcerowsecurity) as forced_rls_tables,
  ((select count(*) from tongs.hammer_scoped_live_funding_authorities)
    +(select count(*) from tongs.hammer_scoped_live_checkout_claims)) as installed_rows,
  not exists(select 1 from (values
    ('tongs.hammer_scoped_live_funding_authorities'::regclass),
    ('tongs.hammer_scoped_live_checkout_claims'::regclass)
  ) target(oid), (values ('anon'),('authenticated'),('service_role')) role(name)
  where has_table_privilege(role.name,target.oid,'INSERT')
    or has_table_privilege(role.name,target.oid,'UPDATE')
    or has_table_privilege(role.name,target.oid,'DELETE')) as direct_writes_denied,
  not exists(select 1 from (values
    ('tongs.install_hammer_scoped_live_funding_authority(uuid,uuid,uuid,timestamptz,timestamptz,text)'::regprocedure),
    ('tongs.claim_hammer_scoped_live_checkout(uuid,uuid,uuid,uuid,text,text)'::regprocedure),
    ('tongs.record_hammer_scoped_live_checkout_session(uuid,uuid,text)'::regprocedure)
  ) target(oid), (values ('anon'),('authenticated')) role(name)
  where has_function_privilege(role.name,target.oid,'EXECUTE')) as customer_execute_denied,
  (select bool_and(has_function_privilege('service_role',target.oid,'EXECUTE')) from (values
    ('tongs.install_hammer_scoped_live_funding_authority(uuid,uuid,uuid,timestamptz,timestamptz,text)'::regprocedure),
    ('tongs.claim_hammer_scoped_live_checkout(uuid,uuid,uuid,uuid,text,text)'::regprocedure),
    ('tongs.record_hammer_scoped_live_checkout_session(uuid,uuid,text)'::regprocedure)
  ) target(oid)) as service_execute_granted,
  tongs._current_financial_environment() as financial_environment,
  ((select count(*) from tongs.hammer_first_transcription_capacity_authorities)
    +(select count(*) from tongs.hammer_first_transcription_activation_authorities)
    +(select count(*) from tongs.hammer_first_transcription_quote_bindings)
    +(select count(*) from tongs.hammer_first_transcription_activation_consumptions)
    +(select count(*) from tongs.hammer_transcription_provider_authorities)
    +(select count(*) from tongs.hammer_transcription_operations)
    +(select count(*) from tongs.hammer_transcription_provider_attempts)
    +(select count(*) from tongs.hammer_canonical_transcripts_v2)) as hammer_rows,
  (select mode from tongs.openai_text_rollout_revisions where route_code='hammer.transcript_prep' order by revision desc limit 1) as route_mode;
'@
  $contract=@(Read-LinkedCsv $postSql @('lineage','forced_rls_tables','installed_rows','direct_writes_denied','customer_execute_denied','service_execute_granted','financial_environment','hammer_rows','route_mode') 'post-apply Hammer scoped-Live-funding contract')
  if($contract.Count -ne 1 -or [string]$contract[0].lineage -cne 'historical-v1' -or [int]$contract[0].forced_rls_tables -ne 2 -or [int]$contract[0].installed_rows -ne 0 -or [string]$contract[0].direct_writes_denied -notmatch '^(t|true)$' -or [string]$contract[0].customer_execute_denied -notmatch '^(t|true)$' -or [string]$contract[0].service_execute_granted -notmatch '^(t|true)$' -or [string]$contract[0].financial_environment -cne 'test' -or [int]$contract[0].hammer_rows -ne 0 -or [string]$contract[0].route_mode -notin @('inactive','halt_new')){throw 'Post-apply Hammer scoped-Live-funding contract verification failed.'}
  [pscustomobject]@{ok=$true;schema='forge.hammer-scoped-live-funding-422-hosted-postverify.v1';projectRef=$projectRef;installedCount=422;hostedHead=$targetVersion;lineage='historical-v1';customerDataReturned=$false;credentialsReturned=$false}|ConvertTo-Json -Compress
}
if($Action -eq 'PostVerify'){
  Assert-StaticPrerequisites|Out-Null
  Invoke-WithForgeManagedDatabaseCredential -Operation { Assert-PostApply }
  exit 0
}
if(-not $RecoveryEvidencePath -or -not(Test-Path -LiteralPath $RecoveryEvidencePath -PathType Leaf)){throw 'A recovery-readiness evidence file is required.'}
if(-not $Operator){throw 'Operator identity is required.'}
if($Action -eq 'Apply' -and $Authorization -cne 'APPLY-HAMMER-SCOPED-LIVE-FUNDING-422'){throw 'Exact operator authorization is required.'}
Assert-StaticPrerequisites|Out-Null
$localPolicyArgs=@((Join-Path $PSScriptRoot 'verify-hammer-scoped-live-funding-422-hosted-deployment-policy.mjs'),'--local-only','--action',$Action,'--recovery',([IO.Path]::GetFullPath($RecoveryEvidencePath)),'--operator',$Operator)
if($Authorization){$localPolicyArgs+=@('--authorization',$Authorization)}
& node @localPolicyArgs | Out-Null
if($LASTEXITCODE -ne 0){throw 'Local hosted deployment policy rejected the operation.'}
try{
  Invoke-WithForgeManagedDatabaseCredential -Operation {
    $state=Get-HostedState
    $script:statePath=Join-Path ([IO.Path]::GetTempPath()) ('forge-hammer-scoped-live-funding-422-state-'+[guid]::NewGuid().ToString('N')+'.json')
    [IO.File]::WriteAllText($script:statePath,($state|ConvertTo-Json -Depth 5 -Compress),[Text.UTF8Encoding]::new($false))
    $policyArgs=@((Join-Path $PSScriptRoot 'verify-hammer-scoped-live-funding-422-hosted-deployment-policy.mjs'),'--action',$Action,'--state',$script:statePath,'--recovery',([IO.Path]::GetFullPath($RecoveryEvidencePath)),'--operator',$Operator)
    if($Authorization){$policyArgs+=@('--authorization',$Authorization)}
    $audit=@(& node @policyArgs)
    if($LASTEXITCODE -ne 0){throw 'Hosted deployment policy rejected the operation.'}
    if($Action -eq 'Preflight'){
      Invoke-Supabase @('migration','list','--linked','--workdir',$repo,'--agent=no')|Out-Null
      Invoke-Supabase @('db','push','--linked','--dry-run','--workdir',$repo,'--agent=no')|Out-Null
      return $audit
    }
    Invoke-Supabase @('db','push','--linked','--workdir',$repo,'--agent=no')|Out-Null
    Assert-PostApply
  }
} finally {
  if($statePath -and (Test-Path -LiteralPath $statePath)){Remove-Item -LiteralPath $statePath -Force}
}
