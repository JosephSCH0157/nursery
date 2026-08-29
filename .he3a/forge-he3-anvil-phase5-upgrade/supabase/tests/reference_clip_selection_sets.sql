\set ON_ERROR_STOP on
begin;

insert into auth.users(id,email) values
 ('91000000-0000-4000-8000-000000000001','reference-sets@example.invalid'),
 ('91000000-0000-4000-8000-000000000002','reference-outsider@example.invalid');
insert into tongs.workspaces(id,created_by,name,org_id)values('92000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001','Reference sets',(select id from tongs.orgs where personal_owner_user_id='91000000-0000-4000-8000-000000000001'));
insert into tongs.episodes(id,workspace_id,label)values('93000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001','Reference-set episode');
insert into tongs.script_approval_revisions(id,workspace_id,workpiece_id,approval_revision,source_file_path,source_file_revision,script_content_hash,semantic_state_hash,immutable_revision_hash,script_text,approval_contract_version,created_by)
values('94000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001',1,'script/script.md',1,repeat('1',64),repeat('2',64),repeat('3',64),'Three archival views document the same event.','test.v1','91000000-0000-4000-8000-000000000001');
insert into tongs.workpiece_script_approval_sequences(workspace_id,workpiece_id,current_approval_id,current_revision)values('92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','94000000-0000-4000-8000-000000000001',1);
insert into tongs.assets(id,workspace_id,workpiece_id,path,mime_type,bytes,storage_bucket,storage_key,provider,prompt,created_by,asset_kind,status,content_hash,ready_at,metadata_json)values
 ('95000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','assets/reference/one.mp4','video/mp4',100,'forge-workpieces','reference/one.mp4','creator-upload','one','91000000-0000-4000-8000-000000000001','broll_candidate_video','ready',repeat('4',64),now(),jsonb_build_object('duration_ms',5000)),
 ('95000000-0000-4000-8000-000000000002','92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','assets/reference/two.mp4','video/mp4',100,'forge-workpieces','reference/two.mp4','creator-upload','two','91000000-0000-4000-8000-000000000001','broll_candidate_video','ready',repeat('5',64),now(),jsonb_build_object('duration_ms',5000)),
 ('95000000-0000-4000-8000-000000000003','92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','assets/reference/three.mp4','video/mp4',100,'forge-workpieces','reference/three.mp4','creator-upload','three','91000000-0000-4000-8000-000000000001','broll_candidate_video','ready',repeat('6',64),now(),jsonb_build_object('duration_ms',5000));

set local request.jwt.claims='{"sub":"91000000-0000-4000-8000-000000000001","role":"authenticated"}';
set local role authenticated;

do $test$
declare v jsonb;source_revision uuid;link_revision uuid;plan_id uuid;opportunity_revision uuid;c1 uuid;c2 uuid;c3 uuid;readback jsonb;hammer jsonb;set_id uuid;
begin
 v:=tongs.commit_source_revision('92000000-0000-4000-8000-000000000001',null,'selection-set-source',0,'video','Archive',null,null,null,'https://example.invalid/archive',null,null,null,'{}','{}','v1','v1','forge:source:test:sets-source',repeat('a',64),'91000000-0000-4000-8000-000000000001');source_revision:=(v#>>'{source_revision,id}')::uuid;
 v:=tongs.commit_workpiece_source_link_revision('92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001',null,0,source_revision,1,'reference_media','94000000-0000-4000-8000-000000000001',1,jsonb_build_object('span_text','archival views'),'{}','{}',null,'Archive','{}','forge:source:test:sets-link',repeat('b',64),'91000000-0000-4000-8000-000000000001');link_revision:=(v#>>'{link_revision,id}')::uuid;
 v:=tongs.commit_reference_clip_plan('92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001',null,0,'94000000-0000-4000-8000-000000000001','sets.v1',jsonb_build_array(jsonb_build_object('opportunity_id','96000000-0000-4000-8000-000000000001','source_revision_id',source_revision,'workpiece_source_link_revision_id',link_revision,'context_focus','archival views','narrative_purpose','Show evidence','placement_hint','on phrase','duration_target_ms',5000),jsonb_build_object('opportunity_id','96000000-0000-4000-8000-000000000002','source_revision_id',source_revision,'workpiece_source_link_revision_id',link_revision,'context_focus','same event','narrative_purpose','Second opportunity','placement_hint','later','duration_target_ms',5000)),'forge:test:sets-plan',repeat('c',64),'91000000-0000-4000-8000-000000000001');plan_id:=(v#>>'{plan_revision,id}')::uuid;
 select opportunity_revision_id into opportunity_revision from tongs.reference_clip_plan_membership where plan_revision_id=plan_id and opportunity_id='96000000-0000-4000-8000-000000000001';
 v:=tongs.commit_reference_clip_candidate('92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','96000000-0000-4000-8000-000000000001',opportunity_revision,'95000000-0000-4000-8000-000000000001',null,jsonb_build_object('basis','permission_granted'),jsonb_build_object('clip',1),'sets-c1',repeat('d',64),'91000000-0000-4000-8000-000000000001');c1:=(v#>>'{candidate_revision,id}')::uuid;
 v:=tongs.commit_reference_clip_candidate('92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','96000000-0000-4000-8000-000000000001',opportunity_revision,'95000000-0000-4000-8000-000000000002',null,jsonb_build_object('basis','permission_granted'),jsonb_build_object('clip',2),'sets-c2',repeat('e',64),'91000000-0000-4000-8000-000000000001');c2:=(v#>>'{candidate_revision,id}')::uuid;
 v:=tongs.commit_reference_clip_candidate('92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','96000000-0000-4000-8000-000000000001',opportunity_revision,'95000000-0000-4000-8000-000000000003',null,jsonb_build_object('basis','permission_granted'),jsonb_build_object('clip',3),'sets-c3',repeat('f',64),'91000000-0000-4000-8000-000000000001');c3:=(v#>>'{candidate_revision,id}')::uuid;

 v:=tongs.commit_reference_clip_selection_set('92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','96000000-0000-4000-8000-000000000001',jsonb_build_array(c1),plan_id,1,0,'sets-select-1',repeat('1',64),'91000000-0000-4000-8000-000000000001');
 if v->>'disposition'<>'committed'or v#>>'{selection_set_revision,revision}'<>'1'or v->'selected_candidate_revision_ids'<>jsonb_build_array(c1)then raise exception 'initial collection failed %',v;end if;
 v:=tongs.commit_reference_clip_selection_set('92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','96000000-0000-4000-8000-000000000001',jsonb_build_array(c1,c2,c3),plan_id,1,1,'sets-select-3',repeat('2',64),'91000000-0000-4000-8000-000000000001');
 if v->'selected_candidate_revision_ids'<>jsonb_build_array(c1,c2,c3)then raise exception 'ordered add failed %',v;end if;set_id:=(v#>>'{selection_set_revision,id}')::uuid;
 if(select array_agg(candidate_revision_id order by ordinal)from tongs.reference_clip_selection_set_members where selection_set_revision_id=set_id)<>array[c1,c2,c3]then raise exception 'canonical member order failed';end if;
 if(tongs.commit_reference_clip_selection_set('92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','96000000-0000-4000-8000-000000000001',jsonb_build_array(c1,c2),plan_id,1,1,'sets-stale',repeat('3',64),'91000000-0000-4000-8000-000000000001')->>'disposition')<>'selection_revision_conflict'then raise exception 'stale revision accepted';end if;
 if(tongs.commit_reference_clip_selection_set('92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','96000000-0000-4000-8000-000000000001',jsonb_build_array(c1,c2,c3),plan_id,1,1,'sets-select-3',repeat('2',64),'91000000-0000-4000-8000-000000000001')->'selected_candidate_revision_ids')<>jsonb_build_array(c1,c2,c3)then raise exception 'identical replay failed';end if;
 if(tongs.commit_reference_clip_selection_set('92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','96000000-0000-4000-8000-000000000001',jsonb_build_array(c1),plan_id,1,2,'sets-select-3',repeat('9',64),'91000000-0000-4000-8000-000000000001')->>'disposition')<>'operation_identity_conflict'then raise exception 'operation identity conflict not rejected';end if;
 if(tongs.commit_reference_clip_selection_set('92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','96000000-0000-4000-8000-000000000001',jsonb_build_array(c1,c1),plan_id,1,2,'sets-duplicate',repeat('4',64),'91000000-0000-4000-8000-000000000001')->>'disposition')<>'duplicate_candidate'then raise exception 'duplicate accepted';end if;
 if(tongs.commit_reference_clip_selection_set('92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','96000000-0000-4000-8000-000000000001',jsonb_build_array('97000000-0000-4000-8000-000000000001'),plan_id,1,2,'sets-invalid',repeat('5',64),'91000000-0000-4000-8000-000000000001')->>'disposition')<>'invalid_candidate'then raise exception 'invalid candidate accepted';end if;
 if(tongs.commit_reference_clip_selection_set('92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','96000000-0000-4000-8000-000000000002',jsonb_build_array(c1),plan_id,1,0,'sets-wrong-opportunity',repeat('a',64),'91000000-0000-4000-8000-000000000001')->>'disposition')<>'invalid_candidate'then raise exception 'candidate from another opportunity accepted';end if;
 v:=tongs.commit_reference_clip_selection_set('92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','96000000-0000-4000-8000-000000000001',jsonb_build_array(c1,c3),plan_id,1,2,'sets-remove-middle',repeat('6',64),'91000000-0000-4000-8000-000000000001');if v->'selected_candidate_revision_ids'<>jsonb_build_array(c1,c3)then raise exception 'individual removal disturbed collection %',v;end if;
 readback:=tongs.read_current_reference_clip_plan('92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001');
 if readback#>>'{summary,fulfilled}'<>'1'or readback#>>'{summary,unresolved}'<>'1'or jsonb_array_length(readback#>'{opportunities,0,selections}')<>2 then raise exception 'readback/counts failed %',readback;end if;
 hammer:=tongs.read_reference_clip_visual_package('92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001');if jsonb_array_length(hammer->'clips')<>2 or hammer#>>'{clips,0,selection_ordinal}'<>'1'or hammer#>>'{clips,1,selection_ordinal}'<>'2'then raise exception 'Hammer collection projection failed %',hammer;end if;
 v:=tongs.commit_reference_clip_selection_set('92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','96000000-0000-4000-8000-000000000001','[]',plan_id,1,3,'sets-remove-final',repeat('7',64),'91000000-0000-4000-8000-000000000001');if jsonb_array_length(v->'selected_candidate_revision_ids')<>0 then raise exception 'empty collection failed %',v;end if;
 readback:=tongs.read_current_reference_clip_plan('92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001');if readback#>>'{summary,fulfilled}'<>'0'or readback#>>'{summary,unresolved}'<>'2'then raise exception 'empty collection fulfillment failed %',readback;end if;
end
$test$;

reset role;
do $immutable$
declare set_id uuid;
begin
 select id into set_id from tongs.reference_clip_selection_set_revisions where operation_id='sets-select-3';
 begin update tongs.reference_clip_selection_set_revisions set revision=99 where id=set_id;raise exception 'immutable revision update succeeded';exception when sqlstate '55000'then null;end;
 begin delete from tongs.reference_clip_selection_set_members where selection_set_revision_id=set_id;raise exception 'immutable member delete succeeded';exception when sqlstate '55000'then null;end;
end $immutable$;

set local request.jwt.claims='{"sub":"91000000-0000-4000-8000-000000000002","role":"authenticated"}';
set local role authenticated;
do $unauthorized$ begin
 if tongs.read_current_reference_clip_plan('92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001')is not null then raise exception 'unauthorized readback exposed authority';end if;
 begin perform tongs.commit_reference_clip_selection_set('92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','96000000-0000-4000-8000-000000000001','[]','98000000-0000-4000-8000-000000000001',1,4,'sets-unauthorized',repeat('8',64),'91000000-0000-4000-8000-000000000002');raise exception 'unauthorized mutation succeeded';exception when insufficient_privilege then null;end;
end $unauthorized$;

rollback;
