-- Keep failure exposure within the active policy revision and allow a no-provider
-- pilot reservation to be replaced without increasing the approved budget or call count.
begin;

create or replace function tongs.authorize_openai_text_provider_attempt(
  p_reservation_id uuid,p_attempt_key text,p_attempt_number smallint,p_failure_exposure_micros bigint,
  p_lease_seconds integer,p_evidence_json jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_binding tongs.openai_text_funding_bindings%rowtype; v_rollout tongs.openai_text_rollout_revisions%rowtype;
  v_policy tongs.openai_text_failure_loss_policy_revisions%rowtype; v_hold tongs.openai_text_failure_exposure_holds%rowtype;
  v_begin jsonb; v_committed bigint:=0; v_concurrency integer:=0; v_next_revision integer;
begin
  perform tongs._require_pricing_service_role();
  if length(btrim(coalesce(p_attempt_key,'')))<8 or p_attempt_number not between 1 and 4
    or p_failure_exposure_micros<0 or p_lease_seconds not between 5 and 900
    or jsonb_typeof(coalesce(p_evidence_json,'null'::jsonb))<>'object' then
    raise exception 'invalid OpenAI text provider attempt' using errcode='22023'; end if;
  select * into v_binding from tongs.openai_text_funding_bindings where reservation_id=p_reservation_id;
  if not found or v_binding.cost_policy_revision_id is null or p_attempt_number>v_binding.maximum_attempts then
    raise exception 'funded OpenAI text binding required' using errcode='P0002'; end if;
  perform pg_advisory_xact_lock(hashtextextended('openai-text-loss:'||v_binding.route_code||':production',0));
  select * into v_hold from tongs.openai_text_failure_exposure_holds where attempt_key=btrim(p_attempt_key);
  if found then
    return jsonb_build_object('reservation_id',p_reservation_id,'attempt_key',v_hold.attempt_key,'replay',true,
      'provider_execution_authorized',false,'reason','duplicate_attempt_blocked');
  end if;
  select * into v_rollout from tongs._current_openai_text_rollout(v_binding.route_code);
  if v_rollout.mode<>'enforce' or v_rollout.cost_policy_revision_id is distinct from v_binding.cost_policy_revision_id then
    raise exception 'OpenAI text route is not activated for this exact cost revision' using errcode='42501'; end if;
  if v_binding.credential_funding='forge' then
    select * into v_policy from tongs.openai_text_failure_loss_policy_revisions
      where route_code=v_binding.route_code and environment='production' and lifecycle_state='active'
      order by revision desc limit 1;
    if not found then raise exception 'OpenAI failure-loss policy is not active' using errcode='42501'; end if;
    with latest as (
      select distinct on (h.id) h.id,h.authorized_exposure_micros,e.event_type,e.actual_supplier_cost_micros,e.created_at
      from tongs.openai_text_failure_exposure_holds h
      join tongs.openai_text_failure_exposure_events e on e.hold_id=h.id
      where h.route_code=v_binding.route_code and h.loss_policy_revision_id=v_policy.id
      order by h.id,e.sequence desc
    ) select coalesce(sum(case when event_type in ('authorized','unresolved') then authorized_exposure_micros
        when event_type='failure_realized' and created_at>=now()-make_interval(secs=>v_policy.rolling_window_seconds)
          then coalesce(actual_supplier_cost_micros,authorized_exposure_micros) else 0 end),0),
      count(*) filter(where event_type in ('authorized','unresolved')) into v_committed,v_concurrency from latest;
    if p_failure_exposure_micros>v_policy.per_operation_limit_micros then
      insert into tongs.openai_text_failure_limit_events(id,route_code,reservation_id,event_key,event_type,requested_micros,committed_micros,configured_limit_micros,evidence_json)
      values(gen_random_uuid(),v_binding.route_code,p_reservation_id,btrim(p_attempt_key)||':operation-limit','operation_limit_blocked',p_failure_exposure_micros,v_committed,v_policy.per_operation_limit_micros,p_evidence_json);
      return jsonb_build_object('provider_execution_authorized',false,'reason','operation_failure_limit','rollout_mode',v_rollout.mode);
    elsif v_concurrency>=v_policy.maximum_concurrency then
      insert into tongs.openai_text_failure_limit_events(id,route_code,reservation_id,event_key,event_type,requested_micros,committed_micros,configured_limit_micros,evidence_json)
      values(gen_random_uuid(),v_binding.route_code,p_reservation_id,btrim(p_attempt_key)||':concurrency-limit','concurrency_blocked',p_failure_exposure_micros,v_committed,v_policy.aggregate_limit_micros,p_evidence_json);
      return jsonb_build_object('provider_execution_authorized',false,'reason','failure_loss_concurrency_limit','rollout_mode',v_rollout.mode);
    elsif v_committed+p_failure_exposure_micros>v_policy.aggregate_limit_micros then
      insert into tongs.openai_text_failure_limit_events(id,route_code,reservation_id,event_key,event_type,requested_micros,committed_micros,configured_limit_micros,evidence_json)
      values(gen_random_uuid(),v_binding.route_code,p_reservation_id,btrim(p_attempt_key)||':aggregate-limit','aggregate_limit_blocked',p_failure_exposure_micros,v_committed,v_policy.aggregate_limit_micros,p_evidence_json);
      select coalesce(max(revision),0)+1 into v_next_revision from tongs.openai_text_rollout_revisions where route_code=v_binding.route_code;
      insert into tongs.openai_text_rollout_revisions(route_code,revision,mode,cost_policy_revision_id,reason)
      values(v_binding.route_code,v_next_revision,'halt_new',v_binding.cost_policy_revision_id,'Automatic halt: aggregate Forge failure-loss ceiling reached.');
      return jsonb_build_object('provider_execution_authorized',false,'reason','aggregate_failure_limit','rollout_mode','halt_new');
    end if;
  elsif p_failure_exposure_micros<>0 then
    raise exception 'BYO OpenAI attempt cannot reserve Forge provider failure exposure' using errcode='22023';
  end if;
  insert into tongs.openai_text_failure_exposure_holds(id,reservation_id,route_code,attempt_key,attempt_number,
    loss_policy_revision_id,authorized_exposure_micros,lease_expires_at)
  values(gen_random_uuid(),p_reservation_id,v_binding.route_code,btrim(p_attempt_key),p_attempt_number,
    v_policy.id,p_failure_exposure_micros,now()+make_interval(secs=>p_lease_seconds)) returning * into v_hold;
  insert into tongs.openai_text_failure_exposure_events(id,hold_id,sequence,event_key,event_type,evidence_json)
  values(gen_random_uuid(),v_hold.id,1,btrim(p_attempt_key)||':loss-authorized','authorized',p_evidence_json);
  if (select funding_source_type from tongs.funding_reservations where id=p_reservation_id)='owner_budget' then
    v_begin:=tongs.begin_owner_provider_attempt(p_reservation_id,btrim(p_attempt_key),p_lease_seconds,p_evidence_json);
  else
    v_begin:=tongs.begin_provider_attempt(p_reservation_id,btrim(p_attempt_key),p_lease_seconds,p_evidence_json);
  end if;
  if coalesce((v_begin->>'provider_execution_authorized')::boolean,false) is not true then
    raise exception 'shared spending gate denied OpenAI execution' using errcode='42501'; end if;
  return v_begin||jsonb_build_object('failure_exposure_hold_id',v_hold.id,'failure_exposure_micros',p_failure_exposure_micros);
end $$;

create or replace function tongs.prepare_owner_hearth_chat_luna_pilot(
  p_quote_id uuid,p_acceptance_id uuid,p_reservation_id uuid,p_operator_user_id uuid,
  p_operation_id text,p_workspace_id uuid,p_budget_id uuid,p_pricing_revision_id uuid,
  p_request_fingerprint text,p_acceptance_key text,p_reservation_key text,p_expires_at timestamptz
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare
  v_quote jsonb; v_reservation jsonb; v_binding jsonb;
  v_budget tongs.owner_operating_budgets%rowtype;
  v_budget_revision tongs.owner_operating_budget_revisions%rowtype;
begin
  perform tongs._require_pricing_service_role();
  select * into v_budget from tongs.owner_operating_budgets where id=p_budget_id;
  select * into v_budget_revision from tongs.owner_operating_budget_revisions
    where budget_id=p_budget_id order by revision desc limit 1;
  if v_budget.id is null or v_budget_revision.status<>'active'
     or v_budget_revision.maximum_amount_micros<>11015
     or v_budget.environment<>'production' or v_budget.workspace_id is distinct from p_workspace_id
     or lower(coalesce(v_budget.provider,''))<>'openai'
     or lower(coalesce(v_budget.route,''))<>'hearth.chat_completion'
     or lower(coalesce(v_budget.sku,''))<>'gpt-5.6-luna'
     or v_budget.currency<>'USD' or clock_timestamp()<v_budget.period_start
     or clock_timestamp()>=v_budget.period_end
     or not exists(select 1 from tongs.openai_text_activation_decisions
       where proposal_id='30000000-0000-4000-8000-000000000002'::uuid
         and decision='approved' and operator_user_id=p_operator_user_id) then
    raise exception 'exact active Luna owner budget required' using errcode='P0002';
  end if;
  if exists(select 1 from tongs.funding_reservations r
    where r.funding_source_type='owner_budget' and r.funding_source_id=p_budget_id and r.id<>p_reservation_id
      and (tongs._funding_reservation_state(r.id)<>'released' or exists(
        select 1 from tongs.funding_reservation_events e
        where e.reservation_id=r.id and e.event_type='provider_attempt_shadowed'))) then
    raise exception 'Luna owner pilot permits exactly one provider-attempting reservation' using errcode='P0001';
  end if;
  v_quote:=tongs.create_owner_hearth_chat_luna_pilot_quote(
    p_quote_id,p_acceptance_id,p_acceptance_key,p_operator_user_id,p_operation_id,
    p_workspace_id,p_pricing_revision_id,p_request_fingerprint,p_expires_at
  );
  v_reservation:=tongs.reserve_operation(
    p_reservation_id,p_quote_id,'owner_budget',p_budget_id,p_reservation_key
  );
  v_binding:=tongs.bind_openai_text_funding_reservation(
    p_operation_id,'hearth.chat_completion',p_reservation_id,'forge','gpt-5.6-luna',
    '10000000-0000-4000-8000-000000000010'::uuid
  );
  return jsonb_build_object(
    'quote',v_quote,'reservation',v_reservation,'binding',v_binding,
    'customer_charge_micros',0,'customer_revenue_micros',0,'provider_execution_authorized',false);
end $$;

create or replace function tongs.rearm_owner_hearth_chat_luna_pilot(
  p_operator_user_id uuid,p_budget_id uuid,p_reason text
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare
  v_reason text:=nullif(btrim(coalesce(p_reason,'')),'');
  v_budget tongs.owner_operating_budgets%rowtype;
  v_budget_revision tongs.owner_operating_budget_revisions%rowtype;
  v_rollout tongs.openai_text_rollout_revisions%rowtype;
  v_next_rollout integer;
begin
  perform tongs._require_pricing_service_role();
  if p_operator_user_id is null or not tongs.is_platform_operator(p_operator_user_id)
     or p_budget_id is null or v_reason is null then
    raise exception 'invalid owner Luna pilot rearm' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('owner-hearth-openai-luna-pilot',0));
  select * into v_budget from tongs.owner_operating_budgets where id=p_budget_id;
  select * into v_budget_revision from tongs.owner_operating_budget_revisions
    where budget_id=p_budget_id order by revision desc limit 1;
  if not found or v_budget.created_by<>p_operator_user_id or v_budget.environment<>'production'
     or lower(coalesce(v_budget.provider,''))<>'openai'
     or lower(coalesce(v_budget.route,''))<>'hearth.chat_completion'
     or lower(coalesce(v_budget.sku,''))<>'gpt-5.6-luna'
     or v_budget_revision.status<>'active' or v_budget_revision.maximum_amount_micros<>11015
     or clock_timestamp()>=v_budget.period_end then
    raise exception 'exact active owner Luna pilot budget not found' using errcode='P0002';
  end if;
  if not exists(select 1 from tongs.openai_text_activation_decisions
    where proposal_id='30000000-0000-4000-8000-000000000002'::uuid
      and decision='approved' and operator_user_id=p_operator_user_id) then
    raise exception 'approved Luna pilot decision missing' using errcode='42501';
  end if;
  if exists(select 1 from tongs.funding_reservations r
    where r.funding_source_type='owner_budget' and r.funding_source_id=p_budget_id
      and (tongs._funding_reservation_state(r.id)<>'released' or exists(
        select 1 from tongs.funding_reservation_events e
        where e.reservation_id=r.id and e.event_type='provider_attempt_shadowed'))) then
    raise exception 'Luna pilot cannot rearm after a provider attempt or unresolved reservation' using errcode='P0001';
  end if;
  select * into v_rollout from tongs._current_openai_text_rollout('hearth.chat_completion');
  if v_rollout.mode<>'halt_new' or v_rollout.cost_policy_revision_id is distinct from
     '10000000-0000-4000-8000-000000000010'::uuid then
    raise exception 'Luna pilot rearm requires exact halted rollout' using errcode='P0001';
  end if;
  select coalesce(max(revision),0)+1 into v_next_rollout
    from tongs.openai_text_rollout_revisions where route_code='hearth.chat_completion';
  insert into tongs.openai_text_rollout_revisions(
    route_code,revision,mode,cost_policy_revision_id,reason,actor_id
  ) values (
    'hearth.chat_completion',v_next_rollout,'enforce',
    '10000000-0000-4000-8000-000000000010',v_reason,p_operator_user_id
  );
  return jsonb_build_object(
    'budget_id',p_budget_id,'rollout_mode','enforce','rollout_revision',v_next_rollout,
    'maximum_amount_micros',11015,'customer_settlement_enabled',false,
    'prior_provider_submissions',0
  );
end $$;

revoke all on function tongs.authorize_openai_text_provider_attempt(uuid,text,smallint,bigint,integer,jsonb)
  from public,anon,authenticated;
grant execute on function tongs.authorize_openai_text_provider_attempt(uuid,text,smallint,bigint,integer,jsonb)
  to service_role;
revoke all on function tongs.prepare_owner_hearth_chat_luna_pilot(uuid,uuid,uuid,uuid,text,uuid,uuid,uuid,text,text,text,timestamptz)
  from public,anon,authenticated;
grant execute on function tongs.prepare_owner_hearth_chat_luna_pilot(uuid,uuid,uuid,uuid,text,uuid,uuid,uuid,text,text,text,timestamptz)
  to service_role;
revoke all on function tongs.rearm_owner_hearth_chat_luna_pilot(uuid,uuid,text)
  from public,anon,authenticated;
grant execute on function tongs.rearm_owner_hearth_chat_luna_pilot(uuid,uuid,text)
  to service_role;

comment on function tongs.rearm_owner_hearth_chat_luna_pilot(uuid,uuid,text) is
  'Rearms the exact Luna owner pilot only after all earlier reservations were released before any provider attempt; creates no budget and does not increase its cap.';

notify pgrst,'reload schema';
commit;
