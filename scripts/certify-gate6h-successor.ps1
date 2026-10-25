[CmdletBinding()]
param(
  [string]$RepositoryRoot
)

$ErrorActionPreference = 'Stop'
if ($IsWindows) {
  $supabaseExecutable = (Get-Command supabase.exe -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source
  $env:PATH = (Split-Path -Parent $supabaseExecutable) + [IO.Path]::PathSeparator + $env:PATH
}
Import-Module (Join-Path $PSScriptRoot 'lib/ForgeGate5D.psm1') -Force
$repo = [IO.Path]::GetFullPath($(if ($RepositoryRoot) { $RepositoryRoot } else { Split-Path -Parent $PSScriptRoot }))
$requiredCli='2.84.2'
$HistoryMode='SharedSynthetic'
$ExternalCapsuleDirectory=$null
$AuthorizeExternalAuthenticCapsule=$false
$fixture=Join-Path $repo 'database/historical-pre-slice-a-v1/pre-slice-a-schema.sql'
$excludedDbOnly='gotrue,realtime,storage-api,imgproxy,kong,mailpit,postgrest,postgres-meta,studio,edge-runtime,logflare,vector,supavisor'
$excludedApi='realtime,storage-api,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor'
$sensitiveNames=@('SUPABASE_ACCESS_TOKEN','FORGE_GATE5D_DATABASE_READ_TOKEN','SUPABASE_DB_PASSWORD','SUPABASE_DB_URL','SUPABASE_SERVICE_ROLE_KEY','DATABASE_URL','DIRECT_URL','STRIPE_SECRET_KEY','STRIPE_WEBHOOK_SECRET','OPENAI_API_KEY','RUNWAY_API_KEY')
$savedEnvironment=@{}
$sharedSyntheticRoot=$null
$sharedSyntheticCapsule=$null

function Get-FreePortBlock {
  foreach($candidate in (60000..64000|Sort-Object{Get-Random})) {
    if($candidate+8 -gt 65535){continue}; $probes=[Collections.Generic.List[Net.Sockets.TcpListener]]::new()
    try { foreach($port in $candidate..($candidate+8)){ $p=[Net.Sockets.TcpListener]::new([Net.IPAddress]::Any,$port);$p.Start();$probes.Add($p) }; return $candidate }
    catch { continue } finally { foreach($p in $probes){$p.Stop()} }
  }
  throw 'Unable to reserve a local port block.'
}

function Get-NurseryResources {
  [pscustomobject]@{
    containers=@(docker ps -a --filter 'label=com.supabase.cli.project=nursery' --format '{{.ID}}|{{.Names}}'|Sort-Object)
    volumes=@(docker volume ls --filter 'label=com.supabase.cli.project=nursery' --format '{{.Name}}'|Sort-Object)
  }
}

function Get-TaskResources([string]$ProjectId,[string]$InternalNetwork) {
  [pscustomobject]@{
    containers=@(docker ps -a --filter "label=com.supabase.cli.project=$ProjectId" --format '{{.ID}}|{{.Names}}')
    volumes=@(docker volume ls --filter "label=com.supabase.cli.project=$ProjectId" --format '{{.Name}}')
    networks=@(@(docker network ls --filter "label=com.supabase.cli.project=$ProjectId" --format '{{.Name}}')+@(docker network ls --filter "name=^$([regex]::Escape($InternalNetwork))$" --format '{{.Name}}')|Select-Object -Unique)
  }
}

function Invoke-Psql([string]$Container,[string]$Sql,[switch]$Redact) {
  $output=($Sql|& docker exec -i $Container psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres 2>$null|Out-String)
  if($LASTEXITCODE -ne 0){ if($Redact){throw 'Disposable SQL operation failed; content suppressed.'};throw "Disposable SQL operation failed.`n$output" }
  $output.Trim()
}

function Invoke-PsqlFile([string]$Container,[string]$Path) {
  # Preserve the reviewed SQL bytes exactly. Piping a PowerShell string to a
  # native process makes the database input depend on the caller's
  # $OutputEncoding; that can alter non-ASCII function bodies and therefore
  # their catalog fingerprints.
  $target='/tmp/forge-gate5d-' + [guid]::NewGuid().ToString('N') + '.sql'
  try {
    & docker cp $Path "${Container}:$target" 2>$null
    if($LASTEXITCODE -ne 0){throw 'Unable to copy a reviewed SQL file into the disposable database.'}
    $output=(& docker exec $Container psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres -f $target 2>$null|Out-String)
    if($LASTEXITCODE -ne 0){throw "Disposable SQL-file operation failed.`n$output"}
  }
  finally {
    & docker exec $Container rm -f $target 2>$null|Out-Null
  }
}

function Get-HistoryHashes([string]$Container,[string]$MaximumVersion) {
  $json=Invoke-Psql $Container @"
with h as (select version,statements,name,created_by,idempotency_key,rollback from supabase_migrations.schema_migrations where version <= '$MaximumVersion')
select jsonb_build_object(
 'rowCount',count(*),'minimumVersion',min(version),'maximumVersion',max(version),
 'allColumns',encode(extensions.digest(convert_to(string_agg(jsonb_build_array(version,statements,name,created_by,idempotency_key,rollback)::text,E'\n' order by version),'UTF8'),'sha256'),'hex'),
 'version',encode(extensions.digest(convert_to(string_agg(jsonb_build_array(version,version)::text,E'\n' order by version),'UTF8'),'sha256'),'hex'),
 'statements',encode(extensions.digest(convert_to(string_agg(jsonb_build_array(version,statements)::text,E'\n' order by version),'UTF8'),'sha256'),'hex'),
 'name',encode(extensions.digest(convert_to(string_agg(jsonb_build_array(version,name)::text,E'\n' order by version),'UTF8'),'sha256'),'hex'),
 'createdBy',encode(extensions.digest(convert_to(string_agg(jsonb_build_array(version,created_by)::text,E'\n' order by version),'UTF8'),'sha256'),'hex'),
 'idempotencyKey',encode(extensions.digest(convert_to(string_agg(jsonb_build_array(version,idempotency_key)::text,E'\n' order by version),'UTF8'),'sha256'),'hex'),
 'rollback',encode(extensions.digest(convert_to(string_agg(jsonb_build_array(version,rollback)::text,E'\n' order by version),'UTF8'),'sha256'),'hex')
) from h;
"@ -Redact
  $json|ConvertFrom-Json
}

function Remove-CapsuleResult($Capsule) {
  if($Capsule){
    if(Test-Path -LiteralPath $Capsule.capsuleDirectory){Remove-ForgeGate5DCapsule -Directory $Capsule.capsuleDirectory}
    if(Test-Path -LiteralPath $Capsule.contractPath){Remove-Item -LiteralPath $Capsule.contractPath -Force}
  }
}

function Invoke-Lane([ValidateSet('permissive','restrictive','failure-cleanup')][string]$Lane) {
  $runId=[guid]::NewGuid().ToString('N').Substring(0,12)
  $laneId=@{permissive='p';restrictive='r';'failure-cleanup'='f'}[$Lane]
  $projectId="forge-gate5d-$laneId-$runId"
  $container="supabase_db_$projectId"
  $internalNetwork="forge-gate5d-net-$runId"
  $defaultNetwork="supabase_network_$projectId"
  $temporaryRoot=Join-Path ([IO.Path]::GetTempPath()) "forge-gate5d-lane-$Lane-$runId"
  $workdir=Join-Path $temporaryRoot 'workdir'
  $started=$false;$createdNetwork=$false;$defaultAttached=$false;$result=$null
  $nurseryBefore=Get-NurseryResources
  try {
    $port=Get-FreePortBlock
    New-Item -ItemType Directory -Path (Join-Path $workdir 'supabase/migrations') -Force|Out-Null
    $config=@"
project_id = "$projectId"
[api]
enabled = true
port = $port
schemas = ["public", "graphql_public", "tongs"]
extra_search_path = ["public", "extensions"]
[db]
port = $($port+1)
shadow_port = $($port+2)
major_version = 17
[db.seed]
enabled = false
[studio]
enabled = false
[inbucket]
enabled = false
[analytics]
enabled = false
"@
    [IO.File]::WriteAllText((Join-Path $workdir 'supabase/config.toml'),$config,[Text.UTF8Encoding]::new($false))
    [IO.File]::WriteAllText((Join-Path $workdir 'gate5d-disposable.json'),([ordered]@{schema='forge.gate5d-disposable.v1';projectId=$projectId;repositoryRoot=$repo;runId=$runId}|ConvertTo-Json),[Text.UTF8Encoding]::new($false))
    & docker network create --internal --label forge.gate=5d --label "forge.run=$runId" $internalNetwork|Out-Null
    if($LASTEXITCODE -ne 0){throw 'Unable to create internal Gate 5D network.'};$createdNetwork=$true
    $start=(& supabase start --workdir $workdir --exclude $excludedDbOnly --ignore-health-check --yes --agent=no 2>&1|Out-String)
    if($LASTEXITCODE -ne 0){throw "Unable to start disposable Gate 5D database.`n$start"};$started=$true
    & docker network connect $internalNetwork $container;if($LASTEXITCODE -ne 0){throw 'Unable to attach internal Gate 5D network.'}
    & docker network disconnect $defaultNetwork $container;if($LASTEXITCODE -ne 0){throw 'Unable to isolate disposable database from default network.'}

    $ambient=if($Lane -eq 'restrictive'){'revoke all'}else{'grant all'}
    $direction=if($Lane -eq 'restrictive'){'from'}else{'to'}
    $null=Invoke-Psql $container @"
alter default privileges for role postgres $ambient on tables $direction anon,authenticated,service_role;
alter default privileges for role postgres $ambient on sequences $direction anon,authenticated,service_role;
alter default privileges for role postgres $ambient on functions $direction anon,authenticated,service_role;
alter default privileges for role postgres in schema public $ambient on tables $direction anon,authenticated,service_role;
alter default privileges for role postgres in schema public $ambient on sequences $direction anon,authenticated,service_role;
alter default privileges for role postgres in schema public $ambient on functions $direction anon,authenticated,service_role;
"@
    Invoke-PsqlFile $container $fixture
    foreach($test in @('supabase/tests/public_slice_a_catalog_parity.sql','supabase/tests/public_slice_a_security_behavior.sql','supabase/tests/pre_slice_a_fixture_behavior.sql')){Invoke-PsqlFile $container (Join-Path $repo $test)}
    $null=Invoke-Psql $container @'
begin;
create schema if not exists supabase_migrations authorization postgres;
create table if not exists supabase_migrations.schema_migrations (
  version text primary key,
  statements text[],
  name text,
  created_by text,
  idempotency_key text,
  rollback text[]
);
commit;
'@
    $readOnlyRole=(Invoke-Psql $container @'
select jsonb_build_object(
  'exists',exists(select 1 from pg_roles where rolname='supabase_read_only_user'),
  'member_pg_read_all_data',pg_has_role('supabase_read_only_user','pg_read_all_data','MEMBER'),
  'schema_usage',has_schema_privilege('supabase_read_only_user','supabase_migrations','USAGE'),
  'table_select',has_table_privilege('supabase_read_only_user','supabase_migrations.schema_migrations','SELECT'),
  'six_columns_select',(select bool_and(has_column_privilege('supabase_read_only_user','supabase_migrations.schema_migrations',column_name,'SELECT')) from unnest(array['version','statements','name','created_by','idempotency_key','rollback']) requested(column_name)),
  'extensions_usage',has_schema_privilege('supabase_read_only_user','extensions','USAGE'),
  'digest_execute',has_function_privilege('supabase_read_only_user','extensions.digest(bytea,text)','EXECUTE')
);
'@ -Redact)|ConvertFrom-Json
    if(-not $readOnlyRole.exists -or -not $readOnlyRole.member_pg_read_all_data -or -not $readOnlyRole.schema_usage -or
       -not $readOnlyRole.table_select -or -not $readOnlyRole.six_columns_select -or -not $readOnlyRole.extensions_usage -or -not $readOnlyRole.digest_execute){
      throw 'Local Supabase read-only role lacks an expected disposable-fixture privilege.'
    }
    $probeSql=Get-Content -LiteralPath (Join-Path $repo 'supabase/tests/catalog/gate5d_read_only_endpoint_probe.sql') -Raw
    $probeResult=(Invoke-Psql $container "begin transaction read only;`n$probeSql`nrollback;" -Redact)|ConvertFrom-Json
    if($probeResult.transaction_read_only -ne 'on' -or -not $probeResult.schema_usage -or -not $probeResult.table_select -or
       -not $probeResult.six_columns_select -or $probeResult.zero_row_projection_count -ne 0 -or -not $probeResult.digest_available){
      throw 'Dedicated read-only endpoint probe SQL failed against the six-column disposable fixture.'
    }

    if($Lane -eq 'failure-cleanup'){
      $probe=& (Join-Path $PSScriptRoot 'new-gate5d-synthetic-history-capsule.ps1') -DatabaseContainer $container -OutputRoot $temporaryRoot -Variant Valid -RepositoryRoot $repo|ConvertFrom-Json
      $bytes=[IO.File]::ReadAllBytes((Join-Path $probe.capsuleDirectory 'history.dpapi'));$bytes[0]=$bytes[0]-bxor 0xFF;[IO.File]::WriteAllBytes((Join-Path $probe.capsuleDirectory 'history.dpapi'),$bytes);[Array]::Clear($bytes,0,$bytes.Length)
      try { & (Join-Path $PSScriptRoot 'restore-gate5d-authentic-history.ps1') -CapsuleDirectory $probe.capsuleDirectory -ProjectId $projectId -Workdir $workdir -SyntheticTest -SyntheticContractPath $probe.contractPath -RepositoryRoot $repo|Out-Null;throw 'Corrupted failure-cleanup capsule unexpectedly restored.' }
      catch { if($_.Exception.Message -notmatch 'hash mismatch'){throw} }
      if([int](Invoke-Psql $container 'select count(*) from supabase_migrations.schema_migrations;') -ne 0){throw 'Failure-cleanup probe changed migration history.'}
      throw 'EXPECTED_GATE5D_FAILURE_CLEANUP_PROBE'
    }

    & docker network connect $defaultNetwork $container;if($LASTEXITCODE -ne 0){throw 'Unable to open local catalog window.'};$defaultAttached=$true
    $preFingerprint=Join-Path $temporaryRoot 'pre-upgrade.json'
    Push-Location $workdir
    try{$preCatalog=& (Join-Path $repo 'scripts/capture-canonical-baseline-v1-catalog.ps1') -Target local -OutputPath $preFingerprint -ExpectedPath (Join-Path $repo 'docs/database/baseline/v1-gate3/canonical-application-catalog-fingerprint.json') -ExtensionCompatibilityPath (Join-Path $repo 'docs/database/baseline/v1-gate3/wrappers-extension-compatibility.json') -RepositoryRoot $repo|ConvertFrom-Json}finally{Pop-Location}
    & docker network disconnect $defaultNetwork $container;if($LASTEXITCODE -ne 0){throw 'Unable to restore internal-only database isolation.'};$defaultAttached=$false

    $negative=[ordered]@{}
    foreach($variant in @('Duplicate','Incomplete')){
      $capsule=& (Join-Path $PSScriptRoot 'new-gate5d-synthetic-history-capsule.ps1') -DatabaseContainer $container -OutputRoot $temporaryRoot -Variant $variant -RepositoryRoot $repo|ConvertFrom-Json
      try { & (Join-Path $PSScriptRoot 'restore-gate5d-authentic-history.ps1') -CapsuleDirectory $capsule.capsuleDirectory -ProjectId $projectId -Workdir $workdir -SyntheticTest -SyntheticContractPath $capsule.contractPath -RepositoryRoot $repo|Out-Null;throw "$variant history unexpectedly restored." }
      catch { if($_.Exception.Message -notmatch 'duplicate|row count|frozen'){throw} }
      finally { Remove-CapsuleResult $capsule }
      if([int](Invoke-Psql $container 'select count(*) from supabase_migrations.schema_migrations;') -ne 0){throw "$variant rejection left history rows."}
      $negative[$variant.ToLowerInvariant()]=$true
    }

    $corrupt=& (Join-Path $PSScriptRoot 'new-gate5d-synthetic-history-capsule.ps1') -DatabaseContainer $container -OutputRoot $temporaryRoot -Variant Valid -RepositoryRoot $repo|ConvertFrom-Json
    try {
      $bytes=[IO.File]::ReadAllBytes((Join-Path $corrupt.capsuleDirectory 'history.dpapi'));$bytes[0]=$bytes[0]-bxor 0xFF;[IO.File]::WriteAllBytes((Join-Path $corrupt.capsuleDirectory 'history.dpapi'),$bytes);[Array]::Clear($bytes,0,$bytes.Length)
      try { & (Join-Path $PSScriptRoot 'restore-gate5d-authentic-history.ps1') -CapsuleDirectory $corrupt.capsuleDirectory -ProjectId $projectId -Workdir $workdir -SyntheticTest -SyntheticContractPath $corrupt.contractPath -RepositoryRoot $repo|Out-Null;throw 'Corrupted ciphertext unexpectedly restored.' } catch { if($_.Exception.Message -notmatch 'hash mismatch'){throw} }
    } finally { Remove-CapsuleResult $corrupt }
    $negative.corruptCiphertext=([int](Invoke-Psql $container 'select count(*) from supabase_migrations.schema_migrations;') -eq 0)

    $mismatch=& (Join-Path $PSScriptRoot 'new-gate5d-synthetic-history-capsule.ps1') -DatabaseContainer $container -OutputRoot $temporaryRoot -Variant Valid -MismatchedStatementsDigest -RepositoryRoot $repo|ConvertFrom-Json
    try { try { & (Join-Path $PSScriptRoot 'restore-gate5d-authentic-history.ps1') -CapsuleDirectory $mismatch.capsuleDirectory -ProjectId $projectId -Workdir $workdir -SyntheticTest -SyntheticContractPath $mismatch.contractPath -RepositoryRoot $repo|Out-Null;throw 'Mismatched digest unexpectedly committed.' } catch { if($_.Exception.Message -notmatch 'Disposable history operation failed'){throw} } } finally { Remove-CapsuleResult $mismatch }
    $negative.mismatchedDigestRollback=([int](Invoke-Psql $container 'select count(*) from supabase_migrations.schema_migrations;') -eq 0)

    $interrupted=& (Join-Path $PSScriptRoot 'new-gate5d-synthetic-history-capsule.ps1') -DatabaseContainer $container -OutputRoot $temporaryRoot -Variant Valid -RepositoryRoot $repo|ConvertFrom-Json
    try { try { & (Join-Path $PSScriptRoot 'restore-gate5d-authentic-history.ps1') -CapsuleDirectory $interrupted.capsuleDirectory -ProjectId $projectId -Workdir $workdir -SyntheticTest -SyntheticContractPath $interrupted.contractPath -SyntheticFailureInjection AfterInsert -RepositoryRoot $repo|Out-Null;throw 'Interrupted restore unexpectedly committed.' } catch { if($_.Exception.Message -notmatch 'Disposable history operation failed'){throw} } } finally { Remove-CapsuleResult $interrupted }
    $negative.interruptedRollback=([int](Invoke-Psql $container 'select count(*) from supabase_migrations.schema_migrations;') -eq 0)
    if(@($negative.Values|Where-Object{-not $_}).Count){throw 'A negative restore probe left migration history behind.'}

    $removeValid=$false
    if($HistoryMode -eq 'GeneratedPerLane'){
      $valid=& (Join-Path $PSScriptRoot 'new-gate5d-synthetic-history-capsule.ps1') -DatabaseContainer $container -OutputRoot $temporaryRoot -Variant Valid -RepositoryRoot $repo|ConvertFrom-Json
      $removeValid=$true
      $historyContract=Get-Content -LiteralPath $valid.contractPath -Raw|ConvertFrom-Json
      try { $restore=& (Join-Path $PSScriptRoot 'restore-gate5d-authentic-history.ps1') -CapsuleDirectory $valid.capsuleDirectory -ProjectId $projectId -Workdir $workdir -SyntheticTest -SyntheticContractPath $valid.contractPath -RepositoryRoot $repo|ConvertFrom-Json } finally { if($removeValid){Remove-CapsuleResult $valid} }
    } elseif($HistoryMode -eq 'SharedSynthetic') {
      if(-not $script:sharedSyntheticCapsule){
        $script:sharedSyntheticCapsule=& (Join-Path $PSScriptRoot 'new-gate5d-synthetic-history-capsule.ps1') -DatabaseContainer $container -OutputRoot $sharedSyntheticRoot -Variant Valid -RepositoryRoot $repo|ConvertFrom-Json
      }
      $historyContract=Get-Content -LiteralPath $script:sharedSyntheticCapsule.contractPath -Raw|ConvertFrom-Json
      $restore=& (Join-Path $PSScriptRoot 'restore-gate5d-authentic-history.ps1') -CapsuleDirectory $script:sharedSyntheticCapsule.capsuleDirectory -ProjectId $projectId -Workdir $workdir -SyntheticTest -SyntheticContractPath $script:sharedSyntheticCapsule.contractPath -RepositoryRoot $repo|ConvertFrom-Json
    } else {
      $historyContract=Get-ForgeGate5DContract -RepositoryRoot $repo
      $restore=& (Join-Path $PSScriptRoot 'restore-gate5d-authentic-history.ps1') -CapsuleDirectory $ExternalCapsuleDirectory -ProjectId $projectId -Workdir $workdir -RepositoryRoot $repo|ConvertFrom-Json
    }
    if(-not $restore.ok -or $restore.rowCount -ne 411){throw 'New Gate 5D restorer did not restore 411 rows.'}
    $before=Get-HistoryHashes $container ([string]$historyContract.history.maximumVersion)
    foreach($name in @('allColumns','version','statements','name','createdBy','idempotencyKey','rollback')){if([string]$before.$name -cne [string]$historyContract.history.hashes.$name){throw "Pre-tail history hash mismatch: $name"}}

    Copy-Item -Path (Join-Path $repo 'supabase/migrations/*.sql') -Destination (Join-Path $workdir 'supabase/migrations')
    $lineage=Get-Content -LiteralPath (Join-Path $repo 'docs/database/baseline/v1-gate2/lineage-contract.json') -Raw|ConvertFrom-Json
    $lineage.historical.rootWorkdir=$workdir;$lineage.historical.manifestPath=Join-Path $repo 'docs/database/baseline/v1-gate1/historical-migrations.sha256.json';$lineage.sharedTail.canonicalMigrationsDirectory=Join-Path $repo 'supabase/migrations'
    $lineagePath=Join-Path $temporaryRoot 'lineage-contract.json';[IO.File]::WriteAllText($lineagePath,($lineage|ConvertTo-Json -Depth 10),[Text.UTF8Encoding]::new($false))
    & docker network connect $defaultNetwork $container;if($LASTEXITCODE -ne 0){throw 'Unable to open local CLI window.'};$defaultAttached=$true
    $preflight=& (Join-Path $repo 'scripts/verify-supabase-lineage.ps1') -Lineage historical -Workdir $workdir -DatabaseTarget local -Mode preflight -ConfigurationPath $lineagePath -RepositoryRoot $repo|ConvertFrom-Json
    if(-not $preflight.ok -or $preflight.databaseState -ne 'historical-preflight'){throw 'Restored history was not recognized as historical preflight.'}
    $dryRun=(& supabase db push --local --dry-run --workdir $workdir --agent=no 2>&1|Out-String);if($LASTEXITCODE -ne 0){throw 'Normal migration discovery failed; output suppressed.'}
    $pending=@([regex]::Matches($dryRun,'(?m)2026\d{10}')|ForEach-Object Value|Select-Object -Unique);$expected=@('20261020171517','20261020171519','20261020171522','20261022000000','20261024164519','20261025070300','20261025080943')
    if(($pending-join ',') -ne ($expected-join ',')){throw "Unexpected pending migrations: $($pending-join ',')"}
    $upgrade=(& supabase migration up --local --workdir $workdir --yes --agent=no 2>&1|Out-String);if($LASTEXITCODE -ne 0){throw 'Normal seven-migration successor upgrade failed; output suppressed.'}
    $finalCount=[int](Invoke-Psql $container 'select count(*) from supabase_migrations.schema_migrations;');$marker=Invoke-Psql $container "select lineage from forge_meta.database_lineage where singleton;"
    if($finalCount -ne 418 -or $marker -ne 'historical-v1'){throw 'Final successor history count or lineage marker mismatch.'}
    $after=Get-HistoryHashes $container ([string]$historyContract.history.maximumVersion)
    foreach($name in @('allColumns','version','statements','name','createdBy','idempotencyKey','rollback')){if([string]$after.$name -cne [string]$before.$name){throw "Original history changed after tail: $name"}}

    foreach($test in @('supabase/tests/public_slice_a_catalog_parity.sql','supabase/tests/public_slice_a_security_behavior.sql','supabase/tests/gate6o_episode_storage_tier_contract.sql','supabase/tests/gate6p_storage_bucket_contract.sql')){Invoke-PsqlFile $container (Join-Path $repo $test)}
    $savedContainer=$env:SUPABASE_DB_CONTAINER
    try {
      $env:SUPABASE_DB_CONTAINER=$container
      $barstockOutput=(& node (Join-Path $repo 'scripts/verify-barstock-persistence-db.mjs') 2>&1|Out-String)
      if($LASTEXITCODE -ne 0){throw 'Bar Stock successor lifecycle certification failed.'}
    }
    finally { $env:SUPABASE_DB_CONTAINER=$savedContainer }
    $apiStop=(& supabase stop --workdir $workdir --yes --agent=no 2>&1|Out-String)
    if($LASTEXITCODE -ne 0){throw "Unable to preserve and stop the disposable DB-only stack before Data API testing.`n$apiStop"}
    $started=$false;$defaultAttached=$false
    $apiStart=(& supabase start --workdir $workdir --exclude $excludedApi --ignore-health-check --yes --agent=no 2>&1|Out-String);if($LASTEXITCODE -ne 0){throw "Unable to start disposable Data API services.`n$apiStart"}
    $started=$true
    $dataApi=& (Join-Path $repo 'scripts/test-canonical-baseline-v1-data-api.ps1') -Workdir $workdir|ConvertFrom-Json;if(-not $dataApi.ok){throw 'Disposable Data API certification failed.'}
    $postFingerprint=Join-Path $temporaryRoot 'post-upgrade.json'
    Push-Location $workdir
    try{$postCatalog=& (Join-Path $repo 'scripts/capture-canonical-baseline-v1-catalog.ps1') -Target local -OutputPath $postFingerprint -ExpectedPath (Join-Path $repo 'docs/database/baseline/v1-gate6o/successor-catalog-fingerprint.json') -ExtensionCompatibilityPath (Join-Path $repo 'docs/database/baseline/v1-gate3/wrappers-extension-compatibility.json') -RepositoryRoot $repo|ConvertFrom-Json}finally{Pop-Location}

    $result=[pscustomobject]@{
      ok=$true;mode=$Lane;projectId=$projectId;restoredRows=411;finalHistoryRows=$finalCount;lineage=$marker
      pendingVersions=$pending;historyHashes=$after;originalHistoryUnchanged=$true;negativeTests=$negative
      preUpgradeCatalogSha256=$preCatalog.contractSha256;postUpgradeCatalogSha256=$postCatalog.contractSha256
      catalogObjectCount=$postCatalog.objectCount;approvedEnvironmentalDifferences=@($postCatalog.approvedEnvironmentalDifferences)
      tests=@('public_slice_a_catalog_parity','public_slice_a_security_behavior','gate5d_read_only_endpoint_probe','gate6o_episode_storage_tier_contract','gate6p_storage_bucket_contract','barstock_project_archive_atomicity','local_data_api','gate6p_successor_catalog_and_provisioning_comparison')
      dataApi=$dataApi;localReadOnlyRoleExpectedAccess=$true;financiallyInactive=$true;paidProviderOperations=0;hostedRequests=0
    }
  }
  finally {
    if($started -or (docker ps -a --filter "label=com.supabase.cli.project=$projectId" -q)){& supabase stop --workdir $workdir --no-backup --yes --agent=no 2>$null|Out-Null}
    if(docker network ls --filter "name=^$([regex]::Escape($internalNetwork))$" -q){& docker network rm $internalNetwork 2>$null|Out-Null}
    if(docker network ls --filter "name=^$([regex]::Escape($defaultNetwork))$" -q){& docker network rm $defaultNetwork 2>$null|Out-Null}
    $resolved=[IO.Path]::GetFullPath($temporaryRoot);$temp=[IO.Path]::GetFullPath([IO.Path]::GetTempPath())
    if(-not $resolved.StartsWith($temp,[StringComparison]::OrdinalIgnoreCase) -or (Split-Path -Leaf $resolved) -notlike 'forge-gate5d-lane-*'){throw "Unsafe cleanup target: $resolved"}
    if(Test-Path -LiteralPath $resolved){Remove-Item -LiteralPath $resolved -Recurse -Force}
    $remaining=Get-TaskResources $projectId $internalNetwork;$nurseryAfter=Get-NurseryResources
    $cleanup=($remaining.containers.Count -eq 0 -and $remaining.volumes.Count -eq 0 -and $remaining.networks.Count -eq 0 -and -not(Test-Path -LiteralPath $resolved))
    $nurseryUnchanged=(($nurseryBefore.containers-join ',') -eq ($nurseryAfter.containers-join ',') -and ($nurseryBefore.volumes-join ',') -eq ($nurseryAfter.volumes-join ','))
    if($result){$result|Add-Member cleanupVerified $cleanup;$result|Add-Member nurseryResourcesUnchanged $nurseryUnchanged}
    if(-not $cleanup -or -not $nurseryUnchanged){throw 'Scoped teardown or Nursery preservation failed.'}
  }
  return $result
}

try {
  if($HistoryMode -eq 'ExternalAuthentic'){
    if(-not $AuthorizeExternalAuthenticCapsule -or -not $ExternalCapsuleDirectory){throw 'External authentic history requires an explicitly authorized encrypted capsule.'}
    $externalFull=[IO.Path]::GetFullPath($ExternalCapsuleDirectory);$temp=[IO.Path]::GetFullPath([IO.Path]::GetTempPath())
    if(-not $externalFull.StartsWith($temp,[StringComparison]::OrdinalIgnoreCase) -or (Split-Path -Leaf $externalFull) -notlike 'forge-gate5d-read-only-*' -or -not(Test-Path -LiteralPath $externalFull -PathType Container)){
      throw 'External authentic capsule is outside the approved task-owned temporary location.'
    }
  } elseif($ExternalCapsuleDirectory -or $AuthorizeExternalAuthenticCapsule){throw 'External authentic inputs are forbidden for synthetic history modes.'}
  if($HistoryMode -eq 'SharedSynthetic'){
    $sharedSyntheticRoot=Join-Path ([IO.Path]::GetTempPath()) "forge-gate5d-shared-$([guid]::NewGuid().ToString('N'))"
    New-Item -ItemType Directory -Path $sharedSyntheticRoot|Out-Null
  }
  foreach($name in $sensitiveNames){$savedEnvironment[$name]=[Environment]::GetEnvironmentVariable($name,'Process');[Environment]::SetEnvironmentVariable($name,$null,'Process')}
  $cli=(& supabase --version 2>$null|Select-Object -First 1).Trim();if($cli -ne $requiredCli){throw "Supabase CLI $requiredCli is required; found $cli."}
  & docker info *> $null;if($LASTEXITCODE -ne 0){throw 'Docker Desktop is unavailable. Start it manually.'}
  & (Join-Path $PSScriptRoot 'verify-canonical-database-artifacts.ps1') -RepositoryRoot $repo|Out-Null
  & (Join-Path $PSScriptRoot 'verify-pre-slice-a-fixture.ps1') -RepositoryRoot $repo|Out-Null
  & (Join-Path $PSScriptRoot 'verify-database-documentation-contract.ps1') -RepositoryRoot $repo|Out-Null
  $branch=(git -C $repo branch --show-current).Trim();$head=(git -C $repo rev-parse HEAD).Trim()
  $protectedDiff=(git -C $repo diff --name-only HEAD -- supabase/migrations database/canonical-baseline-v1 database/historical-pre-slice-a-v1 docs/database/baseline/v1-gate1/historical-migrations.sha256.json)
  if($protectedDiff){throw 'Frozen database evidence differs from HEAD.'}
  $nurseryBeforeAll=Get-NurseryResources
  $failureCleanup=$false
  try{Invoke-Lane 'failure-cleanup'|Out-Null;throw 'Failure-cleanup probe did not fail.'}catch{if($_.Exception.Message -notmatch 'EXPECTED_GATE5D_FAILURE_CLEANUP_PROBE'){throw};$failureCleanup=$true}
  $lanes=@(Invoke-Lane 'permissive';Invoke-Lane 'restrictive')
  $nurseryAfterAll=Get-NurseryResources
  $nurseryUnchanged=(($nurseryBeforeAll.containers-join ',') -eq ($nurseryAfterAll.containers-join ',') -and ($nurseryBeforeAll.volumes-join ',') -eq ($nurseryAfterAll.volumes-join ','))
  if(-not $nurseryUnchanged -or @($lanes|Where-Object{-not $_.cleanupVerified -or -not $_.nurseryResourcesUnchanged}).Count){throw 'Final isolation verification failed.'}
  [pscustomobject]@{
    ok=$true;schema='forge.gate6p-successor-two-lineage-certification.v1';historyMode=$HistoryMode
    syntheticOnly=($HistoryMode -ne 'ExternalAuthentic');authenticHistory=($HistoryMode -eq 'ExternalAuthentic');authenticRequestMade=$false
    cliVersion=$cli;gitBranch=$branch;gitHead=$head;failureCleanupVerified=$failureCleanup
    nurseryResourcesUnchanged=$nurseryUnchanged;hostingCharges=0;productionMetadataTransferred=$false;lanes=$lanes
  }|ConvertTo-Json -Depth 12 -Compress
}
finally {
  if($sharedSyntheticCapsule){Remove-CapsuleResult $sharedSyntheticCapsule}
  if($sharedSyntheticRoot -and (Test-Path -LiteralPath $sharedSyntheticRoot)){
    $resolved=[IO.Path]::GetFullPath($sharedSyntheticRoot);$temp=[IO.Path]::GetFullPath([IO.Path]::GetTempPath())
    if(-not $resolved.StartsWith($temp,[StringComparison]::OrdinalIgnoreCase) -or (Split-Path -Leaf $resolved) -notlike 'forge-gate5d-shared-*'){throw 'Unsafe shared synthetic cleanup target.'}
    Remove-Item -LiteralPath $resolved -Recurse -Force
  }
  foreach($name in $sensitiveNames){[Environment]::SetEnvironmentVariable($name,$savedEnvironment[$name],'Process')}
}
