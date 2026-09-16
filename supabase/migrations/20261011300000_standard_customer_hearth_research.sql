-- Activate bounded standard-customer Hearth research on the same Forge Credit
-- path as ordinary chat. Fixed plan costs and continuing retention are
-- explicitly classified as platform overhead / workspace entitlement; only
-- attributable variable execution costs enter the 21-credit ceiling.
begin;

do $$
begin
  if not exists (
    select 1 from tongs.openai_text_cost_policy_revisions
    where id='11000000-0000-4000-8000-000000000002'
      and route_code='hearth.research_synthesis' and revision=2
      and cost_coverage='supporting_unpriced' and lifecycle_state='draft'
  ) then raise exception 'expected draft Hearth research cost baseline is unavailable'; end if;
  if not exists (
    select 1 from tongs.openai_text_provider_rate_revisions
    where id='56560000-0000-4000-8000-000000000001'
      and runtime_model_alias='gpt-5.6-luna'
      and input_micros_per_million_tokens=200000
      and output_micros_per_million_tokens=1200000
  ) then raise exception 'exact Luna rate revision is unavailable'; end if;
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

alter table tongs.openai_text_supporting_cost_inventory
  drop constraint if exists openai_text_supporting_cost_inventory_disposition_check;
alter table tongs.openai_text_supporting_cost_inventory
  add constraint openai_text_supporting_cost_inventory_disposition_check
  check (disposition in (
    'included_unmetered','separately_blocked','allocation_required',
    'attributable_metered','platform_overhead','workspace_entitlement'
  ));

insert into tongs.openai_text_cost_policy_revisions(
  id,route_code,revision,policy_code,attempt_plan,maximum_input_units,
  maximum_output_units,maximum_attempts,direct_provider_ceiling_micros,
  supporting_cost_ceiling_micros,full_cost_ceiling_micros,cost_coverage,
  lifecycle_state,notes
) values (
  '12000000-0000-4000-8000-000000000001','hearth.research_synthesis',3,
  'openai-text:hearth-research:standard-customer-luna-v1',
  '[{"attempt":1,"rate_revision_id":"56560000-0000-4000-8000-000000000001","runtime_model":"gpt-5.6-luna","provider_model_id":"gpt-5.6-luna","input_max":128000,"output_max":16384}]',
  128000,16384,1,45261,31456,76717,'complete','active',
  'Verified variable ceiling only: Luna 45,261 micros, at most six Brave searches 30,000 micros, and attributable Netlify/Supabase execution 1,456 micros. Fixed plans and audit retention are platform overhead; retained research uses the workspace storage entitlement.'
);

insert into tongs.openai_text_supporting_cost_inventory(
  id,route_code,cost_policy_revision_id,component_code,disposition,evidence_status,notes
) values
  ('22000000-0000-4000-8000-000000000001','hearth.research_synthesis','12000000-0000-4000-8000-000000000001','brave_search_requests','attributable_metered','verified','At most six Brave Search requests at 5,000 micros each; included in the operation wholesale ceiling.'),
  ('22000000-0000-4000-8000-000000000002','hearth.research_synthesis','12000000-0000-4000-8000-000000000001','variable_platform_execution','attributable_metered','verified','Attributable request compute, initial delivery, and first-30-day incremental database storage total 1,456 micros.'),
  ('22000000-0000-4000-8000-000000000003','hearth.research_synthesis','12000000-0000-4000-8000-000000000001','fixed_netlify_supabase_plans','platform_overhead','verified','Fixed Netlify and Supabase subscriptions are Forge platform overhead and are not allocated to a customer operation.'),
  ('22000000-0000-4000-8000-000000000004','hearth.research_synthesis','12000000-0000-4000-8000-000000000001','continuing_research_retention','workspace_entitlement','verified','Canonical research results and source evidence are retained under the customer existing Forge storage entitlement without recurring AI-credit charges.'),
  ('22000000-0000-4000-8000-000000000005','hearth.research_synthesis','12000000-0000-4000-8000-000000000001','accounting_audit_retention','platform_overhead','verified','Immutable billing, accounting, and reconciliation evidence is operational audit data funded as Forge platform overhead.');

do $$
declare
  actor uuid;
  policy_id constant uuid := '12000000-0000-4000-8000-000000000002';
  pricing_id constant uuid := '12000000-0000-4000-8000-000000000003';
  cost_id constant uuid := '12000000-0000-4000-8000-000000000001';
  catalog_id constant uuid := '12000000-0000-4000-8000-000000000005';
  sku constant text := 'openai-text:hearth.research_synthesis:gpt-5.6-luna:12000000-0000-4000-8000-000000000001';
begin
  select user_id into actor from tongs.platform_operators order by granted_at limit 1;
  if actor is null then raise exception 'platform operator required'; end if;

  insert into tongs.private_pricing_policies(id,policy_code,scope_kind,provider,sku,created_by)
  values(policy_id,'forge-standard-customer-hearth-research-luna-v1','sku','openai',sku,actor);

  insert into tongs.private_pricing_revisions(
    id,policy_id,revision,previous_revision_id,lifecycle_state,currency,
    markup_basis_points,full_cost_ceiling_micros,failure_cost_ceiling_micros,
    customer_price_ceiling_micros,billable_failure_ceiling_micros,
    customer_credit_units,billable_failure_classes,free_failure_classes,
    included_quantity,retention_policy,change_reason,content_hash,actor_id,
    unrounded_customer_price_micros,rounding_adjustment_micros,
    settled_customer_price_micros
  ) values (
    pricing_id,policy_id,1,null,'review_ready','USD',3300,76717,0,
    105000,0,21,'[]',
    '["provider_failure","forge_failure","validation_failure","persistence_failure","research_retrieval_failed","research_no_verifiable_sources","research_deadline_exhausted","research_package_size_exceeded","frozen_synthesis_request_rejected"]',
    '{"search_requests":6,"retained_sources":6,"http_attempts":24,"input_tokens":128000,"output_tokens":16384,"provider_attempts":1}',
    '{"research_results":"workspace_storage_entitlement","source_evidence":"workspace_storage_entitlement","billing_evidence":"platform_overhead","recurring_ai_credits":false}',
    'Publish a 21-credit maximum for bounded standard-customer Hearth research using only verified attributable variable costs.',
    encode(extensions.digest(convert_to('forge-standard-customer-hearth-research-luna-v1:76717:102034:2966:105000:21','utf8'),'sha256'),'hex'),
    actor,102034,2966,105000
  );

  insert into tongs.private_pricing_cost_components(
    pricing_revision_id,ordinal,component_code,component_kind,credential_funding,
    provider_label,success_ceiling_micros,failure_ceiling_micros,
    cost_policy_revision,tail_policy,tail_policy_details
  ) values
    (pricing_id,1,'openai_synthesis','direct_provider','forge','OpenAI',45261,0,'Luna rate 2026-09-16','none','{}'),
    (pricing_id,2,'brave_search','supporting_provider','forge','Brave Search',30000,0,'Brave Search API rate 2026-09-16','none','{"maximum_requests":6}'),
    (pricing_id,3,'variable_platform_execution','compute','forge','Netlify/Supabase',1456,0,'Approved attributable execution envelope 2026-09-16','none','{"request_compute_micros":1114,"initial_delivery_micros":219,"first_30_day_storage_micros":123}'),
    (pricing_id,4,'fixed_platform_plans','retention_tail','forge','Forge platform',0,0,'Supporting-cost policy 2026-09-16','plan_funded','{"classification":"platform_overhead","operation_allocation_micros":0}'),
    (pricing_id,5,'workspace_research_retention','storage','forge','Forge storage entitlement',0,0,'Supporting-cost policy 2026-09-16','plan_funded','{"classification":"workspace_storage_entitlement","recurring_ai_credits":false}'),
    (pricing_id,6,'accounting_audit_retention','retention_tail','forge','Forge operations',0,0,'Supporting-cost policy 2026-09-16','plan_funded','{"classification":"platform_overhead","customer_ai_charge_micros":0}');

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
    '12000000-0000-4000-8000-000000000004',policy_id,pricing_id,1,'published',
    'Publish exact 21-credit Hearth research price with zero customer charge for failures.',actor
  );

  insert into tongs.openai_text_model_catalog_revisions(
    id,revision,lifecycle_state,quality_method,source_checked_at,content_hash,actor_id
  ) values (
    catalog_id,5,'active',
    'Revision 4 evidence preserved; Luna Hearth research is rebound to its exact complete standard-customer cost policy.',
    '2026-09-16T00:00:00Z',
    encode(extensions.digest(convert_to('openai-model-catalog:5:standard-customer-hearth-research-luna','utf8'),'sha256'),'hex'),actor
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
        'standard_customer_hearth_research_cost_policy_revision_id',cost_id,
        'standard_customer_hearth_research_pricing_revision_id',pricing_id
      ) else entry.availability_evidence end,
    entry.lifecycle_state,entry.rate_revision_id
  from tongs.openai_text_model_catalog_entries entry
  where entry.catalog_revision_id='3f1d45b8-15ad-4d84-a5f4-0b3845f649ab';

  insert into tongs.openai_text_model_route_compatibility(
    id,catalog_entry_id,route_code,compatibility_status,maximum_input_tokens,
    maximum_output_tokens,maximum_attempts,supporting_cost_coverage,
    cost_policy_revision_id,evidence_json
  )
  select extensions.uuid_generate_v5(
      extensions.uuid_generate_v5(catalog_id,old_entry.provider_model_id),compatibility.route_code
    ),
    extensions.uuid_generate_v5(catalog_id,old_entry.provider_model_id),compatibility.route_code,
    case when old_entry.provider_model_id='gpt-5.6-luna'
      and compatibility.route_code='hearth.research_synthesis'
      then 'generation_verified' else compatibility.compatibility_status end,
    case when old_entry.provider_model_id='gpt-5.6-luna'
      and compatibility.route_code='hearth.research_synthesis'
      then 128000 else compatibility.maximum_input_tokens end,
    case when old_entry.provider_model_id='gpt-5.6-luna'
      and compatibility.route_code='hearth.research_synthesis'
      then 16384 else compatibility.maximum_output_tokens end,
    compatibility.maximum_attempts,
    case when old_entry.provider_model_id='gpt-5.6-luna'
      and compatibility.route_code='hearth.research_synthesis'
      then 'complete' else compatibility.supporting_cost_coverage end,
    case when old_entry.provider_model_id='gpt-5.6-luna'
      and compatibility.route_code='hearth.research_synthesis'
      then cost_id else compatibility.cost_policy_revision_id end,
    case when old_entry.provider_model_id='gpt-5.6-luna'
      and compatibility.route_code='hearth.research_synthesis'
      then compatibility.evidence_json||jsonb_build_object(
        'bounded_retrieval_plan',true,'maximum_search_requests',6,
        'quote_before_search',true,'exact_synthesis_binding_before_provider',true,
        'pricing_revision_id',pricing_id
      ) else compatibility.evidence_json end
  from tongs.openai_text_model_route_compatibility compatibility
  join tongs.openai_text_model_catalog_entries old_entry
    on old_entry.id=compatibility.catalog_entry_id
  where old_entry.catalog_revision_id='3f1d45b8-15ad-4d84-a5f4-0b3845f649ab';
  insert into tongs.openai_text_model_route_compatibility(
    id,catalog_entry_id,route_code,compatibility_status,maximum_input_tokens,
    maximum_output_tokens,maximum_attempts,supporting_cost_coverage,
    cost_policy_revision_id,evidence_json
  )
  select extensions.uuid_generate_v5(entry.id,'hearth.research_synthesis'),entry.id,
    'hearth.research_synthesis','generation_verified',128000,16384,1,'complete',cost_id,
    jsonb_build_object(
      'bounded_retrieval_plan',true,'maximum_search_requests',6,
      'quote_before_search',true,'exact_synthesis_binding_before_provider',true,
      'pricing_revision_id',pricing_id
    )
  from tongs.openai_text_model_catalog_entries entry
  where entry.catalog_revision_id=catalog_id and entry.provider_model_id='gpt-5.6-luna'
    and not exists (
      select 1 from tongs.openai_text_model_route_compatibility compatibility
      where compatibility.catalog_entry_id=entry.id
        and compatibility.route_code='hearth.research_synthesis'
    );
  if not exists (
    select 1 from tongs.openai_text_model_catalog_entries entry
    join tongs.openai_text_model_route_compatibility compatibility
      on compatibility.catalog_entry_id=entry.id
    where entry.catalog_revision_id=catalog_id and entry.provider_model_id='gpt-5.6-luna'
      and compatibility.route_code='hearth.research_synthesis'
      and compatibility.cost_policy_revision_id=cost_id
  ) then raise exception 'active Luna research compatibility unavailable'; end if;

  insert into tongs.openai_text_rollout_revisions(
    route_code,revision,mode,cost_policy_revision_id,reason,actor_id,funding_scope
  ) values (
    'hearth.research_synthesis',3,'enforce',cost_id,
    'Activate credit-bounded standard-customer Hearth research for Forge-funded Test scopes; BYO and owner paths are unchanged.',actor,'forge'
  );
end $$;

-- Append-only, server-private stage evidence for the paid search/retrieval
-- portion that occurs after reservation and before synthesis.
create table tongs.customer_hearth_research_stage_events (
  id uuid primary key,
  reservation_id uuid not null references tongs.funding_reservations(id) on delete restrict,
  stage_key text not null,
  sequence integer not null check(sequence in (1,2)),
  stage_type text not null check(stage_type in ('search','retrieval')),
  stage_ordinal integer not null check(stage_ordinal between 1 and 24),
  event_type text not null check(event_type in ('authorized','captured','failed','submission_unknown')),
  request_fingerprint text not null check(request_fingerprint~'^[0-9a-f]{64}$'),
  maximum_supplier_cost_micros bigint not null check(maximum_supplier_cost_micros>=0),
  actual_supplier_cost_micros bigint check(actual_supplier_cost_micros is null or actual_supplier_cost_micros>=0),
  cost_status text not null check(cost_status in ('not_incurred','estimated','authoritative')),
  request_json jsonb not null default '{}'::jsonb check(jsonb_typeof(request_json)='object'),
  capture_json jsonb check(capture_json is null or jsonb_typeof(capture_json)='object'),
  evidence_json jsonb not null default '{}'::jsonb check(jsonb_typeof(evidence_json)='object'),
  created_at timestamptz not null default now(),
  unique(reservation_id,stage_key,sequence)
);
create unique index customer_hearth_research_one_terminal_stage_event
  on tongs.customer_hearth_research_stage_events(reservation_id,stage_key)
  where event_type in ('captured','failed','submission_unknown');

create table tongs.customer_hearth_research_component_expenses (
  id uuid primary key,
  reservation_id uuid not null references tongs.funding_reservations(id) on delete restrict,
  expense_key text not null unique,
  component text not null check(component in ('search','retrieval','platform_execution')),
  amount_micros bigint not null check(amount_micros>=0),
  cost_status text not null check(cost_status in ('estimated','authoritative')),
  supplier text not null,
  evidence_json jsonb not null default '{}'::jsonb check(jsonb_typeof(evidence_json)='object'),
  created_at timestamptz not null default now()
);

alter table tongs.customer_hearth_research_stage_events enable row level security;
alter table tongs.customer_hearth_research_stage_events force row level security;
alter table tongs.customer_hearth_research_component_expenses enable row level security;
alter table tongs.customer_hearth_research_component_expenses force row level security;
revoke all on tongs.customer_hearth_research_stage_events,tongs.customer_hearth_research_component_expenses
  from public,anon,authenticated,service_role;
grant select on tongs.customer_hearth_research_stage_events,tongs.customer_hearth_research_component_expenses
  to service_role;
create trigger customer_hearth_research_stage_events_immutable before update or delete
  on tongs.customer_hearth_research_stage_events for each row execute function tongs._reject_accounting_mutation();
create trigger customer_hearth_research_component_expenses_immutable before update or delete
  on tongs.customer_hearth_research_component_expenses for each row execute function tongs._reject_accounting_mutation();

create or replace function tongs.begin_customer_hearth_research_stage(
  p_reservation_id uuid,p_stage_key text,p_stage_type text,p_stage_ordinal integer,
  p_request_fingerprint text,p_request_json jsonb,p_maximum_supplier_cost_micros bigint
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare
  binding tongs.openai_text_funding_bindings%rowtype;
  reservation tongs.funding_reservations%rowtype;
  quote_binding tongs.openai_text_customer_quote_bindings%rowtype;
  latest tongs.customer_hearth_research_stage_events%rowtype;
  searches bigint; captured_bytes bigint;
begin
  perform tongs._require_pricing_service_role();
  perform pg_advisory_xact_lock(hashtextextended('customer-hearth-research-stage:'||p_reservation_id::text,0));
  select * into binding from tongs.openai_text_funding_bindings where reservation_id=p_reservation_id;
  select * into reservation from tongs.funding_reservations where id=p_reservation_id;
  select * into quote_binding from tongs.openai_text_customer_quote_bindings where quote_id=reservation.quote_id;
  select * into latest from tongs.customer_hearth_research_stage_events
    where reservation_id=p_reservation_id and stage_key=btrim(p_stage_key)
    order by sequence desc limit 1;
  if found then
    if latest.event_type='authorized' then
      insert into tongs.customer_hearth_research_stage_events values(
        gen_random_uuid(),p_reservation_id,btrim(p_stage_key),2,latest.stage_type,latest.stage_ordinal,
        'submission_unknown',latest.request_fingerprint,latest.maximum_supplier_cost_micros,
        latest.maximum_supplier_cost_micros,'estimated',latest.request_json,null,
        '{"reason":"authorized_stage_reentered_without_capture","duplicate_submission_prohibited":true}',now()
      );
      insert into tongs.customer_hearth_research_component_expenses values(
        gen_random_uuid(),p_reservation_id,'stage:'||btrim(p_stage_key),latest.stage_type,
        latest.maximum_supplier_cost_micros,'estimated',
        case when latest.stage_type='search' then 'Brave Search' else 'retrieval origin' end,
        '{"submission_unknown":true}',now()
      ) on conflict(expense_key) do nothing;
      return jsonb_build_object('replay',true,'capture',null,'event_type','submission_unknown');
    end if;
    return jsonb_build_object('replay',true,'capture',latest.capture_json,'event_type',latest.event_type);
  end if;
  if binding.reservation_id is null or reservation.id is null or quote_binding.quote_id is null
     or binding.route_code<>'hearth.research_synthesis'
     or binding.cost_policy_revision_id<>'12000000-0000-4000-8000-000000000001'::uuid
     or binding.model<>'gpt-5.6-luna' or quote_binding.request_fingerprint<>p_request_fingerprint
     or tongs._funding_reservation_state(p_reservation_id)<>'reserved'
     or now()>=reservation.created_at+interval '60 seconds'
     or p_stage_ordinal not between 1 and 24
     or p_stage_type not in ('search','retrieval')
     or p_maximum_supplier_cost_micros<>(case when p_stage_type='search' then 5000 else 0 end)
  then raise exception 'customer research stage not authorized' using errcode='42501'; end if;
  if exists(select 1 from tongs.customer_hearth_research_stage_events where reservation_id=p_reservation_id and event_type='submission_unknown')
  then raise exception 'research supplier reconciliation required' using errcode='42501'; end if;
  select count(*) into searches from tongs.customer_hearth_research_stage_events
    where reservation_id=p_reservation_id and stage_type='search' and event_type='authorized';
  if p_stage_type='search' and searches>=6 then raise exception 'research search cap reached' using errcode='42501'; end if;
  select coalesce(sum((capture_json->>'response_bytes')::bigint),0) into captured_bytes
    from tongs.customer_hearth_research_stage_events where reservation_id=p_reservation_id and event_type='captured';
  if captured_bytes>=1048576 then raise exception 'research capture cap reached' using errcode='42501'; end if;
  insert into tongs.customer_hearth_research_stage_events values(
    gen_random_uuid(),p_reservation_id,btrim(p_stage_key),1,p_stage_type,p_stage_ordinal,'authorized',
    p_request_fingerprint,p_maximum_supplier_cost_micros,null,'not_incurred',p_request_json,null,'{}',now()
  );
  insert into tongs.customer_hearth_research_component_expenses values(
    gen_random_uuid(),p_reservation_id,'platform:'||p_reservation_id::text,'platform_execution',1456,
    'estimated','Netlify/Supabase','{"classification":"attributable_variable_execution"}',now()
  ) on conflict(expense_key) do nothing;
  return jsonb_build_object('replay',false,'authorized',true);
end $$;

create or replace function tongs._finish_customer_hearth_research_stage(
  p_reservation_id uuid,p_stage_key text,p_event_type text,p_actual bigint,
  p_capture jsonb,p_evidence jsonb
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare
  first_event tongs.customer_hearth_research_stage_events%rowtype;
  latest tongs.customer_hearth_research_stage_events%rowtype;
  total bigint;
begin
  perform tongs._require_pricing_service_role();
  perform pg_advisory_xact_lock(hashtextextended('customer-hearth-research-stage:'||p_reservation_id::text,0));
  select * into first_event from tongs.customer_hearth_research_stage_events
    where reservation_id=p_reservation_id and stage_key=btrim(p_stage_key) and sequence=1;
  select * into latest from tongs.customer_hearth_research_stage_events
    where reservation_id=p_reservation_id and stage_key=btrim(p_stage_key) order by sequence desc limit 1;
  if first_event.id is null then raise exception 'research stage authorization missing' using errcode='42501'; end if;
  if latest.sequence>1 then return jsonb_build_object('replay',true,'event_type',latest.event_type,'capture',latest.capture_json); end if;
  if p_event_type not in ('captured','failed','submission_unknown') or p_actual<0
     or p_actual>first_event.maximum_supplier_cost_micros
  then raise exception 'invalid research stage result' using errcode='22023'; end if;
  if p_event_type='captured' then
    select coalesce(sum((capture_json->>'response_bytes')::bigint),0)+coalesce((p_capture->>'response_bytes')::bigint,0)
      into total from tongs.customer_hearth_research_stage_events
      where reservation_id=p_reservation_id and event_type='captured';
    if total>1048576 then raise exception 'research capture package cap exceeded' using errcode='22023'; end if;
  end if;
  insert into tongs.customer_hearth_research_stage_events values(
    gen_random_uuid(),p_reservation_id,btrim(p_stage_key),2,first_event.stage_type,
    first_event.stage_ordinal,p_event_type,first_event.request_fingerprint,
    first_event.maximum_supplier_cost_micros,p_actual,'estimated',first_event.request_json,
    p_capture,coalesce(p_evidence,'{}'),now()
  ) returning * into latest;
  insert into tongs.customer_hearth_research_component_expenses values(
    gen_random_uuid(),p_reservation_id,'stage:'||btrim(p_stage_key),first_event.stage_type,p_actual,
    'estimated',case when first_event.stage_type='search' then 'Brave Search' else 'retrieval origin' end,
    coalesce(p_evidence,'{}')||jsonb_build_object('event_type',p_event_type),now()
  ) on conflict(expense_key) do nothing;
  return jsonb_build_object('replay',false,'event_type',latest.event_type,'capture',latest.capture_json);
end $$;

create or replace function tongs.complete_customer_hearth_research_stage(
  p_reservation_id uuid,p_stage_key text,p_actual_supplier_cost_micros bigint,p_capture_json jsonb
) returns jsonb language sql security definer set search_path=pg_catalog as $$
  select tongs._finish_customer_hearth_research_stage($1,$2,'captured',$3,$4,'{}')
$$;
create or replace function tongs.fail_customer_hearth_research_stage(
  p_reservation_id uuid,p_stage_key text,p_failure_code text,p_actual_supplier_cost_micros bigint,p_evidence_json jsonb
) returns jsonb language sql security definer set search_path=pg_catalog as $$
  select tongs._finish_customer_hearth_research_stage($1,$2,'failed',$4,null,coalesce($5,'{}')||jsonb_build_object('failure_code',$3))
$$;
create or replace function tongs.mark_customer_hearth_research_stage_unknown(
  p_reservation_id uuid,p_stage_key text,p_evidence_json jsonb
) returns jsonb language sql security definer set search_path=pg_catalog as $$
  select tongs._finish_customer_hearth_research_stage($1,$2,'submission_unknown',
    (select maximum_supplier_cost_micros from tongs.customer_hearth_research_stage_events
     where reservation_id=$1 and stage_key=btrim($2) and sequence=1),null,$3)
$$;

create or replace function tongs.bind_customer_hearth_research_quote_request(
  p_reservation_id uuid,p_request_fingerprint text,p_model text,p_service_tier text,
  p_estimator_revision text,p_tokenizer_revision text,p_serialized_body_sha256 text,
  p_serialized_bytes bigint,p_tokenizer_input_tokens bigint,p_protocol_overhead_tokens bigint,
  p_utf8_byte_token_upper_bound bigint,p_bounded_input_tokens bigint,
  p_maximum_output_tokens bigint,p_maximum_attempts smallint
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare
  reservation tongs.funding_reservations%rowtype;
  quote_binding tongs.openai_text_customer_quote_bindings%rowtype;
  bound jsonb;
begin
  perform tongs._require_pricing_service_role();
  select * into reservation from tongs.funding_reservations where id=p_reservation_id;
  select * into quote_binding from tongs.openai_text_customer_quote_bindings where quote_id=reservation.quote_id;
  if quote_binding.quote_id is null or quote_binding.route_code<>'hearth.research_synthesis'
     or quote_binding.cost_policy_revision_id<>'12000000-0000-4000-8000-000000000001'::uuid
     or quote_binding.request_fingerprint<>p_request_fingerprint
     or p_model<>'gpt-5.6-luna' or p_maximum_output_tokens<>16384 or p_maximum_attempts<>1
     or p_bounded_input_tokens>128000
     or exists(select 1 from tongs.customer_hearth_research_stage_events where reservation_id=p_reservation_id and event_type='submission_unknown')
  then return jsonb_build_object('authorized',false,'reason','request_outside_customer_research_authority'); end if;
  bound:=tongs.bind_bounded_provider_quote_request(
    quote_binding.quote_id,quote_binding.user_id,quote_binding.canonical_operation_id,
    quote_binding.route_code,quote_binding.request_fingerprint,p_model,p_service_tier,
    p_estimator_revision,p_tokenizer_revision,p_serialized_body_sha256,p_serialized_bytes,
    p_tokenizer_input_tokens,p_protocol_overhead_tokens,p_utf8_byte_token_upper_bound,
    p_bounded_input_tokens,p_maximum_output_tokens,p_maximum_attempts
  );
  return bound||jsonb_build_object('authorized',true);
end $$;

create or replace function tongs.settle_customer_hearth_research_before_synthesis(
  p_reservation_id uuid,p_failure_class text,p_evidence_json jsonb default '{}'
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare binding tongs.openai_text_funding_bindings%rowtype;
begin
  perform tongs._require_pricing_service_role();
  select * into binding from tongs.openai_text_funding_bindings where reservation_id=p_reservation_id;
  if binding.reservation_id is null or binding.route_code<>'hearth.research_synthesis'
     or binding.cost_policy_revision_id<>'12000000-0000-4000-8000-000000000001'::uuid
  then raise exception 'customer Hearth research reservation required' using errcode='42501'; end if;
  return tongs.settle_openai_customer_failure_without_duplicate_expense(
    p_reservation_id,
    extensions.uuid_generate_v5(p_reservation_id,'customer-hearth-research-relief:'||btrim(p_failure_class)),
    'customer-hearth-research:'||p_reservation_id::text||':'||btrim(p_failure_class),
    btrim(p_failure_class),
    coalesce(p_evidence_json,'{}')||jsonb_build_object('customer_charge_micros',0)
  );
end $$;

revoke all on function tongs.begin_customer_hearth_research_stage(uuid,text,text,integer,text,jsonb,bigint) from public,anon,authenticated;
revoke all on function tongs._finish_customer_hearth_research_stage(uuid,text,text,bigint,jsonb,jsonb) from public,anon,authenticated;
revoke all on function tongs.complete_customer_hearth_research_stage(uuid,text,bigint,jsonb) from public,anon,authenticated;
revoke all on function tongs.fail_customer_hearth_research_stage(uuid,text,text,bigint,jsonb) from public,anon,authenticated;
revoke all on function tongs.mark_customer_hearth_research_stage_unknown(uuid,text,jsonb) from public,anon,authenticated;
revoke all on function tongs.bind_customer_hearth_research_quote_request(uuid,text,text,text,text,text,text,bigint,bigint,bigint,bigint,bigint,bigint,smallint) from public,anon,authenticated;
revoke all on function tongs.settle_customer_hearth_research_before_synthesis(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function tongs.begin_customer_hearth_research_stage(uuid,text,text,integer,text,jsonb,bigint) to service_role;
grant execute on function tongs.complete_customer_hearth_research_stage(uuid,text,bigint,jsonb) to service_role;
grant execute on function tongs.fail_customer_hearth_research_stage(uuid,text,text,bigint,jsonb) to service_role;
grant execute on function tongs.mark_customer_hearth_research_stage_unknown(uuid,text,jsonb) to service_role;
grant execute on function tongs.bind_customer_hearth_research_quote_request(uuid,text,text,text,text,text,text,bigint,bigint,bigint,bigint,bigint,bigint,smallint) to service_role;
grant execute on function tongs.settle_customer_hearth_research_before_synthesis(uuid,text,jsonb) to service_role;

-- Every future normal Test chat authorization receives a sibling research
-- scope; existing normal Test customers are backfilled. Live receives none.
create or replace function tongs._create_normal_customer_hearth_research_authorization()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
begin
  if new.authorization_kind='normal_customer' and new.financial_environment='test'
     and new.route_code='hearth.chat_completion' and new.provider='openai'
     and new.model_or_sku='gpt-5.6-luna' and new.status='active' then
    insert into tongs.customer_paid_execution_scope_authorizations(
      id,user_id,workspace_id,financial_environment,route_code,provider,model_or_sku,
      pricing_revision_id,cost_policy_revision_id,maximum_operation_count,
      maximum_customer_charge_micros,maximum_wholesale_exposure_micros,
      maximum_concurrency,rolling_window_seconds,valid_from,valid_until,status,
      reason,created_by,authorization_kind
    ) values (
      extensions.uuid_generate_v5(new.id,'hearth.research_synthesis'),new.user_id,new.workspace_id,
      'test','hearth.research_synthesis','openai','gpt-5.6-luna',
      '12000000-0000-4000-8000-000000000003','12000000-0000-4000-8000-000000000001',
      null,105000,76717,1,null,new.valid_from,null,'active',
      'Standard-customer Hearth research sibling scope; bounded by Forge Credits and one concurrent operation.',
      new.created_by,'normal_customer'
    ) on conflict(id) do nothing;
  end if;
  return new;
end $$;
create trigger create_normal_customer_hearth_research_authorization
after insert on tongs.customer_paid_execution_scope_authorizations
for each row execute function tongs._create_normal_customer_hearth_research_authorization();
revoke all on function tongs._create_normal_customer_hearth_research_authorization()
  from public,anon,authenticated,service_role;

insert into tongs.customer_paid_execution_scope_authorizations(
  id,user_id,workspace_id,financial_environment,route_code,provider,model_or_sku,
  pricing_revision_id,cost_policy_revision_id,maximum_operation_count,
  maximum_customer_charge_micros,maximum_wholesale_exposure_micros,
  maximum_concurrency,rolling_window_seconds,valid_from,valid_until,status,
  reason,created_by,authorization_kind
)
select extensions.uuid_generate_v5(chat.id,'hearth.research_synthesis'),chat.user_id,chat.workspace_id,
  'test','hearth.research_synthesis','openai','gpt-5.6-luna',
  '12000000-0000-4000-8000-000000000003','12000000-0000-4000-8000-000000000001',
  null,105000,76717,1,null,chat.valid_from,null,'active',
  'Backfilled standard-customer Hearth research sibling scope; bounded by Forge Credits and one concurrent operation.',
  chat.created_by,'normal_customer'
from tongs.customer_paid_execution_scope_authorizations chat
where chat.authorization_kind='normal_customer' and chat.financial_environment='test'
  and chat.route_code='hearth.chat_completion' and chat.provider='openai'
  and chat.model_or_sku='gpt-5.6-luna' and chat.status='active'
on conflict(id) do nothing;

do $$
begin
  if (select lifecycle_state from tongs.financial_environment_configuration_revisions
      where environment='live' order by revision desc limit 1)<>'inactive_ready'
  then raise exception 'Live financial environment changed unexpectedly'; end if;
  if exists (
    select 1 from tongs.customer_paid_execution_scope_authorizations
    where financial_environment='live' and route_code='hearth.research_synthesis'
      and authorization_kind='normal_customer' and status='active'
  ) then raise exception 'Live customer research must remain inactive'; end if;
  if (select count(*) from tongs.owner_hearth_research_authorizations)<>0
  then raise exception 'owner research authorization state changed unexpectedly'; end if;
  if not exists (
    select 1 from tongs.openai_text_rollout_revisions
    where route_code='hearth.research_synthesis' and revision=3 and mode='enforce'
      and funding_scope='forge' and cost_policy_revision_id='12000000-0000-4000-8000-000000000001'
  ) then raise exception 'standard-customer research activation missing'; end if;
end $$;

comment on table tongs.customer_hearth_research_stage_events is
  'Immutable server-private captures for bounded customer research stages; retention is operational evidence and does not create recurring AI-credit charges.';
comment on table tongs.openai_text_supporting_cost_inventory is
  'Private supporting-cost evidence. Attributable metered costs enter operation ceilings; fixed plans and audit retention are platform overhead, and continuing research retention uses workspace storage entitlement.';

notify pgrst, 'reload schema';
commit;
