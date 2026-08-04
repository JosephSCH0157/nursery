begin;

create or replace function tongs.record_broll_runway_task(
  p_operation_id text,p_operation_fingerprint text,p_submission_attempt_id uuid,p_provider_task_id text,p_accepted_response jsonb
) returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $$
declare v_op tongs.broll_operation_receipts%rowtype; v_hash text;
begin
 select * into v_op from tongs.broll_operation_receipts where operation_id=p_operation_id for update;
 if not found then return jsonb_build_object('disposition','operation_not_found'); end if;
 if not tongs.has_workspace_role(v_op.workspace_id,'editor') then raise exception 'workspace editor authority required' using errcode='42501'; end if;
 if v_op.operation_fingerprint<>p_operation_fingerprint or v_op.submission_attempt_id is distinct from p_submission_attempt_id then return jsonb_build_object('disposition','operation_identity_conflict'); end if;
 if v_op.provider_task_id is not null then return jsonb_build_object('disposition',case when v_op.provider_task_id=p_provider_task_id then 'replay' else 'provider_task_conflict' end,'operation',to_jsonb(v_op)); end if;
 if v_op.state not in('submitting','submission_unknown') then return jsonb_build_object('disposition','submission_stage_required','operation',to_jsonb(v_op)); end if;
 v_hash:=encode(extensions.digest(convert_to(p_accepted_response::text,'UTF8'),'sha256'),'hex');
 update tongs.broll_operation_receipts set
  state='provider_submitted',provider_task_id=p_provider_task_id,provider_submission_json=p_accepted_response,
  provider_submission_hash=v_hash,provider_submitted_at=now(),ambiguity_reason=null,
  failed_stage=null,failure_code=null,failure_message=null,updated_at=now()
 where operation_id=p_operation_id returning * into v_op;
 return jsonb_build_object('disposition','provider_submitted','operation',to_jsonb(v_op));
end $$;

notify pgrst,'reload schema';
commit;
