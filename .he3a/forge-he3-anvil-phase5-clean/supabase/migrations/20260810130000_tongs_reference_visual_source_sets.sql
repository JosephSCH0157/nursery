begin;

create table tongs.reference_visual_source_set_revisions(
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null,workpiece_id uuid not null,opportunity_id uuid not null,
 plan_revision_id uuid not null,plan_revision bigint not null,opportunity_revision_id uuid not null,opportunity_revision bigint not null,
 revision bigint not null check(revision>0),previous_revision_id uuid,previous_revision bigint,
 operation_id text not null unique,operation_fingerprint text not null check(operation_fingerprint~'^[0-9a-f]{64}$'),created_by uuid not null,created_at timestamptz not null default now(),
 unique(id,workspace_id,workpiece_id,opportunity_id,plan_revision_id,revision),unique(workspace_id,workpiece_id,opportunity_id,plan_revision_id,revision),
 foreign key(plan_revision_id,workspace_id,workpiece_id,plan_revision)references tongs.reference_visual_plan_revisions(id,workspace_id,workpiece_id,revision),
 foreign key(opportunity_revision_id,workspace_id,workpiece_id,opportunity_id,opportunity_revision)references tongs.reference_visual_opportunity_revisions(id,workspace_id,workpiece_id,opportunity_id,revision),
 foreign key(previous_revision_id,workspace_id,workpiece_id,opportunity_id,plan_revision_id,previous_revision)references tongs.reference_visual_source_set_revisions(id,workspace_id,workpiece_id,opportunity_id,plan_revision_id,revision)
);
create table tongs.reference_visual_source_set_members(
 id uuid primary key default gen_random_uuid(),source_set_revision_id uuid not null,workspace_id uuid not null,workpiece_id uuid not null,opportunity_id uuid not null,plan_revision_id uuid not null,source_set_revision bigint not null,
 ordinal integer not null check(ordinal>0),source_revision_id uuid not null,source_revision bigint not null,workpiece_source_link_revision_id uuid not null,workpiece_source_link_revision bigint not null,
 unique(source_set_revision_id,ordinal),unique(source_set_revision_id,source_revision_id,workpiece_source_link_revision_id),unique(id,workspace_id,workpiece_id,opportunity_id),
 foreign key(source_set_revision_id,workspace_id,workpiece_id,opportunity_id,plan_revision_id,source_set_revision)references tongs.reference_visual_source_set_revisions(id,workspace_id,workpiece_id,opportunity_id,plan_revision_id,revision),
 foreign key(source_revision_id)references tongs.source_revisions(id),foreign key(workpiece_source_link_revision_id)references tongs.workpiece_source_link_revisions(id)
);
create index reference_visual_source_sets_current_idx on tongs.reference_visual_source_set_revisions(workspace_id,workpiece_id,plan_revision_id,opportunity_id,revision desc);
create index reference_visual_source_set_members_order_idx on tongs.reference_visual_source_set_members(source_set_revision_id,ordinal);

alter table tongs.reference_visual_evidence_revisions add column source_set_member_id uuid;
alter table tongs.reference_visual_source_use_revisions add column source_set_member_id uuid;
alter table tongs.reference_visual_evidence_revisions add constraint reference_visual_evidence_source_member_fk foreign key(source_set_member_id,workspace_id,workpiece_id,opportunity_id)references tongs.reference_visual_source_set_members(id,workspace_id,workpiece_id,opportunity_id);
alter table tongs.reference_visual_source_use_revisions add constraint reference_visual_source_use_member_fk foreign key(source_set_member_id,workspace_id,workpiece_id,opportunity_id)references tongs.reference_visual_source_set_members(id,workspace_id,workpiece_id,opportunity_id);

do $backfill$
declare row record;set_revision tongs.reference_visual_source_set_revisions%rowtype;fp text;
begin
 for row in select s.workspace_id,s.workpiece_id,s.current_plan_revision_id plan_id,s.current_plan_revision plan_revision,m.opportunity_id,m.opportunity_revision_id,m.opportunity_revision,o.source_revision_id,o.source_revision,o.workpiece_source_link_revision_id,o.workpiece_source_link_revision
  from tongs.reference_visual_plan_sequences s join tongs.reference_visual_plan_membership m on m.plan_revision_id=s.current_plan_revision_id join tongs.reference_visual_opportunity_revisions o on o.id=m.opportunity_revision_id where o.source_status='linked'
 loop
  fp:=encode(extensions.digest(convert_to(jsonb_build_object('backfill','reference_visual_source_set','plan',row.plan_id,'opportunity',row.opportunity_id,'source',row.source_revision_id)::text,'UTF8'),'sha256'),'hex');
  insert into tongs.reference_visual_source_set_revisions(workspace_id,workpiece_id,opportunity_id,plan_revision_id,plan_revision,opportunity_revision_id,opportunity_revision,revision,operation_id,operation_fingerprint,created_by,created_at)
  select row.workspace_id,row.workpiece_id,row.opportunity_id,row.plan_id,row.plan_revision,row.opportunity_revision_id,row.opportunity_revision,1,'forge:reference-visual:source-set:backfill:'||row.plan_id||':'||row.opportunity_id,fp,o.created_by,o.created_at from tongs.reference_visual_opportunity_revisions o where o.id=row.opportunity_revision_id returning * into set_revision;
  insert into tongs.reference_visual_source_set_members(source_set_revision_id,workspace_id,workpiece_id,opportunity_id,plan_revision_id,source_set_revision,ordinal,source_revision_id,source_revision,workpiece_source_link_revision_id,workpiece_source_link_revision)
  values(set_revision.id,row.workspace_id,row.workpiece_id,row.opportunity_id,row.plan_id,1,1,row.source_revision_id,row.source_revision,row.workpiece_source_link_revision_id,row.workpiece_source_link_revision);
 end loop;
 -- These two columns attach pre-existing immutable child revisions to the
 -- deterministic one-member set created above. This is a one-time migration
 -- repair, bounded by this transaction; runtime immutability is restored
 -- immediately after the foreign keys are populated.
 alter table tongs.reference_visual_evidence_revisions disable trigger reference_visual_evidence_revisions_immutable;
 alter table tongs.reference_visual_source_use_revisions disable trigger reference_visual_source_use_revisions_immutable;
 update tongs.reference_visual_evidence_revisions e set source_set_member_id=sm.id from tongs.reference_visual_source_set_members sm where sm.workspace_id=e.workspace_id and sm.workpiece_id=e.workpiece_id and sm.opportunity_id=e.opportunity_id and sm.source_revision_id=e.source_revision_id and sm.workpiece_source_link_revision_id=e.workpiece_source_link_revision_id;
 update tongs.reference_visual_source_use_revisions u set source_set_member_id=sm.id from tongs.reference_visual_source_set_members sm where sm.workspace_id=u.workspace_id and sm.workpiece_id=u.workpiece_id and sm.opportunity_id=u.opportunity_id and sm.source_revision_id=u.source_revision_id and sm.workpiece_source_link_revision_id=u.workpiece_source_link_revision_id;
 alter table tongs.reference_visual_evidence_revisions enable trigger reference_visual_evidence_revisions_immutable;
 alter table tongs.reference_visual_source_use_revisions enable trigger reference_visual_source_use_revisions_immutable;
end $backfill$;

create trigger reference_visual_source_set_revisions_immutable before update or delete on tongs.reference_visual_source_set_revisions for each row execute function tongs.reject_reference_visual_immutable_mutation();
create trigger reference_visual_source_set_members_immutable before update or delete on tongs.reference_visual_source_set_members for each row execute function tongs.reject_reference_visual_immutable_mutation();
create or replace function tongs.bind_reference_visual_child_to_source_member()returns trigger language plpgsql security definer set search_path=pg_catalog,tongs as $$
declare member_id uuid;
begin
 select sm.id into member_id from tongs.reference_visual_plan_sequences ps join lateral(select ss.* from tongs.reference_visual_source_set_revisions ss where ss.workspace_id=new.workspace_id and ss.workpiece_id=new.workpiece_id and ss.opportunity_id=new.opportunity_id and ss.plan_revision_id=ps.current_plan_revision_id order by ss.revision desc limit 1)set_revision on true join tongs.reference_visual_source_set_members sm on sm.source_set_revision_id=set_revision.id and sm.source_revision_id=new.source_revision_id and sm.workpiece_source_link_revision_id=new.workpiece_source_link_revision_id where ps.workspace_id=new.workspace_id and ps.workpiece_id=new.workpiece_id;
 new.source_set_member_id:=member_id;return new;
end$$;
create trigger reference_visual_evidence_source_member before insert on tongs.reference_visual_evidence_revisions for each row execute function tongs.bind_reference_visual_child_to_source_member();
create trigger reference_visual_source_use_source_member before insert on tongs.reference_visual_source_use_revisions for each row execute function tongs.bind_reference_visual_child_to_source_member();
alter table tongs.reference_visual_source_set_revisions enable row level security;alter table tongs.reference_visual_source_set_members enable row level security;
create policy reference_visual_source_set_revisions_viewer on tongs.reference_visual_source_set_revisions for select to authenticated using(tongs.has_workspace_role(workspace_id,'viewer'));
create policy reference_visual_source_set_members_viewer on tongs.reference_visual_source_set_members for select to authenticated using(tongs.has_workspace_role(workspace_id,'viewer'));
revoke all on tongs.reference_visual_source_set_revisions,tongs.reference_visual_source_set_members from public,anon,authenticated;
grant select on tongs.reference_visual_source_set_revisions,tongs.reference_visual_source_set_members to authenticated;

create or replace function tongs.commit_reference_visual_source_set(p_workspace_id uuid,p_workpiece_id uuid,p_opportunity_id uuid,p_members jsonb,p_expected_plan_revision_id uuid,p_expected_plan_revision bigint,p_expected_source_set_revision bigint,p_operation_id text,p_operation_fingerprint text,p_actor_id uuid)returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $$
#variable_conflict use_column
declare seq tongs.reference_visual_plan_sequences%rowtype;membership tongs.reference_visual_plan_membership%rowtype;current_set tongs.reference_visual_source_set_revisions%rowtype;new_set tongs.reference_visual_source_set_revisions%rowtype;prior tongs.reference_visual_source_set_revisions%rowtype;item jsonb;src tongs.source_revisions%rowtype;link_rev tongs.workpiece_source_link_revisions%rowtype;position integer:=0;ids jsonb:='[]'::jsonb;result jsonb;
begin
 if not tongs.has_workspace_role(p_workspace_id,'editor')or auth.uid()is distinct from p_actor_id then raise exception 'workspace editor authority required' using errcode='42501';end if;
 if jsonb_typeof(p_members)<>'array'then return jsonb_build_object('disposition','members_array_required');end if;
 perform pg_advisory_xact_lock(hashtextextended(p_operation_id,0));
 select * into prior from tongs.reference_visual_source_set_revisions where operation_id=p_operation_id;
 if found then if prior.operation_fingerprint<>p_operation_fingerprint then return jsonb_build_object('disposition','operation_identity_conflict');end if;select coalesce(jsonb_agg(jsonb_build_object('source_revision_id',m.source_revision_id,'workpiece_source_link_revision_id',m.workpiece_source_link_revision_id)order by m.ordinal),'[]'::jsonb)into ids from tongs.reference_visual_source_set_members m where m.source_set_revision_id=prior.id;return jsonb_build_object('disposition','committed','source_set_revision',to_jsonb(prior),'members',ids);end if;
 select * into seq from tongs.reference_visual_plan_sequences where workspace_id=p_workspace_id and workpiece_id=p_workpiece_id for update;
 if seq.current_plan_revision_id is distinct from p_expected_plan_revision_id or seq.current_plan_revision<>p_expected_plan_revision then return jsonb_build_object('disposition','plan_revision_conflict');end if;
 select * into membership from tongs.reference_visual_plan_membership where plan_revision_id=seq.current_plan_revision_id and opportunity_id=p_opportunity_id;if not found then return jsonb_build_object('disposition','opportunity_not_current');end if;
 select * into current_set from tongs.reference_visual_source_set_revisions where workspace_id=p_workspace_id and workpiece_id=p_workpiece_id and opportunity_id=p_opportunity_id and plan_revision_id=seq.current_plan_revision_id order by revision desc limit 1;
 if coalesce(current_set.revision,0)<>p_expected_source_set_revision then return jsonb_build_object('disposition','source_set_revision_conflict','current_revision',coalesce(current_set.revision,0));end if;
 if exists(select 1 from jsonb_array_elements(p_members)x group by x->>'source_revision_id',x->>'workpiece_source_link_revision_id' having count(*)>1)then return jsonb_build_object('disposition','duplicate_source');end if;
 for item in select value from jsonb_array_elements(p_members)loop
  position:=position+1;
  begin select * into src from tongs.source_revisions where id=(item->>'source_revision_id')::uuid and workspace_id=p_workspace_id;exception when invalid_text_representation then return jsonb_build_object('disposition','invalid_source');end;
  if not found then return jsonb_build_object('disposition','invalid_source');end if;
  begin select * into link_rev from tongs.workpiece_source_link_revisions where id=(item->>'workpiece_source_link_revision_id')::uuid and workspace_id=p_workspace_id and workpiece_id=p_workpiece_id and source_revision_id=src.id;exception when invalid_text_representation then return jsonb_build_object('disposition','invalid_source_link');end;
  if not found then return jsonb_build_object('disposition','invalid_source_link');end if;
 end loop;
 insert into tongs.reference_visual_source_set_revisions(workspace_id,workpiece_id,opportunity_id,plan_revision_id,plan_revision,opportunity_revision_id,opportunity_revision,revision,previous_revision_id,previous_revision,operation_id,operation_fingerprint,created_by)
 values(p_workspace_id,p_workpiece_id,p_opportunity_id,seq.current_plan_revision_id,seq.current_plan_revision,membership.opportunity_revision_id,membership.opportunity_revision,coalesce(current_set.revision,0)+1,current_set.id,current_set.revision,p_operation_id,p_operation_fingerprint,p_actor_id)returning * into new_set;
 position:=0;ids:='[]'::jsonb;
 for item in select value from jsonb_array_elements(p_members)loop position:=position+1;select * into src from tongs.source_revisions where id=(item->>'source_revision_id')::uuid;select * into link_rev from tongs.workpiece_source_link_revisions where id=(item->>'workpiece_source_link_revision_id')::uuid;insert into tongs.reference_visual_source_set_members(source_set_revision_id,workspace_id,workpiece_id,opportunity_id,plan_revision_id,source_set_revision,ordinal,source_revision_id,source_revision,workpiece_source_link_revision_id,workpiece_source_link_revision)values(new_set.id,p_workspace_id,p_workpiece_id,p_opportunity_id,seq.current_plan_revision_id,new_set.revision,position,src.id,src.revision,link_rev.id,link_rev.revision);ids:=ids||jsonb_build_array(jsonb_build_object('source_revision_id',src.id,'workpiece_source_link_revision_id',link_rev.id));end loop;
 result:=jsonb_build_object('disposition','committed','source_set_revision',to_jsonb(new_set),'members',ids);return result;
end$$;

revoke all on function tongs.commit_reference_visual_source_set(uuid,uuid,uuid,jsonb,uuid,bigint,bigint,text,text,uuid)from public,anon;
grant execute on function tongs.commit_reference_visual_source_set(uuid,uuid,uuid,jsonb,uuid,bigint,bigint,text,text,uuid)to authenticated,service_role;

/* Superseded in-place by the formatted collection projection below.
create or replace function tongs.read_current_reference_visual_plan(p_workspace_id uuid,p_workpiece_id uuid)returns jsonb language sql stable security definer set search_path=pg_catalog,tongs as $$
select null::jsonb$$;
*/

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
   'candidates',coalesce((select jsonb_agg(to_jsonb(c)||jsonb_build_object('asset',to_jsonb(a),'release_ready',tongs.reference_visual_candidate_release_ready(c.id))order by c.created_at)from tongs.reference_visual_candidate_revisions c left join tongs.assets a on a.id=c.asset_id where c.workspace_id=m.workspace_id and c.workpiece_id=m.workpiece_id and c.opportunity_id=m.opportunity_id and c.opportunity_revision_id=m.opportunity_revision_id),'[]'::jsonb),
   'selection',to_jsonb(sel),'release_ready',sel.id is not null and tongs.reference_visual_candidate_release_ready(sel.candidate_revision_id)
  )order by m.ordinal)
  from tongs.reference_visual_plan_membership m join tongs.reference_visual_opportunity_revisions o on o.id=m.opportunity_revision_id
  left join tongs.source_revisions sr on sr.id=o.source_revision_id left join tongs.workpiece_source_link_revisions sl on sl.id=o.workpiece_source_link_revision_id
  left join lateral(select x.* from tongs.reference_visual_source_set_revisions x where x.plan_revision_id=p.id and x.opportunity_id=m.opportunity_id order by x.revision desc limit 1)ss on true
  left join lateral(select u.* from tongs.reference_visual_source_use_sequences us join tongs.reference_visual_source_use_revisions u on u.id=us.current_use_revision_id where us.workspace_id=m.workspace_id and us.workpiece_id=m.workpiece_id and us.opportunity_id=m.opportunity_id order by u.revision desc limit 1)su on true
  left join tongs.reference_visual_recipe_sequences rs on rs.workspace_id=m.workspace_id and rs.workpiece_id=m.workpiece_id and rs.opportunity_id=m.opportunity_id left join tongs.reference_visual_recipe_revisions rr on rr.id=rs.current_recipe_revision_id
  left join tongs.reference_visual_rights_declaration_sequences rds on rds.workspace_id=m.workspace_id and rds.workpiece_id=m.workpiece_id and rds.opportunity_id=m.opportunity_id left join tongs.reference_visual_rights_declaration_revisions rd on rd.id=rds.current_declaration_revision_id
  left join lateral(select x.* from tongs.reference_visual_selections x where x.plan_revision_id=p.id and x.opportunity_id=m.opportunity_id order by x.revision desc limit 1)sel on true
  where m.plan_revision_id=p.id),'[]'::jsonb)
 ) end
 from tongs.reference_visual_plan_sequences s join tongs.reference_visual_plan_revisions p on p.id=s.current_plan_revision_id
 where s.workspace_id=p_workspace_id and s.workpiece_id=p_workpiece_id
$$;

create or replace function tongs.retain_reference_visual_source_set_on_membership()returns trigger language plpgsql security definer set search_path=pg_catalog,tongs as $$
declare prior tongs.reference_visual_source_set_revisions%rowtype;created tongs.reference_visual_source_set_revisions%rowtype;member tongs.reference_visual_source_set_members%rowtype;fp text;actor uuid;
begin
 if exists(select 1 from tongs.reference_visual_source_set_revisions where plan_revision_id=new.plan_revision_id and opportunity_id=new.opportunity_id)then return new;end if;
 select s.* into prior from tongs.reference_visual_source_set_revisions s where s.workspace_id=new.workspace_id and s.workpiece_id=new.workpiece_id and s.opportunity_id=new.opportunity_id and s.opportunity_revision_id=new.opportunity_revision_id order by s.created_at desc,s.revision desc limit 1;
 if not found then return new;end if;select created_by into actor from tongs.reference_visual_plan_revisions where id=new.plan_revision_id;fp:=encode(extensions.digest(convert_to(jsonb_build_object('retained_source_set',prior.id,'plan',new.plan_revision_id)::text,'UTF8'),'sha256'),'hex');
 insert into tongs.reference_visual_source_set_revisions(workspace_id,workpiece_id,opportunity_id,plan_revision_id,plan_revision,opportunity_revision_id,opportunity_revision,revision,operation_id,operation_fingerprint,created_by)
 values(new.workspace_id,new.workpiece_id,new.opportunity_id,new.plan_revision_id,new.plan_revision,new.opportunity_revision_id,new.opportunity_revision,1,'forge:reference-visual:source-set:retain:'||new.plan_revision_id||':'||new.opportunity_id,fp,actor)returning * into created;
 for member in select * from tongs.reference_visual_source_set_members where source_set_revision_id=prior.id order by ordinal loop insert into tongs.reference_visual_source_set_members(source_set_revision_id,workspace_id,workpiece_id,opportunity_id,plan_revision_id,source_set_revision,ordinal,source_revision_id,source_revision,workpiece_source_link_revision_id,workpiece_source_link_revision)values(created.id,new.workspace_id,new.workpiece_id,new.opportunity_id,new.plan_revision_id,1,member.ordinal,member.source_revision_id,member.source_revision,member.workpiece_source_link_revision_id,member.workpiece_source_link_revision);end loop;
 return new;
end$$;
create trigger reference_visual_source_set_retention after insert on tongs.reference_visual_plan_membership for each row execute function tongs.retain_reference_visual_source_set_on_membership();

create or replace function tongs.read_reference_visual_visual_package(p_workspace_id uuid,p_workpiece_id uuid)returns jsonb language sql stable security definer set search_path=pg_catalog,tongs as $$
select case when not tongs.has_workspace_role(p_workspace_id,'viewer')then null else jsonb_build_object('contract_version','forge.reference-visual.hammer.v3','visuals',coalesce((select jsonb_agg(jsonb_build_object(
 'plan_revision_id',p.id,'plan_revision',p.revision,'opportunity_id',o.opportunity_id,'opportunity_revision_id',o.id,'opportunity_revision',o.revision,
 'source_set_revision_id',ss.id,'source_set_revision',ss.revision,
 'sources',coalesce((select jsonb_agg(jsonb_build_object('ordinal',sm.ordinal,'source_set_member_id',sm.id,'source_revision_id',sm.source_revision_id,'source_revision',sm.source_revision,'source_link_revision_id',sm.workpiece_source_link_revision_id,'source_link_revision',sm.workpiece_source_link_revision)order by sm.ordinal)from tongs.reference_visual_source_set_members sm where sm.source_set_revision_id=ss.id),'[]'::jsonb),
 'candidate_revision_id',c.id,'candidate_revision',c.revision,'candidate_kind',c.candidate_kind,'asset_id',a.id,'asset_path',a.path,'storage_bucket',a.storage_bucket,'storage_key',a.storage_key,'mime_type',a.mime_type,'asset_content_hash',a.content_hash,
 'placement_hint',o.placement_hint,'duration_target_ms',o.duration_target_ms,'script_anchor',o.citation_anchor_json,
 'source_revision_id',o.source_revision_id,'source_revision',o.source_revision,'source_link_revision_id',o.workpiece_source_link_revision_id,'source_link_revision',o.workpiece_source_link_revision,
 'source_use',to_jsonb(u),'rights',to_jsonb(rd),'evidence',coalesce((select jsonb_agg(to_jsonb(ev)order by array_position(r.evidence_revision_ids,ev.id))from unnest(r.evidence_revision_ids)e(id)join tongs.reference_visual_evidence_revisions ev on ev.id=e.id),'[]'::jsonb),'recipe',to_jsonb(r),'render_provenance',c.provenance_json
)order by m.ordinal)from tongs.reference_visual_plan_sequences ps join tongs.reference_visual_plan_revisions p on p.id=ps.current_plan_revision_id join tongs.reference_visual_plan_membership m on m.plan_revision_id=p.id join tongs.reference_visual_opportunity_revisions o on o.id=m.opportunity_revision_id left join lateral(select x.* from tongs.reference_visual_source_set_revisions x where x.plan_revision_id=p.id and x.opportunity_id=o.opportunity_id order by x.revision desc limit 1)ss on true join lateral(select s.* from tongs.reference_visual_selections s where s.plan_revision_id=p.id and s.opportunity_id=o.opportunity_id order by s.revision desc limit 1)sel on true join tongs.reference_visual_candidate_revisions c on c.id=sel.candidate_revision_id left join tongs.assets a on a.id=c.asset_id left join tongs.reference_visual_recipe_revisions r on r.id=c.recipe_revision_id left join tongs.reference_visual_source_use_revisions u on u.id=c.source_use_revision_id left join tongs.reference_visual_rights_declaration_revisions rd on rd.id=c.rights_declaration_revision_id where ps.workspace_id=p_workspace_id and ps.workpiece_id=p_workpiece_id and tongs.reference_visual_candidate_release_ready(c.id)),'[]'::jsonb))end$$;

revoke all on function tongs.read_current_reference_visual_plan(uuid,uuid),tongs.read_reference_visual_visual_package(uuid,uuid)from public,anon;
grant execute on function tongs.read_current_reference_visual_plan(uuid,uuid),tongs.read_reference_visual_visual_package(uuid,uuid)to authenticated,service_role;

notify pgrst,'reload schema';
commit;
