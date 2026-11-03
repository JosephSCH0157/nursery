begin read only;

do $active_catalog_contract$
declare
  v_pre_request text;
  v_target_count integer;
  v_data_policy_count integer;
  v_storage_policy_count integer;
begin
  select coalesce((
    select split_part(item.value, '=', 2)
    from pg_db_role_setting setting
    join pg_roles role on role.oid = setting.setrole
    cross join lateral unnest(setting.setconfig) item(value)
    where role.rolname = 'authenticator'
      and item.value like 'pgrst.db_pre_request=%'
    limit 1
  ), '') into v_pre_request;
  if v_pre_request <> 'tongs.account_admission_pre_request' then
    raise exception 'active catalog has the wrong PostgREST pre-request hook';
  end if;

  select count(*) into v_target_count
  from pg_class relation
  join pg_namespace namespace on namespace.oid = relation.relnamespace
  where namespace.nspname in ('public', 'tongs')
    and relation.relkind in ('r', 'p')
    and (
      has_table_privilege('authenticated', relation.oid, 'SELECT')
      or has_table_privilege('authenticated', relation.oid, 'INSERT')
      or has_table_privilege('authenticated', relation.oid, 'UPDATE')
      or has_table_privilege('authenticated', relation.oid, 'DELETE')
    );
  select count(*) into v_data_policy_count
  from pg_policies
  where schemaname in ('public', 'tongs')
    and policyname = 'forge_account_admission_required_v1';
  if v_target_count <> 250 or v_data_policy_count <> v_target_count then
    raise exception 'active Data API policy inventory differs';
  end if;
  if exists (
    select 1
    from (
      select namespace.nspname as schema_name, relation.relname as relation_name, relation.oid
      from pg_class relation
      join pg_namespace namespace on namespace.oid = relation.relnamespace
      where namespace.nspname in ('public', 'tongs')
        and relation.relkind in ('r', 'p')
        and (
          has_table_privilege('authenticated', relation.oid, 'SELECT')
          or has_table_privilege('authenticated', relation.oid, 'INSERT')
          or has_table_privilege('authenticated', relation.oid, 'UPDATE')
          or has_table_privilege('authenticated', relation.oid, 'DELETE')
        )
    ) target
    full join (
      select namespace.nspname as schema_name, relation.relname as relation_name, policy.oid
      from pg_policy policy
      join pg_class relation on relation.oid = policy.polrelid
      join pg_namespace namespace on namespace.oid = relation.relnamespace
      where policy.polname = 'forge_account_admission_required_v1'
    ) policy
      on policy.schema_name = target.schema_name
      and policy.relation_name = target.relation_name
    where target.oid is null or policy.oid is null
  ) then
    raise exception 'active Data API policy relation mapping differs';
  end if;
  if exists (
    select 1 from pg_policies
    where schemaname in ('public', 'tongs')
      and policyname = 'forge_account_admission_required_v1'
      and (
        permissive <> 'RESTRICTIVE'
        or lower(cmd) <> 'all'
        or roles <> array['authenticated']::name[]
        or qual <> 'tongs.current_request_is_admitted()'
        or with_check <> 'tongs.current_request_is_admitted()'
      )
  ) then
    raise exception 'active Data API policy definition differs';
  end if;

  select count(*) into v_storage_policy_count
  from pg_policies
  where schemaname = 'storage' and tablename = 'objects'
    and policyname like 'forge_account_admission_storage_%_v1';
  if v_storage_policy_count <> 3 then
    raise exception 'active Storage policy inventory differs';
  end if;
  if exists (
    select 1
    from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname like 'forge_account_admission_storage_%_v1'
      and not (
        permissive = 'RESTRICTIVE'
        and roles = array['authenticated']::name[]
        and (
          (policyname = 'forge_account_admission_storage_select_v1' and lower(cmd) = 'select'
            and qual = 'tongs.current_request_is_admitted()' and with_check is null)
          or (policyname = 'forge_account_admission_storage_insert_v1' and lower(cmd) = 'insert'
            and qual is null and with_check = 'tongs.current_request_is_admitted()')
          or (policyname = 'forge_account_admission_storage_update_v1' and lower(cmd) = 'update'
            and qual = 'tongs.current_request_is_admitted()' and with_check = 'tongs.current_request_is_admitted()')
        )
      )
  ) then
    raise exception 'active Storage policy definition differs';
  end if;
  if exists (
    select 1 from pg_policies
    where policyname like 'forge_account_admission%'
      and not (
        (schemaname in ('public', 'tongs') and policyname = 'forge_account_admission_required_v1')
        or (schemaname = 'storage' and tablename = 'objects' and policyname in (
          'forge_account_admission_storage_select_v1',
          'forge_account_admission_storage_insert_v1',
          'forge_account_admission_storage_update_v1'
        ))
      )
  ) then
    raise exception 'unexpected active admission policy exists';
  end if;
  if exists (
    select 1 from pg_db_role_setting setting
    cross join lateral unnest(setting.setconfig) item(value)
    where item.value like 'forge.account_admission_enforcement=%'
  ) then
    raise exception 'financial admission enforcement persisted outside the pre-request transaction';
  end if;
end
$active_catalog_contract$;

rollback;
