begin;

do $$
declare v_short tongs.hammer_short_derivatives%rowtype; v_basis tongs.hammer_shorts_basis_locks%rowtype; v_parent tongs.canonical_recordings%rowtype; v_canonical uuid; v_revision uuid;
begin
  for v_short in select * from tongs.hammer_short_derivatives where child_canonical_recording_id is null or child_recording_revision_id is null for update loop
    select * into v_basis from tongs.hammer_shorts_basis_locks where id=v_short.basis_lock_id;
    select * into v_parent from tongs.canonical_recordings where id=v_basis.canonical_recording_id;
    v_canonical:=coalesce(v_short.child_canonical_recording_id,gen_random_uuid());
    v_revision:=coalesce(v_short.child_recording_revision_id,gen_random_uuid());
    if v_short.child_canonical_recording_id is null then
      insert into tongs.canonical_recordings(id,workspace_id,workpiece_id,status,kept_take_event_id,media_path,media_content_type,media_bytes,media_duration_ms,recording_session_id,anvil_capture_session_id,media_id,media_signature,created_by,updated_by)
      values(v_canonical,v_short.workspace_id,v_short.child_workpiece_id,'draft',v_parent.kept_take_event_id,v_parent.media_path,v_parent.media_content_type,v_parent.media_bytes,v_parent.media_duration_ms,v_parent.recording_session_id,v_parent.anvil_capture_session_id,v_parent.media_id,v_parent.media_signature,v_short.created_by,v_short.created_by);
    end if;
    if v_short.child_recording_revision_id is null then
      insert into tongs.recording_revisions(id,workspace_id,workpiece_id,canonical_recording_id,status,label,created_by,updated_by)
      values(v_revision,v_short.workspace_id,v_short.child_workpiece_id,v_canonical,'active','Projected Short',v_short.created_by,v_short.created_by);
    end if;
    update tongs.hammer_short_derivatives set child_canonical_recording_id=v_canonical,child_recording_revision_id=v_revision,state='preparing' where id=v_short.id;
    update tongs.episodes set active_revision_id=null where id=v_short.child_workpiece_id;
  end loop;
end $$;

alter table tongs.hammer_short_derivatives
  alter column child_canonical_recording_id set not null,
  alter column child_recording_revision_id set not null;

create or replace function tongs.reserve_hammer_short_derivative(
  p_candidate_id uuid,
  p_display_label text,
  p_operation_id text,
  p_operation_fingerprint text
) returns jsonb
language plpgsql
security definer
set search_path=tongs,public
as $$
declare
  v_actor uuid:=auth.uid();
  v_candidate tongs.hammer_short_candidates%rowtype;
  v_basis tongs.hammer_shorts_basis_locks%rowtype;
  v_parent tongs.canonical_recordings%rowtype;
  v_existing tongs.hammer_short_derivatives%rowtype;
  v_child uuid:=gen_random_uuid();
  v_canonical uuid:=gen_random_uuid();
  v_revision uuid:=gen_random_uuid();
  v_head uuid;
begin
  if p_operation_fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception 'hammer_shorts_fingerprint_invalid' using errcode='22023';
  end if;
  select * into v_candidate from tongs.hammer_short_candidates where id=p_candidate_id;
  select * into v_basis from tongs.hammer_shorts_basis_locks where id=v_candidate.basis_lock_id;
  if v_actor is null or v_candidate.id is null or not tongs.has_workspace_role(v_candidate.workspace_id,'editor') then
    raise exception 'hammer_shorts_editor_required' using errcode='42501';
  end if;
  select * into v_existing from tongs.hammer_short_derivatives where operation_id=p_operation_id or candidate_id=p_candidate_id;
  if found then
    if v_existing.operation_fingerprint <> p_operation_fingerprint then
      raise exception 'hammer_shorts_operation_conflict' using errcode='40001';
    end if;
    return to_jsonb(v_existing);
  end if;
  if v_candidate.rejected_at is not null then
    raise exception 'hammer_shorts_candidate_rejected' using errcode='40001';
  end if;
  select head_id into v_head from tongs.hammer_history_epoch_heads where recording_revision_id=v_basis.recording_revision_id order by sequence desc limit 1;
  if v_head is distinct from v_basis.history_head_id or exists(
    select 1 from tongs.episodes e where e.id=v_basis.parent_workpiece_id and e.active_revision_id is distinct from v_basis.recording_revision_id
  ) then
    raise exception 'hammer_shorts_candidate_stale' using errcode='40001';
  end if;
  select * into v_parent from tongs.canonical_recordings where id=v_basis.canonical_recording_id;
  if v_parent.id is null then raise exception 'hammer_shorts_parent_recording_missing' using errcode='40001'; end if;

  insert into tongs.episodes(id,workspace_id,label,created_by,creation_origin,lifecycle_state,active_revision_id)
  values(v_child,v_candidate.workspace_id,coalesce(nullif(trim(p_display_label),''),'Short'),v_actor,'hammer_short_derivative_v1','active',null);
  insert into tongs.canonical_recordings(
    id,workspace_id,workpiece_id,status,kept_take_event_id,media_path,media_content_type,media_bytes,media_duration_ms,
    recording_session_id,anvil_capture_session_id,media_id,media_signature,created_by,updated_by
  ) values(
    v_canonical,v_candidate.workspace_id,v_child,'draft',v_parent.kept_take_event_id,v_parent.media_path,v_parent.media_content_type,
    v_parent.media_bytes,v_parent.media_duration_ms,v_parent.recording_session_id,v_parent.anvil_capture_session_id,v_parent.media_id,
    v_parent.media_signature,v_actor,v_actor
  );
  insert into tongs.recording_revisions(id,workspace_id,workpiece_id,canonical_recording_id,status,label,created_by,updated_by)
  values(v_revision,v_candidate.workspace_id,v_child,v_canonical,'active','Projected Short',v_actor,v_actor);
  insert into tongs.hammer_short_derivatives(
    workspace_id,basis_lock_id,candidate_id,child_workpiece_id,child_canonical_recording_id,child_recording_revision_id,
    state,core_range,envelope_range,operation_id,operation_fingerprint,created_by
  ) values(
    v_candidate.workspace_id,v_basis.id,v_candidate.id,v_child,v_canonical,v_revision,'preparing',
    jsonb_build_object('start_sec',v_candidate.core_output_start_sec,'end_sec',v_candidate.core_output_end_sec),
    jsonb_build_object('start_sec',v_candidate.envelope_output_start_sec,'end_sec',v_candidate.envelope_output_end_sec),
    p_operation_id,p_operation_fingerprint,v_actor
  ) returning * into v_existing;
  return to_jsonb(v_existing);
end $$;

create or replace function tongs.reject_hammer_short_candidate(p_candidate_id uuid) returns jsonb
language plpgsql security definer set search_path=tongs,public as $$
declare v_actor uuid:=auth.uid(); v_row tongs.hammer_short_candidates%rowtype;
begin
  select * into v_row from tongs.hammer_short_candidates where id=p_candidate_id for update;
  if v_actor is null or v_row.id is null or not tongs.has_workspace_role(v_row.workspace_id,'editor') then
    raise exception 'hammer_shorts_editor_required' using errcode='42501';
  end if;
  if exists(select 1 from tongs.hammer_short_derivatives where candidate_id=v_row.id) then
    raise exception 'hammer_shorts_candidate_already_selected' using errcode='40001';
  end if;
  update tongs.hammer_short_candidates set rejected_at=coalesce(rejected_at,now()),rejected_by=coalesce(rejected_by,v_actor)
  where id=v_row.id returning * into v_row;
  return to_jsonb(v_row);
end $$;

create or replace function tongs.fail_hammer_shorts_discovery(p_discovery_id uuid,p_failure_code text) returns jsonb
language plpgsql security definer set search_path=tongs,public as $$
declare v_actor uuid:=auth.uid(); v_row tongs.hammer_shorts_discoveries%rowtype;
begin
  select * into v_row from tongs.hammer_shorts_discoveries where id=p_discovery_id for update;
  if v_actor is null or v_row.id is null or not tongs.has_workspace_role(v_row.workspace_id,'editor') then
    raise exception 'hammer_shorts_editor_required' using errcode='42501';
  end if;
  if v_row.state='completed' then return to_jsonb(v_row); end if;
  update tongs.hammer_shorts_discoveries set state='failed',failure_code=left(coalesce(nullif(trim(p_failure_code),''),'provider_failed'),120),completed_at=now()
    where id=v_row.id returning * into v_row;
  return to_jsonb(v_row);
end $$;

create or replace function tongs.fail_hammer_short_derivative(p_derivative_id uuid,p_failure_code text) returns jsonb
language plpgsql security definer set search_path=tongs,public as $$
declare v_actor uuid:=auth.uid(); v_row tongs.hammer_short_derivatives%rowtype;
begin
  select * into v_row from tongs.hammer_short_derivatives where id=p_derivative_id for update;
  if v_actor is null or v_row.id is null or not tongs.has_workspace_role(v_row.workspace_id,'editor') then
    raise exception 'hammer_shorts_editor_required' using errcode='42501';
  end if;
  if v_row.state='ready' then raise exception 'hammer_short_derivative_already_ready' using errcode='40001'; end if;
  update tongs.hammer_short_derivatives set state='failed',failure_code=left(coalesce(nullif(trim(p_failure_code),''),'projection_failed'),120)
  where id=v_row.id returning * into v_row;
  return to_jsonb(v_row);
end $$;

create or replace function tongs.authorize_hammer_short_derivative_preparation(p_derivative_id uuid) returns jsonb
language plpgsql security definer set search_path=tongs,public as $$
declare v_actor uuid:=auth.uid(); v_row tongs.hammer_short_derivatives%rowtype;
begin
  select * into v_row from tongs.hammer_short_derivatives where id=p_derivative_id;
  if v_actor is null or v_row.id is null or not tongs.has_workspace_role(v_row.workspace_id,'editor') then
    raise exception 'hammer_shorts_editor_required' using errcode='42501';
  end if;
  if v_row.state not in('preparing','failed') then raise exception 'hammer_short_derivative_not_preparing' using errcode='40001'; end if;
  return to_jsonb(v_row);
end $$;

create or replace function tongs.finalize_hammer_short_derivative(p_derivative_id uuid,p_artifact_authority jsonb) returns jsonb
language plpgsql security definer set search_path=tongs,public as $$
declare
  v_actor uuid:=auth.uid(); v_short tongs.hammer_short_derivatives%rowtype; v_basis tongs.hammer_shorts_basis_locks%rowtype;
  v_path text; v_expected jsonb; v_file tongs.workpiece_files%rowtype; v_derivation uuid;
  v_required constant text[]:=array['transcript','timing_map','editor_session','visual_timeline','visual_placements','audio_polish','history'];
begin
  select * into v_short from tongs.hammer_short_derivatives where id=p_derivative_id for update;
  select * into v_basis from tongs.hammer_shorts_basis_locks where id=v_short.basis_lock_id;
  if v_actor is null or v_short.id is null or not tongs.has_workspace_role(v_short.workspace_id,'editor') then
    raise exception 'hammer_shorts_editor_required' using errcode='42501';
  end if;
  if v_short.state='ready' then return to_jsonb(v_short); end if;
  if jsonb_typeof(p_artifact_authority)<>'object' or not(p_artifact_authority ?& v_required) then
    raise exception 'hammer_short_artifact_authority_invalid' using errcode='22023';
  end if;
  foreach v_path in array v_required loop
    v_expected:=p_artifact_authority->v_path;
    if jsonb_typeof(v_expected)<>'object' or coalesce(v_expected->>'path','')='' or coalesce(v_expected->>'sha256','')!~'^[0-9a-f]{64}$' or coalesce((v_expected->>'bytes')::bigint,0)<=0 then
      raise exception 'hammer_short_artifact_authority_invalid' using errcode='22023';
    end if;
    select * into v_file from tongs.workpiece_files
      where workpiece_id=v_short.child_workpiece_id and path=v_expected->>'path';
    if v_file.workpiece_id is null or lower(v_file.hash_value)<>v_expected->>'sha256' or v_file.bytes<>(v_expected->>'bytes')::bigint then
      raise exception 'hammer_short_artifact_verification_failed' using errcode='40001';
    end if;
  end loop;
  update tongs.canonical_recordings set
    baseline_transcript_path=p_artifact_authority->'transcript'->>'path',
    baseline_timing_path=p_artifact_authority->'timing_map'->>'path',status='sealed',sealed_at=now(),updated_by=v_actor
    where id=v_short.child_canonical_recording_id;
  update tongs.recording_revisions set
    editor_session_path=p_artifact_authority->'editor_session'->>'path',revision_transcript_path=p_artifact_authority->'transcript'->>'path',
    audio_polish_path=p_artifact_authority->'audio_polish'->>'path',visual_timeline_path=p_artifact_authority->'visual_timeline'->>'path',
    visual_placements_path=p_artifact_authority->'visual_placements'->>'path',history_path=p_artifact_authority->'history'->>'path',updated_by=v_actor
    where id=v_short.child_recording_revision_id;
  update tongs.episodes set active_revision_id=v_short.child_recording_revision_id where id=v_short.child_workpiece_id;
  insert into tongs.workpiece_derivations(workspace_id,parent_workpiece_id,child_workpiece_id,derivative_kind,operation_id,operation_fingerprint,created_by)
  values(v_short.workspace_id,v_basis.parent_workpiece_id,v_short.child_workpiece_id,'short',v_short.operation_id,v_short.operation_fingerprint,v_actor)
  on conflict(operation_id) do nothing;
  select id into v_derivation from tongs.workpiece_derivations where operation_id=v_short.operation_id;
  update tongs.hammer_short_derivatives set derivation_id=v_derivation,state='ready',artifact_authority=p_artifact_authority,failure_code=null,finalized_at=now()
    where id=v_short.id returning * into v_short;
  return to_jsonb(v_short);
end $$;

revoke all on function tongs.reject_hammer_short_candidate(uuid) from public;
revoke all on function tongs.fail_hammer_shorts_discovery(uuid,text) from public;
revoke all on function tongs.fail_hammer_short_derivative(uuid,text) from public;
revoke all on function tongs.authorize_hammer_short_derivative_preparation(uuid) from public;
grant execute on function tongs.reject_hammer_short_candidate(uuid) to authenticated,service_role;
grant execute on function tongs.fail_hammer_shorts_discovery(uuid,text) to authenticated,service_role;
grant execute on function tongs.fail_hammer_short_derivative(uuid,text) to authenticated,service_role;
grant execute on function tongs.authorize_hammer_short_derivative_preparation(uuid) to authenticated,service_role;

commit;
