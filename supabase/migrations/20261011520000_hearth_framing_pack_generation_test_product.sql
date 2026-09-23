-- One Forge-funded Test Framing Pack product. Live remains inactive-ready and
-- receives no customer execution scope. Existing Tag evidence objects are not changed.
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
    where id='15000000-0000-4000-8000-000000000005'
      and revision=8 and lifecycle_state='active'
  ) then raise exception 'active model catalog revision 8 is unavailable'; end if;
  if not exists (
    select 1 from tongs.financial_environment_configuration_revisions
    where environment='test' and revision=4 and lifecycle_state='customer_rollout_active'
  ) then raise exception 'active Test customer financial path is unavailable'; end if;
  if (select lifecycle_state from tongs.financial_environment_configuration_revisions
      where environment='live' order by revision desc limit 1)<>'inactive_ready'
  then raise exception 'Live must remain inactive-ready'; end if;
  if exists (select 1 from tongs.openai_text_route_policies
      where route_code='hearth.framing_pack_generation')
  then raise exception 'Framing Pack route already exists'; end if;
end $$;

insert into tongs.openai_text_route_policies(
  route_code,product_area,provider_operation,maximum_input_units,
  maximum_output_units,maximum_attempts,requires_result_validation,
  requires_canonical_persistence,byo_supported,rollout_mode,notes
) values (
  'hearth.framing_pack_generation','hearth','chat_completions',12000,2048,1,true,true,false,
  'inactive','Seven-section Pack from the current canonical approval; no browsing, retrieval, tools, attachments, retry, BYO, or Live scope.'
);

insert into tongs.openai_text_cost_policy_revisions(
  id,route_code,revision,policy_code,attempt_plan,maximum_input_units,
  maximum_output_units,maximum_attempts,direct_provider_ceiling_micros,
  supporting_cost_ceiling_micros,full_cost_ceiling_micros,cost_coverage,
  lifecycle_state,notes
) values (
  '16000000-0000-4000-8000-000000000001','hearth.framing_pack_generation',1,
  'openai-text:hearth-framing-pack-generation:test-luna-v1',
  '[{"attempt":1,"rate_revision_id":"56560000-0000-4000-8000-000000000001","runtime_model":"gpt-5.6-luna","provider_model_id":"gpt-5.6-luna","input_max":12000,"output_max":2048}]',
  12000,2048,1,4858,0,4858,'complete','active',
  'Ceil(12000*0.20 + 2048*1.20)=4858 micros direct maximum. No attributable variable supporting service.'
);

insert into tongs.openai_text_supporting_cost_inventory(
  id,route_code,cost_policy_revision_id,component_code,disposition,evidence_status,notes
) values
  ('26000000-0000-4000-8000-000000000001','hearth.framing_pack_generation','16000000-0000-4000-8000-000000000001','openai_framing_pack_generation','attributable_metered','verified','One Luna text attempt is the only metered supplier cost.'),
  ('26000000-0000-4000-8000-000000000002','hearth.framing_pack_generation','16000000-0000-4000-8000-000000000001','fixed_netlify_supabase_plans','platform_overhead','verified','Fixed hosting/database plans are not operation wholesale.'),
  ('26000000-0000-4000-8000-000000000003','hearth.framing_pack_generation','16000000-0000-4000-8000-000000000001','pack_and_evidence_retention','platform_overhead','verified','Canonical result, artifact, and evidence retention have no verified variable allocation.');

do $$
declare
  actor uuid;
  policy_id constant uuid := '16000000-0000-4000-8000-000000000002';
  pricing_id constant uuid := '16000000-0000-4000-8000-000000000003';
  cost_id constant uuid := '16000000-0000-4000-8000-000000000001';
  catalog_id constant uuid := '16000000-0000-4000-8000-000000000005';
  sku constant text := 'openai-text:hearth.framing_pack_generation:gpt-5.6-luna:16000000-0000-4000-8000-000000000001';
begin
  select user_id into actor from tongs.platform_operators order by granted_at limit 1;
  if actor is null then raise exception 'platform operator required'; end if;

  insert into tongs.private_pricing_policies(id,policy_code,scope_kind,provider,sku,created_by)
  values(policy_id,'forge-hearth-framing-pack-test-luna-v1','sku','openai',sku,actor);
  insert into tongs.private_pricing_revisions(
    id,policy_id,revision,previous_revision_id,lifecycle_state,currency,
    markup_basis_points,full_cost_ceiling_micros,failure_cost_ceiling_micros,
    customer_price_ceiling_micros,billable_failure_ceiling_micros,
    customer_credit_units,billable_failure_classes,free_failure_classes,
    included_quantity,retention_policy,change_reason,content_hash,actor_id,
    unrounded_customer_price_micros,rounding_adjustment_micros,
    settled_customer_price_micros
  ) values (
    pricing_id,policy_id,1,null,'review_ready','USD',3300,4858,0,
    10000,0,2,'[]',
    '["provider_failure","forge_failure","validation_failure","persistence_failure"]',
    '{"input_tokens":12000,"output_tokens":2048,"provider_attempts":1,"browsing_requests":0,"retrieval_requests":0,"tools":0,"attachments":0}',
    '{"framing_pack_result":"platform_overhead","validation_evidence":"platform_overhead"}',
    'Approved two-credit Test Framing Pack product, direct supplier cost only.',
    encode(extensions.digest(convert_to('forge-hearth-framing-pack-test-luna-v1:4858:6462:3538:10000:2','utf8'),'sha256'),'hex'),
    actor,6462,3538,10000
  );
  insert into tongs.private_pricing_cost_components(
    pricing_revision_id,ordinal,component_code,component_kind,credential_funding,
    provider_label,success_ceiling_micros,failure_ceiling_micros,
    cost_policy_revision,tail_policy,tail_policy_details
  ) values
    (pricing_id,1,'openai_framing_pack_generation','direct_provider','forge','OpenAI',4858,0,'Luna rate 2026-09-20','none','{"input_ceiling_micros":2400,"output_ceiling_micros":2458}'),
    (pricing_id,2,'verified_variable_supporting_cost','compute','forge','Forge',0,0,'Direct-only approved basis 2026-09-20','none','{"verified_attributable_variable_micros":0}'),
    (pricing_id,3,'fixed_platform_and_evidence_retention','retention_tail','forge','Forge platform',0,0,'Supporting-cost policy 2026-09-20','plan_funded','{"classification":"platform_overhead","operation_allocation_micros":0}');
  insert into tongs.private_pricing_revision_markup_sources(
    pricing_revision_id,markup_rule_revision_id,effective_markup_basis_points
  ) select pricing_id,markup_rule_revision_id,3300
    from tongs.private_pricing_revision_markup_sources
    where pricing_revision_id='15000000-0000-4000-8000-000000000003';
  if not found then raise exception 'canonical 33-percent markup source unavailable'; end if;
  insert into tongs.private_pricing_publications(
    id,policy_id,pricing_revision_id,publication_revision,action,reason,actor_id
  ) values (
    '16000000-0000-4000-8000-000000000004',policy_id,pricing_id,1,'published',
    'Publish only for one bounded Test customer scope; no Live customer authority.',actor
  );

  insert into tongs.openai_text_model_catalog_revisions(
    id,revision,lifecycle_state,quality_method,source_checked_at,content_hash,actor_id
  ) values (
    catalog_id,9,'active','Revision 8 evidence retained; Luna gains one bounded Test Framing Pack compatibility.',
    '2026-09-20T00:00:00Z',
    encode(extensions.digest(convert_to('openai-model-catalog:9:hearth-framing-pack-test-luna','utf8'),'sha256'),'hex'),actor
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
        'hearth_framing_pack_test_cost_policy_revision_id',cost_id,
        'hearth_framing_pack_test_pricing_revision_id',pricing_id
      ) else entry.availability_evidence end,
    entry.lifecycle_state,entry.rate_revision_id
  from tongs.openai_text_model_catalog_entries entry
  where entry.catalog_revision_id='15000000-0000-4000-8000-000000000005';
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
  where old_entry.catalog_revision_id='15000000-0000-4000-8000-000000000005';
  insert into tongs.openai_text_model_route_compatibility(
    id,catalog_entry_id,route_code,compatibility_status,maximum_input_tokens,
    maximum_output_tokens,maximum_attempts,supporting_cost_coverage,
    cost_policy_revision_id,evidence_json
  ) select extensions.uuid_generate_v5(entry.id,'hearth.framing_pack_generation'),entry.id,
    'hearth.framing_pack_generation','generation_verified',12000,2048,1,'complete',cost_id,
    jsonb_build_object('test_only',true,'browsing_requests',0,'retrieval_requests',0,
      'tools',0,'attachments',0,'seven_section_contract',true,
      'canonical_script_approval_required',true,'pricing_revision_id',pricing_id)
  from tongs.openai_text_model_catalog_entries entry
  where entry.catalog_revision_id=catalog_id and entry.provider_model_id='gpt-5.6-luna';
  insert into tongs.openai_text_rollout_revisions(
    route_code,revision,mode,cost_policy_revision_id,reason,actor_id,funding_scope
  ) values ('hearth.framing_pack_generation',1,'enforce',cost_id,
    'Enable only the authorized Forge-funded Test customer scope; Live remains inactive.',actor,'forge');
end $$;

-- Extend only the generic paid-route allow-lists. Existing Tag evidence objects
-- and the Tag-specific recorder remain unchanged.
do $$
declare definition text;
begin
  select pg_get_functiondef(
    'tongs.create_customer_openai_text_quote(uuid,uuid,text,text,uuid,text,text,text,text,timestamptz)'::regprocedure
  ) into definition;
  if position('''hearth.framing_pack_generation''' in definition)>0
  then raise exception 'Framing Pack quote route already exists'; end if;
  definition:=replace(definition,'''hearth.tag_generation''',
    '''hearth.tag_generation'',''hearth.framing_pack_generation''');
  if position('''hearth.framing_pack_generation''' in definition)=0
  then raise exception 'could not extend generic quote route allow-list'; end if;
  execute definition;

  select pg_get_functiondef(
    'tongs.persist_openai_text_paid_result(uuid,text,text,uuid,uuid,uuid,text,text,text,text,bigint,bigint,text,jsonb)'::regprocedure
  ) into definition;
  if position('''hearth.framing_pack_generation''' in definition)>0
  then raise exception 'Framing Pack result route already exists'; end if;
  definition:=replace(definition,'''hearth.tag_generation''',
    '''hearth.tag_generation'',''hearth.framing_pack_generation''');
  if position('''hearth.framing_pack_generation''' in definition)=0
  then raise exception 'could not extend generic result route allow-list'; end if;
  execute definition;
end $$;

insert into tongs.openai_text_failure_loss_policy_revisions(
  id,route_code,environment,revision,per_operation_limit_micros,
  aggregate_limit_micros,rolling_window_seconds,maximum_concurrency,
  lifecycle_state,reason,actor_id
) select row_value.id,'hearth.framing_pack_generation',row_value.environment,1,4858,4858,
  86400,1,'active',row_value.reason,operator.user_id
from (values
  ('16000000-0000-4000-8000-000000000006'::uuid,'test','Approved one-attempt Test Framing Pack canary: one 4858-micro maximum supplier exposure.'),
  ('16000000-0000-4000-8000-000000000007'::uuid,'live','Defensive parity policy only; no Live customer scope or activation.')
) row_value(id,environment,reason)
cross join lateral(select user_id from tongs.platform_operators order by granted_at limit 1) operator;
insert into tongs.openai_text_failure_loss_rollout_revisions(
  route_code,financial_environment,revision,mode,loss_policy_revision_id,
  source_limit_event_id,reason,actor_id
) select 'hearth.framing_pack_generation',row_value.environment,1,'enforce',row_value.policy_id,
  null,row_value.reason,operator.user_id
from (values
  ('test','16000000-0000-4000-8000-000000000006'::uuid,'Enforce approved Test Framing Pack exposure.'),
  ('live','16000000-0000-4000-8000-000000000007'::uuid,'No Live execution scope exists.')
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
) select extensions.uuid_generate_v5(chat.id,'hearth.framing_pack_generation'),chat.user_id,chat.workspace_id,
  'test','hearth.framing_pack_generation','openai','gpt-5.6-luna',
  '16000000-0000-4000-8000-000000000003','16000000-0000-4000-8000-000000000001',
  null,10000,4858,1,null,now(),null,'active',
  'Approved two-credit bounded Test Framing Pack canary; one operation only.',
  chat.created_by,'normal_customer'
from tongs.customer_paid_execution_scope_authorizations chat
where chat.financial_environment='test' and chat.route_code='hearth.chat_completion'
  and chat.provider='openai' and chat.model_or_sku='gpt-5.6-luna'
  and chat.status='active' and chat.authorization_kind='normal_customer';

create table tongs.hearth_framing_pack_generation_results(
  id uuid primary key,
  operation_id text not null unique references tongs.openai_text_funding_bindings(operation_id) on delete restrict
    check(length(btrim(operation_id)) between 8 and 300),
  reservation_id uuid not null unique references tongs.funding_reservations(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  workspace_id uuid not null references tongs.workspaces(id) on delete restrict,
  workpiece_id uuid not null references tongs.episodes(id) on delete restrict,
  request_fingerprint text not null check(request_fingerprint~'^[0-9a-f]{64}$'),
  approval_id uuid not null references tongs.script_approval_revisions(id) on delete restrict,
  approval_revision integer not null check(approval_revision>0),
  script_content_hash text not null check(script_content_hash~'^[0-9a-f]{64}$'),
  provider_request_id text,
  input_units bigint not null check(input_units between 0 and 12000),
  output_units bigint not null check(output_units between 0 and 2048),
  result_json jsonb not null check(jsonb_typeof(result_json)='object'),
  created_at timestamptz not null default now()
);
create index hearth_framing_pack_generation_results_scope_idx
  on tongs.hearth_framing_pack_generation_results(user_id,workspace_id,workpiece_id,created_at desc);
alter table tongs.hearth_framing_pack_generation_results enable row level security;
alter table tongs.hearth_framing_pack_generation_results force row level security;
revoke all on tongs.hearth_framing_pack_generation_results from public,anon,authenticated,service_role;
grant select on tongs.hearth_framing_pack_generation_results to service_role;
create trigger hearth_framing_pack_generation_results_immutable
before update or delete on tongs.hearth_framing_pack_generation_results
for each row execute function tongs._reject_accounting_mutation();

create function tongs.persist_hearth_framing_pack_generation_result(
  p_operation_id text,p_reservation_id uuid,p_user_id uuid,p_workspace_id uuid,
  p_workpiece_id uuid,p_request_fingerprint text,p_approval_id uuid,
  p_approval_revision integer,p_script_hash text,p_provider_request_id text,
  p_input_units bigint,p_output_units bigint,p_result_json jsonb
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare
  binding tongs.openai_text_funding_bindings%rowtype;
  quote_binding tongs.openai_text_customer_quote_bindings%rowtype;
  approval tongs.script_approval_revisions%rowtype;
  sequence_row tongs.workpiece_script_approval_sequences%rowtype;
  existing tongs.hearth_framing_pack_generation_results%rowtype;
  result_id uuid:=extensions.uuid_generate_v5(p_reservation_id,'hearth-framing-pack-result');
begin
  perform tongs._require_pricing_service_role();
  perform pg_advisory_xact_lock(hashtextextended('hearth-framing-pack-result:'||p_reservation_id::text,0));
  select * into binding from tongs.openai_text_funding_bindings
  where operation_id=btrim(p_operation_id) and reservation_id=p_reservation_id
    and route_code='hearth.framing_pack_generation';
  select quote.* into quote_binding
  from tongs.openai_text_customer_quote_bindings quote
  join tongs.funding_reservations reservation on reservation.quote_id=quote.quote_id
  where reservation.id=p_reservation_id;
  select * into approval from tongs.script_approval_revisions
  where id=p_approval_id and workspace_id=p_workspace_id and workpiece_id=p_workpiece_id;
  select * into sequence_row from tongs.workpiece_script_approval_sequences
  where workspace_id=p_workspace_id and workpiece_id=p_workpiece_id;
  if binding.reservation_id is null or quote_binding.quote_id is null
    or binding.cost_policy_revision_id<>'16000000-0000-4000-8000-000000000001'::uuid
    or binding.model<>'gpt-5.6-luna' or binding.maximum_attempts<>1
    or quote_binding.user_id<>p_user_id or quote_binding.workspace_id<>p_workspace_id
    or quote_binding.workpiece_id<>p_workpiece_id::text
    or quote_binding.request_fingerprint<>p_request_fingerprint
    or approval.id is null or approval.approval_revision<>p_approval_revision
    or approval.script_content_hash<>p_script_hash
    or encode(extensions.digest(convert_to(approval.script_text,'utf8'),'sha256'),'hex')<>p_script_hash
    or sequence_row.current_approval_id is distinct from p_approval_id
    or sequence_row.current_revision is distinct from p_approval_revision
    or p_input_units not between 0 and 12000 or p_output_units not between 0 and 2048
    or jsonb_typeof(coalesce(p_result_json,'null'::jsonb))<>'object'
    or p_result_json->>'contract' is distinct from 'forge.hearth.framing-pack-generation.v1'
    or p_result_json->>'output_contract' is distinct from 'framing_pack_seven_sections.v1'
    or p_result_json->>'script_approval_id' is distinct from p_approval_id::text
    or (p_result_json->>'script_approval_revision')::integer is distinct from p_approval_revision
    or p_result_json->>'script_content_hash' is distinct from p_script_hash
    or nullif(btrim(coalesce(p_result_json->>'assistant_text','')),'') is null
    or jsonb_typeof(p_result_json->'sections')<>'object'
    or not (p_result_json->'sections' ?& array[
      'YOUTUBE_OPTIMIZED_CUT','SHORT_DESCRIPTION','LONG_DESCRIPTION','SHORT_FORM_HOOK_20S',
      'TONE_VARIANT_CREATOR','AUDIENCE_VARIANT','MONETIZATION_ANGLE'])
    or (select count(*) from jsonb_object_keys(p_result_json->'sections'))<>7
    or (p_result_json->'sections' ? 'TITLE_OPTIONS')
    or nullif(btrim(p_result_json->'sections'->>'YOUTUBE_OPTIMIZED_CUT'),'') is null
    or nullif(btrim(p_result_json->'sections'->>'SHORT_DESCRIPTION'),'') is null
    or nullif(btrim(p_result_json->'sections'->>'LONG_DESCRIPTION'),'') is null
    or nullif(btrim(p_result_json->'sections'->>'SHORT_FORM_HOOK_20S'),'') is null
    or nullif(btrim(p_result_json->'sections'->>'TONE_VARIANT_CREATOR'),'') is null
    or nullif(btrim(p_result_json->'sections'->>'AUDIENCE_VARIANT'),'') is null
    or nullif(btrim(p_result_json->'sections'->>'MONETIZATION_ANGLE'),'') is null
  then raise exception 'invalid bounded Hearth Framing Pack result' using errcode='22023'; end if;
  select * into existing from tongs.hearth_framing_pack_generation_results
  where operation_id=btrim(p_operation_id) or reservation_id=p_reservation_id;
  if found then
    if existing.operation_id<>btrim(p_operation_id) or existing.reservation_id<>p_reservation_id
      or existing.request_fingerprint<>p_request_fingerprint or existing.result_json<>p_result_json
    then raise exception 'Hearth Framing Pack result replay conflict' using errcode='23505'; end if;
    return existing.result_json||jsonb_build_object('framing_pack_result_id',existing.id,
      'created_at',existing.created_at,'provider_request_id',existing.provider_request_id,
      'input_units',existing.input_units,'output_units',existing.output_units,'replay',true);
  end if;
  insert into tongs.hearth_framing_pack_generation_results(
    id,operation_id,reservation_id,user_id,workspace_id,workpiece_id,
    request_fingerprint,approval_id,approval_revision,script_content_hash,
    provider_request_id,input_units,output_units,result_json
  ) values(result_id,btrim(p_operation_id),p_reservation_id,p_user_id,p_workspace_id,
    p_workpiece_id,p_request_fingerprint,p_approval_id,p_approval_revision,
    p_script_hash,p_provider_request_id,p_input_units,p_output_units,p_result_json)
  returning * into existing;
  return existing.result_json||jsonb_build_object('framing_pack_result_id',existing.id,
    'created_at',existing.created_at,'provider_request_id',existing.provider_request_id,
    'input_units',existing.input_units,'output_units',existing.output_units,'replay',false);
end $$;

create function tongs.read_hearth_framing_pack_generation_result(
  p_operation_id text,p_reservation_id uuid
) returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare result_row tongs.hearth_framing_pack_generation_results%rowtype;
begin
  perform tongs._require_pricing_service_role();
  select * into result_row from tongs.hearth_framing_pack_generation_results
  where operation_id=btrim(p_operation_id) and reservation_id=p_reservation_id;
  if result_row.id is null then return null; end if;
  return result_row.result_json||jsonb_build_object('framing_pack_result_id',result_row.id,
    'created_at',result_row.created_at,'provider_request_id',result_row.provider_request_id,
    'input_units',result_row.input_units,'output_units',result_row.output_units,'replay',true);
end $$;
revoke all on function tongs.persist_hearth_framing_pack_generation_result(
  text,uuid,uuid,uuid,uuid,text,uuid,integer,text,text,bigint,bigint,jsonb
) from public,anon,authenticated;
revoke all on function tongs.read_hearth_framing_pack_generation_result(text,uuid)
  from public,anon,authenticated;
grant execute on function tongs.persist_hearth_framing_pack_generation_result(
  text,uuid,uuid,uuid,uuid,text,uuid,integer,text,text,bigint,bigint,jsonb
) to service_role;
grant execute on function tongs.read_hearth_framing_pack_generation_result(text,uuid)
  to service_role;

create table tongs.openai_text_validation_failure_evidence(
  id uuid primary key,
  route_code text not null references tongs.openai_text_route_policies(route_code) on delete restrict,
  operation_id text not null unique references tongs.openai_text_funding_bindings(operation_id) on delete restrict
    check(length(btrim(operation_id)) between 8 and 300),
  reservation_id uuid not null unique references tongs.funding_reservations(id) on delete restrict,
  provider_capture_id uuid not null unique references tongs.openai_text_provider_captures(id) on delete restrict,
  provider_request_id text,
  model text not null,
  input_units bigint not null check(input_units>=0),
  output_units bigint not null check(output_units>=0),
  raw_provider_response_text text not null check(octet_length(raw_provider_response_text) between 1 and 65536),
  validation_error_code text not null check(validation_error_code~'^[a-z][a-z0-9_]{2,100}$'),
  validation_contract_revision text not null check(length(btrim(validation_contract_revision)) between 3 and 200),
  recorded_at timestamptz not null default now()
);
alter table tongs.openai_text_validation_failure_evidence enable row level security;
alter table tongs.openai_text_validation_failure_evidence force row level security;
revoke all on tongs.openai_text_validation_failure_evidence from public,anon,authenticated,service_role;
grant select on tongs.openai_text_validation_failure_evidence to service_role;
create trigger openai_text_validation_failure_evidence_immutable
before update or delete on tongs.openai_text_validation_failure_evidence
for each row execute function tongs._reject_accounting_mutation();

create function tongs.record_openai_text_validation_failure_evidence(
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
  if p_route_code is distinct from 'hearth.framing_pack_generation'
    or binding.reservation_id is null or binding.model<>'gpt-5.6-luna'
    or binding.maximum_attempts<>1 or capture.id is null
    or capture.provider_request_id is distinct from nullif(btrim(coalesce(p_provider_request_id,'')),'')
    or capture.input_units is distinct from p_input_units
    or capture.output_units is distinct from p_output_units
    or capture.response_evidence_json->>'raw_provider_response_text' is distinct from p_raw_provider_response_text
    or p_model is distinct from binding.model
    or p_validation_contract_revision is distinct from 'framing_pack_seven_sections.v1'
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
declare tag_table_oid oid; tag_rpc_oid oid;
begin
  if (select count(*) from tongs.customer_paid_execution_scope_authorizations
      where route_code='hearth.framing_pack_generation' and financial_environment='test'
        and status='active')<>1
  then raise exception 'exactly one Test Framing Pack scope is required'; end if;
  if exists(select 1 from tongs.customer_paid_execution_scope_authorizations
      where route_code='hearth.framing_pack_generation' and financial_environment='live'
        and status='active')
  then raise exception 'Live Framing Pack scope must remain absent'; end if;
  if not exists(select 1 from tongs.private_pricing_revisions
      where id='16000000-0000-4000-8000-000000000003' and customer_credit_units=2
        and settled_customer_price_micros=10000 and full_cost_ceiling_micros=4858)
  then raise exception 'Framing Pack economics mismatch'; end if;
  select 'tongs.hearth_tag_validation_failure_evidence'::regclass into tag_table_oid;
  select 'tongs.record_hearth_tag_validation_failure_evidence(text,uuid,text,text,bigint,bigint,text,text,text)'::regprocedure into tag_rpc_oid;
  if tag_table_oid is null or tag_rpc_oid is null
  then raise exception 'existing Tag validation evidence authority was not preserved'; end if;
end $$;

notify pgrst,'reload schema';
commit;
