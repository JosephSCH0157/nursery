begin;

alter table tongs.reference_visual_evidence_resets
  add column reset_request_id uuid;
create unique index reference_visual_evidence_resets_request_idx
  on tongs.reference_visual_evidence_resets(workspace_id,workpiece_id,opportunity_id,reset_request_id)
  where reset_request_id is not null;
alter table tongs.reference_visual_evidence_resets force row level security;
drop trigger if exists reference_visual_evidence_resets_immutable on tongs.reference_visual_evidence_resets;
create trigger reference_visual_evidence_resets_immutable
  before update or delete on tongs.reference_visual_evidence_resets
  for each row execute function tongs.reject_reference_visual_immutable_mutation();
revoke all on tongs.reference_visual_evidence_resets from public,anon,authenticated,service_role;
grant select on tongs.reference_visual_evidence_resets to authenticated,service_role;

-- Evidence reset is an append-only visibility boundary. Canonical claim,
-- evidence, recipe, candidate, and selection history remains immutable.
create table tongs.reference_visual_evidence_claim_activations(
  activation_id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  workpiece_id uuid not null,
  opportunity_id uuid not null,
  canonical_claim_id uuid not null,
  canonical_evidence_id uuid not null,
  operation_id text not null unique,
  operation_fingerprint text not null check(operation_fingerprint~'^[0-9a-f]{64}$'),
  activated_by uuid not null,
  activated_at timestamptz not null default clock_timestamp(),
  foreign key(canonical_claim_id,workspace_id,workpiece_id,opportunity_id)
    references tongs.reference_visual_evidence_claims(claim_id,workspace_id,workpiece_id,opportunity_id),
  foreign key(workspace_id,workpiece_id,canonical_evidence_id)
    references tongs.reference_visual_evidence_sequences(workspace_id,workpiece_id,evidence_id)
);

create index reference_visual_evidence_claim_activations_scope_idx
  on tongs.reference_visual_evidence_claim_activations(workspace_id,workpiece_id,opportunity_id,canonical_claim_id,activated_at desc);

alter table tongs.reference_visual_evidence_claim_activations enable row level security;
alter table tongs.reference_visual_evidence_claim_activations force row level security;
create policy reference_visual_evidence_claim_activations_viewer
  on tongs.reference_visual_evidence_claim_activations for select to authenticated
  using(tongs.has_workspace_role(workspace_id,'viewer'));
revoke all on tongs.reference_visual_evidence_claim_activations from public,anon,authenticated,service_role;
grant select on tongs.reference_visual_evidence_claim_activations to authenticated;
grant select,insert on tongs.reference_visual_evidence_claim_activations to service_role;
create trigger reference_visual_evidence_claim_activations_immutable
  before update or delete on tongs.reference_visual_evidence_claim_activations
  for each row execute function tongs.reject_reference_visual_immutable_mutation();

create or replace function tongs.activate_reference_visual_evidence_claim_after_commit()
returns trigger language plpgsql security definer set search_path=pg_catalog,tongs as $$
declare
  claim tongs.reference_visual_evidence_claims%rowtype;
  latest_reset_at timestamptz;
begin
  if new.operation_type<>'evidence_commit' or new.state<>'committed' then
    return new;
  end if;
  select c.* into claim
  from tongs.reference_visual_evidence_claims c
  where c.claim_id=nullif(new.receipt_json->>'canonical_claim_id','')::uuid;
  if claim.claim_id is null then return new; end if;
  select max(r.reset_at) into latest_reset_at
  from tongs.reference_visual_evidence_resets r
  where r.workspace_id=claim.workspace_id and r.workpiece_id=claim.workpiece_id
    and r.opportunity_id=claim.opportunity_id;
  if latest_reset_at is not null and claim.created_at<=latest_reset_at
    and not exists(
      select 1 from tongs.reference_visual_evidence_claim_activations a
      where a.canonical_claim_id=claim.claim_id and a.activated_at>latest_reset_at
    ) then
    insert into tongs.reference_visual_evidence_claim_activations(
      workspace_id,workpiece_id,opportunity_id,canonical_claim_id,canonical_evidence_id,
      operation_id,operation_fingerprint,activated_by,activated_at
    ) values(
      claim.workspace_id,claim.workpiece_id,claim.opportunity_id,claim.claim_id,
      claim.canonical_evidence_id,new.operation_id,new.operation_fingerprint,new.created_by,
      clock_timestamp()
    ) on conflict(operation_id) do nothing;
  end if;
  return new;
end$$;

drop trigger if exists reference_visual_evidence_claim_activation on tongs.reference_visual_operation_receipts;
create trigger reference_visual_evidence_claim_activation
  after insert on tongs.reference_visual_operation_receipts
  for each row execute function tongs.activate_reference_visual_evidence_claim_after_commit();

drop function if exists tongs.reset_reference_visual_evidence(uuid,uuid,uuid,uuid,bigint,text,text,uuid);
create function tongs.reset_reference_visual_evidence(
  p_workspace_id uuid,p_workpiece_id uuid,p_opportunity_id uuid,
  p_expected_opportunity_revision_id uuid,p_expected_opportunity_revision bigint,
  p_reset_request_id uuid,p_operation_id text,p_operation_fingerprint text,p_actor_id uuid
)returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $$
declare
  existing tongs.reference_visual_evidence_resets%rowtype;
  current_opp tongs.reference_visual_opportunity_revisions%rowtype;
begin
  if not tongs.has_workspace_role(p_workspace_id,'editor') or auth.uid() is distinct from p_actor_id then
    raise exception 'workspace editor authority required' using errcode='42501';
  end if;
  if p_reset_request_id is null then
    return jsonb_build_object('disposition','reset_request_id_required');
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text||':'||p_opportunity_id::text||':'||p_reset_request_id::text,0));
  select * into existing from tongs.reference_visual_evidence_resets
  where operation_id=p_operation_id or(
    workspace_id=p_workspace_id and workpiece_id=p_workpiece_id
    and opportunity_id=p_opportunity_id and reset_request_id=p_reset_request_id
  );
  if found then
    if existing.operation_fingerprint<>p_operation_fingerprint then
      return jsonb_build_object('disposition','operation_identity_conflict');
    end if;
    return jsonb_build_object('disposition','committed','reset_id',existing.id,
      'reset_at',existing.reset_at,'sources_preserved',true,'source_use_preserved',true,
      'rights_preserved',true,'replay',true);
  end if;
  select o.* into current_opp
  from tongs.reference_visual_plan_sequences ps
  join tongs.reference_visual_plan_membership pm
    on pm.plan_revision_id=ps.current_plan_revision_id and pm.opportunity_id=p_opportunity_id
  join tongs.reference_visual_opportunity_revisions o on o.id=pm.opportunity_revision_id
  where ps.workspace_id=p_workspace_id and ps.workpiece_id=p_workpiece_id;
  if current_opp.id is null or current_opp.id is distinct from p_expected_opportunity_revision_id
    or current_opp.revision<>p_expected_opportunity_revision then
    return jsonb_build_object('disposition','opportunity_revision_conflict');
  end if;
  insert into tongs.reference_visual_evidence_resets(
    operation_id,operation_fingerprint,workspace_id,workpiece_id,opportunity_id,reset_request_id,
    opportunity_revision_id,opportunity_revision,reset_by,reset_at
  ) values(
    p_operation_id,p_operation_fingerprint,p_workspace_id,p_workpiece_id,p_opportunity_id,p_reset_request_id,
    current_opp.id,current_opp.revision,p_actor_id,clock_timestamp()
  ) returning * into existing;
  return jsonb_build_object('disposition','committed','reset_id',existing.id,
    'reset_at',existing.reset_at,'sources_preserved',true,'source_use_preserved',true,
    'rights_preserved',true,'replay',false);
end$$;

revoke all on function tongs.reset_reference_visual_evidence(uuid,uuid,uuid,uuid,bigint,uuid,text,text,uuid) from public,anon;
grant execute on function tongs.reset_reference_visual_evidence(uuid,uuid,uuid,uuid,bigint,uuid,text,text,uuid) to authenticated,service_role;

-- Current readback honors the newest reset without mutating historical rows.
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
   'evidence',coalesce((select jsonb_agg(to_jsonb(e)||jsonb_build_object('canonical_claim_id',claim.claim_id,'claim_fingerprint',claim.claim_fingerprint)order by e.created_at)
     from tongs.reference_visual_evidence_claims claim
     join tongs.reference_visual_evidence_sequences es on es.workspace_id=claim.workspace_id and es.workpiece_id=claim.workpiece_id and es.evidence_id=claim.canonical_evidence_id
     join tongs.reference_visual_evidence_revisions e on e.id=es.current_evidence_revision_id
     where claim.workspace_id=m.workspace_id and claim.workpiece_id=m.workpiece_id and claim.opportunity_id=m.opportunity_id
       and greatest(claim.created_at,coalesce((select max(a.activated_at)from tongs.reference_visual_evidence_claim_activations a where a.canonical_claim_id=claim.claim_id),'-infinity'::timestamptz))>coalesce(reset_state.reset_at,'-infinity'::timestamptz)
       and claim.claim_fingerprint=tongs.reference_visual_evidence_claim_fingerprint(e.workspace_id,e.workpiece_id,e.opportunity_id,e.source_set_member_id,e.source_revision_id,e.workpiece_source_link_revision_id,e.document_locator_json,e.raw_excerpt,e.numeric_value,e.unit,e.evidence_role,e.category)
       and(e.source_set_member_id is null or exists(select 1 from tongs.reference_visual_source_set_members active where active.source_set_revision_id=ss.id and active.id=e.source_set_member_id))),'[]'::jsonb),
   'source_use',to_jsonb(su),'recipe',to_jsonb(rr),'rights_declaration',to_jsonb(rd),
   'candidates',coalesce((select jsonb_agg(to_jsonb(c)||jsonb_build_object('asset',to_jsonb(a),'release_ready',tongs.reference_visual_candidate_release_ready(c.id))order by c.created_at)from tongs.reference_visual_candidate_revisions c left join tongs.assets a on a.id=c.asset_id where c.workspace_id=m.workspace_id and c.workpiece_id=m.workpiece_id and c.opportunity_id=m.opportunity_id and c.opportunity_revision_id=m.opportunity_revision_id and c.created_at>coalesce(reset_state.reset_at,'-infinity'::timestamptz)),'[]'::jsonb),
   'selection',to_jsonb(sel),'selection_revision_authority',coalesce((select max(all_sel.revision)from tongs.reference_visual_selections all_sel where all_sel.plan_revision_id=p.id and all_sel.opportunity_id=m.opportunity_id),0),'release_ready',sel.id is not null and tongs.reference_visual_candidate_release_ready(sel.candidate_revision_id)
  )order by m.ordinal)
  from tongs.reference_visual_plan_membership m join tongs.reference_visual_opportunity_revisions o on o.id=m.opportunity_revision_id
  left join tongs.source_revisions sr on sr.id=o.source_revision_id left join tongs.workpiece_source_link_revisions sl on sl.id=o.workpiece_source_link_revision_id
  left join lateral(select x.* from tongs.reference_visual_source_set_revisions x where x.plan_revision_id=p.id and x.opportunity_id=m.opportunity_id order by x.revision desc limit 1)ss on true
  left join lateral(select max(r.reset_at) reset_at from tongs.reference_visual_evidence_resets r where r.workspace_id=m.workspace_id and r.workpiece_id=m.workpiece_id and r.opportunity_id=m.opportunity_id)reset_state on true
  left join lateral(select u.* from tongs.reference_visual_source_use_sequences us join tongs.reference_visual_source_use_revisions u on u.id=us.current_use_revision_id where us.workspace_id=m.workspace_id and us.workpiece_id=m.workpiece_id and us.opportunity_id=m.opportunity_id order by u.revision desc limit 1)su on true
  left join lateral(select r.* from tongs.reference_visual_recipe_sequences rs join tongs.reference_visual_recipe_revisions r on r.id=rs.current_recipe_revision_id where rs.workspace_id=m.workspace_id and rs.workpiece_id=m.workpiece_id and rs.opportunity_id=m.opportunity_id and r.created_at>coalesce(reset_state.reset_at,'-infinity'::timestamptz) order by r.revision desc limit 1)rr on true
  left join tongs.reference_visual_rights_declaration_sequences rds on rds.workspace_id=m.workspace_id and rds.workpiece_id=m.workpiece_id and rds.opportunity_id=m.opportunity_id left join tongs.reference_visual_rights_declaration_revisions rd on rd.id=rds.current_declaration_revision_id
  left join lateral(select x.* from tongs.reference_visual_selections x where x.plan_revision_id=p.id and x.opportunity_id=m.opportunity_id and x.created_at>coalesce(reset_state.reset_at,'-infinity'::timestamptz) order by x.revision desc limit 1)sel on true
  where m.plan_revision_id=p.id),'[]'::jsonb)
 ) end
 from tongs.reference_visual_plan_sequences s join tongs.reference_visual_plan_revisions p on p.id=s.current_plan_revision_id
 where s.workspace_id=p_workspace_id and s.workpiece_id=p_workpiece_id
$$;

revoke all on function tongs.read_current_reference_visual_plan(uuid,uuid) from public,anon;
grant execute on function tongs.read_current_reference_visual_plan(uuid,uuid) to authenticated,service_role;

comment on table tongs.reference_visual_evidence_claim_activations is
  'Append-only evidence-claim reactivation events after a Reference Visual reset; historical claim identity is never rewritten.';

commit;
