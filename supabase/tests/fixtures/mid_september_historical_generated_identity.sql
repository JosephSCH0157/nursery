-- LOCAL CERTIFICATION FIXTURE ONLY. Never place this file under
-- supabase/migrations and never execute it against a linked database.
--
-- 20260916110806 generated its Luna revision-2 UUID with gen_random_uuid().
-- 20260916113132 then referred to the value generated in production by its
-- literal UUID. A clean replay therefore has to reproduce that historical RNG
-- result between those two exact migrations.

begin;

do $$
declare
  v_generated_id uuid;
  v_reference record;
  v_old_reference_exists boolean;
begin
  if current_setting('forge.local_historical_replay', true)
       is distinct from 'mid-september-v1' then
    raise exception 'local historical replay guard is missing' using errcode='42501';
  end if;
  if not exists (
    select 1 from supabase_migrations.schema_migrations
    where version='20260916110806'
  ) or exists (
    select 1 from supabase_migrations.schema_migrations
    where version='20260916113132'
  ) then
    raise exception 'historical generated-identity fixture requires the exact inter-migration boundary'
      using errcode='P0001';
  end if;

  select revision.id
  into strict v_generated_id
  from tongs.private_pricing_revisions revision
  where revision.policy_id='e5e0914a-8466-42dd-bc14-b576f2aaf54f'
    and revision.revision=2
    and revision.previous_revision_id='66a74166-02b8-49ea-8d6c-a27984011a41'
    and revision.full_cost_ceiling_micros=11015
    and revision.settled_customer_price_micros=15000;

  if v_generated_id='309b5ec9-c486-4693-a209-9cf29f586f8e' then
    return;
  end if;
  if exists (
    select 1 from tongs.private_pricing_revisions
    where id='309b5ec9-c486-4693-a209-9cf29f586f8e'
  ) then
    raise exception 'historical Luna revision-2 identity is already occupied'
      using errcode='23505';
  end if;

  -- Foreign keys cannot all be updated in dependency order because the table
  -- self-references. Disable trigger enforcement only inside this local-only
  -- transaction, update every live single-column reference discovered from the
  -- catalog, then verify that the old identity is unreachable.
  set local session_replication_role = replica;
  update tongs.private_pricing_revisions
  set id='309b5ec9-c486-4693-a209-9cf29f586f8e'
  where id=v_generated_id;

  for v_reference in
    select child_ns.nspname as schema_name,
           child.relname as table_name,
           child_column.attname as column_name
    from pg_constraint constraint_row
    join pg_class child on child.oid=constraint_row.conrelid
    join pg_namespace child_ns on child_ns.oid=child.relnamespace
    join pg_attribute child_column
      on child_column.attrelid=constraint_row.conrelid
     and child_column.attnum=constraint_row.conkey[1]
    where constraint_row.contype='f'
      and constraint_row.confrelid='tongs.private_pricing_revisions'::regclass
      and array_length(constraint_row.conkey,1)=1
      and array_length(constraint_row.confkey,1)=1
      and constraint_row.confkey[1]=(
        select attnum from pg_attribute
        where attrelid='tongs.private_pricing_revisions'::regclass
          and attname='id'
      )
  loop
    execute format(
      'update %I.%I set %I=$1 where %I=$2',
      v_reference.schema_name,
      v_reference.table_name,
      v_reference.column_name,
      v_reference.column_name
    ) using '309b5ec9-c486-4693-a209-9cf29f586f8e'::uuid, v_generated_id;
  end loop;
  set local session_replication_role = origin;

  for v_reference in
    select child_ns.nspname as schema_name,
           child.relname as table_name,
           child_column.attname as column_name
    from pg_constraint constraint_row
    join pg_class child on child.oid=constraint_row.conrelid
    join pg_namespace child_ns on child_ns.oid=child.relnamespace
    join pg_attribute child_column
      on child_column.attrelid=constraint_row.conrelid
     and child_column.attnum=constraint_row.conkey[1]
    where constraint_row.contype='f'
      and constraint_row.confrelid='tongs.private_pricing_revisions'::regclass
      and array_length(constraint_row.conkey,1)=1
      and array_length(constraint_row.confkey,1)=1
  loop
    execute format(
      'select exists(select 1 from %I.%I where %I=$1)',
      v_reference.schema_name,
      v_reference.table_name,
      v_reference.column_name
    ) into v_old_reference_exists using v_generated_id;
    if v_old_reference_exists then
      raise exception 'historical generated identity remains referenced by %.%',
        v_reference.schema_name, v_reference.table_name;
    end if;
  end loop;
end $$;

commit;
