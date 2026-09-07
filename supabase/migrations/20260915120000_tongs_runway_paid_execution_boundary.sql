-- Runway paid-execution cutover boundary.
--
-- This release is deliberately installed in observe mode. It neither creates an
-- owner budget nor activates pricing, settlement, or provider execution. A later
-- platform-operator action may move the boundary to `enforce` only after the
-- existing shared controls and a capped owner budget have been activated.

begin;

create table tongs.runway_execution_rollout_revisions (
  revision integer primary key check (revision > 0),
  mode text not null check (mode in ('observe', 'enforce', 'halt_new')),
  reason text not null check (nullif(btrim(reason), '') is not null),
  actor_id uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

insert into tongs.runway_execution_rollout_revisions(revision, mode, reason)
values (
  1,
  'observe',
  'Runway boundary installed in observe mode; no paid-execution activation or owner budget was created.'
);

create trigger runway_execution_rollout_revisions_immutable
before update or delete on tongs.runway_execution_rollout_revisions
for each row execute function tongs._reject_accounting_mutation();

create table tongs.runway_funding_bindings (
  operation_id text primary key check (length(btrim(operation_id)) between 8 and 300),
  operation_fingerprint text not null check (operation_fingerprint ~ '^[0-9a-f]{64}$'),
  reservation_id uuid not null unique references tongs.funding_reservations(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  workspace_id uuid not null references tongs.workspaces(id) on delete restrict,
  model text not null check (model = 'gen4.5'),
  duration_seconds integer not null check (duration_seconds between 2 and 10),
  ratio text not null check (ratio in ('1280:720', '720:1280')),
  direct_provider_ceiling_micros bigint not null check (direct_provider_ceiling_micros > 0),
  supporting_cost_ceiling_micros bigint not null check (supporting_cost_ceiling_micros >= 0),
  total_cost_ceiling_micros bigint not null check (total_cost_ceiling_micros > 0),
  pricing_revision_id uuid not null references tongs.private_pricing_revisions(id) on delete restrict,
  cost_stack_json jsonb not null check (jsonb_typeof(cost_stack_json) = 'array'),
  created_at timestamptz not null default now(),
  check (total_cost_ceiling_micros = direct_provider_ceiling_micros + supporting_cost_ceiling_micros),
  -- Gen-4.5 is currently 12 Runway credits/second at $0.01/credit.
  check (direct_provider_ceiling_micros = duration_seconds::bigint * 120000)
);

create table tongs.runway_submission_boundary_events (
  id uuid primary key,
  operation_id text not null check (length(btrim(operation_id)) between 8 and 300),
  operation_fingerprint text not null check (operation_fingerprint ~ '^[0-9a-f]{64}$'),
  submission_attempt_id text not null check (length(btrim(submission_attempt_id)) between 8 and 300),
  rollout_revision integer not null references tongs.runway_execution_rollout_revisions(revision) on delete restrict,
  reservation_id uuid references tongs.funding_reservations(id) on delete restrict,
  decision text not null check (decision in (
    'legacy_observed', 'funded_authorized', 'duplicate_blocked',
    'unfunded_blocked', 'halted'
  )),
  reason text not null check (nullif(btrim(reason), '') is not null),
  lease_expires_at timestamptz,
  evidence_json jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence_json) = 'object'),
  created_at timestamptz not null default now()
);

create unique index runway_submission_boundary_one_paid_attempt_uidx
  on tongs.runway_submission_boundary_events(operation_id)
  where decision in ('legacy_observed', 'funded_authorized');
create unique index runway_submission_boundary_attempt_uidx
  on tongs.runway_submission_boundary_events(submission_attempt_id)
  where decision in ('legacy_observed', 'funded_authorized');

create table tongs.runway_execution_reconciliation_receipts (
  operation_id text primary key references tongs.runway_funding_bindings(operation_id) on delete restrict,
  reservation_id uuid not null unique references tongs.funding_reservations(id) on delete restrict,
  provider_task_id text not null unique check (nullif(btrim(provider_task_id), '') is not null),
  direct_provider_estimated_micros bigint not null check (direct_provider_estimated_micros >= 0),
  direct_provider_actual_micros bigint check (direct_provider_actual_micros is null or direct_provider_actual_micros >= 0),
  supporting_cost_status text not null default 'pending' check (supporting_cost_status in ('pending', 'finalized')),
  supporting_actual_micros bigint check (supporting_actual_micros is null or supporting_actual_micros >= 0),
  settlement_result_json jsonb,
  evidence_json jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence_json) = 'object'),
  provider_completed_at timestamptz not null default now(),
  reconciled_at timestamptz,
  check (
    (supporting_cost_status = 'pending' and direct_provider_actual_micros is null
      and supporting_actual_micros is null and settlement_result_json is null and reconciled_at is null)
    or
    (supporting_cost_status = 'finalized' and direct_provider_actual_micros is not null
      and supporting_actual_micros is not null and settlement_result_json is not null and reconciled_at is not null)
  )
);

create trigger runway_funding_bindings_immutable
before update or delete on tongs.runway_funding_bindings
for each row execute function tongs._reject_accounting_mutation();
create trigger runway_submission_boundary_events_immutable
before update or delete on tongs.runway_submission_boundary_events
for each row execute function tongs._reject_accounting_mutation();

create or replace function tongs._current_runway_execution_rollout()
returns tongs.runway_execution_rollout_revisions
language sql stable security definer set search_path = pg_catalog as $$
  select rollout.*
  from tongs.runway_execution_rollout_revisions rollout
  order by rollout.revision desc
  limit 1;
$$;

create or replace function tongs.bind_runway_funding_reservation(
  p_operation_id text,
  p_operation_fingerprint text,
  p_reservation_id uuid,
  p_user_id uuid,
  p_workspace_id uuid,
  p_model text,
  p_duration_seconds integer,
  p_ratio text
) returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_operation text := nullif(btrim(coalesce(p_operation_id, '')), '');
  v_reservation tongs.funding_reservations%rowtype;
  v_quote tongs.customer_spending_quotes%rowtype;
  v_pricing tongs.private_pricing_revisions%rowtype;
  v_policy tongs.private_pricing_policies%rowtype;
  v_existing tongs.runway_funding_bindings%rowtype;
  v_cost_stack jsonb;
  v_direct bigint;
  v_supporting bigint;
begin
  perform tongs._require_pricing_service_role();
  if v_operation is null or p_operation_fingerprint !~ '^[0-9a-f]{64}$'
     or p_reservation_id is null or p_user_id is null or p_workspace_id is null
     or p_model <> 'gen4.5' or p_duration_seconds not between 2 and 10
     or p_ratio not in ('1280:720', '720:1280') then
    raise exception 'invalid Runway funding binding' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('runway-funding-binding:' || v_operation, 0));
  select * into v_existing from tongs.runway_funding_bindings where operation_id = v_operation;
  if found then
    if v_existing.operation_fingerprint <> p_operation_fingerprint
       or v_existing.reservation_id <> p_reservation_id
       or v_existing.user_id <> p_user_id
       or v_existing.workspace_id <> p_workspace_id
       or v_existing.model <> p_model
       or v_existing.duration_seconds <> p_duration_seconds
       or v_existing.ratio <> p_ratio then
      raise exception 'Runway funding binding replay conflict' using errcode = '23505';
    end if;
    return jsonb_build_object('operation_id', v_operation, 'reservation_id', p_reservation_id,
      'replay', true, 'provider_execution_authorized', false);
  end if;
  select * into v_reservation from tongs.funding_reservations where id = p_reservation_id for update;
  if not found or v_reservation.operation_id <> v_operation
     or v_reservation.user_id <> p_user_id
     or v_reservation.funding_source_type not in ('customer_deposit', 'paid_allowance', 'owner_budget')
     or tongs._funding_reservation_state(v_reservation.id) <> 'reserved' then
    raise exception 'eligible reserved funding allocation not found' using errcode = 'P0002';
  end if;
  select * into v_quote from tongs.customer_spending_quotes where id = v_reservation.quote_id;
  if not found or v_quote.user_id <> p_user_id or v_quote.workspace_id is distinct from p_workspace_id
     or v_quote.operation_id <> v_operation or v_quote.tool <> 'tongs_broll_v2'
     or v_quote.request_fingerprint <> p_operation_fingerprint then
    raise exception 'Runway quote identity does not match operation' using errcode = '42501';
  end if;
  if v_reservation.funding_source_type = 'owner_budget' and not tongs.is_platform_operator(p_user_id) then
    raise exception 'owner budget requires platform-operator operation identity' using errcode = '42501';
  end if;
  select * into v_pricing from tongs.private_pricing_revisions where id = v_quote.pricing_revision_id;
  select * into v_policy from tongs.private_pricing_policies where id = v_pricing.policy_id;
  if v_pricing.lifecycle_state <> 'review_ready' or lower(coalesce(v_policy.provider, '')) <> 'runway'
     or lower(coalesce(v_policy.sku, '')) <> lower('gen4.5:' || p_duration_seconds::text || 's:' || p_ratio) then
    raise exception 'exact Runway SKU pricing revision required' using errcode = 'P0001';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'component_code', component.component_code,
      'component_kind', component.component_kind,
      'provider_label', component.provider_label,
      'success_ceiling_micros', component.success_ceiling_micros,
      'failure_ceiling_micros', component.failure_ceiling_micros,
      'cost_policy_revision', component.cost_policy_revision,
      'tail_policy', component.tail_policy,
      'tail_policy_details', component.tail_policy_details
    ) order by component.ordinal), '[]'::jsonb),
    coalesce(sum(component.success_ceiling_micros) filter (
      where component.component_kind = 'direct_provider' and lower(component.provider_label) = 'runway'
    ), 0),
    coalesce(sum(component.success_ceiling_micros) filter (
      where not (component.component_kind = 'direct_provider' and lower(component.provider_label) = 'runway')
    ), 0)
  into v_cost_stack, v_direct, v_supporting
  from tongs.private_pricing_cost_components component
  where component.pricing_revision_id = v_pricing.id;
  if jsonb_array_length(v_cost_stack) = 0 or v_direct <> p_duration_seconds::bigint * 120000
     or v_direct + v_supporting <> v_pricing.full_cost_ceiling_micros
     or v_pricing.full_cost_ceiling_micros <> v_reservation.reserved_wholesale_spend_micros then
    raise exception 'Runway reservation does not cover the complete priced cost stack' using errcode = 'P0001';
  end if;
  insert into tongs.runway_funding_bindings(
    operation_id, operation_fingerprint, reservation_id, user_id, workspace_id,
    model, duration_seconds, ratio, direct_provider_ceiling_micros,
    supporting_cost_ceiling_micros, total_cost_ceiling_micros,
    pricing_revision_id, cost_stack_json
  ) values (
    v_operation, p_operation_fingerprint, p_reservation_id, p_user_id, p_workspace_id,
    p_model, p_duration_seconds, p_ratio, v_direct, v_supporting,
    v_direct + v_supporting, v_pricing.id, v_cost_stack
  );
  return jsonb_build_object('operation_id', v_operation, 'reservation_id', p_reservation_id,
    'replay', false, 'provider_execution_authorized', false,
    'direct_provider_ceiling_micros', v_direct,
    'supporting_cost_ceiling_micros', v_supporting,
    'total_cost_ceiling_micros', v_direct + v_supporting);
end;
$$;

create or replace function tongs.resolve_runway_execution_funding(
  p_operation_id text,
  p_operation_fingerprint text,
  p_user_id uuid,
  p_workspace_id uuid,
  p_model text,
  p_duration_seconds integer,
  p_ratio text
) returns jsonb language plpgsql stable security definer set search_path = pg_catalog as $$
declare
  v_operation text := nullif(btrim(coalesce(p_operation_id, '')), '');
  v_rollout tongs.runway_execution_rollout_revisions%rowtype;
  v_binding tongs.runway_funding_bindings%rowtype;
  v_reservation tongs.funding_reservations%rowtype;
  v_ready boolean := false;
  v_reason text;
begin
  perform tongs._require_pricing_service_role();
  if v_operation is null or p_operation_fingerprint !~ '^[0-9a-f]{64}$'
     or p_user_id is null or p_workspace_id is null or p_model <> 'gen4.5'
     or p_duration_seconds not between 2 and 10
     or p_ratio not in ('1280:720', '720:1280') then
    raise exception 'invalid Runway funding resolution' using errcode = '22023';
  end if;
  select * into v_rollout from tongs._current_runway_execution_rollout();
  if v_rollout.mode = 'observe' then
    return jsonb_build_object('mode', v_rollout.mode, 'rollout_revision', v_rollout.revision,
      'shared_funding_ready', false, 'use_legacy_accounting', true,
      'reason', 'legacy accounting retained before approved cutover',
      'reservation_id', null, 'funding_source_type', null);
  end if;
  select * into v_binding from tongs.runway_funding_bindings where operation_id = v_operation;
  if found and v_binding.operation_fingerprint = p_operation_fingerprint
     and v_binding.user_id = p_user_id and v_binding.workspace_id = p_workspace_id
     and v_binding.model = p_model and v_binding.duration_seconds = p_duration_seconds
     and v_binding.ratio = p_ratio then
    select * into v_reservation from tongs.funding_reservations where id = v_binding.reservation_id;
    v_ready := tongs._funding_reservation_state(v_binding.reservation_id)
      in ('reserved', 'provider_attempt_shadowed', 'provider_failure_recorded', 'submission_unknown');
  end if;
  v_reason := case
    when v_rollout.mode = 'halt_new' then 'new Runway submissions are halted'
    when v_ready then 'matching shared funding reservation found'
    else 'matching full-cost funding reservation required'
  end;
  return jsonb_build_object('mode', v_rollout.mode, 'rollout_revision', v_rollout.revision,
    'shared_funding_ready', v_ready, 'use_legacy_accounting', not v_ready,
    'reason', v_reason, 'reservation_id', v_binding.reservation_id,
    'funding_source_type', v_reservation.funding_source_type);
end;
$$;

create or replace function tongs.authorize_runway_submission(
  p_operation_id text,
  p_operation_fingerprint text,
  p_submission_attempt_id text,
  p_user_id uuid,
  p_workspace_id uuid,
  p_model text,
  p_duration_seconds integer,
  p_ratio text,
  p_evidence_json jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_operation text := nullif(btrim(coalesce(p_operation_id, '')), '');
  v_attempt text := nullif(btrim(coalesce(p_submission_attempt_id, '')), '');
  v_rollout tongs.runway_execution_rollout_revisions%rowtype;
  v_binding tongs.runway_funding_bindings%rowtype;
  v_reservation tongs.funding_reservations%rowtype;
  v_existing tongs.runway_submission_boundary_events%rowtype;
  v_attempt_result jsonb;
  v_decision text;
  v_reason text;
  v_authorized boolean := false;
  v_legacy_allowed boolean := false;
begin
  perform tongs._require_pricing_service_role();
  if v_operation is null or p_operation_fingerprint !~ '^[0-9a-f]{64}$'
     or v_attempt is null or p_user_id is null or p_workspace_id is null
     or p_model <> 'gen4.5' or p_duration_seconds not between 2 and 10
     or p_ratio not in ('1280:720', '720:1280')
     or jsonb_typeof(coalesce(p_evidence_json, 'null'::jsonb)) <> 'object' then
    raise exception 'invalid Runway submission authorization' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('runway-submit:' || v_operation, 0));
  select * into v_rollout from tongs._current_runway_execution_rollout();
  select * into v_existing from tongs.runway_submission_boundary_events
  where (operation_id = v_operation or submission_attempt_id = v_attempt)
    and decision in ('legacy_observed', 'funded_authorized')
  order by created_at desc limit 1;
  if found then
    insert into tongs.runway_submission_boundary_events(
      id, operation_id, operation_fingerprint, submission_attempt_id, rollout_revision,
      reservation_id, decision, reason, evidence_json
    ) values (
      gen_random_uuid(), v_operation, p_operation_fingerprint, v_attempt, v_rollout.revision,
      v_existing.reservation_id, 'duplicate_blocked', 'duplicate paid submission boundary attempt',
      coalesce(p_evidence_json, '{}'::jsonb)
    );
    return jsonb_build_object('mode', v_rollout.mode, 'rollout_revision', v_rollout.revision,
      'provider_execution_authorized', false, 'legacy_execution_allowed', false,
      'reason', 'duplicate_attempt', 'replay', true,
      'reservation_id', v_existing.reservation_id);
  end if;
  if v_rollout.mode = 'halt_new' then
    v_decision := 'halted';
    v_reason := 'new Runway submissions are halted; polling and reconciliation remain available';
  elsif v_rollout.mode = 'observe' then
    v_decision := 'legacy_observed';
    v_reason := 'legacy Runway execution observed before approved cutover';
    v_legacy_allowed := true;
  else
    select * into v_binding from tongs.runway_funding_bindings where operation_id = v_operation;
    if not found or v_binding.operation_fingerprint <> p_operation_fingerprint
       or v_binding.user_id <> p_user_id or v_binding.workspace_id <> p_workspace_id
       or v_binding.model <> p_model or v_binding.duration_seconds <> p_duration_seconds
       or v_binding.ratio <> p_ratio then
      v_decision := 'unfunded_blocked';
      v_reason := 'matching full-cost funding reservation required';
    else
      select * into v_reservation from tongs.funding_reservations where id = v_binding.reservation_id;
      if v_reservation.funding_source_type = 'owner_budget' then
        v_attempt_result := tongs.begin_owner_provider_attempt(
          v_binding.reservation_id, v_attempt, 120,
          coalesce(p_evidence_json, '{}'::jsonb) || jsonb_build_object(
            'provider', 'runway', 'model', p_model, 'operation_id', v_operation)
        );
      else
        v_attempt_result := tongs.begin_provider_attempt(
          v_binding.reservation_id, v_attempt, 120,
          coalesce(p_evidence_json, '{}'::jsonb) || jsonb_build_object(
            'provider', 'runway', 'model', p_model, 'operation_id', v_operation)
        );
      end if;
      v_authorized := coalesce((v_attempt_result->>'provider_execution_authorized')::boolean, false);
      v_decision := case when v_authorized then 'funded_authorized' else 'duplicate_blocked' end;
      v_reason := coalesce(v_attempt_result->>'reason', 'funding gate denied provider attempt');
    end if;
  end if;
  insert into tongs.runway_submission_boundary_events(
    id, operation_id, operation_fingerprint, submission_attempt_id, rollout_revision,
    reservation_id, decision, reason, lease_expires_at, evidence_json
  ) values (
    gen_random_uuid(), v_operation, p_operation_fingerprint, v_attempt, v_rollout.revision,
    v_binding.reservation_id, v_decision, v_reason,
    case when v_attempt_result ? 'lease_expires_at' then (v_attempt_result->>'lease_expires_at')::timestamptz else null end,
    coalesce(p_evidence_json, '{}'::jsonb)
  );
  return jsonb_build_object('mode', v_rollout.mode, 'rollout_revision', v_rollout.revision,
    'provider_execution_authorized', v_authorized,
    'legacy_execution_allowed', v_legacy_allowed,
    'reason', v_reason, 'replay', false,
    'reservation_id', v_binding.reservation_id,
    'funding_source_type', v_reservation.funding_source_type);
end;
$$;

create or replace function tongs.record_runway_completion_for_reconciliation(
  p_operation_id text,
  p_operation_fingerprint text,
  p_provider_task_id text,
  p_evidence_json jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_binding tongs.runway_funding_bindings%rowtype;
  v_existing tongs.runway_execution_reconciliation_receipts%rowtype;
  v_actual bigint;
begin
  perform tongs._require_pricing_service_role();
  if nullif(btrim(coalesce(p_operation_id, '')), '') is null
     or p_operation_fingerprint !~ '^[0-9a-f]{64}$'
     or nullif(btrim(coalesce(p_provider_task_id, '')), '') is null
     or jsonb_typeof(coalesce(p_evidence_json, 'null'::jsonb)) <> 'object' then
    raise exception 'invalid Runway completion receipt' using errcode = '22023';
  end if;
  select * into v_binding from tongs.runway_funding_bindings where operation_id = btrim(p_operation_id);
  if not found then return jsonb_build_object('recorded', false, 'reason', 'no_funding_binding'); end if;
  if v_binding.operation_fingerprint <> p_operation_fingerprint then
    raise exception 'Runway completion fingerprint mismatch' using errcode = '42501';
  end if;
  v_actual := v_binding.duration_seconds::bigint * 120000;
  select * into v_existing from tongs.runway_execution_reconciliation_receipts
  where operation_id = v_binding.operation_id;
  if found then
    if v_existing.provider_task_id <> btrim(p_provider_task_id)
       or v_existing.direct_provider_estimated_micros <> v_actual then
      raise exception 'Runway completion receipt replay conflict' using errcode = '23505';
    end if;
    return jsonb_build_object('recorded', true, 'replay', true,
      'reservation_id', v_binding.reservation_id,
      'direct_provider_estimated_micros', v_actual,
      'supporting_cost_status', v_existing.supporting_cost_status);
  end if;
  insert into tongs.runway_execution_reconciliation_receipts(
    operation_id, reservation_id, provider_task_id, direct_provider_estimated_micros, evidence_json
  ) values (
    v_binding.operation_id, v_binding.reservation_id, btrim(p_provider_task_id), v_actual,
    coalesce(p_evidence_json, '{}'::jsonb)
  );
  return jsonb_build_object('recorded', true, 'replay', false,
    'reservation_id', v_binding.reservation_id,
    'direct_provider_estimated_micros', v_actual,
    'supporting_cost_status', 'pending',
    'customer_revenue_micros', 0);
end;
$$;

create or replace function tongs.record_runway_failure_for_reconciliation(
  p_operation_id text,
  p_operation_fingerprint text,
  p_provider_task_id text,
  p_evidence_json jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_binding tongs.runway_funding_bindings%rowtype;
begin
  perform tongs._require_pricing_service_role();
  if nullif(btrim(coalesce(p_operation_id, '')), '') is null
     or p_operation_fingerprint !~ '^[0-9a-f]{64}$'
     or nullif(btrim(coalesce(p_provider_task_id, '')), '') is null
     or jsonb_typeof(coalesce(p_evidence_json, 'null'::jsonb)) <> 'object' then
    raise exception 'invalid Runway failure receipt' using errcode = '22023';
  end if;
  select * into v_binding from tongs.runway_funding_bindings where operation_id = btrim(p_operation_id);
  if not found then return jsonb_build_object('recorded', false, 'reason', 'no_funding_binding'); end if;
  if v_binding.operation_fingerprint <> p_operation_fingerprint then
    raise exception 'Runway failure fingerprint mismatch' using errcode = '42501';
  end if;
  perform tongs.record_provider_failure(
    v_binding.reservation_id,
    'runway-task:' || btrim(p_provider_task_id) || ':provider-failure',
    'provider_billed_failure',
    coalesce(p_evidence_json, '{}'::jsonb) || jsonb_build_object(
      'provider', 'runway', 'provider_task_id', btrim(p_provider_task_id))
  );
  return jsonb_build_object('recorded', true, 'reservation_id', v_binding.reservation_id,
    'reservation_retained', true, 'requires_cost_reconciliation', true,
    'automatic_resubmission_allowed', false);
end;
$$;

create or replace function tongs.reconcile_runway_execution(
  p_operation_id text,
  p_direct_provider_actual_micros bigint,
  p_supporting_actual_micros bigint,
  p_settlement_id uuid,
  p_settlement_key text,
  p_evidence_json jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_binding tongs.runway_funding_bindings%rowtype;
  v_receipt tongs.runway_execution_reconciliation_receipts%rowtype;
  v_reservation tongs.funding_reservations%rowtype;
  v_total bigint;
  v_result jsonb;
begin
  perform tongs._require_pricing_service_role();
  if nullif(btrim(coalesce(p_operation_id, '')), '') is null
     or p_direct_provider_actual_micros < 0 or p_supporting_actual_micros < 0 or p_settlement_id is null
     or length(btrim(coalesce(p_settlement_key, ''))) < 8
     or jsonb_typeof(coalesce(p_evidence_json, 'null'::jsonb)) <> 'object' then
    raise exception 'invalid Runway reconciliation' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('runway-reconcile:' || btrim(p_operation_id), 0));
  select * into v_binding from tongs.runway_funding_bindings where operation_id = btrim(p_operation_id);
  select * into v_receipt from tongs.runway_execution_reconciliation_receipts
    where operation_id = btrim(p_operation_id) for update;
  if v_binding.operation_id is null or v_receipt.operation_id is null then
    raise exception 'completed funded Runway operation not found' using errcode = 'P0002';
  end if;
  if v_receipt.supporting_cost_status = 'finalized' then
    if v_receipt.supporting_actual_micros <> p_supporting_actual_micros then
      raise exception 'Runway reconciliation replay conflict' using errcode = '23505';
    end if;
    return coalesce(v_receipt.settlement_result_json, '{}'::jsonb) || jsonb_build_object('replay', true);
  end if;
  v_total := p_direct_provider_actual_micros + p_supporting_actual_micros;
  if p_direct_provider_actual_micros > v_binding.direct_provider_ceiling_micros
     or p_supporting_actual_micros > v_binding.supporting_cost_ceiling_micros
     or v_total > v_binding.total_cost_ceiling_micros then
    insert into tongs.pricing_discrepancies(
      id, reservation_id, discrepancy_key, discrepancy_type,
      quoted_ceiling_micros, observed_amount_micros, evidence_json
    ) values (
      gen_random_uuid(), v_binding.reservation_id,
      btrim(p_settlement_key) || ':runway-reconciliation-overrun',
      'wholesale_ceiling_overrun', v_binding.total_cost_ceiling_micros, v_total,
      coalesce(p_evidence_json, '{}'::jsonb)
    ) on conflict (discrepancy_key) do nothing;
    return jsonb_build_object('settled', false, 'pricing_discrepancy', true,
      'reservation_retained', true, 'customer_overcharge_allowed', false,
      'quoted_ceiling_micros', v_binding.total_cost_ceiling_micros,
      'observed_amount_micros', v_total);
  end if;
  select * into v_reservation from tongs.funding_reservations where id = v_binding.reservation_id;
  if v_reservation.funding_source_type = 'owner_budget' then
    v_result := tongs.settle_owner_operation(
      v_binding.reservation_id, p_settlement_id, btrim(p_settlement_key),
      'success', null, v_total,
      coalesce(p_evidence_json, '{}'::jsonb) || jsonb_build_object(
        'provider', 'runway', 'direct_provider_actual_micros', p_direct_provider_actual_micros,
        'supporting_actual_micros', p_supporting_actual_micros)
    );
  else
    v_result := tongs.settle_operation(
      v_binding.reservation_id, p_settlement_id, btrim(p_settlement_key),
      'success', null, v_total,
      coalesce(p_evidence_json, '{}'::jsonb) || jsonb_build_object(
        'provider', 'runway', 'direct_provider_actual_micros', p_direct_provider_actual_micros,
        'supporting_actual_micros', p_supporting_actual_micros)
    );
  end if;
  update tongs.runway_execution_reconciliation_receipts
  set supporting_cost_status = 'finalized', direct_provider_actual_micros = p_direct_provider_actual_micros,
      supporting_actual_micros = p_supporting_actual_micros,
      settlement_result_json = v_result, reconciled_at = now()
  where operation_id = v_binding.operation_id;
  return v_result || jsonb_build_object('replay', false,
    'direct_provider_actual_micros', p_direct_provider_actual_micros,
    'supporting_actual_micros', p_supporting_actual_micros,
    'actual_fulfillment_cost_micros', v_total);
end;
$$;

create or replace function tongs.set_runway_execution_rollout_mode(
  p_mode text,
  p_reason text
) returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_actor uuid := auth.uid();
  v_current tongs.runway_execution_rollout_revisions%rowtype;
  v_control tongs.paid_execution_control_revisions%rowtype;
  v_revision integer;
begin
  if v_actor is null or not tongs.is_platform_operator(v_actor) then
    raise exception 'platform operator required' using errcode = '42501';
  end if;
  if p_mode not in ('enforce', 'halt_new') or nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'invalid Runway rollout mode revision' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('runway-rollout', 0));
  select * into v_current from tongs._current_runway_execution_rollout();
  if v_current.mode = 'halt_new' and p_mode = 'enforce' then
    raise exception 'halted Runway execution requires a reviewed recovery migration' using errcode = '42501';
  end if;
  if p_mode = 'enforce' then
    select * into v_control from tongs._current_paid_execution_control();
    if not v_control.pricing_activation_enabled or not v_control.provider_execution_enabled
       or not v_control.owner_budget_spending_enabled then
      raise exception 'pricing, provider execution, and owner-budget spending must be activated before Runway cutover'
        using errcode = '42501';
    end if;
  end if;
  select coalesce(max(revision), 0) + 1 into v_revision from tongs.runway_execution_rollout_revisions;
  insert into tongs.runway_execution_rollout_revisions(revision, mode, reason, actor_id)
  values (v_revision, p_mode, btrim(p_reason), v_actor);
  return jsonb_build_object('revision', v_revision, 'mode', p_mode,
    'new_paid_submissions_allowed', p_mode = 'enforce',
    'polling_and_reconciliation_available', true);
end;
$$;

create or replace function tongs.read_runway_execution_control()
returns jsonb language plpgsql stable security definer set search_path = pg_catalog as $$
declare
  v_actor uuid := auth.uid();
  v_rollout tongs.runway_execution_rollout_revisions%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and (v_actor is null or not tongs.is_platform_operator(v_actor)) then
    raise exception 'platform operator required' using errcode = '42501';
  end if;
  select * into v_rollout from tongs._current_runway_execution_rollout();
  return jsonb_build_object(
    'revision', v_rollout.revision,
    'mode', v_rollout.mode,
    'reason', v_rollout.reason,
    'created_at', v_rollout.created_at,
    'new_paid_submissions_allowed', v_rollout.mode = 'enforce',
    'polling_and_reconciliation_available', true,
    'funding_bindings', (select count(*) from tongs.runway_funding_bindings),
    'pending_reconciliations', (select count(*) from tongs.runway_execution_reconciliation_receipts
      where supporting_cost_status = 'pending')
  );
end;
$$;

alter table tongs.runway_execution_rollout_revisions enable row level security;
alter table tongs.runway_funding_bindings enable row level security;
alter table tongs.runway_submission_boundary_events enable row level security;
alter table tongs.runway_execution_reconciliation_receipts enable row level security;

revoke all on tongs.runway_execution_rollout_revisions from public, anon, authenticated, service_role;
revoke all on tongs.runway_funding_bindings from public, anon, authenticated, service_role;
revoke all on tongs.runway_submission_boundary_events from public, anon, authenticated, service_role;
revoke all on tongs.runway_execution_reconciliation_receipts from public, anon, authenticated, service_role;
grant select on tongs.runway_execution_rollout_revisions to service_role;
grant select on tongs.runway_funding_bindings to service_role;
grant select on tongs.runway_submission_boundary_events to service_role;
grant select on tongs.runway_execution_reconciliation_receipts to service_role;

revoke all on function tongs._current_runway_execution_rollout() from public, anon, authenticated;
revoke all on function tongs.bind_runway_funding_reservation(text,text,uuid,uuid,uuid,text,integer,text) from public, anon, authenticated;
revoke all on function tongs.resolve_runway_execution_funding(text,text,uuid,uuid,text,integer,text) from public, anon, authenticated;
revoke all on function tongs.authorize_runway_submission(text,text,text,uuid,uuid,text,integer,text,jsonb) from public, anon, authenticated;
revoke all on function tongs.record_runway_completion_for_reconciliation(text,text,text,jsonb) from public, anon, authenticated;
revoke all on function tongs.record_runway_failure_for_reconciliation(text,text,text,jsonb) from public, anon, authenticated;
revoke all on function tongs.reconcile_runway_execution(text,bigint,bigint,uuid,text,jsonb) from public, anon, authenticated;
revoke all on function tongs.set_runway_execution_rollout_mode(text,text) from public, anon;
revoke all on function tongs.read_runway_execution_control() from public, anon;
grant execute on function tongs._current_runway_execution_rollout() to service_role;
grant execute on function tongs.bind_runway_funding_reservation(text,text,uuid,uuid,uuid,text,integer,text) to service_role;
grant execute on function tongs.resolve_runway_execution_funding(text,text,uuid,uuid,text,integer,text) to service_role;
grant execute on function tongs.authorize_runway_submission(text,text,text,uuid,uuid,text,integer,text,jsonb) to service_role;
grant execute on function tongs.record_runway_completion_for_reconciliation(text,text,text,jsonb) to service_role;
grant execute on function tongs.record_runway_failure_for_reconciliation(text,text,text,jsonb) to service_role;
grant execute on function tongs.reconcile_runway_execution(text,bigint,bigint,uuid,text,jsonb) to service_role;
grant execute on function tongs.set_runway_execution_rollout_mode(text,text) to authenticated, service_role;
grant execute on function tongs.read_runway_execution_control() to authenticated, service_role;

comment on table tongs.runway_execution_rollout_revisions is
  'Append-only Runway cutover control. halt_new blocks creation but never disables polling or reconciliation.';
comment on table tongs.runway_funding_bindings is
  'Immutable binding between a canonical Runway operation and its full-cost shared funding reservation.';
comment on table tongs.runway_execution_reconciliation_receipts is
  'Direct Runway expense receipt retained until supporting costs are finalized and the shared reservation settles.';

commit;
