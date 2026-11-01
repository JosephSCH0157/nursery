begin;

insert into auth.users(id, email) values
  ('ad000000-0000-4000-8000-000000000001', 'admission-operator@example.test'),
  ('ad000000-0000-4000-8000-000000000002', 'legacy-admission@example.test'),
  ('ad000000-0000-4000-8000-000000000003', 'approved-applicant@example.test');
insert into tongs.platform_operators(user_id, reason, granted_by) values
  ('ad000000-0000-4000-8000-000000000001', 'account admission authority proof', 'ad000000-0000-4000-8000-000000000001');

-- Simulate the migration-time legacy capture inside this rollback-only proof.
insert into tongs.legacy_account_admission_cohort(user_id)
values ('ad000000-0000-4000-8000-000000000002');
insert into tongs.account_admission_events(
  user_id, revision, operation_id, event_type, origin_kind,
  origin_legacy_user_id, reason, actor_id
) values (
  'ad000000-0000-4000-8000-000000000002', 1,
  'ad100000-0000-4000-8000-000000000001', 'grant', 'legacy',
  'ad000000-0000-4000-8000-000000000002', 'rollback-only legacy capture proof', null
);

do $$
declare
  protected_table text;
begin
  foreach protected_table in array array[
    'beta_access_applications', 'beta_access_application_decisions',
    'beta_access_identity_bindings', 'legacy_account_admission_cohort',
    'account_admission_events', 'account_admissions'
  ] loop
    if not exists (
      select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='tongs' and c.relname=protected_table
        and c.relrowsecurity and c.relforcerowsecurity
    ) then raise exception '% lacks forced RLS', protected_table; end if;
    if has_table_privilege('anon', format('tongs.%I',protected_table), 'select,insert,update,delete')
       or has_table_privilege('authenticated', format('tongs.%I',protected_table), 'select,insert,update,delete')
       or has_table_privilege('service_role', format('tongs.%I',protected_table), 'select,insert,update,delete') then
      raise exception '% exposes direct table privileges', protected_table;
    end if;
  end loop;
  if exists (select 1 from pg_policies where schemaname='tongs' and tablename = any(array[
    'beta_access_applications','beta_access_application_decisions','beta_access_identity_bindings',
    'legacy_account_admission_cohort','account_admission_events','account_admissions'
  ])) then raise exception 'admission tables acquired direct RLS policies'; end if;
  if not has_function_privilege('service_role', 'tongs.ingest_beta_access_application(text,text,text,text,text,text,text,text,text,text,timestamptz)', 'execute')
     or not has_function_privilege('service_role', 'tongs.account_admission_authority_version()', 'execute')
     or has_function_privilege('authenticated', 'tongs.ingest_beta_access_application(text,text,text,text,text,text,text,text,text,text,timestamptz)', 'execute')
     or has_function_privilege('authenticated', 'tongs.bind_beta_access_application(uuid,uuid,text,uuid)', 'execute')
     or has_function_privilege('service_role', 'tongs.decide_beta_access_application(uuid,text,text,uuid)', 'execute') then
    raise exception 'RPC privilege boundary is incorrect';
  end if;
end $$;

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
do $$ begin
  if tongs.account_admission_authority_version() <> 'forge-account-admission-v1' then
    raise exception 'authority version mismatch';
  end if;
  begin
    perform * from tongs.account_admissions;
    raise exception 'service role read admission projection directly';
  exception when insufficient_privilege then null; end;
  perform tongs.ingest_beta_access_application(
    'verified-form-ref', repeat('a',64), 'approved-applicant@example.test', 'Applicant',
    'Podcast (solo)', 'Weekly', 'Build a durable creator workflow', null, null, null,
    '2026-10-30T12:00:00Z');
  perform tongs.ingest_beta_access_application(
    'verified-form-ref', repeat('a',64), 'approved-applicant@example.test', 'Applicant',
    'Podcast (solo)', 'Weekly', 'Build a durable creator workflow', null, null, null,
    '2026-10-30T12:00:00Z');
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'ad000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
do $$
declare
  application_id uuid;
  result jsonb;
begin
  select a.application_id into strict application_id from tongs.list_beta_access_applications('pending',100) a
  where a.applicant_email='approved-applicant@example.test';
  result := tongs.decide_beta_access_application(application_id, 'approved', 'approved for binding proof',
    'ad100000-0000-4000-8000-000000000002');
  if result->>'decision' <> 'approved' then raise exception 'approval was not recorded'; end if;
  begin
    perform tongs.bind_beta_access_application(application_id,
      'ad000000-0000-4000-8000-000000000003', 'legacy direct bind must remain retired',
      'ad100000-0000-4000-8000-000000000003');
    raise exception 'legacy direct binding bypass remained executable';
  exception when insufficient_privilege then null; end;

  result := tongs.set_account_admission_state('ad000000-0000-4000-8000-000000000002',
    'revoked', 'explicit legacy revocation proof', 'ad100000-0000-4000-8000-000000000004');
  if result->>'effective_state' <> 'revoked' then raise exception 'legacy revocation did not win'; end if;
end $$;

select set_config('request.jwt.claim.sub', 'ad000000-0000-4000-8000-000000000002', true);
do $$ begin
  if tongs.is_account_admitted('ad000000-0000-4000-8000-000000000002') then
    raise exception 'legacy cohort membership overrode explicit revocation';
  end if;
end $$;

select set_config('request.jwt.claim.sub', 'ad000000-0000-4000-8000-000000000001', true);
do $$
declare result jsonb;
begin
  result := tongs.set_account_admission_state('ad000000-0000-4000-8000-000000000002',
    'admitted', 'restore legacy admission proof', 'ad100000-0000-4000-8000-000000000005');
  if result->>'effective_state' <> 'admitted' then raise exception 'legacy restore failed'; end if;
end $$;
reset role;

do $$ begin
  begin
    update tongs.account_admissions set effective_state='revoked'
    where user_id='ad000000-0000-4000-8000-000000000002';
    raise exception 'projection allowed direct mutation';
  exception when object_not_in_prerequisite_state then null; end;
  begin
    update tongs.account_admission_events set reason='rewritten';
    raise exception 'canonical admission event was mutable';
  exception when object_not_in_prerequisite_state then null; end;
end $$;

do $$ begin
  if exists (
    select 1 from tongs.account_admissions projection
    join tongs.account_admission_events event on event.id=projection.current_event_id
    where projection.user_id<>event.user_id
       or projection.event_revision<>event.revision
       or projection.origin_kind<>event.origin_kind
       or projection.origin_application_id is distinct from event.origin_application_id
       or projection.origin_legacy_user_id is distinct from event.origin_legacy_user_id
       or projection.effective_state <> case event.event_type when 'revoke' then 'revoked' else 'admitted' end
  ) then raise exception 'account admission projection diverged from canonical events'; end if;

  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname in ('public','tongs')
      and p.prokind in ('f','p')
      and p.proname not in (
        '_reject_account_admission_immutable_mutation','_guard_account_admissions_projection',
        '_project_account_admission_event','account_admission_authority_version',
        'ingest_beta_access_application','list_beta_access_applications',
        'decide_beta_access_application','bind_beta_access_application',
        'set_account_admission_state','is_account_admitted',
        '_reject_beta_access_invitation_event_mutation','_append_beta_access_invitation_event',
        '_provision_bound_beta_account','_bind_beta_access_application_core',
        'list_beta_invitation_applications','claim_beta_invitation_dispatch',
        'record_beta_invitation_dispatch','bind_beta_access_application_as_operator',
        'bind_existing_beta_access_application_as_operator',
        'record_beta_invitation_binding_failure','read_my_admission_onboarding','handle_new_user',
        'account_admission_enforcement_version','require_account_admission',
        'current_request_is_admitted','account_admission_pre_request',
        '_guard_new_customer_financial_authorization'
      )
      and pg_get_functiondef(p.oid) ~ '(beta_access_|account_admission)'
  ) then raise exception 'existing runtime function acquired admission enforcement dependency'; end if;
  if exists (select 1 from pg_policies where qual ~ '(beta_access_|account_admission)' or with_check ~ '(beta_access_|account_admission)') then
    raise exception 'existing RLS policy acquired admission enforcement';
  end if;
end $$;

rollback;
