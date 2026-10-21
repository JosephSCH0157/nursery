\set ON_ERROR_STOP on

begin;

create or replace function pg_temp.assert_true(p_condition boolean, p_message text)
returns void language plpgsql as $$
begin
  if not coalesce(p_condition, false) then
    raise exception 'Canonical baseline assertion failed: %', p_message;
  end if;
end
$$;

select pg_temp.assert_true(
  (select count(*) = 1
     from forge_meta.database_lineage
    where singleton and lineage = 'baseline-v1'
      and baseline_contract_sha256 = '817f42cfe0f57d2961b52a72b58a5273c3cc1e2bf306e3a527e6bc58bdbcbfbe'
      and historical_manifest_sha256 = '66a094037af456e95b34ec0ca3fb18bcc791d296fa6c2619af9639a87f7d7f40'
      and baseline_start_version = '20261021000000'
      and baseline_end_version = '20261021235959'
      and shared_tail_minimum_version = '20261022000000'),
  'database lineage marker differs from the approved contract'
);

select pg_temp.assert_true(
  not has_schema_privilege('anon', 'forge_meta', 'usage')
  and not has_schema_privilege('authenticated', 'forge_meta', 'usage')
  and not has_schema_privilege('service_role', 'forge_meta', 'usage'),
  'database lineage metadata is exposed to a Data API role'
);

select pg_temp.assert_true(
  (select array_agg(id order by id) = array[
    '81000000-0000-4000-8000-000000000001'::uuid,
    '81000000-0000-4000-8000-000000000002'::uuid,
    '81000000-0000-4000-8000-000000000003'::uuid
  ] from tongs.quench_destination_scopes),
  'Quench destination scope allowlist differs'
);

select pg_temp.assert_true(
  (select array_agg(content_hash order by id) = array[
    '118f69cf914db6006c871c17f918f4a4d90de6a537f6c5aba657cb10de69b261',
    '6e990e4f264d95641fc1272c3598453e555d617498c09a297e6865f656c3efff',
    'a024a5df42d0208d0d937af74e4af1b09c1a6f32c4f84a6f3130834f25a6f7d6',
    'e510a87bd6a3f8d077dceccaf9a67154a5b62fef73a902d4c95c93c12ae449cb'
  ]::text[] from tongs.quench_destination_capability_revisions),
  'Quench capability allowlist or hashes differ'
);

do $$
declare
  item record;
  row_count bigint;
begin
  for item in
    select n.nspname schema_name, c.relname table_name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where c.relkind in ('r','p') and n.nspname in ('public','tongs')
      and format('%I.%I', n.nspname, c.relname) not in (
        'tongs.quench_destination_scopes',
        'tongs.quench_destination_capability_revisions'
      )
  loop
    execute format('select count(*) from %I.%I', item.schema_name, item.table_name)
      into row_count;
    if row_count <> 0 then
      raise exception 'Unexpected baseline state in %.%: % rows',
        item.schema_name, item.table_name, row_count;
    end if;
  end loop;
end
$$;

select pg_temp.assert_true(
  (select count(*) = 8 from pg_policy p
   where p.polrelid = 'storage.objects'::regclass
     and p.polname in (
       'bellows_capture_operator_insert', 'bellows_capture_operator_read',
       'brand_asset_objects_insert', 'brand_asset_objects_select',
       'forge_workpieces_stt_insert', 'forge_workpieces_stt_select',
       'forge_workpieces_stt_update', 'stt_upload_select'
     )),
  'cross-schema Storage authorization policies are incomplete'
);

select pg_temp.assert_true(
  not has_table_privilege('anon', 'tongs.youtube_publication_jobs', 'select')
  and not has_table_privilege('authenticated', 'tongs.youtube_publication_jobs', 'select'),
  'Quench capability discovery broadened into publication-job access'
);

select pg_temp.assert_true(
  not has_function_privilege(
    'authenticated',
    'tongs.create_customer_runway_quote(uuid,uuid,text,uuid,text,text,integer,text,timestamptz)',
    'execute')
  and not has_function_privilege(
    'authenticated',
    'tongs.create_customer_openai_text_quote(uuid,uuid,text,text,uuid,text,text,text,text,timestamptz)',
    'execute'),
  'authenticated gained direct paid-provider quote execution'
);

insert into auth.users (
  id, aud, role, email, encrypted_password, raw_app_meta_data,
  raw_user_meta_data, created_at, updated_at
) values (
  'cb100000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
  'canonical-baseline@example.invalid', '',
  '{"provider":"email","providers":["email"]}', '{}', now(), now()
);

select pg_temp.assert_true(
  (select count(*) = 1 from public.profiles
    where user_id = 'cb100000-0000-4000-8000-000000000001'),
  'fresh signup did not create the compatibility profile'
);
select pg_temp.assert_true(
  (select count(*) = 1 from tongs.workspace_members
    where user_id = 'cb100000-0000-4000-8000-000000000001' and role = 'owner'),
  'fresh signup did not create an owner workspace membership'
);
select pg_temp.assert_true(
  not exists (select 1 from public.billing_subscriptions
    where user_id = 'cb100000-0000-4000-8000-000000000001')
  and not exists (select 1 from tongs.customer_deposits
    where user_id = 'cb100000-0000-4000-8000-000000000001')
  and not exists (select 1 from tongs.funding_reservations
    where user_id = 'cb100000-0000-4000-8000-000000000001'),
  'signup activated billing, deposits, or spending authority'
);
select pg_temp.assert_true(
  coalesce((select ai_credit_balance = 0 from public.account_balances
    where user_id = 'cb100000-0000-4000-8000-000000000001'), true),
  'signup created spendable compatibility credit'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'cb100000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select pg_temp.assert_true(
  (select count(*) = 3 from tongs.quench_destination_scopes)
  and (select count(*) = 4 from tongs.quench_destination_capability_revisions),
  'approved global Quench capabilities are not discoverable through the preserved contract'
);
reset role;

rollback;

select 'FORGE_CANONICAL_BASELINE_V1_BEHAVIOR_PASSED' as result;
