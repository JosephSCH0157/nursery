begin;

alter table tongs.reference_visual_evidence_revisions
  add column if not exists evidence_intent text not null default 'general_support';

do $constraints$
begin
  if not exists(
    select 1 from pg_constraint
    where conrelid='tongs.reference_visual_evidence_revisions'::regclass
      and conname='reference_visual_evidence_revisions_intent_check'
  ) then
    alter table tongs.reference_visual_evidence_revisions
      add constraint reference_visual_evidence_revisions_intent_check
      check(evidence_intent in('general_support','numeric_stat','dated_timeline','comparison_support'));
  end if;
end $constraints$;

create or replace function tongs.reference_visual_evidence_claim_fingerprint(
  p_workspace_id uuid,
  p_workpiece_id uuid,
  p_opportunity_id uuid,
  p_source_set_member_id uuid,
  p_source_revision_id uuid,
  p_workpiece_source_link_revision_id uuid,
  p_document_locator jsonb,
  p_raw_excerpt text,
  p_numeric_value numeric,
  p_unit text,
  p_evidence_role text,
  p_category text
) returns text
language sql immutable security invoker set search_path=pg_catalog,tongs,extensions as $$
  select encode(extensions.digest(convert_to(jsonb_build_object(
    'workspace_id',p_workspace_id,
    'workpiece_id',p_workpiece_id,
    'opportunity_id',p_opportunity_id,
    'source_set_member_id',p_source_set_member_id,
    'source_revision_id',p_source_revision_id,
    'workpiece_source_link_revision_id',p_workpiece_source_link_revision_id,
    'document_locator',coalesce(p_document_locator,'{}'::jsonb),
    'raw_excerpt',regexp_replace(btrim(coalesce(p_raw_excerpt,'')),E'\\s+',' ','g'),
    'numeric_value',p_numeric_value,
    'unit',lower(regexp_replace(btrim(coalesce(p_unit,'')),E'\\s+',' ','g')),
    'evidence_role',btrim(coalesce(p_evidence_role,'')),
    'category',btrim(coalesce(p_category,''))
  )::text,'UTF8'),'sha256'),'hex')
$$;

create table if not exists tongs.reference_visual_evidence_claims(
  claim_id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  workpiece_id uuid not null,
  opportunity_id uuid not null,
  source_set_member_id uuid not null,
  source_revision_id uuid not null,
  workpiece_source_link_revision_id uuid not null,
  claim_fingerprint text not null check(claim_fingerprint~'^[0-9a-f]{64}$'),
  canonical_evidence_id uuid not null,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  unique(workspace_id,workpiece_id,opportunity_id,claim_fingerprint),
  unique(claim_id,workspace_id,workpiece_id,opportunity_id),
  foreign key(source_set_member_id,workspace_id,workpiece_id,opportunity_id)
    references tongs.reference_visual_source_set_members(id,workspace_id,workpiece_id,opportunity_id),
  foreign key(workspace_id,workpiece_id,canonical_evidence_id)
    references tongs.reference_visual_evidence_sequences(workspace_id,workpiece_id,evidence_id)
);

create table if not exists tongs.reference_visual_evidence_duplicate_reconciliations(
  reconciliation_id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  workpiece_id uuid not null,
  opportunity_id uuid not null,
  duplicate_evidence_id uuid not null,
  canonical_claim_id uuid not null,
  canonical_evidence_id uuid not null,
  reason text not null,
  operation_id text not null unique,
  operation_fingerprint text not null check(operation_fingerprint~'^[0-9a-f]{64}$'),
  reconciled_by uuid not null,
  reconciled_at timestamptz not null default now(),
  unique(workspace_id,workpiece_id,duplicate_evidence_id),
  foreign key(workspace_id,workpiece_id,duplicate_evidence_id)
    references tongs.reference_visual_evidence_sequences(workspace_id,workpiece_id,evidence_id),
  foreign key(canonical_claim_id,workspace_id,workpiece_id,opportunity_id)
    references tongs.reference_visual_evidence_claims(claim_id,workspace_id,workpiece_id,opportunity_id),
  foreign key(workspace_id,workpiece_id,canonical_evidence_id)
    references tongs.reference_visual_evidence_sequences(workspace_id,workpiece_id,evidence_id)
);

alter table tongs.reference_visual_evidence_claims enable row level security;
alter table tongs.reference_visual_evidence_claims force row level security;
alter table tongs.reference_visual_evidence_duplicate_reconciliations enable row level security;
alter table tongs.reference_visual_evidence_duplicate_reconciliations force row level security;

drop policy if exists reference_visual_evidence_claims_viewer on tongs.reference_visual_evidence_claims;
create policy reference_visual_evidence_claims_viewer
  on tongs.reference_visual_evidence_claims for select to authenticated
  using(tongs.has_workspace_role(workspace_id,'viewer'));

revoke all on tongs.reference_visual_evidence_claims,
  tongs.reference_visual_evidence_duplicate_reconciliations
  from public,anon,authenticated;
grant select on tongs.reference_visual_evidence_claims to authenticated;
grant select,insert on tongs.reference_visual_evidence_claims,
  tongs.reference_visual_evidence_duplicate_reconciliations to service_role;

drop trigger if exists reference_visual_evidence_claims_immutable on tongs.reference_visual_evidence_claims;
create trigger reference_visual_evidence_claims_immutable
  before update or delete on tongs.reference_visual_evidence_claims
  for each row execute function tongs.reject_reference_visual_immutable_mutation();
drop trigger if exists reference_visual_evidence_duplicate_reconciliations_immutable on tongs.reference_visual_evidence_duplicate_reconciliations;
create trigger reference_visual_evidence_duplicate_reconciliations_immutable
  before update or delete on tongs.reference_visual_evidence_duplicate_reconciliations
  for each row execute function tongs.reject_reference_visual_immutable_mutation();

-- Establish one canonical identity for every current exact claim. The earliest
-- immutable current revision is retained as the representative.
with fingerprints as(
  select e.*,
    tongs.reference_visual_evidence_claim_fingerprint(
      e.workspace_id,e.workpiece_id,e.opportunity_id,e.source_set_member_id,
      e.source_revision_id,e.workpiece_source_link_revision_id,
      e.document_locator_json,e.raw_excerpt,e.numeric_value,e.unit,e.evidence_role,e.category
    ) claim_fingerprint
  from tongs.reference_visual_evidence_sequences s
  join tongs.reference_visual_evidence_revisions e on e.id=s.current_evidence_revision_id
  where e.source_set_member_id is not null
), ranked as(
  select fingerprints.*,
    row_number() over(
      partition by workspace_id,workpiece_id,opportunity_id,claim_fingerprint
      order by created_at,id
    ) claim_rank
  from fingerprints
)
insert into tongs.reference_visual_evidence_claims(
  workspace_id,workpiece_id,opportunity_id,source_set_member_id,
  source_revision_id,workpiece_source_link_revision_id,claim_fingerprint,
  canonical_evidence_id,created_by,created_at
)
select workspace_id,workpiece_id,opportunity_id,source_set_member_id,
  source_revision_id,workpiece_source_link_revision_id,claim_fingerprint,
  evidence_id,created_by,created_at
from ranked where claim_rank=1
on conflict(workspace_id,workpiece_id,opportunity_id,claim_fingerprint) do nothing;

-- The smoke produced seven independently-addressed exact duplicates. Prove
-- equality before recording the append-only reconciliation. No evidence row or
-- sequence is deleted or rewritten.
do $reconcile$
declare
  pair record;
  canonical_revision tongs.reference_visual_evidence_revisions%rowtype;
  duplicate_revision tongs.reference_visual_evidence_revisions%rowtype;
  canonical_fingerprint text;
  duplicate_fingerprint text;
  claim tongs.reference_visual_evidence_claims%rowtype;
  operator_id uuid;
  reconciliation_fingerprint text;
  target_count bigint;
begin
  select count(*) into target_count
  from tongs.reference_visual_evidence_sequences s
  where s.workspace_id='cc5478ff-37be-403e-824c-467fa7da061e'::uuid
    and s.workpiece_id='21d16d6a-905b-491e-8761-028789612ae5'::uuid
    and s.evidence_id=any(array[
      '854a50fe-4f35-41d4-9fc1-599a4fef747a'::uuid,
      '2b80c2a9-bf81-4681-bdb8-ef4212dea204'::uuid,
      'eaaa84a9-5618-40bc-9ea3-f77d7a3a7146'::uuid,
      '6cd2f893-2db4-451b-bb31-151732845ddd'::uuid,
      '3ac4ca91-4631-48e6-8171-3e9819d7f0b4'::uuid,
      '85317996-4cd9-407d-bb6f-44d0b41f1f3d'::uuid,
      '7c91e57a-5c89-4e69-a021-a8066e384dbb'::uuid,
      'dc3e4344-e960-486e-a904-cb2c29ab1ebc'::uuid,
      'ea6ccf94-c085-4745-8cd0-149f16ebc916'::uuid,
      'afb967d6-0b02-4072-bcdb-a66305761752'::uuid,
      '175da5fb-149f-4279-ba2f-bbd7897e85ad'::uuid,
      '443e946a-feeb-490a-8793-3c96882433ec'::uuid
    ]);
  -- Disposable/local databases do not contain the linked smoke fixture. If any
  -- bounded identity is present, however, require the complete reviewed set.
  if target_count=0 then
    return;
  elsif target_count<>12 then
    raise exception 'bounded reference visual evidence reconciliation set incomplete: % of 12 identities',target_count;
  end if;
  for pair in
    select * from(values
      ('854a50fe-4f35-41d4-9fc1-599a4fef747a'::uuid,'2b80c2a9-bf81-4681-bdb8-ef4212dea204'::uuid),
      ('854a50fe-4f35-41d4-9fc1-599a4fef747a'::uuid,'eaaa84a9-5618-40bc-9ea3-f77d7a3a7146'::uuid),
      ('6cd2f893-2db4-451b-bb31-151732845ddd'::uuid,'3ac4ca91-4631-48e6-8171-3e9819d7f0b4'::uuid),
      ('6cd2f893-2db4-451b-bb31-151732845ddd'::uuid,'85317996-4cd9-407d-bb6f-44d0b41f1f3d'::uuid),
      ('7c91e57a-5c89-4e69-a021-a8066e384dbb'::uuid,'dc3e4344-e960-486e-a904-cb2c29ab1ebc'::uuid),
      ('ea6ccf94-c085-4745-8cd0-149f16ebc916'::uuid,'afb967d6-0b02-4072-bcdb-a66305761752'::uuid),
      ('175da5fb-149f-4279-ba2f-bbd7897e85ad'::uuid,'443e946a-feeb-490a-8793-3c96882433ec'::uuid)
    )p(canonical_evidence_id,duplicate_evidence_id)
  loop
    select e.* into canonical_revision
    from tongs.reference_visual_evidence_sequences s
    join tongs.reference_visual_evidence_revisions e on e.id=s.current_evidence_revision_id
    where s.workspace_id='cc5478ff-37be-403e-824c-467fa7da061e'::uuid
      and s.workpiece_id='21d16d6a-905b-491e-8761-028789612ae5'::uuid
      and s.evidence_id=pair.canonical_evidence_id;
    select e.* into duplicate_revision
    from tongs.reference_visual_evidence_sequences s
    join tongs.reference_visual_evidence_revisions e on e.id=s.current_evidence_revision_id
    where s.workspace_id='cc5478ff-37be-403e-824c-467fa7da061e'::uuid
      and s.workpiece_id='21d16d6a-905b-491e-8761-028789612ae5'::uuid
      and s.evidence_id=pair.duplicate_evidence_id;
    if canonical_revision.id is null or duplicate_revision.id is null then
      raise exception 'bounded reference visual evidence reconciliation target missing: % -> %',pair.duplicate_evidence_id,pair.canonical_evidence_id;
    end if;
    canonical_fingerprint:=tongs.reference_visual_evidence_claim_fingerprint(
      canonical_revision.workspace_id,canonical_revision.workpiece_id,canonical_revision.opportunity_id,
      canonical_revision.source_set_member_id,canonical_revision.source_revision_id,
      canonical_revision.workpiece_source_link_revision_id,canonical_revision.document_locator_json,
      canonical_revision.raw_excerpt,canonical_revision.numeric_value,canonical_revision.unit,
      canonical_revision.evidence_role,canonical_revision.category
    );
    duplicate_fingerprint:=tongs.reference_visual_evidence_claim_fingerprint(
      duplicate_revision.workspace_id,duplicate_revision.workpiece_id,duplicate_revision.opportunity_id,
      duplicate_revision.source_set_member_id,duplicate_revision.source_revision_id,
      duplicate_revision.workpiece_source_link_revision_id,duplicate_revision.document_locator_json,
      duplicate_revision.raw_excerpt,duplicate_revision.numeric_value,duplicate_revision.unit,
      duplicate_revision.evidence_role,duplicate_revision.category
    );
    if canonical_fingerprint is distinct from duplicate_fingerprint then
      raise exception 'bounded reference visual evidence fingerprints differ: % -> %',pair.duplicate_evidence_id,pair.canonical_evidence_id;
    end if;
    select * into claim from tongs.reference_visual_evidence_claims c
    where c.workspace_id=canonical_revision.workspace_id
      and c.workpiece_id=canonical_revision.workpiece_id
      and c.opportunity_id=canonical_revision.opportunity_id
      and c.claim_fingerprint=canonical_fingerprint;
    if claim.canonical_evidence_id is distinct from pair.canonical_evidence_id then
      raise exception 'bounded reference visual evidence canonical identity mismatch: %',pair.canonical_evidence_id;
    end if;
    operator_id:=canonical_revision.created_by;
    reconciliation_fingerprint:=encode(extensions.digest(convert_to(jsonb_build_object(
      'authority','forge.reference-visual-evidence-duplicate-reconciliation.v1',
      'canonical_evidence_id',pair.canonical_evidence_id,
      'duplicate_evidence_id',pair.duplicate_evidence_id,
      'claim_fingerprint',canonical_fingerprint
    )::text,'UTF8'),'sha256'),'hex');
    insert into tongs.reference_visual_evidence_duplicate_reconciliations(
      workspace_id,workpiece_id,opportunity_id,duplicate_evidence_id,
      canonical_claim_id,canonical_evidence_id,reason,operation_id,
      operation_fingerprint,reconciled_by
    ) values(
      canonical_revision.workspace_id,canonical_revision.workpiece_id,canonical_revision.opportunity_id,
      pair.duplicate_evidence_id,claim.claim_id,pair.canonical_evidence_id,
      'exact_claim_duplicate_smoke_reconciliation',
      'forge:reference-visual:evidence-duplicate-reconciliation:'||pair.duplicate_evidence_id,
      reconciliation_fingerprint,operator_id
    ) on conflict(workspace_id,workpiece_id,duplicate_evidence_id) do nothing;
  end loop;
end $reconcile$;

create or replace function tongs.commit_reference_visual_evidence(
  p_workspace_id uuid,p_workpiece_id uuid,p_opportunity_id uuid,p_evidence_id uuid,
  p_expected_revision bigint,p_source_revision_id uuid,p_workpiece_source_link_revision_id uuid,
  p_evidence jsonb,p_confirmation_state text,p_operation_id text,
  p_operation_fingerprint text,p_actor_id uuid
) returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs,extensions as $$
declare
  op tongs.reference_visual_operation_receipts%rowtype;
  seq tongs.reference_visual_evidence_sequences%rowtype;
  prev tongs.reference_visual_evidence_revisions%rowtype;
  source_revision tongs.source_revisions%rowtype;
  source_link tongs.workpiece_source_link_revisions%rowtype;
  source_member tongs.reference_visual_source_set_members%rowtype;
  opportunity tongs.reference_visual_opportunity_revisions%rowtype;
  revision_row tongs.reference_visual_evidence_revisions%rowtype;
  claim tongs.reference_visual_evidence_claims%rowtype;
  current_claim_revision tongs.reference_visual_evidence_revisions%rowtype;
  intent text:=coalesce(nullif(btrim(p_evidence->>'evidence_intent'),''),'general_support');
  numeric_value numeric;
  computed_claim_fingerprint text;
  n bigint;
  h text;
  ih text;
  result jsonb;
begin
  if not tongs.has_workspace_role(p_workspace_id,'editor') or auth.uid() is distinct from p_actor_id then
    raise exception 'workspace editor authority required' using errcode='42501';
  end if;
  if intent not in('general_support','numeric_stat','dated_timeline','comparison_support') then
    return jsonb_build_object('disposition','invalid_evidence_intent');
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_operation_id,0));
  select * into op from tongs.reference_visual_operation_receipts where operation_id=p_operation_id;
  if found then
    if op.operation_fingerprint<>p_operation_fingerprint then
      return jsonb_build_object('disposition','operation_identity_conflict');
    end if;
    return op.receipt_json;
  end if;
  select * into source_revision from tongs.source_revisions
    where id=p_source_revision_id and workspace_id=p_workspace_id;
  select * into source_link from tongs.workpiece_source_link_revisions
    where id=p_workpiece_source_link_revision_id and workspace_id=p_workspace_id
      and workpiece_id=p_workpiece_id and source_revision_id=source_revision.id;
  if source_revision.id is null or source_link.id is null then
    return jsonb_build_object('disposition','canonical_source_evidence_required');
  end if;
  select o.* into opportunity
  from tongs.reference_visual_plan_sequences ps
  join tongs.reference_visual_plan_membership pm on pm.plan_revision_id=ps.current_plan_revision_id
    and pm.opportunity_id=p_opportunity_id
  join tongs.reference_visual_opportunity_revisions o on o.id=pm.opportunity_revision_id
  where ps.workspace_id=p_workspace_id and ps.workpiece_id=p_workpiece_id;
  if opportunity.id is null then
    return jsonb_build_object('disposition','reference_visual_opportunity_not_current');
  end if;
  select sm.* into source_member
  from tongs.reference_visual_plan_sequences ps
  join lateral(
    select ss.* from tongs.reference_visual_source_set_revisions ss
    where ss.workspace_id=ps.workspace_id and ss.workpiece_id=ps.workpiece_id
      and ss.opportunity_id=p_opportunity_id and ss.plan_revision_id=ps.current_plan_revision_id
    order by ss.revision desc limit 1
  ) current_set on true
  join tongs.reference_visual_source_set_members sm on sm.source_set_revision_id=current_set.id
    and sm.source_revision_id=p_source_revision_id
    and sm.workpiece_source_link_revision_id=p_workpiece_source_link_revision_id
  where ps.workspace_id=p_workspace_id and ps.workpiece_id=p_workpiece_id
    and(nullif(p_evidence->>'source_set_member_id','') is null
      or sm.id::text=p_evidence->>'source_set_member_id');
  if source_member.id is null then
    return jsonb_build_object('disposition','current_source_set_member_required');
  end if;
  if intent='numeric_stat' then
    if opportunity.visual_subtype not in('stat_card','chart')
      or nullif(btrim(coalesce(p_evidence->>'category','')),'') is distinct from opportunity.visual_subtype then
      return jsonb_build_object('disposition','numeric_stat_category_invalid');
    end if;
    if jsonb_typeof(p_evidence->'numeric_value') is distinct from 'number' then
      return jsonb_build_object('disposition','numeric_stat_value_required');
    end if;
    begin numeric_value:=(p_evidence->>'numeric_value')::numeric;
    exception when others then return jsonb_build_object('disposition','numeric_stat_value_invalid');end;
    if numeric_value::text in('NaN','Infinity','-Infinity') then
      return jsonb_build_object('disposition','numeric_stat_value_invalid');
    end if;
    if length(btrim(coalesce(p_evidence->>'unit','')))<1 then
      return jsonb_build_object('disposition','numeric_stat_unit_required');
    end if;
    if lower(btrim(p_evidence->>'unit')) in('year','years','date','dates') then
      return jsonb_build_object('disposition','numeric_stat_date_not_measure');
    end if;
    if length(btrim(coalesce(p_evidence->>'label','')))<2 then
      return jsonb_build_object('disposition','numeric_stat_label_required');
    end if;
    if length(btrim(coalesce(p_evidence->>'raw_excerpt','')))<1 then
      return jsonb_build_object('disposition','numeric_stat_excerpt_required');
    end if;
    if jsonb_typeof(p_evidence->'document_locator') is distinct from 'object'
      or coalesce(p_evidence->'document_locator','{}'::jsonb)='{}'::jsonb then
      return jsonb_build_object('disposition','numeric_stat_locator_required');
    end if;
    if jsonb_typeof(p_evidence->'citation_anchor') is distinct from 'object'
      or length(btrim(coalesce(p_evidence#>>'{citation_anchor,exact}','')))<1 then
      return jsonb_build_object('disposition','numeric_stat_citation_required');
    end if;
  elsif intent='dated_timeline' then
    if opportunity.visual_subtype<>'timeline' or p_evidence->>'category'<>'timeline' then
      return jsonb_build_object('disposition','dated_timeline_category_invalid');
    end if;
    if nullif(btrim(coalesce(p_evidence->>'date','')),'') is null
      and coalesce(p_evidence->>'label','')!~'\m(1[5-9][0-9]{2}|20[0-9]{2}|21[0-9]{2})\M'
      and coalesce(p_evidence->>'raw_excerpt','')!~'\m(1[5-9][0-9]{2}|20[0-9]{2}|21[0-9]{2})\M' then
      return jsonb_build_object('disposition','dated_timeline_date_required');
    end if;
  end if;
  numeric_value:=case when jsonb_typeof(p_evidence->'numeric_value')='number'
    then(p_evidence->>'numeric_value')::numeric else null end;
  computed_claim_fingerprint:=tongs.reference_visual_evidence_claim_fingerprint(
    p_workspace_id,p_workpiece_id,p_opportunity_id,source_member.id,
    source_revision.id,source_link.id,p_evidence->'document_locator',
    p_evidence->>'raw_excerpt',numeric_value,p_evidence->>'unit',
    p_evidence->>'evidence_role',p_evidence->>'category'
  );
  perform pg_advisory_xact_lock(hashtextextended(computed_claim_fingerprint,0));
  select * into claim from tongs.reference_visual_evidence_claims c
    where c.workspace_id=p_workspace_id and c.workpiece_id=p_workpiece_id
      and c.opportunity_id=p_opportunity_id and c.claim_fingerprint=computed_claim_fingerprint;
  if found then
    select e.* into current_claim_revision
    from tongs.reference_visual_evidence_sequences s
    join tongs.reference_visual_evidence_revisions e on e.id=s.current_evidence_revision_id
    where s.workspace_id=p_workspace_id and s.workpiece_id=p_workpiece_id
      and s.evidence_id=claim.canonical_evidence_id;
    if current_claim_revision.id is null then
      return jsonb_build_object('disposition','canonical_claim_not_current');
    end if;
    result:=jsonb_build_object(
      'disposition','replay','canonical_claim_id',claim.claim_id,
      'canonical_evidence_id',claim.canonical_evidence_id,
      'canonical_evidence_revision_id',current_claim_revision.id,
      'canonical_evidence_revision',current_claim_revision.revision,
      'claim_fingerprint',computed_claim_fingerprint,
      'evidence_revision',to_jsonb(current_claim_revision)
    );
    insert into tongs.reference_visual_operation_receipts(
      operation_id,operation_fingerprint,operation_type,workspace_id,workpiece_id,
      state,result_revision_id,receipt_json,created_by,created_at
    ) values(p_operation_id,p_operation_fingerprint,'evidence_commit',p_workspace_id,p_workpiece_id,
      'committed',current_claim_revision.id,result,p_actor_id,now());
    return result;
  end if;
  select * into seq from tongs.reference_visual_evidence_sequences
    where workspace_id=p_workspace_id and workpiece_id=p_workpiece_id and evidence_id=p_evidence_id for update;
  if coalesce(seq.current_evidence_revision,0)<>p_expected_revision then
    return jsonb_build_object('disposition','evidence_revision_conflict','current_revision',coalesce(seq.current_evidence_revision,0));
  end if;
  if p_expected_revision>0 then
    select * into prev from tongs.reference_visual_evidence_revisions where id=seq.current_evidence_revision_id;
  end if;
  n:=p_expected_revision+1;
  h:=encode(extensions.digest(convert_to(jsonb_strip_nulls(jsonb_build_object(
    'source_revision_id',source_revision.id,'source_link_revision_id',source_link.id,
    'evidence',p_evidence,'confirmation_state',p_confirmation_state,'evidence_intent',intent
  ))::text,'UTF8'),'sha256'),'hex');
  ih:=encode(extensions.digest(convert_to(jsonb_build_object(
    'content_hash',h,'revision',n,'previous_revision_id',prev.id
  )::text,'UTF8'),'sha256'),'hex');
  insert into tongs.reference_visual_evidence_revisions(
    evidence_id,workspace_id,workpiece_id,opportunity_id,revision,previous_revision_id,previous_revision,
    source_revision_id,source_revision,workpiece_source_link_revision_id,workpiece_source_link_revision,
    evidence_role,origin,confirmation_state,confirmed_by,confirmed_at,citation_anchor_json,
    document_locator_json,media_range_json,raw_excerpt,numeric_value,unit,evidence_date,category,label,
    derivation_formula,rounding_rule,excerpt_content_hash,content_hash,immutable_revision_hash,created_by,
    source_set_member_id,evidence_intent
  ) values(
    p_evidence_id,p_workspace_id,p_workpiece_id,p_opportunity_id,n,prev.id,prev.revision,
    source_revision.id,source_revision.revision,source_link.id,source_link.revision,
    p_evidence->>'evidence_role',coalesce(p_evidence->>'origin','creator_entered'),p_confirmation_state,
    case when p_confirmation_state='creator_confirmed' then p_actor_id end,
    case when p_confirmation_state='creator_confirmed' then now() end,
    coalesce(p_evidence->'citation_anchor','{}'),coalesce(p_evidence->'document_locator','{}'),
    coalesce(p_evidence->'media_range','{}'),p_evidence->>'raw_excerpt',numeric_value,p_evidence->>'unit',
    nullif(p_evidence->>'date','')::date,p_evidence->>'category',p_evidence->>'label',
    p_evidence->>'derivation_formula',p_evidence->>'rounding_rule',lower(p_evidence->>'excerpt_content_hash'),
    h,ih,p_actor_id,source_member.id,intent
  ) returning * into revision_row;
  insert into tongs.reference_visual_evidence_sequences
    values(p_workspace_id,p_workpiece_id,p_evidence_id,revision_row.id,revision_row.revision,now())
  on conflict(workspace_id,workpiece_id,evidence_id) do update set
    current_evidence_revision_id=excluded.current_evidence_revision_id,
    current_evidence_revision=excluded.current_evidence_revision,updated_at=now();
  insert into tongs.reference_visual_evidence_claims(
    workspace_id,workpiece_id,opportunity_id,source_set_member_id,source_revision_id,
    workpiece_source_link_revision_id,claim_fingerprint,canonical_evidence_id,created_by
  ) values(
    p_workspace_id,p_workpiece_id,p_opportunity_id,source_member.id,source_revision.id,
    source_link.id,computed_claim_fingerprint,p_evidence_id,p_actor_id
  ) returning * into claim;
  result:=jsonb_build_object(
    'disposition','committed','canonical_claim_id',claim.claim_id,
    'canonical_evidence_id',p_evidence_id,'canonical_evidence_revision_id',revision_row.id,
    'canonical_evidence_revision',revision_row.revision,'claim_fingerprint',computed_claim_fingerprint,
    'evidence_revision',to_jsonb(revision_row)
  );
  insert into tongs.reference_visual_operation_receipts(
    operation_id,operation_fingerprint,operation_type,workspace_id,workpiece_id,
    state,result_revision_id,receipt_json,created_by,created_at
  ) values(p_operation_id,p_operation_fingerprint,'evidence_commit',p_workspace_id,p_workpiece_id,
    'committed',revision_row.id,result,p_actor_id,now());
  return result;
end$$;

revoke all on function tongs.reference_visual_evidence_claim_fingerprint(uuid,uuid,uuid,uuid,uuid,uuid,jsonb,text,numeric,text,text,text) from public,anon,authenticated;
grant execute on function tongs.reference_visual_evidence_claim_fingerprint(uuid,uuid,uuid,uuid,uuid,uuid,jsonb,text,numeric,text,text,text) to service_role;
revoke all on function tongs.commit_reference_visual_evidence(uuid,uuid,uuid,uuid,bigint,uuid,uuid,jsonb,text,text,text,uuid) from public,anon;
grant execute on function tongs.commit_reference_visual_evidence(uuid,uuid,uuid,uuid,bigint,uuid,uuid,jsonb,text,text,text,uuid) to authenticated,service_role;

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

commit;
