begin;

create or replace function tongs.adopt_repaired_image_map_for_unified_operation(
  p_operation_id text,
  p_operation_fingerprint text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, tongs
as $$
declare
  op tongs.unified_visual_plan_operations%rowtype;
  seq tongs.workpiece_image_map_sequences%rowtype;
  current_map tongs.image_map_revisions%rowtype;
  evidence jsonb;
begin
  select * into op from tongs.unified_visual_plan_operations where operation_id = p_operation_id for update;
  if not found or op.operation_fingerprint <> p_operation_fingerprint then
    return jsonb_build_object('disposition', 'operation_identity_conflict');
  end if;
  if not tongs.has_workspace_role(op.workspace_id, 'editor') then
    raise exception 'workspace editor authority required' using errcode = '42501';
  end if;
  if op.state <> 'reference_visual_plan_committed' then
    return jsonb_build_object('disposition', 'stage_conflict', 'state', op.state);
  end if;

  select * into seq
  from tongs.workpiece_image_map_sequences
  where workspace_id = op.workspace_id and workpiece_id = op.workpiece_id
  for update;
  if seq.current_revision_id = op.image_map_revision_id then
    return jsonb_build_object('disposition', 'current', 'revision_id', op.image_map_revision_id, 'revision', op.image_map_revision);
  end if;

  select * into current_map from tongs.image_map_revisions where id = seq.current_revision_id;
  if current_map.previous_revision_id is distinct from op.image_map_revision_id
    or current_map.previous_revision is distinct from op.image_map_revision
    or current_map.source_script_approval_id <> op.script_approval_id
    or current_map.source_script_approval_revision <> op.script_approval_revision
    or current_map.source_script_content_hash <> op.script_content_hash
    or current_map.anchor_contract_version <> 'forge.image-map-anchor.v1'
    or current_map.provenance_state <> 'current' then
    return jsonb_build_object(
      'disposition', 'image_repair_not_adoptable',
      'current_revision_id', current_map.id,
      'current_revision', current_map.revision
    );
  end if;

  evidence := coalesce(op.child_membership_evidence_json->'image', '{}'::jsonb)
    || jsonb_build_object(
      'authority_repair_successor', true,
      'repaired_from_revision_id', op.image_map_revision_id,
      'final_plan_revision_id', current_map.id
    );
  update tongs.unified_visual_plan_operations
  set image_map_revision_id = current_map.id,
      image_map_revision = current_map.revision,
      image_plan_content_hash = current_map.document_content_hash,
      image_plan_empty = jsonb_array_length(coalesce(current_map.document_json->'entries', '[]'::jsonb)) = 0,
      child_membership_evidence_json = child_membership_evidence_json || jsonb_build_object('image', evidence),
      failed_stage = null,
      failure_code = null,
      failure_message = null,
      updated_at = now()
  where operation_id = op.operation_id
  returning child_membership_evidence_json into evidence;

  return jsonb_build_object(
    'disposition', 'image_repair_adopted',
    'revision_id', current_map.id,
    'revision', current_map.revision,
    'membership_evidence', evidence
  );
end
$$;

revoke all on function tongs.adopt_repaired_image_map_for_unified_operation(text,text) from public, anon, authenticated;
grant execute on function tongs.adopt_repaired_image_map_for_unified_operation(text,text) to authenticated, service_role;

commit;
