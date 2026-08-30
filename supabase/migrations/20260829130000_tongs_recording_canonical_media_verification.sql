begin;

-- This is immutable evidence of a trusted storage readback and media probe. It is
-- deliberately not a pending-operation or recovery authority.
create table tongs.recording_media_verification_receipts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references tongs.workspaces(id) on delete cascade,
  workpiece_id uuid not null references tongs.episodes(id) on delete cascade,
  recording_capture_authority_id uuid not null references tongs.recording_capture_authorities(id) on delete restrict,
  media_path text not null,
  media_revision bigint not null check (media_revision > 0),
  media_hash text not null check (media_hash ~ '^[0-9a-f]{64}$'),
  media_bytes bigint not null check (media_bytes > 0),
  media_content_type text not null,
  storage_bucket text not null,
  storage_key text not null,
  duration_ms bigint not null check (duration_ms > 0),
  has_audio_stream boolean not null check (has_audio_stream),
  has_video_stream boolean not null,
  probe_implementation text not null,
  verification_evidence jsonb not null check (jsonb_typeof(verification_evidence) = 'object'),
  verified_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (recording_capture_authority_id),
  unique (workpiece_id, media_path, media_revision)
);

alter table tongs.recording_media_verification_receipts enable row level security;
create policy recording_media_verification_select_if_workspace_viewer
on tongs.recording_media_verification_receipts for select to authenticated
using (tongs.has_workspace_role(workspace_id, 'viewer'));
revoke insert, update, delete on tongs.recording_media_verification_receipts from authenticated;
grant select on tongs.recording_media_verification_receipts to authenticated;
grant all on tongs.recording_media_verification_receipts to service_role;

-- Repair the shared immutable-receipt guard when a production-shaped database
-- records the preceding authority migration but does not contain this helper.
-- CREATE OR REPLACE also remains safe on complete migration chains because it
-- preserves any existing trigger bindings to the function.
create or replace function tongs.reject_recording_receipt_mutation()
returns trigger
language plpgsql
set search_path=pg_catalog,tongs
as $function$
begin
  raise exception using
    errcode='55000',
    message='recording transition receipts are immutable';
end;
$function$;
alter function tongs.reject_recording_receipt_mutation() owner to postgres;
revoke all on function tongs.reject_recording_receipt_mutation() from public,anon,authenticated;

create trigger trg_recording_media_verification_immutable
before update or delete on tongs.recording_media_verification_receipts
for each row execute function tongs.reject_recording_receipt_mutation();

alter table tongs.anvil_recording_completion_requests
  add column media_verification_receipt_id uuid null
  references tongs.recording_media_verification_receipts(id) on delete restrict;
create unique index recording_completion_media_verification_uidx
  on tongs.anvil_recording_completion_requests(media_verification_receipt_id)
  where media_verification_receipt_id is not null;

create function tongs.recording_transition_take_completed_verified(
  p_recording_capture_authority_id uuid,
  p_media_path text,
  p_expected_media_revision bigint,
  p_expected_media_hash text,
  p_expected_media_bytes bigint,
  p_expected_media_content_type text,
  p_storage_bucket text,
  p_storage_key text,
  p_duration_ms bigint,
  p_has_audio_stream boolean,
  p_has_video_stream boolean,
  p_probe_implementation text,
  p_idempotency_key text,
  p_completion_evidence jsonb,
  p_completed_by uuid
) returns jsonb
language plpgsql security definer set search_path=pg_catalog,tongs
as $function$
declare
  a tongs.recording_capture_authorities%rowtype;
  v_media record;
  v_key text:=btrim(coalesce(p_idempotency_key,''));
  v_hash text:=lower(btrim(coalesce(p_expected_media_hash,'')));
  v_type text:=lower(btrim(coalesce(p_expected_media_content_type,'')));
  v_fingerprint text;
  v_existing tongs.anvil_recording_completion_requests%rowtype;
  v_verification tongs.recording_media_verification_receipts%rowtype;
  v_saved tongs.anvil_recording_completion_requests%rowtype;
  v_evidence jsonb;
begin
  select * into a from tongs.recording_capture_authorities where id=p_recording_capture_authority_id;
  if not found then return jsonb_build_object('outcome','not_found','reason','capture_authority_not_found','completion',null); end if;
  if not exists(select 1 from tongs.workspace_members where workspace_id=a.workspace_id and user_id=p_completed_by and role in ('owner','editor'))
     and not exists(select 1 from tongs.workspaces where id=a.workspace_id and created_by=p_completed_by) then
    return jsonb_build_object('outcome','denied','reason','editor_required','completion',null);
  end if;
  if length(v_key) not between 8 and 200 or v_hash !~ '^[0-9a-f]{64}$' or p_expected_media_bytes<=0
     or p_duration_ms<=0 or p_has_audio_stream is not true or length(btrim(coalesce(p_probe_implementation,'')))<2
     or (v_type like 'video/%' and p_has_video_stream is not true)
     or (v_type not like 'audio/%' and v_type not like 'video/%') then
    return jsonb_build_object('outcome','conflict','reason','canonical_media_verification_invalid','completion',null);
  end if;
  select revision,lower(hash_value) hash_value,bytes,lower(content_type) content_type,storage_bucket,storage_key into v_media
    from tongs.workpiece_files where workpiece_id=a.workpiece_id and path=p_media_path;
  if not found then return jsonb_build_object('outcome','not_found','reason','media_not_found','completion',null); end if;
  if v_media.revision<>p_expected_media_revision or v_media.hash_value<>v_hash or v_media.bytes<>p_expected_media_bytes
     or v_media.content_type<>v_type or v_media.storage_bucket<>p_storage_bucket or v_media.storage_key<>p_storage_key then
    return jsonb_build_object('outcome','stale','reason','media_contract_mismatch','completion',null);
  end if;
  v_evidence:=coalesce(p_completion_evidence,'{}'::jsonb) || jsonb_build_object('canonical_media_verification',jsonb_build_object(
    'source','trusted_tongs_storage_readback','sha256',v_hash,'bytes',p_expected_media_bytes,'content_type',v_type,
    'duration_ms',p_duration_ms,'has_audio_stream',p_has_audio_stream,'has_video_stream',p_has_video_stream,
    'probe_implementation',btrim(p_probe_implementation)));
  v_fingerprint:=md5(concat_ws('|',a.id,p_media_path,p_expected_media_revision,v_hash,p_expected_media_bytes,v_type,
    p_duration_ms,p_has_audio_stream,p_has_video_stream,btrim(p_probe_implementation),v_evidence::text));
  select * into v_existing from tongs.anvil_recording_completion_requests where workspace_id=a.workspace_id and idempotency_key=v_key;
  if found then
    if v_existing.capture_authority_id=a.id and v_existing.request_fingerprint=v_fingerprint and v_existing.media_verification_receipt_id is not null then
      return jsonb_build_object('outcome','duplicate','completion',to_jsonb(v_existing));
    end if;
    return jsonb_build_object('outcome','conflict','reason','idempotency_key_reused','completion',null);
  end if;
  insert into tongs.recording_media_verification_receipts(workspace_id,workpiece_id,recording_capture_authority_id,
    media_path,media_revision,media_hash,media_bytes,media_content_type,storage_bucket,storage_key,duration_ms,
    has_audio_stream,has_video_stream,probe_implementation,verification_evidence,verified_by)
  values(a.workspace_id,a.workpiece_id,a.id,p_media_path,p_expected_media_revision,v_hash,p_expected_media_bytes,v_type,
    p_storage_bucket,p_storage_key,p_duration_ms,p_has_audio_stream,p_has_video_stream,btrim(p_probe_implementation),
    v_evidence->'canonical_media_verification',p_completed_by) returning * into v_verification;
  insert into tongs.anvil_recording_completion_requests(workspace_id,workpiece_id,capture_authority_id,
    media_path,media_revision,media_hash,media_bytes,media_content_type,storage_bucket,storage_key,recording_session_id,
    idempotency_key,request_fingerprint,completion_evidence,completed_by,media_verification_receipt_id)
  values(a.workspace_id,a.workpiece_id,a.id,p_media_path,p_expected_media_revision,v_hash,p_expected_media_bytes,v_type,
    p_storage_bucket,p_storage_key,a.recording_session_id,v_key,v_fingerprint,v_evidence,p_completed_by,v_verification.id) returning * into v_saved;
  perform set_config('tongs.recording_authority_rpc','on',true);
  insert into tongs.workpiece_events(workpiece_id,event_name,payload,correlation_id,written_by_tool,written_by_tool_version,written_by_lane)
  values(a.workpiece_id,'take_completed',jsonb_build_object('authority_schema','forge.recording-completion.v2','completion_id',v_saved.id,
    'recording_capture_authority_id',a.id,'media_verification_receipt_id',v_verification.id,'workspace_id',a.workspace_id,
    'file_path',p_media_path,'media_revision',p_expected_media_revision,'media_hash',v_hash),v_key,'recording',
    coalesce(p_completion_evidence->>'venue_version','unknown'),'forge-managed');
  return jsonb_build_object('outcome','saved','completion',to_jsonb(v_saved),'media_verification',to_jsonb(v_verification));
end;
$function$;

revoke all on function tongs.recording_transition_take_completed_verified(uuid,text,bigint,text,bigint,text,text,text,bigint,boolean,boolean,text,text,jsonb,uuid) from public,anon,authenticated;
grant execute on function tongs.recording_transition_take_completed_verified(uuid,text,bigint,text,bigint,text,text,text,bigint,boolean,boolean,text,text,jsonb,uuid) to service_role;

-- Browser-authenticated callers can no longer complete from self-asserted Blob evidence.
revoke execute on function tongs.recording_transition_take_completed(uuid,text,bigint,text,bigint,text,text,text,text,jsonb) from authenticated,service_role;
revoke execute on function tongs.anvil_transition_take_completed_v3(uuid,text,bigint,text,bigint,text,text,text,text,jsonb) from authenticated,service_role;

create or replace view tongs.current_workpiece_recorded_takes with (security_invoker=true) as
select c.workspace_id,c.workpiece_id,e.execution_id capture_session_id,c.id completion_id,k.id keep_id,
  a.ready_transition_id,a.script_revision,a.script_hash,c.media_path,c.media_revision,c.media_hash,
  c.completion_evidence,k.decision_evidence,c.created_at completed_at,k.created_at kept_at,
  c.completed_by,k.kept_by,'anvil_capture'::text source_kind,c.id source_authority_id,
  c.media_content_type,c.media_bytes,a.recording_session_id
from tongs.anvil_recording_completion_requests c
join tongs.recording_capture_authorities a on a.id=c.capture_authority_id
join tongs.recording_media_verification_receipts v on v.id=c.media_verification_receipt_id
left join tongs.anvil_capture_executions e on e.recording_capture_authority_id=a.id
left join tongs.anvil_recording_keep_requests k on k.completion_id=c.id
where k.id is not null
union all
select h.workspace_id,h.workpiece_id,null::uuid,null::uuid,null::uuid,null::uuid,null::bigint,null::text,h.media_path,
  h.media_revision,h.verified_media_hash,h.provenance || jsonb_build_object('artifact_validation',jsonb_build_object(
    'content_type',h.verified_media_content_type,'bytes',h.verified_media_bytes,'sha256',h.verified_media_hash,
    'path',h.media_path,'ok',true)),null::jsonb,h.committed_at,null::timestamptz,h.imported_by,null::uuid,
  'hammer_import'::text,h.id,h.verified_media_content_type,h.verified_media_bytes,null::uuid
from tongs.hammer_recording_import_requests h where h.state='committed';

create or replace function tongs.read_anvil_pending_take_decisions(p_workspace_id uuid,p_workpiece_id uuid)
returns jsonb language sql security definer set search_path=pg_catalog,tongs stable as $$
  select case when auth.uid() is null or not tongs.has_workspace_role(p_workspace_id,'viewer') then
    jsonb_build_object('outcome','denied','pending','[]'::jsonb)
  else jsonb_build_object('outcome','ok','pending',coalesce(jsonb_agg(jsonb_build_object(
    'completion_id',c.id,'workpiece_id',c.workpiece_id,'capture_session_id',e.execution_id,
    'recording_capture_authority_id',c.capture_authority_id,'media_verification_receipt_id',c.media_verification_receipt_id,
    'media_path',c.media_path,'completed_at',c.created_at) order by c.created_at desc),'[]'::jsonb))
  end
  from tongs.anvil_recording_completion_requests c
  join tongs.recording_media_verification_receipts v on v.id=c.media_verification_receipt_id
  left join tongs.anvil_capture_executions e on e.recording_capture_authority_id=c.capture_authority_id
  left join tongs.anvil_recording_keep_requests k on k.completion_id=c.id
  left join tongs.anvil_recording_discard_requests d on d.completion_id=c.id
  where c.workspace_id=p_workspace_id and c.workpiece_id=p_workpiece_id and k.id is null and d.id is null;
$$;

commit;
