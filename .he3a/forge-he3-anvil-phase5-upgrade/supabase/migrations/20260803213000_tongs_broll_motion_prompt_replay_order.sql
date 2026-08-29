-- Matching motion-prompt operation replay must win before fresh-operation concurrency checks.
begin;

create or replace function tongs.begin_broll_prompt_interpretation(
 p_workspace_id uuid,p_workpiece_id uuid,p_beat_id uuid,
 p_expected_prompt_revision_id uuid,p_expected_prompt_revision bigint,
 p_creator_direction text,p_creative_input_hash text,
 p_interpretation_contract_version text,p_validator_version text,p_synthesis_contract_version text,
 p_interpretation_provider text,p_interpretation_model text,p_interpretation_request jsonb,
 p_operation_id text,p_operation_fingerprint text,p_actor_id uuid
) returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $$
declare v_seq tongs.broll_prompt_sequences%rowtype; v_current jsonb; v_inputs jsonb; v_op tongs.broll_operation_receipts%rowtype;
begin
 if not tongs.has_workspace_role(p_workspace_id,'editor') then raise exception 'workspace editor authority required' using errcode='42501'; end if;
 if auth.uid() is distinct from p_actor_id then raise exception 'operation actor must match authenticated creator' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_operation_id,0));
 select * into v_op from tongs.broll_operation_receipts where operation_id=p_operation_id for update;
 if found then
  if v_op.operation_fingerprint<>p_operation_fingerprint or v_op.workspace_id<>p_workspace_id or v_op.workpiece_id<>p_workpiece_id or v_op.beat_id is distinct from p_beat_id or v_op.operation_type<>'prompt_interpretation' then
   return jsonb_build_object('disposition','operation_identity_conflict');
  end if;
  if v_op.state='failed' then
   update tongs.broll_operation_receipts set state=case when provider_response_json is not null then 'provider_or_upload_completed' else 'pending' end,failed_stage=null,failure_code=null,failure_message=null,updated_at=now() where operation_id=p_operation_id returning * into v_op;
  end if;
  return jsonb_build_object('disposition','replay','operation',to_jsonb(v_op));
 end if;
 insert into tongs.broll_prompt_sequences(workspace_id,workpiece_id,beat_id) values(p_workspace_id,p_workpiece_id,p_beat_id) on conflict do nothing;
 select * into v_seq from tongs.broll_prompt_sequences where workspace_id=p_workspace_id and workpiece_id=p_workpiece_id and beat_id=p_beat_id for update;
 if v_seq.current_prompt_revision<>p_expected_prompt_revision or v_seq.current_prompt_revision_id is distinct from p_expected_prompt_revision_id then
  return jsonb_build_object('disposition','prompt_revision_conflict','current_revision_id',v_seq.current_prompt_revision_id,'current_revision',v_seq.current_prompt_revision);
 end if;
 v_current:=tongs.broll_current_creative_input(p_workspace_id,p_workpiece_id,p_beat_id,p_creator_direction,p_interpretation_contract_version,p_synthesis_contract_version);
 if v_current->>'disposition'<>'current' then return jsonb_build_object('disposition',v_current->>'disposition'); end if;
 if v_current->>'creative_input_hash' is distinct from p_creative_input_hash then return jsonb_build_object('disposition','creative_input_conflict','current_creative_input_hash',v_current->>'creative_input_hash'); end if;
 if coalesce(p_validator_version,'')='' or coalesce(p_interpretation_provider,'')='' or coalesce(p_interpretation_model,'')='' then return jsonb_build_object('disposition','interpretation_contract_incomplete'); end if;
 v_inputs:=jsonb_build_object(
  'expected_prompt_revision_id',p_expected_prompt_revision_id,'expected_prompt_revision',p_expected_prompt_revision,
  'creator_direction',coalesce(p_creator_direction,''),'creative_input_hash',p_creative_input_hash,
  'interpretation_contract_version',p_interpretation_contract_version,'validator_version',p_validator_version,
  'synthesis_contract_version',p_synthesis_contract_version,'interpretation_provider',p_interpretation_provider,
  'interpretation_model',p_interpretation_model,'interpretation_request',coalesce(p_interpretation_request,'{}'::jsonb)
 );
 return tongs.begin_broll_operation(p_workspace_id,p_workpiece_id,p_beat_id,'prompt_interpretation',p_operation_id,p_operation_fingerprint,v_inputs,p_actor_id);
end $$;

revoke all on function tongs.begin_broll_prompt_interpretation(uuid,uuid,uuid,uuid,bigint,text,text,text,text,text,text,text,jsonb,text,text,uuid) from public,anon,authenticated;
grant execute on function tongs.begin_broll_prompt_interpretation(uuid,uuid,uuid,uuid,bigint,text,text,text,text,text,text,text,jsonb,text,text,uuid) to authenticated,service_role;

commit;
