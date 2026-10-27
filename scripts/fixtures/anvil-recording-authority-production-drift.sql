\set ON_ERROR_STOP on
begin;

insert into auth.users(id) values ('15000000-0000-4000-8000-000000000001');
insert into tongs.orgs(id,name,created_by) values
  ('95000000-0000-4000-8000-000000000001','Recording authority upgrade org','15000000-0000-4000-8000-000000000001');
insert into tongs.workspaces(id,name,created_by,org_id) values
  ('a5000000-0000-4000-8000-000000000001','Recording authority upgrade workspace','15000000-0000-4000-8000-000000000001','95000000-0000-4000-8000-000000000001');

insert into tongs.episodes(id,workspace_id,label,created_by,creation_origin)
select ('d5000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'a5000000-0000-4000-8000-000000000001',
  'Recording authority fixture '||n,'15000000-0000-4000-8000-000000000001','recording_venue'
from generate_series(1,7) n;

insert into tongs.recording_capture_authorities(
  id,workspace_id,workpiece_id,operation_key,provenance,established_by,
  venue,script_binding_kind,request_fingerprint
)
select ('c5000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'a5000000-0000-4000-8000-000000000001',
  ('d5000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'authority-operation-'||lpad(n::text,4,'0'),
  'completion_backfill','15000000-0000-4000-8000-000000000001',
  case when n<=2 then 'anvil' else 'bellows' end,'none',md5('authority-'||n)
from generate_series(1,7) n;

insert into tongs.anvil_capture_executions(execution_id,recording_capture_authority_id,operation_key,anvil_version,created_by)
select ('f5000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,('c5000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
  'authority-operation-'||lpad(n::text,4,'0'),'1.8.5','15000000-0000-4000-8000-000000000001'
from generate_series(1,2) n;

insert into tongs.workpiece_files(
  workpiece_id,path,file_type,content_type,bytes,hash_value,storage_key,
  written_by_tool,written_by_tool_version,written_by_lane
)
select ('d5000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'recordings/authority-'||n||'.webm','recording',
  'video/webm',8192+n,repeat(substr('abcdef0',n,1),64),
  'workpieces/d5000000-0000-4000-8000-'||lpad(n::text,12,'0')||'/recordings/authority-'||n||'.webm',
  'recording','fixture','forge-managed'
from generate_series(1,7) n;

insert into tongs.recording_media_verification_receipts(
  id,workspace_id,workpiece_id,recording_capture_authority_id,media_path,media_revision,media_hash,
  media_bytes,media_content_type,storage_bucket,storage_key,duration_ms,has_audio_stream,has_video_stream,
  probe_implementation,verification_evidence,verified_by
)
select ('b5100000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'a5000000-0000-4000-8000-000000000001',
  ('d5000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,('c5000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
  'recordings/authority-'||n||'.webm',1,repeat(substr('abcdef0',n,1),64),8192+n,'video/webm','forge-workpieces',
  'workpieces/d5000000-0000-4000-8000-'||lpad(n::text,12,'0')||'/recordings/authority-'||n||'.webm',
  15000,true,true,'ffprobe:production-drift','{"fixture":true}'::jsonb,'15000000-0000-4000-8000-000000000001'
from generate_series(1,7) n;

insert into tongs.anvil_recording_completion_requests(
  id,workspace_id,workpiece_id,capture_session_id,capture_authority_id,media_path,media_revision,media_hash,
  media_bytes,media_content_type,storage_bucket,storage_key,idempotency_key,request_fingerprint,
  completion_evidence,completed_by,media_verification_receipt_id
)
select ('e5000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'a5000000-0000-4000-8000-000000000001',
  ('d5000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
  case when n<=2 then ('f5000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid else null end,
  ('c5000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'recordings/authority-'||n||'.webm',1,
  repeat(substr('abcdef0',n,1),64),8192+n,'video/webm','forge-workpieces',
  'workpieces/d5000000-0000-4000-8000-'||lpad(n::text,12,'0')||'/recordings/authority-'||n||'.webm',
  'completion-operation-'||lpad(n::text,4,'0'),md5('completion-'||n),
  jsonb_build_object('schema','forge.recording-completion.v2','completed',true,
    'recording_capture_authority_id','c5000000-0000-4000-8000-'||lpad(n::text,12,'0')),
  '15000000-0000-4000-8000-000000000001',('b5100000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid
from generate_series(1,7) n;

insert into tongs.anvil_recording_keep_requests(
  id,workspace_id,workpiece_id,capture_session_id,completion_id,
  idempotency_key,request_fingerprint,decision_evidence,kept_by
) values (
  'b5200000-0000-4000-8000-000000000001','a5000000-0000-4000-8000-000000000001',
  'd5000000-0000-4000-8000-000000000001','f5000000-0000-4000-8000-000000000001',
  'e5000000-0000-4000-8000-000000000001',
  'legacy-keep-operation-0001',md5('legacy-keep-fingerprint'),
  '{"decision":"keep","completion_id":"e5000000-0000-4000-8000-000000000001","recording_capture_authority_id":"c5000000-0000-4000-8000-000000000001"}'::jsonb,
  '15000000-0000-4000-8000-000000000001'
);
insert into tongs.anvil_recording_discard_requests(
  id,workspace_id,workpiece_id,capture_session_id,completion_id,
  idempotency_key,request_fingerprint,decision_evidence,discarded_by
) values (
  'b5200000-0000-4000-8000-000000000002','a5000000-0000-4000-8000-000000000001',
  'd5000000-0000-4000-8000-000000000002','f5000000-0000-4000-8000-000000000002',
  'e5000000-0000-4000-8000-000000000002',
  'legacy-discard-operation-0001',md5('legacy-discard-fingerprint'),
  '{"decision":"discard","completion_id":"e5000000-0000-4000-8000-000000000002","recording_capture_authority_id":"c5000000-0000-4000-8000-000000000002"}'::jsonb,
  '15000000-0000-4000-8000-000000000001'
);

create table public.recording_authority_upgrade_preimage as
select 'keep'::text kind,id,to_jsonb(k.*) receipt from tongs.anvil_recording_keep_requests k
union all
select 'discard',id,to_jsonb(d.*) from tongs.anvil_recording_discard_requests d;

drop trigger if exists trg_recording_completion_immutable on tongs.anvil_recording_completion_requests;
drop trigger if exists trg_recording_keep_immutable on tongs.anvil_recording_keep_requests;
drop trigger if exists trg_recording_discard_immutable on tongs.anvil_recording_discard_requests;
alter table tongs.anvil_recording_keep_requests alter column capture_session_id set not null;
alter table tongs.anvil_recording_discard_requests alter column capture_session_id set not null;

commit;
