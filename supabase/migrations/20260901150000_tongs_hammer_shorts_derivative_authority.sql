begin;

create table tongs.hammer_shorts_basis_locks (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references tongs.workspaces(id) on delete cascade,
  parent_workpiece_id uuid not null references tongs.episodes(id) on delete cascade, canonical_recording_id uuid not null references tongs.canonical_recordings(id) on delete restrict,
  recording_revision_id uuid not null references tongs.recording_revisions(id) on delete restrict, history_epoch_id uuid not null, history_head_id uuid not null references tongs.hammer_history_epoch_heads(head_id) on delete restrict,
  history_sequence bigint not null check(history_sequence>0), editor_state_hash text not null, transcript_fingerprint text not null check(transcript_fingerprint~'^[0-9a-f]{64}$'),
  timeline_fingerprint text not null check(timeline_fingerprint~'^[0-9a-f]{64}$'), render_assembly_fingerprint text not null check(render_assembly_fingerprint~'^[0-9a-f]{64}$'),
  output_time_map_fingerprint text not null check(output_time_map_fingerprint~'^[0-9a-f]{64}$'), basis_fingerprint text not null unique check(basis_fingerprint~'^[0-9a-f]{64}$'),
  operation_id text not null unique, operation_fingerprint text not null check(operation_fingerprint~'^[0-9a-f]{64}$'), locked_at timestamptz not null default now(), locked_by uuid not null references auth.users(id),
  foreign key(history_epoch_id,workspace_id,parent_workpiece_id,canonical_recording_id,recording_revision_id) references tongs.hammer_history_epochs(epoch_id,workspace_id,workpiece_id,canonical_recording_id,recording_revision_id) on delete restrict
);

create table tongs.hammer_shorts_discoveries (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references tongs.workspaces(id) on delete cascade, parent_workpiece_id uuid not null references tongs.episodes(id) on delete cascade,
  basis_lock_id uuid not null references tongs.hammer_shorts_basis_locks(id) on delete restrict, goal text not null check(goal in('drive_to_full_episode','standalone')),
  duration_preset text not null check(duration_preset in('about_30s','about_60s','about_90s','custom')), minimum_duration_sec numeric not null check(minimum_duration_sec>0), maximum_duration_sec numeric not null check(maximum_duration_sec>=minimum_duration_sec),
  target_candidate_count integer not null check(target_candidate_count in(3,4)), prompt_version text not null, contract_version text not null, provider text not null check(provider='openai'), model text not null,
  request_fingerprint text not null check(request_fingerprint~'^[0-9a-f]{64}$'), operation_id text not null unique, operation_fingerprint text not null check(operation_fingerprint~'^[0-9a-f]{64}$'),
  state text not null default 'reserved' check(state in('reserved','running','completed','failed')), outcome text null check(outcome in('complete','partial','empty')), failure_code text null,
  created_at timestamptz not null default now(), created_by uuid not null references auth.users(id), completed_at timestamptz null
);

create table tongs.hammer_shorts_ai_proposals (
  id uuid primary key default gen_random_uuid(), discovery_id uuid not null unique references tongs.hammer_shorts_discoveries(id) on delete cascade,
  workspace_id uuid not null references tongs.workspaces(id) on delete cascade, schema_version text not null check(schema_version='HammerShortsAiProposalV1'), provider text not null check(provider='openai'), model text not null,
  provider_request_id text null, prompt_fingerprint text not null check(prompt_fingerprint~'^[0-9a-f]{64}$'), proposal_json jsonb not null, proposal_fingerprint text not null unique check(proposal_fingerprint~'^[0-9a-f]{64}$'), created_at timestamptz not null default now()
);

create table tongs.hammer_short_candidates (
  id uuid primary key, discovery_id uuid not null references tongs.hammer_shorts_discoveries(id) on delete cascade, basis_lock_id uuid not null references tongs.hammer_shorts_basis_locks(id) on delete restrict,
  workspace_id uuid not null references tongs.workspaces(id) on delete cascade, parent_workpiece_id uuid not null references tongs.episodes(id) on delete cascade,
  proposal_id text not null, rank integer not null check(rank>0), segment_ids jsonb not null, core_output_start_sec numeric not null check(core_output_start_sec>=0), core_output_end_sec numeric not null,
  duration_sec numeric not null check(duration_sec>0), envelope_output_start_sec numeric not null check(envelope_output_start_sec>=0), envelope_output_end_sec numeric not null,
  source_intervals jsonb not null, transcript_excerpt text not null, rationale text not null, goal_fit text not null, candidate_fingerprint text not null unique check(candidate_fingerprint~'^[0-9a-f]{64}$'),
  rejected_at timestamptz null, rejected_by uuid null references auth.users(id), created_at timestamptz not null default now(),
  unique(discovery_id,proposal_id), check(core_output_end_sec>core_output_start_sec), check(envelope_output_start_sec<=core_output_start_sec), check(envelope_output_end_sec>=core_output_end_sec)
);

create table tongs.workpiece_derivations (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references tongs.workspaces(id) on delete cascade, parent_workpiece_id uuid not null references tongs.episodes(id) on delete restrict,
  child_workpiece_id uuid not null unique references tongs.episodes(id) on delete restrict, derivative_kind text not null check(derivative_kind in('short')), operation_id text not null unique,
  operation_fingerprint text not null check(operation_fingerprint~'^[0-9a-f]{64}$'), created_at timestamptz not null default now(), created_by uuid not null references auth.users(id), check(parent_workpiece_id<>child_workpiece_id)
);

create table tongs.hammer_short_derivatives (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references tongs.workspaces(id) on delete cascade, derivation_id uuid null unique references tongs.workpiece_derivations(id) on delete restrict,
  basis_lock_id uuid not null references tongs.hammer_shorts_basis_locks(id) on delete restrict, candidate_id uuid not null unique references tongs.hammer_short_candidates(id) on delete restrict,
  child_workpiece_id uuid not null unique references tongs.episodes(id) on delete restrict, child_canonical_recording_id uuid null unique references tongs.canonical_recordings(id) on delete restrict,
  child_recording_revision_id uuid null unique references tongs.recording_revisions(id) on delete restrict, state text not null default 'reserved' check(state in('reserved','preparing','ready','failed')),
  intended_aspect_ratio text not null default '9:16' check(intended_aspect_ratio='9:16'), core_range jsonb not null, envelope_range jsonb not null, artifact_authority jsonb null,
  operation_id text not null unique, operation_fingerprint text not null check(operation_fingerprint~'^[0-9a-f]{64}$'), failure_code text null, reserved_at timestamptz not null default now(), finalized_at timestamptz null, created_by uuid not null references auth.users(id)
);

create index hammer_shorts_basis_parent_idx on tongs.hammer_shorts_basis_locks(parent_workpiece_id,locked_at desc);
create index hammer_shorts_discoveries_parent_idx on tongs.hammer_shorts_discoveries(parent_workpiece_id,created_at desc);
create index hammer_short_candidates_discovery_idx on tongs.hammer_short_candidates(discovery_id,rank);
create index workpiece_derivations_parent_idx on tongs.workpiece_derivations(parent_workpiece_id,created_at desc);

create or replace function tongs.reject_hammer_shorts_immutable_mutation() returns trigger language plpgsql as $$ begin raise exception 'hammer_shorts_canonical_evidence_immutable' using errcode='55000'; end $$;
create trigger trg_hammer_shorts_basis_immutable before update or delete on tongs.hammer_shorts_basis_locks for each row execute function tongs.reject_hammer_shorts_immutable_mutation();
create trigger trg_hammer_shorts_ai_proposal_immutable before update or delete on tongs.hammer_shorts_ai_proposals for each row execute function tongs.reject_hammer_shorts_immutable_mutation();
create trigger trg_workpiece_derivation_immutable before update or delete on tongs.workpiece_derivations for each row execute function tongs.reject_hammer_shorts_immutable_mutation();

alter table tongs.hammer_shorts_basis_locks enable row level security; alter table tongs.hammer_shorts_discoveries enable row level security;
alter table tongs.hammer_shorts_ai_proposals enable row level security; alter table tongs.hammer_short_candidates enable row level security;
alter table tongs.workpiece_derivations enable row level security; alter table tongs.hammer_short_derivatives enable row level security;

do $$ declare v_table text; begin foreach v_table in array array['hammer_shorts_basis_locks','hammer_shorts_discoveries','hammer_shorts_ai_proposals','hammer_short_candidates','workpiece_derivations','hammer_short_derivatives'] loop
  execute format('create policy %I on tongs.%I for select to authenticated using (tongs.has_workspace_role(workspace_id,''viewer''))',v_table||'_viewer_select',v_table);
  execute format('grant select on tongs.%I to authenticated',v_table); execute format('grant all on tongs.%I to service_role',v_table);
end loop; end $$;

create or replace function tongs.lock_hammer_shorts_basis(p_basis jsonb,p_operation_id text,p_operation_fingerprint text) returns jsonb language plpgsql security definer set search_path=tongs,public,extensions as $$
declare v_actor uuid:=auth.uid(); v_row tongs.hammer_shorts_basis_locks%rowtype; v_head tongs.hammer_history_epoch_heads%rowtype;
begin
  if v_actor is null or not tongs.has_workspace_role((p_basis->>'workspace_id')::uuid,'editor') then raise exception 'hammer_shorts_editor_required' using errcode='42501'; end if;
  if p_operation_fingerprint!~'^[0-9a-f]{64}$' or p_basis->>'basis_fingerprint'!~'^[0-9a-f]{64}$' then raise exception 'hammer_shorts_fingerprint_invalid' using errcode='22023'; end if;
  select * into v_row from tongs.hammer_shorts_basis_locks where operation_id=p_operation_id; if found then return to_jsonb(v_row); end if;
  select * into v_head from tongs.hammer_history_epoch_heads where head_id=(p_basis->>'history_head_id')::uuid;
  if v_head.head_id is null or v_head.workspace_id<>(p_basis->>'workspace_id')::uuid or v_head.workpiece_id<>(p_basis->>'parent_workpiece_id')::uuid or v_head.recording_revision_id<>(p_basis->>'recording_revision_id')::uuid or v_head.result_editor_state_hash<>p_basis->>'editor_state_hash' then raise exception 'hammer_shorts_basis_not_current' using errcode='40001'; end if;
  if exists(select 1 from tongs.hammer_history_epoch_heads h where h.recording_revision_id=v_head.recording_revision_id and h.sequence>v_head.sequence) then raise exception 'hammer_shorts_basis_not_current' using errcode='40001'; end if;
  insert into tongs.hammer_shorts_basis_locks(workspace_id,parent_workpiece_id,canonical_recording_id,recording_revision_id,history_epoch_id,history_head_id,history_sequence,editor_state_hash,transcript_fingerprint,timeline_fingerprint,render_assembly_fingerprint,output_time_map_fingerprint,basis_fingerprint,operation_id,operation_fingerprint,locked_by)
  values((p_basis->>'workspace_id')::uuid,(p_basis->>'parent_workpiece_id')::uuid,(p_basis->>'canonical_recording_id')::uuid,(p_basis->>'recording_revision_id')::uuid,(p_basis->>'history_epoch_id')::uuid,(p_basis->>'history_head_id')::uuid,(p_basis->>'history_sequence')::bigint,p_basis->>'editor_state_hash',p_basis->>'transcript_fingerprint',p_basis->>'timeline_fingerprint',p_basis->>'render_assembly_fingerprint',p_basis->>'output_time_map_fingerprint',p_basis->>'basis_fingerprint',p_operation_id,p_operation_fingerprint,v_actor) returning * into v_row; return to_jsonb(v_row);
end $$;

create or replace function tongs.reserve_hammer_shorts_discovery(p_request jsonb,p_operation_id text,p_operation_fingerprint text) returns jsonb language plpgsql security definer set search_path=tongs,public as $$
declare v_actor uuid:=auth.uid(); v_basis tongs.hammer_shorts_basis_locks%rowtype; v_row tongs.hammer_shorts_discoveries%rowtype;
begin
  select * into v_basis from tongs.hammer_shorts_basis_locks where id=(p_request->>'basis_lock_id')::uuid;
  if v_actor is null or v_basis.id is null or not tongs.has_workspace_role(v_basis.workspace_id,'editor') then raise exception 'hammer_shorts_editor_required' using errcode='42501'; end if;
  select * into v_row from tongs.hammer_shorts_discoveries where operation_id=p_operation_id; if found then return to_jsonb(v_row); end if;
  insert into tongs.hammer_shorts_discoveries(workspace_id,parent_workpiece_id,basis_lock_id,goal,duration_preset,minimum_duration_sec,maximum_duration_sec,target_candidate_count,prompt_version,contract_version,provider,model,request_fingerprint,operation_id,operation_fingerprint,created_by)
  values(v_basis.workspace_id,v_basis.parent_workpiece_id,v_basis.id,p_request->>'goal',p_request->>'duration_preset',(p_request->>'minimum_duration_sec')::numeric,(p_request->>'maximum_duration_sec')::numeric,(p_request->>'target_candidate_count')::integer,p_request->>'prompt_version',p_request->>'contract_version','openai',p_request->>'model',p_request->>'request_fingerprint',p_operation_id,p_operation_fingerprint,v_actor) returning * into v_row; return to_jsonb(v_row);
end $$;

create or replace function tongs.complete_hammer_shorts_discovery(p_discovery_id uuid,p_ai_proposal jsonb,p_candidates jsonb,p_outcome text,p_proposal_fingerprint text) returns jsonb language plpgsql security definer set search_path=tongs,public as $$
declare v_actor uuid:=auth.uid(); v_discovery tongs.hammer_shorts_discoveries%rowtype; v_candidate jsonb;
begin
  select * into v_discovery from tongs.hammer_shorts_discoveries where id=p_discovery_id for update;
  if v_actor is null or v_discovery.id is null or not tongs.has_workspace_role(v_discovery.workspace_id,'editor') then raise exception 'hammer_shorts_editor_required' using errcode='42501'; end if;
  if v_discovery.state='completed' then return jsonb_build_object('discovery',to_jsonb(v_discovery),'candidates',(select coalesce(jsonb_agg(to_jsonb(c) order by c.rank),'[]'::jsonb) from tongs.hammer_short_candidates c where c.discovery_id=p_discovery_id)); end if;
  if p_outcome not in('complete','partial','empty') or jsonb_typeof(p_candidates)<>'array' or jsonb_array_length(p_candidates)>4 then raise exception 'hammer_shorts_result_invalid' using errcode='22023'; end if;
  insert into tongs.hammer_shorts_ai_proposals(discovery_id,workspace_id,schema_version,provider,model,provider_request_id,prompt_fingerprint,proposal_json,proposal_fingerprint) values(p_discovery_id,v_discovery.workspace_id,'HammerShortsAiProposalV1','openai',p_ai_proposal->>'model',p_ai_proposal->>'provider_request_id',p_ai_proposal->>'prompt_fingerprint',p_ai_proposal,p_proposal_fingerprint);
  for v_candidate in select value from jsonb_array_elements(p_candidates) loop
    insert into tongs.hammer_short_candidates(id,discovery_id,basis_lock_id,workspace_id,parent_workpiece_id,proposal_id,rank,segment_ids,core_output_start_sec,core_output_end_sec,duration_sec,envelope_output_start_sec,envelope_output_end_sec,source_intervals,transcript_excerpt,rationale,goal_fit,candidate_fingerprint)
    values((v_candidate->>'candidate_id')::uuid,p_discovery_id,v_discovery.basis_lock_id,v_discovery.workspace_id,v_discovery.parent_workpiece_id,v_candidate->>'proposal_id',(v_candidate->>'rank')::integer,v_candidate->'segment_ids',(v_candidate->>'core_output_start_sec')::numeric,(v_candidate->>'core_output_end_sec')::numeric,(v_candidate->>'duration_sec')::numeric,(v_candidate->>'envelope_output_start_sec')::numeric,(v_candidate->>'envelope_output_end_sec')::numeric,v_candidate->'source_intervals',v_candidate->>'transcript_excerpt',v_candidate->>'rationale',v_candidate->>'goal_fit',v_candidate->>'candidate_fingerprint');
  end loop;
  update tongs.hammer_shorts_discoveries set state='completed',outcome=p_outcome,completed_at=now() where id=p_discovery_id returning * into v_discovery;
  return jsonb_build_object('discovery',to_jsonb(v_discovery),'candidates',(select coalesce(jsonb_agg(to_jsonb(c) order by c.rank),'[]'::jsonb) from tongs.hammer_short_candidates c where c.discovery_id=p_discovery_id));
end $$;

create or replace function tongs.reserve_hammer_short_derivative(p_candidate_id uuid,p_display_label text,p_operation_id text,p_operation_fingerprint text) returns jsonb language plpgsql security definer set search_path=tongs,public as $$
declare v_actor uuid:=auth.uid(); v_candidate tongs.hammer_short_candidates%rowtype; v_basis tongs.hammer_shorts_basis_locks%rowtype; v_existing tongs.hammer_short_derivatives%rowtype; v_child uuid:=gen_random_uuid(); v_head uuid;
begin
  select * into v_candidate from tongs.hammer_short_candidates where id=p_candidate_id; select * into v_basis from tongs.hammer_shorts_basis_locks where id=v_candidate.basis_lock_id;
  if v_actor is null or v_candidate.id is null or not tongs.has_workspace_role(v_candidate.workspace_id,'editor') then raise exception 'hammer_shorts_editor_required' using errcode='42501'; end if;
  select * into v_existing from tongs.hammer_short_derivatives where operation_id=p_operation_id or candidate_id=p_candidate_id; if found then return to_jsonb(v_existing); end if;
  select head_id into v_head from tongs.hammer_history_epoch_heads where recording_revision_id=v_basis.recording_revision_id order by sequence desc limit 1;
  if v_head is distinct from v_basis.history_head_id or exists(select 1 from tongs.episodes e where e.id=v_basis.parent_workpiece_id and e.active_revision_id is distinct from v_basis.recording_revision_id) then raise exception 'hammer_shorts_candidate_stale' using errcode='40001'; end if;
  insert into tongs.episodes(id,workspace_id,label,created_by,creation_origin,lifecycle_state) values(v_child,v_candidate.workspace_id,coalesce(nullif(trim(p_display_label),''),'Short'),v_actor,'hammer_short_derivative_v1','active');
  insert into tongs.hammer_short_derivatives(workspace_id,basis_lock_id,candidate_id,child_workpiece_id,core_range,envelope_range,operation_id,operation_fingerprint,created_by)
  values(v_candidate.workspace_id,v_basis.id,v_candidate.id,v_child,jsonb_build_object('start_sec',v_candidate.core_output_start_sec,'end_sec',v_candidate.core_output_end_sec),jsonb_build_object('start_sec',v_candidate.envelope_output_start_sec,'end_sec',v_candidate.envelope_output_end_sec),p_operation_id,p_operation_fingerprint,v_actor) returning * into v_existing;
  return to_jsonb(v_existing);
end $$;

create or replace function tongs.finalize_hammer_short_derivative(p_derivative_id uuid,p_artifact_authority jsonb) returns jsonb language plpgsql security definer set search_path=tongs,public as $$
declare v_actor uuid:=auth.uid(); v_short tongs.hammer_short_derivatives%rowtype; v_basis tongs.hammer_shorts_basis_locks%rowtype; v_parent tongs.canonical_recordings%rowtype; v_path text; v_file tongs.workpiece_files%rowtype; v_canonical uuid:=gen_random_uuid(); v_revision uuid:=gen_random_uuid(); v_derivation uuid;
begin
  select * into v_short from tongs.hammer_short_derivatives where id=p_derivative_id for update; select * into v_basis from tongs.hammer_shorts_basis_locks where id=v_short.basis_lock_id;
  if v_actor is null or v_short.id is null or not tongs.has_workspace_role(v_short.workspace_id,'editor') then raise exception 'hammer_shorts_editor_required' using errcode='42501'; end if;
  if v_short.state='ready' then return to_jsonb(v_short); end if;
  if jsonb_typeof(p_artifact_authority)<>'object' or not(p_artifact_authority ?& array['transcript','editor_session','timeline','history']) then raise exception 'hammer_short_artifact_authority_invalid' using errcode='22023'; end if;
  foreach v_path in array array[p_artifact_authority#>>'{transcript,path}',p_artifact_authority#>>'{editor_session,path}',p_artifact_authority#>>'{timeline,path}',p_artifact_authority#>>'{history,path}'] loop
    select * into v_file from tongs.workpiece_files where workpiece_id=v_short.child_workpiece_id and path=v_path;
    if v_file.workpiece_id is null or lower(v_file.hash_value)<>(select value->>'sha256' from jsonb_each(p_artifact_authority) where value->>'path'=v_path limit 1) then raise exception 'hammer_short_artifact_verification_failed' using errcode='40001'; end if;
  end loop;
  select * into v_parent from tongs.canonical_recordings where id=v_basis.canonical_recording_id;
  insert into tongs.canonical_recordings(id,workspace_id,workpiece_id,status,kept_take_event_id,media_path,media_content_type,media_bytes,media_duration_ms,recording_session_id,anvil_capture_session_id,media_id,media_signature,baseline_transcript_path,baseline_timing_path,created_by,updated_by,sealed_at)
  values(v_canonical,v_short.workspace_id,v_short.child_workpiece_id,'sealed',v_parent.kept_take_event_id,v_parent.media_path,v_parent.media_content_type,v_parent.media_bytes,v_parent.media_duration_ms,v_parent.recording_session_id,v_parent.anvil_capture_session_id,v_parent.media_id,v_parent.media_signature,p_artifact_authority#>>'{transcript,path}',p_artifact_authority#>>'{timeline,path}',v_actor,v_actor,now());
  insert into tongs.recording_revisions(id,workspace_id,workpiece_id,canonical_recording_id,status,label,editor_session_path,revision_transcript_path,visual_timeline_path,history_path,created_by,updated_by)
  values(v_revision,v_short.workspace_id,v_short.child_workpiece_id,v_canonical,'active','Short derivative',p_artifact_authority#>>'{editor_session,path}',p_artifact_authority#>>'{transcript,path}',p_artifact_authority#>>'{timeline,path}',p_artifact_authority#>>'{history,path}',v_actor,v_actor);
  update tongs.episodes set canonical_recording_id=v_canonical,active_revision_id=v_revision where id=v_short.child_workpiece_id;
  insert into tongs.workpiece_derivations(workspace_id,parent_workpiece_id,child_workpiece_id,derivative_kind,operation_id,operation_fingerprint,created_by)
  values(v_short.workspace_id,v_basis.parent_workpiece_id,v_short.child_workpiece_id,'short',v_short.operation_id,v_short.operation_fingerprint,v_actor) returning id into v_derivation;
  update tongs.hammer_short_derivatives set derivation_id=v_derivation,child_canonical_recording_id=v_canonical,child_recording_revision_id=v_revision,state='ready',artifact_authority=p_artifact_authority,finalized_at=now() where id=v_short.id returning * into v_short;
  return to_jsonb(v_short);
end $$;

revoke all on function tongs.lock_hammer_shorts_basis(jsonb,text,text) from public; revoke all on function tongs.reserve_hammer_shorts_discovery(jsonb,text,text) from public; revoke all on function tongs.complete_hammer_shorts_discovery(uuid,jsonb,jsonb,text,text) from public;
revoke all on function tongs.reserve_hammer_short_derivative(uuid,text,text,text) from public; revoke all on function tongs.finalize_hammer_short_derivative(uuid,jsonb) from public;
grant execute on function tongs.lock_hammer_shorts_basis(jsonb,text,text) to authenticated,service_role; grant execute on function tongs.reserve_hammer_shorts_discovery(jsonb,text,text) to authenticated,service_role; grant execute on function tongs.complete_hammer_shorts_discovery(uuid,jsonb,jsonb,text,text) to authenticated,service_role;
grant execute on function tongs.reserve_hammer_short_derivative(uuid,text,text,text) to authenticated,service_role; grant execute on function tongs.finalize_hammer_short_derivative(uuid,jsonb) to authenticated,service_role;

commit;
