[CmdletBinding()]
param(
  [string]$RepositoryRoot = (Split-Path -Parent $PSScriptRoot),
  [switch]$VerifyOnly
)

$ErrorActionPreference = 'Stop'
$repo = [IO.Path]::GetFullPath($RepositoryRoot)
$sourcePath = Join-Path $repo 'database/canonical-baseline-v1/supabase/migrations/20261021020814_canonical_baseline_v1.sql'
$outputPath = Join-Path $repo 'database/historical-pre-slice-a-v1/pre-slice-a-schema.sql'
$expectedSourceHash = '73d2779c406b9428e7fdf189ab7ad084671cf1d03908041dbbe855816556c62e'

& (Join-Path $PSScriptRoot 'verify-canonical-database-artifacts.ps1') -RepositoryRoot $repo | Out-Null

$sourceHash = (Get-FileHash -LiteralPath $sourcePath -Algorithm SHA256).Hash.ToLowerInvariant()
if ($sourceHash -ne $expectedSourceHash) {
  throw "Frozen B1 source hash mismatch. Expected $expectedSourceHash; found $sourceHash."
}

$source = (Get-Content -LiteralPath $sourcePath -Raw).Replace("`r`n", "`n")
$markerAnchor = "create schema forge_meta;"
$eventAnchor = "create event trigger ensure_rls"
if (([regex]::Matches($source, [regex]::Escape($markerAnchor))).Count -ne 1 -or
    ([regex]::Matches($source, [regex]::Escape($eventAnchor))).Count -ne 1) {
  throw 'Frozen B1 fixture anchors are not unique.'
}

$prefix = $source.Substring(0, $source.IndexOf($markerAnchor, [StringComparison]::Ordinal))
$eventStart = $source.IndexOf($eventAnchor, [StringComparison]::Ordinal)
$eventEnd = $source.IndexOf("commit;", $eventStart, [StringComparison]::Ordinal)
if ($eventEnd -lt 0) { throw 'Frozen B1 commit anchor is missing.' }
$eventAndCommit = $source.Substring($eventStart, $eventEnd - $eventStart + 'commit;'.Length)

$prefix = $prefix.Replace(@'
-- Forge canonical baseline v1.
-- Generated from the approved post-Slice-A production catalog using Supabase CLI 2.84.2.
-- This migration is for fresh baseline-lineage databases only.
'@, @'
-- Forge pre-Slice-A historical schema fixture v1.
-- Derived from the reviewed structural definitions whose complete normalized
-- catalog was independently recaptured from the 411-version hosted database.
-- This is a schema fixture for disposable certification, not a migration.
'@)
$prefix = $prefix.Replace(@'
-- Every application object, ACL, policy, trigger, reference record, assertion,
-- and lineage marker below is committed atomically.
'@, @'
-- Every application object, ACL, policy, trigger, approved reference record,
-- and pre-upgrade assertion below is committed atomically.
'@)
$prefix = $prefix.Replace('before and after the 2025-10-30 Data API change', 'before and after the 2026-10-30 Data API change')
$prefix = $prefix.Replace('The only approved baseline application records', 'The only approved pre-Slice-A application records')

$assertions = @'

do $pre_slice_a_assertions$
declare
  r record;
  row_count bigint;
  unexpected_extensions text[];
  history_count bigint;
begin
  if to_regnamespace('forge_meta') is not null then
    raise exception 'Pre-Slice-A fixture must not contain forge_meta lineage state';
  end if;
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    execute 'select count(*) from supabase_migrations.schema_migrations' into history_count;
    if history_count <> 0 then
      raise exception 'Pre-Slice-A fixture must not install migration-history rows';
    end if;
  end if;
  if (select count(*) from tongs.quench_destination_scopes) <> 3 then
    raise exception 'Fixture must contain exactly three Quench destination scopes';
  end if;
  if (select count(*) from tongs.quench_destination_capability_revisions) <> 4 then
    raise exception 'Fixture must contain exactly four Quench capability revisions';
  end if;
  if exists (
    select 1 from tongs.quench_destination_scopes
    where workspace_id is not null or connection_ref is not null or created_by is not null
  ) then
    raise exception 'Fixture Quench scopes contain environment or customer state';
  end if;
  if exists (
    select 1 from tongs.quench_destination_capability_revisions cap
    where cap.created_by is not null
       or cap.content_hash <> encode(extensions.digest(convert_to(cap.capabilities_json::text,'UTF8'),'sha256'),'hex')
  ) then
    raise exception 'Fixture Quench capability contract is invalid';
  end if;

  for r in
    select n.nspname schema_name, c.relname table_name
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where c.relkind in ('r','p') and n.nspname in ('public','tongs')
      and format('%I.%I',n.nspname,c.relname) not in (
        'tongs.quench_destination_scopes',
        'tongs.quench_destination_capability_revisions'
      )
  loop
    execute format('select count(*) from %I.%I',r.schema_name,r.table_name) into row_count;
    if row_count <> 0 then
      raise exception 'Unexpected fixture rows in %.%: %',r.schema_name,r.table_name,row_count;
    end if;
  end loop;

  select array_agg(extname order by extname) into unexpected_extensions
  from pg_extension
  where extname not in (
    'hypopg','index_advisor','pg_stat_statements','pgcrypto',
    'plpgsql','supabase_vault','uuid-ossp','wrappers'
  );
  if unexpected_extensions is not null then
    raise exception 'Unexpected fixture extensions: %',unexpected_extensions;
  end if;
  if exists (
    select 1 from (values
      ('hypopg','1.4.1'),('index_advisor','0.2.0'),('pg_stat_statements','1.11'),
      ('pgcrypto','1.3'),('plpgsql','1.0'),('supabase_vault','0.3.1'),
      ('uuid-ossp','1.1')
    ) expected(name,version)
    left join pg_extension e on e.extname=expected.name and e.extversion=expected.version
    where e.oid is null
  ) then
    raise exception 'Required fixture extension or version is missing';
  end if;
  if not exists (
    select 1 from pg_extension
    where extname='wrappers'
      and extnamespace='extensions'::regnamespace
      and extrelocatable
      and extversion in ('0.5.6','0.5.7')
  ) then
    raise exception 'Unapproved wrappers extension contract; expected 0.5.6 or 0.5.7 in extensions schema';
  end if;
end
$pre_slice_a_assertions$;

'@

$content = ($prefix.TrimEnd() + $assertions + $eventAndCommit + "`n")

foreach ($forbidden in @(
  'forge_meta.database_lineage',
  "'baseline-v1'",
  '20261020171517',
  '20261020171519',
  '20261020171522',
  '20261022000000'
)) {
  if ($content.Contains($forbidden, [StringComparison]::Ordinal)) {
    throw "Generated fixture contains forbidden post-Slice-A state: $forbidden"
  }
}
if ($content -match '(?im)^\s*(copy|insert into)\s+"?(public|tongs)"?\.' -and
    ([regex]::Matches($content, '(?im)^\s*insert into\s+tongs\.quench_destination_(scopes|capability_revisions)\s*\(')).Count -ne 2) {
  throw 'Generated fixture contains unapproved application data statements.'
}
foreach ($secretPattern in @(
  'postgres(?:ql)?://',
  'sk_(?:live|test)_',
  'sk-(?:live|test|proj)-',
  'eyJ[a-zA-Z0-9_-]{10,}\.',
  'SUPABASE_(?:SERVICE_ROLE|ANON|ACCESS)_KEY',
  'STRIPE_(?:SECRET|WEBHOOK)',
  'OPENAI_API_KEY',
  'RUNWAY_API_KEY'
)) {
  if ($content -match $secretPattern) { throw "Generated fixture contains a credential-like value: $secretPattern" }
}
if ($content -match '(?im)^\s*create\s+(server|foreign\s+table|user\s+mapping)\b') {
  throw 'Generated fixture unexpectedly configures a foreign server, table, or user mapping.'
}

$bytes = [Text.UTF8Encoding]::new($false).GetBytes($content)
$outputHash = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($bytes)).ToLowerInvariant()
if ($VerifyOnly) {
  if (-not (Test-Path -LiteralPath $outputPath -PathType Leaf)) { throw "Fixture is missing: $outputPath" }
  $existingHash = (Get-FileHash -LiteralPath $outputPath -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($existingHash -ne $outputHash) { throw "Fixture is not reproducible. Expected $outputHash; found $existingHash." }
}
else {
  $parent = Split-Path -Parent $outputPath
  New-Item -ItemType Directory -Path $parent -Force | Out-Null
  [IO.File]::WriteAllText($outputPath, $content, [Text.UTF8Encoding]::new($false))
}

[pscustomobject]@{
  ok = $true
  source = $sourcePath
  sourceSha256 = $sourceHash
  output = $outputPath
  outputSha256 = $outputHash
  bytes = $bytes.Length
  verifyOnly = [bool]$VerifyOnly
} | ConvertTo-Json -Compress
