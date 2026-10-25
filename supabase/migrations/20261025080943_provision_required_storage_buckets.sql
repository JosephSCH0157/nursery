begin;

-- The canonical B1 schema intentionally carries the application Storage
-- policies, but its structural-only dump omitted the deterministic bucket
-- rows those policies protect.  Recreate only the two source-controlled
-- infrastructure records established by historical migrations.  Existing
-- rows are never updated: incompatible configuration fails closed.

do $$
declare
  v_missing_policies text[];
begin
  if to_regclass('storage.buckets') is null
     or to_regclass('storage.objects') is null then
    raise exception 'Supabase Storage prerequisites are missing';
  end if;

  if not exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'storage'
      and c.relname = 'objects'
      and c.relrowsecurity
  ) then
    raise exception 'storage.objects RLS must be enabled before bucket provisioning';
  end if;

  select array_agg(required.policy_name order by required.policy_name)
    into v_missing_policies
  from (
    values
      ('bellows_capture_operator_insert', 'INSERT'),
      ('bellows_capture_operator_read', 'SELECT'),
      ('brand_asset_objects_insert', 'INSERT'),
      ('brand_asset_objects_select', 'SELECT'),
      ('forge_workpieces_stt_insert', 'INSERT'),
      ('forge_workpieces_stt_select', 'SELECT'),
      ('forge_workpieces_stt_update', 'UPDATE'),
      ('stt_upload_select', 'SELECT')
  ) as required(policy_name, command)
  where not exists (
    select 1
    from pg_policies policy
    where policy.schemaname = 'storage'
      and policy.tablename = 'objects'
      and policy.policyname = required.policy_name
      and policy.cmd = required.command
      and policy.roles = array['authenticated']::name[]
  );

  if v_missing_policies is not null then
    raise exception 'Required Storage policies are missing or incompatible: %',
      array_to_string(v_missing_policies, ', ');
  end if;

  if exists (
    select 1
    from storage.buckets
    where id = 'forge-workpieces'
      and (
        name is distinct from 'forge-workpieces'
        or public is distinct from false
        or avif_autodetection is distinct from false
        or file_size_limit is distinct from 524288000::bigint
        or allowed_mime_types is not null
        or type::text is distinct from 'STANDARD'
      )
  ) then
    raise exception 'forge-workpieces bucket configuration is incompatible';
  end if;

  if exists (
    select 1
    from storage.buckets
    where id = 'bellows-capture'
      and (
        name is distinct from 'bellows-capture'
        or public is distinct from false
        or avif_autodetection is distinct from false
        or file_size_limit is distinct from 1073741824::bigint
        or allowed_mime_types is distinct from array[
          'video/webm',
          'video/mp4',
          'audio/webm',
          'application/octet-stream'
        ]::text[]
        or type::text is distinct from 'STANDARD'
      )
  ) then
    raise exception 'bellows-capture bucket configuration is incompatible';
  end if;
end
$$;

insert into storage.buckets (
  id,
  name,
  public,
  avif_autodetection,
  file_size_limit,
  allowed_mime_types,
  type
)
values (
  'forge-workpieces',
  'forge-workpieces',
  false,
  false,
  524288000,
  null,
  'STANDARD'
)
on conflict (id) do nothing;

insert into storage.buckets (
  id,
  name,
  public,
  avif_autodetection,
  file_size_limit,
  allowed_mime_types,
  type
)
values (
  'bellows-capture',
  'bellows-capture',
  false,
  false,
  1073741824,
  array[
    'video/webm',
    'video/mp4',
    'audio/webm',
    'application/octet-stream'
  ]::text[],
  'STANDARD'
)
on conflict (id) do nothing;

do $$
begin
  if not exists (
    select 1
    from storage.buckets
    where id = 'forge-workpieces'
      and name = 'forge-workpieces'
      and public is false
      and avif_autodetection is false
      and file_size_limit = 524288000
      and allowed_mime_types is null
      and type::text = 'STANDARD'
  ) then
    raise exception 'forge-workpieces bucket provisioning postcondition failed';
  end if;

  if not exists (
    select 1
    from storage.buckets
    where id = 'bellows-capture'
      and name = 'bellows-capture'
      and public is false
      and avif_autodetection is false
      and file_size_limit = 1073741824
      and allowed_mime_types = array[
        'video/webm',
        'video/mp4',
        'audio/webm',
        'application/octet-stream'
      ]::text[]
      and type::text = 'STANDARD'
  ) then
    raise exception 'bellows-capture bucket provisioning postcondition failed';
  end if;
end
$$;

commit;
