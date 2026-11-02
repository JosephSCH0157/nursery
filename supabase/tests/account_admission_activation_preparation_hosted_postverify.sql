with function_acl_expectations(signature, allowed_grantees, security_definer) as (values
  ('tongs.account_admission_enforcement_version()', array['postgres','service_role']::text[], false),
  ('tongs.require_account_admission(uuid)', array['postgres','service_role']::text[], true),
  ('tongs.current_request_is_admitted()', array['postgres','authenticated','service_role']::text[], true),
  ('tongs.account_admission_pre_request()', array['postgres','anon','authenticated','service_role']::text[], true),
  ('tongs._guard_new_customer_financial_authorization()', array['postgres']::text[], true)
), function_contract as (
  select expectation.*, procedure.oid, procedure.proowner, procedure.prosecdef,
    procedure.proconfig, procedure.proacl, lower(pg_get_functiondef(procedure.oid)) as definition
  from function_acl_expectations expectation
  left join pg_proc procedure on procedure.oid = to_regprocedure(expectation.signature)
), function_acl_actual as (
  select contract.signature, coalesce(role.rolname, 'PUBLIC') as grantee_name,
    acl.privilege_type, acl.is_grantable
  from function_contract contract
  cross join lateral aclexplode(coalesce(contract.proacl, acldefault('f', contract.proowner))) acl
  left join pg_roles role on role.oid = acl.grantee
), function_effective_roles(role_name, administrative_exempt) as (
  select rolname, rolname = 'supabase_admin'
  from pg_roles
), pre_request_paths as (
  select match[1] as path
  from function_contract contract
  cross join lateral regexp_matches(contract.definition, '''(rpc/[a-z0-9_]+)''', 'g') match
  where contract.signature = 'tongs.account_admission_pre_request()'
), guard_triggers as (
  select trigger.tgname, trigger.tgenabled::text as enabled, trigger.tgtype,
    trigger.tgfoid::regprocedure::text as function_signature,
    namespace.nspname as schema_name, relation.relname as relation_name
  from pg_trigger trigger
  join pg_class relation on relation.oid = trigger.tgrelid
  join pg_namespace namespace on namespace.oid = relation.relnamespace
  where not trigger.tgisinternal
    and trigger.tgname in (
      'customer_spending_acceptance_admission_guard',
      'funding_reservation_admission_guard'
    )
), projection_mismatch as (
  select admission.user_id
  from tongs.account_admissions admission
  left join lateral (
    select event.*
    from tongs.account_admission_events event
    where event.user_id = admission.user_id
    order by event.revision desc
    limit 1
  ) event on true
  where event.id is null
    or admission.current_event_id <> event.id
    or admission.event_revision <> event.revision
    or admission.effective_state <> case event.event_type when 'revoke' then 'revoked' else 'admitted' end
    or admission.origin_kind <> event.origin_kind
    or admission.origin_application_id is distinct from event.origin_application_id
    or admission.origin_legacy_user_id is distinct from event.origin_legacy_user_id
), role_settings as (
  select lower(array_to_string(setting.setconfig, ',')) as configuration
  from pg_db_role_setting setting
)
select
  (select lineage from forge_meta.database_lineage where singleton = true) as lineage,
  tongs.account_admission_enforcement_version() = 'forge.account-admission-enforcement.v2'
    as prepared_contract_v2,
  (select count(*) = 5 and bool_and(
    oid is not null
    and proowner = 'postgres'::regrole
    and proconfig @> array['search_path=pg_catalog']
    and prosecdef = security_definer
  ) from function_contract) as function_ownership_and_path,
  (select count(*) = 5 from function_acl_expectations)
    and not exists (
      select 1
      from function_acl_actual actual
      join function_acl_expectations expectation using (signature)
      where not (actual.grantee_name = any(expectation.allowed_grantees))
        or actual.privilege_type <> 'EXECUTE'
        or actual.is_grantable
    )
    and not exists (
      select 1
      from function_acl_expectations expectation
      cross join lateral unnest(expectation.allowed_grantees) expected(grantee_name)
      where not exists (
        select 1
        from function_acl_actual actual
        where actual.signature = expectation.signature
          and actual.grantee_name = expected.grantee_name
          and actual.privilege_type = 'EXECUTE'
          and not actual.is_grantable
      )
    ) as complete_function_acl_contract,
  (select bool_and(
    has_function_privilege(role.role_name, expectation.signature, 'EXECUTE') =
      (role.administrative_exempt or role.role_name = any(expectation.allowed_grantees))
  ) from function_acl_expectations expectation cross join function_effective_roles role)
    as function_effective_acl_contract,
  (select count(*) = 6
    and array_agg(path order by path) = array[
      'rpc/decide_beta_access_application',
      'rpc/list_beta_access_applications',
      'rpc/list_beta_invitation_applications',
      'rpc/read_my_admission_onboarding',
      'rpc/resolve_bellows_join_link',
      'rpc/set_account_admission_state'
    ]::text[]
  from pre_request_paths) as exact_pre_request_paths,
  (select position('v_role = ''anon''' in definition) > 0
    and position('v_role = ''service_role''' in definition) > 0
    and position('v_role <> ''authenticated''' in definition) > 0
    and position('v_method = ''post''' in definition) > 0
    and position('platform_operators' in definition) > 0
    and position('account_admissions' in definition) > 0
    and position('v_raw_path ~ ''^/[^/]''' in definition) > 0
    and position('substr(v_raw_path, 2)' in definition) > 0
    and position('set_config(''forge.account_admission_enforcement'', ''on'', true)' in definition) > 0
  from function_contract where signature = 'tongs.account_admission_pre_request()')
    as pre_request_contract,
  (select count(*) = 2
    and bool_and(enabled = 'O')
    and bool_and(tgtype = 7)
    and bool_and(function_signature = 'tongs._guard_new_customer_financial_authorization()')
    and bool_and(
      (tgname = 'customer_spending_acceptance_admission_guard'
        and schema_name = 'tongs' and relation_name = 'customer_spending_quote_acceptances')
      or
      (tgname = 'funding_reservation_admission_guard'
        and schema_name = 'tongs' and relation_name = 'funding_reservations')
    )
  from guard_triggers) as financial_trigger_contract,
  (select position('service_role' in definition) > 0
    and position('account_admissions' in definition) > 0
    and position('effective_state = ''admitted''' in definition) > 0
  from function_contract where signature = 'tongs.require_account_admission(uuid)')
    as service_guard_contract,
  (select position('forge.account_admission_enforcement' in definition) > 0
    and position('<> ''on''' in definition) > 0
    and position('return new' in definition) > 0
  from function_contract where signature = 'tongs._guard_new_customer_financial_authorization()')
    as financial_guard_inert_contract,
  not exists (
    select 1 from role_settings
    where configuration ~ 'pgrst\.db_pre_request=[^,]*account_admission_pre_request'
  ) and lower(coalesce(current_setting('pgrst.db_pre_request', true), ''))
      not like '%account_admission_pre_request%'
    as pre_request_unregistered,
  not exists (
    select 1 from role_settings
    where configuration ~ 'forge\.account_admission_enforcement=on(?:,|$)'
  ) and lower(coalesce(current_setting('forge.account_admission_enforcement', true), '')) <> 'on'
    as financial_enforcement_inactive,
  not exists (
    select 1 from pg_policies
    where schemaname in ('public', 'tongs')
      and policyname = 'forge_account_admission_required_v1'
  ) as data_api_policy_uninstalled,
  not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and (
        policyname in (
          'forge_account_admission_storage_select_v1',
          'forge_account_admission_storage_insert_v1',
          'forge_account_admission_storage_update_v1'
        )
        or lower(coalesce(qual, '') || ' ' || coalesce(with_check, ''))
          ~ '(current_request_is_admitted|account_admission_pre_request|account_admissions)'
      )
  ) as storage_policy_uninstalled,
  not exists (
    select 1
    from pg_policies
    where schemaname = 'realtime'
      and lower(coalesce(qual, '') || ' ' || coalesce(with_check, ''))
        ~ '(current_request_is_admitted|account_admission_pre_request|account_admissions)'
  ) as realtime_policy_uninstalled,
  not exists (select 1 from projection_mismatch) as projection_consistent,
  (select count(*) = 0 from tongs.beta_access_invitation_events) as no_invitation_dispatch;
