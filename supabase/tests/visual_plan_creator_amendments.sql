begin;

do $$
declare
  u constant uuid:='10000000-0000-0000-0000-000000000001';
  w constant uuid:='10000000-0000-0000-0000-000000000002';
  e constant uuid:='10000000-0000-0000-0000-000000000003';
  a constant uuid:='10000000-0000-0000-0000-000000000004';
  p constant uuid:='10000000-0000-0000-0000-000000000005';
  o constant uuid:='10000000-0000-0000-0000-000000000006';
  orv constant uuid:='10000000-0000-0000-0000-000000000007';
  org_id uuid;
begin
  insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
    values(u,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','visual-amendment@example.test','',now(),now(),now());
  insert into tongs.orgs(name)values('Visual amendment DB test')returning id into org_id;
  insert into tongs.workspaces(id,created_by,name,org_id)values(w,u,'Visual amendment DB test',org_id);
  insert into tongs.episodes(id,workspace_id,label)values(e,w,'Visual amendment DB test');
  insert into tongs.script_approval_revisions(id,workspace_id,workpiece_id,approval_revision,source_file_path,source_file_revision,script_content_hash,semantic_state_hash,immutable_revision_hash,script_text,approval_contract_version,created_by)
    values(a,w,e,1,'script/script.md',1,repeat('1',64),repeat('2',64),repeat('3',64),'Before. The Great Freeze of the 1890s nearly erased the industry. But citrus did not die. After.','test.v1',u);
  insert into tongs.workpiece_script_approval_sequences(workspace_id,workpiece_id,current_approval_id,current_revision)values(w,e,a,1);
  insert into tongs.reference_visual_plan_revisions(id,workspace_id,workpiece_id,revision,script_approval_id,script_approval_revision,script_content_hash,contract_version,content_hash,immutable_revision_hash,created_by)
    values(p,w,e,1,a,1,repeat('1',64),'test.v1',repeat('4',64),repeat('5',64),u);
  insert into tongs.reference_visual_opportunity_revisions(id,opportunity_id,workspace_id,workpiece_id,revision,source_plan_revision_id,source_plan_revision,script_approval_id,script_approval_revision,source_status,visual_subtype,context_focus,editorial_reason,desired_material,placement_hint,duration_target_ms,content_hash,immutable_revision_hash,created_by)
    values(orv,o,w,e,1,p,1,a,1,'unresolved','timeline','Before.','Existing opportunity','Existing evidence','Before the freeze',3000,repeat('6',64),repeat('7',64),u);
  insert into tongs.reference_visual_plan_membership values(p,w,e,1,0,o,orv,1);
  insert into tongs.reference_visual_plan_sequences values(w,e,p,1,now());
  insert into tongs.unified_visual_plan_operations(operation_id,operation_fingerprint,workspace_id,workpiece_id,script_approval_id,script_approval_revision,script_content_hash,state,normalized_inputs_json,provider_response_json,provider_response_hash,expected_reference_visual_revision_id,expected_reference_visual_revision,created_by,contract_version)
    values('forge:test:creator-supersession',repeat('d',64),w,e,a,1,repeat('1',64),'reference_plan_committed','{}','{"canonical_plan":{}}',repeat('8',64),p,1,u,'forge.unified-visual-plan.v2');
end$$;

set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);

do $$
declare first_result jsonb; replay_result jsonb; conflict_result jsonb; stale_result jsonb; adoption_result jsonb;
begin
  first_result:=tongs.append_reference_visual_opportunity(
    '10000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000003',
    '10000000-0000-0000-0000-000000000005',1,'10000000-0000-0000-0000-000000000004',1,repeat('1',64),
    'archival_sequence','Before.','The Great Freeze of the 1890s nearly erased the industry.','But citrus did not die.',
    jsonb_build_object('span_text','The Great Freeze of the 1890s nearly erased the industry.'),
    'Authentic photographs establish the historical freeze.','Three verified Florida Memory photographs.',
    jsonb_build_array('Florida Memory Great Freeze'),'During the Great Freeze passage',7000,
    'Use an archival sequence','10000000-0000-0000-0000-000000000007',jsonb_build_object('requested_by','creator'),
    'forge:test:reference-visual-amendment',repeat('a',64),'10000000-0000-0000-0000-000000000001');
  if first_result->>'disposition'<>'committed' or (first_result->>'provider_request_performed')::boolean then raise exception 'creator amendment did not commit without provider work: %',first_result;end if;
  if (first_result->>'preserved_opportunity_count')::int<>1 then raise exception 'current membership was not preserved: %',first_result;end if;
  if (first_result->'plan_revision'->>'revision')::int<>2 or first_result->'opportunity_revision'->>'opportunity_origin'<>'creator_added' then raise exception 'immutable successor provenance missing: %',first_result;end if;
  adoption_result:=tongs.adopt_creator_amended_reference_visual_plan('forge:test:creator-supersession',repeat('d',64));
  if adoption_result->>'disposition'<>'creator_amendment_adopted' or adoption_result->>'revision_id'<>first_result#>>'{plan_revision,id}' or adoption_result#>>'{membership_evidence,reference_visual,provider_output_applied}'<>'false' or jsonb_array_length(adoption_result#>'{membership_evidence,reference_visual,creator_added}')<>1 then raise exception 'creator supersession was not adopted safely: %',adoption_result;end if;
  if tongs.adopt_creator_amended_reference_visual_plan('forge:test:creator-supersession',repeat('d',64))->>'revision_id'<>adoption_result->>'revision_id' then raise exception 'creator supersession replay changed identity';end if;
  replay_result:=tongs.append_reference_visual_opportunity('10000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000005',1,'10000000-0000-0000-0000-000000000004',1,repeat('1',64),'archival_sequence','Before.','The Great Freeze of the 1890s nearly erased the industry.','But citrus did not die.','{}','Authentic photographs establish the historical freeze.','Three verified Florida Memory photographs.','[]','During the Great Freeze passage',7000,'Use an archival sequence','10000000-0000-0000-0000-000000000007','{}','forge:test:reference-visual-amendment',repeat('a',64),'10000000-0000-0000-0000-000000000001');
  if replay_result->'opportunity_revision'->>'id'<>first_result->'opportunity_revision'->>'id' then raise exception 'matching replay changed identity';end if;
  conflict_result:=tongs.append_reference_visual_opportunity('10000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000005',1,'10000000-0000-0000-0000-000000000004',1,repeat('1',64),'archival_sequence','','The Great Freeze of the 1890s nearly erased the industry.','','{}','x','y','[]','z',1,null,null,'{}','forge:test:reference-visual-amendment',repeat('b',64),'10000000-0000-0000-0000-000000000001');
  if conflict_result->>'disposition'<>'operation_identity_conflict' then raise exception 'conflicting replay was accepted';end if;
  stale_result:=tongs.append_reference_visual_opportunity('10000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000005',1,'10000000-0000-0000-0000-000000000004',1,repeat('1',64),'timeline','','Before.','','{}','x','y','[]','z',1,null,null,'{}','forge:test:stale-reference-visual-amendment',repeat('c',64),'10000000-0000-0000-0000-000000000001');
  if stale_result->>'disposition'<>'plan_revision_conflict' then raise exception 'stale amendment was accepted: %',stale_result;end if;
end$$;

reset role;
rollback;
