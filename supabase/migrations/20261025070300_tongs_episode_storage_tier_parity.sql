begin;

do $preflight$
declare
  column_row record;
  column_name text;
  constraint_definition text;
begin
  if to_regclass('tongs.episodes') is null then
    raise exception 'tongs.episodes is required before storage-tier reconciliation';
  end if;

  select a.atttypid::regtype::text as type_name,
         a.attnotnull as not_null,
         pg_get_expr(d.adbin, d.adrelid, true) as default_expression
    into column_row
    from pg_attribute a
    left join pg_attrdef d
      on d.adrelid = a.attrelid and d.adnum = a.attnum
   where a.attrelid = 'tongs.episodes'::regclass
     and a.attname = 'lifecycle_state'
     and a.attnum > 0
     and not a.attisdropped;

  if not found
     or column_row.type_name <> 'text'
     or not column_row.not_null
     or column_row.default_expression <> '''active''::text' then
    raise exception 'tongs.episodes.lifecycle_state differs from the approved deletion-lifecycle predecessor';
  end if;

  foreach column_name in array array['deleted_at','detached_at'] loop
    if not exists (
      select 1 from pg_attribute a
       where a.attrelid = 'tongs.episodes'::regclass
         and a.attname = column_name
         and a.atttypid = 'timestamptz'::regtype
         and not a.attnotnull
         and a.attnum > 0
         and not a.attisdropped
    ) then
      raise exception 'tongs.episodes.% differs from the approved deletion-lifecycle predecessor', column_name;
    end if;
  end loop;

  if not exists (
    select 1 from pg_attribute a
     where a.attrelid = 'tongs.episodes'::regclass
       and a.attname = 'deleted_by'
       and a.atttypid = 'uuid'::regtype
       and not a.attnotnull
       and a.attnum > 0
       and not a.attisdropped
  ) then
    raise exception 'tongs.episodes.deleted_by differs from the approved deletion-lifecycle predecessor';
  end if;

  select pg_get_constraintdef(c.oid, true)
    into constraint_definition
    from pg_constraint c
   where c.conrelid = 'tongs.episodes'::regclass
     and c.conname = 'episodes_lifecycle_state_check';
  if constraint_definition is distinct from
       'CHECK (lifecycle_state = ANY (ARRAY[''active''::text, ''archived''::text, ''published_detached''::text, ''deleted''::text]))' then
    raise exception 'tongs.episodes lifecycle constraint differs from the approved predecessor: %', constraint_definition;
  end if;

  if to_regclass('tongs.episode_performance_retention') is null
     or to_regclass('tongs.episode_deletion_audit') is null
     or to_regclass('tongs.episodes_workspace_lifecycle_updated_idx') is null then
    raise exception 'the approved episode deletion-lifecycle dependencies are incomplete';
  end if;

  if exists (
    select 1 from pg_attribute a
     where a.attrelid = 'tongs.episodes'::regclass
       and a.attname = 'storage_tier'
       and a.attnum > 0
       and not a.attisdropped
  ) then
    select a.atttypid::regtype::text as type_name,
           a.attnotnull as not_null,
           pg_get_expr(d.adbin, d.adrelid, true) as default_expression
      into column_row
      from pg_attribute a
      left join pg_attrdef d
        on d.adrelid = a.attrelid and d.adnum = a.attnum
     where a.attrelid = 'tongs.episodes'::regclass
       and a.attname = 'storage_tier'
       and a.attnum > 0
       and not a.attisdropped;
    if column_row.type_name <> 'text'
       or not column_row.not_null
       or column_row.default_expression <> '''hot''::text' then
      raise exception 'existing tongs.episodes.storage_tier is incompatible with the approved contract';
    end if;
    if exists (select 1 from tongs.episodes where storage_tier not in ('hot','cold')) then
      raise exception 'existing tongs.episodes.storage_tier contains an unapproved classification';
    end if;
  end if;

  select pg_get_constraintdef(c.oid, true)
    into constraint_definition
    from pg_constraint c
   where c.conrelid = 'tongs.episodes'::regclass
     and c.conname = 'episodes_storage_tier_check';
  if found and constraint_definition is distinct from
       'CHECK (storage_tier = ANY (ARRAY[''hot''::text, ''cold''::text]))' then
    raise exception 'existing storage-tier constraint is incompatible: %', constraint_definition;
  end if;
end
$preflight$;

alter table tongs.episodes
  add column if not exists storage_tier text not null default 'hot';

do $constraint$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'tongs.episodes'::regclass
       and conname = 'episodes_storage_tier_check'
  ) then
    alter table tongs.episodes
      add constraint episodes_storage_tier_check
      check (storage_tier in ('hot', 'cold'));
  end if;
end
$constraint$;

do $postcondition$
declare
  column_contract jsonb;
  constraint_definition text;
begin
  select jsonb_build_object(
           'type', a.atttypid::regtype::text,
           'notNull', a.attnotnull,
           'default', pg_get_expr(d.adbin, d.adrelid, true)
         )
    into column_contract
    from pg_attribute a
    left join pg_attrdef d
      on d.adrelid = a.attrelid and d.adnum = a.attnum
   where a.attrelid = 'tongs.episodes'::regclass
     and a.attname = 'storage_tier'
     and a.attnum > 0
     and not a.attisdropped;
  if column_contract is distinct from
       '{"type":"text","notNull":true,"default":"''hot''::text"}'::jsonb then
    raise exception 'storage-tier column postcondition failed: %', column_contract;
  end if;

  select pg_get_constraintdef(c.oid, true)
    into constraint_definition
    from pg_constraint c
   where c.conrelid = 'tongs.episodes'::regclass
     and c.conname = 'episodes_storage_tier_check'
     and c.convalidated;
  if constraint_definition is distinct from
       'CHECK (storage_tier = ANY (ARRAY[''hot''::text, ''cold''::text]))' then
    raise exception 'storage-tier constraint postcondition failed: %', constraint_definition;
  end if;
end
$postcondition$;

commit;
