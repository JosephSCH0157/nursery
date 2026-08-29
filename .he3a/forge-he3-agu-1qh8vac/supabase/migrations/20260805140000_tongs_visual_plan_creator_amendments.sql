begin;

alter table tongs.reference_visual_opportunity_revisions
  add column opportunity_origin text not null default 'provider_proposed',
  add column derived_from_opportunity_revision_id uuid,
  add column creator_request_json jsonb not null default '{}'::jsonb,
  add constraint reference_visual_opportunity_origin_check
    check (opportunity_origin in ('provider_proposed','creator_retained','creator_added')),
  add constraint reference_visual_opportunity_lineage_fkey
    foreign key (derived_from_opportunity_revision_id)
    references tongs.reference_visual_opportunity_revisions(id),
  add constraint reference_visual_opportunity_creator_request_check
    check (jsonb_typeof(creator_request_json)='object');

alter table tongs.unified_visual_plan_operations
  add column child_membership_evidence_json jsonb not null default '{}'::jsonb
  check (jsonb_typeof(child_membership_evidence_json)='object');

alter table tongs.reference_visual_operation_receipts
  drop constraint reference_visual_operation_receipts_operation_type_check,
  add constraint reference_visual_operation_receipts_operation_type_check check(operation_type in(
    'plan_commit','source_fulfillment','evidence_commit','recipe_commit','rights_commit',
    'asset_restriction','sequence_commit','selection','creator_amendment'
  ));

comment on column tongs.reference_visual_opportunity_revisions.opportunity_origin is
  'Editorial provenance for this immutable opportunity revision. Historical rows are provider_proposed.';
comment on column tongs.reference_visual_opportunity_revisions.derived_from_opportunity_revision_id is
  'Optional immutable lineage to a prior canonical suggestion; it never reactivates the historical plan.';

create or replace function tongs.read_unified_visual_plan_operation(
  p_workspace_id uuid,p_workpiece_id uuid,p_operation_id text
) returns jsonb language sql stable security definer set search_path=pg_catalog,tongs as $$
  select case
    when not tongs.has_workspace_role(p_workspace_id,'editor') then null
    else (
      select to_jsonb(o)
      from tongs.unified_visual_plan_operations o
      where o.operation_id=p_operation_id
        and o.workspace_id=p_workspace_id
        and o.workpiece_id=p_workpiece_id
    )
  end
$$;

create or replace function tongs.append_reference_visual_opportunity(
  p_workspace_id uuid,
  p_workpiece_id uuid,
  p_expected_plan_revision_id uuid,
  p_expected_plan_revision bigint,
  p_script_approval_id uuid,
  p_script_approval_revision bigint,
  p_script_content_hash text,
  p_visual_subtype text,
  p_context_before text,
  p_context_focus text,
  p_context_after text,
  p_citation_anchor_json jsonb,
  p_editorial_reason text,
  p_desired_material text,
  p_search_terms jsonb,
  p_placement_hint text,
  p_duration_target_ms bigint,
  p_creator_direction text,
  p_derived_from_opportunity_revision_id uuid,
  p_creator_request_json jsonb,
  p_operation_id text,
  p_operation_fingerprint text,
  p_actor_id uuid
) returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $$
declare
  receipt tongs.reference_visual_operation_receipts%rowtype;
  seq tongs.reference_visual_plan_sequences%rowtype;
  current_plan tongs.reference_visual_plan_revisions%rowtype;
  approval tongs.script_approval_revisions%rowtype;
  next_plan tongs.reference_visual_plan_revisions%rowtype;
  opportunity tongs.reference_visual_opportunity_revisions%rowtype;
  member tongs.reference_visual_plan_membership%rowtype;
  next_ordinal integer;
  opportunity_id_value uuid:=gen_random_uuid();
  plan_content_hash text;
  plan_immutable_hash text;
  opportunity_content_hash text;
  opportunity_immutable_hash text;
  result jsonb;
begin
  if not tongs.has_workspace_role(p_workspace_id,'editor') or auth.uid() is distinct from p_actor_id then
    raise exception 'workspace editor authority required' using errcode='42501';
  end if;
  if p_operation_fingerprint !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('disposition','invalid_operation_fingerprint');
  end if;
  if p_visual_subtype not in ('archival_still','archival_sequence','timeline','document_excerpt','quote_card','stat_card','comparison','chart')
    or btrim(coalesce(p_context_focus,''))=''
    or btrim(coalesce(p_editorial_reason,''))=''
    or btrim(coalesce(p_desired_material,''))=''
    or btrim(coalesce(p_placement_hint,''))=''
    or p_duration_target_ms<=0
    or jsonb_typeof(coalesce(p_search_terms,'[]'::jsonb))<>'array'
    or jsonb_typeof(coalesce(p_citation_anchor_json,'{}'::jsonb))<>'object'
    or jsonb_typeof(coalesce(p_creator_request_json,'{}'::jsonb))<>'object' then
    return jsonb_build_object('disposition','invalid_creator_opportunity');
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_operation_id,0));
  select * into receipt from tongs.reference_visual_operation_receipts where operation_id=p_operation_id;
  if found then
    if receipt.operation_fingerprint<>p_operation_fingerprint then
      return jsonb_build_object('disposition','operation_identity_conflict');
    end if;
    return receipt.receipt_json;
  end if;

  select * into seq from tongs.reference_visual_plan_sequences
    where workspace_id=p_workspace_id and workpiece_id=p_workpiece_id for update;
  if not found or seq.current_plan_revision_id is distinct from p_expected_plan_revision_id
    or seq.current_plan_revision<>p_expected_plan_revision then
    return jsonb_build_object('disposition','plan_revision_conflict',
      'current_revision_id',seq.current_plan_revision_id,'current_revision',coalesce(seq.current_plan_revision,0));
  end if;
  select * into current_plan from tongs.reference_visual_plan_revisions where id=seq.current_plan_revision_id;
  select * into approval from tongs.script_approval_revisions
    where id=p_script_approval_id and workspace_id=p_workspace_id and workpiece_id=p_workpiece_id;
  if not found or approval.approval_revision<>p_script_approval_revision
    or approval.script_content_hash<>p_script_content_hash
    or current_plan.script_approval_id<>approval.id
    or current_plan.script_approval_revision<>approval.approval_revision
    or current_plan.script_content_hash<>approval.script_content_hash
    or not exists (
      select 1 from tongs.workpiece_script_approval_sequences s
      where s.workspace_id=p_workspace_id and s.workpiece_id=p_workpiece_id and s.current_approval_id=approval.id
    ) then
    return jsonb_build_object('disposition','script_revision_conflict');
  end if;
  if strpos(approval.script_text,p_context_focus)=0 then
    return jsonb_build_object('disposition','script_anchor_unresolved');
  end if;
  if p_derived_from_opportunity_revision_id is not null then
    perform 1 from tongs.reference_visual_opportunity_revisions
      where id=p_derived_from_opportunity_revision_id
        and workspace_id=p_workspace_id and workpiece_id=p_workpiece_id
        and script_approval_id=approval.id and script_approval_revision=approval.approval_revision;
    if not found then return jsonb_build_object('disposition','historical_opportunity_not_found'); end if;
  end if;

  opportunity_content_hash:=encode(extensions.digest(convert_to(jsonb_strip_nulls(jsonb_build_object(
    'origin','creator_added','derived_from',p_derived_from_opportunity_revision_id,
    'script_approval_id',approval.id,'script_approval_revision',approval.approval_revision,
    'script_content_hash',approval.script_content_hash,'visual_subtype',p_visual_subtype,
    'context_before',coalesce(p_context_before,''),'context_focus',p_context_focus,
    'context_after',coalesce(p_context_after,''),'citation_anchor',coalesce(p_citation_anchor_json,'{}'::jsonb),
    'editorial_reason',p_editorial_reason,'desired_material',p_desired_material,
    'search_terms',coalesce(p_search_terms,'[]'::jsonb),'placement_hint',p_placement_hint,
    'duration_target_ms',p_duration_target_ms,'creator_direction',p_creator_direction,
    'creator_request',coalesce(p_creator_request_json,'{}'::jsonb)
  ))::text,'UTF8'),'sha256'),'hex');
  plan_content_hash:=encode(extensions.digest(convert_to(jsonb_build_object(
    'previous_plan_content_hash',current_plan.content_hash,
    'creator_added_opportunity_content_hash',opportunity_content_hash
  )::text,'UTF8'),'sha256'),'hex');
  plan_immutable_hash:=encode(extensions.digest(convert_to(jsonb_build_object(
    'content_hash',plan_content_hash,'revision',current_plan.revision+1,'previous_revision_id',current_plan.id
  )::text,'UTF8'),'sha256'),'hex');

  insert into tongs.reference_visual_plan_revisions(
    workspace_id,workpiece_id,revision,previous_revision_id,previous_revision,
    script_approval_id,script_approval_revision,script_content_hash,contract_version,
    content_hash,immutable_revision_hash,created_by
  ) values(
    p_workspace_id,p_workpiece_id,current_plan.revision+1,current_plan.id,current_plan.revision,
    approval.id,approval.approval_revision,approval.script_content_hash,'forge.reference-visual.creator-amendment.v1',
    plan_content_hash,plan_immutable_hash,p_actor_id
  ) returning * into next_plan;

  opportunity_immutable_hash:=encode(extensions.digest(convert_to(jsonb_build_object(
    'content_hash',opportunity_content_hash,'opportunity_id',opportunity_id_value,'revision',1,
    'source_plan_revision_id',next_plan.id
  )::text,'UTF8'),'sha256'),'hex');
  insert into tongs.reference_visual_opportunity_revisions(
    opportunity_id,workspace_id,workpiece_id,revision,source_plan_revision_id,source_plan_revision,
    script_approval_id,script_approval_revision,source_status,visual_subtype,
    context_before,context_focus,context_after,citation_anchor_json,document_locator_json,media_range_json,
    editorial_reason,desired_material,search_terms,placement_hint,duration_target_ms,creator_direction,
    content_hash,immutable_revision_hash,created_by,opportunity_origin,
    derived_from_opportunity_revision_id,creator_request_json
  ) values(
    opportunity_id_value,p_workspace_id,p_workpiece_id,1,next_plan.id,next_plan.revision,
    approval.id,approval.approval_revision,'unresolved',p_visual_subtype,
    coalesce(p_context_before,''),p_context_focus,coalesce(p_context_after,''),coalesce(p_citation_anchor_json,'{}'::jsonb),'{}'::jsonb,'{}'::jsonb,
    p_editorial_reason,p_desired_material,coalesce(p_search_terms,'[]'::jsonb),p_placement_hint,p_duration_target_ms,p_creator_direction,
    opportunity_content_hash,opportunity_immutable_hash,p_actor_id,'creator_added',
    p_derived_from_opportunity_revision_id,coalesce(p_creator_request_json,'{}'::jsonb)
  ) returning * into opportunity;

  next_ordinal:=0;
  for member in select * from tongs.reference_visual_plan_membership
    where plan_revision_id=current_plan.id order by ordinal loop
    insert into tongs.reference_visual_plan_membership
      values(next_plan.id,p_workspace_id,p_workpiece_id,next_plan.revision,next_ordinal,
        member.opportunity_id,member.opportunity_revision_id,member.opportunity_revision);
    next_ordinal:=next_ordinal+1;
  end loop;
  insert into tongs.reference_visual_plan_membership
    values(next_plan.id,p_workspace_id,p_workpiece_id,next_plan.revision,next_ordinal,
      opportunity.opportunity_id,opportunity.id,opportunity.revision);
  update tongs.reference_visual_plan_sequences set
    current_plan_revision_id=next_plan.id,current_plan_revision=next_plan.revision,updated_at=now()
    where workspace_id=p_workspace_id and workpiece_id=p_workpiece_id;

  result:=jsonb_build_object(
    'disposition','committed','operation_id',p_operation_id,'operation_fingerprint',p_operation_fingerprint,
    'plan_revision',to_jsonb(next_plan),'opportunity_revision',to_jsonb(opportunity),
    'preserved_opportunity_count',next_ordinal,'provider_request_performed',false
  );
  insert into tongs.reference_visual_operation_receipts(
    operation_id,operation_fingerprint,operation_type,workspace_id,workpiece_id,state,result_revision_id,receipt_json,created_by,created_at
  ) values(
    p_operation_id,p_operation_fingerprint,'creator_amendment',p_workspace_id,p_workpiece_id,
    'committed',opportunity.id,result,p_actor_id,now()
  );
  return result;
end$$;

create or replace function tongs.retain_unified_visual_plan_selections(
  p_operation_id text,p_operation_fingerprint text,p_child_kind text,p_provider_plan_revision_id uuid
) returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $$
declare
  op tongs.unified_visual_plan_operations%rowtype;
  approval tongs.script_approval_revisions%rowtype;
  retained jsonb:='[]'::jsonb;
  retained_count integer:=0;
  result jsonb;
  bseq tongs.broll_plan_sequences%rowtype; bp tongs.broll_plan_revisions%rowtype; bnext tongs.broll_plan_revisions%rowtype;
  bs tongs.broll_selections%rowtype; bprev tongs.broll_selections%rowtype; bm tongs.broll_plan_beat_membership%rowtype; bord integer;
  rseq tongs.reference_clip_plan_sequences%rowtype; rp tongs.reference_clip_plan_revisions%rowtype; rnext tongs.reference_clip_plan_revisions%rowtype;
  rs tongs.reference_clip_selections%rowtype; rprev tongs.reference_clip_selections%rowtype; rm tongs.reference_clip_plan_membership%rowtype; rord integer;
  vseq tongs.reference_visual_plan_sequences%rowtype; vp tongs.reference_visual_plan_revisions%rowtype; vnext tongs.reference_visual_plan_revisions%rowtype;
  vs tongs.reference_visual_selections%rowtype; vprev tongs.reference_visual_selections%rowtype; vm tongs.reference_visual_plan_membership%rowtype; vord integer;
  iseq tongs.workpiece_image_map_sequences%rowtype; ip tongs.image_map_revisions%rowtype; inext tongs.image_map_revisions%rowtype;
  retained_entries jsonb:='[]'::jsonb; next_document jsonb; semantic_hash text;
  h text; ih text; selection_fingerprint text;
  original_provider_plan_revision_id uuid:=p_provider_plan_revision_id;
begin
  select * into op from tongs.unified_visual_plan_operations where operation_id=p_operation_id for update;
  if not found or op.operation_fingerprint<>p_operation_fingerprint then return jsonb_build_object('disposition','operation_identity_conflict'); end if;
  if not tongs.has_workspace_role(op.workspace_id,'editor') then raise exception 'workspace editor authority required' using errcode='42501'; end if;
  if op.child_membership_evidence_json ? p_child_kind then
    if op.child_membership_evidence_json->p_child_kind->>'provider_plan_revision_id'<>p_provider_plan_revision_id::text then return jsonb_build_object('disposition','retention_identity_conflict');end if;
    return jsonb_build_object('disposition','replay','revision_id',op.child_membership_evidence_json->p_child_kind->>'final_plan_revision_id','retained_count',jsonb_array_length(coalesce(op.child_membership_evidence_json->p_child_kind->'creator_retained','[]'::jsonb)),'membership_evidence',op.child_membership_evidence_json);
  end if;
  select * into approval from tongs.script_approval_revisions where id=op.script_approval_id;

  if p_child_kind='broll' then
    select * into bseq from tongs.broll_plan_sequences where workspace_id=op.workspace_id and workpiece_id=op.workpiece_id for update;
    if bseq.current_plan_revision_id is distinct from p_provider_plan_revision_id then return jsonb_build_object('disposition','provider_child_not_current'); end if;
    select * into bp from tongs.broll_plan_revisions where id=p_provider_plan_revision_id;
    select coalesce(jsonb_agg(jsonb_build_object('beat_id',x.beat_id,'selection_id',x.id) order by x.revision),'[]'::jsonb),count(*)
      into retained,retained_count from (
        select distinct on (s.beat_id) s.* from tongs.broll_selections s
        join tongs.broll_beat_revisions br on br.id=s.beat_revision_id
        where s.workspace_id=op.workspace_id and s.workpiece_id=op.workpiece_id and s.decision='selected'
          and strpos(approval.script_text,br.context_focus)>0
          and not exists(select 1 from tongs.broll_plan_beat_membership m where m.plan_revision_id=bp.id and m.beat_id=s.beat_id)
        order by s.beat_id,s.revision desc
      )x;
    if retained_count>0 then
      h:=encode(extensions.digest(convert_to(jsonb_build_object('provider_plan',bp.content_hash,'creator_retained',retained)::text,'UTF8'),'sha256'),'hex');
      ih:=encode(extensions.digest(convert_to(jsonb_build_object('content_hash',h,'revision',bp.revision+1,'previous_revision_id',bp.id)::text,'UTF8'),'sha256'),'hex');
      insert into tongs.broll_plan_revisions(workspace_id,workpiece_id,revision,previous_revision_id,previous_revision,script_approval_id,script_approval_revision,script_content_hash,source_context_contract_version,content_hash,immutable_revision_hash,created_by)
        values(op.workspace_id,op.workpiece_id,bp.revision+1,bp.id,bp.revision,bp.script_approval_id,bp.script_approval_revision,bp.script_content_hash,'forge.unified-visual-plan.retained.v1',h,ih,op.created_by) returning * into bnext;
      bord:=1;for bm in select * from tongs.broll_plan_beat_membership where plan_revision_id=bp.id order by ordinal loop insert into tongs.broll_plan_beat_membership values(bnext.id,op.workspace_id,op.workpiece_id,bnext.revision,bord,bm.beat_id,bm.beat_revision_id,bm.beat_revision);bord:=bord+1;end loop;
      for bs in select distinct on (s.beat_id)s.* from tongs.broll_selections s join tongs.broll_beat_revisions br on br.id=s.beat_revision_id where s.workspace_id=op.workspace_id and s.workpiece_id=op.workpiece_id and s.decision='selected' and strpos(approval.script_text,br.context_focus)>0 and not exists(select 1 from tongs.broll_plan_beat_membership m where m.plan_revision_id=bp.id and m.beat_id=s.beat_id) order by s.beat_id,s.revision desc loop
        insert into tongs.broll_plan_beat_membership values(bnext.id,op.workspace_id,op.workpiece_id,bnext.revision,bord,bs.beat_id,bs.beat_revision_id,bs.beat_revision);bord:=bord+1;
        select * into bprev from tongs.broll_selections where workspace_id=op.workspace_id and workpiece_id=op.workpiece_id order by revision desc limit 1;
        selection_fingerprint:=encode(extensions.digest(convert_to(jsonb_build_object('parent',op.operation_id,'retained_selection',bs.id,'plan',bnext.id)::text,'UTF8'),'sha256'),'hex');
        insert into tongs.broll_selections(workspace_id,workpiece_id,revision,previous_selection_id,previous_revision,plan_revision_id,plan_revision,beat_id,beat_revision_id,beat_revision,candidate_revision_id,candidate_revision,decision,operation_id,operation_fingerprint,created_by)
          values(op.workspace_id,op.workpiece_id,coalesce(bprev.revision,0)+1,bprev.id,bprev.revision,bnext.id,bnext.revision,bs.beat_id,bs.beat_revision_id,bs.beat_revision,bs.candidate_revision_id,bs.candidate_revision,'selected',op.operation_id||':retain:broll:'||bs.beat_id,selection_fingerprint,op.created_by);
      end loop;
      update tongs.broll_plan_sequences set current_plan_revision_id=bnext.id,current_plan_revision=bnext.revision,current_selection_revision=(select max(revision)from tongs.broll_selections where workspace_id=op.workspace_id and workpiece_id=op.workpiece_id),updated_at=now() where workspace_id=op.workspace_id and workpiece_id=op.workpiece_id;
      p_provider_plan_revision_id:=bnext.id;
    end if;
  elsif p_child_kind='reference_clip' then
    select * into rseq from tongs.reference_clip_plan_sequences where workspace_id=op.workspace_id and workpiece_id=op.workpiece_id for update;if rseq.current_plan_revision_id is distinct from p_provider_plan_revision_id then return jsonb_build_object('disposition','provider_child_not_current');end if;select * into rp from tongs.reference_clip_plan_revisions where id=p_provider_plan_revision_id;
    select coalesce(jsonb_agg(jsonb_build_object('opportunity_id',x.opportunity_id,'selection_id',x.id)order by x.revision),'[]'::jsonb),count(*) into retained,retained_count from(select distinct on(s.opportunity_id)s.* from tongs.reference_clip_selections s join tongs.reference_clip_opportunity_revisions o on o.id=s.opportunity_revision_id where s.workspace_id=op.workspace_id and s.workpiece_id=op.workpiece_id and strpos(approval.script_text,o.context_focus)>0 and not exists(select 1 from tongs.reference_clip_plan_membership m where m.plan_revision_id=rp.id and m.opportunity_id=s.opportunity_id)order by s.opportunity_id,s.revision desc)x;
    if retained_count>0 then
      h:=encode(extensions.digest(convert_to(jsonb_build_object('provider_plan',rp.content_hash,'creator_retained',retained)::text,'UTF8'),'sha256'),'hex');ih:=encode(extensions.digest(convert_to(jsonb_build_object('content_hash',h,'revision',rp.revision+1,'previous_revision_id',rp.id)::text,'UTF8'),'sha256'),'hex');
      insert into tongs.reference_clip_plan_revisions(workspace_id,workpiece_id,revision,previous_revision_id,previous_revision,script_approval_id,script_approval_revision,script_content_hash,contract_version,content_hash,immutable_revision_hash,created_by)values(op.workspace_id,op.workpiece_id,rp.revision+1,rp.id,rp.revision,rp.script_approval_id,rp.script_approval_revision,rp.script_content_hash,'forge.unified-visual-plan.retained.v1',h,ih,op.created_by)returning * into rnext;
      rord:=0;for rm in select * from tongs.reference_clip_plan_membership where plan_revision_id=rp.id order by ordinal loop insert into tongs.reference_clip_plan_membership values(rnext.id,op.workspace_id,op.workpiece_id,rnext.revision,rord,rm.opportunity_id,rm.opportunity_revision_id,rm.opportunity_revision);rord:=rord+1;end loop;
      for rs in select distinct on(s.opportunity_id)s.* from tongs.reference_clip_selections s join tongs.reference_clip_opportunity_revisions o on o.id=s.opportunity_revision_id where s.workspace_id=op.workspace_id and s.workpiece_id=op.workpiece_id and strpos(approval.script_text,o.context_focus)>0 and not exists(select 1 from tongs.reference_clip_plan_membership m where m.plan_revision_id=rp.id and m.opportunity_id=s.opportunity_id)order by s.opportunity_id,s.revision desc loop
        insert into tongs.reference_clip_plan_membership values(rnext.id,op.workspace_id,op.workpiece_id,rnext.revision,rord,rs.opportunity_id,rs.opportunity_revision_id,rs.opportunity_revision);rord:=rord+1;select * into rprev from tongs.reference_clip_selections where workspace_id=op.workspace_id and workpiece_id=op.workpiece_id order by revision desc limit 1;selection_fingerprint:=encode(extensions.digest(convert_to(jsonb_build_object('parent',op.operation_id,'retained_selection',rs.id,'plan',rnext.id)::text,'UTF8'),'sha256'),'hex');insert into tongs.reference_clip_selections(workspace_id,workpiece_id,revision,previous_selection_id,previous_revision,plan_revision_id,plan_revision,opportunity_id,opportunity_revision_id,opportunity_revision,candidate_revision_id,candidate_revision,operation_id,operation_fingerprint,created_by)values(op.workspace_id,op.workpiece_id,coalesce(rprev.revision,0)+1,rprev.id,rprev.revision,rnext.id,rnext.revision,rs.opportunity_id,rs.opportunity_revision_id,rs.opportunity_revision,rs.candidate_revision_id,rs.candidate_revision,op.operation_id||':retain:reference:'||rs.opportunity_id,selection_fingerprint,op.created_by);
      end loop;
      update tongs.reference_clip_plan_sequences set current_plan_revision_id=rnext.id,current_plan_revision=rnext.revision,current_selection_revision=(select max(revision)from tongs.reference_clip_selections where workspace_id=op.workspace_id and workpiece_id=op.workpiece_id),updated_at=now()where workspace_id=op.workspace_id and workpiece_id=op.workpiece_id;p_provider_plan_revision_id:=rnext.id;
    end if;
  elsif p_child_kind='reference_visual' then
    select * into vseq from tongs.reference_visual_plan_sequences where workspace_id=op.workspace_id and workpiece_id=op.workpiece_id for update;if vseq.current_plan_revision_id is distinct from p_provider_plan_revision_id then return jsonb_build_object('disposition','provider_child_not_current');end if;select * into vp from tongs.reference_visual_plan_revisions where id=p_provider_plan_revision_id;
    select coalesce(jsonb_agg(jsonb_build_object('opportunity_id',x.opportunity_id,'selection_id',x.id)order by x.created_at),'[]'::jsonb),count(*) into retained,retained_count from(select distinct on(s.opportunity_id)s.* from tongs.reference_visual_selections s join tongs.reference_visual_opportunity_revisions o on o.opportunity_id=s.opportunity_id where s.workspace_id=op.workspace_id and s.workpiece_id=op.workpiece_id and strpos(approval.script_text,o.context_focus)>0 and not exists(select 1 from tongs.reference_visual_plan_membership m where m.plan_revision_id=vp.id and m.opportunity_id=s.opportunity_id)order by s.opportunity_id,s.revision desc,o.revision desc)x;
    if retained_count>0 then
      h:=encode(extensions.digest(convert_to(jsonb_build_object('provider_plan',vp.content_hash,'creator_retained',retained)::text,'UTF8'),'sha256'),'hex');ih:=encode(extensions.digest(convert_to(jsonb_build_object('content_hash',h,'revision',vp.revision+1,'previous_revision_id',vp.id)::text,'UTF8'),'sha256'),'hex');insert into tongs.reference_visual_plan_revisions(workspace_id,workpiece_id,revision,previous_revision_id,previous_revision,script_approval_id,script_approval_revision,script_content_hash,contract_version,content_hash,immutable_revision_hash,created_by)values(op.workspace_id,op.workpiece_id,vp.revision+1,vp.id,vp.revision,vp.script_approval_id,vp.script_approval_revision,vp.script_content_hash,'forge.unified-visual-plan.retained.v1',h,ih,op.created_by)returning * into vnext;
      vord:=0;for vm in select * from tongs.reference_visual_plan_membership where plan_revision_id=vp.id order by ordinal loop insert into tongs.reference_visual_plan_membership values(vnext.id,op.workspace_id,op.workpiece_id,vnext.revision,vord,vm.opportunity_id,vm.opportunity_revision_id,vm.opportunity_revision);vord:=vord+1;end loop;
      for vs in select distinct on(s.opportunity_id)s.* from tongs.reference_visual_selections s join tongs.reference_visual_opportunity_revisions o on o.opportunity_id=s.opportunity_id where s.workspace_id=op.workspace_id and s.workpiece_id=op.workpiece_id and strpos(approval.script_text,o.context_focus)>0 and not exists(select 1 from tongs.reference_visual_plan_membership m where m.plan_revision_id=vp.id and m.opportunity_id=s.opportunity_id)order by s.opportunity_id,s.revision desc,o.revision desc loop
        select * into vm from tongs.reference_visual_plan_membership m where m.opportunity_id=vs.opportunity_id order by m.plan_revision desc limit 1;insert into tongs.reference_visual_plan_membership values(vnext.id,op.workspace_id,op.workpiece_id,vnext.revision,vord,vm.opportunity_id,vm.opportunity_revision_id,vm.opportunity_revision);vord:=vord+1;select * into vprev from tongs.reference_visual_selections where workspace_id=op.workspace_id and workpiece_id=op.workpiece_id and opportunity_id=vs.opportunity_id order by revision desc limit 1;selection_fingerprint:=encode(extensions.digest(convert_to(jsonb_build_object('parent',op.operation_id,'retained_selection',vs.id,'plan',vnext.id)::text,'UTF8'),'sha256'),'hex');insert into tongs.reference_visual_selections(workspace_id,workpiece_id,opportunity_id,revision,previous_selection_id,previous_revision,plan_revision_id,plan_revision,candidate_revision_id,operation_id,operation_fingerprint,created_by)values(op.workspace_id,op.workpiece_id,vs.opportunity_id,coalesce(vprev.revision,0)+1,vprev.id,vprev.revision,vnext.id,vnext.revision,vs.candidate_revision_id,op.operation_id||':retain:visual:'||vs.opportunity_id,selection_fingerprint,op.created_by);
      end loop;
      update tongs.reference_visual_plan_sequences set current_plan_revision_id=vnext.id,current_plan_revision=vnext.revision,updated_at=now()where workspace_id=op.workspace_id and workpiece_id=op.workpiece_id;p_provider_plan_revision_id:=vnext.id;
    end if;
  elsif p_child_kind='image' then
    select * into iseq from tongs.workpiece_image_map_sequences where workspace_id=op.workspace_id and workpiece_id=op.workpiece_id for update;if iseq.current_revision_id is distinct from p_provider_plan_revision_id then return jsonb_build_object('disposition','provider_child_not_current');end if;select * into ip from tongs.image_map_revisions where id=p_provider_plan_revision_id;
    select coalesce(jsonb_agg(x.entry order by x.source_revision,x.entry->>'id'),'[]'::jsonb),count(*) into retained_entries,retained_count from(
      select distinct on(e->>'id') e as entry,r.revision as source_revision from tongs.image_map_revisions r cross join lateral jsonb_array_elements(coalesce(r.document_json->'entries','[]'::jsonb))e
      where r.workspace_id=op.workspace_id and r.workpiece_id=op.workpiece_id and nullif(e->>'selected_asset_id','') is not null and strpos(approval.script_text,coalesce(e->>'anchor',e->>'prompt_basis',''))>0
        and not exists(select 1 from jsonb_array_elements(coalesce(ip.document_json->'entries','[]'::jsonb))current_entry where current_entry->>'id'=e->>'id')
      order by e->>'id',r.revision desc
    )x;
    retained:=coalesce((select jsonb_agg(jsonb_build_object('entry_id',e->>'id','selected_asset_id',e->>'selected_asset_id'))from jsonb_array_elements(retained_entries)e),'[]'::jsonb);
    if retained_count>0 then
      next_document:=jsonb_set(ip.document_json,'{entries}',coalesce(ip.document_json->'entries','[]'::jsonb)||retained_entries,true);h:=encode(extensions.digest(convert_to(next_document::text,'UTF8'),'sha256'),'hex');semantic_hash:=encode(extensions.digest(convert_to(jsonb_build_object('script',ip.source_script_content_hash,'document',h)::text,'UTF8'),'sha256'),'hex');ih:=encode(extensions.digest(convert_to(jsonb_build_object('content_hash',h,'semantic_state_hash',semantic_hash,'revision',ip.revision+1,'previous_revision_id',ip.id)::text,'UTF8'),'sha256'),'hex');
      insert into tongs.image_map_revisions(workspace_id,workpiece_id,revision,previous_revision_id,previous_revision,source_script_approval_id,source_script_approval_revision,source_script_content_hash,anchor_contract_version,provenance_state,document_json,document_content_hash,semantic_state_hash,immutable_revision_hash,created_by)
        values(op.workspace_id,op.workpiece_id,ip.revision+1,ip.id,ip.revision,ip.source_script_approval_id,ip.source_script_approval_revision,ip.source_script_content_hash,'forge.unified-visual-plan.retained.v1','current',next_document,h,semantic_hash,ih,op.created_by)returning * into inext;
      update tongs.workpiece_image_map_sequences set current_revision_id=inext.id,current_revision=inext.revision,updated_at=now()where workspace_id=op.workspace_id and workpiece_id=op.workpiece_id;p_provider_plan_revision_id:=inext.id;
    end if;
  else return jsonb_build_object('disposition','invalid_child_kind');end if;

  update tongs.unified_visual_plan_operations set child_membership_evidence_json=child_membership_evidence_json||jsonb_build_object(p_child_kind,jsonb_build_object('provider_plan_revision_id',original_provider_plan_revision_id,'final_plan_revision_id',p_provider_plan_revision_id,'provider_proposed',true,'creator_retained',retained,'creator_added','[]'::jsonb)),updated_at=now()where operation_id=op.operation_id returning child_membership_evidence_json into result;
  return jsonb_build_object('disposition','retained','revision_id',p_provider_plan_revision_id,'retained_count',retained_count,'membership_evidence',result);
end$$;

create or replace function tongs.verify_unified_visual_plan(p_operation_id text,p_operation_fingerprint text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $$
declare op tongs.unified_visual_plan_operations%rowtype; receipt jsonb;
begin
  select * into op from tongs.unified_visual_plan_operations where operation_id=p_operation_id for update;
  if not found or op.operation_fingerprint<>p_operation_fingerprint then return jsonb_build_object('disposition','operation_identity_conflict');end if;
  if not tongs.has_workspace_role(op.workspace_id,'editor') then raise exception 'workspace editor authority required' using errcode='42501';end if;
  if op.state='verified' then return op.receipt_json;end if;
  if op.contract_version<>'forge.unified-visual-plan.v2' or op.state<>'reference_visual_plan_committed' then return jsonb_build_object('disposition','stage_conflict','state',op.state);end if;
  if not exists(select 1 from tongs.workpiece_image_map_sequences where workspace_id=op.workspace_id and workpiece_id=op.workpiece_id and current_revision_id=op.image_map_revision_id and current_revision=op.image_map_revision)
    or not exists(select 1 from tongs.broll_plan_sequences where workspace_id=op.workspace_id and workpiece_id=op.workpiece_id and current_plan_revision_id=op.broll_plan_revision_id and current_plan_revision=op.broll_plan_revision)
    or not exists(select 1 from tongs.reference_clip_plan_sequences where workspace_id=op.workspace_id and workpiece_id=op.workpiece_id and current_plan_revision_id=op.reference_clip_plan_revision_id and current_plan_revision=op.reference_clip_plan_revision)
    or not exists(select 1 from tongs.reference_visual_plan_sequences where workspace_id=op.workspace_id and workpiece_id=op.workpiece_id and current_plan_revision_id=op.reference_visual_plan_revision_id and current_plan_revision=op.reference_visual_plan_revision) then return jsonb_build_object('disposition','child_revision_no_longer_current');end if;
  receipt:=jsonb_build_object('disposition','verified','contract_version',op.contract_version,'operation_id',op.operation_id,'operation_fingerprint',op.operation_fingerprint,'script_approval_id',op.script_approval_id,'script_approval_revision',op.script_approval_revision,'script_content_hash',op.script_content_hash,'provider_response_hash',op.provider_response_hash,'child_membership_evidence',op.child_membership_evidence_json,
    'image_plan',jsonb_build_object('revision_id',op.image_map_revision_id,'revision',op.image_map_revision,'content_hash',op.image_plan_content_hash,'empty',op.image_plan_empty),
    'broll_plan',jsonb_build_object('revision_id',op.broll_plan_revision_id,'revision',op.broll_plan_revision,'content_hash',op.broll_plan_content_hash,'empty',op.broll_plan_empty),
    'reference_clip_plan',jsonb_build_object('revision_id',op.reference_clip_plan_revision_id,'revision',op.reference_clip_plan_revision,'content_hash',op.reference_clip_plan_content_hash,'empty',op.reference_clip_plan_empty),
    'reference_visual_plan',jsonb_build_object('revision_id',op.reference_visual_plan_revision_id,'revision',op.reference_visual_plan_revision,'content_hash',op.reference_visual_plan_content_hash,'empty',op.reference_visual_plan_empty));
  update tongs.unified_visual_plan_operations set state='verified',receipt_json=receipt,failed_stage=null,failure_code=null,failure_message=null,updated_at=now()where operation_id=p_operation_id;
  return receipt;
end$$;

revoke all on function tongs.read_unified_visual_plan_operation(uuid,uuid,text) from public,anon,authenticated;
grant execute on function tongs.read_unified_visual_plan_operation(uuid,uuid,text) to authenticated,service_role;
revoke all on function tongs.retain_unified_visual_plan_selections(text,text,text,uuid) from public,anon,authenticated;
grant execute on function tongs.retain_unified_visual_plan_selections(text,text,text,uuid) to authenticated,service_role;
revoke all on function tongs.append_reference_visual_opportunity(uuid,uuid,uuid,bigint,uuid,bigint,text,text,text,text,text,jsonb,text,text,jsonb,text,bigint,text,uuid,jsonb,text,text,uuid) from public,anon,authenticated;
grant execute on function tongs.append_reference_visual_opportunity(uuid,uuid,uuid,bigint,uuid,bigint,text,text,text,text,text,jsonb,text,text,jsonb,text,bigint,text,uuid,jsonb,text,text,uuid) to authenticated,service_role;

commit;
