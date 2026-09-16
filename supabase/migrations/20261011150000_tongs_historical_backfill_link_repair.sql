-- Reconstruct immutable provenance links for the historical simulator
-- consumptions canonically backfilled by 20261011140000.
--
-- This migration is intentionally provenance-only: it does not update source
-- simulator rows, canonical consumptions, balances, or accounting journals.

begin;

create unique index if not exists legacy_simulator_backfills_original_journal_uidx
  on tongs.legacy_simulator_consumption_backfills(original_journal_event_id);

create or replace function tongs._legacy_simulator_backfill_link_candidates()
returns table(
  source_kind text,
  source_id uuid,
  source_reservation_id uuid,
  source_operation_id text,
  source_consumed_at timestamptz,
  deposit_id uuid,
  user_id uuid,
  workspace_id uuid,
  route_code text,
  model text,
  credit_units_consumed bigint,
  recognized_revenue_micros bigint,
  canonical_consumption_id uuid,
  original_journal_event_id uuid,
  evidence_json jsonb,
  evidence_hash text
)
language sql
stable
security definer
set search_path = pg_catalog
as $$
  with source as (
    select
      'hearth_test_simulator'::text source_kind,
      consumption.id source_id,
      consumption.reservation_id source_reservation_id,
      consumption.operation_id source_operation_id,
      consumption.consumed_at source_consumed_at,
      consumption.deposit_id,
      consumption.user_id,
      quote.workspace_id,
      'hearth.chat_completion'::text route_code,
      null::text model,
      consumption.credit_units_consumed,
      consumption.recognized_test_revenue_micros recognized_revenue_micros,
      consumption.journal_event_id
    from tongs.test_customer_deposit_consumptions consumption
    join tongs.test_funding_reservations reservation
      on reservation.id = consumption.reservation_id
     and reservation.deposit_id = consumption.deposit_id
     and reservation.user_id = consumption.user_id
     and reservation.operation_id = consumption.operation_id
    join tongs.test_customer_spending_quotes quote
      on quote.id = reservation.quote_id
     and quote.user_id = consumption.user_id
     and quote.operation_id = consumption.operation_id

    union all

    select
      'openai_test_certification'::text,
      consumption.id,
      consumption.reservation_id,
      consumption.operation_id,
      consumption.consumed_at,
      consumption.deposit_id,
      consumption.user_id,
      batch.workspace_id,
      operation.route_code,
      term.model,
      consumption.credit_units_consumed,
      consumption.recognized_test_revenue_micros,
      consumption.journal_event_id
    from tongs.openai_text_test_certification_consumptions consumption
    join tongs.openai_text_test_certification_reservations reservation
      on reservation.id = consumption.reservation_id
     and reservation.deposit_id = consumption.deposit_id
     and reservation.user_id = consumption.user_id
     and reservation.operation_id = consumption.operation_id
    join tongs.openai_text_test_certification_operations operation
      on operation.id = reservation.operation_record_id
     and operation.operation_id = consumption.operation_id
    join tongs.openai_text_test_certification_terms term
      on term.id = operation.term_id
     and term.route_code = operation.route_code
    join tongs.openai_text_test_certification_batches batch
      on batch.id = operation.batch_id
     and batch.id = reservation.batch_id
     and batch.user_id = consumption.user_id
     and batch.deposit_id = consumption.deposit_id
  ), matched as (
    select
      source.*,
      canonical.id canonical_consumption_id,
      jsonb_build_object(
        'mapping_contract', 'forge.legacy-simulator-canonical-link.v1',
        'source_kind', source.source_kind,
        'source_id', source.source_id,
        'source_reservation_id', source.source_reservation_id,
        'source_operation_id', source.source_operation_id,
        'source_consumed_at', source.source_consumed_at,
        'deposit_id', source.deposit_id,
        'user_id', source.user_id,
        'workspace_id', source.workspace_id,
        'route_code', source.route_code,
        'model', source.model,
        'credit_units_consumed', source.credit_units_consumed,
        'recognized_revenue_micros', source.recognized_revenue_micros,
        'canonical_consumption_id', canonical.id,
        'original_journal_event_id', source.journal_event_id,
        'canonical_allocation_key', canonical.allocation_key,
        'canonical_legacy_source_kind', canonical.metadata_json->>'legacy_source_kind',
        'canonical_legacy_source_id', canonical.metadata_json->>'legacy_source_id',
        'journal_event_type', journal.event_type,
        'journal_source_type', journal.source_type,
        'journal_source_id', journal.source_id,
        'match_basis', jsonb_build_array(
          'source_kind_and_source_id',
          'deposit_and_operation_id',
          'canonical_preserved_legacy_metadata',
          'canonical_allocation_key',
          'original_journal_event_id',
          'source_and_canonical_identity_fields'
        )
      ) evidence_json
    from source
    join tongs.customer_deposit_consumptions canonical
      on canonical.id = source.journal_event_id
     and canonical.deposit_id = source.deposit_id
     and canonical.user_id = source.user_id
     and canonical.operation_id = source.source_operation_id
     and canonical.credit_units_consumed = source.credit_units_consumed
     and canonical.recognized_revenue_micros = source.recognized_revenue_micros
     and canonical.journal_event_id = source.journal_event_id
     and canonical.consumed_at = source.source_consumed_at
     and canonical.allocation_key = 'legacy-simulator:' || source.source_kind || ':' || source.source_id::text
     and canonical.metadata_json->>'legacy_source_kind' = source.source_kind
     and canonical.metadata_json->>'legacy_source_id' = source.source_id::text
     and canonical.metadata_json->>'journal_reused' = 'true'
    join tongs.accounting_journal_events journal
      on journal.id = source.journal_event_id
     and journal.event_type = 'test_customer_deposit_consumed'
     and journal.source_type = 'simulated_forge_operation'
     and journal.source_id = source.source_operation_id
     and journal.user_id = source.user_id
     and journal.metadata_json->>'simulated' = 'true'
     and (journal.metadata_json->>'credit_units_consumed')::bigint = source.credit_units_consumed
     and (journal.metadata_json->>'recognized_test_revenue_micros')::bigint = source.recognized_revenue_micros
     and (
       (source.source_kind = 'hearth_test_simulator'
        and journal.metadata_json->>'reservation_id' = source.source_reservation_id::text)
       or
       (source.source_kind = 'openai_test_certification'
        and journal.metadata_json->>'route_code' = source.route_code)
     )
  )
  select
    matched.source_kind,
    matched.source_id,
    matched.source_reservation_id,
    matched.source_operation_id,
    matched.source_consumed_at,
    matched.deposit_id,
    matched.user_id,
    matched.workspace_id,
    matched.route_code,
    matched.model,
    matched.credit_units_consumed,
    matched.recognized_revenue_micros,
    matched.canonical_consumption_id,
    matched.journal_event_id,
    matched.evidence_json,
    encode(extensions.digest(convert_to(matched.evidence_json::text, 'utf8'), 'sha256'), 'hex')
  from matched
$$;

revoke all on function tongs._legacy_simulator_backfill_link_candidates()
  from public, anon, authenticated, service_role;

create or replace function tongs._repair_legacy_simulator_backfill_links()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_source_count bigint;
  v_candidate_count bigint;
  v_distinct_source_count bigint;
  v_distinct_canonical_count bigint;
  v_backfills_inserted bigint;
  v_conversions_inserted bigint;
begin
  select
    (select count(*) from tongs.test_customer_deposit_consumptions)
      + (select count(*) from tongs.openai_text_test_certification_consumptions)
  into v_source_count;

  select count(*), count(distinct (source_kind, source_id)), count(distinct canonical_consumption_id)
  into v_candidate_count, v_distinct_source_count, v_distinct_canonical_count
  from tongs._legacy_simulator_backfill_link_candidates();

  if v_candidate_count <> v_source_count
     or v_distinct_source_count <> v_source_count
     or v_distinct_canonical_count <> v_source_count then
    raise exception
      'legacy simulator provenance is missing or ambiguous: sources %, candidates %, distinct sources %, distinct canonical %',
      v_source_count, v_candidate_count, v_distinct_source_count, v_distinct_canonical_count
      using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from tongs.legacy_simulator_consumption_backfills existing
    where not exists (
      select 1
      from tongs._legacy_simulator_backfill_link_candidates() candidate
      where candidate.source_kind = existing.source_kind
        and candidate.source_id = existing.source_id
        and candidate.canonical_consumption_id = existing.canonical_consumption_id
        and candidate.original_journal_event_id = existing.original_journal_event_id
    )
  ) then
    raise exception 'existing simulator backfill mapping conflicts with preserved evidence'
      using errcode = '23505';
  end if;

  if exists (
    select 1
    from tongs.legacy_credit_conversion_mappings existing
    where existing.source_kind in ('hearth_test_simulator', 'openai_test_certification')
      and not exists (
        select 1
        from tongs._legacy_simulator_backfill_link_candidates() candidate
        where candidate.source_kind = existing.source_kind
          and candidate.source_id::text = existing.source_id
          and existing.canonical_kind = 'customer_deposit_consumption'
          and candidate.canonical_consumption_id = existing.canonical_id
          and candidate.credit_units_consumed = existing.converted_credit_units
          and existing.reused_existing_journal_event
          and existing.evidence_json->>'evidence_hash' = candidate.evidence_hash
      )
  ) then
    raise exception 'existing simulator conversion mapping conflicts with preserved evidence'
      using errcode = '23505';
  end if;

  insert into tongs.legacy_simulator_consumption_backfills(
    source_kind, source_id, canonical_consumption_id, original_journal_event_id
  )
  select source_kind, source_id, canonical_consumption_id, original_journal_event_id
  from tongs._legacy_simulator_backfill_link_candidates()
  on conflict (source_kind, source_id) do nothing;
  get diagnostics v_backfills_inserted = row_count;

  insert into tongs.legacy_credit_conversion_mappings(
    id, case_id, source_kind, source_id, canonical_kind, canonical_id,
    converted_credit_units, reused_existing_journal_event, evidence_json
  )
  select
    extensions.uuid_generate_v5(
      '2fdd83b2-72f6-467f-9c57-c901640e20b4'::uuid,
      candidate.source_kind || ':' || candidate.source_id::text
    ),
    reconciliation.id,
    candidate.source_kind,
    candidate.source_id::text,
    'customer_deposit_consumption',
    candidate.canonical_consumption_id,
    candidate.credit_units_consumed,
    true,
    candidate.evidence_json || jsonb_build_object('evidence_hash', candidate.evidence_hash)
  from tongs._legacy_simulator_backfill_link_candidates() candidate
  left join tongs.legacy_credit_reconciliation_cases reconciliation
    on reconciliation.user_id = candidate.user_id
  on conflict (source_kind, source_id) do nothing;
  get diagnostics v_conversions_inserted = row_count;

  if (select count(*) from tongs.legacy_simulator_consumption_backfills) <> v_source_count
     or (select count(*) from tongs.legacy_credit_conversion_mappings
         where source_kind in ('hearth_test_simulator', 'openai_test_certification')) <> v_source_count then
    raise exception 'legacy simulator provenance mapping did not close exactly once'
      using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'source_count', v_source_count,
    'backfills_inserted', v_backfills_inserted,
    'conversions_inserted', v_conversions_inserted,
    'backfill_count', (select count(*) from tongs.legacy_simulator_consumption_backfills),
    'conversion_count', (select count(*) from tongs.legacy_credit_conversion_mappings
      where source_kind in ('hearth_test_simulator', 'openai_test_certification'))
  );
end
$$;

revoke all on function tongs._repair_legacy_simulator_backfill_links()
  from public, anon, authenticated, service_role;

do $$
declare
  v_first jsonb;
  v_replay jsonb;
begin
  v_first := tongs._repair_legacy_simulator_backfill_links();
  v_replay := tongs._repair_legacy_simulator_backfill_links();
  if (v_replay->>'backfills_inserted')::bigint <> 0
     or (v_replay->>'conversions_inserted')::bigint <> 0 then
    raise exception 'legacy simulator provenance repair is not idempotent: %', v_replay
      using errcode = 'P0001';
  end if;
end
$$;

drop function tongs._repair_legacy_simulator_backfill_links();
drop function tongs._legacy_simulator_backfill_link_candidates();

comment on table tongs.legacy_simulator_consumption_backfills is
  'Immutable exact-identity links from retired simulator consumption to canonical consumption; journals and economic rows are reused, never recreated.';

commit;
