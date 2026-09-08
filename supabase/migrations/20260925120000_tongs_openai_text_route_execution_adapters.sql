-- Generic server-owned execution context and canonical paid-result persistence
-- for the seven remaining OpenAI text routes. This migration deliberately does
-- not publish pricing, activate a rollout, grant funding, or authorize a live
-- provider call.

begin;

create table tongs.openai_text_provider_captures (
  id uuid primary key,
  reservation_id uuid not null references tongs.funding_reservations(id) on delete restrict,
  attempt_number smallint not null check (attempt_number between 1 and 4),
  capture_key text not null unique check (length(btrim(capture_key)) between 8 and 300),
  provider_request_id text,
  input_units bigint not null check (input_units>=0),
  output_units bigint not null check (output_units>=0),
  response_evidence_json jsonb not null default '{}'::jsonb check (jsonb_typeof(response_evidence_json)='object'),
  captured_at timestamptz not null default now(),
  unique(reservation_id,attempt_number)
);
alter table tongs.openai_text_provider_captures enable row level security;
alter table tongs.openai_text_provider_captures force row level security;
revoke all on tongs.openai_text_provider_captures from public,anon,authenticated,service_role;
grant select on tongs.openai_text_provider_captures to service_role;
create trigger openai_text_provider_captures_immutable before update or delete on tongs.openai_text_provider_captures
for each row execute function tongs._reject_accounting_mutation();

create or replace function tongs.record_openai_text_provider_capture(
  p_capture_id uuid,p_reservation_id uuid,p_attempt_number smallint,p_capture_key text,
  p_provider_request_id text,p_input_units bigint,p_output_units bigint,p_response_evidence_json jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_binding tongs.openai_text_funding_bindings%rowtype; v_existing tongs.openai_text_provider_captures%rowtype;
begin
  perform tongs._require_pricing_service_role();
  select * into v_binding from tongs.openai_text_funding_bindings where reservation_id=p_reservation_id;
  if not found or p_attempt_number>v_binding.maximum_attempts or p_input_units>v_binding.maximum_input_units
    or p_output_units>v_binding.maximum_output_units then
    raise exception 'OpenAI provider capture exceeded accepted bound' using errcode='P0001';
  end if;
  select * into v_existing from tongs.openai_text_provider_captures
    where reservation_id=p_reservation_id and attempt_number=p_attempt_number;
  if found then return jsonb_build_object('capture_id',v_existing.id,'replay',true); end if;
  insert into tongs.openai_text_provider_captures(id,reservation_id,attempt_number,capture_key,provider_request_id,input_units,output_units,response_evidence_json)
  values(p_capture_id,p_reservation_id,p_attempt_number,btrim(p_capture_key),nullif(btrim(coalesce(p_provider_request_id,'')),''),p_input_units,p_output_units,coalesce(p_response_evidence_json,'{}'::jsonb));
  return jsonb_build_object('capture_id',p_capture_id,'replay',false);
end $$;

create or replace function tongs.resolve_openai_text_paid_execution_context(
  p_route_code text,
  p_operation_id text,
  p_reservation_id uuid,
  p_user_id uuid,
  p_workspace_id uuid,
  p_workpiece_id text,
  p_request_fingerprint text
) returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare
  v_route text:=btrim(coalesce(p_route_code,''));
  v_binding tongs.openai_text_funding_bindings%rowtype;
  v_reservation tongs.funding_reservations%rowtype;
  v_quote tongs.customer_spending_quotes%rowtype;
  v_cost tongs.openai_text_cost_policy_revisions%rowtype;
  v_rollout tongs.openai_text_rollout_revisions%rowtype;
  v_rate tongs.openai_text_provider_rate_revisions%rowtype;
  v_rate_id uuid;
  v_failure_limit bigint;
begin
  perform tongs._require_pricing_service_role();
  if v_route not in (
      'hearth.research_synthesis','visual.unified_plan',
      'visual.narrative_interpretation','motion.broll_interpretation',
      'hammer.transcript_cleanup','shorts.discovery','quench.metadata'
    ) or length(btrim(coalesce(p_operation_id,'')))<8 or p_reservation_id is null
    or p_user_id is null or length(btrim(coalesce(p_workpiece_id,'')))<1
    or p_request_fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid paid OpenAI text execution handle' using errcode='22023';
  end if;

  select * into v_binding from tongs.openai_text_funding_bindings
    where operation_id=btrim(p_operation_id) and reservation_id=p_reservation_id;
  if not found or v_binding.route_code<>v_route then
    raise exception 'exact funded OpenAI text route binding required' using errcode='P0002';
  end if;
  select * into v_reservation from tongs.funding_reservations where id=p_reservation_id;
  select * into v_quote from tongs.customer_spending_quotes where id=v_reservation.quote_id;
  if not found or v_reservation.user_id<>p_user_id or v_quote.user_id<>p_user_id
    or v_quote.operation_id<>v_binding.operation_id
    or v_quote.tool<>v_route
    or v_quote.workspace_id is distinct from p_workspace_id
    or v_quote.request_fingerprint<>p_request_fingerprint
    or not exists(select 1 from tongs.customer_spending_quote_acceptances a
      where a.quote_id=v_quote.id and a.user_id=p_user_id) then
    raise exception 'accepted reserved OpenAI text funding context does not match request' using errcode='42501';
  end if;

  select * into v_cost from tongs.openai_text_cost_policy_revisions where id=v_binding.cost_policy_revision_id;
  select * into v_rollout from tongs._current_openai_text_rollout(v_route);
  if v_cost.id is null or v_rollout.route_code is null or v_rollout.mode<>'enforce'
    or v_rollout.cost_policy_revision_id is distinct from v_binding.cost_policy_revision_id
    or v_cost.lifecycle_state not in ('pilot_candidate','active')
    or v_cost.cost_coverage<>'complete'
    or v_reservation.reserved_wholesale_spend_micros<>v_cost.full_cost_ceiling_micros then
    raise exception 'OpenAI text route is not activated for the accepted complete cost revision' using errcode='42501';
  end if;

  v_rate_id:=nullif(v_cost.attempt_plan->0->>'rate_revision_id','')::uuid;
  select * into v_rate from tongs.openai_text_provider_rate_revisions where id=v_rate_id;
  if not found or v_rate.provider_model_id<>v_binding.model then
    raise exception 'pricing_not_configured: exact OpenAI model rate missing' using errcode='P0001';
  end if;
  v_failure_limit:=case when v_binding.credential_funding='forge'
    then v_cost.full_cost_ceiling_micros else 0 end;

  return jsonb_build_object(
    'operation_id',v_binding.operation_id,'reservation_id',v_binding.reservation_id,
    'quote_id',v_reservation.quote_id,'route_code',v_binding.route_code,
    'user_id',v_reservation.user_id,'workspace_id',v_quote.workspace_id,
    'workpiece_id',btrim(p_workpiece_id),'request_fingerprint',v_quote.request_fingerprint,
    'funding_source_type',v_reservation.funding_source_type,
    'funding_source_id',v_reservation.funding_source_id,
    'credential_funding',v_binding.credential_funding,'model',v_binding.model,
    'maximum_input_units',v_binding.maximum_input_units,
    'maximum_output_units',v_binding.maximum_output_units,
    'maximum_attempts',v_binding.maximum_attempts,
    'maximum_failure_exposure_micros',v_failure_limit,
    'direct_provider_ceiling_micros',v_cost.direct_provider_ceiling_micros,
    'supporting_cost_ceiling_micros',v_cost.supporting_cost_ceiling_micros,
    'full_cost_ceiling_micros',v_cost.full_cost_ceiling_micros,
    'input_micros_per_million_tokens',v_rate.input_micros_per_million_tokens,
    'cached_input_micros_per_million_tokens',v_rate.cached_input_micros_per_million_tokens,
    'output_micros_per_million_tokens',v_rate.output_micros_per_million_tokens,
    'cost_policy_revision_id',v_cost.id,'rollout_revision',v_rollout.revision,
    'reservation_state',tongs._funding_reservation_state(p_reservation_id)
  );
end $$;

create or replace function tongs.read_openai_text_paid_result(
  p_route_code text,
  p_operation_id text,
  p_reservation_id uuid,
  p_user_id uuid,
  p_request_fingerprint text
) returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare v_result tongs.openai_text_persisted_results%rowtype;
begin
  perform tongs._require_pricing_service_role();
  select * into v_result from tongs.openai_text_persisted_results
    where route_code=btrim(coalesce(p_route_code,''))
      and operation_id=btrim(coalesce(p_operation_id,'')) and reservation_id=p_reservation_id
      and user_id=p_user_id and request_fingerprint=p_request_fingerprint;
  if not found then raise exception 'canonical paid OpenAI text result not found' using errcode='P0002'; end if;
  return jsonb_build_object(
    'result_id',v_result.id,'route_code',v_result.route_code,
    'operation_id',v_result.operation_id,'reservation_id',v_result.reservation_id,
    'provider_request_id',v_result.provider_request_id,'model',v_result.model,
    'input_units',v_result.input_units,'output_units',v_result.output_units,
    'customer_charge_micros',coalesce((select e.customer_charge_micros
      from tongs.funding_reservation_events e where e.reservation_id=v_result.reservation_id
        and e.event_type='settled' order by e.sequence desc limit 1),0),
    'result_hash',v_result.result_hash,'result_json',v_result.result_json,
    'persisted_at',v_result.persisted_at
  );
end $$;

create or replace function tongs.persist_openai_text_paid_result(
  p_result_id uuid,
  p_route_code text,
  p_operation_id text,
  p_reservation_id uuid,
  p_user_id uuid,
  p_workspace_id uuid,
  p_workpiece_id text,
  p_request_fingerprint text,
  p_provider_request_id text,
  p_model text,
  p_input_units bigint,
  p_output_units bigint,
  p_result_hash text,
  p_result_json jsonb
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare
  v_binding tongs.openai_text_funding_bindings%rowtype;
  v_reservation tongs.funding_reservations%rowtype;
  v_quote tongs.customer_spending_quotes%rowtype;
  v_existing tongs.openai_text_persisted_results%rowtype;
  v_route text:=btrim(coalesce(p_route_code,''));
begin
  perform tongs._require_pricing_service_role();
  if p_result_id is null or p_reservation_id is null or p_user_id is null
    or v_route not in ('hearth.research_synthesis','visual.unified_plan',
      'visual.narrative_interpretation','motion.broll_interpretation',
      'hammer.transcript_cleanup','shorts.discovery','quench.metadata')
    or length(btrim(coalesce(p_workpiece_id,'')))<1
    or p_request_fingerprint !~ '^[0-9a-f]{64}$' or p_result_hash !~ '^[0-9a-f]{64}$'
    or p_input_units<0 or p_output_units<0
    or jsonb_typeof(coalesce(p_result_json,'null'::jsonb))<>'object' then
    raise exception 'invalid canonical paid OpenAI text result' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('openai-paid-result:'||p_reservation_id::text,0));
  select * into v_existing from tongs.openai_text_persisted_results where reservation_id=p_reservation_id;
  if found then
    if v_existing.route_code<>v_route or v_existing.operation_id<>btrim(p_operation_id)
      or v_existing.result_hash<>p_result_hash or v_existing.request_fingerprint<>p_request_fingerprint then
      raise exception 'canonical paid OpenAI result replay conflict' using errcode='23505';
    end if;
    return jsonb_build_object('result_id',v_existing.id,'persisted',true,'replay',true,'result_hash',v_existing.result_hash);
  end if;
  select * into v_binding from tongs.openai_text_funding_bindings
    where operation_id=btrim(p_operation_id) and reservation_id=p_reservation_id;
  select * into v_reservation from tongs.funding_reservations where id=p_reservation_id;
  select * into v_quote from tongs.customer_spending_quotes where id=v_reservation.quote_id;
  if v_binding.operation_id is null or v_reservation.id is null or v_quote.id is null
    or v_binding.route_code<>v_route or v_quote.tool<>v_route
    or v_binding.model<>btrim(p_model) or v_reservation.user_id<>p_user_id or v_quote.user_id<>p_user_id
    or v_quote.workspace_id is distinct from p_workspace_id
    or v_quote.request_fingerprint<>p_request_fingerprint
    or tongs._funding_reservation_state(p_reservation_id)<>'provider_attempt_shadowed'
    or p_input_units>v_binding.maximum_input_units or p_output_units>v_binding.maximum_output_units then
    raise exception 'canonical paid OpenAI result is not bound to the authorized attempt' using errcode='42501';
  end if;
  insert into tongs.openai_text_persisted_results(
    id,reservation_id,operation_id,route_code,user_id,workspace_id,workpiece_id,
    request_fingerprint,provider_request_id,model,input_units,output_units,result_hash,result_json
  ) values (
    p_result_id,p_reservation_id,btrim(p_operation_id),v_route,p_user_id,p_workspace_id,
    btrim(p_workpiece_id),p_request_fingerprint,nullif(btrim(coalesce(p_provider_request_id,'')),''),
    btrim(p_model),p_input_units,p_output_units,p_result_hash,p_result_json
  );
  return jsonb_build_object('result_id',p_result_id,'persisted',true,'replay',false,'result_hash',p_result_hash);
end $$;

revoke all on function tongs.resolve_openai_text_paid_execution_context(text,text,uuid,uuid,uuid,text,text) from public,anon,authenticated;
revoke all on function tongs.record_openai_text_provider_capture(uuid,uuid,smallint,text,text,bigint,bigint,jsonb) from public,anon,authenticated;
revoke all on function tongs.read_openai_text_paid_result(text,text,uuid,uuid,text) from public,anon,authenticated;
revoke all on function tongs.persist_openai_text_paid_result(uuid,text,text,uuid,uuid,uuid,text,text,text,text,bigint,bigint,text,jsonb) from public,anon,authenticated;
grant execute on function tongs.resolve_openai_text_paid_execution_context(text,text,uuid,uuid,uuid,text,text) to service_role;
grant execute on function tongs.record_openai_text_provider_capture(uuid,uuid,smallint,text,text,bigint,bigint,jsonb) to service_role;
grant execute on function tongs.read_openai_text_paid_result(text,text,uuid,uuid,text) to service_role;
grant execute on function tongs.persist_openai_text_paid_result(uuid,text,text,uuid,uuid,uuid,text,text,text,text,bigint,bigint,text,jsonb) to service_role;

comment on function tongs.resolve_openai_text_paid_execution_context(text,text,uuid,uuid,uuid,text,text) is
  'Service-role-only resolver for exact accepted pricing, funding, credential, attempt, and failure-loss bounds. No route is activated by this function.';
comment on function tongs.persist_openai_text_paid_result(uuid,text,text,uuid,uuid,uuid,text,text,text,text,bigint,bigint,text,jsonb) is
  'Idempotent canonical result receipt required before success settlement for the seven paid OpenAI text adapters.';

notify pgrst,'reload schema';
commit;
