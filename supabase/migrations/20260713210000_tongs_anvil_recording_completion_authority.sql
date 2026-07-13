begin;

create table if not exists tongs.anvil_recording_completion_requests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references tongs.workspaces(id) on delete cascade,
  workpiece_id uuid not null references tongs.episodes(id) on delete cascade,
  capture_session_id uuid not null,
  ready_transition_id uuid not null references tongs.workpiece_ready_transition_requests(id),
  script_revision bigint not null check (script_revision > 0),
  script_hash text not null check (script_hash ~ '^[0-9a-f]{64}$'),
  media_path text not null check (media_path ~ '^recordings/[^/].*'),
  media_revision bigint not null check (media_revision > 0),
  media_hash text not null check (media_hash ~ '^[0-9a-f]{64}$'),
  idempotency_key text not null check (length(btrim(idempotency_key)) between 8 and 200),
  request_fingerprint text not null check (request_fingerprint ~ '^[0-9a-f]{32}$'),
  completion_evidence jsonb not null,
  completed_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (workspace_id, idempotency_key),
  unique (workspace_id, workpiece_id, capture_session_id)
);

create table if not exists tongs.anvil_recording_keep_requests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references tongs.workspaces(id) on delete cascade,
  workpiece_id uuid not null references tongs.episodes(id) on delete cascade,
  capture_session_id uuid not null,
  completion_id uuid not null references tongs.anvil_recording_completion_requests(id),
  idempotency_key text not null check (length(btrim(idempotency_key)) between 8 and 200),
  request_fingerprint text not null check (request_fingerprint ~ '^[0-9a-f]{32}$'),
  decision_evidence jsonb not null,
  kept_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (workspace_id, idempotency_key),
  unique (completion_id)
);

create index if not exists anvil_completion_workpiece_created_idx
  on tongs.anvil_recording_completion_requests(workspace_id, workpiece_id, created_at desc);
create index if not exists anvil_keep_workpiece_created_idx
  on tongs.anvil_recording_keep_requests(workspace_id, workpiece_id, created_at desc);

alter table tongs.anvil_recording_completion_requests enable row level security;
alter table tongs.anvil_recording_keep_requests enable row level security;

drop policy if exists anvil_completion_select_if_workspace_viewer on tongs.anvil_recording_completion_requests;
create policy anvil_completion_select_if_workspace_viewer
on tongs.anvil_recording_completion_requests for select to authenticated
using (tongs.has_workspace_role(workspace_id, 'viewer'));

drop policy if exists anvil_keep_select_if_workspace_viewer on tongs.anvil_recording_keep_requests;
create policy anvil_keep_select_if_workspace_viewer
on tongs.anvil_recording_keep_requests for select to authenticated
using (tongs.has_workspace_role(workspace_id, 'viewer'));

create or replace function tongs.guard_recording_authority_events()
returns trigger
language plpgsql
set search_path = pg_catalog, tongs
as $$
begin
  if new.event_name in ('take_completed', 'take_kept')
     and coalesce(current_setting('tongs.recording_authority_rpc', true), '') <> 'on' then
    raise exception using errcode = '42501', message = 'recording transition events are RPC-only';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_recording_authority_events on tongs.workpiece_events;
create trigger trg_guard_recording_authority_events
before insert on tongs.workpiece_events
for each row execute function tongs.guard_recording_authority_events();

create or replace function tongs.anvil_transition_take_completed(
  p_workspace_id uuid,
  p_workpiece_id uuid,
  p_capture_session_id uuid,
  p_ready_transition_id uuid,
  p_expected_script_revision bigint,
  p_expected_script_hash text,
  p_media_path text,
  p_expected_media_revision bigint,
  p_expected_media_hash text,
  p_idempotency_key text,
  p_completion_evidence jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, tongs
as $$
declare
  v_user_id uuid := auth.uid();
  v_key text := btrim(coalesce(p_idempotency_key, ''));
  v_script_hash text := lower(btrim(coalesce(p_expected_script_hash, '')));
  v_media_hash text := lower(btrim(coalesce(p_expected_media_hash, '')));
  v_media_path text := btrim(coalesce(p_media_path, ''));
  v_fingerprint text;
  v_existing tongs.anvil_recording_completion_requests%rowtype;
  v_ready record;
  v_media record;
  v_saved tongs.anvil_recording_completion_requests%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text || ':' || v_key, 0));
  if v_user_id is null or not tongs.has_workspace_role(p_workspace_id, 'editor') then
    return jsonb_build_object('outcome', 'denied', 'completion', null);
  end if;
  if not exists (select 1 from tongs.episodes where id = p_workpiece_id and workspace_id = p_workspace_id) then
    return jsonb_build_object('outcome', 'not_found', 'completion', null);
  end if;
  if length(v_key) not between 8 and 200 then
    return jsonb_build_object('outcome', 'conflict', 'completion', null, 'reason', 'invalid_idempotency_key');
  end if;
  if p_completion_evidence is null or jsonb_typeof(p_completion_evidence) <> 'object'
     or p_completion_evidence->>'schema' <> 'anvil.recording-completion.v1'
     or p_completion_evidence->'completed' is distinct from 'true'::jsonb
     or p_completion_evidence->>'capture_session_id' is distinct from p_capture_session_id::text
     or p_completion_evidence#>'{coverage,terminal_line_completed}' is distinct from 'true'::jsonb
     or p_completion_evidence#>'{coverage,unresolved_skipped_line_count}' is distinct from '0'::jsonb
     or jsonb_typeof(p_completion_evidence#>'{coverage,unresolved_skipped_lines}') <> 'array'
     or jsonb_array_length(p_completion_evidence#>'{coverage,unresolved_skipped_lines}') <> 0
     or coalesce((p_completion_evidence#>>'{artifact_validation,ok}')::boolean, false) is not true
     or lower(coalesce(p_completion_evidence#>>'{artifact_validation,sha256}', '')) <> v_media_hash then
    return jsonb_build_object('outcome', 'conflict', 'completion', null, 'reason', 'invalid_completion_evidence');
  end if;
  select * into v_ready from tongs.current_workpiece_ready_scripts
    where workspace_id = p_workspace_id and workpiece_id = p_workpiece_id
      and transition_id = p_ready_transition_id and script_revision = p_expected_script_revision
      and script_hash = v_script_hash;
  if not found then
    return jsonb_build_object('outcome', 'stale', 'completion', null, 'reason', 'ready_contract_mismatch');
  end if;
  select revision, lower(hash_value) as hash_value, bytes into v_media
    from tongs.workpiece_files where workpiece_id = p_workpiece_id and path = v_media_path;
  if not found then
    return jsonb_build_object('outcome', 'not_found', 'completion', null, 'reason', 'media_not_found');
  end if;
  if v_media.revision <> p_expected_media_revision or v_media.hash_value <> v_media_hash then
    return jsonb_build_object('outcome', 'stale', 'completion', null, 'reason', 'media_contract_mismatch',
      'current_media_revision', v_media.revision, 'current_media_hash', v_media.hash_value);
  end if;
  v_fingerprint := md5(concat_ws('|', p_workspace_id, p_workpiece_id, p_capture_session_id,
    p_ready_transition_id, p_expected_script_revision, v_script_hash, v_media_path,
    p_expected_media_revision, v_media_hash, p_completion_evidence::text));
  select * into v_existing from tongs.anvil_recording_completion_requests
    where workspace_id = p_workspace_id and idempotency_key = v_key;
  if found then
    if v_existing.request_fingerprint = v_fingerprint then
      return jsonb_build_object('outcome', 'duplicate', 'completion', to_jsonb(v_existing));
    end if;
    return jsonb_build_object('outcome', 'conflict', 'completion', null, 'reason', 'idempotency_key_reused');
  end if;
  select * into v_existing from tongs.anvil_recording_completion_requests
    where workspace_id = p_workspace_id and workpiece_id = p_workpiece_id
      and capture_session_id = p_capture_session_id;
  if found then
    if v_existing.request_fingerprint = v_fingerprint then
      return jsonb_build_object('outcome', 'duplicate', 'completion', to_jsonb(v_existing));
    end if;
    return jsonb_build_object('outcome', 'conflict', 'completion', null, 'reason', 'capture_session_reused');
  end if;
  insert into tongs.anvil_recording_completion_requests(
    workspace_id, workpiece_id, capture_session_id, ready_transition_id,
    script_revision, script_hash, media_path, media_revision, media_hash,
    idempotency_key, request_fingerprint, completion_evidence, completed_by
  ) values (
    p_workspace_id, p_workpiece_id, p_capture_session_id, p_ready_transition_id,
    p_expected_script_revision, v_script_hash, v_media_path, p_expected_media_revision, v_media_hash,
    v_key, v_fingerprint, p_completion_evidence, v_user_id
  ) returning * into v_saved;
  perform set_config('tongs.recording_authority_rpc', 'on', true);
  insert into tongs.workpiece_events(workpiece_id, event_name, payload, correlation_id,
    written_by_tool, written_by_tool_version, written_by_lane)
  values (p_workpiece_id, 'take_completed', jsonb_build_object(
    'authority_schema', 'anvil.recording-completion.v1', 'completion_id', v_saved.id,
    'workspace_id', p_workspace_id, 'capture_session_id', p_capture_session_id,
    'ready_transition_id', p_ready_transition_id, 'script_revision', p_expected_script_revision,
    'script_hash', v_script_hash, 'file_path', v_media_path, 'media_revision', p_expected_media_revision,
    'media_hash', v_media_hash), v_key, 'anvil', '0.0.0', 'forge-managed');
  return jsonb_build_object('outcome', 'saved', 'completion', to_jsonb(v_saved));
end;
$$;

create or replace function tongs.anvil_transition_take_kept(
  p_workspace_id uuid,
  p_workpiece_id uuid,
  p_capture_session_id uuid,
  p_completion_id uuid,
  p_idempotency_key text,
  p_decision_evidence jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, tongs
as $$
declare
  v_user_id uuid := auth.uid();
  v_key text := btrim(coalesce(p_idempotency_key, ''));
  v_fingerprint text;
  v_completion tongs.anvil_recording_completion_requests%rowtype;
  v_existing tongs.anvil_recording_keep_requests%rowtype;
  v_saved tongs.anvil_recording_keep_requests%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text || ':' || v_key, 0));
  if v_user_id is null or not tongs.has_workspace_role(p_workspace_id, 'editor') then
    return jsonb_build_object('outcome', 'denied', 'keep', null);
  end if;
  select * into v_completion from tongs.anvil_recording_completion_requests
    where id = p_completion_id and workspace_id = p_workspace_id
      and workpiece_id = p_workpiece_id and capture_session_id = p_capture_session_id;
  if not found then
    return jsonb_build_object('outcome', 'not_found', 'keep', null);
  end if;
  if length(v_key) not between 8 and 200
     or p_decision_evidence is null or jsonb_typeof(p_decision_evidence) <> 'object'
     or p_decision_evidence->>'schema' <> 'anvil.take-decision.v1'
     or p_decision_evidence->>'decision' <> 'keep'
     or p_decision_evidence->>'completion_id' is distinct from p_completion_id::text
     or p_decision_evidence->>'capture_session_id' is distinct from p_capture_session_id::text then
    return jsonb_build_object('outcome', 'conflict', 'keep', null, 'reason', 'invalid_keep_evidence');
  end if;
  v_fingerprint := md5(concat_ws('|', p_workspace_id, p_workpiece_id, p_capture_session_id,
    p_completion_id, p_decision_evidence::text));
  select * into v_existing from tongs.anvil_recording_keep_requests
    where workspace_id = p_workspace_id and idempotency_key = v_key;
  if found then
    if v_existing.request_fingerprint = v_fingerprint then
      return jsonb_build_object('outcome', 'duplicate', 'keep', to_jsonb(v_existing));
    end if;
    return jsonb_build_object('outcome', 'conflict', 'keep', null, 'reason', 'idempotency_key_reused');
  end if;
  if exists (select 1 from tongs.anvil_recording_keep_requests where completion_id = p_completion_id) then
    select * into v_existing from tongs.anvil_recording_keep_requests where completion_id = p_completion_id;
    return jsonb_build_object('outcome', 'duplicate', 'keep', to_jsonb(v_existing));
  end if;
  insert into tongs.anvil_recording_keep_requests(workspace_id, workpiece_id, capture_session_id,
    completion_id, idempotency_key, request_fingerprint, decision_evidence, kept_by)
  values (p_workspace_id, p_workpiece_id, p_capture_session_id, p_completion_id,
    v_key, v_fingerprint, p_decision_evidence, v_user_id) returning * into v_saved;
  perform set_config('tongs.recording_authority_rpc', 'on', true);
  insert into tongs.workpiece_events(workpiece_id, event_name, payload, correlation_id,
    written_by_tool, written_by_tool_version, written_by_lane)
  values (p_workpiece_id, 'take_kept', jsonb_build_object(
    'authority_schema', 'anvil.take-decision.v1', 'keep_id', v_saved.id,
    'completion_id', p_completion_id, 'workspace_id', p_workspace_id,
    'capture_session_id', p_capture_session_id, 'file_path', v_completion.media_path,
    'media_revision', v_completion.media_revision, 'media_hash', v_completion.media_hash),
    v_key, 'anvil', '0.0.0', 'forge-managed');
  return jsonb_build_object('outcome', 'saved', 'keep', to_jsonb(v_saved));
end;
$$;

create or replace view tongs.current_workpiece_recorded_takes
with (security_invoker = true)
as
select c.workspace_id, c.workpiece_id, c.capture_session_id, c.id as completion_id,
  k.id as keep_id, c.ready_transition_id, c.script_revision, c.script_hash,
  c.media_path, c.media_revision, c.media_hash, c.completion_evidence,
  k.decision_evidence, c.created_at as completed_at, k.created_at as kept_at,
  c.completed_by, k.kept_by
from tongs.anvil_recording_completion_requests c
join tongs.anvil_recording_keep_requests k on k.completion_id = c.id;

revoke insert, update, delete on tongs.anvil_recording_completion_requests from authenticated;
revoke insert, update, delete on tongs.anvil_recording_keep_requests from authenticated;
grant select on tongs.anvil_recording_completion_requests to authenticated;
grant select on tongs.anvil_recording_keep_requests to authenticated;
grant select on tongs.current_workpiece_recorded_takes to authenticated;
revoke all on function tongs.guard_recording_authority_events() from public, anon, authenticated;
revoke all on function tongs.anvil_transition_take_completed(uuid,uuid,uuid,uuid,bigint,text,text,bigint,text,text,jsonb) from public, anon;
revoke all on function tongs.anvil_transition_take_kept(uuid,uuid,uuid,uuid,text,jsonb) from public, anon;
grant execute on function tongs.anvil_transition_take_completed(uuid,uuid,uuid,uuid,bigint,text,text,bigint,text,text,jsonb) to authenticated;
grant execute on function tongs.anvil_transition_take_kept(uuid,uuid,uuid,uuid,text,jsonb) to authenticated;
alter function tongs.guard_recording_authority_events() owner to postgres;
alter function tongs.anvil_transition_take_completed(uuid,uuid,uuid,uuid,bigint,text,text,bigint,text,text,jsonb) owner to postgres;
alter function tongs.anvil_transition_take_kept(uuid,uuid,uuid,uuid,text,jsonb) owner to postgres;

comment on view tongs.current_workpiece_recorded_takes is
  'Canonical recorded truth: an exact Ready-bound script and validated media completion followed by an explicit keep decision.';

commit;
