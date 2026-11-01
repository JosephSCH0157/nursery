begin;

insert into auth.users(id, email, email_confirmed_at) values
  ('b3000000-0000-4000-8000-000000000001', 's2b-admitted@example.test', clock_timestamp()),
  ('b3000000-0000-4000-8000-000000000002', 's2b-revoked@example.test', clock_timestamp()),
  ('b3000000-0000-4000-8000-000000000003', 's2b-unadmitted@example.test', clock_timestamp());

insert into tongs.legacy_account_admission_cohort(user_id) values
  ('b3000000-0000-4000-8000-000000000001'),
  ('b3000000-0000-4000-8000-000000000002');

insert into tongs.account_admission_events(
  user_id, revision, operation_id, event_type, origin_kind,
  origin_legacy_user_id, reason, actor_id
) values
  (
    'b3000000-0000-4000-8000-000000000001', 1,
    'b3100000-0000-4000-8000-000000000001', 'grant', 'legacy',
    'b3000000-0000-4000-8000-000000000001', 'Slice 2B admitted proof', null
  ),
  (
    'b3000000-0000-4000-8000-000000000002', 1,
    'b3100000-0000-4000-8000-000000000002', 'grant', 'legacy',
    'b3000000-0000-4000-8000-000000000002', 'Slice 2B revocation proof', null
  ),
  (
    'b3000000-0000-4000-8000-000000000002', 2,
    'b3100000-0000-4000-8000-000000000003', 'revoke', 'legacy',
    'b3000000-0000-4000-8000-000000000002', 'Slice 2B explicit revocation proof',
    'b3000000-0000-4000-8000-000000000001'
  );

do $$
begin
  if tongs.account_admission_enforcement_version() <> 'forge.account-admission-enforcement.v1' then
    raise exception 'unexpected admission enforcement contract';
  end if;
  if not exists (
    select 1 from tongs.account_admissions
    where user_id = 'b3000000-0000-4000-8000-000000000001'
      and effective_state = 'admitted'
  ) then
    raise exception 'admitted principal lost canonical admission';
  end if;
  if exists (
    select 1 from tongs.account_admissions
    where user_id = 'b3000000-0000-4000-8000-000000000002'
      and effective_state = 'admitted'
  ) then
    raise exception 'legacy provenance overrode explicit revocation';
  end if;
end $$;

set local request.jwt.claims = '{"role":"anon"}';
select tongs.account_admission_pre_request();

set local request.jwt.claims = '{"role":"service_role"}';
select tongs.account_admission_pre_request();
select tongs.require_account_admission('b3000000-0000-4000-8000-000000000001');

do $$
begin
  begin
    perform tongs.require_account_admission('b3000000-0000-4000-8000-000000000003');
    raise exception 'unadmitted principal passed the service guard';
  exception when insufficient_privilege then null;
  end;
end $$;

set local request.jwt.claims = '{"role":"authenticated","sub":"b3000000-0000-4000-8000-000000000001"}';
select tongs.account_admission_pre_request();

set local request.jwt.claims = '{"role":"authenticated","sub":"b3000000-0000-4000-8000-000000000002"}';
do $$
begin
  begin
    perform tongs.account_admission_pre_request();
    raise exception 'revoked principal passed the Data API guard';
  exception when insufficient_privilege then null;
  end;
end $$;

set local request.jwt.claims = '{"role":"authenticated","sub":"b3000000-0000-4000-8000-000000000003"}';
do $$
begin
  begin
    perform tongs.account_admission_pre_request();
    raise exception 'unadmitted principal passed the Data API guard';
  exception when insufficient_privilege then null;
  end;

  begin
    perform tongs.require_account_admission('b3000000-0000-4000-8000-000000000003');
    raise exception 'authenticated role called service-role-only guard';
  exception when insufficient_privilege then null;
  end;
end $$;

set local request.jwt.claims = '{"role":"unexpected"}';
do $$
begin
  begin
    perform tongs.account_admission_pre_request();
    raise exception 'unknown role passed the Data API guard';
  exception when insufficient_privilege then null;
  end;
end $$;

create temporary table s2b_financial_authorization_probe(user_id uuid not null);
create trigger s2b_financial_authorization_probe_guard
before insert on s2b_financial_authorization_probe
for each row execute function tongs._guard_new_customer_financial_authorization();

select set_config('forge.account_admission_enforcement', '', true);
insert into s2b_financial_authorization_probe(user_id)
values ('b3000000-0000-4000-8000-000000000003');

select set_config('forge.account_admission_enforcement', 'on', true);
insert into s2b_financial_authorization_probe(user_id)
values ('b3000000-0000-4000-8000-000000000001');

do $$
begin
  begin
    insert into s2b_financial_authorization_probe(user_id)
    values ('b3000000-0000-4000-8000-000000000002');
    raise exception 'revoked principal created a new financial authorization';
  exception when insufficient_privilege then null;
  end;
end $$;

do $$
begin
  if has_function_privilege('anon', 'tongs.require_account_admission(uuid)', 'execute')
     or has_function_privilege('authenticated', 'tongs.require_account_admission(uuid)', 'execute')
     or not has_function_privilege('service_role', 'tongs.require_account_admission(uuid)', 'execute') then
    raise exception 'require_account_admission ACL mismatch';
  end if;
  if not has_function_privilege('anon', 'tongs.account_admission_pre_request()', 'execute')
     or not has_function_privilege('authenticated', 'tongs.account_admission_pre_request()', 'execute')
     or not has_function_privilege('service_role', 'tongs.account_admission_pre_request()', 'execute') then
    raise exception 'pre-request ACL mismatch';
  end if;
  if has_function_privilege('anon', 'tongs._guard_new_customer_financial_authorization()', 'execute')
     or has_function_privilege('authenticated', 'tongs._guard_new_customer_financial_authorization()', 'execute')
     or has_function_privilege('service_role', 'tongs._guard_new_customer_financial_authorization()', 'execute') then
    raise exception 'financial trigger function leaked execution privilege';
  end if;
  if coalesce(current_setting('pgrst.db_pre_request', true), '') = 'tongs.account_admission_pre_request' then
    raise exception 'Slice 2B unexpectedly activated the PostgREST pre-request hook';
  end if;
  if exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and policyname like '%account%admission%'
  ) then
    raise exception 'Slice 2B unexpectedly installed a Storage admission policy';
  end if;
end $$;

rollback;
