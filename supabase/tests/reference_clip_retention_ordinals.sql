\set ON_ERROR_STOP on
begin;

insert into auth.users(id,email) values('81000000-0000-4000-8000-000000000001','reference-retention@example.invalid');
insert into tongs.workspaces(id,created_by,name,org_id)
values('82000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000001','Reference retention test',(select id from tongs.orgs where personal_owner_user_id='81000000-0000-4000-8000-000000000001'));
insert into tongs.episodes(id,workspace_id,label) values('83000000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000001','Reference retention episode');
insert into tongs.script_approval_revisions(id,workspace_id,workpiece_id,approval_revision,source_file_path,source_file_revision,script_content_hash,semantic_state_hash,immutable_revision_hash,script_text,approval_contract_version,created_by)
values('84000000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000001',1,'script/script.md',1,repeat('1',64),repeat('2',64),repeat('3',64),'The growers moved south through Florida. Railroads carried citrus north.','test.v1','81000000-0000-4000-8000-000000000001');
insert into tongs.workpiece_script_approval_sequences(workspace_id,workpiece_id,current_approval_id,current_revision)
values('82000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000001','84000000-0000-4000-8000-000000000001',1);
insert into tongs.assets(id,workspace_id,workpiece_id,path,mime_type,bytes,storage_bucket,storage_key,provider,prompt,created_by,asset_kind,status,content_hash,ready_at,metadata_json)
values('85000000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000001','assets/reference/retained.mp4','video/mp4',100,'forge-workpieces','reference/retained.mp4','creator-upload','reference','81000000-0000-4000-8000-000000000001','broll_candidate_video','ready',repeat('4',64),now(),'{"duration_ms":5000}');

set local request.jwt.claims='{"sub":"81000000-0000-4000-8000-000000000001","role":"authenticated"}';
set local role authenticated;

do $setup$
declare v jsonb; source_revision uuid; link_revision uuid; plan_id uuid; opportunity_revision uuid; candidate_revision uuid;
begin
  v:=tongs.commit_source_revision('82000000-0000-4000-8000-000000000001',null,'retained-source',0,'video','Retained archive',null,null,null,'https://example.invalid/archive',null,null,null,'{}','{}','v1','v1','forge:source:retention-source',repeat('a',64),'81000000-0000-4000-8000-000000000001');
  source_revision:=(v#>>'{source_revision,id}')::uuid;
  v:=tongs.commit_workpiece_source_link_revision('82000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000001',null,0,source_revision,1,'reference_media','84000000-0000-4000-8000-000000000001',1,'{"span_text":"moved south"}','{}','{}',null,'Retained archive','{}','forge:source:retention-link',repeat('b',64),'81000000-0000-4000-8000-000000000001');
  link_revision:=(v#>>'{link_revision,id}')::uuid;
  v:=tongs.commit_reference_clip_plan('82000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000001',null,0,'84000000-0000-4000-8000-000000000001','test.v1',jsonb_build_array(jsonb_build_object('opportunity_id','86000000-0000-4000-8000-000000000001','source_revision_id',source_revision,'workpiece_source_link_revision_id',link_revision,'context_focus','The growers moved south through Florida.','narrative_purpose','Show relocation','placement_hint','on phrase','duration_target_ms',5000)),'retention-plan-initial',repeat('c',64),'81000000-0000-4000-8000-000000000001');
  plan_id:=(v#>>'{plan_revision,id}')::uuid;
  select opportunity_revision_id into opportunity_revision from tongs.reference_clip_plan_membership where plan_revision_id=plan_id;
  v:=tongs.commit_reference_clip_candidate('82000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000001','86000000-0000-4000-8000-000000000001',opportunity_revision,'85000000-0000-4000-8000-000000000001',null,'{"basis":"permission_granted"}','{}','forge:test:retention-candidate',repeat('d',64),'81000000-0000-4000-8000-000000000001');
  candidate_revision:=(v#>>'{candidate_revision,id}')::uuid;
  v:=tongs.select_reference_clip_candidate('82000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000001','86000000-0000-4000-8000-000000000001',candidate_revision,plan_id,1,0,'forge:test:retention-selection',repeat('e',64),'81000000-0000-4000-8000-000000000001');
  if v->>'disposition'<>'committed' then raise exception 'selection fixture failed %',v;end if;
end
$setup$;

reset role;
insert into tongs.unified_visual_plan_operations(operation_id,operation_fingerprint,workspace_id,workpiece_id,script_approval_id,script_approval_revision,script_content_hash,state,normalized_inputs_json,provider_response_json,provider_response_hash,created_by,contract_version)
values
('retention-empty',repeat('5',64),'82000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000001','84000000-0000-4000-8000-000000000001',1,repeat('1',64),'broll_plan_committed','{}','{"canonical_plan":{"reference_clips":[]}}',repeat('6',64),'81000000-0000-4000-8000-000000000001','forge.unified-visual-plan.v2'),
('retention-mixed',repeat('7',64),'82000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000001','84000000-0000-4000-8000-000000000001',1,repeat('1',64),'broll_plan_committed','{}','{"canonical_plan":{}}',repeat('8',64),'81000000-0000-4000-8000-000000000001','forge.unified-visual-plan.v2'),
('retention-deduplicated',repeat('9',64),'82000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000001','84000000-0000-4000-8000-000000000001',1,repeat('1',64),'broll_plan_committed','{}','{"canonical_plan":{}}',repeat('0',64),'81000000-0000-4000-8000-000000000001','forge.unified-visual-plan.v2');

set local request.jwt.claims='{"sub":"81000000-0000-4000-8000-000000000001","role":"authenticated"}';
set local role authenticated;

do $test$
declare v jsonb; current_id uuid; current_revision bigint; provider_id uuid; successor_id uuid; replay_id uuid; source_revision uuid; link_revision uuid;
begin
  select current_plan_revision_id,current_plan_revision into current_id,current_revision from tongs.reference_clip_plan_sequences where workspace_id='82000000-0000-4000-8000-000000000001' and workpiece_id='83000000-0000-4000-8000-000000000001';
  v:=tongs.commit_reference_clip_plan('82000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000001',current_id,current_revision,'84000000-0000-4000-8000-000000000001','provider.empty','[]','retention-empty:reference',repeat('1',64),'81000000-0000-4000-8000-000000000001');
  provider_id:=(v#>>'{plan_revision,id}')::uuid;
  v:=tongs.retain_unified_reference_clip_selections('retention-empty',repeat('5',64),provider_id);
  successor_id:=(v->>'revision_id')::uuid;
  if (v->>'retained_count')::int<>1 or (select array_agg(ordinal order by ordinal) from tongs.reference_clip_plan_membership where plan_revision_id=successor_id)<>array[1] then raise exception 'empty-provider retention did not create one-based membership %',v;end if;
  replay_id:=(tongs.retain_unified_reference_clip_selections('retention-empty',repeat('5',64),provider_id)->>'revision_id')::uuid;
  if replay_id<>successor_id then raise exception 'retention replay changed successor identity';end if;

  select id into source_revision from tongs.source_revisions where workspace_id='82000000-0000-4000-8000-000000000001' limit 1;
  select id into link_revision from tongs.workpiece_source_link_revisions where workspace_id='82000000-0000-4000-8000-000000000001' limit 1;
  select current_plan_revision_id,current_plan_revision into current_id,current_revision from tongs.reference_clip_plan_sequences where workspace_id='82000000-0000-4000-8000-000000000001' and workpiece_id='83000000-0000-4000-8000-000000000001';
  v:=tongs.commit_reference_clip_plan('82000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000001',current_id,current_revision,'84000000-0000-4000-8000-000000000001','provider.mixed',jsonb_build_array(jsonb_build_object('opportunity_id','86000000-0000-4000-8000-000000000002','source_revision_id',source_revision,'workpiece_source_link_revision_id',link_revision,'context_focus','Railroads carried citrus north.','narrative_purpose','Show rail transport','placement_hint','on phrase','duration_target_ms',5000)),'retention-mixed:reference',repeat('2',64),'81000000-0000-4000-8000-000000000001');
  provider_id:=(v#>>'{plan_revision,id}')::uuid;
  v:=tongs.retain_unified_reference_clip_selections('retention-mixed',repeat('7',64),provider_id);
  successor_id:=(v->>'revision_id')::uuid;
  if (select array_agg(ordinal order by ordinal) from tongs.reference_clip_plan_membership where plan_revision_id=successor_id)<>array[1,2] then raise exception 'mixed merge ordinals were not dense and one-based %',v;end if;
  if jsonb_array_length(v#>'{membership_evidence,reference_clip,provider_proposed}')<>1 or jsonb_array_length(v#>'{membership_evidence,reference_clip,creator_retained}')<>1 then raise exception 'membership origins were not distinguished %',v;end if;

  select current_plan_revision_id,current_plan_revision into current_id,current_revision from tongs.reference_clip_plan_sequences where workspace_id='82000000-0000-4000-8000-000000000001' and workpiece_id='83000000-0000-4000-8000-000000000001';
  v:=tongs.commit_reference_clip_plan('82000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000001',current_id,current_revision,'84000000-0000-4000-8000-000000000001','provider.same-opportunity',jsonb_build_array(jsonb_build_object('opportunity_id','86000000-0000-4000-8000-000000000001','source_revision_id',source_revision,'workpiece_source_link_revision_id',link_revision,'context_focus','The growers moved south through Florida.','narrative_purpose','Show relocation','placement_hint','on phrase','duration_target_ms',5000)),'retention-deduplicated:reference',repeat('3',64),'81000000-0000-4000-8000-000000000001');
  provider_id:=(v#>>'{plan_revision,id}')::uuid;
  v:=tongs.retain_unified_reference_clip_selections('retention-deduplicated',repeat('9',64),provider_id);
  if (v->>'retained_count')::int<>0 or (select count(*) from tongs.reference_clip_plan_membership where plan_revision_id=provider_id)<>1 then raise exception 'duplicate opportunity was retained twice %',v;end if;
  if (select count(*) from tongs.reference_clip_candidate_revisions)<>1 then raise exception 'candidate history was mutated';end if;
end
$test$;

rollback;
