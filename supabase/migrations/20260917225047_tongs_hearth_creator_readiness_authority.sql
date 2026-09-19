-- Restore creator-controlled readiness. Editorial/factual preflight remains
-- durable optional assistance, but canonical approval and Ready authority are
-- based only on the exact current script and its production-safe file tuple.

begin;

create or replace function tongs.approve_canonical_script_v4(
  p_workspace_id uuid,
  p_workpiece_id uuid,
  p_expected_current_approval_revision bigint,
  p_expected_source_file_revision bigint,
  p_expected_source_content_hash text,
  p_script_text text,
  p_creator_version_label text,
  p_operation_id text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, tongs
as $function$
declare
  v_user uuid := auth.uid();
  v_file tongs.workpiece_files%rowtype;
  v_text text;
  v_hash text;
  v_result jsonb;
  v_receipt tongs.hearth_authority_operation_receipts%rowtype;
  v_prior tongs.script_approval_revisions%rowtype;
begin
  if v_user is null or not tongs.has_workspace_role(p_workspace_id, 'editor') then
    return jsonb_build_object('disposition','denied','reason','editor_required');
  end if;
  if not exists(
    select 1 from tongs.episodes
    where id=p_workpiece_id and workspace_id=p_workspace_id
  ) then
    return jsonb_build_object('disposition','not_found','reason','episode_membership_invalid');
  end if;
  select * into v_receipt
  from tongs.hearth_authority_operation_receipts
  where operation_id=p_operation_id;
  if found then
    select * into v_prior
    from tongs.script_approval_revisions
    where id=v_receipt.result_script_approval_id;
    if found
      and v_receipt.workspace_id=p_workspace_id
      and v_receipt.workpiece_id=p_workpiece_id
      and v_prior.source_file_revision=p_expected_source_file_revision
      and v_prior.script_content_hash=lower(p_expected_source_content_hash) then
      return v_receipt.immutable_result_json;
    end if;
    return jsonb_build_object('disposition','operation_identity_conflict');
  end if;
  select * into v_file
  from tongs.workpiece_files
  where workpiece_id=p_workpiece_id and path='script/script.md'
  for update;
  if not found then
    return jsonb_build_object('disposition','not_found','reason','script_not_found');
  end if;
  if v_file.revision<>p_expected_source_file_revision then
    return jsonb_build_object(
      'disposition','stale_source','reason','source_revision_changed',
      'current_source_revision',v_file.revision
    );
  end if;
  v_hash:=lower(coalesce(v_file.hash_value,''));
  if v_hash<>lower(btrim(coalesce(p_expected_source_content_hash,''))) then
    return jsonb_build_object(
      'disposition','stale_source','reason','source_hash_changed',
      'current_source_hash',v_hash
    );
  end if;
  v_text:=tongs.normalize_script_approval_text(p_script_text);
  if nullif(btrim(coalesce(v_text,'')),'') is null then
    return jsonb_build_object('disposition','invalid_script','reason','script_empty');
  end if;
  if encode(extensions.digest(convert_to(v_text,'UTF8'),'sha256'),'hex')<>v_hash then
    return jsonb_build_object('disposition','stale_source','reason','source_bytes_changed');
  end if;
  select tongs.commit_script_approval_snapshot(
    p_workspace_id,p_workpiece_id,p_expected_current_approval_revision,
    'script/script.md',v_file.revision,v_text,'forge.script-approval.v4',
    p_creator_version_label,p_operation_id,v_user
  ) into v_result;
  return v_result;
end;
$function$;

create or replace function tongs.hearth_transition_approved_script_ready_v4(
  p_workspace_id uuid,
  p_workpiece_id uuid,
  p_script_approval_id uuid,
  p_idempotency_key text,
  p_publish_evidence jsonb
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, tongs
as $function$
declare
  v_user uuid:=auth.uid();
  v_key text:=btrim(coalesce(p_idempotency_key,''));
  v_approval tongs.script_approval_revisions%rowtype;
  v_file tongs.workpiece_files%rowtype;
  v_existing tongs.workpiece_ready_transition_requests%rowtype;
  v_transition tongs.workpiece_ready_transition_requests%rowtype;
  v_ready tongs.workpiece_ready_script_meta%rowtype;
  v_fingerprint text;
begin
  if v_user is null or not tongs.has_workspace_role(p_workspace_id,'editor') then
    return jsonb_build_object('outcome','denied','reason','editor_required','ready',null);
  end if;
  if length(v_key) not between 8 and 200 or jsonb_typeof(p_publish_evidence)<>'object' then
    return jsonb_build_object('outcome','conflict','reason','invalid_publish_evidence','ready',null);
  end if;
  select a.* into v_approval
  from tongs.script_approval_revisions a
  join tongs.workpiece_script_approval_sequences s
    on s.workspace_id=a.workspace_id
    and s.workpiece_id=a.workpiece_id
    and s.current_approval_id=a.id
    and s.current_revision=a.approval_revision
  where a.id=p_script_approval_id
    and a.workspace_id=p_workspace_id
    and a.workpiece_id=p_workpiece_id;
  if not found then
    return jsonb_build_object('outcome','not_found','reason','current_approval_not_found','ready',null);
  end if;
  select * into v_file
  from tongs.workpiece_files
  where workpiece_id=p_workpiece_id and path=v_approval.source_file_path
  for share;
  if not found
    or v_file.revision<>v_approval.source_file_revision
    or lower(coalesce(v_file.hash_value,''))<>v_approval.script_content_hash then
    return jsonb_build_object('outcome','stale','reason','approved_script_is_not_current','ready',null);
  end if;
  if p_publish_evidence->>'transition' is distinct from 'hearth.approved-script.ready.v4'
    or p_publish_evidence->>'script_approval_id' is distinct from v_approval.id::text
    or (p_publish_evidence->>'script_approval_revision')::bigint is distinct from v_approval.approval_revision
    or lower(coalesce(p_publish_evidence->>'script_approval_hash','')) is distinct from v_approval.script_content_hash then
    return jsonb_build_object('outcome','conflict','reason','approval_evidence_mismatch','ready',null);
  end if;
  v_fingerprint:=md5(jsonb_build_object(
    'contract','hearth.approved-script.ready.v4',
    'workspace_id',p_workspace_id,
    'workpiece_id',p_workpiece_id,
    'script_approval_id',v_approval.id,
    'script_approval_revision',v_approval.approval_revision,
    'script_approval_hash',v_approval.script_content_hash,
    'publish_evidence',p_publish_evidence
  )::text);
  select * into v_existing
  from tongs.workpiece_ready_transition_requests
  where workspace_id=p_workspace_id and idempotency_key=v_key;
  if found then
    if v_existing.request_fingerprint<>v_fingerprint then
      return jsonb_build_object('outcome','conflict','reason','idempotency_reuse','ready',null);
    end if;
    select * into v_ready
    from tongs.workpiece_ready_script_meta
    where transition_id=v_existing.id;
    return jsonb_build_object('outcome','duplicate','reason',null,'ready',to_jsonb(v_ready));
  end if;
  insert into tongs.workpiece_ready_transition_requests(
    workspace_id,workpiece_id,script_path,script_revision,script_hash,
    script_approval_id,script_approval_revision,script_approval_hash,
    preflight_report_id,preflight_report_revision,preflight_script_hash,
    research_artifact_id,research_artifact_hash,
    idempotency_key,request_fingerprint,publish_evidence,transitioned_by
  ) values(
    p_workspace_id,p_workpiece_id,v_approval.source_file_path,
    v_approval.source_file_revision,v_approval.script_content_hash,
    v_approval.id,v_approval.approval_revision,v_approval.script_content_hash,
    null,null,null,null,null,
    v_key,v_fingerprint,p_publish_evidence,v_user
  ) returning * into v_transition;
  insert into tongs.workpiece_ready_script_meta(
    workspace_id,workpiece_id,script_path,marked_ready_by,marked_ready_at,updated_by,
    script_revision,script_hash,script_approval_id,script_approval_revision,script_approval_hash,
    preflight_report_id,preflight_report_revision,preflight_script_hash,
    research_artifact_id,research_artifact_hash,
    transition_id,publish_evidence
  ) values(
    p_workspace_id,p_workpiece_id,v_approval.source_file_path,v_user,now(),v_user,
    v_approval.source_file_revision,v_approval.script_content_hash,
    v_approval.id,v_approval.approval_revision,v_approval.script_content_hash,
    null,null,null,null,null,v_transition.id,p_publish_evidence
  )
  on conflict(workpiece_id,script_path) do update set
    workspace_id=excluded.workspace_id,
    marked_ready_by=excluded.marked_ready_by,
    marked_ready_at=excluded.marked_ready_at,
    updated_by=excluded.updated_by,
    script_revision=excluded.script_revision,
    script_hash=excluded.script_hash,
    script_approval_id=excluded.script_approval_id,
    script_approval_revision=excluded.script_approval_revision,
    script_approval_hash=excluded.script_approval_hash,
    preflight_report_id=null,
    preflight_report_revision=null,
    preflight_script_hash=null,
    research_artifact_id=null,
    research_artifact_hash=null,
    transition_id=excluded.transition_id,
    publish_evidence=excluded.publish_evidence
  returning * into v_ready;
  return jsonb_build_object('outcome','saved','reason',null,'ready',to_jsonb(v_ready));
exception
  when invalid_text_representation then
    return jsonb_build_object('outcome','conflict','reason','approval_evidence_mismatch','ready',null);
end;
$function$;

-- Preflight columns remain visible as historical/optional evidence. Neither
-- their presence nor a review receipt participates in current Ready authority.
create or replace view tongs.current_workpiece_ready_scripts
with (security_invoker = true)
as select
  m.workspace_id,m.workpiece_id,m.script_path,m.script_revision,m.script_hash,
  m.transition_id,m.marked_ready_by,m.marked_ready_at,m.publish_evidence,
  a.created_at as script_updated_at,
  m.script_approval_id,m.script_approval_revision,m.script_approval_hash,
  a.created_at as script_approved_at,
  m.preflight_report_id,m.preflight_report_revision,m.preflight_script_hash,
  m.research_artifact_id,m.research_artifact_hash,
  r.reviewed_at as preflight_reviewed_at
from tongs.workpiece_ready_script_meta m
join tongs.episodes e
  on e.id=m.workpiece_id and e.workspace_id=m.workspace_id
join tongs.workpiece_files f
  on f.workpiece_id=m.workpiece_id
  and f.path=m.script_path
  and f.revision=m.script_revision
  and lower(f.hash_value)=m.script_hash
join tongs.script_approval_revisions a
  on a.id=m.script_approval_id
  and a.workspace_id=m.workspace_id
  and a.workpiece_id=m.workpiece_id
  and a.approval_revision=m.script_approval_revision
  and a.source_file_path=m.script_path
  and a.source_file_revision=m.script_revision
  and a.script_content_hash=m.script_approval_hash
left join tongs.script_approval_preflight_bindings b
  on b.script_approval_id=a.id
  and b.preflight_report_id=m.preflight_report_id
  and b.preflight_report_revision=m.preflight_report_revision
  and b.preflight_script_hash=m.preflight_script_hash
left join tongs.hearth_editorial_preflight_reports p
  on p.id=b.preflight_report_id
  and p.workspace_id=m.workspace_id
  and p.workpiece_id=m.workpiece_id
left join tongs.hearth_preflight_review_receipts r
  on r.report_id=p.id
where e.archived_at is null and m.transition_id is not null;

-- Recording capture may carry historical optional-review evidence, but an
-- approved script no longer requires that evidence to establish authority.
alter table tongs.recording_capture_authorities
  drop constraint recording_capture_preflight_shape;
alter table tongs.recording_capture_authorities
  add constraint recording_capture_preflight_shape check(
    (script_binding_kind='none'
      and preflight_report_id is null
      and preflight_report_revision is null
      and preflight_script_hash is null
      and research_artifact_id is null
      and research_artifact_hash is null)
    or (script_binding_kind='approved_canonical_script' and (
      (preflight_report_id is null
        and preflight_report_revision is null
        and preflight_script_hash is null
        and research_artifact_id is null
        and research_artifact_hash is null)
      or (preflight_report_id is not null
        and preflight_report_revision>0
        and preflight_script_hash ~ '^[0-9a-f]{64}$'
        and (research_artifact_id is null)=(research_artifact_hash is null))
    ))
  ) not valid;

create or replace function tongs.guard_recording_capture_authority_relationships()
returns trigger
language plpgsql
set search_path=pg_catalog,tongs
as $function$
declare
  v_ready tongs.workpiece_ready_transition_requests%rowtype;
begin
  if not exists(
    select 1 from tongs.episodes e
    where e.id=new.workpiece_id and e.workspace_id=new.workspace_id
  ) then
    raise exception using errcode='23514',message='recording capture authority episode membership mismatch';
  end if;
  if new.recording_session_id is not null and not exists(
    select 1 from tongs.recording_sessions s
    where s.id=new.recording_session_id and s.workspace_id=new.workspace_id
  ) then
    raise exception using errcode='23514',message='recording capture authority planner session mismatch';
  end if;
  if new.script_binding_kind='approved_canonical_script' then
    select * into v_ready
    from tongs.workpiece_ready_transition_requests
    where id=new.ready_transition_id;
    if not found
      or v_ready.workspace_id<>new.workspace_id
      or v_ready.workpiece_id<>new.workpiece_id
      or v_ready.script_path<>new.script_path
      or v_ready.script_revision<>new.script_revision
      or lower(v_ready.script_hash)<>new.script_hash
      or v_ready.script_approval_id<>new.script_approval_id
      or v_ready.script_approval_revision<>new.script_approval_revision
      or lower(v_ready.script_approval_hash)<>new.script_approval_hash
      or v_ready.preflight_report_id is distinct from new.preflight_report_id
      or v_ready.preflight_report_revision is distinct from new.preflight_report_revision
      or v_ready.preflight_script_hash is distinct from new.preflight_script_hash
      or v_ready.research_artifact_id is distinct from new.research_artifact_id
      or v_ready.research_artifact_hash is distinct from new.research_artifact_hash then
      raise exception using errcode='23514',message='recording capture authority approved Ready evidence mismatch';
    end if;
  end if;
  return new;
end;
$function$;

create or replace function tongs.establish_recording_capture_authority(
  p_workspace_id uuid,
  p_workpiece_id uuid,
  p_venue text,
  p_execution_id uuid,
  p_operation_key text,
  p_recording_session_id uuid default null,
  p_venue_version text default null
) returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,tongs
as $function$
declare
  v_user uuid:=auth.uid();
  v_key text:=btrim(coalesce(p_operation_key,''));
  v_venue text:=lower(btrim(coalesce(p_venue,'')));
  v_fingerprint text;
  v_ready record;
  v_existing tongs.recording_capture_authorities%rowtype;
  v_saved tongs.recording_capture_authorities%rowtype;
  v_execution tongs.anvil_capture_executions%rowtype;
begin
  if v_user is null or not tongs.has_workspace_role(p_workspace_id,'editor') then
    return jsonb_build_object('outcome','denied','reason','editor_required');
  end if;
  if v_venue not in ('anvil','bellows') or length(v_key) not between 8 and 200 or (v_venue='anvil' and p_execution_id is null) then
    return jsonb_build_object('outcome','conflict','reason','invalid_capture_request');
  end if;
  if not exists(
    select 1 from tongs.episodes
    where id=p_workpiece_id and workspace_id=p_workspace_id
      and archived_at is null and deleted_at is null
  ) then
    return jsonb_build_object('outcome','not_found','reason','episode_membership_invalid');
  end if;
  v_fingerprint:=md5(concat_ws('|',p_workspace_id,p_workpiece_id,v_venue,p_execution_id,p_recording_session_id));
  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text||':'||v_key,0));
  select * into v_existing
  from tongs.recording_capture_authorities
  where workspace_id=p_workspace_id and operation_key=v_key;
  if found then
    if v_existing.request_fingerprint<>v_fingerprint then
      return jsonb_build_object('outcome','conflict','reason','operation_key_reused');
    end if;
    select * into v_execution
    from tongs.anvil_capture_executions
    where recording_capture_authority_id=v_existing.id;
    return jsonb_build_object(
      'outcome','duplicate','capture_authority',to_jsonb(v_existing),
      'venue_execution',case when v_execution.execution_id is null then null else to_jsonb(v_execution) end
    );
  end if;
  select * into v_ready
  from tongs.current_workpiece_ready_scripts
  where workspace_id=p_workspace_id
    and workpiece_id=p_workpiece_id
    and script_path='script/script.md';
  if v_venue='anvil' and v_ready.transition_id is null then
    return jsonb_build_object('outcome','conflict','reason','approved_ready_script_required');
  end if;
  insert into tongs.recording_capture_authorities(
    workspace_id,workpiece_id,recording_session_id,ready_transition_id,
    script_path,script_revision,script_hash,
    script_approval_id,script_approval_revision,script_approval_hash,
    preflight_report_id,preflight_report_revision,preflight_script_hash,
    research_artifact_id,research_artifact_hash,
    operation_key,provenance,established_by,venue,script_binding_kind,request_fingerprint
  ) values(
    p_workspace_id,p_workpiece_id,p_recording_session_id,v_ready.transition_id,
    v_ready.script_path,v_ready.script_revision,v_ready.script_hash,
    v_ready.script_approval_id,v_ready.script_approval_revision,v_ready.script_approval_hash,
    v_ready.preflight_report_id,v_ready.preflight_report_revision,v_ready.preflight_script_hash,
    v_ready.research_artifact_id,v_ready.research_artifact_hash,
    v_key,'live_established',v_user,v_venue,
    case when v_ready.transition_id is null then 'none' else 'approved_canonical_script' end,
    v_fingerprint
  ) returning * into v_saved;
  if v_venue='anvil' then
    insert into tongs.anvil_capture_executions(
      execution_id,recording_capture_authority_id,operation_key,anvil_version,created_by
    ) values(
      p_execution_id,v_saved.id,v_key,p_venue_version,v_user
    ) returning * into v_execution;
  end if;
  return jsonb_build_object(
    'outcome','established','capture_authority',to_jsonb(v_saved),
    'venue_execution',case when v_execution.execution_id is null then null else to_jsonb(v_execution) end
  );
end;
$function$;

revoke all on function tongs.approve_canonical_script_v4(uuid,uuid,bigint,bigint,text,text,text,text) from public,anon;
revoke all on function tongs.hearth_transition_approved_script_ready_v4(uuid,uuid,uuid,text,jsonb) from public,anon;
grant execute on function tongs.approve_canonical_script_v4(uuid,uuid,bigint,bigint,text,text,text,text) to authenticated,service_role;
grant execute on function tongs.hearth_transition_approved_script_ready_v4(uuid,uuid,uuid,text,jsonb) to authenticated,service_role;

-- Customer-facing callers must use the creator-readiness authority. The old
-- functions and all durable preflight rows remain available for readback.
revoke execute on function tongs.approve_canonical_script_v3(uuid,uuid,bigint,bigint,text,text,text,uuid,text) from authenticated;
revoke execute on function tongs.hearth_transition_preflighted_script_ready_v3(uuid,uuid,uuid,uuid,text,jsonb) from authenticated;

grant select on tongs.current_workpiece_ready_scripts to authenticated;
alter function tongs.approve_canonical_script_v4(uuid,uuid,bigint,bigint,text,text,text,text) owner to postgres;
alter function tongs.hearth_transition_approved_script_ready_v4(uuid,uuid,uuid,text,jsonb) owner to postgres;
alter function tongs.establish_recording_capture_authority(uuid,uuid,text,uuid,text,uuid,text) owner to postgres;

commit;
