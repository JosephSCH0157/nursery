do $$
declare
  v_actor uuid;
  v_source_pricing constant uuid := '309b5ec9-c486-4693-a209-9cf29f586f8e';
  v_policy_id constant uuid := '7d3746e1-1ad7-47ce-95ad-bd6fcf9ddc8d';
  v_pricing_id constant uuid := 'b4c4472f-0325-4c2e-b2ef-9aef5e59e64a';
  v_catalog_id constant uuid := '3f1d45b8-15ad-4d84-a5f4-0b3845f649ab';
  v_cost_id constant uuid := '10000000-0000-4000-8000-000000000010';
  v_sku constant text := 'openai-text:hearth.chat_completion:gpt-5.6-luna:10000000-0000-4000-8000-000000000010';
  v_result jsonb;
begin
  select user_id into v_actor from tongs.platform_operators order by granted_at asc limit 1;
  if v_actor is null then raise exception 'platform operator required for standard-customer catalog binding'; end if;
  if not exists (
    select 1 from tongs.openai_text_cost_policy_revisions cost
    where cost.id=v_cost_id and cost.route_code='hearth.chat_completion'
      and cost.maximum_input_units=2000 and cost.maximum_output_units=512
      and cost.maximum_attempts=1 and cost.direct_provider_ceiling_micros=1015
      and cost.supporting_cost_ceiling_micros=10000
      and cost.full_cost_ceiling_micros=11015 and cost.cost_coverage='complete'
      and cost.lifecycle_state in ('pilot_candidate','active')
      and nullif(cost.attempt_plan->0->>'rate_revision_id','')::uuid='56560000-0000-4000-8000-000000000001'
  ) then raise exception 'exact bounded Luna cost policy is unavailable'; end if;
  insert into tongs.private_pricing_policies(id,policy_code,scope_kind,provider,sku,created_by)
  values(v_policy_id,'forge-standard-customer-hearth-luna-v1','sku','openai',v_sku,v_actor);
  insert into tongs.private_pricing_revisions(
    id,policy_id,revision,previous_revision_id,lifecycle_state,currency,markup_basis_points,
    full_cost_ceiling_micros,failure_cost_ceiling_micros,customer_price_ceiling_micros,
    billable_failure_ceiling_micros,customer_credit_units,billable_failure_classes,
    free_failure_classes,included_quantity,retention_policy,change_reason,content_hash,actor_id,
    unrounded_customer_price_micros,rounding_adjustment_micros,settled_customer_price_micros)
  select v_pricing_id,v_policy_id,1,null,source.lifecycle_state,source.currency,
    source.markup_basis_points,source.full_cost_ceiling_micros,source.failure_cost_ceiling_micros,
    source.customer_price_ceiling_micros,source.billable_failure_ceiling_micros,
    source.customer_credit_units,source.billable_failure_classes,source.free_failure_classes,
    source.included_quantity,source.retention_policy,
    'Bind the exact 3-credit Luna price to the standard-customer route and cost-policy SKU.',
    encode(extensions.digest(convert_to('forge-standard-customer-hearth-luna-v1:11015:14650:350:15000:3','utf8'),'sha256'),'hex'),
    v_actor,source.unrounded_customer_price_micros,source.rounding_adjustment_micros,source.settled_customer_price_micros
  from tongs.private_pricing_revisions source where source.id=v_source_pricing;
  if not found then raise exception 'source Luna pricing revision is unavailable'; end if;
  insert into tongs.private_pricing_cost_components(
    pricing_revision_id,ordinal,component_code,component_kind,credential_funding,provider_label,
    success_ceiling_micros,failure_ceiling_micros,cost_policy_revision,tail_policy,tail_policy_details)
  select v_pricing_id,ordinal,component_code,component_kind,credential_funding,provider_label,
    success_ceiling_micros,failure_ceiling_micros,cost_policy_revision,tail_policy,tail_policy_details
  from tongs.private_pricing_cost_components where pricing_revision_id=v_source_pricing;
  insert into tongs.private_pricing_revision_markup_sources(
    pricing_revision_id,markup_rule_revision_id,effective_markup_basis_points)
  select v_pricing_id,markup_rule_revision_id,effective_markup_basis_points
  from tongs.private_pricing_revision_markup_sources where pricing_revision_id=v_source_pricing;
  insert into tongs.private_pricing_publications(
    id,policy_id,pricing_revision_id,publication_revision,action,reason,actor_id)
  values('db0f0843-b67f-498b-9657-5843f92b2441',v_policy_id,v_pricing_id,1,'published',
    'Publish the exact standard-customer Luna SKU without changing its economics.',v_actor);
  insert into tongs.openai_text_model_catalog_revisions(
    id,revision,lifecycle_state,quality_method,source_checked_at,content_hash,actor_id)
  values(v_catalog_id,4,'active',
    'Revision 3 compatibility evidence preserved; Luna is rebound to the exact bounded standard-customer cost policy.',
    '2026-09-16T00:00:00Z',
    encode(extensions.digest(convert_to('openai-model-catalog:4:standard-customer-luna:10000000-0000-4000-8000-000000000010','utf8'),'sha256'),'hex'),v_actor);
  insert into tongs.openai_text_model_catalog_entries(
    id,catalog_revision_id,runtime_model_id,provider_model_id,display_name,tradeoff_summary,
    quality_rank,quality_basis,supported_apis,availability_status,availability_evidence,lifecycle_state,rate_revision_id)
  select extensions.uuid_generate_v5(v_catalog_id,entry.provider_model_id),v_catalog_id,
    entry.runtime_model_id,entry.provider_model_id,entry.display_name,entry.tradeoff_summary,
    entry.quality_rank,entry.quality_basis,entry.supported_apis,entry.availability_status,
    case when entry.provider_model_id='gpt-5.6-luna' then entry.availability_evidence || jsonb_build_object(
      'standard_customer_contract','forge.customer-financial-path.v2',
      'bounded_cost_policy_revision_id',v_cost_id,'pricing_revision_id',v_pricing_id)
      else entry.availability_evidence end,
    entry.lifecycle_state,
    case when entry.provider_model_id='gpt-5.6-luna' then '56560000-0000-4000-8000-000000000001'::uuid else entry.rate_revision_id end
  from tongs.openai_text_model_catalog_entries entry
  where entry.catalog_revision_id='89000000-0000-4000-8000-000000000003';
  insert into tongs.openai_text_model_route_compatibility(
    id,catalog_entry_id,route_code,compatibility_status,maximum_input_tokens,maximum_output_tokens,
    maximum_attempts,supporting_cost_coverage,cost_policy_revision_id,evidence_json)
  select extensions.uuid_generate_v5(extensions.uuid_generate_v5(v_catalog_id,old_entry.provider_model_id),compatibility.route_code),
    extensions.uuid_generate_v5(v_catalog_id,old_entry.provider_model_id),compatibility.route_code,
    compatibility.compatibility_status,
    case when old_entry.provider_model_id='gpt-5.6-luna' then 2000 else compatibility.maximum_input_tokens end,
    case when old_entry.provider_model_id='gpt-5.6-luna' then 512 else compatibility.maximum_output_tokens end,
    compatibility.maximum_attempts,compatibility.supporting_cost_coverage,
    case when old_entry.provider_model_id='gpt-5.6-luna' then v_cost_id else compatibility.cost_policy_revision_id end,
    case when old_entry.provider_model_id='gpt-5.6-luna' then compatibility.evidence_json || jsonb_build_object(
      'standard_customer_price_published',true,'standard_customer_pricing_revision_id',v_pricing_id,
      'customer_charge_micros',15000,'customer_credit_units',3) else compatibility.evidence_json end
  from tongs.openai_text_model_route_compatibility compatibility
  join tongs.openai_text_model_catalog_entries old_entry on old_entry.id=compatibility.catalog_entry_id
  where old_entry.catalog_revision_id='89000000-0000-4000-8000-000000000003';
  perform set_config('request.jwt.claim.role','service_role',true);
  v_result:=tongs.bind_financial_environment_configuration_pair(v_actor,v_pricing_id,v_cost_id,
    'Bind exact standard-customer Luna catalog, pricing, and cost authority for Test certification; Live remains inactive.');
  perform set_config('request.jwt.claim.role','',true);
  if (v_result->>'test_configuration_revision')::integer<>3
     or (v_result->>'live_configuration_revision')::integer<>3 then
    raise exception 'unexpected financial configuration revision after Luna catalog binding';
  end if;
  if not exists(
    select 1 from tongs.openai_text_model_catalog_revisions catalog
    join tongs.openai_text_model_catalog_entries entry on entry.catalog_revision_id=catalog.id
    join tongs.openai_text_model_route_compatibility compatibility on compatibility.catalog_entry_id=entry.id
    where catalog.id=v_catalog_id and catalog.revision=4 and catalog.lifecycle_state='active'
      and entry.provider_model_id='gpt-5.6-luna'
      and entry.rate_revision_id='56560000-0000-4000-8000-000000000001'
      and compatibility.route_code='hearth.chat_completion'
      and compatibility.cost_policy_revision_id=v_cost_id
      and compatibility.maximum_input_tokens=2000 and compatibility.maximum_output_tokens=512
      and compatibility.maximum_attempts=1 and compatibility.compatibility_status='generation_verified'
      and compatibility.supporting_cost_coverage='complete'
  ) then raise exception 'exact standard-customer Luna catalog binding was not installed'; end if;
end $$;
notify pgrst,'reload schema';