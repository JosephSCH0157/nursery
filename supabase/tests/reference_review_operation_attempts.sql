begin;

do $$ declare
  editor_id constant uuid := '13000000-0000-0000-0000-000000000001';
  viewer_id constant uuid := '13000000-0000-0000-0000-000000000002';
  outsider_id constant uuid := '13000000-0000-0000-0000-000000000003';
  workspace_id constant uuid := '13000000-0000-0000-0000-000000000010';
  foreign_workspace_id constant uuid := '13000000-0000-0000-0000-000000000011';
  workpiece_id constant uuid := '13000000-0000-0000-0000-000000000020';
  foreign_workpiece_id constant uuid := '13000000-0000-0000-0000-000000000021';
  org_id uuid;
begin
  insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
  values
    (editor_id,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','reference-editor@example.test','',now(),now(),now()),
    (viewer_id,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','reference-viewer@example.test','',now(),now(),now()),
    (outsider_id,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','reference-outsider@example.test','',now(),now(),now());
  insert into tongs.orgs(name) values('Reference review attempt DB test') returning id into org_id;
  insert into tongs.workspaces(id,created_by,name,org_id) values
    (workspace_id,editor_id,'Reference review attempt DB test',org_id),
    (foreign_workspace_id,outsider_id,'Foreign reference review DB test',org_id);
  insert into tongs.workspace_members(workspace_id,user_id,role,created_by) values
    (workspace_id,viewer_id,'viewer',editor_id);
  insert into tongs.episodes(id,workspace_id,label) values
    (workpiece_id,workspace_id,'Reference review attempt DB test'),
    (foreign_workpiece_id,foreign_workspace_id,'Foreign reference review DB test');
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub','13000000-0000-0000-0000-000000000001',true);

do $$ declare started jsonb; replay jsonb; conflict jsonb;
begin
  started := tongs.begin_reference_review_operation_attempt(
    '13000000-0000-0000-0000-000000000010','13000000-0000-0000-0000-000000000020',
    'forge:test:reference-review:approve',repeat('a',64),'reference_visual','approve',
    '13000000-0000-0000-0000-000000000030','13000000-0000-0000-0000-000000000031',
    '13000000-0000-0000-0000-000000000032','{}'::jsonb,null,'not_applicable');
  if started->>'disposition'<>'started' then raise exception 'editor could not create attempt: %',started; end if;
  replay := tongs.begin_reference_review_operation_attempt(
    '13000000-0000-0000-0000-000000000010','13000000-0000-0000-0000-000000000020',
    'forge:test:reference-review:approve',repeat('a',64),'reference_visual','approve',
    '13000000-0000-0000-0000-000000000030','13000000-0000-0000-0000-000000000031',
    '13000000-0000-0000-0000-000000000032','{}'::jsonb,null,'not_applicable');
  if replay->>'disposition'<>'existing' then raise exception 'same attempt did not replay'; end if;
  conflict := tongs.begin_reference_review_operation_attempt(
    '13000000-0000-0000-0000-000000000010','13000000-0000-0000-0000-000000000020',
    'forge:test:reference-review:approve',repeat('b',64),'reference_visual','approve',
    '13000000-0000-0000-0000-000000000030','13000000-0000-0000-0000-000000000031',
    '13000000-0000-0000-0000-000000000032','{}'::jsonb,null,'not_applicable');
  if conflict->>'disposition'<>'operation_identity_conflict' then raise exception 'operation id reuse did not fail closed'; end if;
end $$;

select set_config('request.jwt.claim.sub','13000000-0000-0000-0000-000000000002',true);
do $$ begin
  if (select count(*) from tongs.reference_review_operation_attempts)<>1 then raise exception 'viewer cannot read workspace attempt'; end if;
  begin
    perform tongs.begin_reference_review_operation_attempt(
      '13000000-0000-0000-0000-000000000010','13000000-0000-0000-0000-000000000020',
      'forge:test:viewer-create-denied',repeat('c',64),'reference_visual','skip',
      '13000000-0000-0000-0000-000000000030','13000000-0000-0000-0000-000000000031',
      '13000000-0000-0000-0000-000000000032');
    raise exception 'viewer unexpectedly created an attempt';
  exception when insufficient_privilege then null; end;
  begin
    perform tongs.finish_reference_review_operation_attempt(
      (select attempt_id from tongs.reference_review_operation_attempts limit 1),'failed','denied','denied',null);
    raise exception 'authenticated caller unexpectedly advanced an attempt';
  exception when insufficient_privilege then null; end;
end $$;

select set_config('request.jwt.claim.sub','13000000-0000-0000-0000-000000000003',true);
do $$ begin
  if exists(select 1 from tongs.reference_review_operation_attempts) then raise exception 'workspace isolation failed'; end if;
end $$;

reset role;
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
do $$ declare result jsonb; attempt uuid;
begin
  select attempt_id into attempt from tongs.reference_review_operation_attempts;
  result := tongs.finish_reference_review_operation_attempt(attempt,'failed','expected_failure','Synthetic terminal failure',null);
  if result->>'disposition'<>'failed' then raise exception 'service could not finish attempt: %',result; end if;
  begin
    update tongs.reference_review_operation_attempts set failure_message='mutated' where attempt_id=attempt;
    raise exception 'terminal attempt update unexpectedly succeeded';
  exception when sqlstate '55000' then null; end;
end $$;

rollback;
