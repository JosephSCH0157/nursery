-- LOCAL CERTIFICATION FIXTURE ONLY. Never place this file under
-- supabase/migrations and never execute it against a linked database.
--
-- This creates the minimum synthetic legacy owner-principal state required by
-- the unchanged 20261011940000 migration. The identity, event, reason, and
-- timestamps are synthetic replay simulation, not production evidence.

begin;

create function pg_temp.is_guarded_owner_principal_replay(
  p_marker text,
  p_database_name text,
  p_latest_migration text,
  p_fixture_identity_verified boolean,
  p_legacy_authority_empty boolean,
  p_canonical_authority_absent boolean
) returns boolean
language sql
immutable
set search_path=pg_catalog
as $$
  select coalesce((
    p_marker='owner-principal-historical-v1'
    and p_database_name='postgres'
    and p_latest_migration='20261011930000'
    and p_fixture_identity_verified is true
    and p_legacy_authority_empty is true
    and p_canonical_authority_absent is true
  ),false)
$$;

do $$
declare
  v_fixture_user constant uuid := 'fe000000-0000-4000-8000-000000000001';
  v_marker text := current_setting('forge.local_historical_replay',true);
  v_latest text;
  v_fixture_identity boolean;
  v_legacy_empty boolean;
  v_canonical_absent boolean;
begin
  select max(version) into v_latest
  from supabase_migrations.schema_migrations;

  select
    (select count(*) from auth.users where id=v_fixture_user)=1
    and (select count(*) from tongs.platform_operators
      where user_id=v_fixture_user
        and granted_by=v_fixture_user
        and reason='Local-only historical prerequisite for 20260916110806')=1
    and (select count(*) from tongs.workspaces
      where id='fe000000-0000-4000-8000-000000000201'
        and created_by=v_fixture_user
        and name='Mid-September local replay fixture')=1
    into v_fixture_identity;

  select not exists(select 1 from tongs.owner_testing_principals)
    and not exists(select 1 from tongs.owner_testing_principal_events)
    into v_legacy_empty;
  v_canonical_absent :=
    to_regclass('tongs.account_authority_classifications') is null
    and to_regclass('tongs.account_authority_classification_events') is null;

  -- Exercise each SQL-visible guard independently. Host and container identity
  -- are enforced and negatively tested by the invoking replay harness.
  if pg_temp.is_guarded_owner_principal_replay(
       null,current_database(),v_latest,true,true,true)
     or pg_temp.is_guarded_owner_principal_replay(
       'wrong-marker',current_database(),v_latest,true,true,true)
     or pg_temp.is_guarded_owner_principal_replay(
       'owner-principal-historical-v1','not-the-disposable-database',v_latest,true,true,true)
     or pg_temp.is_guarded_owner_principal_replay(
       'owner-principal-historical-v1',current_database(),'20261011920000',true,true,true)
     or pg_temp.is_guarded_owner_principal_replay(
       'owner-principal-historical-v1',current_database(),v_latest,false,true,true)
     or pg_temp.is_guarded_owner_principal_replay(
       'owner-principal-historical-v1',current_database(),v_latest,true,false,true)
     or pg_temp.is_guarded_owner_principal_replay(
       'owner-principal-historical-v1',current_database(),v_latest,true,true,false)
  then
    raise exception 'owner-principal replay guard accepted a spoofed prerequisite';
  end if;

  if v_marker is distinct from 'owner-principal-historical-v1' then
    raise exception 'local owner-principal replay guard is missing'
      using errcode='42501';
  end if;
  if current_database() <> 'postgres' then
    raise exception 'local owner-principal replay requires the disposable postgres database'
      using errcode='42501';
  end if;
  if v_latest is distinct from '20261011930000'
     or exists(select 1 from supabase_migrations.schema_migrations
               where version='20261011940000') then
    raise exception 'local owner-principal replay requires the exact 20261011930000 boundary'
      using errcode='P0001';
  end if;
  if not v_fixture_identity then
    raise exception 'local owner-principal replay fixture identity is invalid'
      using errcode='42501';
  end if;
  if not v_legacy_empty then
    raise exception 'local owner-principal replay requires zero legacy principal records'
      using errcode='23505';
  end if;
  if not v_canonical_absent then
    raise exception 'canonical account authority already exists'
      using errcode='42P07';
  end if;
  if not exists (
    select 1 from pg_trigger
    where tgrelid='tongs.owner_testing_principal_events'::regclass
      and tgname='owner_testing_principal_events_immutable'
      and tgenabled<>'D'
  ) then
    raise exception 'legacy principal event immutability is missing';
  end if;
end $$;

create temporary table owner_principal_replay_forbidden_counts(
  relation_name regclass primary key,
  row_count bigint not null
) on commit drop;

do $$
declare
  v_relation regclass;
  v_count bigint;
begin
  foreach v_relation in array array[
    'auth.users'::regclass,
    'tongs.platform_operators'::regclass,
    'tongs.ai_funding_preference_revisions'::regclass,
    'tongs.owner_operating_budgets'::regclass,
    'tongs.owner_operating_budget_revisions'::regclass,
    'tongs.openai_text_funding_bindings'::regclass,
    'tongs.customer_paid_execution_scope_authorizations'::regclass,
    'tongs.paid_execution_aggregate_assignments'::regclass,
    'tongs.customer_spending_quotes'::regclass,
    'tongs.funding_reservations'::regclass,
    'tongs.customer_deposits'::regclass,
    'tongs.account_balances'::regclass,
    'tongs.accounting_journal_events'::regclass,
    'tongs.accounting_journal_entries'::regclass,
    'tongs.openai_text_provider_captures'::regclass,
    'tongs.paid_media_provider_attempts'::regclass,
    'tongs.owner_cost_provider_attempts'::regclass
  ] loop
    execute format('select count(*) from %s',v_relation) into v_count;
    insert into owner_principal_replay_forbidden_counts(relation_name,row_count)
    values(v_relation,v_count);
  end loop;
end $$;

insert into tongs.owner_testing_principals(
  user_id,status,revision,reason,configured_by
) values (
  'fe000000-0000-4000-8000-000000000001',
  'enabled',1,
  'Synthetic historical replay owner principal; not production authority.',
  'fe000000-0000-4000-8000-000000000001'
);

insert into tongs.owner_testing_principal_events(
  id,user_id,revision,status,reason,actor_id
) values (
  'fe130000-0000-4000-8000-000000000001',
  'fe000000-0000-4000-8000-000000000001',
  1,'enabled',
  'Synthetic historical replay owner principal; not production authority.',
  'fe000000-0000-4000-8000-000000000001'
);

do $$
declare
  v_relation regclass;
  v_before bigint;
  v_after bigint;
begin
  if (select count(*) from tongs.owner_testing_principals)<>1
     or (select count(*) from tongs.owner_testing_principals
         where user_id='fe000000-0000-4000-8000-000000000001'
           and status='enabled' and revision=1
           and configured_by='fe000000-0000-4000-8000-000000000001'
           and reason='Synthetic historical replay owner principal; not production authority.')<>1
     or (select count(*) from tongs.owner_testing_principal_events)<>1
     or (select count(*) from tongs.owner_testing_principal_events
         where id='fe130000-0000-4000-8000-000000000001'
           and user_id='fe000000-0000-4000-8000-000000000001'
           and revision=1 and status='enabled'
           and actor_id='fe000000-0000-4000-8000-000000000001'
           and reason='Synthetic historical replay owner principal; not production authority.')<>1
  then
    raise exception 'synthetic owner-principal prerequisite is not exact';
  end if;

  for v_relation,v_before in
    select relation_name,row_count from owner_principal_replay_forbidden_counts
  loop
    execute format('select count(*) from %s',v_relation) into v_after;
    if v_after<>v_before then
      raise exception 'owner-principal fixture changed prohibited relation % (% -> %)',
        v_relation,v_before,v_after;
    end if;
  end loop;
end $$;

commit;
