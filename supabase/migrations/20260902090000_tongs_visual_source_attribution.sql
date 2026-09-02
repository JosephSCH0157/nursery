-- Immutable editorial provenance connecting visual opportunities to canonical Sources.
begin;

create table tongs.visual_source_attribution_revisions(
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null, workpiece_id uuid not null,
 artifact_family text not null check(artifact_family in('image','broll','reference_clip','reference_visual')),
 opportunity_id uuid not null, script_approval_id uuid not null, unified_plan_operation_id text not null,
 child_plan_revision_id uuid not null, revision bigint not null check(revision>0), previous_revision_id uuid, previous_revision bigint,
 state text not null check(state in('auto_bound','selection_required','creator_selected','none_known')),
 relationship text not null check(relationship in('direct','supporting','ambiguous','none')),
 rationale text not null default '', model_evidence_json jsonb not null default '{}'::jsonb check(jsonb_typeof(model_evidence_json)='object'),
 operation_id text not null unique, operation_fingerprint text not null check(operation_fingerprint~'^[0-9a-f]{64}$'),
 immutable_revision_hash text not null check(immutable_revision_hash~'^[0-9a-f]{64}$'), created_by uuid not null, created_at timestamptz not null default now(),
 unique(workspace_id,workpiece_id,artifact_family,opportunity_id,revision),
 foreign key(workpiece_id,workspace_id) references tongs.episodes(id,workspace_id) on delete cascade,
 foreign key(script_approval_id) references tongs.script_approval_revisions(id),
 foreign key(previous_revision_id) references tongs.visual_source_attribution_revisions(id),
 check((previous_revision_id is null)=(previous_revision is null)),
 check((revision=1 and previous_revision_id is null)or(revision>1 and previous_revision=revision-1)),
 check((relationship='none')=(state='none_known'))
);
create table tongs.visual_source_attribution_members(
 id uuid primary key default gen_random_uuid(), attribution_revision_id uuid not null references tongs.visual_source_attribution_revisions(id) on delete cascade,
 workspace_id uuid not null, workpiece_id uuid not null, ordinal integer not null check(ordinal>0),
 role text not null check(role in('direct_basis','supporting','candidate')),
 source_revision_id uuid not null references tongs.source_revisions(id), workpiece_source_link_revision_id uuid not null references tongs.workpiece_source_link_revisions(id),
 unique(attribution_revision_id,ordinal), unique(attribution_revision_id,source_revision_id,workpiece_source_link_revision_id)
);
create index visual_source_attribution_current_idx on tongs.visual_source_attribution_revisions(workspace_id,workpiece_id,artifact_family,opportunity_id,revision desc);

create trigger visual_source_attribution_revisions_immutable before update or delete on tongs.visual_source_attribution_revisions for each row execute function tongs.reject_reference_visual_immutable_mutation();
create trigger visual_source_attribution_members_immutable before update or delete on tongs.visual_source_attribution_members for each row execute function tongs.reject_reference_visual_immutable_mutation();
alter table tongs.visual_source_attribution_revisions enable row level security;
alter table tongs.visual_source_attribution_members enable row level security;
create policy visual_source_attribution_revisions_viewer on tongs.visual_source_attribution_revisions for select to authenticated using(tongs.has_workspace_role(workspace_id,'viewer'));
create policy visual_source_attribution_members_viewer on tongs.visual_source_attribution_members for select to authenticated using(tongs.has_workspace_role(workspace_id,'viewer'));
revoke all on tongs.visual_source_attribution_revisions,tongs.visual_source_attribution_members from public,anon,authenticated;
grant select on tongs.visual_source_attribution_revisions,tongs.visual_source_attribution_members to authenticated;

create or replace function tongs.commit_visual_source_attribution(
 p_workspace_id uuid,p_workpiece_id uuid,p_artifact_family text,p_opportunity_id uuid,p_script_approval_id uuid,
 p_unified_plan_operation_id text,p_child_plan_revision_id uuid,p_state text,p_relationship text,p_rationale text,p_model_evidence_json jsonb,
 p_members jsonb,p_expected_revision bigint,p_operation_id text,p_operation_fingerprint text,p_actor_id uuid
)returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $$
#variable_conflict use_column
declare prior tongs.visual_source_attribution_revisions%rowtype;current_row tongs.visual_source_attribution_revisions%rowtype;created tongs.visual_source_attribution_revisions%rowtype;item jsonb;src tongs.source_revisions%rowtype;link_rev tongs.workpiece_source_link_revisions%rowtype;position integer:=0;members_json jsonb:='[]'::jsonb;immutable_hash text;
begin
 if not tongs.has_workspace_role(p_workspace_id,'editor')or auth.uid()is distinct from p_actor_id then raise exception 'workspace editor authority required' using errcode='42501';end if;
 if p_artifact_family not in('image','broll','reference_clip','reference_visual')or p_state not in('auto_bound','selection_required','creator_selected','none_known')or p_relationship not in('direct','supporting','ambiguous','none')then return jsonb_build_object('disposition','invalid_contract');end if;
 if jsonb_typeof(p_members)<>'array'then return jsonb_build_object('disposition','members_array_required');end if;
 if (p_relationship='none')<>(jsonb_array_length(p_members)=0)then return jsonb_build_object('disposition','relationship_member_conflict');end if;
 if p_relationship='direct'and jsonb_array_length(p_members)<>1 then return jsonb_build_object('disposition','direct_source_count');end if;
 if p_relationship='ambiguous'and jsonb_array_length(p_members)<2 then return jsonb_build_object('disposition','ambiguous_source_count');end if;
 perform pg_advisory_xact_lock(hashtextextended(p_operation_id,0));select * into prior from tongs.visual_source_attribution_revisions where operation_id=p_operation_id;
 if found then if prior.operation_fingerprint<>p_operation_fingerprint then return jsonb_build_object('disposition','operation_identity_conflict');end if;return jsonb_build_object('disposition','committed','attribution_revision',to_jsonb(prior));end if;
 select * into current_row from tongs.visual_source_attribution_revisions where workspace_id=p_workspace_id and workpiece_id=p_workpiece_id and artifact_family=p_artifact_family and opportunity_id=p_opportunity_id order by revision desc limit 1 for update;
 if coalesce(current_row.revision,0)<>p_expected_revision then return jsonb_build_object('disposition','attribution_revision_conflict','current_revision',coalesce(current_row.revision,0));end if;
 for item in select value from jsonb_array_elements(p_members)loop position:=position+1;
  begin select * into src from tongs.source_revisions where id=(item->>'source_revision_id')::uuid and workspace_id=p_workspace_id;exception when invalid_text_representation then return jsonb_build_object('disposition','invalid_source');end;
  if not found then return jsonb_build_object('disposition','invalid_source');end if;
  begin select * into link_rev from tongs.workpiece_source_link_revisions where id=(item->>'workpiece_source_link_revision_id')::uuid and workspace_id=p_workspace_id and workpiece_id=p_workpiece_id and source_revision_id=src.id;exception when invalid_text_representation then return jsonb_build_object('disposition','invalid_source_link');end;
  if not found then return jsonb_build_object('disposition','invalid_source_link');end if;
 end loop;
 if p_relationship='direct'and p_artifact_family='reference_clip'and not exists(
  select 1 from tongs.reference_clip_plan_sequences seq
  join tongs.reference_clip_plan_membership membership on membership.plan_revision_id=seq.current_plan_revision_id and membership.opportunity_id=p_opportunity_id
  join tongs.reference_clip_opportunity_revisions opportunity on opportunity.id=membership.opportunity_revision_id
  where seq.workspace_id=p_workspace_id and seq.workpiece_id=p_workpiece_id and opportunity.source_status='linked'
   and opportunity.source_revision_id=(p_members->0->>'source_revision_id')::uuid
   and opportunity.workpiece_source_link_revision_id=(p_members->0->>'workpiece_source_link_revision_id')::uuid
 )then return jsonb_build_object('disposition','attribution_family_authority_conflict');end if;
 if p_relationship='direct'and p_artifact_family='reference_visual'and not exists(
  select 1 from tongs.reference_visual_plan_sequences seq
  join lateral(select source_set.id from tongs.reference_visual_source_set_revisions source_set where source_set.workspace_id=p_workspace_id and source_set.workpiece_id=p_workpiece_id and source_set.plan_revision_id=seq.current_plan_revision_id and source_set.opportunity_id=p_opportunity_id order by source_set.revision desc limit 1)current_set on true
  join tongs.reference_visual_source_set_members member on member.source_set_revision_id=current_set.id
  where seq.workspace_id=p_workspace_id and seq.workpiece_id=p_workpiece_id
   and member.source_revision_id=(p_members->0->>'source_revision_id')::uuid
   and member.workpiece_source_link_revision_id=(p_members->0->>'workpiece_source_link_revision_id')::uuid
   and(select count(*)from tongs.reference_visual_source_set_members exact_count where exact_count.source_set_revision_id=current_set.id)=1
 )then return jsonb_build_object('disposition','attribution_family_authority_conflict');end if;
 immutable_hash:=encode(extensions.digest(convert_to(jsonb_build_object('workspace_id',p_workspace_id,'workpiece_id',p_workpiece_id,'family',p_artifact_family,'opportunity_id',p_opportunity_id,'script_approval_id',p_script_approval_id,'unified_operation',p_unified_plan_operation_id,'child_plan_revision_id',p_child_plan_revision_id,'state',p_state,'relationship',p_relationship,'rationale',coalesce(p_rationale,''),'members',p_members)::text,'UTF8'),'sha256'),'hex');
 insert into tongs.visual_source_attribution_revisions(workspace_id,workpiece_id,artifact_family,opportunity_id,script_approval_id,unified_plan_operation_id,child_plan_revision_id,revision,previous_revision_id,previous_revision,state,relationship,rationale,model_evidence_json,operation_id,operation_fingerprint,immutable_revision_hash,created_by)
 values(p_workspace_id,p_workpiece_id,p_artifact_family,p_opportunity_id,p_script_approval_id,p_unified_plan_operation_id,p_child_plan_revision_id,coalesce(current_row.revision,0)+1,current_row.id,current_row.revision,p_state,p_relationship,coalesce(p_rationale,''),coalesce(p_model_evidence_json,'{}'::jsonb),p_operation_id,p_operation_fingerprint,immutable_hash,p_actor_id)returning * into created;
 position:=0;for item in select value from jsonb_array_elements(p_members)loop position:=position+1;insert into tongs.visual_source_attribution_members(attribution_revision_id,workspace_id,workpiece_id,ordinal,role,source_revision_id,workpiece_source_link_revision_id)values(created.id,p_workspace_id,p_workpiece_id,position,item->>'role',(item->>'source_revision_id')::uuid,(item->>'workpiece_source_link_revision_id')::uuid);end loop;
 select coalesce(jsonb_agg(jsonb_build_object('ordinal',m.ordinal,'role',m.role,'source_revision_id',m.source_revision_id,'workpiece_source_link_revision_id',m.workpiece_source_link_revision_id)order by m.ordinal),'[]'::jsonb)into members_json from tongs.visual_source_attribution_members m where m.attribution_revision_id=created.id;
 return jsonb_build_object('disposition','committed','attribution_revision',to_jsonb(created),'members',members_json);
end$$;

create or replace function tongs.read_current_visual_source_attributions(p_workspace_id uuid,p_workpiece_id uuid)returns jsonb language sql stable security definer set search_path=pg_catalog,tongs as $$
 select case when not tongs.has_workspace_role(p_workspace_id,'viewer')then null else coalesce(jsonb_agg(jsonb_build_object('attribution_revision',to_jsonb(a),'sources',coalesce((select jsonb_agg(jsonb_build_object('ordinal',m.ordinal,'role',m.role,'source_revision_id',m.source_revision_id,'workpiece_source_link_revision_id',m.workpiece_source_link_revision_id,'title',s.title,'publisher',s.publisher,'source_type',s.source_type,'canonical_url',s.canonical_url)order by m.ordinal)from tongs.visual_source_attribution_members m join tongs.source_revisions s on s.id=m.source_revision_id where m.attribution_revision_id=a.id),'[]'::jsonb))order by a.artifact_family,a.opportunity_id),'[]'::jsonb)end
 from tongs.visual_source_attribution_revisions a where a.workspace_id=p_workspace_id and a.workpiece_id=p_workpiece_id and a.revision=(select max(x.revision)from tongs.visual_source_attribution_revisions x where x.workspace_id=a.workspace_id and x.workpiece_id=a.workpiece_id and x.artifact_family=a.artifact_family and x.opportunity_id=a.opportunity_id)
$$;

-- A creator resolution is one database transaction: the executable family
-- authority advances first, then attribution is appended against the exact
-- resulting child plan. Any disagreement or failure rolls the whole call back.
create or replace function tongs.resolve_visual_source_attribution(
 p_workspace_id uuid,p_workpiece_id uuid,p_artifact_family text,p_opportunity_id uuid,
 p_expected_attribution_revision bigint,p_expected_opportunity_revision_id uuid,p_expected_opportunity_revision bigint,
 p_source_revision_id uuid,p_workpiece_source_link_revision_id uuid,
 p_operation_id text,p_operation_fingerprint text,p_actor_id uuid
)returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $$
#variable_conflict use_column
declare current_attribution tongs.visual_source_attribution_revisions%rowtype;family_result jsonb;family_plan jsonb;family_opportunity jsonb;source_set_result jsonb;source_set_revision bigint:=0;members jsonb:='[]'::jsonb;attribution_result jsonb;child_plan_revision_id uuid;child_plan_revision bigint;
begin
 if not tongs.has_workspace_role(p_workspace_id,'editor')or auth.uid()is distinct from p_actor_id then raise exception 'workspace editor authority required' using errcode='42501';end if;
 if p_artifact_family not in('reference_clip','reference_visual')then return jsonb_build_object('disposition','unsupported_family');end if;
 if (p_source_revision_id is null)<>(p_workpiece_source_link_revision_id is null)then return jsonb_build_object('disposition','source_and_link_must_match');end if;
 perform pg_advisory_xact_lock(hashtextextended(p_operation_id,0));
 select * into current_attribution from tongs.visual_source_attribution_revisions where workspace_id=p_workspace_id and workpiece_id=p_workpiece_id and artifact_family=p_artifact_family and opportunity_id=p_opportunity_id order by revision desc limit 1 for update;
 if not found then return jsonb_build_object('disposition','attribution_required');end if;
 if current_attribution.revision<>p_expected_attribution_revision then return jsonb_build_object('disposition','attribution_revision_conflict','current_revision',current_attribution.revision);end if;
 if p_artifact_family='reference_clip'then
  family_result:=tongs.reassign_reference_clip_source(p_workspace_id,p_workpiece_id,p_opportunity_id,p_expected_opportunity_revision_id,p_expected_opportunity_revision,p_source_revision_id,p_workpiece_source_link_revision_id,p_operation_id||':family',p_operation_fingerprint,p_actor_id);
 else
  family_result:=tongs.reassign_reference_visual_source(p_workspace_id,p_workpiece_id,p_opportunity_id,p_expected_opportunity_revision_id,p_expected_opportunity_revision,p_source_revision_id,p_workpiece_source_link_revision_id,p_operation_id||':family',p_operation_fingerprint,p_actor_id);
 end if;
 if coalesce(family_result->>'disposition','')<>'committed'then return jsonb_build_object('disposition','family_authority_conflict','family_receipt',family_result);end if;
 family_plan:=family_result->'plan_revision';family_opportunity:=family_result->'opportunity_revision';
 begin child_plan_revision_id:=(family_plan->>'id')::uuid;child_plan_revision:=(family_plan->>'revision')::bigint;exception when others then return jsonb_build_object('disposition','family_receipt_invalid');end;
 if p_artifact_family='reference_visual'then
  select coalesce(max(revision),0)into source_set_revision from tongs.reference_visual_source_set_revisions where workspace_id=p_workspace_id and workpiece_id=p_workpiece_id and opportunity_id=p_opportunity_id and plan_revision_id=child_plan_revision_id;
  members:=case when p_source_revision_id is null then'[]'::jsonb else jsonb_build_array(jsonb_build_object('source_revision_id',p_source_revision_id,'workpiece_source_link_revision_id',p_workpiece_source_link_revision_id))end;
  source_set_result:=tongs.commit_reference_visual_source_set(p_workspace_id,p_workpiece_id,p_opportunity_id,members,child_plan_revision_id,child_plan_revision,source_set_revision,p_operation_id||':source-set',p_operation_fingerprint,p_actor_id);
  if coalesce(source_set_result->>'disposition','')<>'committed'then return jsonb_build_object('disposition','family_source_set_conflict','family_receipt',family_result,'source_set_receipt',source_set_result);end if;
 end if;
 members:=case when p_source_revision_id is null then'[]'::jsonb else jsonb_build_array(jsonb_build_object('role','direct_basis','source_revision_id',p_source_revision_id,'workpiece_source_link_revision_id',p_workpiece_source_link_revision_id))end;
 attribution_result:=tongs.commit_visual_source_attribution(p_workspace_id,p_workpiece_id,p_artifact_family,p_opportunity_id,current_attribution.script_approval_id,current_attribution.unified_plan_operation_id,child_plan_revision_id,case when p_source_revision_id is null then'none_known'else'creator_selected'end,case when p_source_revision_id is null then'none'else'direct'end,current_attribution.rationale,current_attribution.model_evidence_json,members,current_attribution.revision,p_operation_id||':attribution',p_operation_fingerprint,p_actor_id);
 if coalesce(attribution_result->>'disposition','')<>'committed'then raise exception 'visual attribution and family authority diverged' using errcode='P0001',detail=attribution_result::text;end if;
 return jsonb_build_object('disposition','committed','family_receipt',family_result,'source_set_receipt',source_set_result,'attribution_receipt',attribution_result,'opportunity_revision',family_opportunity);
end$$;
revoke all on function tongs.commit_visual_source_attribution(uuid,uuid,text,uuid,uuid,text,uuid,text,text,text,jsonb,jsonb,bigint,text,text,uuid)from public,anon;
grant execute on function tongs.commit_visual_source_attribution(uuid,uuid,text,uuid,uuid,text,uuid,text,text,text,jsonb,jsonb,bigint,text,text,uuid)to authenticated,service_role;
revoke all on function tongs.read_current_visual_source_attributions(uuid,uuid)from public,anon;
grant execute on function tongs.read_current_visual_source_attributions(uuid,uuid)to authenticated,service_role;
revoke all on function tongs.resolve_visual_source_attribution(uuid,uuid,text,uuid,bigint,uuid,bigint,uuid,uuid,text,text,uuid)from public,anon;
grant execute on function tongs.resolve_visual_source_attribution(uuid,uuid,text,uuid,bigint,uuid,bigint,uuid,uuid,text,text,uuid)to authenticated,service_role;
commit;
