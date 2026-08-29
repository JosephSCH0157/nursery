begin;

-- Editorial authority is revision-owned. The 16:00 wrapper accidentally
-- addressed its columns on hammer_workpiece_state, so PostgreSQL rejected the
-- statement before any take adoption could commit.
create or replace function tongs.adopt_latest_kept_take_for_hammer(
  p_workspace_id uuid,p_workpiece_id uuid,p_operation_key text
) returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $$
declare
  v_result jsonb; v_outcome text; v_canonical_id uuid; v_actor uuid:=auth.uid();
  v_episode tongs.episodes%rowtype; v_revision tongs.recording_revisions%rowtype;
begin
  v_result:=tongs.adopt_latest_kept_take_for_hammer_pre_lineage(p_workspace_id,p_workpiece_id,p_operation_key);
  v_outcome:=v_result->>'outcome';
  if v_outcome not in ('adopted','duplicate') then return v_result; end if;
  v_canonical_id:=nullif(v_result->'canonical_recording'->>'id','')::uuid;
  if v_actor is null or v_canonical_id is null then
    raise exception 'Take adoption returned incomplete lineage authority' using errcode='55000';
  end if;

  select * into v_episode from tongs.episodes
  where id=p_workpiece_id and workspace_id=p_workspace_id for update;
  if not found or v_episode.canonical_recording_id is distinct from v_canonical_id then
    raise exception 'Take adoption lineage relationship mismatch' using errcode='55000';
  end if;

  if v_episode.active_revision_id is not null then
    select * into v_revision from tongs.recording_revisions
    where id=v_episode.active_revision_id and workspace_id=p_workspace_id
      and workpiece_id=p_workpiece_id and canonical_recording_id=v_canonical_id and status='active';
  end if;
  if v_revision.id is not null then
    return v_result||jsonb_build_object('recording_revision',to_jsonb(v_revision));
  end if;

  update tongs.recording_revisions set status='superseded',updated_by=v_actor,updated_at=now()
  where workspace_id=p_workspace_id and workpiece_id=p_workpiece_id and status='active';
  insert into tongs.recording_revisions(
    workspace_id,workpiece_id,canonical_recording_id,status,label,created_by,updated_by
  ) values (
    p_workspace_id,p_workpiece_id,v_canonical_id,'active','Fresh lineage for adopted take',v_actor,v_actor
  ) returning * into v_revision;
  update tongs.episodes set active_revision_id=v_revision.id,updated_at=now()
  where id=p_workpiece_id and workspace_id=p_workspace_id;

  -- Reset only columns actually owned by the mutable current-workpiece
  -- compatibility projection. The newly inserted revision starts with empty
  -- revision-owned editorial authority by construction.
  update tongs.hammer_workpiece_state set
    active_session_id=null,prep_status='idle',alignment_status='not_started',
    current_pass='transcript_cleanup',pass_status='{}'::jsonb,
    editor_session_path=null,transcript_artifact_path=null,speaker_map_artifact_path=null,
    visual_placement_artifact_path=null,audio_polish_artifact_path=null,
    edit_plan_artifact_path=null,transcript_versions_artifact_path=null,
    edit_plan_signature=null,macro_recipe_ref=null,last_macro_run_ref=null,
    updated_at=now(),updated_by=v_actor
  where workspace_id=p_workspace_id and workpiece_id=p_workpiece_id;

  return v_result||jsonb_build_object('recording_revision',to_jsonb(v_revision));
end $$;

revoke all on function tongs.adopt_latest_kept_take_for_hammer(uuid,uuid,text) from public,anon;
grant execute on function tongs.adopt_latest_kept_take_for_hammer(uuid,uuid,text) to authenticated,service_role;

commit;
