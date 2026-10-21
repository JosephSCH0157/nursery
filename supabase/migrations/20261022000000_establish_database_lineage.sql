-- First shared-tail migration for both approved Forge database lineages.
-- It creates no application object and changes no application behavior.
begin;

do $lineage_transition$
declare
  migration_count integer;
  migration_digest text;
  marker_relation regclass := to_regclass('forge_meta.database_lineage');
  marker_lineage text;
  actual_columns text[];
  expected_historical_digest constant text := '0a0d3b1a5d9aac85955f940e7b433ca5353e4ffc4f3dad70ac83f518421b3ef1';
  expected_historical_with_tail_digest constant text := 'f1e60385444f8241916fb9da23467b0f1ef10722f9cc2c494821da1493c83afe';
  expected_baseline_digest constant text := '85062ab83aadda84b54f28dba250cc4dd4f5a5498281d44ca31ea24725b325cd';
  expected_baseline_with_tail_digest constant text := '7e5c013e4db03cbcd3d8419d8773fa6db73ba4ea8fd257839304f908a815c07f';
begin
  select count(*)::integer,
         encode(extensions.digest(
           convert_to(string_agg(version, E'\n' order by version), 'UTF8'),
           'sha256'
         ), 'hex')
    into migration_count, migration_digest
  from supabase_migrations.schema_migrations;

  if marker_relation is null then
    if to_regnamespace('forge_meta') is not null then
      raise exception 'Ambiguous database lineage: forge_meta exists without the canonical marker';
    end if;
    if migration_count <> 414 or migration_digest <> expected_historical_digest then
      raise exception 'Historical lineage qualification failed: expected the exact 414-version manifest';
    end if;

    execute 'create schema forge_meta authorization postgres';
    execute 'revoke all on schema forge_meta from public, anon, authenticated, service_role';
    execute $ddl$
      create table forge_meta.database_lineage(
        singleton boolean primary key default true check(singleton),
        lineage text not null check(lineage in ('baseline-v1','historical-v1')),
        baseline_contract_sha256 text not null check(baseline_contract_sha256 ~ '^[a-f0-9]{64}$'),
        historical_manifest_sha256 text not null check(historical_manifest_sha256 ~ '^[a-f0-9]{64}$'),
        baseline_start_version text not null,
        baseline_end_version text not null,
        shared_tail_minimum_version text not null,
        installed_at timestamptz not null default transaction_timestamp()
      )
    $ddl$;
    execute 'alter table forge_meta.database_lineage owner to postgres';
    execute 'alter table forge_meta.database_lineage enable row level security';
    execute 'alter table forge_meta.database_lineage force row level security';
    execute 'revoke all on table forge_meta.database_lineage from public, anon, authenticated, service_role';
    execute $insert$
      insert into forge_meta.database_lineage(
        singleton, lineage, baseline_contract_sha256, historical_manifest_sha256,
        baseline_start_version, baseline_end_version, shared_tail_minimum_version
      ) values (
        true, 'historical-v1',
        '817f42cfe0f57d2961b52a72b58a5273c3cc1e2bf306e3a527e6bc58bdbcbfbe',
        '66a094037af456e95b34ec0ca3fb18bcc791d296fa6c2619af9639a87f7d7f40',
        '20261021000000', '20261021235959', '20261022000000'
      )
    $insert$;
    marker_relation := 'forge_meta.database_lineage'::regclass;
  else
    select lineage into marker_lineage
    from forge_meta.database_lineage
    where singleton = true;

    if marker_lineage = 'baseline-v1' then
      if not (
        (migration_count = 1 and migration_digest = expected_baseline_digest) or
        (migration_count = 2 and migration_digest = expected_baseline_with_tail_digest)
      ) then
        raise exception 'Baseline lineage history is incomplete or ambiguous';
      end if;
    elsif marker_lineage = 'historical-v1' then
      if not (
        (migration_count = 414 and migration_digest = expected_historical_digest) or
        (migration_count = 415 and migration_digest = expected_historical_with_tail_digest)
      ) then
        raise exception 'Historical lineage history is incomplete or ambiguous';
      end if;
    else
      raise exception 'Unknown or missing database lineage marker';
    end if;
  end if;

  select array_agg(column_name || ':' || data_type order by ordinal_position)
    into actual_columns
  from information_schema.columns
  where table_schema = 'forge_meta' and table_name = 'database_lineage';

  if actual_columns <> array[
    'singleton:boolean',
    'lineage:text',
    'baseline_contract_sha256:text',
    'historical_manifest_sha256:text',
    'baseline_start_version:text',
    'baseline_end_version:text',
    'shared_tail_minimum_version:text',
    'installed_at:timestamp with time zone'
  ]::text[] then
    raise exception 'Database lineage marker has an incompatible structure';
  end if;

  if not exists (
    select 1
    from pg_class c
    where c.oid = marker_relation
      and c.relkind = 'r'
      and c.relowner = 'postgres'::regrole
      and c.relrowsecurity
      and c.relforcerowsecurity
  ) then
    raise exception 'Database lineage marker ownership or RLS contract is incompatible';
  end if;

  if has_schema_privilege('anon', 'forge_meta', 'usage')
     or has_schema_privilege('authenticated', 'forge_meta', 'usage')
     or has_schema_privilege('service_role', 'forge_meta', 'usage')
     or has_table_privilege('anon', marker_relation, 'select')
     or has_table_privilege('authenticated', marker_relation, 'select')
     or has_table_privilege('service_role', marker_relation, 'select') then
    raise exception 'Database lineage marker is exposed to an application role';
  end if;

  if (select count(*) from forge_meta.database_lineage) <> 1 or not exists (
    select 1
    from forge_meta.database_lineage
    where singleton
      and lineage in ('baseline-v1','historical-v1')
      and baseline_contract_sha256 = '817f42cfe0f57d2961b52a72b58a5273c3cc1e2bf306e3a527e6bc58bdbcbfbe'
      and historical_manifest_sha256 = '66a094037af456e95b34ec0ca3fb18bcc791d296fa6c2619af9639a87f7d7f40'
      and baseline_start_version = '20261021000000'
      and baseline_end_version = '20261021235959'
      and shared_tail_minimum_version = '20261022000000'
  ) then
    raise exception 'Database lineage marker metadata is incompatible';
  end if;
end
$lineage_transition$;

commit;
