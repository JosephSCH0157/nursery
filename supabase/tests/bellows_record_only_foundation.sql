begin;

select plan(1);

do $$ declare
  test_user constant uuid := '15000000-0000-0000-0000-000000000001';
  test_workspace constant uuid := '15000000-0000-0000-0000-000000000002';
  test_workpiece constant uuid := '15000000-0000-0000-0000-000000000003';
  test_org uuid;
begin
  insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
    values(test_user,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','bellows-record-only@example.test','',now(),now(),now());
  insert into tongs.orgs(name) values('Bellows record-only contract test') returning id into test_org;
  insert into tongs.workspaces(id,created_by,name,org_id) values(test_workspace,test_user,'Bellows record-only contract test',test_org);
  insert into tongs.workspace_members(workspace_id,user_id,role) values(test_workspace,test_user,'editor')
    on conflict(workspace_id,user_id) do update set role=excluded.role;
  insert into tongs.episodes(id,workspace_id,label) values(test_workpiece,test_workspace,'Bellows recovered recording');
  insert into tongs.bellows_sessions(
    id,workspace_id,host_user_id,title,mode,session_type,acting_authority_state,
    host_participant_id,acting_host_participant_id,lifecycle_state,recording_state,
    broadcast_state,upload_state,seal_state
  ) values (
    'bellows-test-session',test_workspace,test_user::text,'Bellows test','record_only','solo','host_present',
    'bellows-test-participant','bellows-test-participant','recording_active','active',
    'not_broadcasting','uploading','not_started'
  );
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub','15000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);

do $$ declare
  segment tongs.bellows_segments;
  replay tongs.bellows_upload_parts;
begin
  segment := tongs.register_bellows_capture_segment(
    'bellows-test-session','bellows-test-participant','bellows-test-track','bellows-test-segment',
    1,'initial','video/webm','{"browser":"Chrome"}'::jsonb,now(),0
  );
  if segment.integrity_state <> 'pending' then raise exception 'new segment was not pending'; end if;

  replay := tongs.register_bellows_upload_part(
    'bellows-test-session','bellows-test-participant','bellows-test-segment','bellows-test-part-0',
    0,12,repeat('a',64),'15000000-0000-0000-0000-000000000002/bellows-test-session/bellows-test-participant/bellows-test-segment/parts/0.webm'
  );
  replay := tongs.register_bellows_upload_part(
    'bellows-test-session','bellows-test-participant','bellows-test-segment','bellows-test-part-0',
    0,12,repeat('a',64),'15000000-0000-0000-0000-000000000002/bellows-test-session/bellows-test-participant/bellows-test-segment/parts/0.webm'
  );
  if replay.sequence_number <> 0 then raise exception 'idempotent replay changed the part'; end if;

  begin
    perform tongs.register_bellows_upload_part(
      'bellows-test-session','bellows-test-participant','bellows-test-segment','bellows-test-part-0',
      0,13,repeat('b',64),'15000000-0000-0000-0000-000000000002/bellows-test-session/bellows-test-participant/bellows-test-segment/parts/0.webm'
    );
    raise exception 'conflicting replay unexpectedly succeeded';
  exception when others then
    if sqlerrm <> 'bellows_upload_part_identity_conflict' then raise; end if;
  end;

  perform tongs.confirm_bellows_upload_part('bellows-test-part-0',repeat('a',64));

  begin
    perform tongs.verify_bellows_capture_segment(
      'bellows-test-segment',1,12,repeat('c',64),
      '15000000-0000-0000-0000-000000000002/bellows-test-session/bellows-test-participant/bellows-test-segment/segment.webm',
      now(),1000
    );
    raise exception 'missing canonical media unexpectedly verified';
  exception when others then
    if sqlerrm <> 'bellows_canonical_segment_missing' then raise; end if;
  end;
end $$;

reset role;

insert into storage.objects(bucket_id,name,owner_id,metadata)
values(
  'bellows-capture',
  '15000000-0000-0000-0000-000000000002/bellows-test-session/bellows-test-participant/bellows-test-segment/segment.webm',
  '15000000-0000-0000-0000-000000000001',
  '{"size":12}'::jsonb
);

set local role authenticated;
select set_config('request.jwt.claim.sub','15000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);

do $$ declare package tongs.bellows_capture_packages;
begin
  perform tongs.verify_bellows_capture_segment(
    'bellows-test-segment',1,12,repeat('c',64),
    '15000000-0000-0000-0000-000000000002/bellows-test-session/bellows-test-participant/bellows-test-segment/segment.webm',
    now(),1000
  );

  begin
    perform tongs.seal_complete_bellows_capture(
      'bellows-test-session',2,'15000000-0000-0000-0000-000000000003','{"segments":[]}'::jsonb,repeat('d',64)
    );
    raise exception 'stale authority unexpectedly sealed';
  exception when others then
    if sqlerrm <> 'bellows_stale_authority_generation' then raise; end if;
  end;

  package := tongs.seal_complete_bellows_capture(
    'bellows-test-session',1,'15000000-0000-0000-0000-000000000003','{"segments":["bellows-test-segment"]}'::jsonb,repeat('d',64)
  );
  if package.outcome <> 'sealed' or package.hammer_handoff_id <> 'bellows:bellows-test-session' then
    raise exception 'complete package was not sealed for Hammer';
  end if;
end $$;

reset role;

do $$ begin
  begin
    update tongs.bellows_capture_packages set manifest='{}'::jsonb where session_id='bellows-test-session';
    raise exception 'sealed package mutation unexpectedly succeeded';
  exception when sqlstate '55000' then null; end;
end $$;

select pass('Bellows record-only persistence, verification, authority, sealing, and immutability contracts hold');
select * from finish();

rollback;
