-- Append-only reconciliation of the September 16 Test-only Hearth Luna hold.
--
-- This migration intentionally changes no pricing, limits, customer funding,
-- provider authority, Live state, Owner state, or BYO state. On a clean replay
-- the historical hold is absent and the migration is a no-op. On the linked
-- database it refuses to act unless every preserved evidence item matches the
-- exact operation described below.
begin;

do $$
declare
  target_hold constant uuid := 'cc777ff6-37da-5453-940b-e555cf04c12e';
  target_operation constant text := 'hearth-customer-3d01004c3930c1779d9ed76394dd22e2acf4851e53002e5dcfc9db95a7c8c606';
  target_reservation constant uuid := 'da7f6bd0-faac-4b75-8afa-ceff9419c03a';
  target_provider_request constant text := 'req_aaacb4f299b94d0a92192ba04af42e47';
  reconciliation_key constant text := 'hearth-customer-3d01004c3930c1779d9ed76394dd22e2acf4851e53002e5dcfc9db95a7c8c606:aggregate-authoritative-reconciliation';
  adjustment_key constant text := 'hearth-customer-3d01004c3930c1779d9ed76394dd22e2acf4851e53002e5dcfc9db95a7c8c606:aggregate-authoritative-adjustment';
  hold_row tongs.restricted_beta_exposure_holds%rowtype;
  binding_row tongs.paid_operation_aggregate_bindings%rowtype;
  usage_row tongs.openai_text_usage_evidence%rowtype;
  rate_row tongs.openai_text_provider_rate_revisions%rowtype;
  direct_expense tongs.supplier_expenses%rowtype;
  supporting_expense tongs.supplier_expenses%rowtype;
  direct_obligation bigint;
  committed_before bigint;
  outstanding_before bigint;
  committed_after bigint;
  outstanding_after bigint;
  next_sequence integer;
begin
  select * into hold_row
  from tongs.restricted_beta_exposure_holds
  where id=target_hold;

  if not found then
    if exists (
      select 1 from tongs.paid_operation_aggregate_bindings
      where operation_id=target_operation or reservation_id=target_reservation
    ) then
      raise exception 'September 16 reconciliation target is incomplete: binding exists without exact hold'
        using errcode='P0001';
    end if;
    return;
  end if;

  if hold_row.operation_identity<>target_operation
     or hold_row.funding_environment<>'test'
     or hold_row.model_or_sku<>'gpt-5.6-luna'
     or hold_row.funding_class<>'verified_customer_deposit'
     or hold_row.provider_mode<>'real'
     or hold_row.caller_class<>'interactive'
     or hold_row.supplier_exposure_ceiling_micros<>1015
     or hold_row.supporting_exposure_ceiling_micros<>10000
     or hold_row.tail_exposure_ceiling_micros<>0
     or hold_row.unreconciled_exposure_ceiling_micros<>0
     or hold_row.retry_exposure_ceiling_micros<>0 then
    raise exception 'September 16 reconciliation hold authority mismatch' using errcode='P0001';
  end if;

  select * into binding_row
  from tongs.paid_operation_aggregate_bindings
  where hold_id=target_hold and reservation_id=target_reservation;
  if not found
     or binding_row.operation_id<>target_operation
     or binding_row.capability_code<>'openai.text.hearth_chat'
     or binding_row.provider<>'openai'
     or binding_row.model_or_sku<>'gpt-5.6-luna'
     or binding_row.funding_source_type<>'customer_deposit'
     or binding_row.credential_funding<>'forge'
     or binding_row.provider_mode<>'real'
     or binding_row.cost_policy_revision_id<>'10000000-0000-4000-8000-000000000010'::uuid
     or binding_row.supplier_exposure_ceiling_micros<>1015
     or binding_row.supporting_exposure_ceiling_micros<>10000 then
    raise exception 'September 16 reconciliation aggregate binding mismatch' using errcode='P0001';
  end if;

  select * into usage_row
  from tongs.openai_text_usage_evidence
  where reservation_id=target_reservation and attempt_number=1;
  if not found
     or usage_row.provider_request_id<>target_provider_request
     or usage_row.input_units<>29
     or usage_row.output_units<>7
     or not usage_row.provider_reported
     or not usage_row.result_validated
     or not usage_row.canonical_persistence_confirmed
     or coalesce((usage_row.evidence_json->>'cached_input_units')::bigint,0)<>0 then
    raise exception 'September 16 reconciliation usage evidence mismatch' using errcode='P0001';
  end if;

  select rate.* into rate_row
  from tongs.openai_text_cost_policy_revisions cost
  join tongs.openai_text_provider_rate_revisions rate
    on rate.id=(cost.attempt_plan->0->>'rate_revision_id')::uuid
  where cost.id=binding_row.cost_policy_revision_id
    and cost.policy_code='openai-text:hearth-chat:luna-bounded-pilot-v1'
    and cost.maximum_attempts=1
    and cost.supporting_cost_ceiling_micros=10000
    and cost.full_cost_ceiling_micros=11015;
  if not found
     or rate_row.provider<>'openai'
     or rate_row.provider_model_id<>'gpt-5.6-luna'
     or rate_row.input_micros_per_million_tokens<>200000
     or rate_row.cached_input_micros_per_million_tokens<>20000
     or rate_row.output_micros_per_million_tokens<>1200000
     or rate_row.billing_basis<>'text_tokens' then
    raise exception 'September 16 reconciliation preserved rate evidence mismatch' using errcode='P0001';
  end if;

  direct_obligation := (
    usage_row.input_units*rate_row.input_micros_per_million_tokens
    + usage_row.output_units*rate_row.output_micros_per_million_tokens
    + 999999
  )/1000000;
  if direct_obligation<>15 then
    raise exception 'September 16 direct supplier obligation did not resolve to 15 micros'
      using errcode='P0001';
  end if;

  select * into direct_expense
  from tongs.supplier_expenses
  where reservation_id=target_reservation
    and provider='openai'
    and component_code='openai.text.hearth.chat_completion';
  if not found
     or direct_expense.provider_reference<>target_provider_request
     or direct_expense.amount_micros<>direct_obligation
     or direct_expense.evidence_status<>'estimated'
     or direct_expense.obligation_status<>'open' then
    raise exception 'September 16 direct expense evidence mismatch' using errcode='P0001';
  end if;

  select * into supporting_expense
  from tongs.supplier_expenses
  where reservation_id=target_reservation
    and provider='forge'
    and component_code='openai.text.hearth.chat_completion.supporting';
  if not found
     or supporting_expense.provider_reference is not null
     or supporting_expense.amount_micros<>10000
     or supporting_expense.evidence_status<>'estimated'
     or supporting_expense.obligation_status<>'closed'
     or supporting_expense.evidence_json->>'allocation_kind'<>'accepted_fixed_supporting_allocation'
     or supporting_expense.evidence_json->>'component'<>'bounded_validation_and_persistence'
     or supporting_expense.evidence_json->>'obligation_status'<>'closed_after_canonical_persistence' then
    raise exception 'September 16 supporting allocation is not the preserved closed estimate'
      using errcode='P0001';
  end if;

  if (select count(*) from tongs.supplier_expenses where reservation_id=target_reservation)<>2
     or not exists (
       select 1 from tongs.openai_text_provider_captures
       where reservation_id=target_reservation and attempt_number=1
         and provider_request_id=target_provider_request and input_units=29 and output_units=7
     )
     or not exists (
       select 1 from tongs.openai_text_persisted_results
       where reservation_id=target_reservation and operation_id=target_operation
         and provider_request_id=target_provider_request and model='gpt-5.6-luna'
         and input_units=29 and output_units=7
     ) then
    raise exception 'September 16 provider/canonical evidence chain is incomplete'
      using errcode='P0001';
  end if;

  select committed_micros,outstanding_count
    into committed_before,outstanding_before
  from tongs._restricted_beta_policy_commitment(hold_row.policy_revision_id);
  if committed_before<>10018 or outstanding_before<>1 then
    raise exception 'September 16 pre-reconciliation aggregate exposure is not exactly 10018 micros / one hold'
      using errcode='P0001';
  end if;

  select coalesce(max(sequence),0)+1 into next_sequence
  from tongs.restricted_beta_exposure_events where hold_id=target_hold;
  insert into tongs.restricted_beta_exposure_events(
    id,hold_id,sequence,event_key,event_type,supplier_obligation_micros,evidence_json
  ) values (
    extensions.uuid_generate_v5(target_hold,reconciliation_key),target_hold,next_sequence,
    reconciliation_key,'reconciled',direct_obligation,
    jsonb_build_object(
      'authoritative',true,
      'reconciliation_scope','historical_test_hearth_luna_hold',
      'provider','openai',
      'provider_request_id',target_provider_request,
      'rate_revision_id',rate_row.id,
      'rate_content_hash',rate_row.content_hash,
      'billing_basis',rate_row.billing_basis,
      'input_units',usage_row.input_units,
      'output_units',usage_row.output_units,
      'cached_input_units',0,
      'input_micros_per_million_tokens',rate_row.input_micros_per_million_tokens,
      'output_micros_per_million_tokens',rate_row.output_micros_per_million_tokens,
      'exact_unrounded_direct_micros','14.2',
      'provider_billing_rounding','ceiling_to_whole_micro',
      'direct_supplier_obligation_micros',direct_obligation,
      'result_validated',true,
      'canonical_persistence_confirmed',true
    )
  ) on conflict(event_key) do nothing;

  select coalesce(max(sequence),0)+1 into next_sequence
  from tongs.restricted_beta_exposure_events where hold_id=target_hold;
  insert into tongs.restricted_beta_exposure_events(
    id,hold_id,sequence,event_key,event_type,supplier_obligation_micros,
    remaining_exposure_micros,exposure_adjustment_micros,evidence_json
  ) values (
    extensions.uuid_generate_v5(target_hold,adjustment_key),target_hold,next_sequence,
    adjustment_key,'authoritative_adjustment',direct_obligation,0,-10018,
    jsonb_build_object(
      'authoritative',true,
      'reconciliation_event_key',reconciliation_key,
      'previous_remaining_exposure_micros',10018,
      'remaining_exposure_micros',0,
      'direct_supplier_obligation_micros',direct_obligation,
      'direct_obligation_age_out_basis','incurred outside the 86400-second Test aggregate rolling window',
      'supporting_allocation_micros',10000,
      'supporting_allocation_class','closed_internal_estimate_not_external_supplier_obligation',
      'supporting_expense_id',supporting_expense.id,
      'rounding_risk_micros_released',3,
      'rounding_risk_basis','exact preserved rate and provider-reported usage resolve to a 15-micro ceiling',
      'historical_rows_mutated',false,
      'customer_funds_changed',false,
      'provider_called',false
    )
  ) on conflict(event_key) do nothing;

  if not exists (
       select 1 from tongs.restricted_beta_exposure_events
       where hold_id=target_hold and event_key=reconciliation_key
         and event_type='reconciled' and supplier_obligation_micros=15
     )
     or not exists (
       select 1 from tongs.restricted_beta_exposure_events
       where hold_id=target_hold and event_key=adjustment_key
         and event_type='authoritative_adjustment'
         and supplier_obligation_micros=15
         and remaining_exposure_micros=0
         and exposure_adjustment_micros=-10018
         and (evidence_json->>'authoritative')::boolean
     ) then
    raise exception 'September 16 append-only reconciliation replay conflict'
      using errcode='23505';
  end if;

  select committed_micros,outstanding_count
    into committed_after,outstanding_after
  from tongs._restricted_beta_policy_commitment(hold_row.policy_revision_id);
  if committed_after<>0 or outstanding_after<>0 then
    raise exception 'September 16 aggregate exposure did not reconcile to zero'
      using errcode='P0001';
  end if;
end $$;

notify pgrst,'reload schema';
commit;
