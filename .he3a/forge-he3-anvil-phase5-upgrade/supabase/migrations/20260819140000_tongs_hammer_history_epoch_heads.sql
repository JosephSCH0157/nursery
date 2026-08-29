begin;

create or replace function tongs.is_hammer_history_component_authority(p_authority jsonb)
returns boolean
language plpgsql
stable
security invoker
set search_path = pg_catalog, tongs
as $$
declare
  v_key text;
  v_value jsonb;
  v_file tongs.workpiece_files%rowtype;
  v_workpiece_id uuid;
begin
  if jsonb_typeof(p_authority) <> 'object'
    or not (p_authority ?& array['transcript', 'visual_timeline', 'visual_placements', 'audio', 'editorial_authority'])
    or (select count(*) from jsonb_object_keys(p_authority)) <> 5
  then
    return false;
  end if;
  begin
    v_workpiece_id := (p_authority->'transcript'->>'workpiece_id')::uuid;
  exception when others then
    return false;
  end;
  for v_key, v_value in select key, value from jsonb_each(p_authority)
  loop
    if jsonb_typeof(v_value) <> 'object'
      or (select count(*) from jsonb_object_keys(v_value)) <> 7
      or not (v_value ?& array['workpiece_id','path','sha256','bytes','registry_revision','registry_updated_at','content_type'])
      or v_value->>'workpiece_id' <> v_workpiece_id::text
      or v_value->>'path' is null
      or v_value->>'path' = ''
      or v_value->>'path' ~ '(^/|\.\.)'
      or v_value->>'sha256' !~ '^[0-9a-f]{64}$'
      or v_value->>'bytes' !~ '^[1-9][0-9]*$'
      or v_value->>'registry_revision' !~ '^[1-9][0-9]*$'
      or v_value->>'content_type' <> 'application/json'
    then
      return false;
    end if;
    begin
      perform (v_value->>'registry_updated_at')::timestamptz;
    exception when others then
      return false;
    end;
    select * into v_file from tongs.workpiece_files
    where workpiece_id = v_workpiece_id and path = v_value->>'path';
    if v_file.workpiece_id is null
      or lower(v_file.hash_value) <> v_value->>'sha256'
      or v_file.bytes <> (v_value->>'bytes')::bigint
      or v_file.revision <> (v_value->>'registry_revision')::bigint
      or v_file.updated_at <> (v_value->>'registry_updated_at')::timestamptz
      or v_file.content_type <> v_value->>'content_type'
      or v_file.hash_algo <> 'sha256'
      or v_file.storage_bucket <> 'forge-workpieces'
      or v_file.storage_key <> format('workpieces/%s/%s', v_workpiece_id, v_value->>'path')
    then
      return false;
    end if;
  end loop;
  return true;
end;
$$;

revoke all on function tongs.is_hammer_history_component_authority(jsonb) from public;
grant execute on function tongs.is_hammer_history_component_authority(jsonb) to authenticated;
grant execute on function tongs.is_hammer_history_component_authority(jsonb) to service_role;

create table tongs.hammer_history_epoch_heads (
  head_id uuid primary key,
  epoch_id uuid not null,
  workspace_id uuid not null,
  workpiece_id uuid not null,
  canonical_recording_id uuid not null,
  recording_revision_id uuid not null,
  sequence bigint not null check (sequence > 0),
  schema_version integer not null default 1 check (schema_version = 1),
  artifact_path text not null,
  artifact_sha256 text not null check (artifact_sha256 ~ '^[0-9a-f]{64}$'),
  artifact_bytes bigint not null check (artifact_bytes > 0),
  artifact_registry_revision bigint not null check (artifact_registry_revision > 0),
  artifact_registry_updated_at timestamptz not null,
  parent_kind text not null check (parent_kind in ('epoch_anchor','epoch_head')),
  parent_head_id uuid null,
  parent_path text not null,
  parent_sha256 text not null check (parent_sha256 ~ '^[0-9a-f]{64}$'),
  parent_registry_revision bigint not null check (parent_registry_revision > 0),
  parent_registry_updated_at timestamptz not null,
  base_editor_state_hash text not null check (base_editor_state_hash ~ '^hammer-state:[0-9a-f]{8}$'),
  base_component_sha256 jsonb not null check (tongs.is_hammer_history_component_sha256(base_component_sha256)),
  result_editor_state_hash text not null check (result_editor_state_hash ~ '^hammer-state:[0-9a-f]{8}$'),
  result_component_authority jsonb not null,
  initiated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  constraint hammer_history_epoch_heads_epoch_identity_fkey
    foreign key (epoch_id, workspace_id, workpiece_id, canonical_recording_id, recording_revision_id)
    references tongs.hammer_history_epochs (epoch_id, workspace_id, workpiece_id, canonical_recording_id, recording_revision_id)
    on delete restrict,
  constraint hammer_history_epoch_heads_identity_unique unique
    (head_id, epoch_id, workspace_id, workpiece_id, canonical_recording_id, recording_revision_id),
  constraint hammer_history_epoch_heads_epoch_sequence_unique unique (epoch_id, sequence),
  constraint hammer_history_epoch_heads_artifact_path_unique unique (workpiece_id, artifact_path),
  constraint hammer_history_epoch_heads_path_canonical check (
    artifact_path = format('hammer/revisions/%s/history/epochs/%s/heads/%s.history.v1.json', recording_revision_id, epoch_id, head_id)
  ),
  constraint hammer_history_epoch_heads_parent_shape check (
    (sequence = 1 and parent_kind = 'epoch_anchor' and parent_head_id is null)
    or (sequence > 1 and parent_kind = 'epoch_head' and parent_head_id is not null)
  ),
  constraint hammer_history_epoch_heads_parent_distinct check (parent_path <> artifact_path)
);

create table tongs.hammer_history_epoch_head_transitions (
  transition_id uuid primary key default gen_random_uuid(),
  head_id uuid not null,
  epoch_id uuid not null,
  workspace_id uuid not null,
  workpiece_id uuid not null,
  canonical_recording_id uuid not null,
  recording_revision_id uuid not null,
  sequence bigint not null check (sequence > 0),
  idempotency_key text not null check (idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$'),
  operation_fingerprint text not null check (operation_fingerprint ~ '^[0-9a-f]{64}$'),
  expected_revision_updated_at timestamptz not null,
  expected_history_path text not null,
  committed_history_path text not null,
  committed_revision_updated_at timestamptz not null,
  parent_head_id uuid null,
  parent_sha256 text not null check (parent_sha256 ~ '^[0-9a-f]{64}$'),
  parent_registry_revision bigint not null check (parent_registry_revision > 0),
  parent_registry_updated_at timestamptz not null,
  head_sha256 text not null check (head_sha256 ~ '^[0-9a-f]{64}$'),
  head_bytes bigint not null check (head_bytes > 0),
  head_registry_revision bigint not null check (head_registry_revision > 0),
  head_registry_updated_at timestamptz not null,
  result_editor_state_hash text not null check (result_editor_state_hash ~ '^hammer-state:[0-9a-f]{8}$'),
  result_component_authority jsonb not null,
  envelope jsonb not null,
  outcome text not null check (outcome = 'committed'),
  initiated_by uuid not null references auth.users(id),
  committed_at timestamptz not null default now(),
  constraint hammer_history_epoch_head_transitions_head_identity_fkey
    foreign key (head_id, epoch_id, workspace_id, workpiece_id, canonical_recording_id, recording_revision_id)
    references tongs.hammer_history_epoch_heads (head_id, epoch_id, workspace_id, workpiece_id, canonical_recording_id, recording_revision_id)
    on delete restrict,
  constraint hammer_history_epoch_head_transitions_head_unique unique (head_id),
  constraint hammer_history_epoch_head_transitions_epoch_sequence_unique unique (epoch_id, sequence),
  constraint hammer_history_epoch_head_transitions_operation_unique unique
    (workspace_id, workpiece_id, recording_revision_id, idempotency_key),
  constraint hammer_history_epoch_head_transitions_path_unique unique (workpiece_id, committed_history_path),
  constraint hammer_history_epoch_head_transitions_path_consistency check (
    expected_history_path <> committed_history_path
  )
);

create index hammer_history_epoch_heads_revision_sequence_idx
  on tongs.hammer_history_epoch_heads (recording_revision_id, epoch_id, sequence desc);
create index hammer_history_epoch_head_transitions_operation_idx
  on tongs.hammer_history_epoch_head_transitions (workspace_id, workpiece_id, recording_revision_id, idempotency_key);

create or replace function tongs.validate_hammer_history_epoch_head_parent()
returns trigger
language plpgsql
set search_path = pg_catalog, tongs
as $$
declare
  v_epoch tongs.hammer_history_epochs%rowtype;
  v_parent tongs.hammer_history_epoch_heads%rowtype;
begin
  select * into v_epoch from tongs.hammer_history_epochs where epoch_id = new.epoch_id;
  if v_epoch.epoch_id is null then
    raise exception using errcode = '23503', message = 'history_epoch_head_epoch_missing';
  end if;
  if new.sequence = 1 then
    if new.parent_kind <> 'epoch_anchor' or new.parent_head_id is not null
      or new.parent_path <> v_epoch.artifact_path or new.parent_sha256 <> v_epoch.artifact_sha256
      or new.parent_registry_revision <> v_epoch.artifact_registry_revision
      or new.parent_registry_updated_at <> v_epoch.artifact_registry_updated_at
    then
      raise exception using errcode = '23514', message = 'history_epoch_head_anchor_parent_conflict';
    end if;
  else
    select * into v_parent from tongs.hammer_history_epoch_heads
    where epoch_id = new.epoch_id and sequence = new.sequence - 1;
    if v_parent.head_id is null or new.parent_kind <> 'epoch_head' or new.parent_head_id <> v_parent.head_id
      or new.parent_path <> v_parent.artifact_path or new.parent_sha256 <> v_parent.artifact_sha256
      or new.parent_registry_revision <> v_parent.artifact_registry_revision
      or new.parent_registry_updated_at <> v_parent.artifact_registry_updated_at
    then
      raise exception using errcode = '23514', message = 'history_epoch_head_parent_conflict';
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_hammer_history_epoch_heads_parent
before insert on tongs.hammer_history_epoch_heads
for each row execute function tongs.validate_hammer_history_epoch_head_parent();

create trigger trg_hammer_history_epoch_heads_immutable
before update or delete on tongs.hammer_history_epoch_heads
for each row execute function tongs.reject_hammer_history_immutable_mutation();

create trigger trg_hammer_history_epoch_head_transitions_immutable
before update or delete on tongs.hammer_history_epoch_head_transitions
for each row execute function tongs.reject_hammer_history_immutable_mutation();

create or replace function tongs.reject_committed_hammer_history_file_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, tongs
as $$
begin
  if exists (
    select 1 from tongs.hammer_history_epochs e
    where e.workpiece_id = old.workpiece_id and (e.artifact_path = old.path or e.predecessor_archive_path = old.path)
  ) or exists (
    select 1 from tongs.hammer_history_epoch_heads h
    where h.workpiece_id = old.workpiece_id and h.artifact_path = old.path
  ) then
    raise exception using errcode = '55000', message = 'committed_hammer_history_file_immutable';
  end if;
  if tg_op = 'UPDATE' then return new; end if;
  return old;
end;
$$;

alter table tongs.hammer_history_epoch_heads enable row level security;
alter table tongs.hammer_history_epoch_head_transitions enable row level security;

create policy hammer_history_epoch_heads_select_if_workspace_viewer
on tongs.hammer_history_epoch_heads for select to authenticated
using (tongs.has_workspace_role(workspace_id, 'viewer'));

create policy hammer_history_head_transitions_select_if_viewer
on tongs.hammer_history_epoch_head_transitions for select to authenticated
using (tongs.has_workspace_role(workspace_id, 'viewer'));

grant select on table tongs.hammer_history_epoch_heads to authenticated;
grant select on table tongs.hammer_history_epoch_head_transitions to authenticated;
revoke insert, update, delete on table tongs.hammer_history_epoch_heads from authenticated;
revoke insert, update, delete on table tongs.hammer_history_epoch_head_transitions from authenticated;
grant all on table tongs.hammer_history_epoch_heads to service_role;
grant all on table tongs.hammer_history_epoch_head_transitions to service_role;

create or replace function tongs.commit_hammer_history_epoch_head(
  p_workspace_id uuid,
  p_workpiece_id uuid,
  p_canonical_recording_id uuid,
  p_revision_id uuid,
  p_epoch_id uuid,
  p_head_id uuid,
  p_sequence bigint,
  p_idempotency_key text,
  p_operation_fingerprint text,
  p_expected_revision_updated_at timestamptz,
  p_expected_history_path text,
  p_parent_head_id uuid,
  p_parent_sha256 text,
  p_parent_registry_revision bigint,
  p_parent_registry_updated_at timestamptz,
  p_head_path text,
  p_head_sha256 text,
  p_head_bytes bigint,
  p_head_registry_revision bigint,
  p_head_registry_updated_at timestamptz,
  p_result_editor_state_hash text,
  p_result_component_authority jsonb,
  p_envelope jsonb
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, tongs
as $$
declare
  v_actor uuid := auth.uid();
  v_revision tongs.recording_revisions%rowtype;
  v_epoch tongs.hammer_history_epochs%rowtype;
  v_parent_head tongs.hammer_history_epoch_heads%rowtype;
  v_parent_file tongs.workpiece_files%rowtype;
  v_head_file tongs.workpiece_files%rowtype;
  v_existing tongs.hammer_history_epoch_head_transitions%rowtype;
  v_head tongs.hammer_history_epoch_heads%rowtype;
  v_transition tongs.hammer_history_epoch_head_transitions%rowtype;
  v_committed_updated_at timestamptz;
begin
  if v_actor is null or not tongs.has_workspace_role(p_workspace_id, 'editor') then
    return jsonb_build_object('outcome','conflict','code','history_epoch_head_forbidden','terminal',true,'retryable',false);
  end if;
  if p_sequence <= 0
    or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$'
    or p_operation_fingerprint !~ '^[0-9a-f]{64}$'
    or p_parent_sha256 !~ '^[0-9a-f]{64}$'
    or p_head_sha256 !~ '^[0-9a-f]{64}$'
    or p_head_bytes <= 0 or p_parent_registry_revision <= 0 or p_head_registry_revision <= 0
    or p_result_editor_state_hash !~ '^hammer-state:[0-9a-f]{8}$'
    or jsonb_typeof(p_result_component_authority) <> 'object'
  then
    return jsonb_build_object('outcome','conflict','code','history_epoch_head_request_invalid','terminal',true,'retryable',false);
  end if;
  if p_head_path <> format('hammer/revisions/%s/history/epochs/%s/heads/%s.history.v1.json', p_revision_id, p_epoch_id, p_head_id)
    or p_expected_history_path = p_head_path
  then
    return jsonb_build_object('outcome','conflict','code','history_epoch_head_path_invalid','terminal',true,'retryable',false);
  end if;
  if jsonb_typeof(p_envelope) <> 'object'
    or p_envelope->>'schema' <> 'forge.hammer-history-epoch-head'
    or p_envelope->>'schema_version' <> '1'
    or p_envelope->>'workspace_id' <> p_workspace_id::text
    or p_envelope->>'workpiece_id' <> p_workpiece_id::text
    or p_envelope->>'canonical_recording_id' <> p_canonical_recording_id::text
    or p_envelope->>'recording_revision_id' <> p_revision_id::text
    or p_envelope->>'epoch_id' <> p_epoch_id::text
    or p_envelope->>'head_id' <> p_head_id::text
    or p_envelope->>'sequence' <> p_sequence::text
    or p_envelope#>>'{parent,path}' <> p_expected_history_path
    or p_envelope#>>'{parent,head_id}' is distinct from p_parent_head_id::text
    or p_envelope#>>'{parent,sha256}' <> p_parent_sha256
    or p_envelope#>>'{parent,registry_revision}' <> p_parent_registry_revision::text
    or (p_envelope#>>'{parent,registry_updated_at}')::timestamptz <> p_parent_registry_updated_at
    or p_envelope#>>'{result,editor_state_hash}' <> p_result_editor_state_hash
    or p_envelope#>'{result,component_authority}' <> p_result_component_authority
    or p_envelope#>>'{artifact,path}' <> p_head_path
    or p_envelope#>>'{artifact,sha256}' <> p_head_sha256
    or p_envelope#>>'{artifact,bytes}' <> p_head_bytes::text
    or p_envelope#>>'{artifact,registry_revision}' <> p_head_registry_revision::text
    or (p_envelope#>>'{artifact,registry_updated_at}')::timestamptz <> p_head_registry_updated_at
    or jsonb_typeof(p_envelope->'history') <> 'object'
    or p_envelope#>>'{boundary,prior_history_status}' <> 'unavailable'
    or p_envelope#>>'{boundary,merged}' <> 'false'
    or p_envelope#>>'{boundary,traversable}' <> 'false'
    or p_envelope#>>'{creation,initiating_user_id}' <> v_actor::text
  then
    return jsonb_build_object('outcome','conflict','code','history_epoch_head_envelope_conflict','terminal',true,'retryable',false);
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text || ':' || p_workpiece_id::text || ':' || p_revision_id::text, 0));

  select * into v_existing from tongs.hammer_history_epoch_head_transitions
  where workspace_id = p_workspace_id and workpiece_id = p_workpiece_id
    and recording_revision_id = p_revision_id and idempotency_key = p_idempotency_key;
  if v_existing.transition_id is not null then
    if v_existing.operation_fingerprint = p_operation_fingerprint and v_existing.head_id = p_head_id
      and v_existing.epoch_id = p_epoch_id and v_existing.sequence = p_sequence
      and v_existing.canonical_recording_id = p_canonical_recording_id
      and v_existing.expected_revision_updated_at = p_expected_revision_updated_at
      and v_existing.expected_history_path = p_expected_history_path
      and v_existing.parent_head_id is not distinct from p_parent_head_id
      and v_existing.parent_sha256 = p_parent_sha256
      and v_existing.parent_registry_revision = p_parent_registry_revision
      and v_existing.parent_registry_updated_at = p_parent_registry_updated_at
      and v_existing.committed_history_path = p_head_path
      and v_existing.head_sha256 = p_head_sha256 and v_existing.head_bytes = p_head_bytes
      and v_existing.head_registry_revision = p_head_registry_revision
      and v_existing.head_registry_updated_at = p_head_registry_updated_at
      and v_existing.result_editor_state_hash = p_result_editor_state_hash
      and v_existing.result_component_authority = p_result_component_authority
      and v_existing.envelope = p_envelope
    then
      return jsonb_build_object('outcome','already_committed','epoch_id',v_existing.epoch_id,'head_id',v_existing.head_id,
        'sequence',v_existing.sequence,'transition_id',v_existing.transition_id,'history_path',v_existing.committed_history_path,
        'revision_updated_at',v_existing.committed_revision_updated_at,'operation_fingerprint',v_existing.operation_fingerprint);
    end if;
    return jsonb_build_object('outcome','conflict','code','history_epoch_head_idempotency_conflict','terminal',true,'retryable',false);
  end if;

  select rr.* into v_revision from tongs.recording_revisions rr
  join tongs.episodes e on e.id = rr.workpiece_id and e.workspace_id = rr.workspace_id
    and e.active_revision_id = rr.id and e.canonical_recording_id = rr.canonical_recording_id
  join tongs.canonical_recordings cr on cr.id = rr.canonical_recording_id
    and cr.workspace_id = rr.workspace_id and cr.workpiece_id = rr.workpiece_id
  where rr.id = p_revision_id and rr.workspace_id = p_workspace_id and rr.workpiece_id = p_workpiece_id
    and rr.canonical_recording_id = p_canonical_recording_id and rr.status = 'active'
  for update of rr;
  if v_revision.id is null then
    return jsonb_build_object('outcome','conflict','code','history_epoch_head_identity_conflict','terminal',true,'retryable',false);
  end if;
  if v_revision.updated_at <> p_expected_revision_updated_at then
    return jsonb_build_object('outcome','conflict','code','history_epoch_head_revision_token_conflict','terminal',true,'retryable',false);
  end if;
  if v_revision.history_path is distinct from p_expected_history_path then
    return jsonb_build_object('outcome','conflict','code','history_epoch_head_pointer_conflict','terminal',true,'retryable',false);
  end if;

  perform 1 from tongs.workpiece_files f
  where f.workpiece_id = p_workpiece_id
    and f.path in (select value->>'path' from jsonb_each(p_result_component_authority))
  for update;
  if not tongs.is_hammer_history_component_authority(p_result_component_authority) then
    return jsonb_build_object('outcome','conflict','code','history_epoch_head_component_authority_conflict','terminal',true,'retryable',false);
  end if;
  if p_result_component_authority#>>'{transcript,path}' is distinct from v_revision.revision_transcript_path
    or p_result_component_authority#>>'{visual_timeline,path}' is distinct from v_revision.visual_timeline_path
    or p_result_component_authority#>>'{visual_placements,path}' is distinct from v_revision.visual_placements_path
    or p_result_component_authority#>>'{audio,path}' is distinct from v_revision.audio_polish_path
    or p_result_component_authority#>>'{editorial_authority,path}' is distinct from v_revision.editorial_authority_path
  then
    return jsonb_build_object('outcome','conflict','code','history_epoch_head_component_authority_conflict','terminal',true,'retryable',false);
  end if;

  select * into v_epoch from tongs.hammer_history_epochs
  where epoch_id = p_epoch_id and workspace_id = p_workspace_id and workpiece_id = p_workpiece_id
    and canonical_recording_id = p_canonical_recording_id and recording_revision_id = p_revision_id;
  if v_epoch.epoch_id is null then
    return jsonb_build_object('outcome','conflict','code','history_epoch_head_epoch_conflict','terminal',true,'retryable',false);
  end if;
  if p_envelope#>>'{base,editor_state_hash}' <> v_epoch.base_editor_state_hash
    or p_envelope#>'{base,component_sha256}' <> v_epoch.base_component_sha256
    or p_envelope#>>'{epoch_anchor,path}' <> v_epoch.artifact_path
    or p_envelope#>>'{epoch_anchor,sha256}' <> v_epoch.artifact_sha256
  then
    return jsonb_build_object('outcome','conflict','code','history_epoch_head_epoch_authority_conflict','terminal',true,'retryable',false);
  end if;

  if p_sequence = 1 then
    if p_parent_head_id is not null or p_expected_history_path <> v_epoch.artifact_path
      or p_parent_sha256 <> v_epoch.artifact_sha256 or p_parent_registry_revision <> v_epoch.artifact_registry_revision
      or p_parent_registry_updated_at <> v_epoch.artifact_registry_updated_at
    then
      return jsonb_build_object('outcome','conflict','code','history_epoch_head_parent_conflict','terminal',true,'retryable',false);
    end if;
  else
    select * into v_parent_head from tongs.hammer_history_epoch_heads
    where epoch_id = p_epoch_id and sequence = p_sequence - 1;
    if v_parent_head.head_id is null or p_parent_head_id <> v_parent_head.head_id
      or p_expected_history_path <> v_parent_head.artifact_path or p_parent_sha256 <> v_parent_head.artifact_sha256
      or p_parent_registry_revision <> v_parent_head.artifact_registry_revision
      or p_parent_registry_updated_at <> v_parent_head.artifact_registry_updated_at
    then
      return jsonb_build_object('outcome','conflict','code','history_epoch_head_parent_conflict','terminal',true,'retryable',false);
    end if;
  end if;

  select * into v_parent_file from tongs.workpiece_files
  where workpiece_id = p_workpiece_id and path = p_expected_history_path for update;
  if v_parent_file.workpiece_id is null or lower(v_parent_file.hash_value) <> p_parent_sha256
    or v_parent_file.revision <> p_parent_registry_revision or v_parent_file.updated_at <> p_parent_registry_updated_at
    or v_parent_file.content_type <> 'application/json' or v_parent_file.hash_algo <> 'sha256'
    or v_parent_file.storage_bucket <> 'forge-workpieces'
    or v_parent_file.storage_key <> format('workpieces/%s/%s', p_workpiece_id, p_expected_history_path)
  then
    return jsonb_build_object('outcome','conflict','code','history_epoch_head_parent_registry_conflict','terminal',true,'retryable',false);
  end if;

  select * into v_head_file from tongs.workpiece_files
  where workpiece_id = p_workpiece_id and path = p_head_path for update;
  if v_head_file.workpiece_id is null or v_head_file.file_type <> 'hammer_history_epoch_head'
    or v_head_file.content_type <> 'application/json' or v_head_file.hash_algo <> 'sha256'
    or lower(v_head_file.hash_value) <> p_head_sha256 or v_head_file.bytes <> p_head_bytes
    or v_head_file.revision <> p_head_registry_revision or v_head_file.updated_at <> p_head_registry_updated_at
    or v_head_file.storage_bucket <> 'forge-workpieces'
    or v_head_file.storage_key <> format('workpieces/%s/%s', p_workpiece_id, p_head_path)
  then
    return jsonb_build_object('outcome','conflict','code','history_epoch_head_registry_conflict','terminal',true,'retryable',false);
  end if;

  insert into tongs.hammer_history_epoch_heads (
    head_id, epoch_id, workspace_id, workpiece_id, canonical_recording_id, recording_revision_id, sequence,
    artifact_path, artifact_sha256, artifact_bytes, artifact_registry_revision, artifact_registry_updated_at,
    parent_kind, parent_head_id, parent_path, parent_sha256, parent_registry_revision, parent_registry_updated_at,
    base_editor_state_hash, base_component_sha256, result_editor_state_hash, result_component_authority, initiated_by
  ) values (
    p_head_id, p_epoch_id, p_workspace_id, p_workpiece_id, p_canonical_recording_id, p_revision_id, p_sequence,
    p_head_path, p_head_sha256, p_head_bytes, p_head_registry_revision, p_head_registry_updated_at,
    case when p_sequence = 1 then 'epoch_anchor' else 'epoch_head' end, p_parent_head_id, p_expected_history_path,
    p_parent_sha256, p_parent_registry_revision, p_parent_registry_updated_at,
    v_epoch.base_editor_state_hash, v_epoch.base_component_sha256, p_result_editor_state_hash, p_result_component_authority, v_actor
  ) returning * into v_head;

  update tongs.recording_revisions set history_path = p_head_path, updated_at = clock_timestamp(), updated_by = v_actor
  where id = p_revision_id and workspace_id = p_workspace_id and workpiece_id = p_workpiece_id
    and canonical_recording_id = p_canonical_recording_id and status = 'active'
    and updated_at = p_expected_revision_updated_at and history_path is not distinct from p_expected_history_path
  returning updated_at into v_committed_updated_at;
  if v_committed_updated_at is null then
    return jsonb_build_object('outcome','conflict','code','history_epoch_head_cas_conflict','terminal',true,'retryable',false);
  end if;

  insert into tongs.hammer_history_epoch_head_transitions (
    head_id, epoch_id, workspace_id, workpiece_id, canonical_recording_id, recording_revision_id, sequence,
    idempotency_key, operation_fingerprint, expected_revision_updated_at, expected_history_path,
    committed_history_path, committed_revision_updated_at, parent_head_id, parent_sha256, parent_registry_revision,
    parent_registry_updated_at, head_sha256, head_bytes, head_registry_revision, head_registry_updated_at,
    result_editor_state_hash, result_component_authority, envelope, outcome, initiated_by
  ) values (
    p_head_id, p_epoch_id, p_workspace_id, p_workpiece_id, p_canonical_recording_id, p_revision_id, p_sequence,
    p_idempotency_key, p_operation_fingerprint, p_expected_revision_updated_at, p_expected_history_path,
    p_head_path, v_committed_updated_at, p_parent_head_id, p_parent_sha256, p_parent_registry_revision,
    p_parent_registry_updated_at, p_head_sha256, p_head_bytes, p_head_registry_revision, p_head_registry_updated_at,
    p_result_editor_state_hash, p_result_component_authority, p_envelope, 'committed', v_actor
  ) returning * into v_transition;

  return jsonb_build_object('outcome','committed','epoch_id',v_head.epoch_id,'head_id',v_head.head_id,
    'sequence',v_head.sequence,'transition_id',v_transition.transition_id,'history_path',v_head.artifact_path,
    'revision_updated_at',v_committed_updated_at,'operation_fingerprint',v_transition.operation_fingerprint);
exception
  when unique_violation then
    return jsonb_build_object('outcome','conflict','code','history_epoch_head_uniqueness_conflict','terminal',true,'retryable',false);
  when foreign_key_violation or check_violation or not_null_violation or invalid_text_representation then
    return jsonb_build_object('outcome','conflict','code','history_epoch_head_constraint_conflict','terminal',true,'retryable',false);
end;
$$;

create or replace function tongs.read_hammer_history_epoch_head_operation(
  p_workspace_id uuid,
  p_workpiece_id uuid,
  p_revision_id uuid,
  p_idempotency_key text,
  p_operation_fingerprint text default null,
  p_head_id uuid default null
) returns jsonb
language plpgsql
stable
security invoker
set search_path = pg_catalog, tongs
as $$
declare
  v_transition tongs.hammer_history_epoch_head_transitions%rowtype;
begin
  if auth.uid() is null or not tongs.has_workspace_role(p_workspace_id, 'viewer') then
    return jsonb_build_object('outcome','absent');
  end if;
  select * into v_transition from tongs.hammer_history_epoch_head_transitions
  where workspace_id = p_workspace_id and workpiece_id = p_workpiece_id
    and recording_revision_id = p_revision_id and idempotency_key = p_idempotency_key;
  if v_transition.transition_id is null then return jsonb_build_object('outcome','absent'); end if;
  if (p_operation_fingerprint is not null and p_operation_fingerprint <> v_transition.operation_fingerprint)
    or (p_head_id is not null and p_head_id <> v_transition.head_id)
  then
    return jsonb_build_object('outcome','conflict','code','history_epoch_head_operation_mismatch','terminal',true,'retryable',false);
  end if;
  return jsonb_build_object('outcome','committed','epoch_id',v_transition.epoch_id,'head_id',v_transition.head_id,
    'sequence',v_transition.sequence,'transition_id',v_transition.transition_id,
    'history_path',v_transition.committed_history_path,'revision_updated_at',v_transition.committed_revision_updated_at,
    'operation_fingerprint',v_transition.operation_fingerprint);
end;
$$;

revoke all on function tongs.commit_hammer_history_epoch_head(uuid,uuid,uuid,uuid,uuid,uuid,bigint,text,text,timestamptz,text,uuid,text,bigint,timestamptz,text,text,bigint,bigint,timestamptz,text,jsonb,jsonb) from public;
grant execute on function tongs.commit_hammer_history_epoch_head(uuid,uuid,uuid,uuid,uuid,uuid,bigint,text,text,timestamptz,text,uuid,text,bigint,timestamptz,text,text,bigint,bigint,timestamptz,text,jsonb,jsonb) to authenticated;
grant execute on function tongs.commit_hammer_history_epoch_head(uuid,uuid,uuid,uuid,uuid,uuid,bigint,text,text,timestamptz,text,uuid,text,bigint,timestamptz,text,text,bigint,bigint,timestamptz,text,jsonb,jsonb) to service_role;
alter function tongs.commit_hammer_history_epoch_head(uuid,uuid,uuid,uuid,uuid,uuid,bigint,text,text,timestamptz,text,uuid,text,bigint,timestamptz,text,text,bigint,bigint,timestamptz,text,jsonb,jsonb) owner to postgres;

revoke all on function tongs.read_hammer_history_epoch_head_operation(uuid,uuid,uuid,text,text,uuid) from public;
grant execute on function tongs.read_hammer_history_epoch_head_operation(uuid,uuid,uuid,text,text,uuid) to authenticated;
grant execute on function tongs.read_hammer_history_epoch_head_operation(uuid,uuid,uuid,text,text,uuid) to service_role;
alter function tongs.read_hammer_history_epoch_head_operation(uuid,uuid,uuid,text,text,uuid) owner to postgres;

comment on table tongs.hammer_history_epoch_heads is 'Immutable complete post-epoch Hammer history heads selected only by recording_revisions.history_path.';
comment on table tongs.hammer_history_epoch_head_transitions is 'Append-only receipts for canonical post-epoch history head CAS transitions.';
comment on function tongs.commit_hammer_history_epoch_head(uuid,uuid,uuid,uuid,uuid,uuid,bigint,text,text,timestamptz,text,uuid,text,bigint,timestamptz,text,text,bigint,bigint,timestamptz,text,jsonb,jsonb) is
  'Validates one staged immutable post-epoch history head and atomically records it and advances recording_revisions.history_path.';

commit;
