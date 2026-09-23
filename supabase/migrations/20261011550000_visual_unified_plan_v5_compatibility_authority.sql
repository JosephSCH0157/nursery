-- Advance only the revisioned model-route compatibility authority needed by
-- the unified Visual Plan provider v5 contract. Pricing, cost, rollout,
-- customer scope, and failure-loss authority are deliberately unchanged.
begin;

lock table tongs.openai_text_model_catalog_revisions in share row exclusive mode;

do $$
declare
  previous_catalog tongs.openai_text_model_catalog_revisions%rowtype;
  next_catalog_id uuid;
  previous_entry_count integer;
  next_entry_count integer;
  previous_compatibility_count integer;
  next_compatibility_count integer;
begin
  select * into previous_catalog
  from tongs.openai_text_model_catalog_revisions
  where lifecycle_state='active'
  order by revision desc
  limit 1;

  if previous_catalog.id is null
    or previous_catalog.revision<>10
    or previous_catalog.id<>'17000000-0000-4000-8000-000000000005'
  then
    raise exception 'active model catalog revision 10 is required';
  end if;

  if not exists(
    select 1
    from tongs.openai_text_model_route_compatibility compatibility
    join tongs.openai_text_model_catalog_entries entry
      on entry.id=compatibility.catalog_entry_id
    where entry.catalog_revision_id=previous_catalog.id
      and entry.provider_model_id='gpt-5.6-luna'
      and compatibility.route_code='visual.unified_plan'
      and compatibility.compatibility_status='generation_verified'
      and compatibility.maximum_input_tokens=32000
      and compatibility.maximum_output_tokens=6144
      and compatibility.maximum_attempts=1
      and compatibility.supporting_cost_coverage='complete'
      and compatibility.cost_policy_revision_id='17000000-0000-4000-8000-000000000001'
      and compatibility.evidence_json->>'provider_contract_version'='forge.unified-visual-plan-provider.v4'
      and compatibility.evidence_json->>'test_only'='true'
      and compatibility.evidence_json->>'responses_json_schema'='true'
      and compatibility.evidence_json->>'canonical_four_child_commit_required'='true'
  ) then
    raise exception 'exact revision 10 unified Visual Plan v4 authority is required';
  end if;

  next_catalog_id:=extensions.uuid_generate_v5(
    previous_catalog.id,
    'visual-unified-plan-provider-v5-catalog-revision'
  );

  insert into tongs.openai_text_model_catalog_revisions(
    id,revision,lifecycle_state,quality_method,source_checked_at,content_hash,actor_id
  ) values(
    next_catalog_id,11,'active',previous_catalog.quality_method,
    previous_catalog.source_checked_at,
    encode(extensions.digest(convert_to(
      previous_catalog.content_hash||':visual-unified-plan-provider-v5','utf8'
    ),'sha256'),'hex'),
    previous_catalog.actor_id
  );

  insert into tongs.openai_text_model_catalog_entries(
    id,catalog_revision_id,runtime_model_id,provider_model_id,display_name,
    tradeoff_summary,quality_rank,quality_basis,supported_apis,
    availability_status,availability_evidence,lifecycle_state,rate_revision_id
  )
  select
    extensions.uuid_generate_v5(next_catalog_id,'model:'||entry.provider_model_id),
    next_catalog_id,entry.runtime_model_id,entry.provider_model_id,entry.display_name,
    entry.tradeoff_summary,entry.quality_rank,entry.quality_basis,entry.supported_apis,
    entry.availability_status,entry.availability_evidence,entry.lifecycle_state,
    entry.rate_revision_id
  from tongs.openai_text_model_catalog_entries entry
  where entry.catalog_revision_id=previous_catalog.id;

  insert into tongs.openai_text_model_route_compatibility(
    id,catalog_entry_id,route_code,compatibility_status,maximum_input_tokens,
    maximum_output_tokens,maximum_attempts,supporting_cost_coverage,
    cost_policy_revision_id,evidence_json
  )
  select
    extensions.uuid_generate_v5(next_entry.id,'route:'||compatibility.route_code),
    next_entry.id,compatibility.route_code,compatibility.compatibility_status,
    compatibility.maximum_input_tokens,compatibility.maximum_output_tokens,
    compatibility.maximum_attempts,compatibility.supporting_cost_coverage,
    compatibility.cost_policy_revision_id,
    case
      when previous_entry.provider_model_id='gpt-5.6-luna'
        and compatibility.route_code='visual.unified_plan'
      then compatibility.evidence_json||jsonb_build_object(
        'provider_contract_version','forge.unified-visual-plan-provider.v5'
      )
      else compatibility.evidence_json
    end
  from tongs.openai_text_model_route_compatibility compatibility
  join tongs.openai_text_model_catalog_entries previous_entry
    on previous_entry.id=compatibility.catalog_entry_id
  join tongs.openai_text_model_catalog_entries next_entry
    on next_entry.catalog_revision_id=next_catalog_id
    and next_entry.provider_model_id=previous_entry.provider_model_id
  where previous_entry.catalog_revision_id=previous_catalog.id;

  select count(*) into previous_entry_count
  from tongs.openai_text_model_catalog_entries
  where catalog_revision_id=previous_catalog.id;
  select count(*) into next_entry_count
  from tongs.openai_text_model_catalog_entries
  where catalog_revision_id=next_catalog_id;
  select count(*) into previous_compatibility_count
  from tongs.openai_text_model_route_compatibility compatibility
  join tongs.openai_text_model_catalog_entries entry
    on entry.id=compatibility.catalog_entry_id
  where entry.catalog_revision_id=previous_catalog.id;
  select count(*) into next_compatibility_count
  from tongs.openai_text_model_route_compatibility compatibility
  join tongs.openai_text_model_catalog_entries entry
    on entry.id=compatibility.catalog_entry_id
  where entry.catalog_revision_id=next_catalog_id;

  if previous_entry_count<>next_entry_count
    or previous_compatibility_count<>next_compatibility_count
  then
    raise exception 'model catalog clone is incomplete';
  end if;

  if exists(
    select 1
    from tongs.openai_text_model_route_compatibility previous_compatibility
    join tongs.openai_text_model_catalog_entries previous_entry
      on previous_entry.id=previous_compatibility.catalog_entry_id
    join tongs.openai_text_model_catalog_entries next_entry
      on next_entry.catalog_revision_id=next_catalog_id
      and next_entry.provider_model_id=previous_entry.provider_model_id
    join tongs.openai_text_model_route_compatibility next_compatibility
      on next_compatibility.catalog_entry_id=next_entry.id
      and next_compatibility.route_code=previous_compatibility.route_code
    where previous_entry.catalog_revision_id=previous_catalog.id
      and not(
        previous_entry.provider_model_id='gpt-5.6-luna'
        and previous_compatibility.route_code='visual.unified_plan'
      )
      and (
        next_compatibility.compatibility_status is distinct from previous_compatibility.compatibility_status
        or next_compatibility.maximum_input_tokens is distinct from previous_compatibility.maximum_input_tokens
        or next_compatibility.maximum_output_tokens is distinct from previous_compatibility.maximum_output_tokens
        or next_compatibility.maximum_attempts is distinct from previous_compatibility.maximum_attempts
        or next_compatibility.supporting_cost_coverage is distinct from previous_compatibility.supporting_cost_coverage
        or next_compatibility.cost_policy_revision_id is distinct from previous_compatibility.cost_policy_revision_id
        or next_compatibility.evidence_json is distinct from previous_compatibility.evidence_json
      )
  ) then
    raise exception 'unrelated model-route compatibility changed';
  end if;

  if not exists(
    select 1
    from tongs.openai_text_model_catalog_revisions catalog
    join tongs.openai_text_model_catalog_entries entry
      on entry.catalog_revision_id=catalog.id
    join tongs.openai_text_model_route_compatibility compatibility
      on compatibility.catalog_entry_id=entry.id
    where catalog.id=next_catalog_id
      and catalog.revision=11
      and catalog.lifecycle_state='active'
      and entry.provider_model_id='gpt-5.6-luna'
      and entry.runtime_model_id='gpt-5.6-luna'
      and compatibility.route_code='visual.unified_plan'
      and compatibility.compatibility_status='generation_verified'
      and compatibility.maximum_input_tokens=32000
      and compatibility.maximum_output_tokens=6144
      and compatibility.maximum_attempts=1
      and compatibility.supporting_cost_coverage='complete'
      and compatibility.cost_policy_revision_id='17000000-0000-4000-8000-000000000001'
      and compatibility.evidence_json->>'provider_contract_version'='forge.unified-visual-plan-provider.v5'
      and compatibility.evidence_json->>'test_only'='true'
      and compatibility.evidence_json->>'responses_json_schema'='true'
      and compatibility.evidence_json->>'canonical_four_child_commit_required'='true'
  ) then
    raise exception 'unified Visual Plan v5 compatibility authority mismatch';
  end if;

  if exists(
    select 1
    from tongs.customer_paid_execution_scope_authorizations
    where route_code='visual.unified_plan'
      and financial_environment='live'
      and status='active'
  ) then
    raise exception 'Live unified Visual Plan scope must remain absent';
  end if;
end $$;

commit;
