[CmdletBinding()]
param([Parameter(Mandatory)][string]$RepositoryRoot,[Parameter(Mandatory)][string]$Workdir,
 [Parameter(Mandatory)][string]$Container,[Parameter(Mandatory)][ValidateSet('permissive','restrictive')][string]$Lane,
 [Parameter(Mandatory)][string]$EvidenceDirectory)
$ErrorActionPreference='Stop'
$repo=[IO.Path]::GetFullPath($RepositoryRoot)
$helper=Join-Path $repo 'scripts/lib/forge-storage-full-tail.mjs'
$contract=Get-Content (Join-Path $repo 'docs/database/certification/storage-full-tail-446.json') -Raw|ConvertFrom-Json
$project=(Get-Content (Join-Path $Workdir 'supabase/config.toml') -Raw|Select-String 'project_id = "([^\"]+)"').Matches[0].Groups[1].Value
if($Container -cne "supabase_db_$project" -or $project -notmatch '^forge-baseline-v1-[a-f0-9]{12}$'){throw 'Unexpected disposable baseline container'}
function Sql([string]$Text){$out=($Text|docker exec -i $Container psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres 2>&1|Out-String);if($LASTEXITCODE -ne 0){throw "Full-tail local SQL failed: $out"};$out.Trim()}
function Stage([string]$Through){& node $helper --action stage --root $repo --workdir $Workdir --lineage baseline --through $Through;if($LASTEXITCODE -ne 0){throw 'Exact stage construction failed'}}
function Apply([string]$After,[string]$Through){
 $expected=@($contract.migrations|Where-Object{$_.version -gt $After -and $_.version -le $Through}|ForEach-Object version)
 $dry=(& supabase db push --local --dry-run --workdir $Workdir --agent=no 2>&1|Out-String);if($LASTEXITCODE -ne 0){throw "Local discovery failed: $dry"}
 $pending=@([regex]::Matches($dry,'(?m)2026\d{10}')|ForEach-Object Value|Select-Object -Unique)
 if(($pending -join ',') -cne ($expected -join ',')){throw "Exact pending set differs: $($pending -join ',')"}
 $dry|Set-Content (Join-Path $EvidenceDirectory "$Lane-pending-$Through.log")
 & supabase migration up --local --workdir $Workdir --yes --agent=no
 if($LASTEXITCODE -ne 0){throw "Full-tail CLI migration failed at $Through"}
 $actual=Sql 'select string_agg(version,'','' order by version) from supabase_migrations.schema_migrations;'
 $all=@('20261021020814')+@($contract.migrations|Where-Object{$_.version -ge '20261022000000' -and $_.version -le $Through}|ForEach-Object version)
 if($actual -cne ($all -join ',')){throw 'Installed complete B1 prefix differs'}
 if((Sql 'select lineage from forge_meta.database_lineage where singleton') -cne 'baseline-v1'){throw 'Wrong lineage marker'}
}
if((Sql 'select max(version) from supabase_migrations.schema_migrations') -cne '20261104143249'){throw 'Verified Luna catalog predecessor required'}
# Old rows are hashed by JSON key/value pairs excluding only columns added by
# migration 440. New operational rows are forbidden by this successor contract.
$financialSql=@'
select jsonb_build_object(
 'pricing',(select encode(extensions.digest(convert_to(coalesce(jsonb_agg(to_jsonb(x) order by id)::text,'null'),'UTF8'),'sha256'),'hex') from tongs.private_pricing_revisions x),
 'rollout',(select encode(extensions.digest(convert_to(coalesce(jsonb_agg(to_jsonb(x) order by route_code,revision)::text,'null'),'UTF8'),'sha256'),'hex') from tongs.openai_text_rollout_revisions x),
 'policies',(select count(*) from tongs.restricted_beta_policy_revisions),
 'holds',(select count(*) from tongs.restricted_beta_exposure_holds),
 'subscriptions',(select count(*) from tongs.billing_subscriptions),
 'journal',(select encode(extensions.digest(convert_to(coalesce(jsonb_agg(to_jsonb(x))::text,'null'),'UTF8'),'sha256'),'hex') from tongs.accounting_journal_events x));
'@
$before=Sql $financialSql
Stage '20261105025313';Apply '20261104143249' '20261105025313'
$saved=@{};foreach($key in @('SUPABASE_DB_CONTAINER','FORGE_STORAGE_HISTORICAL_ACCOUNTING_CERT','FORGE_STORAGE_HTTP_CERT','FORGE_STORAGE_PRIVATE_INVENTORY')){$saved[$key]=[Environment]::GetEnvironmentVariable($key,'Process')}
try{
 $env:SUPABASE_DB_CONTAINER=$Container;$env:FORGE_STORAGE_HISTORICAL_ACCOUNTING_CERT='1';$env:FORGE_STORAGE_HTTP_CERT='1';$env:FORGE_STORAGE_PRIVATE_INVENTORY=$null
 & node (Join-Path $repo 'scripts/certify-storage-capacity-isolated.mjs') *> (Join-Path $EvidenceDirectory "$Lane-storage-http.log")
 if($LASTEXITCODE -ne 0){throw "Full predecessor Storage HTTP/accounting/concurrency checks failed; see $Lane-storage-http.log"}
 $env:FORGE_STORAGE_HTTP_CERT=$null;$env:FORGE_STORAGE_PRIVATE_INVENTORY=Join-Path $repo '.git/forge-storage-investigation-20261113'
 & node (Join-Path $repo 'scripts/certify-storage-capacity-isolated.mjs') *> (Join-Path $EvidenceDirectory "$Lane-all475.log")
 if($LASTEXITCODE -ne 0){throw "Exact historical inventory checks failed; see $Lane-all475.log"}
}finally{foreach($key in $saved.Keys){[Environment]::SetEnvironmentVariable($key,$saved[$key],'Process')}}
Stage $contract.target;Apply '20261105025313' $contract.target
if((Sql $financialSql) -cne $before){throw 'Preexisting financial state changed through full tail'}
& (Join-Path $repo 'scripts/verify-supabase-lineage.ps1') -Lineage baseline -Workdir $Workdir -DatabaseTarget local -Mode preflight -RepositoryRoot $repo|Out-Null
foreach($file in @('scalable_forge_financial_admission.sql','public_slice_a_security_behavior.sql')){
 $path=Join-Path $repo "supabase/tests/$file";docker cp $path "${Container}:/tmp/full-tail-test.sql"|Out-Null
 docker exec $Container psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres -f /tmp/full-tail-test.sql
 if($LASTEXITCODE -ne 0){throw "Full-tail RLS/financial contract failed: $file"}
}
& (Join-Path $repo 'scripts/test-canonical-baseline-v1-data-api.ps1') -Workdir $Workdir
if($LASTEXITCODE -ne 0){throw 'Full-tail Data API certification failed'}
$acl=Sql @'
select bool_and(c.relrowsecurity and c.relowner='postgres'::regrole
 and not has_table_privilege('anon',c.oid,'select')
 and not has_table_privilege('authenticated',c.oid,'insert')
 and not has_table_privilege('service_role',c.oid,'update'))
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='tongs' and (c.relname like 'storage_historical_%' or c.relname='workpiece_manifest_publications');
'@
if($acl -cne 't'){throw 'New private audit ACL/RLS contract failed'}
Push-Location $Workdir
try{
 $catalog=Join-Path $EvidenceDirectory "$Lane-full-catalog.json"
 & (Join-Path $repo 'scripts/capture-canonical-baseline-v1-catalog.ps1') -Target local -OutputPath $catalog -ExtensionCompatibilityPath (Join-Path $repo 'docs/database/baseline/v1-gate3/wrappers-extension-compatibility.json') -RepositoryRoot $repo|Out-Null
 & node (Join-Path $repo 'scripts/normalize-canonical-catalog-for-production.mjs') --catalog $catalog --compatibility (Join-Path $repo 'docs/database/baseline/v1-gate3/wrappers-extension-compatibility.json') --output $catalog|Out-Null
 if($LASTEXITCODE -ne 0){throw 'Full-tail catalog normalization failed'}
}finally{Pop-Location}
[ordered]@{schema='forge.storage-full-tail-baseline.v1';result='PASS';target=$contract.target;historyCount=33;lineage='baseline-v1';lane=$Lane;syntheticOperationalPrerequisite=$true;authenticHistoricalFinancialState=$false;financialFingerprintUnchanged=$true;storageHttpAccountingConcurrency='PASS';all475='PASS';rlsDataApi='PASS';catalogPath=$catalog}|ConvertTo-Json|Set-Content (Join-Path $EvidenceDirectory "$Lane-result.json")
