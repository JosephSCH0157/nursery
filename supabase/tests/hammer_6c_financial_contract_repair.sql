begin;
set request.jwt.claim.role='service_role';

do $$
<<hammer_6c_financial_contract_repair>>
declare
  owner_id uuid:='6b100000-0000-4000-8000-000000000001';
  workspace_id uuid:='6b100000-0000-4000-8000-000000000101';
  quote_id uuid:='6c9a0000-0000-4000-8000-000000000001';
  acceptance_id uuid:='6c9a0000-0000-4000-8000-000000000002';
  reservation_id uuid:='6c9a0000-0000-4000-8000-000000000003';
  operation_id text:='hammer-owner-canary-financial-repair-proof';
  fingerprint text:=repeat('9',64);
  provider_snapshot text:='gpt-5.4-mini-2026-03-17';
  start_epoch bigint:=extract(epoch from date_trunc('day',now()))::bigint;
  quote_result jsonb; result jsonb; activity jsonb; financial jsonb; supplier_financial jsonb;
  supplier_expense_id uuid; budget_id uuid; policy_id uuid; original_event_id uuid; commitment bigint;
  zero_batch_id uuid:='6c9a0000-0000-4000-8000-000000000020';
  nonzero_batch_id uuid:='6c9a0000-0000-4000-8000-000000000021';
  mismatch_batch_id uuid:='6c9a0000-0000-4000-8000-000000000022';
  ambiguous_batch_id uuid:='6c9a0000-0000-4000-8000-000000000023';
  before_counts jsonb; after_counts jsonb; conflict_failed boolean:=false;
begin
  select choice.budget_id into budget_id
  from tongs._owner_paid_execution_canary_for_choice(
    owner_id,workspace_id,'hammer.transcript_cleanup','gpt-5.4-mini') choice;
  if budget_id is null then raise exception 'owner canary authority missing'; end if;

  quote_result:=tongs.create_owner_openai_text_canary_quote(
    quote_id,owner_id,operation_id,'hammer.transcript_cleanup',workspace_id,'repair-proof',
    fingerprint,'gpt-5.4-mini','forge',now()+interval '10 minutes');
  perform tongs.bind_bounded_provider_quote_request(
    quote_id,owner_id,operation_id,'hammer.transcript_cleanup',fingerprint,'gpt-5.4-mini',
    'default','hammer-6c-repair','hammer-6c-repair',repeat('8',64),1024,100,10,1024,1024,16384,1::smallint);
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  perform tongs.accept_quote(quote_id,acceptance_id,'hammer-6c-repair-accept',quote_result->>'quote_hash');
  perform set_config('request.jwt.claim.role','service_role',true);
  result:=tongs.reserve_owner_openai_text_canary_quote(
    quote_id,reservation_id,owner_id,operation_id,'hammer.transcript_cleanup',workspace_id,
    'repair-proof',fingerprint,'gpt-5.4-mini','forge','hammer-6c-repair-reserve');
  result:=tongs.acquire_openai_text_aggregate_admission(reservation_id,'interactive','real');
  if coalesce((result->>'authorized')::boolean,false) is not true then
    raise exception 'aggregate admission failed: %',result;
  end if;
  result:=tongs.authorize_openai_text_provider_attempt_with_aggregate(
    reservation_id,'hammer-6c-repair-attempt',1::smallint,'interactive',169728,60,
    '{"no_network":true,"proof":"financial_contract_repair"}'::jsonb);
  if coalesce((result->>'provider_execution_authorized')::boolean,false) is not true then
    raise exception 'provider boundary proof failed: %',result;
  end if;

  perform tongs.record_openai_text_supplier_attempt_expense(
    reservation_id,'hammer-6c-repair-attempt',1::smallint,'req_hammer_6c_repair',246,
    'estimated','{"source":"pinned_rate_estimate"}'::jsonb);
  select expense.id into supplier_expense_id from tongs.supplier_expenses expense
  where expense.reservation_id=hammer_6c_financial_contract_repair.reservation_id and expense.provider='openai';
  perform tongs.record_supplier_expense(
    '6c9a0000-0000-4000-8000-000000000010',reservation_id,
    'hammer-6c-repair-attempt:supporting-expense','forge',
    'openai.text.hammer.transcript_cleanup.supporting',null,'USD',0,'estimated','closed',
    '{"source":"historical_runtime_classification"}'::jsonb);
  perform tongs.record_openai_text_usage(
    '6c9a0000-0000-4000-8000-000000000011',reservation_id,
    'hammer-6c-repair-attempt:usage','req_hammer_6c_repair',1::smallint,118,35,true,true,true,
    '{"cached_input_units":0}'::jsonb);
  result:=tongs.settle_owner_operation(
    reservation_id,'6c9a0000-0000-4000-8000-000000000012','hammer-6c-repair-owner-settle',
    'success',null,246,'{"source":"historical_estimate"}'::jsonb);
  if (result->>'owner_expense_micros')::bigint<>246
     or (result->>'customer_debit_micros')::bigint<>0 then
    raise exception 'historical owner settlement shape changed: %',result;
  end if;
  select consumption.journal_event_id into original_event_id
  from tongs.owner_operating_budget_consumptions consumption
  where consumption.reservation_id=hammer_6c_financial_contract_repair.reservation_id;
  perform tongs.record_paid_operation_aggregate_outcome(
    reservation_id,'hammer-6c-repair-settled-unconfirmed','settled_unconfirmed',246,null,
    '{"authoritative":false,"provider_usage_reported":true,"direct_cost_rounding_risk_micros":3,"supporting_and_tail_costs_confirmed":false}'::jsonb);
  select binding.policy_revision_id into policy_id from tongs.paid_operation_aggregate_bindings binding
  where binding.reservation_id=hammer_6c_financial_contract_repair.reservation_id;
  select current_commitment.committed_micros into commitment
  from tongs._restricted_beta_policy_commitment(policy_id) current_commitment;
  if commitment<>249 then
    raise exception 'expected retained exposure of 249 micros before reconciliation, got %',commitment;
  end if;

  result:=tongs.record_openai_organization_reconciliation(
    zero_batch_id,'openai-costs-hammer-6c-zero',to_timestamp(start_epoch),
    to_timestamp(start_epoch+86400),'USD',0,'organization_costs_api','confirmed',
    jsonb_build_array(
      jsonb_build_object('bucket_key','zero-input','project_id','proj_hammer_6c','api_key_id','key_hammer_6c',
        'line_item',provider_snapshot||', input','amount_micros',0,
        'evidence',jsonb_build_object('start_time',start_epoch,'end_time',start_epoch+86400)),
      jsonb_build_object('bucket_key','zero-output','project_id','proj_hammer_6c','api_key_id','key_hammer_6c',
        'line_item',provider_snapshot||', output','amount_micros',0,
        'evidence',jsonb_build_object('start_time',start_epoch,'end_time',start_epoch+86400))),
    jsonb_build_array(jsonb_build_object(
      'bucket_key','zero-usage','project_id','proj_hammer_6c','api_key_id','key_hammer_6c',
      'model',provider_snapshot,'service_tier','incentivized-tier','input_tokens',118,
      'cached_input_tokens',0,'output_tokens',35,'request_count',1,
      'evidence',jsonb_build_object('start_time',start_epoch,'end_time',start_epoch+86400))),
    '{"source":"isolated_supplier_evidence","project_scope":["proj_hammer_6c"]}'::jsonb);
  if result->>'allocation_status'<>'defensibly_allocated' then
    raise exception 'zero-cost reconciliation did not allocate through catalog authority: %',result;
  end if;
  if (select adjustment_micros from tongs.openai_supplier_expense_reconciliation_adjustments
      where reconciliation_batch_id=zero_batch_id)<>-246
     or (select adjustment_micros from tongs.owner_operating_budget_reconciliation_adjustments
         where reconciliation_batch_id=zero_batch_id)<>-246 then
    raise exception 'zero-cost supplier/owner adjustments were not -246 micros';
  end if;
  if tongs._owner_operating_budget_effective_consumed(budget_id)<>0 then
    raise exception 'effective owner-budget consumption did not reach zero';
  end if;
  if tongs._effective_supplier_expense_amount_micros(supplier_expense_id)<>0
     or tongs._effective_supplier_expense_obligation_status(supplier_expense_id)<>'closed' then
    raise exception 'effective supplier obligation did not close at zero';
  end if;
  if (select obligation_status from tongs.supplier_expenses where id=supplier_expense_id)<>'open'
     or (select evidence_status from tongs.supplier_expenses where id=supplier_expense_id)<>'estimated'
     or (select consumption.expense_amount_micros from tongs.owner_operating_budget_consumptions consumption
         where consumption.reservation_id=hammer_6c_financial_contract_repair.reservation_id)<>246 then
    raise exception 'original supplier or owner evidence was rewritten';
  end if;
  if (select coalesce(sum(case when account_code='owner_research_qa_expense' then amount_micros else 0 end),0)
      from tongs.accounting_journal_entries where event_id in (
        original_event_id,(select journal_event_id from tongs.owner_operating_budget_reconciliation_adjustments
                           where reconciliation_batch_id=zero_batch_id)))<>0
     or (select coalesce(sum(amount_micros),0) from tongs.accounting_journal_entries
         where event_id=(select journal_event_id from tongs.owner_operating_budget_reconciliation_adjustments
                         where reconciliation_batch_id=zero_batch_id))<>0 then
    raise exception 'zero-cost correcting journal was not balanced and effective-zero';
  end if;
  if (select amount_micros from tongs.accounting_journal_entries
      where event_id=(select journal_event_id from tongs.owner_operating_budget_reconciliation_adjustments
                      where reconciliation_batch_id=zero_batch_id)
        and account_code='owner_research_qa_expense')<>-246
     or (select amount_micros from tongs.accounting_journal_entries
         where event_id=(select journal_event_id from tongs.owner_operating_budget_reconciliation_adjustments
                         where reconciliation_batch_id=zero_batch_id)
           and account_code='forge_cash_clearing')<>246 then
    raise exception 'zero-cost correcting journal did not append the exact -246/+246 lines';
  end if;
  select current_commitment.committed_micros into commitment
  from tongs._restricted_beta_policy_commitment(policy_id) current_commitment;
  if commitment<>0 then
    raise exception '249-micro exposure was not fully released, got %',commitment;
  end if;
  if exists(select 1 from tongs.funding_reservation_events event
            where event.reservation_id=hammer_6c_financial_contract_repair.reservation_id
              and coalesce(event.customer_charge_micros,0)<>0)
     or (select reserved_customer_charge_micros from tongs.funding_reservations reservation
         where reservation.id=hammer_6c_financial_contract_repair.reservation_id)<>0 then
    raise exception 'zero-cost reconciliation created a customer charge';
  end if;
  if (select count(*) from tongs.funding_reservation_events event
      where event.reservation_id=hammer_6c_financial_contract_repair.reservation_id
        and event.provider_attempt_key is not null)<>1 then
    raise exception 'reconciliation created another provider attempt';
  end if;

  select jsonb_build_object(
    'allocations',(select count(*) from tongs.openai_text_operation_cost_allocations),
    'supplier_adjustments',(select count(*) from tongs.openai_supplier_expense_reconciliation_adjustments),
    'closures',(select count(*) from tongs.openai_supplier_expense_obligation_settlement_events),
    'budget_adjustments',(select count(*) from tongs.owner_operating_budget_reconciliation_adjustments),
    'journal_lines',(select count(*) from tongs.accounting_journal_entries)) into before_counts;
  result:=tongs.record_openai_organization_reconciliation(
    zero_batch_id,'openai-costs-hammer-6c-zero',to_timestamp(start_epoch),
    to_timestamp(start_epoch+86400),'USD',0,'organization_costs_api','confirmed',
    jsonb_build_array(
      jsonb_build_object('bucket_key','zero-input','project_id','proj_hammer_6c','api_key_id','key_hammer_6c',
        'line_item',provider_snapshot||', input','amount_micros',0,
        'evidence',jsonb_build_object('start_time',start_epoch,'end_time',start_epoch+86400)),
      jsonb_build_object('bucket_key','zero-output','project_id','proj_hammer_6c','api_key_id','key_hammer_6c',
        'line_item',provider_snapshot||', output','amount_micros',0,
        'evidence',jsonb_build_object('start_time',start_epoch,'end_time',start_epoch+86400))),
    jsonb_build_array(jsonb_build_object(
      'bucket_key','zero-usage','project_id','proj_hammer_6c','api_key_id','key_hammer_6c',
      'model',provider_snapshot,'service_tier','incentivized-tier','input_tokens',118,
      'cached_input_tokens',0,'output_tokens',35,'request_count',1,
      'evidence',jsonb_build_object('start_time',start_epoch,'end_time',start_epoch+86400))),
    '{"source":"isolated_supplier_evidence","project_scope":["proj_hammer_6c"]}'::jsonb);
  select jsonb_build_object(
    'allocations',(select count(*) from tongs.openai_text_operation_cost_allocations),
    'supplier_adjustments',(select count(*) from tongs.openai_supplier_expense_reconciliation_adjustments),
    'closures',(select count(*) from tongs.openai_supplier_expense_obligation_settlement_events),
    'budget_adjustments',(select count(*) from tongs.owner_operating_budget_reconciliation_adjustments),
    'journal_lines',(select count(*) from tongs.accounting_journal_entries)) into after_counts;
  if before_counts<>after_counts or coalesce((result->>'replay')::boolean,false) is not true then
    raise exception 'exact reconciliation replay was not idempotent';
  end if;

  begin
    perform tongs.record_openai_organization_reconciliation(
      zero_batch_id,'openai-costs-hammer-6c-zero',to_timestamp(start_epoch),
      to_timestamp(start_epoch+86400),'USD',1,'organization_costs_api','confirmed',
      '[]'::jsonb,'[]'::jsonb,
      '{"source":"conflict","project_scope":["proj_hammer_6c"]}'::jsonb);
  exception when others then conflict_failed:=true; end;
  if not conflict_failed then raise exception 'conflicting evidence did not fail closed'; end if;
  select jsonb_build_object(
    'allocations',(select count(*) from tongs.openai_text_operation_cost_allocations),
    'supplier_adjustments',(select count(*) from tongs.openai_supplier_expense_reconciliation_adjustments),
    'closures',(select count(*) from tongs.openai_supplier_expense_obligation_settlement_events),
    'budget_adjustments',(select count(*) from tongs.owner_operating_budget_reconciliation_adjustments),
    'journal_lines',(select count(*) from tongs.accounting_journal_entries)) into after_counts;
  if before_counts<>after_counts then raise exception 'conflicting replay left partial changes'; end if;

  result:=tongs.record_openai_organization_reconciliation(
    nonzero_batch_id,'openai-costs-hammer-6c-nonzero',to_timestamp(start_epoch),
    to_timestamp(start_epoch+86400),'USD',100,'organization_costs_api','confirmed',
    jsonb_build_array(jsonb_build_object(
      'bucket_key','nonzero-input','project_id','proj_hammer_6c','api_key_id','key_hammer_6c',
      'line_item',provider_snapshot||', input','amount_micros',100,
      'evidence',jsonb_build_object('start_time',start_epoch,'end_time',start_epoch+86400))),
    jsonb_build_array(jsonb_build_object(
      'bucket_key','nonzero-usage','project_id','proj_hammer_6c','api_key_id','key_hammer_6c',
      'model',provider_snapshot,'service_tier','incentivized-tier','input_tokens',118,
      'cached_input_tokens',0,'output_tokens',35,'request_count',1,
      'evidence',jsonb_build_object('start_time',start_epoch,'end_time',start_epoch+86400))),
    '{"source":"isolated_supplier_revision","project_scope":["proj_hammer_6c"]}'::jsonb);
  if result->>'allocation_status'<>'defensibly_allocated'
     or (select adjustment_micros from tongs.openai_supplier_expense_reconciliation_adjustments
         where reconciliation_batch_id=nonzero_batch_id)<>-146
     or (select adjustment_micros from tongs.owner_operating_budget_reconciliation_adjustments
         where reconciliation_batch_id=nonzero_batch_id)<>100
     or tongs._owner_operating_budget_effective_consumed(budget_id)<>100
     or tongs._effective_supplier_expense_amount_micros(supplier_expense_id)<>100 then
    raise exception 'nonzero supplier revision did not produce exact effective state: %',result;
  end if;
  select current_commitment.committed_micros into commitment
  from tongs._restricted_beta_policy_commitment(policy_id) current_commitment;
  if commitment<>100 then raise exception 'nonzero actual exposure was not retained'; end if;

  result:=tongs.record_openai_organization_reconciliation(
    mismatch_batch_id,'openai-costs-hammer-6c-mismatch',to_timestamp(start_epoch),
    to_timestamp(start_epoch+86400),'USD',0,'organization_costs_api','confirmed',
    jsonb_build_array(jsonb_build_object(
      'bucket_key','mismatch-cost','project_id','proj_mismatch','api_key_id','key_mismatch',
      'line_item','unmapped-snapshot, input','amount_micros',0,
      'evidence',jsonb_build_object('start_time',start_epoch,'end_time',start_epoch+86400))),
    jsonb_build_array(jsonb_build_object(
      'bucket_key','mismatch-usage','project_id','proj_mismatch','api_key_id','key_mismatch',
      'model','unmapped-snapshot','input_tokens',118,'cached_input_tokens',0,
      'output_tokens',35,'request_count',1,
      'evidence',jsonb_build_object('start_time',start_epoch,'end_time',start_epoch+86400))),
    '{"source":"mismatch","project_scope":["proj_mismatch"]}'::jsonb);
  if result->>'allocation_status'<>'unresolved' or exists(
    select 1 from tongs.openai_text_operation_cost_allocations where batch_id=mismatch_batch_id) then
    raise exception 'snapshot authority mismatch did not fail closed: %',result;
  end if;
  result:=tongs.record_openai_organization_reconciliation(
    ambiguous_batch_id,'openai-costs-hammer-6c-ambiguous',to_timestamp(start_epoch),
    to_timestamp(start_epoch+86400),'USD',0,'organization_costs_api','confirmed',
    jsonb_build_array(jsonb_build_object(
      'bucket_key','ambiguous-cost','project_id','proj_ambiguous','api_key_id','key_ambiguous',
      'line_item',provider_snapshot||', input','amount_micros',0,
      'evidence',jsonb_build_object('start_time',start_epoch,'end_time',start_epoch+86400))),
    jsonb_build_array(
      jsonb_build_object('bucket_key','ambiguous-usage-1','project_id','proj_ambiguous','api_key_id','key_ambiguous',
        'model',provider_snapshot,'input_tokens',118,'cached_input_tokens',0,'output_tokens',35,'request_count',1,
        'evidence',jsonb_build_object('start_time',start_epoch,'end_time',start_epoch+86400)),
      jsonb_build_object('bucket_key','ambiguous-usage-2','project_id','proj_ambiguous','api_key_id','key_ambiguous',
        'model',provider_snapshot,'input_tokens',118,'cached_input_tokens',0,'output_tokens',35,'request_count',1,
        'evidence',jsonb_build_object('start_time',start_epoch,'end_time',start_epoch+86400))),
    '{"source":"ambiguous","project_scope":["proj_ambiguous"]}'::jsonb);
  if result->>'allocation_status'<>'unresolved' or exists(
    select 1 from tongs.openai_text_operation_cost_allocations where batch_id=ambiguous_batch_id) then
    raise exception 'ambiguous supplier evidence did not fail closed: %',result;
  end if;

  select elem into financial from jsonb_array_elements(tongs.read_failure_financials(2000)) elem
  where elem->>'reservation_id'=reservation_id::text;
  select expense into supplier_financial from jsonb_array_elements(financial->'supplier_expenses') expense
  where expense->>'provider'='openai';
  if supplier_financial->>'effective_obligation_status'<>'closed'
     or (supplier_financial->>'effective_amount_micros')::bigint<>100 then
    raise exception 'failure reader did not use effective obligation state: %',financial;
  end if;
  activity:=tongs.read_owner_operating_budget_activity(budget_id);
  if (activity#>>'{budget,effective_consumed_micros}')::bigint<>100
     or coalesce(jsonb_array_length(activity#>'{consumptions,0,reconciliation_adjustments}'),-1)<>2 then
    raise exception 'owner budget reader did not expose effective consumption: %',activity;
  end if;
  if has_table_privilege('authenticated','tongs.owner_operating_budget_reconciliation_adjustments','select')
     or has_table_privilege('authenticated','tongs.openai_supplier_expense_obligation_settlement_events','select')
     or not (select relrowsecurity and relforcerowsecurity from pg_class
             where oid='tongs.owner_operating_budget_reconciliation_adjustments'::regclass)
     or not (select relrowsecurity and relforcerowsecurity from pg_class
             where oid='tongs.openai_supplier_expense_obligation_settlement_events'::regclass)
     or has_function_privilege('authenticated',
          'tongs.record_owner_operating_budget_reconciliation_adjustment(uuid,uuid,uuid,uuid,uuid,text,bigint,jsonb)','execute')
     or has_function_privilege('authenticated',
          'tongs.record_openai_supplier_expense_obligation_settlement(uuid,uuid,uuid,uuid,text,jsonb)','execute') then
    raise exception 'new financial evidence escaped service-role/RLS containment';
  end if;
  begin
    update tongs.owner_operating_budget_reconciliation_adjustments set evidence_json='{}'::jsonb
    where reconciliation_batch_id=zero_batch_id;
    raise exception 'append-only owner adjustment was mutable';
  exception when object_not_in_prerequisite_state then null; end;
  if (select count(*) from tongs.owner_operating_budget_consumptions consumption
      where consumption.reservation_id=hammer_6c_financial_contract_repair.reservation_id)<>1
     or (select count(*) from tongs.openai_text_usage_evidence usage_record
         where usage_record.reservation_id=hammer_6c_financial_contract_repair.reservation_id)<>1 then
    raise exception 'reconciliation altered unrelated immutable operational evidence';
  end if;
end;
$$;

rollback;
