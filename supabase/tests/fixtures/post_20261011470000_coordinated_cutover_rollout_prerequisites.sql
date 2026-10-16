-- Disposable-only reconstruction of the reviewed 2026-09-12 coordinated
-- OpenAI cutover. These rows are synthetic replay representations; they do
-- not reproduce production identities, timestamps, or private payloads.
begin;

do $$
begin
  if current_database() <> 'postgres' then
    raise exception 'coordinated-cutover replay requires database postgres';
  end if;
  if current_setting('forge.local_historical_replay', true)
       is distinct from 'coordinated-cutover-rollouts-v1' then
    raise exception 'local coordinated-cutover replay guard is missing'
      using errcode='42501';
  end if;
  if (select count(*) from supabase_migrations.schema_migrations
      where version='20261011470000') <> 1
     or exists (
       select 1 from supabase_migrations.schema_migrations
       where version>'20261011470000'
     ) then
    raise exception 'local coordinated-cutover replay requires the exact 20261011470000 boundary';
  end if;
  if not exists (
    select 1 from tongs.platform_operators
    where user_id='fe000000-0000-4000-8000-000000000001'
      and reason='Local-only historical prerequisite for 20260916110806'
  ) then
    raise exception 'local coordinated-cutover replay requires the exact synthetic operator identity';
  end if;
end $$;

create temporary table coordinated_cutover_expected_routes(
  route_code text primary key,
  revision_one_reason text not null
) on commit drop;

insert into coordinated_cutover_expected_routes(route_code,revision_one_reason) values
  ('anvil.realtime_transcription','Audio-transcription coordination deployed with pricing and execution inactive.'),
  ('hammer.transcript_cleanup','Exact rates and loss controls installed; no OpenAI execution activation approved.'),
  ('hammer.transcript_prep','Audio-transcription coordination deployed with pricing and execution inactive.'),
  ('hammer.transcript_regeneration','Audio-transcription coordination deployed with pricing and execution inactive.'),
  ('hearth.research_synthesis','Exact rates and loss controls installed; no OpenAI execution activation approved.'),
  ('hearth.speech_transcription','Audio-transcription coordination deployed with pricing and execution inactive.'),
  ('motion.broll_interpretation','Exact rates and loss controls installed; no OpenAI execution activation approved.'),
  ('quench.metadata','Exact rates and loss controls installed; no OpenAI execution activation approved.'),
  ('shorts.discovery','Exact rates and loss controls installed; no OpenAI execution activation approved.'),
  ('visual.narrative_interpretation','Exact rates and loss controls installed; no OpenAI execution activation approved.'),
  ('visual.unified_plan','Exact rates and loss controls installed; no OpenAI execution activation approved.');

create temporary table coordinated_cutover_actual_rollouts on commit drop as
select r.route_code,r.revision,r.mode,r.cost_policy_revision_id,r.reason,r.funding_scope
from tongs.openai_text_rollout_revisions r
where r.route_code <> 'hearth.chat_completion';

create function pg_temp.assert_coordinated_cutover_baseline()
returns void language plpgsql set search_path=pg_catalog as $$
begin
  if (select count(*) from pg_temp.coordinated_cutover_expected_routes) <> 11
     or (select count(*) from pg_temp.coordinated_cutover_actual_rollouts) <> 11
     or exists (
       select 1
       from pg_temp.coordinated_cutover_expected_routes expected
       left join pg_temp.coordinated_cutover_actual_rollouts actual
         on actual.route_code=expected.route_code
        and actual.revision=1
        and actual.mode='inactive'
        and actual.funding_scope='all'
        and actual.cost_policy_revision_id is null
        and actual.reason=expected.revision_one_reason
       where actual.route_code is null
     )
     or exists (
       select 1 from pg_temp.coordinated_cutover_actual_rollouts actual
       where not exists (
         select 1 from pg_temp.coordinated_cutover_expected_routes expected
         where expected.route_code=actual.route_code
       )
     )
     or exists (
       select route_code from pg_temp.coordinated_cutover_actual_rollouts
       group by route_code having count(*)<>1
     ) then
    raise exception 'coordinated-cutover replay requires exactly eleven reviewed revision-1 route baselines';
  end if;
end $$;

-- Negative proofs exercise the exact-set validator without changing persistent
-- authority. Each caught exception rolls its temporary mutation back as a
-- PL/pgSQL subtransaction.
do $$
begin
  begin
    delete from pg_temp.coordinated_cutover_actual_rollouts
    where route_code='shorts.discovery';
    perform pg_temp.assert_coordinated_cutover_baseline();
    raise exception 'missing-route negative proof unexpectedly passed';
  exception when raise_exception then
    if sqlerrm<>'coordinated-cutover replay requires exactly eleven reviewed revision-1 route baselines' then raise; end if;
  end;
  begin
    insert into pg_temp.coordinated_cutover_actual_rollouts
    select * from pg_temp.coordinated_cutover_actual_rollouts
    where route_code='shorts.discovery';
    perform pg_temp.assert_coordinated_cutover_baseline();
    raise exception 'duplicate-route negative proof unexpectedly passed';
  exception when raise_exception then
    if sqlerrm<>'coordinated-cutover replay requires exactly eleven reviewed revision-1 route baselines' then raise; end if;
  end;
  begin
    update pg_temp.coordinated_cutover_actual_rollouts set mode='enforce'
    where route_code='hammer.transcript_cleanup';
    perform pg_temp.assert_coordinated_cutover_baseline();
    raise exception 'conflicting-route negative proof unexpectedly passed';
  exception when raise_exception then
    if sqlerrm<>'coordinated-cutover replay requires exactly eleven reviewed revision-1 route baselines' then raise; end if;
  end;
end $$;

select pg_temp.assert_coordinated_cutover_baseline();

create function pg_temp.replay_table_count(p_table text)
returns bigint language plpgsql set search_path=pg_catalog as $$
declare v_regclass regclass; v_count bigint;
begin
  v_regclass:=to_regclass(p_table);
  if v_regclass is null then return null; end if;
  execute format('select count(*) from %s',v_regclass) into v_count;
  return v_count;
end $$;

create temporary table coordinated_cutover_authority_snapshot(
  table_name text primary key,
  row_count bigint
) on commit drop;

insert into coordinated_cutover_authority_snapshot(table_name,row_count)
select table_name,pg_temp.replay_table_count(table_name)
from unnest(array[
  'tongs.owner_operating_budgets',
  'tongs.owner_operating_budget_revisions',
  'tongs.ai_funding_preference_revisions',
  'tongs.openai_text_user_model_preference_revisions',
  'tongs.customer_paid_execution_scope_authorizations',
  'tongs.paid_execution_aggregate_assignments',
  'tongs.openai_text_funding_bindings',
  'tongs.funding_reservations',
  'tongs.customer_spending_quotes',
  'tongs.customer_deposits',
  'tongs.account_balances',
  'tongs.private_pricing_policies',
  'tongs.private_pricing_revisions',
  'tongs.private_pricing_publications',
  'tongs.openai_text_provider_rate_revisions',
  'tongs.openai_text_cost_policy_revisions',
  'tongs.accounting_journal_entries',
  'tongs.accounting_journal_events',
  'tongs.owner_cost_provider_attempts',
  'tongs.paid_media_provider_attempts',
  'tongs.credential_lifecycle_records',
  'tongs.credential_lifecycle_events'
]) as names(table_name);

do $$
begin
  if (select mode from tongs.openai_text_rollout_revisions
      where route_code='hammer.transcript_cleanup'
      order by revision desc limit 1) <> 'inactive'
     or exists (
       select 1 from tongs.customer_paid_execution_scope_authorizations
       where route_code='hammer.transcript_cleanup'
     ) then
    raise exception 'Hammer was not fail-closed before coordinated-cutover replay';
  end if;
end $$;

insert into tongs.openai_text_rollout_revisions(
  route_code,revision,mode,cost_policy_revision_id,reason,actor_id,funding_scope
)
select route_code,2,'halt_new',null,
  'Synthetic historical replay of the approved 2026-09-12 coordinated OpenAI cutover; not production authority.',
  'fe000000-0000-4000-8000-000000000001','forge'
from coordinated_cutover_expected_routes
order by route_code;

do $$
declare v_snapshot record;
begin
  if (select count(*) from tongs.openai_text_rollout_revisions revision
      join pg_temp.coordinated_cutover_expected_routes expected using(route_code)
      where revision.revision=2 and revision.mode='halt_new'
        and revision.funding_scope='forge' and revision.cost_policy_revision_id is null
        and revision.actor_id='fe000000-0000-4000-8000-000000000001'
        and revision.reason='Synthetic historical replay of the approved 2026-09-12 coordinated OpenAI cutover; not production authority.') <> 11
     or exists (
       select 1 from tongs.openai_text_rollout_revisions revision
       join pg_temp.coordinated_cutover_expected_routes expected using(route_code)
       where revision.revision not in (1,2)
     ) then
    raise exception 'coordinated-cutover replay did not append exactly eleven reviewed revision-2 halts';
  end if;

  for v_snapshot in select * from pg_temp.coordinated_cutover_authority_snapshot loop
    if pg_temp.replay_table_count(v_snapshot.table_name) is distinct from v_snapshot.row_count then
      raise exception 'coordinated-cutover replay changed prohibited authority table %',v_snapshot.table_name;
    end if;
  end loop;

  if (select mode from tongs.openai_text_rollout_revisions
      where route_code='hammer.transcript_cleanup'
      order by revision desc limit 1) <> 'halt_new'
     or exists (
       select 1 from tongs.customer_paid_execution_scope_authorizations
       where route_code='hammer.transcript_cleanup'
     ) then
    raise exception 'Hammer was not fail-closed after coordinated-cutover replay';
  end if;
end $$;

commit;
