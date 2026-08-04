begin;

alter table tongs.broll_operation_receipts drop constraint if exists broll_operation_receipts_state_check;
alter table tongs.broll_operation_receipts add constraint broll_operation_receipts_state_check check(state in(
  'pending','reserved','submitting','submission_unknown','provider_submitted','provider_completed',
  'provider_or_upload_completed','asset_verified','video_asset_verified','poster_asset_verified',
  'committed','candidate_committed','selected','failed'
));

alter table tongs.broll_operation_receipts
  drop constraint if exists broll_provider_submission_pair,
  drop constraint if exists broll_provider_submission_hash_shape,
  drop constraint if exists broll_provider_completion_pair,
  drop constraint if exists broll_provider_completion_hash_shape,
  drop constraint if exists broll_provider_task_shape,
  drop constraint if exists broll_submission_attempt_shape;

alter table tongs.broll_operation_receipts
  add column if not exists submission_attempt_id uuid,
  add column if not exists submitting_at timestamptz,
  add column if not exists provider_task_id text,
  add column if not exists provider_submission_json jsonb,
  add column if not exists provider_submission_hash text,
  add column if not exists provider_submitted_at timestamptz,
  add column if not exists provider_completed_at timestamptz,
  add column if not exists provider_completed_json jsonb,
  add column if not exists provider_completed_hash text,
  add column if not exists provider_poll_attempt integer not null default 0,
  add column if not exists provider_last_polled_at timestamptz,
  add column if not exists provider_next_poll_at timestamptz,
  add column if not exists provider_last_poll_json jsonb,
  add column if not exists submission_unknown_at timestamptz,
  add column if not exists ambiguity_reason text,
  add column if not exists transport_evidence_json jsonb,
  add column if not exists reconciliation_decision text,
  add column if not exists reconciled_by uuid references auth.users(id),
  add column if not exists reconciled_at timestamptz,
  add column if not exists resubmission_authorized_at timestamptz,
  add column if not exists resubmission_authorized_by uuid references auth.users(id),
  add constraint broll_provider_submission_pair check((provider_submission_json is null)=(provider_submission_hash is null)),
  add constraint broll_provider_submission_hash_shape check(provider_submission_hash is null or provider_submission_hash~'^[0-9a-f]{64}$'),
  add constraint broll_provider_completion_pair check((provider_completed_json is null)=(provider_completed_hash is null)),
  add constraint broll_provider_completion_hash_shape check(provider_completed_hash is null or provider_completed_hash~'^[0-9a-f]{64}$'),
  add constraint broll_provider_task_shape check(provider_task_id is null or length(provider_task_id) between 8 and 200),
  add constraint broll_submission_attempt_shape check(
    (state not in('submitting','submission_unknown','provider_submitted','provider_completed') or (submission_attempt_id is not null and submitting_at is not null))
    and (state not in('provider_submitted','provider_completed') or (provider_task_id is not null and provider_submission_json is not null and provider_submitted_at is not null))
  );

create or replace function tongs.begin_broll_runway_submission(
  p_operation_id text,p_operation_fingerprint text,p_submission_attempt_id uuid,
  p_prompt_revision_id uuid,p_prompt_revision bigint,p_prompt_content_hash text,
  p_model text,p_duration_seconds integer,p_ratio text,p_actor_id uuid
) returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $$
declare v_op tongs.broll_operation_receipts%rowtype; v_prompt jsonb;
begin
 select * into v_op from tongs.broll_operation_receipts where operation_id=p_operation_id for update;
 if not found then return jsonb_build_object('disposition','operation_not_found'); end if;
 if not tongs.has_workspace_role(v_op.workspace_id,'editor') then raise exception 'workspace editor authority required' using errcode='42501'; end if;
 if v_op.operation_fingerprint<>p_operation_fingerprint or v_op.operation_type<>'candidate_acquire' then return jsonb_build_object('disposition','operation_identity_conflict'); end if;
 if v_op.provider_task_id is not null then return jsonb_build_object('disposition','replay','operation',to_jsonb(v_op)); end if;
 if v_op.state='submission_unknown' then return jsonb_build_object('disposition','submission_unknown','operation',to_jsonb(v_op)); end if;
 if v_op.state='submitting' then
  update tongs.broll_operation_receipts set state='submission_unknown',submission_unknown_at=coalesce(submission_unknown_at,now()),ambiguity_reason=coalesce(ambiguity_reason,'recovered_inflight_submission_without_task_id'),updated_at=now() where operation_id=p_operation_id returning * into v_op;
  return jsonb_build_object('disposition','submission_unknown','operation',to_jsonb(v_op));
 end if;
 if v_op.state<>'pending' then return jsonb_build_object('disposition','operation_stage_conflict','operation',to_jsonb(v_op)); end if;
 v_prompt:=tongs.assert_current_broll_prompt(v_op.workspace_id,v_op.workpiece_id,v_op.beat_id,p_prompt_revision_id,p_prompt_revision,p_prompt_content_hash);
 if v_prompt->>'disposition'<>'verified' then return v_prompt; end if;
 update tongs.broll_operation_receipts set state='submitting',submission_attempt_id=p_submission_attempt_id,submitting_at=now(),
  normalized_inputs_json=normalized_inputs_json||jsonb_build_object('runway',jsonb_build_object('model',p_model,'duration_seconds',p_duration_seconds,'ratio',p_ratio,'submission_attempt_id',p_submission_attempt_id,'prompt_revision_id',p_prompt_revision_id,'prompt_revision',p_prompt_revision,'prompt_content_hash',p_prompt_content_hash)),updated_at=now()
 where operation_id=p_operation_id returning * into v_op;
 return jsonb_build_object('disposition','submitting','operation',to_jsonb(v_op));
end $$;

create or replace function tongs.claim_broll_runway_poll(p_operation_id text,p_operation_fingerprint text,p_provider_task_id text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $$
declare v_op tongs.broll_operation_receipts%rowtype; v_delay numeric;
begin
 select * into v_op from tongs.broll_operation_receipts where operation_id=p_operation_id for update;
 if not found then return jsonb_build_object('disposition','operation_not_found'); end if;
 if not tongs.has_workspace_role(v_op.workspace_id,'editor') then raise exception 'workspace editor authority required' using errcode='42501'; end if;
 if v_op.operation_fingerprint<>p_operation_fingerprint or v_op.provider_task_id is distinct from p_provider_task_id then return jsonb_build_object('disposition','provider_task_conflict'); end if;
 if v_op.state<>'provider_submitted' then return jsonb_build_object('disposition','replay','operation',to_jsonb(v_op)); end if;
 if v_op.provider_next_poll_at is not null and v_op.provider_next_poll_at>now() then return jsonb_build_object('disposition','poll_not_due','retry_at',v_op.provider_next_poll_at,'operation',to_jsonb(v_op)); end if;
 v_delay:=least(60,5*power(2,least(v_op.provider_poll_attempt,4)))+(random()*1.5);
 update tongs.broll_operation_receipts set provider_poll_attempt=provider_poll_attempt+1,provider_last_polled_at=now(),provider_next_poll_at=now()+make_interval(secs=>v_delay),updated_at=now() where operation_id=p_operation_id returning * into v_op;
 return jsonb_build_object('disposition','poll_claimed','operation',to_jsonb(v_op));
end $$;

create or replace function tongs.record_broll_runway_pending(p_operation_id text,p_operation_fingerprint text,p_provider_task_id text,p_poll_response jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $$
declare v_op tongs.broll_operation_receipts%rowtype;
begin
 select * into v_op from tongs.broll_operation_receipts where operation_id=p_operation_id for update;
 if not found then return jsonb_build_object('disposition','operation_not_found'); end if;
 if not tongs.has_workspace_role(v_op.workspace_id,'editor') then raise exception 'workspace editor authority required' using errcode='42501'; end if;
 if v_op.operation_fingerprint<>p_operation_fingerprint or v_op.provider_task_id is distinct from p_provider_task_id then return jsonb_build_object('disposition','provider_task_conflict'); end if;
 if v_op.state<>'provider_submitted' then return jsonb_build_object('disposition','replay','operation',to_jsonb(v_op)); end if;
 update tongs.broll_operation_receipts set provider_last_poll_json=p_poll_response,updated_at=now() where operation_id=p_operation_id returning * into v_op;
 return jsonb_build_object('disposition','provider_pending','operation',to_jsonb(v_op));
end $$;

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
 update tongs.broll_operation_receipts set state='provider_submitted',provider_task_id=p_provider_task_id,provider_submission_json=p_accepted_response,provider_submission_hash=v_hash,provider_submitted_at=now(),ambiguity_reason=null,updated_at=now() where operation_id=p_operation_id returning * into v_op;
 return jsonb_build_object('disposition','provider_submitted','operation',to_jsonb(v_op));
end $$;

create or replace function tongs.mark_broll_submission_unknown(
  p_operation_id text,p_operation_fingerprint text,p_submission_attempt_id uuid,p_reason text,p_transport_evidence jsonb
) returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $$
declare v_op tongs.broll_operation_receipts%rowtype;
begin
 select * into v_op from tongs.broll_operation_receipts where operation_id=p_operation_id for update;
 if not found then return jsonb_build_object('disposition','operation_not_found'); end if;
 if not tongs.has_workspace_role(v_op.workspace_id,'editor') then raise exception 'workspace editor authority required' using errcode='42501'; end if;
 if v_op.operation_fingerprint<>p_operation_fingerprint or v_op.submission_attempt_id is distinct from p_submission_attempt_id then return jsonb_build_object('disposition','operation_identity_conflict'); end if;
 if v_op.provider_task_id is not null then return jsonb_build_object('disposition','replay','operation',to_jsonb(v_op)); end if;
 if v_op.state='submission_unknown' then return jsonb_build_object('disposition','replay','operation',to_jsonb(v_op)); end if;
 if v_op.state<>'submitting' then return jsonb_build_object('disposition','submitting_stage_required','operation',to_jsonb(v_op)); end if;
 update tongs.broll_operation_receipts set state='submission_unknown',submission_unknown_at=now(),ambiguity_reason=p_reason,transport_evidence_json=coalesce(p_transport_evidence,'{}'::jsonb),updated_at=now() where operation_id=p_operation_id returning * into v_op;
 return jsonb_build_object('disposition','submission_unknown','operation',to_jsonb(v_op));
end $$;

create or replace function tongs.record_broll_runway_completion(
 p_operation_id text,p_operation_fingerprint text,p_provider_task_id text,p_completed_response jsonb
) returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $$
declare v_op tongs.broll_operation_receipts%rowtype; v_hash text;
begin
 select * into v_op from tongs.broll_operation_receipts where operation_id=p_operation_id for update;
 if not found then return jsonb_build_object('disposition','operation_not_found'); end if;
 if not tongs.has_workspace_role(v_op.workspace_id,'editor') then raise exception 'workspace editor authority required' using errcode='42501'; end if;
 if v_op.operation_fingerprint<>p_operation_fingerprint or v_op.provider_task_id is distinct from p_provider_task_id then return jsonb_build_object('disposition','provider_task_conflict'); end if;
 if v_op.state in('provider_completed','provider_or_upload_completed','video_asset_verified','poster_asset_verified','candidate_committed') then return jsonb_build_object('disposition','replay','operation',to_jsonb(v_op)); end if;
 if v_op.state<>'provider_submitted' then return jsonb_build_object('disposition','provider_submitted_stage_required','operation',to_jsonb(v_op)); end if;
 v_hash:=encode(extensions.digest(convert_to(p_completed_response::text,'UTF8'),'sha256'),'hex');
 update tongs.broll_operation_receipts set state='provider_completed',provider_completed_json=p_completed_response,provider_completed_hash=v_hash,provider_completed_at=now(),updated_at=now() where operation_id=p_operation_id returning * into v_op;
 return jsonb_build_object('disposition','provider_completed','operation',to_jsonb(v_op));
end $$;

create or replace function tongs.record_broll_provider_or_upload_result(p_operation_id text,p_operation_fingerprint text,p_result jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $$
declare v_op tongs.broll_operation_receipts%rowtype; v_hash text;
begin
 select * into v_op from tongs.broll_operation_receipts where operation_id=p_operation_id for update;
 if not found then return jsonb_build_object('disposition','operation_not_found'); end if;
 if not tongs.has_workspace_role(v_op.workspace_id,'editor') then raise exception 'workspace editor authority required' using errcode='42501'; end if;
 if v_op.operation_fingerprint<>p_operation_fingerprint then return jsonb_build_object('disposition','operation_identity_conflict'); end if;
 if v_op.state='provider_or_upload_completed' then return jsonb_build_object('disposition','replay','operation',to_jsonb(v_op)); end if;
 if v_op.state not in('pending','provider_completed') then return jsonb_build_object('disposition','provider_result_stage_required','operation',to_jsonb(v_op)); end if;
 v_hash:=encode(extensions.digest(convert_to(p_result::text,'UTF8'),'sha256'),'hex');
 update tongs.broll_operation_receipts set state='provider_or_upload_completed',provider_response_json=p_result,provider_response_hash=v_hash,updated_at=now() where operation_id=p_operation_id returning * into v_op;
 return jsonb_build_object('disposition','result_recorded','operation',to_jsonb(v_op));
end $$;

create or replace function tongs.reconcile_broll_runway_submission(
 p_operation_id text,p_operation_fingerprint text,p_decision text,p_provider_task_id text,p_task_evidence jsonb,p_actor_id uuid
) returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $$
declare v_op tongs.broll_operation_receipts%rowtype; v_hash text;
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
  update tongs.broll_operation_receipts set state='pending',reconciliation_decision=p_decision,reconciled_by=p_actor_id,reconciled_at=now(),submission_attempt_id=null,submitting_at=null,submission_unknown_at=null,ambiguity_reason=null,transport_evidence_json=null,updated_at=now() where operation_id=p_operation_id returning * into v_op;
 elsif p_decision='authorize_resubmission' then
  update tongs.broll_operation_receipts set state='pending',reconciliation_decision=p_decision,reconciled_by=p_actor_id,reconciled_at=now(),resubmission_authorized_at=now(),resubmission_authorized_by=p_actor_id,submission_attempt_id=null,submitting_at=null,submission_unknown_at=null,ambiguity_reason=null,transport_evidence_json=null,updated_at=now() where operation_id=p_operation_id returning * into v_op;
 else return jsonb_build_object('disposition','invalid_reconciliation_decision'); end if;
 return jsonb_build_object('disposition','reconciled','operation',to_jsonb(v_op));
end $$;

create or replace function tongs.read_broll_runway_operation_status(
 p_workspace_id uuid,p_workpiece_id uuid,p_operation_id text
) returns jsonb language plpgsql stable security definer set search_path=pg_catalog,tongs as $$
declare v_op tongs.broll_operation_receipts%rowtype; v_public_status text;
begin
 if not tongs.has_workspace_role(p_workspace_id,'viewer') then raise exception 'workspace viewer authority required' using errcode='42501'; end if;
 select * into v_op from tongs.broll_operation_receipts
 where workspace_id=p_workspace_id and workpiece_id=p_workpiece_id and operation_id=p_operation_id;
 if not found then return jsonb_build_object('disposition','operation_not_found'); end if;
 v_public_status:=case
  when v_op.state='submission_unknown' then 'submission_unknown'
  when v_op.state in('provider_completed','provider_or_upload_completed','video_asset_verified','poster_asset_verified','candidate_committed','selected') then 'completed'
  when v_op.state='failed' then 'failed'
  else 'pending'
 end;
 return jsonb_build_object(
  'disposition','current','operation_id',v_op.operation_id,'state',v_op.state,'status',v_public_status,
  'provider_task_id',v_op.provider_task_id,'submission_attempt_id',v_op.submission_attempt_id,
  'retry_at',v_op.provider_next_poll_at,'failure_code',v_op.failure_code,'failure_message',v_op.failure_message,
  'ambiguity_reason',v_op.ambiguity_reason,'reconciliation_decision',v_op.reconciliation_decision,
  'candidate_revision_id',v_op.result_candidate_revision_id,'receipt_json',v_op.receipt_json
 );
end $$;

revoke all on function tongs.begin_broll_runway_submission(text,text,uuid,uuid,bigint,text,text,integer,text,uuid),tongs.record_broll_runway_task(text,text,uuid,text,jsonb),tongs.mark_broll_submission_unknown(text,text,uuid,text,jsonb),tongs.claim_broll_runway_poll(text,text,text),tongs.record_broll_runway_pending(text,text,text,jsonb),tongs.record_broll_runway_completion(text,text,text,jsonb),tongs.reconcile_broll_runway_submission(text,text,text,text,jsonb,uuid),tongs.read_broll_runway_operation_status(uuid,uuid,text) from public,anon;
grant execute on function tongs.begin_broll_runway_submission(text,text,uuid,uuid,bigint,text,text,integer,text,uuid),tongs.record_broll_runway_task(text,text,uuid,text,jsonb),tongs.mark_broll_submission_unknown(text,text,uuid,text,jsonb),tongs.claim_broll_runway_poll(text,text,text),tongs.record_broll_runway_pending(text,text,text,jsonb),tongs.record_broll_runway_completion(text,text,text,jsonb) to authenticated,service_role;
grant execute on function tongs.reconcile_broll_runway_submission(text,text,text,text,jsonb,uuid) to authenticated,service_role;
grant execute on function tongs.read_broll_runway_operation_status(uuid,uuid,text) to authenticated,service_role;

commit;
