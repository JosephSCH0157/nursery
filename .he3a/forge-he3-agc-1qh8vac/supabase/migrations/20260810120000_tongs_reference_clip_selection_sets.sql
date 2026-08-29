begin;

create table tongs.reference_clip_selection_set_revisions(
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null,workpiece_id uuid not null,opportunity_id uuid not null,
 plan_revision_id uuid not null,plan_revision bigint not null,
 opportunity_revision_id uuid not null,opportunity_revision bigint not null,
 revision bigint not null check(revision>0),canonical_revision bigint not null check(canonical_revision>=0),previous_revision_id uuid,previous_revision bigint,
 operation_id text not null unique,operation_fingerprint text not null check(operation_fingerprint~'^[0-9a-f]{64}$'),
 created_by uuid not null,created_at timestamptz not null default now(),
 unique(id,workspace_id,workpiece_id,opportunity_id,plan_revision_id,revision),
 unique(workspace_id,workpiece_id,opportunity_id,plan_revision_id,revision),
 foreign key(plan_revision_id,workspace_id,workpiece_id,plan_revision) references tongs.reference_clip_plan_revisions(id,workspace_id,workpiece_id,revision),
 foreign key(opportunity_revision_id,workspace_id,workpiece_id,opportunity_id,opportunity_revision) references tongs.reference_clip_opportunity_revisions(id,workspace_id,workpiece_id,opportunity_id,revision),
 foreign key(previous_revision_id,workspace_id,workpiece_id,opportunity_id,plan_revision_id,previous_revision) references tongs.reference_clip_selection_set_revisions(id,workspace_id,workpiece_id,opportunity_id,plan_revision_id,revision)
);

create table tongs.reference_clip_selection_set_members(
 selection_set_revision_id uuid not null,workspace_id uuid not null,workpiece_id uuid not null,
 opportunity_id uuid not null,plan_revision_id uuid not null,selection_set_revision bigint not null,
 candidate_revision_id uuid not null,candidate_revision bigint not null,ordinal integer not null check(ordinal>0),
 primary key(selection_set_revision_id,candidate_revision_id),unique(selection_set_revision_id,ordinal),
 foreign key(selection_set_revision_id,workspace_id,workpiece_id,opportunity_id,plan_revision_id,selection_set_revision) references tongs.reference_clip_selection_set_revisions(id,workspace_id,workpiece_id,opportunity_id,plan_revision_id,revision),
 foreign key(candidate_revision_id,workspace_id,workpiece_id,opportunity_id,candidate_revision) references tongs.reference_clip_candidate_revisions(id,workspace_id,workpiece_id,opportunity_id,revision)
);

create index reference_clip_selection_sets_current_idx on tongs.reference_clip_selection_set_revisions(workspace_id,workpiece_id,plan_revision_id,opportunity_id,revision desc);
create index reference_clip_selection_set_members_order_idx on tongs.reference_clip_selection_set_members(selection_set_revision_id,ordinal);

-- Backfill only the active singular authority. Historical rows remain historical.
with active as(
 select distinct on(s.workspace_id,s.workpiece_id,s.opportunity_id)
  s.*,row_number()over(partition by s.workspace_id,s.workpiece_id,s.opportunity_id,s.plan_revision_id order by s.revision)::bigint as set_revision
 from tongs.reference_clip_selections s
 join tongs.reference_clip_plan_sequences q on q.workspace_id=s.workspace_id and q.workpiece_id=s.workpiece_id and q.current_plan_revision_id=s.plan_revision_id
 order by s.workspace_id,s.workpiece_id,s.opportunity_id,s.revision desc
),inserted as(
 insert into tongs.reference_clip_selection_set_revisions(workspace_id,workpiece_id,opportunity_id,plan_revision_id,plan_revision,opportunity_revision_id,opportunity_revision,revision,canonical_revision,operation_id,operation_fingerprint,created_by,created_at)
 select a.workspace_id,a.workpiece_id,a.opportunity_id,a.plan_revision_id,a.plan_revision,a.opportunity_revision_id,a.opportunity_revision,1,q.current_selection_revision,
  operation_id||':selection-set-backfill',encode(extensions.digest(convert_to(jsonb_build_object('legacy_selection_id',id)::text,'UTF8'),'sha256'),'hex'),created_by,created_at
 from active a join tongs.reference_clip_plan_sequences q on q.workspace_id=a.workspace_id and q.workpiece_id=a.workpiece_id returning *
)
insert into tongs.reference_clip_selection_set_members(selection_set_revision_id,workspace_id,workpiece_id,opportunity_id,plan_revision_id,selection_set_revision,candidate_revision_id,candidate_revision,ordinal)
select r.id,r.workspace_id,r.workpiece_id,r.opportunity_id,r.plan_revision_id,r.revision,s.candidate_revision_id,s.candidate_revision,1
from inserted r join active s on s.workspace_id=r.workspace_id and s.workpiece_id=r.workpiece_id and s.opportunity_id=r.opportunity_id and s.plan_revision_id=r.plan_revision_id;

create trigger reference_clip_selection_set_revisions_immutable before update or delete on tongs.reference_clip_selection_set_revisions for each row execute function tongs.reject_reference_clip_immutable_mutation();
create trigger reference_clip_selection_set_members_immutable before update or delete on tongs.reference_clip_selection_set_members for each row execute function tongs.reject_reference_clip_immutable_mutation();

alter table tongs.reference_clip_selection_set_revisions enable row level security;
alter table tongs.reference_clip_selection_set_members enable row level security;
create policy reference_clip_selection_set_revisions_viewer on tongs.reference_clip_selection_set_revisions for select to authenticated using(tongs.has_workspace_role(workspace_id,'viewer'));
create policy reference_clip_selection_set_members_viewer on tongs.reference_clip_selection_set_members for select to authenticated using(tongs.has_workspace_role(workspace_id,'viewer'));
revoke all on tongs.reference_clip_selection_set_revisions,tongs.reference_clip_selection_set_members from public,anon,authenticated;
grant select on tongs.reference_clip_selection_set_revisions,tongs.reference_clip_selection_set_members to authenticated;

create or replace function tongs.commit_reference_clip_selection_set(
 p_workspace_id uuid,p_workpiece_id uuid,p_opportunity_id uuid,p_candidate_revision_ids jsonb,
 p_expected_plan_revision_id uuid,p_expected_plan_revision bigint,p_expected_selection_set_revision bigint,
 p_operation_id text,p_operation_fingerprint text,p_actor_id uuid
)returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $$
declare seq tongs.reference_clip_plan_sequences%rowtype;member tongs.reference_clip_plan_membership%rowtype;
 current_set tongs.reference_clip_selection_set_revisions%rowtype;new_set tongs.reference_clip_selection_set_revisions%rowtype;
 candidate tongs.reference_clip_candidate_revisions%rowtype;entry jsonb;selected_candidate_id uuid;input_ordinal integer:=0;member_ordinal integer;
 ids uuid[]:=array[]::uuid[];prior jsonb;result jsonb;
begin
 if not tongs.has_workspace_role(p_workspace_id,'editor')then raise exception 'workspace editor authority required' using errcode='42501';end if;
 select jsonb_build_object('disposition','committed','selection_set_revision',to_jsonb(r),'selected_candidate_revision_ids',coalesce((select jsonb_agg(m.candidate_revision_id order by m.ordinal)from tongs.reference_clip_selection_set_members m where m.selection_set_revision_id=r.id),'[]'::jsonb),'canonical_selection_revision',r.canonical_revision) into prior from tongs.reference_clip_selection_set_revisions r where r.operation_id=p_operation_id and r.operation_fingerprint=p_operation_fingerprint;
 if found then return prior;end if;
 if exists(select 1 from tongs.reference_clip_selection_set_revisions where operation_id=p_operation_id)or exists(select 1 from tongs.reference_clip_operation_receipts where operation_id=p_operation_id)then return jsonb_build_object('disposition','operation_identity_conflict');end if;
 if jsonb_typeof(p_candidate_revision_ids)<>'array'then return jsonb_build_object('disposition','candidate_collection_required');end if;
 select * into seq from tongs.reference_clip_plan_sequences where workspace_id=p_workspace_id and workpiece_id=p_workpiece_id for update;
 if not found then return jsonb_build_object('disposition','plan_not_found');end if;
 if seq.current_plan_revision_id is distinct from p_expected_plan_revision_id or seq.current_plan_revision<>p_expected_plan_revision then return jsonb_build_object('disposition','plan_revision_conflict');end if;
 select * into member from tongs.reference_clip_plan_membership where plan_revision_id=seq.current_plan_revision_id and opportunity_id=p_opportunity_id;
 if not found then return jsonb_build_object('disposition','opportunity_not_current');end if;
 select * into current_set from tongs.reference_clip_selection_set_revisions where workspace_id=p_workspace_id and workpiece_id=p_workpiece_id and opportunity_id=p_opportunity_id and plan_revision_id=seq.current_plan_revision_id order by revision desc limit 1;
 if coalesce(current_set.revision,0)<>p_expected_selection_set_revision then return jsonb_build_object('disposition','selection_revision_conflict','current_selection_revision',coalesce(current_set.revision,0));end if;
 for entry in select value from jsonb_array_elements(p_candidate_revision_ids)loop
  input_ordinal:=input_ordinal+1;
  begin selected_candidate_id:=(entry#>>'{}')::uuid;exception when others then return jsonb_build_object('disposition','invalid_candidate','ordinal',input_ordinal);end;
  if selected_candidate_id=any(ids)then return jsonb_build_object('disposition','duplicate_candidate','candidate_revision_id',selected_candidate_id);end if;
  select * into candidate from tongs.reference_clip_candidate_revisions cr where cr.id=selected_candidate_id and cr.workspace_id=p_workspace_id and cr.workpiece_id=p_workpiece_id and cr.opportunity_id=p_opportunity_id and cr.opportunity_revision_id=member.opportunity_revision_id;
  if not found then return jsonb_build_object('disposition','invalid_candidate','candidate_revision_id',selected_candidate_id);end if;
  ids:=array_append(ids,selected_candidate_id);
 end loop;
 insert into tongs.reference_clip_selection_set_revisions(workspace_id,workpiece_id,opportunity_id,plan_revision_id,plan_revision,opportunity_revision_id,opportunity_revision,revision,canonical_revision,previous_revision_id,previous_revision,operation_id,operation_fingerprint,created_by)
 values(p_workspace_id,p_workpiece_id,p_opportunity_id,seq.current_plan_revision_id,seq.current_plan_revision,member.opportunity_revision_id,member.opportunity_revision,coalesce(current_set.revision,0)+1,seq.current_selection_revision+1,current_set.id,current_set.revision,p_operation_id,p_operation_fingerprint,p_actor_id)returning * into new_set;
 for member_ordinal in 1..coalesce(array_length(ids,1),0)loop
  select * into candidate from tongs.reference_clip_candidate_revisions where id=ids[member_ordinal];
  insert into tongs.reference_clip_selection_set_members(selection_set_revision_id,workspace_id,workpiece_id,opportunity_id,plan_revision_id,selection_set_revision,candidate_revision_id,candidate_revision,ordinal)
  values(new_set.id,p_workspace_id,p_workpiece_id,p_opportunity_id,seq.current_plan_revision_id,new_set.revision,candidate.id,candidate.revision,member_ordinal);
 end loop;
 update tongs.reference_clip_plan_sequences set current_selection_revision=current_selection_revision+1,updated_at=now()where workspace_id=p_workspace_id and workpiece_id=p_workpiece_id returning current_selection_revision into seq.current_selection_revision;
 result:=jsonb_build_object('disposition','committed','selection_set_revision',to_jsonb(new_set),'selected_candidate_revision_ids',to_jsonb(ids),'canonical_selection_revision',seq.current_selection_revision);
 return result;
end$$;

-- Safe legacy compatibility: selecting a candidate adds it to the active set and never replaces existing members.
create or replace function tongs.select_reference_clip_candidate(p_workspace_id uuid,p_workpiece_id uuid,p_opportunity_id uuid,p_candidate_revision_id uuid,p_expected_plan_revision_id uuid,p_expected_plan_revision bigint,p_expected_selection_revision bigint,p_operation_id text,p_operation_fingerprint text,p_actor_id uuid)returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $$
declare seq tongs.reference_clip_plan_sequences%rowtype;current_set tongs.reference_clip_selection_set_revisions%rowtype;legacy_receipt tongs.reference_clip_operation_receipts%rowtype;ids jsonb;result jsonb;legacy_replay boolean:=false;
begin
 select * into current_set from tongs.reference_clip_selection_set_revisions where operation_id=p_operation_id;
 if found then
  if current_set.operation_fingerprint<>p_operation_fingerprint then return jsonb_build_object('disposition','operation_identity_conflict');end if;
  select coalesce(jsonb_agg(candidate_revision_id order by ordinal),'[]'::jsonb)into ids from tongs.reference_clip_selection_set_members where selection_set_revision_id=current_set.id;
  return jsonb_build_object('disposition','committed','selection_set_revision',to_jsonb(current_set),'selected_candidate_revision_ids',ids,'canonical_selection_revision',current_set.canonical_revision);
 end if;
 select * into legacy_receipt from tongs.reference_clip_operation_receipts where operation_id=p_operation_id;
 if found and legacy_receipt.operation_fingerprint<>p_operation_fingerprint then return jsonb_build_object('disposition','operation_identity_conflict');end if;
 legacy_replay:=found;
 select * into seq from tongs.reference_clip_plan_sequences where workspace_id=p_workspace_id and workpiece_id=p_workpiece_id;
 if coalesce(seq.current_selection_revision,0)<>p_expected_selection_revision then return jsonb_build_object('disposition','selection_revision_conflict','current_selection_revision',coalesce(seq.current_selection_revision,0));end if;
 select * into current_set from tongs.reference_clip_selection_set_revisions where workspace_id=p_workspace_id and workpiece_id=p_workpiece_id and opportunity_id=p_opportunity_id and plan_revision_id=p_expected_plan_revision_id order by revision desc limit 1;
 select coalesce(jsonb_agg(candidate_revision_id order by ordinal),'[]'::jsonb)into ids from tongs.reference_clip_selection_set_members where selection_set_revision_id=current_set.id;
 if legacy_replay then return jsonb_build_object('disposition','committed','selection_set_revision',to_jsonb(current_set),'selected_candidate_revision_ids',ids,'canonical_selection_revision',current_set.canonical_revision);end if;
 result:=tongs.commit_reference_clip_selection_set(p_workspace_id,p_workpiece_id,p_opportunity_id,ids||jsonb_build_array(p_candidate_revision_id),p_expected_plan_revision_id,p_expected_plan_revision,coalesce(current_set.revision,0),p_operation_id,p_operation_fingerprint,p_actor_id);
 return result;
end$$;

create or replace function tongs.read_current_reference_clip_plan(p_workspace_id uuid,p_workpiece_id uuid)returns jsonb language sql stable security definer set search_path=pg_catalog,tongs as $$
select case when not tongs.has_workspace_role(p_workspace_id,'viewer')then null else(select jsonb_build_object(
 'sequence',to_jsonb(s),'plan_revision',to_jsonb(p),
 'summary',jsonb_build_object('total',(select count(*)from tongs.reference_clip_plan_membership m where m.plan_revision_id=s.current_plan_revision_id),'fulfilled',(select count(*)from tongs.reference_clip_plan_membership m where m.plan_revision_id=s.current_plan_revision_id and exists(select 1 from tongs.reference_clip_selection_set_revisions ss join tongs.reference_clip_selection_set_members sm on sm.selection_set_revision_id=ss.id where ss.plan_revision_id=m.plan_revision_id and ss.opportunity_id=m.opportunity_id and ss.revision=(select max(x.revision)from tongs.reference_clip_selection_set_revisions x where x.plan_revision_id=m.plan_revision_id and x.opportunity_id=m.opportunity_id))),'unresolved',(select count(*)from tongs.reference_clip_plan_membership m where m.plan_revision_id=s.current_plan_revision_id and not exists(select 1 from tongs.reference_clip_selection_set_revisions ss join tongs.reference_clip_selection_set_members sm on sm.selection_set_revision_id=ss.id where ss.plan_revision_id=m.plan_revision_id and ss.opportunity_id=m.opportunity_id and ss.revision=(select max(x.revision)from tongs.reference_clip_selection_set_revisions x where x.plan_revision_id=m.plan_revision_id and x.opportunity_id=m.opportunity_id)))),
 'opportunities',coalesce((select jsonb_agg(jsonb_build_object('membership',to_jsonb(m),'opportunity_revision',to_jsonb(o),'source_revision',to_jsonb(sr),'source_link_revision',to_jsonb(lr),'candidates',coalesce((select jsonb_agg(to_jsonb(c)order by c.created_at)from tongs.reference_clip_candidate_revisions c where c.workspace_id=m.workspace_id and c.workpiece_id=m.workpiece_id and c.opportunity_id=m.opportunity_id and c.opportunity_revision_id=m.opportunity_revision_id),'[]'::jsonb),'selection_set',to_jsonb(ss),'selections',coalesce((select jsonb_agg(to_jsonb(sm)||jsonb_build_object('candidate_revision',to_jsonb(cr))order by sm.ordinal)from tongs.reference_clip_selection_set_members sm join tongs.reference_clip_candidate_revisions cr on cr.id=sm.candidate_revision_id where sm.selection_set_revision_id=ss.id),'[]'::jsonb),'fulfilled',exists(select 1 from tongs.reference_clip_selection_set_members sm where sm.selection_set_revision_id=ss.id))order by m.ordinal)from tongs.reference_clip_plan_membership m join tongs.reference_clip_opportunity_revisions o on o.id=m.opportunity_revision_id left join tongs.source_revisions sr on sr.id=o.source_revision_id left join tongs.workpiece_source_link_revisions lr on lr.id=o.workpiece_source_link_revision_id left join lateral(select x.* from tongs.reference_clip_selection_set_revisions x where x.plan_revision_id=m.plan_revision_id and x.opportunity_id=m.opportunity_id order by x.revision desc limit 1)ss on true where m.plan_revision_id=s.current_plan_revision_id),'[]'::jsonb))from tongs.reference_clip_plan_sequences s left join tongs.reference_clip_plan_revisions p on p.id=s.current_plan_revision_id where s.workspace_id=p_workspace_id and s.workpiece_id=p_workpiece_id)end$$;

create or replace function tongs.read_reference_clip_visual_package(p_workspace_id uuid,p_workpiece_id uuid)returns jsonb language sql stable security definer set search_path=pg_catalog,tongs as $$
select case when not tongs.has_workspace_role(p_workspace_id,'viewer')then null else jsonb_build_object('contract_version','forge.reference-clips.hammer.v3','workspace_id',p_workspace_id,'workpiece_id',p_workpiece_id,'clips',coalesce((select jsonb_agg(jsonb_build_object('opportunity_id',o.opportunity_id,'opportunity_revision_id',o.id,'opportunity_revision',o.revision,'plan_revision_id',q.current_plan_revision_id,'plan_revision',q.current_plan_revision,'selection_set_revision_id',ss.id,'selection_set_revision',ss.revision,'selection_ordinal',sm.ordinal,'placement_hint',o.placement_hint,'duration_target_ms',o.duration_target_ms,'script_anchor',o.citation_anchor_json,'media_range',o.media_range_json,'source_revision_id',c.source_revision_id,'source_revision',c.source_revision,'source_link_revision_id',c.workpiece_source_link_revision_id,'source_link_revision',c.workpiece_source_link_revision,'candidate_revision_id',c.id,'candidate_revision',c.revision,'asset_id',c.asset_id,'asset_content_hash',c.asset_content_hash,'asset_path',c.asset_path,'storage_bucket',c.storage_bucket,'storage_key',c.storage_key,'mime_type',c.mime_type,'duration_ms',c.duration_ms,'poster_asset_id',c.poster_asset_id,'rights',c.rights_evidence_json,'provenance',c.provenance_json)order by m.ordinal,sm.ordinal)from tongs.reference_clip_plan_sequences q join tongs.reference_clip_plan_membership m on m.plan_revision_id=q.current_plan_revision_id join tongs.reference_clip_opportunity_revisions o on o.id=m.opportunity_revision_id and o.source_status='linked' join lateral(select x.* from tongs.reference_clip_selection_set_revisions x where x.workspace_id=q.workspace_id and x.workpiece_id=q.workpiece_id and x.opportunity_id=m.opportunity_id and x.plan_revision_id=q.current_plan_revision_id order by x.revision desc limit 1)ss on true join tongs.reference_clip_selection_set_members sm on sm.selection_set_revision_id=ss.id join tongs.reference_clip_candidate_revisions c on c.id=sm.candidate_revision_id where q.workspace_id=p_workspace_id and q.workpiece_id=p_workpiece_id),'[]'::jsonb))end$$;

-- Wrap the established plan-retention transaction, then copy each retained opportunity's complete active set.
alter function tongs.retain_unified_reference_clip_selections(text,text,uuid)rename to retain_unified_reference_clip_selections_singular_legacy;
create function tongs.retain_unified_reference_clip_selections(p_operation_id text,p_operation_fingerprint text,p_provider_plan_revision_id uuid)returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $$
declare result jsonb;final_plan uuid;op tongs.unified_visual_plan_operations%rowtype;target tongs.reference_clip_plan_membership%rowtype;source_set tongs.reference_clip_selection_set_revisions%rowtype;new_set tongs.reference_clip_selection_set_revisions%rowtype;sm tongs.reference_clip_selection_set_members%rowtype;previous_selection tongs.reference_clip_selections%rowtype;first_member tongs.reference_clip_selection_set_members%rowtype;candidate tongs.reference_clip_candidate_revisions%rowtype;fp text;
begin
 select * into op from tongs.unified_visual_plan_operations where operation_id=p_operation_id;
 -- The legacy merger discovers retained opportunities through the deprecated singular log.
 -- Seed one non-authoritative marker per nonempty active set; collection membership remains exclusively authoritative below.
 for source_set in
  select latest.* from(
   select distinct on(x.opportunity_id)x.* from tongs.reference_clip_selection_set_revisions x
   where x.workspace_id=op.workspace_id and x.workpiece_id=op.workpiece_id and x.plan_revision_id<>p_provider_plan_revision_id
   order by x.opportunity_id,x.created_at desc,x.revision desc
  )latest where exists(select 1 from tongs.reference_clip_selection_set_members present where present.selection_set_revision_id=latest.id)
 loop
  if exists(select 1 from tongs.reference_clip_selections s where s.operation_id=p_operation_id||':retain:set-marker:'||source_set.opportunity_id)then continue;end if;
  select * into first_member from tongs.reference_clip_selection_set_members where selection_set_revision_id=source_set.id order by ordinal limit 1;
  select * into candidate from tongs.reference_clip_candidate_revisions where id=first_member.candidate_revision_id;
  select * into previous_selection from tongs.reference_clip_selections where workspace_id=op.workspace_id and workpiece_id=op.workpiece_id order by revision desc limit 1;
  fp:=encode(extensions.digest(convert_to(jsonb_build_object('retention_set_marker',source_set.id,'candidate',candidate.id)::text,'UTF8'),'sha256'),'hex');
  insert into tongs.reference_clip_selections(workspace_id,workpiece_id,revision,previous_selection_id,previous_revision,plan_revision_id,plan_revision,opportunity_id,opportunity_revision_id,opportunity_revision,candidate_revision_id,candidate_revision,operation_id,operation_fingerprint,created_by)
  values(op.workspace_id,op.workpiece_id,coalesce(previous_selection.revision,0)+1,previous_selection.id,previous_selection.revision,source_set.plan_revision_id,source_set.plan_revision,source_set.opportunity_id,source_set.opportunity_revision_id,source_set.opportunity_revision,candidate.id,candidate.revision,p_operation_id||':retain:set-marker:'||source_set.opportunity_id,fp,op.created_by);
 end loop;
 result:=tongs.retain_unified_reference_clip_selections_singular_legacy(p_operation_id,p_operation_fingerprint,p_provider_plan_revision_id);
 if result->>'disposition' not in('retained','replay')then return result;end if;final_plan:=(result->>'revision_id')::uuid;
 for target in select m.* from tongs.reference_clip_plan_membership m where m.plan_revision_id=final_plan loop
  if exists(select 1 from tongs.reference_clip_selection_set_revisions where plan_revision_id=final_plan and opportunity_id=target.opportunity_id)then continue;end if;
  select x.* into source_set from tongs.reference_clip_selection_set_revisions x where x.workspace_id=op.workspace_id and x.workpiece_id=op.workpiece_id and x.opportunity_id=target.opportunity_id and x.plan_revision_id<>final_plan order by x.created_at desc,x.revision desc limit 1;
  if not found then continue;end if;
  fp:=encode(extensions.digest(convert_to(jsonb_build_object('parent',p_operation_id,'source_selection_set',source_set.id,'plan',final_plan)::text,'UTF8'),'sha256'),'hex');
  insert into tongs.reference_clip_selection_set_revisions(workspace_id,workpiece_id,opportunity_id,plan_revision_id,plan_revision,opportunity_revision_id,opportunity_revision,revision,canonical_revision,operation_id,operation_fingerprint,created_by)
  values(op.workspace_id,op.workpiece_id,target.opportunity_id,final_plan,target.plan_revision,target.opportunity_revision_id,target.opportunity_revision,1,(select current_selection_revision from tongs.reference_clip_plan_sequences where workspace_id=op.workspace_id and workpiece_id=op.workpiece_id),p_operation_id||':retain:reference-set:'||target.opportunity_id,fp,op.created_by)returning * into new_set;
  for sm in select * from tongs.reference_clip_selection_set_members where selection_set_revision_id=source_set.id order by ordinal loop
   insert into tongs.reference_clip_selection_set_members(selection_set_revision_id,workspace_id,workpiece_id,opportunity_id,plan_revision_id,selection_set_revision,candidate_revision_id,candidate_revision,ordinal)values(new_set.id,op.workspace_id,op.workpiece_id,target.opportunity_id,final_plan,1,sm.candidate_revision_id,sm.candidate_revision,sm.ordinal);
  end loop;
 end loop;
 return result;
end$$;

revoke all on function tongs.commit_reference_clip_selection_set(uuid,uuid,uuid,jsonb,uuid,bigint,bigint,text,text,uuid),tongs.select_reference_clip_candidate(uuid,uuid,uuid,uuid,uuid,bigint,bigint,text,text,uuid),tongs.read_current_reference_clip_plan(uuid,uuid),tongs.read_reference_clip_visual_package(uuid,uuid),tongs.retain_unified_reference_clip_selections(text,text,uuid),tongs.retain_unified_reference_clip_selections_singular_legacy(text,text,uuid)from public,anon,authenticated;
grant execute on function tongs.commit_reference_clip_selection_set(uuid,uuid,uuid,jsonb,uuid,bigint,bigint,text,text,uuid),tongs.select_reference_clip_candidate(uuid,uuid,uuid,uuid,uuid,bigint,bigint,text,text,uuid),tongs.read_current_reference_clip_plan(uuid,uuid),tongs.read_reference_clip_visual_package(uuid,uuid),tongs.retain_unified_reference_clip_selections(text,text,uuid)to authenticated,service_role;

commit;
