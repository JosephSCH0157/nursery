begin;

create or replace function tongs.is_hammer_history_component_sha256(p_hashes jsonb)
returns boolean
language sql
immutable
set search_path = pg_catalog, tongs
as $$
  select jsonb_typeof(p_hashes) = 'object'
    and p_hashes ?& array['transcript', 'visual_timeline', 'visual_placements', 'audio', 'editorial_authority']
    and not exists (
      select 1
      from jsonb_each_text(p_hashes) as component(name, hash_value)
      where component.hash_value !~ '^[0-9a-f]{64}$'
    );
$$;

revoke all on function tongs.is_hammer_history_component_sha256(jsonb) from public;
grant execute on function tongs.is_hammer_history_component_sha256(jsonb) to authenticated;
grant execute on function tongs.is_hammer_history_component_sha256(jsonb) to service_role;

create table tongs.hammer_history_epochs (
  epoch_id uuid primary key,
  workspace_id uuid not null references tongs.workspaces(id) on delete cascade,
  workpiece_id uuid not null references tongs.episodes(id) on delete cascade,
  canonical_recording_id uuid not null references tongs.canonical_recordings(id) on delete cascade,
  recording_revision_id uuid not null references tongs.recording_revisions(id) on delete cascade,
  schema_version integer not null default 1 check (schema_version = 1),
  artifact_path text not null,
  artifact_sha256 text not null check (artifact_sha256 ~ '^[0-9a-f]{64}$'),
  artifact_bytes bigint not null check (artifact_bytes > 0),
  artifact_registry_revision bigint not null check (artifact_registry_revision > 0),
  artifact_registry_updated_at timestamptz not null,
  base_editor_state_hash text not null check (base_editor_state_hash ~ '^hammer-state:[0-9a-f]{8}$'),
  base_component_sha256 jsonb not null check (tongs.is_hammer_history_component_sha256(base_component_sha256)),
  creation_reason text not null check (creation_reason = 'legacy_history_unrecoverable'),
  predecessor_original_path text not null check (predecessor_original_path <> '' and predecessor_original_path !~ '^/' and predecessor_original_path !~ '\.\.'),
  predecessor_archive_path text not null,
  predecessor_sha256 text not null check (predecessor_sha256 ~ '^[0-9a-f]{64}$'),
  predecessor_bytes bigint not null check (predecessor_bytes > 0),
  predecessor_registry_revision bigint not null check (predecessor_registry_revision > 0),
  predecessor_registry_updated_at timestamptz not null,
  archive_registry_revision bigint not null check (archive_registry_revision > 0),
  archive_registry_updated_at timestamptz not null,
  initiating_user_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  constraint hammer_history_epochs_artifact_path_canonical check (
    artifact_path = format('hammer/revisions/%s/history/epochs/%s.v1.json', recording_revision_id, epoch_id)
  ),
  constraint hammer_history_epochs_archive_path_canonical check (
    predecessor_archive_path = format('hammer/revisions/%s/history/archive/%s.history.v1.json', recording_revision_id, predecessor_sha256)
  ),
  constraint hammer_history_epochs_predecessor_distinct check (
    predecessor_original_path <> predecessor_archive_path
    and predecessor_original_path <> artifact_path
    and predecessor_archive_path <> artifact_path
  ),
  constraint hammer_history_epochs_identity_unique unique (
    epoch_id, workspace_id, workpiece_id, canonical_recording_id, recording_revision_id
  ),
  constraint hammer_history_epochs_artifact_path_unique unique (workpiece_id, artifact_path),
  constraint hammer_history_epochs_archive_path_unique unique (workpiece_id, predecessor_archive_path)
);

create table tongs.hammer_history_epoch_transitions (
  transition_id uuid primary key default gen_random_uuid(),
  epoch_id uuid not null,
  workspace_id uuid not null,
  workpiece_id uuid not null,
  canonical_recording_id uuid not null,
  recording_revision_id uuid not null,
  idempotency_key text not null check (idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$'),
  operation_fingerprint text not null check (operation_fingerprint ~ '^[0-9a-f]{64}$'),
  expected_revision_updated_at timestamptz not null,
  expected_history_path text not null,
  committed_history_path text not null,
  committed_revision_updated_at timestamptz not null,
  predecessor_original_path text not null,
  predecessor_archive_path text not null,
  predecessor_sha256 text not null check (predecessor_sha256 ~ '^[0-9a-f]{64}$'),
  predecessor_bytes bigint not null check (predecessor_bytes > 0),
  predecessor_registry_revision bigint not null check (predecessor_registry_revision > 0),
  predecessor_registry_updated_at timestamptz not null,
  archive_registry_revision bigint not null check (archive_registry_revision > 0),
  archive_registry_updated_at timestamptz not null,
  epoch_artifact_sha256 text not null check (epoch_artifact_sha256 ~ '^[0-9a-f]{64}$'),
  epoch_artifact_bytes bigint not null check (epoch_artifact_bytes > 0),
  epoch_registry_revision bigint not null check (epoch_registry_revision > 0),
  epoch_registry_updated_at timestamptz not null,
  outcome text not null check (outcome = 'committed'),
  initiated_by uuid not null references auth.users(id),
  committed_at timestamptz not null default now(),
  constraint hammer_history_epoch_transitions_epoch_identity_fkey
    foreign key (epoch_id, workspace_id, workpiece_id, canonical_recording_id, recording_revision_id)
    references tongs.hammer_history_epochs (
      epoch_id, workspace_id, workpiece_id, canonical_recording_id, recording_revision_id
    ) on delete restrict,
  constraint hammer_history_epoch_transitions_epoch_unique unique (epoch_id),
  constraint hammer_history_epoch_transitions_operation_unique unique (
    workspace_id, workpiece_id, recording_revision_id, idempotency_key
  ),
  constraint hammer_history_epoch_transitions_committed_path_unique unique (
    workpiece_id, committed_history_path
  ),
  constraint hammer_history_epoch_transitions_path_consistency check (
    expected_history_path = predecessor_original_path
    and committed_history_path <> expected_history_path
    and predecessor_archive_path <> expected_history_path
    and predecessor_archive_path <> committed_history_path
  )
);

create index hammer_history_epochs_revision_created_idx
  on tongs.hammer_history_epochs (recording_revision_id, created_at desc);
create index hammer_history_epoch_transitions_operation_idx
  on tongs.hammer_history_epoch_transitions (workspace_id, workpiece_id, recording_revision_id, idempotency_key);

create or replace function tongs.reject_hammer_history_immutable_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, tongs
as $$
begin
  raise exception using errcode = '55000', message = 'hammer_history_record_immutable';
end;
$$;

create trigger trg_hammer_history_epochs_immutable
before update or delete on tongs.hammer_history_epochs
for each row execute function tongs.reject_hammer_history_immutable_mutation();

create trigger trg_hammer_history_epoch_transitions_immutable
before update or delete on tongs.hammer_history_epoch_transitions
for each row execute function tongs.reject_hammer_history_immutable_mutation();

create or replace function tongs.reject_committed_hammer_history_file_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, tongs
as $$
begin
  if exists (
    select 1
    from tongs.hammer_history_epochs e
    where e.workpiece_id = old.workpiece_id
      and (e.artifact_path = old.path or e.predecessor_archive_path = old.path)
  ) then
    raise exception using errcode = '55000', message = 'committed_hammer_history_file_immutable';
  end if;
  if tg_op = 'UPDATE' then
    return new;
  end if;
  return old;
end;
$$;

create trigger trg_workpiece_files_committed_hammer_history_immutable
before update or delete on tongs.workpiece_files
for each row execute function tongs.reject_committed_hammer_history_file_mutation();

alter table tongs.hammer_history_epochs enable row level security;
alter table tongs.hammer_history_epoch_transitions enable row level security;

create policy hammer_history_epochs_select_if_workspace_viewer
on tongs.hammer_history_epochs
for select to authenticated
using (tongs.has_workspace_role(workspace_id, 'viewer'));

create policy hammer_history_epoch_transitions_select_if_workspace_viewer
on tongs.hammer_history_epoch_transitions
for select to authenticated
using (tongs.has_workspace_role(workspace_id, 'viewer'));

grant select on table tongs.hammer_history_epochs to authenticated;
grant select on table tongs.hammer_history_epoch_transitions to authenticated;
revoke insert, update, delete on table tongs.hammer_history_epochs from authenticated;
revoke insert, update, delete on table tongs.hammer_history_epoch_transitions from authenticated;
grant all on table tongs.hammer_history_epochs to service_role;
grant all on table tongs.hammer_history_epoch_transitions to service_role;

create or replace function tongs.commit_hammer_history_epoch(
  p_workspace_id uuid,
  p_workpiece_id uuid,
  p_canonical_recording_id uuid,
  p_revision_id uuid,
  p_epoch_id uuid,
  p_idempotency_key text,
  p_operation_fingerprint text,
  p_expected_revision_updated_at timestamptz,
  p_expected_history_path text,
  p_predecessor_registry_revision bigint,
  p_predecessor_registry_updated_at timestamptz,
  p_predecessor_sha256 text,
  p_predecessor_bytes bigint,
  p_archive_path text,
  p_archive_registry_revision bigint,
  p_archive_registry_updated_at timestamptz,
  p_epoch_path text,
  p_epoch_registry_revision bigint,
  p_epoch_registry_updated_at timestamptz,
  p_epoch_sha256 text,
  p_epoch_bytes bigint,
  p_base_editor_state_hash text,
  p_base_component_sha256 jsonb
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, tongs
as $$
declare
  v_actor uuid := auth.uid();
  v_revision tongs.recording_revisions%rowtype;
  v_predecessor tongs.workpiece_files%rowtype;
  v_archive tongs.workpiece_files%rowtype;
  v_epoch_file tongs.workpiece_files%rowtype;
  v_existing tongs.hammer_history_epoch_transitions%rowtype;
  v_epoch tongs.hammer_history_epochs%rowtype;
  v_transition tongs.hammer_history_epoch_transitions%rowtype;
  v_committed_updated_at timestamptz;
begin
  if v_actor is null or not tongs.has_workspace_role(p_workspace_id, 'editor') then
    return jsonb_build_object('outcome', 'conflict', 'code', 'history_epoch_forbidden', 'terminal', true, 'retryable', false);
  end if;

  if p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$'
    or p_operation_fingerprint !~ '^[0-9a-f]{64}$'
    or p_predecessor_sha256 !~ '^[0-9a-f]{64}$'
    or p_epoch_sha256 !~ '^[0-9a-f]{64}$'
    or p_predecessor_bytes <= 0
    or p_epoch_bytes <= 0
    or p_base_editor_state_hash !~ '^hammer-state:[0-9a-f]{8}$'
    or not tongs.is_hammer_history_component_sha256(p_base_component_sha256)
  then
    return jsonb_build_object('outcome', 'conflict', 'code', 'history_epoch_request_invalid', 'terminal', true, 'retryable', false);
  end if;

  if p_archive_path <> format('hammer/revisions/%s/history/archive/%s.history.v1.json', p_revision_id, p_predecessor_sha256)
    or p_epoch_path <> format('hammer/revisions/%s/history/epochs/%s.v1.json', p_revision_id, p_epoch_id)
    or p_expected_history_path = p_archive_path
    or p_expected_history_path = p_epoch_path
  then
    return jsonb_build_object('outcome', 'conflict', 'code', 'history_epoch_path_invalid', 'terminal', true, 'retryable', false);
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    p_workspace_id::text || ':' || p_workpiece_id::text || ':' || p_revision_id::text || ':' || p_idempotency_key,
    0
  ));

  select * into v_existing
  from tongs.hammer_history_epoch_transitions
  where workspace_id = p_workspace_id
    and workpiece_id = p_workpiece_id
    and recording_revision_id = p_revision_id
    and idempotency_key = p_idempotency_key;

  if v_existing.transition_id is not null then
    if v_existing.operation_fingerprint = p_operation_fingerprint
      and v_existing.epoch_id = p_epoch_id
      and v_existing.canonical_recording_id = p_canonical_recording_id
    then
      return jsonb_build_object(
        'outcome', 'already_committed',
        'epoch_id', v_existing.epoch_id,
        'transition_id', v_existing.transition_id,
        'history_path', v_existing.committed_history_path,
        'revision_updated_at', v_existing.committed_revision_updated_at,
        'operation_fingerprint', v_existing.operation_fingerprint
      );
    end if;
    return jsonb_build_object('outcome', 'conflict', 'code', 'history_epoch_idempotency_conflict', 'terminal', true, 'retryable', false);
  end if;

  select rr.* into v_revision
  from tongs.recording_revisions rr
  join tongs.episodes e
    on e.id = rr.workpiece_id
   and e.workspace_id = rr.workspace_id
   and e.active_revision_id = rr.id
   and e.canonical_recording_id = rr.canonical_recording_id
  join tongs.canonical_recordings cr
    on cr.id = rr.canonical_recording_id
   and cr.workspace_id = rr.workspace_id
   and cr.workpiece_id = rr.workpiece_id
  where rr.id = p_revision_id
    and rr.workspace_id = p_workspace_id
    and rr.workpiece_id = p_workpiece_id
    and rr.canonical_recording_id = p_canonical_recording_id
    and rr.status = 'active'
  for update of rr;

  if v_revision.id is null then
    return jsonb_build_object('outcome', 'conflict', 'code', 'history_epoch_identity_conflict', 'terminal', true, 'retryable', false);
  end if;
  if v_revision.updated_at <> p_expected_revision_updated_at then
    return jsonb_build_object('outcome', 'conflict', 'code', 'history_epoch_revision_token_conflict', 'terminal', true, 'retryable', false);
  end if;
  if v_revision.history_path is distinct from p_expected_history_path then
    return jsonb_build_object('outcome', 'conflict', 'code', 'history_epoch_pointer_conflict', 'terminal', true, 'retryable', false);
  end if;

  select * into v_predecessor
  from tongs.workpiece_files
  where workpiece_id = p_workpiece_id and path = p_expected_history_path
  for update;
  if v_predecessor.workpiece_id is null
    or v_predecessor.revision <> p_predecessor_registry_revision
    or v_predecessor.updated_at <> p_predecessor_registry_updated_at
    or lower(v_predecessor.hash_value) <> p_predecessor_sha256
    or v_predecessor.bytes <> p_predecessor_bytes
    or v_predecessor.content_type <> 'application/json'
    or v_predecessor.hash_algo <> 'sha256'
    or v_predecessor.storage_bucket <> 'forge-workpieces'
    or v_predecessor.storage_key <> format('workpieces/%s/%s', p_workpiece_id, p_expected_history_path)
  then
    return jsonb_build_object('outcome', 'conflict', 'code', 'history_epoch_predecessor_registry_conflict', 'terminal', true, 'retryable', false);
  end if;

  select * into v_archive
  from tongs.workpiece_files
  where workpiece_id = p_workpiece_id and path = p_archive_path
  for update;
  if v_archive.workpiece_id is null
    or v_archive.revision <> p_archive_registry_revision
    or v_archive.updated_at <> p_archive_registry_updated_at
    or lower(v_archive.hash_value) <> p_predecessor_sha256
    or v_archive.bytes <> p_predecessor_bytes
    or v_archive.content_type <> 'application/json'
    or v_archive.file_type <> 'hammer_history_archive'
    or v_archive.hash_algo <> 'sha256'
    or v_archive.storage_bucket <> 'forge-workpieces'
    or v_archive.storage_key <> format('workpieces/%s/%s', p_workpiece_id, p_archive_path)
  then
    return jsonb_build_object('outcome', 'conflict', 'code', 'history_epoch_archive_registry_conflict', 'terminal', true, 'retryable', false);
  end if;

  select * into v_epoch_file
  from tongs.workpiece_files
  where workpiece_id = p_workpiece_id and path = p_epoch_path
  for update;
  if v_epoch_file.workpiece_id is null
    or v_epoch_file.revision <> p_epoch_registry_revision
    or v_epoch_file.updated_at <> p_epoch_registry_updated_at
    or lower(v_epoch_file.hash_value) <> p_epoch_sha256
    or v_epoch_file.bytes <> p_epoch_bytes
    or v_epoch_file.content_type <> 'application/json'
    or v_epoch_file.file_type <> 'hammer_history_epoch'
    or v_epoch_file.hash_algo <> 'sha256'
    or v_epoch_file.storage_bucket <> 'forge-workpieces'
    or v_epoch_file.storage_key <> format('workpieces/%s/%s', p_workpiece_id, p_epoch_path)
  then
    return jsonb_build_object('outcome', 'conflict', 'code', 'history_epoch_artifact_registry_conflict', 'terminal', true, 'retryable', false);
  end if;

  update tongs.recording_revisions
  set history_path = p_epoch_path,
      updated_at = clock_timestamp(),
      updated_by = v_actor
  where id = p_revision_id
    and workspace_id = p_workspace_id
    and workpiece_id = p_workpiece_id
    and canonical_recording_id = p_canonical_recording_id
    and status = 'active'
    and updated_at = p_expected_revision_updated_at
    and history_path is not distinct from p_expected_history_path
  returning updated_at into v_committed_updated_at;

  if v_committed_updated_at is null then
    return jsonb_build_object('outcome', 'conflict', 'code', 'history_epoch_cas_conflict', 'terminal', true, 'retryable', false);
  end if;

  insert into tongs.hammer_history_epochs (
    epoch_id, workspace_id, workpiece_id, canonical_recording_id, recording_revision_id,
    artifact_path, artifact_sha256, artifact_bytes, artifact_registry_revision, artifact_registry_updated_at,
    base_editor_state_hash, base_component_sha256, creation_reason,
    predecessor_original_path, predecessor_archive_path, predecessor_sha256, predecessor_bytes,
    predecessor_registry_revision, predecessor_registry_updated_at,
    archive_registry_revision, archive_registry_updated_at, initiating_user_id
  ) values (
    p_epoch_id, p_workspace_id, p_workpiece_id, p_canonical_recording_id, p_revision_id,
    p_epoch_path, p_epoch_sha256, p_epoch_bytes, p_epoch_registry_revision, p_epoch_registry_updated_at,
    p_base_editor_state_hash, p_base_component_sha256, 'legacy_history_unrecoverable',
    p_expected_history_path, p_archive_path, p_predecessor_sha256, p_predecessor_bytes,
    p_predecessor_registry_revision, p_predecessor_registry_updated_at,
    p_archive_registry_revision, p_archive_registry_updated_at, v_actor
  ) returning * into v_epoch;

  insert into tongs.hammer_history_epoch_transitions (
    epoch_id, workspace_id, workpiece_id, canonical_recording_id, recording_revision_id,
    idempotency_key, operation_fingerprint, expected_revision_updated_at, expected_history_path,
    committed_history_path, committed_revision_updated_at,
    predecessor_original_path, predecessor_archive_path, predecessor_sha256, predecessor_bytes,
    predecessor_registry_revision, predecessor_registry_updated_at,
    archive_registry_revision, archive_registry_updated_at,
    epoch_artifact_sha256, epoch_artifact_bytes, epoch_registry_revision, epoch_registry_updated_at,
    outcome, initiated_by
  ) values (
    p_epoch_id, p_workspace_id, p_workpiece_id, p_canonical_recording_id, p_revision_id,
    p_idempotency_key, p_operation_fingerprint, p_expected_revision_updated_at, p_expected_history_path,
    p_epoch_path, v_committed_updated_at,
    p_expected_history_path, p_archive_path, p_predecessor_sha256, p_predecessor_bytes,
    p_predecessor_registry_revision, p_predecessor_registry_updated_at,
    p_archive_registry_revision, p_archive_registry_updated_at,
    p_epoch_sha256, p_epoch_bytes, p_epoch_registry_revision, p_epoch_registry_updated_at,
    'committed', v_actor
  ) returning * into v_transition;

  return jsonb_build_object(
    'outcome', 'committed',
    'epoch_id', v_epoch.epoch_id,
    'transition_id', v_transition.transition_id,
    'history_path', v_epoch.artifact_path,
    'revision_updated_at', v_committed_updated_at,
    'operation_fingerprint', v_transition.operation_fingerprint
  );
exception
  when unique_violation then
    return jsonb_build_object('outcome', 'conflict', 'code', 'history_epoch_uniqueness_conflict', 'terminal', true, 'retryable', false);
  when foreign_key_violation or check_violation or not_null_violation then
    return jsonb_build_object('outcome', 'conflict', 'code', 'history_epoch_constraint_conflict', 'terminal', true, 'retryable', false);
end;
$$;

create or replace function tongs.read_hammer_history_epoch_operation(
  p_workspace_id uuid,
  p_workpiece_id uuid,
  p_revision_id uuid,
  p_idempotency_key text
) returns jsonb
language plpgsql
stable
security invoker
set search_path = pg_catalog, tongs
as $$
declare
  v_transition tongs.hammer_history_epoch_transitions%rowtype;
begin
  if auth.uid() is null or not tongs.has_workspace_role(p_workspace_id, 'viewer') then
    return jsonb_build_object('outcome', 'absent');
  end if;
  select * into v_transition
  from tongs.hammer_history_epoch_transitions
  where workspace_id = p_workspace_id
    and workpiece_id = p_workpiece_id
    and recording_revision_id = p_revision_id
    and idempotency_key = p_idempotency_key;
  if v_transition.transition_id is null then
    return jsonb_build_object('outcome', 'absent');
  end if;
  return jsonb_build_object(
    'outcome', 'committed',
    'epoch_id', v_transition.epoch_id,
    'transition_id', v_transition.transition_id,
    'history_path', v_transition.committed_history_path,
    'revision_updated_at', v_transition.committed_revision_updated_at,
    'operation_fingerprint', v_transition.operation_fingerprint
  );
end;
$$;

revoke all on function tongs.commit_hammer_history_epoch(uuid,uuid,uuid,uuid,uuid,text,text,timestamptz,text,bigint,timestamptz,text,bigint,text,bigint,timestamptz,text,bigint,timestamptz,text,bigint,text,jsonb) from public;
grant execute on function tongs.commit_hammer_history_epoch(uuid,uuid,uuid,uuid,uuid,text,text,timestamptz,text,bigint,timestamptz,text,bigint,text,bigint,timestamptz,text,bigint,timestamptz,text,bigint,text,jsonb) to authenticated;
grant execute on function tongs.commit_hammer_history_epoch(uuid,uuid,uuid,uuid,uuid,text,text,timestamptz,text,bigint,timestamptz,text,bigint,text,bigint,timestamptz,text,bigint,timestamptz,text,bigint,text,jsonb) to service_role;
alter function tongs.commit_hammer_history_epoch(uuid,uuid,uuid,uuid,uuid,text,text,timestamptz,text,bigint,timestamptz,text,bigint,text,bigint,timestamptz,text,bigint,timestamptz,text,bigint,text,jsonb) owner to postgres;

revoke all on function tongs.read_hammer_history_epoch_operation(uuid,uuid,uuid,text) from public;
grant execute on function tongs.read_hammer_history_epoch_operation(uuid,uuid,uuid,text) to authenticated;
grant execute on function tongs.read_hammer_history_epoch_operation(uuid,uuid,uuid,text) to service_role;
alter function tongs.read_hammer_history_epoch_operation(uuid,uuid,uuid,text) owner to postgres;

comment on table tongs.hammer_history_epochs is
  'Immutable Hammer history epoch identities and exact canonical artifact/predecessor registry evidence.';
comment on table tongs.hammer_history_epoch_transitions is
  'Append-only receipts for the sole canonical history epoch pointer transition.';
comment on function tongs.commit_hammer_history_epoch(uuid,uuid,uuid,uuid,uuid,text,text,timestamptz,text,bigint,timestamptz,text,bigint,text,bigint,timestamptz,text,bigint,timestamptz,text,bigint,text,jsonb) is
  'Atomically validates staged immutable history artifacts, records the epoch receipt, and CAS-advances recording_revisions.history_path.';

commit;
