-- Script-relative canonical B-roll motion-prompt authority.
begin;

alter table tongs.broll_prompt_revisions
  add column source_plan_revision_id uuid,
  add column source_plan_revision bigint,
  add column script_approval_id uuid,
  add column script_approval_revision bigint,
  add column script_content_hash text,
  add column source_context_json jsonb,
  add column creator_direction text,
  add column creative_input_hash text,
  add column interpretation_provider text,
  add column interpretation_model text,
  add column interpretation_request_json jsonb,
  add column origin_operation_id text,
  add column origin_operation_fingerprint text,
  add column authority_status text not null default 'legacy_unverified'
    check(authority_status in('verified','legacy_unverified')),
  add constraint broll_prompt_script_hash_shape check(script_content_hash is null or script_content_hash~'^[0-9a-f]{64}$'),
  add constraint broll_prompt_creative_hash_shape check(creative_input_hash is null or creative_input_hash~'^[0-9a-f]{64}$'),
  add constraint broll_prompt_origin_fingerprint_shape check(origin_operation_fingerprint is null or origin_operation_fingerprint~'^[0-9a-f]{64}$'),
  add constraint broll_prompt_source_context_shape check(source_context_json is null or jsonb_typeof(source_context_json)='object'),
  add constraint broll_prompt_interpretation_request_shape check(interpretation_request_json is null or jsonb_typeof(interpretation_request_json)='object'),
  add constraint broll_prompt_verified_evidence check(
    authority_status='legacy_unverified' or (
      source_plan_revision_id is not null and source_plan_revision is not null and
      script_approval_id is not null and script_approval_revision is not null and script_content_hash is not null and
      source_context_json is not null and creator_direction is not null and creative_input_hash is not null and
      interpretation_provider is not null and interpretation_model is not null and interpretation_request_json is not null and
      origin_operation_id is not null and origin_operation_fingerprint is not null
    )
  ),
  add foreign key(source_plan_revision_id,workspace_id,workpiece_id,source_plan_revision)
    references tongs.broll_plan_revisions(id,workspace_id,workpiece_id,revision),
  add foreign key(script_approval_id,workspace_id,workpiece_id,script_approval_revision)
    references tongs.script_approval_revisions(id,workspace_id,workpiece_id,approval_revision);

alter table tongs.broll_prompt_sequences
  add column creator_direction text not null default '',
  add column creator_direction_revision bigint not null default 0 check(creator_direction_revision>=0);

create or replace function tongs.broll_current_creative_input(
  p_workspace_id uuid,
  p_workpiece_id uuid,
  p_beat_id uuid,
  p_creator_direction text,
  p_interpretation_contract_version text,
  p_synthesis_contract_version text
) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,tongs as $$
declare v_seq tongs.broll_plan_sequences%rowtype; v_plan tongs.broll_plan_revisions%rowtype; v_member tongs.broll_plan_beat_membership%rowtype; v_beat tongs.broll_beat_revisions%rowtype; v_payload jsonb; v_hash text;
begin
 if not tongs.has_workspace_role(p_workspace_id,'viewer') then raise exception 'workspace viewer authority required' using errcode='42501'; end if;
 select * into v_seq from tongs.broll_plan_sequences where workspace_id=p_workspace_id and workpiece_id=p_workpiece_id;
 if not found or v_seq.current_plan_revision_id is null then return jsonb_build_object('disposition','plan_missing'); end if;
 select * into v_plan from tongs.broll_plan_revisions where id=v_seq.current_plan_revision_id;
 select * into v_member from tongs.broll_plan_beat_membership where plan_revision_id=v_plan.id and beat_id=p_beat_id;
 if not found then return jsonb_build_object('disposition','beat_not_current'); end if;
 select * into v_beat from tongs.broll_beat_revisions where id=v_member.beat_revision_id;
 v_payload:=jsonb_build_object(
   'workspace_id',p_workspace_id,'workpiece_id',p_workpiece_id,'beat_id',p_beat_id,'ordinal',v_member.ordinal,
   'script_approval_id',v_plan.script_approval_id,'script_approval_revision',v_plan.script_approval_revision,'script_content_hash',v_plan.script_content_hash,
   'source_context',jsonb_build_object('before',v_beat.context_before,'focus',v_beat.context_focus,'after',v_beat.context_after,'anchor_assessment',v_beat.canonical_anchor_assessment),
   'narrative_purpose',v_beat.narrative_purpose,'placement_hint',v_beat.placement_hint,'duration_target_ms',v_beat.duration_target_ms,
   'shot_type',v_beat.shot_type,'motion_intent',v_beat.motion_intent,'pacing',v_beat.mood_pacing,
   'creator_direction',coalesce(p_creator_direction,''),
   'interpretation_contract_version',p_interpretation_contract_version,'synthesis_contract_version',p_synthesis_contract_version
 );
 v_hash:=encode(extensions.digest(convert_to(v_payload::text,'UTF8'),'sha256'),'hex');
 return jsonb_build_object('disposition','current','creative_input_hash',v_hash,'creative_inputs',v_payload,'plan_revision',to_jsonb(v_plan),'membership',to_jsonb(v_member),'beat_revision',to_jsonb(v_beat));
end $$;

create or replace function tongs.read_broll_prompt_status(p_workspace_id uuid,p_workpiece_id uuid,p_beat_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,tongs as $$
declare v_seq tongs.broll_prompt_sequences%rowtype; v_prompt tongs.broll_prompt_revisions%rowtype; v_current jsonb; v_inputs jsonb; v_reasons jsonb:='[]'::jsonb;
begin
 if not tongs.has_workspace_role(p_workspace_id,'viewer') then raise exception 'workspace viewer authority required' using errcode='42501'; end if;
 select * into v_seq from tongs.broll_prompt_sequences where workspace_id=p_workspace_id and workpiece_id=p_workpiece_id and beat_id=p_beat_id;
 if not found or v_seq.current_prompt_revision_id is null then return jsonb_build_object('status','missing','sequence',coalesce(to_jsonb(v_seq),'null'::jsonb)); end if;
 select * into v_prompt from tongs.broll_prompt_revisions where id=v_seq.current_prompt_revision_id;
 if v_prompt.authority_status<>'verified' then return jsonb_build_object('status','legacy_unverified','sequence',to_jsonb(v_seq),'prompt_revision',to_jsonb(v_prompt),'mismatch_reasons',jsonb_build_array('legacy_prompt_evidence_missing')); end if;
 v_current:=tongs.broll_current_creative_input(p_workspace_id,p_workpiece_id,p_beat_id,v_seq.creator_direction,v_prompt.interpretation_contract_version,v_prompt.synthesis_contract_version);
 if v_current->>'disposition'<>'current' then return jsonb_build_object('status','stale','sequence',to_jsonb(v_seq),'prompt_revision',to_jsonb(v_prompt),'mismatch_reasons',jsonb_build_array(v_current->>'disposition')); end if;
 v_inputs:=v_current->'creative_inputs';
 if v_prompt.script_approval_id is distinct from (v_inputs->>'script_approval_id')::uuid or v_prompt.script_approval_revision is distinct from (v_inputs->>'script_approval_revision')::bigint or v_prompt.script_content_hash is distinct from v_inputs->>'script_content_hash' then v_reasons:=v_reasons||'"script_approval_changed"'::jsonb; end if;
 if jsonb_build_object(
   'before',v_prompt.source_context_json->'before',
   'focus',v_prompt.source_context_json->'focus',
   'after',v_prompt.source_context_json->'after',
   'anchor_assessment',v_prompt.source_context_json->'anchor_assessment'
 ) is distinct from v_inputs->'source_context' then v_reasons:=v_reasons||'"source_context_changed"'::jsonb; end if;
 if v_prompt.creator_direction is distinct from v_inputs->>'creator_direction' then v_reasons:=v_reasons||'"creator_direction_changed"'::jsonb; end if;
 if v_prompt.source_context_json->>'narrative_purpose' is distinct from v_inputs->>'narrative_purpose' then v_reasons:=v_reasons||'"beat_purpose_changed"'::jsonb; end if;
 if v_prompt.source_context_json->>'placement_hint' is distinct from v_inputs->>'placement_hint' then v_reasons:=v_reasons||'"placement_changed"'::jsonb; end if;
 if (v_prompt.source_context_json->>'duration_target_ms')::bigint is distinct from (v_inputs->>'duration_target_ms')::bigint then v_reasons:=v_reasons||'"duration_changed"'::jsonb; end if;
 if v_prompt.source_context_json->>'shot_type' is distinct from v_inputs->>'shot_type' then v_reasons:=v_reasons||'"shot_type_changed"'::jsonb; end if;
 if v_prompt.source_context_json->>'motion_intent' is distinct from v_inputs->>'motion_intent' then v_reasons:=v_reasons||'"motion_intent_changed"'::jsonb; end if;
 if v_prompt.source_context_json->>'pacing' is distinct from v_inputs->>'pacing' then v_reasons:=v_reasons||'"pacing_changed"'::jsonb; end if;
 if v_prompt.creative_input_hash is distinct from v_current->>'creative_input_hash' and jsonb_array_length(v_reasons)=0 then v_reasons:=v_reasons||'"creative_input_changed"'::jsonb; end if;
 return jsonb_build_object('status',case when jsonb_array_length(v_reasons)>0 then 'stale' when v_prompt.prompt_source='creator_edited' then 'creator_edited' else 'current' end,'sequence',to_jsonb(v_seq),'prompt_revision',to_jsonb(v_prompt),'mismatch_reasons',v_reasons,'current_creative_input_hash',v_current->>'creative_input_hash');
end $$;

create or replace function tongs.set_broll_prompt_creator_direction(p_workspace_id uuid,p_workpiece_id uuid,p_beat_id uuid,p_expected_direction_revision bigint,p_creator_direction text,p_actor_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $$
declare v_seq tongs.broll_prompt_sequences%rowtype;
begin
 if not tongs.has_workspace_role(p_workspace_id,'editor') then raise exception 'workspace editor authority required' using errcode='42501'; end if;
 insert into tongs.broll_prompt_sequences(workspace_id,workpiece_id,beat_id) values(p_workspace_id,p_workpiece_id,p_beat_id) on conflict do nothing;
 select * into v_seq from tongs.broll_prompt_sequences where workspace_id=p_workspace_id and workpiece_id=p_workpiece_id and beat_id=p_beat_id for update;
 if v_seq.creator_direction_revision<>p_expected_direction_revision then return jsonb_build_object('disposition','creator_direction_conflict','current_creator_direction',v_seq.creator_direction,'current_creator_direction_revision',v_seq.creator_direction_revision); end if;
 update tongs.broll_prompt_sequences set creator_direction=coalesce(p_creator_direction,''),creator_direction_revision=creator_direction_revision+1,updated_at=now() where workspace_id=p_workspace_id and workpiece_id=p_workpiece_id and beat_id=p_beat_id returning * into v_seq;
 return jsonb_build_object('disposition','committed','sequence',to_jsonb(v_seq));
end $$;

create or replace function tongs.begin_broll_prompt_interpretation(
 p_workspace_id uuid,p_workpiece_id uuid,p_beat_id uuid,
 p_expected_prompt_revision_id uuid,p_expected_prompt_revision bigint,
 p_creator_direction text,p_creative_input_hash text,
 p_interpretation_contract_version text,p_validator_version text,p_synthesis_contract_version text,
 p_interpretation_provider text,p_interpretation_model text,p_interpretation_request jsonb,
 p_operation_id text,p_operation_fingerprint text,p_actor_id uuid
) returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $$
declare v_seq tongs.broll_prompt_sequences%rowtype; v_current jsonb; v_inputs jsonb;
begin
 if not tongs.has_workspace_role(p_workspace_id,'editor') then raise exception 'workspace editor authority required' using errcode='42501'; end if;
 if auth.uid() is distinct from p_actor_id then raise exception 'operation actor must match authenticated creator' using errcode='42501'; end if;
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

create or replace function tongs.commit_broll_prompt_interpretation(p_operation_id text,p_operation_fingerprint text,p_source_beat_revision_id uuid,p_motion_brief jsonb,p_final_prompt text,p_interpretation_contract_version text,p_validator_version text,p_synthesis_contract_version text,p_actor_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $$
declare v_op tongs.broll_operation_receipts%rowtype; v_seq tongs.broll_prompt_sequences%rowtype; v_prompt tongs.broll_prompt_revisions%rowtype; v_current jsonb; v_plan jsonb; v_beat jsonb; v_inputs jsonb; v_hash text; v_immutable text; v_result jsonb; v_missing text[]:=array[]::text[]; v_required text; v_direction text; v_provider text; v_model text;
begin
 select * into v_op from tongs.broll_operation_receipts where operation_id=p_operation_id for update;
 if not found then return jsonb_build_object('disposition','operation_not_found'); end if;
 if not tongs.has_workspace_role(v_op.workspace_id,'editor') then raise exception 'workspace editor authority required' using errcode='42501'; end if;
 if v_op.operation_fingerprint<>p_operation_fingerprint then return jsonb_build_object('disposition','operation_identity_conflict'); end if;
 if v_op.state='committed' then return v_op.receipt_json; end if;
 if v_op.operation_type<>'prompt_interpretation' or v_op.state<>'provider_or_upload_completed' then return jsonb_build_object('disposition','provider_response_required'); end if;
 foreach v_required in array array['narrative_purpose','central_message','visible_subjects','action_over_time','camera_behavior','start_frame','end_frame','target_duration','pacing','setting','mood','continuity','must_include','avoid','loopability'] loop
   if not p_motion_brief ? v_required or p_motion_brief->v_required in('null'::jsonb,'""'::jsonb,'[]'::jsonb,'{}'::jsonb) then v_missing:=array_append(v_missing,v_required); end if;
 end loop;
 if cardinality(v_missing)>0 then return jsonb_build_object('disposition','interpretation_incomplete','invalid_fields',to_jsonb(v_missing)); end if;
 v_direction:=coalesce(v_op.normalized_inputs_json->>'creator_direction',''); v_provider:=v_op.normalized_inputs_json->>'interpretation_provider'; v_model:=v_op.normalized_inputs_json->>'interpretation_model';
 if coalesce(v_provider,'')='' or coalesce(v_model,'')='' then return jsonb_build_object('disposition','interpretation_incomplete','invalid_fields',jsonb_build_array('interpretation_provider','interpretation_model')); end if;
 insert into tongs.broll_prompt_sequences(workspace_id,workpiece_id,beat_id) values(v_op.workspace_id,v_op.workpiece_id,v_op.beat_id) on conflict do nothing;
 select * into v_seq from tongs.broll_prompt_sequences where workspace_id=v_op.workspace_id and workpiece_id=v_op.workpiece_id and beat_id=v_op.beat_id for update;
 if v_seq.current_prompt_revision<>coalesce((v_op.normalized_inputs_json->>'expected_prompt_revision')::bigint,0) or v_seq.current_prompt_revision_id is distinct from nullif(v_op.normalized_inputs_json->>'expected_prompt_revision_id','')::uuid then return jsonb_build_object('disposition','prompt_revision_conflict','current_revision_id',v_seq.current_prompt_revision_id,'current_revision',v_seq.current_prompt_revision); end if;
 v_current:=tongs.broll_current_creative_input(v_op.workspace_id,v_op.workpiece_id,v_op.beat_id,v_direction,p_interpretation_contract_version,p_synthesis_contract_version);
 if v_current->>'disposition'<>'current' then return jsonb_build_object('disposition',v_current->>'disposition'); end if;
 v_beat:=v_current->'beat_revision'; v_plan:=v_current->'plan_revision'; v_inputs:=v_current->'creative_inputs';
 if (v_beat->>'id')::uuid is distinct from p_source_beat_revision_id then return jsonb_build_object('disposition','beat_revision_conflict'); end if;
 v_hash:=encode(extensions.digest(convert_to(jsonb_build_object('creative_input_hash',v_current->>'creative_input_hash','motion_brief',p_motion_brief,'final_prompt',p_final_prompt,'contracts',jsonb_build_object('interpretation',p_interpretation_contract_version,'validator',p_validator_version,'synthesis',p_synthesis_contract_version))::text,'UTF8'),'sha256'),'hex');
 v_immutable:=encode(extensions.digest(convert_to(jsonb_build_object('content_hash',v_hash,'revision',v_seq.current_prompt_revision+1,'previous_revision_id',v_seq.current_prompt_revision_id,'operation_id',p_operation_id)::text,'UTF8'),'sha256'),'hex');
 insert into tongs.broll_prompt_revisions(workspace_id,workpiece_id,beat_id,revision,previous_revision_id,previous_revision,source_beat_revision_id,source_beat_revision,source_plan_revision_id,source_plan_revision,script_approval_id,script_approval_revision,script_content_hash,source_context_json,creator_direction,creative_input_hash,motion_brief_json,final_prompt,prompt_source,interpretation_contract_version,validator_version,synthesis_contract_version,interpretation_provider,interpretation_model,interpretation_request_json,provider_response_json,origin_operation_id,origin_operation_fingerprint,authority_status,content_hash,immutable_revision_hash,created_by)
 values(v_op.workspace_id,v_op.workpiece_id,v_op.beat_id,v_seq.current_prompt_revision+1,v_seq.current_prompt_revision_id,nullif(v_seq.current_prompt_revision,0),(v_beat->>'id')::uuid,(v_beat->>'revision')::bigint,(v_plan->>'id')::uuid,(v_plan->>'revision')::bigint,(v_plan->>'script_approval_id')::uuid,(v_plan->>'script_approval_revision')::bigint,v_plan->>'script_content_hash',jsonb_build_object('before',v_inputs#>>'{source_context,before}','focus',v_inputs#>>'{source_context,focus}','after',v_inputs#>>'{source_context,after}','anchor_assessment',v_inputs#>'{source_context,anchor_assessment}','narrative_purpose',v_inputs->>'narrative_purpose','placement_hint',v_inputs->>'placement_hint','duration_target_ms',(v_inputs->>'duration_target_ms')::bigint,'shot_type',v_inputs->>'shot_type','motion_intent',v_inputs->>'motion_intent','pacing',v_inputs->>'pacing'),v_direction,v_current->>'creative_input_hash',p_motion_brief,p_final_prompt,'ai_derived',p_interpretation_contract_version,p_validator_version,p_synthesis_contract_version,v_provider,v_model,coalesce(v_op.normalized_inputs_json->'interpretation_request','{}'::jsonb),v_op.provider_response_json,p_operation_id,p_operation_fingerprint,'verified',v_hash,v_immutable,p_actor_id) returning * into v_prompt;
 update tongs.broll_prompt_sequences set current_prompt_revision_id=v_prompt.id,current_prompt_revision=v_prompt.revision,creator_direction=v_direction,creator_direction_revision=creator_direction_revision+1,updated_at=now() where workspace_id=v_op.workspace_id and workpiece_id=v_op.workpiece_id and beat_id=v_op.beat_id;
 v_result:=jsonb_build_object('disposition','committed','prompt_revision',to_jsonb(v_prompt),'provider_response_hash',v_op.provider_response_hash,'prompt_status',tongs.read_broll_prompt_status(v_op.workspace_id,v_op.workpiece_id,v_op.beat_id));
 update tongs.broll_operation_receipts set state='committed',result_prompt_revision_id=v_prompt.id,receipt_json=v_result,updated_at=now() where operation_id=p_operation_id;
 return v_result;
end $$;

create or replace function tongs.commit_broll_prompt_creator_edit(p_workspace_id uuid,p_workpiece_id uuid,p_beat_id uuid,p_expected_prompt_revision_id uuid,p_expected_prompt_revision bigint,p_final_prompt text,p_operation_id text,p_operation_fingerprint text,p_actor_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $$
declare v_seq tongs.broll_prompt_sequences%rowtype; v_current tongs.broll_prompt_revisions%rowtype; v_prompt tongs.broll_prompt_revisions%rowtype; v_op tongs.broll_operation_receipts%rowtype; v_hash text; v_immutable text; v_result jsonb; v_status jsonb;
begin
 if not tongs.has_workspace_role(p_workspace_id,'editor') then raise exception 'workspace editor authority required' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_operation_id,0));
 select * into v_op from tongs.broll_operation_receipts where operation_id=p_operation_id for update;
 if found then if v_op.operation_fingerprint<>p_operation_fingerprint then return jsonb_build_object('disposition','operation_identity_conflict'); end if; return v_op.receipt_json; end if;
 select * into v_seq from tongs.broll_prompt_sequences where workspace_id=p_workspace_id and workpiece_id=p_workpiece_id and beat_id=p_beat_id for update;
 if not found or v_seq.current_prompt_revision_id is distinct from p_expected_prompt_revision_id or v_seq.current_prompt_revision<>p_expected_prompt_revision then return jsonb_build_object('disposition','prompt_revision_conflict','current_revision_id',v_seq.current_prompt_revision_id,'current_revision',v_seq.current_prompt_revision); end if;
 select * into v_current from tongs.broll_prompt_revisions where id=v_seq.current_prompt_revision_id;
 v_status:=tongs.read_broll_prompt_status(p_workspace_id,p_workpiece_id,p_beat_id);
 if v_status->>'status' not in('current','creator_edited') then return jsonb_build_object('disposition','prompt_authority_invalid','prompt_status',v_status); end if;
 v_hash:=encode(extensions.digest(convert_to(jsonb_build_object('prior_content_hash',v_current.content_hash,'final_prompt',p_final_prompt,'prompt_source','creator_edited')::text,'UTF8'),'sha256'),'hex');
 v_immutable:=encode(extensions.digest(convert_to(jsonb_build_object('content_hash',v_hash,'revision',v_current.revision+1,'previous_revision_id',v_current.id,'operation_id',p_operation_id)::text,'UTF8'),'sha256'),'hex');
 insert into tongs.broll_prompt_revisions(workspace_id,workpiece_id,beat_id,revision,previous_revision_id,previous_revision,source_beat_revision_id,source_beat_revision,source_plan_revision_id,source_plan_revision,script_approval_id,script_approval_revision,script_content_hash,source_context_json,creator_direction,creative_input_hash,motion_brief_json,final_prompt,prompt_source,interpretation_contract_version,validator_version,synthesis_contract_version,interpretation_provider,interpretation_model,interpretation_request_json,provider_response_json,origin_operation_id,origin_operation_fingerprint,authority_status,content_hash,immutable_revision_hash,created_by)
 select workspace_id,workpiece_id,beat_id,revision+1,id,revision,source_beat_revision_id,source_beat_revision,source_plan_revision_id,source_plan_revision,script_approval_id,script_approval_revision,script_content_hash,source_context_json,creator_direction,creative_input_hash,motion_brief_json,p_final_prompt,'creator_edited',interpretation_contract_version,validator_version,synthesis_contract_version,interpretation_provider,interpretation_model,interpretation_request_json,provider_response_json,p_operation_id,p_operation_fingerprint,authority_status,v_hash,v_immutable,p_actor_id from tongs.broll_prompt_revisions where id=v_current.id returning * into v_prompt;
 update tongs.broll_prompt_sequences set current_prompt_revision_id=v_prompt.id,current_prompt_revision=v_prompt.revision,updated_at=now() where workspace_id=p_workspace_id and workpiece_id=p_workpiece_id and beat_id=p_beat_id;
 v_result:=jsonb_build_object('disposition','committed','prompt_revision',to_jsonb(v_prompt),'prompt_status',tongs.read_broll_prompt_status(p_workspace_id,p_workpiece_id,p_beat_id));
 insert into tongs.broll_operation_receipts(operation_id,operation_fingerprint,operation_type,state,workspace_id,workpiece_id,beat_id,normalized_inputs_json,result_prompt_revision_id,receipt_json,created_by) values(p_operation_id,p_operation_fingerprint,'prompt_edit','committed',p_workspace_id,p_workpiece_id,p_beat_id,jsonb_build_object('expected_prompt_revision_id',p_expected_prompt_revision_id,'expected_prompt_revision',p_expected_prompt_revision,'final_prompt',p_final_prompt),v_prompt.id,v_result,p_actor_id);
 return v_result;
end $$;

-- Generated candidates must use the current verified, non-stale canonical prompt.
create or replace function tongs.assert_current_broll_prompt(p_workspace_id uuid,p_workpiece_id uuid,p_beat_id uuid,p_prompt_revision_id uuid,p_prompt_revision bigint,p_prompt_content_hash text)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,tongs as $$
declare v_status jsonb; v_prompt jsonb;
begin
 if not tongs.has_workspace_role(p_workspace_id,'viewer') then raise exception 'workspace viewer authority required' using errcode='42501'; end if;
 v_status:=tongs.read_broll_prompt_status(p_workspace_id,p_workpiece_id,p_beat_id); v_prompt:=v_status->'prompt_revision';
 if v_status->>'status' not in('current','creator_edited') then return jsonb_build_object('disposition','prompt_authority_invalid','prompt_status',v_status); end if;
 if v_prompt->>'id' is distinct from p_prompt_revision_id::text or (v_prompt->>'revision')::bigint is distinct from p_prompt_revision or v_prompt->>'content_hash' is distinct from p_prompt_content_hash then return jsonb_build_object('disposition','prompt_revision_conflict','prompt_status',v_status); end if;
 return jsonb_build_object('disposition','verified','prompt_revision',v_prompt);
end $$;

create or replace function tongs.guard_broll_generated_candidate_prompt() returns trigger
language plpgsql security definer set search_path=pg_catalog,tongs as $$
declare v_status jsonb; v_prompt jsonb;
begin
 if new.source_kind<>'generated' then return new; end if;
 if new.prompt_revision_id is null or new.prompt_revision is null or new.prompt_content_hash is null then raise exception 'generated candidate requires canonical prompt provenance' using errcode='23514'; end if;
 v_status:=tongs.read_broll_prompt_status(new.workspace_id,new.workpiece_id,new.beat_id); v_prompt:=v_status->'prompt_revision';
 if v_status->>'status' not in('current','creator_edited') then raise exception 'generated candidate prompt authority invalid: %',v_status using errcode='23514'; end if;
 if v_prompt->>'id' is distinct from new.prompt_revision_id::text or (v_prompt->>'revision')::bigint is distinct from new.prompt_revision or v_prompt->>'content_hash' is distinct from new.prompt_content_hash then raise exception 'generated candidate prompt revision mismatch' using errcode='23514'; end if;
 return new;
end $$;
create trigger broll_generated_candidate_prompt_guard before insert on tongs.broll_candidate_revisions for each row execute function tongs.guard_broll_generated_candidate_prompt();

revoke all on function tongs.broll_current_creative_input(uuid,uuid,uuid,text,text,text),tongs.read_broll_prompt_status(uuid,uuid,uuid),tongs.set_broll_prompt_creator_direction(uuid,uuid,uuid,bigint,text,uuid),tongs.begin_broll_prompt_interpretation(uuid,uuid,uuid,uuid,bigint,text,text,text,text,text,text,text,jsonb,text,text,uuid),tongs.assert_current_broll_prompt(uuid,uuid,uuid,uuid,bigint,text) from public,anon,authenticated;
grant execute on function tongs.broll_current_creative_input(uuid,uuid,uuid,text,text,text),tongs.read_broll_prompt_status(uuid,uuid,uuid),tongs.assert_current_broll_prompt(uuid,uuid,uuid,uuid,bigint,text) to authenticated,service_role;
grant execute on function tongs.set_broll_prompt_creator_direction(uuid,uuid,uuid,bigint,text,uuid) to authenticated,service_role;
grant execute on function tongs.begin_broll_prompt_interpretation(uuid,uuid,uuid,uuid,bigint,text,text,text,text,text,text,text,jsonb,text,text,uuid) to authenticated,service_role;

commit;
