-- Fail closed when immutable Hearth contract JSON and RPC-generated query
-- projections do not describe the same canonical research/preflight state.
begin;
create or replace function tongs.read_current_hearth_research_artifact_v1(p_workspace_id uuid,p_workpiece_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $function$
declare
  v_user uuid:=auth.uid();
  v_seq tongs.workpiece_hearth_research_sequences%rowtype;
  v_row tongs.hearth_research_artifact_revisions%rowtype;
  v_hash text;v_projection_hash text;v_creator_count int;v_finding_count int;v_evidence_count int;
begin
  if v_user is null or not tongs.has_workspace_role(p_workspace_id,'viewer') then return jsonb_build_object('disposition','denied');end if;
  select * into v_seq from tongs.workpiece_hearth_research_sequences where workspace_id=p_workspace_id and workpiece_id=p_workpiece_id;
  if not found or v_seq.current_artifact_id is null then return jsonb_build_object('disposition','empty','artifact',null);end if;
  select * into v_row from tongs.hearth_research_artifact_revisions where id=v_seq.current_artifact_id and workspace_id=p_workspace_id and workpiece_id=p_workpiece_id and revision=v_seq.current_revision;
  if not found then return jsonb_build_object('disposition','integrity_error','reason','current_pointer_mismatch');end if;
  v_hash:=encode(extensions.digest(convert_to(v_row.artifact_json::text,'UTF8'),'sha256'),'hex');
  v_projection_hash:=encode(extensions.digest(convert_to(jsonb_build_object('claims',coalesce(v_row.artifact_json#>'{result,creatorClaims}','[]'::jsonb),'findings',coalesce(v_row.artifact_json#>'{result,artifact,findings}','[]'::jsonb),'evidence',coalesce(v_row.artifact_json#>'{result,evidence}','[]'::jsonb))::text,'UTF8'),'sha256'),'hex');
  if v_hash<>v_row.artifact_content_hash then return jsonb_build_object('disposition','integrity_error','reason','canonical_json_hash_mismatch');end if;
  if v_projection_hash<>v_row.projection_content_hash then return jsonb_build_object('disposition','integrity_error','reason','projection_hash_mismatch');end if;
  v_creator_count:=jsonb_array_length(coalesce(v_row.artifact_json#>'{result,creatorClaims}','[]'::jsonb));
  v_finding_count:=jsonb_array_length(coalesce(v_row.artifact_json#>'{result,artifact,findings}','[]'::jsonb));
  v_evidence_count:=jsonb_array_length(coalesce(v_row.artifact_json#>'{result,evidence}','[]'::jsonb));
  if (select count(*) from tongs.hearth_research_artifact_claims where artifact_id=v_row.id)<>v_creator_count+v_finding_count
    or (select count(*) from tongs.hearth_research_evidence_snapshots where artifact_id=v_row.id)<>v_evidence_count then
    return jsonb_build_object('disposition','integrity_error','reason','projection_count_mismatch');
  end if;
  if exists(
    select 1 from tongs.hearth_research_artifact_claims c
    cross join lateral (select case when c.ordinal<v_creator_count then (v_row.artifact_json#>'{result,creatorClaims}')->c.ordinal else (v_row.artifact_json#>'{result,artifact,findings}')->(c.ordinal-v_creator_count) end item) j
    where c.artifact_id=v_row.id and (
      j.item is null
      or c.content_hash<>encode(extensions.digest(convert_to(j.item::text,'UTF8'),'sha256'),'hex')
      or c.claim_text is distinct from j.item->>'text'
      or c.source_ids is distinct from array(select jsonb_array_elements_text(coalesce(j.item->'sourceIds','[]'::jsonb)))
      or (c.ordinal<v_creator_count and (c.claim_key is distinct from coalesce(nullif(j.item->>'claimId',''),'creator-'||c.ordinal::text)
        or c.claim_kind is distinct from j.item->>'claimKind'
        or c.provenance_status is distinct from coalesce(j.item->>'provenanceStatus','creator_supplied_unverified')
        or c.claim_scope is distinct from coalesce(j.item->>'scope','current_subject')))
    )
  ) then return jsonb_build_object('disposition','integrity_error','reason','claim_projection_mismatch');end if;
  if exists(
    select 1 from tongs.hearth_research_evidence_snapshots e
    cross join lateral (select (v_row.artifact_json#>'{result,evidence}')->e.ordinal item) j
    where e.artifact_id=v_row.id and (
      j.item is null
      or e.content_hash<>encode(extensions.digest(convert_to(j.item::text,'UTF8'),'sha256'),'hex')
      or e.evidence_key is distinct from coalesce(nullif(j.item->>'evidenceId',''),'evidence-'||e.ordinal::text)
      or e.source_id is distinct from j.item->>'sourceId'
      or e.evidence_state is distinct from coalesce(j.item->>'state','inaccessible')
      or e.authority is distinct from coalesce(j.item->>'authority','unassessed')
      or e.excerpt is distinct from j.item->>'excerpt'
    )
  ) then return jsonb_build_object('disposition','integrity_error','reason','evidence_projection_mismatch');end if;
  if exists(
    select 1 from tongs.hearth_research_claim_evidence ce
    join tongs.hearth_research_artifact_claims c on c.artifact_id=ce.artifact_id and c.ordinal=ce.claim_ordinal
    join tongs.hearth_research_evidence_snapshots e on e.artifact_id=ce.artifact_id and e.ordinal=ce.evidence_ordinal
    where ce.artifact_id=v_row.id and (not e.source_id=any(c.source_ids) or ce.relationship is distinct from case when e.evidence_state='inaccessible' then 'inaccessible_only' when c.provenance_status='conflicting' then 'conflicts' when c.provenance_status='reported_by_accessible_secondary' then 'reports' else 'supports' end)
  ) or exists(
    select 1 from tongs.hearth_research_artifact_claims c join tongs.hearth_research_evidence_snapshots e on e.artifact_id=c.artifact_id and e.source_id=any(c.source_ids)
    where c.artifact_id=v_row.id and not exists(select 1 from tongs.hearth_research_claim_evidence ce where ce.artifact_id=c.artifact_id and ce.claim_ordinal=c.ordinal and ce.evidence_ordinal=e.ordinal)
  ) then return jsonb_build_object('disposition','integrity_error','reason','claim_evidence_projection_mismatch');end if;
  return jsonb_build_object('disposition','current','artifact',to_jsonb(v_row),'claims',(select coalesce(jsonb_agg(to_jsonb(c) order by ordinal),'[]') from tongs.hearth_research_artifact_claims c where c.artifact_id=v_row.id),'evidence',(select coalesce(jsonb_agg(to_jsonb(e) order by ordinal),'[]') from tongs.hearth_research_evidence_snapshots e where e.artifact_id=v_row.id));
end;$function$;
create or replace function tongs.read_current_hearth_preflight_v1(p_workspace_id uuid,p_workpiece_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $function$
declare
  v_user uuid:=auth.uid();v_report tongs.hearth_editorial_preflight_reports%rowtype;v_file tongs.workpiece_files%rowtype;
  v_research tongs.hearth_research_artifact_revisions%rowtype;v_review tongs.hearth_preflight_review_receipts%rowtype;v_stale text[]:='{}';
  v_report_hash text;v_projection_hash text;v_finding_count int;
begin
  if v_user is null or not tongs.has_workspace_role(p_workspace_id,'viewer') then return jsonb_build_object('disposition','denied');end if;
  select r.* into v_report from tongs.hearth_editorial_preflight_reports r join tongs.workpiece_hearth_preflight_sequences s on s.current_report_id=r.id where s.workspace_id=p_workspace_id and s.workpiece_id=p_workpiece_id and s.current_revision=r.revision;
  if not found then
    if exists(select 1 from tongs.workpiece_hearth_preflight_sequences where workspace_id=p_workspace_id and workpiece_id=p_workpiece_id and current_report_id is not null) then return jsonb_build_object('disposition','integrity_error','reason','current_pointer_mismatch');end if;
    return jsonb_build_object('disposition','empty','report',null);
  end if;
  v_report_hash:=encode(extensions.digest(convert_to(v_report.report_json::text,'UTF8'),'sha256'),'hex');
  v_projection_hash:=encode(extensions.digest(convert_to(coalesce(v_report.report_json->'findings','[]'::jsonb)::text,'UTF8'),'sha256'),'hex');
  v_finding_count:=jsonb_array_length(coalesce(v_report.report_json->'findings','[]'::jsonb));
  if v_report_hash<>v_report.report_content_hash then return jsonb_build_object('disposition','integrity_error','reason','canonical_report_hash_mismatch');end if;
  if v_projection_hash<>v_report.projection_content_hash or (select count(*) from tongs.hearth_editorial_preflight_findings where report_id=v_report.id)<>v_finding_count then return jsonb_build_object('disposition','integrity_error','reason','finding_projection_count_mismatch');end if;
  if exists(
    select 1 from tongs.hearth_editorial_preflight_findings f cross join lateral (select (v_report.report_json->'findings')->f.ordinal item) j
    where f.report_id=v_report.id and (j.item is null
      or f.content_hash<>encode(extensions.digest(convert_to(j.item::text,'UTF8'),'sha256'),'hex')
      or f.finding_key is distinct from coalesce(nullif(j.item->>'id',''),'finding-'||f.ordinal::text)
      or f.finding_code is distinct from coalesce(nullif(j.item->>'code',''),'unknown')
      or f.severity is distinct from coalesce(nullif(j.item->>'severity',''),'warning')
      or f.category is distinct from coalesce(nullif(j.item->>'category',''),'editorial')
      or f.message is distinct from coalesce(nullif(j.item->>'message',''),'Unspecified producer finding.'))
  ) then return jsonb_build_object('disposition','integrity_error','reason','finding_projection_mismatch');end if;
  select * into v_file from tongs.workpiece_files where workpiece_id=p_workpiece_id and path=v_report.source_file_path;
  if not found or v_file.revision<>v_report.source_file_revision or lower(v_file.hash_value)<>v_report.script_content_hash then v_stale:=array_append(v_stale,'script_changed');end if;
  if v_report.research_artifact_id is not null then select r.* into v_research from tongs.hearth_research_artifact_revisions r join tongs.workpiece_hearth_research_sequences s on s.current_artifact_id=r.id where s.workspace_id=p_workspace_id and s.workpiece_id=p_workpiece_id;
    if not found or v_research.id<>v_report.research_artifact_id or v_research.artifact_content_hash<>v_report.research_artifact_hash then v_stale:=array_append(v_stale,'research_changed');end if;end if;
  select * into v_review from tongs.hearth_preflight_review_receipts where report_id=v_report.id;
  return jsonb_build_object('disposition',case when cardinality(v_stale)>0 then 'stale' else 'current' end,'stale_reasons',to_jsonb(v_stale),'report',to_jsonb(v_report),'review',case when v_review.id is null then null else to_jsonb(v_review) end,'findings',(select coalesce(jsonb_agg(to_jsonb(f)||jsonb_build_object('latest_action',(select a.action from tongs.hearth_preflight_finding_acknowledgements a where a.report_id=f.report_id and a.finding_ordinal=f.ordinal order by a.acted_at desc limit 1)) order by f.ordinal),'[]') from tongs.hearth_editorial_preflight_findings f where f.report_id=v_report.id));
end;$function$;
alter table tongs.recording_capture_authorities drop constraint recording_capture_preflight_shape;
-- Preserve the same forward-only compatibility when tightening the complete
-- proof tuple. Existing NULL legacy tuples stay unvalidated; new writes do not.
alter table tongs.recording_capture_authorities add constraint recording_capture_preflight_shape check(
  (script_binding_kind='none' and preflight_report_id is null and preflight_report_revision is null and preflight_script_hash is null and research_artifact_id is null and research_artifact_hash is null)
  or (script_binding_kind='approved_canonical_script' and preflight_report_id is not null and preflight_report_revision>0 and preflight_script_hash ~ '^[0-9a-f]{64}$' and (research_artifact_id is null)=(research_artifact_hash is null))
) not valid;
create or replace function tongs.guard_recording_capture_authority_relationships()
returns trigger language plpgsql set search_path=pg_catalog,tongs as $function$
declare v_ready tongs.workpiece_ready_transition_requests%rowtype;
begin
  if not exists(select 1 from tongs.episodes e where e.id=new.workpiece_id and e.workspace_id=new.workspace_id) then raise exception using errcode='23514',message='recording capture authority episode membership mismatch';end if;
  if new.recording_session_id is not null and not exists(select 1 from tongs.recording_sessions s where s.id=new.recording_session_id and s.workspace_id=new.workspace_id) then raise exception using errcode='23514',message='recording capture authority planner session mismatch';end if;
  if new.script_binding_kind='approved_canonical_script' then
    select * into v_ready from tongs.workpiece_ready_transition_requests where id=new.ready_transition_id;
    if not found or v_ready.workspace_id<>new.workspace_id or v_ready.workpiece_id<>new.workpiece_id
      or v_ready.script_path<>new.script_path or v_ready.script_revision<>new.script_revision or lower(v_ready.script_hash)<>new.script_hash
      or v_ready.script_approval_id<>new.script_approval_id or v_ready.script_approval_revision<>new.script_approval_revision or lower(v_ready.script_approval_hash)<>new.script_approval_hash
      or v_ready.preflight_report_id<>new.preflight_report_id or v_ready.preflight_report_revision<>new.preflight_report_revision or lower(v_ready.preflight_script_hash)<>new.preflight_script_hash
      or v_ready.research_artifact_id is distinct from new.research_artifact_id or v_ready.research_artifact_hash is distinct from new.research_artifact_hash then
      raise exception using errcode='23514',message='recording capture authority approved Ready/preflight transition mismatch';
    end if;
  end if;
  return new;
end;$function$;
grant execute on function tongs.read_current_hearth_research_artifact_v1(uuid,uuid),tongs.read_current_hearth_preflight_v1(uuid,uuid) to authenticated,service_role;
commit;
