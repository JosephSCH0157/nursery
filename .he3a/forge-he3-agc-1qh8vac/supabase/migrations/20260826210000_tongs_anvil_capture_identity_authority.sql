begin;

create table tongs.anvil_capture_authorities (
  id uuid primary key default gen_random_uuid(),
  capture_session_id uuid not null unique,
  workspace_id uuid not null references tongs.workspaces(id) on delete restrict,
  workpiece_id uuid not null references tongs.episodes(id) on delete restrict,
  recording_session_id uuid null references tongs.recording_sessions(id) on delete restrict,
  ready_transition_id uuid null references tongs.workpiece_ready_transition_requests(id) on delete restrict,
  script_path text not null check (script_path = 'script/script.md'),
  script_revision bigint not null check (script_revision > 0),
  script_hash text not null check (script_hash ~ '^[0-9a-f]{64}$'),
  operation_key text not null check (length(btrim(operation_key)) between 8 and 200),
  provenance text not null check (provenance in ('live_established','completion_backfill')),
  established_by uuid not null references auth.users(id),
  established_at timestamptz not null default now(),
  constraint anvil_capture_authority_workspace_operation_key unique (workspace_id, operation_key),
  constraint anvil_capture_authority_live_ready_required check (
    provenance <> 'live_established' or ready_transition_id is not null
  )
);

create index anvil_capture_authority_workpiece_created_idx
  on tongs.anvil_capture_authorities(workspace_id, workpiece_id, established_at desc);

alter table tongs.anvil_recording_completion_requests
  add column capture_authority_id uuid null references tongs.anvil_capture_authorities(id) on delete restrict;

create unique index anvil_completion_capture_authority_uidx
  on tongs.anvil_recording_completion_requests(capture_authority_id)
  where capture_authority_id is not null;

insert into tongs.anvil_capture_authorities(
  id,capture_session_id,workspace_id,workpiece_id,recording_session_id,ready_transition_id,
  script_path,script_revision,script_hash,operation_key,provenance,established_by,established_at
)
select c.id,c.capture_session_id,c.workspace_id,c.workpiece_id,c.recording_session_id,c.ready_transition_id,
  coalesce(c.script_path,'script/script.md'),c.script_revision,lower(c.script_hash),
  'completion-backfill:'||c.id::text,'completion_backfill',c.completed_by,c.created_at
from tongs.anvil_recording_completion_requests c
where c.script_revision is not null and c.script_revision > 0
  and c.script_hash ~ '^[0-9a-f]{64}$'
on conflict do nothing;

update tongs.anvil_recording_completion_requests c
set capture_authority_id=a.id
from tongs.anvil_capture_authorities a
where c.capture_authority_id is null and a.capture_session_id=c.capture_session_id;

create or replace function tongs.guard_anvil_capture_authority_immutable()
returns trigger language plpgsql set search_path=pg_catalog,tongs as $$
begin
  raise exception using errcode='55000', message='anvil capture authority is immutable';
end $$;

create trigger trg_anvil_capture_authority_immutable
before update or delete on tongs.anvil_capture_authorities
for each row execute function tongs.guard_anvil_capture_authority_immutable();

alter table tongs.anvil_capture_authorities enable row level security;
create policy anvil_capture_authority_select_if_workspace_viewer
on tongs.anvil_capture_authorities for select to authenticated
using (tongs.has_workspace_role(workspace_id,'viewer'));
revoke insert,update,delete on tongs.anvil_capture_authorities from authenticated;
grant select on tongs.anvil_capture_authorities to authenticated;
grant all on tongs.anvil_capture_authorities to service_role;

create or replace function tongs.establish_anvil_capture_authority(
  p_workspace_id uuid,p_workpiece_id uuid,p_capture_session_id uuid,p_operation_key text,
  p_recording_session_id uuid default null
) returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $$
declare v_user uuid:=auth.uid();v_key text:=btrim(coalesce(p_operation_key,''));v_ready record;
  v_existing tongs.anvil_capture_authorities%rowtype;v_saved tongs.anvil_capture_authorities%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text||':'||v_key,0));
  if v_user is null or not tongs.has_workspace_role(p_workspace_id,'editor') then
    return jsonb_build_object('outcome','denied','reason','editor_required','capture_authority',null);
  end if;
  if length(v_key) not between 8 and 200 then
    return jsonb_build_object('outcome','conflict','reason','operation_key_invalid','capture_authority',null);
  end if;
  select * into v_existing from tongs.anvil_capture_authorities
    where workspace_id=p_workspace_id and operation_key=v_key;
  if found then
    if v_existing.workpiece_id=p_workpiece_id and v_existing.capture_session_id=p_capture_session_id then
      return jsonb_build_object('outcome','duplicate','reason',null,'capture_authority',to_jsonb(v_existing));
    end if;
    return jsonb_build_object('outcome','conflict','reason','operation_key_reused','capture_authority',null);
  end if;
  if not exists(select 1 from tongs.episodes where id=p_workpiece_id and workspace_id=p_workspace_id and archived_at is null) then
    return jsonb_build_object('outcome','not_found','reason','episode_membership_invalid','capture_authority',null);
  end if;
  select transition_id,script_path,script_revision,lower(script_hash) script_hash into v_ready
    from tongs.current_workpiece_ready_scripts
    where workspace_id=p_workspace_id and workpiece_id=p_workpiece_id and script_path='script/script.md';
  if not found then
    return jsonb_build_object('outcome','conflict','reason','current_ready_script_required','capture_authority',null);
  end if;
  if p_recording_session_id is not null and not exists(
    select 1 from tongs.recording_sessions where id=p_recording_session_id and workspace_id=p_workspace_id
  ) then return jsonb_build_object('outcome','conflict','reason','recording_session_mismatch','capture_authority',null); end if;
  insert into tongs.anvil_capture_authorities(capture_session_id,workspace_id,workpiece_id,recording_session_id,
    ready_transition_id,script_path,script_revision,script_hash,operation_key,provenance,established_by)
  values(p_capture_session_id,p_workspace_id,p_workpiece_id,p_recording_session_id,v_ready.transition_id,
    v_ready.script_path,v_ready.script_revision,v_ready.script_hash,v_key,'live_established',v_user)
  returning * into v_saved;
  return jsonb_build_object('outcome','established','reason',null,'capture_authority',to_jsonb(v_saved));
exception when unique_violation then
  select * into v_existing from tongs.anvil_capture_authorities where capture_session_id=p_capture_session_id;
  if found and v_existing.workspace_id=p_workspace_id and v_existing.workpiece_id=p_workpiece_id and v_existing.operation_key=v_key then
    return jsonb_build_object('outcome','duplicate','reason',null,'capture_authority',to_jsonb(v_existing));
  end if;
  return jsonb_build_object('outcome','conflict','reason','capture_session_reused','capture_authority',null);
end $$;

create or replace function tongs.anvil_transition_take_completed_v3(
  p_capture_authority_id uuid,p_media_path text,p_expected_media_revision bigint,p_expected_media_hash text,
  p_expected_media_bytes bigint,p_expected_media_content_type text,p_storage_bucket text,p_storage_key text,
  p_idempotency_key text,p_completion_evidence jsonb
) returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $$
declare a tongs.anvil_capture_authorities%rowtype;v_user uuid:=auth.uid();v_media record;
  v_key text:=btrim(coalesce(p_idempotency_key,''));v_hash text:=lower(btrim(coalesce(p_expected_media_hash,'')));
  v_type text:=lower(btrim(coalesce(p_expected_media_content_type,'')));v_existing tongs.anvil_recording_completion_requests%rowtype;
  v_saved tongs.anvil_recording_completion_requests%rowtype;v_fingerprint text;
begin
  select * into a from tongs.anvil_capture_authorities where id=p_capture_authority_id;
  if not found then return jsonb_build_object('outcome','not_found','reason','capture_authority_not_found','completion',null); end if;
  if v_user is null or not tongs.has_workspace_role(a.workspace_id,'editor') then return jsonb_build_object('outcome','denied','reason','editor_required','completion',null); end if;
  if length(v_key) not between 8 and 200 or v_hash !~ '^[0-9a-f]{64}$' or p_expected_media_bytes<=0
    or p_completion_evidence is null or jsonb_typeof(p_completion_evidence)<>'object'
    or p_completion_evidence->>'schema'<>'anvil.recording-completion.v3'
    or p_completion_evidence->>'capture_authority_id' is distinct from a.id::text
    or p_completion_evidence->>'capture_session_id' is distinct from a.capture_session_id::text
    or coalesce((p_completion_evidence#>>'{artifact_validation,ok}')::boolean,false) is not true
    or lower(coalesce(p_completion_evidence#>>'{artifact_validation,sha256}',''))<>v_hash then
    return jsonb_build_object('outcome','conflict','reason','invalid_completion_evidence','completion',null);
  end if;
  select revision,lower(hash_value) hash_value,bytes,lower(content_type) content_type,storage_bucket,storage_key into v_media
    from tongs.workpiece_files where workpiece_id=a.workpiece_id and path=p_media_path;
  if not found then return jsonb_build_object('outcome','not_found','reason','media_not_found','completion',null); end if;
  if v_media.revision<>p_expected_media_revision or v_media.hash_value<>v_hash or v_media.bytes<>p_expected_media_bytes
    or v_media.content_type<>v_type or v_media.storage_bucket<>p_storage_bucket or v_media.storage_key<>p_storage_key then
    return jsonb_build_object('outcome','stale','reason','media_contract_mismatch','completion',null); end if;
  v_fingerprint:=md5(concat_ws('|',a.id,p_media_path,p_expected_media_revision,v_hash,p_expected_media_bytes,v_type,p_completion_evidence::text));
  select * into v_existing from tongs.anvil_recording_completion_requests where workspace_id=a.workspace_id and idempotency_key=v_key;
  if found then
    if v_existing.capture_authority_id=a.id and v_existing.request_fingerprint=v_fingerprint then return jsonb_build_object('outcome','duplicate','completion',to_jsonb(v_existing)); end if;
    return jsonb_build_object('outcome','conflict','reason','idempotency_key_reused','completion',null);
  end if;
  insert into tongs.anvil_recording_completion_requests(workspace_id,workpiece_id,capture_session_id,capture_authority_id,
    ready_transition_id,script_path,script_revision,script_hash,media_path,media_revision,media_hash,media_bytes,
    media_content_type,storage_bucket,storage_key,recording_session_id,idempotency_key,request_fingerprint,completion_evidence,completed_by)
  values(a.workspace_id,a.workpiece_id,a.capture_session_id,a.id,a.ready_transition_id,a.script_path,a.script_revision,a.script_hash,
    p_media_path,p_expected_media_revision,v_hash,p_expected_media_bytes,v_type,p_storage_bucket,p_storage_key,a.recording_session_id,
    v_key,v_fingerprint,p_completion_evidence,v_user) returning * into v_saved;
  perform set_config('tongs.recording_authority_rpc','on',true);
  insert into tongs.workpiece_events(workpiece_id,event_name,payload,correlation_id,written_by_tool,written_by_tool_version,written_by_lane)
  values(a.workpiece_id,'take_completed',jsonb_build_object('authority_schema','anvil.recording-completion.v3','completion_id',v_saved.id,
    'capture_authority_id',a.id,'capture_session_id',a.capture_session_id,'workspace_id',a.workspace_id,'script_path',a.script_path,
    'script_revision',a.script_revision,'script_hash',a.script_hash,'file_path',p_media_path,'media_revision',p_expected_media_revision,'media_hash',v_hash),
    v_key,'anvil',coalesce(p_completion_evidence->>'anvil_version','unknown'),'forge-managed');
  return jsonb_build_object('outcome','saved','completion',to_jsonb(v_saved));
end $$;

create or replace function tongs.anvil_transition_take_decision_v2(
  p_capture_authority_id uuid,p_completion_id uuid,p_decision text,p_idempotency_key text,p_decision_evidence jsonb
) returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $$
declare a tongs.anvil_capture_authorities%rowtype;c tongs.anvil_recording_completion_requests%rowtype;
begin
  select * into a from tongs.anvil_capture_authorities where id=p_capture_authority_id;
  select * into c from tongs.anvil_recording_completion_requests where id=p_completion_id and capture_authority_id=a.id;
  if a.id is null or c.id is null then return jsonb_build_object('outcome','not_found','reason','capture_completion_mismatch'); end if;
  if p_decision_evidence is null or jsonb_typeof(p_decision_evidence)<>'object'
    or p_decision_evidence->>'schema'<>'anvil.take-decision.v2'
    or p_decision_evidence->>'decision' is distinct from p_decision
    or p_decision_evidence->>'completion_id' is distinct from c.id::text
    or p_decision_evidence->>'capture_authority_id' is distinct from a.id::text
    or p_decision_evidence->>'capture_session_id' is distinct from a.capture_session_id::text then
    return jsonb_build_object('outcome','conflict','reason','invalid_decision_evidence');
  end if;
  if p_decision='keep' then return tongs.anvil_transition_take_kept(a.workspace_id,a.workpiece_id,a.capture_session_id,c.id,p_idempotency_key,p_decision_evidence||jsonb_build_object('schema','anvil.take-decision.v1')); end if;
  if p_decision='discard' then return tongs.anvil_transition_take_discarded(a.workspace_id,a.workpiece_id,a.capture_session_id,c.id,p_idempotency_key,p_decision_evidence||jsonb_build_object('schema','anvil.take-decision.v1')); end if;
  return jsonb_build_object('outcome','conflict','reason','decision_invalid');
end $$;

revoke all on function tongs.establish_anvil_capture_authority(uuid,uuid,uuid,text,uuid) from public,anon;
grant execute on function tongs.establish_anvil_capture_authority(uuid,uuid,uuid,text,uuid) to authenticated,service_role;
revoke all on function tongs.anvil_transition_take_completed_v3(uuid,text,bigint,text,bigint,text,text,text,text,jsonb) from public,anon;
grant execute on function tongs.anvil_transition_take_completed_v3(uuid,text,bigint,text,bigint,text,text,text,text,jsonb) to authenticated,service_role;
revoke all on function tongs.anvil_transition_take_decision_v2(uuid,uuid,text,text,jsonb) from public,anon;
grant execute on function tongs.anvil_transition_take_decision_v2(uuid,uuid,text,text,jsonb) to authenticated,service_role;

commit;
