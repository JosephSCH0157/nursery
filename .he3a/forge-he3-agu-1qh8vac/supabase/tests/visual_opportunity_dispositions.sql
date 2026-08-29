begin;

do $$ declare
  u constant uuid:='12000000-0000-0000-0000-000000000001'; w constant uuid:='12000000-0000-0000-0000-000000000002';
  e constant uuid:='12000000-0000-0000-0000-000000000003'; a constant uuid:='12000000-0000-0000-0000-000000000004';
  p constant uuid:='12000000-0000-0000-0000-000000000005'; o constant uuid:='12000000-0000-0000-0000-000000000006';
  orv constant uuid:='12000000-0000-0000-0000-000000000007'; org_id uuid;
begin
  insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
    values(u,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','visual-disposition@example.test','',now(),now(),now());
  insert into tongs.orgs(name) values('Visual disposition DB test') returning id into org_id;
  insert into tongs.workspaces(id,created_by,name,org_id) values(w,u,'Visual disposition DB test',org_id);
  insert into tongs.episodes(id,workspace_id,label) values(e,w,'Visual disposition DB test');
  insert into tongs.script_approval_revisions(id,workspace_id,workpiece_id,approval_revision,source_file_path,source_file_revision,script_content_hash,semantic_state_hash,immutable_revision_hash,script_text,approval_contract_version,created_by)
    values(a,w,e,1,'script/script.md',1,repeat('1',64),repeat('2',64),repeat('3',64),'A copyrighted example appears here.','test.v1',u);
  insert into tongs.workpiece_script_approval_sequences(workspace_id,workpiece_id,current_approval_id,current_revision) values(w,e,a,1);
  insert into tongs.reference_visual_plan_revisions(id,workspace_id,workpiece_id,revision,script_approval_id,script_approval_revision,script_content_hash,contract_version,content_hash,immutable_revision_hash,created_by)
    values(p,w,e,1,a,1,repeat('1',64),'test.v1',repeat('4',64),repeat('5',64),u);
  insert into tongs.reference_visual_opportunity_revisions(id,opportunity_id,workspace_id,workpiece_id,revision,source_plan_revision_id,source_plan_revision,script_approval_id,script_approval_revision,source_status,visual_subtype,context_focus,editorial_reason,desired_material,placement_hint,duration_target_ms,content_hash,immutable_revision_hash,created_by)
    values(orv,o,w,e,1,p,1,a,1,'unresolved','archival_still','A copyrighted example appears here.','Illustrate the example','Licensed still','At the phrase',3000,repeat('6',64),repeat('7',64),u);
  insert into tongs.reference_visual_plan_membership values(p,w,e,1,0,o,orv,1);
  insert into tongs.reference_visual_plan_sequences values(w,e,p,1,now());
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub','12000000-0000-0000-0000-000000000001',true);

do $$ declare skipped jsonb; replay jsonb; conflict jsonb; restored jsonb; first_id text;
begin
  skipped:=tongs.set_visual_opportunity_disposition(
    '12000000-0000-0000-0000-000000000002','12000000-0000-0000-0000-000000000003','reference_visual',
    '12000000-0000-0000-0000-000000000006','12000000-0000-0000-0000-000000000007',
    '12000000-0000-0000-0000-000000000005',1,null,0,'skipped','rights_unavailable','Could not license this material.',
    'forge:test:visual-disposition:skip',repeat('a',64),'12000000-0000-0000-0000-000000000001');
  if skipped->>'disposition'<>'committed' then raise exception 'skip failed: %',skipped; end if;
  first_id:=skipped#>>'{disposition_revision,id}';
  replay:=tongs.set_visual_opportunity_disposition('12000000-0000-0000-0000-000000000002','12000000-0000-0000-0000-000000000003','reference_visual','12000000-0000-0000-0000-000000000006','12000000-0000-0000-0000-000000000007','12000000-0000-0000-0000-000000000005',1,null,0,'skipped','rights_unavailable','Could not license this material.','forge:test:visual-disposition:skip',repeat('a',64),'12000000-0000-0000-0000-000000000001');
  if replay#>>'{disposition_revision,id}'<>first_id then raise exception 'replay changed identity'; end if;
  conflict:=tongs.set_visual_opportunity_disposition('12000000-0000-0000-0000-000000000002','12000000-0000-0000-0000-000000000003','reference_visual','12000000-0000-0000-0000-000000000006','12000000-0000-0000-0000-000000000007','12000000-0000-0000-0000-000000000005',1,first_id::uuid,1,'skipped','other','Different intent.','forge:test:visual-disposition:skip',repeat('b',64),'12000000-0000-0000-0000-000000000001');
  if conflict->>'disposition'<>'operation_identity_conflict' then raise exception 'conflicting replay accepted'; end if;
  restored:=tongs.set_visual_opportunity_disposition('12000000-0000-0000-0000-000000000002','12000000-0000-0000-0000-000000000003','reference_visual','12000000-0000-0000-0000-000000000006','12000000-0000-0000-0000-000000000007','12000000-0000-0000-0000-000000000005',1,first_id::uuid,1,'active',null,null,'forge:test:visual-disposition:restore',repeat('c',64),'12000000-0000-0000-0000-000000000001');
  if restored#>>'{disposition_revision,revision}'<>'2' or restored#>>'{disposition_revision,previous_revision_id}'<>first_id then raise exception 'restore history invalid: %',restored; end if;
  if (tongs.read_visual_opportunity_dispositions('12000000-0000-0000-0000-000000000002','12000000-0000-0000-0000-000000000003')#>>'{dispositions,0,disposition}')<>'active' then raise exception 'current readback did not restore'; end if;
  if (select count(*) from tongs.visual_opportunity_disposition_revisions where opportunity_id='12000000-0000-0000-0000-000000000006')<>2 then raise exception 'history was not preserved'; end if;
end $$;

reset role;

do $$ begin
  begin
    update tongs.visual_opportunity_disposition_revisions set creator_note='mutated' where operation_id='forge:test:visual-disposition:skip';
    raise exception 'immutable revision update unexpectedly succeeded';
  exception when sqlstate '55000' then null; end;
end $$;

rollback;
