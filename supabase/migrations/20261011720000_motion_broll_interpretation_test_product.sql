-- One bounded Forge-funded Test motion-prompt interpretation product.
-- This activates no Runway/video generation, Owner funding, BYO funding, or Live scope.
begin;

do $$
begin
  if not exists(select 1 from tongs.openai_text_provider_rate_revisions
    where id='56560000-0000-4000-8000-000000000001'
      and runtime_model_alias='gpt-5.6-luna'
      and provider_model_id='gpt-5.6-luna'
      and input_micros_per_million_tokens=200000
      and output_micros_per_million_tokens=1200000)
  then raise exception 'exact GPT-5.6 Luna rate revision is unavailable'; end if;
  if not exists(select 1 from tongs.openai_text_model_catalog_revisions
    where id='19670000-0000-4000-8000-000000000008' and revision=15 and lifecycle_state='active')
  then raise exception 'active model catalog revision 15 is unavailable'; end if;
  if (select lifecycle_state from tongs.financial_environment_configuration_revisions
      where environment='live' order by revision desc limit 1)<>'inactive_ready'
  then raise exception 'Live must remain inactive-ready'; end if;
  if not exists(select 1 from tongs.openai_text_rollout_revisions
    where route_code='motion.broll_interpretation' and revision=2 and mode='halt_new' and funding_scope='forge')
  then raise exception 'historical Forge motion-B-roll halt is unavailable'; end if;
  if not exists(select 1 from tongs.openai_text_route_policies
    where route_code='motion.broll_interpretation' and maximum_attempts=1
      and requires_result_validation and requires_canonical_persistence)
  then raise exception 'motion-B-roll route validation/persistence policy is unavailable'; end if;
end $$;

insert into tongs.openai_text_cost_policy_revisions(
  id,route_code,revision,policy_code,attempt_plan,maximum_input_units,
  maximum_output_units,maximum_attempts,direct_provider_ceiling_micros,
  supporting_cost_ceiling_micros,full_cost_ceiling_micros,cost_coverage,lifecycle_state,notes
) values (
  '19720000-0000-4000-8000-000000000001','motion.broll_interpretation',3,
  'openai-text:motion-broll-interpretation:test-luna-v3',
  '[{"attempt":1,"rate_revision_id":"56560000-0000-4000-8000-000000000001","runtime_model":"gpt-5.6-luna","provider_model_id":"gpt-5.6-luna","input_max":4096,"output_max":1024}]',
  4096,1024,1,2049,0,2049,'complete','active',
  'Component-ceiling method: ceil(4096*0.20)=820 plus ceil(1024*1.20)=1229, totaling 2049 micros. Motion validation, deterministic prompt synthesis, and canonical persistence have zero attributable variable cost.'
);

insert into tongs.openai_text_supporting_cost_inventory(
  id,route_code,cost_policy_revision_id,component_code,disposition,evidence_status,notes
) values
  ('19720000-0000-4000-8000-000000000002','motion.broll_interpretation','19720000-0000-4000-8000-000000000001','openai_motion_broll_interpretation','attributable_metered','verified','One bounded GPT-5.6 Luna Responses attempt is the only metered supplier cost.'),
  ('19720000-0000-4000-8000-000000000003','motion.broll_interpretation','19720000-0000-4000-8000-000000000001','validation_synthesis_and_persistence','platform_overhead','verified','Strict validation, deterministic synthesis, canonical persistence, and readback have no verified attributable variable allocation.'),
  ('19720000-0000-4000-8000-000000000004','motion.broll_interpretation','19720000-0000-4000-8000-000000000001','fixed_netlify_supabase_plans','platform_overhead','verified','Fixed hosting and database plans are not operation wholesale.');

do $$
declare
  actor uuid;
  policy_id constant uuid:='19720000-0000-4000-8000-000000000005';
  pricing_id constant uuid:='19720000-0000-4000-8000-000000000006';
  cost_id constant uuid:='19720000-0000-4000-8000-000000000001';
  catalog_id constant uuid:='19720000-0000-4000-8000-000000000008';
  previous_catalog_id constant uuid:='19670000-0000-4000-8000-000000000008';
  sku constant text:='openai-text:motion.broll_interpretation:gpt-5.6-luna:19720000-0000-4000-8000-000000000001';
begin
  select user_id into actor from tongs.platform_operators order by granted_at limit 1;
  if actor is null then raise exception 'platform operator required'; end if;

  insert into tongs.private_pricing_policies(id,policy_code,scope_kind,provider,sku,created_by)
  values(policy_id,'forge-motion-broll-interpretation-test-luna-v1','sku','openai',sku,actor);
  insert into tongs.private_pricing_revisions(
    id,policy_id,revision,previous_revision_id,lifecycle_state,currency,markup_basis_points,
    full_cost_ceiling_micros,failure_cost_ceiling_micros,customer_price_ceiling_micros,
    billable_failure_ceiling_micros,customer_credit_units,billable_failure_classes,
    free_failure_classes,included_quantity,retention_policy,change_reason,content_hash,actor_id,
    unrounded_customer_price_micros,rounding_adjustment_micros,settled_customer_price_micros
  ) values (
    pricing_id,policy_id,1,null,'review_ready','USD',3300,2049,0,5000,0,1,'[]',
    '["pre_provider_rejection","provider_failure","forge_failure","validation_failure","persistence_failure"]',
    '{"input_tokens":4096,"output_tokens":1024,"provider_attempts":1,"browsing_requests":0,"retrieval_requests":0,"tools":0,"attachments":0}',
    '{"canonical_motion_prompt":"platform_overhead","validation_evidence":"restricted_immutable","result_recovery":"restricted_immutable"}',
    'Approved one-credit Test motion-prompt interpretation product. Component-ceiling full cost is 2049 micros; 33-percent target is 2726 micros and settles on the 5000-micro Forge Credit grid.',
    encode(extensions.digest(convert_to('motion-broll-test-v1:2049:2726:2274:5000:1','utf8'),'sha256'),'hex'),
    actor,2726,2274,5000
  );
  insert into tongs.private_pricing_cost_components(
    pricing_revision_id,ordinal,component_code,component_kind,credential_funding,provider_label,
    success_ceiling_micros,failure_ceiling_micros,cost_policy_revision,tail_policy,tail_policy_details
  ) values
    (pricing_id,1,'openai_motion_broll_interpretation','direct_provider','forge','OpenAI',2049,0,'GPT-5.6 Luna rate revision 56560000-0000-4000-8000-000000000001','none','{"input_ceiling_micros":820,"output_ceiling_micros":1229}'),
    (pricing_id,2,'verified_variable_supporting_cost','compute','forge','Forge',0,0,'Direct-only approved basis 2026-09-24','none','{"verified_attributable_variable_micros":0}'),
    (pricing_id,3,'fixed_platform_and_evidence_retention','retention_tail','forge','Forge platform',0,0,'Supporting-cost policy 2026-09-24','plan_funded','{"classification":"platform_overhead","operation_allocation_micros":0}');
  insert into tongs.private_pricing_revision_markup_sources(
    pricing_revision_id,markup_rule_revision_id,effective_markup_basis_points
  ) select pricing_id,markup_rule_revision_id,3300
    from tongs.private_pricing_revision_markup_sources
    where pricing_revision_id='18000000-0000-4000-8000-000000000003';
  if not found then raise exception 'canonical 33-percent markup source unavailable'; end if;
  insert into tongs.private_pricing_publications(
    id,policy_id,pricing_revision_id,publication_revision,action,reason,actor_id
  ) values('19720000-0000-4000-8000-000000000007',policy_id,pricing_id,1,'published',
    'Publish only for bounded normal-customer Test motion-prompt interpretation; Live remains inactive.',actor);

  insert into tongs.openai_text_model_catalog_revisions(
    id,revision,lifecycle_state,quality_method,source_checked_at,content_hash,actor_id
  ) values(catalog_id,16,'active',
    'Revision 15 retained; GPT-5.6 Luna gains bounded strict-schema motion-B-roll interpretation compatibility.',
    '2026-09-24T00:00:00Z',
    encode(extensions.digest(convert_to('openai-model-catalog:16:motion-broll-luna','utf8'),'sha256'),'hex'),actor);
  insert into tongs.openai_text_model_catalog_entries(
    id,catalog_revision_id,runtime_model_id,provider_model_id,display_name,tradeoff_summary,
    quality_rank,quality_basis,supported_apis,availability_status,availability_evidence,lifecycle_state,rate_revision_id
  ) select extensions.uuid_generate_v5(catalog_id,'model:'||entry.provider_model_id),catalog_id,
    entry.runtime_model_id,entry.provider_model_id,entry.display_name,entry.tradeoff_summary,
    entry.quality_rank,entry.quality_basis,entry.supported_apis,entry.availability_status,
    case when entry.provider_model_id='gpt-5.6-luna' then entry.availability_evidence||jsonb_build_object(
      'motion_broll_test_cost_policy_revision_id',cost_id,'motion_broll_test_pricing_revision_id',pricing_id)
      else entry.availability_evidence end,entry.lifecycle_state,entry.rate_revision_id
  from tongs.openai_text_model_catalog_entries entry where entry.catalog_revision_id=previous_catalog_id;
  insert into tongs.openai_text_model_route_compatibility(
    id,catalog_entry_id,route_code,compatibility_status,maximum_input_tokens,maximum_output_tokens,
    maximum_attempts,supporting_cost_coverage,cost_policy_revision_id,evidence_json
  ) select extensions.uuid_generate_v5(extensions.uuid_generate_v5(catalog_id,'model:'||old.provider_model_id),'route:'||compat.route_code),
    extensions.uuid_generate_v5(catalog_id,'model:'||old.provider_model_id),compat.route_code,compat.compatibility_status,
    compat.maximum_input_tokens,compat.maximum_output_tokens,compat.maximum_attempts,
    compat.supporting_cost_coverage,compat.cost_policy_revision_id,compat.evidence_json
  from tongs.openai_text_model_route_compatibility compat
  join tongs.openai_text_model_catalog_entries old on old.id=compat.catalog_entry_id
  where old.catalog_revision_id=previous_catalog_id
    and not(old.provider_model_id='gpt-5.6-luna' and compat.route_code='motion.broll_interpretation');
  insert into tongs.openai_text_model_route_compatibility(
    id,catalog_entry_id,route_code,compatibility_status,maximum_input_tokens,maximum_output_tokens,
    maximum_attempts,supporting_cost_coverage,cost_policy_revision_id,evidence_json
  ) select extensions.uuid_generate_v5(entry.id,'motion.broll_interpretation'),entry.id,
    'motion.broll_interpretation','generation_verified',4096,1024,1,'complete',cost_id,
    jsonb_build_object('test_only',true,'api','responses','strict_json_schema',true,
      'response_byte_ceiling',16384,
      'browsing_requests',0,'retrieval_requests',0,'tools',0,'attachments',0,'fallback_models',0,
      'interpretation_contract','forge.broll-motion-interpretation.v1',
      'validator_contract','forge.broll-motion-validator.v1',
      'synthesis_contract','forge.broll-motion-synthesis.v1','pricing_revision_id',pricing_id)
  from tongs.openai_text_model_catalog_entries entry
  where entry.catalog_revision_id=catalog_id and entry.provider_model_id='gpt-5.6-luna';

  insert into tongs.openai_text_rollout_revisions(
    route_code,revision,mode,cost_policy_revision_id,reason,actor_id,funding_scope
  ) values('motion.broll_interpretation',3,'enforce',cost_id,
    'Replace the historical halt only for bounded Forge-funded normal-customer Test motion-prompt interpretation; Live remains inactive.',actor,'forge');
end $$;

insert into tongs.openai_text_failure_loss_policy_revisions(
  id,route_code,environment,revision,per_operation_limit_micros,aggregate_limit_micros,
  rolling_window_seconds,maximum_concurrency,lifecycle_state,reason,actor_id
) select row_value.id,'motion.broll_interpretation',row_value.environment,1,2049,2049,86400,1,'active',row_value.reason,operator.user_id
from (values
  ('19720000-0000-4000-8000-000000000009'::uuid,'test','One full-ceiling Test motion-prompt interpretation canary; exactly one provider attempt.'),
  ('19720000-0000-4000-8000-000000000010'::uuid,'live','Defensive parity policy only; no Live customer scope or activation.')
) row_value(id,environment,reason)
cross join lateral(select user_id from tongs.platform_operators order by granted_at limit 1) operator;
insert into tongs.openai_text_failure_loss_rollout_revisions(
  route_code,financial_environment,revision,mode,loss_policy_revision_id,source_limit_event_id,reason,actor_id
) select 'motion.broll_interpretation',row_value.environment,1,'enforce',row_value.policy_id,null,row_value.reason,operator.user_id
from (values
  ('test','19720000-0000-4000-8000-000000000009'::uuid,'Enforce one 2049-micro Test motion-prompt exposure.'),
  ('live','19720000-0000-4000-8000-000000000010'::uuid,'No Live motion-prompt execution scope exists.')
) row_value(environment,policy_id,reason)
cross join lateral(select user_id from tongs.platform_operators order by granted_at limit 1) operator;

insert into tongs.customer_paid_execution_scope_authorizations(
  id,user_id,workspace_id,financial_environment,route_code,provider,model_or_sku,
  pricing_revision_id,cost_policy_revision_id,maximum_operation_count,maximum_customer_charge_micros,
  maximum_wholesale_exposure_micros,maximum_concurrency,rolling_window_seconds,valid_from,valid_until,
  status,reason,created_by,authorization_kind
) select extensions.uuid_generate_v5(base.id,'motion.broll_interpretation'),base.user_id,base.workspace_id,
  'test','motion.broll_interpretation','openai','gpt-5.6-luna',
  '19720000-0000-4000-8000-000000000006','19720000-0000-4000-8000-000000000001',
  null,5000,2049,1,null,now(),null,'active',
  'Approved one-credit bounded Test motion-prompt interpretation; one provider attempt while Live remains inactive.',
  base.created_by,'normal_customer'
from tongs.customer_paid_execution_scope_authorizations base
where base.financial_environment='test' and base.route_code='hearth.thumbnail_base_generation'
  and base.provider='openai' and base.status='active' and base.authorization_kind='normal_customer';

do $$
begin
  if not exists(select 1 from tongs.openai_text_cost_policy_revisions
    where id='19720000-0000-4000-8000-000000000001'
      and route_code='motion.broll_interpretation' and revision=3
      and maximum_input_units=4096 and maximum_output_units=1024 and maximum_attempts=1
      and direct_provider_ceiling_micros=2049 and supporting_cost_ceiling_micros=0
      and full_cost_ceiling_micros=2049 and cost_coverage='complete' and lifecycle_state='active')
  then raise exception 'motion-B-roll supplier-cost policy mismatch'; end if;
  if not exists(select 1 from tongs.private_pricing_revisions
    where id='19720000-0000-4000-8000-000000000006'
      and markup_basis_points=3300 and full_cost_ceiling_micros=2049
      and failure_cost_ceiling_micros=0 and customer_price_ceiling_micros=5000
      and billable_failure_ceiling_micros=0 and customer_credit_units=1
      and unrounded_customer_price_micros=2726 and rounding_adjustment_micros=2274
      and settled_customer_price_micros=5000)
  then raise exception 'motion-B-roll customer pricing mismatch'; end if;
  if not exists(select 1
    from tongs.openai_text_model_route_compatibility compatibility
    join tongs.openai_text_model_catalog_entries entry on entry.id=compatibility.catalog_entry_id
    where entry.catalog_revision_id='19720000-0000-4000-8000-000000000008'
      and entry.runtime_model_id='gpt-5.6-luna' and entry.provider_model_id='gpt-5.6-luna'
      and entry.rate_revision_id='56560000-0000-4000-8000-000000000001'
      and compatibility.route_code='motion.broll_interpretation'
      and compatibility.compatibility_status='generation_verified'
      and compatibility.maximum_input_tokens=4096 and compatibility.maximum_output_tokens=1024
      and compatibility.maximum_attempts=1 and compatibility.supporting_cost_coverage='complete'
      and compatibility.cost_policy_revision_id='19720000-0000-4000-8000-000000000001'
      and compatibility.evidence_json @> '{"test_only":true,"api":"responses","strict_json_schema":true,"response_byte_ceiling":16384,"browsing_requests":0,"retrieval_requests":0,"tools":0,"attachments":0,"fallback_models":0}'::jsonb)
  then raise exception 'exact GPT-5.6 Luna motion-B-roll compatibility mismatch'; end if;
  if not exists(select 1 from tongs.openai_text_rollout_revisions
    where route_code='motion.broll_interpretation' and revision=3 and mode='enforce'
      and cost_policy_revision_id='19720000-0000-4000-8000-000000000001' and funding_scope='forge')
  then raise exception 'bounded Test motion-B-roll rollout was not established'; end if;
  if not exists(select 1 from tongs.customer_paid_execution_scope_authorizations
    where route_code='motion.broll_interpretation' and financial_environment='test'
      and provider='openai' and model_or_sku='gpt-5.6-luna' and status='active'
      and authorization_kind='normal_customer')
  then raise exception 'normal-customer Test motion-B-roll scope was not established'; end if;
  if exists(select 1 from tongs.customer_paid_execution_scope_authorizations
    where route_code='motion.broll_interpretation' and status='active'
      and (financial_environment<>'test' or authorization_kind<>'normal_customer'
        or provider<>'openai' or model_or_sku<>'gpt-5.6-luna'
        or pricing_revision_id<>'19720000-0000-4000-8000-000000000006'
        or cost_policy_revision_id<>'19720000-0000-4000-8000-000000000001'
        or maximum_customer_charge_micros<>5000 or maximum_wholesale_exposure_micros<>2049
        or maximum_concurrency<>1))
  then raise exception 'motion-B-roll scope escaped the approved Test normal-customer bounds'; end if;
  if not exists(select 1 from tongs.openai_text_failure_loss_policy_revisions
    where id='19720000-0000-4000-8000-000000000009' and route_code='motion.broll_interpretation'
      and environment='test' and per_operation_limit_micros=2049 and aggregate_limit_micros=2049
      and rolling_window_seconds=86400 and maximum_concurrency=1 and lifecycle_state='active')
  then raise exception 'motion-B-roll Test failure-loss policy mismatch'; end if;
  if exists(select 1 from tongs.customer_paid_execution_scope_authorizations
    where route_code='motion.broll_interpretation' and financial_environment='live' and status='active')
  then raise exception 'Live motion-B-roll scope must remain absent'; end if;
  if (select lifecycle_state from tongs.financial_environment_configuration_revisions
      where environment='live' order by revision desc limit 1)<>'inactive_ready'
  then raise exception 'Live changed during motion-B-roll activation'; end if;
end $$;

commit;
