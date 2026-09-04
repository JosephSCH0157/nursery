begin;

create or replace function tongs.record_unified_image_plan_membership(
  p_operation_id text,
  p_operation_fingerprint text,
  p_provider_plan_revision_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, tongs
as $$
declare
  op tongs.unified_visual_plan_operations%rowtype;
  seq tongs.workpiece_image_map_sequences%rowtype;
  plan tongs.image_map_revisions%rowtype;
  retained jsonb;
  result jsonb;
begin
  select * into op from tongs.unified_visual_plan_operations where operation_id=p_operation_id for update;
  if not found or op.operation_fingerprint<>p_operation_fingerprint then
    return jsonb_build_object('disposition','operation_identity_conflict');
  end if;
  if not tongs.has_workspace_role(op.workspace_id,'editor') then
    raise exception 'workspace editor authority required' using errcode='42501';
  end if;
  if op.child_membership_evidence_json ? 'image' then
    return jsonb_build_object('disposition','replay','revision_id',op.child_membership_evidence_json->'image'->>'final_plan_revision_id','membership_evidence',op.child_membership_evidence_json);
  end if;
  select * into seq from tongs.workpiece_image_map_sequences where workspace_id=op.workspace_id and workpiece_id=op.workpiece_id for update;
  if not found or seq.current_revision_id is distinct from p_provider_plan_revision_id then
    return jsonb_build_object('disposition','provider_child_not_current');
  end if;
  select * into plan from tongs.image_map_revisions where id=p_provider_plan_revision_id;
  select coalesce(jsonb_agg(jsonb_build_object('entry_id',entry->>'id','selected_asset_id',entry->>'selected_asset_id') order by entry->>'id'),'[]'::jsonb)
    into retained
    from jsonb_array_elements(coalesce(plan.document_json->'entries','[]'::jsonb)) entry
    where nullif(entry->>'selected_asset_id','') is not null;
  update tongs.unified_visual_plan_operations
    set child_membership_evidence_json=child_membership_evidence_json||jsonb_build_object('image',jsonb_build_object(
      'provider_plan_revision_id',p_provider_plan_revision_id,
      'final_plan_revision_id',p_provider_plan_revision_id,
      'provider_proposed',true,
      'creator_retained',retained,
      'creator_added','[]'::jsonb
    )),updated_at=now()
    where operation_id=op.operation_id
    returning child_membership_evidence_json into result;
  return jsonb_build_object('disposition','retained','revision_id',p_provider_plan_revision_id,'retained_count',jsonb_array_length(retained),'membership_evidence',result);
end;
$$;

revoke all on function tongs.record_unified_image_plan_membership(text,text,uuid) from public,anon;
grant execute on function tongs.record_unified_image_plan_membership(text,text,uuid) to authenticated,service_role;

commit;
