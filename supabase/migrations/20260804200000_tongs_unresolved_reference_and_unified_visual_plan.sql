begin;

alter table tongs.reference_clip_opportunity_revisions
  alter column source_id drop not null,
  alter column source_revision_id drop not null,
  alter column source_revision drop not null,
  alter column workpiece_source_link_id drop not null,
  alter column workpiece_source_link_revision_id drop not null,
  alter column workpiece_source_link_revision drop not null,
  add column source_status text not null default 'linked',
  add column editorial_reason text,
  add column desired_material text,
  add column search_terms text[] not null default '{}';

alter table tongs.reference_clip_opportunity_revisions
  add constraint reference_clip_opportunity_source_status_check
    check(source_status in('unresolved','linked')),
  add constraint reference_clip_opportunity_source_evidence_check check(
    (source_status='unresolved' and source_id is null and source_revision_id is null and source_revision is null
      and workpiece_source_link_id is null and workpiece_source_link_revision_id is null and workpiece_source_link_revision is null)
    or
    (source_status='linked' and source_id is not null and source_revision_id is not null and source_revision is not null
      and workpiece_source_link_id is not null and workpiece_source_link_revision_id is not null and workpiece_source_link_revision is not null)
  ),
  add constraint reference_clip_opportunity_editorial_reason_check check(length(btrim(coalesce(editorial_reason,narrative_purpose)))>0),
  add constraint reference_clip_opportunity_desired_material_check check(length(btrim(coalesce(desired_material,creator_direction,narrative_purpose)))>0);

alter table tongs.reference_clip_operation_receipts
  drop constraint reference_clip_operation_receipts_operation_type_check,
  add constraint reference_clip_operation_receipts_operation_type_check check(operation_type in('plan_commit','source_fulfillment','candidate_commit','selection'));

create table tongs.unified_visual_plan_operations(
  operation_id text primary key,
  operation_fingerprint text not null check(operation_fingerprint~'^[0-9a-f]{64}$'),
  workspace_id uuid not null,
  workpiece_id uuid not null,
  script_approval_id uuid not null,
  script_approval_revision bigint not null,
  script_content_hash text not null check(script_content_hash~'^[0-9a-f]{64}$'),
  state text not null default 'pending' check(state in('pending','provider_completed','image_plan_committed','broll_plan_committed','reference_plan_committed','verified')),
  normalized_inputs_json jsonb not null,
  provider_response_json jsonb,
  provider_response_hash text check(provider_response_hash is null or provider_response_hash~'^[0-9a-f]{64}$'),
  image_map_revision_id uuid,
  image_map_revision bigint,
  broll_plan_revision_id uuid,
  broll_plan_revision bigint,
  reference_clip_plan_revision_id uuid,
  reference_clip_plan_revision bigint,
  failed_stage text,
  failure_code text,
  failure_message text,
  receipt_json jsonb,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key(workpiece_id,workspace_id) references tongs.episodes(id,workspace_id),
  foreign key(script_approval_id,workspace_id,workpiece_id,script_approval_revision)
    references tongs.script_approval_revisions(id,workspace_id,workpiece_id,approval_revision),
  check((provider_response_json is null)=(provider_response_hash is null)),
  check((state='verified')=(receipt_json is not null))
);

create or replace function tongs.reject_verified_unified_visual_plan_mutation() returns trigger
language plpgsql set search_path=pg_catalog,tongs as $$
begin
  if old.state='verified' then raise exception 'verified unified visual plan operation is immutable' using errcode='55000'; end if;
  if new.operation_id is distinct from old.operation_id or new.operation_fingerprint is distinct from old.operation_fingerprint
    or new.workspace_id is distinct from old.workspace_id or new.workpiece_id is distinct from old.workpiece_id
    or new.script_approval_id is distinct from old.script_approval_id or new.script_approval_revision is distinct from old.script_approval_revision
    or new.created_by is distinct from old.created_by then
    raise exception 'unified visual plan operation identity is immutable' using errcode='55000';
  end if;
  return new;
end$$;
create trigger unified_visual_plan_operation_guard before update on tongs.unified_visual_plan_operations
for each row execute function tongs.reject_verified_unified_visual_plan_mutation();
create trigger unified_visual_plan_operation_no_delete before delete on tongs.unified_visual_plan_operations
for each row execute function tongs.reject_reference_clip_immutable_mutation();

create or replace function tongs.begin_unified_visual_plan(
  p_workspace_id uuid,p_workpiece_id uuid,p_script_approval_id uuid,
  p_expected_image_revision_id uuid,p_expected_image_revision bigint,
  p_expected_broll_revision_id uuid,p_expected_broll_revision bigint,
  p_expected_reference_revision_id uuid,p_expected_reference_revision bigint,
  p_normalized_inputs_json jsonb,p_operation_id text,p_operation_fingerprint text,p_actor_id uuid
) returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $$
declare op tongs.unified_visual_plan_operations%rowtype; approval tongs.script_approval_revisions%rowtype;
  image_seq tongs.workpiece_image_map_sequences%rowtype; broll_seq tongs.broll_plan_sequences%rowtype; ref_seq tongs.reference_clip_plan_sequences%rowtype;
begin
  if not tongs.has_workspace_role(p_workspace_id,'editor') then raise exception 'workspace editor authority required' using errcode='42501'; end if;
  select * into op from tongs.unified_visual_plan_operations where operation_id=p_operation_id for update;
  if found then
    if op.operation_fingerprint<>p_operation_fingerprint then return jsonb_build_object('disposition','operation_identity_conflict'); end if;
    return jsonb_build_object('disposition','replay','operation',to_jsonb(op));
  end if;
  select * into approval from tongs.script_approval_revisions where id=p_script_approval_id and workspace_id=p_workspace_id and workpiece_id=p_workpiece_id;
  if not found then return jsonb_build_object('disposition','script_revision_conflict'); end if;
  if not exists(select 1 from tongs.workpiece_script_approval_sequences where workspace_id=p_workspace_id and workpiece_id=p_workpiece_id and current_approval_id=approval.id) then
    return jsonb_build_object('disposition','script_revision_conflict');
  end if;
  select * into image_seq from tongs.workpiece_image_map_sequences where workspace_id=p_workspace_id and workpiece_id=p_workpiece_id;
  select * into broll_seq from tongs.broll_plan_sequences where workspace_id=p_workspace_id and workpiece_id=p_workpiece_id;
  select * into ref_seq from tongs.reference_clip_plan_sequences where workspace_id=p_workspace_id and workpiece_id=p_workpiece_id;
  if coalesce(image_seq.current_revision,0)<>p_expected_image_revision or image_seq.current_revision_id is distinct from p_expected_image_revision_id
    or coalesce(broll_seq.current_plan_revision,0)<>p_expected_broll_revision or broll_seq.current_plan_revision_id is distinct from p_expected_broll_revision_id
    or coalesce(ref_seq.current_plan_revision,0)<>p_expected_reference_revision or ref_seq.current_plan_revision_id is distinct from p_expected_reference_revision_id then
    return jsonb_build_object('disposition','child_revision_conflict');
  end if;
  insert into tongs.unified_visual_plan_operations(operation_id,operation_fingerprint,workspace_id,workpiece_id,script_approval_id,script_approval_revision,script_content_hash,normalized_inputs_json,created_by)
  values(p_operation_id,p_operation_fingerprint,p_workspace_id,p_workpiece_id,approval.id,approval.approval_revision,approval.script_content_hash,p_normalized_inputs_json,p_actor_id) returning * into op;
  return jsonb_build_object('disposition','reserved','operation',to_jsonb(op));
end$$;

create or replace function tongs.record_unified_visual_plan_provider_response(p_operation_id text,p_operation_fingerprint text,p_provider_response_json jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $$
declare op tongs.unified_visual_plan_operations%rowtype; h text;
begin
  select * into op from tongs.unified_visual_plan_operations where operation_id=p_operation_id for update;
  if not found or op.operation_fingerprint<>p_operation_fingerprint then return jsonb_build_object('disposition','operation_identity_conflict'); end if;
  if not tongs.has_workspace_role(op.workspace_id,'editor') then raise exception 'workspace editor authority required' using errcode='42501'; end if;
  if op.state<>'pending' then return jsonb_build_object('disposition','replay','operation',to_jsonb(op)); end if;
  h:=encode(extensions.digest(convert_to(p_provider_response_json::text,'UTF8'),'sha256'),'hex');
  update tongs.unified_visual_plan_operations set state='provider_completed',provider_response_json=p_provider_response_json,provider_response_hash=h,
    failed_stage=null,failure_code=null,failure_message=null,updated_at=now() where operation_id=p_operation_id returning * into op;
  return jsonb_build_object('disposition','provider_completed','operation',to_jsonb(op));
end$$;

create or replace function tongs.record_unified_visual_plan_child(
  p_operation_id text,p_operation_fingerprint text,p_child_kind text,p_revision_id uuid,p_revision bigint
) returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $$
declare op tongs.unified_visual_plan_operations%rowtype; expected_state text; next_state text; valid boolean:=false;
begin
  select * into op from tongs.unified_visual_plan_operations where operation_id=p_operation_id for update;
  if not found or op.operation_fingerprint<>p_operation_fingerprint then return jsonb_build_object('disposition','operation_identity_conflict'); end if;
  if not tongs.has_workspace_role(op.workspace_id,'editor') then raise exception 'workspace editor authority required' using errcode='42501'; end if;
  if op.state='verified' then return jsonb_build_object('disposition','replay','operation',to_jsonb(op)); end if;
  if p_child_kind='image' then expected_state:='provider_completed';next_state:='image_plan_committed';valid:=exists(select 1 from tongs.image_map_revisions where id=p_revision_id and workspace_id=op.workspace_id and workpiece_id=op.workpiece_id and revision=p_revision and source_script_approval_id=op.script_approval_id);
  elsif p_child_kind='broll' then expected_state:='image_plan_committed';next_state:='broll_plan_committed';valid:=exists(select 1 from tongs.broll_plan_revisions where id=p_revision_id and workspace_id=op.workspace_id and workpiece_id=op.workpiece_id and revision=p_revision and script_approval_id=op.script_approval_id);
  elsif p_child_kind='reference_clip' then expected_state:='broll_plan_committed';next_state:='reference_plan_committed';valid:=exists(select 1 from tongs.reference_clip_plan_revisions where id=p_revision_id and workspace_id=op.workspace_id and workpiece_id=op.workpiece_id and revision=p_revision and script_approval_id=op.script_approval_id);
  else return jsonb_build_object('disposition','invalid_child_kind'); end if;
  if op.state=next_state or (p_child_kind='image' and op.image_map_revision_id=p_revision_id) or (p_child_kind='broll' and op.broll_plan_revision_id=p_revision_id) or (p_child_kind='reference_clip' and op.reference_clip_plan_revision_id=p_revision_id) then return jsonb_build_object('disposition','replay','operation',to_jsonb(op)); end if;
  if op.state<>expected_state then return jsonb_build_object('disposition','stage_conflict','state',op.state); end if;
  if not valid then return jsonb_build_object('disposition','canonical_child_revision_required'); end if;
  update tongs.unified_visual_plan_operations set state=next_state,
    image_map_revision_id=case when p_child_kind='image' then p_revision_id else image_map_revision_id end,
    image_map_revision=case when p_child_kind='image' then p_revision else image_map_revision end,
    broll_plan_revision_id=case when p_child_kind='broll' then p_revision_id else broll_plan_revision_id end,
    broll_plan_revision=case when p_child_kind='broll' then p_revision else broll_plan_revision end,
    reference_clip_plan_revision_id=case when p_child_kind='reference_clip' then p_revision_id else reference_clip_plan_revision_id end,
    reference_clip_plan_revision=case when p_child_kind='reference_clip' then p_revision else reference_clip_plan_revision end,
    failed_stage=null,failure_code=null,failure_message=null,updated_at=now() where operation_id=p_operation_id returning * into op;
  return jsonb_build_object('disposition',next_state,'operation',to_jsonb(op));
end$$;

create or replace function tongs.verify_unified_visual_plan(p_operation_id text,p_operation_fingerprint text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $$
declare op tongs.unified_visual_plan_operations%rowtype; receipt jsonb;
begin
  select * into op from tongs.unified_visual_plan_operations where operation_id=p_operation_id for update;
  if not found or op.operation_fingerprint<>p_operation_fingerprint then return jsonb_build_object('disposition','operation_identity_conflict'); end if;
  if not tongs.has_workspace_role(op.workspace_id,'editor') then raise exception 'workspace editor authority required' using errcode='42501'; end if;
  if op.state='verified' then return op.receipt_json; end if;
  if op.state<>'reference_plan_committed' then return jsonb_build_object('disposition','stage_conflict','state',op.state); end if;
  if not exists(select 1 from tongs.workpiece_image_map_sequences where workspace_id=op.workspace_id and workpiece_id=op.workpiece_id and current_revision_id=op.image_map_revision_id)
    or not exists(select 1 from tongs.broll_plan_sequences where workspace_id=op.workspace_id and workpiece_id=op.workpiece_id and current_plan_revision_id=op.broll_plan_revision_id)
    or not exists(select 1 from tongs.reference_clip_plan_sequences where workspace_id=op.workspace_id and workpiece_id=op.workpiece_id and current_plan_revision_id=op.reference_clip_plan_revision_id) then
    return jsonb_build_object('disposition','child_revision_no_longer_current');
  end if;
  receipt:=jsonb_build_object('disposition','verified','operation_id',op.operation_id,'operation_fingerprint',op.operation_fingerprint,
    'script_approval_id',op.script_approval_id,'script_approval_revision',op.script_approval_revision,'script_content_hash',op.script_content_hash,
    'provider_response_hash',op.provider_response_hash,
    'image_map_revision_id',op.image_map_revision_id,'image_map_revision',op.image_map_revision,
    'broll_plan_revision_id',op.broll_plan_revision_id,'broll_plan_revision',op.broll_plan_revision,
    'reference_clip_plan_revision_id',op.reference_clip_plan_revision_id,'reference_clip_plan_revision',op.reference_clip_plan_revision);
  update tongs.unified_visual_plan_operations set state='verified',receipt_json=receipt,failed_stage=null,failure_code=null,failure_message=null,updated_at=now() where operation_id=p_operation_id;
  return receipt;
end$$;

create or replace function tongs.fail_unified_visual_plan(p_operation_id text,p_operation_fingerprint text,p_failed_stage text,p_failure_code text,p_failure_message text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $$
declare op tongs.unified_visual_plan_operations%rowtype;
begin
  select * into op from tongs.unified_visual_plan_operations where operation_id=p_operation_id for update;
  if not found or op.operation_fingerprint<>p_operation_fingerprint then return jsonb_build_object('disposition','operation_identity_conflict'); end if;
  if not tongs.has_workspace_role(op.workspace_id,'editor') then raise exception 'workspace editor authority required' using errcode='42501'; end if;
  if op.state='verified' then return op.receipt_json; end if;
  update tongs.unified_visual_plan_operations set failed_stage=p_failed_stage,failure_code=p_failure_code,failure_message=p_failure_message,updated_at=now() where operation_id=p_operation_id returning * into op;
  return jsonb_build_object('disposition','failed','operation',to_jsonb(op));
end$$;

create or replace function tongs.read_unified_visual_plan_operation(p_workspace_id uuid,p_operation_id text)
returns jsonb language sql stable security definer set search_path=pg_catalog,tongs as $$
select case when not tongs.has_workspace_role(p_workspace_id,'viewer') then null else(select to_jsonb(o) from tongs.unified_visual_plan_operations o where o.workspace_id=p_workspace_id and o.operation_id=p_operation_id) end
$$;

create or replace function tongs.fulfill_reference_clip_opportunity(
  p_workspace_id uuid,p_workpiece_id uuid,p_opportunity_id uuid,p_expected_opportunity_revision_id uuid,p_expected_opportunity_revision bigint,
  p_source_revision_id uuid,p_workpiece_source_link_revision_id uuid,p_operation_id text,p_operation_fingerprint text,p_actor_id uuid
) returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $$
declare seq tongs.reference_clip_plan_sequences%rowtype; membership tongs.reference_clip_plan_membership%rowtype; old tongs.reference_clip_opportunity_revisions%rowtype;
  src tongs.source_revisions%rowtype; lnk tongs.workpiece_source_link_revisions%rowtype; plan tongs.reference_clip_plan_revisions%rowtype; next_plan tongs.reference_clip_plan_revisions%rowtype;
  next_op tongs.reference_clip_opportunity_revisions%rowtype; r record; h text; ih text; result jsonb; prior jsonb;
begin
  if not tongs.has_workspace_role(p_workspace_id,'editor') then raise exception 'workspace editor authority required' using errcode='42501'; end if;
  select receipt_json into prior from tongs.reference_clip_operation_receipts where operation_id=p_operation_id and operation_fingerprint=p_operation_fingerprint;if found then return prior;end if;
  if exists(select 1 from tongs.reference_clip_operation_receipts where operation_id=p_operation_id) then return jsonb_build_object('disposition','operation_identity_conflict');end if;
  select * into seq from tongs.reference_clip_plan_sequences where workspace_id=p_workspace_id and workpiece_id=p_workpiece_id for update;
  select * into membership from tongs.reference_clip_plan_membership where plan_revision_id=seq.current_plan_revision_id and opportunity_id=p_opportunity_id;
  if not found or membership.opportunity_revision_id is distinct from p_expected_opportunity_revision_id or membership.opportunity_revision<>p_expected_opportunity_revision then return jsonb_build_object('disposition','opportunity_revision_conflict'); end if;
  select * into old from tongs.reference_clip_opportunity_revisions where id=membership.opportunity_revision_id;
  if old.source_status<>'unresolved' then return jsonb_build_object('disposition','source_already_linked'); end if;
  select * into src from tongs.source_revisions where id=p_source_revision_id and workspace_id=p_workspace_id;
  select * into lnk from tongs.workpiece_source_link_revisions where id=p_workpiece_source_link_revision_id and workspace_id=p_workspace_id and workpiece_id=p_workpiece_id and source_revision_id=src.id;
  if src.id is null or lnk.id is null then return jsonb_build_object('disposition','exact_source_and_link_required'); end if;
  select * into plan from tongs.reference_clip_plan_revisions where id=seq.current_plan_revision_id;
  h:=encode(extensions.digest(convert_to(jsonb_build_object('previous_plan',plan.content_hash,'fulfilled_opportunity',old.opportunity_id,'source_revision',src.id,'source_link_revision',lnk.id)::text,'UTF8'),'sha256'),'hex');
  ih:=encode(extensions.digest(convert_to(jsonb_build_object('hash',h,'revision',plan.revision+1,'previous',plan.id)::text,'UTF8'),'sha256'),'hex');
  insert into tongs.reference_clip_plan_revisions(workspace_id,workpiece_id,revision,previous_revision_id,previous_revision,script_approval_id,script_approval_revision,script_content_hash,contract_version,content_hash,immutable_revision_hash,created_by)
    values(p_workspace_id,p_workpiece_id,plan.revision+1,plan.id,plan.revision,plan.script_approval_id,plan.script_approval_revision,plan.script_content_hash,plan.contract_version,h,ih,p_actor_id) returning * into next_plan;
  h:=encode(extensions.digest(convert_to(jsonb_build_object('previous',old.content_hash,'source_revision',src.id,'source_link_revision',lnk.id)::text,'UTF8'),'sha256'),'hex');
  ih:=encode(extensions.digest(convert_to(jsonb_build_object('hash',h,'plan',next_plan.id,'opportunity',old.opportunity_id,'revision',old.revision+1)::text,'UTF8'),'sha256'),'hex');
  insert into tongs.reference_clip_opportunity_revisions(opportunity_id,workspace_id,workpiece_id,revision,previous_revision_id,previous_revision,source_plan_revision_id,source_plan_revision,script_approval_id,script_approval_revision,source_status,source_id,source_revision_id,source_revision,workpiece_source_link_id,workpiece_source_link_revision_id,workpiece_source_link_revision,context_before,context_focus,context_after,citation_anchor_json,media_range_json,narrative_purpose,editorial_reason,desired_material,search_terms,placement_hint,duration_target_ms,creator_direction,content_hash,immutable_revision_hash,created_by)
    values(old.opportunity_id,p_workspace_id,p_workpiece_id,old.revision+1,old.id,old.revision,next_plan.id,next_plan.revision,old.script_approval_id,old.script_approval_revision,'linked',src.source_id,src.id,src.revision,lnk.link_id,lnk.id,lnk.revision,old.context_before,old.context_focus,old.context_after,old.citation_anchor_json,lnk.media_range_json,old.narrative_purpose,old.editorial_reason,old.desired_material,old.search_terms,old.placement_hint,old.duration_target_ms,old.creator_direction,h,ih,p_actor_id) returning * into next_op;
  for r in select * from tongs.reference_clip_plan_membership where plan_revision_id=plan.id order by ordinal loop
    insert into tongs.reference_clip_plan_membership(plan_revision_id,workspace_id,workpiece_id,plan_revision,ordinal,opportunity_id,opportunity_revision_id,opportunity_revision)
    values(next_plan.id,p_workspace_id,p_workpiece_id,next_plan.revision,r.ordinal,r.opportunity_id,case when r.opportunity_id=old.opportunity_id then next_op.id else r.opportunity_revision_id end,case when r.opportunity_id=old.opportunity_id then next_op.revision else r.opportunity_revision end);
  end loop;
  update tongs.reference_clip_plan_sequences set current_plan_revision_id=next_plan.id,current_plan_revision=next_plan.revision,updated_at=now() where workspace_id=p_workspace_id and workpiece_id=p_workpiece_id;
  result:=jsonb_build_object('disposition','committed','plan_revision',to_jsonb(next_plan),'opportunity_revision',to_jsonb(next_op));
  insert into tongs.reference_clip_operation_receipts(operation_id,operation_fingerprint,operation_type,workspace_id,workpiece_id,opportunity_id,state,result_plan_revision_id,receipt_json,created_by)
    values(p_operation_id,p_operation_fingerprint,'source_fulfillment',p_workspace_id,p_workpiece_id,p_opportunity_id,'committed',next_plan.id,result,p_actor_id);
  return result;
end$$;

-- The plan RPC now accepts source-less editorial opportunities. Linked opportunities still require exact canonical evidence.
create or replace function tongs.commit_reference_clip_plan(p_workspace_id uuid,p_workpiece_id uuid,p_expected_revision_id uuid,p_expected_revision bigint,p_script_approval_id uuid,p_contract_version text,p_opportunities jsonb,p_operation_id text,p_operation_fingerprint text,p_actor_id uuid) returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $$
declare s tongs.reference_clip_plan_sequences%rowtype;a tongs.script_approval_revisions%rowtype;p tongs.reference_clip_plan_revisions%rowtype;o jsonb;r tongs.reference_clip_opportunity_revisions%rowtype;prev tongs.reference_clip_opportunity_revisions%rowtype;src tongs.source_revisions%rowtype;lnk tongs.workpiece_source_link_revisions%rowtype;oid uuid;status text;h text;ih text;i int:=0;prior jsonb;result jsonb;
begin
 if not tongs.has_workspace_role(p_workspace_id,'editor') then raise exception 'workspace editor authority required' using errcode='42501';end if;
 select receipt_json into prior from tongs.reference_clip_operation_receipts where operation_id=p_operation_id and operation_fingerprint=p_operation_fingerprint;if found then return prior;end if;
 if exists(select 1 from tongs.reference_clip_operation_receipts where operation_id=p_operation_id) then return jsonb_build_object('disposition','operation_identity_conflict');end if;
 if jsonb_typeof(p_opportunities)<>'array' then return jsonb_build_object('disposition','opportunities_required');end if;
 insert into tongs.reference_clip_plan_sequences(workspace_id,workpiece_id) values(p_workspace_id,p_workpiece_id) on conflict do nothing;select * into s from tongs.reference_clip_plan_sequences where workspace_id=p_workspace_id and workpiece_id=p_workpiece_id for update;
 if s.current_plan_revision<>p_expected_revision or s.current_plan_revision_id is distinct from p_expected_revision_id then return jsonb_build_object('disposition','plan_revision_conflict','current_revision_id',s.current_plan_revision_id,'current_revision',s.current_plan_revision);end if;
 select * into a from tongs.script_approval_revisions where id=p_script_approval_id and workspace_id=p_workspace_id and workpiece_id=p_workpiece_id;if not found then return jsonb_build_object('disposition','script_revision_conflict');end if;
 h:=encode(extensions.digest(convert_to(jsonb_build_object('script',a.script_content_hash,'contract',p_contract_version,'opportunities',p_opportunities)::text,'UTF8'),'sha256'),'hex');ih:=encode(extensions.digest(convert_to(jsonb_build_object('hash',h,'revision',s.current_plan_revision+1,'previous',s.current_plan_revision_id)::text,'UTF8'),'sha256'),'hex');
 insert into tongs.reference_clip_plan_revisions(workspace_id,workpiece_id,revision,previous_revision_id,previous_revision,script_approval_id,script_approval_revision,script_content_hash,contract_version,content_hash,immutable_revision_hash,created_by) values(p_workspace_id,p_workpiece_id,s.current_plan_revision+1,s.current_plan_revision_id,nullif(s.current_plan_revision,0),a.id,a.approval_revision,a.script_content_hash,p_contract_version,h,ih,p_actor_id) returning * into p;
 for o in select value from jsonb_array_elements(p_opportunities) loop
  i:=i+1;oid:=coalesce(nullif(o->>'opportunity_id','')::uuid,gen_random_uuid());status:=coalesce(nullif(o->>'source_status',''),case when nullif(o->>'source_revision_id','') is not null then 'linked' else 'unresolved' end);
  src:=null;lnk:=null;
  if status='linked' then select * into src from tongs.source_revisions where id=(o->>'source_revision_id')::uuid and workspace_id=p_workspace_id;select * into lnk from tongs.workpiece_source_link_revisions where id=(o->>'workpiece_source_link_revision_id')::uuid and workspace_id=p_workspace_id and workpiece_id=p_workpiece_id and source_revision_id=src.id;if src.id is null or lnk.id is null then raise exception 'exact Source revision and workpiece link required';end if;
  elsif status<>'unresolved' then raise exception 'invalid source_status'; end if;
  select * into prev from tongs.reference_clip_opportunity_revisions where workspace_id=p_workspace_id and workpiece_id=p_workpiece_id and opportunity_id=oid order by revision desc limit 1;
  h:=encode(extensions.digest(convert_to(o::text,'UTF8'),'sha256'),'hex');ih:=encode(extensions.digest(convert_to(jsonb_build_object('hash',h,'plan',p.id,'opportunity',oid,'revision',coalesce(prev.revision,0)+1)::text,'UTF8'),'sha256'),'hex');
  insert into tongs.reference_clip_opportunity_revisions(opportunity_id,workspace_id,workpiece_id,revision,previous_revision_id,previous_revision,source_plan_revision_id,source_plan_revision,script_approval_id,script_approval_revision,source_status,source_id,source_revision_id,source_revision,workpiece_source_link_id,workpiece_source_link_revision_id,workpiece_source_link_revision,context_before,context_focus,context_after,citation_anchor_json,media_range_json,narrative_purpose,editorial_reason,desired_material,search_terms,placement_hint,duration_target_ms,creator_direction,content_hash,immutable_revision_hash,created_by)
  values(oid,p_workspace_id,p_workpiece_id,coalesce(prev.revision,0)+1,prev.id,prev.revision,p.id,p.revision,a.id,a.approval_revision,status,src.source_id,src.id,src.revision,lnk.link_id,lnk.id,lnk.revision,coalesce(o->>'context_before',''),o->>'context_focus',coalesce(o->>'context_after',''),coalesce(o->'citation_anchor','{}'),coalesce(o->'media_range','{}'),o->>'narrative_purpose',coalesce(o->>'editorial_reason',o->>'narrative_purpose'),coalesce(o->>'desired_material',o->>'creator_direction',o->>'narrative_purpose'),array(select jsonb_array_elements_text(coalesce(o->'search_terms','[]'))),o->>'placement_hint',coalesce((o->>'duration_target_ms')::bigint,5000),o->>'creator_direction',h,ih,p_actor_id) returning * into r;
  insert into tongs.reference_clip_plan_membership values(p.id,p_workspace_id,p_workpiece_id,p.revision,i,oid,r.id,r.revision);
 end loop;
 update tongs.reference_clip_plan_sequences set current_plan_revision_id=p.id,current_plan_revision=p.revision,updated_at=now() where workspace_id=p_workspace_id and workpiece_id=p_workpiece_id;
 result:=jsonb_build_object('disposition','committed','plan_revision',to_jsonb(p));insert into tongs.reference_clip_operation_receipts(operation_id,operation_fingerprint,operation_type,workspace_id,workpiece_id,state,result_plan_revision_id,receipt_json,created_by) values(p_operation_id,p_operation_fingerprint,'plan_commit',p_workspace_id,p_workpiece_id,'committed',p.id,result,p_actor_id);return result;
end$$;

create or replace function tongs.read_current_reference_clip_plan(p_workspace_id uuid,p_workpiece_id uuid) returns jsonb language sql stable security definer set search_path=pg_catalog,tongs as $$
select case when not tongs.has_workspace_role(p_workspace_id,'viewer') then null else(select jsonb_build_object('sequence',to_jsonb(s),'plan_revision',to_jsonb(p),'opportunities',coalesce((select jsonb_agg(jsonb_build_object('membership',to_jsonb(m),'opportunity_revision',to_jsonb(o),'source_revision',to_jsonb(sr),'source_link_revision',to_jsonb(lr),'candidates',coalesce((select jsonb_agg(to_jsonb(c) order by c.created_at) from tongs.reference_clip_candidate_revisions c where c.workspace_id=m.workspace_id and c.workpiece_id=m.workpiece_id and c.opportunity_id=m.opportunity_id and c.opportunity_revision_id=m.opportunity_revision_id),'[]'::jsonb),'selection',to_jsonb(sel)) order by m.ordinal) from tongs.reference_clip_plan_membership m join tongs.reference_clip_opportunity_revisions o on o.id=m.opportunity_revision_id left join tongs.source_revisions sr on sr.id=o.source_revision_id left join tongs.workpiece_source_link_revisions lr on lr.id=o.workpiece_source_link_revision_id left join lateral(select x.* from tongs.reference_clip_selections x where x.workspace_id=m.workspace_id and x.workpiece_id=m.workpiece_id and x.opportunity_id=m.opportunity_id and x.plan_revision_id=m.plan_revision_id order by x.revision desc limit 1)sel on true where m.plan_revision_id=s.current_plan_revision_id),'[]'::jsonb)) from tongs.reference_clip_plan_sequences s left join tongs.reference_clip_plan_revisions p on p.id=s.current_plan_revision_id where s.workspace_id=p_workspace_id and s.workpiece_id=p_workpiece_id)end
$$;

-- Unresolved opportunities cannot enter acquisition, candidate selection, or Hammer projection.
create or replace function tongs.read_reference_clip_visual_package(p_workspace_id uuid,p_workpiece_id uuid) returns jsonb language sql stable security definer set search_path=pg_catalog,tongs as $$
select case when not tongs.has_workspace_role(p_workspace_id,'viewer') then null else jsonb_build_object('contract_version','forge.reference-clips.hammer.v1','workspace_id',p_workspace_id,'workpiece_id',p_workpiece_id,'clips',coalesce((select jsonb_agg(jsonb_build_object('opportunity_id',o.opportunity_id,'placement_hint',o.placement_hint,'duration_target_ms',o.duration_target_ms,'script_anchor',o.citation_anchor_json,'source_revision_id',c.source_revision_id,'source_link_revision_id',c.workpiece_source_link_revision_id,'candidate_revision_id',c.id,'asset_id',c.asset_id,'asset_content_hash',c.asset_content_hash,'asset_path',c.asset_path,'storage_bucket',c.storage_bucket,'storage_key',c.storage_key,'rights',c.rights_evidence_json,'provenance',c.provenance_json) order by m.ordinal) from tongs.reference_clip_plan_sequences q join tongs.reference_clip_plan_membership m on m.plan_revision_id=q.current_plan_revision_id join tongs.reference_clip_opportunity_revisions o on o.id=m.opportunity_revision_id and o.source_status='linked' join lateral(select x.* from tongs.reference_clip_selections x where x.workspace_id=q.workspace_id and x.workpiece_id=q.workpiece_id and x.opportunity_id=m.opportunity_id and x.plan_revision_id=q.current_plan_revision_id order by x.revision desc limit 1)s on true join tongs.reference_clip_candidate_revisions c on c.id=s.candidate_revision_id where q.workspace_id=p_workspace_id and q.workpiece_id=p_workpiece_id),'[]'::jsonb)) end
$$;

create or replace function tongs.begin_reference_clip_acquisition(p_workspace_id uuid,p_workpiece_id uuid,p_plan_revision_id uuid,p_plan_revision bigint,p_opportunity_id uuid,p_opportunity_revision_id uuid,p_opportunity_revision bigint,p_acquisition_type text,p_inputs jsonb,p_operation_id text,p_operation_fingerprint text,p_actor_id uuid)returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $$
declare op tongs.reference_clip_acquisition_operations%rowtype;seq tongs.reference_clip_plan_sequences%rowtype;opportunity tongs.reference_clip_opportunity_revisions%rowtype;
begin
 if not tongs.has_workspace_role(p_workspace_id,'editor') or auth.uid() is distinct from p_actor_id then raise exception 'workspace editor authority required' using errcode='42501';end if;
 if p_acquisition_type not in('upload','external_fetch') then return jsonb_build_object('disposition','unsupported_acquisition_type');end if;
 perform pg_advisory_xact_lock(hashtextextended(p_operation_id,0));select * into op from tongs.reference_clip_acquisition_operations where operation_id=p_operation_id for update;
 if found then if op.operation_fingerprint<>p_operation_fingerprint or op.workspace_id<>p_workspace_id or op.workpiece_id<>p_workpiece_id or op.opportunity_revision_id<>p_opportunity_revision_id or op.acquisition_type<>p_acquisition_type then return jsonb_build_object('disposition','operation_identity_conflict');end if;return jsonb_build_object('disposition','replay','operation',to_jsonb(op));end if;
 select * into seq from tongs.reference_clip_plan_sequences where workspace_id=p_workspace_id and workpiece_id=p_workpiece_id for update;
 if seq.current_plan_revision_id is distinct from p_plan_revision_id or seq.current_plan_revision<>p_plan_revision then return jsonb_build_object('disposition','plan_revision_conflict');end if;
 perform 1 from tongs.reference_clip_plan_membership where plan_revision_id=p_plan_revision_id and opportunity_id=p_opportunity_id and opportunity_revision_id=p_opportunity_revision_id and opportunity_revision=p_opportunity_revision;
 if not found then return jsonb_build_object('disposition','opportunity_not_current');end if;
 select * into opportunity from tongs.reference_clip_opportunity_revisions where id=p_opportunity_revision_id;
 if opportunity.source_status<>'linked' then return jsonb_build_object('disposition','source_link_required');end if;
 insert into tongs.reference_clip_acquisition_operations(operation_id,operation_fingerprint,workspace_id,workpiece_id,plan_revision_id,plan_revision,opportunity_id,opportunity_revision_id,opportunity_revision,acquisition_type,state,normalized_inputs_json,created_by)values(p_operation_id,p_operation_fingerprint,p_workspace_id,p_workpiece_id,p_plan_revision_id,p_plan_revision,p_opportunity_id,p_opportunity_revision_id,p_opportunity_revision,p_acquisition_type,'pending',p_inputs,p_actor_id)returning * into op;
 return jsonb_build_object('disposition','reserved','operation',to_jsonb(op));
end$$;

alter table tongs.unified_visual_plan_operations enable row level security;
create policy unified_visual_plan_operations_viewer on tongs.unified_visual_plan_operations for select to authenticated using(tongs.has_workspace_role(workspace_id,'viewer'));
revoke all on tongs.unified_visual_plan_operations from public,anon,authenticated;
grant select on tongs.unified_visual_plan_operations to authenticated;
revoke all on function tongs.begin_unified_visual_plan(uuid,uuid,uuid,uuid,bigint,uuid,bigint,uuid,bigint,jsonb,text,text,uuid),tongs.record_unified_visual_plan_provider_response(text,text,jsonb),tongs.record_unified_visual_plan_child(text,text,text,uuid,bigint),tongs.verify_unified_visual_plan(text,text),tongs.fail_unified_visual_plan(text,text,text,text,text),tongs.fulfill_reference_clip_opportunity(uuid,uuid,uuid,uuid,bigint,uuid,uuid,text,text,uuid) from public,anon,authenticated;
grant execute on function tongs.begin_unified_visual_plan(uuid,uuid,uuid,uuid,bigint,uuid,bigint,uuid,bigint,jsonb,text,text,uuid),tongs.record_unified_visual_plan_provider_response(text,text,jsonb),tongs.record_unified_visual_plan_child(text,text,text,uuid,bigint),tongs.verify_unified_visual_plan(text,text),tongs.fail_unified_visual_plan(text,text,text,text,text),tongs.fulfill_reference_clip_opportunity(uuid,uuid,uuid,uuid,bigint,uuid,uuid,text,text,uuid),tongs.read_unified_visual_plan_operation(uuid,text) to authenticated,service_role;

comment on column tongs.reference_clip_opportunity_revisions.source_status is 'Editorial planning may be unresolved; fulfillment appends a linked immutable revision with exact Source evidence.';
comment on table tongs.unified_visual_plan_operations is 'Durable parent receipt proving image, B-roll, and Reference Clip plans were derived from one approved-script revision.';

commit;
