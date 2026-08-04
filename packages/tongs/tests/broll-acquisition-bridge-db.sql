\set ON_ERROR_STOP on
begin;
set local request.jwt.claims='{"sub":"1f2b06bd-05a8-4f4b-9b23-9c57b09d3237","role":"authenticated"}';
set local role authenticated;
do $reserve$
declare v jsonb;
begin
 v:=tongs.begin_broll_operation('08dd1d8d-3e03-447e-8edd-820564a32ba3','6505ce4f-a985-4387-9d8a-0e9323468489','32000000-0000-4000-8000-000000000099','candidate_acquire','forge:broll:bridge-db-replay-0001',repeat('a',64),'{"poster_required":true}','1f2b06bd-05a8-4f4b-9b23-9c57b09d3237');
 if v->>'disposition'<>'reserved' then raise exception 'reserve failed %',v; end if;
 perform tongs.record_broll_provider_or_upload_result('forge:broll:bridge-db-replay-0001',repeat('a',64),'{"storage_key":"workpieces/test/video.mp4"}');
end $reserve$;
reset role;
set local request.jwt.claims='{"role":"service_role"}';
set local role service_role;
do $service$
declare v jsonb; asset_id uuid;
begin
 v:=tongs.commit_broll_operation_asset('forge:broll:bridge-db-replay-0001',repeat('a',64),'broll_candidate_video','assets/broll-v2/test/video.mp4','video/mp4',1024,repeat('b',64),'forge-workpieces','workpieces/test/video.mp4',1920,1080,5000,'test-provider','provider-1');
 if v->>'disposition'<>'video_asset_verified' then raise exception 'video commit failed %',v; end if;
 asset_id:=(v#>>'{asset,id}')::uuid;
 v:=tongs.commit_broll_operation_asset('forge:broll:bridge-db-replay-0001',repeat('a',64),'broll_candidate_video','assets/broll-v2/test/video.mp4','video/mp4',1024,repeat('b',64),'forge-workpieces','workpieces/test/video.mp4',1920,1080,5000,'test-provider','provider-1');
 if v->>'disposition'<>'replay' or (v#>>'{asset,id}')::uuid<>asset_id then raise exception 'video replay identity changed %',v; end if;
 v:=tongs.commit_broll_operation_asset('forge:broll:bridge-db-replay-0001',repeat('a',64),'broll_candidate_video','assets/broll-v2/test/video.mp4','video/mp4',1024,repeat('c',64),'forge-workpieces','workpieces/test/video.mp4',1920,1080,5000,'test-provider','provider-1');
 if v->>'disposition'<>'asset_replay_conflict' then raise exception 'conflicting replay accepted %',v; end if;
 v:=tongs.commit_broll_operation_asset('forge:broll:bridge-db-replay-0001',repeat('a',64),'broll_candidate_poster','assets/broll-v2/test/poster.jpg','image/jpeg',512,repeat('d',64),'forge-workpieces','workpieces/test/poster.jpg',640,360,null,'tongs-poster','poster-1');
 if v->>'disposition'<>'poster_asset_verified' then raise exception 'poster commit failed %',v; end if;
 if (select count(*) from tongs.assets where operation_id='forge:broll:bridge-db-replay-0001')<>2 then raise exception 'asset replay duplicated rows'; end if;
end $service$;
reset role;
rollback;
