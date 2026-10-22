[CmdletBinding()]
param(
  [Parameter(Mandatory)][string]$CapsuleDirectory,
  [Parameter(Mandatory)][ValidatePattern('^forge-gate5d-[a-z0-9-]+$')][string]$ProjectId,
  [Parameter(Mandatory)][string]$Workdir,
  [string]$SyntheticContractPath,
  [switch]$SyntheticTest,
  [string]$RepositoryRoot
)

$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'lib/ForgeGate5D.psm1') -Force
$repo = [IO.Path]::GetFullPath($(if ($RepositoryRoot) { $RepositoryRoot } else { Split-Path -Parent $PSScriptRoot }))
$contract = if ($SyntheticTest) {
  if (-not $SyntheticContractPath) { throw 'Synthetic tests require an explicit synthetic contract.' }
  $syntheticFull = [IO.Path]::GetFullPath($SyntheticContractPath)
  if (-not $syntheticFull.StartsWith([IO.Path]::GetFullPath([IO.Path]::GetTempPath()),[StringComparison]::OrdinalIgnoreCase)) {
    throw 'Synthetic contract must be outside the repository beneath the OS temporary directory.'
  }
  Get-Content -LiteralPath $syntheticFull -Raw | ConvertFrom-Json
} else {
  if ($SyntheticContractPath) { throw 'Synthetic contract override is forbidden outside synthetic-test mode.' }
  Get-ForgeGate5DContract -RepositoryRoot $repo
}
if ([int]$contract.history.rowCount -ne 411 -or
    [string]$contract.history.minimumVersion -cnotmatch '^\d{8,14}$' -or
    [string]$contract.history.maximumVersion -cnotmatch '^\d{8,14}$') {
  throw 'History contract count or version bounds are invalid.'
}
foreach ($hash in @($contract.history.hashes.allColumns,$contract.history.hashes.version,$contract.history.hashes.statements,$contract.history.hashes.name,$contract.history.hashes.createdBy,$contract.history.hashes.idempotencyKey,$contract.history.hashes.rollback)) {
  if (-not (Test-ForgeGate5DHash ([string]$hash))) { throw 'History contract contains an invalid hash.' }
}
$container = "supabase_db_$ProjectId"
if ($container -eq 'supabase_db_nursery' -or [IO.Path]::GetFullPath($Workdir) -eq $repo) {
  throw 'Gate 5D restoration refuses Nursery and the historical root workdir.'
}
& docker info *> $null
if ($LASTEXITCODE -ne 0) { throw 'Docker Desktop is unavailable. Start it manually.' }
$identityPath = Join-Path ([IO.Path]::GetFullPath($Workdir)) 'gate5d-disposable.json'
if (-not (Test-Path -LiteralPath $identityPath -PathType Leaf)) { throw 'Gate 5D disposable identity file is missing.' }
$identity = Get-Content -LiteralPath $identityPath -Raw | ConvertFrom-Json
if ($identity.schema -ne 'forge.gate5d-disposable.v1' -or [string]$identity.projectId -ne $ProjectId -or [string]$identity.repositoryRoot -ne $repo) {
  throw 'Gate 5D disposable identity file is invalid.'
}
$inspection = (& docker inspect $container 2>$null | ConvertFrom-Json)
if (@($inspection).Count -ne 1) { throw 'The disposable target container does not exist.' }
$labels = $inspection[0].Config.Labels
if ([string]$labels.'com.supabase.cli.project' -ne $ProjectId) {
  throw 'The target container is not the task-created Gate 5D disposable database.'
}
$networkNames = @($inspection[0].NetworkSettings.Networks.psobject.Properties.Name)
if ($networkNames.Count -ne 1) { throw 'The disposable database must have exactly one isolated network.' }
$network = (& docker network inspect $networkNames[0] | ConvertFrom-Json)[0]
if (-not [bool]$network.Internal -or [string]$network.Labels.'forge.gate' -ne '5d') {
  throw 'The disposable database network is not Gate 5D internal-only.'
}
$projectContainers = @(& docker ps -a --filter "label=com.supabase.cli.project=$ProjectId" --format '{{.Names}}')
if (($projectContainers -join ',') -ne $container) { throw 'Provider services are not disabled for the disposable target.' }

function Invoke-RedactedPsql([string]$Sql) {
  $null = ($Sql | & docker exec -i $container psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres 2>$null)
  if ($LASTEXITCODE -ne 0) { throw 'Disposable history operation failed; SQL and row content are suppressed.' }
}
function Invoke-ScalarPsql([string]$Sql) {
  $value = ($Sql | & docker exec -i $container psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres 2>$null | Out-String).Trim()
  if ($LASTEXITCODE -ne 0) { throw 'Disposable target verification failed; SQL output is suppressed.' }
  return $value
}

$relation = Invoke-ScalarPsql "select coalesce(to_regclass('supabase_migrations.schema_migrations')::text,'');"
if ($relation -ne 'supabase_migrations.schema_migrations') { throw 'The certified fixture migration-history relation is missing.' }
$shape = Invoke-ScalarPsql @'
select string_agg(column_name || ':' || udt_name || ':' || is_nullable, ',' order by ordinal_position)
from information_schema.columns
where table_schema='supabase_migrations' and table_name='schema_migrations';
'@
$expectedShape = 'version:text:NO,statements:_text:YES,name:text:YES,created_by:text:YES,idempotency_key:text:YES,rollback:_text:YES'
if ($shape -ne $expectedShape) { throw 'The migration-history table shape is incompatible.' }
if ([int](Invoke-ScalarPsql 'select count(*) from supabase_migrations.schema_migrations;') -ne 0) { throw 'The disposable target already contains migration history.' }
if ((Invoke-ScalarPsql "select coalesce(to_regclass('forge_meta.database_lineage')::text,'');")) { throw 'The pre-upgrade target already contains a lineage marker.' }

# Re-run the approved fixture security/behavior assertions before confidential restoration.
foreach ($test in @('supabase/tests/public_slice_a_catalog_parity.sql','supabase/tests/public_slice_a_security_behavior.sql','supabase/tests/pre_slice_a_fixture_behavior.sql')) {
  $sql = Get-Content -LiteralPath (Join-Path $repo $test) -Raw
  Invoke-RedactedPsql $sql
}

$capsule = Unprotect-ForgeGate5DCapsule -Directory $CapsuleDirectory
$payload = $capsule.Payload
try {
  $summary = Test-ForgeGate5DPayload -Payload $payload -Contract $contract -RepositoryRoot $repo
  $text = [Text.UTF8Encoding]::new($false,$true).GetString($payload)
  $copy = [Text.StringBuilder]::new($text.Length * 2)
  foreach ($line in ($text -split "`n")) {
    $record = @($line | ConvertFrom-Json -Depth 20)
    $encoded = for ($i=0; $i -lt 6; $i++) {
      $json = ConvertTo-Json -InputObject $record[$i] -Compress -Depth 20
      [Convert]::ToBase64String([Text.UTF8Encoding]::new($false).GetBytes($json))
    }
    [void]$copy.AppendLine(($encoded -join "`t"))
  }
  $h = $contract.history.hashes
  $sql = @"
begin;
set local statement_timeout = '120s';
do `$guard`$
begin
  if exists (select 1 from supabase_migrations.schema_migrations) then
    raise exception 'target history is not empty';
  end if;
end `$guard`$;
create temporary table gate5d_history_stage(
  version_json text not null, statements_json text not null, name_json text not null,
  created_by_json text not null, idempotency_key_json text not null, rollback_json text not null
) on commit drop;
copy gate5d_history_stage from stdin with (format text, delimiter E'\t');
$($copy.ToString())\.
insert into supabase_migrations.schema_migrations(version,statements,name,created_by,idempotency_key,rollback)
select
  convert_from(decode(version_json,'base64'),'UTF8')::jsonb #>> '{}',
  case when jsonb_typeof(convert_from(decode(statements_json,'base64'),'UTF8')::jsonb)='null' then null
       else array(select jsonb_array_elements_text(convert_from(decode(statements_json,'base64'),'UTF8')::jsonb)) end,
  case when jsonb_typeof(convert_from(decode(name_json,'base64'),'UTF8')::jsonb)='null' then null
       else convert_from(decode(name_json,'base64'),'UTF8')::jsonb #>> '{}' end,
  case when jsonb_typeof(convert_from(decode(created_by_json,'base64'),'UTF8')::jsonb)='null' then null
       else convert_from(decode(created_by_json,'base64'),'UTF8')::jsonb #>> '{}' end,
  case when jsonb_typeof(convert_from(decode(idempotency_key_json,'base64'),'UTF8')::jsonb)='null' then null
       else convert_from(decode(idempotency_key_json,'base64'),'UTF8')::jsonb #>> '{}' end,
  case when jsonb_typeof(convert_from(decode(rollback_json,'base64'),'UTF8')::jsonb)='null' then null
       else array(select jsonb_array_elements_text(convert_from(decode(rollback_json,'base64'),'UTF8')::jsonb)) end
from gate5d_history_stage;
do `$verify`$
declare v record;
begin
  select count(*) row_count, min(version) min_version, max(version) max_version,
    encode(extensions.digest(convert_to(string_agg(jsonb_build_array(version,statements,name,created_by,idempotency_key,rollback)::text,E'\n' order by version),'UTF8'),'sha256'),'hex') all_hash,
    encode(extensions.digest(convert_to(string_agg(jsonb_build_array(version,version)::text,E'\n' order by version),'UTF8'),'sha256'),'hex') version_hash,
    encode(extensions.digest(convert_to(string_agg(jsonb_build_array(version,statements)::text,E'\n' order by version),'UTF8'),'sha256'),'hex') statements_hash,
    encode(extensions.digest(convert_to(string_agg(jsonb_build_array(version,name)::text,E'\n' order by version),'UTF8'),'sha256'),'hex') name_hash,
    encode(extensions.digest(convert_to(string_agg(jsonb_build_array(version,created_by)::text,E'\n' order by version),'UTF8'),'sha256'),'hex') created_by_hash,
    encode(extensions.digest(convert_to(string_agg(jsonb_build_array(version,idempotency_key)::text,E'\n' order by version),'UTF8'),'sha256'),'hex') idempotency_hash,
    encode(extensions.digest(convert_to(string_agg(jsonb_build_array(version,rollback)::text,E'\n' order by version),'UTF8'),'sha256'),'hex') rollback_hash
  into v from supabase_migrations.schema_migrations;
  if v.row_count <> $($contract.history.rowCount) or v.min_version <> '$($contract.history.minimumVersion)' or v.max_version <> '$($contract.history.maximumVersion)'
     or v.all_hash <> '$($h.allColumns)' or v.version_hash <> '$($h.version)' or v.statements_hash <> '$($h.statements)'
     or v.name_hash <> '$($h.name)' or v.created_by_hash <> '$($h.createdBy)' or v.idempotency_hash <> '$($h.idempotencyKey)'
     or v.rollback_hash <> '$($h.rollback)' then
    raise exception 'restored history contract mismatch';
  end if;
end `$verify`$;
commit;
"@
  Invoke-RedactedPsql $sql
  if ([int](Invoke-ScalarPsql 'select count(*) from supabase_migrations.schema_migrations;') -ne [int]$contract.history.rowCount) {
    throw 'Post-commit history count mismatch.'
  }
  [pscustomobject]@{
    ok=$true; schema='forge.gate5d-restore-result.v1'; projectId=$ProjectId
    rowCount=[int]$summary.RowCount; payloadSha256=[string]$contract.history.hashes.allColumns
    transactional=$true; target='task-created-disposable'; plaintextWritten=$false
  } | ConvertTo-Json -Compress
}
finally {
  if ($payload) { [Array]::Clear($payload,0,$payload.Length) }
  $text=$null; $sql=$null; $copy=$null
}
