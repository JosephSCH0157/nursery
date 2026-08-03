\set ON_ERROR_STOP on
begin;
set local request.jwt.claims='{"sub":"1f2b06bd-05a8-4f4b-9b23-9c57b09d3237","role":"authenticated"}';

insert into tongs.script_approval_revisions(id,workspace_id,workpiece_id,approval_revision,source_file_path,source_file_revision,script_content_hash,semantic_state_hash,immutable_revision_hash,script_text,approval_contract_version,created_by)
values('31000000-0000-4000-8000-000000000001','08dd1d8d-3e03-447e-8edd-820564a32ba3','6505ce4f-a985-4387-9d8a-0e9323468489',9101,'script/script.md',9101,repeat('1',64),repeat('2',64),repeat('3',64),'Orange Blossom Trail once smelled of citrus. The groves disappeared.','test.v1','1f2b06bd-05a8-4f4b-9b23-9c57b09d3237');

set local role authenticated;
do $test$
declare v jsonb; v_plan uuid; v_beat uuid; v_beat_rev uuid; v_prompt uuid; v_candidate uuid; v_asset uuid; v_poster uuid; v_selection uuid; v_count bigint;
begin
 v:=tongs.commit_broll_plan('08dd1d8d-3e03-447e-8edd-820564a32ba3','6505ce4f-a985-4387-9d8a-0e9323468489',null,0,'31000000-0000-4000-8000-000000000001','forge.broll-source-context.v1',jsonb_build_array(jsonb_build_object('beat_id','32000000-0000-4000-8000-000000000001','context_before','Northern Orlando','context_focus','Orange Blossom Trail once smelled of citrus.','context_after','The groves disappeared.','canonical_anchor_assessment',jsonb_build_object('state','verified'),'narrative_purpose','Contrast remembered groves with present development','placement_hint','first_occurrence','duration_target_ms',5000,'shot_type','tracking','motion_intent','roadside travel','mood_pacing','slow and reflective','asset_category','documentary_broll','trim_guidance',jsonb_build_object('preferred_in_ms',300))), 'forge:broll:plan-db-replay-0001',repeat('a',64),'1f2b06bd-05a8-4f4b-9b23-9c57b09d3237');
 if v->>'disposition'<>'committed' then raise exception 'plan commit failed %',v; end if;
 v_plan:=(v#>>'{plan_revision,id}')::uuid;
 v:=tongs.commit_broll_plan('08dd1d8d-3e03-447e-8edd-820564a32ba3','6505ce4f-a985-4387-9d8a-0e9323468489',null,0,'31000000-0000-4000-8000-000000000001','ignored','[]','forge:broll:plan-db-replay-0001',repeat('a',64),'1f2b06bd-05a8-4f4b-9b23-9c57b09d3237');
 if (v#>>'{plan_revision,id}')::uuid<>v_plan then raise exception 'plan replay identity changed'; end if;
 select beat_id,beat_revision_id into v_beat,v_beat_rev from tongs.broll_plan_beat_membership where plan_revision_id=v_plan;

 v:=tongs.begin_broll_operation('08dd1d8d-3e03-447e-8edd-820564a32ba3','6505ce4f-a985-4387-9d8a-0e9323468489',v_beat,'prompt_interpretation','forge:broll:prompt-db-replay-0001',repeat('b',64),jsonb_build_object('expected_prompt_revision',0,'expected_prompt_revision_id',null),'1f2b06bd-05a8-4f4b-9b23-9c57b09d3237');
 if v->>'disposition'<>'reserved' then raise exception 'prompt reserve failed %',v; end if;
 v:=tongs.begin_broll_operation('08dd1d8d-3e03-447e-8edd-820564a32ba3','6505ce4f-a985-4387-9d8a-0e9323468489',v_beat,'prompt_interpretation','forge:broll:prompt-db-replay-0001',repeat('f',64),'{}','1f2b06bd-05a8-4f4b-9b23-9c57b09d3237');
 if v->>'disposition'<>'operation_identity_conflict' then raise exception 'operation fingerprint reuse was accepted %',v; end if;
 perform tongs.record_broll_provider_or_upload_result('forge:broll:prompt-db-replay-0001',repeat('b',64),jsonb_build_object('provider_request_id','motion-1','brief','returned'));
 v:=tongs.commit_broll_prompt_interpretation('forge:broll:prompt-db-replay-0001',repeat('b',64),v_beat_rev,jsonb_build_object('visible_subjects',jsonb_build_array('road','former grove land'),'action_across_time','camera travels south as groves give way to development','camera_behavior','slow vehicle-mounted tracking','start_state','road lined by sparse citrus','end_state','roadside development replaces the grove','duration','five seconds','setting','present-day northern Orlando at dawn','mood_pacing','slow and reflective','continuity','consistent southbound screen direction','must_include',jsonb_build_array('road','remaining citrus trees','development'),'exclusions',jsonb_build_array('logos','text'),'loopability','not required'),'Slow southbound roadside tracking shot through northern Orlando, sparse citrus giving way to development.', 'motion.interpret.v1','motion.validator.v1','motion.synthesis.v1','1f2b06bd-05a8-4f4b-9b23-9c57b09d3237');
 if v->>'disposition'<>'committed' then raise exception 'prompt commit failed %',v; end if;
 v_prompt:=(v#>>'{prompt_revision,id}')::uuid;
 v:=tongs.commit_broll_prompt_creator_edit('08dd1d8d-3e03-447e-8edd-820564a32ba3','6505ce4f-a985-4387-9d8a-0e9323468489',v_beat,null,0,'stale edit','forge:broll:prompt-stale-edit-0005',repeat('5',64),'1f2b06bd-05a8-4f4b-9b23-9c57b09d3237');
 if v->>'disposition'<>'prompt_revision_conflict' then raise exception 'stale prompt edit advanced %',v; end if;

 insert into tongs.assets(workspace_id,workpiece_id,path,mime_type,bytes,storage_bucket,storage_key,provider,prompt,created_by,asset_kind,status,metadata_json,content_hash,ready_at,width,height)
 values('08dd1d8d-3e03-447e-8edd-820564a32ba3','6505ce4f-a985-4387-9d8a-0e9323468489','assets/broll/test.mp4','video/mp4',1024,'forge-workpieces','workpieces/test/broll.mp4','test-provider','canonical prompt','1f2b06bd-05a8-4f4b-9b23-9c57b09d3237','broll_candidate_video','ready','{"duration_ms":5000}',repeat('d',64),now(),1920,1080) returning id into v_asset;
 insert into tongs.assets(workspace_id,workpiece_id,path,mime_type,bytes,storage_bucket,storage_key,provider,created_by,asset_kind,status,metadata_json,content_hash,ready_at,width,height)
 values('08dd1d8d-3e03-447e-8edd-820564a32ba3','6505ce4f-a985-4387-9d8a-0e9323468489','assets/broll/test-poster.png','image/png',512,'forge-workpieces','workpieces/test/broll-poster.png','test-provider','1f2b06bd-05a8-4f4b-9b23-9c57b09d3237','broll_candidate_poster','ready','{}',repeat('9',64),now(),640,360) returning id into v_poster;
 v:=tongs.begin_broll_operation('08dd1d8d-3e03-447e-8edd-820564a32ba3','6505ce4f-a985-4387-9d8a-0e9323468489',v_beat,'candidate_acquire','forge:broll:candidate-db-replay-0001',repeat('c',64),'{}','1f2b06bd-05a8-4f4b-9b23-9c57b09d3237');
 perform tongs.record_broll_provider_or_upload_result('forge:broll:candidate-db-replay-0001',repeat('c',64),jsonb_build_object('provider_request_id','video-1'));
 v:=tongs.verify_broll_operation_asset('forge:broll:candidate-db-replay-0001',repeat('c',64),v_asset);
 if v->>'disposition'<>'asset_verified' then raise exception 'asset verify failed %',v; end if;
 perform tongs.fail_broll_operation('forge:broll:candidate-db-replay-0001',repeat('c',64),'poster_upload','transient_upload_failure','response lost after video verification');
 v:=tongs.begin_broll_operation('08dd1d8d-3e03-447e-8edd-820564a32ba3','6505ce4f-a985-4387-9d8a-0e9323468489',v_beat,'candidate_acquire','forge:broll:candidate-db-replay-0001',repeat('c',64),'{}','1f2b06bd-05a8-4f4b-9b23-9c57b09d3237');
 if v#>>'{operation,state}'<>'asset_verified' or v#>>'{operation,failed_stage}' is not null then raise exception 'failed operation did not resume from asset verification %',v; end if;
 v:=tongs.verify_broll_operation_poster('forge:broll:candidate-db-replay-0001',repeat('c',64),v_poster);
 if v->>'disposition'<>'poster_asset_verified' then raise exception 'poster verify failed %',v; end if;
 v:=tongs.verify_broll_operation_poster('forge:broll:candidate-db-replay-0001',repeat('c',64),v_poster);
 if v->>'disposition'<>'replay' then raise exception 'poster response-loss replay failed %',v; end if;
 v:=tongs.commit_broll_candidate('forge:broll:candidate-db-replay-0001',repeat('c',64),v_prompt,'generated','{"license":"provider-test"}','{"provider_request_id":"video-1"}','1f2b06bd-05a8-4f4b-9b23-9c57b09d3237');
 if v->>'disposition'<>'committed' then raise exception 'candidate commit failed %',v; end if;
 v_candidate:=(v#>>'{candidate_revision,id}')::uuid;
 if (v#>>'{candidate_revision,poster_asset_id}')::uuid<>v_poster or v#>>'{candidate_revision,asset_path}'<>'assets/broll/test.mp4' then raise exception 'candidate evidence lost asset or poster identity %',v; end if;
 v:=tongs.commit_broll_candidate('forge:broll:candidate-db-replay-0001',repeat('c',64),null,'stock','{}','{}','1f2b06bd-05a8-4f4b-9b23-9c57b09d3237');
 if (v#>>'{candidate_revision,id}')::uuid<>v_candidate then raise exception 'candidate replay identity changed'; end if;

 v:=tongs.select_broll_candidate('08dd1d8d-3e03-447e-8edd-820564a32ba3','6505ce4f-a985-4387-9d8a-0e9323468489',v_beat,v_candidate,v_plan,1,0,'forge:broll:selection-db-replay-0001',repeat('e',64),'1f2b06bd-05a8-4f4b-9b23-9c57b09d3237');
 if v->>'disposition'<>'committed' then raise exception 'selection failed %',v; end if;
 v_selection:=(v#>>'{selection,id}')::uuid;
 v:=tongs.select_broll_candidate('08dd1d8d-3e03-447e-8edd-820564a32ba3','6505ce4f-a985-4387-9d8a-0e9323468489',v_beat,v_candidate,v_plan,1,0,'forge:broll:selection-db-replay-0001',repeat('e',64),'1f2b06bd-05a8-4f4b-9b23-9c57b09d3237');
 if (v#>>'{selection,id}')::uuid<>v_selection then raise exception 'selection response-loss replay changed identity'; end if;
 v:=tongs.select_broll_candidate('08dd1d8d-3e03-447e-8edd-820564a32ba3','6505ce4f-a985-4387-9d8a-0e9323468489',v_beat,v_candidate,v_plan,1,0,'forge:broll:selection-stale-0002',repeat('6',64),'1f2b06bd-05a8-4f4b-9b23-9c57b09d3237');
 if v->>'disposition'<>'selection_revision_conflict' then raise exception 'stale selection concurrency advanced %',v; end if;
 v:=tongs.read_current_broll_plan('08dd1d8d-3e03-447e-8edd-820564a32ba3','6505ce4f-a985-4387-9d8a-0e9323468489');
 if (v#>>'{beats,0,selected_candidate_revision,id}')::uuid<>v_candidate then raise exception 'canonical readback selection missing %',v; end if;
 v:=tongs.read_current_broll_plan('00000000-0000-4000-8000-000000000099','6505ce4f-a985-4387-9d8a-0e9323468489');
 if v is not null then raise exception 'cross-workspace read leaked canonical state %',v; end if;
 v:=tongs.begin_broll_operation('08dd1d8d-3e03-447e-8edd-820564a32ba3','6505ce4f-a985-4387-9d8a-0e9323468489',v_beat,'candidate_acquire','forge:broll:external-without-asset-0003',repeat('7',64),'{}','1f2b06bd-05a8-4f4b-9b23-9c57b09d3237');
 perform tongs.record_broll_provider_or_upload_result('forge:broll:external-without-asset-0003',repeat('7',64),jsonb_build_object('source_url','https://example.invalid/clip.mp4'));
 v:=tongs.commit_broll_candidate('forge:broll:external-without-asset-0003',repeat('7',64),null,'stock','{}',jsonb_build_object('source_url','https://example.invalid/clip.mp4'),'1f2b06bd-05a8-4f4b-9b23-9c57b09d3237');
 if v->>'disposition'<>'asset_verification_required' then raise exception 'URL-only stock candidate became canonical %',v; end if;
 select count(*) into v_count from tongs.broll_candidate_revisions where workspace_id='08dd1d8d-3e03-447e-8edd-820564a32ba3' and workpiece_id='6505ce4f-a985-4387-9d8a-0e9323468489';
 if v_count<>1 then raise exception 'replay or URL path duplicated candidate revisions: %',v_count; end if;
 if has_table_privilege('authenticated','tongs.broll_plan_revisions','INSERT') or has_table_privilege('authenticated','tongs.broll_selections','UPDATE') or has_table_privilege('authenticated','tongs.broll_operation_receipts','DELETE') then raise exception 'direct-write privilege leaked'; end if;
end $test$;
reset role;
do $immutable$
declare rejected boolean:=false;
begin
 begin
  update tongs.broll_operation_receipts set failure_message='mutated' where operation_id='forge:broll:selection-db-replay-0001';
 exception when sqlstate '55000' then rejected:=true;
 end;
 if not rejected then raise exception 'terminal operation receipt was mutable'; end if;
end $immutable$;
update tongs.workspace_members set role='viewer' where workspace_id='08dd1d8d-3e03-447e-8edd-820564a32ba3' and user_id='1f2b06bd-05a8-4f4b-9b23-9c57b09d3237';
set local role authenticated;
do $viewer$
declare v jsonb;
begin
 v:=tongs.read_current_broll_plan('08dd1d8d-3e03-447e-8edd-820564a32ba3','6505ce4f-a985-4387-9d8a-0e9323468489');
 if v is null then raise exception 'viewer could not read canonical B-roll state'; end if;
 begin
  perform tongs.begin_broll_operation('08dd1d8d-3e03-447e-8edd-820564a32ba3','6505ce4f-a985-4387-9d8a-0e9323468489','32000000-0000-4000-8000-000000000001','candidate_acquire','forge:broll:viewer-denied-0004',repeat('8',64),'{}','1f2b06bd-05a8-4f4b-9b23-9c57b09d3237');
  raise exception 'viewer mutation unexpectedly succeeded';
 exception when insufficient_privilege then null;
 end;
end $viewer$;
reset role;
rollback;
