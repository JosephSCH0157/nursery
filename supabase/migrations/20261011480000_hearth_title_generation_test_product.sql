-- One Forge-funded Test title-generation product. Live remains inactive-ready
-- and receives no customer execution scope. No historical migration is edited.
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
    where id='13000000-0000-4000-8000-000000000005'
      and revision=6 and lifecycle_state='active'
  ) then raise exception 'active model catalog revision 6 is unavailable'; end if;
  if not exists (
    select 1 from tongs.financial_environment_configuration_revisions
    where environment='test' and revision=4 and lifecycle_state='customer_rollout_active'
  ) then raise exception 'active Test customer financial path is unavailable'; end if;
  if (select lifecycle_state from tongs.financial_environment_configuration_revisions
      where environment='live' order by revision desc limit 1)<>'inactive_ready'
  then raise exception 'Live must remain inactive-ready'; end if;
  if exists (select 1 from tongs.openai_text_route_policies where route_code='hearth.title_generation')
  then raise exception 'title route already exists'; end if;
end $$;

insert into tongs.openai_text_route_policies(
  route_code,product_area,provider_operation,maximum_input_units,
  maximum_output_units,maximum_attempts,requires_result_validation,
  requires_canonical_persistence,byo_supported,rollout_mode,notes
) values (
  'hearth.title_generation','hearth','chat_completions',12000,512,1,true,true,false,
  'inactive','Five titles from the current canonical script approval only; no browsing, retrieval, tools, attachments, or Live scope.'
);

insert into tongs.openai_text_cost_policy_revisions(
  id,route_code,revision,policy_code,attempt_plan,maximum_input_units,
  maximum_output_units,maximum_attempts,direct_provider_ceiling_micros,
  supporting_cost_ceiling_micros,full_cost_ceiling_micros,cost_coverage,
  lifecycle_state,notes
) values (
  '14000000-0000-4000-8000-000000000001','hearth.title_generation',1,
  'openai-text:hearth-title-generation:test-luna-v1',
  '[{"attempt":1,"rate_revision_id":"56560000-0000-4000-8000-000000000001","runtime_model":"gpt-5.6-luna","provider_model_id":"gpt-5.6-luna","input_max":12000,"output_max":512}]',
  12000,512,1,3015,0,3015,'complete','active',
  'Ceil(12000*0.20 + 512*1.20)=3015 micros direct maximum. No attributable variable supporting service.'
);

insert into tongs.openai_text_supporting_cost_inventory(
  id,route_code,cost_policy_revision_id,component_code,disposition,evidence_status,notes
) values
  ('24000000-0000-4000-8000-000000000001','hearth.title_generation','14000000-0000-4000-8000-000000000001','openai_title_generation','attributable_metered','verified','One Luna text attempt is the only metered supplier cost.'),
  ('24000000-0000-4000-8000-000000000002','hearth.title_generation','14000000-0000-4000-8000-000000000001','fixed_netlify_supabase_plans','platform_overhead','verified','Fixed hosting/database plans are not operation wholesale.'),
  ('24000000-0000-4000-8000-000000000003','hearth.title_generation','14000000-0000-4000-8000-000000000001','title_and_audit_retention','platform_overhead','verified','Canonical title result and audit storage have no verified variable allocation.');

do $$
declare
  actor uuid;
  policy_id constant uuid := '14000000-0000-4000-8000-000000000002';
  pricing_id constant uuid := '14000000-0000-4000-8000-000000000003';
  cost_id constant uuid := '14000000-0000-4000-8000-000000000001';
  catalog_id constant uuid := '14000000-0000-4000-8000-000000000005';
  sku constant text := 'openai-text:hearth.title_generation:gpt-5.6-luna:14000000-0000-4000-8000-000000000001';
begin
  select user_id into actor from tongs.platform_operators order by granted_at limit 1;
  if actor is null then raise exception 'platform operator required'; end if;

  insert into tongs.private_pricing_policies(id,policy_code,scope_kind,provider,sku,created_by)
  values(policy_id,'forge-hearth-title-generation-test-luna-v1','sku','openai',sku,actor);
  insert into tongs.private_pricing_revisions(
    id,policy_id,revision,previous_revision_id,lifecycle_state,currency,
    markup_basis_points,full_cost_ceiling_micros,failure_cost_ceiling_micros,
    customer_price_ceiling_micros,billable_failure_ceiling_micros,
    customer_credit_units,billable_failure_classes,free_failure_classes,
    included_quantity,retention_policy,change_reason,content_hash,actor_id,
    unrounded_customer_price_micros,rounding_adjustment_micros,
    settled_customer_price_micros
  ) values (
    pricing_id,policy_id,1,null,'review_ready','USD',3300,3015,0,
    5000,0,1,'[]',
    '["provider_failure","forge_failure","validation_failure","persistence_failure"]',
    '{"input_tokens":12000,"output_tokens":512,"provider_attempts":1,"browsing_requests":0,"retrieval_requests":0,"tools":0,"attachments":0}',
    '{"title_result":"platform_overhead","billing_evidence":"platform_overhead"}',
    'Approved one-credit Test title product, direct supplier cost only.',
    encode(extensions.digest(convert_to('forge-hearth-title-generation-test-luna-v1:3015:4010:990:5000:1','utf8'),'sha256'),'hex'),
    actor,4010,990,5000
  );
  insert into tongs.private_pricing_cost_components(
    pricing_revision_id,ordinal,component_code,component_kind,credential_funding,
    provider_label,success_ceiling_micros,failure_ceiling_micros,
    cost_policy_revision,tail_policy,tail_policy_details
  ) values
    (pricing_id,1,'openai_title_generation','direct_provider','forge','OpenAI',3015,0,'Luna rate 2026-09-19','none','{"input_ceiling_micros":2400,"output_ceiling_micros":615}'),
    (pricing_id,2,'verified_variable_supporting_cost','compute','forge','Forge',0,0,'Direct-only approved basis 2026-09-19','none','{"verified_attributable_variable_micros":0}'),
    (pricing_id,3,'fixed_platform_and_audit_retention','retention_tail','forge','Forge platform',0,0,'Supporting-cost policy 2026-09-19','plan_funded','{"classification":"platform_overhead","operation_allocation_micros":0}');
  insert into tongs.private_pricing_revision_markup_sources(
    pricing_revision_id,markup_rule_revision_id,effective_markup_basis_points
  )
  select pricing_id,markup_rule_revision_id,3300
  from tongs.private_pricing_revision_markup_sources
  where pricing_revision_id='13000000-0000-4000-8000-000000000003';
  if not found then raise exception 'canonical 33-percent markup source unavailable'; end if;
  insert into tongs.private_pricing_publications(
    id,policy_id,pricing_revision_id,publication_revision,action,reason,actor_id
  ) values (
    '14000000-0000-4000-8000-000000000004',policy_id,pricing_id,1,'published',
    'Publish only for one bounded Test customer scope; no Live customer authority.',actor
  );

  insert into tongs.openai_text_model_catalog_revisions(
    id,revision,lifecycle_state,quality_method,source_checked_at,content_hash,actor_id
  ) values (
    catalog_id,7,'active','Revision 6 evidence retained; Luna gains one bounded Test title compatibility.',
    '2026-09-19T00:00:00Z',
    encode(extensions.digest(convert_to('openai-model-catalog:7:hearth-title-generation-test-luna','utf8'),'sha256'),'hex'),actor
  );
  insert into tongs.openai_text_model_catalog_entries(
    id,catalog_revision_id,runtime_model_id,provider_model_id,display_name,
    tradeoff_summary,quality_rank,quality_basis,supported_apis,
    availability_status,availability_evidence,lifecycle_state,rate_revision_id
  )
  select extensions.uuid_generate_v5(catalog_id,entry.provider_model_id),catalog_id,
    entry.runtime_model_id,entry.provider_model_id,entry.display_name,entry.tradeoff_summary,
    entry.quality_rank,entry.quality_basis,entry.supported_apis,entry.availability_status,
    case when entry.provider_model_id='gpt-5.6-luna' then
      entry.availability_evidence||jsonb_build_object(
        'hearth_title_generation_test_cost_policy_revision_id',cost_id,
        'hearth_title_generation_test_pricing_revision_id',pricing_id
      ) else entry.availability_evidence end,
    entry.lifecycle_state,entry.rate_revision_id
  from tongs.openai_text_model_catalog_entries entry
  where entry.catalog_revision_id='13000000-0000-4000-8000-000000000005';
  insert into tongs.openai_text_model_route_compatibility(
    id,catalog_entry_id,route_code,compatibility_status,maximum_input_tokens,
    maximum_output_tokens,maximum_attempts,supporting_cost_coverage,
    cost_policy_revision_id,evidence_json
  )
  select extensions.uuid_generate_v5(
      extensions.uuid_generate_v5(catalog_id,old_entry.provider_model_id),compatibility.route_code
    ),
    extensions.uuid_generate_v5(catalog_id,old_entry.provider_model_id),compatibility.route_code,
    compatibility.compatibility_status,compatibility.maximum_input_tokens,
    compatibility.maximum_output_tokens,compatibility.maximum_attempts,
    compatibility.supporting_cost_coverage,compatibility.cost_policy_revision_id,
    compatibility.evidence_json
  from tongs.openai_text_model_route_compatibility compatibility
  join tongs.openai_text_model_catalog_entries old_entry on old_entry.id=compatibility.catalog_entry_id
  where old_entry.catalog_revision_id='13000000-0000-4000-8000-000000000005';
  insert into tongs.openai_text_model_route_compatibility(
    id,catalog_entry_id,route_code,compatibility_status,maximum_input_tokens,
    maximum_output_tokens,maximum_attempts,supporting_cost_coverage,
    cost_policy_revision_id,evidence_json
  )
  select extensions.uuid_generate_v5(entry.id,'hearth.title_generation'),entry.id,
    'hearth.title_generation','generation_verified',12000,512,1,'complete',cost_id,
    jsonb_build_object(
      'test_only',true,'browsing_requests',0,'retrieval_requests',0,
      'tools',0,'attachments',0,'strict_five_title_contract',true,
      'canonical_script_approval_required',true,'pricing_revision_id',pricing_id
    )
  from tongs.openai_text_model_catalog_entries entry
  where entry.catalog_revision_id=catalog_id and entry.provider_model_id='gpt-5.6-luna';
  insert into tongs.openai_text_rollout_revisions(
    route_code,revision,mode,cost_policy_revision_id,reason,actor_id,funding_scope
  ) values (
    'hearth.title_generation',1,'enforce',cost_id,
    'Enable only the authorized Forge-funded Test customer scope; Live remains inactive.',actor,'forge'
  );
end $$;

-- Extend the two pre-existing internal route allow-lists without changing
-- their pricing, funding, validation or settlement logic.
do $$
declare definition text;
begin
  select pg_get_functiondef(
    'tongs.create_customer_openai_text_quote(uuid,uuid,text,text,uuid,text,text,text,text,timestamptz)'::regprocedure
  ) into definition;
  if position('''hearth.title_generation''' in definition)>0 then
    raise exception 'title quote route already exists'; end if;
  definition:=replace(definition,
    '''hearth.script_generation''',
    '''hearth.script_generation'',''hearth.title_generation''');
  if position('''hearth.title_generation''' in definition)=0 then
    raise exception 'could not extend generic quote route allow-list'; end if;
  execute definition;

  select pg_get_functiondef(
    'tongs.persist_openai_text_paid_result(uuid,text,text,uuid,uuid,uuid,text,text,text,text,bigint,bigint,text,jsonb)'::regprocedure
  ) into definition;
  if position('''hearth.title_generation''' in definition)>0 then
    raise exception 'title result route already exists'; end if;
  definition:=replace(definition,
    '''hearth.script_generation''',
    '''hearth.script_generation'',''hearth.title_generation''');
  if position('''hearth.title_generation''' in definition)=0 then
    raise exception 'could not extend generic result route allow-list'; end if;
  execute definition;
end $$;

insert into tongs.openai_text_failure_loss_policy_revisions(
  id,route_code,environment,revision,per_operation_limit_micros,
  aggregate_limit_micros,rolling_window_seconds,maximum_concurrency,
  lifecycle_state,reason,actor_id
)
select row_value.id,'hearth.title_generation',row_value.environment,1,3015,3015,
  86400,1,'active',row_value.reason,operator.user_id
from (values
  ('14000000-0000-4000-8000-000000000006'::uuid,'test','Approved one-attempt Test title canary: one 3015-micro maximum supplier exposure.'),
  ('14000000-0000-4000-8000-000000000007'::uuid,'live','Defensive parity policy only; no Live customer scope or activation.')
) row_value(id,environment,reason)
cross join lateral(select user_id from tongs.platform_operators order by granted_at limit 1) operator;
insert into tongs.openai_text_failure_loss_rollout_revisions(
  route_code,financial_environment,revision,mode,loss_policy_revision_id,
  source_limit_event_id,reason,actor_id
)
select 'hearth.title_generation',row_value.environment,1,'enforce',row_value.policy_id,
  null,row_value.reason,operator.user_id
from (values
  ('test','14000000-0000-4000-8000-000000000006'::uuid,'Enforce approved Test title exposure.'),
  ('live','14000000-0000-4000-8000-000000000007'::uuid,'No Live execution scope exists.')
) row_value(environment,policy_id,reason)
cross join lateral(select user_id from tongs.platform_operators order by granted_at limit 1) operator;

-- The normal-customer Test canary is bound to the same one current customer
-- workspace as ordinary Hearth chat. It does not authorize Owner or BYO.
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
)
select extensions.uuid_generate_v5(chat.id,'hearth.title_generation'),chat.user_id,chat.workspace_id,
  'test','hearth.title_generation','openai','gpt-5.6-luna',
  '14000000-0000-4000-8000-000000000003','14000000-0000-4000-8000-000000000001',
  null,5000,3015,1,null,now(),null,'active',
  'Approved one-credit bounded Test title-generation canary; one operation only.',
  chat.created_by,'normal_customer'
from tongs.customer_paid_execution_scope_authorizations chat
where chat.financial_environment='test' and chat.route_code='hearth.chat_completion'
  and chat.provider='openai' and chat.model_or_sku='gpt-5.6-luna'
  and chat.status='active' and chat.authorization_kind='normal_customer';

-- Domain result precedes generic paid replay persistence and settlement.
create table tongs.hearth_title_generation_results(
  id uuid primary key,
  operation_id text not null unique check(length(btrim(operation_id)) between 8 and 300),
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
  output_units bigint not null check(output_units between 0 and 512),
  result_json jsonb not null check(jsonb_typeof(result_json)='object'),
  created_at timestamptz not null default now()
);
create index hearth_title_generation_results_scope_idx
  on tongs.hearth_title_generation_results(user_id,workspace_id,workpiece_id,created_at desc);
alter table tongs.hearth_title_generation_results enable row level security;
alter table tongs.hearth_title_generation_results force row level security;
revoke all on tongs.hearth_title_generation_results from public,anon,authenticated,service_role;
grant select on tongs.hearth_title_generation_results to service_role;
create trigger hearth_title_generation_results_immutable
before update or delete on tongs.hearth_title_generation_results
for each row execute function tongs._reject_accounting_mutation();

create or replace function tongs.persist_hearth_title_generation_result(
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
  existing tongs.hearth_title_generation_results%rowtype;
  result_id uuid:=extensions.uuid_generate_v5(p_reservation_id,'hearth-title-result');
begin
  perform tongs._require_pricing_service_role();
  perform pg_advisory_xact_lock(hashtextextended('hearth-title-result:'||p_reservation_id::text,0));
  select * into binding from tongs.openai_text_funding_bindings
  where operation_id=btrim(p_operation_id) and reservation_id=p_reservation_id
    and route_code='hearth.title_generation';
  select quote.* into quote_binding
  from tongs.openai_text_customer_quote_bindings quote
  join tongs.funding_reservations reservation on reservation.quote_id=quote.quote_id
  where reservation.id=p_reservation_id;
  select * into approval from tongs.script_approval_revisions
  where id=p_approval_id and workspace_id=p_workspace_id and workpiece_id=p_workpiece_id;
  select * into sequence_row from tongs.workpiece_script_approval_sequences
  where workspace_id=p_workspace_id and workpiece_id=p_workpiece_id;
  if binding.reservation_id is null or quote_binding.quote_id is null
    or binding.cost_policy_revision_id<>'14000000-0000-4000-8000-000000000001'::uuid
    or binding.model<>'gpt-5.6-luna' or binding.maximum_attempts<>1
    or quote_binding.user_id<>p_user_id or quote_binding.workspace_id<>p_workspace_id
    or quote_binding.workpiece_id<>p_workpiece_id::text
    or quote_binding.request_fingerprint<>p_request_fingerprint
    or approval.id is null or approval.approval_revision<>p_approval_revision
    or approval.script_content_hash<>p_script_hash
    or encode(extensions.digest(convert_to(approval.script_text,'utf8'),'sha256'),'hex')<>p_script_hash
    or sequence_row.current_approval_id is distinct from p_approval_id
    or sequence_row.current_revision is distinct from p_approval_revision
    or p_input_units not between 0 and 12000 or p_output_units not between 0 and 512
    or jsonb_typeof(coalesce(p_result_json,'null'::jsonb))<>'object'
    or p_result_json->>'contract' is distinct from 'forge.hearth.title-generation.v1'
    or p_result_json->>'script_approval_id' is distinct from p_approval_id::text
    or (p_result_json->>'script_approval_revision')::integer is distinct from p_approval_revision
    or p_result_json->>'script_content_hash' is distinct from p_script_hash
    or jsonb_typeof(p_result_json->'titles')<>'array'
    or jsonb_array_length(p_result_json->'titles')<>5
    or nullif(btrim(coalesce(p_result_json->>'assistant_text','')),'') is null
  then raise exception 'invalid bounded Hearth title result' using errcode='22023'; end if;
  select * into existing from tongs.hearth_title_generation_results
  where operation_id=btrim(p_operation_id) or reservation_id=p_reservation_id;
  if found then
    if existing.operation_id<>btrim(p_operation_id)
      or existing.reservation_id<>p_reservation_id
      or existing.request_fingerprint<>p_request_fingerprint
      or existing.result_json<>p_result_json
    then raise exception 'Hearth title result replay conflict' using errcode='23505'; end if;
    return existing.result_json||jsonb_build_object(
      'title_result_id',existing.id,'created_at',existing.created_at,
      'provider_request_id',existing.provider_request_id,
      'input_units',existing.input_units,'output_units',existing.output_units,'replay',true
    );
  end if;
  insert into tongs.hearth_title_generation_results(
    id,operation_id,reservation_id,user_id,workspace_id,workpiece_id,
    request_fingerprint,approval_id,approval_revision,script_content_hash,
    provider_request_id,input_units,output_units,result_json
  ) values(
    result_id,btrim(p_operation_id),p_reservation_id,p_user_id,p_workspace_id,
    p_workpiece_id,p_request_fingerprint,p_approval_id,p_approval_revision,
    p_script_hash,p_provider_request_id,p_input_units,p_output_units,p_result_json
  ) returning * into existing;
  return existing.result_json||jsonb_build_object(
    'title_result_id',existing.id,'created_at',existing.created_at,
    'provider_request_id',existing.provider_request_id,
    'input_units',existing.input_units,'output_units',existing.output_units,'replay',false
  );
end $$;

create or replace function tongs.read_hearth_title_generation_result(
  p_operation_id text,p_reservation_id uuid
) returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare result_row tongs.hearth_title_generation_results%rowtype;
begin
  perform tongs._require_pricing_service_role();
  select * into result_row from tongs.hearth_title_generation_results
  where operation_id=btrim(p_operation_id) and reservation_id=p_reservation_id;
  if result_row.id is null then return null; end if;
  return result_row.result_json||jsonb_build_object(
    'title_result_id',result_row.id,'created_at',result_row.created_at,
    'provider_request_id',result_row.provider_request_id,
    'input_units',result_row.input_units,'output_units',result_row.output_units,'replay',true
  );
end $$;
revoke all on function tongs.persist_hearth_title_generation_result(
  text,uuid,uuid,uuid,uuid,text,uuid,integer,text,text,bigint,bigint,jsonb
) from public,anon,authenticated;
revoke all on function tongs.read_hearth_title_generation_result(text,uuid)
  from public,anon,authenticated;
grant execute on function tongs.persist_hearth_title_generation_result(
  text,uuid,uuid,uuid,uuid,text,uuid,integer,text,text,bigint,bigint,jsonb
) to service_role;
grant execute on function tongs.read_hearth_title_generation_result(text,uuid)
  to service_role;

do $$
begin
  if (select count(*) from tongs.customer_paid_execution_scope_authorizations
      where route_code='hearth.title_generation' and financial_environment='test'
        and status='active')<>1
  then raise exception 'exactly one Test title canary scope is required'; end if;
  if exists(select 1 from tongs.customer_paid_execution_scope_authorizations
      where route_code='hearth.title_generation' and financial_environment='live'
        and status='active')
  then raise exception 'Live title scope must remain absent'; end if;
end $$;
notify pgrst,'reload schema';
commit;
