[CmdletBinding()]
param(
  [Parameter(Mandatory)][ValidateSet('historical')][string]$Lineage,
  [Parameter(Mandatory)][guid]$WorkspaceId,
  [string]$RepositoryRoot=(Split-Path -Parent $PSScriptRoot)
)
$ErrorActionPreference='Stop'
$repo=[IO.Path]::GetFullPath($RepositoryRoot)
. (Join-Path $PSScriptRoot 'lib/forge-managed-credential.ps1')
. (Join-Path $PSScriptRoot 'lib/forge-supabase-cli.ps1')
. (Join-Path $PSScriptRoot 'lib/forge-strict-csv-boolean.ps1')
$projectRef='wtvdjndyxegudufrompx'
if((Get-Content -LiteralPath (Join-Path $repo 'supabase/.temp/project-ref') -Raw).Trim() -cne $projectRef){throw 'Wrong linked project.'}
if((Invoke-ForgeSupabaseCli -Arguments @('--version')).StandardOutput.Trim() -cne '2.84.2'){throw 'Supabase CLI 2.84.2 required.'}
Invoke-WithForgeManagedDatabaseCredential -Operation {
  & (Join-Path $PSScriptRoot 'verify-supabase-lineage.ps1') -Lineage historical -Workdir $repo -DatabaseTarget linked -Mode preflight -RepositoryRoot $repo | Out-Null
  Write-Verbose 'Historical linked lineage validated.'
  # Fixed read-only query; no snapshot, export, impersonation, or custom SQL input.
  $sql=@'
begin transaction read only;
with owner as(select created_by as id from tongs.workspaces where id='__WORKSPACE__'::uuid)
select jsonb_build_object(
 'project_ref','wtvdjndyxegudufrompx',
 'read_only',true,
 'observed_at',clock_timestamp(),
 'lineage',(select to_jsonb(l) from forge_meta.database_lineage l where singleton),
 'history_count',(select count(*) from supabase_migrations.schema_migrations),
 'history_versions',(select jsonb_agg(version order by version) from supabase_migrations.schema_migrations),
 'history_sha256',(select encode(extensions.digest(coalesce(string_agg(to_jsonb(h)::text,E'\n' order by version),''),'sha256'),'hex') from supabase_migrations.schema_migrations h),
 'storage_tail',(select jsonb_agg(jsonb_build_object('version',version,'name',name) order by version) from supabase_migrations.schema_migrations where version>'20261105025313'),
 'financial_mode',tongs._current_financial_environment(),
 'workspace',(select jsonb_build_object('id',w.id,'created_by',w.created_by,'owner_membership',exists(select 1 from tongs.workspace_members m where m.workspace_id=w.id and m.user_id=w.created_by and m.role='owner')) from tongs.workspaces w where w.id='__WORKSPACE__'::uuid),
 'usage',(select tongs._storage_capacity_usage(id,null) from owner),
 'entitlement',(select tongs._storage_capacity_entitlement(id) from owner),
 'subscription_status_counts',(select jsonb_object_agg(status,n) from (select status,count(*) n from tongs.billing_subscriptions where user_id=(select id from owner) group by status) s),
 'paid_receipt_count',(select count(*) from tongs.subscription_cycle_receipts where user_id=(select id from owner)),
 'quarantine_object_count',(select count(*) from tongs.storage_quarantine_objects),
 'historical_exclusions_installed',to_regclass('tongs.storage_historical_objects') is not null,
 'manifest_publication_installed',to_regclass('tongs.workpiece_manifest_publications') is not null,
 'cron_catalog_available',to_regclass('cron.job') is not null,
 'extensions',(select jsonb_agg(extname order by extname) from pg_extension where extname in ('pg_cron','pg_net','wrappers'))
)::text as release_state;
rollback;
'@
  $sql=$sql.Replace('__WORKSPACE__',$WorkspaceId.ToString())
  $result=Invoke-ForgeSupabaseCli -Arguments @('db','query','--linked','--agent=no','--output','csv','--workdir',$repo,'--',$sql)
  $rows=@(ConvertFrom-ForgeSupabaseCsv -StandardOutput $result.StandardOutput -ExpectedColumns @('release_state') -Context 'Read-only Storage release state')
  if($rows.Count -ne 1){throw 'Expected one release state.'}
  $state=$rows[0].release_state | ConvertFrom-Json
  $contractSql=Get-Content -LiteralPath (Join-Path $repo 'supabase/tests/storage_successor_hosted_release_contract.sql') -Raw
  $contract=Invoke-ForgeSupabaseCli -Arguments @('db','query','--linked','--agent=no','--output','csv','--workdir',$repo,'--',("begin transaction read only;`n"+$contractSql+"`nrollback;"))
  $contractRows=@(ConvertFrom-ForgeSupabaseCsv -StandardOutput $contract.StandardOutput -ExpectedColumns @('storage_stage','financial_mode','storage_contract_ok') -Context 'Cumulative Storage contract')
  if($contractRows.Count -ne 1){throw 'Cumulative Storage contract unavailable.'}
  $state | Add-Member -NotePropertyName storage_stage -NotePropertyValue ([int]$contractRows[0].storage_stage)
  $state | Add-Member -NotePropertyName storage_contract_ok -NotePropertyValue (ConvertFrom-ForgeStrictCsvBoolean -Value $contractRows[0].storage_contract_ok -FieldName 'storage_contract_ok')
  if($state.financial_mode -cne $contractRows[0].financial_mode){throw 'Financial environment changed during inspection.'}
  if($state.cron_catalog_available){
    $cron=Invoke-ForgeSupabaseCli -Arguments @('db','query','--linked','--agent=no','--output','csv','--workdir',$repo,'--','begin transaction read only; select count(*) as active_jobs from cron.job where active; rollback;')
    $cronRows=@(ConvertFrom-ForgeSupabaseCsv -StandardOutput $cron.StandardOutput -ExpectedColumns @('active_jobs') -Context 'Active cron count')
    if($cronRows.Count -ne 1){throw 'Active cron count unavailable.'}
    $state | Add-Member -NotePropertyName active_cron_jobs -NotePropertyValue ([int]$cronRows[0].active_jobs)
  }
  $versions=@(Get-ChildItem -LiteralPath (Join-Path $repo 'supabase/migrations') -Filter '*.sql' -File | Sort-Object Name | ForEach-Object{$_.BaseName.Split('_')[0]})
  $installed=@($state.history_versions)
  if($installed.Count -gt $versions.Count -or ($installed -join ',') -cne (($versions | Select-Object -First $installed.Count) -join ',')){throw 'Hosted history is not an exact canonical prefix.'}
  if($state.lineage.lineage -cne 'historical-v1'){throw 'Unexpected installed lineage.'}
  if($state.storage_stage -ne ($installed.Count-440)){throw 'Storage schema stage and observed history disagree; re-observe before deciding.'}
  $state | Add-Member -NotePropertyName exact_canonical_prefix -NotePropertyValue $true
  $state | Add-Member -NotePropertyName hosted_head -NotePropertyValue $installed[-1]
  $state | Add-Member -NotePropertyName pending_versions -NotePropertyValue @($versions | Select-Object -Skip $installed.Count)
  $state.PSObject.Properties.Remove('history_versions')
  $state | ConvertTo-Json -Depth 10 -Compress
}
