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
$targetVersion='20261029004958'
$targetSha256='318c81bf74cef3c3124641b2b9f62c240a55dd4b3d375d5ac61bf1a588659803'
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
  $migrationPath=Join-Path $repo 'supabase/migrations/20261029004958_hammer_first_transcription_activation.sql'
  if(-not(Test-Path -LiteralPath $migrationPath -PathType Leaf)){throw 'Migration 421 is missing.'}
  $sha=(Get-FileHash -LiteralPath $migrationPath -Algorithm SHA256).Hash.ToLowerInvariant()
  if($sha -cne $targetSha256){throw 'Migration 421 SHA-256 mismatch.'}
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
  if($versions.Count -ne 421 -or $versions[-1] -cne $targetVersion -or @($versions|Where-Object{$_ -eq $targetVersion}).Count -ne 1){throw 'Post-apply migration history verification failed.'}
  $postSql=@'
select
  (select lineage from forge_meta.database_lineage where singleton=true) as lineage,
  (select count(*) from pg_class where oid in (
    'tongs.hammer_first_transcription_capacity_authorities'::regclass,
    'tongs.hammer_first_transcription_activation_authorities'::regclass,
    'tongs.hammer_first_transcription_quote_bindings'::regclass,
    'tongs.hammer_first_transcription_activation_consumptions'::regclass
  ) and relrowsecurity and relforcerowsecurity) as forced_rls_tables,
  ((select count(*) from tongs.hammer_first_transcription_capacity_authorities)
    +(select count(*) from tongs.hammer_first_transcription_activation_authorities)
    +(select count(*) from tongs.hammer_first_transcription_quote_bindings)
    +(select count(*) from tongs.hammer_first_transcription_activation_consumptions)) as installed_rows,
  not exists(select 1 from (values
    ('tongs.hammer_first_transcription_capacity_authorities'::regclass),
    ('tongs.hammer_first_transcription_activation_authorities'::regclass),
    ('tongs.hammer_first_transcription_quote_bindings'::regclass),
    ('tongs.hammer_first_transcription_activation_consumptions'::regclass)
  ) target(oid) where has_table_privilege('authenticated',target.oid,'INSERT')
    or has_table_privilege('authenticated',target.oid,'UPDATE')
    or has_table_privilege('authenticated',target.oid,'DELETE')) as authenticated_writes_denied,
  (select mode from tongs.openai_text_rollout_revisions where route_code='hammer.transcript_prep' order by revision desc limit 1) as route_mode;
'@
  $contract=@(Read-LinkedCsv $postSql @('lineage','forced_rls_tables','installed_rows','authenticated_writes_denied','route_mode') 'post-apply Hammer first-transcription contract')
  if($contract.Count -ne 1 -or [string]$contract[0].lineage -cne 'historical-v1' -or [int]$contract[0].forced_rls_tables -ne 4 -or [int]$contract[0].installed_rows -ne 0 -or [string]$contract[0].authenticated_writes_denied -notmatch '^(t|true)$' -or [string]$contract[0].route_mode -notin @('inactive','halt_new')){throw 'Post-apply Hammer first-transcription contract verification failed.'}
  [pscustomobject]@{ok=$true;schema='forge.hammer-first-transcription-421-hosted-postverify.v1';projectRef=$projectRef;installedCount=421;hostedHead=$targetVersion;lineage='historical-v1';customerDataReturned=$false;credentialsReturned=$false}|ConvertTo-Json -Compress
}
if($Action -eq 'PostVerify'){
  Assert-StaticPrerequisites|Out-Null
  Invoke-WithForgeManagedDatabaseCredential -Operation { Assert-PostApply }
  exit 0
}
if(-not $RecoveryEvidencePath -or -not(Test-Path -LiteralPath $RecoveryEvidencePath -PathType Leaf)){throw 'A recovery-readiness evidence file is required.'}
if(-not $Operator){throw 'Operator identity is required.'}
if($Action -eq 'Apply' -and $Authorization -cne 'APPLY-HAMMER-FIRST-TRANSCRIPTION-421'){throw 'Exact operator authorization is required.'}
Assert-StaticPrerequisites|Out-Null
$localPolicyArgs=@((Join-Path $PSScriptRoot 'verify-hammer-first-transcription-421-hosted-deployment-policy.mjs'),'--local-only','--action',$Action,'--recovery',([IO.Path]::GetFullPath($RecoveryEvidencePath)),'--operator',$Operator)
if($Authorization){$localPolicyArgs+=@('--authorization',$Authorization)}
& node @localPolicyArgs | Out-Null
if($LASTEXITCODE -ne 0){throw 'Local hosted deployment policy rejected the operation.'}
try{
  Invoke-WithForgeManagedDatabaseCredential -Operation {
    $state=Get-HostedState
    $script:statePath=Join-Path ([IO.Path]::GetTempPath()) ('forge-hammer-first-transcription-421-state-'+[guid]::NewGuid().ToString('N')+'.json')
    [IO.File]::WriteAllText($script:statePath,($state|ConvertTo-Json -Depth 5 -Compress),[Text.UTF8Encoding]::new($false))
    $policyArgs=@((Join-Path $PSScriptRoot 'verify-hammer-first-transcription-421-hosted-deployment-policy.mjs'),'--action',$Action,'--state',$script:statePath,'--recovery',([IO.Path]::GetFullPath($RecoveryEvidencePath)),'--operator',$Operator)
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
