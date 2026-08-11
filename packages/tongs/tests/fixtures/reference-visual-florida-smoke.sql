\set ON_ERROR_STOP on
-- Persistent local smoke fixture. Run only after creating the authenticated smoke user.
do $fixture$
declare
  v_user uuid := '60b3d669-5061-46fb-b95d-6505f7f1461c';
  v_workspace uuid;
  v_workpiece uuid := 'f10a0000-0000-4000-8000-000000000001';
  v_approval uuid := 'f10a0000-0000-4000-8000-000000000002';
  v_result jsonb;
begin
  select workspace_id into strict v_workspace from tongs.workspace_members where user_id=v_user and role='owner' order by created_at limit 1;
  insert into tongs.episodes(id,workspace_id,label) values(v_workpiece,v_workspace,'Florida Oranges — Agriculture Authority') on conflict(id)do nothing;
  insert into tongs.script_approval_revisions(id,workspace_id,workpiece_id,approval_revision,source_file_path,source_file_revision,script_content_hash,semantic_state_hash,immutable_revision_hash,script_text,approval_contract_version,creator_version_label,created_by)
  values(v_approval,v_workspace,v_workpiece,1,'script/script.md',1,repeat('a',64),repeat('b',64),repeat('c',64),'Florida oranges remain a defining crop, but production and growing conditions have changed.','forge.script-approval.v1','v1',v_user) on conflict(id)do nothing;
  insert into tongs.workpiece_script_approval_sequences(workspace_id,workpiece_id,current_approval_id,current_revision,updated_at)
  values(v_workspace,v_workpiece,v_approval,1,now()) on conflict(workspace_id,workpiece_id)do update set current_approval_id=excluded.current_approval_id,current_revision=excluded.current_revision,updated_at=now();
  if not exists(select 1 from tongs.reference_visual_plan_sequences where workspace_id=v_workspace and workpiece_id=v_workpiece)then
    perform set_config('request.jwt.claims',jsonb_build_object('sub',v_user,'role','authenticated')::text,true);
    v_result:=tongs.commit_reference_visual_plan(v_workspace,v_workpiece,null,0,v_approval,'forge.reference-visual.v3',jsonb_build_array(jsonb_build_object(
      'opportunity_id','f10a0000-0000-4000-8000-000000000003','source_status','unresolved','visual_subtype','stat_card',
      'context_focus','How Florida orange production and growing conditions changed','editorial_reason','Build a sourced comparison without reproducing third-party media',
      'desired_material','Facts and data for a production comparison chart','search_terms',jsonb_build_array('Florida oranges production','Florida citrus statistics'),
      'placement_hint','After the opening Florida oranges claim','duration_target_ms',6000)),
      'smoke:florida-reference-visual-plan',repeat('d',64),v_user);
    if v_result->>'disposition'<>'committed'then raise exception 'fixture plan failed: %',v_result;end if;
  end if;
  raise notice 'workspace_id=%, workpiece_id=%',v_workspace,v_workpiece;
end $fixture$;
