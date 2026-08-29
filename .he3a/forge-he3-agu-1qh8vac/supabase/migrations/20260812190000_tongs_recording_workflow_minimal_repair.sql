begin;

alter table tongs.anvil_recording_completion_requests
  alter column ready_transition_id drop not null,
  add column if not exists script_path text,
  add column if not exists media_bytes bigint,
  add column if not exists media_content_type text,
  add column if not exists storage_bucket text,
  add column if not exists storage_key text,
  add column if not exists recording_session_id uuid;

update tongs.anvil_recording_completion_requests
set script_path = coalesce(nullif(completion_evidence->>'script_path', ''), 'script.json'),
    media_bytes = coalesce(media_bytes, nullif(completion_evidence#>>'{artifact_validation,bytes}', '')::bigint),
    media_content_type = coalesce(media_content_type, nullif(completion_evidence#>>'{artifact_validation,content_type}', '')),
    storage_bucket = coalesce(storage_bucket, nullif(completion_evidence#>>'{artifact_validation,storage_bucket}', ''), 'forge-workpieces'),
    storage_key = coalesce(storage_key, nullif(completion_evidence#>>'{artifact_validation,storage_key}', ''))
where script_path is null or media_bytes is null or media_content_type is null or storage_bucket is null or storage_key is null;

create table tongs.hammer_recording_import_requests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references tongs.workspaces(id) on delete cascade,
  workpiece_id uuid not null references tongs.episodes(id) on delete cascade,
  operation_id uuid not null,
  request_fingerprint text not null check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  state text not null check (state in ('reserved','uploaded','verified','committed','recoverable_failure')),
  media_path text not null check (media_path ~ '^recordings/imports/[^/]+/[0-9a-f]{64}\.[a-z0-9]+$'),
  original_filename text not null,
  expected_media_hash text not null check (expected_media_hash ~ '^[0-9a-f]{64}$'),
  expected_media_bytes bigint not null check (expected_media_bytes > 0),
  expected_media_content_type text not null,
  verified_media_hash text,
  verified_media_bytes bigint,
  verified_media_content_type text,
  storage_bucket text not null,
  storage_key text not null,
  media_revision bigint,
  hammer_version text not null,
  provenance jsonb not null default '{}'::jsonb,
  failure_stage text,
  failure_code text,
  failure_details jsonb,
  manifest_projected_at timestamptz,
  manifest_projection_error jsonb,
  imported_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  committed_at timestamptz,
  unique (workspace_id, operation_id)
);

create unique index hammer_recording_import_committed_hash_idx
  on tongs.hammer_recording_import_requests(workspace_id, workpiece_id, verified_media_hash)
  where state = 'committed';
create index hammer_recording_import_workpiece_created_idx
  on tongs.hammer_recording_import_requests(workspace_id, workpiece_id, created_at desc);

create trigger trg_hammer_recording_import_updated_at
before update on tongs.hammer_recording_import_requests
for each row execute function tongs.set_updated_at();

alter table tongs.hammer_recording_import_requests enable row level security;
create policy hammer_recording_import_select_if_workspace_viewer
on tongs.hammer_recording_import_requests for select to authenticated
using (tongs.has_workspace_role(workspace_id, 'viewer'));
revoke insert, update, delete on tongs.hammer_recording_import_requests from authenticated;
grant select on tongs.hammer_recording_import_requests to authenticated;
grant all on tongs.hammer_recording_import_requests to service_role;

create or replace function tongs.anvil_transition_take_completed_v2(
  p_workspace_id uuid, p_workpiece_id uuid, p_capture_session_id uuid,
  p_recording_session_id uuid, p_script_path text, p_expected_script_revision bigint,
  p_expected_script_hash text, p_media_path text, p_expected_media_revision bigint,
  p_expected_media_hash text, p_expected_media_bytes bigint, p_expected_media_content_type text,
  p_storage_bucket text, p_storage_key text, p_idempotency_key text, p_completion_evidence jsonb
) returns jsonb
language plpgsql security definer set search_path = pg_catalog, tongs as $$
declare
  v_user uuid := auth.uid(); v_key text := btrim(coalesce(p_idempotency_key,''));
  v_script_path text := btrim(coalesce(p_script_path,'')); v_media_path text := btrim(coalesce(p_media_path,''));
  v_script_hash text := lower(btrim(coalesce(p_expected_script_hash,'')));
  v_media_hash text := lower(btrim(coalesce(p_expected_media_hash,'')));
  v_content_type text := lower(btrim(coalesce(p_expected_media_content_type,'')));
  v_fingerprint text; v_existing tongs.anvil_recording_completion_requests%rowtype;
  v_media record; v_script record; v_saved tongs.anvil_recording_completion_requests%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text || ':' || v_key, 0));
  if v_user is null or not tongs.has_workspace_role(p_workspace_id, 'editor') then
    return jsonb_build_object('outcome','denied','completion',null);
  end if;
  if not exists(select 1 from tongs.episodes where id=p_workpiece_id and workspace_id=p_workspace_id) then
    return jsonb_build_object('outcome','not_found','completion',null);
  end if;
  if length(v_key) not between 8 and 200 or v_script_path = '' or v_media_path = ''
     or v_script_hash !~ '^[0-9a-f]{64}$' or v_media_hash !~ '^[0-9a-f]{64}$'
     or p_expected_media_bytes <= 0 or v_content_type = ''
     or p_completion_evidence is null or jsonb_typeof(p_completion_evidence) <> 'object'
     or p_completion_evidence->>'schema' <> 'anvil.recording-completion.v2'
     or p_completion_evidence->>'capture_session_id' is distinct from p_capture_session_id::text
     or coalesce((p_completion_evidence#>>'{artifact_validation,ok}')::boolean,false) is not true
     or lower(coalesce(p_completion_evidence#>>'{artifact_validation,sha256}','')) <> v_media_hash then
    return jsonb_build_object('outcome','conflict','completion',null,'reason','invalid_completion_evidence');
  end if;
  select revision, lower(hash_value) hash_value into v_script from tongs.workpiece_files
    where workpiece_id=p_workpiece_id and path=v_script_path;
  if not found then return jsonb_build_object('outcome','not_found','completion',null,'reason','script_not_found'); end if;
  if v_script.revision <> p_expected_script_revision or v_script.hash_value <> v_script_hash then
    return jsonb_build_object('outcome','stale','completion',null,'reason','script_contract_mismatch');
  end if;
  select revision, lower(hash_value) hash_value, bytes, lower(content_type) content_type, storage_bucket, storage_key
    into v_media from tongs.workpiece_files where workpiece_id=p_workpiece_id and path=v_media_path;
  if not found then return jsonb_build_object('outcome','not_found','completion',null,'reason','media_not_found'); end if;
  if v_media.revision <> p_expected_media_revision or v_media.hash_value <> v_media_hash
     or v_media.bytes <> p_expected_media_bytes or v_media.content_type <> v_content_type
     or v_media.storage_bucket <> p_storage_bucket or v_media.storage_key <> p_storage_key then
    return jsonb_build_object('outcome','stale','completion',null,'reason','media_contract_mismatch');
  end if;
  v_fingerprint := md5(concat_ws('|',p_workspace_id,p_workpiece_id,p_capture_session_id,p_recording_session_id,
    v_script_path,p_expected_script_revision,v_script_hash,v_media_path,p_expected_media_revision,v_media_hash,
    p_expected_media_bytes,v_content_type,p_storage_bucket,p_storage_key,p_completion_evidence::text));
  select * into v_existing from tongs.anvil_recording_completion_requests
    where workspace_id=p_workspace_id and idempotency_key=v_key;
  if found then
    if v_existing.request_fingerprint=v_fingerprint then return jsonb_build_object('outcome','duplicate','completion',to_jsonb(v_existing)); end if;
    return jsonb_build_object('outcome','conflict','completion',null,'reason','idempotency_key_reused');
  end if;
  select * into v_existing from tongs.anvil_recording_completion_requests
    where workspace_id=p_workspace_id and workpiece_id=p_workpiece_id and capture_session_id=p_capture_session_id;
  if found then
    if v_existing.request_fingerprint=v_fingerprint then return jsonb_build_object('outcome','duplicate','completion',to_jsonb(v_existing)); end if;
    return jsonb_build_object('outcome','conflict','completion',null,'reason','capture_session_reused');
  end if;
  insert into tongs.anvil_recording_completion_requests(workspace_id,workpiece_id,capture_session_id,
    ready_transition_id,script_path,script_revision,script_hash,media_path,media_revision,media_hash,media_bytes,
    media_content_type,storage_bucket,storage_key,recording_session_id,idempotency_key,request_fingerprint,
    completion_evidence,completed_by)
  values(p_workspace_id,p_workpiece_id,p_capture_session_id,null,v_script_path,p_expected_script_revision,v_script_hash,
    v_media_path,p_expected_media_revision,v_media_hash,p_expected_media_bytes,v_content_type,p_storage_bucket,p_storage_key,
    p_recording_session_id,v_key,v_fingerprint,p_completion_evidence,v_user) returning * into v_saved;
  perform set_config('tongs.recording_authority_rpc','on',true);
  insert into tongs.workpiece_events(workpiece_id,event_name,payload,correlation_id,written_by_tool,written_by_tool_version,written_by_lane)
  values(p_workpiece_id,'take_completed',jsonb_build_object('authority_schema','anvil.recording-completion.v2',
    'completion_id',v_saved.id,'workspace_id',p_workspace_id,'capture_session_id',p_capture_session_id,
    'script_path',v_script_path,'script_revision',p_expected_script_revision,'script_hash',v_script_hash,
    'file_path',v_media_path,'media_revision',p_expected_media_revision,'media_hash',v_media_hash),
    v_key,'anvil',coalesce(p_completion_evidence->>'anvil_version','unknown'),'forge-managed');
  return jsonb_build_object('outcome','saved','completion',to_jsonb(v_saved));
end; $$;

create or replace function tongs.reserve_hammer_recording_import(
  p_workspace_id uuid, p_workpiece_id uuid, p_operation_id uuid, p_request_fingerprint text,
  p_media_path text, p_original_filename text, p_expected_media_hash text, p_expected_media_bytes bigint,
  p_expected_media_content_type text, p_storage_bucket text, p_storage_key text, p_hammer_version text,
  p_provenance jsonb
) returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $$
declare v_user uuid:=auth.uid(); v_existing tongs.hammer_recording_import_requests%rowtype; v_saved tongs.hammer_recording_import_requests%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text||':'||p_operation_id::text,0));
  if v_user is null or not tongs.has_workspace_role(p_workspace_id,'editor') then return jsonb_build_object('outcome','denied','import',null); end if;
  if not exists(select 1 from tongs.episodes where id=p_workpiece_id and workspace_id=p_workspace_id) then return jsonb_build_object('outcome','not_found','import',null); end if;
  select * into v_existing from tongs.hammer_recording_import_requests where workspace_id=p_workspace_id and operation_id=p_operation_id;
  if found then
    if v_existing.request_fingerprint=p_request_fingerprint then return jsonb_build_object('outcome',case when v_existing.state='committed' then 'duplicate' else 'resumable' end,'import',to_jsonb(v_existing)); end if;
    return jsonb_build_object('outcome','conflict','reason','operation_id_reused','import',null);
  end if;
  select * into v_existing from tongs.hammer_recording_import_requests
    where workspace_id=p_workspace_id and workpiece_id=p_workpiece_id and state='committed'
      and verified_media_hash=lower(p_expected_media_hash) limit 1;
  if found then return jsonb_build_object('outcome','duplicate','import',to_jsonb(v_existing)); end if;
  insert into tongs.hammer_recording_import_requests(workspace_id,workpiece_id,operation_id,request_fingerprint,state,
    media_path,original_filename,expected_media_hash,expected_media_bytes,expected_media_content_type,storage_bucket,
    storage_key,hammer_version,provenance,imported_by)
  values(p_workspace_id,p_workpiece_id,p_operation_id,lower(p_request_fingerprint),'reserved',p_media_path,p_original_filename,
    lower(p_expected_media_hash),p_expected_media_bytes,lower(p_expected_media_content_type),p_storage_bucket,p_storage_key,
    p_hammer_version,coalesce(p_provenance,'{}'::jsonb),v_user) returning * into v_saved;
  return jsonb_build_object('outcome','reserved','import',to_jsonb(v_saved));
end; $$;

create or replace function tongs.finalize_hammer_recording_import(
  p_import_id uuid, p_verified_media_hash text, p_verified_media_bytes bigint, p_verified_media_content_type text
) returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $$
declare v_user uuid:=auth.uid(); v_import tongs.hammer_recording_import_requests%rowtype;
  v_duplicate tongs.hammer_recording_import_requests%rowtype; v_revision bigint; v_event_id bigint;
begin
  select * into v_import from tongs.hammer_recording_import_requests where id=p_import_id for update;
  if not found then return jsonb_build_object('outcome','not_found','import',null); end if;
  if v_user is null or not tongs.has_workspace_role(v_import.workspace_id,'editor') then return jsonb_build_object('outcome','denied','import',null); end if;
  if v_import.state='committed' then return jsonb_build_object('outcome','duplicate','import',to_jsonb(v_import)); end if;
  if lower(p_verified_media_hash)<>v_import.expected_media_hash or p_verified_media_bytes<>v_import.expected_media_bytes
     or lower(p_verified_media_content_type)<>lower(v_import.expected_media_content_type) then
    return jsonb_build_object('outcome','conflict','reason','storage_readback_mismatch','import',to_jsonb(v_import));
  end if;
  select * into v_duplicate from tongs.hammer_recording_import_requests
    where workspace_id=v_import.workspace_id and workpiece_id=v_import.workpiece_id
      and verified_media_hash=lower(p_verified_media_hash) and state='committed' limit 1;
  if found then return jsonb_build_object('outcome','duplicate','import',to_jsonb(v_duplicate)); end if;
  insert into tongs.workpiece_files(workpiece_id,path,file_type,content_type,bytes,hash_algo,hash_value,storage_bucket,storage_key,
    written_by_tool,written_by_tool_version,written_by_lane,revision)
  values(v_import.workpiece_id,v_import.media_path,'recording',lower(p_verified_media_content_type),p_verified_media_bytes,'sha256',
    lower(p_verified_media_hash),v_import.storage_bucket,v_import.storage_key,'hammer',v_import.hammer_version,'forge-managed',1)
  on conflict(workpiece_id,path) do update set content_type=excluded.content_type,bytes=excluded.bytes,hash_value=excluded.hash_value,
    storage_bucket=excluded.storage_bucket,storage_key=excluded.storage_key,written_by_tool=excluded.written_by_tool,
    written_by_tool_version=excluded.written_by_tool_version,written_by_lane=excluded.written_by_lane,
    revision=tongs.workpiece_files.revision+1,updated_at=now() returning revision into v_revision;
  perform set_config('tongs.recording_authority_rpc','on',true);
  insert into tongs.workpiece_events(workpiece_id,event_name,payload,correlation_id,written_by_tool,written_by_tool_version,written_by_lane)
  values(v_import.workpiece_id,'hammer.recording.imported.v1',jsonb_build_object('import_id',v_import.id,'workspace_id',v_import.workspace_id,
    'file_path',v_import.media_path,'media_hash',lower(p_verified_media_hash),'media_bytes',p_verified_media_bytes,
    'content_type',lower(p_verified_media_content_type),'provenance',v_import.provenance),v_import.operation_id::text,'hammer',v_import.hammer_version,'forge-managed')
  returning id into v_event_id;
  update tongs.hammer_recording_import_requests set state='committed',verified_media_hash=lower(p_verified_media_hash),
    verified_media_bytes=p_verified_media_bytes,verified_media_content_type=lower(p_verified_media_content_type),media_revision=v_revision,
    failure_stage=null,failure_code=null,failure_details=null,committed_at=now()
    where id=p_import_id returning * into v_import;
  return jsonb_build_object('outcome','committed','import',to_jsonb(v_import),'event_id',v_event_id);
end; $$;

create or replace function tongs.mark_hammer_recording_import_failure(p_import_id uuid,p_stage text,p_code text,p_details jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $$
declare v_user uuid:=auth.uid(); v_import tongs.hammer_recording_import_requests%rowtype;
begin
  select * into v_import from tongs.hammer_recording_import_requests where id=p_import_id for update;
  if not found then return jsonb_build_object('outcome','not_found','import',null); end if;
  if v_user is null or not tongs.has_workspace_role(v_import.workspace_id,'editor') then return jsonb_build_object('outcome','denied','import',null); end if;
  if v_import.state='committed' then return jsonb_build_object('outcome','duplicate','import',to_jsonb(v_import)); end if;
  update tongs.hammer_recording_import_requests set state='recoverable_failure',failure_stage=p_stage,failure_code=p_code,
    failure_details=coalesce(p_details,'{}'::jsonb) where id=p_import_id returning * into v_import;
  return jsonb_build_object('outcome','recoverable_failure','import',to_jsonb(v_import));
end; $$;

create or replace view tongs.current_workpiece_recorded_takes with (security_invoker=true) as
select c.workspace_id,c.workpiece_id,c.capture_session_id,c.id completion_id,k.id keep_id,c.ready_transition_id,
  c.script_revision,c.script_hash,c.media_path,c.media_revision,c.media_hash,c.completion_evidence,k.decision_evidence,
  c.created_at completed_at,k.created_at kept_at,c.completed_by,k.kept_by,'anvil_capture'::text source_kind,c.id source_authority_id,
  c.media_content_type,c.media_bytes,c.recording_session_id
from tongs.anvil_recording_completion_requests c left join tongs.anvil_recording_keep_requests k on k.completion_id=c.id
union all
select h.workspace_id,h.workpiece_id,null::uuid,null::uuid,null::uuid,null::uuid,null::bigint,null::text,h.media_path,
  h.media_revision,h.verified_media_hash,h.provenance || jsonb_build_object('artifact_validation',jsonb_build_object(
    'content_type',h.verified_media_content_type,'bytes',h.verified_media_bytes,'sha256',h.verified_media_hash,
    'path',h.media_path,'ok',true)),null::jsonb,h.committed_at,null::timestamptz,h.imported_by,null::uuid,
  'hammer_import'::text,h.id,h.verified_media_content_type,h.verified_media_bytes,null::uuid
from tongs.hammer_recording_import_requests h where h.state='committed';

create or replace function tongs.guard_recording_authority_events() returns trigger language plpgsql set search_path=pg_catalog,tongs as $$
begin
  if new.event_name in ('take_completed','take_kept','hammer.recording.imported.v1')
     and coalesce(current_setting('tongs.recording_authority_rpc',true),'') <> 'on' then
    raise exception using errcode='42501',message='recording transition events are RPC-only';
  end if;
  return new;
end; $$;

revoke all on function tongs.anvil_transition_take_completed_v2(uuid,uuid,uuid,uuid,text,bigint,text,text,bigint,text,bigint,text,text,text,text,jsonb) from public,anon;
grant execute on function tongs.anvil_transition_take_completed_v2(uuid,uuid,uuid,uuid,text,bigint,text,text,bigint,text,bigint,text,text,text,text,jsonb) to authenticated;
revoke all on function tongs.reserve_hammer_recording_import(uuid,uuid,uuid,text,text,text,text,bigint,text,text,text,text,jsonb) from public,anon;
grant execute on function tongs.reserve_hammer_recording_import(uuid,uuid,uuid,text,text,text,text,bigint,text,text,text,text,jsonb) to authenticated;
revoke all on function tongs.finalize_hammer_recording_import(uuid,text,bigint,text) from public,anon;
grant execute on function tongs.finalize_hammer_recording_import(uuid,text,bigint,text) to authenticated;
revoke all on function tongs.mark_hammer_recording_import_failure(uuid,text,text,jsonb) from public,anon;
grant execute on function tongs.mark_hammer_recording_import_failure(uuid,text,text,jsonb) to authenticated;
grant select on tongs.current_workpiece_recorded_takes to authenticated;

commit;
