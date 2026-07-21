begin;

insert into auth.users(id,email) values ('11111111-1111-4111-8111-111111111111','authority-test@example.invalid');
insert into tongs.workspaces(id,created_by,name,org_id) values ('22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111','Authority test',(select id from tongs.orgs where personal_owner_user_id='11111111-1111-4111-8111-111111111111'));
insert into tongs.episodes(id,workspace_id,label) values ('33333333-3333-4333-8333-333333333333','22222222-2222-4222-8222-222222222222','Authority episode');

do $test$
declare
  approval jsonb;
  repeated jsonb;
  bootstrap jsonb;
  repaired jsonb;
  unchanged jsonb;
  conflict jsonb;
  approval_id uuid;
  bootstrap_id uuid;
  repaired_id uuid;
  document jsonb;
begin
  approval := tongs.commit_script_approval_snapshot(
    '22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333',0,
    'script/script.md',1,'# Opening\n\nThe orange vanished.','forge.script-approval.v1','v1',
    'forge:script-approval:test:00000001','11111111-1111-4111-8111-111111111111');
  assert approval->>'disposition'='committed';
  approval_id := (approval#>>'{approval,id}')::uuid;
  repeated := tongs.commit_script_approval_snapshot(
    '22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333',1,
    'script/script.md',1,'# Opening\n\nThe orange vanished.','forge.script-approval.v1','v1',
    'forge:script-approval:test:00000002','11111111-1111-4111-8111-111111111111');
  assert repeated->>'disposition'='no_change';

  document := '{"schema":"forge.image-map-authority.v1","entries":[{"id":"moment-1","canonical_anchor_assessment":{"state":"provenance_unknown","reason":"source_provenance_unknown","exact_anchor":null,"evidence":{}}}]}'::jsonb;
  bootstrap := tongs.commit_image_map_revision(
    '22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333',0,null,null,
    'forge.image-map-anchor.v1',document,'commit_image_map',array['moment-1'],'{}','forge.image-map-operation.v1',
    'forge:image-map:test:bootstrap01','11111111-1111-4111-8111-111111111111');
  assert bootstrap->>'disposition'='committed';
  bootstrap_id := (bootstrap#>>'{image_map_revision,id}')::uuid;

  document := '{"schema":"forge.image-map-authority.v1","entries":[{"id":"moment-1","canonical_anchor_assessment":{"state":"current","reason":null,"exact_anchor":{"span_text":"The orange vanished."},"evidence":{"match_count":1}}}]}'::jsonb;
  repaired := tongs.commit_image_map_revision(
    '22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333',1,bootstrap_id,approval_id,
    'forge.image-map-anchor.v1',document,'repair_to_approved_script',array['moment-1'],'{}','forge.image-map-operation.v1',
    'forge:image-map:test:repair0001','11111111-1111-4111-8111-111111111111');
  assert repaired->>'disposition'='committed';
  repaired_id := (repaired#>>'{image_map_revision,id}')::uuid;
  unchanged := tongs.commit_image_map_revision(
    '22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333',2,repaired_id,approval_id,
    'forge.image-map-anchor.v1',document,'reapply_visual_plan',array['moment-1'],'{}','forge.image-map-operation.v1',
    'forge:image-map:test:reapply001','11111111-1111-4111-8111-111111111111');
  assert unchanged->>'disposition'='no_change';
  conflict := tongs.commit_image_map_revision(
    '22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333',1,bootstrap_id,approval_id,
    'forge.image-map-anchor.v1',document,'reapply_visual_plan',array['moment-1'],'{}','forge.image-map-operation.v1',
    'forge:image-map:test:conflict01','11111111-1111-4111-8111-111111111111');
  assert conflict->>'disposition'='revision_conflict';
  assert (select current_revision from tongs.workpiece_image_map_sequences where workpiece_id='33333333-3333-4333-8333-333333333333')=2;
  assert not has_function_privilege('authenticated','tongs.commit_script_approval_snapshot(uuid,uuid,bigint,text,bigint,text,text,text,text,uuid)','execute');
  assert has_function_privilege('service_role','tongs.commit_script_approval_snapshot(uuid,uuid,bigint,text,bigint,text,text,text,text,uuid)','execute');
  assert not has_table_privilege('authenticated','tongs.image_map_revisions','insert');
  begin
    update tongs.script_approval_revisions set creator_version_label='tampered' where id=approval_id;
    raise exception 'immutable approval update unexpectedly succeeded';
  exception when object_not_in_prerequisite_state then null;
  end;
  begin
    delete from tongs.image_map_revisions where id=repaired_id;
    raise exception 'immutable image-map delete unexpectedly succeeded';
  exception when object_not_in_prerequisite_state then null;
  end;
end
$test$;

set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
do $rls$
begin
  assert (select count(*) from tongs.script_approval_revisions where workpiece_id='33333333-3333-4333-8333-333333333333')=1;
  assert (select count(*) from tongs.image_map_revisions where workpiece_id='33333333-3333-4333-8333-333333333333')=2;
  begin
    insert into tongs.workpiece_image_map_sequences(workspace_id,workpiece_id) values ('22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333');
    raise exception 'authenticated direct write unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
end
$rls$;
reset role;

rollback;
