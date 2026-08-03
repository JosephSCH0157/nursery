\set ON_ERROR_STOP on
begin;
set local request.jwt.claims='{"sub":"1f2b06bd-05a8-4f4b-9b23-9c57b09d3237","role":"authenticated"}';

insert into tongs.script_approval_revisions(id,workspace_id,workpiece_id,approval_revision,source_file_path,source_file_revision,script_content_hash,semantic_state_hash,immutable_revision_hash,script_text,approval_contract_version,created_by)
values('10000000-0000-4000-8000-000000000001','08dd1d8d-3e03-447e-8edd-820564a32ba3','6505ce4f-a985-4387-9d8a-0e9323468489',9001,'script/script.md',9001,repeat('1',64),repeat('2',64),repeat('3',64),'Florida orange juice versus California oranges.','test.v1','1f2b06bd-05a8-4f4b-9b23-9c57b09d3237');
insert into tongs.image_map_revisions(id,workspace_id,workpiece_id,revision,source_script_approval_id,source_script_approval_revision,source_script_content_hash,anchor_contract_version,provenance_state,document_json,document_content_hash,semantic_state_hash,immutable_revision_hash,created_by)
values('20000000-0000-4000-8000-000000000001','08dd1d8d-3e03-447e-8edd-820564a32ba3','6505ce4f-a985-4387-9d8a-0e9323468489',1,'10000000-0000-4000-8000-000000000001',9001,repeat('1',64),'test.v1','current','{"entries":[{"id":"moment-rivalry"}]}',repeat('4',64),repeat('5',64),repeat('6',64),'1f2b06bd-05a8-4f4b-9b23-9c57b09d3237');

set local role authenticated;
do $test$
declare v jsonb; v_id uuid; v_edit uuid;
begin
  v:=tongs.begin_image_prompt_interpretation('08dd1d8d-3e03-447e-8edd-820564a32ba3','6505ce4f-a985-4387-9d8a-0e9323468489','moment-rivalry','20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',null,0,'forge:image-prompt:db-replay-0001',repeat('a',64),'{"source_context":{"before":"Commercial rivals","focus":"Florida orange juice versus California oranges.","after":"Consumers chose between them."},"creator_direction":"Show competing citrus products"}','1f2b06bd-05a8-4f4b-9b23-9c57b09d3237');
  if v->>'disposition'<>'reserved' then raise exception 'begin failed: %',v; end if;
  v:=tongs.begin_image_prompt_interpretation('08dd1d8d-3e03-447e-8edd-820564a32ba3','6505ce4f-a985-4387-9d8a-0e9323468489','moment-rivalry','20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',null,0,'forge:image-prompt:db-replay-0001',repeat('a',64),'{"source_context":{},"creator_direction":"ignored replay payload"}','1f2b06bd-05a8-4f4b-9b23-9c57b09d3237');
  if v->>'disposition'<>'replay' or v#>>'{operation,state}'<>'pending' then raise exception 'pending replay failed: %',v; end if;
  v:=tongs.record_image_prompt_provider_response('forge:image-prompt:db-replay-0001',repeat('a',64),'{"canonical_brief":{"ok":true},"provider_request_id":"req-1"}');
  if v->>'disposition'<>'provider_recorded' then raise exception 'provider record failed: %',v; end if;
  perform tongs.fail_image_prompt_operation('forge:image-prompt:db-replay-0001',repeat('a',64),'commit','transient','lost response');
  v:=tongs.begin_image_prompt_interpretation('08dd1d8d-3e03-447e-8edd-820564a32ba3','6505ce4f-a985-4387-9d8a-0e9323468489','moment-rivalry','20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',null,0,'forge:image-prompt:db-replay-0001',repeat('a',64),'{}','1f2b06bd-05a8-4f4b-9b23-9c57b09d3237');
  if v#>>'{operation,state}'<>'provider_completed' or v#>'{operation,provider_response_json}' is null then raise exception 'provider recovery failed: %',v; end if;
  v:=tongs.commit_image_prompt_interpretation('forge:image-prompt:db-replay-0001',repeat('a',64),'{"narrative_purpose":"Show the commercial rivalry","central_message":"Florida juice and California fruit compete for consumers","primary_subjects":["glass of Florida orange juice","crates of California oranges"],"relationship_or_action":"The products face one another as regional competitors","emotional_tone":"competitive and energetic","visual_mode":"editorial","setting":"split citrus display with humid Florida groves and dry California orchards","composition":"balanced opposing sides centered on the actual products","essential_visual_evidence":["juice glass","fresh oranges","distinct orchards"],"avoid":["maps","state outlines","text","logos"],"source_context":{"before":"Commercial rivals","focus":"Florida orange juice versus California oranges.","after":"Consumers chose between them."}}','Concrete vendor prompt','Concrete vendor prompt','interpret.v1','validator.v1','synthesis.v1','test-model','{"request":"canonical"}','1f2b06bd-05a8-4f4b-9b23-9c57b09d3237');
  if v->>'disposition'<>'committed' then raise exception 'commit failed: %',v; end if;
  v_id:=(v#>>'{prompt_revision,id}')::uuid;
  v:=tongs.commit_image_prompt_interpretation('forge:image-prompt:db-replay-0001',repeat('a',64),'{}','','','','','','','{}','1f2b06bd-05a8-4f4b-9b23-9c57b09d3237');
  if (v#>>'{prompt_revision,id}')::uuid<>v_id then raise exception 'terminal replay identity changed'; end if;
  v:=tongs.commit_image_prompt_creator_edit('08dd1d8d-3e03-447e-8edd-820564a32ba3','6505ce4f-a985-4387-9d8a-0e9323468489','moment-rivalry',v_id,1,'Creator exact final prompt','forge:image-prompt:db-edit-0001',repeat('b',64),'1f2b06bd-05a8-4f4b-9b23-9c57b09d3237');
  if v#>>'{prompt_revision,prompt_source}'<>'creator_edited' or v#>>'{prompt_revision,final_prompt}'<>'Creator exact final prompt' then raise exception 'creator edit failed: %',v; end if;
  v_edit:=(v#>>'{prompt_revision,id}')::uuid;
  v:=tongs.commit_image_prompt_creator_edit('08dd1d8d-3e03-447e-8edd-820564a32ba3','6505ce4f-a985-4387-9d8a-0e9323468489','moment-rivalry',v_id,1,'stale','forge:image-prompt:db-edit-stale',repeat('c',64),'1f2b06bd-05a8-4f4b-9b23-9c57b09d3237');
  if v->>'disposition'<>'prompt_revision_conflict' then raise exception 'stale edit advanced: %',v; end if;
  v:=tongs.read_current_image_prompt('08dd1d8d-3e03-447e-8edd-820564a32ba3','6505ce4f-a985-4387-9d8a-0e9323468489','moment-rivalry');
  if (v#>>'{prompt_revision,id}')::uuid<>v_edit or v#>>'{prompt_revision,final_prompt}'<>'Creator exact final prompt' then raise exception 'readback mismatch: %',v; end if;
  if (select count(*) from tongs.image_map_prompt_revisions where image_moment_id='moment-rivalry')<>2 then raise exception 'revision duplication'; end if;
  if has_table_privilege('authenticated','tongs.image_map_prompt_revisions','INSERT')
    or has_table_privilege('authenticated','tongs.image_map_prompt_sequences','UPDATE')
    or has_table_privilege('authenticated','tongs.image_map_prompt_operation_receipts','DELETE') then raise exception 'authenticated direct-write privilege leaked'; end if;
  if not has_function_privilege('authenticated','tongs.begin_image_prompt_interpretation(uuid,uuid,text,uuid,uuid,uuid,bigint,text,text,jsonb,uuid)','EXECUTE')
    or not has_function_privilege('authenticated','tongs.record_image_prompt_provider_response(text,text,jsonb)','EXECUTE')
    or not has_function_privilege('authenticated','tongs.commit_image_prompt_interpretation(text,text,jsonb,text,text,text,text,text,text,jsonb,uuid)','EXECUTE') then raise exception 'authenticated application RPC grant missing'; end if;
end $test$;
reset role;
do $test$
begin
  begin
    update tongs.image_map_prompt_operation_receipts set receipt_json='{}'::jsonb where operation_id='forge:image-prompt:db-edit-0001';
    raise exception 'committed receipt mutated';
  exception when sqlstate '55000' then null;
  end;
end $test$;
rollback;
