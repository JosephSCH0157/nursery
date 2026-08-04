begin;

create or replace function tongs.record_broll_runway_rejection(
  p_operation_id text,
  p_operation_fingerprint text,
  p_submission_attempt_id uuid,
  p_rejection_evidence jsonb
) returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $$
declare v_op tongs.broll_operation_receipts%rowtype; v_entry jsonb;
begin
  select * into v_op from tongs.broll_operation_receipts where operation_id=p_operation_id for update;
  if not found then return jsonb_build_object('disposition','operation_not_found'); end if;
  if v_op.operation_fingerprint<>p_operation_fingerprint or v_op.submission_attempt_id<>p_submission_attempt_id then
    return jsonb_build_object('disposition','operation_identity_conflict','operation',to_jsonb(v_op));
  end if;
  if v_op.state='pending' and coalesce(v_op.transport_evidence_json#>>'{latest,submission_attempt_id}','')=p_submission_attempt_id::text then
    return jsonb_build_object('disposition','replay','operation',to_jsonb(v_op));
  end if;
  if v_op.state<>'submitting' then return jsonb_build_object('disposition','submission_stage_required','operation',to_jsonb(v_op)); end if;
  if p_rejection_evidence is null or (p_rejection_evidence->>'http_status')::integer not between 400 and 499 then
    return jsonb_build_object('disposition','definitive_rejection_evidence_required');
  end if;
  v_entry:=p_rejection_evidence||jsonb_build_object(
    'submission_attempt_id',p_submission_attempt_id,
    'submitting_at',v_op.submitting_at,
    'classification','confirmed_not_created',
    'recorded_at',now()
  );
  update tongs.broll_operation_receipts set
    state='pending',
    failure_code='runway_rejected_before_task',
    failure_message=coalesce(p_rejection_evidence->>'provider_message','Runway rejected the request before creating a task.'),
    transport_evidence_json=jsonb_build_object(
      'latest',v_entry,
      'attempts',coalesce(transport_evidence_json->'attempts','[]'::jsonb)||jsonb_build_array(v_entry)
    ),
    submission_attempt_id=null,
    submitting_at=null,
    submission_unknown_at=null,
    ambiguity_reason=null,
    updated_at=now()
  where operation_id=p_operation_id returning * into v_op;
  return jsonb_build_object('disposition','rejection_recorded','operation',to_jsonb(v_op));
end $$;

create or replace function tongs.reconcile_broll_runway_submission(
 p_operation_id text,p_operation_fingerprint text,p_decision text,p_provider_task_id text,p_task_evidence jsonb,p_actor_id uuid
) returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $$
declare v_op tongs.broll_operation_receipts%rowtype; v_hash text; v_entry jsonb;
begin
 select * into v_op from tongs.broll_operation_receipts where operation_id=p_operation_id for update;
 if not found then return jsonb_build_object('disposition','operation_not_found'); end if;
 if not tongs.has_workspace_role(v_op.workspace_id,'admin') then raise exception 'workspace admin authority required' using errcode='42501'; end if;
 if v_op.operation_fingerprint<>p_operation_fingerprint or v_op.state<>'submission_unknown' then return jsonb_build_object('disposition','reconciliation_conflict','operation',to_jsonb(v_op)); end if;
 if p_decision='attach_task' then
  if p_provider_task_id is null or p_task_evidence is null then return jsonb_build_object('disposition','task_evidence_required'); end if;
  if coalesce(p_task_evidence->>'model','')<>coalesce(v_op.normalized_inputs_json#>>'{runway,model}','') then return jsonb_build_object('disposition','task_model_mismatch'); end if;
  v_hash:=encode(extensions.digest(convert_to(p_task_evidence::text,'UTF8'),'sha256'),'hex');
  update tongs.broll_operation_receipts set state='provider_submitted',provider_task_id=p_provider_task_id,provider_submission_json=p_task_evidence,provider_submission_hash=v_hash,provider_submitted_at=now(),reconciliation_decision=p_decision,reconciled_by=p_actor_id,reconciled_at=now(),updated_at=now() where operation_id=p_operation_id returning * into v_op;
 elsif p_decision='confirmed_not_created' then
  if p_task_evidence is null or (p_task_evidence->>'http_status')::integer not between 400 and 499 then return jsonb_build_object('disposition','definitive_rejection_evidence_required'); end if;
  v_entry:=p_task_evidence||jsonb_build_object('submission_attempt_id',v_op.submission_attempt_id,'submitting_at',v_op.submitting_at,'submission_unknown_at',v_op.submission_unknown_at,'prior_ambiguity_reason',v_op.ambiguity_reason,'prior_transport_evidence',v_op.transport_evidence_json,'decision',p_decision,'actor_id',p_actor_id,'reconciled_at',now());
  update tongs.broll_operation_receipts set state='pending',reconciliation_decision=p_decision,reconciled_by=p_actor_id,reconciled_at=now(),transport_evidence_json=jsonb_build_object('latest',v_entry,'attempts',coalesce(transport_evidence_json->'attempts','[]'::jsonb)||jsonb_build_array(v_entry)),submission_attempt_id=null,submitting_at=null,submission_unknown_at=null,ambiguity_reason=null,updated_at=now() where operation_id=p_operation_id returning * into v_op;
 elsif p_decision='authorize_resubmission' then
  v_entry:=jsonb_build_object('submission_attempt_id',v_op.submission_attempt_id,'submitting_at',v_op.submitting_at,'submission_unknown_at',v_op.submission_unknown_at,'prior_ambiguity_reason',v_op.ambiguity_reason,'prior_transport_evidence',v_op.transport_evidence_json,'decision',p_decision,'actor_id',p_actor_id,'reconciled_at',now());
  update tongs.broll_operation_receipts set state='pending',reconciliation_decision=p_decision,reconciled_by=p_actor_id,reconciled_at=now(),resubmission_authorized_at=now(),resubmission_authorized_by=p_actor_id,transport_evidence_json=jsonb_build_object('latest',v_entry,'attempts',coalesce(transport_evidence_json->'attempts','[]'::jsonb)||jsonb_build_array(v_entry)),submission_attempt_id=null,submitting_at=null,submission_unknown_at=null,ambiguity_reason=null,updated_at=now() where operation_id=p_operation_id returning * into v_op;
 else return jsonb_build_object('disposition','invalid_reconciliation_decision'); end if;
 return jsonb_build_object('disposition','reconciled','operation',to_jsonb(v_op));
end $$;

revoke all on function tongs.record_broll_runway_rejection(text,text,uuid,jsonb) from public,anon;
grant execute on function tongs.record_broll_runway_rejection(text,text,uuid,jsonb) to authenticated,service_role;

notify pgrst,'reload schema';
commit;
