-- Repair S5-1 manifest ordering: immutable snapshots use snapshotted_at, not created_at.
create or replace function tongs.open_quench_authority(
  p_workspace_id uuid,
  p_workpiece_id uuid,
  p_open_operation_id uuid,
  p_manifest_snapshot_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, tongs, extensions
as $$
declare
  v_user uuid := auth.uid();
  v_existing tongs.quench_open_authority_receipts%rowtype;
  v_manifest tongs.quench_release_manifest_snapshots%rowtype;
  v_fingerprint text;
  v_id uuid;
begin
  if v_user is null or not tongs.has_workspace_role(p_workspace_id, 'viewer') then
    raise exception 'Not authorized to open this Quench review' using errcode = '42501';
  end if;

  if not exists(select 1 from tongs.episodes e where e.id = p_workpiece_id and e.workspace_id = p_workspace_id) then
    return jsonb_build_object('disposition', 'identity_mismatch');
  end if;

  select * into v_existing from tongs.quench_open_authority_receipts where open_operation_id = p_open_operation_id;
  if found then
    if v_existing.workspace_id <> p_workspace_id or v_existing.workpiece_id <> p_workpiece_id
      or v_existing.requested_manifest_snapshot_id is distinct from p_manifest_snapshot_id then
      return jsonb_build_object('disposition', 'quench_open_idempotency_conflict');
    end if;
    return jsonb_build_object('disposition', 'replayed', 'open_authority_id', v_existing.id,
      'open_operation_id', v_existing.open_operation_id, 'workspace_id', v_existing.workspace_id,
      'workpiece_id', v_existing.workpiece_id, 'manifest_snapshot_id', v_existing.manifest_snapshot_id,
      'manifest_content_hash', v_existing.manifest_content_hash, 'state_version', v_existing.state_version,
      'opened_at', v_existing.created_at);
  end if;

  if p_manifest_snapshot_id is not null then
    select * into v_manifest from tongs.quench_release_manifest_snapshots
      where id = p_manifest_snapshot_id and workspace_id = p_workspace_id and workpiece_id = p_workpiece_id;
  else
    select * into v_manifest from tongs.quench_release_manifest_snapshots
      where workspace_id = p_workspace_id and workpiece_id = p_workpiece_id
      order by source_file_revision desc, snapshotted_at desc limit 1;
  end if;
  if not found then return jsonb_build_object('disposition', 'manifest_missing'); end if;

  v_fingerprint := encode(digest(concat_ws('|', p_workspace_id::text, p_workpiece_id::text,
    coalesce(p_manifest_snapshot_id::text, 'current'), v_manifest.id::text, v_manifest.manifest_content_hash), 'sha256'), 'hex');
  insert into tongs.quench_open_authority_receipts(open_operation_id, operation_fingerprint, workspace_id,
    workpiece_id, requested_manifest_snapshot_id, manifest_snapshot_id, manifest_content_hash, created_by)
  values(p_open_operation_id, v_fingerprint, p_workspace_id, p_workpiece_id, p_manifest_snapshot_id,
    v_manifest.id, v_manifest.manifest_content_hash, v_user) returning id into v_id;
  return jsonb_build_object('disposition', 'opened', 'open_authority_id', v_id,
    'open_operation_id', p_open_operation_id, 'workspace_id', p_workspace_id, 'workpiece_id', p_workpiece_id,
    'manifest_snapshot_id', v_manifest.id, 'manifest_content_hash', v_manifest.manifest_content_hash,
    'state_version', 1, 'opened_at', now());
exception when unique_violation then
  select * into v_existing from tongs.quench_open_authority_receipts where open_operation_id = p_open_operation_id;
  if found and v_existing.workspace_id = p_workspace_id and v_existing.workpiece_id = p_workpiece_id
    and v_existing.requested_manifest_snapshot_id is not distinct from p_manifest_snapshot_id then
    return jsonb_build_object('disposition', 'replayed', 'open_authority_id', v_existing.id,
      'open_operation_id', v_existing.open_operation_id, 'workspace_id', v_existing.workspace_id,
      'workpiece_id', v_existing.workpiece_id, 'manifest_snapshot_id', v_existing.manifest_snapshot_id,
      'manifest_content_hash', v_existing.manifest_content_hash, 'state_version', v_existing.state_version,
      'opened_at', v_existing.created_at);
  end if;
  return jsonb_build_object('disposition', 'quench_open_idempotency_conflict');
end; $$;

revoke all on function tongs.open_quench_authority(uuid, uuid, uuid, uuid) from public, anon;
grant execute on function tongs.open_quench_authority(uuid, uuid, uuid, uuid) to authenticated;

comment on function tongs.open_quench_authority(uuid, uuid, uuid, uuid) is
  'Opens or replays one exact Quench review authority using the canonical manifest snapshot timestamp.';
