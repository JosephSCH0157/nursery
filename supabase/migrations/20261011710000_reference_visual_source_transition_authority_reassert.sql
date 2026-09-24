begin;

-- Forward-only post-chain reassertion. The original Slice 1 migration remains
-- immutable; these guards make the final state deterministic after 11680000,
-- 11690000, and 11700000.
alter table tongs.reference_visual_rights_declaration_revisions
  add column if not exists source_set_revision_id uuid references tongs.reference_visual_source_set_revisions(id);
alter table tongs.reference_visual_render_operations
  add column if not exists source_set_revision_id uuid references tongs.reference_visual_source_set_revisions(id);
alter table tongs.reference_visual_acquisition_operations
  add column if not exists source_set_revision_id uuid references tongs.reference_visual_source_set_revisions(id);
alter table tongs.reference_visual_candidate_revisions
  add column if not exists source_set_revision_id uuid references tongs.reference_visual_source_set_revisions(id);

create index if not exists reference_visual_rights_source_set_idx
  on tongs.reference_visual_rights_declaration_revisions(source_set_revision_id);
create index if not exists reference_visual_render_source_set_idx
  on tongs.reference_visual_render_operations(source_set_revision_id);
create index if not exists reference_visual_acquisition_source_set_idx
  on tongs.reference_visual_acquisition_operations(source_set_revision_id);
create index if not exists reference_visual_candidate_source_set_idx
  on tongs.reference_visual_candidate_revisions(source_set_revision_id);

do $$
declare authority_table text;
begin
 foreach authority_table in array array[
   'reference_visual_rights_declaration_revisions',
   'reference_visual_render_operations',
   'reference_visual_acquisition_operations',
   'reference_visual_candidate_revisions'
 ] loop
   if not exists(
     select 1 from information_schema.columns
     where table_schema='tongs' and table_name=authority_table
       and column_name='source_set_revision_id' and data_type='uuid'
   ) then raise exception 'required Source-set binding missing: %.source_set_revision_id',authority_table;end if;
   if not exists(
     select 1 from pg_constraint c
     join pg_class rel on rel.oid=c.conrelid
     join pg_namespace n on n.oid=rel.relnamespace
     where n.nspname='tongs' and rel.relname=authority_table and c.contype='f'
       and pg_get_constraintdef(c.oid) like 'FOREIGN KEY (source_set_revision_id) REFERENCES tongs.reference_visual_source_set_revisions(id)%'
   ) then raise exception 'required Source-set foreign key missing: %.source_set_revision_id',authority_table;end if;
 end loop;
end$$;

create or replace function tongs.reference_visual_current_source_set(
  p_workspace_id uuid,p_workpiece_id uuid,p_opportunity_id uuid
) returns uuid language sql stable security definer set search_path=pg_catalog,tongs as $$
 select ss.id
 from tongs.reference_visual_plan_sequences ps
 join lateral(
   select x.id from tongs.reference_visual_source_set_revisions x
   where x.workspace_id=ps.workspace_id and x.workpiece_id=ps.workpiece_id
     and x.opportunity_id=p_opportunity_id and x.plan_revision_id=ps.current_plan_revision_id
   order by x.revision desc limit 1
 ) ss on true
 where ps.workspace_id=p_workspace_id and ps.workpiece_id=p_workpiece_id
$$;

create or replace function tongs.reference_visual_evidence_current_for_source_set(
  p_evidence_revision_id uuid,p_source_set_revision_id uuid
) returns boolean language sql stable security definer set search_path=pg_catalog,tongs as $$
 select exists(
   select 1
   from tongs.reference_visual_evidence_revisions e
   join tongs.reference_visual_evidence_sequences es
     on es.workspace_id=e.workspace_id and es.workpiece_id=e.workpiece_id
    and es.evidence_id=e.evidence_id and es.current_evidence_revision_id=e.id
   join tongs.reference_visual_evidence_claims claim
     on claim.workspace_id=e.workspace_id and claim.workpiece_id=e.workpiece_id
    and claim.opportunity_id=e.opportunity_id and claim.canonical_evidence_id=e.evidence_id
   join tongs.reference_visual_source_set_revisions ss on ss.id=p_source_set_revision_id
   join tongs.reference_visual_source_set_members active
     on active.source_set_revision_id=ss.id
    and active.source_revision_id=e.source_revision_id
    and active.workpiece_source_link_revision_id=e.workpiece_source_link_revision_id
   where e.id=p_evidence_revision_id and e.workspace_id=ss.workspace_id
     and e.workpiece_id=ss.workpiece_id and e.opportunity_id=ss.opportunity_id
     and e.confirmation_state='creator_confirmed'
     and claim.claim_fingerprint=tongs.reference_visual_evidence_claim_fingerprint(
       e.workspace_id,e.workpiece_id,e.opportunity_id,e.source_set_member_id,
       e.source_revision_id,e.workpiece_source_link_revision_id,e.document_locator_json,
       e.raw_excerpt,e.numeric_value,e.unit,e.evidence_role,e.category)
     and greatest(claim.created_at,coalesce((select max(a.activated_at)
       from tongs.reference_visual_evidence_claim_activations a
       where a.canonical_claim_id=claim.claim_id),'-infinity'::timestamptz))
       >coalesce((select max(r.reset_at) from tongs.reference_visual_evidence_resets r
         where r.workspace_id=e.workspace_id and r.workpiece_id=e.workpiece_id
           and r.opportunity_id=e.opportunity_id),'-infinity'::timestamptz)
 )
$$;

create or replace function tongs.reference_visual_source_use_current_for_source_set(
  p_source_use_revision_id uuid,p_source_set_revision_id uuid
) returns boolean language sql stable security definer set search_path=pg_catalog,tongs as $$
 select exists(
   select 1 from tongs.reference_visual_source_use_revisions u
   join tongs.reference_visual_source_use_sequences us
     on us.workspace_id=u.workspace_id and us.workpiece_id=u.workpiece_id
    and us.opportunity_id=u.opportunity_id and us.current_use_revision_id=u.id
   join tongs.reference_visual_source_set_revisions ss on ss.id=p_source_set_revision_id
   join tongs.reference_visual_source_set_members primary_source
     on primary_source.source_set_revision_id=ss.id and primary_source.ordinal=1
    and primary_source.source_revision_id=u.source_revision_id
    and primary_source.workpiece_source_link_revision_id=u.workpiece_source_link_revision_id
   where u.id=p_source_use_revision_id and u.workspace_id=ss.workspace_id
     and u.workpiece_id=ss.workpiece_id and u.opportunity_id=ss.opportunity_id
     and u.creator_confirmed
 )
$$;

create or replace function tongs.reference_visual_rights_current_for_source_set(
  p_rights_revision_id uuid,p_source_set_revision_id uuid
) returns boolean language sql stable security definer set search_path=pg_catalog,tongs as $$
 select exists(
   select 1 from tongs.reference_visual_rights_declaration_revisions r
   join tongs.reference_visual_rights_declaration_sequences rs
     on rs.workspace_id=r.workspace_id and rs.workpiece_id=r.workpiece_id
    and rs.opportunity_id=r.opportunity_id and rs.current_declaration_revision_id=r.id
   where r.id=p_rights_revision_id and r.source_set_revision_id=p_source_set_revision_id
     and r.rights_status<>'rights_unresolved'
     and (r.expires_at is null or r.expires_at>now())
 )
$$;

create or replace function tongs.reference_visual_recipe_current_for_source_set(
  p_recipe_revision_id uuid,p_source_set_revision_id uuid
) returns boolean language sql stable security definer set search_path=pg_catalog,tongs as $$
 select exists(
   select 1 from tongs.reference_visual_recipe_revisions r
   join tongs.reference_visual_recipe_sequences rs
     on rs.workspace_id=r.workspace_id and rs.workpiece_id=r.workpiece_id
    and rs.opportunity_id=r.opportunity_id and rs.current_recipe_revision_id=r.id
   join tongs.reference_visual_source_set_revisions ss
     on ss.id=p_source_set_revision_id and ss.workspace_id=r.workspace_id
    and ss.workpiece_id=r.workpiece_id and ss.opportunity_id=r.opportunity_id
   where r.id=p_recipe_revision_id
     and not exists(select 1 from unnest(r.evidence_revision_ids) e(id)
       where not tongs.reference_visual_evidence_current_for_source_set(e.id,ss.id))
 )
$$;

create or replace function tongs.reference_visual_candidate_current_for_plan(
  p_candidate_revision_id uuid
) returns boolean language sql stable security definer set search_path=pg_catalog,tongs as $$
 select exists(
   select 1 from tongs.reference_visual_candidate_revisions c
   join tongs.reference_visual_plan_sequences ps
     on ps.workspace_id=c.workspace_id and ps.workpiece_id=c.workpiece_id
   join tongs.reference_visual_plan_membership pm
     on pm.plan_revision_id=ps.current_plan_revision_id
    and pm.opportunity_id=c.opportunity_id and pm.opportunity_revision_id=c.opportunity_revision_id
   where c.id=p_candidate_revision_id
     and c.source_set_revision_id=tongs.reference_visual_current_source_set(c.workspace_id,c.workpiece_id,c.opportunity_id)
     and c.created_at>coalesce((select max(r.reset_at) from tongs.reference_visual_evidence_resets r
       where r.workspace_id=c.workspace_id and r.workpiece_id=c.workpiece_id
         and r.opportunity_id=c.opportunity_id),'-infinity'::timestamptz)
     and (c.recipe_revision_id is null or
       tongs.reference_visual_recipe_current_for_source_set(c.recipe_revision_id,c.source_set_revision_id))
     and (c.source_use_revision_id is null or
       tongs.reference_visual_source_use_current_for_source_set(c.source_use_revision_id,c.source_set_revision_id))
     and case when c.source_use_revision_id is not null and exists(
       select 1 from tongs.reference_visual_source_use_revisions u
       where u.id=c.source_use_revision_id and u.use_classification='facts_data_only'
     ) then c.rights_declaration_revision_id is null
     else tongs.reference_visual_rights_current_for_source_set(c.rights_declaration_revision_id,c.source_set_revision_id) end
 )
$$;

revoke all on function tongs.reference_visual_current_source_set(uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function tongs.reference_visual_evidence_current_for_source_set(uuid,uuid) from public,anon,authenticated;
revoke all on function tongs.reference_visual_source_use_current_for_source_set(uuid,uuid) from public,anon,authenticated;
revoke all on function tongs.reference_visual_rights_current_for_source_set(uuid,uuid) from public,anon,authenticated;
revoke all on function tongs.reference_visual_recipe_current_for_source_set(uuid,uuid) from public,anon,authenticated;
revoke all on function tongs.reference_visual_candidate_current_for_plan(uuid) from public,anon,authenticated;
grant execute on function tongs.reference_visual_current_source_set(uuid,uuid,uuid) to service_role;
grant execute on function tongs.reference_visual_evidence_current_for_source_set(uuid,uuid) to service_role;
grant execute on function tongs.reference_visual_source_use_current_for_source_set(uuid,uuid) to service_role;
grant execute on function tongs.reference_visual_rights_current_for_source_set(uuid,uuid) to service_role;
grant execute on function tongs.reference_visual_recipe_current_for_source_set(uuid,uuid) to service_role;
grant execute on function tongs.reference_visual_candidate_current_for_plan(uuid) to service_role;

-- The new overload carries the exact Source-set authority. The old signature below
-- resolves the current set at call time so a migration-first rollout is safe.
create or replace function tongs.commit_reference_visual_rights_declaration(
  p_workspace_id uuid,p_workpiece_id uuid,p_opportunity_id uuid,p_source_set_revision_id uuid,
  p_declaration_id uuid,p_expected_revision bigint,p_rights_status text,p_declaration jsonb,
  p_operation_id text,p_operation_fingerprint text,p_actor_id uuid
) returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $$
declare op tongs.reference_visual_operation_receipts%rowtype;seq tongs.reference_visual_rights_declaration_sequences%rowtype;
 prev tongs.reference_visual_rights_declaration_revisions%rowtype;r tongs.reference_visual_rights_declaration_revisions%rowtype;
 n bigint;h text;ih text;result jsonb;current_set uuid;
begin
 if not tongs.has_workspace_role(p_workspace_id,'editor') or auth.uid() is distinct from p_actor_id then raise exception 'workspace editor authority required' using errcode='42501';end if;
 current_set:=tongs.reference_visual_current_source_set(p_workspace_id,p_workpiece_id,p_opportunity_id);
 if current_set is null or current_set is distinct from p_source_set_revision_id then return jsonb_build_object('disposition','current_source_collection_required','current_source_set_revision_id',current_set);end if;
 if coalesce((p_declaration->>'creator_acknowledged_responsibility')::boolean,false) is not true then return jsonb_build_object('disposition','creator_rights_acknowledgement_required');end if;
 if coalesce((p_declaration->>'access_controls_bypassed')::boolean,false) then return jsonb_build_object('disposition','access_control_circumvention_prohibited');end if;
 perform pg_advisory_xact_lock(hashtextextended(p_operation_id,0));
 select * into op from tongs.reference_visual_operation_receipts where operation_id=p_operation_id;
 if found then if op.operation_fingerprint<>p_operation_fingerprint then return jsonb_build_object('disposition','operation_identity_conflict');end if;return op.receipt_json;end if;
 select * into seq from tongs.reference_visual_rights_declaration_sequences where workspace_id=p_workspace_id and workpiece_id=p_workpiece_id and opportunity_id=p_opportunity_id for update;
 if p_expected_revision=0 and coalesce(seq.current_declaration_revision,0)>0
   and not tongs.reference_visual_rights_current_for_source_set(seq.current_declaration_revision_id,current_set) then
   p_expected_revision:=seq.current_declaration_revision;
   p_declaration_id:=seq.declaration_id;
 end if;
 if coalesce(seq.current_declaration_revision,0)<>p_expected_revision then return jsonb_build_object('disposition','rights_revision_conflict','current_revision',coalesce(seq.current_declaration_revision,0));end if;
 if p_expected_revision>0 then select * into prev from tongs.reference_visual_rights_declaration_revisions where id=seq.current_declaration_revision_id;end if;
 n:=p_expected_revision+1;
 h:=encode(extensions.digest(convert_to(jsonb_strip_nulls(jsonb_build_object('source_set_revision_id',current_set,'rights_status',p_rights_status,'declaration',p_declaration,'asserted_by',p_actor_id))::text,'UTF8'),'sha256'),'hex');
 ih:=encode(extensions.digest(convert_to(jsonb_build_object('content_hash',h,'revision',n,'previous_revision_id',prev.id)::text,'UTF8'),'sha256'),'hex');
 insert into tongs.reference_visual_rights_declaration_revisions(declaration_id,workspace_id,workpiece_id,opportunity_id,revision,previous_revision_id,previous_revision,source_set_revision_id,rights_status,asserted_by,creator_acknowledged_responsibility,rights_holder,license_identifier,license_url,permission_evidence_json,platform_terms_json,fair_use_rationale,territories,expires_at,attribution_required,attribution_text,provenance_json,access_controls_bypassed,content_hash,immutable_revision_hash)
 values(p_declaration_id,p_workspace_id,p_workpiece_id,p_opportunity_id,n,prev.id,prev.revision,current_set,p_rights_status,p_actor_id,true,p_declaration->>'rights_holder',p_declaration->>'license_identifier',p_declaration->>'license_url',coalesce(p_declaration->'permission_evidence','{}'),coalesce(p_declaration->'platform_terms','{}'),p_declaration->>'fair_use_rationale',case when jsonb_typeof(p_declaration->'territories')='array' then array(select jsonb_array_elements_text(p_declaration->'territories')) end,nullif(p_declaration->>'expires_at','')::timestamptz,coalesce((p_declaration->>'attribution_required')::boolean,false),p_declaration->>'attribution_text',coalesce(p_declaration->'provenance','{}'),false,h,ih)returning * into r;
 insert into tongs.reference_visual_rights_declaration_sequences values(p_workspace_id,p_workpiece_id,p_opportunity_id,p_declaration_id,r.id,r.revision,now()) on conflict(workspace_id,workpiece_id,opportunity_id)do update set declaration_id=excluded.declaration_id,current_declaration_revision_id=excluded.current_declaration_revision_id,current_declaration_revision=excluded.current_declaration_revision,updated_at=now();
 result:=jsonb_build_object('disposition','committed','rights_declaration_revision',to_jsonb(r),'release_ready',p_rights_status<>'rights_unresolved');
 insert into tongs.reference_visual_operation_receipts values(p_operation_id,p_operation_fingerprint,'rights_commit',p_workspace_id,p_workpiece_id,'committed',r.id,result,p_actor_id,now());return result;
end$$;

create or replace function tongs.commit_reference_visual_rights_declaration(
  p_workspace_id uuid,p_workpiece_id uuid,p_opportunity_id uuid,p_declaration_id uuid,
  p_expected_revision bigint,p_rights_status text,p_declaration jsonb,p_operation_id text,
  p_operation_fingerprint text,p_actor_id uuid
) returns jsonb language sql security definer set search_path=pg_catalog,tongs as $$
 select tongs.commit_reference_visual_rights_declaration(p_workspace_id,p_workpiece_id,p_opportunity_id,
   tongs.reference_visual_current_source_set(p_workspace_id,p_workpiece_id,p_opportunity_id),p_declaration_id,
   p_expected_revision,p_rights_status,p_declaration,p_operation_id,p_operation_fingerprint,p_actor_id)
$$;

create or replace function tongs.begin_reference_visual_render_v2(
 p_workspace_id uuid,p_workpiece_id uuid,p_opportunity_revision_id uuid,p_source_set_revision_id uuid,
 p_recipe_revision_id uuid,p_source_use_revision_id uuid,p_rights_declaration_revision_id uuid,
 p_renderer_name text,p_renderer_version text,p_operation_id text,p_operation_fingerprint text,p_actor_id uuid
) returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $$
declare op tongs.reference_visual_render_operations%rowtype;opp tongs.reference_visual_opportunity_revisions%rowtype;
 current_set uuid;use_rev tongs.reference_visual_source_use_revisions%rowtype;
begin
 if not tongs.has_workspace_role(p_workspace_id,'editor')or auth.uid() is distinct from p_actor_id then raise exception 'workspace editor authority required' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_operation_id,0));
 select * into op from tongs.reference_visual_render_operations where operation_id=p_operation_id;
 if found then if op.operation_fingerprint<>p_operation_fingerprint then return jsonb_build_object('disposition','operation_identity_conflict');end if;return jsonb_build_object('disposition','replay','operation',to_jsonb(op));end if;
 select * into opp from tongs.reference_visual_opportunity_revisions where id=p_opportunity_revision_id and workspace_id=p_workspace_id and workpiece_id=p_workpiece_id;
 if not found or not exists(select 1 from tongs.reference_visual_plan_sequences ps join tongs.reference_visual_plan_membership pm on pm.plan_revision_id=ps.current_plan_revision_id and pm.opportunity_revision_id=opp.id where ps.workspace_id=p_workspace_id and ps.workpiece_id=p_workpiece_id) then return jsonb_build_object('disposition','current_opportunity_revision_required');end if;
 current_set:=tongs.reference_visual_current_source_set(p_workspace_id,p_workpiece_id,opp.opportunity_id);
 if current_set is null or current_set is distinct from p_source_set_revision_id then return jsonb_build_object('disposition','current_source_collection_required','current_source_set_revision_id',current_set);end if;
 if not tongs.reference_visual_recipe_current_for_source_set(p_recipe_revision_id,current_set) then return jsonb_build_object('disposition','current_confirmed_recipe_required');end if;
 if not tongs.reference_visual_source_use_current_for_source_set(p_source_use_revision_id,current_set) then return jsonb_build_object('disposition','current_confirmed_source_use_required');end if;
 select * into use_rev from tongs.reference_visual_source_use_revisions where id=p_source_use_revision_id;
 if use_rev.use_classification='facts_data_only' then if p_rights_declaration_revision_id is not null then return jsonb_build_object('disposition','rights_not_applicable');end if;
 elsif not tongs.reference_visual_rights_current_for_source_set(p_rights_declaration_revision_id,current_set) then return jsonb_build_object('disposition','current_rights_declaration_required');end if;
 insert into tongs.reference_visual_render_operations(operation_id,operation_fingerprint,workspace_id,workpiece_id,opportunity_revision_id,source_set_revision_id,recipe_revision_id,source_use_revision_id,rights_declaration_revision_id,renderer_name,renderer_version,created_by)
 values(p_operation_id,p_operation_fingerprint,p_workspace_id,p_workpiece_id,p_opportunity_revision_id,current_set,p_recipe_revision_id,p_source_use_revision_id,p_rights_declaration_revision_id,p_renderer_name,p_renderer_version,p_actor_id)returning * into op;
 return jsonb_build_object('disposition','reserved','operation',to_jsonb(op));
end$$;

create or replace function tongs.begin_reference_visual_render_v2(
 p_workspace_id uuid,p_workpiece_id uuid,p_opportunity_revision_id uuid,p_recipe_revision_id uuid,
 p_source_use_revision_id uuid,p_rights_declaration_revision_id uuid,p_renderer_name text,p_renderer_version text,
 p_operation_id text,p_operation_fingerprint text,p_actor_id uuid
) returns jsonb language sql security definer set search_path=pg_catalog,tongs as $$
 select tongs.begin_reference_visual_render_v2(p_workspace_id,p_workpiece_id,p_opportunity_revision_id,
   tongs.reference_visual_current_source_set(p_workspace_id,p_workpiece_id,(select opportunity_id from tongs.reference_visual_opportunity_revisions where id=p_opportunity_revision_id)),
   p_recipe_revision_id,p_source_use_revision_id,p_rights_declaration_revision_id,p_renderer_name,p_renderer_version,p_operation_id,p_operation_fingerprint,p_actor_id)
$$;

create or replace function tongs.begin_reference_visual_acquisition(
 p_workspace_id uuid,p_workpiece_id uuid,p_opportunity_revision_id uuid,p_source_set_revision_id uuid,
 p_rights_declaration_revision_id uuid,p_acquisition_type text,p_operation_id text,p_operation_fingerprint text,p_actor_id uuid
) returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $$
declare op tongs.reference_visual_acquisition_operations%rowtype;opp tongs.reference_visual_opportunity_revisions%rowtype;current_set uuid;
begin
 if not tongs.has_workspace_role(p_workspace_id,'editor')or auth.uid() is distinct from p_actor_id then raise exception 'workspace editor authority required' using errcode='42501';end if;
 if p_acquisition_type not in('upload','external_fetch') then return jsonb_build_object('disposition','invalid_acquisition_type');end if;
 perform pg_advisory_xact_lock(hashtextextended(p_operation_id,0));select * into op from tongs.reference_visual_acquisition_operations where operation_id=p_operation_id for update;
 if found then if op.operation_fingerprint<>p_operation_fingerprint then return jsonb_build_object('disposition','operation_identity_conflict');end if;return jsonb_build_object('disposition','replay','operation',to_jsonb(op));end if;
 select * into opp from tongs.reference_visual_opportunity_revisions where id=p_opportunity_revision_id and workspace_id=p_workspace_id and workpiece_id=p_workpiece_id and visual_subtype in('archival_still','archival_sequence');
 if not found or not exists(select 1 from tongs.reference_visual_plan_sequences ps join tongs.reference_visual_plan_membership pm on pm.plan_revision_id=ps.current_plan_revision_id and pm.opportunity_revision_id=opp.id where ps.workspace_id=p_workspace_id and ps.workpiece_id=p_workpiece_id) then return jsonb_build_object('disposition','current_opportunity_revision_required');end if;
 current_set:=tongs.reference_visual_current_source_set(p_workspace_id,p_workpiece_id,opp.opportunity_id);
 if current_set is null or current_set is distinct from p_source_set_revision_id then return jsonb_build_object('disposition','current_source_collection_required','current_source_set_revision_id',current_set);end if;
 if not tongs.reference_visual_rights_current_for_source_set(p_rights_declaration_revision_id,current_set) then return jsonb_build_object('disposition','current_rights_declaration_required');end if;
 insert into tongs.reference_visual_acquisition_operations(operation_id,operation_fingerprint,workspace_id,workpiece_id,opportunity_revision_id,source_set_revision_id,rights_declaration_revision_id,acquisition_type,state,created_by)
 values(p_operation_id,p_operation_fingerprint,p_workspace_id,p_workpiece_id,p_opportunity_revision_id,current_set,p_rights_declaration_revision_id,p_acquisition_type,'pending',p_actor_id)returning * into op;
 return jsonb_build_object('disposition','reserved','operation',to_jsonb(op));
end$$;

create or replace function tongs.commit_reference_visual_render(
 p_operation_id text,p_operation_fingerprint text,p_path text,p_mime_type text,p_byte_size bigint,
 p_content_hash text,p_storage_bucket text,p_storage_key text,p_width integer,p_height integer,p_render_evidence jsonb
) returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $$
declare op tongs.reference_visual_render_operations%rowtype;a tongs.assets%rowtype;c tongs.reference_visual_candidates%rowtype;
 r tongs.reference_visual_candidate_revisions%rowtype;recipe tongs.reference_visual_recipe_revisions%rowtype;h text;ih text;receipt jsonb;
begin
 if auth.role()<>'service_role'then raise exception 'Reference Visual render commit requires service authority'using errcode='42501';end if;
 select * into op from tongs.reference_visual_render_operations where operation_id=p_operation_id for update;
 if not found then return jsonb_build_object('disposition','operation_not_found');end if;
 if op.operation_fingerprint<>p_operation_fingerprint then return jsonb_build_object('disposition','operation_identity_conflict');end if;
 if op.state='candidate_committed'then return op.receipt_json;end if;
 if op.source_set_revision_id is null then return jsonb_build_object('disposition','source_set_authority_required');end if;
 if p_mime_type not in('image/png','image/svg+xml')or p_byte_size<=0 or p_content_hash!~'^[0-9a-f]{64}$'or p_width<=0 or p_height<=0 then return jsonb_build_object('disposition','invalid_verified_render_evidence');end if;
 select * into recipe from tongs.reference_visual_recipe_revisions where id=op.recipe_revision_id;
 select * into a from tongs.assets where workspace_id=op.workspace_id and workpiece_id=op.workpiece_id and operation_id=p_operation_id and asset_kind='reference_visual_image'for update;
 if found then if a.content_hash<>p_content_hash or a.storage_bucket<>p_storage_bucket or a.storage_key<>p_storage_key or a.bytes<>p_byte_size then return jsonb_build_object('disposition','asset_replay_conflict');end if;
 else insert into tongs.assets(workspace_id,workpiece_id,path,mime_type,bytes,storage_bucket,storage_key,provider,provider_request_id,request_id,created_by,asset_kind,status,metadata_json,width,height,operation_id,operation_fingerprint,content_hash,ready_at)
 values(op.workspace_id,op.workpiece_id,p_path,p_mime_type,p_byte_size,p_storage_bucket,p_storage_key,op.renderer_name,p_operation_id,p_operation_id,op.created_by,'reference_visual_image','ready',jsonb_build_object('renderer_name',op.renderer_name,'renderer_version',op.renderer_version,'recipe_revision_id',op.recipe_revision_id,'source_set_revision_id',op.source_set_revision_id,'source_use_revision_id',op.source_use_revision_id),p_width,p_height,p_operation_id,p_operation_fingerprint,p_content_hash,now())returning * into a;end if;
 insert into tongs.reference_visual_candidates(workspace_id,workpiece_id,opportunity_id,created_by)select op.workspace_id,op.workpiece_id,o.opportunity_id,op.created_by from tongs.reference_visual_opportunity_revisions o where o.id=op.opportunity_revision_id returning * into c;
 h:=encode(extensions.digest(convert_to(jsonb_build_object('asset_hash',a.content_hash,'opportunity_revision_id',op.opportunity_revision_id,'source_set_revision_id',op.source_set_revision_id,'recipe_revision_id',recipe.id,'source_use_revision_id',op.source_use_revision_id,'rights_revision_id',op.rights_declaration_revision_id,'renderer',op.renderer_name,'renderer_version',op.renderer_version,'render_evidence',p_render_evidence)::text,'UTF8'),'sha256'),'hex');
 ih:=encode(extensions.digest(convert_to(jsonb_build_object('candidate_id',c.id,'revision',1,'content_hash',h,'operation_id',p_operation_id)::text,'UTF8'),'sha256'),'hex');
 insert into tongs.reference_visual_candidate_revisions(candidate_id,workspace_id,workpiece_id,opportunity_id,revision,opportunity_revision_id,opportunity_revision,source_set_revision_id,recipe_revision_id,recipe_revision,candidate_kind,asset_id,source_use_revision_id,rights_declaration_revision_id,renderer_name,renderer_version,canonical_render_hash,render_receipt_json,provenance_json,content_hash,immutable_revision_hash,created_by)
 select c.id,op.workspace_id,op.workpiece_id,o.opportunity_id,1,o.id,o.revision,op.source_set_revision_id,recipe.id,recipe.revision,'rendered_visual',a.id,op.source_use_revision_id,op.rights_declaration_revision_id,op.renderer_name,op.renderer_version,p_content_hash,p_render_evidence,jsonb_build_object('authority','tongs-render-v3','operation_id',p_operation_id,'source_set_revision_id',op.source_set_revision_id,'source_use_revision_id',op.source_use_revision_id),h,ih,op.created_by from tongs.reference_visual_opportunity_revisions o where o.id=op.opportunity_revision_id returning * into r;
 receipt:=jsonb_build_object('disposition','committed','operation_id',p_operation_id,'opportunity_revision_id',op.opportunity_revision_id,'source_set_revision_id',op.source_set_revision_id,'recipe_revision_id',recipe.id,'source_use_revision_id',op.source_use_revision_id,'rights_declaration_revision_id',op.rights_declaration_revision_id,'renderer_name',op.renderer_name,'renderer_version',op.renderer_version,'asset',to_jsonb(a),'candidate_revision',to_jsonb(r));
 update tongs.reference_visual_render_operations set state='candidate_committed',render_evidence_json=p_render_evidence,output_asset_id=a.id,result_candidate_revision_id=r.id,failed_stage=null,failure_code=null,failure_message=null,receipt_json=receipt,updated_at=now()where operation_id=p_operation_id;return receipt;
end$$;

create or replace function tongs.commit_reference_visual_acquisition(
 p_operation_id text,p_operation_fingerprint text,p_path text,p_mime_type text,p_byte_size bigint,
 p_content_hash text,p_storage_bucket text,p_storage_key text,p_width integer,p_height integer,p_provenance jsonb
) returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $$
declare op tongs.reference_visual_acquisition_operations%rowtype;o tongs.reference_visual_opportunity_revisions%rowtype;
 a tongs.assets%rowtype;c tongs.reference_visual_candidates%rowtype;r tongs.reference_visual_candidate_revisions%rowtype;h text;ih text;receipt jsonb;
begin
 if auth.role()<>'service_role' then raise exception 'Reference Visual acquisition commit requires service authority' using errcode='42501';end if;
 select * into op from tongs.reference_visual_acquisition_operations where operation_id=p_operation_id for update;
 if not found then return jsonb_build_object('disposition','operation_not_found');end if;
 if op.operation_fingerprint<>p_operation_fingerprint then return jsonb_build_object('disposition','operation_identity_conflict');end if;
 if op.state='candidate_committed' then return op.receipt_json;end if;
 if op.state<>'source_acquired' then return jsonb_build_object('disposition','source_acquisition_required');end if;
 if op.source_set_revision_id is null then return jsonb_build_object('disposition','source_set_authority_required');end if;
 if p_mime_type not like'image/%'or p_byte_size<=0 or p_content_hash!~'^[0-9a-f]{64}$'or p_width<=0 or p_height<=0 then return jsonb_build_object('disposition','invalid_verified_image_evidence');end if;
 select * into o from tongs.reference_visual_opportunity_revisions where id=op.opportunity_revision_id;
 insert into tongs.assets(workspace_id,workpiece_id,path,mime_type,bytes,storage_bucket,storage_key,provider,request_id,created_by,asset_kind,status,metadata_json,width,height,operation_id,operation_fingerprint,content_hash,ready_at)
 values(op.workspace_id,op.workpiece_id,p_path,p_mime_type,p_byte_size,p_storage_bucket,p_storage_key,case when op.acquisition_type='upload'then'creator-upload'else'external-fetch'end,p_operation_id,op.created_by,'reference_visual_image','ready',jsonb_build_object('inspection_authority','tongs-service.v2','source_set_revision_id',op.source_set_revision_id),p_width,p_height,p_operation_id,p_operation_fingerprint,p_content_hash,now())returning * into a;
 insert into tongs.reference_visual_candidates(workspace_id,workpiece_id,opportunity_id,created_by)values(op.workspace_id,op.workpiece_id,o.opportunity_id,op.created_by)returning * into c;
 h:=encode(extensions.digest(convert_to(jsonb_build_object('asset_hash',a.content_hash,'opportunity_revision_id',o.id,'source_set_revision_id',op.source_set_revision_id,'rights_revision_id',op.rights_declaration_revision_id,'provenance',p_provenance)::text,'UTF8'),'sha256'),'hex');
 ih:=encode(extensions.digest(convert_to(jsonb_build_object('candidate',c.id,'revision',1,'content_hash',h,'operation',p_operation_id)::text,'UTF8'),'sha256'),'hex');
 insert into tongs.reference_visual_candidate_revisions(candidate_id,workspace_id,workpiece_id,opportunity_id,revision,opportunity_revision_id,opportunity_revision,source_set_revision_id,candidate_kind,asset_id,rights_declaration_revision_id,render_receipt_json,provenance_json,content_hash,immutable_revision_hash,created_by)
 values(c.id,op.workspace_id,op.workpiece_id,o.opportunity_id,1,o.id,o.revision,op.source_set_revision_id,'archival_still',a.id,op.rights_declaration_revision_id,'{}',coalesce(p_provenance,'{}')||jsonb_build_object('operation_id',p_operation_id,'source_set_revision_id',op.source_set_revision_id),h,ih,op.created_by)returning * into r;
 receipt:=jsonb_build_object('disposition','committed','operation_id',p_operation_id,'source_set_revision_id',op.source_set_revision_id,'asset',to_jsonb(a),'candidate_revision',to_jsonb(r),'rights_declaration_revision_id',op.rights_declaration_revision_id);
 update tongs.reference_visual_acquisition_operations set state='candidate_committed',verified_asset_id=a.id,result_candidate_revision_id=r.id,failed_stage=null,failure_code=null,failure_message=null,receipt_json=receipt,updated_at=now()where operation_id=p_operation_id;return receipt;
end$$;

-- Candidate rows inherit the exact operation binding. This covers every writer,
-- including legacy service code during the migration-first rollout.
create or replace function tongs.bind_reference_visual_candidate_source_set()
returns trigger language plpgsql security definer set search_path=pg_catalog,tongs as $$
begin
 if new.source_set_revision_id is null then
   select coalesce(ro.source_set_revision_id,ao.source_set_revision_id) into new.source_set_revision_id
   from (select new.provenance_json->>'operation_id' operation_id) p
   left join tongs.reference_visual_render_operations ro on ro.operation_id=p.operation_id
   left join tongs.reference_visual_acquisition_operations ao on ao.operation_id=p.operation_id;
 end if;
 if new.source_set_revision_id is null then
   new.source_set_revision_id:=tongs.reference_visual_current_source_set(new.workspace_id,new.workpiece_id,new.opportunity_id);
 end if;
 if new.source_set_revision_id is null then raise exception 'candidate Source-set authority required' using errcode='23514';end if;
 if new.rights_declaration_revision_id is not null and not exists(
   select 1 from tongs.reference_visual_rights_declaration_revisions r
   where r.id=new.rights_declaration_revision_id and r.source_set_revision_id=new.source_set_revision_id
 ) then raise exception 'candidate rights must cover its exact Source set' using errcode='23514';end if;
 if new.sequence_revision_id is not null and exists(
   select 1 from tongs.reference_visual_sequence_membership member
   where member.sequence_revision_id=new.sequence_revision_id and not exists(
     select 1 from tongs.reference_visual_source_set_members source_member
     where source_member.source_set_revision_id=new.source_set_revision_id
       and source_member.source_revision_id=member.source_revision_id
       and source_member.workpiece_source_link_revision_id=member.workpiece_source_link_revision_id
   )
 ) then raise exception 'sequence members must belong to the candidate Source set' using errcode='23514';end if;
 return new;
end$$;
drop trigger if exists reference_visual_candidate_source_set_binding on tongs.reference_visual_candidate_revisions;
create trigger reference_visual_candidate_source_set_binding before insert on tongs.reference_visual_candidate_revisions
 for each row execute function tongs.bind_reference_visual_candidate_source_set();

create or replace function tongs.select_reference_visual_candidate(
 p_workspace_id uuid,p_workpiece_id uuid,p_opportunity_id uuid,p_candidate_revision_id uuid,
 p_expected_plan_revision_id uuid,p_expected_plan_revision bigint,p_expected_selection_revision bigint,
 p_operation_id text,p_operation_fingerprint text,p_actor_id uuid
) returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $$
declare op tongs.reference_visual_operation_receipts%rowtype;seq tongs.reference_visual_plan_sequences%rowtype;
 member_rev tongs.reference_visual_plan_membership%rowtype;cand_rev tongs.reference_visual_candidate_revisions%rowtype;
 previous_selection tongs.reference_visual_selections%rowtype;new_selection tongs.reference_visual_selections%rowtype;active_revision bigint;result jsonb;
begin
 if not tongs.has_workspace_role(p_workspace_id,'editor')or auth.uid() is distinct from p_actor_id then raise exception 'workspace editor authority required' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_operation_id,0));select * into op from tongs.reference_visual_operation_receipts where operation_id=p_operation_id;
 if found then if op.operation_fingerprint<>p_operation_fingerprint then return jsonb_build_object('disposition','operation_identity_conflict');end if;return op.receipt_json;end if;
 select * into seq from tongs.reference_visual_plan_sequences where workspace_id=p_workspace_id and workpiece_id=p_workpiece_id for update;
 if seq.current_plan_revision_id is distinct from p_expected_plan_revision_id or seq.current_plan_revision<>p_expected_plan_revision then return jsonb_build_object('disposition','plan_revision_conflict');end if;
 select * into member_rev from tongs.reference_visual_plan_membership where plan_revision_id=seq.current_plan_revision_id and opportunity_id=p_opportunity_id;
 if not found then return jsonb_build_object('disposition','opportunity_not_current');end if;
 select * into cand_rev from tongs.reference_visual_candidate_revisions where id=p_candidate_revision_id and workspace_id=p_workspace_id and workpiece_id=p_workpiece_id and opportunity_id=p_opportunity_id and opportunity_revision_id=member_rev.opportunity_revision_id;
 if not found then return jsonb_build_object('disposition','candidate_not_attached');end if;
 if not tongs.reference_visual_candidate_release_ready(cand_rev.id) then return jsonb_build_object('disposition','candidate_not_release_ready');end if;
 if not tongs.reference_visual_candidate_current_for_plan(cand_rev.id) then return jsonb_build_object('disposition','candidate_not_current_for_plan');end if;
 select * into previous_selection from tongs.reference_visual_selections where workspace_id=p_workspace_id and workpiece_id=p_workpiece_id and opportunity_id=p_opportunity_id and plan_revision_id=seq.current_plan_revision_id order by revision desc limit 1;
 active_revision:=case when previous_selection.id is not null and tongs.reference_visual_candidate_current_for_plan(previous_selection.candidate_revision_id) then previous_selection.revision else 0 end;
 if active_revision<>p_expected_selection_revision then return jsonb_build_object('disposition','selection_revision_conflict','current_revision',active_revision);end if;
 insert into tongs.reference_visual_selections(workspace_id,workpiece_id,opportunity_id,revision,previous_selection_id,previous_revision,plan_revision_id,plan_revision,candidate_revision_id,operation_id,operation_fingerprint,created_by)
 values(p_workspace_id,p_workpiece_id,p_opportunity_id,coalesce(previous_selection.revision,0)+1,previous_selection.id,previous_selection.revision,seq.current_plan_revision_id,seq.current_plan_revision,cand_rev.id,p_operation_id,p_operation_fingerprint,p_actor_id)returning * into new_selection;
 result:=jsonb_build_object('disposition','committed','selection',to_jsonb(new_selection));insert into tongs.reference_visual_operation_receipts values(p_operation_id,p_operation_fingerprint,'selection',p_workspace_id,p_workpiece_id,'committed',new_selection.id,result,p_actor_id,now());return result;
end$$;

-- Current readback keeps every immutable row available as history while exposing
-- only authority-compatible rows in the current slots.
create or replace function tongs.read_reference_visual_plan_source_transition(p_workspace_id uuid,p_workpiece_id uuid)
returns jsonb language sql stable security definer set search_path=pg_catalog,tongs as $$
select case when not tongs.has_workspace_role(p_workspace_id,'viewer') then null else jsonb_build_object(
 'plan_revision',to_jsonb(p),
 'summary',jsonb_build_object('total',(select count(*) from tongs.reference_visual_plan_membership x where x.plan_revision_id=p.id),'fulfilled',(select count(*) from tongs.reference_visual_plan_membership x where x.plan_revision_id=p.id and tongs.reference_visual_current_source_set(x.workspace_id,x.workpiece_id,x.opportunity_id)is not null),'unresolved',(select count(*) from tongs.reference_visual_plan_membership x where x.plan_revision_id=p.id and tongs.reference_visual_current_source_set(x.workspace_id,x.workpiece_id,x.opportunity_id)is null)),
 'opportunities',coalesce((select jsonb_agg(jsonb_build_object(
  'membership',to_jsonb(m),'opportunity_revision',to_jsonb(o),'source_revision',to_jsonb(sr),'source_link_revision',to_jsonb(sl),'source_set',to_jsonb(ss),
  'sources',coalesce((select jsonb_agg(to_jsonb(sm)||jsonb_build_object('source_revision',to_jsonb(msr),'source_link_revision',to_jsonb(msl))order by sm.ordinal)from tongs.reference_visual_source_set_members sm join tongs.source_revisions msr on msr.id=sm.source_revision_id join tongs.workpiece_source_link_revisions msl on msl.id=sm.workpiece_source_link_revision_id where sm.source_set_revision_id=ss.id),'[]'::jsonb),
  'evidence',coalesce((select jsonb_agg(to_jsonb(e)||jsonb_build_object('canonical_claim_id',claim.claim_id,'claim_fingerprint',claim.claim_fingerprint,'historical_source_set_member_id',e.source_set_member_id,'source_set_member_id',active.id)order by e.created_at) from tongs.reference_visual_evidence_sequences es join tongs.reference_visual_evidence_revisions e on e.id=es.current_evidence_revision_id join tongs.reference_visual_evidence_claims claim on claim.workspace_id=e.workspace_id and claim.workpiece_id=e.workpiece_id and claim.opportunity_id=e.opportunity_id and claim.canonical_evidence_id=e.evidence_id and claim.claim_fingerprint=tongs.reference_visual_evidence_claim_fingerprint(e.workspace_id,e.workpiece_id,e.opportunity_id,e.source_set_member_id,e.source_revision_id,e.workpiece_source_link_revision_id,e.document_locator_json,e.raw_excerpt,e.numeric_value,e.unit,e.evidence_role,e.category) join tongs.reference_visual_source_set_members active on active.source_set_revision_id=ss.id and active.source_revision_id=e.source_revision_id and active.workpiece_source_link_revision_id=e.workpiece_source_link_revision_id where e.workspace_id=m.workspace_id and e.workpiece_id=m.workpiece_id and e.opportunity_id=m.opportunity_id and tongs.reference_visual_evidence_current_for_source_set(e.id,ss.id)),'[]'::jsonb),
  'source_use',to_jsonb(su),'source_use_history',coalesce((select jsonb_agg(to_jsonb(h)||jsonb_build_object('current_for_plan',tongs.reference_visual_source_use_current_for_source_set(h.id,ss.id))order by h.revision)from tongs.reference_visual_source_use_revisions h where h.workspace_id=m.workspace_id and h.workpiece_id=m.workpiece_id and h.opportunity_id=m.opportunity_id),'[]'::jsonb),
  'recipe',to_jsonb(rr),'rights_declaration',to_jsonb(rd),'rights_history',coalesce((select jsonb_agg(to_jsonb(h)||jsonb_build_object('current_for_plan',tongs.reference_visual_rights_current_for_source_set(h.id,ss.id))order by h.revision)from tongs.reference_visual_rights_declaration_revisions h where h.workspace_id=m.workspace_id and h.workpiece_id=m.workpiece_id and h.opportunity_id=m.opportunity_id),'[]'::jsonb),
  'candidates',coalesce((select jsonb_agg(to_jsonb(c)||jsonb_build_object('asset',to_jsonb(a),'release_ready',tongs.reference_visual_candidate_release_ready(c.id),'current_for_plan',tongs.reference_visual_candidate_current_for_plan(c.id))order by c.created_at)from tongs.reference_visual_candidate_revisions c left join tongs.assets a on a.id=c.asset_id where c.workspace_id=m.workspace_id and c.workpiece_id=m.workpiece_id and c.opportunity_id=m.opportunity_id),'[]'::jsonb),
  'selection',to_jsonb(sel),'selection_history',coalesce((select jsonb_agg(to_jsonb(h)||jsonb_build_object('current_for_plan',tongs.reference_visual_candidate_current_for_plan(h.candidate_revision_id))order by h.revision)from tongs.reference_visual_selections h where h.workspace_id=m.workspace_id and h.workpiece_id=m.workpiece_id and h.opportunity_id=m.opportunity_id),'[]'::jsonb),
  'selection_revision_authority',coalesce(sel.revision,0),'release_ready',sel.id is not null and tongs.reference_visual_candidate_release_ready(sel.candidate_revision_id) and tongs.reference_visual_candidate_current_for_plan(sel.candidate_revision_id)
 )order by m.ordinal)
 from tongs.reference_visual_plan_membership m join tongs.reference_visual_opportunity_revisions o on o.id=m.opportunity_revision_id
 left join tongs.reference_visual_source_set_revisions ss on ss.id=tongs.reference_visual_current_source_set(m.workspace_id,m.workpiece_id,m.opportunity_id)
 left join tongs.reference_visual_source_set_members primary_member on primary_member.source_set_revision_id=ss.id and primary_member.ordinal=1
 left join tongs.source_revisions sr on sr.id=primary_member.source_revision_id
 left join tongs.workpiece_source_link_revisions sl on sl.id=primary_member.workpiece_source_link_revision_id
 left join lateral(select u.* from tongs.reference_visual_source_use_sequences us join tongs.reference_visual_source_use_revisions u on u.id=us.current_use_revision_id where us.workspace_id=m.workspace_id and us.workpiece_id=m.workpiece_id and us.opportunity_id=m.opportunity_id and tongs.reference_visual_source_use_current_for_source_set(u.id,ss.id))su on true
 left join lateral(select r.* from tongs.reference_visual_recipe_sequences rs join tongs.reference_visual_recipe_revisions r on r.id=rs.current_recipe_revision_id where rs.workspace_id=m.workspace_id and rs.workpiece_id=m.workpiece_id and rs.opportunity_id=m.opportunity_id and tongs.reference_visual_recipe_current_for_source_set(r.id,ss.id))rr on true
 left join lateral(select r.* from tongs.reference_visual_rights_declaration_sequences rs join tongs.reference_visual_rights_declaration_revisions r on r.id=rs.current_declaration_revision_id where rs.workspace_id=m.workspace_id and rs.workpiece_id=m.workpiece_id and rs.opportunity_id=m.opportunity_id and tongs.reference_visual_rights_current_for_source_set(r.id,ss.id))rd on true
 left join lateral(select s.* from tongs.reference_visual_selections s where s.plan_revision_id=p.id and s.opportunity_id=m.opportunity_id and tongs.reference_visual_candidate_current_for_plan(s.candidate_revision_id) order by s.revision desc limit 1)sel on true
 where m.plan_revision_id=p.id),'[]'::jsonb)
)end from tongs.reference_visual_plan_sequences ps join tongs.reference_visual_plan_revisions p on p.id=ps.current_plan_revision_id where ps.workspace_id=p_workspace_id and ps.workpiece_id=p_workpiece_id
$$;

create or replace function tongs.read_current_reference_visual_plan(p_workspace_id uuid,p_workpiece_id uuid)
returns jsonb language sql stable security definer set search_path=pg_catalog,tongs as $$
 select tongs.read_reference_visual_plan_source_transition(p_workspace_id,p_workpiece_id)
$$;

create or replace function tongs.read_reference_visual_visual_package(p_workspace_id uuid,p_workpiece_id uuid)
returns jsonb language sql stable security definer set search_path=pg_catalog,tongs as $$
select case when not tongs.has_workspace_role(p_workspace_id,'viewer')then null else jsonb_build_object('contract_version','forge.reference-visual.hammer.v4','visuals',coalesce((select jsonb_agg(jsonb_build_object(
 'plan_revision_id',p.id,'plan_revision',p.revision,'opportunity_id',o.opportunity_id,'opportunity_revision_id',o.id,'opportunity_revision',o.revision,'source_set_revision_id',ss.id,'source_set_revision',ss.revision,
 'sources',coalesce((select jsonb_agg(jsonb_build_object('ordinal',sm.ordinal,'source_set_member_id',sm.id,'source_revision_id',sm.source_revision_id,'source_revision',sm.source_revision,'source_link_revision_id',sm.workpiece_source_link_revision_id,'source_link_revision',sm.workpiece_source_link_revision)order by sm.ordinal)from tongs.reference_visual_source_set_members sm where sm.source_set_revision_id=ss.id),'[]'::jsonb),
 'candidate_revision_id',c.id,'candidate_revision',c.revision,'candidate_kind',c.candidate_kind,'asset_id',a.id,'asset_path',a.path,'storage_bucket',a.storage_bucket,'storage_key',a.storage_key,'mime_type',a.mime_type,'asset_content_hash',a.content_hash,'placement_hint',o.placement_hint,'duration_target_ms',o.duration_target_ms,'script_anchor',o.citation_anchor_json,'source_use',to_jsonb(u),'rights',to_jsonb(rd),'evidence',coalesce((select jsonb_agg(to_jsonb(ev)order by array_position(r.evidence_revision_ids,ev.id))from unnest(r.evidence_revision_ids)e(id)join tongs.reference_visual_evidence_revisions ev on ev.id=e.id),'[]'::jsonb),'recipe',to_jsonb(r),'render_provenance',c.provenance_json
)order by m.ordinal)from tongs.reference_visual_plan_sequences ps join tongs.reference_visual_plan_revisions p on p.id=ps.current_plan_revision_id join tongs.reference_visual_plan_membership m on m.plan_revision_id=p.id join tongs.reference_visual_opportunity_revisions o on o.id=m.opportunity_revision_id join tongs.reference_visual_source_set_revisions ss on ss.id=tongs.reference_visual_current_source_set(p.workspace_id,p.workpiece_id,o.opportunity_id) join lateral(select s.* from tongs.reference_visual_selections s where s.plan_revision_id=p.id and s.opportunity_id=o.opportunity_id and tongs.reference_visual_candidate_current_for_plan(s.candidate_revision_id) order by s.revision desc limit 1)sel on true join tongs.reference_visual_candidate_revisions c on c.id=sel.candidate_revision_id left join tongs.assets a on a.id=c.asset_id left join tongs.reference_visual_recipe_revisions r on r.id=c.recipe_revision_id left join tongs.reference_visual_source_use_revisions u on u.id=c.source_use_revision_id left join tongs.reference_visual_rights_declaration_revisions rd on rd.id=c.rights_declaration_revision_id where ps.workspace_id=p_workspace_id and ps.workpiece_id=p_workpiece_id and tongs.reference_visual_candidate_release_ready(c.id) and tongs.reference_visual_candidate_current_for_plan(c.id)),'[]'::jsonb))end
$$;

revoke all on function tongs.commit_reference_visual_rights_declaration(uuid,uuid,uuid,uuid,uuid,bigint,text,jsonb,text,text,uuid) from public,anon;
revoke all on function tongs.commit_reference_visual_rights_declaration(uuid,uuid,uuid,uuid,bigint,text,jsonb,text,text,uuid) from public,anon;
revoke all on function tongs.begin_reference_visual_render_v2(uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,text,uuid) from public,anon;
revoke all on function tongs.begin_reference_visual_render_v2(uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,text,uuid) from public,anon;
revoke all on function tongs.begin_reference_visual_acquisition(uuid,uuid,uuid,uuid,uuid,text,text,text,uuid) from public,anon;
revoke all on function tongs.select_reference_visual_candidate(uuid,uuid,uuid,uuid,uuid,bigint,bigint,text,text,uuid) from public,anon;
revoke all on function tongs.read_current_reference_visual_plan(uuid,uuid) from public,anon;
revoke all on function tongs.read_reference_visual_plan_source_transition(uuid,uuid) from public,anon,authenticated;
revoke all on function tongs.read_reference_visual_visual_package(uuid,uuid) from public,anon;
revoke all on function tongs.bind_reference_visual_candidate_source_set() from public,anon,authenticated,service_role;
revoke all on function tongs.commit_reference_visual_render(text,text,text,text,bigint,text,text,text,integer,integer,jsonb) from public,anon,authenticated;
revoke all on function tongs.commit_reference_visual_acquisition(text,text,text,text,bigint,text,text,text,integer,integer,jsonb) from public,anon,authenticated;
grant execute on function tongs.commit_reference_visual_rights_declaration(uuid,uuid,uuid,uuid,uuid,bigint,text,jsonb,text,text,uuid) to authenticated,service_role;
grant execute on function tongs.commit_reference_visual_rights_declaration(uuid,uuid,uuid,uuid,bigint,text,jsonb,text,text,uuid) to authenticated,service_role;
grant execute on function tongs.begin_reference_visual_render_v2(uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,text,uuid) to authenticated,service_role;
grant execute on function tongs.begin_reference_visual_render_v2(uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,text,uuid) to authenticated,service_role;
grant execute on function tongs.begin_reference_visual_acquisition(uuid,uuid,uuid,uuid,uuid,text,text,text,uuid) to authenticated,service_role;
grant execute on function tongs.select_reference_visual_candidate(uuid,uuid,uuid,uuid,uuid,bigint,bigint,text,text,uuid) to authenticated,service_role;
grant execute on function tongs.read_current_reference_visual_plan(uuid,uuid) to authenticated,service_role;
grant execute on function tongs.read_reference_visual_plan_source_transition(uuid,uuid) to service_role;
grant execute on function tongs.read_reference_visual_visual_package(uuid,uuid) to authenticated,service_role;
grant execute on function tongs.commit_reference_visual_render(text,text,text,text,bigint,text,text,text,integer,integer,jsonb) to service_role;
grant execute on function tongs.commit_reference_visual_acquisition(text,text,text,text,bigint,text,text,text,integer,integer,jsonb) to service_role;

do $$begin
 if has_table_privilege('authenticated','tongs.reference_visual_rights_declaration_revisions','insert,update,delete')
   or has_table_privilege('authenticated','tongs.reference_visual_render_operations','insert,update,delete')
   or has_table_privilege('authenticated','tongs.reference_visual_acquisition_operations','insert,update,delete')
   or has_table_privilege('authenticated','tongs.reference_visual_candidate_revisions','insert,update,delete')
   or has_table_privilege('authenticated','tongs.reference_visual_selections','insert,update,delete') then
   raise exception 'authenticated direct mutation leaked for immutable Reference Visual authority tables';
 end if;
end$$;

notify pgrst,'reload schema';
commit;
