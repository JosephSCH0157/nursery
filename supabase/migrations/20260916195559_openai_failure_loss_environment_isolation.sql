-- Isolate Forge supplier failure-loss authority by canonical Test/Live financial
-- environment and keep definitive pre-provider denials releasable without
-- changing approved ceilings, pricing, or historical evidence.
begin;

alter table tongs.openai_text_failure_loss_policy_revisions
  drop constraint if exists openai_text_failure_loss_policy_revisions_environment_check;
alter table tongs.openai_text_failure_loss_policy_revisions
  add constraint openai_text_failure_loss_policy_revisions_environment_check
  check(environment in('test','live','production'));

-- New records carry direct environment authority. Historical rows remain null
-- and are classified through their immutable reservation; no evidence is rewritten.
alter table tongs.openai_text_failure_exposure_holds
  add column financial_environment text,
  add column environment_authority text,
  add constraint openai_text_failure_exposure_holds_environment_check check(
    (financial_environment is null and environment_authority is null)
    or (financial_environment in('test','live') and environment_authority='canonical_reservation')
  );

alter table tongs.openai_text_failure_limit_events
  add column financial_environment text,
  add column environment_authority text,
  add constraint openai_text_failure_limit_events_environment_check check(
    (financial_environment is null and environment_authority is null)
    or (financial_environment in('test','live') and environment_authority='canonical_reservation')
  );

create table tongs.openai_text_failure_loss_rollout_revisions(
  route_code text not null references tongs.openai_text_route_policies(route_code) on delete restrict,
  financial_environment text not null check(financial_environment in('test','live')),
  revision integer not null check(revision>0),
  mode text not null check(mode in('enforce','halt_new')),
  loss_policy_revision_id uuid not null references tongs.openai_text_failure_loss_policy_revisions(id) on delete restrict,
  source_limit_event_id uuid references tongs.openai_text_failure_limit_events(id) on delete restrict,
  reason text not null check(nullif(btrim(reason),'') is not null),
  actor_id uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key(route_code,financial_environment,revision)
);

create index openai_text_failure_loss_rollout_policy_idx
  on tongs.openai_text_failure_loss_rollout_revisions(loss_policy_revision_id);
create index openai_text_failure_loss_rollout_limit_event_idx
  on tongs.openai_text_failure_loss_rollout_revisions(source_limit_event_id)
  where source_limit_event_id is not null;
create index openai_text_failure_loss_rollout_actor_idx
  on tongs.openai_text_failure_loss_rollout_revisions(actor_id)
  where actor_id is not null;

alter table tongs.openai_text_failure_loss_rollout_revisions enable row level security;
revoke all on tongs.openai_text_failure_loss_rollout_revisions from public,anon,authenticated,service_role;
grant select on tongs.openai_text_failure_loss_rollout_revisions to service_role;
create trigger openai_text_failure_loss_rollout_revisions_immutable
before update or delete on tongs.openai_text_failure_loss_rollout_revisions
for each row execute function tongs._reject_accounting_mutation();

-- The latest legacy production policy supplied one environment-agnostic path.
-- Append exact-value Test and Live revisions rather than relabelling history.
with source_policy as(
  select distinct on(policy.route_code) policy.*
  from tongs.openai_text_failure_loss_policy_revisions policy
  where policy.environment='production' and policy.lifecycle_state='active'
  order by policy.route_code,policy.revision desc
), environments as(
  select 'test'::text as financial_environment
  union all select 'live'::text
)
insert into tongs.openai_text_failure_loss_policy_revisions(
  id,route_code,environment,revision,per_operation_limit_micros,aggregate_limit_micros,
  rolling_window_seconds,maximum_concurrency,lifecycle_state,reason,actor_id
)
select
  extensions.uuid_generate_v5(source_policy.id,'canonical-financial-environment:'||environments.financial_environment),
  source_policy.route_code,environments.financial_environment,
  (select coalesce(max(existing.revision),0)+1
   from tongs.openai_text_failure_loss_policy_revisions existing
   where existing.route_code=source_policy.route_code
     and existing.environment=environments.financial_environment),
  source_policy.per_operation_limit_micros,source_policy.aggregate_limit_micros,
  source_policy.rolling_window_seconds,source_policy.maximum_concurrency,'active',
  'Canonical '||upper(environments.financial_environment)||
    ' failure-loss policy derived without changing the approved legacy limits; source policy '
    ||source_policy.id::text||'.',null
from source_policy cross join environments;

-- Classify the current route-wide automatic halt through the reservation that
-- caused it. This preserves the existing Test halt while Live starts isolated.
with current_policy as(
  select distinct on(policy.route_code,policy.environment) policy.*
  from tongs.openai_text_failure_loss_policy_revisions policy
  where policy.environment in('test','live') and policy.lifecycle_state='active'
  order by policy.route_code,policy.environment,policy.revision desc
), current_route as(
  select distinct on(rollout.route_code) rollout.*
  from tongs.openai_text_rollout_revisions rollout
  order by rollout.route_code,rollout.revision desc
)
insert into tongs.openai_text_failure_loss_rollout_revisions(
  route_code,financial_environment,revision,mode,loss_policy_revision_id,
  source_limit_event_id,reason,actor_id
)
select policy.route_code,policy.environment,1,
  case when route.mode='halt_new'
    and route.reason='Automatic halt: aggregate Forge failure-loss ceiling reached.'
    and latest_limit.id is not null then 'halt_new' else 'enforce' end,
  policy.id,latest_limit.id,
  case when route.mode='halt_new'
    and route.reason='Automatic halt: aggregate Forge failure-loss ceiling reached.'
    and latest_limit.id is not null
    then 'Classified the existing route-wide aggregate halt to the canonical '
      ||upper(policy.environment)||' reservation environment.'
    else 'Environment-isolated failure-loss enforcement initialized from approved unchanged limits.' end,
  null
from current_policy policy
left join current_route route on route.route_code=policy.route_code
left join lateral(
  select limit_event.id
  from tongs.openai_text_failure_limit_events limit_event
  join tongs.funding_reservations reservation on reservation.id=limit_event.reservation_id
  where limit_event.route_code=policy.route_code
    and limit_event.event_type in('aggregate_limit_blocked','overrun_halted')
    and reservation.funding_environment=policy.environment
  order by limit_event.created_at desc limit 1
) latest_limit on true;

-- Route activation remains environment-neutral. Move only the automatic risk
-- halt into the environment ledger by appending an audit-preserving rearm.
do $$
declare current_rollout tongs.openai_text_rollout_revisions%rowtype; next_revision integer;
begin
  for current_rollout in
    select distinct on(rollout.route_code) rollout.*
    from tongs.openai_text_rollout_revisions rollout
    order by rollout.route_code,rollout.revision desc
  loop
    if current_rollout.mode='halt_new'
      and current_rollout.reason='Automatic halt: aggregate Forge failure-loss ceiling reached.' then
      select coalesce(max(revision),0)+1 into next_revision
      from tongs.openai_text_rollout_revisions where route_code=current_rollout.route_code;
      insert into tongs.openai_text_rollout_revisions(
        route_code,revision,mode,cost_policy_revision_id,reason,actor_id,funding_scope
      ) values(
        current_rollout.route_code,next_revision,'enforce',current_rollout.cost_policy_revision_id,
        'Route activation restored after automatic failure-loss halts became canonical-environment scoped.',
        null,current_rollout.funding_scope
      );
    end if;
  end loop;
end $$;

create or replace function tongs._current_openai_text_failure_loss_rollout(
  p_route_code text,p_financial_environment text
) returns tongs.openai_text_failure_loss_rollout_revisions
language sql stable security definer set search_path=pg_catalog as $$
  select row_data
  from tongs.openai_text_failure_loss_rollout_revisions row_data
  where row_data.route_code=btrim(p_route_code)
    and row_data.financial_environment=p_financial_environment
  order by row_data.revision desc limit 1
$$;

create or replace function tongs._openai_rollout_for_funding(
  p_route_code text,p_credential_funding text
) returns setof tongs.openai_text_rollout_revisions
language plpgsql stable security definer set search_path=pg_catalog as $$
declare
  route_rollout tongs.openai_text_rollout_revisions%rowtype;
  risk_rollout tongs.openai_text_failure_loss_rollout_revisions%rowtype;
  financial_environment text;
begin
  select * into route_rollout
  from tongs.openai_text_rollout_revisions rollout
  where rollout.route_code=btrim(p_route_code)
    and (rollout.funding_scope='all' or p_credential_funding='forge')
  order by rollout.revision desc limit 1;
  if not found then return; end if;
  if p_credential_funding='forge' then
    financial_environment:=tongs._current_financial_environment();
    if financial_environment not in('test','live') then
      route_rollout.mode:='halt_new';
    else
      select * into risk_rollout
      from tongs._current_openai_text_failure_loss_rollout(route_rollout.route_code,financial_environment);
      if not found or risk_rollout.mode='halt_new' then route_rollout.mode:='halt_new'; end if;
    end if;
  end if;
  return next route_rollout;
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
  policy tongs.openai_text_failure_loss_policy_revisions%rowtype;
  hold tongs.openai_text_failure_exposure_holds%rowtype;
  begin_result jsonb;
  canonical_environment text;
  committed_micros bigint:=0;
  concurrency_count integer:=0;
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
    end if;

    with latest as(
      select distinct on(exposure_hold.id)
        exposure_hold.id,exposure_hold.authorized_exposure_micros,
        exposure_event.event_type,exposure_event.actual_supplier_cost_micros,exposure_event.created_at
      from tongs.openai_text_failure_exposure_holds exposure_hold
      join tongs.funding_reservations exposure_reservation
        on exposure_reservation.id=exposure_hold.reservation_id
      join tongs.openai_text_failure_exposure_events exposure_event
        on exposure_event.hold_id=exposure_hold.id
      where exposure_hold.route_code=binding.route_code
        and exposure_reservation.funding_environment=canonical_environment
      order by exposure_hold.id,exposure_event.sequence desc
    )
    select coalesce(sum(case
        when event_type in('authorized','unresolved') then authorized_exposure_micros
        when event_type='failure_realized'
          and created_at>=now()-make_interval(secs=>policy.rolling_window_seconds)
          then coalesce(actual_supplier_cost_micros,authorized_exposure_micros)
        else 0 end),0),
      count(*) filter(where event_type in('authorized','unresolved'))
    into committed_micros,concurrency_count from latest;

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
        policy.aggregate_limit_micros,p_evidence_json,canonical_environment,'canonical_reservation');
      return jsonb_build_object(
        'provider_execution_authorized',false,'reason','failure_loss_concurrency_limit',
        'denial_class','platform_risk','preprovider_release_required',true,
        'financial_environment',canonical_environment,'rollout_mode',risk_rollout.mode);
    elsif committed_micros+p_failure_exposure_micros>policy.aggregate_limit_micros then
      insert into tongs.openai_text_failure_limit_events(
        id,route_code,reservation_id,event_key,event_type,requested_micros,committed_micros,
        configured_limit_micros,evidence_json,financial_environment,environment_authority
      ) values(
        gen_random_uuid(),binding.route_code,p_reservation_id,btrim(p_attempt_key)||':aggregate-limit',
        'aggregate_limit_blocked',p_failure_exposure_micros,committed_micros,
        policy.aggregate_limit_micros,p_evidence_json,canonical_environment,'canonical_reservation')
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
        limit_event_id,'Automatic halt: aggregate Forge failure-loss ceiling reached.');
      return jsonb_build_object(
        'provider_execution_authorized',false,'reason','aggregate_failure_limit',
        'denial_class','platform_risk','preprovider_release_required',true,
        'financial_environment',canonical_environment,'rollout_mode','halt_new');
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
    'financial_environment',canonical_environment);
end $$;

create or replace function tongs.close_openai_text_failure_exposure(
  p_reservation_id uuid,p_attempt_key text,p_outcome text,p_actual_supplier_cost_micros bigint,
  p_evidence_json jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare
  hold tongs.openai_text_failure_exposure_holds%rowtype;
  reservation tongs.funding_reservations%rowtype;
  existing_event tongs.openai_text_failure_exposure_events%rowtype;
  risk_rollout tongs.openai_text_failure_loss_rollout_revisions%rowtype;
  event_sequence integer;
  next_revision integer;
  loss_event_key text;
  canonical_environment text;
  limit_event_id uuid;
begin
  perform tongs._require_pricing_service_role();
  if p_outcome not in('success_released','failure_realized','unresolved','reconciled')
    or (p_outcome='success_released' and p_actual_supplier_cost_micros is null)
    or p_actual_supplier_cost_micros<0
    or jsonb_typeof(coalesce(p_evidence_json,'null'::jsonb))<>'object' then
    raise exception 'invalid OpenAI failure exposure close' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('openai-text-attempt:'||btrim(p_attempt_key),0));
  select * into hold from tongs.openai_text_failure_exposure_holds
  where reservation_id=p_reservation_id and attempt_key=btrim(p_attempt_key);
  select * into reservation from tongs.funding_reservations where id=p_reservation_id;
  if hold.id is null or reservation.id is null then
    raise exception 'OpenAI failure exposure hold not found' using errcode='P0002';
  end if;
  canonical_environment:=coalesce(hold.financial_environment,reservation.funding_environment);
  loss_event_key:=btrim(p_attempt_key)||':loss:'||p_outcome;
  select * into existing_event from tongs.openai_text_failure_exposure_events
  where event_key=loss_event_key;
  if found then return jsonb_build_object('hold_id',hold.id,'outcome',existing_event.event_type,'replay',true); end if;
  select * into existing_event from tongs.openai_text_failure_exposure_events
  where hold_id=hold.id order by sequence desc limit 1;
  if existing_event.event_type in('success_released','failure_realized','reconciled') then
    raise exception 'OpenAI failure exposure is terminal' using errcode='P0001';
  end if;
  select coalesce(max(sequence),0)+1 into event_sequence
  from tongs.openai_text_failure_exposure_events where hold_id=hold.id;
  insert into tongs.openai_text_failure_exposure_events(
    id,hold_id,sequence,event_key,event_type,actual_supplier_cost_micros,evidence_json
  ) values(
    gen_random_uuid(),hold.id,event_sequence,loss_event_key,p_outcome,p_actual_supplier_cost_micros,p_evidence_json);

  if p_actual_supplier_cost_micros is not null
    and p_actual_supplier_cost_micros>hold.authorized_exposure_micros then
    insert into tongs.pricing_discrepancies(
      id,reservation_id,discrepancy_key,discrepancy_type,quoted_ceiling_micros,
      observed_amount_micros,evidence_json
    ) values(
      gen_random_uuid(),p_reservation_id,btrim(p_attempt_key)||':failure-loss-overrun',
      'wholesale_ceiling_overrun',hold.authorized_exposure_micros,p_actual_supplier_cost_micros,
      p_evidence_json||jsonb_build_object('component','openai_failure_loss'))
    on conflict(discrepancy_key) do nothing;

    insert into tongs.openai_text_failure_limit_events(
      id,route_code,reservation_id,event_key,event_type,requested_micros,committed_micros,
      configured_limit_micros,evidence_json,financial_environment,environment_authority
    ) values(
      gen_random_uuid(),hold.route_code,p_reservation_id,btrim(p_attempt_key)||':overrun-halted',
      'overrun_halted',p_actual_supplier_cost_micros,p_actual_supplier_cost_micros,
      hold.authorized_exposure_micros,p_evidence_json,
      case when canonical_environment in('test','live') then canonical_environment else null end,
      case when canonical_environment in('test','live') then 'canonical_reservation' else null end)
    returning id into limit_event_id;

    if canonical_environment in('test','live') and hold.loss_policy_revision_id is not null then
      perform pg_advisory_xact_lock(hashtextextended(
        'openai-text-loss:'||hold.route_code||':'||canonical_environment,0));
      select * into risk_rollout
      from tongs._current_openai_text_failure_loss_rollout(hold.route_code,canonical_environment);
      if risk_rollout.route_code is null then
        raise exception 'environment-scoped OpenAI failure-loss rollout is unavailable' using errcode='P0001';
      end if;
      if risk_rollout.mode<>'halt_new' then
        select coalesce(max(revision),0)+1 into next_revision
        from tongs.openai_text_failure_loss_rollout_revisions risk_revision
        where risk_revision.route_code=hold.route_code
          and risk_revision.financial_environment=canonical_environment;
        insert into tongs.openai_text_failure_loss_rollout_revisions(
          route_code,financial_environment,revision,mode,loss_policy_revision_id,
          source_limit_event_id,reason
        ) values(
          hold.route_code,canonical_environment,next_revision,'halt_new',
          risk_rollout.loss_policy_revision_id,limit_event_id,
          'Automatic halt: actual OpenAI failure cost exceeded the authorized per-attempt ceiling.');
      end if;
    else
      select coalesce(max(revision),0)+1 into next_revision
      from tongs.openai_text_rollout_revisions where route_code=hold.route_code;
      insert into tongs.openai_text_rollout_revisions(route_code,revision,mode,reason)
      values(hold.route_code,next_revision,'halt_new',
        'Automatic halt: actual OpenAI failure cost exceeded the authorized per-attempt ceiling.');
    end if;
  end if;
  return jsonb_build_object(
    'hold_id',hold.id,'outcome',p_outcome,'replay',false,
    'route_halted',p_actual_supplier_cost_micros>hold.authorized_exposure_micros,
    'financial_environment',case when canonical_environment in('test','live') then canonical_environment else null end);
end $$;

revoke all on function tongs._current_openai_text_failure_loss_rollout(text,text)
  from public,anon,authenticated;
revoke all on function tongs._openai_rollout_for_funding(text,text)
  from public,anon,authenticated;
revoke all on function tongs._authorize_openai_text_provider_attempt_before_customer_test_scope(
  uuid,text,smallint,bigint,integer,jsonb
) from public,anon,authenticated;
revoke all on function tongs.close_openai_text_failure_exposure(uuid,text,text,bigint,jsonb)
  from public,anon,authenticated;
grant execute on function tongs._current_openai_text_failure_loss_rollout(text,text) to service_role;
grant execute on function tongs._openai_rollout_for_funding(text,text) to service_role;
grant execute on function tongs.close_openai_text_failure_exposure(uuid,text,text,bigint,jsonb) to service_role;

comment on table tongs.openai_text_failure_loss_rollout_revisions is
  'Append-only Test/Live supplier-risk halt state. Route activation remains one shared business path.';
comment on function tongs._current_openai_text_failure_loss_rollout(text,text) is
  'Reads failure-loss halt state for one server-authoritative canonical financial environment.';
comment on function tongs._authorize_openai_text_provider_attempt_before_customer_test_scope(
  uuid,text,smallint,bigint,integer,jsonb
) is 'Authorizes the shared OpenAI provider boundary with Test/Live failure exposure isolated by immutable reservation authority.';

notify pgrst,'reload schema';
commit;

