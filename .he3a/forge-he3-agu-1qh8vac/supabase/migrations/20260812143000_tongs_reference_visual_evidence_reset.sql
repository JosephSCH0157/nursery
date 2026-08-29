-- Canonical, auditable "start over" for Reference Visual evidence.
-- Source and workpiece-source links are intentionally untouched.
create table tongs.reference_visual_evidence_resets(
 id uuid primary key default gen_random_uuid(),
 operation_id text not null unique,
 operation_fingerprint text not null check(operation_fingerprint~'^[0-9a-f]{64}$'),
 workspace_id uuid not null,
 workpiece_id uuid not null,
 opportunity_id uuid not null,
 opportunity_revision_id uuid not null,
 opportunity_revision bigint not null,
 reset_by uuid not null,
 reset_at timestamptz not null default now()
);

alter table tongs.reference_visual_evidence_resets enable row level security;
create policy reference_visual_evidence_resets_viewer on tongs.reference_visual_evidence_resets
 for select to authenticated using(tongs.has_workspace_role(workspace_id,'viewer'));
revoke all on tongs.reference_visual_evidence_resets from public,anon,authenticated;
grant select on tongs.reference_visual_evidence_resets to authenticated;

create or replace function tongs.reset_reference_visual_evidence(
 p_workspace_id uuid,p_workpiece_id uuid,p_opportunity_id uuid,
 p_expected_opportunity_revision_id uuid,p_expected_opportunity_revision bigint,
 p_operation_id text,p_operation_fingerprint text,p_actor_id uuid
)returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $$
declare existing tongs.reference_visual_evidence_resets%rowtype; current_opp tongs.reference_visual_opportunity_revisions%rowtype; result jsonb;
begin
 if not tongs.has_workspace_role(p_workspace_id,'editor') or auth.uid() is distinct from p_actor_id then raise exception 'workspace editor authority required' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_operation_id,0));
 select * into existing from tongs.reference_visual_evidence_resets where operation_id=p_operation_id;
 if found then
  if existing.operation_fingerprint<>p_operation_fingerprint then return jsonb_build_object('disposition','operation_identity_conflict');end if;
  return jsonb_build_object('disposition','committed','reset_id',existing.id,'reset_at',existing.reset_at);
 end if;
 select o.* into current_opp from tongs.reference_visual_plan_sequences ps
 join tongs.reference_visual_plan_membership pm on pm.plan_revision_id=ps.current_plan_revision_id and pm.opportunity_id=p_opportunity_id
 join tongs.reference_visual_opportunity_revisions o on o.id=pm.opportunity_revision_id
 where ps.workspace_id=p_workspace_id and ps.workpiece_id=p_workpiece_id;
 if current_opp.id is null or current_opp.id is distinct from p_expected_opportunity_revision_id or current_opp.revision<>p_expected_opportunity_revision then return jsonb_build_object('disposition','opportunity_revision_conflict');end if;
 insert into tongs.reference_visual_evidence_resets(operation_id,operation_fingerprint,workspace_id,workpiece_id,opportunity_id,opportunity_revision_id,opportunity_revision,reset_by)
 values(p_operation_id,p_operation_fingerprint,p_workspace_id,p_workpiece_id,p_opportunity_id,current_opp.id,current_opp.revision,p_actor_id) returning * into existing;
 -- Sequences are current-state pointers. Immutable evidence and recipe revisions remain in history.
 delete from tongs.reference_visual_evidence_sequences es using tongs.reference_visual_evidence_revisions er
  where es.current_evidence_revision_id=er.id and es.workspace_id=p_workspace_id and es.workpiece_id=p_workpiece_id and er.opportunity_id=p_opportunity_id;
 delete from tongs.reference_visual_recipe_sequences where workspace_id=p_workspace_id and workpiece_id=p_workpiece_id and opportunity_id=p_opportunity_id;
 result:=jsonb_build_object('disposition','committed','reset_id',existing.id,'reset_at',existing.reset_at,'sources_preserved',true);
 return result;
end$$;

revoke all on function tongs.reset_reference_visual_evidence(uuid,uuid,uuid,uuid,bigint,text,text,uuid) from public,anon;
grant execute on function tongs.reset_reference_visual_evidence(uuid,uuid,uuid,uuid,bigint,text,text,uuid) to authenticated,service_role;

-- Hide candidates and selections from earlier attempts while retaining their immutable audit history.
create or replace function tongs.read_current_reference_visual_plan(p_workspace_id uuid,p_workpiece_id uuid)returns jsonb language sql stable security definer set search_path=pg_catalog,tongs as $$
select case when not tongs.has_workspace_role(p_workspace_id,'viewer')then null else(
 select jsonb_build_object('sequence',to_jsonb(s),'plan_revision',to_jsonb(p),'opportunities',coalesce((
  select jsonb_agg(jsonb_build_object(
   'membership',to_jsonb(m),'opportunity_revision',to_jsonb(o),'source_revision',to_jsonb(sr),'source_link_revision',to_jsonb(lr),
   'evidence',coalesce((select jsonb_agg(to_jsonb(e)order by e.created_at)from tongs.reference_visual_evidence_sequences es join tongs.reference_visual_evidence_revisions e on e.id=es.current_evidence_revision_id where es.workspace_id=m.workspace_id and es.workpiece_id=m.workpiece_id and e.opportunity_id=m.opportunity_id),'[]'::jsonb),
   'recipe',to_jsonb(rr),'rights_declaration',to_jsonb(rd),
   'candidates',coalesce((select jsonb_agg(to_jsonb(c)||jsonb_build_object('asset',to_jsonb(a),'asset_restriction',to_jsonb(ar),'release_ready',rd.rights_status<>'rights_unresolved'and tongs.reference_visual_candidate_assets_available(c.id))order by c.created_at)from tongs.reference_visual_candidate_revisions c left join tongs.assets a on a.id=c.asset_id left join tongs.reference_visual_asset_restriction_sequences ars on ars.asset_id=c.asset_id left join tongs.reference_visual_asset_restriction_revisions ar on ar.id=ars.current_restriction_revision_id where c.workspace_id=m.workspace_id and c.workpiece_id=m.workpiece_id and c.opportunity_id=m.opportunity_id and c.created_at>coalesce(reset_state.reset_at,'-infinity'::timestamptz)),'[]'::jsonb),
   'selection',to_jsonb(sel),'release_ready',sel.id is not null and rd.rights_status<>'rights_unresolved'and tongs.reference_visual_candidate_assets_available(sel.candidate_revision_id)
  )order by m.ordinal)
  from tongs.reference_visual_plan_membership m join tongs.reference_visual_opportunity_revisions o on o.id=m.opportunity_revision_id
  left join tongs.source_revisions sr on sr.id=o.source_revision_id left join tongs.workpiece_source_link_revisions lr on lr.id=o.workpiece_source_link_revision_id
  left join lateral(select max(r.reset_at) reset_at from tongs.reference_visual_evidence_resets r where r.workspace_id=m.workspace_id and r.workpiece_id=m.workpiece_id and r.opportunity_id=m.opportunity_id)reset_state on true
  left join tongs.reference_visual_recipe_sequences rs on rs.workspace_id=m.workspace_id and rs.workpiece_id=m.workpiece_id and rs.opportunity_id=m.opportunity_id left join tongs.reference_visual_recipe_revisions rr on rr.id=rs.current_recipe_revision_id
  left join tongs.reference_visual_rights_declaration_sequences rds on rds.workspace_id=m.workspace_id and rds.workpiece_id=m.workpiece_id and rds.opportunity_id=m.opportunity_id left join tongs.reference_visual_rights_declaration_revisions rd on rd.id=rds.current_declaration_revision_id
  left join lateral(select x.* from tongs.reference_visual_selections x where x.workspace_id=m.workspace_id and x.workpiece_id=m.workpiece_id and x.opportunity_id=m.opportunity_id and x.plan_revision_id=m.plan_revision_id and x.created_at>coalesce(reset_state.reset_at,'-infinity'::timestamptz) order by x.revision desc limit 1)sel on true
  where m.plan_revision_id=s.current_plan_revision_id
 ),'[]'::jsonb))from tongs.reference_visual_plan_sequences s join tongs.reference_visual_plan_revisions p on p.id=s.current_plan_revision_id where s.workspace_id=p_workspace_id and s.workpiece_id=p_workpiece_id
)end$$;
