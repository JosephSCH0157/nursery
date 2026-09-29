begin;
set local request.jwt.claims='{"role":"service_role"}';

do $$
declare
  v_thumbnail tongs.hearth_thumbnail_direction_generation_results%rowtype;
  v_thumbnail_operation uuid:='4d000000-0000-4000-8000-000000000001';
  v_thumbnail_attempt uuid:='4d000000-0000-4000-8000-000000000002';
  v_thumbnail_result jsonb;
  v_thumbnail_result_id uuid;
  v_unified_operation uuid:='4d000000-0000-4000-8000-000000000011';
  v_unified_attempt uuid:='4d000000-0000-4000-8000-000000000012';
  v_unified_workspace uuid;
  v_unified_workpiece uuid;
  v_unified_user uuid;
  v_approval_id uuid;
  v_image tongs.workpiece_image_map_sequences%rowtype;
  v_broll tongs.broll_plan_sequences%rowtype;
  v_reference tongs.reference_clip_plan_sequences%rowtype;
  v_reference_visual tongs.reference_visual_plan_sequences%rowtype;
  v_result jsonb;
  v_motion_operation uuid:='4d000000-0000-4000-8000-000000000021';
  v_motion_attempt uuid:='4d000000-0000-4000-8000-000000000022';
  v_motion_workspace uuid;
  v_motion_workpiece uuid;
  v_motion_beat uuid;
  v_motion_user uuid;
  v_prompt_sequence tongs.broll_prompt_sequences%rowtype;
  v_current jsonb;
  v_motion_result jsonb;
  v_prompt_id uuid;
  v_candidate record;
begin
  -- Thumbnail owner stage/finalize/recovery.
  select * into v_thumbnail from tongs.hearth_thumbnail_direction_generation_results
    where reservation_id is not null order by created_at limit 1;
  if not found then raise exception 'thumbnail customer fixture unavailable'; end if;
  perform tongs.establish_owner_cost_operation(
    v_thumbnail_operation,'forge:hearth:thumbnail-direction:slice4d-owner-test',repeat('a',64),
    'test','development','hearth','hearth.thumbnail_direction_generation',
    v_thumbnail.workspace_id,v_thumbnail.workpiece_id,null,null,null,null,
    '{"test":"slice4d"}'::jsonb,clock_timestamp());
  perform tongs.authorize_owner_cost_provider_attempt(
    v_thumbnail_attempt,v_thumbnail_operation,1,'slice4d-thumbnail-attempt',repeat('b',64),
    'openai','responses','gpt-5.6-luna','slice4d-thumbnail',repeat('c',64),
    '{}'::jsonb,clock_timestamp());
  perform tongs.append_owner_cost_attempt_event(
    '4d000000-0000-4000-8000-000000000003',v_thumbnail_attempt,2,'submitted',null,
    '{}'::jsonb,'{}'::jsonb,clock_timestamp());
  perform tongs.append_owner_cost_attempt_event(
    '4d000000-0000-4000-8000-000000000004',v_thumbnail_attempt,3,'response_captured',
    v_thumbnail.provider_request_id,'{}'::jsonb,'{}'::jsonb,clock_timestamp());
  v_thumbnail_result:=tongs.persist_owner_hearth_text_result(
    v_thumbnail_attempt,'hearth.thumbnail_direction_generation',v_thumbnail.user_id,
    v_thumbnail.workspace_id,v_thumbnail.workpiece_id,repeat('a',64),'test','development',
    v_thumbnail.provider_request_id,'gpt-5.6-luna',v_thumbnail.input_units,
    v_thumbnail.output_units,null,v_thumbnail.result_json,v_thumbnail.approval_id,
    v_thumbnail.approval_revision,v_thumbnail.script_content_hash);
  v_thumbnail_result_id:=(v_thumbnail_result->>'id')::uuid;
  if v_thumbnail_result_id is null or v_thumbnail_result->>'authority'<>'owner_cost_provider_attempt'
  then raise exception 'owner thumbnail persistence failed'; end if;
  if (tongs.persist_owner_hearth_text_result(
    v_thumbnail_attempt,'hearth.thumbnail_direction_generation',v_thumbnail.user_id,
    v_thumbnail.workspace_id,v_thumbnail.workpiece_id,repeat('a',64),'test','development',
    v_thumbnail.provider_request_id,'gpt-5.6-luna',v_thumbnail.input_units,
    v_thumbnail.output_units,null,v_thumbnail.result_json,v_thumbnail.approval_id,
    v_thumbnail.approval_revision,v_thumbnail.script_content_hash)->>'replay')::boolean is not true
  then raise exception 'owner thumbnail exact replay failed'; end if;
  begin
    perform tongs.persist_owner_hearth_text_result(
      v_thumbnail_attempt,'hearth.thumbnail_direction_generation',v_thumbnail.user_id,
      v_thumbnail.workspace_id,v_thumbnail.workpiece_id,repeat('a',64),'live','development',
      v_thumbnail.provider_request_id,'gpt-5.6-luna',v_thumbnail.input_units,
      v_thumbnail.output_units,null,v_thumbnail.result_json,v_thumbnail.approval_id,
      v_thumbnail.approval_revision,v_thumbnail.script_content_hash);
    raise exception 'owner thumbnail accepted wrong environment';
  exception when sqlstate '42501' then null;
  end;
  perform tongs.finalize_owner_hearth_thumbnail_direction_generation_result(
    v_thumbnail_attempt,v_thumbnail_result_id,
    '4d000000-0000-4000-8000-000000000005',repeat('d',64));
  perform tongs.finalize_owner_hearth_thumbnail_direction_generation_result(
    v_thumbnail_attempt,v_thumbnail_result_id,
    '4d000000-0000-4000-8000-000000000005',repeat('d',64));

  -- Unified owner establishment and exact recovery.
  select sequence.workspace_id,sequence.workpiece_id,sequence.current_approval_id,workspace.created_by
    into v_unified_workspace,v_unified_workpiece,v_approval_id,v_unified_user
  from tongs.workpiece_script_approval_sequences sequence
  join tongs.workspaces workspace on workspace.id=sequence.workspace_id
  where sequence.current_approval_id is not null order by sequence.updated_at desc limit 1;
  if v_approval_id is null then raise exception 'unified current approval fixture unavailable'; end if;
  select * into v_image from tongs.workpiece_image_map_sequences where workspace_id=v_unified_workspace and workpiece_id=v_unified_workpiece;
  select * into v_broll from tongs.broll_plan_sequences where workspace_id=v_unified_workspace and workpiece_id=v_unified_workpiece;
  select * into v_reference from tongs.reference_clip_plan_sequences where workspace_id=v_unified_workspace and workpiece_id=v_unified_workpiece;
  select * into v_reference_visual from tongs.reference_visual_plan_sequences where workspace_id=v_unified_workspace and workpiece_id=v_unified_workpiece;
  perform tongs.establish_owner_cost_operation(
    v_unified_operation,'forge:unified-visual-plan:slice4d-owner-test',repeat('e',64),
    'test','development','hearth','visual.unified_plan',v_unified_workspace,
    v_unified_workpiece,null,null,null,null,'{"test":"slice4d"}'::jsonb,clock_timestamp());
  perform tongs.authorize_owner_cost_provider_attempt(
    v_unified_attempt,v_unified_operation,1,'slice4d-unified-attempt',repeat('f',64),
    'openai','responses','gpt-5.6-luna','slice4d-unified',repeat('1',64),
    '{}'::jsonb,clock_timestamp());
  v_result:=tongs.begin_owner_unified_visual_plan(
    v_unified_attempt,v_unified_user,v_unified_workspace,v_unified_workpiece,repeat('e',64),
    'test','development',v_approval_id,v_image.current_revision_id,coalesce(v_image.current_revision,0),
    v_broll.current_plan_revision_id,coalesce(v_broll.current_plan_revision,0),
    v_reference.current_plan_revision_id,coalesce(v_reference.current_plan_revision,0),
    v_reference_visual.current_plan_revision_id,coalesce(v_reference_visual.current_plan_revision,0),
    '{"test":"slice4d"}'::jsonb,'gpt-5.6-luna');
  if v_result->>'disposition'<>'reserved' then raise exception 'owner unified begin failed: %',v_result; end if;
  v_result:=tongs.begin_owner_unified_visual_plan(
    v_unified_attempt,v_unified_user,v_unified_workspace,v_unified_workpiece,repeat('e',64),
    'test','development',v_approval_id,v_image.current_revision_id,coalesce(v_image.current_revision,0),
    v_broll.current_plan_revision_id,coalesce(v_broll.current_plan_revision,0),
    v_reference.current_plan_revision_id,coalesce(v_reference.current_plan_revision,0),
    v_reference_visual.current_plan_revision_id,coalesce(v_reference_visual.current_plan_revision,0),
    '{"test":"slice4d"}'::jsonb,'gpt-5.6-luna');
  if v_result->>'disposition'<>'replay' then raise exception 'owner unified replay failed'; end if;
  begin
    insert into tongs.unified_visual_plan_operations(
      operation_id,operation_fingerprint,workspace_id,workpiece_id,script_approval_id,
      script_approval_revision,script_content_hash,normalized_inputs_json,created_by)
    select 'forge:unified-visual-plan:slice4d-unclassified-test',operation_fingerprint,
      workspace_id,workpiece_id,script_approval_id,script_approval_revision,
      script_content_hash,normalized_inputs_json,created_by
    from tongs.unified_visual_plan_operations limit 1;
    raise exception 'forward unified insert accepted no authority';
  exception when sqlstate '23514' then null;
  end;

  -- Motion interpretation owner establishment, provider evidence, and commit.
  for v_candidate in
    select sequence.*,workspace.created_by as workspace_creator
    from tongs.broll_prompt_sequences sequence
    join tongs.workspaces workspace on workspace.id=sequence.workspace_id
    order by sequence.updated_at desc
  loop
    perform set_config('request.jwt.claims',jsonb_build_object(
      'role','service_role','sub',v_candidate.workspace_creator)::text,true);
    v_current:=tongs.broll_current_creative_input(
      v_candidate.workspace_id,v_candidate.workpiece_id,v_candidate.beat_id,
      v_candidate.creator_direction,'forge.broll-motion-interpretation.v1',
      'forge.broll-motion-synthesis.v1');
    if v_current->>'disposition'='current' then
      select * into v_prompt_sequence from tongs.broll_prompt_sequences
      where workspace_id=v_candidate.workspace_id and workpiece_id=v_candidate.workpiece_id
        and beat_id=v_candidate.beat_id;
      v_motion_user:=v_candidate.workspace_creator;
      exit;
    end if;
  end loop;
  if v_prompt_sequence.beat_id is null then raise exception 'motion current creative fixture unavailable'; end if;
  v_motion_workspace:=v_prompt_sequence.workspace_id;
  v_motion_workpiece:=v_prompt_sequence.workpiece_id;
  v_motion_beat:=v_prompt_sequence.beat_id;
  perform tongs.establish_owner_cost_operation(
    v_motion_operation,'forge:broll:prompt:slice4d-owner-test',repeat('2',64),
    'test','development','hearth','motion.broll_interpretation',v_motion_workspace,
    v_motion_workpiece,null,null,null,null,'{"test":"slice4d"}'::jsonb,clock_timestamp());
  perform tongs.authorize_owner_cost_provider_attempt(
    v_motion_attempt,v_motion_operation,1,'slice4d-motion-attempt',repeat('3',64),
    'openai','responses','gpt-5.6-luna','slice4d-motion',repeat('4',64),
    '{}'::jsonb,clock_timestamp());
  v_motion_result:=tongs.begin_owner_broll_prompt_interpretation(
    v_motion_attempt,v_motion_user,v_motion_workspace,v_motion_workpiece,v_motion_beat,
    repeat('2',64),'test','development',v_prompt_sequence.current_prompt_revision_id,
    v_prompt_sequence.current_prompt_revision,v_prompt_sequence.creator_direction,
    v_current->>'creative_input_hash','forge.broll-motion-interpretation.v1',
    'forge.broll-motion-validator.v1','forge.broll-motion-synthesis.v1','openai',
    'gpt-5.6-luna','{"test":"slice4d"}'::jsonb);
  if v_motion_result->>'disposition'<>'reserved' then raise exception 'owner motion begin failed: %',v_motion_result; end if;
  perform tongs.append_owner_cost_attempt_event(
    '4d000000-0000-4000-8000-000000000023',v_motion_attempt,2,'submitted',null,
    '{}'::jsonb,'{}'::jsonb,clock_timestamp());
  perform tongs.append_owner_cost_attempt_event(
    '4d000000-0000-4000-8000-000000000024',v_motion_attempt,3,'response_captured',
    'slice4d-motion-provider','{}'::jsonb,'{}'::jsonb,clock_timestamp());
  perform tongs.record_broll_provider_or_upload_result(
    'forge:broll:prompt:slice4d-owner-test',repeat('2',64),'{"test":"slice4d"}'::jsonb);
  v_motion_result:=tongs.commit_broll_prompt_interpretation(
    'forge:broll:prompt:slice4d-owner-test',repeat('2',64),
    (v_current#>>'{beat_revision,id}')::uuid,
    jsonb_build_object(
      'narrative_purpose','Explain the scene','central_message','One clear action',
      'visible_subjects','A host and a workbench','action_over_time','The host assembles the object step by step',
      'camera_behavior','Slow lateral tracking','start_frame','Wide establishing frame',
      'end_frame','Close view of the completed object','target_duration','6 seconds',
      'pacing','Measured','setting','Workshop','mood','Focused','continuity','Continuous action',
      'must_include','Hands and object','avoid','Text overlays','loopability','Clean endpoint'),
    'A slow tracking shot of a host assembling an object at a workshop bench.',
    'forge.broll-motion-interpretation.v1','forge.broll-motion-validator.v1',
    'forge.broll-motion-synthesis.v1',v_motion_user);
  if v_motion_result->>'disposition'<>'committed' then raise exception 'owner motion commit failed: %',v_motion_result; end if;
  v_prompt_id:=(v_motion_result#>>'{prompt_revision,id}')::uuid;
  if not exists(select 1 from tongs.broll_prompt_revisions
      where id=v_prompt_id and owner_cost_attempt_id=v_motion_attempt)
  then raise exception 'owner motion prompt did not inherit attempt authority'; end if;
  if (tongs.commit_broll_prompt_interpretation(
    'forge:broll:prompt:slice4d-owner-test',repeat('2',64),(v_current#>>'{beat_revision,id}')::uuid,
    '{}'::jsonb,'ignored','forge.broll-motion-interpretation.v1',
    'forge.broll-motion-validator.v1','forge.broll-motion-synthesis.v1',v_motion_user)->>'disposition')<>'committed'
  then raise exception 'owner motion terminal replay failed'; end if;
end $$;

rollback;
