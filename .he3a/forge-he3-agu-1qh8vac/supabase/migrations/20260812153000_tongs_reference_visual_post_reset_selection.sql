-- A reset hides the old selection but retains its immutable history. Accept the
-- UI's active revision 0 after reset while continuing the canonical revision chain.
create or replace function tongs.select_reference_visual_candidate(
 p_workspace_id uuid,p_workpiece_id uuid,p_opportunity_id uuid,p_candidate_revision_id uuid,
 p_expected_plan_revision_id uuid,p_expected_plan_revision bigint,p_expected_selection_revision bigint,
 p_operation_id text,p_operation_fingerprint text,p_actor_id uuid
)returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $$
declare op tongs.reference_visual_operation_receipts%rowtype;seq tongs.reference_visual_plan_sequences%rowtype;member_rev tongs.reference_visual_plan_membership%rowtype;cand_rev tongs.reference_visual_candidate_revisions%rowtype;previous_selection tongs.reference_visual_selections%rowtype;new_selection tongs.reference_visual_selections%rowtype;latest_reset timestamptz;active_revision bigint;result jsonb;
begin
 if not tongs.has_workspace_role(p_workspace_id,'editor')or auth.uid() is distinct from p_actor_id then raise exception 'workspace editor authority required' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_operation_id,0));
 select * into op from tongs.reference_visual_operation_receipts where operation_id=p_operation_id;
 if found then if op.operation_fingerprint<>p_operation_fingerprint then return jsonb_build_object('disposition','operation_identity_conflict');end if;return op.receipt_json;end if;
 select * into seq from tongs.reference_visual_plan_sequences where workspace_id=p_workspace_id and workpiece_id=p_workpiece_id for update;
 if seq.current_plan_revision_id is distinct from p_expected_plan_revision_id or seq.current_plan_revision<>p_expected_plan_revision then return jsonb_build_object('disposition','plan_revision_conflict');end if;
 select * into member_rev from tongs.reference_visual_plan_membership where plan_revision_id=seq.current_plan_revision_id and opportunity_id=p_opportunity_id;
 if not found then return jsonb_build_object('disposition','opportunity_not_current');end if;
 select * into cand_rev from tongs.reference_visual_candidate_revisions where id=p_candidate_revision_id and workspace_id=p_workspace_id and workpiece_id=p_workpiece_id and opportunity_id=p_opportunity_id and opportunity_revision_id=member_rev.opportunity_revision_id;
 if not found then return jsonb_build_object('disposition','candidate_not_attached');end if;
 if not tongs.reference_visual_candidate_release_ready(cand_rev.id) then return jsonb_build_object('disposition','candidate_not_release_ready');end if;
 select max(reset_at) into latest_reset from tongs.reference_visual_evidence_resets where workspace_id=p_workspace_id and workpiece_id=p_workpiece_id and opportunity_id=p_opportunity_id;
 select * into previous_selection from tongs.reference_visual_selections where workspace_id=p_workspace_id and workpiece_id=p_workpiece_id and opportunity_id=p_opportunity_id and plan_revision_id=seq.current_plan_revision_id order by revision desc limit 1;
 active_revision:=case when previous_selection.id is null or(latest_reset is not null and previous_selection.created_at<=latest_reset)then 0 else previous_selection.revision end;
 if active_revision<>p_expected_selection_revision then return jsonb_build_object('disposition','selection_revision_conflict','current_revision',active_revision);end if;
 insert into tongs.reference_visual_selections(workspace_id,workpiece_id,opportunity_id,revision,previous_selection_id,previous_revision,plan_revision_id,plan_revision,candidate_revision_id,operation_id,operation_fingerprint,created_by)
 values(p_workspace_id,p_workpiece_id,p_opportunity_id,coalesce(previous_selection.revision,0)+1,previous_selection.id,previous_selection.revision,seq.current_plan_revision_id,seq.current_plan_revision,cand_rev.id,p_operation_id,p_operation_fingerprint,p_actor_id)returning * into new_selection;
 result:=jsonb_build_object('disposition','committed','selection',to_jsonb(new_selection));
 insert into tongs.reference_visual_operation_receipts values(p_operation_id,p_operation_fingerprint,'selection',p_workspace_id,p_workpiece_id,'committed',new_selection.id,result,p_actor_id,now());
 return result;
end$$;

revoke all on function tongs.select_reference_visual_candidate(uuid,uuid,uuid,uuid,uuid,bigint,bigint,text,text,uuid)from public,anon;
grant execute on function tongs.select_reference_visual_candidate(uuid,uuid,uuid,uuid,uuid,bigint,bigint,text,text,uuid)to authenticated,service_role;
