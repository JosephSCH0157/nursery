-- Give platform operators a finite, append-only Test failure-loss risk decision
-- without changing the canonical per-operation or concurrency policy and without
-- weakening the shared reservation/provider authorization boundary.
begin;

create table tongs.openai_text_failure_loss_operator_decisions(
  id uuid primary key,
  route_code text not null references tongs.openai_text_route_policies(route_code) on delete restrict,
  financial_environment text not null check(financial_environment in('test','live')),
  decision_type text not null check(decision_type in(
    'emergency_halt','policy_enforce','bounded_test_risk_acceptance'
  )),
  loss_policy_revision_id uuid not null
    references tongs.openai_text_failure_loss_policy_revisions(id) on delete restrict,
  source_rollout_revision integer not null check(source_rollout_revision>0),
  source_rollout_mode text not null check(source_rollout_mode in(
    'enforce','halt_new','operator_authorized'
  )),
  resulting_rollout_revision integer not null check(resulting_rollout_revision>0),
  resulting_rollout_mode text not null check(resulting_rollout_mode in(
    'enforce','halt_new','operator_authorized'
  )),
  known_exposure_micros bigint not null check(known_exposure_micros>=0),
  active_concurrency integer not null check(active_concurrency>=0),
  base_aggregate_limit_micros bigint not null check(base_aggregate_limit_micros>=0),
  additional_loss_capacity_micros bigint,
  effective_aggregate_limit_micros bigint,
  reason text not null check(length(btrim(reason))>=12),
  actor_id uuid not null references tongs.platform_operators(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  unique(route_code,financial_environment,resulting_rollout_revision),
  check(
    (decision_type='bounded_test_risk_acceptance'
      and financial_environment='test'
      and resulting_rollout_mode='operator_authorized'
      and additional_loss_capacity_micros>0
      and effective_aggregate_limit_micros=
        known_exposure_micros+additional_loss_capacity_micros)
    or
    (decision_type='policy_enforce'
      and resulting_rollout_mode='enforce'
      and additional_loss_capacity_micros is null
      and effective_aggregate_limit_micros=base_aggregate_limit_micros)
    or
    (decision_type='emergency_halt'
      and resulting_rollout_mode='halt_new'
      and additional_loss_capacity_micros is null
      and effective_aggregate_limit_micros is null)
  )
);

create index openai_text_failure_loss_operator_decisions_actor_idx
  on tongs.openai_text_failure_loss_operator_decisions(actor_id,created_at desc);
create index openai_text_failure_loss_operator_decisions_policy_idx
  on tongs.openai_text_failure_loss_operator_decisions(loss_policy_revision_id);

alter table tongs.openai_text_failure_loss_operator_decisions enable row level security;
revoke all on tongs.openai_text_failure_loss_operator_decisions
  from public,anon,authenticated,service_role;
grant select on tongs.openai_text_failure_loss_operator_decisions to service_role;
create trigger openai_text_failure_loss_operator_decisions_immutable
before update or delete on tongs.openai_text_failure_loss_operator_decisions
for each row execute function tongs._reject_accounting_mutation();

alter table tongs.openai_text_failure_loss_rollout_revisions
  drop constraint openai_text_failure_loss_rollout_revisions_mode_check;
alter table tongs.openai_text_failure_loss_rollout_revisions
  add column operator_decision_id uuid
    references tongs.openai_text_failure_loss_operator_decisions(id) on delete restrict,
  add constraint openai_text_failure_loss_rollout_revisions_mode_check
    check(mode in('enforce','halt_new','operator_authorized')),
  add constraint openai_text_failure_loss_rollout_operator_decision_check check(
    (mode='operator_authorized' and financial_environment='test'
      and operator_decision_id is not null and actor_id is not null
      and source_limit_event_id is null)
    or (mode in('enforce','halt_new')
      and not(operator_decision_id is not null and source_limit_event_id is not null)
      and (operator_decision_id is null or actor_id is not null))
  );

create unique index openai_text_failure_loss_rollout_operator_decision_idx
  on tongs.openai_text_failure_loss_rollout_revisions(operator_decision_id)
  where operator_decision_id is not null;

alter table tongs.openai_text_failure_limit_events
  drop constraint openai_text_failure_limit_events_event_type_check;
alter table tongs.openai_text_failure_limit_events
  add constraint openai_text_failure_limit_events_event_type_check check(event_type in(
    'aggregate_limit_blocked','operation_limit_blocked','concurrency_blocked',
    'overrun_halted','aggregate_risk_accepted'
  ));

create or replace function tongs._openai_text_failure_loss_exposure(
  p_route_code text,p_financial_environment text,p_rolling_window_seconds integer
) returns table(committed_micros bigint,concurrency_count integer)
language sql stable security definer set search_path=pg_catalog as $$
  with latest as(
    select distinct on(exposure_hold.id)
      exposure_hold.id,exposure_hold.authorized_exposure_micros,
      exposure_event.event_type,exposure_event.actual_supplier_cost_micros,
      exposure_event.created_at
    from tongs.openai_text_failure_exposure_holds exposure_hold
    join tongs.funding_reservations exposure_reservation
      on exposure_reservation.id=exposure_hold.reservation_id
    join tongs.openai_text_failure_exposure_events exposure_event
      on exposure_event.hold_id=exposure_hold.id
    where exposure_hold.route_code=btrim(p_route_code)
      and exposure_reservation.funding_environment=p_financial_environment
    order by exposure_hold.id,exposure_event.sequence desc
  )
  select
    coalesce(sum(case
      when event_type in('authorized','unresolved') then authorized_exposure_micros
      when event_type='failure_realized'
        and created_at>=now()-make_interval(secs=>p_rolling_window_seconds)
        then coalesce(actual_supplier_cost_micros,authorized_exposure_micros)
      else 0 end),0)::bigint,
    count(*) filter(where event_type in('authorized','unresolved'))::integer
  from latest
$$;

create or replace function tongs.control_openai_text_failure_loss_environment(
  p_decision_id uuid,p_actor_id uuid,p_route_code text,p_financial_environment text,
  p_decision_type text,p_additional_loss_capacity_micros bigint,p_reason text
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare
  existing_decision tongs.openai_text_failure_loss_operator_decisions%rowtype;
  current_rollout tongs.openai_text_failure_loss_rollout_revisions%rowtype;
  policy tongs.openai_text_failure_loss_policy_revisions%rowtype;
  known_exposure bigint:=0;
  concurrency integer:=0;
  next_revision integer;
  resulting_mode text;
  effective_limit bigint;
begin
  perform tongs._require_pricing_service_role();
  if p_decision_id is null or p_actor_id is null
    or nullif(btrim(coalesce(p_route_code,'')),'') is null
    or p_financial_environment not in('test','live')
    or p_decision_type not in(
      'emergency_halt','policy_enforce','bounded_test_risk_acceptance'
    )
    or length(btrim(coalesce(p_reason,'')))<12 then
    raise exception 'invalid failure-loss operator decision' using errcode='22023';
  end if;
  if not tongs.is_platform_operator(p_actor_id) then
    raise exception 'platform operator required' using errcode='42501';
  end if;
  if p_decision_type='bounded_test_risk_acceptance' then
    if p_financial_environment<>'test'
      or p_additional_loss_capacity_micros is null
      or p_additional_loss_capacity_micros<=0 then
      raise exception 'bounded risk acceptance is Test-only and requires finite added capacity'
        using errcode='22023';
    end if;
  elsif p_additional_loss_capacity_micros is not null then
    raise exception 'added loss capacity is valid only for bounded Test risk acceptance'
      using errcode='22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'openai-text-loss:'||btrim(p_route_code)||':'||p_financial_environment,0));
  select * into existing_decision
  from tongs.openai_text_failure_loss_operator_decisions decision
  where decision.id=p_decision_id;
  if found then
    if existing_decision.actor_id is distinct from p_actor_id
      or existing_decision.route_code is distinct from btrim(p_route_code)
      or existing_decision.financial_environment is distinct from p_financial_environment
      or existing_decision.decision_type is distinct from p_decision_type
      or existing_decision.additional_loss_capacity_micros
        is distinct from p_additional_loss_capacity_micros
      or existing_decision.reason is distinct from btrim(p_reason) then
      raise exception 'operator decision idempotency conflict' using errcode='23505';
    end if;
    return jsonb_build_object(
      'decision_id',existing_decision.id,'replay',true,
      'route_code',existing_decision.route_code,
      'financial_environment',existing_decision.financial_environment,
      'decision_type',existing_decision.decision_type,
      'known_exposure_micros',existing_decision.known_exposure_micros,
      'additional_loss_capacity_micros',existing_decision.additional_loss_capacity_micros,
      'effective_aggregate_limit_micros',existing_decision.effective_aggregate_limit_micros,
      'rollout_revision',existing_decision.resulting_rollout_revision,
      'rollout_mode',existing_decision.resulting_rollout_mode
    );
  end if;

  select * into policy
  from tongs.openai_text_failure_loss_policy_revisions policy_row
  where policy_row.route_code=btrim(p_route_code)
    and policy_row.environment=p_financial_environment
    and policy_row.lifecycle_state='active'
  order by policy_row.revision desc limit 1;
  select * into current_rollout
  from tongs._current_openai_text_failure_loss_rollout(
    btrim(p_route_code),p_financial_environment);
  if policy.id is null or current_rollout.route_code is null
    or current_rollout.loss_policy_revision_id is distinct from policy.id then
    raise exception 'environment-scoped OpenAI failure-loss policy is not active'
      using errcode='42501';
  end if;
  select exposure.committed_micros,exposure.concurrency_count
  into known_exposure,concurrency
  from tongs._openai_text_failure_loss_exposure(
    policy.route_code,p_financial_environment,policy.rolling_window_seconds) exposure;

  if p_decision_type='bounded_test_risk_acceptance' then
    if p_additional_loss_capacity_micros>policy.per_operation_limit_micros then
      raise exception 'added Test loss capacity exceeds the hard per-operation limit'
        using errcode='22023';
    end if;
    resulting_mode:='operator_authorized';
    effective_limit:=known_exposure+p_additional_loss_capacity_micros;
  elsif p_decision_type='policy_enforce' then
    resulting_mode:='enforce';
    effective_limit:=policy.aggregate_limit_micros;
  else
    resulting_mode:='halt_new';
    effective_limit:=null;
  end if;

  select coalesce(max(revision),0)+1 into next_revision
  from tongs.openai_text_failure_loss_rollout_revisions rollout
  where rollout.route_code=policy.route_code
    and rollout.financial_environment=p_financial_environment;

  insert into tongs.openai_text_failure_loss_operator_decisions(
    id,route_code,financial_environment,decision_type,loss_policy_revision_id,
    source_rollout_revision,source_rollout_mode,resulting_rollout_revision,
    resulting_rollout_mode,known_exposure_micros,active_concurrency,
    base_aggregate_limit_micros,additional_loss_capacity_micros,
    effective_aggregate_limit_micros,reason,actor_id
  ) values(
    p_decision_id,policy.route_code,p_financial_environment,p_decision_type,policy.id,
    current_rollout.revision,current_rollout.mode,next_revision,resulting_mode,
    known_exposure,concurrency,policy.aggregate_limit_micros,
    p_additional_loss_capacity_micros,effective_limit,btrim(p_reason),p_actor_id
  );
  insert into tongs.openai_text_failure_loss_rollout_revisions(
    route_code,financial_environment,revision,mode,loss_policy_revision_id,
    source_limit_event_id,reason,actor_id,operator_decision_id
  ) values(
    policy.route_code,p_financial_environment,next_revision,resulting_mode,policy.id,
    null,btrim(p_reason),p_actor_id,p_decision_id
  );

  return jsonb_build_object(
    'decision_id',p_decision_id,'replay',false,'route_code',policy.route_code,
    'financial_environment',p_financial_environment,'decision_type',p_decision_type,
    'known_exposure_micros',known_exposure,
    'additional_loss_capacity_micros',p_additional_loss_capacity_micros,
    'effective_aggregate_limit_micros',effective_limit,
    'hard_per_operation_limit_micros',policy.per_operation_limit_micros,
    'hard_maximum_concurrency',policy.maximum_concurrency,
    'rollout_revision',next_revision,'rollout_mode',resulting_mode
  );
end $$;

create or replace function tongs._authorize_openai_text_provider_attempt_before_customer_test_scope(
  p_reservation_id uuid,p_attempt_key text,p_attempt_number smallint,p_failure_exposure_micros bigint,
  p_lease_seconds integer,p_evidence_json jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare
  binding tongs.openai_text_funding_bindings%rowtype;
  reservation tongs.funding_reservations%rowtype;
  route_rollout tongs.openai_text_rollout_revisions%rowtype;
  risk_rollout tongs.openai_text_failure_loss_rollout_revisions%rowtype;
  risk_decision tongs.openai_text_failure_loss_operator_decisions%rowtype;
  policy tongs.openai_text_failure_loss_policy_revisions%rowtype;
  hold tongs.openai_text_failure_exposure_holds%rowtype;
  begin_result jsonb;
  canonical_environment text;
  committed_micros bigint:=0;
  concurrency_count integer:=0;
  effective_aggregate_limit_micros bigint;
  next_risk_revision integer;
  limit_event_id uuid;
begin
  perform tongs._require_pricing_service_role();
  if length(btrim(coalesce(p_attempt_key,'')))<8 or p_attempt_number not between 1 and 4
    or p_failure_exposure_micros<0 or p_lease_seconds not between 5 and 900
    or jsonb_typeof(coalesce(p_evidence_json,'null'::jsonb))<>'object' then
    raise exception 'invalid OpenAI text provider attempt' using errcode='22023';
  end if;
  select * into binding from tongs.openai_text_funding_bindings
  where reservation_id=p_reservation_id;
  select * into reservation from tongs.funding_reservations where id=p_reservation_id;
  if binding.operation_id is null or reservation.id is null or binding.cost_policy_revision_id is null
    or p_attempt_number>binding.maximum_attempts then
    raise exception 'funded OpenAI text binding required' using errcode='P0002';
  end if;

  select * into hold from tongs.openai_text_failure_exposure_holds
  where attempt_key=btrim(p_attempt_key);
  if found then
    return jsonb_build_object('reservation_id',p_reservation_id,'attempt_key',hold.attempt_key,
      'replay',true,'provider_execution_authorized',false,'reason','duplicate_attempt_blocked');
  end if;

  select * into route_rollout from tongs._current_openai_text_rollout(binding.route_code);
  if route_rollout.mode<>'enforce'
    or route_rollout.cost_policy_revision_id is distinct from binding.cost_policy_revision_id then
    raise exception 'OpenAI text route is not activated for this exact cost revision' using errcode='42501';
  end if;

  if binding.credential_funding='forge' then
    canonical_environment:=reservation.funding_environment;
    if canonical_environment not in('test','live') then
      raise exception 'canonical reservation financial environment required' using errcode='42501';
    end if;
    perform pg_advisory_xact_lock(hashtextextended(
      'openai-text-loss:'||binding.route_code||':'||canonical_environment,0));
    select * into policy
    from tongs.openai_text_failure_loss_policy_revisions policy_row
    where policy_row.route_code=binding.route_code
      and policy_row.environment=canonical_environment
      and policy_row.lifecycle_state='active'
    order by policy_row.revision desc limit 1;
    select * into risk_rollout
    from tongs._current_openai_text_failure_loss_rollout(binding.route_code,canonical_environment);
    if policy.id is null or risk_rollout.route_code is null
      or risk_rollout.loss_policy_revision_id is distinct from policy.id then
      raise exception 'environment-scoped OpenAI failure-loss policy is not active' using errcode='42501';
    end if;
    if risk_rollout.mode='halt_new' then
      return jsonb_build_object(
        'provider_execution_authorized',false,'reason','failure_loss_environment_halted',
        'denial_class','platform_risk','preprovider_release_required',true,
        'financial_environment',canonical_environment,'rollout_mode','halt_new');
    elsif risk_rollout.mode='operator_authorized' then
      select * into risk_decision
      from tongs.openai_text_failure_loss_operator_decisions decision
      where decision.id=risk_rollout.operator_decision_id;
      if canonical_environment<>'test' or risk_decision.id is null
        or risk_decision.decision_type<>'bounded_test_risk_acceptance'
        or risk_decision.loss_policy_revision_id is distinct from policy.id
        or risk_decision.resulting_rollout_revision<>risk_rollout.revision then
        raise exception 'invalid bounded Test risk authorization' using errcode='42501';
      end if;
      effective_aggregate_limit_micros:=risk_decision.effective_aggregate_limit_micros;
    elsif risk_rollout.mode='enforce' then
      effective_aggregate_limit_micros:=policy.aggregate_limit_micros;
    else
      raise exception 'unsupported failure-loss rollout mode' using errcode='42501';
    end if;

    select exposure.committed_micros,exposure.concurrency_count
    into committed_micros,concurrency_count
    from tongs._openai_text_failure_loss_exposure(
      binding.route_code,canonical_environment,policy.rolling_window_seconds) exposure;

    if p_failure_exposure_micros>policy.per_operation_limit_micros then
      insert into tongs.openai_text_failure_limit_events(
        id,route_code,reservation_id,event_key,event_type,requested_micros,committed_micros,
        configured_limit_micros,evidence_json,financial_environment,environment_authority
      ) values(
        gen_random_uuid(),binding.route_code,p_reservation_id,btrim(p_attempt_key)||':operation-limit',
        'operation_limit_blocked',p_failure_exposure_micros,committed_micros,
        policy.per_operation_limit_micros,p_evidence_json,canonical_environment,'canonical_reservation');
      return jsonb_build_object(
        'provider_execution_authorized',false,'reason','operation_failure_limit',
        'denial_class','platform_risk','preprovider_release_required',true,
        'financial_environment',canonical_environment,'rollout_mode',risk_rollout.mode);
    elsif concurrency_count>=policy.maximum_concurrency then
      insert into tongs.openai_text_failure_limit_events(
        id,route_code,reservation_id,event_key,event_type,requested_micros,committed_micros,
        configured_limit_micros,evidence_json,financial_environment,environment_authority
      ) values(
        gen_random_uuid(),binding.route_code,p_reservation_id,btrim(p_attempt_key)||':concurrency-limit',
        'concurrency_blocked',p_failure_exposure_micros,committed_micros,
        effective_aggregate_limit_micros,p_evidence_json,canonical_environment,'canonical_reservation');
      return jsonb_build_object(
        'provider_execution_authorized',false,'reason','failure_loss_concurrency_limit',
        'denial_class','platform_risk','preprovider_release_required',true,
        'financial_environment',canonical_environment,'rollout_mode',risk_rollout.mode);
    elsif committed_micros+p_failure_exposure_micros>effective_aggregate_limit_micros then
      insert into tongs.openai_text_failure_limit_events(
        id,route_code,reservation_id,event_key,event_type,requested_micros,committed_micros,
        configured_limit_micros,evidence_json,financial_environment,environment_authority
      ) values(
        gen_random_uuid(),binding.route_code,p_reservation_id,btrim(p_attempt_key)||':aggregate-limit',
        'aggregate_limit_blocked',p_failure_exposure_micros,committed_micros,
        effective_aggregate_limit_micros,p_evidence_json||jsonb_build_object(
          'base_aggregate_limit_micros',policy.aggregate_limit_micros,
          'operator_decision_id',risk_rollout.operator_decision_id
        ),canonical_environment,'canonical_reservation')
      returning id into limit_event_id;
      select coalesce(max(revision),0)+1 into next_risk_revision
      from tongs.openai_text_failure_loss_rollout_revisions risk_revision
      where risk_revision.route_code=binding.route_code
        and risk_revision.financial_environment=canonical_environment;
      insert into tongs.openai_text_failure_loss_rollout_revisions(
        route_code,financial_environment,revision,mode,loss_policy_revision_id,
        source_limit_event_id,reason
      ) values(
        binding.route_code,canonical_environment,next_risk_revision,'halt_new',policy.id,
        limit_event_id,'Automatic halt: effective aggregate Forge failure-loss ceiling reached.');
      return jsonb_build_object(
        'provider_execution_authorized',false,'reason','aggregate_failure_limit',
        'denial_class','platform_risk','preprovider_release_required',true,
        'financial_environment',canonical_environment,'rollout_mode','halt_new');
    end if;

    if risk_rollout.mode='operator_authorized'
      and committed_micros+p_failure_exposure_micros>policy.aggregate_limit_micros then
      insert into tongs.openai_text_failure_limit_events(
        id,route_code,reservation_id,event_key,event_type,requested_micros,committed_micros,
        configured_limit_micros,evidence_json,financial_environment,environment_authority
      ) values(
        gen_random_uuid(),binding.route_code,p_reservation_id,
        btrim(p_attempt_key)||':aggregate-risk-accepted','aggregate_risk_accepted',
        p_failure_exposure_micros,committed_micros,effective_aggregate_limit_micros,
        p_evidence_json||jsonb_build_object(
          'base_aggregate_limit_micros',policy.aggregate_limit_micros,
          'operator_decision_id',risk_rollout.operator_decision_id,
          'accepted_total_exposure_micros',committed_micros+p_failure_exposure_micros
        ),canonical_environment,'canonical_reservation');
    end if;
  elsif p_failure_exposure_micros<>0 then
    raise exception 'BYO OpenAI attempt cannot reserve Forge provider failure exposure' using errcode='22023';
  end if;

  insert into tongs.openai_text_failure_exposure_holds(
    id,reservation_id,route_code,attempt_key,attempt_number,loss_policy_revision_id,
    authorized_exposure_micros,lease_expires_at,financial_environment,environment_authority
  ) values(
    gen_random_uuid(),p_reservation_id,binding.route_code,btrim(p_attempt_key),p_attempt_number,
    policy.id,p_failure_exposure_micros,now()+make_interval(secs=>p_lease_seconds),
    canonical_environment,case when canonical_environment is null then null else 'canonical_reservation' end
  ) returning * into hold;
  if reservation.funding_source_type='owner_budget' then
    begin_result:=tongs.begin_owner_provider_attempt(
      p_reservation_id,btrim(p_attempt_key),p_lease_seconds,p_evidence_json);
  else
    begin_result:=tongs.begin_provider_attempt(
      p_reservation_id,btrim(p_attempt_key),p_lease_seconds,p_evidence_json);
  end if;
  if coalesce((begin_result->>'provider_execution_authorized')::boolean,false) is not true then
    raise exception 'shared spending gate denied OpenAI execution' using errcode='42501';
  end if;
  return begin_result||jsonb_build_object(
    'failure_exposure_hold_id',hold.id,'failure_exposure_micros',p_failure_exposure_micros,
    'financial_environment',canonical_environment,
    'failure_loss_rollout_mode',case when binding.credential_funding='forge' then risk_rollout.mode else null end,
    'failure_loss_aggregate_limit_micros',effective_aggregate_limit_micros
  );
end $$;

revoke all on function tongs._openai_text_failure_loss_exposure(text,text,integer)
  from public,anon,authenticated;
revoke all on function tongs.control_openai_text_failure_loss_environment(
  uuid,uuid,text,text,text,bigint,text
) from public,anon,authenticated,service_role;
revoke all on function tongs._authorize_openai_text_provider_attempt_before_customer_test_scope(
  uuid,text,smallint,bigint,integer,jsonb
) from public,anon,authenticated;
grant execute on function tongs._openai_text_failure_loss_exposure(text,text,integer)
  to service_role;
grant execute on function tongs.control_openai_text_failure_loss_environment(
  uuid,uuid,text,text,text,bigint,text
) to service_role;

comment on table tongs.openai_text_failure_loss_operator_decisions is
  'Immutable operator decisions for independent environment risk control. Bounded acceptance is finite and Test-only.';
comment on function tongs.control_openai_text_failure_loss_environment(
  uuid,uuid,text,text,text,bigint,text
) is 'Appends audited operator halt, base-policy enforcement, or finite Test-only risk acceptance without changing policy limits or exposure history.';
comment on function tongs._authorize_openai_text_provider_attempt_before_customer_test_scope(
  uuid,text,smallint,bigint,integer,jsonb
) is 'Authorizes the shared provider boundary with hard per-operation/concurrency limits and optional finite operator-accepted Test aggregate exposure.';

notify pgrst,'reload schema';
commit;

