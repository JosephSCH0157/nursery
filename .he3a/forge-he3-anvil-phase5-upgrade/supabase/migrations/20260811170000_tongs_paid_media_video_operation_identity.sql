begin;

create or replace function tongs.approve_and_reserve_paid_media_operation(
  p_paid_media_operation_id uuid,p_operation_id text,p_operation_fingerprint text,p_quote_id uuid,p_reservation_id uuid,
  p_actor_id uuid,p_creator_approval_json jsonb,p_contract_version text
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_quote tongs.ai_credit_quotes%rowtype; v_existing tongs.paid_media_operations%rowtype; v_reservation jsonb; v_purpose text;
begin
  select * into v_quote from tongs.ai_credit_quotes where id=p_quote_id and user_id=p_actor_id for update;
  if not found then raise exception 'owned paid media quote not found' using errcode='P0002'; end if;
  if v_quote.expires_at is not null and v_quote.expires_at<=now() then raise exception 'paid media quote expired' using errcode='22023'; end if;
  if v_quote.request_fingerprint<>p_operation_fingerprint then raise exception 'paid operation fingerprint mismatch' using errcode='22023'; end if;
  select * into v_existing from tongs.paid_media_operations where user_id=p_actor_id and operation_id=p_operation_id for update;
  if found then
    if v_existing.id<>p_paid_media_operation_id or v_existing.operation_fingerprint<>p_operation_fingerprint or v_existing.quote_id<>p_quote_id then
      raise exception 'paid media operation replay conflict' using errcode='23505'; end if;
    return jsonb_build_object('operation',to_jsonb(v_existing),'replay',true);
  end if;
  v_purpose:=case when v_quote.media_kind='video' then 'paid_video_generation' else 'paid_image_generation' end;
  v_reservation:=tongs.reserve_ai_credits(p_actor_id,p_operation_id,v_quote.tool,v_purpose,v_quote.media_kind,
    v_quote.authorized_customer_ceiling,p_operation_fingerprint,
    jsonb_build_object('quote_id',p_quote_id,'ceiling',v_quote.authorized_customer_ceiling),p_reservation_id);
  insert into tongs.paid_media_operations(id,operation_id,operation_fingerprint,user_id,actor_id,workspace_id,workpiece_id,
    originating_tool,originating_entity_id,media_kind,provider,model_snapshot,quote_id,authorization_policy_revision_id,
    pricing_policy_revision_id,authorized_customer_ceiling,reservation_id,prompt_revision_id,prompt_content_hash,request_parameters,
    creator_approval_json,contract_version,state)
  values(p_paid_media_operation_id,p_operation_id,p_operation_fingerprint,p_actor_id,p_actor_id,v_quote.workspace_id,v_quote.workpiece_id,
    v_quote.tool,v_quote.request_parameters#>>'{metadata,originating_entity_id}',v_quote.media_kind,v_quote.provider,v_quote.model,v_quote.id,
    v_quote.authorization_policy_revision_id,v_quote.pricing_policy_revision_id,v_quote.authorized_customer_ceiling,p_reservation_id,
    v_quote.prompt_revision_id,v_quote.prompt_content_hash,v_quote.request_parameters,p_creator_approval_json,p_contract_version,'approved')
  returning * into v_existing;
  insert into tongs.paid_media_operation_events values(gen_random_uuid(),v_existing.id,p_actor_id,'creator_approved',1,p_creator_approval_json,p_actor_id,now());
  update tongs.paid_media_operations set state='reserved',updated_at=now() where id=v_existing.id returning * into v_existing;
  insert into tongs.paid_media_operation_events values(gen_random_uuid(),v_existing.id,p_actor_id,'credits_reserved',2,
    jsonb_build_object('reservation_id',p_reservation_id,'amount',v_quote.authorized_customer_ceiling),p_actor_id,now());
  return jsonb_build_object('operation',to_jsonb(v_existing),'reservation',v_reservation,'replay',false);
end $$;

create or replace function tongs.begin_paid_media_provider_attempt(
  p_paid_media_operation_id uuid,p_operation_fingerprint text,p_attempt_id uuid,p_request_payload_hash text,p_request_evidence_json jsonb
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_op tongs.paid_media_operations%rowtype; v_attempt tongs.paid_media_provider_attempts%rowtype; v_endpoint text;
begin
  select * into v_op from tongs.paid_media_operations where id=p_paid_media_operation_id for update;
  if not found then raise exception 'paid media operation not found' using errcode='P0002'; end if;
  if v_op.operation_fingerprint<>p_operation_fingerprint then raise exception 'paid operation fingerprint mismatch' using errcode='22023'; end if;
  if v_op.state='settled' then return jsonb_build_object('operation',to_jsonb(v_op),'replay',true); end if;
  select * into v_attempt from tongs.paid_media_provider_attempts where paid_media_operation_id=v_op.id order by ordinal desc limit 1;
  if found then
    if v_attempt.id<>p_attempt_id or v_attempt.request_payload_hash<>p_request_payload_hash then raise exception 'provider attempt replay conflict' using errcode='23505'; end if;
    return jsonb_build_object('operation',to_jsonb(v_op),'attempt',to_jsonb(v_attempt),'replay',true);
  end if;
  if v_op.state<>'reserved' then raise exception 'paid operation is not reserved for provider submission' using errcode='P0001'; end if;
  v_endpoint:=case when v_op.media_kind='video' then '/v1/text_to_video' else '/v1/images/generations' end;
  insert into tongs.paid_media_provider_attempts(id,paid_media_operation_id,user_id,ordinal,provider,model_snapshot,endpoint,
    request_payload_hash,request_evidence_json,state,transmitted,submitted_at)
  values(p_attempt_id,v_op.id,v_op.user_id,1,v_op.provider,v_op.model_snapshot,v_endpoint,
    p_request_payload_hash,p_request_evidence_json,'submitting',false,now()) returning * into v_attempt;
  update tongs.paid_media_operations set state='submitting',active_attempt_id=v_attempt.id,updated_at=now() where id=v_op.id returning * into v_op;
  insert into tongs.paid_media_operation_events values(gen_random_uuid(),v_op.id,v_op.user_id,'provider_submission_started',3,to_jsonb(v_attempt),v_op.actor_id,now());
  return jsonb_build_object('operation',to_jsonb(v_op),'attempt',to_jsonb(v_attempt),'replay',false);
end $$;

update tongs.paid_media_operations op set media_kind=q.media_kind,provider=q.provider,model_snapshot=q.model,updated_at=now()
from tongs.ai_credit_quotes q where op.quote_id=q.id and q.media_kind='video'
  and (op.media_kind,op.provider,op.model_snapshot) is distinct from (q.media_kind,q.provider,q.model);

update tongs.paid_media_provider_attempts a set provider=op.provider,model_snapshot=op.model_snapshot,endpoint='/v1/text_to_video'
from tongs.paid_media_operations op where a.paid_media_operation_id=op.id and op.media_kind='video'
  and a.state='submitting' and not a.transmitted;

commit;
