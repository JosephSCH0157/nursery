[CmdletBinding()]
param(
  [Parameter(Mandatory)][ValidatePattern('^supabase_db_forge-gate5d-[a-z0-9-]+$')][string]$DatabaseContainer,
  [Parameter(Mandatory)][string]$OutputRoot,
  [ValidateSet('Valid','Duplicate','Incomplete')][string]$Variant = 'Valid',
  [switch]$MismatchedStatementsDigest,
  [string]$RepositoryRoot
)

$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'lib/ForgeGate5D.psm1') -Force
$repo = [IO.Path]::GetFullPath($(if ($RepositoryRoot) { $RepositoryRoot } else { Split-Path -Parent $PSScriptRoot }))
$manifest = Get-Content -LiteralPath (Join-Path $repo 'docs/database/baseline/v1-gate1/historical-migrations.sha256.json') -Raw | ConvertFrom-Json
$versions = @($manifest.migrations | Select-Object -First 411 | ForEach-Object { [string]$_.version })
if ($versions.Count -ne 411) { throw 'Frozen historical manifest does not provide the 411-version prefix.' }

function ConvertTo-JsonBase64([AllowNull()][object]$Value) {
  $json = ConvertTo-Json -InputObject $Value -Compress -Depth 20
  return [Convert]::ToBase64String([Text.UTF8Encoding]::new($false).GetBytes($json))
}

$records = [System.Collections.Generic.List[object[]]]::new()
for ($i=0; $i -lt $versions.Count; $i++) {
  $record = [object[]]::new(6)
  $record[0] = $versions[$i]
  $record[1] = if ($i -eq 7) { $null } else { ,@(
    "-- deterministic Gate 5D record $i",
    "select E'line one\nline two π'::text;",
    "select 'quote '' slash \\ record $i'::text;"
  ) }
  $record[2] = "gate5d_synthetic_$($versions[$i])"
  $record[3] = if ($i % 17 -eq 0) { 'gate5d-synthetic@example.invalid' } else { $null }
  $record[4] = if ($i % 19 -eq 0) { "gate5d-idempotency-$i" } else { $null }
  $record[5] = if ($i % 3 -eq 0) { $null } else { ,@("select 'rollback $i'::text;", "-- rollback λ $i") }
  $records.Add($record)
}
if ($Variant -eq 'Duplicate') {
  $duplicate = [object[]]::new(6)
  for ($j=0; $j -lt 6; $j++) { $duplicate[$j] = $records[9][$j] }
  $records[10] = $duplicate
}
elseif ($Variant -eq 'Incomplete') {
  $records.RemoveAt($records.Count - 1)
}

$copy = [Text.StringBuilder]::new()
foreach ($record in $records) {
  $fields = for ($i=0; $i -lt 6; $i++) { ConvertTo-JsonBase64 $record[$i] }
  [void]$copy.AppendLine(($fields -join "`t"))
}

$sql = @"
begin;
create temporary table gate5d_source(
  version_json text not null, statements_json text not null, name_json text not null,
  created_by_json text not null, idempotency_key_json text not null, rollback_json text not null
) on commit drop;
copy gate5d_source from stdin with (format text, delimiter E'\t');
$($copy.ToString())\.
with history as materialized (
  select
    convert_from(decode(version_json,'base64'),'UTF8')::jsonb #>> '{}' as version,
    case when jsonb_typeof(convert_from(decode(statements_json,'base64'),'UTF8')::jsonb)='null' then null
         else array(select jsonb_array_elements_text(convert_from(decode(statements_json,'base64'),'UTF8')::jsonb)) end as statements,
    case when jsonb_typeof(convert_from(decode(name_json,'base64'),'UTF8')::jsonb)='null' then null
         else convert_from(decode(name_json,'base64'),'UTF8')::jsonb #>> '{}' end as name,
    case when jsonb_typeof(convert_from(decode(created_by_json,'base64'),'UTF8')::jsonb)='null' then null
         else convert_from(decode(created_by_json,'base64'),'UTF8')::jsonb #>> '{}' end as created_by,
    case when jsonb_typeof(convert_from(decode(idempotency_key_json,'base64'),'UTF8')::jsonb)='null' then null
         else convert_from(decode(idempotency_key_json,'base64'),'UTF8')::jsonb #>> '{}' end as idempotency_key,
    case when jsonb_typeof(convert_from(decode(rollback_json,'base64'),'UTF8')::jsonb)='null' then null
         else array(select jsonb_array_elements_text(convert_from(decode(rollback_json,'base64'),'UTF8')::jsonb)) end as rollback
  from gate5d_source
), payload as (
  select string_agg(jsonb_build_array(version,statements,name,created_by,idempotency_key,rollback)::text,E'\n' order by version) body
  from history
), summary as (
  select count(*) row_count, min(version) min_version, max(version) max_version,
    encode(extensions.digest(convert_to(payload.body,'UTF8'),'sha256'),'hex') all_columns_sha256,
    encode(extensions.digest(convert_to(string_agg(jsonb_build_array(version,version)::text,E'\n' order by version),'UTF8'),'sha256'),'hex') version_sha256,
    encode(extensions.digest(convert_to(string_agg(jsonb_build_array(version,statements)::text,E'\n' order by version),'UTF8'),'sha256'),'hex') statements_sha256,
    encode(extensions.digest(convert_to(string_agg(jsonb_build_array(version,name)::text,E'\n' order by version),'UTF8'),'sha256'),'hex') name_sha256,
    encode(extensions.digest(convert_to(string_agg(jsonb_build_array(version,created_by)::text,E'\n' order by version),'UTF8'),'sha256'),'hex') created_by_sha256,
    encode(extensions.digest(convert_to(string_agg(jsonb_build_array(version,idempotency_key)::text,E'\n' order by version),'UTF8'),'sha256'),'hex') idempotency_key_sha256,
    encode(extensions.digest(convert_to(string_agg(jsonb_build_array(version,rollback)::text,E'\n' order by version),'UTF8'),'sha256'),'hex') rollback_sha256,
    encode(convert_to(payload.body,'UTF8'),'base64') payload_base64
  from history cross join payload group by payload.body
)
select jsonb_build_object(
  'transaction_read_only','on',
  'columns',jsonb_build_array('version','statements','name','created_by','idempotency_key','rollback'),
  'row_count',row_count,'min_version',min_version,'max_version',max_version,
  'all_columns_sha256',all_columns_sha256,'version_sha256',version_sha256,
  'statements_sha256',statements_sha256,'name_sha256',name_sha256,
  'created_by_sha256',created_by_sha256,'idempotency_key_sha256',idempotency_key_sha256,
  'rollback_sha256',rollback_sha256,'payload_base64',payload_base64
) from summary;
rollback;
"@
$sql = $sql.Replace("`r`n","`n")

$responseOutput = @($sql | & docker exec -i $DatabaseContainer psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres 2>&1)
if ($LASTEXITCODE -ne 0) {
  $diagnostic = @($responseOutput | ForEach-Object { [string]$_ } | Where-Object { $_ -match '^(ERROR|FATAL|psql:)' }) -join ' '
  throw "Synthetic history generation failed; row content is suppressed. $diagnostic"
}
$responseLine = ($responseOutput | Out-String).Trim()
if (-not $responseLine) { throw 'Synthetic history generation returned no result.' }
try { $envelope = $responseLine | ConvertFrom-Json -Depth 20 }
catch { throw 'Synthetic PostgreSQL response was malformed; content is suppressed.' }

$contract = Get-ForgeGate5DContract -RepositoryRoot $repo
$contract.history.hashes.allColumns = [string]$envelope.all_columns_sha256
$contract.history.hashes.version = [string]$envelope.version_sha256
$contract.history.hashes.statements = [string]$envelope.statements_sha256
$contract.history.hashes.name = [string]$envelope.name_sha256
$contract.history.hashes.createdBy = [string]$envelope.created_by_sha256
$contract.history.hashes.idempotencyKey = [string]$envelope.idempotency_key_sha256
$contract.history.hashes.rollback = [string]$envelope.rollback_sha256
if ($MismatchedStatementsDigest) {
  $contract.history.hashes.statements = ('0' * 64)
}

try { $payload = [Convert]::FromBase64String([string]$envelope.payload_base64) }
catch { throw 'Synthetic payload was not valid base64.' }
$payloadHash = Get-ForgeGate5DSha256Hex -Bytes $payload
if ($payloadHash -cne [string]$contract.history.hashes.allColumns) { throw 'Synthetic payload digest mismatch.' }

$capsuleDirectory = Join-Path ([IO.Path]::GetFullPath($OutputRoot)) "forge-gate5d-capsule-$($Variant.ToLowerInvariant())-$([guid]::NewGuid().ToString('N'))"
$contractPath = Join-Path ([IO.Path]::GetFullPath($OutputRoot)) "forge-gate5d-contract-$($Variant.ToLowerInvariant())-$([guid]::NewGuid().ToString('N')).json"
try {
  New-ForgeGate5DRestrictedDirectory -Path $capsuleDirectory | Out-Null
  $projectHash = Get-ForgeGate5DSha256Hex -Bytes ([Text.Encoding]::UTF8.GetBytes('gate5d-synthetic-local-only'))
  Protect-ForgeGate5DCapsule -Payload $payload -Directory $capsuleDirectory -Contract $contract -ProjectRefHash $projectHash | Out-Null
  [IO.File]::WriteAllText($contractPath,($contract | ConvertTo-Json -Depth 20),[Text.UTF8Encoding]::new($false))
  [pscustomobject]@{
    ok=$true; schema='forge.gate5d-synthetic-capsule.v1'; variant=$Variant
    capsuleDirectory=$capsuleDirectory; contractPath=$contractPath; recordCount=$records.Count
    hashes=[ordered]@{
      allColumns=[string]$contract.history.hashes.allColumns; version=[string]$contract.history.hashes.version
      statements=[string]$contract.history.hashes.statements; name=[string]$contract.history.hashes.name
      createdBy=[string]$contract.history.hashes.createdBy; idempotencyKey=[string]$contract.history.hashes.idempotencyKey
      rollback=[string]$contract.history.hashes.rollback
    }
    nullAndArrayCoverage=$true; multilineSqlCoverage=$true; unicodeCoverage=$true
  } | ConvertTo-Json -Depth 6 -Compress
}
finally {
  if ($payload) { [Array]::Clear($payload,0,$payload.Length) }
  $sql=$null; $copy=$null; $responseLine=$null; $responseOutput=$null
}
