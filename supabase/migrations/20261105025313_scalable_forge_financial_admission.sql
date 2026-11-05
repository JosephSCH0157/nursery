-- Forward-only, inactive-by-default extension of the existing restricted-beta
-- admission contract. Existing policies retain legacy_gross behavior. A future
-- policy must explicitly select funded_net_v2 and provide all limits before it
-- can admit traffic.
begin;

alter table tongs.restricted_beta_policy_revisions
  add column exposure_accounting_mode text not null default 'legacy_gross'
    check (exposure_accounting_mode in ('legacy_gross','funded_net_v2')),
  add column net_forge_loss_limit_micros bigint
    check (net_forge_loss_limit_micros is null or net_forge_loss_limit_micros >= 0),
  add column emergency_platform_risk_limit_micros bigint
    check (emergency_platform_risk_limit_micros is null or emergency_platform_risk_limit_micros >= 0),
  add constraint restricted_beta_funded_net_limits_complete check (
    exposure_accounting_mode <> 'funded_net_v2'
    or (net_forge_loss_limit_micros is not null
        and emergency_platform_risk_limit_micros is not null)
  );

alter table tongs.restricted_beta_policy_capabilities
  add column provider_code text,
  add column provider_gross_liquidity_limit_micros bigint
    check (provider_gross_liquidity_limit_micros is null or provider_gross_liquidity_limit_micros > 0);

alter table tongs.restricted_beta_exposure_holds
  drop constraint restricted_beta_exposure_holds_funding_class_check,
  add constraint restricted_beta_exposure_holds_funding_class_check check (
    funding_class in ('verified_customer_deposit','economically_backed_allowance',
      'operator_provisioned_beta_credit','owner_operating_budget','test_customer','byo')
  ),
  add column exposure_accounting_mode text not null default 'legacy_gross'
    check (exposure_accounting_mode in ('legacy_gross','funded_net_v2')),
  add column provider_code text,
  add column funding_reservation_id uuid references tongs.funding_reservations(id) on delete restrict,
  add column gross_supplier_liquidity_exposure_micros bigint
    check (gross_supplier_liquidity_exposure_micros is null or gross_supplier_liquidity_exposure_micros >= 0),
  add column eligible_funding_offset_micros bigint
    check (eligible_funding_offset_micros is null or eligible_funding_offset_micros >= 0),
  add column net_forge_loss_exposure_micros bigint
    check (net_forge_loss_exposure_micros is null or net_forge_loss_exposure_micros >= 0),
  add constraint restricted_beta_funded_net_hold_complete check (
    exposure_accounting_mode <> 'funded_net_v2'
    or (provider_code is not null and funding_reservation_id is not null
        and gross_supplier_liquidity_exposure_micros is not null
        and eligible_funding_offset_micros is not null
        and net_forge_loss_exposure_micros is not null
        and eligible_funding_offset_micros <= gross_supplier_liquidity_exposure_micros
        and net_forge_loss_exposure_micros =
          gross_supplier_liquidity_exposure_micros - eligible_funding_offset_micros)
  );

create index restricted_beta_holds_provider_open_idx
  on tongs.restricted_beta_exposure_holds(provider_code, created_at)
  where exposure_accounting_mode = 'funded_net_v2';
create index restricted_beta_holds_reservation_idx
  on tongs.restricted_beta_exposure_holds(funding_reservation_id)
  where funding_reservation_id is not null;

create or replace function tongs._restricted_beta_hold_remaining_gross(p_hold_id uuid)
returns bigint language sql stable security definer set search_path=pg_catalog as $$
  with facts as (
    select hold.*,
      policy.rolling_window_seconds,
      (select event.event_type from tongs.restricted_beta_exposure_events event where event.hold_id=hold.id order by event.sequence desc limit 1) last_type,
      (select event.remaining_exposure_micros from tongs.restricted_beta_exposure_events event where event.hold_id=hold.id and event.remaining_exposure_micros is not null order by event.sequence desc limit 1) remaining_exposure,
      (select event.supplier_obligation_micros from tongs.restricted_beta_exposure_events event where event.hold_id=hold.id and event.event_type='reconciled' order by event.sequence desc limit 1) reconciled_supplier,
      (select event.supplier_obligation_micros from tongs.restricted_beta_exposure_events event where event.hold_id=hold.id and event.event_type='reconciliation_partial' order by event.sequence desc limit 1) partial_supplier,
      (select event.created_at from tongs.restricted_beta_exposure_events event where event.hold_id=hold.id and event.event_type='attempt_started' order by event.sequence limit 1) incurred_at,
      (select coalesce(sum(event.supplier_recovery_micros),0) from tongs.restricted_beta_exposure_events event where event.hold_id=hold.id and event.event_type='supplier_recovery') recovered
    from tongs.restricted_beta_exposure_holds hold
    join tongs.restricted_beta_policy_revisions policy on policy.id=hold.policy_revision_id
    where hold.id=p_hold_id
  )
  select case
    when last_type='released' then 0
    when remaining_exposure is not null then greatest(remaining_exposure-recovered,0)
    when reconciled_supplier is not null then case
      when coalesce(incurred_at,created_at)>=now()-make_interval(secs=>rolling_window_seconds)
      then greatest(reconciled_supplier-recovered,0) else 0 end
    when partial_supplier is not null then greatest(partial_supplier-recovered,0)+
      supporting_exposure_ceiling_micros+tail_exposure_ceiling_micros+
      unreconciled_exposure_ceiling_micros+retry_exposure_ceiling_micros
    else supplier_exposure_ceiling_micros+supporting_exposure_ceiling_micros+
      tail_exposure_ceiling_micros+unreconciled_exposure_ceiling_micros+retry_exposure_ceiling_micros
  end from facts
$$;

create or replace function tongs._restricted_beta_hold_is_open(p_hold_id uuid)
returns boolean language sql stable security definer set search_path=pg_catalog as $$
  select coalesce(tongs._restricted_beta_hold_remaining_gross(p_hold_id)>0,false)
$$;

create or replace function tongs._scalable_funding_offset(
  p_reservation_id uuid,
  p_gross_exposure_micros bigint,
  p_provider_mode text
) returns bigint language plpgsql stable security definer set search_path=pg_catalog as $$
declare
  reservation tongs.funding_reservations%rowtype;
  source_remaining bigint:=0;
  already_allocated bigint:=0;
begin
  if p_reservation_id is null or p_gross_exposure_micros<0 then
    raise exception 'reservation and nonnegative gross exposure are required' using errcode='22023';
  end if;
  select * into reservation from tongs.funding_reservations where id=p_reservation_id;
  if not found or tongs._funding_reservation_state(reservation.id) not in
      ('reserved','attempt_started','provider_attempt_shadowed','submission_unknown') then
    return 0;
  end if;

  if reservation.funding_source_type='customer_deposit' then
    -- A deposit with any refund, dispute, or payment reversal is deliberately
    -- ineligible as collateral. This is conservative and prevents a later
    -- adjustment from creating a silent offset.
    if not exists(select 1 from tongs.customer_deposit_processor_fees fee
                  where fee.deposit_id=reservation.funding_source_id)
       or exists(select 1 from tongs.customer_deposit_refunds refund
                 where refund.deposit_id=reservation.funding_source_id) then return 0; end if;
    select greatest(deposit.gross_amount_micros-
      coalesce((select fee.fee_amount_micros from tongs.customer_deposit_processor_fees fee
                where fee.deposit_id=deposit.id),0)-
      coalesce((select sum(consumption.recognized_revenue_micros)
                from tongs.customer_deposit_consumptions consumption
                where consumption.deposit_id=deposit.id),0),0)
      into source_remaining from tongs.customer_deposits deposit
      where deposit.id=reservation.funding_source_id and deposit.stripe_mode='live';
  elsif reservation.funding_source_type='paid_allowance' then
    if exists(select 1 from tongs.subscription_cycle_adjustments adjustment
              join tongs.paid_allowance_grants allowance on allowance.receipt_id=adjustment.receipt_id
              where allowance.id=reservation.funding_source_id) then return 0; end if;
    select greatest(allowance.maximum_wholesale_spend_micros-
      coalesce((select sum(consumption.wholesale_spend_micros)
                from tongs.paid_allowance_consumptions consumption
                where consumption.allowance_grant_id=allowance.id),0),0)
      into source_remaining from tongs.paid_allowance_grants allowance
      join tongs.subscription_cycle_receipts receipt on receipt.id=allowance.receipt_id
      where allowance.id=reservation.funding_source_id and receipt.stripe_mode='live';
  elsif reservation.funding_source_type='owner_budget' then
    -- Current owner budgets are capped expense authority, not proof of cash
    -- collateral. They remain governed by their own limits but consume the
    -- funded-net policy's Forge-loss capacity.
    return 0;
  elsif reservation.funding_source_type='none' and p_provider_mode='byo' then
    return least(p_gross_exposure_micros,reservation.reserved_wholesale_spend_micros);
  else
    -- beta_grant, test funding, and unknown funding never offset Forge risk.
    return 0;
  end if;
  if source_remaining is null then return 0; end if;

  select coalesce(sum(hold.eligible_funding_offset_micros),0) into already_allocated
  from tongs.restricted_beta_exposure_holds hold
  join tongs.funding_reservations prior on prior.id=hold.funding_reservation_id
  where hold.exposure_accounting_mode='funded_net_v2'
    and hold.funding_reservation_id<>reservation.id
    and prior.funding_source_type=reservation.funding_source_type
    and prior.funding_source_id=reservation.funding_source_id
    and tongs._restricted_beta_hold_is_open(hold.id);

  return least(p_gross_exposure_micros,reservation.reserved_wholesale_spend_micros,
               greatest(source_remaining-already_allocated,0));
end $$;

create or replace function tongs._scalable_hold_effective_offset(p_hold_id uuid)
returns bigint language sql stable security definer set search_path=pg_catalog as $$
  select least(
    tongs._restricted_beta_hold_remaining_gross(hold.id),
    case
      when hold.exposure_accounting_mode<>'funded_net_v2' or reservation.id is null then 0::bigint
      when reservation.funding_source_type='customer_deposit'
        and exists(select 1 from tongs.customer_deposit_refunds refund
                   where refund.deposit_id=reservation.funding_source_id) then 0::bigint
      when reservation.funding_source_type='paid_allowance'
        and exists(select 1 from tongs.subscription_cycle_adjustments adjustment
                   join tongs.paid_allowance_grants allowance on allowance.receipt_id=adjustment.receipt_id
                   where allowance.id=reservation.funding_source_id) then 0::bigint
      else coalesce(hold.eligible_funding_offset_micros,0)
    end)
  from tongs.restricted_beta_exposure_holds hold
  left join tongs.funding_reservations reservation on reservation.id=hold.funding_reservation_id
  where hold.id=p_hold_id
$$;

create or replace function tongs._scalable_policy_exposure(p_policy_revision_id uuid)
returns table(gross_micros bigint,net_micros bigint,outstanding_count bigint)
language sql stable security definer set search_path=pg_catalog as $$
  with selected_policy as (
    select environment from tongs.restricted_beta_policy_revisions where id=p_policy_revision_id
  ), open_holds as (
    select hold.*,
      tongs._restricted_beta_hold_remaining_gross(hold.id) as effective_gross,
      tongs._scalable_hold_effective_offset(hold.id) as effective_offset
    from tongs.restricted_beta_exposure_holds hold
    join tongs.restricted_beta_policy_revisions policy on policy.id=hold.policy_revision_id
    where policy.environment=(select environment from selected_policy)
      and hold.exposure_accounting_mode='funded_net_v2'
      and tongs._restricted_beta_hold_is_open(hold.id)
  )
  select coalesce(sum(effective_gross),0)::bigint,
    coalesce(sum(greatest(effective_gross-least(effective_offset,effective_gross),0)),0)::bigint,
    count(*)::bigint from open_holds
$$;

revoke all on function tongs._restricted_beta_hold_remaining_gross(uuid) from public,anon,authenticated;
revoke all on function tongs._restricted_beta_hold_is_open(uuid) from public,anon,authenticated;
revoke all on function tongs._scalable_funding_offset(uuid,bigint,text) from public,anon,authenticated;
revoke all on function tongs._scalable_hold_effective_offset(uuid) from public,anon,authenticated;
revoke all on function tongs._scalable_policy_exposure(uuid) from public,anon,authenticated;
grant execute on function tongs._restricted_beta_hold_remaining_gross(uuid) to service_role;
grant execute on function tongs._restricted_beta_hold_is_open(uuid) to service_role;
grant execute on function tongs._scalable_funding_offset(uuid,bigint,text) to service_role;
grant execute on function tongs._scalable_hold_effective_offset(uuid) to service_role;
grant execute on function tongs._scalable_policy_exposure(uuid) to service_role;

create or replace function tongs._authorize_scalable_hold_attempt(p_hold_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare
  hold tongs.restricted_beta_exposure_holds%rowtype;
  policy tongs.restricted_beta_policy_revisions%rowtype;
  term tongs.restricted_beta_policy_capabilities%rowtype;
  reservation tongs.funding_reservations%rowtype;
  current_gross bigint; current_net bigint; provider_gross bigint;
begin
  perform tongs._require_pricing_service_role();
  select * into hold from tongs.restricted_beta_exposure_holds where id=p_hold_id;
  if not found then return jsonb_build_object('authorized',false,'reason','unknown_exposure_hold'); end if;
  if hold.exposure_accounting_mode<>'funded_net_v2' then return jsonb_build_object('authorized',true,'reason','legacy_policy'); end if;
  select * into policy from tongs.restricted_beta_policy_revisions where id=hold.policy_revision_id;
  select * into term from tongs.restricted_beta_policy_capabilities where id=hold.capability_term_id;
  select * into reservation from tongs.funding_reservations where id=hold.funding_reservation_id;
  if policy.id is null or term.id is null or reservation.id is null
     or tongs._funding_reservation_state(reservation.id) not in
       ('reserved','attempt_started','provider_attempt_shadowed','submission_unknown') then
    return jsonb_build_object('authorized',false,'reason','funding_reservation_no_longer_authoritative');
  end if;
  perform pg_advisory_xact_lock(hashtext('restricted-beta:'||policy.environment));
  select exposure.gross_micros,exposure.net_micros into current_gross,current_net
    from tongs._scalable_policy_exposure(policy.id) exposure;
  select coalesce(sum(tongs._restricted_beta_hold_remaining_gross(candidate.id)),0) into provider_gross
  from tongs.restricted_beta_exposure_holds candidate
  join tongs.restricted_beta_policy_revisions candidate_policy on candidate_policy.id=candidate.policy_revision_id
  where candidate.exposure_accounting_mode='funded_net_v2'
    and candidate.provider_code=hold.provider_code
    and candidate_policy.environment=policy.environment
    and tongs._restricted_beta_hold_is_open(candidate.id);
  if provider_gross>term.provider_gross_liquidity_limit_micros then
    return jsonb_build_object('authorized',false,'reason','provider_liquidity_exhausted');
  end if;
  if current_net+policy.reserved_headroom_micros>policy.net_forge_loss_limit_micros then
    return jsonb_build_object('authorized',false,'reason','net_forge_loss_capacity_exhausted');
  end if;
  if current_net+policy.reserved_headroom_micros>policy.emergency_platform_risk_limit_micros then
    return jsonb_build_object('authorized',false,'reason','emergency_platform_risk_limit');
  end if;
  return jsonb_build_object('authorized',true,'reason','funded_net_revalidated',
    'gross_micros',current_gross,'net_micros',current_net,
    'effective_offset_micros',tongs._scalable_hold_effective_offset(hold.id));
end $$;

revoke all on function tongs._authorize_scalable_hold_attempt(uuid) from public,anon,authenticated;
grant execute on function tongs._authorize_scalable_hold_attempt(uuid) to service_role;

create or replace function tongs.reserve_restricted_beta_exposure(
 p_hold_id uuid,p_policy_revision_id uuid,p_capability_code text,p_operation_identity text,
 p_user_id uuid,p_workspace_id uuid,p_request_fingerprint text,p_model_or_sku text,
 p_funding_class text,p_opaque_funding_handle text,p_provider_mode text,p_caller_class text,
 p_customer_funding_ceiling_micros bigint,p_supplier_exposure_ceiling_micros bigint,
 p_supporting_exposure_ceiling_micros bigint,p_tail_exposure_ceiling_micros bigint,
 p_unreconciled_exposure_ceiling_micros bigint,p_retry_exposure_ceiling_micros bigint,
 p_lease_seconds integer,p_event_key text
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare
 pol tongs.restricted_beta_policy_revisions%rowtype;
 term tongs.restricted_beta_policy_capabilities%rowtype;
 existing tongs.restricted_beta_exposure_holds%rowtype;
 ev tongs.restricted_beta_cost_evidence_revisions%rowtype;
 reservation tongs.funding_reservations%rowtype;
 requested bigint; committed bigint; concurrent_count bigint;
 provider_name text; provider_gross bigint; current_net bigint; current_gross bigint;
 eligible_offset bigint:=0; requested_net bigint; reservation_id uuid;
begin
 perform tongs._require_pricing_service_role();
 select * into pol from tongs.restricted_beta_policy_revisions where id=p_policy_revision_id;
 if not found or pol.lifecycle_state='draft' then return jsonb_build_object('authorized',false,'reason','restricted_beta_inactive'); end if;
 if pol.lifecycle_state<>'active' then return jsonb_build_object('authorized',false,'reason','halt_new'); end if;
 if exists(select 1 from tongs.aggregate_financial_halt_events where policy_revision_id=pol.id) then
  return jsonb_build_object('authorized',false,'reason','aggregate_authoritative_overrun_halt'); end if;
 perform pg_advisory_xact_lock(hashtext('restricted-beta:'||pol.environment));
 select * into existing from tongs.restricted_beta_exposure_holds where operation_identity=btrim(p_operation_identity);
 if found then
  if existing.policy_revision_id<>pol.id or existing.request_fingerprint<>lower(p_request_fingerprint)
     or existing.model_or_sku<>p_model_or_sku or existing.user_id is distinct from p_user_id
     or existing.workspace_id is distinct from p_workspace_id then
   raise exception 'operation binding mismatch' using errcode='22023'; end if;
  return jsonb_build_object('authorized',true,'replay',true,'hold_id',existing.id);
 end if;
 select * into term from tongs.restricted_beta_policy_capabilities where policy_revision_id=pol.id and capability_code=p_capability_code;
 if not found or term.admission_mode='block' then return jsonb_build_object('authorized',false,'reason','capability_not_covered'); end if;
 select * into ev from tongs.restricted_beta_cost_evidence_revisions where id=term.cost_evidence_revision_id;
 if not found or ev.coverage_state<>'complete' or ev.evidence_state='unresolved' or ev.valid_until<=now()
    or ev.observed_at < now()-make_interval(secs=>pol.evidence_max_age_seconds) then
  return jsonb_build_object('authorized',false,'reason','cost_evidence_stale_or_incomplete'); end if;
 if p_model_or_sku<>term.exact_model_or_sku then return jsonb_build_object('authorized',false,'reason','model_or_sku_mismatch'); end if;
 if not(term.permitted_callers_json ? p_caller_class) then return jsonb_build_object('authorized',false,'reason','caller_not_permitted'); end if;
 if p_provider_mode='real' and p_funding_class='test_customer' then return jsonb_build_object('authorized',false,'reason','test_funding_real_provider_forbidden'); end if;
 if nullif(btrim(p_opaque_funding_handle),'') is null then return jsonb_build_object('authorized',false,'reason','funding_context_required'); end if;
 if p_supplier_exposure_ceiling_micros>term.per_operation_supplier_ceiling_micros
    or p_supporting_exposure_ceiling_micros>term.per_operation_supporting_ceiling_micros
    or p_tail_exposure_ceiling_micros>term.per_operation_tail_ceiling_micros then
  return jsonb_build_object('authorized',false,'reason','operation_ceiling_exceeded'); end if;
 requested:=p_supplier_exposure_ceiling_micros+p_supporting_exposure_ceiling_micros+p_tail_exposure_ceiling_micros+p_unreconciled_exposure_ceiling_micros+p_retry_exposure_ceiling_micros;
 concurrent_count:=tongs._restricted_beta_policy_execution_concurrency(pol.id);
 if concurrent_count>=pol.maximum_concurrency then return jsonb_build_object('authorized',false,'reason','aggregate_concurrency_exhausted'); end if;

 if pol.exposure_accounting_mode='legacy_gross' then
  select c.committed_micros into committed from tongs._restricted_beta_policy_commitment(pol.id)c;
  if committed+requested+pol.reserved_headroom_micros>pol.aggregate_forge_exposure_limit_micros then
   return jsonb_build_object('authorized',false,'reason','aggregate_exposure_exhausted','committed_micros',committed,'requested_micros',requested); end if;
 else
  if term.provider_code is null or term.provider_gross_liquidity_limit_micros is null then
   return jsonb_build_object('authorized',false,'reason','provider_liquidity_authority_missing'); end if;
  begin reservation_id:=p_opaque_funding_handle::uuid;
  exception when invalid_text_representation then
   return jsonb_build_object('authorized',false,'reason','canonical_funding_reservation_required'); end;
  select * into reservation from tongs.funding_reservations where id=reservation_id;
  if not found or reservation.user_id is distinct from p_user_id
     or reservation.operation_id<>btrim(p_operation_identity)
     or tongs._aggregate_funding_class(reservation)<>p_funding_class then
   return jsonb_build_object('authorized',false,'reason','funding_reservation_mismatch'); end if;
  provider_name:=term.provider_code;
  eligible_offset:=tongs._scalable_funding_offset(reservation_id,requested,p_provider_mode);
  requested_net:=greatest(requested-eligible_offset,0);
  select exposure.gross_micros,exposure.net_micros into current_gross,current_net
    from tongs._scalable_policy_exposure(pol.id) exposure;
  select coalesce(sum(tongs._restricted_beta_hold_remaining_gross(hold.id)),0) into provider_gross
    from tongs.restricted_beta_exposure_holds hold
    join tongs.restricted_beta_policy_revisions hold_policy on hold_policy.id=hold.policy_revision_id
    where hold.exposure_accounting_mode='funded_net_v2' and hold.provider_code=provider_name
      and hold_policy.environment=pol.environment
      and tongs._restricted_beta_hold_is_open(hold.id);
  if provider_gross+requested>term.provider_gross_liquidity_limit_micros then
   return jsonb_build_object('authorized',false,'reason','provider_liquidity_exhausted','provider',provider_name); end if;
  if current_net+requested_net+pol.reserved_headroom_micros>pol.net_forge_loss_limit_micros then
   return jsonb_build_object('authorized',false,'reason','net_forge_loss_capacity_exhausted'); end if;
  if current_net+requested_net+pol.reserved_headroom_micros>pol.emergency_platform_risk_limit_micros then
   return jsonb_build_object('authorized',false,'reason','emergency_platform_risk_limit'); end if;
 end if;

 insert into tongs.restricted_beta_exposure_holds(
   id,policy_revision_id,capability_term_id,operation_identity,user_id,workspace_id,request_fingerprint,model_or_sku,
   funding_class,funding_handle_hash,provider_mode,caller_class,customer_funding_ceiling_micros,
   supplier_exposure_ceiling_micros,supporting_exposure_ceiling_micros,tail_exposure_ceiling_micros,
   unreconciled_exposure_ceiling_micros,retry_exposure_ceiling_micros,lease_expires_at,
   exposure_accounting_mode,provider_code,funding_reservation_id,gross_supplier_liquidity_exposure_micros,
   eligible_funding_offset_micros,net_forge_loss_exposure_micros)
 values(p_hold_id,pol.id,term.id,btrim(p_operation_identity),p_user_id,p_workspace_id,lower(p_request_fingerprint),p_model_or_sku,
   p_funding_class,encode(extensions.digest(convert_to(p_opaque_funding_handle,'utf8'),'sha256'),'hex'),p_provider_mode,p_caller_class,
   p_customer_funding_ceiling_micros,p_supplier_exposure_ceiling_micros,p_supporting_exposure_ceiling_micros,
   p_tail_exposure_ceiling_micros,p_unreconciled_exposure_ceiling_micros,p_retry_exposure_ceiling_micros,
   now()+make_interval(secs=>p_lease_seconds),pol.exposure_accounting_mode,
   case when pol.exposure_accounting_mode='funded_net_v2' then provider_name end,
   case when pol.exposure_accounting_mode='funded_net_v2' then reservation_id end,
   case when pol.exposure_accounting_mode='funded_net_v2' then requested end,
   case when pol.exposure_accounting_mode='funded_net_v2' then eligible_offset end,
   case when pol.exposure_accounting_mode='funded_net_v2' then requested_net end);
 insert into tongs.restricted_beta_exposure_events(id,hold_id,sequence,event_key,event_type,customer_funding_delta_micros,evidence_json)
 values(extensions.uuid_generate_v5(p_hold_id,'reserved'),p_hold_id,1,p_event_key,'reserved',p_customer_funding_ceiling_micros,
   jsonb_build_object('caller_class',p_caller_class,'exposure_accounting_mode',pol.exposure_accounting_mode,
     'gross_supplier_liquidity_micros',requested,'eligible_funding_offset_micros',eligible_offset,
     'net_forge_loss_micros',case when pol.exposure_accounting_mode='funded_net_v2' then requested_net else requested end));
 return jsonb_build_object('authorized',true,'replay',false,'hold_id',p_hold_id,
   'exposure_accounting_mode',pol.exposure_accounting_mode,'reserved_gross_micros',requested,
   'eligible_funding_offset_micros',eligible_offset,
   'reserved_net_forge_loss_micros',case when pol.exposure_accounting_mode='funded_net_v2' then requested_net else requested end);
end $$;

-- Ordinary customer execution historically bypasses aggregate admission once
-- a normal-customer scope exists. Preserve that behavior unless an explicit
-- funded_net_v2 assignment has been appended for the exact user/workspace and
-- environment. This makes installation inert while allowing a later reviewed
-- successor policy to opt in without a second admission implementation.
do $patch_openai_customer_admission$
declare definition text; changed text;
begin
  select pg_get_functiondef('tongs.acquire_openai_text_aggregate_admission(uuid,text,text)'::regprocedure) into definition;
  changed:=replace(definition,$old$
 if exists (
   select 1 from tongs.customer_paid_execution_scope_authorizations scope_auth
   where scope_auth.id = r.rollout_authorization_id
     and scope_auth.authorization_kind = 'normal_customer'
     and scope_auth.status = 'active'
 ) then
   return jsonb_build_object('enforcement_enabled',false,'authorized',true,'replay',false,'reason','normal_customer_credit_bounded');
 end if;
 select * into qb from tongs.openai_text_customer_quote_bindings where quote_id=q.id;$old$,$new$
 if exists (
   select 1 from tongs.customer_paid_execution_scope_authorizations scope_auth
   where scope_auth.id = r.rollout_authorization_id
     and scope_auth.authorization_kind = 'normal_customer'
     and scope_auth.status = 'active'
 ) then
   environment:=case when r.funding_environment='test' then 'test' else 'production' end;
   select * into a from tongs._active_paid_execution_aggregate_assignment(r.user_id,q.workspace_id,environment);
   if not found or not exists(
     select 1 from tongs.restricted_beta_policy_revisions policy
     where policy.id=a.policy_revision_id and policy.exposure_accounting_mode='funded_net_v2'
   ) then
     return jsonb_build_object('enforcement_enabled',false,'authorized',true,'replay',false,'reason','normal_customer_credit_bounded');
   end if;
 end if;
 select * into qb from tongs.openai_text_customer_quote_bindings where quote_id=q.id;$new$);
  if changed=definition or position('exposure_accounting_mode=''funded_net_v2''' in changed)=0 then
    raise exception 'OpenAI ordinary-customer aggregate successor patch did not match authoritative definition';
  end if;
  execute changed;
end
$patch_openai_customer_admission$;

do $patch_attempt_revalidation$
declare definition text; changed text;
begin
  select pg_get_functiondef('tongs.begin_restricted_beta_attempt(uuid,text,smallint,text)'::regprocedure) into definition;
  changed:=replace(definition,$old$
 if not(term.permitted_callers_json ? p_caller_class) then return jsonb_build_object('authorized',false,'reason','caller_not_permitted'); end if;
 insert into tongs.restricted_beta_exposure_events$old$,$new$
 if not(term.permitted_callers_json ? p_caller_class) then return jsonb_build_object('authorized',false,'reason','caller_not_permitted'); end if;
 if h.exposure_accounting_mode='funded_net_v2'
    and not coalesce((tongs._authorize_scalable_hold_attempt(h.id)->>'authorized')::boolean,false) then
  return tongs._authorize_scalable_hold_attempt(h.id);
 end if;
 insert into tongs.restricted_beta_exposure_events$new$);
  if changed=definition or position('_authorize_scalable_hold_attempt' in changed)=0 then
    raise exception 'aggregate attempt revalidation patch did not match authoritative definition';
  end if;
  execute changed;
end
$patch_attempt_revalidation$;

revoke all on function tongs.reserve_restricted_beta_exposure(uuid,uuid,text,text,uuid,uuid,text,text,text,text,text,text,bigint,bigint,bigint,bigint,bigint,bigint,integer,text) from public,anon,authenticated;
grant execute on function tongs.reserve_restricted_beta_exposure(uuid,uuid,text,text,uuid,uuid,text,text,text,text,text,text,bigint,bigint,bigint,bigint,bigint,bigint,integer,text) to service_role;

comment on column tongs.restricted_beta_policy_revisions.exposure_accounting_mode is
  'legacy_gross preserves all existing policies. funded_net_v2 is inactive until an append-only successor policy explicitly supplies net and emergency limits.';
comment on function tongs._scalable_policy_exposure(uuid) is
  'Read-only gross supplier liquidity and net Forge loss exposure for funded_net_v2 holds. Adjusted deposits and allowances lose offset eligibility fail-closed.';

create or replace function tongs.read_forge_cost_observability()
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare result jsonb;
begin
  perform tongs._require_pricing_service_role();
  select jsonb_build_object(
    'schema','forge.cost-observability.v1',
    'observed_at',now(),
    'supplier_expenses',jsonb_build_object(
      'confirmed_micros',coalesce((select sum(amount_micros) from tongs.supplier_expenses where evidence_status='confirmed'),0),
      'estimated_micros',coalesce((select sum(amount_micros) from tongs.supplier_expenses where evidence_status='estimated'),0),
      'unresolved_count',(select count(*) from tongs.supplier_expenses where evidence_status='unresolved'),
      'open_obligation_micros',coalesce((select sum(amount_micros) from tongs.supplier_expenses where obligation_status in ('open','unresolved')),0)),
    'aggregate_exposure',jsonb_build_object(
      'open_hold_count',(select count(*) from tongs.restricted_beta_exposure_holds hold where tongs._restricted_beta_hold_is_open(hold.id)),
      'gross_supplier_liquidity_micros',coalesce((select sum(tongs._restricted_beta_hold_remaining_gross(hold.id))
        from tongs.restricted_beta_exposure_holds hold where tongs._restricted_beta_hold_is_open(hold.id)),0),
      'recorded_net_forge_loss_micros',coalesce((select sum(greatest(
        tongs._restricted_beta_hold_remaining_gross(hold.id)-tongs._scalable_hold_effective_offset(hold.id),0))
        from tongs.restricted_beta_exposure_holds hold where tongs._restricted_beta_hold_is_open(hold.id)),0),
      'ambiguous_count',(select count(distinct event.hold_id) from tongs.restricted_beta_exposure_events event
        where event.event_type in ('ambiguous','settled_unconfirmed','reconciliation_partial')
          and tongs._restricted_beta_hold_is_open(event.hold_id))),
    'funding',jsonb_build_object(
      'open_customer_backed_reservations',(select count(*) from tongs.funding_reservations reservation
        where reservation.funding_source_type in ('customer_deposit','paid_allowance')
          and tongs._funding_reservation_state(reservation.id) in ('reserved','attempt_started','provider_attempt_shadowed','submission_unknown')),
      'open_owner_funded_reservations',(select count(*) from tongs.funding_reservations reservation
        where reservation.funding_source_type='owner_budget'
          and tongs._funding_reservation_state(reservation.id) in ('reserved','attempt_started','provider_attempt_shadowed','submission_unknown')),
      'promotional_reservations_excluded_from_offset',(select count(*) from tongs.funding_reservations reservation
        where reservation.funding_source_type='beta_grant'
          and tongs._funding_reservation_state(reservation.id) in ('reserved','attempt_started','provider_attempt_shadowed','submission_unknown'))),
    'infrastructure',jsonb_build_object(
      'netlify',jsonb_build_object('status','external_observation_required'),
      'supabase',jsonb_build_object('status','supported_authenticated_observation_required')),
    'amount_semantics',jsonb_build_object(
      'confirmed','supplier-reported or reconciled actual',
      'reserved','maximum outstanding exposure',
      'estimated','non-authoritative estimate',
      'unknown','not reported as zero'))
  into result;
  return result;
end $$;

revoke all on function tongs.read_forge_cost_observability() from public,anon,authenticated;
grant execute on function tongs.read_forge_cost_observability() to service_role;
comment on function tongs.read_forge_cost_observability() is
  'Protected read-only Tongs cost report. Infrastructure values remain explicitly unknown until supplied by supported authenticated collectors.';

notify pgrst,'reload schema';
commit;
