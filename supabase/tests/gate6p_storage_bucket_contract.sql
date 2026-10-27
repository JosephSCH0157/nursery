\set ON_ERROR_STOP on

begin;

create or replace function pg_temp.assert_true(p_condition boolean, p_message text)
returns void language plpgsql as $$
begin
  if not coalesce(p_condition, false) then
    raise exception 'Gate 6P Storage assertion failed: %', p_message;
  end if;
end
$$;

select pg_temp.assert_true(
  case (select lineage from forge_meta.database_lineage where singleton)
    when 'baseline-v1' then
      (select (array_agg(version order by version))[1:5] = array[
        '20261021020814','20261022000000','20261024164519',
        '20261025070300','20261025080943'
      ]::text[] from supabase_migrations.schema_migrations)
    when 'historical-v1' then
      (select count(*) >= 418 from supabase_migrations.schema_migrations)
      and (select (array_agg(version order by version) filter (where version >= '20261020171517'))[1:7] = array[
        '20261020171517','20261020171519','20261020171522',
        '20261022000000','20261024164519','20261025070300','20261025080943'
      ]::text[] from supabase_migrations.schema_migrations)
    else false
  end,
  'database lineage or migration chronology differs from the Gate 6P successor contract'
);

select pg_temp.assert_true(
  (select jsonb_agg(jsonb_build_object(
      'id', id,
      'name', name,
      'public', public,
      'avifAutodetection', avif_autodetection,
      'fileSizeLimit', file_size_limit,
      'allowedMimeTypes', allowed_mime_types,
      'type', type::text
    ) order by id) = '[
      {"id":"bellows-capture","name":"bellows-capture","public":false,
       "avifAutodetection":false,"fileSizeLimit":1073741824,
       "allowedMimeTypes":["video/webm","video/mp4","audio/webm","application/octet-stream"],
       "type":"STANDARD"},
      {"id":"forge-workpieces","name":"forge-workpieces","public":false,
       "avifAutodetection":false,"fileSizeLimit":524288000,
       "allowedMimeTypes":null,"type":"STANDARD"}
    ]'::jsonb
   from storage.buckets
   where id in ('forge-workpieces', 'bellows-capture')),
  'required Storage bucket records or configuration differ from historical authority'
);

select pg_temp.assert_true(
  (select relrowsecurity from pg_class where oid = 'storage.objects'::regclass),
  'storage.objects RLS is disabled'
);

select pg_temp.assert_true(
  (select count(*) = 8
   from pg_policies
   where schemaname = 'storage'
     and tablename = 'objects'
     and policyname in (
       'bellows_capture_operator_insert', 'bellows_capture_operator_read',
       'brand_asset_objects_insert', 'brand_asset_objects_select',
       'forge_workpieces_stt_insert', 'forge_workpieces_stt_select',
       'forge_workpieces_stt_update', 'stt_upload_select'
     )
     and roles = array['authenticated']::name[]),
  'required authenticated Storage policies are missing or have broader roles'
);

insert into auth.users (
  id, aud, role, email, encrypted_password, raw_app_meta_data,
  raw_user_meta_data, created_at, updated_at
) values
  ('6f100000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
   'gate6p-owner@example.invalid', '',
   '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('6f100000-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
   'gate6p-outsider@example.invalid', '',
   '{"provider":"email","providers":["email"]}', '{}', now(), now());

insert into tongs.episodes (id, workspace_id, label)
select
  '6f100000-0000-4000-8000-000000000003',
  workspace_id,
  'Gate 6P Storage isolation probe'
from tongs.workspace_members
where user_id = '6f100000-0000-4000-8000-000000000001'
order by created_at
limit 1;

insert into storage.objects (bucket_id, name, owner_id, metadata)
values (
  'forge-workpieces',
  'workpieces/6f100000-0000-4000-8000-000000000003/stt/gate6p.txt',
  '6f100000-0000-4000-8000-000000000001',
  '{"mimetype":"text/plain","size":6}'::jsonb
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '6f100000-0000-4000-8000-000000000002', true);

select pg_temp.assert_true(
  not exists (
    select 1 from storage.objects
    where bucket_id = 'forge-workpieces'
      and name = 'workpieces/6f100000-0000-4000-8000-000000000003/stt/gate6p.txt'
  ),
  'cross-user Storage read was not denied'
);

do $reject_cross_user_insert$
begin
  begin
    insert into storage.objects (bucket_id, name, owner_id, metadata)
    values (
      'forge-workpieces',
      'workpieces/6f100000-0000-4000-8000-000000000003/stt/outsider.txt',
      '6f100000-0000-4000-8000-000000000002',
      '{"mimetype":"text/plain","size":8}'::jsonb
    );
    raise exception 'cross-user Storage insert unexpectedly succeeded';
  exception
    when insufficient_privilege then null;
  end;
end
$reject_cross_user_insert$;

select set_config('request.jwt.claim.sub', '6f100000-0000-4000-8000-000000000001', true);

select pg_temp.assert_true(
  (select count(*) = 1
   from storage.objects
   where bucket_id = 'forge-workpieces'
     and name = 'workpieces/6f100000-0000-4000-8000-000000000003/stt/gate6p.txt'),
  'authorized owner cannot read the scoped Storage object'
);

reset role;

rollback;

select 'FORGE_GATE6P_STORAGE_BUCKET_CONTRACT_PASSED' as result;
