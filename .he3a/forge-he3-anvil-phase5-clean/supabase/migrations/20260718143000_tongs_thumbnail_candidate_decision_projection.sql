begin;
create or replace function tongs.get_thumbnail_candidate_set_projection(p_workspace_id uuid,p_workpiece_id uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,tongs as $$
declare v_binding tongs.workpiece_brand_bindings%rowtype; v_set tongs.thumbnail_candidate_sets%rowtype; v_members jsonb;
begin perform tongs.assert_workspace_role(p_workspace_id,'viewer');
 perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text||':'||p_workpiece_id::text||':brand',0));
 select * into v_binding from tongs.workpiece_brand_bindings where workspace_id=p_workspace_id and workpiece_id=p_workpiece_id order by revision desc limit 1;
 perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text||':'||p_workpiece_id::text||':thumbnail-candidate-set',0));
 select * into v_set from tongs.thumbnail_candidate_sets where workspace_id=p_workspace_id and workpiece_id=p_workpiece_id order by revision desc limit 1;
 if v_set.id is null then return jsonb_build_object('candidate_set',null,'active_binding_id',v_binding.id,'candidates','[]'::jsonb); end if;
 select jsonb_agg(to_jsonb(c)||jsonb_build_object('candidate_ordinal',m.candidate_ordinal,'eligibility_state',tongs.thumbnail_candidate_eligibility(c.id,v_binding.id),'current_decision_id',d.id,'current_decision_revision',coalesce(d.decision_revision,0)) order by m.candidate_ordinal) into v_members
 from tongs.thumbnail_candidate_set_members m join tongs.thumbnail_candidate_revisions c on c.id=m.candidate_revision_id
 left join lateral(select x.id,x.decision_revision from tongs.thumbnail_candidate_brand_decisions x where x.candidate_revision_id=c.id and x.active_binding_id=v_binding.id order by x.decision_revision desc limit 1)d on true where m.candidate_set_id=v_set.id;
 return jsonb_build_object('candidate_set',to_jsonb(v_set),'active_binding_id',v_binding.id,'active_binding_revision',v_binding.revision,'candidates',coalesce(v_members,'[]'::jsonb)); end $$;
revoke all on function tongs.get_thumbnail_candidate_set_projection(uuid,uuid) from public,anon;
grant execute on function tongs.get_thumbnail_candidate_set_projection(uuid,uuid) to authenticated,service_role;
commit;
