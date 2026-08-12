-- Restore collection-aware readback after the evidence-reset migration while
-- keeping candidates and selections from earlier attempts out of active state.
create or replace function tongs.read_current_reference_visual_plan(p_workspace_id uuid,p_workpiece_id uuid)
returns jsonb language sql stable security definer set search_path=pg_catalog,tongs as $$
 select case when not tongs.has_workspace_role(p_workspace_id,'viewer') then null else jsonb_build_object(
  'plan_revision',to_jsonb(p),
  'summary',jsonb_build_object(
   'total',(select count(*) from tongs.reference_visual_plan_membership x where x.plan_revision_id=p.id),
   'fulfilled',(select count(*) from tongs.reference_visual_plan_membership x where x.plan_revision_id=p.id and exists(select 1 from tongs.reference_visual_source_set_revisions ss join tongs.reference_visual_source_set_members sm on sm.source_set_revision_id=ss.id where ss.plan_revision_id=p.id and ss.opportunity_id=x.opportunity_id and ss.revision=(select max(z.revision)from tongs.reference_visual_source_set_revisions z where z.plan_revision_id=p.id and z.opportunity_id=x.opportunity_id))),
   'unresolved',(select count(*) from tongs.reference_visual_plan_membership x where x.plan_revision_id=p.id and not exists(select 1 from tongs.reference_visual_source_set_revisions ss join tongs.reference_visual_source_set_members sm on sm.source_set_revision_id=ss.id where ss.plan_revision_id=p.id and ss.opportunity_id=x.opportunity_id and ss.revision=(select max(z.revision)from tongs.reference_visual_source_set_revisions z where z.plan_revision_id=p.id and z.opportunity_id=x.opportunity_id)))
  ),
  'opportunities',coalesce((select jsonb_agg(jsonb_build_object(
   'membership',to_jsonb(m),'opportunity_revision',to_jsonb(o),'source_revision',to_jsonb(sr),'source_link_revision',to_jsonb(sl),'source_set',to_jsonb(ss),
   'sources',coalesce((select jsonb_agg(to_jsonb(sm)||jsonb_build_object('source_revision',to_jsonb(msr),'source_link_revision',to_jsonb(msl))order by sm.ordinal)from tongs.reference_visual_source_set_members sm join tongs.source_revisions msr on msr.id=sm.source_revision_id join tongs.workpiece_source_link_revisions msl on msl.id=sm.workpiece_source_link_revision_id where sm.source_set_revision_id=ss.id),'[]'::jsonb),
   'evidence',coalesce((select jsonb_agg(to_jsonb(e)order by e.created_at)from tongs.reference_visual_evidence_sequences es join tongs.reference_visual_evidence_revisions e on e.id=es.current_evidence_revision_id where es.workspace_id=m.workspace_id and es.workpiece_id=m.workpiece_id and e.opportunity_id=m.opportunity_id and(e.source_set_member_id is null or exists(select 1 from tongs.reference_visual_source_set_members active where active.source_set_revision_id=ss.id and active.id=e.source_set_member_id))),'[]'::jsonb),
   'source_use',to_jsonb(su),'recipe',to_jsonb(rr),'rights_declaration',to_jsonb(rd),
   'candidates',coalesce((select jsonb_agg(to_jsonb(c)||jsonb_build_object('asset',to_jsonb(a),'release_ready',tongs.reference_visual_candidate_release_ready(c.id))order by c.created_at)from tongs.reference_visual_candidate_revisions c left join tongs.assets a on a.id=c.asset_id where c.workspace_id=m.workspace_id and c.workpiece_id=m.workpiece_id and c.opportunity_id=m.opportunity_id and c.opportunity_revision_id=m.opportunity_revision_id and c.created_at>coalesce(reset_state.reset_at,'-infinity'::timestamptz)),'[]'::jsonb),
   'selection',to_jsonb(sel),'selection_revision_authority',coalesce((select max(all_sel.revision)from tongs.reference_visual_selections all_sel where all_sel.plan_revision_id=p.id and all_sel.opportunity_id=m.opportunity_id),0),'release_ready',sel.id is not null and tongs.reference_visual_candidate_release_ready(sel.candidate_revision_id)
  )order by m.ordinal)
  from tongs.reference_visual_plan_membership m join tongs.reference_visual_opportunity_revisions o on o.id=m.opportunity_revision_id
  left join tongs.source_revisions sr on sr.id=o.source_revision_id left join tongs.workpiece_source_link_revisions sl on sl.id=o.workpiece_source_link_revision_id
  left join lateral(select x.* from tongs.reference_visual_source_set_revisions x where x.plan_revision_id=p.id and x.opportunity_id=m.opportunity_id order by x.revision desc limit 1)ss on true
  left join lateral(select max(r.reset_at) reset_at from tongs.reference_visual_evidence_resets r where r.workspace_id=m.workspace_id and r.workpiece_id=m.workpiece_id and r.opportunity_id=m.opportunity_id)reset_state on true
  left join lateral(select u.* from tongs.reference_visual_source_use_sequences us join tongs.reference_visual_source_use_revisions u on u.id=us.current_use_revision_id where us.workspace_id=m.workspace_id and us.workpiece_id=m.workpiece_id and us.opportunity_id=m.opportunity_id order by u.revision desc limit 1)su on true
  left join tongs.reference_visual_recipe_sequences rs on rs.workspace_id=m.workspace_id and rs.workpiece_id=m.workpiece_id and rs.opportunity_id=m.opportunity_id left join tongs.reference_visual_recipe_revisions rr on rr.id=rs.current_recipe_revision_id
  left join tongs.reference_visual_rights_declaration_sequences rds on rds.workspace_id=m.workspace_id and rds.workpiece_id=m.workpiece_id and rds.opportunity_id=m.opportunity_id left join tongs.reference_visual_rights_declaration_revisions rd on rd.id=rds.current_declaration_revision_id
  left join lateral(select x.* from tongs.reference_visual_selections x where x.plan_revision_id=p.id and x.opportunity_id=m.opportunity_id and x.created_at>coalesce(reset_state.reset_at,'-infinity'::timestamptz) order by x.revision desc limit 1)sel on true
  where m.plan_revision_id=p.id),'[]'::jsonb)
 ) end
 from tongs.reference_visual_plan_sequences s join tongs.reference_visual_plan_revisions p on p.id=s.current_plan_revision_id
 where s.workspace_id=p_workspace_id and s.workpiece_id=p_workpiece_id
$$;

revoke all on function tongs.read_current_reference_visual_plan(uuid,uuid) from public,anon;
grant execute on function tongs.read_current_reference_visual_plan(uuid,uuid) to authenticated,service_role;
