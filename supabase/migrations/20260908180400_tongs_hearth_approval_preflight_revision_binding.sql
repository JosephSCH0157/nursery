-- A creator approval binds both exact script bytes and the exact reviewed
-- producer preflight. Re-reviewing unchanged bytes against changed evidence
-- therefore creates a new approval revision instead of reusing stale authority.
begin;
create or replace function tongs.approve_canonical_script_v3(p_workspace_id uuid,p_workpiece_id uuid,p_expected_current_approval_revision bigint,p_expected_source_file_revision bigint,p_expected_source_content_hash text,p_script_text text,p_creator_version_label text,p_preflight_report_id uuid,p_operation_id text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $function$
declare
  v_user uuid:=auth.uid();v_report tongs.hearth_editorial_preflight_reports%rowtype;v_review tongs.hearth_preflight_review_receipts%rowtype;
  v_research tongs.hearth_research_artifact_revisions%rowtype;v_result jsonb;v_approval_id uuid;v_approval_revision bigint;
  v_binding tongs.script_approval_preflight_bindings%rowtype;v_contract text;
begin
  if v_user is null or not tongs.has_workspace_role(p_workspace_id,'editor') then return jsonb_build_object('disposition','denied','reason','editor_required');end if;
  select r.* into v_report from tongs.hearth_editorial_preflight_reports r join tongs.workpiece_hearth_preflight_sequences s on s.current_report_id=r.id where r.id=p_preflight_report_id and r.workspace_id=p_workspace_id and r.workpiece_id=p_workpiece_id;
  if not found or v_report.source_file_revision<>p_expected_source_file_revision or v_report.script_content_hash<>lower(p_expected_source_content_hash) then return jsonb_build_object('disposition','stale_preflight','reason','script_preflight_mismatch');end if;
  select * into v_review from tongs.hearth_preflight_review_receipts where report_id=v_report.id;
  if not found then return jsonb_build_object('disposition','preflight_unreviewed');end if;
  if v_report.research_artifact_id is not null then
    select r.* into v_research from tongs.hearth_research_artifact_revisions r join tongs.workpiece_hearth_research_sequences s on s.current_artifact_id=r.id where r.id=v_report.research_artifact_id and r.artifact_content_hash=v_report.research_artifact_hash;
    if not found then return jsonb_build_object('disposition','stale_preflight','reason','research_changed');end if;
  end if;
  v_contract:='forge.script-approval.v3+preflight:'||v_report.id::text;
  select tongs.commit_script_approval_snapshot(p_workspace_id,p_workpiece_id,p_expected_current_approval_revision,'script/script.md',p_expected_source_file_revision,tongs.normalize_script_approval_text(p_script_text),v_contract,p_creator_version_label,p_operation_id,v_user) into v_result;
  if v_result->>'disposition' not in ('committed','no_change') then return v_result;end if;
  v_approval_id:=(v_result#>>'{approval,id}')::uuid;v_approval_revision:=(v_result#>>'{approval,approval_revision}')::bigint;
  select * into v_binding from tongs.script_approval_preflight_bindings where script_approval_id=v_approval_id;
  if found then
    if v_binding.preflight_report_id<>v_report.id or v_binding.preflight_script_hash<>v_report.script_content_hash
      or v_binding.research_artifact_id is distinct from v_report.research_artifact_id or v_binding.research_artifact_hash is distinct from v_report.research_artifact_hash then
      return jsonb_build_object('disposition','integrity_error','reason','approval_preflight_binding_mismatch');
    end if;
  else
    insert into tongs.script_approval_preflight_bindings(script_approval_id,workspace_id,workpiece_id,script_approval_revision,preflight_report_id,preflight_report_revision,preflight_script_hash,research_artifact_id,research_artifact_hash,bound_by)
    values(v_approval_id,p_workspace_id,p_workpiece_id,v_approval_revision,v_report.id,v_report.revision,v_report.script_content_hash,v_report.research_artifact_id,v_report.research_artifact_hash,v_user);
  end if;
  return v_result||jsonb_build_object('preflight_report_id',v_report.id,'preflight_report_revision',v_report.revision);
end;$function$;
revoke all on function tongs.approve_canonical_script_v3(uuid,uuid,bigint,bigint,text,text,text,uuid,text) from public,anon;
grant execute on function tongs.approve_canonical_script_v3(uuid,uuid,bigint,bigint,text,text,text,uuid,text) to authenticated,service_role;
commit;
