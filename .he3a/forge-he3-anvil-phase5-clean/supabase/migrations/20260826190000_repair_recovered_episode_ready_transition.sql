-- Complete the canonical Hearth Ready transition omitted by the incident split
-- recovery for the recovered 2026-08-26 episode. Exact identity, revision, and
-- hash checks make this an idempotent evidence-bound repair.

begin;

do $repair$
declare
  v_workspace_id constant uuid := '494c2ae5-9037-4208-b898-fab4898ab430';
  v_project_id constant uuid := '95ac3ae5-dbd6-4ddc-882d-4097c5bd306b';
  v_workpiece_id constant uuid := 'c991711e-2d9b-4fd2-be94-2c5285e4c9f6';
  v_script_path constant text := 'script/script.md';
  v_script_revision constant bigint := 5;
  v_script_hash constant text := '07962918abc5962f725d54db176f3c59c154bbf7d46215fb5ad4630b73f847a9';
  v_idempotency_key constant text := 'incident:in-the-forge:2026-08-26:ready-v1';
  v_stale_transition_id constant uuid := 'ef0d0c40-3664-4af9-98b0-1d4a5aabbad1';
  v_stale_script_revision constant bigint := 2;
  v_stale_script_hash constant text := '901a6fdf16e55177529d3a1b38ab75c948701ac1761c1c3a7b89f111aa50c8e4';
  v_actor_id uuid;
  v_transition_id uuid;
  v_request_fingerprint text;
  v_publish_evidence jsonb;
  v_file tongs.workpiece_files%rowtype;
  v_existing_ready tongs.workpiece_ready_script_meta%rowtype;
begin
  -- This migration is an evidence-bound production incident repair, not a
  -- schema seed. Fresh databases and installations that never contained the
  -- incident fixture must apply the canonical chain without manufacturing it.
  select created_by into v_actor_id
  from tongs.barstock_assignments
  where id = v_project_id and workspace_id = v_workspace_id;

  if not found then
    return;
  end if;

  select * into strict v_file
  from tongs.workpiece_files
  where workpiece_id = v_workpiece_id and path = v_script_path
  for update;

  if v_file.revision <> v_script_revision or lower(v_file.hash_value) <> v_script_hash then
    raise exception 'Recovered episode script authority changed; refusing Ready repair'
      using errcode = 'P0001',
        detail = jsonb_build_object(
          'expected_revision', v_script_revision,
          'actual_revision', v_file.revision,
          'expected_hash', v_script_hash,
          'actual_hash', lower(v_file.hash_value)
        )::text;
  end if;

  v_publish_evidence := jsonb_build_object(
    'transition', 'hearth.script.published.v1',
    'script_path', v_script_path,
    'script_revision', v_script_revision,
    'script_hash', v_script_hash,
    'validation', jsonb_build_object(
      'validator_version', 'shared-script-tags-v1',
      'ok', true,
      'issue_count', 0
    ),
    'recovery_operation', 'incident:in-the-forge:2026-08-26:split-v1'
  );
  v_request_fingerprint := md5(concat_ws(chr(31),
    v_workspace_id::text,
    v_workpiece_id::text,
    v_script_path,
    v_script_revision::text,
    v_script_hash,
    v_publish_evidence::text
  ));

  select id into v_transition_id
  from tongs.workpiece_ready_transition_requests
  where workspace_id = v_workspace_id and idempotency_key = v_idempotency_key;

  if v_transition_id is null then
    insert into tongs.workpiece_ready_transition_requests (
      workspace_id, workpiece_id, script_path, script_revision, script_hash,
      idempotency_key, request_fingerprint, publish_evidence, transitioned_by
    ) values (
      v_workspace_id, v_workpiece_id, v_script_path, v_script_revision, v_script_hash,
      v_idempotency_key, v_request_fingerprint, v_publish_evidence, v_actor_id
    ) returning id into v_transition_id;
  elsif not exists (
    select 1 from tongs.workpiece_ready_transition_requests
    where id = v_transition_id
      and workpiece_id = v_workpiece_id
      and script_path = v_script_path
      and script_revision = v_script_revision
      and script_hash = v_script_hash
      and request_fingerprint = v_request_fingerprint
      and transitioned_by = v_actor_id
  ) then
    raise exception 'Recovered episode Ready repair idempotency conflict' using errcode = 'P0001';
  end if;

  select * into v_existing_ready
  from tongs.workpiece_ready_script_meta
  where workpiece_id = v_workpiece_id and script_path = v_script_path;

  if found then
    if v_existing_ready.workspace_id = v_workspace_id
      and v_existing_ready.script_revision = v_script_revision
      and v_existing_ready.script_hash = v_script_hash
      and v_existing_ready.transition_id = v_transition_id then
      null;
    elsif v_existing_ready.workspace_id <> v_workspace_id
      or v_existing_ready.script_revision <> v_stale_script_revision
      or v_existing_ready.script_hash <> v_stale_script_hash
      or v_existing_ready.transition_id <> v_stale_transition_id then
      raise exception 'Recovered episode already has conflicting Ready authority' using errcode = 'P0001';
    else
      update tongs.workpiece_ready_script_meta set
        marked_ready_by = v_actor_id,
        marked_ready_at = now(),
        updated_by = v_actor_id,
        script_revision = v_script_revision,
        script_hash = v_script_hash,
        transition_id = v_transition_id,
        publish_evidence = v_publish_evidence
      where workpiece_id = v_workpiece_id and script_path = v_script_path;
    end if;
  else
    insert into tongs.workpiece_ready_script_meta (
      workspace_id, workpiece_id, script_path, marked_ready_by, marked_ready_at,
      updated_by, script_revision, script_hash, transition_id, publish_evidence
    ) values (
      v_workspace_id, v_workpiece_id, v_script_path, v_actor_id, now(),
      v_actor_id, v_script_revision, v_script_hash, v_transition_id, v_publish_evidence
    );
  end if;
end;
$repair$;

commit;
