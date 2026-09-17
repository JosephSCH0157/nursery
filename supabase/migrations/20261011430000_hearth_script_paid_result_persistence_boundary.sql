-- Keep the generic paid-result authority aligned with the routed text contract.
-- Script generation persists an immutable domain proposal first, then this
-- replay/billing result. Omitting the route here stranded the reservation after
-- a valid provider response and domain persistence.

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
) returns jsonb
language plpgsql
security definer
set search_path=pg_catalog
as $$
declare
  v_binding tongs.openai_text_funding_bindings%rowtype;
  v_reservation tongs.funding_reservations%rowtype;
  v_quote tongs.customer_spending_quotes%rowtype;
  v_existing tongs.openai_text_persisted_results%rowtype;
  v_route text:=btrim(coalesce(p_route_code,''));
begin
  perform tongs._require_pricing_service_role();
  if p_result_id is null or p_reservation_id is null or p_user_id is null
    or v_route not in (
      'hearth.research_synthesis',
      'hearth.script_generation',
      'visual.unified_plan',
      'visual.narrative_interpretation',
      'motion.broll_interpretation',
      'hammer.transcript_cleanup',
      'shorts.discovery',
      'quench.metadata'
    )
    or length(btrim(coalesce(p_workpiece_id,'')))<1
    or p_request_fingerprint !~ '^[0-9a-f]{64}$'
    or p_result_hash !~ '^[0-9a-f]{64}$'
    or p_input_units<0 or p_output_units<0
    or jsonb_typeof(coalesce(p_result_json,'null'::jsonb))<>'object' then
    raise exception 'invalid canonical paid OpenAI text result' using errcode='22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('openai-paid-result:'||p_reservation_id::text,0));
  select * into v_existing
  from tongs.openai_text_persisted_results
  where reservation_id=p_reservation_id;
  if found then
    if v_existing.route_code<>v_route
      or v_existing.operation_id<>btrim(p_operation_id)
      or v_existing.result_hash<>p_result_hash
      or v_existing.request_fingerprint<>p_request_fingerprint then
      raise exception 'canonical paid OpenAI result replay conflict' using errcode='23505';
    end if;
    return jsonb_build_object(
      'result_id',v_existing.id,
      'persisted',true,
      'replay',true,
      'result_hash',v_existing.result_hash
    );
  end if;

  select * into v_binding
  from tongs.openai_text_funding_bindings
  where operation_id=btrim(p_operation_id) and reservation_id=p_reservation_id;
  select * into v_reservation
  from tongs.funding_reservations
  where id=p_reservation_id;
  select * into v_quote
  from tongs.customer_spending_quotes
  where id=v_reservation.quote_id;
  if v_binding.operation_id is null or v_reservation.id is null or v_quote.id is null
    or v_binding.route_code<>v_route or v_quote.tool<>v_route
    or v_binding.model<>btrim(p_model)
    or v_reservation.user_id<>p_user_id or v_quote.user_id<>p_user_id
    or v_quote.workspace_id is distinct from p_workspace_id
    or v_quote.request_fingerprint<>p_request_fingerprint
    or tongs._funding_reservation_state(p_reservation_id)<>'provider_attempt_shadowed'
    or p_input_units>v_binding.maximum_input_units
    or p_output_units>v_binding.maximum_output_units then
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
  return jsonb_build_object(
    'result_id',p_result_id,
    'persisted',true,
    'replay',false,
    'result_hash',p_result_hash
  );
end
$$;

revoke all on function tongs.persist_openai_text_paid_result(
  uuid,text,text,uuid,uuid,uuid,text,text,text,text,bigint,bigint,text,jsonb
) from public,anon,authenticated;
grant execute on function tongs.persist_openai_text_paid_result(
  uuid,text,text,uuid,uuid,uuid,text,text,text,text,bigint,bigint,text,jsonb
) to service_role;

comment on function tongs.persist_openai_text_paid_result(
  uuid,text,text,uuid,uuid,uuid,text,text,text,text,bigint,bigint,text,jsonb
) is 'Persists the immutable generic replay result after an authorized paid OpenAI route has validated and persisted its canonical domain result, including Hearth script proposals.';
