[CmdletBinding()]
param(
  [Parameter(Mandatory)][string]$SchemaDumpPath,
  [Parameter(Mandatory)][string]$OutputMigrationPath,
  [string]$RepositoryRoot = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = 'Stop'
$requiredCliVersion = '2.84.2'
$expectedDumpSha256 = '3dcccc455ac03caa8610143d23eaeb061a2e3f49c8818c4d1d2ce687e55f3368'
$expectedContractSha256 = '817f42cfe0f57d2961b52a72b58a5273c3cc1e2bf306e3a527e6bc58bdbcbfbe'
$expectedManifestSha256 = '66a094037af456e95b34ec0ca3fb18bcc791d296fa6c2619af9639a87f7d7f40'

$actualCliVersion = (& supabase --version 2>$null | Select-Object -First 1).Trim()
if ($actualCliVersion -ne $requiredCliVersion) {
  throw "Supabase CLI $requiredCliVersion is required; found $actualCliVersion."
}

& (Join-Path $PSScriptRoot 'verify-historical-migration-manifest.ps1') -RepositoryRoot $RepositoryRoot | Out-Null

$dump = [IO.Path]::GetFullPath($SchemaDumpPath)
$output = [IO.Path]::GetFullPath($OutputMigrationPath)
if (-not (Test-Path -LiteralPath $dump -PathType Leaf)) { throw "Schema dump is missing: $dump" }
if (-not (Test-Path -LiteralPath $output -PathType Leaf)) {
  throw 'Create the baseline migration with supabase migration new before running this builder.'
}
$outputName = [IO.Path]::GetFileName($output)
if ($outputName -notmatch '^(?<version>\d{14})_canonical_baseline_v1\.sql$') {
  throw "Unexpected baseline migration filename: $outputName"
}
if ($Matches.version -lt '20261021000000' -or $Matches.version -gt '20261021235959') {
  throw "Baseline version $($Matches.version) is outside the approved epoch."
}

$actualDumpSha256 = (Get-FileHash -LiteralPath $dump -Algorithm SHA256).Hash.ToLowerInvariant()
if ($actualDumpSha256 -ne $expectedDumpSha256) {
  throw "Schema dump SHA-256 mismatch. Expected $expectedDumpSha256; found $actualDumpSha256."
}
$schemaSql = (Get-Content -LiteralPath $dump -Raw).Replace("`r`n", "`n")
if ($schemaSql -match '(?im)^(copy|insert into) "(public|tongs)"\.') {
  throw 'Schema dump unexpectedly contains table data.'
}
if ($schemaSql -match '(?im)^\s*(create|alter)\s+event\s+trigger\b') {
  throw 'CLI dump unexpectedly contains event-trigger DDL; the reviewed footer owns that object.'
}

$header = @'
-- Forge canonical baseline v1.
-- Generated from the approved post-Slice-A production catalog using Supabase CLI 2.84.2.
-- This migration is for fresh baseline-lineage databases only.
-- Install the environment-provided wrappers version. Supabase ignores explicit
-- extension version pins starting 2026-08-05; the assertion below accepts only
-- the separately reviewed 0.5.6 hosted or 0.5.7 CLI certification contracts.
-- The CLI migrator uses the extended query protocol. The wrappers installer is
-- invoked as dynamic utility SQL so its pgrx script runs on the server path used
-- by normal hosted execution as well as psql.
do $extension_install$
begin
  if not exists (select 1 from pg_extension where extname='wrappers') then
    execute 'create extension wrappers with schema extensions';
  end if;
end
$extension_install$;
drop extension if exists pg_graphql;
drop extension if exists pg_net;
create extension if not exists hypopg with schema extensions version '1.4.1';
create extension if not exists index_advisor with schema extensions version '0.2.0';
create extension if not exists pg_stat_statements with schema extensions version '1.11';
create extension if not exists pgcrypto with schema extensions version '1.3';
create extension if not exists "uuid-ossp" with schema extensions version '1.1';

-- Every application object, ACL, policy, trigger, reference record, assertion,
-- and lineage marker below is committed atomically.
begin;

-- Supabase projects created before and after the 2025-10-30 Data API change can
-- begin with different postgres-owned default ACLs.  Make object creation
-- independent of that ambient state; the reviewed dump restores the approved
-- production default privileges and grants later in this same transaction.
create schema tongs authorization postgres;
alter default privileges for role postgres revoke all on tables from anon, authenticated, service_role;
alter default privileges for role postgres revoke all on sequences from anon, authenticated, service_role;
alter default privileges for role postgres revoke all on functions from anon, authenticated, service_role;
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated, service_role;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated, service_role;
alter default privileges for role postgres in schema public revoke all on functions from anon, authenticated, service_role;
alter default privileges for role postgres in schema tongs revoke all on tables from anon, authenticated, service_role;
alter default privileges for role postgres in schema tongs revoke all on sequences from anon, authenticated, service_role;
alter default privileges for role postgres in schema tongs revoke all on functions from anon, authenticated, service_role;

'@

# pg_dump cannot represent dropped-column attnum gaps.  These four inert
# placeholders recreate the approved physical ordinals and are dropped after
# all dump DDL has run.  This preserves SELECT * / generated-type column order
# without restoring any retired field or data.
$droppedColumnGaps = [ordered]@{
  'CREATE TABLE IF NOT EXISTS "tongs"."barstock_sparks" (`n    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,`n    "workspace_id" "uuid" NOT NULL,`n    "created_by" "uuid",' = "CREATE TABLE IF NOT EXISTS `"tongs`".`"barstock_sparks`" (`n    `"id`" `"uuid`" DEFAULT `"gen_random_uuid`"() NOT NULL,`n    `"workspace_id`" `"uuid`" NOT NULL,`n    `"created_by`" `"uuid`",`n    `"__forge_dropped_attnum_4`" boolean,"
  'CREATE TABLE IF NOT EXISTS "tongs"."episodes" (`n    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,`n    "workspace_id" "uuid" NOT NULL,`n    "label" "text" NOT NULL,`n    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,`n    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,' = "CREATE TABLE IF NOT EXISTS `"tongs`".`"episodes`" (`n    `"id`" `"uuid`" DEFAULT `"gen_random_uuid`"() NOT NULL,`n    `"workspace_id`" `"uuid`" NOT NULL,`n    `"label`" `"text`" NOT NULL,`n    `"created_at`" timestamp with time zone DEFAULT `"now`"() NOT NULL,`n    `"updated_at`" timestamp with time zone DEFAULT `"now`"() NOT NULL,`n    `"__forge_dropped_attnum_6`" boolean,"
  'CREATE TABLE IF NOT EXISTS "tongs"."recording_capture_authorities" (`n    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,' = "CREATE TABLE IF NOT EXISTS `"tongs`".`"recording_capture_authorities`" (`n    `"id`" `"uuid`" DEFAULT `"gen_random_uuid`"() NOT NULL,`n    `"__forge_dropped_attnum_2`" boolean,"
  'CREATE TABLE IF NOT EXISTS "tongs"."workspaces" (`n    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,`n    "name" "text" NOT NULL,' = "CREATE TABLE IF NOT EXISTS `"tongs`".`"workspaces`" (`n    `"id`" `"uuid`" DEFAULT `"gen_random_uuid`"() NOT NULL,`n    `"name`" `"text`" NOT NULL,`n    `"__forge_dropped_attnum_3`" boolean,"
}
foreach ($replacement in $droppedColumnGaps.GetEnumerator()) {
  $anchor = $replacement.Key.Replace('`n', "`n")
  $matches = ([regex]::Matches($schemaSql, [regex]::Escape($anchor))).Count
  if ($matches -ne 1) {
    throw "Expected exactly one dropped-column insertion anchor; found $matches for: $($replacement.Key)"
  }
  $schemaSql = $schemaSql.Replace($anchor, $replacement.Value)
}

$footer = @'

alter table tongs.barstock_sparks drop column "__forge_dropped_attnum_4";
alter table tongs.episodes drop column "__forge_dropped_attnum_6";
alter table tongs.recording_capture_authorities drop column "__forge_dropped_attnum_2";
alter table tongs.workspaces drop column "__forge_dropped_attnum_3";

-- These policies live on the Supabase-managed storage.objects table, so a
-- public,tongs-only schema dump cannot carry them even though they are part of
-- the Forge authorization contract and depend on tongs objects.
create policy bellows_capture_operator_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'bellows-capture'
    and exists (
      select 1 from tongs.bellows_session_participants participant
      where participant.session_id = (storage.foldername(objects.name))[2]
        and participant.id = (storage.foldername(objects.name))[3]
        and participant.user_id = auth.uid()
    )
  );
create policy bellows_capture_operator_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'bellows-capture'
    and exists (
      select 1 from tongs.bellows_sessions s
      where s.id = (storage.foldername(objects.name))[2]
        and tongs.can_access_workspace(s.workspace_id)
    )
  );
create policy brand_asset_objects_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'forge-workpieces'
    and exists (
      select 1 from tongs.brand_asset_revisions revision
      where revision.storage_bucket = objects.bucket_id
        and revision.storage_key = objects.name
        and revision.state = 'pending'
        and revision.created_by = auth.uid()
        and tongs.has_workspace_role(revision.workspace_id, 'editor')
    )
  );
create policy brand_asset_objects_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'forge-workpieces'
    and exists (
      select 1 from tongs.brand_asset_revisions revision
      where revision.storage_bucket = objects.bucket_id
        and revision.storage_key = objects.name
        and tongs.has_workspace_role(revision.workspace_id, 'viewer')
    )
  );
create policy forge_workpieces_stt_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'forge-workpieces'
    and name like 'workpieces/%/stt/%'
    and tongs.can_access_workpiece(split_part(name, '/', 2)::uuid)
  );
create policy forge_workpieces_stt_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'forge-workpieces'
    and name like 'workpieces/%/stt/%'
    and tongs.can_access_workpiece(split_part(name, '/', 2)::uuid)
  );
create policy forge_workpieces_stt_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'forge-workpieces'
    and name like 'workpieces/%/stt/%'
    and tongs.can_access_workpiece(split_part(name, '/', 2)::uuid)
  )
  with check (
    bucket_id = 'forge-workpieces'
    and name like 'workpieces/%/stt/%'
    and tongs.can_access_workpiece(split_part(name, '/', 2)::uuid)
  );
create policy stt_upload_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'forge-workpieces'
    and name like 'workpieces/%/stt/%'
    and tongs.can_access_workpiece(split_part(name, '/', 2)::uuid)
  );

-- pg_dump intentionally omits triggers on platform-managed relations and event triggers.
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- The only approved baseline application records are three global Quench destination
-- scopes and their four immutable capability revisions. Timestamps are deterministic
-- source-migration instants, not copied production values.
insert into tongs.quench_destination_scopes(
  id, workspace_id, scope_key, platform, adapter_id, execution_context,
  connection_ref, state, current_capability_revision_id, created_at, created_by
) values
  ('81000000-0000-4000-8000-000000000001', null, 'system:youtube:intent-only',
   'youtube', 'forge.youtube', 'intent_only', null, 'active', null,
   timestamptz '2026-07-18 16:00:00+00', null),
  ('81000000-0000-4000-8000-000000000002', null, 'system:podcast-host:intent-only',
   'podcast_host', 'forge.transistor', 'intent_only', null, 'active', null,
   timestamptz '2026-07-18 16:00:00+00', null),
  ('81000000-0000-4000-8000-000000000003', null, 'system:rumble:manual-handoff',
   'rumble', 'forge.rumble.manual', 'manual_handoff', null, 'active', null,
   timestamptz '2026-09-04 15:00:00+00', null);

insert into tongs.quench_destination_capability_revisions(
  id, destination_scope_id, revision, contract_version, capabilities_json,
  content_hash, adapter_version, effective_at, created_at, created_by
) values
  ('82000000-0000-4000-8000-000000000001',
   '81000000-0000-4000-8000-000000000001', 1,
   'forge.quench-destination-capabilities.v1',
   '{"supports_experiment_intent":true,"supports_thumbnail_selection":true,"supports_thumbnail_rotation":false,"supports_schedule":true,"supports_premiere":true,"supports_video":true,"supports_audio_only":false}'::jsonb,
   '118f69cf914db6006c871c17f918f4a4d90de6a537f6c5aba657cb10de69b261',
   'stub-v1', timestamptz '2026-07-18 16:00:00+00',
   timestamptz '2026-07-18 16:00:00+00', null),
  ('82000000-0000-4000-8000-000000000002',
   '81000000-0000-4000-8000-000000000002', 1,
   'forge.quench-destination-capabilities.v1',
   '{"supports_experiment_intent":true,"supports_thumbnail_selection":true,"supports_thumbnail_rotation":false,"supports_schedule":true,"supports_premiere":false,"supports_video":false,"supports_audio_only":true}'::jsonb,
   '6e990e4f264d95641fc1272c3598453e555d617498c09a297e6865f656c3efff',
   'stub-v1', timestamptz '2026-07-18 16:00:00+00',
   timestamptz '2026-07-18 16:00:00+00', null),
  ('82000000-0000-4000-8000-000000000003',
   '81000000-0000-4000-8000-000000000002', 2,
   'forge.quench-destination-capabilities.v1',
   '{"provider":"transistor","audio_upload":true,"episode_draft_create":true,"episode_publish":true,"episode_schedule":true,"supports_experiment_intent":false,"supports_thumbnail_selection":false,"supports_thumbnail_rotation":false,"supports_schedule":true,"supports_premiere":false,"supports_video":false,"supports_audio_only":true,"host_owns_rss":true,"host_owns_directory_distribution":true,"forge_rss_hosting":false,"direct_spotify_upload":false,"idempotent_episode_create":false}'::jsonb,
   'a024a5df42d0208d0d937af74e4af1b09c1a6f32c4f84a6f3130834f25a6f7d6',
   '1.0.0', timestamptz '2026-09-04 13:00:00+00',
   timestamptz '2026-09-04 13:00:00+00', null),
  ('82000000-0000-4000-8000-000000000004',
   '81000000-0000-4000-8000-000000000003', 1,
   'forge.quench-manual-destination-capabilities.v1',
   '{"provider":"rumble","release_profiles":["video_episode"],"manual_video_upload":true,"manual_metadata_entry":true,"manual_thumbnail_upload":true,"manual_visibility_selection":true,"manual_schedule_intent":true,"creator_decides_channel":true,"creator_decides_licensing":true,"creator_decides_monetization":true,"creator_decides_syndication":true,"creator_decides_premiere":true,"api_authentication":false,"api_video_upload":false,"api_status_read":false,"api_delete":false,"idempotent_create":false,"safe_automatic_retry":false,"allowed_result_hosts":["rumble.com","www.rumble.com"]}'::jsonb,
   'e510a87bd6a3f8d077dceccaf9a67154a5b62fef73a902d4c95c93c12ae449cb',
   '1.0.0', timestamptz '2026-09-04 15:00:00+00',
   timestamptz '2026-09-04 15:00:00+00', null);

update tongs.quench_destination_scopes
set current_capability_revision_id = case id
  when '81000000-0000-4000-8000-000000000001'::uuid then '82000000-0000-4000-8000-000000000001'::uuid
  when '81000000-0000-4000-8000-000000000002'::uuid then '82000000-0000-4000-8000-000000000003'::uuid
  when '81000000-0000-4000-8000-000000000003'::uuid then '82000000-0000-4000-8000-000000000004'::uuid
end;

create schema forge_meta;
alter schema forge_meta owner to postgres;
revoke all on schema forge_meta from public, anon, authenticated, service_role;

create table forge_meta.database_lineage(
  singleton boolean primary key default true check(singleton),
  lineage text not null check(lineage in ('baseline-v1','historical-v1')),
  baseline_contract_sha256 text not null check(baseline_contract_sha256 ~ '^[a-f0-9]{64}$'),
  historical_manifest_sha256 text not null check(historical_manifest_sha256 ~ '^[a-f0-9]{64}$'),
  baseline_start_version text not null,
  baseline_end_version text not null,
  shared_tail_minimum_version text not null,
  installed_at timestamptz not null default transaction_timestamp()
);
alter table forge_meta.database_lineage owner to postgres;
alter table forge_meta.database_lineage enable row level security;
alter table forge_meta.database_lineage force row level security;
revoke all on table forge_meta.database_lineage from public, anon, authenticated, service_role;
insert into forge_meta.database_lineage(
  singleton, lineage, baseline_contract_sha256, historical_manifest_sha256,
  baseline_start_version, baseline_end_version, shared_tail_minimum_version
) values (
  true, 'baseline-v1',
  '817f42cfe0f57d2961b52a72b58a5273c3cc1e2bf306e3a527e6bc58bdbcbfbe',
  '66a094037af456e95b34ec0ca3fb18bcc791d296fa6c2619af9639a87f7d7f40',
  '20261021000000', '20261021235959', '20261022000000'
);

do $baseline_assertions$
declare
  r record;
  row_count bigint;
  unexpected_extensions text[];
begin
  if (select count(*) from tongs.quench_destination_scopes) <> 3 then
    raise exception 'Baseline must contain exactly three Quench destination scopes';
  end if;
  if (select count(*) from tongs.quench_destination_capability_revisions) <> 4 then
    raise exception 'Baseline must contain exactly four Quench capability revisions';
  end if;
  if exists (
    select 1 from tongs.quench_destination_scopes
    where workspace_id is not null or connection_ref is not null or created_by is not null
  ) then
    raise exception 'Baseline Quench scopes contain environment or customer state';
  end if;
  if exists (
    select 1 from tongs.quench_destination_capability_revisions cap
    where cap.created_by is not null
       or cap.content_hash <> encode(extensions.digest(convert_to(cap.capabilities_json::text,'UTF8'),'sha256'),'hex')
  ) then
    raise exception 'Baseline Quench capability contract is invalid';
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
      raise exception 'Unexpected baseline rows in %.%: %',r.schema_name,r.table_name,row_count;
    end if;
  end loop;

  select array_agg(extname order by extname) into unexpected_extensions
  from pg_extension
  where extname not in (
    'hypopg','index_advisor','pg_stat_statements','pgcrypto',
    'plpgsql','supabase_vault','uuid-ossp','wrappers'
  );
  if unexpected_extensions is not null then
    raise exception 'Unexpected baseline extensions: %',unexpected_extensions;
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
    raise exception 'Required baseline extension or version is missing';
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
$baseline_assertions$;

create event trigger ensure_rls
  on ddl_command_end
  when tag in ('CREATE TABLE','CREATE TABLE AS','SELECT INTO')
  execute function public.rls_auto_enable();

commit;
'@

$content = $header + $schemaSql.Trim() + $footer
[IO.File]::WriteAllText($output, $content, [Text.UTF8Encoding]::new($false))
$outputHash = (Get-FileHash -LiteralPath $output -Algorithm SHA256).Hash.ToLowerInvariant()

[pscustomobject]@{
  ok = $true
  cliVersion = $actualCliVersion
  schemaDumpSha256 = $actualDumpSha256
  expectedContractSha256 = $expectedContractSha256
  expectedManifestSha256 = $expectedManifestSha256
  output = $output
  outputSha256 = $outputHash
} | ConvertTo-Json -Compress
