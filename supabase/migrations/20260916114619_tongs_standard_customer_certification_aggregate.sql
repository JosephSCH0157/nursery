-- Install the aggregate-exposure boundary required by the bounded standard-
-- customer Luna certification. The policy is inert until a platform operator
-- attaches an exact, already-authorized customer scope through the service-only
-- function below.
begin;

insert into tongs.restricted_beta_cost_evidence_revisions(
  id, capability_code, revision, evidence_state, coverage_state,
  source_reference, observed_at, valid_until, included_capacity_json,
  reserved_headroom_json, hard_cap_scope, notes
) values (
  'c0000000-0000-4000-8000-000000000001',
  'openai.text.hearth_chat', 116, 'verified_rate', 'complete',
  'Exact Forge Luna bounded-pilot cost policy 10000000-0000-4000-8000-000000000010',
  '2026-09-16T00:00:00Z', '2026-10-16T00:00:00Z',
  '{"model":"gpt-5.6-luna","maximum_input_tokens":2000,"maximum_output_tokens":512,"attempts":1}'::jsonb,
  '{"direct_provider_ceiling_micros":1015,"supporting_cost_ceiling_micros":10000,"unpriced_services_permitted":false}'::jsonb,
  'One exact standard-customer certification operation',
  'Certification evidence only; an exact customer scope and aggregate assignment remain mandatory.'
) on conflict (id) do nothing;

insert into tongs.restricted_beta_policy_revisions(
  id, environment, revision, lifecycle_state,
  aggregate_forge_exposure_limit_micros, reserved_headroom_micros,
  maximum_concurrency, rolling_window_seconds, evidence_max_age_seconds, reason
) values (
  'c0000000-0000-4000-8000-000000000002',
  'test', 1, 'active', 11015, 0, 1, 86400, 2592000,
  'One-operation standard-customer Luna certification policy; unreachable without an exact operator-created assignment.'
) on conflict (id) do nothing;

insert into tongs.restricted_beta_policy_capabilities(
  id, policy_revision_id, capability_code, admission_mode,
  cost_evidence_revision_id, maximum_attempts, maximum_concurrency,
  per_operation_supplier_ceiling_micros,
  per_operation_supporting_ceiling_micros,
  per_operation_tail_ceiling_micros, permitted_callers_json,
  exact_model_or_sku, notes
) values (
  'c0000000-0000-4000-8000-000000000003',
  'c0000000-0000-4000-8000-000000000002',
  'openai.text.hearth_chat', 'covered',
  'c0000000-0000-4000-8000-000000000001',
  1, 1, 1015, 10000, 0, '["interactive","recovery"]'::jsonb,
  'gpt-5.6-luna',
  'Exact-model term for one bounded Test financial-path certification.'
) on conflict (id) do nothing;

create or replace function tongs.create_standard_customer_certification_aggregate_assignment(
  p_assignment_id uuid,
  p_actor_id uuid,
  p_scope_authorization_id uuid,
  p_reason text
) returns jsonb
language plpgsql security definer set search_path = pg_catalog as $$
declare
  scope_auth tongs.customer_paid_execution_scope_authorizations%rowtype;
  existing tongs.paid_execution_aggregate_assignments%rowtype;
begin
  perform tongs._require_pricing_service_role();
  if p_assignment_id is null or p_actor_id is null
     or not tongs.is_platform_operator(p_actor_id)
     or p_scope_authorization_id is null
     or nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'service-role platform operator and exact scope are required'
      using errcode = '42501';
  end if;
  select * into existing
  from tongs.paid_execution_aggregate_assignments
  where id = p_assignment_id;
  if found then
    return to_jsonb(existing) || jsonb_build_object('replay', true);
  end if;
  select * into scope_auth
  from tongs.customer_paid_execution_scope_authorizations
  where id = p_scope_authorization_id;
  if not found
     or scope_auth.created_by <> p_actor_id
     or scope_auth.status <> 'active'
     or scope_auth.valid_from > now()
     or scope_auth.valid_until <= now()
     or scope_auth.financial_environment <> 'test'
     or scope_auth.route_code <> 'hearth.chat_completion'
     or scope_auth.provider <> 'openai'
     or scope_auth.model_or_sku <> 'gpt-5.6-luna'
     or scope_auth.pricing_revision_id <> 'b4c4472f-0325-4c2e-b2ef-9aef5e59e64a'::uuid
     or scope_auth.cost_policy_revision_id <> '10000000-0000-4000-8000-000000000010'::uuid
     or scope_auth.maximum_operation_count <> 1
     or scope_auth.maximum_customer_charge_micros <> 20000
     or scope_auth.maximum_wholesale_exposure_micros <> 11015
     or scope_auth.maximum_concurrency <> 1
     or scope_auth.rolling_window_seconds <> 86400 then
    raise exception 'exact active bounded Luna customer scope required'
      using errcode = '42501';
  end if;
  if exists (
    select 1 from tongs.paid_execution_aggregate_assignments a
    join tongs.restricted_beta_policy_revisions p on p.id = a.policy_revision_id
    where a.user_id = scope_auth.user_id
      and a.workspace_id = scope_auth.workspace_id
      and a.state = 'active'
      and a.valid_from <= now() and a.valid_until > now()
      and p.environment = 'test'
  ) then
    raise exception 'an active Test aggregate assignment already exists'
      using errcode = '23505';
  end if;
  insert into tongs.paid_execution_aggregate_assignments(
    id, policy_revision_id, user_id, workspace_id, state,
    valid_from, valid_until, reason
  ) values (
    p_assignment_id, 'c0000000-0000-4000-8000-000000000002',
    scope_auth.user_id, scope_auth.workspace_id, 'active', now(),
    scope_auth.valid_until, btrim(p_reason)
  ) returning * into existing;
  return to_jsonb(existing) || jsonb_build_object('replay', false);
end $$;

create or replace function tongs.rearm_standard_customer_preprovider_release(
  p_reservation_id uuid,
  p_actor_id uuid,
  p_event_key text
) returns jsonb
language plpgsql security definer set search_path = pg_catalog as $$
declare
  reservation tongs.funding_reservations%rowtype;
  scope_auth tongs.customer_paid_execution_scope_authorizations%rowtype;
  binding tongs.openai_text_funding_bindings%rowtype;
  quote_binding tongs.openai_text_customer_quote_bindings%rowtype;
  assignment tongs.paid_execution_aggregate_assignments%rowtype;
  latest tongs.funding_reservation_events%rowtype;
  released tongs.funding_reservation_events%rowtype;
  rearmed tongs.funding_reservation_events%rowtype;
  next_sequence integer;
begin
  perform tongs._require_pricing_service_role();
  if p_reservation_id is null or p_actor_id is null
     or not tongs.is_platform_operator(p_actor_id)
     or length(btrim(coalesce(p_event_key, ''))) < 8 then
    raise exception 'service-role platform operator required' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(
    hashtextextended('standard-customer-preprovider-rearm:' || p_reservation_id::text, 0)
  );
  select * into reservation from tongs.funding_reservations
  where id = p_reservation_id;
  select * into scope_auth from tongs.customer_paid_execution_scope_authorizations
  where id = reservation.rollout_authorization_id;
  select * into binding from tongs.openai_text_funding_bindings
  where reservation_id = reservation.id;
  select * into quote_binding from tongs.openai_text_customer_quote_bindings
  where quote_id = reservation.quote_id;
  select * into assignment
  from tongs._active_paid_execution_aggregate_assignment(
    reservation.user_id, quote_binding.workspace_id, 'test'
  );
  if reservation.id is null
     or reservation.funding_environment <> 'test'
     or reservation.funding_source_type not in ('customer_deposit', 'paid_allowance')
     or reservation.reserved_customer_charge_micros <> 15000
     or reservation.reserved_credit_units <> 3
     or reservation.reserved_wholesale_spend_micros <> 11015
     or scope_auth.id is null
     or scope_auth.created_by <> p_actor_id
     or scope_auth.status <> 'active'
     or scope_auth.valid_until <= now()
     or scope_auth.maximum_operation_count <> 1
     or binding.route_code <> 'hearth.chat_completion'
     or binding.model <> 'gpt-5.6-luna'
     or binding.maximum_attempts <> 1
     or binding.credential_funding <> 'forge'
     or binding.cost_policy_revision_id <> '10000000-0000-4000-8000-000000000010'::uuid
     or binding.pricing_revision_id <> 'b4c4472f-0325-4c2e-b2ef-9aef5e59e64a'::uuid
     or quote_binding.canonical_operation_id <> binding.operation_id
     or quote_binding.user_id <> reservation.user_id
     or assignment.id is null
     or assignment.policy_revision_id <> 'c0000000-0000-4000-8000-000000000002'::uuid then
    raise exception 'exact active standard-customer certification context required'
      using errcode = '42501';
  end if;
  if not exists (
    select 1 from tongs.customer_spending_quote_acceptances a
    where a.quote_id = reservation.quote_id and a.user_id = reservation.user_id
  ) then
    raise exception 'accepted immutable quote required' using errcode = '42501';
  end if;
  select * into released from tongs.funding_reservation_events
  where reservation_id = reservation.id and event_type = 'released'
  order by sequence desc limit 1;
  if released.id is null
     or released.evidence_json->>'reason' <> 'restricted_beta_inactive'
     or coalesce((released.evidence_json->>'transmitted')::boolean, true) then
    raise exception 'exact untransmitted aggregate pre-provider release required'
      using errcode = 'P0001';
  end if;
  if exists (
      select 1 from tongs.funding_reservation_events e
      where e.reservation_id = reservation.id
        and e.event_type in ('provider_attempt_shadowed', 'attempt_started', 'submission_unknown', 'settled')
    )
    or exists (select 1 from tongs.openai_text_failure_exposure_holds h where h.reservation_id = reservation.id)
    or exists (select 1 from tongs.openai_text_usage_evidence u where u.reservation_id = reservation.id)
    or exists (select 1 from tongs.openai_text_persisted_results p where p.reservation_id = reservation.id)
    or exists (select 1 from tongs.supplier_expenses s where s.reservation_id = reservation.id)
    or exists (select 1 from tongs.paid_operation_aggregate_bindings b where b.reservation_id = reservation.id) then
    raise exception 'provider, terminal, or aggregate evidence prevents pre-provider recovery'
      using errcode = 'P0001';
  end if;
  select * into latest from tongs.funding_reservation_events
  where reservation_id = reservation.id order by sequence desc limit 1;
  if latest.event_type = 'released' then
    select coalesce(max(sequence), 0) + 1 into next_sequence
    from tongs.funding_reservation_events where reservation_id = reservation.id;
    insert into tongs.funding_reservation_events(
      id, reservation_id, sequence, event_type, event_key, evidence_json
    ) values (
      extensions.uuid_generate_v5(reservation.id, btrim(p_event_key)),
      reservation.id, next_sequence, 'reserved', btrim(p_event_key),
      jsonb_build_object(
        'operator_user_id', p_actor_id,
        'recovery', 'standard_customer_aggregate_assignment_installed',
        'transmitted', false,
        'provider_submission_count', 0,
        'original_operation_identity_preserved', true
      )
    ) returning * into rearmed;
  elsif latest.event_type = 'reserved'
        and latest.evidence_json->>'recovery' = 'standard_customer_aggregate_assignment_installed' then
    rearmed := latest;
  else
    raise exception 'reservation is not eligible for pre-provider recovery'
      using errcode = 'P0001';
  end if;
  return jsonb_build_object(
    'reservation_id', reservation.id,
    'operation_id', binding.operation_id,
    'reservation_state', 'reserved',
    'aggregate_assignment_id', assignment.id,
    'replay', rearmed.id = latest.id
  );
end $$;

revoke all on function tongs.create_standard_customer_certification_aggregate_assignment(uuid,uuid,uuid,text)
  from public, anon, authenticated;
grant execute on function tongs.create_standard_customer_certification_aggregate_assignment(uuid,uuid,uuid,text)
  to service_role;
revoke all on function tongs.rearm_standard_customer_preprovider_release(uuid,uuid,text)
  from public, anon, authenticated;
grant execute on function tongs.rearm_standard_customer_preprovider_release(uuid,uuid,text)
  to service_role;

comment on function tongs.create_standard_customer_certification_aggregate_assignment(uuid,uuid,uuid,text) is
  'Creates one exact Test aggregate assignment derived from an active bounded standard-customer scope.';
comment on function tongs.rearm_standard_customer_preprovider_release(uuid,uuid,text) is
  'Append-only recovery for an exact standard-customer reservation released before any provider transmission because aggregate authority was inactive.';

notify pgrst, 'reload schema';
commit;

