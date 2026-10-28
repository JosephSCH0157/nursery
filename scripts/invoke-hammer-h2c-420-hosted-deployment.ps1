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
$targetVersion='20261028092438'
$targetSha256='df8988b8bb12e17cc7113d116e3cbc89397b7d9dec6de4c2ec92f979bbf1dcf1'
$statePath=$null
. (Join-Path $PSScriptRoot 'lib/forge-managed-credential.ps1')
. (Join-Path $PSScriptRoot 'lib/forge-supabase-cli.ps1')

function Invoke-Supabase([string[]]$Arguments) {
  return Invoke-ForgeSupabaseCli -Arguments $Arguments
}
function Read-LinkedCsv([string]$Sql,[string[]]$ExpectedColumns,[string]$Context) {
  $result=Invoke-Supabase @('db','query','--linked','--agent=no','--output','csv','--workdir',$repo,$Sql)
  return @(ConvertFrom-ForgeSupabaseCsv -StandardOutput $result.StandardOutput -ExpectedColumns $ExpectedColumns -Context $Context)
}
function Assert-StaticPrerequisites {
  $linkedPath=Join-Path $repo 'supabase/.temp/project-ref'
  if(-not(Test-Path -LiteralPath $linkedPath -PathType Leaf)){throw 'Linked project reference is unavailable.'}
  $linked=((Get-Content -LiteralPath $linkedPath -Raw).Trim())
  if($linked -cne $projectRef){throw 'Linked project does not match the pinned Forge project.'}
  $cli=(Invoke-Supabase @('--version')).StandardOutput.Trim()
  if($cli -cne '2.84.2'){throw 'Supabase CLI 2.84.2 is required.'}
  $migrationPath=Join-Path $repo 'supabase/migrations/20261028092438_hammer_h2c_inactive_assemblyai_transcription.sql'
  if(-not(Test-Path -LiteralPath $migrationPath -PathType Leaf)){throw 'Migration 420 is missing.'}
  $sha=(Get-FileHash -LiteralPath $migrationPath -Algorithm SHA256).Hash.ToLowerInvariant()
  if($sha -cne $targetSha256){throw 'Migration 420 SHA-256 mismatch.'}
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
  return [ordered]@{
    projectRef=$static.linked;lineage=[string]$lineageRows[0].lineage;installedCount=$versions.Count
    hostedHead=$(if($versions.Count){$versions[-1]}else{$null});pendingVersions=$pending
    migrationSha256=$static.sha;databasePasswordAvailable=$true
  }
}
function Assert-PostApply {
  Assert-StaticPrerequisites|Out-Null
  $history=@(Read-LinkedCsv 'select version from supabase_migrations.schema_migrations order by version' @('version') 'post-apply migration history')
  $versions=@($history|ForEach-Object{[string]$_.version})
  if($versions.Count -ne 420 -or $versions[-1] -cne $targetVersion -or @($versions|Where-Object{$_ -eq $targetVersion}).Count -ne 1){throw 'Post-apply migration history verification failed.'}
  $postSql=@'
select
  (select lineage from forge_meta.database_lineage where singleton=true) as lineage,
  (select count(*) from pg_class where oid in (
    'tongs.hammer_transcription_provider_authorities'::regclass,
    'tongs.hammer_transcription_operations'::regclass,
    'tongs.hammer_transcription_provider_attempts'::regclass,
    'tongs.hammer_transcription_stage_receipts'::regclass,
    'tongs.hammer_canonical_transcripts_v2'::regclass
  ) and relrowsecurity and relforcerowsecurity) as forced_rls_tables,
  ((select count(*) from tongs.hammer_transcription_provider_authorities)
    +(select count(*) from tongs.hammer_transcription_operations)
    +(select count(*) from tongs.hammer_transcription_provider_attempts)
    +(select count(*) from tongs.hammer_transcription_stage_receipts)
    +(select count(*) from tongs.hammer_canonical_transcripts_v2)) as installed_rows,
  exists(select 1 from pg_constraint where conrelid='tongs.hammer_transcription_operations'::regclass
    and contype='c' and pg_get_constraintdef(oid) like '%execution_authorized = false%') as execution_hard_stop,
  not exists(select 1 from (values
    ('tongs.hammer_transcription_provider_authorities'::regclass),
    ('tongs.hammer_transcription_operations'::regclass),
    ('tongs.hammer_transcription_provider_attempts'::regclass),
    ('tongs.hammer_transcription_stage_receipts'::regclass),
    ('tongs.hammer_canonical_transcripts_v2'::regclass)
  ) target(oid) where has_table_privilege('authenticated',target.oid,'INSERT')
    or has_table_privilege('authenticated',target.oid,'UPDATE')
    or has_table_privilege('authenticated',target.oid,'DELETE')) as authenticated_writes_denied,
  (select mode from tongs.openai_text_rollout_revisions where route_code='hammer.transcript_prep'
    order by revision desc limit 1) as route_mode;
'@
  $contract=@(Read-LinkedCsv $postSql @('lineage','forced_rls_tables','installed_rows','execution_hard_stop','authenticated_writes_denied','route_mode') 'post-apply Hammer H2-C contract')
  if($contract.Count -ne 1 -or [string]$contract[0].lineage -cne 'historical-v1' -or
     [int]$contract[0].forced_rls_tables -ne 5 -or [int]$contract[0].installed_rows -ne 0 -or
     [string]$contract[0].execution_hard_stop -notmatch '^(t|true)$' -or
     [string]$contract[0].authenticated_writes_denied -notmatch '^(t|true)$' -or
     [string]$contract[0].route_mode -notin @('inactive','halt_new')){throw 'Post-apply Hammer H2-C contract verification failed.'}
  [pscustomobject]@{ok=$true;schema='forge.hammer-h2c-420-hosted-postverify.v1';projectRef=$projectRef;installedCount=420;hostedHead=$targetVersion;lineage='historical-v1';customerDataReturned=$false;credentialsReturned=$false}|ConvertTo-Json -Compress
}
if($Action -eq 'PostVerify'){
  Assert-StaticPrerequisites|Out-Null
  Invoke-WithForgeManagedDatabaseCredential -Operation { Assert-PostApply }
  exit 0
}
if(-not $RecoveryEvidencePath -or -not(Test-Path -LiteralPath $RecoveryEvidencePath -PathType Leaf)){throw 'A recovery-readiness evidence file is required.'}
if(-not $Operator){throw 'Operator identity is required.'}
if($Action -eq 'Apply' -and $Authorization -cne 'APPLY-HAMMER-H2C-420'){throw 'Exact operator authorization is required.'}

# All repository, recovery, and operator authorization checks must pass before the
# managed credential is read from Windows Credential Manager.
Assert-StaticPrerequisites|Out-Null
$localPolicyArgs=@((Join-Path $PSScriptRoot 'verify-hammer-h2c-420-hosted-deployment-policy.mjs'),'--local-only','--action',$Action,'--recovery',([IO.Path]::GetFullPath($RecoveryEvidencePath)),'--operator',$Operator)
if($Authorization){$localPolicyArgs+=@('--authorization',$Authorization)}
& node @localPolicyArgs | Out-Null
if($LASTEXITCODE -ne 0){throw 'Local hosted deployment policy rejected the operation.'}

try{
  Invoke-WithForgeManagedDatabaseCredential -Operation {
    $state=Get-HostedState
    $script:statePath=Join-Path ([IO.Path]::GetTempPath()) ('forge-hammer-h2c-420-state-'+[guid]::NewGuid().ToString('N')+'.json')
    [IO.File]::WriteAllText($script:statePath,($state|ConvertTo-Json -Depth 5 -Compress),[Text.UTF8Encoding]::new($false))
    $policyArgs=@((Join-Path $PSScriptRoot 'verify-hammer-h2c-420-hosted-deployment-policy.mjs'),'--action',$Action,'--state',$script:statePath,'--recovery',([IO.Path]::GetFullPath($RecoveryEvidencePath)),'--operator',$Operator)
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
