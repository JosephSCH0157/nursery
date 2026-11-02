-- Governed Slice 2C database deactivation transaction.
--
-- Application/server enforcement must remain enabled until this transaction
-- and its PostVerify complete. This is a rollback of admission enforcement,
-- not a database restore and not a migration-history change.

begin;

do $deactivation_preflight$
declare
  v_expected integer;
  v_installed integer;
begin
  if nullif(btrim(current_setting('forge.deactivation_operator', true)), '') is null then
    raise exception 'named deactivation operator is required' using errcode = '22023';
  end if;
  if not exists (
    select 1
    from forge_meta.database_lineage lineage
    where lineage.singleton = true
      and lineage.lineage in ('historical-v1', 'baseline-v1')
      and (select max(version) from supabase_migrations.schema_migrations) = '20261102032722'
      and (select count(*) from supabase_migrations.schema_migrations) =
        case lineage.lineage when 'historical-v1' then 431 else 18 end
  ) then
    raise exception 'migration 431 must remain the installed head' using errcode = '55000';
  end if;

  select count(*) into v_expected
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
  select count(*) into v_installed
  from pg_policies policy
  where policy.schemaname in ('public', 'tongs')
    and policy.policyname = 'forge_account_admission_required_v1';
  if v_expected = 0 or v_installed <> v_expected then
    raise exception 'Data API admission policy set is incomplete or drifted' using errcode = '55000';
  end if;
  if (select count(*) from pg_policies policy
      where policy.schemaname = 'storage' and policy.tablename = 'objects'
        and policy.policyname in (
          'forge_account_admission_storage_select_v1',
          'forge_account_admission_storage_insert_v1',
          'forge_account_admission_storage_update_v1'
        )) <> 3 then
    raise exception 'Storage admission policy set is incomplete or drifted' using errcode = '55000';
  end if;
end
$deactivation_preflight$;

do $drop_data_api_policies$
declare
  target record;
begin
  for target in
    select policy.schemaname as schema_name, policy.tablename as relation_name
    from pg_policies policy
    where policy.schemaname in ('public', 'tongs')
      and policy.policyname = 'forge_account_admission_required_v1'
    order by policy.schemaname, policy.tablename
  loop
    execute format(
      'drop policy forge_account_admission_required_v1 on %I.%I',
      target.schema_name,
      target.relation_name
    );
  end loop;
end
$drop_data_api_policies$;

drop policy forge_account_admission_storage_select_v1 on storage.objects;
drop policy forge_account_admission_storage_insert_v1 on storage.objects;
drop policy forge_account_admission_storage_update_v1 on storage.objects;

alter role authenticator reset pgrst.db_pre_request;

notify pgrst, 'reload config';

commit;
