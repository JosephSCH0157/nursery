-- Finding decisions and review completion are valid only while the immutable
-- report still matches the current script and evidence pointers.
begin;
create or replace function tongs.acknowledge_hearth_preflight_finding_v1(p_workspace_id uuid,p_workpiece_id uuid,p_report_id uuid,p_finding_key text,p_action text,p_note text,p_operation_id text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $function$
declare v_user uuid:=auth.uid();v_finding tongs.hearth_editorial_preflight_findings%rowtype;v_report tongs.hearth_editorial_preflight_reports%rowtype;v_ack tongs.hearth_preflight_finding_acknowledgements%rowtype;
begin
  if v_user is null or not tongs.has_workspace_role(p_workspace_id,'editor') then return jsonb_build_object('disposition','denied');end if;
  select * into v_ack from tongs.hearth_preflight_finding_acknowledgements where operation_id=p_operation_id;
  if found then return jsonb_build_object('disposition','duplicate','acknowledgement',to_jsonb(v_ack));end if;
  select r.* into v_report from tongs.hearth_editorial_preflight_reports r
    join tongs.workpiece_hearth_preflight_sequences s on s.current_report_id=r.id and s.current_revision=r.revision
    join tongs.workpiece_files wf on wf.workpiece_id=r.workpiece_id and wf.path=r.source_file_path and wf.revision=r.source_file_revision and lower(wf.hash_value)=r.script_content_hash
    where r.id=p_report_id and r.workspace_id=p_workspace_id and r.workpiece_id=p_workpiece_id
      and (r.research_artifact_id is null or exists(select 1 from tongs.workpiece_hearth_research_sequences rs join tongs.hearth_research_artifact_revisions ra on ra.id=rs.current_artifact_id where rs.workspace_id=r.workspace_id and rs.workpiece_id=r.workpiece_id and ra.id=r.research_artifact_id and ra.artifact_content_hash=r.research_artifact_hash));
  if not found then return jsonb_build_object('disposition','stale','reason','preflight_not_current');end if;
  select * into v_finding from tongs.hearth_editorial_preflight_findings where report_id=p_report_id and finding_key=p_finding_key and workspace_id=p_workspace_id and workpiece_id=p_workpiece_id;
  if not found then return jsonb_build_object('disposition','not_found','reason','finding_not_found');end if;
  if p_action not in ('acknowledge','resolve') or (v_finding.severity='blocker' and p_action<>'resolve') then return jsonb_build_object('disposition','invalid','reason','blocking_findings_require_resolution');end if;
  insert into tongs.hearth_preflight_finding_acknowledgements(workspace_id,workpiece_id,report_id,report_revision,finding_ordinal,action,note,operation_id,acted_by)
  values(p_workspace_id,p_workpiece_id,p_report_id,v_finding.report_revision,v_finding.ordinal,p_action,nullif(btrim(coalesce(p_note,'')),''),p_operation_id,v_user) returning * into v_ack;
  return jsonb_build_object('disposition','saved','acknowledgement',to_jsonb(v_ack));
end;$function$;
create or replace function tongs.review_hearth_editorial_preflight_v1(p_workspace_id uuid,p_workpiece_id uuid,p_report_id uuid,p_operation_id text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $function$
declare v_user uuid:=auth.uid();v_report tongs.hearth_editorial_preflight_reports%rowtype;v_receipt tongs.hearth_preflight_review_receipts%rowtype;
begin
  if v_user is null or not tongs.has_workspace_role(p_workspace_id,'editor') then return jsonb_build_object('disposition','denied');end if;
  select * into v_receipt from tongs.hearth_preflight_review_receipts where operation_id=p_operation_id or report_id=p_report_id;
  if found then return jsonb_build_object('disposition','duplicate','review',to_jsonb(v_receipt));end if;
  select r.* into v_report from tongs.hearth_editorial_preflight_reports r
    join tongs.workpiece_hearth_preflight_sequences s on s.current_report_id=r.id and s.current_revision=r.revision
    join tongs.workpiece_files wf on wf.workpiece_id=r.workpiece_id and wf.path=r.source_file_path and wf.revision=r.source_file_revision and lower(wf.hash_value)=r.script_content_hash
    where r.id=p_report_id and r.workspace_id=p_workspace_id and r.workpiece_id=p_workpiece_id
      and (r.research_artifact_id is null or exists(select 1 from tongs.workpiece_hearth_research_sequences rs join tongs.hearth_research_artifact_revisions ra on ra.id=rs.current_artifact_id where rs.workspace_id=r.workspace_id and rs.workpiece_id=r.workpiece_id and ra.id=r.research_artifact_id and ra.artifact_content_hash=r.research_artifact_hash));
  if not found then return jsonb_build_object('disposition','stale','reason','preflight_not_current');end if;
  if exists(select 1 from tongs.hearth_editorial_preflight_findings f where f.report_id=v_report.id and ((f.severity='blocker' and not exists(select 1 from tongs.hearth_preflight_finding_acknowledgements a where a.report_id=f.report_id and a.finding_ordinal=f.ordinal and a.action='resolve')) or (f.severity='warning' and not exists(select 1 from tongs.hearth_preflight_finding_acknowledgements a where a.report_id=f.report_id and a.finding_ordinal=f.ordinal and a.action in ('acknowledge','resolve'))))) then return jsonb_build_object('disposition','blocked','reason','findings_unhandled');end if;
  insert into tongs.hearth_preflight_review_receipts(workspace_id,workpiece_id,report_id,report_revision,script_content_hash,research_artifact_id,research_artifact_hash,operation_id,reviewed_by)
  values(p_workspace_id,p_workpiece_id,v_report.id,v_report.revision,v_report.script_content_hash,v_report.research_artifact_id,v_report.research_artifact_hash,p_operation_id,v_user) returning * into v_receipt;
  return jsonb_build_object('disposition','reviewed','review',to_jsonb(v_receipt));
end;$function$;
revoke all on function tongs.acknowledge_hearth_preflight_finding_v1(uuid,uuid,uuid,text,text,text,text),tongs.review_hearth_editorial_preflight_v1(uuid,uuid,uuid,text) from public,anon;
grant execute on function tongs.acknowledge_hearth_preflight_finding_v1(uuid,uuid,uuid,text,text,text,text),tongs.review_hearth_editorial_preflight_v1(uuid,uuid,uuid,text) to authenticated,service_role;
commit;
