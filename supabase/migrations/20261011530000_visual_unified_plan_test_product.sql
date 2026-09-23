-- Productize the existing unified Visual Plan operation for normal Test
-- customers. The four-child canonical operation remains authoritative. Live
-- receives defensive configuration only and no customer execution scope.
begin;

do $$
begin
  if not exists (
    select 1 from tongs.openai_text_provider_rate_revisions
    where id='56560000-0000-4000-8000-000000000001'
      and runtime_model_alias='gpt-5.6-luna'
      and input_micros_per_million_tokens=200000
      and output_micros_per_million_tokens=1200000
  ) then raise exception 'exact Luna rate revision is unavailable'; end if;
  if not exists (
    select 1 from tongs.openai_text_model_catalog_revisions
    where id='16000000-0000-4000-8000-000000000005'
      and revision=9 and lifecycle_state='active'
  ) then raise exception 'active model catalog revision 9 is unavailable'; end if;
  if not exists (
    select 1 from tongs.financial_environment_configuration_revisions
    where environment='test' and revision=4 and lifecycle_state='customer_rollout_active'
  ) then raise exception 'active Test customer financial path is unavailable'; end if;
  if (select lifecycle_state from tongs.financial_environment_configuration_revisions
      where environment='live' order by revision desc limit 1)<>'inactive_ready'
  then raise exception 'Live must remain inactive-ready'; end if;
  if not exists (
    select 1 from tongs.openai_text_route_policies
    where route_code='visual.unified_plan' and maximum_input_units=64000
      and maximum_output_units=16000 and maximum_attempts=1
      and rollout_mode='inactive'
  ) then raise exception 'historical Visual Plan route policy is unavailable'; end if;
  if (select mode from tongs.openai_text_rollout_revisions
      where route_code='visual.unified_plan' order by revision desc limit 1)
      not in ('inactive','halt_new')
  then raise exception 'Visual Plan must remain unavailable before Test productization'; end if;
  if exists (
    select 1 from tongs.openai_text_cost_policy_revisions
    where route_code='visual.unified_plan' and revision>=3
  ) then raise exception 'modern Visual Plan cost authority already exists'; end if;
end $$;

insert into tongs.openai_text_cost_policy_revisions(
  id,route_code,revision,policy_code,attempt_plan,maximum_input_units,
  maximum_output_units,maximum_attempts,direct_provider_ceiling_micros,
  supporting_cost_ceiling_micros,full_cost_ceiling_micros,cost_coverage,
  lifecycle_state,notes
) values (
  '17000000-0000-4000-8000-000000000001','visual.unified_plan',3,
  'openai-text:visual-unified-plan:test-luna-v3',
  '[{"attempt":1,"rate_revision_id":"56560000-0000-4000-8000-000000000001","runtime_model":"gpt-5.6-luna","provider_model_id":"gpt-5.6-luna","input_max":32000,"output_max":6144}]',
  32000,6144,1,13773,0,13773,'complete','active',
  'Ceil(32000*0.20 + 6144*1.20)=13773 micros direct maximum. Existing validation, four-child persistence, readback, Supabase, and Netlify are platform overhead with no verified attributable variable allocation.'
);

insert into tongs.openai_text_supporting_cost_inventory(
  id,route_code,cost_policy_revision_id,component_code,disposition,evidence_status,notes
) values
  ('27000000-0000-4000-8000-000000000001','visual.unified_plan','17000000-0000-4000-8000-000000000001','openai_unified_visual_plan','attributable_metered','verified','One Luna Responses attempt is the only metered supplier cost.'),
  ('27000000-0000-4000-8000-000000000002','visual.unified_plan','17000000-0000-4000-8000-000000000001','four_child_validation_and_persistence','platform_overhead','verified','Existing canonical Image, B-roll, Reference Clip, and Reference Visual commits have no verified variable allocation.'),
  ('27000000-0000-4000-8000-000000000003','visual.unified_plan','17000000-0000-4000-8000-000000000001','fixed_netlify_supabase_and_evidence_retention','platform_overhead','verified','Fixed hosting, database, and private evidence retention are not operation wholesale.');

do $$
declare
  actor uuid;
  policy_id constant uuid := '17000000-0000-4000-8000-000000000002';
  pricing_id constant uuid := '17000000-0000-4000-8000-000000000003';
  cost_id constant uuid := '17000000-0000-4000-8000-000000000001';
  catalog_id constant uuid := '17000000-0000-4000-8000-000000000005';
  sku constant text := 'openai-text:visual.unified_plan:gpt-5.6-luna:17000000-0000-4000-8000-000000000001';
begin
  select user_id into actor from tongs.platform_operators order by granted_at limit 1;
  if actor is null then raise exception 'platform operator required'; end if;

  insert into tongs.private_pricing_policies(id,policy_code,scope_kind,provider,sku,created_by)
  values(policy_id,'forge-visual-unified-plan-test-luna-v1','sku','openai',sku,actor);
  insert into tongs.private_pricing_revisions(
    id,policy_id,revision,previous_revision_id,lifecycle_state,currency,
    markup_basis_points,full_cost_ceiling_micros,failure_cost_ceiling_micros,
    customer_price_ceiling_micros,billable_failure_ceiling_micros,
    customer_credit_units,billable_failure_classes,free_failure_classes,
    included_quantity,retention_policy,change_reason,content_hash,actor_id,
    unrounded_customer_price_micros,rounding_adjustment_micros,
    settled_customer_price_micros
  ) values (
    pricing_id,policy_id,1,null,'review_ready','USD',3300,13773,0,
    20000,0,4,'[]',
    '["provider_failure","forge_failure","validation_failure","persistence_failure"]',
    '{"input_tokens":32000,"output_tokens":6144,"provider_attempts":1,"browsing_requests":0,"retrieval_requests":0,"tools":0,"attachments":0}',
    '{"unified_visual_plan_operation":"platform_overhead","four_child_canonical_commit":"platform_overhead","validation_evidence":"platform_overhead"}',
    'Approved four-credit Test unified Visual Plan product, direct supplier cost only.',
    encode(extensions.digest(convert_to('forge-visual-unified-plan-test-luna-v1:13773:18319:1681:20000:4','utf8'),'sha256'),'hex'),
    actor,18319,1681,20000
  );
  insert into tongs.private_pricing_cost_components(
    pricing_revision_id,ordinal,component_code,component_kind,credential_funding,
    provider_label,success_ceiling_micros,failure_ceiling_micros,
    cost_policy_revision,tail_policy,tail_policy_details
  ) values
    (pricing_id,1,'openai_unified_visual_plan','direct_provider','forge','OpenAI',13773,0,'Luna rate 2026-09-20','none','{"input_ceiling_micros":6400,"output_ceiling_micros":7373}'),
    (pricing_id,2,'verified_variable_supporting_cost','compute','forge','Forge',0,0,'Direct-only approved basis 2026-09-23','none','{"verified_attributable_variable_micros":0}'),
    (pricing_id,3,'fixed_platform_and_evidence_retention','retention_tail','forge','Forge platform',0,0,'Supporting-cost policy 2026-09-23','plan_funded','{"classification":"platform_overhead","operation_allocation_micros":0}');
  insert into tongs.private_pricing_revision_markup_sources(
    pricing_revision_id,markup_rule_revision_id,effective_markup_basis_points
  ) select pricing_id,markup_rule_revision_id,3300
    from tongs.private_pricing_revision_markup_sources
    where pricing_revision_id='16000000-0000-4000-8000-000000000003';
  if not found then raise exception 'canonical 33-percent markup source unavailable'; end if;
  insert into tongs.private_pricing_publications(
    id,policy_id,pricing_revision_id,publication_revision,action,reason,actor_id
  ) values (
    '17000000-0000-4000-8000-000000000004',policy_id,pricing_id,1,'published',
    'Publish only for the bounded Test customer scope; no Live customer authority.',actor
  );

  insert into tongs.openai_text_model_catalog_revisions(
    id,revision,lifecycle_state,quality_method,source_checked_at,content_hash,actor_id
  ) values (
    catalog_id,10,'active','Revision 9 evidence retained; Luna gains bounded structured unified Visual Plan compatibility.',
    '2026-09-23T00:00:00Z',
    encode(extensions.digest(convert_to('openai-model-catalog:10:visual-unified-plan-test-luna','utf8'),'sha256'),'hex'),actor
  );
  insert into tongs.openai_text_model_catalog_entries(
    id,catalog_revision_id,runtime_model_id,provider_model_id,display_name,
    tradeoff_summary,quality_rank,quality_basis,supported_apis,
    availability_status,availability_evidence,lifecycle_state,rate_revision_id
  ) select extensions.uuid_generate_v5(catalog_id,entry.provider_model_id),catalog_id,
    entry.runtime_model_id,entry.provider_model_id,entry.display_name,entry.tradeoff_summary,
    entry.quality_rank,entry.quality_basis,entry.supported_apis,entry.availability_status,
    case when entry.provider_model_id='gpt-5.6-luna' then
      entry.availability_evidence||jsonb_build_object(
        'visual_unified_plan_test_cost_policy_revision_id',cost_id,
        'visual_unified_plan_test_pricing_revision_id',pricing_id
      ) else entry.availability_evidence end,
    entry.lifecycle_state,entry.rate_revision_id
  from tongs.openai_text_model_catalog_entries entry
  where entry.catalog_revision_id='16000000-0000-4000-8000-000000000005';
  insert into tongs.openai_text_model_route_compatibility(
    id,catalog_entry_id,route_code,compatibility_status,maximum_input_tokens,
    maximum_output_tokens,maximum_attempts,supporting_cost_coverage,
    cost_policy_revision_id,evidence_json
  ) select extensions.uuid_generate_v5(
      extensions.uuid_generate_v5(catalog_id,old_entry.provider_model_id),compatibility.route_code),
    extensions.uuid_generate_v5(catalog_id,old_entry.provider_model_id),compatibility.route_code,
    compatibility.compatibility_status,compatibility.maximum_input_tokens,
    compatibility.maximum_output_tokens,compatibility.maximum_attempts,
    compatibility.supporting_cost_coverage,compatibility.cost_policy_revision_id,
    compatibility.evidence_json
  from tongs.openai_text_model_route_compatibility compatibility
  join tongs.openai_text_model_catalog_entries old_entry on old_entry.id=compatibility.catalog_entry_id
  where old_entry.catalog_revision_id='16000000-0000-4000-8000-000000000005';
  insert into tongs.openai_text_model_route_compatibility(
    id,catalog_entry_id,route_code,compatibility_status,maximum_input_tokens,
    maximum_output_tokens,maximum_attempts,supporting_cost_coverage,
    cost_policy_revision_id,evidence_json
  ) select extensions.uuid_generate_v5(entry.id,'visual.unified_plan'),entry.id,
    'visual.unified_plan','generation_verified',32000,6144,1,'complete',cost_id,
    jsonb_build_object('test_only',true,'responses_json_schema',true,
      'browsing_requests',0,'retrieval_requests',0,'tools',0,'attachments',0,
      'provider_contract_version','forge.unified-visual-plan-provider.v4',
      'canonical_four_child_commit_required',true,'pricing_revision_id',pricing_id)
  from tongs.openai_text_model_catalog_entries entry
  where entry.catalog_revision_id=catalog_id and entry.provider_model_id='gpt-5.6-luna';
  insert into tongs.openai_text_rollout_revisions(
    route_code,revision,mode,cost_policy_revision_id,reason,actor_id,funding_scope
  ) select 'visual.unified_plan',coalesce(max(revision),0)+1,'enforce',cost_id,
    'Supersede the historical inactive/halt authority only for authorized Forge-funded Test customers; Live remains inactive.',actor,'forge'
  from tongs.openai_text_rollout_revisions where route_code='visual.unified_plan';
end $$;

insert into tongs.openai_text_failure_loss_policy_revisions(
  id,route_code,environment,revision,per_operation_limit_micros,
  aggregate_limit_micros,rolling_window_seconds,maximum_concurrency,
  lifecycle_state,reason,actor_id
) select row_value.id,'visual.unified_plan',row_value.environment,1,13773,13773,
  86400,1,'active',row_value.reason,operator.user_id
from (values
  ('17000000-0000-4000-8000-000000000006'::uuid,'test','Approved one-attempt Test unified Visual Plan canary: one 13773-micro maximum supplier exposure.'),
  ('17000000-0000-4000-8000-000000000007'::uuid,'live','Defensive parity policy only; no Live customer scope or activation.')
) row_value(id,environment,reason)
cross join lateral(select user_id from tongs.platform_operators order by granted_at limit 1) operator;
insert into tongs.openai_text_failure_loss_rollout_revisions(
  route_code,financial_environment,revision,mode,loss_policy_revision_id,
  source_limit_event_id,reason,actor_id
) select 'visual.unified_plan',row_value.environment,1,'enforce',row_value.policy_id,
  null,row_value.reason,operator.user_id
from (values
  ('test','17000000-0000-4000-8000-000000000006'::uuid,'Enforce approved Test unified Visual Plan exposure.'),
  ('live','17000000-0000-4000-8000-000000000007'::uuid,'No Live execution scope exists.')
) row_value(environment,policy_id,reason)
cross join lateral(select user_id from tongs.platform_operators order by granted_at limit 1) operator;

do $$
begin
  if (select count(*) from tongs.customer_paid_execution_scope_authorizations
      where authorization_kind='normal_customer' and financial_environment='test'
        and route_code='hearth.chat_completion' and provider='openai'
        and model_or_sku='gpt-5.6-luna' and status='active')<>1
  then raise exception 'exactly one active normal Test chat scope is required'; end if;
end $$;
insert into tongs.customer_paid_execution_scope_authorizations(
  id,user_id,workspace_id,financial_environment,route_code,provider,model_or_sku,
  pricing_revision_id,cost_policy_revision_id,maximum_operation_count,
  maximum_customer_charge_micros,maximum_wholesale_exposure_micros,
  maximum_concurrency,rolling_window_seconds,valid_from,valid_until,status,
  reason,created_by,authorization_kind
) select extensions.uuid_generate_v5(chat.id,'visual.unified_plan'),chat.user_id,chat.workspace_id,
  'test','visual.unified_plan','openai','gpt-5.6-luna',
  '17000000-0000-4000-8000-000000000003','17000000-0000-4000-8000-000000000001',
  null,20000,13773,1,null,now(),null,'active',
  'Approved four-credit bounded Test unified Visual Plan canary.',
  chat.created_by,'normal_customer'
from tongs.customer_paid_execution_scope_authorizations chat
where chat.financial_environment='test' and chat.route_code='hearth.chat_completion'
  and chat.provider='openai' and chat.model_or_sku='gpt-5.6-luna'
  and chat.status='active' and chat.authorization_kind='normal_customer';

-- Extend the existing generic private validation-evidence authority to the
-- unified Visual Plan contract. The table, immutability, RLS, and service-only
-- permissions installed by Framing Pack remain unchanged.
create or replace function tongs.record_openai_text_validation_failure_evidence(
  p_route_code text,p_operation_id text,p_reservation_id uuid,p_provider_request_id text,
  p_model text,p_input_units bigint,p_output_units bigint,p_raw_provider_response_text text,
  p_validation_error_code text,p_validation_contract_revision text
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare
  binding tongs.openai_text_funding_bindings%rowtype;
  capture tongs.openai_text_provider_captures%rowtype;
  existing tongs.openai_text_validation_failure_evidence%rowtype;
  evidence_id uuid:=extensions.uuid_generate_v5(p_reservation_id,'openai-text-validation-failure-v1');
begin
  perform tongs._require_pricing_service_role();
  perform pg_advisory_xact_lock(hashtextextended('openai-text-validation-failure:'||p_reservation_id::text,0));
  select * into binding from tongs.openai_text_funding_bindings
  where operation_id=btrim(p_operation_id) and reservation_id=p_reservation_id
    and route_code=p_route_code;
  select * into capture from tongs.openai_text_provider_captures
  where reservation_id=p_reservation_id and attempt_number=1;
  if p_route_code not in ('hearth.framing_pack_generation','visual.unified_plan')
    or binding.reservation_id is null or binding.model<>'gpt-5.6-luna'
    or binding.maximum_attempts<>1 or capture.id is null
    or capture.provider_request_id is distinct from nullif(btrim(coalesce(p_provider_request_id,'')),'')
    or capture.input_units is distinct from p_input_units
    or capture.output_units is distinct from p_output_units
    or capture.response_evidence_json->>'raw_provider_response_text' is distinct from p_raw_provider_response_text
    or p_model is distinct from binding.model
    or (p_route_code='hearth.framing_pack_generation'
      and p_validation_contract_revision is distinct from 'framing_pack_seven_sections.v1')
    or (p_route_code='visual.unified_plan'
      and p_validation_contract_revision is distinct from 'forge.unified-visual-plan-provider.v4')
    or p_validation_error_code!~'^[a-z][a-z0-9_]{2,100}$'
    or octet_length(coalesce(p_raw_provider_response_text,'')) not between 1 and 65536
  then raise exception 'invalid OpenAI text validation evidence' using errcode='22023'; end if;
  select * into existing from tongs.openai_text_validation_failure_evidence
  where reservation_id=p_reservation_id or operation_id=btrim(p_operation_id);
  if found then
    if existing.route_code is distinct from p_route_code
      or existing.provider_capture_id is distinct from capture.id
      or existing.raw_provider_response_text is distinct from p_raw_provider_response_text
      or existing.validation_error_code is distinct from p_validation_error_code
      or existing.validation_contract_revision is distinct from p_validation_contract_revision
    then raise exception 'OpenAI text validation evidence replay conflict' using errcode='23505'; end if;
    return jsonb_build_object('evidence_id',existing.id,'replay',true);
  end if;
  insert into tongs.openai_text_validation_failure_evidence(
    id,route_code,operation_id,reservation_id,provider_capture_id,provider_request_id,
    model,input_units,output_units,raw_provider_response_text,validation_error_code,
    validation_contract_revision
  ) values(evidence_id,p_route_code,btrim(p_operation_id),p_reservation_id,capture.id,
    capture.provider_request_id,p_model,p_input_units,p_output_units,p_raw_provider_response_text,
    p_validation_error_code,p_validation_contract_revision);
  return jsonb_build_object('evidence_id',evidence_id,'replay',false);
end $$;
revoke all on function tongs.record_openai_text_validation_failure_evidence(
  text,text,uuid,text,text,bigint,bigint,text,text,text
) from public,anon,authenticated;
grant execute on function tongs.record_openai_text_validation_failure_evidence(
  text,text,uuid,text,text,bigint,bigint,text,text,text
) to service_role;

do $$
begin
  if (select count(*) from tongs.customer_paid_execution_scope_authorizations
      where route_code='visual.unified_plan' and financial_environment='test'
        and authorization_kind='normal_customer' and status='active')<>1
  then raise exception 'exactly one Test Visual Plan scope is required'; end if;
  if exists(select 1 from tongs.customer_paid_execution_scope_authorizations
      where route_code='visual.unified_plan' and financial_environment='live'
        and status='active')
  then raise exception 'Live Visual Plan scope must remain absent'; end if;
  if not exists(select 1 from tongs.private_pricing_revisions
      where id='17000000-0000-4000-8000-000000000003'
        and customer_credit_units=4 and settled_customer_price_micros=20000
        and full_cost_ceiling_micros=13773)
  then raise exception 'Visual Plan economics mismatch'; end if;
end $$;

notify pgrst,'reload schema';
commit;
