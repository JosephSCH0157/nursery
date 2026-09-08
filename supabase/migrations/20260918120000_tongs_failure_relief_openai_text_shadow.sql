-- Customer-zero failure policy, append-only supplier accounting, and inactive OpenAI text bindings.
-- Pricing can be configured privately, but this migration publishes no price and activates no execution.
begin;

create table tongs.supplier_expenses (
  id uuid primary key,
  reservation_id uuid not null references tongs.funding_reservations(id) on delete restrict,
  expense_key text not null unique check (length(btrim(expense_key)) between 8 and 300),
  provider text not null check (length(btrim(provider)) between 2 and 80),
  component_code text not null check (length(btrim(component_code)) between 2 and 120),
  provider_reference text,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  amount_micros bigint check (amount_micros is null or amount_micros >= 0),
  evidence_status text not null check (evidence_status in ('estimated', 'confirmed', 'unresolved')),
  obligation_status text not null check (obligation_status in ('open', 'closed', 'unresolved')),
  evidence_json jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence_json) = 'object'),
  incurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  check (evidence_status = 'unresolved' or amount_micros is not null)
);

create table tongs.supplier_recovery_claims (
  id uuid primary key,
  supplier_expense_id uuid not null references tongs.supplier_expenses(id) on delete restrict,
  claim_key text not null unique check (length(btrim(claim_key)) between 8 and 300),
  status text not null check (status in ('identified', 'draft', 'submitted', 'accepted', 'denied', 'closed')),
  claimed_amount_micros bigint not null check (claimed_amount_micros > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  external_action_taken boolean not null default false,
  evidence_json jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence_json) = 'object'),
  created_at timestamptz not null default now(),
  check (status in ('identified', 'draft') or external_action_taken)
);

create table tongs.supplier_recoveries (
  id uuid primary key,
  supplier_expense_id uuid not null references tongs.supplier_expenses(id) on delete restrict,
  recovery_key text not null unique check (length(btrim(recovery_key)) between 8 and 300),
  provider_reference text not null check (length(btrim(provider_reference)) between 2 and 300),
  amount_micros bigint not null check (amount_micros > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  evidence_status text not null check (evidence_status in ('estimated', 'confirmed')),
  evidence_json jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence_json) = 'object'),
  recovered_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table tongs.customer_operation_reliefs (
  id uuid primary key,
  reservation_id uuid not null unique references tongs.funding_reservations(id) on delete restrict,
  relief_key text not null unique check (length(btrim(relief_key)) between 8 and 300),
  funding_source_type text not null check (funding_source_type in ('customer_deposit', 'paid_allowance')),
  funding_source_id uuid not null,
  original_consumption_id uuid not null,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  customer_credit_micros bigint not null check (customer_credit_micros > 0),
  restored_units bigint not null check (restored_units > 0),
  revenue_reversal_micros bigint not null check (revenue_reversal_micros > 0),
  reason text not null check (length(btrim(reason)) between 3 and 300),
  journal_event_id uuid not null unique references tongs.accounting_journal_events(id) on delete restrict,
  evidence_json jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence_json) = 'object'),
  relieved_at timestamptz not null,
  created_at timestamptz not null default now(),
  check (customer_credit_micros = revenue_reversal_micros)
);

create table tongs.openai_text_route_policies (
  route_code text primary key check (length(btrim(route_code)) between 3 and 120),
  product_area text not null check (product_area in ('hearth', 'visual_motion', 'hammer', 'shorts', 'quench')),
  provider_operation text not null check (provider_operation in ('responses', 'chat_completions')),
  maximum_input_units bigint not null check (maximum_input_units > 0),
  maximum_output_units bigint not null check (maximum_output_units > 0),
  maximum_attempts smallint not null check (maximum_attempts between 1 and 4),
  requires_result_validation boolean not null default true,
  requires_canonical_persistence boolean not null default true,
  byo_supported boolean not null default true,
  rollout_mode text not null default 'inactive' check (rollout_mode in ('inactive', 'shadow', 'enforce')),
  notes text not null,
  created_at timestamptz not null default now()
);

insert into tongs.openai_text_route_policies(
  route_code, product_area, provider_operation, maximum_input_units,
  maximum_output_units, maximum_attempts, notes
) values
  ('hearth.chat_completion', 'hearth', 'responses', 128000, 32000, 3, 'Includes bounded model-access fallback and structured script/research validation.'),
  ('hearth.research_synthesis', 'hearth', 'responses', 128000, 32000, 3, 'Research synthesis must persist through Tongs before success settlement.'),
  ('visual.unified_plan', 'visual_motion', 'responses', 64000, 16000, 1, 'Unified visual-plan schema validation and canonical plan persistence required.'),
  ('visual.narrative_interpretation', 'visual_motion', 'responses', 32000, 8000, 1, 'Image prompt brief schema validation required.'),
  ('motion.broll_interpretation', 'visual_motion', 'responses', 32000, 8000, 1, 'Motion brief schema validation required.'),
  ('hammer.transcript_cleanup', 'hammer', 'chat_completions', 128000, 32000, 2, 'Primary plus one bounded model fallback; accepted transcript persistence required.'),
  ('shorts.discovery', 'shorts', 'responses', 64000, 16000, 1, 'Candidate validation and discovery authority persistence required.'),
  ('quench.metadata', 'quench', 'chat_completions', 32000, 8000, 1, 'Metadata schema validation and persisted handoff required.');

create table tongs.openai_text_funding_bindings (
  operation_id text primary key check (length(btrim(operation_id)) between 8 and 300),
  route_code text not null references tongs.openai_text_route_policies(route_code) on delete restrict,
  reservation_id uuid not null unique references tongs.funding_reservations(id) on delete restrict,
  credential_funding text not null check (credential_funding in ('forge', 'byo_customer')),
  model text not null check (length(btrim(model)) between 2 and 120),
  pricing_revision_id uuid not null references tongs.private_pricing_revisions(id) on delete restrict,
  maximum_input_units bigint not null check (maximum_input_units > 0),
  maximum_output_units bigint not null check (maximum_output_units > 0),
  maximum_attempts smallint not null check (maximum_attempts between 1 and 4),
  created_at timestamptz not null default now()
);

create table tongs.openai_text_usage_evidence (
  id uuid primary key,
  reservation_id uuid not null references tongs.funding_reservations(id) on delete restrict,
  evidence_key text not null unique check (length(btrim(evidence_key)) between 8 and 300),
  provider_request_id text,
  attempt_number smallint not null check (attempt_number between 1 and 4),
  input_units bigint not null check (input_units >= 0),
  output_units bigint not null check (output_units >= 0),
  provider_reported boolean not null,
  result_validated boolean not null,
  canonical_persistence_confirmed boolean not null,
  evidence_json jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence_json) = 'object'),
  recorded_at timestamptz not null default now(),
  unique (reservation_id, attempt_number)
);

do $$ declare v_table text; begin
  foreach v_table in array array[
    'supplier_expenses','supplier_recovery_claims','supplier_recoveries',
    'customer_operation_reliefs','openai_text_route_policies',
    'openai_text_funding_bindings','openai_text_usage_evidence'
  ] loop
    execute format('alter table tongs.%I enable row level security', v_table);
    execute format('revoke all on tongs.%I from public, anon, authenticated, service_role', v_table);
    execute format('grant select on tongs.%I to service_role', v_table);
    execute format('create trigger %I_immutable before update or delete on tongs.%I for each row execute function tongs._reject_accounting_mutation()', v_table, v_table);
  end loop;
end $$;

create or replace function tongs.round_customer_price_micros(p_amount_micros numeric, p_currency text)
returns bigint language plpgsql immutable set search_path = pg_catalog as $$
declare v_increment bigint;
begin
  if p_amount_micros is null or p_amount_micros < 0 then
    raise exception 'invalid customer price' using errcode = '22023';
  end if;
  -- Current supported quote currencies use two decimal minor units. Add a currency map before adding others.
  if upper(btrim(coalesce(p_currency,''))) <> 'USD' then
    raise exception 'pricing_not_configured: unsupported currency rounding policy' using errcode = 'P0001';
  end if;
  v_increment := 10000;
  if p_amount_micros > 9223372036854775807::numeric then
    raise exception 'pricing customer ceiling overflows bigint micros' using errcode = '22003';
  end if;
  return (ceil(p_amount_micros / v_increment::numeric) * v_increment)::bigint;
end $$;

create or replace function tongs.create_shadow_spending_quote(
  p_quote_id uuid,p_user_id uuid,p_operation_id text,p_tool text,p_workspace_id uuid,
  p_pricing_revision_id uuid,p_request_fingerprint text,p_provider_funding_summary jsonb,p_expires_at timestamptz
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_revision tongs.private_pricing_revisions%rowtype; v_existing tongs.customer_spending_quotes%rowtype;
  v_operation text:=nullif(btrim(coalesce(p_operation_id,'')),''); v_tool text:=nullif(btrim(coalesce(p_tool,'')),'');
  v_hash text; v_price bigint; v_free jsonb;
begin
  perform tongs._require_pricing_service_role();
  if p_quote_id is null or p_user_id is null or v_operation is null or length(v_operation)<8 or v_tool is null
    or p_request_fingerprint!~'^[0-9a-f]{64}$' or jsonb_typeof(coalesce(p_provider_funding_summary,'null'::jsonb))<>'array'
    or p_expires_at is null or p_expires_at<=now() then raise exception 'invalid shadow spending quote' using errcode='22023'; end if;
  select * into v_revision from tongs.private_pricing_revisions where id=p_pricing_revision_id;
  if not found then raise exception 'private pricing revision not found' using errcode='P0002'; end if;
  if v_revision.lifecycle_state<>'review_ready' or v_revision.markup_basis_points is null or v_revision.customer_credit_units is null then
    raise exception 'pricing_not_configured' using errcode='P0001'; end if;
  if exists(select 1 from jsonb_array_elements(p_provider_funding_summary)item where jsonb_typeof(item)<>'object'
    or item->>'credential_source' not in ('forge','byo_customer') or nullif(btrim(coalesce(item->>'component','')),'') is null
    or nullif(btrim(coalesce(item->>'provider_label','')),'') is null) then raise exception 'invalid provider funding summary' using errcode='22023'; end if;
  v_price:=tongs.round_customer_price_micros(v_revision.full_cost_ceiling_micros::numeric*(10000::numeric+v_revision.markup_basis_points)/10000::numeric,v_revision.currency);
  v_free:='["forge_failure","provider_failure","provider_billed_failure","unknown_fault","prebilling_rejection","forge_validation_failure","persistence_failure"]'::jsonb;
  v_hash:=encode(extensions.digest(convert_to(jsonb_build_object('quote_id',p_quote_id,'user_id',p_user_id,
    'operation_id',v_operation,'tool',v_tool,'workspace_id',p_workspace_id,'pricing_revision_id',v_revision.id,
    'pricing_revision',v_revision.revision,'currency',v_revision.currency,'normal_maximum_charge_micros',v_price,
    'billable_failure_maximum_charge_micros',0,'customer_credit_units',v_revision.customer_credit_units,
    'request_fingerprint',p_request_fingerprint,'provider_funding_summary',p_provider_funding_summary,'expires_at',p_expires_at)::text,'utf8'),'sha256'),'hex');
  perform pg_advisory_xact_lock(hashtextextended('spending-quote:'||p_user_id::text||':'||v_operation,0));
  select * into v_existing from tongs.customer_spending_quotes where user_id=p_user_id and operation_id=v_operation;
  if found then
    if v_existing.id<>p_quote_id or v_existing.request_fingerprint<>p_request_fingerprint or v_existing.pricing_revision_id<>p_pricing_revision_id then
      raise exception 'shadow spending quote replay conflict' using errcode='23505'; end if;
    return jsonb_build_object('quote_id',v_existing.id,'quote_hash',v_existing.quote_hash,'replay',true,'execution_authorized',false);
  end if;
  insert into tongs.customer_spending_quotes(id,user_id,operation_id,tool,workspace_id,pricing_revision_id,pricing_revision,currency,
    normal_maximum_charge_micros,billable_failure_maximum_charge_micros,customer_credit_units,full_cost_ceiling_micros,
    billable_failure_classes,free_failure_classes,included_quantity,retention_policy,provider_funding_summary,request_fingerprint,quote_hash,expires_at)
  values(p_quote_id,p_user_id,v_operation,v_tool,p_workspace_id,v_revision.id,v_revision.revision,v_revision.currency,v_price,0,
    v_revision.customer_credit_units,v_revision.full_cost_ceiling_micros,'[]'::jsonb,v_free,v_revision.included_quantity,v_revision.retention_policy,
    p_provider_funding_summary,p_request_fingerprint,v_hash,p_expires_at);
  return jsonb_build_object('quote_id',p_quote_id,'quote_hash',v_hash,'replay',false,'execution_authorized',false);
end $$;

-- New pricing revisions disclose every Forge/provider failure as free to the customer.
-- Failure cost ceilings remain private and continue to cap Forge's supplier exposure.
create or replace function tongs.commit_operator_pricing_revision(
  p_markup_rule_revision_id uuid, p_policy_id uuid, p_policy_code text,
  p_scope_kind text, p_provider text, p_sku text, p_expected_revision integer,
  p_revision_id uuid, p_customer_credit_units bigint, p_currency text,
  p_cost_components jsonb, p_billable_failure_classes jsonb,
  p_free_failure_classes jsonb, p_included_quantity jsonb,
  p_retention_policy jsonb, p_change_reason text
) returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare v_actor uuid := auth.uid(); v_markup integer; v_result jsonb; v_free jsonb;
begin
  if v_actor is null or not tongs.is_platform_operator(v_actor) then
    raise exception 'platform operator required' using errcode = '42501';
  end if;
  v_markup := tongs._effective_markup_basis_points(p_markup_rule_revision_id, coalesce(p_provider,''), coalesce(p_sku,''));
  v_free := coalesce(p_free_failure_classes, '[]'::jsonb) ||
    '["forge_failure","provider_failure","provider_billed_failure","unknown_fault","prebilling_rejection","forge_validation_failure","persistence_failure"]'::jsonb;
  v_result := tongs.commit_private_pricing_revision(
    p_policy_id,p_policy_code,p_scope_kind,p_provider,p_sku,p_expected_revision,p_revision_id,
    v_markup,p_customer_credit_units,p_currency,p_cost_components,'[]'::jsonb,
    (select jsonb_agg(distinct value) from jsonb_array_elements(v_free)),
    p_included_quantity,p_retention_policy,p_change_reason
  );
  insert into tongs.private_pricing_revision_markup_sources(pricing_revision_id,markup_rule_revision_id,effective_markup_basis_points)
    values(p_revision_id,p_markup_rule_revision_id,v_markup) on conflict(pricing_revision_id) do nothing;
  return v_result || jsonb_build_object('markup_rule_revision_id',p_markup_rule_revision_id,
    'effective_markup_basis_points',v_markup,'published',false,'customer_failure_ceiling_micros',0,
    'customer_rounding_rule','cost-plus rounded upward to the next USD cent');
end $$;

-- Apply cent-up rounding and zero customer failure charge at quote creation without changing old quote rows.
create or replace function tongs.create_customer_runway_quote(
  p_quote_id uuid, p_user_id uuid, p_operation_id text, p_workspace_id uuid,
  p_operation_fingerprint text, p_model text, p_duration_seconds integer,
  p_ratio text, p_expires_at timestamptz
) returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare v_pricing tongs.private_pricing_revisions%rowtype; v_policy tongs.private_pricing_policies%rowtype;
  v_quote tongs.customer_spending_quotes%rowtype; v_control tongs.paid_execution_control_revisions%rowtype;
  v_create jsonb; v_funding jsonb; v_sku text; v_price bigint;
begin
  perform tongs._require_pricing_service_role();
  select * into v_control from tongs._current_paid_execution_control();
  if p_model <> 'gen4.5' or p_duration_seconds not between 2 and 10 or p_ratio not in ('1280:720','720:1280') then
    raise exception 'unsupported Runway customer SKU' using errcode = '22023'; end if;
  v_sku := lower(p_model || ':' || p_duration_seconds::text || 's:' || p_ratio);
  select * into v_pricing from tongs._published_pricing_revision('runway',v_sku);
  if not found then raise exception 'pricing_not_configured' using errcode = 'P0001'; end if;
  select * into v_policy from tongs.private_pricing_policies where id=v_pricing.policy_id;
  if v_policy.scope_kind <> 'sku' or lower(coalesce(v_policy.provider,'')) <> 'runway' or lower(coalesce(v_policy.sku,'')) <> v_sku then
    raise exception 'pricing_not_configured' using errcode = 'P0001'; end if;
  v_price := tongs.round_customer_price_micros(
    v_pricing.full_cost_ceiling_micros::numeric * (10000::numeric + v_pricing.markup_basis_points)/10000::numeric,
    v_pricing.currency);
  v_create := tongs.create_shadow_spending_quote(p_quote_id,p_user_id,p_operation_id,'tongs_broll_v2',p_workspace_id,
    v_pricing.id,p_operation_fingerprint,jsonb_build_array(jsonb_build_object('component','video_generation','provider_label','Runway','credential_source','forge')),
    p_expires_at);
  select * into v_quote from tongs.customer_spending_quotes where id=p_quote_id;
  v_funding := tongs._select_customer_funding_for_quote(p_quote_id);
  return jsonb_build_object('quote_id',v_quote.id,'operation_id',v_quote.operation_id,'currency',v_quote.currency,
    'customer_price_micros',v_quote.normal_maximum_charge_micros,'maximum_charge_micros',v_quote.normal_maximum_charge_micros,
    'billable_failure_maximum_charge_micros',0,'billable_failure_classes','[]'::jsonb,
    'free_failure_classes',v_quote.free_failure_classes,'funding',v_funding,'expires_at',v_quote.expires_at,
    'retry_terms',jsonb_build_object('duplicate_operation_reuses_state',true,'automatic_resubmission_after_unknown',false),
    'execution_authorized',false,'customer_spending_enabled',v_control.customer_settlement_enabled,
    'rounding_rule','cost-plus rounded upward to the next USD cent');
end $$;

create or replace function tongs.record_supplier_expense(
  p_expense_id uuid,p_reservation_id uuid,p_expense_key text,p_provider text,p_component_code text,
  p_provider_reference text,p_currency text,p_amount_micros bigint,p_evidence_status text,
  p_obligation_status text,p_evidence_json jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_existing tongs.supplier_expenses%rowtype;
begin
  perform tongs._require_pricing_service_role();
  select * into v_existing from tongs.supplier_expenses where expense_key=btrim(p_expense_key);
  if found then return jsonb_build_object('expense_id',v_existing.id,'replay',true,'evidence_status',v_existing.evidence_status); end if;
  insert into tongs.supplier_expenses(id,reservation_id,expense_key,provider,component_code,provider_reference,currency,
    amount_micros,evidence_status,obligation_status,evidence_json,incurred_at)
  values(p_expense_id,p_reservation_id,btrim(p_expense_key),lower(btrim(p_provider)),btrim(p_component_code),
    nullif(btrim(coalesce(p_provider_reference,'')),''),upper(btrim(p_currency)),p_amount_micros,p_evidence_status,
    p_obligation_status,coalesce(p_evidence_json,'{}'::jsonb),now()) returning * into v_existing;
  return jsonb_build_object('expense_id',v_existing.id,'replay',false,'evidence_status',v_existing.evidence_status);
end $$;

create or replace function tongs.relieve_failed_customer_operation(
  p_relief_id uuid,p_reservation_id uuid,p_relief_key text,p_reason text,p_evidence_json jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_res tongs.funding_reservations%rowtype; v_event tongs.funding_reservation_events%rowtype;
  v_existing tongs.customer_operation_reliefs%rowtype; v_consumption_id uuid; v_units bigint; v_charge bigint;
  v_user uuid; v_payload jsonb;
begin
  perform tongs._require_accounting_service_role();
  perform pg_advisory_xact_lock(hashtextextended('customer-relief:'||p_reservation_id::text,0));
  select * into v_existing from tongs.customer_operation_reliefs where reservation_id=p_reservation_id or relief_key=btrim(p_relief_key) limit 1;
  if found then return jsonb_build_object('relief_id',v_existing.id,'replay',true,'customer_credit_micros',v_existing.customer_credit_micros); end if;
  select * into v_res from tongs.funding_reservations where id=p_reservation_id for update;
  if not found then raise exception 'funding reservation not found' using errcode='P0002'; end if;
  select * into v_event from tongs.funding_reservation_events where reservation_id=p_reservation_id and event_type='settled' order by sequence desc limit 1;
  if not found or coalesce(v_event.customer_charge_micros,0)=0 then
    return jsonb_build_object('relief_id',null,'replay',false,'customer_credit_micros',0,'reason','no_customer_charge'); end if;
  if v_res.funding_source_type='customer_deposit' then
    select id,user_id,credit_units_consumed into v_consumption_id,v_user,v_units from tongs.customer_deposit_consumptions
      where deposit_id=v_res.funding_source_id and operation_id=v_res.operation_id;
  elsif v_res.funding_source_type='paid_allowance' then
    select id,user_id,entitlement_units_consumed into v_consumption_id,v_user,v_units from tongs.paid_allowance_consumptions
      where allowance_grant_id=v_res.funding_source_id and operation_id=v_res.operation_id;
  else raise exception 'customer relief requires customer funding source' using errcode='22023'; end if;
  v_charge:=v_event.customer_charge_micros;
  v_payload:=jsonb_build_object('reservation_id',p_reservation_id,'original_consumption_id',v_consumption_id,
    'customer_credit_micros',v_charge,'restored_units',v_units,'reason',btrim(p_reason));
  perform tongs._create_accounting_event(p_relief_id,'operation-relief:'||btrim(p_relief_key),'customer_operation_relieved',
    'live','forge_operation',v_res.operation_id,v_res.currency,v_user,null,null,v_payload,now());
  insert into tongs.customer_operation_reliefs(id,reservation_id,relief_key,funding_source_type,funding_source_id,
    original_consumption_id,currency,customer_credit_micros,restored_units,revenue_reversal_micros,reason,
    journal_event_id,evidence_json,relieved_at)
  values(p_relief_id,p_reservation_id,btrim(p_relief_key),v_res.funding_source_type,v_res.funding_source_id,
    v_consumption_id,v_res.currency,v_charge,v_units,v_charge,btrim(p_reason),p_relief_id,coalesce(p_evidence_json,'{}'::jsonb),now())
  returning * into v_existing;
  insert into tongs.accounting_journal_entries(event_id,line_number,account_code,user_id,deposit_id,allowance_grant_id,currency,amount_micros)
  values
    (p_relief_id,1,'service_revenue_reversal',v_user,case when v_res.funding_source_type='customer_deposit' then v_res.funding_source_id end,
      case when v_res.funding_source_type='paid_allowance' then v_res.funding_source_id end,v_res.currency,v_charge),
    (p_relief_id,2,case when v_res.funding_source_type='customer_deposit' then 'customer_prepaid_liability' else 'allowance_deferred_liability' end,
      v_user,case when v_res.funding_source_type='customer_deposit' then v_res.funding_source_id end,
      case when v_res.funding_source_type='paid_allowance' then v_res.funding_source_id end,v_res.currency,-v_charge);
  insert into tongs.accounting_journal_entries(event_id,line_number,account_code,user_id,deposit_id,allowance_grant_id,unit_kind,quantity_delta)
  values(p_relief_id,3,case when v_res.funding_source_type='customer_deposit' then 'live_customer_credits' else 'allowance_entitlement_units' end,
    v_user,case when v_res.funding_source_type='customer_deposit' then v_res.funding_source_id end,
    case when v_res.funding_source_type='paid_allowance' then v_res.funding_source_id end,'forge_credit',v_units);
  perform tongs._assert_accounting_event_balanced(p_relief_id);
  return jsonb_build_object('relief_id',v_existing.id,'replay',false,'customer_credit_micros',v_charge,
    'restored_units',v_units,'revenue_reversal_micros',v_charge);
end $$;

create or replace function tongs.record_supplier_recovery_claim(
  p_claim_id uuid,p_supplier_expense_id uuid,p_claim_key text,p_claimed_amount_micros bigint,
  p_currency text,p_evidence_json jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_existing tongs.supplier_recovery_claims%rowtype;
begin
  perform tongs._require_pricing_service_role();
  select * into v_existing from tongs.supplier_recovery_claims where claim_key=btrim(p_claim_key);
  if found then return jsonb_build_object('claim_id',v_existing.id,'replay',true,'external_action_taken',false); end if;
  insert into tongs.supplier_recovery_claims(id,supplier_expense_id,claim_key,status,claimed_amount_micros,currency,external_action_taken,evidence_json)
    values(p_claim_id,p_supplier_expense_id,btrim(p_claim_key),'identified',p_claimed_amount_micros,upper(btrim(p_currency)),false,coalesce(p_evidence_json,'{}'::jsonb))
    returning * into v_existing;
  return jsonb_build_object('claim_id',v_existing.id,'replay',false,'external_action_taken',false);
end $$;

create or replace function tongs.record_supplier_recovery(
  p_recovery_id uuid,p_supplier_expense_id uuid,p_recovery_key text,p_provider_reference text,
  p_amount_micros bigint,p_currency text,p_evidence_status text,p_evidence_json jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_existing tongs.supplier_recoveries%rowtype;
begin
  perform tongs._require_pricing_service_role();
  select * into v_existing from tongs.supplier_recoveries where recovery_key=btrim(p_recovery_key);
  if found then return jsonb_build_object('recovery_id',v_existing.id,'replay',true); end if;
  insert into tongs.supplier_recoveries(id,supplier_expense_id,recovery_key,provider_reference,amount_micros,currency,evidence_status,evidence_json,recovered_at)
    values(p_recovery_id,p_supplier_expense_id,btrim(p_recovery_key),btrim(p_provider_reference),p_amount_micros,upper(btrim(p_currency)),p_evidence_status,coalesce(p_evidence_json,'{}'::jsonb),now()) returning * into v_existing;
  return jsonb_build_object('recovery_id',v_existing.id,'replay',false);
end $$;

alter function tongs.settle_operation(uuid,uuid,text,text,text,bigint,jsonb)
  rename to _settle_operation_before_zero_failure_policy;

create or replace function tongs.settle_operation(
  p_reservation_id uuid,p_settlement_id uuid,p_settlement_key text,p_outcome text,
  p_failure_class text,p_actual_fulfillment_cost_micros bigint,p_evidence_json jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_res tongs.funding_reservations%rowtype; v_quote tongs.customer_spending_quotes%rowtype;
  v_state text; v_sequence integer; v_relief jsonb; v_expense jsonb; v_expense_id uuid:=gen_random_uuid();
begin
  perform tongs._require_pricing_service_role();
  if p_outcome='success' then
    return tongs._settle_operation_before_zero_failure_policy(p_reservation_id,p_settlement_id,p_settlement_key,
      p_outcome,p_failure_class,p_actual_fulfillment_cost_micros,p_evidence_json);
  end if;
  if p_outcome not in ('billable_failure','nonbillable_failure') or p_actual_fulfillment_cost_micros<0 then
    raise exception 'invalid operation settlement' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('provider-attempt:'||p_reservation_id::text,0));
  select * into v_res from tongs.funding_reservations where id=p_reservation_id for update;
  if not found then raise exception 'funding reservation not found' using errcode='P0002'; end if;
  select * into v_quote from tongs.customer_spending_quotes where id=v_res.quote_id;
  if p_actual_fulfillment_cost_micros>0 then
    v_expense:=tongs.record_supplier_expense(v_expense_id,p_reservation_id,btrim(p_settlement_key)||':supplier-expense',
      coalesce(nullif(p_evidence_json->>'provider',''),'unknown_supplier'),'failure_fulfillment',
      p_evidence_json->>'provider_reference',v_res.currency,p_actual_fulfillment_cost_micros,
      case when coalesce((p_evidence_json->>'authoritative')::boolean,false) then 'confirmed' else 'estimated' end,
      case when coalesce((p_evidence_json->>'obligation_resolved')::boolean,false) then 'closed' else 'unresolved' end,
      coalesce(p_evidence_json,'{}'::jsonb));
  else
    v_expense:=tongs.record_supplier_expense(v_expense_id,p_reservation_id,btrim(p_settlement_key)||':supplier-expense',
      coalesce(nullif(p_evidence_json->>'provider',''),'unknown_supplier'),'failure_fulfillment',
      p_evidence_json->>'provider_reference',v_res.currency,null,'unresolved','unresolved',coalesce(p_evidence_json,'{}'::jsonb));
  end if;
  v_state:=tongs._funding_reservation_state(p_reservation_id);
  if v_state='settled' then
    v_relief:=tongs.relieve_failed_customer_operation(gen_random_uuid(),p_reservation_id,
      btrim(p_settlement_key)||':customer-relief','Forge/provider failure customer protection',p_evidence_json);
  elsif v_state<>'released' then
    select coalesce(max(sequence),0)+1 into v_sequence from tongs.funding_reservation_events where reservation_id=p_reservation_id;
    insert into tongs.funding_reservation_events(id,reservation_id,sequence,event_type,event_key,
      customer_charge_micros,credit_units,wholesale_spend_micros,failure_class,evidence_json)
    values(gen_random_uuid(),p_reservation_id,v_sequence,'released',btrim(p_settlement_key)||':zero-charge-release',
      0,0,p_actual_fulfillment_cost_micros,coalesce(nullif(btrim(p_failure_class),''),'unknown_fault'),
      coalesce(p_evidence_json,'{}'::jsonb)||jsonb_build_object('reason','confirmed failure; customer charge zero'));
  end if;
  return jsonb_build_object('reservation_id',p_reservation_id,'state',case when v_state='settled' then 'relieved' else 'released' end,
    'replay',coalesce((v_expense->>'replay')::boolean,false),'customer_charge_micros',0,'credit_units',0,
    'revenue_reversal',v_relief,'supplier_expense',v_expense,'supplier_obligation_preserved',true,
    'automatic_resubmission',false);
end $$;

create or replace function tongs.record_openai_text_usage(
  p_evidence_id uuid,p_reservation_id uuid,p_evidence_key text,p_provider_request_id text,
  p_attempt_number smallint,p_input_units bigint,p_output_units bigint,p_provider_reported boolean,
  p_result_validated boolean,p_canonical_persistence_confirmed boolean,p_evidence_json jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_binding tongs.openai_text_funding_bindings%rowtype; v_existing tongs.openai_text_usage_evidence%rowtype;
begin
  perform tongs._require_pricing_service_role();
  select * into v_binding from tongs.openai_text_funding_bindings where reservation_id=p_reservation_id;
  if not found then raise exception 'OpenAI text funding binding required' using errcode='P0001'; end if;
  if p_attempt_number>v_binding.maximum_attempts or p_input_units>v_binding.maximum_input_units or p_output_units>v_binding.maximum_output_units then
    raise exception 'OpenAI text usage exceeded accepted bound' using errcode='P0001'; end if;
  select * into v_existing from tongs.openai_text_usage_evidence where evidence_key=btrim(p_evidence_key);
  if found then return jsonb_build_object('evidence_id',v_existing.id,'replay',true); end if;
  insert into tongs.openai_text_usage_evidence(id,reservation_id,evidence_key,provider_request_id,attempt_number,input_units,output_units,
    provider_reported,result_validated,canonical_persistence_confirmed,evidence_json)
  values(p_evidence_id,p_reservation_id,btrim(p_evidence_key),nullif(btrim(coalesce(p_provider_request_id,'')),''),p_attempt_number,p_input_units,p_output_units,
    p_provider_reported,p_result_validated,p_canonical_persistence_confirmed,coalesce(p_evidence_json,'{}'::jsonb)) returning * into v_existing;
  return jsonb_build_object('evidence_id',v_existing.id,'replay',false,'usable_result',p_result_validated and p_canonical_persistence_confirmed);
end $$;

-- Operator reporting: net revenue reflects relief; supplier evidence controls whether profit is known.
create or replace function tongs.read_failure_financials(p_limit integer default 250)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare v_actor uuid:=auth.uid(); v_limit integer:=least(greatest(coalesce(p_limit,250),1),2000);
begin
  if coalesce(auth.role(),'')<>'service_role' and (v_actor is null or not tongs.is_platform_operator(v_actor)) then
    raise exception 'platform operator required' using errcode='42501'; end if;
  return (select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb) from (
    select r.id reservation_id,r.operation_id,r.user_id,r.funding_source_type,r.currency,
      coalesce(s.customer_charge_micros,0) gross_customer_charge_micros,
      coalesce(rel.revenue_reversal_micros,0) revenue_reversal_micros,
      coalesce(s.customer_charge_micros,0)-coalesce(rel.revenue_reversal_micros,0) recognized_revenue_micros,
      e.amount_micros supplier_expense_micros,e.evidence_status supplier_expense_status,e.obligation_status,
      coalesce(rec.confirmed_recovery_micros,0) confirmed_supplier_recovery_micros,
      case when e.evidence_status='confirmed' and e.amount_micros is not null then
        coalesce(s.customer_charge_micros,0)-coalesce(rel.revenue_reversal_micros,0)-e.amount_micros+coalesce(rec.confirmed_recovery_micros,0)
      else null end contribution_profit_micros,
      case when e.id is null then 'missing' when e.evidence_status='confirmed' then 'confirmed' else 'incomplete' end cost_coverage,
      r.created_at
    from tongs.funding_reservations r
    left join lateral(select customer_charge_micros from tongs.funding_reservation_events where reservation_id=r.id and event_type='settled' order by sequence desc limit 1)s on true
    left join tongs.customer_operation_reliefs rel on rel.reservation_id=r.id
    left join lateral(select * from tongs.supplier_expenses where reservation_id=r.id order by created_at desc limit 1)e on true
    left join lateral(select sum(amount_micros)::bigint confirmed_recovery_micros from tongs.supplier_recoveries where supplier_expense_id=e.id and evidence_status='confirmed')rec on true
    order by r.created_at desc limit v_limit
  )x);
end $$;

create or replace function tongs.read_my_spending_operation(p_operation_id text)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare v_user uuid:=auth.uid(); v_quote tongs.customer_spending_quotes%rowtype; v_res tongs.funding_reservations%rowtype;
  v_settlement tongs.funding_reservation_events%rowtype; v_relief tongs.customer_operation_reliefs%rowtype; v_label text;
begin
  if v_user is null then raise exception 'authentication required' using errcode='42501'; end if;
  select * into v_quote from tongs.customer_spending_quotes where user_id=v_user and operation_id=btrim(p_operation_id);
  if not found then raise exception 'spending operation not found' using errcode='P0002'; end if;
  select * into v_res from tongs.funding_reservations where quote_id=v_quote.id;
  if v_res.id is not null then
    select * into v_settlement from tongs.funding_reservation_events where reservation_id=v_res.id and event_type='settled' order by sequence desc limit 1;
    select * into v_relief from tongs.customer_operation_reliefs where reservation_id=v_res.id;
  end if;
  v_label:=case v_res.funding_source_type when 'customer_deposit' then 'Verified AI credit purchase' when 'paid_allowance' then 'Paid-plan allowance' when 'owner_budget' then 'Forge owner testing' when 'none' then 'No Forge-funded cost' else null end;
  return jsonb_build_object('operation_id',v_quote.operation_id,'quote_id',v_quote.id,'currency',v_quote.currency,
    'normal_maximum_charge_micros',v_quote.normal_maximum_charge_micros,'failure_maximum_charge_micros',0,
    'failure_terms','Forge-caused, provider-caused, validation, persistence, and unknown-fault failures charge $0.',
    'uncertain_submission_terms','Reservation remains held for bounded reconciliation; Forge will not automatically resubmit.',
    'provider_funding_summary',v_quote.provider_funding_summary,
    'accepted',exists(select 1 from tongs.customer_spending_quote_acceptances where quote_id=v_quote.id),
    'reservation_state',case when v_relief.id is not null then 'customer_relieved' when v_res.id is null then null else tongs._funding_reservation_state(v_res.id) end,
    'funding_source',v_res.funding_source_type,'funding_label',v_label,
    'gross_customer_charge_micros',coalesce(v_settlement.customer_charge_micros,0),
    'customer_relief_micros',coalesce(v_relief.customer_credit_micros,0),
    'customer_charge_micros',greatest(coalesce(v_settlement.customer_charge_micros,0)-coalesce(v_relief.customer_credit_micros,0),0),
    'credit_units',case when v_relief.id is not null then 0 else v_settlement.credit_units end,
    'receipt_status',case when v_relief.id is not null then 'failed_customer_relieved' when v_res.id is null then 'quoted' when v_settlement.id is not null then 'settled' else tongs._funding_reservation_state(v_res.id) end,
    'byo_notice','Charges billed directly by a customer provider credential are outside Forge refund control.',
    'execution_authorized',false);
end $$;

-- Tables are private even from ordinary authenticated users.
revoke all on function tongs.round_customer_price_micros(numeric,text) from public,anon,authenticated,service_role;
grant execute on function tongs.round_customer_price_micros(numeric,text) to service_role;
revoke all on function tongs.record_supplier_expense(uuid,uuid,text,text,text,text,text,bigint,text,text,jsonb) from public,anon,authenticated;
revoke all on function tongs.relieve_failed_customer_operation(uuid,uuid,text,text,jsonb) from public,anon,authenticated;
revoke all on function tongs.record_supplier_recovery_claim(uuid,uuid,text,bigint,text,jsonb) from public,anon,authenticated;
revoke all on function tongs.record_supplier_recovery(uuid,uuid,text,text,bigint,text,text,jsonb) from public,anon,authenticated;
revoke all on function tongs.record_openai_text_usage(uuid,uuid,text,text,smallint,bigint,bigint,boolean,boolean,boolean,jsonb) from public,anon,authenticated;
grant execute on function tongs.record_supplier_expense(uuid,uuid,text,text,text,text,text,bigint,text,text,jsonb) to service_role;
grant execute on function tongs.relieve_failed_customer_operation(uuid,uuid,text,text,jsonb) to service_role;
grant execute on function tongs.record_supplier_recovery_claim(uuid,uuid,text,bigint,text,jsonb) to service_role;
grant execute on function tongs.record_supplier_recovery(uuid,uuid,text,text,bigint,text,text,jsonb) to service_role;
grant execute on function tongs.record_openai_text_usage(uuid,uuid,text,text,smallint,bigint,bigint,boolean,boolean,boolean,jsonb) to service_role;
revoke all on function tongs._settle_operation_before_zero_failure_policy(uuid,uuid,text,text,text,bigint,jsonb) from public,anon,authenticated,service_role;
revoke all on function tongs.settle_operation(uuid,uuid,text,text,text,bigint,jsonb) from public,anon,authenticated;
grant execute on function tongs.settle_operation(uuid,uuid,text,text,text,bigint,jsonb) to service_role;
revoke all on function tongs.read_failure_financials(integer) from public,anon;
grant execute on function tongs.read_failure_financials(integer) to authenticated,service_role;
revoke all on function tongs.read_my_spending_operation(text) from public,anon;
grant execute on function tongs.read_my_spending_operation(text) to authenticated;

comment on function tongs.round_customer_price_micros(numeric,text) is 'Preserves micro precision through calculation, then rounds customer price upward to the next USD cent.';
comment on table tongs.customer_operation_reliefs is 'Append-only customer relief and revenue reversal. Supplier reimbursement is deliberately independent.';
comment on table tongs.supplier_recovery_claims is 'Owner-only tracking; insertion performs no external dispute or message.';
comment on table tongs.openai_text_route_policies is 'Complete known OpenAI text route inventory. Every row remains inactive until a separately approved cutover.';

notify pgrst,'reload schema';
commit;
