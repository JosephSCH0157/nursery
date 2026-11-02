begin;

do $test$
declare
  v_version text;
  v_pre_request_setting text;
  v_financial_setting text;
begin
  select tongs.account_admission_enforcement_version() into v_version;
  if v_version <> 'forge.account-admission-enforcement.v2' then
    raise exception 'unexpected admission activation-preparation version: %', v_version;
  end if;

  select max(case when item.value like 'pgrst.db_pre_request=%' then item.value end),
         max(case when item.value like 'forge.account_admission_enforcement=%' then item.value end)
    into v_pre_request_setting, v_financial_setting
  from pg_db_role_setting setting
  join pg_roles role on role.oid=setting.setrole
  cross join lateral unnest(setting.setconfig) item(value)
  where role.rolname='authenticator';
  if v_pre_request_setting is not null or v_financial_setting is not null then
    raise exception 'migration 431 activated role settings';
  end if;

  if exists (
    select 1 from pg_policies
    where policyname like 'forge_account_admission%'
  ) then
    raise exception 'migration 431 installed admission policies';
  end if;

  if pg_get_functiondef('tongs.account_admission_pre_request()'::regprocedure)
       not like '%set_config(''forge.account_admission_enforcement'', ''on'', true)%' then
    raise exception 'pre-request function does not set the transaction-local financial guard';
  end if;
  if pg_get_functiondef('tongs.account_admission_pre_request()'::regprocedure)
       not like '%/rpc/read_my_admission_onboarding%'
     or pg_get_functiondef('tongs.account_admission_pre_request()'::regprocedure)
       not like '%/rpc/resolve_bellows_join_link%' then
    raise exception 'exact pre-admission RPC exceptions are absent';
  end if;
  if pg_get_functiondef('tongs.account_admission_pre_request()'::regprocedure)
       not like '%/rpc/list_beta_invitation_applications%'
     or pg_get_functiondef('tongs.account_admission_pre_request()'::regprocedure)
       not like '%from tongs.platform_operators%' then
    raise exception 'operator RPC exception is not independently operator-bound';
  end if;
end
$test$;

rollback;
