begin;

insert into auth.users(id, email, email_confirmed_at) values
  ('b2000000-0000-4000-8000-000000000001', 's2a-operator@example.test', clock_timestamp()),
  ('b2000000-0000-4000-8000-000000000003', 's2a-existing@example.test', clock_timestamp()),
  ('b2000000-0000-4000-8000-000000000004', 's2a-unconfirmed@example.test', null),
  ('b2000000-0000-4000-8000-000000000005', 's2a-legacy@example.test', clock_timestamp());

create function public._s2a_reject_profile_bootstrap()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if new.user_id = 'b2000000-0000-4000-8000-000000000006'::uuid then
    raise exception 'simulated profile bootstrap failure';
  end if;
  return new;
end;
$$;
create trigger s2a_reject_profile_bootstrap
before insert on public.profiles
for each row execute function public._s2a_reject_profile_bootstrap();
insert into auth.users(id, email, email_confirmed_at) values
  ('b2000000-0000-4000-8000-000000000006', 's2a-profile-fail-open@example.test', clock_timestamp());
drop trigger s2a_reject_profile_bootstrap on public.profiles;
drop function public._s2a_reject_profile_bootstrap();

create function tongs._s2a_reject_workspace_bootstrap()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if new.created_by = 'b2000000-0000-4000-8000-000000000007'::uuid then
    raise exception 'simulated workspace bootstrap failure';
  end if;
  return new;
end;
$$;
create trigger s2a_reject_workspace_bootstrap
before insert on tongs.workspaces
for each row execute function tongs._s2a_reject_workspace_bootstrap();
insert into auth.users(id, email, email_confirmed_at) values
  ('b2000000-0000-4000-8000-000000000007', 's2a-workspace-fail-open@example.test', clock_timestamp());
drop trigger s2a_reject_workspace_bootstrap on tongs.workspaces;
drop function tongs._s2a_reject_workspace_bootstrap();

do $$
begin
  if not exists (
    select 1 from auth.users where id='b2000000-0000-4000-8000-000000000006'
  ) then raise exception 'profile bootstrap failure aborted ordinary Auth signup'; end if;
  if exists (
    select 1 from public.profiles where user_id='b2000000-0000-4000-8000-000000000006'
  ) then raise exception 'simulated profile failure unexpectedly provisioned a profile'; end if;
  if not exists (
    select 1 from auth.users where id='b2000000-0000-4000-8000-000000000007'
  ) then raise exception 'workspace bootstrap failure aborted ordinary Auth signup'; end if;
  if exists (
    select 1 from tongs.workspace_members where user_id='b2000000-0000-4000-8000-000000000007'
  ) then raise exception 'simulated workspace failure unexpectedly provisioned membership'; end if;
end $$;

insert into tongs.platform_operators(user_id, reason, granted_by) values
  ('b2000000-0000-4000-8000-000000000001', 'Slice 2A rollback-only proof', 'b2000000-0000-4000-8000-000000000001');

insert into tongs.legacy_account_admission_cohort(user_id)
values ('b2000000-0000-4000-8000-000000000005');
insert into tongs.account_admission_events(
  user_id, revision, operation_id, event_type, origin_kind,
  origin_legacy_user_id, reason, actor_id
) values (
  'b2000000-0000-4000-8000-000000000005', 1,
  'b2100000-0000-4000-8000-000000000001', 'grant', 'legacy',
  'b2000000-0000-4000-8000-000000000005', 'Slice 2A legacy preservation proof', null
);

do $$
declare protected_table text;
begin
  if exists (select 1 from public.profiles where user_id='b2000000-0000-4000-8000-000000000002') then
    raise exception 'invited identity was provisioned before admission binding';
  end if;
  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='tongs' and c.relname='beta_access_invitation_events'
      and c.relrowsecurity and c.relforcerowsecurity
  ) then raise exception 'invitation journal lacks forced RLS'; end if;
  if exists (select 1 from pg_policies where schemaname='tongs' and tablename='beta_access_invitation_events') then
    raise exception 'invitation journal acquired direct RLS policy';
  end if;
  foreach protected_table in array array['anon','authenticated','service_role'] loop
    if has_table_privilege(protected_table, 'tongs.beta_access_invitation_events', 'select,insert,update,delete') then
      raise exception '% can access invitation journal directly', protected_table;
    end if;
  end loop;
  if has_function_privilege('authenticated', 'tongs.claim_beta_invitation_dispatch(uuid,uuid,uuid,uuid,text,timestamptz)', 'execute')
     or not has_function_privilege('service_role', 'tongs.claim_beta_invitation_dispatch(uuid,uuid,uuid,uuid,text,timestamptz)', 'execute')
     or not has_function_privilege('authenticated', 'tongs.list_beta_invitation_applications(text,integer,timestamptz,uuid)', 'execute')
     or has_function_privilege('authenticated', 'tongs.bind_beta_access_application(uuid,uuid,text,uuid)', 'execute')
     or has_function_privilege('anon', 'tongs.read_my_admission_onboarding()', 'execute') then
    raise exception 'invitation RPC ACL boundary is incorrect';
  end if;
end $$;

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
do $$
declare item record;
begin
  for item in select * from (values
    ('s2a-invited@example.test','invited'),
    ('s2a-existing@example.test','existing'),
    ('s2a-unconfirmed@example.test','unconfirmed'),
    ('s2a-legacy@example.test','legacy')
  ) value(email, reference) loop
    perform tongs.ingest_beta_access_application(
      's2a-' || item.reference, repeat('b',64), item.email, 'Slice 2A Applicant',
      'Podcast (solo)', 'Weekly', 'Test invitation continuity', null, null, null,
      '2026-11-01T12:00:00Z');
  end loop;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'b2000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
do $$
declare item record; app_id uuid; op_index integer := 10;
begin
  for item in select application_id from tongs.list_beta_invitation_applications(
    null::text, 100, null::timestamptz, null::uuid
  ) loop
    app_id := item.application_id;
    perform tongs.decide_beta_access_application(
      app_id, 'approved', 'Slice 2A approval proof',
      ('b2100000-0000-4000-8000-' || lpad(op_index::text, 12, '0'))::uuid);
    op_index := op_index + 1;
  end loop;
end $$;
reset role;

set local role service_role;
select set_config('request.jwt.claim.sub', 'b2000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'service_role', true);
reset role;
do $$
declare
  invited_app uuid;
  existing_app uuid;
  unconfirmed_app uuid;
  legacy_app uuid;
  claim jsonb;
  admission jsonb;
  legacy_event_id uuid;
begin
  select id into strict invited_app from tongs.beta_access_applications where applicant_email_normalized='s2a-invited@example.test';
  select id into strict existing_app from tongs.beta_access_applications where applicant_email_normalized='s2a-existing@example.test';
  select id into strict unconfirmed_app from tongs.beta_access_applications where applicant_email_normalized='s2a-unconfirmed@example.test';
  select id into strict legacy_app from tongs.beta_access_applications where applicant_email_normalized='s2a-legacy@example.test';

  claim := tongs.claim_beta_invitation_dispatch(
    'b2000000-0000-4000-8000-000000000001', invited_app,
    'b2200000-0000-4000-8000-000000000001', 'b2200000-0000-4000-8000-000000000002',
    repeat('c',64), clock_timestamp() + interval '2 minutes');
  if claim->>'disposition' <> 'dispatch_claimed' then raise exception 'new invitation was not claimed: %', claim; end if;

  perform tongs.record_beta_invitation_dispatch(
    'b2000000-0000-4000-8000-000000000001', invited_app,
    'b2200000-0000-4000-8000-000000000001', 'b2200000-0000-4000-8000-000000000003',
    'test-lease-token', 'succeeded', 'b2000000-0000-4000-8000-000000000002',
    'supabase_invite_returned_uuid');
  raise exception 'incorrect lease token was accepted';
exception when insufficient_privilege then
  -- Continue the proof outside this exception block so the rejected statement is rolled back.
  null;
end $$;

do $$
declare
  invited_app uuid;
  existing_app uuid;
  unconfirmed_app uuid;
  legacy_app uuid;
  claim jsonb;
  admission jsonb;
  event_count bigint;
  legacy_event_id uuid;
begin
  select id into strict invited_app from tongs.beta_access_applications where applicant_email_normalized='s2a-invited@example.test';
  select id into strict existing_app from tongs.beta_access_applications where applicant_email_normalized='s2a-existing@example.test';
  select id into strict unconfirmed_app from tongs.beta_access_applications where applicant_email_normalized='s2a-unconfirmed@example.test';
  select id into strict legacy_app from tongs.beta_access_applications where applicant_email_normalized='s2a-legacy@example.test';

  -- Reclaim with a deterministic hash matching the plaintext used to record the result.
  claim := tongs.claim_beta_invitation_dispatch(
    'b2000000-0000-4000-8000-000000000001', invited_app,
    'b2200000-0000-4000-8000-000000000001', 'b2200000-0000-4000-8000-000000000004',
    encode(digest(convert_to('test-lease-token','UTF8'),'sha256'),'hex'), clock_timestamp() + interval '2 minutes');
  if claim->>'disposition' <> 'dispatch_claimed' then raise exception 'expired transaction claim was not recovered: %', claim; end if;
  -- Supabase Auth creates the invited UUID only after the durable dispatch claim.
  -- The Auth trigger must defer provisioning until the UUID is bound.
  insert into auth.users(id, email, invited_at) values (
    'b2000000-0000-4000-8000-000000000002',
    's2a-invited@example.test', clock_timestamp()
  );
  if exists (select 1 from public.profiles where user_id='b2000000-0000-4000-8000-000000000002') then
    raise exception 'invited identity was provisioned before admission binding';
  end if;
  perform tongs.record_beta_invitation_dispatch(
    'b2000000-0000-4000-8000-000000000001', invited_app,
    'b2200000-0000-4000-8000-000000000001', 'b2200000-0000-4000-8000-000000000005',
    'test-lease-token', 'succeeded', 'b2000000-0000-4000-8000-000000000002',
    'supabase_invite_returned_uuid');
  admission := tongs.bind_beta_access_application_as_operator(
    'b2000000-0000-4000-8000-000000000001', invited_app,
    'b2000000-0000-4000-8000-000000000002', 'Slice 2A invited identity binding',
    'b2200000-0000-4000-8000-000000000006', 'b2200000-0000-4000-8000-000000000001',
    'b2200000-0000-4000-8000-000000000007');
  if admission->>'effective_state' <> 'admitted' then raise exception 'invited identity was not admitted'; end if;
  if not exists (select 1 from public.profiles where user_id='b2000000-0000-4000-8000-000000000002')
     or (select count(*) from tongs.workspace_members where user_id='b2000000-0000-4000-8000-000000000002') <> 1 then
    raise exception 'invited identity was not provisioned exactly once';
  end if;
  select count(*) into event_count from tongs.account_admission_events where user_id='b2000000-0000-4000-8000-000000000002';
  if event_count <> 1 then raise exception 'idempotent binding created duplicate admission events'; end if;

  claim := tongs.claim_beta_invitation_dispatch(
    'b2000000-0000-4000-8000-000000000001', existing_app,
    'b2300000-0000-4000-8000-000000000001', 'b2300000-0000-4000-8000-000000000002',
    repeat('d',64), clock_timestamp() + interval '2 minutes');
  if claim->>'disposition' <> 'existing_confirmed' or claim->>'auth_user_id' <> 'b2000000-0000-4000-8000-000000000003' then
    raise exception 'confirmed identity collision did not fail closed: %', claim;
  end if;
  admission := tongs.bind_existing_beta_access_application_as_operator(
    'b2000000-0000-4000-8000-000000000001', existing_app,
    'b2000000-0000-4000-8000-000000000003', 'explicit exact UUID acknowledgement',
    'b2300000-0000-4000-8000-000000000003', 'b2300000-0000-4000-8000-000000000001',
    'b2300000-0000-4000-8000-000000000004', 'b2300000-0000-4000-8000-000000000005');
  if admission->>'effective_state' <> 'admitted' then raise exception 'confirmed identity acknowledgement failed'; end if;

  claim := tongs.claim_beta_invitation_dispatch(
    'b2000000-0000-4000-8000-000000000001', unconfirmed_app,
    'b2400000-0000-4000-8000-000000000001', 'b2400000-0000-4000-8000-000000000002',
    repeat('e',64), clock_timestamp() + interval '2 minutes');
  if claim->>'disposition' <> 'existing_unconfirmed' then raise exception 'unconfirmed collision was not blocked: %', claim; end if;
  begin
    perform tongs.bind_existing_beta_access_application_as_operator(
      'b2000000-0000-4000-8000-000000000001', unconfirmed_app,
      'b2000000-0000-4000-8000-000000000004', 'must fail',
      'b2400000-0000-4000-8000-000000000003', 'b2400000-0000-4000-8000-000000000001',
      'b2400000-0000-4000-8000-000000000004', 'b2400000-0000-4000-8000-000000000005');
    raise exception 'unconfirmed pre-existing identity was bound';
  exception when insufficient_privilege then null; end;

  select current_event_id into strict legacy_event_id from tongs.account_admissions where user_id='b2000000-0000-4000-8000-000000000005';
  admission := tongs.bind_existing_beta_access_application_as_operator(
    'b2000000-0000-4000-8000-000000000001', legacy_app,
    'b2000000-0000-4000-8000-000000000005', 'preserve legacy admission origin',
    'b2500000-0000-4000-8000-000000000001', 'b2500000-0000-4000-8000-000000000002',
    'b2500000-0000-4000-8000-000000000003', 'b2500000-0000-4000-8000-000000000004');
  if admission->>'origin_kind' <> 'legacy' or admission->>'current_event_id' <> legacy_event_id::text then
    raise exception 'legacy binding rewrote its canonical admission origin: %', admission;
  end if;

  begin
    update tongs.beta_access_invitation_events set reason='rewritten';
    raise exception 'invitation journal allowed UPDATE';
  exception when object_not_in_prerequisite_state then null; end;
end $$;
reset role;

do $$
declare
  unexpected_functions text;
  unexpected_policies text;
begin
  select string_agg(n.nspname || '.' || p.proname, ', ' order by n.nspname, p.proname)
    into unexpected_functions
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname in ('public','tongs') and p.prokind in ('f','p')
      and p.proname not in (
        '_reject_beta_access_invitation_event_mutation','_append_beta_access_invitation_event',
        '_provision_bound_beta_account','_bind_beta_access_application_core',
        'bind_beta_access_application','list_beta_invitation_applications',
        'claim_beta_invitation_dispatch','record_beta_invitation_dispatch',
        'bind_beta_access_application_as_operator','bind_existing_beta_access_application_as_operator',
        'record_beta_invitation_binding_failure','read_my_admission_onboarding','handle_new_user'
      )
      and pg_get_functiondef(p.oid) ~ '(beta_access_invitation|read_my_admission_onboarding)';
  if unexpected_functions is not null then
    raise exception 'unrelated runtime function acquired invitation authority: %', unexpected_functions;
  end if;
  select string_agg(schemaname || '.' || tablename || '.' || policyname, ', ' order by schemaname, tablename, policyname)
    into unexpected_policies
    from pg_policies
    where coalesce(qual,'') ~ '(beta_access_invitation|read_my_admission_onboarding)'
       or coalesce(with_check,'') ~ '(beta_access_invitation|read_my_admission_onboarding)';
  if unexpected_policies is not null then
    raise exception 'existing RLS policy acquired invitation enforcement: %', unexpected_policies;
  end if;
end $$;

rollback;
