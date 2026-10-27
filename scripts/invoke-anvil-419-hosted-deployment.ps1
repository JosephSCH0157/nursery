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
$targetVersion='20261027030139'
$targetSha256='876278448329ff5a8900923e309d3489bf7cce590c157526e054ff3433b3c8fa'
$expectedHead='20261025080943'
$statePath=$null

function Invoke-Supabase([string[]]$Arguments) {
  $output=@(& supabase @Arguments 2>&1)
  if($LASTEXITCODE -ne 0){throw 'Supabase command failed; output suppressed.'}
  return $output
}
function Read-LinkedCsv([string]$Sql) {
  $rows=@((Invoke-Supabase @('db','query','--linked','--agent=no','--output','csv','--workdir',$repo,$Sql))|ConvertFrom-Csv)
  return $rows
}
function Get-HostedState {
  $linkedPath=Join-Path $repo 'supabase/.temp/project-ref'
  if(-not(Test-Path -LiteralPath $linkedPath -PathType Leaf)){throw 'Linked project reference is unavailable.'}
  $linked=((Get-Content -LiteralPath $linkedPath -Raw).Trim())
  if($linked -cne $projectRef){throw 'Linked project does not match the pinned Forge project.'}
  if([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable('SUPABASE_DB_PASSWORD','Process'))){throw 'SUPABASE_DB_PASSWORD is required in the process environment.'}
  $cli=((& supabase --version 2>$null|Select-Object -First 1).Trim())
  if($cli -cne '2.84.2'){throw 'Supabase CLI 2.84.2 is required.'}
  $migrationPath=Join-Path $repo 'supabase/migrations/20261027030139_anvil_recording_authority_repair.sql'
  if(-not(Test-Path -LiteralPath $migrationPath -PathType Leaf)){throw 'Migration 419 is missing.'}
  $sha=(Get-FileHash -LiteralPath $migrationPath -Algorithm SHA256).Hash.ToLowerInvariant()
  if($sha -cne $targetSha256){throw 'Migration 419 SHA-256 mismatch.'}
  & (Join-Path $PSScriptRoot 'verify-canonical-database-artifacts.ps1') -RepositoryRoot $repo|Out-Null
  & (Join-Path $PSScriptRoot 'verify-supabase-lineage.ps1') -Lineage historical -Workdir $repo -DatabaseTarget linked -Mode preflight -RepositoryRoot $repo|Out-Null
  $history=@(Read-LinkedCsv 'select version from supabase_migrations.schema_migrations order by version')
  $versions=@($history|ForEach-Object{[string]$_.version})
  $lineageRows=@(Read-LinkedCsv "select lineage from forge_meta.database_lineage where singleton=true")
  if($lineageRows.Count -ne 1){throw 'Hosted lineage singleton is unavailable.'}
  $localVersions=@(Get-ChildItem -LiteralPath (Join-Path $repo 'supabase/migrations') -Filter '*.sql' -File|Sort-Object Name|ForEach-Object{if($_.BaseName -match '^(\d{8,14})_'){$Matches[1]}})
  $pending=@($localVersions|Where-Object{$_ -notin $versions})
  return [ordered]@{
    projectRef=$linked;lineage=[string]$lineageRows[0].lineage;installedCount=$versions.Count
    hostedHead=$(if($versions.Count){$versions[-1]}else{$null});pendingVersions=$pending
    migrationSha256=$sha;databasePasswordAvailable=$true
  }
}
function Assert-PostApply {
  $history=@(Read-LinkedCsv 'select version from supabase_migrations.schema_migrations order by version')
  $versions=@($history|ForEach-Object{[string]$_.version})
  if($versions.Count -ne 419 -or $versions[-1] -cne $targetVersion -or @($versions|Where-Object{$_ -eq $targetVersion}).Count -ne 1){throw 'Post-apply migration history verification failed.'}
  $contract=@(Read-LinkedCsv "select (select lineage from forge_meta.database_lineage where singleton=true) as lineage, exists(select 1 from information_schema.columns where table_schema='tongs' and table_name='anvil_recording_keep_requests' and column_name='recording_capture_authority_id' and is_nullable='NO') as keep_authority, exists(select 1 from information_schema.columns where table_schema='tongs' and table_name='anvil_recording_discard_requests' and column_name='recording_capture_authority_id' and is_nullable='NO') as discard_authority, exists(select 1 from information_schema.columns where table_schema='tongs' and table_name='anvil_recording_keep_requests' and column_name='capture_session_id' and is_nullable='YES') as keep_session_nullable, exists(select 1 from information_schema.columns where table_schema='tongs' and table_name='anvil_recording_discard_requests' and column_name='capture_session_id' and is_nullable='YES') as discard_session_nullable")
  if($contract.Count -ne 1 -or [string]$contract[0].lineage -cne 'historical-v1' -or @('keep_authority','discard_authority','keep_session_nullable','discard_session_nullable')|Where-Object{[string]$contract[0].$_ -notmatch '^(t|true)$'}){throw 'Post-apply recording-authority contract verification failed.'}
  [pscustomobject]@{ok=$true;schema='forge.anvil-419-hosted-postverify.v1';projectRef=$projectRef;installedCount=419;hostedHead=$targetVersion;lineage='historical-v1';customerDataReturned=$false;credentialsReturned=$false}|ConvertTo-Json -Compress
}

if($Action -eq 'PostVerify'){
  if([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable('SUPABASE_DB_PASSWORD','Process'))){throw 'SUPABASE_DB_PASSWORD is required in the process environment.'}
  Assert-PostApply
  exit 0
}
if(-not $RecoveryEvidencePath -or -not(Test-Path -LiteralPath $RecoveryEvidencePath -PathType Leaf)){throw 'A recovery-readiness evidence file is required.'}
if(-not $Operator){throw 'Operator identity is required.'}

try{
  $state=Get-HostedState
  $statePath=Join-Path ([IO.Path]::GetTempPath()) ('forge-anvil-419-state-'+[guid]::NewGuid().ToString('N')+'.json')
  [IO.File]::WriteAllText($statePath,($state|ConvertTo-Json -Depth 5 -Compress),[Text.UTF8Encoding]::new($false))
  $policyArgs=@((Join-Path $PSScriptRoot 'verify-anvil-419-hosted-deployment-policy.mjs'),'--action',$Action,'--state',$statePath,'--recovery',([IO.Path]::GetFullPath($RecoveryEvidencePath)),'--operator',$Operator)
  if($Authorization){$policyArgs+=@('--authorization',$Authorization)}
  $audit=@(& node @policyArgs)
  if($LASTEXITCODE -ne 0){throw 'Hosted deployment policy rejected the operation.'}
  if($Action -eq 'Preflight'){
    Invoke-Supabase @('migration','list','--linked','--workdir',$repo,'--agent=no')|Out-Null
    Invoke-Supabase @('db','push','--linked','--dry-run','--workdir',$repo,'--agent=no')|Out-Null
    $audit
    exit 0
  }
  if($Authorization -cne 'APPLY-ANVIL-419'){throw 'Exact operator authorization is required.'}
  Invoke-Supabase @('db','push','--linked','--workdir',$repo,'--agent=no')|Out-Null
  Assert-PostApply
} finally {
  if($statePath -and (Test-Path -LiteralPath $statePath)){Remove-Item -LiteralPath $statePath -Force}
}

