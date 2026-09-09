-- Follow-up for environments that applied the initial preflight authority
-- before exact mutable-file currentness was included in the Ready projection.
begin;
create or replace view tongs.current_workpiece_ready_scripts with(security_invoker=true) as
select m.workspace_id,m.workpiece_id,m.script_path,m.script_revision,m.script_hash,m.transition_id,m.marked_ready_by,m.marked_ready_at,m.publish_evidence,a.created_at script_updated_at,m.script_approval_id,m.script_approval_revision,m.script_approval_hash,a.created_at script_approved_at,m.preflight_report_id,m.preflight_report_revision,m.preflight_script_hash,m.research_artifact_id,m.research_artifact_hash,r.reviewed_at preflight_reviewed_at
from tongs.workpiece_ready_script_meta m
join tongs.episodes e on e.id=m.workpiece_id and e.workspace_id=m.workspace_id
join tongs.workpiece_files f on f.workpiece_id=m.workpiece_id and f.path=m.script_path and f.revision=m.script_revision and lower(f.hash_value)=m.script_hash
join tongs.script_approval_revisions a on a.id=m.script_approval_id and a.workspace_id=m.workspace_id and a.workpiece_id=m.workpiece_id and a.approval_revision=m.script_approval_revision and a.script_content_hash=m.script_approval_hash
join tongs.script_approval_preflight_bindings b on b.script_approval_id=a.id and b.preflight_report_id=m.preflight_report_id and b.preflight_script_hash=a.script_content_hash
join tongs.hearth_editorial_preflight_reports p on p.id=b.preflight_report_id and p.script_content_hash=a.script_content_hash
join tongs.hearth_preflight_review_receipts r on r.report_id=p.id
join tongs.workpiece_hearth_preflight_sequences ps on ps.workspace_id=m.workspace_id and ps.workpiece_id=m.workpiece_id and ps.current_report_id=p.id
left join tongs.workpiece_hearth_research_sequences rs on rs.workspace_id=m.workspace_id and rs.workpiece_id=m.workpiece_id
where e.archived_at is null and (p.research_artifact_id is null or (rs.current_artifact_id=p.research_artifact_id and p.research_artifact_hash=m.research_artifact_hash));
grant select on tongs.current_workpiece_ready_scripts to authenticated;
commit;
