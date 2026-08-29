begin;

-- A Source transition creates a new opportunity revision. Project only child
-- authority created for that revision (or explicitly bound to its Source), so
-- predecessor evidence, recipes, rights, candidates, and selections remain
-- immutable history without satisfying the new current opportunity.
create or replace function tongs.read_current_reference_visual_plan(
  p_workspace_id uuid,p_workpiece_id uuid
) returns jsonb language sql stable security definer set search_path=pg_catalog,tongs as $$
 select case when not tongs.has_workspace_role(p_workspace_id,'viewer')then null else
 jsonb_build_object('plan_revision',to_jsonb(p),'opportunities',coalesce((
  select jsonb_agg(jsonb_build_object(
   'membership',to_jsonb(m),'opportunity_revision',to_jsonb(o),'source_revision',to_jsonb(sr),'source_link_revision',to_jsonb(sl),
   'evidence',coalesce((select jsonb_agg(to_jsonb(e)order by e.created_at) from tongs.reference_visual_evidence_sequences es join tongs.reference_visual_evidence_revisions e on e.id=es.current_evidence_revision_id where es.workspace_id=m.workspace_id and es.workpiece_id=m.workpiece_id and e.opportunity_id=m.opportunity_id and e.source_revision_id=o.source_revision_id and e.workpiece_source_link_revision_id=o.workpiece_source_link_revision_id and e.created_at>=o.created_at),'[]'::jsonb),
   'source_use',to_jsonb(su),'recipe',to_jsonb(rr),'rights_declaration',to_jsonb(rd),
   'candidates',coalesce((select jsonb_agg(to_jsonb(c)||jsonb_build_object('asset',to_jsonb(a),'asset_restriction',to_jsonb(ar),'source_use',to_jsonb(cu),'release_ready',tongs.reference_visual_candidate_release_ready(c.id))order by c.created_at) from tongs.reference_visual_candidate_revisions c left join tongs.assets a on a.id=c.asset_id left join tongs.reference_visual_asset_restriction_sequences ars on ars.asset_id=c.asset_id left join tongs.reference_visual_asset_restriction_revisions ar on ar.id=ars.current_restriction_revision_id left join tongs.reference_visual_source_use_revisions cu on cu.id=c.source_use_revision_id where c.workspace_id=m.workspace_id and c.workpiece_id=m.workpiece_id and c.opportunity_id=m.opportunity_id and c.opportunity_revision_id=m.opportunity_revision_id),'[]'::jsonb),
   'selection',to_jsonb(sel),'release_ready',sel.id is not null and tongs.reference_visual_candidate_release_ready(sel.candidate_revision_id)
  )order by m.ordinal)
  from tongs.reference_visual_plan_membership m
  join tongs.reference_visual_opportunity_revisions o on o.id=m.opportunity_revision_id
  left join tongs.source_revisions sr on sr.id=o.source_revision_id
  left join tongs.workpiece_source_link_revisions sl on sl.id=o.workpiece_source_link_revision_id
  left join lateral(select u.* from tongs.reference_visual_source_use_sequences us join tongs.reference_visual_source_use_revisions u on u.id=us.current_use_revision_id where us.workspace_id=m.workspace_id and us.workpiece_id=m.workpiece_id and us.opportunity_id=m.opportunity_id and u.opportunity_revision_id=o.id order by u.revision desc limit 1)su on true
  left join lateral(select r.* from tongs.reference_visual_recipe_sequences rs join tongs.reference_visual_recipe_revisions r on r.id=rs.current_recipe_revision_id where rs.workspace_id=m.workspace_id and rs.workpiece_id=m.workpiece_id and rs.opportunity_id=m.opportunity_id and r.created_at>=o.created_at order by r.revision desc limit 1)rr on true
  left join lateral(select d.* from tongs.reference_visual_rights_declaration_sequences ds join tongs.reference_visual_rights_declaration_revisions d on d.id=ds.current_declaration_revision_id where ds.workspace_id=m.workspace_id and ds.workpiece_id=m.workpiece_id and ds.opportunity_id=m.opportunity_id and d.created_at>=o.created_at order by d.revision desc limit 1)rd on true
  left join lateral(select x.* from tongs.reference_visual_selections x where x.workspace_id=m.workspace_id and x.workpiece_id=m.workpiece_id and x.opportunity_id=m.opportunity_id and x.plan_revision_id=m.plan_revision_id order by x.revision desc limit 1)sel on true
  where m.plan_revision_id=p.id
 ),'[]'::jsonb))end
 from tongs.reference_visual_plan_sequences s join tongs.reference_visual_plan_revisions p on p.id=s.current_plan_revision_id
 where s.workspace_id=p_workspace_id and s.workpiece_id=p_workpiece_id
$$;

revoke all on function tongs.read_current_reference_visual_plan(uuid,uuid) from public,anon;
grant execute on function tongs.read_current_reference_visual_plan(uuid,uuid) to authenticated,service_role;
notify pgrst,'reload schema';
commit;
