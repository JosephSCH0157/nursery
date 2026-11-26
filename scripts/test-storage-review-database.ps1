[CmdletBinding()]
param([Parameter(Mandatory)][ValidateSet('baseline')][string]$Lineage,
 [ValidateSet('permissive','restrictive')][string]$DefaultPrivilegeMode='permissive',
 [Parameter(Mandatory)][string]$EvidenceDirectory,
 [ValidatePattern('^supabase_db_forge-[a-zA-Z0-9_-]+$')][string]$SourceContainer,
 [string]$RepositoryRoot=(Split-Path -Parent $PSScriptRoot))
$ErrorActionPreference='Stop'
$repo=[IO.Path]::GetFullPath($RepositoryRoot)
$evidence=[IO.Path]::GetFullPath($EvidenceDirectory)
if(-not(Test-Path -LiteralPath $evidence -PathType Container)){throw 'Existing evidence directory required'}
$log=Join-Path $evidence "$DefaultPrivilegeMode-review-regression.log"
if(Test-Path -LiteralPath $log){throw 'Use a new evidence directory; prior results are retained'}
& docker info *> $null
if($LASTEXITCODE -ne 0){throw 'Docker Desktop must be started manually'}
if((& supabase --version 2>$null|Select-Object -First 1).Trim() -cne '2.84.2'){throw 'Supabase CLI 2.84.2 required'}
$owned=$false;$workdir=$null
$keys=@('SUPABASE_DB_CONTAINER','FORGE_STORAGE_HISTORICAL_ACCOUNTING_CERT','FORGE_STORAGE_HTTP_CERT','FORGE_STORAGE_PRIVATE_INVENTORY','FORGE_STRIPE_SANDBOX_CERT','FORGE_STORAGE_REVIEW_PRIVILEGES','FORGE_STORAGE_RELEASE_CERT','FORGE_STORAGE_QUARANTINE_CERT')
$saved=@{};foreach($key in $keys){$saved[$key]=[Environment]::GetEnvironmentVariable($key,'Process')}
try{
 if(-not $SourceContainer){
  # Synthetic regression fixture only. No H/B1 catalog certification, financial
  # initialization programme, private inventory or provider validation runs here.
  $project='forge-storage-review-'+[guid]::NewGuid().ToString('N').Substring(0,12)
  $workdir=Join-Path ([IO.Path]::GetTempPath()) ('forge-baseline-v1-cert-storage-review-'+[guid]::NewGuid().ToString('N'))
  & (Join-Path $repo 'scripts/new-forge-database-workdir.ps1') -Lineage baseline -OutputPath $workdir -ProjectId $project -ApiPort (Get-Random -Minimum 58000 -Maximum 59000) -RepositoryRoot $repo
  & node (Join-Path $repo 'scripts/lib/forge-storage-full-tail.mjs') --action stage --root $repo --workdir $workdir --lineage baseline --through 20261104071802
  if($LASTEXITCODE -ne 0){throw 'Pinned synthetic fixture prefix failed'}
  $SourceContainer="supabase_db_$project"
  if(@(& docker ps -a --filter "name=^/$SourceContainer$" --format '{{.Names}}').Count){throw 'Task-owned fixture container already exists'}
  $owned=$true
  & supabase start --workdir $workdir --agent=no
  if($LASTEXITCODE -ne 0){throw 'Synthetic Storage fixture start failed'}
  $actual=(& docker exec $SourceContainer psql -X -qAt -U postgres -d postgres -c "select string_agg(version,',' order by version) from supabase_migrations.schema_migrations;"|Out-String).Trim()
  if($LASTEXITCODE -ne 0){throw 'Unable to validate fixture history'}
  $expected=@(Get-ChildItem (Join-Path $workdir 'supabase/migrations') -File -Filter '*.sql'|Sort-Object Name|ForEach-Object{$_.BaseName.Split('_')[0]}) -join ','
  if($actual -cne $expected){throw 'Synthetic fixture migration prefix differs'}
 }
 # The adapter validates the explicit source container's project and baseline
 # marker/head. It reads schema only; all writes use a random task-owned DB.
 foreach($key in $keys){[Environment]::SetEnvironmentVariable($key,$null,'Process')}
 $env:SUPABASE_DB_CONTAINER=$SourceContainer
 $env:FORGE_STORAGE_HISTORICAL_ACCOUNTING_CERT='1';$env:FORGE_STORAGE_HTTP_CERT='1'
 $env:FORGE_STORAGE_REVIEW_PRIVILEGES=$DefaultPrivilegeMode
 & node (Join-Path $repo 'scripts/certify-storage-capacity-isolated.mjs') --review-corrections *> $log
 if($LASTEXITCODE -ne 0){throw "Storage review regression failed; see $log"}
 Get-Content $log
}finally{
 foreach($key in $saved.Keys){[Environment]::SetEnvironmentVariable($key,$saved[$key],'Process')}
 if($owned){
  & supabase stop --workdir $workdir --no-backup --yes --agent=no
  if($LASTEXITCODE -ne 0){throw 'Task-owned fixture cleanup failed'}
 }
}
