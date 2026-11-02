-- Governed Slice 2C activation transaction.
--
-- The deployment wrapper must set these session settings before executing this
-- file:
--   forge.activation_application_commit = exact deployed 40-hex commit
--   forge.activation_operator = named owner-authorized operator
--
-- This is deliberately not a migration. Installing migration 431 remains
-- inactive; this transaction is a separately authorized production action.

begin;

do $activation_preflight$
declare
  v_application_commit text := current_setting('forge.activation_application_commit', true);
  v_operator text := current_setting('forge.activation_operator', true);
  v_exposed_table_count integer;
begin
  if v_application_commit !~ '^[0-9a-f]{40}$' then
    raise exception 'exact deployed application commit is required' using errcode = '22023';
  end if;
  if nullif(btrim(v_operator), '') is null then
    raise exception 'named activation operator is required' using errcode = '22023';
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
    raise exception 'supported Forge database lineage is required' using errcode = '55000';
  end if;
  if tongs.account_admission_enforcement_version() <> 'forge.account-admission-enforcement.v2' then
    raise exception 'prepared admission contract mismatch' using errcode = '55000';
  end if;

  if exists (
    select 1
    from pg_db_role_setting setting
    join pg_roles role on role.oid = setting.setrole
    cross join lateral unnest(setting.setconfig) item(value)
    where role.rolname = 'authenticator'
      and item.value like 'pgrst.db_pre_request=%'
  ) or current_setting('pgrst.db_pre_request', true) not in (null, '') then
    raise exception 'admission enforcement is not in the exact inactive state' using errcode = '55000';
  end if;

  if exists (
    select 1 from pg_policies
    where policyname in (
      'forge_account_admission_required_v1',
      'forge_account_admission_storage_select_v1',
      'forge_account_admission_storage_insert_v1',
      'forge_account_admission_storage_update_v1'
    )
  ) then
    raise exception 'admission policy name already exists' using errcode = '55000';
  end if;

  select count(*) into v_exposed_table_count
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
  if v_exposed_table_count = 0 then
    raise exception 'authenticated Data API table inventory is empty' using errcode = '55000';
  end if;
  if exists (
    select 1
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
      and not relation.relrowsecurity
  ) then
    raise exception 'authenticated Data API table without RLS' using errcode = '55000';
  end if;

  if to_regclass('storage.objects') is null
     or not (select relrowsecurity from pg_class where oid = 'storage.objects'::regclass) then
    raise exception 'storage.objects RLS contract is unavailable' using errcode = '55000';
  end if;
  if exists (
    select 1 from pg_policies policy
    where policy.schemaname = 'storage'
      and policy.tablename = 'objects'
      and 'authenticated' = any(policy.roles)
      and lower(policy.cmd) not in ('select', 'insert', 'update')
  ) then
    raise exception 'unreviewed authenticated Storage command policy exists' using errcode = '55000';
  end if;
end
$activation_preflight$;

do $data_api_policies$
declare
  target record;
begin
  for target in
    select namespace.nspname as schema_name, relation.relname as relation_name
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
    order by namespace.nspname, relation.relname
  loop
    execute format(
      'create policy forge_account_admission_required_v1 on %I.%I as restrictive for all to authenticated using (tongs.current_request_is_admitted()) with check (tongs.current_request_is_admitted())',
      target.schema_name,
      target.relation_name
    );
  end loop;
end
$data_api_policies$;

create policy forge_account_admission_storage_select_v1
on storage.objects
as restrictive
for select
to authenticated
using (tongs.current_request_is_admitted());

create policy forge_account_admission_storage_insert_v1
on storage.objects
as restrictive
for insert
to authenticated
with check (tongs.current_request_is_admitted());

create policy forge_account_admission_storage_update_v1
on storage.objects
as restrictive
for update
to authenticated
using (tongs.current_request_is_admitted())
with check (tongs.current_request_is_admitted());

alter role authenticator
  set pgrst.db_pre_request = 'tongs.account_admission_pre_request';

notify pgrst, 'reload config';

commit;
