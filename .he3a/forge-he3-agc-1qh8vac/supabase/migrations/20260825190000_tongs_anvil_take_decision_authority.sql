begin;

create table if not exists tongs.anvil_recording_discard_requests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references tongs.workspaces(id) on delete cascade,
  workpiece_id uuid not null references tongs.episodes(id) on delete cascade,
  capture_session_id uuid not null,
  completion_id uuid not null references tongs.anvil_recording_completion_requests(id) on delete cascade,
  idempotency_key text not null,
  request_fingerprint text not null,
  decision_evidence jsonb not null,
  discarded_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (workspace_id, idempotency_key),
  unique (completion_id)
);

alter table tongs.anvil_recording_discard_requests enable row level security;
create policy anvil_recording_discard_select_if_workspace_viewer
on tongs.anvil_recording_discard_requests for select to authenticated
using (tongs.has_workspace_role(workspace_id, 'viewer'));
revoke insert, update, delete on tongs.anvil_recording_discard_requests from authenticated;
grant select on tongs.anvil_recording_discard_requests to authenticated;
grant all on tongs.anvil_recording_discard_requests to service_role;

create or replace function tongs.anvil_transition_take_kept(
  p_workspace_id uuid, p_workpiece_id uuid, p_capture_session_id uuid,
  p_completion_id uuid, p_idempotency_key text, p_decision_evidence jsonb
) returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $$
declare
  v_user uuid:=auth.uid(); v_key text:=btrim(coalesce(p_idempotency_key,'')); v_fingerprint text;
  v_completion tongs.anvil_recording_completion_requests%rowtype;
  v_existing tongs.anvil_recording_keep_requests%rowtype; v_saved tongs.anvil_recording_keep_requests%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_completion_id::text,0));
  if v_user is null or not tongs.has_workspace_role(p_workspace_id,'editor') then return jsonb_build_object('outcome','denied','keep',null); end if;
  select * into v_completion from tongs.anvil_recording_completion_requests where id=p_completion_id and workspace_id=p_workspace_id and workpiece_id=p_workpiece_id and capture_session_id=p_capture_session_id;
  if not found then return jsonb_build_object('outcome','not_found','keep',null); end if;
  if exists(select 1 from tongs.anvil_recording_discard_requests where completion_id=p_completion_id) then return jsonb_build_object('outcome','conflict','keep',null,'reason','take_already_discarded'); end if;
  if length(v_key) not between 8 and 200 or p_decision_evidence is null or jsonb_typeof(p_decision_evidence)<>'object'
    or p_decision_evidence->>'schema'<>'anvil.take-decision.v1' or p_decision_evidence->>'decision'<>'keep'
    or p_decision_evidence->>'completion_id' is distinct from p_completion_id::text
    or p_decision_evidence->>'capture_session_id' is distinct from p_capture_session_id::text then
    return jsonb_build_object('outcome','conflict','keep',null,'reason','invalid_keep_evidence');
  end if;
  v_fingerprint:=md5(concat_ws('|',p_workspace_id,p_workpiece_id,p_capture_session_id,p_completion_id,p_decision_evidence::text));
  select * into v_existing from tongs.anvil_recording_keep_requests where workspace_id=p_workspace_id and idempotency_key=v_key;
  if found then
    if v_existing.request_fingerprint=v_fingerprint then return jsonb_build_object('outcome','duplicate','keep',to_jsonb(v_existing)); end if;
    return jsonb_build_object('outcome','conflict','keep',null,'reason','idempotency_key_reused');
  end if;
  select * into v_existing from tongs.anvil_recording_keep_requests where completion_id=p_completion_id;
  if found then return jsonb_build_object('outcome','duplicate','keep',to_jsonb(v_existing)); end if;
  insert into tongs.anvil_recording_keep_requests(workspace_id,workpiece_id,capture_session_id,completion_id,idempotency_key,request_fingerprint,decision_evidence,kept_by)
  values(p_workspace_id,p_workpiece_id,p_capture_session_id,p_completion_id,v_key,v_fingerprint,p_decision_evidence,v_user) returning * into v_saved;
  perform set_config('tongs.recording_authority_rpc','on',true);
  insert into tongs.workpiece_events(workpiece_id,event_name,payload,correlation_id,written_by_tool,written_by_tool_version,written_by_lane)
  values(p_workpiece_id,'take_kept',jsonb_build_object('authority_schema','anvil.take-decision.v1','keep_id',v_saved.id,'completion_id',p_completion_id,'workspace_id',p_workspace_id,'capture_session_id',p_capture_session_id,'file_path',v_completion.media_path,'media_revision',v_completion.media_revision,'media_hash',v_completion.media_hash),v_key,'anvil','0.0.0','forge-managed');
  return jsonb_build_object('outcome','saved','keep',to_jsonb(v_saved));
end; $$;

create or replace function tongs.anvil_transition_take_discarded(
  p_workspace_id uuid, p_workpiece_id uuid, p_capture_session_id uuid,
  p_completion_id uuid, p_idempotency_key text, p_decision_evidence jsonb
) returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $$
declare
  v_user uuid:=auth.uid(); v_key text:=btrim(coalesce(p_idempotency_key,'')); v_fingerprint text;
  v_completion tongs.anvil_recording_completion_requests%rowtype;
  v_existing tongs.anvil_recording_discard_requests%rowtype; v_saved tongs.anvil_recording_discard_requests%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_completion_id::text,0));
  if v_user is null or not tongs.has_workspace_role(p_workspace_id,'editor') then return jsonb_build_object('outcome','denied','discard',null); end if;
  select * into v_completion from tongs.anvil_recording_completion_requests where id=p_completion_id and workspace_id=p_workspace_id and workpiece_id=p_workpiece_id and capture_session_id=p_capture_session_id;
  if not found then return jsonb_build_object('outcome','not_found','discard',null); end if;
  if exists(select 1 from tongs.anvil_recording_keep_requests where completion_id=p_completion_id) then return jsonb_build_object('outcome','conflict','discard',null,'reason','take_already_kept'); end if;
  if length(v_key) not between 8 and 200 or p_decision_evidence is null or jsonb_typeof(p_decision_evidence)<>'object'
    or p_decision_evidence->>'schema'<>'anvil.take-decision.v1' or p_decision_evidence->>'decision'<>'discard'
    or p_decision_evidence->>'completion_id' is distinct from p_completion_id::text
    or p_decision_evidence->>'capture_session_id' is distinct from p_capture_session_id::text then
    return jsonb_build_object('outcome','conflict','discard',null,'reason','invalid_discard_evidence');
  end if;
  v_fingerprint:=md5(concat_ws('|',p_workspace_id,p_workpiece_id,p_capture_session_id,p_completion_id,p_decision_evidence::text));
  select * into v_existing from tongs.anvil_recording_discard_requests where workspace_id=p_workspace_id and idempotency_key=v_key;
  if found then
    if v_existing.request_fingerprint=v_fingerprint then return jsonb_build_object('outcome','duplicate','discard',to_jsonb(v_existing)); end if;
    return jsonb_build_object('outcome','conflict','discard',null,'reason','idempotency_key_reused');
  end if;
  select * into v_existing from tongs.anvil_recording_discard_requests where completion_id=p_completion_id;
  if found then return jsonb_build_object('outcome','duplicate','discard',to_jsonb(v_existing)); end if;
  insert into tongs.anvil_recording_discard_requests(workspace_id,workpiece_id,capture_session_id,completion_id,idempotency_key,request_fingerprint,decision_evidence,discarded_by)
  values(p_workspace_id,p_workpiece_id,p_capture_session_id,p_completion_id,v_key,v_fingerprint,p_decision_evidence,v_user) returning * into v_saved;
  perform set_config('tongs.recording_authority_rpc','on',true);
  insert into tongs.workpiece_events(workpiece_id,event_name,payload,correlation_id,written_by_tool,written_by_tool_version,written_by_lane)
  values(p_workpiece_id,'take_discarded',jsonb_build_object('authority_schema','anvil.take-decision.v1','discard_id',v_saved.id,'completion_id',p_completion_id,'workspace_id',p_workspace_id,'capture_session_id',p_capture_session_id,'file_path',v_completion.media_path),v_key,'anvil','0.0.0','forge-managed');
  return jsonb_build_object('outcome','saved','discard',to_jsonb(v_saved));
end; $$;

create or replace function tongs.guard_recording_authority_events() returns trigger language plpgsql set search_path=pg_catalog,tongs as $$
begin
  if new.event_name in ('take_completed','take_kept','take_discarded','hammer.recording.imported.v1')
     and coalesce(current_setting('tongs.recording_authority_rpc',true),'') <> 'on' then
    raise exception using errcode='42501',message='recording transition events are RPC-only';
  end if;
  return new;
end; $$;

revoke all on function tongs.anvil_transition_take_discarded(uuid,uuid,uuid,uuid,text,jsonb) from public,anon;
grant execute on function tongs.anvil_transition_take_discarded(uuid,uuid,uuid,uuid,text,jsonb) to authenticated;
alter function tongs.anvil_transition_take_discarded(uuid,uuid,uuid,uuid,text,jsonb) owner to postgres;

create or replace function tongs.read_anvil_pending_take_decisions(p_workspace_id uuid,p_workpiece_id uuid)
returns jsonb language sql security definer set search_path=pg_catalog,tongs stable as $$
  select case when auth.uid() is null or not tongs.has_workspace_role(p_workspace_id,'viewer') then
    jsonb_build_object('outcome','denied','pending','[]'::jsonb)
  else jsonb_build_object('outcome','ok','pending',coalesce(jsonb_agg(jsonb_build_object(
    'completion_id',c.id,'workpiece_id',c.workpiece_id,'capture_session_id',c.capture_session_id,
    'media_path',c.media_path,'completed_at',c.created_at) order by c.created_at desc),'[]'::jsonb))
  end
  from tongs.anvil_recording_completion_requests c
  left join tongs.anvil_recording_keep_requests k on k.completion_id=c.id
  left join tongs.anvil_recording_discard_requests d on d.completion_id=c.id
  where c.workspace_id=p_workspace_id and c.workpiece_id=p_workpiece_id and k.id is null and d.id is null;
$$;
revoke all on function tongs.read_anvil_pending_take_decisions(uuid,uuid) from public,anon;
grant execute on function tongs.read_anvil_pending_take_decisions(uuid,uuid) to authenticated;
alter function tongs.read_anvil_pending_take_decisions(uuid,uuid) owner to postgres;

commit;
