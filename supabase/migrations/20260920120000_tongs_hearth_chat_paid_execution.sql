-- Server-owned Hearth chat execution context and canonical paid-result persistence.
-- This migration does not activate a route, approve a proposal, create a budget,
-- publish a customer price, or authorize provider execution.

begin;

create table tongs.openai_text_persisted_results (
  id uuid primary key,
  reservation_id uuid not null unique references tongs.funding_reservations(id) on delete restrict,
  operation_id text not null unique references tongs.openai_text_funding_bindings(operation_id) on delete restrict,
  route_code text not null references tongs.openai_text_route_policies(route_code) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  workspace_id uuid references tongs.workspaces(id) on delete restrict,
  workpiece_id text not null check (length(btrim(workpiece_id)) between 1 and 300),
  request_fingerprint text not null check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  provider_request_id text,
  model text not null check (length(btrim(model)) between 2 and 160),
  input_units bigint not null check (input_units >= 0),
  output_units bigint not null check (output_units >= 0),
  result_hash text not null check (result_hash ~ '^[0-9a-f]{64}$'),
  result_json jsonb not null check (jsonb_typeof(result_json) = 'object'),
  persisted_at timestamptz not null default now()
);

alter table tongs.openai_text_persisted_results enable row level security;
alter table tongs.openai_text_persisted_results force row level security;
revoke all on tongs.openai_text_persisted_results from public, anon, authenticated, service_role;
grant select on tongs.openai_text_persisted_results to service_role;

create trigger openai_text_persisted_results_immutable
before update or delete on tongs.openai_text_persisted_results
for each row execute function tongs._reject_accounting_mutation();

create or replace function tongs.read_openai_text_route_execution_requirement(p_route_code text)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare v_rollout tongs.openai_text_rollout_revisions%rowtype;
begin
  perform tongs._require_pricing_service_role();
  select * into v_rollout from tongs._current_openai_text_rollout(btrim(coalesce(p_route_code,'')));
  if not found then raise exception 'OpenAI text route not found' using errcode='P0002'; end if;
  return jsonb_build_object(
    'route_code',v_rollout.route_code,
    'mode',v_rollout.mode,
    'funding_context_required',v_rollout.mode='enforce',
    'cost_policy_revision_id',v_rollout.cost_policy_revision_id,
    'rollout_revision',v_rollout.revision
  );
end $$;

create or replace function tongs.resolve_hearth_chat_paid_execution_context(
  p_operation_id text,
  p_reservation_id uuid,
  p_user_id uuid,
  p_workspace_id uuid,
  p_workpiece_id text,
  p_request_fingerprint text
) returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare
  v_binding tongs.openai_text_funding_bindings%rowtype;
  v_reservation tongs.funding_reservations%rowtype;
  v_quote tongs.customer_spending_quotes%rowtype;
  v_cost tongs.openai_text_cost_policy_revisions%rowtype;
  v_rollout tongs.openai_text_rollout_revisions%rowtype;
  v_rate tongs.openai_text_provider_rate_revisions%rowtype;
  v_rate_id uuid;
  v_failure_limit bigint;
begin
  perform tongs._require_pricing_service_role();
  if length(btrim(coalesce(p_operation_id,'')))<8 or p_reservation_id is null or p_user_id is null
     or length(btrim(coalesce(p_workpiece_id,'')))<1
     or p_request_fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid Hearth paid execution handle' using errcode='22023';
  end if;
  select * into v_binding from tongs.openai_text_funding_bindings
    where operation_id=btrim(p_operation_id) and reservation_id=p_reservation_id;
  if not found or v_binding.route_code<>'hearth.chat_completion' then
    raise exception 'funded Hearth chat binding required' using errcode='P0002';
  end if;
  select * into v_reservation from tongs.funding_reservations where id=p_reservation_id;
  select * into v_quote from tongs.customer_spending_quotes where id=v_reservation.quote_id;
  if not found or v_reservation.user_id<>p_user_id or v_quote.user_id<>p_user_id
     or v_quote.operation_id<>v_binding.operation_id
     or v_quote.workspace_id is distinct from p_workspace_id
     or v_quote.request_fingerprint<>p_request_fingerprint
     or not exists(select 1 from tongs.customer_spending_quote_acceptances a
       where a.quote_id=v_quote.id and a.user_id=p_user_id) then
    raise exception 'accepted reserved Hearth funding context does not match request' using errcode='42501';
  end if;
  select * into v_cost from tongs.openai_text_cost_policy_revisions where id=v_binding.cost_policy_revision_id;
  select * into v_rollout from tongs._current_openai_text_rollout(v_binding.route_code);
  if v_cost.id is null or v_rollout.route_code is null or v_rollout.mode<>'enforce'
     or v_rollout.cost_policy_revision_id is distinct from v_binding.cost_policy_revision_id
     or v_cost.lifecycle_state not in ('pilot_candidate','active') or v_cost.cost_coverage<>'complete'
     or v_reservation.reserved_wholesale_spend_micros<>v_cost.full_cost_ceiling_micros then
    raise exception 'Hearth chat execution is not activated for the accepted cost revision' using errcode='42501';
  end if;
  v_rate_id:=nullif(v_cost.attempt_plan->0->>'rate_revision_id','')::uuid;
  select * into v_rate from tongs.openai_text_provider_rate_revisions where id=v_rate_id;
  if not found or v_rate.provider_model_id<>v_binding.model then
    raise exception 'pricing_not_configured: exact OpenAI model rate missing' using errcode='P0001';
  end if;
  v_failure_limit:=case when v_binding.credential_funding='forge' then v_cost.full_cost_ceiling_micros else 0 end;
  return jsonb_build_object(
    'operation_id',v_binding.operation_id,
    'reservation_id',v_binding.reservation_id,
    'quote_id',v_reservation.quote_id,
    'route_code',v_binding.route_code,
    'user_id',v_reservation.user_id,
    'workspace_id',v_quote.workspace_id,
    'workpiece_id',btrim(p_workpiece_id),
    'request_fingerprint',v_quote.request_fingerprint,
    'funding_source_type',v_reservation.funding_source_type,
    'funding_source_id',v_reservation.funding_source_id,
    'credential_funding',v_binding.credential_funding,
    'model',v_binding.model,
    'maximum_input_units',v_binding.maximum_input_units,
    'maximum_output_units',v_binding.maximum_output_units,
    'maximum_attempts',v_binding.maximum_attempts,
    'maximum_failure_exposure_micros',v_failure_limit,
    'direct_provider_ceiling_micros',v_cost.direct_provider_ceiling_micros,
    'supporting_cost_ceiling_micros',v_cost.supporting_cost_ceiling_micros,
    'full_cost_ceiling_micros',v_cost.full_cost_ceiling_micros,
    'input_micros_per_million_tokens',v_rate.input_micros_per_million_tokens,
    'cached_input_micros_per_million_tokens',v_rate.cached_input_micros_per_million_tokens,
    'output_micros_per_million_tokens',v_rate.output_micros_per_million_tokens,
    'cost_policy_revision_id',v_cost.id,
    'rollout_revision',v_rollout.revision
    ,'reservation_state',tongs._funding_reservation_state(p_reservation_id)
  );
end $$;

create or replace function tongs.read_hearth_chat_paid_result(
  p_operation_id text,
  p_reservation_id uuid,
  p_user_id uuid,
  p_request_fingerprint text
) returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare v_result tongs.openai_text_persisted_results%rowtype;
begin
  perform tongs._require_pricing_service_role();
  select * into v_result from tongs.openai_text_persisted_results
    where operation_id=btrim(coalesce(p_operation_id,'')) and reservation_id=p_reservation_id
      and user_id=p_user_id and request_fingerprint=p_request_fingerprint;
  if not found then raise exception 'canonical Hearth paid result not found' using errcode='P0002'; end if;
  return jsonb_build_object(
    'result_id',v_result.id,'operation_id',v_result.operation_id,'reservation_id',v_result.reservation_id,
    'provider_request_id',v_result.provider_request_id,'model',v_result.model,
    'input_units',v_result.input_units,'output_units',v_result.output_units,
    'customer_charge_micros',coalesce((select e.customer_charge_micros
      from tongs.funding_reservation_events e where e.reservation_id=v_result.reservation_id
        and e.event_type='settled' order by e.sequence desc limit 1),0),
    'result_hash',v_result.result_hash,'result_json',v_result.result_json,'persisted_at',v_result.persisted_at
  );
end $$;

create or replace function tongs.persist_hearth_chat_paid_result(
  p_result_id uuid,
  p_operation_id text,
  p_reservation_id uuid,
  p_user_id uuid,
  p_workspace_id uuid,
  p_workpiece_id text,
  p_request_fingerprint text,
  p_provider_request_id text,
  p_model text,
  p_input_units bigint,
  p_output_units bigint,
  p_result_hash text,
  p_result_json jsonb
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare
  v_binding tongs.openai_text_funding_bindings%rowtype;
  v_reservation tongs.funding_reservations%rowtype;
  v_quote tongs.customer_spending_quotes%rowtype;
  v_existing tongs.openai_text_persisted_results%rowtype;
begin
  perform tongs._require_pricing_service_role();
  if p_result_id is null or p_reservation_id is null or p_user_id is null
     or length(btrim(coalesce(p_workpiece_id,'')))<1
     or p_request_fingerprint !~ '^[0-9a-f]{64}$' or p_result_hash !~ '^[0-9a-f]{64}$'
     or p_input_units<0 or p_output_units<0
     or jsonb_typeof(coalesce(p_result_json,'null'::jsonb))<>'object' then
    raise exception 'invalid canonical Hearth paid result' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('hearth-paid-result:'||p_reservation_id::text,0));
  select * into v_existing from tongs.openai_text_persisted_results where reservation_id=p_reservation_id;
  if found then
    if v_existing.operation_id<>btrim(p_operation_id) or v_existing.result_hash<>p_result_hash
       or v_existing.request_fingerprint<>p_request_fingerprint then
      raise exception 'canonical Hearth result replay conflict' using errcode='23505';
    end if;
    return jsonb_build_object('result_id',v_existing.id,'persisted',true,'replay',true,'result_hash',v_existing.result_hash);
  end if;
  select * into v_binding from tongs.openai_text_funding_bindings
    where operation_id=btrim(p_operation_id) and reservation_id=p_reservation_id;
  select * into v_reservation from tongs.funding_reservations where id=p_reservation_id;
  select * into v_quote from tongs.customer_spending_quotes where id=v_reservation.quote_id;
  if v_binding.operation_id is null or v_reservation.id is null or v_quote.id is null
     or v_binding.route_code<>'hearth.chat_completion'
     or v_binding.model<>btrim(p_model) or v_reservation.user_id<>p_user_id or v_quote.user_id<>p_user_id
     or v_quote.workspace_id is distinct from p_workspace_id
     or v_quote.request_fingerprint<>p_request_fingerprint
     or tongs._funding_reservation_state(p_reservation_id)<>'provider_attempt_shadowed'
     or p_input_units>v_binding.maximum_input_units or p_output_units>v_binding.maximum_output_units then
    raise exception 'canonical Hearth result is not bound to the authorized attempt' using errcode='42501';
  end if;
  insert into tongs.openai_text_persisted_results(
    id,reservation_id,operation_id,route_code,user_id,workspace_id,workpiece_id,
    request_fingerprint,provider_request_id,model,input_units,output_units,result_hash,result_json
  ) values (
    p_result_id,p_reservation_id,btrim(p_operation_id),v_binding.route_code,p_user_id,p_workspace_id,
    btrim(p_workpiece_id),p_request_fingerprint,nullif(btrim(coalesce(p_provider_request_id,'')),''),
    btrim(p_model),p_input_units,p_output_units,p_result_hash,p_result_json
  );
  return jsonb_build_object('result_id',p_result_id,'persisted',true,'replay',false,'result_hash',p_result_hash);
end $$;

create or replace function tongs.create_owner_hearth_chat_pilot_quote(
  p_quote_id uuid,
  p_acceptance_id uuid,
  p_acceptance_key text,
  p_operator_user_id uuid,
  p_operation_id text,
  p_workspace_id uuid,
  p_pricing_revision_id uuid,
  p_cost_policy_revision_id uuid,
  p_request_fingerprint text,
  p_expires_at timestamptz
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare
  v_pricing tongs.private_pricing_revisions%rowtype;
  v_policy tongs.private_pricing_policies%rowtype;
  v_cost tongs.openai_text_cost_policy_revisions%rowtype;
  v_existing tongs.customer_spending_quotes%rowtype;
  v_acceptance tongs.customer_spending_quote_acceptances%rowtype;
  v_hash text;
  v_summary jsonb:=jsonb_build_array(
    jsonb_build_object('component','text_generation','provider_label','OpenAI','credential_source','forge'),
    jsonb_build_object('component','validation_and_persistence','provider_label','Forge supporting services','credential_source','forge')
  );
begin
  perform tongs._require_pricing_service_role();
  if p_quote_id is null or p_acceptance_id is null or p_operator_user_id is null
     or not tongs.is_platform_operator(p_operator_user_id) or p_workspace_id is null
     or length(btrim(coalesce(p_operation_id,'')))<8 or length(btrim(coalesce(p_acceptance_key,'')))<8
     or p_request_fingerprint !~ '^[0-9a-f]{64}$' or p_expires_at<=now()
     or p_expires_at>now()+interval '24 hours' then
    raise exception 'invalid owner Hearth chat pilot quote' using errcode='22023';
  end if;
  if not exists(select 1 from tongs.workspaces w where w.id=p_workspace_id and
    (w.created_by=p_operator_user_id or exists(select 1 from tongs.workspace_members m
      where m.workspace_id=w.id and m.user_id=p_operator_user_id))) then
    raise exception 'operator cannot access pilot workspace' using errcode='42501';
  end if;
  select * into v_cost from tongs.openai_text_cost_policy_revisions where id=p_cost_policy_revision_id;
  select * into v_pricing from tongs.private_pricing_revisions where id=p_pricing_revision_id;
  select * into v_policy from tongs.private_pricing_policies where id=v_pricing.policy_id;
  if v_cost.id is null or v_pricing.id is null or v_policy.id is null
     or v_cost.route_code<>'hearth.chat_completion' or v_cost.cost_coverage<>'complete'
     or v_cost.lifecycle_state<>'pilot_candidate' or v_cost.maximum_attempts<>1
     or v_pricing.currency<>'USD' or v_pricing.full_cost_ceiling_micros<>v_cost.full_cost_ceiling_micros
     or lower(coalesce(v_policy.provider,''))<>'openai'
     or lower(coalesce(v_policy.sku,''))<>'gpt-5.3-chat-latest' then
    raise exception 'exact owner Hearth chat pilot pricing is required' using errcode='P0001';
  end if;
  v_hash:=encode(extensions.digest(convert_to(jsonb_build_object(
    'quote_id',p_quote_id,'operator_user_id',p_operator_user_id,'operation_id',btrim(p_operation_id),
    'tool','hearth.chat_completion','workspace_id',p_workspace_id,'pricing_revision_id',v_pricing.id,
    'pricing_revision',v_pricing.revision,'currency','USD','normal_maximum_charge_micros',0,
    'billable_failure_maximum_charge_micros',0,'customer_credit_units',0,
    'full_cost_ceiling_micros',v_cost.full_cost_ceiling_micros,
    'request_fingerprint',p_request_fingerprint,'provider_funding_summary',v_summary,
    'expires_at',p_expires_at,'funding_lane','owner_budget'
  )::text,'utf8'),'sha256'),'hex');
  perform pg_advisory_xact_lock(hashtextextended('owner-hearth-chat-quote:'||p_operator_user_id::text||':'||btrim(p_operation_id),0));
  select * into v_existing from tongs.customer_spending_quotes
    where user_id=p_operator_user_id and operation_id=btrim(p_operation_id);
  if found then
    select * into v_acceptance from tongs.customer_spending_quote_acceptances where quote_id=v_existing.id;
    if v_existing.id<>p_quote_id or v_existing.quote_hash<>v_hash or not found
       or v_acceptance.id<>p_acceptance_id or v_acceptance.acceptance_key<>btrim(p_acceptance_key) then
      raise exception 'owner Hearth quote replay conflict' using errcode='23505';
    end if;
    return jsonb_build_object('quote_id',v_existing.id,'acceptance_id',v_acceptance.id,'replay',true,
      'customer_charge_micros',0,'owner_cost_ceiling_micros',v_existing.full_cost_ceiling_micros);
  end if;
  insert into tongs.customer_spending_quotes(
    id,user_id,operation_id,tool,workspace_id,pricing_revision_id,pricing_revision,currency,
    normal_maximum_charge_micros,billable_failure_maximum_charge_micros,customer_credit_units,
    full_cost_ceiling_micros,billable_failure_classes,free_failure_classes,included_quantity,
    retention_policy,provider_funding_summary,request_fingerprint,quote_hash,expires_at
  ) values (
    p_quote_id,p_operator_user_id,btrim(p_operation_id),'hearth.chat_completion',p_workspace_id,
    v_pricing.id,v_pricing.revision,'USD',0,0,0,v_cost.full_cost_ceiling_micros,'[]'::jsonb,
    '["provider_failure","forge_failure","unknown_fault"]'::jsonb,
    jsonb_build_object('input_tokens',v_cost.maximum_input_units,'output_tokens',v_cost.maximum_output_units,'attempts',1),
    '{"kind":"none"}'::jsonb,v_summary,p_request_fingerprint,v_hash,p_expires_at
  );
  insert into tongs.customer_spending_quote_acceptances(id,quote_id,user_id,acceptance_key,accepted_quote_hash)
  values(p_acceptance_id,p_quote_id,p_operator_user_id,btrim(p_acceptance_key),v_hash);
  return jsonb_build_object('quote_id',p_quote_id,'acceptance_id',p_acceptance_id,'replay',false,
    'customer_charge_micros',0,'owner_cost_ceiling_micros',v_cost.full_cost_ceiling_micros);
end $$;

create or replace function tongs.prepare_owner_hearth_chat_pilot(
  p_quote_id uuid,
  p_acceptance_id uuid,
  p_reservation_id uuid,
  p_operator_user_id uuid,
  p_operation_id text,
  p_workspace_id uuid,
  p_budget_id uuid,
  p_pricing_revision_id uuid,
  p_cost_policy_revision_id uuid,
  p_request_fingerprint text,
  p_acceptance_key text,
  p_reservation_key text,
  p_expires_at timestamptz
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare
  v_quote jsonb;
  v_reservation jsonb;
  v_binding jsonb;
  v_budget tongs.owner_operating_budgets%rowtype;
  v_budget_revision tongs.owner_operating_budget_revisions%rowtype;
  v_cost tongs.openai_text_cost_policy_revisions%rowtype;
begin
  perform tongs._require_pricing_service_role();
  select * into v_cost from tongs.openai_text_cost_policy_revisions where id=p_cost_policy_revision_id;
  select * into v_budget from tongs.owner_operating_budgets where id=p_budget_id;
  select * into v_budget_revision from tongs.owner_operating_budget_revisions
    where budget_id=p_budget_id order by revision desc limit 1;
  if v_cost.id is null or v_budget.id is null or v_budget_revision.budget_id is null
     or v_budget_revision.status<>'active' or v_budget_revision.maximum_amount_micros<>30000
     or v_budget.environment<>'production' or v_budget.workspace_id is distinct from p_workspace_id
     or lower(coalesce(v_budget.provider,''))<>'openai'
     or lower(coalesce(v_budget.route,''))<>'hearth.chat_completion'
     or lower(coalesce(v_budget.sku,''))<>'gpt-5.3-chat-latest'
     or v_budget.currency<>'USD' or now()<v_budget.period_start or now()>=v_budget.period_end
     or v_budget.period_end-v_budget.period_start>interval '24 hours'
     or v_cost.full_cost_ceiling_micros>v_budget_revision.maximum_amount_micros then
    raise exception 'exact active 0.03 USD owner Hearth pilot budget required' using errcode='P0002';
  end if;
  v_quote:=tongs.create_owner_hearth_chat_pilot_quote(
    p_quote_id,p_acceptance_id,p_acceptance_key,p_operator_user_id,p_operation_id,p_workspace_id,
    p_pricing_revision_id,p_cost_policy_revision_id,p_request_fingerprint,p_expires_at
  );
  v_reservation:=tongs.reserve_operation(
    p_reservation_id,p_quote_id,'owner_budget',p_budget_id,p_reservation_key
  );
  v_binding:=tongs.bind_openai_text_funding_reservation(
    p_operation_id,'hearth.chat_completion',p_reservation_id,'forge','gpt-5.3-chat-latest',p_cost_policy_revision_id
  );
  return jsonb_build_object(
    'quote',v_quote,'reservation',v_reservation,'binding',v_binding,
    'customer_charge_micros',0,'customer_revenue_micros',0,'provider_execution_authorized',false
  );
end $$;

do $$ declare v_fn text; begin
  foreach v_fn in array array[
    'read_openai_text_route_execution_requirement(text)',
    'resolve_hearth_chat_paid_execution_context(text,uuid,uuid,uuid,text,text)',
    'read_hearth_chat_paid_result(text,uuid,uuid,text)',
    'persist_hearth_chat_paid_result(uuid,text,uuid,uuid,uuid,text,text,text,text,bigint,bigint,text,jsonb)',
    'create_owner_hearth_chat_pilot_quote(uuid,uuid,text,uuid,text,uuid,uuid,uuid,text,timestamptz)',
    'prepare_owner_hearth_chat_pilot(uuid,uuid,uuid,uuid,text,uuid,uuid,uuid,uuid,text,text,text,timestamptz)'
  ] loop
    execute format('revoke all on function tongs.%s from public,anon,authenticated',v_fn);
    execute format('grant execute on function tongs.%s to service_role',v_fn);
  end loop;
end $$;

comment on table tongs.openai_text_persisted_results is
  'Canonical server-side proof that a paid OpenAI text result was validated and persisted before settlement. Result bodies are service-role only.';
comment on function tongs.resolve_hearth_chat_paid_execution_context(text,uuid,uuid,uuid,text,text) is
  'Resolves immutable accepted funding and pricing bounds for the server-owned Hearth execution adapter; browser-supplied monetary fields are never accepted.';

notify pgrst,'reload schema';
commit;
