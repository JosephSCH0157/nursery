-- Owner-only Runway pilot activation primitives.
-- This migration creates no budget, quote, reservation, control activation, or
-- provider authorization. Customer pricing and settlement remain untouched.

begin;

create or replace function tongs.create_owner_runway_spending_quote(
  p_quote_id uuid,
  p_acceptance_id uuid,
  p_acceptance_key text,
  p_operator_user_id uuid,
  p_operation_id text,
  p_workspace_id uuid,
  p_pricing_revision_id uuid,
  p_request_fingerprint text,
  p_model text,
  p_duration_seconds integer,
  p_ratio text,
  p_expires_at timestamptz
) returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_revision tongs.private_pricing_revisions%rowtype;
  v_policy tongs.private_pricing_policies%rowtype;
  v_existing tongs.customer_spending_quotes%rowtype;
  v_acceptance tongs.customer_spending_quote_acceptances%rowtype;
  v_operation text := nullif(btrim(coalesce(p_operation_id, '')), '');
  v_sku text := lower(coalesce(p_model, '') || ':' || coalesce(p_duration_seconds, 0)::text || 's:' || coalesce(p_ratio, ''));
  v_hash text;
  v_provider_summary jsonb := jsonb_build_array(
    jsonb_build_object('component','generation','provider_label','Runway','credential_source','forge'),
    jsonb_build_object('component','processing_and_retention','provider_label','Forge supporting services','credential_source','forge')
  );
begin
  perform tongs._require_pricing_service_role();
  if p_quote_id is null or p_acceptance_id is null or p_operator_user_id is null
     or not tongs.is_platform_operator(p_operator_user_id)
     or v_operation is null or length(v_operation) < 8
     or p_workspace_id is null or p_request_fingerprint !~ '^[0-9a-f]{64}$'
     or p_model <> 'gen4.5' or p_duration_seconds <> 5 or p_ratio <> '1280:720'
     or length(btrim(coalesce(p_acceptance_key, ''))) < 8
     or p_expires_at is null or p_expires_at <= now()
     or p_expires_at > now() + interval '24 hours' then
    raise exception 'invalid owner Runway spending quote' using errcode = '22023';
  end if;
  if not exists(
    select 1 from tongs.workspaces workspace
    where workspace.id=p_workspace_id
      and (workspace.created_by=p_operator_user_id or exists(
        select 1 from tongs.workspace_members member
        where member.workspace_id=workspace.id and member.user_id=p_operator_user_id
      ))
  ) then
    raise exception 'operator cannot access pilot workspace' using errcode = '42501';
  end if;
  select * into v_revision from tongs.private_pricing_revisions where id=p_pricing_revision_id;
  select * into v_policy from tongs.private_pricing_policies where id=v_revision.policy_id;
  if not found or v_revision.lifecycle_state <> 'draft'
     or v_revision.markup_basis_points is not null
     or v_revision.customer_price_ceiling_micros is not null
     or v_revision.billable_failure_ceiling_micros is not null
     or v_revision.customer_credit_units is not null
     or v_revision.currency <> 'USD'
     or v_revision.full_cost_ceiling_micros <> 750000
     or lower(coalesce(v_policy.provider,'')) <> 'runway'
     or lower(coalesce(v_policy.sku,'')) <> v_sku then
    raise exception 'exact owner-only Runway cost revision required' using errcode = 'P0001';
  end if;
  v_hash := encode(extensions.digest(convert_to(jsonb_build_object(
    'quote_id',p_quote_id,'operator_user_id',p_operator_user_id,'operation_id',v_operation,
    'tool','tongs_broll_v2','workspace_id',p_workspace_id,
    'pricing_revision_id',v_revision.id,'pricing_revision',v_revision.revision,
    'currency',v_revision.currency,'normal_maximum_charge_micros',0,
    'billable_failure_maximum_charge_micros',0,'customer_credit_units',0,
    'full_cost_ceiling_micros',v_revision.full_cost_ceiling_micros,
    'request_fingerprint',p_request_fingerprint,'provider_funding_summary',v_provider_summary,
    'expires_at',p_expires_at,'funding_lane','owner_budget'
  )::text,'utf8'),'sha256'),'hex');
  perform pg_advisory_xact_lock(hashtextextended('owner-runway-quote:'||p_operator_user_id::text||':'||v_operation,0));
  select * into v_existing from tongs.customer_spending_quotes
    where user_id=p_operator_user_id and operation_id=v_operation;
  if found then
    select * into v_acceptance from tongs.customer_spending_quote_acceptances where quote_id=v_existing.id;
    if v_existing.id<>p_quote_id or v_existing.request_fingerprint<>p_request_fingerprint
       or v_existing.pricing_revision_id<>p_pricing_revision_id or v_existing.quote_hash<>v_hash
       or not found or v_acceptance.id<>p_acceptance_id
       or v_acceptance.acceptance_key<>btrim(p_acceptance_key) then
      raise exception 'owner Runway quote replay conflict' using errcode='23505';
    end if;
    return jsonb_build_object('quote_id',v_existing.id,'acceptance_id',v_acceptance.id,
      'quote_hash',v_existing.quote_hash,'replay',true,'customer_charge_micros',0,
      'customer_credit_units',0,'owner_cost_ceiling_micros',v_existing.full_cost_ceiling_micros,
      'execution_authorized',false);
  end if;
  insert into tongs.customer_spending_quotes(
    id,user_id,operation_id,tool,workspace_id,pricing_revision_id,pricing_revision,
    currency,normal_maximum_charge_micros,billable_failure_maximum_charge_micros,
    customer_credit_units,full_cost_ceiling_micros,billable_failure_classes,
    free_failure_classes,included_quantity,retention_policy,provider_funding_summary,
    request_fingerprint,quote_hash,expires_at
  ) values (
    p_quote_id,p_operator_user_id,v_operation,'tongs_broll_v2',p_workspace_id,
    v_revision.id,v_revision.revision,v_revision.currency,0,0,0,
    v_revision.full_cost_ceiling_micros,v_revision.billable_failure_classes,
    v_revision.free_failure_classes,v_revision.included_quantity,v_revision.retention_policy,
    v_provider_summary,p_request_fingerprint,v_hash,p_expires_at
  );
  insert into tongs.customer_spending_quote_acceptances(
    id,quote_id,user_id,acceptance_key,accepted_quote_hash
  ) values (p_acceptance_id,p_quote_id,p_operator_user_id,btrim(p_acceptance_key),v_hash);
  return jsonb_build_object('quote_id',p_quote_id,'acceptance_id',p_acceptance_id,
    'quote_hash',v_hash,'replay',false,'customer_charge_micros',0,
    'customer_credit_units',0,'owner_cost_ceiling_micros',v_revision.full_cost_ceiling_micros,
    'execution_authorized',false);
end;
$$;

create or replace function tongs.reserve_owner_runway_operation(
  p_reservation_id uuid,
  p_quote_id uuid,
  p_budget_id uuid,
  p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare
  v_quote tongs.customer_spending_quotes%rowtype;
  v_budget tongs.owner_operating_budgets%rowtype;
  v_budget_revision tongs.owner_operating_budget_revisions%rowtype;
  v_existing tongs.funding_reservations%rowtype;
  v_hold record;
begin
  perform tongs._require_pricing_service_role();
  if p_reservation_id is null or p_quote_id is null or p_budget_id is null
     or length(btrim(coalesce(p_idempotency_key,'')))<8 then
    raise exception 'invalid owner Runway reservation' using errcode='22023';
  end if;
  select * into v_quote from tongs.customer_spending_quotes where id=p_quote_id;
  if not found or v_quote.expires_at<=now() or v_quote.tool<>'tongs_broll_v2'
     or v_quote.normal_maximum_charge_micros<>0
     or v_quote.billable_failure_maximum_charge_micros<>0 or v_quote.customer_credit_units<>0
     or v_quote.full_cost_ceiling_micros<>750000
     or not tongs.is_platform_operator(v_quote.user_id)
     or not exists(select 1 from tongs.customer_spending_quote_acceptances acceptance
       where acceptance.quote_id=v_quote.id and acceptance.user_id=v_quote.user_id) then
    raise exception 'accepted zero-customer owner Runway quote required' using errcode='P0001';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('funding-reservation:'||v_quote.user_id::text||':'||v_quote.operation_id,0));
  select * into v_existing from tongs.funding_reservations
    where user_id=v_quote.user_id and operation_id=v_quote.operation_id;
  if found then
    if v_existing.id<>p_reservation_id or v_existing.quote_id<>p_quote_id
       or v_existing.funding_source_type<>'owner_budget' or v_existing.funding_source_id<>p_budget_id
       or v_existing.idempotency_key<>btrim(p_idempotency_key) then
      raise exception 'owner Runway reservation replay conflict' using errcode='23505';
    end if;
    return jsonb_build_object('reservation_id',v_existing.id,
      'state',tongs._funding_reservation_state(v_existing.id),'replay',true,
      'reserved_wholesale_spend_micros',v_existing.reserved_wholesale_spend_micros,
      'provider_execution_authorized',false);
  end if;
  select * into v_budget from tongs.owner_operating_budgets where id=p_budget_id for update;
  select * into v_budget_revision from tongs.owner_operating_budget_revisions
    where budget_id=p_budget_id order by revision desc limit 1;
  if not found or v_budget_revision.status<>'active' or v_budget_revision.maximum_amount_micros<>750000
     or v_budget.environment<>'production' or v_budget.workspace_id is distinct from v_quote.workspace_id
     or lower(coalesce(v_budget.provider,''))<>'runway'
     or lower(coalesce(v_budget.route,''))<>'tongs_broll_v2'
     or lower(coalesce(v_budget.sku,''))<>'gen4.5:5s:1280:720'
     or v_budget.currency<>v_quote.currency or now()<v_budget.period_start or now()>=v_budget.period_end then
    raise exception 'exact active owner Runway pilot budget required' using errcode='P0002';
  end if;
  select * into v_hold from tongs._active_funding_hold('owner_budget',p_budget_id);
  if v_quote.full_cost_ceiling_micros > v_budget_revision.maximum_amount_micros-v_hold.wholesale_spend_micros then
    raise exception 'insufficient owner Runway pilot budget' using errcode='P0001';
  end if;
  insert into tongs.funding_reservations(
    id,quote_id,user_id,operation_id,funding_source_type,funding_source_id,currency,
    reserved_customer_charge_micros,reserved_credit_units,reserved_wholesale_spend_micros,idempotency_key
  ) values(p_reservation_id,p_quote_id,v_quote.user_id,v_quote.operation_id,'owner_budget',p_budget_id,
    v_quote.currency,0,0,v_quote.full_cost_ceiling_micros,btrim(p_idempotency_key));
  insert into tongs.funding_reservation_events(
    id,reservation_id,sequence,event_type,event_key,evidence_json
  ) values(gen_random_uuid(),p_reservation_id,1,'reserved',
    'reservation:'||p_reservation_id::text||':reserved',
    jsonb_build_object('funding_lane','owner_budget','customer_charge_micros',0,
      'customer_credit_units',0,'provider_execution_authorized',false));
  return jsonb_build_object('reservation_id',p_reservation_id,'state','reserved','replay',false,
    'reserved_wholesale_spend_micros',v_quote.full_cost_ceiling_micros,
    'customer_charge_micros',0,'customer_credit_units',0,'provider_execution_authorized',false);
end;
$$;

create or replace function tongs.bind_owner_runway_funding_reservation(
  p_operation_id text,
  p_operation_fingerprint text,
  p_reservation_id uuid,
  p_operator_user_id uuid,
  p_workspace_id uuid,
  p_model text,
  p_duration_seconds integer,
  p_ratio text
) returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_operation text := nullif(btrim(coalesce(p_operation_id,'')),'');
  v_reservation tongs.funding_reservations%rowtype;
  v_quote tongs.customer_spending_quotes%rowtype;
  v_pricing tongs.private_pricing_revisions%rowtype;
  v_policy tongs.private_pricing_policies%rowtype;
  v_existing tongs.runway_funding_bindings%rowtype;
  v_cost_stack jsonb;
  v_direct bigint;
  v_supporting bigint;
begin
  perform tongs._require_pricing_service_role();
  if v_operation is null or p_operation_fingerprint !~ '^[0-9a-f]{64}$'
     or p_reservation_id is null or p_operator_user_id is null
     or not tongs.is_platform_operator(p_operator_user_id) or p_workspace_id is null
     or p_model<>'gen4.5' or p_duration_seconds<>5 or p_ratio<>'1280:720' then
    raise exception 'invalid owner Runway funding binding' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('runway-funding-binding:'||v_operation,0));
  select * into v_existing from tongs.runway_funding_bindings where operation_id=v_operation;
  if found then
    if v_existing.operation_fingerprint<>p_operation_fingerprint
       or v_existing.reservation_id<>p_reservation_id
       or v_existing.user_id<>p_operator_user_id or v_existing.workspace_id<>p_workspace_id
       or v_existing.model<>p_model or v_existing.duration_seconds<>p_duration_seconds
       or v_existing.ratio<>p_ratio then
      raise exception 'owner Runway funding binding replay conflict' using errcode='23505';
    end if;
    return jsonb_build_object('operation_id',v_operation,'reservation_id',p_reservation_id,
      'replay',true,'provider_execution_authorized',false);
  end if;
  select * into v_reservation from tongs.funding_reservations where id=p_reservation_id for update;
  if not found or v_reservation.operation_id<>v_operation
     or v_reservation.user_id<>p_operator_user_id
     or v_reservation.funding_source_type<>'owner_budget'
     or tongs._funding_reservation_state(v_reservation.id)<>'reserved' then
    raise exception 'eligible owner reservation not found' using errcode='P0002';
  end if;
  select * into v_quote from tongs.customer_spending_quotes where id=v_reservation.quote_id;
  if not found or v_quote.user_id<>p_operator_user_id
     or v_quote.workspace_id is distinct from p_workspace_id or v_quote.operation_id<>v_operation
     or v_quote.tool<>'tongs_broll_v2' or v_quote.request_fingerprint<>p_operation_fingerprint
     or v_quote.normal_maximum_charge_micros<>0
     or v_quote.billable_failure_maximum_charge_micros<>0 or v_quote.customer_credit_units<>0
     or not exists(select 1 from tongs.customer_spending_quote_acceptances a
       where a.quote_id=v_quote.id and a.user_id=p_operator_user_id) then
    raise exception 'owner Runway quote identity does not match operation' using errcode='42501';
  end if;
  select * into v_pricing from tongs.private_pricing_revisions where id=v_quote.pricing_revision_id;
  select * into v_policy from tongs.private_pricing_policies where id=v_pricing.policy_id;
  if v_pricing.lifecycle_state<>'draft' or v_pricing.markup_basis_points is not null
     or v_pricing.customer_price_ceiling_micros is not null
     or v_pricing.billable_failure_ceiling_micros is not null
     or v_pricing.customer_credit_units is not null
     or lower(coalesce(v_policy.provider,''))<>'runway'
     or lower(coalesce(v_policy.sku,''))<>lower('gen4.5:'||p_duration_seconds::text||'s:'||p_ratio) then
    raise exception 'exact owner-only Runway cost revision required' using errcode='P0001';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'component_code',component.component_code,'component_kind',component.component_kind,
      'provider_label',component.provider_label,'success_ceiling_micros',component.success_ceiling_micros,
      'failure_ceiling_micros',component.failure_ceiling_micros,
      'cost_policy_revision',component.cost_policy_revision,'tail_policy',component.tail_policy,
      'tail_policy_details',component.tail_policy_details) order by component.ordinal),'[]'::jsonb),
    coalesce(sum(component.success_ceiling_micros) filter(where component.component_kind='direct_provider'
      and lower(component.provider_label)='runway'),0),
    coalesce(sum(component.success_ceiling_micros) filter(where not(component.component_kind='direct_provider'
      and lower(component.provider_label)='runway')),0)
  into v_cost_stack,v_direct,v_supporting
  from tongs.private_pricing_cost_components component where component.pricing_revision_id=v_pricing.id;
  if jsonb_array_length(v_cost_stack)=0 or v_direct<>600000 or v_supporting<>150000
     or v_pricing.full_cost_ceiling_micros<>750000
     or v_reservation.reserved_wholesale_spend_micros<>750000 then
    raise exception 'owner Runway reservation does not cover approved cost stack' using errcode='P0001';
  end if;
  insert into tongs.runway_funding_bindings(
    operation_id,operation_fingerprint,reservation_id,user_id,workspace_id,model,duration_seconds,
    ratio,direct_provider_ceiling_micros,supporting_cost_ceiling_micros,total_cost_ceiling_micros,
    pricing_revision_id,cost_stack_json
  ) values (v_operation,p_operation_fingerprint,p_reservation_id,p_operator_user_id,p_workspace_id,
    p_model,p_duration_seconds,p_ratio,v_direct,v_supporting,v_direct+v_supporting,v_pricing.id,v_cost_stack);
  return jsonb_build_object('operation_id',v_operation,'reservation_id',p_reservation_id,
    'replay',false,'provider_execution_authorized',false,
    'direct_provider_ceiling_micros',v_direct,'supporting_cost_ceiling_micros',v_supporting,
    'total_cost_ceiling_micros',v_direct+v_supporting,'customer_charge_micros',0);
end;
$$;

create or replace function tongs.activate_owner_runway_pilot_controls(p_reason text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare
  v_actor uuid:=auth.uid();
  v_reason text:=nullif(btrim(coalesce(p_reason,'')),'');
  v_current tongs.paid_execution_control_revisions%rowtype;
  v_revision integer;
begin
  if v_actor is null or not tongs.is_platform_operator(v_actor) then
    raise exception 'platform operator required' using errcode='42501';
  end if;
  if v_reason is null then raise exception 'activation reason required' using errcode='22023'; end if;
  select * into v_current from tongs._current_paid_execution_control();
  if v_current.customer_settlement_enabled then
    raise exception 'owner pilot cannot activate while customer settlement is enabled' using errcode='42501';
  end if;
  if exists(
    select 1 from tongs.owner_operating_budgets b
    join lateral(select r.status,r.maximum_amount_micros from tongs.owner_operating_budget_revisions r
      where r.budget_id=b.id order by r.revision desc limit 1) latest on true
    where latest.status='active' and now()>=b.period_start and now()<b.period_end
      and (b.environment<>'production' or lower(coalesce(b.provider,''))<>'runway'
        or lower(coalesce(b.route,''))<>'tongs_broll_v2'
        or lower(coalesce(b.sku,''))<>'gen4.5:5s:1280:720'
        or latest.maximum_amount_micros<>750000)
  ) then raise exception 'broader active owner budget prevents bounded pilot activation' using errcode='42501'; end if;
  if not exists(
    select 1 from tongs.runway_funding_bindings binding
    join tongs.funding_reservations reservation on reservation.id=binding.reservation_id
    join tongs.owner_operating_budgets budget on budget.id=reservation.funding_source_id
    join lateral(select r.status,r.maximum_amount_micros from tongs.owner_operating_budget_revisions r
      where r.budget_id=budget.id order by r.revision desc limit 1) latest on true
    where binding.user_id=v_actor and binding.model='gen4.5' and binding.duration_seconds=5
      and binding.ratio='1280:720' and binding.total_cost_ceiling_micros=750000
      and reservation.funding_source_type='owner_budget'
      and tongs._funding_reservation_state(reservation.id)='reserved'
      and latest.status='active' and latest.maximum_amount_micros=750000
      and budget.environment='production' and now()>=budget.period_start and now()<budget.period_end
  ) then raise exception 'approved bounded owner Runway reservation required before activation' using errcode='P0001'; end if;
  select coalesce(max(revision),0)+1 into v_revision from tongs.paid_execution_control_revisions;
  insert into tongs.paid_execution_control_revisions(
    revision,pricing_activation_enabled,reservation_shadow_enabled,customer_settlement_enabled,
    owner_budget_spending_enabled,provider_execution_enabled,reason,actor_id
  ) values (v_revision,true,true,false,true,true,v_reason,v_actor);
  return jsonb_build_object('revision',v_revision,'pricing_activation_enabled',true,
    'reservation_shadow_enabled',true,'customer_settlement_enabled',false,
    'owner_budget_spending_enabled',true,'provider_execution_enabled',true);
end;
$$;

-- A reservation that was validly created during the approved budget period must
-- remain reconcilable after the budget is paused, closed, or expires. Only new
-- reservations and new provider attempts require an active in-period budget.
create or replace function tongs.consume_owner_operating_budget(
  p_consumption_id uuid,p_budget_id uuid,p_reservation_id uuid,p_allocation_key text,
  p_operation_id text,p_expense_amount_micros bigint,p_consumed_at timestamptz,
  p_evidence_json jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare
  v_budget tongs.owner_operating_budgets%rowtype;
  v_revision tongs.owner_operating_budget_revisions%rowtype;
  v_reservation tongs.funding_reservations%rowtype;
  v_existing tongs.owner_operating_budget_consumptions%rowtype;
  v_consumed bigint;
  v_key text:=nullif(btrim(coalesce(p_allocation_key,'')),'');
  v_operation text:=nullif(btrim(coalesce(p_operation_id,'')),'');
  v_payload jsonb;
begin
  perform tongs._require_pricing_service_role();
  if p_consumption_id is null or p_budget_id is null or p_reservation_id is null
     or v_key is null or v_operation is null or p_expense_amount_micros<=0
     or jsonb_typeof(coalesce(p_evidence_json,'null'::jsonb))<>'object' then
    raise exception 'invalid owner budget consumption' using errcode='22023';
  end if;
  select * into v_budget from tongs.owner_operating_budgets where id=p_budget_id for update;
  if not found then raise exception 'owner operating budget not found' using errcode='P0002'; end if;
  select * into v_revision from tongs.owner_operating_budget_revisions
    where budget_id=p_budget_id order by revision desc limit 1;
  select * into v_reservation from tongs.funding_reservations where id=p_reservation_id for update;
  if not found or v_reservation.funding_source_type<>'owner_budget'
     or v_reservation.funding_source_id<>p_budget_id or v_reservation.operation_id<>v_operation then
    raise exception 'matching owner-funded reservation required' using errcode='P0001';
  end if;
  if v_revision.status not in ('active','paused','closed') or v_revision.maximum_amount_micros is null
     or v_reservation.created_at<v_budget.period_start or v_reservation.created_at>=v_budget.period_end then
    raise exception 'reservation was not funded inside a capped owner budget period' using errcode='P0001';
  end if;
  select * into v_existing from tongs.owner_operating_budget_consumptions
    where allocation_key=v_key or reservation_id=p_reservation_id limit 1;
  if found then
    if v_existing.budget_id<>p_budget_id or v_existing.operation_id<>v_operation
       or v_existing.expense_amount_micros<>p_expense_amount_micros then
      raise exception 'owner budget consumption replay conflict' using errcode='23505';
    end if;
    return jsonb_build_object('consumption_id',v_existing.id,'replay',true,
      'customer_revenue_micros',0,'margin','not_applicable');
  end if;
  select coalesce(sum(expense_amount_micros),0) into v_consumed
    from tongs.owner_operating_budget_consumptions where budget_id=p_budget_id;
  if v_consumed+p_expense_amount_micros>v_revision.maximum_amount_micros then
    insert into tongs.owner_operating_budget_discrepancies(
      id,budget_id,reservation_id,discrepancy_key,maximum_amount_micros,
      prior_consumed_micros,observed_expense_micros,evidence_json
    ) values(gen_random_uuid(),p_budget_id,p_reservation_id,v_key||':budget-overrun',
      v_revision.maximum_amount_micros,v_consumed,p_expense_amount_micros,
      coalesce(p_evidence_json,'{}'::jsonb)) on conflict(discrepancy_key) do nothing;
  end if;
  v_payload:=jsonb_build_object('consumption_id',p_consumption_id,'budget_id',p_budget_id,
    'reservation_id',p_reservation_id,'operation_id',v_operation,
    'expense_amount_micros',p_expense_amount_micros,'customer_revenue_micros',0,
    'margin','not_applicable','evidence',coalesce(p_evidence_json,'{}'::jsonb));
  perform tongs._create_accounting_event(
    p_consumption_id,'owner-budget-consumption:'||v_key,'owner_operating_budget_consumed',
    'owner_internal','forge_operation',v_operation,v_budget.currency,null,v_budget.workspace_id,null,
    v_payload,coalesce(p_consumed_at,now()));
  insert into tongs.owner_operating_budget_consumptions(
    id,budget_id,reservation_id,operation_id,allocation_key,expense_amount_micros,
    currency,journal_event_id,evidence_json,consumed_at
  ) values(p_consumption_id,p_budget_id,p_reservation_id,v_operation,v_key,p_expense_amount_micros,
    v_budget.currency,p_consumption_id,coalesce(p_evidence_json,'{}'::jsonb),coalesce(p_consumed_at,now()));
  insert into tongs.accounting_journal_entries(
    event_id,line_number,account_code,workspace_id,owner_budget_id,currency,amount_micros
  ) values
    (p_consumption_id,1,'owner_research_qa_expense',v_budget.workspace_id,p_budget_id,v_budget.currency,p_expense_amount_micros),
    (p_consumption_id,2,'forge_cash_clearing',v_budget.workspace_id,p_budget_id,v_budget.currency,-p_expense_amount_micros);
  perform tongs._assert_accounting_event_balanced(p_consumption_id);
  return jsonb_build_object('consumption_id',p_consumption_id,'replay',false,
    'remaining_budget_micros',v_revision.maximum_amount_micros-v_consumed-p_expense_amount_micros,
    'customer_revenue_micros',0,'margin','not_applicable');
end;
$$;

revoke all on function tongs.create_owner_runway_spending_quote(uuid,uuid,text,uuid,text,uuid,uuid,text,text,integer,text,timestamptz) from public,anon,authenticated;
revoke all on function tongs.reserve_owner_runway_operation(uuid,uuid,uuid,text) from public,anon,authenticated;
revoke all on function tongs.bind_owner_runway_funding_reservation(text,text,uuid,uuid,uuid,text,integer,text) from public,anon,authenticated;
grant execute on function tongs.create_owner_runway_spending_quote(uuid,uuid,text,uuid,text,uuid,uuid,text,text,integer,text,timestamptz) to service_role;
grant execute on function tongs.reserve_owner_runway_operation(uuid,uuid,uuid,text) to service_role;
grant execute on function tongs.bind_owner_runway_funding_reservation(text,text,uuid,uuid,uuid,text,integer,text) to service_role;
revoke all on function tongs.activate_owner_runway_pilot_controls(text) from public,anon;
grant execute on function tongs.activate_owner_runway_pilot_controls(text) to authenticated,service_role;

notify pgrst,'reload schema';
commit;
