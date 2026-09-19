-- One bounded standard-customer Test canary for immutable Hearth script proposals.
-- This creates no Live customer scope and does not apply a proposal to an episode.
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
    where id='12000000-0000-4000-8000-000000000005'
      and revision=5 and lifecycle_state='active'
  ) then raise exception 'active model catalog revision 5 is unavailable'; end if;
  if not exists (
    select 1 from tongs.financial_environment_configuration_revisions
    where environment='test' and revision=4
      and lifecycle_state='customer_rollout_active'
      and workflow_contract='forge.customer-financial-path.v2'
  ) then raise exception 'active Test customer financial path is unavailable'; end if;
  if not exists (
    select 1 from tongs.financial_environment_configuration_revisions
    where environment='live' and revision=3 and lifecycle_state='inactive_ready'
  ) then raise exception 'Live must remain inactive-ready'; end if;
end $$;

insert into tongs.openai_text_route_policies(
  route_code,product_area,provider_operation,maximum_input_units,
  maximum_output_units,maximum_attempts,requires_result_validation,
  requires_canonical_persistence,byo_supported,rollout_mode,notes
) values (
  'hearth.script_generation','hearth','chat_completions',32000,8000,1,true,true,false,
  'inactive',
  'Test-only bounded Luna canary. Produces an immutable active-episode script proposal; applying it is a separate creator action.'
);

insert into tongs.openai_text_cost_policy_revisions(
  id,route_code,revision,policy_code,attempt_plan,maximum_input_units,
  maximum_output_units,maximum_attempts,direct_provider_ceiling_micros,
  supporting_cost_ceiling_micros,full_cost_ceiling_micros,cost_coverage,
  lifecycle_state,notes
) values (
  '13000000-0000-4000-8000-000000000001','hearth.script_generation',1,
  'openai-text:hearth-script-generation:test-canary-luna-v1',
  '[{"attempt":1,"rate_revision_id":"56560000-0000-4000-8000-000000000001","runtime_model":"gpt-5.6-luna","provider_model_id":"gpt-5.6-luna","input_max":32000,"output_max":8000}]',
  32000,8000,1,16000,0,16000,'complete','active',
  'Direct-only provisional wholesale: Luna maximum is 6,400 input plus 9,600 output micros. No attributable variable supporting cost is currently evidenced; fixed platform and audit retention are overhead.'
);

insert into tongs.openai_text_supporting_cost_inventory(
  id,route_code,cost_policy_revision_id,component_code,disposition,evidence_status,notes
) values
  ('23000000-0000-4000-8000-000000000001','hearth.script_generation','13000000-0000-4000-8000-000000000001','openai_script_generation','attributable_metered','verified','Luna direct token cost is the only verified attributable variable cost for this canary.'),
  ('23000000-0000-4000-8000-000000000002','hearth.script_generation','13000000-0000-4000-8000-000000000001','fixed_netlify_supabase_plans','platform_overhead','verified','Fixed Netlify and Supabase plans are Forge platform overhead and are excluded from operation wholesale.'),
  ('23000000-0000-4000-8000-000000000003','hearth.script_generation','13000000-0000-4000-8000-000000000001','proposal_and_audit_retention','platform_overhead','verified','Immutable proposal and financial audit retention are platform operational data and do not create a per-operation allocation.');

do $$
declare
  actor uuid;
  policy_id constant uuid := '13000000-0000-4000-8000-000000000002';
  pricing_id constant uuid := '13000000-0000-4000-8000-000000000003';
  cost_id constant uuid := '13000000-0000-4000-8000-000000000001';
  catalog_id constant uuid := '13000000-0000-4000-8000-000000000005';
  sku constant text := 'openai-text:hearth.script_generation:gpt-5.6-luna:13000000-0000-4000-8000-000000000001';
begin
  select user_id into actor from tongs.platform_operators order by granted_at limit 1;
  if actor is null then raise exception 'platform operator required'; end if;

  insert into tongs.private_pricing_policies(id,policy_code,scope_kind,provider,sku,created_by)
  values(policy_id,'forge-hearth-script-generation-test-canary-luna-v1','sku','openai',sku,actor);

  insert into tongs.private_pricing_revisions(
    id,policy_id,revision,previous_revision_id,lifecycle_state,currency,
    markup_basis_points,full_cost_ceiling_micros,failure_cost_ceiling_micros,
    customer_price_ceiling_micros,billable_failure_ceiling_micros,
    customer_credit_units,billable_failure_classes,free_failure_classes,
    included_quantity,retention_policy,change_reason,content_hash,actor_id,
    unrounded_customer_price_micros,rounding_adjustment_micros,
    settled_customer_price_micros
  ) values (
    pricing_id,policy_id,1,null,'review_ready','USD',3300,16000,0,
    25000,0,5,'[]',
    '["provider_failure","forge_failure","validation_failure","persistence_failure"]',
    '{"input_tokens":32000,"output_tokens":8000,"provider_attempts":1,"browsing_requests":0,"retrieval_requests":0}',
    '{"script_proposal":"platform_overhead","billing_evidence":"platform_overhead","canonical_draft_application":"not_included"}',
    'Owner-approved one-attempt Test canary: direct-only provisional wholesale and five Forge Credits.',
    encode(extensions.digest(convert_to(
      'forge-hearth-script-generation-test-canary-luna-v1:16000:21280:3720:25000:5','utf8'
    ),'sha256'),'hex'),actor,21280,3720,25000
  );

  insert into tongs.private_pricing_cost_components(
    pricing_revision_id,ordinal,component_code,component_kind,credential_funding,
    provider_label,success_ceiling_micros,failure_ceiling_micros,
    cost_policy_revision,tail_policy,tail_policy_details
  ) values
    (pricing_id,1,'openai_script_generation','direct_provider','forge','OpenAI',16000,0,'Luna rate 2026-09-16','none','{"input_ceiling_micros":6400,"output_ceiling_micros":9600}'),
    (pricing_id,2,'verified_variable_supporting_cost','compute','forge','Forge',0,0,'Owner direct-only provisional basis 2026-09-16','none','{"verified_attributable_variable_micros":0}'),
    (pricing_id,3,'fixed_platform_and_audit_retention','retention_tail','forge','Forge platform',0,0,'Supporting-cost policy 2026-09-16','plan_funded','{"classification":"platform_overhead","operation_allocation_micros":0}');

  insert into tongs.private_pricing_revision_markup_sources(
    pricing_revision_id,markup_rule_revision_id,effective_markup_basis_points
  )
  select pricing_id,markup_rule_revision_id,3300
  from tongs.private_pricing_revision_markup_sources
  where pricing_revision_id='b4c4472f-0325-4c2e-b2ef-9aef5e59e64a';
  if not found then raise exception 'canonical 33-percent markup source unavailable'; end if;

  insert into tongs.private_pricing_publications(
    id,policy_id,pricing_revision_id,publication_revision,action,reason,actor_id
  ) values (
    '13000000-0000-4000-8000-000000000004',policy_id,pricing_id,1,'published',
    'Publish only for the explicitly bounded Test canary scope; Live receives no authorization.',actor
  );

  insert into tongs.openai_text_model_catalog_revisions(
    id,revision,lifecycle_state,quality_method,source_checked_at,content_hash,actor_id
  ) values (
    catalog_id,6,'active',
    'Revision 5 evidence preserved; Luna gains one bounded Test-only script-generation compatibility.',
    '2026-09-16T00:00:00Z',
    encode(extensions.digest(convert_to('openai-model-catalog:6:hearth-script-generation-test-canary-luna','utf8'),'sha256'),'hex'),actor
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
        'hearth_script_generation_test_canary_cost_policy_revision_id',cost_id,
        'hearth_script_generation_test_canary_pricing_revision_id',pricing_id
      ) else entry.availability_evidence end,
    entry.lifecycle_state,entry.rate_revision_id
  from tongs.openai_text_model_catalog_entries entry
  where entry.catalog_revision_id='12000000-0000-4000-8000-000000000005';

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
  join tongs.openai_text_model_catalog_entries old_entry
    on old_entry.id=compatibility.catalog_entry_id
  where old_entry.catalog_revision_id='12000000-0000-4000-8000-000000000005';

  insert into tongs.openai_text_model_route_compatibility(
    id,catalog_entry_id,route_code,compatibility_status,maximum_input_tokens,
    maximum_output_tokens,maximum_attempts,supporting_cost_coverage,
    cost_policy_revision_id,evidence_json
  )
  select extensions.uuid_generate_v5(entry.id,'hearth.script_generation'),entry.id,
    'hearth.script_generation','generation_verified',32000,8000,1,'complete',cost_id,
    jsonb_build_object(
      'test_canary_only',true,'browsing_requests',0,'retrieval_requests',0,
      'strict_script_artifact',true,'immutable_proposal_persistence',true,
      'canonical_draft_application_included',false,'pricing_revision_id',pricing_id
    )
  from tongs.openai_text_model_catalog_entries entry
  where entry.catalog_revision_id=catalog_id and entry.provider_model_id='gpt-5.6-luna';

  insert into tongs.openai_text_rollout_revisions(
    route_code,revision,mode,cost_policy_revision_id,reason,actor_id,funding_scope
  ) values (
    'hearth.script_generation',1,'enforce',cost_id,
    'Enable the exact route only for an explicitly scoped Forge-funded Test canary; no Live scope exists.',actor,'forge'
  );
end $$;

-- The generic quote function predates this new canonical route. Extend only
-- its route allow-list; all existing rollout, pricing, scope, and funding gates remain intact.
do $$
declare definition text;
begin
  select pg_get_functiondef(
    'tongs.create_customer_openai_text_quote(uuid,uuid,text,text,uuid,text,text,text,text,timestamptz)'::regprocedure
  ) into definition;
  if position('''hearth.script_generation''' in definition)>0 then return; end if;
  definition:=replace(
    definition,
    '''hearth.chat_completion'',''hearth.research_synthesis''',
    '''hearth.chat_completion'',''hearth.script_generation'',''hearth.research_synthesis'''
  );
  if position('''hearth.script_generation''' in definition)=0 then
    raise exception 'could not extend generic OpenAI quote route allow-list';
  end if;
  execute definition;
end $$;

insert into tongs.openai_text_failure_loss_policy_revisions(
  id,route_code,environment,revision,per_operation_limit_micros,
  aggregate_limit_micros,rolling_window_seconds,maximum_concurrency,
  lifecycle_state,reason,actor_id
)
select values_row.id,values_row.route_code,values_row.environment,1,16000,16000,
  86400,1,'active',values_row.reason,operator.user_id
from (values
  ('13000000-0000-4000-8000-000000000006'::uuid,'hearth.script_generation','test','Owner-approved bounded Test canary; one direct-only maximum supplier exposure.'),
  ('13000000-0000-4000-8000-000000000007'::uuid,'hearth.script_generation','live','Parity policy installed defensively; no Live customer scope or financial activation exists.')
) values_row(id,route_code,environment,reason)
cross join lateral(select user_id from tongs.platform_operators order by granted_at limit 1) operator;

insert into tongs.openai_text_failure_loss_rollout_revisions(
  route_code,financial_environment,revision,mode,loss_policy_revision_id,
  source_limit_event_id,reason,actor_id
)
select 'hearth.script_generation',values_row.environment,1,'enforce',values_row.policy_id,
  null,values_row.reason,operator.user_id
from (values
  ('test','13000000-0000-4000-8000-000000000006'::uuid,'Enforce the owner-approved Test canary maximum.'),
  ('live','13000000-0000-4000-8000-000000000007'::uuid,'Defensive Live loss gate; no Live execution scope or activation exists.')
) values_row(environment,policy_id,reason)
cross join lateral(select user_id from tongs.platform_operators order by granted_at limit 1) operator;

create table tongs.hearth_script_generation_proposals(
  id uuid primary key,
  operation_id text not null unique check(length(btrim(operation_id)) between 8 and 300),
  reservation_id uuid not null unique references tongs.funding_reservations(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  workspace_id uuid not null references tongs.workspaces(id) on delete restrict,
  workpiece_id uuid not null references tongs.episodes(id) on delete restrict,
  request_fingerprint text not null check(request_fingerprint~'^[0-9a-f]{64}$'),
  provider_request_id text,
  input_units bigint not null check(input_units>=0 and input_units<=32000),
  output_units bigint not null check(output_units>=0 and output_units<=8000),
  result_json jsonb not null check(jsonb_typeof(result_json)='object'),
  proposal_state text not null default 'proposed' check(proposal_state='proposed'),
  created_at timestamptz not null default now()
);
create index hearth_script_generation_proposals_scope_idx
  on tongs.hearth_script_generation_proposals(user_id,workspace_id,workpiece_id,created_at desc);
alter table tongs.hearth_script_generation_proposals enable row level security;
alter table tongs.hearth_script_generation_proposals force row level security;
revoke all on tongs.hearth_script_generation_proposals from public,anon,authenticated,service_role;
grant select on tongs.hearth_script_generation_proposals to service_role;
create trigger hearth_script_generation_proposals_immutable
before update or delete on tongs.hearth_script_generation_proposals
for each row execute function tongs._reject_accounting_mutation();

create or replace function tongs.persist_hearth_script_generation_proposal(
  p_operation_id text,p_reservation_id uuid,p_user_id uuid,p_workspace_id uuid,
  p_workpiece_id uuid,p_request_fingerprint text,p_provider_request_id text,
  p_input_units bigint,p_output_units bigint,p_result_json jsonb
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare
  binding tongs.openai_text_funding_bindings%rowtype;
  quote_binding tongs.openai_text_customer_quote_bindings%rowtype;
  existing tongs.hearth_script_generation_proposals%rowtype;
  proposal_id uuid:=extensions.uuid_generate_v5(p_reservation_id,'hearth-script-proposal');
  script_text text;
  op_value text;
begin
  perform tongs._require_pricing_service_role();
  select * into binding from tongs.openai_text_funding_bindings
  where operation_id=btrim(p_operation_id) and reservation_id=p_reservation_id
    and route_code='hearth.script_generation';
  select quote.* into quote_binding
  from tongs.openai_text_customer_quote_bindings quote
  join tongs.funding_reservations reservation on reservation.quote_id=quote.quote_id
  where reservation.id=p_reservation_id;
  script_text:=p_result_json->>'script_text';
  op_value:=p_result_json->'ops'->0->>'value';
  if binding.reservation_id is null or quote_binding.quote_id is null
    or binding.cost_policy_revision_id<>'13000000-0000-4000-8000-000000000001'::uuid
    or quote_binding.user_id<>p_user_id or quote_binding.workspace_id<>p_workspace_id
    or quote_binding.workpiece_id<>p_workpiece_id::text
    or quote_binding.request_fingerprint<>p_request_fingerprint
    or jsonb_typeof(coalesce(p_result_json,'null'::jsonb))<>'object'
    or nullif(btrim(coalesce(p_result_json->>'assistant_text','')),'') is null
    or jsonb_typeof(p_result_json->'ops')<>'array'
    or jsonb_array_length(p_result_json->'ops')<>1
    or p_result_json->'ops'->0->>'op'<>'set_body'
    or nullif(btrim(coalesce(script_text,'')),'') is null or script_text<>op_value
    or script_text!~'^\s*\[s1\]' or script_text!~'\[/s1\]\s*$'
    or jsonb_typeof(p_result_json->'tag_audit')<>'object'
    or p_result_json->'research_artifact' is distinct from 'null'::jsonb
    or p_input_units not between 0 and 32000 or p_output_units not between 0 and 8000
  then raise exception 'invalid bounded Hearth script proposal' using errcode='22023'; end if;
  select * into existing from tongs.hearth_script_generation_proposals
  where operation_id=btrim(p_operation_id) or reservation_id=p_reservation_id;
  if found then
    if existing.operation_id<>btrim(p_operation_id)
      or existing.reservation_id<>p_reservation_id
      or existing.request_fingerprint<>p_request_fingerprint
      or existing.result_json<>p_result_json then
      raise exception 'Hearth script proposal replay conflict' using errcode='23505';
    end if;
    return existing.result_json||jsonb_build_object(
      'proposal_id',existing.id,'proposal_state',existing.proposal_state,
      'provider_request_id',existing.provider_request_id,
      'input_units',existing.input_units,'output_units',existing.output_units,'replay',true
    );
  end if;
  insert into tongs.hearth_script_generation_proposals(
    id,operation_id,reservation_id,user_id,workspace_id,workpiece_id,
    request_fingerprint,provider_request_id,input_units,output_units,result_json
  ) values(
    proposal_id,btrim(p_operation_id),p_reservation_id,p_user_id,p_workspace_id,
    p_workpiece_id,p_request_fingerprint,p_provider_request_id,p_input_units,
    p_output_units,p_result_json
  ) returning * into existing;
  return existing.result_json||jsonb_build_object(
    'proposal_id',existing.id,'proposal_state',existing.proposal_state,
    'provider_request_id',existing.provider_request_id,
    'input_units',existing.input_units,'output_units',existing.output_units,'replay',false
  );
end $$;

create or replace function tongs.read_hearth_script_generation_proposal(
  p_operation_id text,p_reservation_id uuid
) returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare proposal tongs.hearth_script_generation_proposals%rowtype;
begin
  perform tongs._require_pricing_service_role();
  select * into proposal from tongs.hearth_script_generation_proposals
  where operation_id=btrim(p_operation_id) and reservation_id=p_reservation_id;
  if proposal.id is null then return null; end if;
  return proposal.result_json||jsonb_build_object(
    'proposal_id',proposal.id,'proposal_state',proposal.proposal_state,
    'provider_request_id',proposal.provider_request_id,
    'input_units',proposal.input_units,'output_units',proposal.output_units,'replay',true
  );
end $$;

revoke all on function tongs.persist_hearth_script_generation_proposal(text,uuid,uuid,uuid,uuid,text,text,bigint,bigint,jsonb)
  from public,anon,authenticated;
revoke all on function tongs.read_hearth_script_generation_proposal(text,uuid)
  from public,anon,authenticated;
grant execute on function tongs.persist_hearth_script_generation_proposal(text,uuid,uuid,uuid,uuid,text,text,bigint,bigint,jsonb)
  to service_role;
grant execute on function tongs.read_hearth_script_generation_proposal(text,uuid)
  to service_role;

-- One canary scope only. This rollout currently has exactly one active normal
-- Test customer authority; fail closed rather than selecting an identity if
-- that precondition changes.
do $$
begin
  if (select count(*) from tongs.customer_paid_execution_scope_authorizations
      where authorization_kind='normal_customer' and financial_environment='test'
        and route_code='hearth.chat_completion' and provider='openai'
        and model_or_sku='gpt-5.6-luna' and status='active')<>1
  then raise exception 'exactly one active normal Test chat authority is required for this canary'; end if;
end $$;

insert into tongs.customer_paid_execution_scope_authorizations(
  id,user_id,workspace_id,financial_environment,route_code,provider,model_or_sku,
  pricing_revision_id,cost_policy_revision_id,maximum_operation_count,
  maximum_customer_charge_micros,maximum_wholesale_exposure_micros,
  maximum_concurrency,rolling_window_seconds,valid_from,valid_until,status,
  reason,created_by,authorization_kind
)
select extensions.uuid_generate_v5(chat.id,'hearth.script_generation'),chat.user_id,chat.workspace_id,
  'test','hearth.script_generation','openai','gpt-5.6-luna',
  '13000000-0000-4000-8000-000000000003','13000000-0000-4000-8000-000000000001',
  null,25000,16000,1,null,now(),null,'active',
  'Owner-approved one-attempt Hearth script-generation Test canary; immutable proposal only.',
  chat.created_by,'normal_customer'
from tongs.customer_paid_execution_scope_authorizations chat
where chat.financial_environment='test' and chat.route_code='hearth.chat_completion'
  and chat.provider='openai' and chat.model_or_sku='gpt-5.6-luna'
  and chat.status='active' and chat.authorization_kind='normal_customer';

do $$
begin
  if (select count(*) from tongs.customer_paid_execution_scope_authorizations
      where route_code='hearth.script_generation' and financial_environment='test'
        and status='active')<>1
  then raise exception 'exactly one Test script-generation canary scope is required'; end if;
  if exists (
    select 1 from tongs.customer_paid_execution_scope_authorizations
    where route_code='hearth.script_generation' and financial_environment='live'
      and status='active'
  ) then raise exception 'Live script-generation scope must remain absent'; end if;
  if (select lifecycle_state from tongs.financial_environment_configuration_revisions
      where environment='live' order by revision desc limit 1)<>'inactive_ready'
  then raise exception 'Live financial environment changed unexpectedly'; end if;
end $$;

comment on table tongs.hearth_script_generation_proposals is
  'Immutable validated script proposals. Applying a proposal to the canonical episode draft is intentionally a separate creator-authorized operation.';
comment on function tongs.persist_hearth_script_generation_proposal(text,uuid,uuid,uuid,uuid,text,text,bigint,bigint,jsonb) is
  'Validates and persists one exact accepted Hearth script-generation result before financial settlement; it never mutates the episode draft.';

notify pgrst,'reload schema';
commit;

