-- Dedicated one-canary Test authority for title-agnostic Thumbnail Base generation.
-- The existing generic paid-media path remains immutable historical evidence.
begin;

do $$
begin
  if not exists(select 1 from tongs.openai_text_model_catalog_revisions where revision=12 and lifecycle_state='active')
  then raise exception 'active model catalog revision 12 is unavailable'; end if;
  if exists(select 1 from tongs.openai_text_route_policies where route_code='hearth.thumbnail_base_generation')
  then raise exception 'Thumbnail Base Generation route already exists'; end if;
  if (select lifecycle_state from tongs.financial_environment_configuration_revisions
      where environment='live' order by revision desc limit 1)<>'inactive_ready'
  then raise exception 'Live must remain inactive-ready'; end if;
end $$;

insert into tongs.openai_text_provider_rate_revisions(
  id,provider,runtime_model_alias,provider_model_id,revision,
  input_micros_per_million_tokens,cached_input_micros_per_million_tokens,
  output_micros_per_million_tokens,maximum_context_tokens,maximum_output_tokens,
  source_url,source_checked_at,content_hash
) values (
  '19630000-0000-4000-8000-000000000001','openai','gpt-image-2-2026-04-21',
  'gpt-image-2-2026-04-21',1,0,0,167450000000,16384,1,
  'https://developers.openai.com/api/docs/models/gpt-image-2',
  '2026-09-23T00:00:00Z',
  encode(extensions.digest(convert_to('openai:gpt-image-2-2026-04-21:1536x1024:high:png:167450','utf8'),'sha256'),'hex')
);

insert into tongs.openai_text_route_policies(
  route_code,product_area,provider_operation,maximum_input_units,maximum_output_units,
  maximum_attempts,requires_result_validation,requires_canonical_persistence,
  byo_supported,rollout_mode,notes
) values (
  'hearth.thumbnail_base_generation','hearth','responses',16384,1,1,true,true,false,
  'inactive','One title-agnostic OpenAI image generation: POST /v1/images/generations, gpt-image-2-2026-04-21, one 1536x1024 high PNG, no references, no fallback, Test only.'
);

insert into tongs.openai_text_cost_policy_revisions(
  id,route_code,revision,policy_code,attempt_plan,maximum_input_units,
  maximum_output_units,maximum_attempts,direct_provider_ceiling_micros,
  supporting_cost_ceiling_micros,full_cost_ceiling_micros,cost_coverage,
  lifecycle_state,notes
) values (
  '19630000-0000-4000-8000-000000000002','hearth.thumbnail_base_generation',1,
  'openai-image:hearth-thumbnail-base-generation:test-v1',
  '[{"attempt":1,"rate_revision_id":"19630000-0000-4000-8000-000000000001","runtime_model":"gpt-image-2-2026-04-21","provider_model_id":"gpt-image-2-2026-04-21","endpoint":"/v1/images/generations","size":"1536x1024","quality":"high","output_format":"png","image_count":1,"reference_images":0}]',
  16384,1,1,167450,0,167450,'complete','active',
  'Conservative direct/full supplier ceiling for exactly one no-reference 1536x1024 high PNG. Supporting variable cost is zero.'
);

insert into tongs.openai_text_supporting_cost_inventory(
  id,route_code,cost_policy_revision_id,component_code,disposition,evidence_status,notes
) values
  ('19630000-0000-4000-8000-000000000003','hearth.thumbnail_base_generation','19630000-0000-4000-8000-000000000002','openai_thumbnail_base_generation','attributable_metered','verified','One pinned OpenAI image generation is the only metered supplier cost.'),
  ('19630000-0000-4000-8000-000000000004','hearth.thumbnail_base_generation','19630000-0000-4000-8000-000000000002','fixed_netlify_supabase_plans','platform_overhead','verified','Fixed hosting and database plans are not operation wholesale.'),
  ('19630000-0000-4000-8000-000000000005','hearth.thumbnail_base_generation','19630000-0000-4000-8000-000000000002','asset_composite_and_evidence_retention','platform_overhead','verified','Canonical asset, composite, launch, and restricted evidence retention have no verified variable allocation.');

do $$
declare
  actor uuid;
  policy_id constant uuid := '19630000-0000-4000-8000-000000000006';
  pricing_id constant uuid := '19630000-0000-4000-8000-000000000007';
  cost_id constant uuid := '19630000-0000-4000-8000-000000000002';
  catalog_id constant uuid := '19630000-0000-4000-8000-000000000009';
  previous_catalog_id uuid;
  sku constant text := 'openai-image:hearth.thumbnail_base_generation:gpt-image-2-2026-04-21:19630000-0000-4000-8000-000000000002';
begin
  select user_id into actor from tongs.platform_operators order by granted_at limit 1;
  if actor is null then raise exception 'platform operator required'; end if;
  insert into tongs.private_pricing_policies(id,policy_code,scope_kind,provider,sku,created_by)
  values(policy_id,'forge-hearth-thumbnail-base-test-gpt-image-2-v1','sku','openai',sku,actor);
  insert into tongs.private_pricing_revisions(
    id,policy_id,revision,previous_revision_id,lifecycle_state,currency,
    markup_basis_points,full_cost_ceiling_micros,failure_cost_ceiling_micros,
    customer_price_ceiling_micros,billable_failure_ceiling_micros,
    customer_credit_units,billable_failure_classes,free_failure_classes,
    included_quantity,retention_policy,change_reason,content_hash,actor_id,
    unrounded_customer_price_micros,rounding_adjustment_micros,settled_customer_price_micros
  ) values (
    pricing_id,policy_id,1,null,'review_ready','USD',3300,167450,0,225000,0,45,'[]',
    '["pre_provider_rejection","provider_failure","forge_failure","validation_failure","persistence_failure"]',
    '{"images":1,"size":"1536x1024","quality":"high","format":"png","provider_attempts":1,"reference_images":0,"fallback_providers":0}',
    '{"provider_capture":"restricted_immutable","generated_bytes":"restricted_recoverable","canonical_thumbnail":"platform_overhead"}',
    'Approved 45-credit Test Thumbnail Base product. 33% target is 222709 micros; customer price rounds upward to the 45-credit grid.',
    encode(extensions.digest(convert_to('forge-hearth-thumbnail-base-test-v1:167450:222709:2291:225000:45','utf8'),'sha256'),'hex'),
    actor,222709,2291,225000
  );
  insert into tongs.private_pricing_cost_components(
    pricing_revision_id,ordinal,component_code,component_kind,credential_funding,
    provider_label,success_ceiling_micros,failure_ceiling_micros,
    cost_policy_revision,tail_policy,tail_policy_details
  ) values
    (pricing_id,1,'openai_thumbnail_base_generation','direct_provider','forge','OpenAI',167450,167450,'GPT Image 2 no-reference schedule checked 2026-09-23','none','{"endpoint":"/v1/images/generations","size":"1536x1024","quality":"high","images":1}'),
    (pricing_id,2,'verified_variable_supporting_cost','compute','forge','Forge',0,0,'Direct-only approved basis 2026-09-23','none','{"verified_attributable_variable_micros":0}'),
    (pricing_id,3,'fixed_platform_and_evidence_retention','retention_tail','forge','Forge platform',0,0,'Supporting-cost policy 2026-09-23','plan_funded','{"classification":"platform_overhead","operation_allocation_micros":0}');
  insert into tongs.private_pricing_revision_markup_sources(
    pricing_revision_id,markup_rule_revision_id,effective_markup_basis_points
  ) select pricing_id,markup_rule_revision_id,3300
    from tongs.private_pricing_revision_markup_sources
    where pricing_revision_id='18000000-0000-4000-8000-000000000003';
  if not found then raise exception 'canonical 33-percent markup source unavailable'; end if;
  insert into tongs.private_pricing_publications(
    id,policy_id,pricing_revision_id,publication_revision,action,reason,actor_id
  ) values ('19630000-0000-4000-8000-000000000008',policy_id,pricing_id,1,'published',
    'Publish only for one bounded Test customer scope; Live remains inactive.',actor);

  select id into previous_catalog_id from tongs.openai_text_model_catalog_revisions
  where revision=12 and lifecycle_state='active' limit 1;
  insert into tongs.openai_text_model_catalog_revisions(
    id,revision,lifecycle_state,quality_method,source_checked_at,content_hash,actor_id
  ) values (catalog_id,13,'active','Revision 12 retained; add one bounded no-reference Thumbnail Base compatibility.',
    '2026-09-23T00:00:00Z',encode(extensions.digest(convert_to('openai-model-catalog:13:thumbnail-base-gpt-image-2','utf8'),'sha256'),'hex'),actor);
  insert into tongs.openai_text_model_catalog_entries(
    id,catalog_revision_id,runtime_model_id,provider_model_id,display_name,
    tradeoff_summary,quality_rank,quality_basis,supported_apis,
    availability_status,availability_evidence,lifecycle_state,rate_revision_id
  ) select extensions.uuid_generate_v5(catalog_id,'model:'||entry.provider_model_id),catalog_id,
    entry.runtime_model_id,entry.provider_model_id,entry.display_name,entry.tradeoff_summary,
    entry.quality_rank,entry.quality_basis,entry.supported_apis,entry.availability_status,
    entry.availability_evidence,entry.lifecycle_state,entry.rate_revision_id
  from tongs.openai_text_model_catalog_entries entry where entry.catalog_revision_id=previous_catalog_id;
  insert into tongs.openai_text_model_catalog_entries(
    id,catalog_revision_id,runtime_model_id,provider_model_id,display_name,
    tradeoff_summary,quality_rank,quality_basis,supported_apis,
    availability_status,availability_evidence,lifecycle_state,rate_revision_id
  ) values (
    extensions.uuid_generate_v5(catalog_id,'model:gpt-image-2-2026-04-21'),catalog_id,
    'gpt-image-2-2026-04-21','gpt-image-2-2026-04-21','GPT Image 2','Pinned high-quality base artwork generation.',
    1,'Approved exact model snapshot and no-reference image shape.','["images.generations"]','generation_compatible',
    jsonb_build_object('endpoint','/v1/images/generations','checked_at','2026-09-23T00:00:00Z','pricing_revision_id',pricing_id),
    'active','19630000-0000-4000-8000-000000000001'
  );
  insert into tongs.openai_text_model_route_compatibility(
    id,catalog_entry_id,route_code,compatibility_status,maximum_input_tokens,
    maximum_output_tokens,maximum_attempts,supporting_cost_coverage,
    cost_policy_revision_id,evidence_json
  ) select extensions.uuid_generate_v5(
      extensions.uuid_generate_v5(catalog_id,'model:'||old_entry.provider_model_id),'route:'||compatibility.route_code),
    extensions.uuid_generate_v5(catalog_id,'model:'||old_entry.provider_model_id),compatibility.route_code,
    compatibility.compatibility_status,compatibility.maximum_input_tokens,
    compatibility.maximum_output_tokens,compatibility.maximum_attempts,
    compatibility.supporting_cost_coverage,compatibility.cost_policy_revision_id,compatibility.evidence_json
  from tongs.openai_text_model_route_compatibility compatibility
  join tongs.openai_text_model_catalog_entries old_entry on old_entry.id=compatibility.catalog_entry_id
  where old_entry.catalog_revision_id=previous_catalog_id;
  insert into tongs.openai_text_model_route_compatibility(
    id,catalog_entry_id,route_code,compatibility_status,maximum_input_tokens,
    maximum_output_tokens,maximum_attempts,supporting_cost_coverage,
    cost_policy_revision_id,evidence_json
  ) values (
    extensions.uuid_generate_v5(extensions.uuid_generate_v5(catalog_id,'model:gpt-image-2-2026-04-21'),'hearth.thumbnail_base_generation'),
    extensions.uuid_generate_v5(catalog_id,'model:gpt-image-2-2026-04-21'),
    'hearth.thumbnail_base_generation','generation_verified',16384,1,1,'complete',cost_id,
    jsonb_build_object('test_only',true,'endpoint','/v1/images/generations','size','1536x1024',
      'quality','high','output_format','png','image_count',1,'reference_images',0,'fallback_providers',0,
      'provider_contract','forge.thumbnail-base-provider.v1','pricing_revision_id',pricing_id)
  );
  insert into tongs.openai_text_rollout_revisions(
    route_code,revision,mode,cost_policy_revision_id,reason,actor_id,funding_scope
  ) values ('hearth.thumbnail_base_generation',1,'enforce',cost_id,
    'Enable only the authorized Forge-funded Test customer scope; Live remains inactive.',actor,'forge');
end $$;

-- The shared quote/result coordinators are route-generic despite their historical names.
do $$
declare definition text;
begin
  select pg_get_functiondef('tongs.create_customer_openai_text_quote(uuid,uuid,text,text,uuid,text,text,text,text,timestamptz)'::regprocedure) into definition;
  definition:=replace(definition,'''hearth.thumbnail_direction_generation''',
    '''hearth.thumbnail_direction_generation'',''hearth.thumbnail_base_generation''');
  if position('''hearth.thumbnail_base_generation''' in definition)=0 then raise exception 'could not extend quote route allow-list'; end if;
  execute definition;
  select pg_get_functiondef('tongs.persist_openai_text_paid_result(uuid,text,text,uuid,uuid,uuid,text,text,text,text,bigint,bigint,text,jsonb)'::regprocedure) into definition;
  definition:=replace(definition,'''hearth.thumbnail_direction_generation''',
    '''hearth.thumbnail_direction_generation'',''hearth.thumbnail_base_generation''');
  if position('''hearth.thumbnail_base_generation''' in definition)=0 then raise exception 'could not extend result route allow-list'; end if;
  execute definition;
end $$;

insert into tongs.openai_text_failure_loss_policy_revisions(
  id,route_code,environment,revision,per_operation_limit_micros,aggregate_limit_micros,
  rolling_window_seconds,maximum_concurrency,lifecycle_state,reason,actor_id
) select row_value.id,'hearth.thumbnail_base_generation',row_value.environment,1,167450,167450,
  86400,1,'active',row_value.reason,operator.user_id
from (values
  ('19630000-0000-4000-8000-000000000010'::uuid,'test','One full-ceiling Test Thumbnail Base canary; exactly one concurrent provider attempt.'),
  ('19630000-0000-4000-8000-000000000011'::uuid,'live','Defensive parity policy only; no Live customer scope or activation.')
) row_value(id,environment,reason)
cross join lateral(select user_id from tongs.platform_operators order by granted_at limit 1) operator;
insert into tongs.openai_text_failure_loss_rollout_revisions(
  route_code,financial_environment,revision,mode,loss_policy_revision_id,
  source_limit_event_id,reason,actor_id
) select 'hearth.thumbnail_base_generation',row_value.environment,1,'enforce',row_value.policy_id,
  null,row_value.reason,operator.user_id
from (values
  ('test','19630000-0000-4000-8000-000000000010'::uuid,'Enforce one 167450-micro Test Thumbnail Base exposure.'),
  ('live','19630000-0000-4000-8000-000000000011'::uuid,'No Live execution scope exists.')
) row_value(environment,policy_id,reason)
cross join lateral(select user_id from tongs.platform_operators order by granted_at limit 1) operator;

insert into tongs.customer_paid_execution_scope_authorizations(
  id,user_id,workspace_id,financial_environment,route_code,provider,model_or_sku,
  pricing_revision_id,cost_policy_revision_id,maximum_operation_count,
  maximum_customer_charge_micros,maximum_wholesale_exposure_micros,
  maximum_concurrency,rolling_window_seconds,valid_from,valid_until,status,
  reason,created_by,authorization_kind
) select extensions.uuid_generate_v5(direction.id,'hearth.thumbnail_base_generation'),direction.user_id,direction.workspace_id,
  'test','hearth.thumbnail_base_generation','openai','gpt-image-2-2026-04-21',
  '19630000-0000-4000-8000-000000000007','19630000-0000-4000-8000-000000000002',
  null,225000,167450,1,null,now(),null,'active',
  'Approved 45-credit bounded Test Thumbnail Base canary; one operation only while Live remains inactive.',
  direction.created_by,'normal_customer'
from tongs.customer_paid_execution_scope_authorizations direction
where direction.financial_environment='test'
  and direction.route_code='hearth.thumbnail_direction_generation'
  and direction.provider='openai' and direction.status='active'
  and direction.authorization_kind='normal_customer';

create table tongs.hearth_thumbnail_base_generation_results(
  id uuid primary key,
  operation_id text not null unique references tongs.openai_text_funding_bindings(operation_id) on delete restrict,
  reservation_id uuid not null unique references tongs.funding_reservations(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  workspace_id uuid not null references tongs.workspaces(id) on delete restrict,
  workpiece_id uuid not null references tongs.episodes(id) on delete restrict,
  request_fingerprint text not null check(request_fingerprint~'^[0-9a-f]{64}$'),
  provider_body_sha256 text not null check(provider_body_sha256~'^[0-9a-f]{64}$'),
  prompt_package_hash text not null check(prompt_package_hash~'^[0-9a-f]{64}$'),
  render_recipe_id uuid not null,
  render_recipe_revision integer not null check(render_recipe_revision>0),
  concept_revision_id uuid not null,
  provider_request_id text,
  provider_response_id text,
  generated_bytes_base64 text,
  generated_content_hash text check(generated_content_hash is null or generated_content_hash~'^[0-9a-f]{64}$'),
  staged_asset_id uuid references tongs.assets(id) on delete restrict,
  staged_asset_path text,
  canonical_receipt_json jsonb check(canonical_receipt_json is null or jsonb_typeof(canonical_receipt_json)='object'),
  state text not null check(state in('provider_captured','asset_staged','canonical_complete','failed','submission_unknown')),
  failure_code text,
  failure_message text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create trigger hearth_thumbnail_base_generation_results_immutable
before update or delete on tongs.hearth_thumbnail_base_generation_results
for each row execute function tongs._reject_financial_mutation();
alter table tongs.hearth_thumbnail_base_generation_results enable row level security;
alter table tongs.hearth_thumbnail_base_generation_results force row level security;
revoke all on tongs.hearth_thumbnail_base_generation_results from public,anon,authenticated,service_role;
grant select on tongs.hearth_thumbnail_base_generation_results to service_role;

create function tongs.record_hearth_thumbnail_base_generation_result(
  p_operation_id text,p_request_fingerprint text,p_provider_body_sha256 text,
  p_prompt_package_hash text,p_render_recipe_id uuid,p_render_recipe_revision integer,
  p_concept_revision_id uuid,p_provider_request_id text,p_provider_response_id text,
  p_staged_asset_id uuid,p_canonical_receipt_json jsonb
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare
  binding_row tongs.openai_text_funding_bindings%rowtype;
  reservation_row tongs.funding_reservations%rowtype;
  quote_row tongs.customer_spending_quotes%rowtype;
  asset_row tongs.assets%rowtype;
  existing_row tongs.hearth_thumbnail_base_generation_results%rowtype;
  result_id uuid:=extensions.uuid_generate_v5(
    '19630000-0000-4000-8000-000000000012'::uuid,btrim(p_operation_id));
begin
  perform tongs._require_pricing_service_role();
  if p_operation_id is null or p_request_fingerprint!~'^[0-9a-f]{64}$'
     or p_provider_body_sha256!~'^[0-9a-f]{64}$' or p_prompt_package_hash!~'^[0-9a-f]{64}$'
     or p_render_recipe_id is null or p_render_recipe_revision<=0 or p_concept_revision_id is null
     or p_staged_asset_id is null or jsonb_typeof(p_canonical_receipt_json)<>'object'
  then raise exception 'invalid Thumbnail Base result evidence' using errcode='22023'; end if;
  select * into binding_row from tongs.openai_text_funding_bindings
    where operation_id=btrim(p_operation_id) and route_code='hearth.thumbnail_base_generation';
  if not found then raise exception 'Thumbnail Base funding binding not found' using errcode='P0002'; end if;
  select * into reservation_row from tongs.funding_reservations where id=binding_row.reservation_id;
  select * into quote_row from tongs.customer_spending_quotes where id=reservation_row.quote_id;
  select * into asset_row from tongs.assets where id=p_staged_asset_id;
  if quote_row.request_fingerprint<>lower(p_request_fingerprint)
     or asset_row.workspace_id<>quote_row.workspace_id
     or asset_row.workpiece_id is null
     or asset_row.request_id<>btrim(p_operation_id)
  then raise exception 'Thumbnail Base result evidence conflicts with canonical authority' using errcode='23505'; end if;
  select * into existing_row from tongs.hearth_thumbnail_base_generation_results
    where operation_id=btrim(p_operation_id);
  if found then
    if existing_row.reservation_id<>binding_row.reservation_id
       or existing_row.request_fingerprint<>lower(p_request_fingerprint)
       or existing_row.provider_body_sha256<>lower(p_provider_body_sha256)
       or existing_row.prompt_package_hash<>lower(p_prompt_package_hash)
       or existing_row.render_recipe_id<>p_render_recipe_id
       or existing_row.render_recipe_revision<>p_render_recipe_revision
       or existing_row.concept_revision_id<>p_concept_revision_id
       or existing_row.staged_asset_id<>p_staged_asset_id
    then raise exception 'Thumbnail Base result replay conflict' using errcode='23505'; end if;
    return jsonb_build_object('result_id',existing_row.id,'state',existing_row.state,'replay',true);
  end if;
  insert into tongs.hearth_thumbnail_base_generation_results(
    id,operation_id,reservation_id,user_id,workspace_id,workpiece_id,request_fingerprint,
    provider_body_sha256,prompt_package_hash,render_recipe_id,render_recipe_revision,
    concept_revision_id,provider_request_id,provider_response_id,generated_content_hash,
    staged_asset_id,staged_asset_path,canonical_receipt_json,state,completed_at
  ) values (
    result_id,btrim(p_operation_id),binding_row.reservation_id,reservation_row.user_id,
    quote_row.workspace_id,asset_row.workpiece_id,lower(p_request_fingerprint),
    lower(p_provider_body_sha256),lower(p_prompt_package_hash),p_render_recipe_id,
    p_render_recipe_revision,p_concept_revision_id,nullif(btrim(coalesce(p_provider_request_id,'')),''),
    nullif(btrim(coalesce(p_provider_response_id,'')),''),asset_row.content_hash,
    asset_row.id,asset_row.path,p_canonical_receipt_json,'asset_staged',now()
  );
  return jsonb_build_object('result_id',result_id,'state','asset_staged','replay',false);
end $$;
revoke all on function tongs.record_hearth_thumbnail_base_generation_result(text,text,text,text,uuid,integer,uuid,text,text,uuid,jsonb)
  from public,anon,authenticated;
grant execute on function tongs.record_hearth_thumbnail_base_generation_result(text,text,text,text,uuid,integer,uuid,text,text,uuid,jsonb)
  to service_role;

create function tongs.read_thumbnail_base_generation_authority(p_user_id uuid,p_workspace_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare scope_row tongs.customer_paid_execution_scope_authorizations%rowtype; risk jsonb;
begin
  perform tongs._require_pricing_service_role();
  select * into scope_row from tongs.customer_paid_execution_scope_authorizations
  where user_id=p_user_id and workspace_id=p_workspace_id and route_code='hearth.thumbnail_base_generation'
    and financial_environment='test' and status='active' and valid_from<=now() and (valid_until is null or valid_until>now())
  order by created_at desc limit 1;
  select to_jsonb(exposure) into risk from tongs._openai_text_failure_loss_exposure('hearth.thumbnail_base_generation','test',86400) exposure;
  return jsonb_build_object('route_code','hearth.thumbnail_base_generation','provider','openai',
    'model','gpt-image-2-2026-04-21','endpoint','/v1/images/generations','customer_price_credits',45,
    'supplier_ceiling_micros',167450,'supporting_cost_micros',0,'target_micros',222709,
    'scope',case when scope_row.id is null then null else to_jsonb(scope_row) end,'risk',coalesce(risk,'{}'::jsonb),
    'live_active_scope_count',(select count(*) from tongs.customer_paid_execution_scope_authorizations
      where route_code='hearth.thumbnail_base_generation' and financial_environment='live' and status='active'));
end $$;
revoke all on function tongs.read_thumbnail_base_generation_authority(uuid,uuid) from public,anon,authenticated;
grant execute on function tongs.read_thumbnail_base_generation_authority(uuid,uuid) to service_role;

do $$
begin
  if (select count(*) from tongs.customer_paid_execution_scope_authorizations
      where route_code='hearth.thumbnail_base_generation' and financial_environment='test'
        and authorization_kind='normal_customer' and status='active')<>1
  then raise exception 'exactly one Test Thumbnail Base scope is required'; end if;
  if exists(select 1 from tongs.customer_paid_execution_scope_authorizations
      where route_code='hearth.thumbnail_base_generation' and financial_environment='live' and status='active')
  then raise exception 'Live Thumbnail Base scope must remain absent'; end if;
  if not exists(select 1 from tongs.private_pricing_revisions
      where id='19630000-0000-4000-8000-000000000007' and customer_credit_units=45
        and full_cost_ceiling_micros=167450 and unrounded_customer_price_micros=222709
        and settled_customer_price_micros=225000)
  then raise exception 'Thumbnail Base economics mismatch'; end if;
  if not exists(select 1 from pg_class relation join pg_namespace namespace on namespace.oid=relation.relnamespace
      where namespace.nspname='tongs' and relation.relname='hearth_thumbnail_base_generation_results'
        and relation.relrowsecurity and relation.relforcerowsecurity)
  then raise exception 'Thumbnail Base result RLS must be enabled and forced'; end if;
  if has_table_privilege('authenticated','tongs.hearth_thumbnail_base_generation_results','select')
  then raise exception 'authenticated users must not read Thumbnail Base result evidence'; end if;
  if not has_table_privilege('service_role','tongs.hearth_thumbnail_base_generation_results','select')
  then raise exception 'service role must read Thumbnail Base result evidence'; end if;
end $$;

notify pgrst,'reload schema';
commit;
