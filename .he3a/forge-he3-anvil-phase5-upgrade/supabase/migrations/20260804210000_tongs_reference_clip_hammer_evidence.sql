-- Preserve the complete canonical Reference Clip evidence in Hammer readback.
create or replace function tongs.read_reference_clip_visual_package(
  p_workspace_id uuid,
  p_workpiece_id uuid
) returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, tongs
as $$
select case
  when not tongs.has_workspace_role(p_workspace_id, 'viewer') then null
  else jsonb_build_object(
    'contract_version', 'forge.reference-clips.hammer.v2',
    'workspace_id', p_workspace_id,
    'workpiece_id', p_workpiece_id,
    'clips', coalesce((
      select jsonb_agg(jsonb_build_object(
        'opportunity_id', o.opportunity_id,
        'opportunity_revision_id', o.id,
        'opportunity_revision', o.revision,
        'plan_revision_id', q.current_plan_revision_id,
        'plan_revision', q.current_plan_revision,
        'placement_hint', o.placement_hint,
        'duration_target_ms', o.duration_target_ms,
        'script_anchor', o.citation_anchor_json,
        'media_range', o.media_range_json,
        'source_revision_id', c.source_revision_id,
        'source_revision', c.source_revision,
        'source_link_revision_id', c.workpiece_source_link_revision_id,
        'source_link_revision', c.workpiece_source_link_revision,
        'candidate_revision_id', c.id,
        'candidate_revision', c.revision,
        'asset_id', c.asset_id,
        'asset_content_hash', c.asset_content_hash,
        'asset_path', c.asset_path,
        'storage_bucket', c.storage_bucket,
        'storage_key', c.storage_key,
        'mime_type', c.mime_type,
        'duration_ms', c.duration_ms,
        'poster_asset_id', c.poster_asset_id,
        'rights', c.rights_evidence_json,
        'provenance', c.provenance_json
      ) order by m.ordinal)
      from tongs.reference_clip_plan_sequences q
      join tongs.reference_clip_plan_membership m
        on m.plan_revision_id = q.current_plan_revision_id
      join tongs.reference_clip_opportunity_revisions o
        on o.id = m.opportunity_revision_id
       and o.source_status = 'linked'
      join lateral (
        select x.*
        from tongs.reference_clip_selections x
        where x.workspace_id = q.workspace_id
          and x.workpiece_id = q.workpiece_id
          and x.opportunity_id = m.opportunity_id
          and x.plan_revision_id = q.current_plan_revision_id
        order by x.revision desc
        limit 1
      ) s on true
      join tongs.reference_clip_candidate_revisions c
        on c.id = s.candidate_revision_id
      where q.workspace_id = p_workspace_id
        and q.workpiece_id = p_workpiece_id
    ), '[]'::jsonb)
  )
end
$$;

revoke all on function tongs.read_reference_clip_visual_package(uuid, uuid) from public, anon;
grant execute on function tongs.read_reference_clip_visual_package(uuid, uuid) to authenticated, service_role;
