begin;

do $structure$
declare
  v_expected integer;
begin
  if current_setting('forge.account_admission_enforcement', true) is not null then
    raise exception 'direct database sessions must not inherit financial admission enforcement';
  end if;
  if coalesce((
    select split_part(item.value,'=',2)
    from pg_db_role_setting setting
    join pg_roles role on role.oid=setting.setrole
    cross join lateral unnest(setting.setconfig) item(value)
    where role.rolname='authenticator' and item.value like 'pgrst.db_pre_request=%'
    limit 1
  ),'') <> 'tongs.account_admission_pre_request' then
    raise exception 'PostgREST pre-request hook is not registered';
  end if;
  select count(*) into v_expected
  from pg_class relation join pg_namespace namespace on namespace.oid=relation.relnamespace
  where namespace.nspname in ('public','tongs') and relation.relkind in ('r','p')
    and (has_table_privilege('authenticated',relation.oid,'SELECT') or has_table_privilege('authenticated',relation.oid,'INSERT')
      or has_table_privilege('authenticated',relation.oid,'UPDATE') or has_table_privilege('authenticated',relation.oid,'DELETE'));
  if v_expected <> 250 or (select count(*) from pg_policies where schemaname in ('public','tongs') and policyname='forge_account_admission_required_v1') <> v_expected then
    raise exception 'Data API restrictive admission-policy inventory is incomplete';
  end if;
  if exists(select 1 from pg_policies where schemaname in ('public','tongs') and policyname='forge_account_admission_required_v1'
    and (permissive<>'RESTRICTIVE' or lower(cmd)<>'all' or roles<>array['authenticated']::name[]
      or qual not like '%current_request_is_admitted()%' or with_check not like '%current_request_is_admitted()%')) then
    raise exception 'Data API admission-policy contract differs';
  end if;
  if (select count(*) from pg_policies where schemaname='storage' and policyname like 'forge_account_admission_storage_%_v1') <> 3 then
    raise exception 'Storage admission-policy inventory is incomplete';
  end if;
  if exists(select 1 from pg_policies where schemaname='realtime' and policyname like 'forge_account_admission%') then
    raise exception 'Bellows public Realtime exception was unexpectedly restricted';
  end if;
end
$structure$;

insert into auth.users(id,invited_at) values
  ('71000000-0000-4000-8000-000000000001',now()),
  ('71000000-0000-4000-8000-000000000002',now()),
  ('71000000-0000-4000-8000-000000000003',now()),
  ('71000000-0000-4000-8000-000000000004',now());
insert into tongs.legacy_account_admission_cohort(user_id) values
  ('71000000-0000-4000-8000-000000000001'),
  ('71000000-0000-4000-8000-000000000002');
insert into tongs.platform_operators(user_id,reason)
values ('71000000-0000-4000-8000-000000000004','unadmitted operator probe');
insert into tongs.account_admission_events(user_id,revision,operation_id,event_type,origin_kind,origin_legacy_user_id,actor_id,reason)
values
  ('71000000-0000-4000-8000-000000000001',1,'71100000-0000-4000-8000-000000000001','grant','legacy','71000000-0000-4000-8000-000000000001',null,'activation admitted probe'),
  ('71000000-0000-4000-8000-000000000002',1,'71100000-0000-4000-8000-000000000002','grant','legacy','71000000-0000-4000-8000-000000000002',null,'activation revoked probe'),
  ('71000000-0000-4000-8000-000000000002',2,'71100000-0000-4000-8000-000000000003','revoke','legacy','71000000-0000-4000-8000-000000000002','71000000-0000-4000-8000-000000000004','activation revoked probe');
insert into public.profiles(user_id) values
  ('71000000-0000-4000-8000-000000000001'),
  ('71000000-0000-4000-8000-000000000002'),
  ('71000000-0000-4000-8000-000000000003'),
  ('71000000-0000-4000-8000-000000000004');

do $pre_request_behavior$
begin
  perform set_config('request.jwt.claims','{"role":"authenticated","sub":"71000000-0000-4000-8000-000000000003"}',true);
  perform set_config('request.method','POST',true);
  perform set_config('request.path','/rpc/read_my_admission_onboarding',true);
  perform tongs.account_admission_pre_request();
  if current_setting('forge.account_admission_enforcement',true) <> 'on' then
    raise exception 'pre-request did not set transaction-local financial enforcement';
  end if;

  perform set_config('request.path','/rpc/resolve_bellows_join_link',true);
  perform tongs.account_admission_pre_request();

  perform set_config('request.method','GET',true);
  begin
    perform tongs.account_admission_pre_request();
    raise exception 'GET bypassed the exact onboarding exception';
  exception when insufficient_privilege then null;
  end;

  perform set_config('request.method','POST',true);
  perform set_config('request.path','/rest/v1/profiles',true);
  begin
    perform tongs.account_admission_pre_request();
    raise exception 'unadmitted customer bypassed the Data API gate';
  exception when insufficient_privilege then null;
  end;

  perform set_config('request.jwt.claims','{"role":"authenticated","sub":"71000000-0000-4000-8000-000000000002"}',true);
  begin
    perform tongs.account_admission_pre_request();
    raise exception 'revoked customer bypassed the Data API gate';
  exception when insufficient_privilege then null;
  end;

  perform set_config('request.jwt.claims','{"role":"authenticated","sub":"71000000-0000-4000-8000-000000000004"}',true);
  perform set_config('request.method','POST',true);
  perform set_config('request.path','/rpc/list_beta_invitation_applications',true);
  perform tongs.account_admission_pre_request();
  perform set_config('request.path','/rest/v1/profiles',true);
  begin
    perform tongs.account_admission_pre_request();
    raise exception 'platform operator role implied customer admission';
  exception when insufficient_privilege then null;
  end;

  perform set_config('request.jwt.claims','{"role":"authenticated","sub":"71000000-0000-4000-8000-000000000003"}',true);
  perform set_config('request.path','/rpc/list_beta_invitation_applications',true);
  begin
    perform tongs.account_admission_pre_request();
    raise exception 'non-operator bypassed the operator RPC exception';
  exception when insufficient_privilege then null;
  end;

  perform set_config('request.jwt.claims','{"role":"authenticated","sub":"71000000-0000-4000-8000-000000000001"}',true);
  perform tongs.account_admission_pre_request();

  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  perform tongs.account_admission_pre_request();
end
$pre_request_behavior$;

set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"71000000-0000-4000-8000-000000000001"}',true);
do $admitted_rls$
begin
  if (select count(*) from public.profiles where user_id='71000000-0000-4000-8000-000000000001') <> 1 then
    raise exception 'admitted customer cannot read own profile through composed RLS';
  end if;
end
$admitted_rls$;
reset role;

set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"71000000-0000-4000-8000-000000000003"}',true);
do $unadmitted_rls$
begin
  if exists(select 1 from public.profiles where user_id='71000000-0000-4000-8000-000000000003') then
    raise exception 'unadmitted customer bypassed restrictive profile RLS';
  end if;
end
$unadmitted_rls$;
reset role;

do $financial_guard$
begin
  perform set_config('forge.account_admission_enforcement','on',true);
  begin
    insert into tongs.funding_reservations(user_id)
    values ('71000000-0000-4000-8000-000000000003');
    raise exception 'unadmitted reservation unexpectedly reached table constraints';
  exception
    when insufficient_privilege then null;
  end;
  begin
    insert into tongs.customer_spending_quote_acceptances(user_id)
    values ('71000000-0000-4000-8000-000000000002');
    raise exception 'revoked spending acceptance unexpectedly reached table constraints';
  exception
    when insufficient_privilege then null;
  end;
  if exists(
    select 1 from pg_trigger trigger
    where trigger.tgname in ('customer_spending_acceptance_admission_guard','funding_reservation_admission_guard')
      and pg_get_triggerdef(trigger.oid,true) !~* 'before insert'
  ) then
    raise exception 'financial admission guard affects non-INSERT settlement paths';
  end if;
end
$financial_guard$;

rollback;
