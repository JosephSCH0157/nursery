\set ON_ERROR_STOP on

begin;

create or replace function pg_temp.assert_true(p_condition boolean, p_message text)
returns void language plpgsql as $$
begin
  if not coalesce(p_condition, false) then
    raise exception 'Gate 6O episode storage-tier assertion failed: %', p_message;
  end if;
end
$$;

select pg_temp.assert_true(
  case (select lineage from forge_meta.database_lineage where singleton)
    when 'baseline-v1' then
      (select array_agg(version order by version) = array[
        '20261021020814','20261022000000','20261024164519','20261025070300'
      ]::text[] from supabase_migrations.schema_migrations)
    when 'historical-v1' then
      (select count(*) = 417 from supabase_migrations.schema_migrations)
      and (select array_agg(version order by version) filter (where version >= '20261020171517') = array[
        '20261020171517','20261020171519','20261020171522',
        '20261022000000','20261024164519','20261025070300'
      ]::text[] from supabase_migrations.schema_migrations)
    else false
  end,
  'database lineage or migration chronology differs from the Gate 6O successor contract'
);

select pg_temp.assert_true(
  (select jsonb_build_object(
      'type', a.atttypid::regtype::text,
      'notNull', a.attnotnull,
      'default', pg_get_expr(d.adbin, d.adrelid, true)
    ) = '{"type":"text","notNull":true,"default":"''hot''::text"}'::jsonb
   from pg_attribute a
   left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
   where a.attrelid = 'tongs.episodes'::regclass
     and a.attname = 'storage_tier' and a.attnum > 0 and not a.attisdropped),
  'storage_tier must be text not null default hot'
);

select pg_temp.assert_true(
  (select pg_get_constraintdef(c.oid, true) =
      'CHECK (storage_tier = ANY (ARRAY[''hot''::text, ''cold''::text]))'
     and c.convalidated
   from pg_constraint c
   where c.conrelid = 'tongs.episodes'::regclass
     and c.conname = 'episodes_storage_tier_check'),
  'storage_tier must accept only hot and cold'
);

select pg_temp.assert_true(
  (select jsonb_object_agg(a.attname, jsonb_build_object(
      'type', a.atttypid::regtype::text,
      'notNull', a.attnotnull,
      'default', pg_get_expr(d.adbin, d.adrelid, true)
    ) order by a.attname) = '{
      "deleted_at":{"type":"timestamp with time zone","notNull":false,"default":null},
      "deleted_by":{"type":"uuid","notNull":false,"default":null},
      "detached_at":{"type":"timestamp with time zone","notNull":false,"default":null},
      "lifecycle_state":{"type":"text","notNull":true,"default":"''active''::text"},
      "storage_tier":{"type":"text","notNull":true,"default":"''hot''::text"}
    }'::jsonb
   from pg_attribute a
   left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
   where a.attrelid = 'tongs.episodes'::regclass
     and a.attname in ('lifecycle_state','storage_tier','deleted_at','deleted_by','detached_at')
     and a.attnum > 0 and not a.attisdropped),
  'episode deletion-lifecycle columns differ from the historical contract'
);

select pg_temp.assert_true(
  (select pg_get_constraintdef(c.oid, true) =
      'CHECK (lifecycle_state = ANY (ARRAY[''active''::text, ''archived''::text, ''published_detached''::text, ''deleted''::text]))'
     and c.convalidated
   from pg_constraint c
   where c.conrelid = 'tongs.episodes'::regclass
     and c.conname = 'episodes_lifecycle_state_check'),
  'episode lifecycle-state constraint differs from the historical contract'
);

select pg_temp.assert_true(
  to_regclass('tongs.episodes_workspace_lifecycle_updated_idx') is not null
  and to_regclass('tongs.episode_performance_retention') is not null
  and to_regclass('tongs.episode_deletion_audit') is not null,
  'related episode deletion-lifecycle objects are missing'
);

select pg_temp.assert_true(
  (select count(*) = 1 from pg_constraint
   where conrelid = 'tongs.episodes'::regclass
     and conname = 'episodes_deleted_by_fkey'
     and confrelid = 'auth.users'::regclass)
  and (select count(*) = 4 from pg_constraint
       where conname in (
         'episode_performance_retention_deletion_mode_check',
         'episode_performance_retention_platform_records_array_check',
         'episode_deletion_audit_deletion_mode_check',
         'episode_deletion_audit_warnings_array_check'
       )
       and convalidated),
  'related deletion-lifecycle foreign key or constraints are missing'
);

select pg_temp.assert_true(
  (select relrowsecurity from pg_class where oid = 'tongs.episode_performance_retention'::regclass)
  and (select relrowsecurity from pg_class where oid = 'tongs.episode_deletion_audit'::regclass)
  and (select count(*) = 2 from pg_policy
       where polrelid in (
         'tongs.episode_performance_retention'::regclass,
         'tongs.episode_deletion_audit'::regclass)
       and polname in (
         'episode_performance_retention_service_role_all',
         'episode_deletion_audit_service_role_all')),
  'related deletion-lifecycle RLS contract changed'
);

insert into auth.users (
  id, aud, role, email, encrypted_password, raw_app_meta_data,
  raw_user_meta_data, created_at, updated_at
) values (
  '6e100000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
  'gate6o-storage-tier@example.invalid', '',
  '{"provider":"email","providers":["email"]}', '{}', now(), now()
);

insert into tongs.episodes (workspace_id, label)
select workspace_id, 'Gate 6O default probe'
from tongs.workspace_members
where user_id = '6e100000-0000-4000-8000-000000000001'
order by created_at
limit 1;

select pg_temp.assert_true(
  (select storage_tier = 'hot'
    from tongs.episodes where label = 'Gate 6O default probe' limit 1),
  'new episodes do not default to hot storage'
);

do $reject_invalid_tier$
begin
  begin
    update tongs.episodes
       set storage_tier = 'warm'
     where label = 'Gate 6O default probe';
    raise exception 'invalid storage tier unexpectedly accepted';
  exception
    when check_violation then null;
  end;
end
$reject_invalid_tier$;

rollback;

select 'FORGE_GATE6O_EPISODE_STORAGE_TIER_CONTRACT_PASSED' as result;
