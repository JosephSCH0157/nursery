begin;
select set_config('request.jwt.claim.role','service_role',true);

insert into auth.users(id) values
 ('a0000000-0000-4000-8000-000000000001'),
 ('a0000000-0000-4000-8000-000000000002'),
 ('a0000000-0000-4000-8000-000000000003');
insert into tongs.platform_operators(user_id,reason)
values ('a0000000-0000-4000-8000-000000000001','isolated correction operator');

insert into tongs.customer_deposits(id,user_id,stripe_mode,gross_amount_micros,credit_units,currency) values
 ('d0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000002','test',500000,100,'USD'),
 ('d0000000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000002','test',100000,20,'USD'),
 ('d0000000-0000-4000-8000-000000000003','a0000000-0000-4000-8000-000000000002','test',100000,20,'USD'),
 ('d0000000-0000-4000-8000-000000000004','a0000000-0000-4000-8000-000000000002','live',100000,20,'USD');
insert into tongs.customer_spending_quotes(
 id,user_id,operation_id,currency,normal_maximum_charge_micros,provider_funding_summary
) values
 ('a1000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000002','test-operation','USD',105000,'{}'),
 ('a1000000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000002','uncorrected-operation','USD',25000,'{}'),
 ('a1000000-0000-4000-8000-000000000003','a0000000-0000-4000-8000-000000000002','cumulative-operation','USD',50000,'{}'),
 ('a1000000-0000-4000-8000-000000000004','a0000000-0000-4000-8000-000000000002','live-operation','USD',50000,'{}');
insert into tongs.customer_spending_quote_acceptances(quote_id)
select id from tongs.customer_spending_quotes;
insert into tongs.funding_reservations(
 id,quote_id,user_id,operation_id,funding_source_type,funding_source_id,currency,
 reserved_customer_charge_micros,reserved_credit_units,reserved_wholesale_spend_micros,
 idempotency_key,funding_environment
) values
 ('b0000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000002','test-operation:q:a1000000-0000-4000-8000-000000000001','customer_deposit','d0000000-0000-4000-8000-000000000001','USD',105000,21,50000,'test-reservation','test'),
 ('b0000000-0000-4000-8000-000000000002','a1000000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000002','uncorrected-operation:q:a1000000-0000-4000-8000-000000000002','customer_deposit','d0000000-0000-4000-8000-000000000002','USD',25000,5,10000,'uncorrected-reservation','test'),
 ('b0000000-0000-4000-8000-000000000003','a1000000-0000-4000-8000-000000000003','a0000000-0000-4000-8000-000000000002','cumulative-operation:q:a1000000-0000-4000-8000-000000000003','customer_deposit','d0000000-0000-4000-8000-000000000003','USD',50000,10,20000,'cumulative-reservation','test'),
 ('b0000000-0000-4000-8000-000000000004','a1000000-0000-4000-8000-000000000004','a0000000-0000-4000-8000-000000000002','live-operation:q:a1000000-0000-4000-8000-000000000004','customer_deposit','d0000000-0000-4000-8000-000000000004','USD',50000,10,20000,'live-reservation','live');
insert into tongs.funding_reservation_events(
 id,reservation_id,sequence,event_key,event_type,customer_charge_micros,credit_units,wholesale_spend_micros
) values
 ('b1000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000001',1,'test-settled','settled',105000,21,50000),
 ('b1000000-0000-4000-8000-000000000002','b0000000-0000-4000-8000-000000000002',1,'uncorrected-settled','settled',25000,5,10000),
 ('b1000000-0000-4000-8000-000000000003','b0000000-0000-4000-8000-000000000003',1,'cumulative-settled','settled',50000,10,20000),
 ('b1000000-0000-4000-8000-000000000004','b0000000-0000-4000-8000-000000000004',1,'live-settled','settled',50000,10,20000);

insert into tongs.accounting_journal_events(
 id,idempotency_key,event_type,environment,source_type,source_id,currency,user_id,
 payload_hash,metadata_json,occurred_at
) values
 ('c0000000-0000-4000-8000-000000000001','test-consumption','customer_deposit_consumed','test','forge_operation','test-operation','USD','a0000000-0000-4000-8000-000000000002',repeat('1',64),'{}',now()),
 ('c0000000-0000-4000-8000-000000000002','uncorrected-consumption','customer_deposit_consumed','test','forge_operation','uncorrected-operation','USD','a0000000-0000-4000-8000-000000000002',repeat('2',64),'{}',now()),
 ('c0000000-0000-4000-8000-000000000003','cumulative-consumption','customer_deposit_consumed','test','forge_operation','cumulative-operation','USD','a0000000-0000-4000-8000-000000000002',repeat('3',64),'{}',now()),
 ('c0000000-0000-4000-8000-000000000004','live-consumption','customer_deposit_consumed','live','forge_operation','live-operation','USD','a0000000-0000-4000-8000-000000000002',repeat('4',64),'{}',now()),
 ('e0000000-0000-4000-8000-000000000001','test-relief','customer_operation_relieved','test','forge_operation','test-operation','USD','a0000000-0000-4000-8000-000000000002',repeat('5',64),'{}',now()),
 ('e0000000-0000-4000-8000-000000000002','uncorrected-relief','customer_operation_relieved','test','forge_operation','uncorrected-operation','USD','a0000000-0000-4000-8000-000000000002',repeat('6',64),'{}',now()),
 ('e0000000-0000-4000-8000-000000000003','cumulative-relief','customer_operation_relieved','test','forge_operation','cumulative-operation','USD','a0000000-0000-4000-8000-000000000002',repeat('7',64),'{}',now()),
 ('e0000000-0000-4000-8000-000000000004','live-relief','customer_operation_relieved','live','forge_operation','live-operation','USD','a0000000-0000-4000-8000-000000000002',repeat('8',64),'{}',now());
insert into tongs.customer_deposit_consumptions(
 id,deposit_id,user_id,allocation_key,operation_id,recognized_revenue_micros,
 credit_units_consumed,allocated_processor_fee_micros,journal_event_id
) values
 ('c0000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000002','test-allocation','test-operation:q:a1000000-0000-4000-8000-000000000001',105000,21,912,'c0000000-0000-4000-8000-000000000001'),
 ('c0000000-0000-4000-8000-000000000002','d0000000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000002','uncorrected-allocation','uncorrected-operation:q:a1000000-0000-4000-8000-000000000002',25000,5,200,'c0000000-0000-4000-8000-000000000002'),
 ('c0000000-0000-4000-8000-000000000003','d0000000-0000-4000-8000-000000000003','a0000000-0000-4000-8000-000000000002','cumulative-allocation','cumulative-operation:q:a1000000-0000-4000-8000-000000000003',50000,10,300,'c0000000-0000-4000-8000-000000000003'),
 ('c0000000-0000-4000-8000-000000000004','d0000000-0000-4000-8000-000000000004','a0000000-0000-4000-8000-000000000002','live-allocation','live-operation:q:a1000000-0000-4000-8000-000000000004',50000,10,400,'c0000000-0000-4000-8000-000000000004');
insert into tongs.customer_operation_reliefs(
 id,reservation_id,relief_key,funding_source_type,funding_source_id,original_consumption_id,
 currency,customer_credit_micros,restored_units,revenue_reversal_micros,reason,journal_event_id
) values
 ('e0000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000001','test-relief','customer_deposit','d0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000001','USD',105000,21,105000,'test relief','e0000000-0000-4000-8000-000000000001'),
 ('e0000000-0000-4000-8000-000000000002','b0000000-0000-4000-8000-000000000002','uncorrected-relief','customer_deposit','d0000000-0000-4000-8000-000000000002','c0000000-0000-4000-8000-000000000002','USD',25000,5,25000,'legitimate relief','e0000000-0000-4000-8000-000000000002'),
 ('e0000000-0000-4000-8000-000000000003','b0000000-0000-4000-8000-000000000003','cumulative-relief','customer_deposit','d0000000-0000-4000-8000-000000000003','c0000000-0000-4000-8000-000000000003','USD',50000,10,50000,'partial correction relief','e0000000-0000-4000-8000-000000000003'),
 ('e0000000-0000-4000-8000-000000000004','b0000000-0000-4000-8000-000000000004','live-relief','customer_deposit','d0000000-0000-4000-8000-000000000004','c0000000-0000-4000-8000-000000000004','USD',50000,10,50000,'live relief','e0000000-0000-4000-8000-000000000004');
insert into tongs.accounting_journal_entries(
 event_id,line_number,account_code,user_id,deposit_id,currency,amount_micros,unit_kind,quantity_delta
)
select relief.id,line_number,account_code,'a0000000-0000-4000-8000-000000000002',relief.funding_source_id,
  case when line_number<3 then 'USD' end,case line_number when 1 then relief.revenue_reversal_micros when 2 then -relief.revenue_reversal_micros else 0 end,
  case when line_number=3 then 'forge_credit' end,case when line_number=3 then relief.restored_units else 0 end
from tongs.customer_operation_reliefs relief
cross join (values (1::smallint,'service_revenue_reversal'),(2::smallint,'customer_prepaid_liability'),(3::smallint,'live_customer_credits')) lines(line_number,account_code);
insert into tongs.openai_text_persisted_results(
 id,reservation_id,operation_id,route_code,user_id,request_fingerprint,model,
 input_units,output_units,result_hash,result_json
) values
 ('f0000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000001','test-operation','test.route','a0000000-0000-4000-8000-000000000002',repeat('a',64),'test-model',10,10,repeat('b',64),'{}'),
 ('f0000000-0000-4000-8000-000000000002','b0000000-0000-4000-8000-000000000002','uncorrected-operation','test.route','a0000000-0000-4000-8000-000000000002',repeat('c',64),'test-model',10,10,repeat('d',64),'{}'),
 ('f0000000-0000-4000-8000-000000000003','b0000000-0000-4000-8000-000000000003','cumulative-operation','test.route','a0000000-0000-4000-8000-000000000002',repeat('e',64),'test-model',10,10,repeat('f',64),'{}'),
 ('f0000000-0000-4000-8000-000000000004','b0000000-0000-4000-8000-000000000004','live-operation','test.route','a0000000-0000-4000-8000-000000000002',repeat('1',64),'test-model',10,10,repeat('2',64),'{}');
insert into tongs.openai_text_funding_bindings(
 operation_id,route_code,reservation_id,credential_funding,model,
 maximum_input_units,maximum_output_units,maximum_attempts
) values
 ('test-operation','test.route','b0000000-0000-4000-8000-000000000001','forge','test-model',100,100,1),
 ('uncorrected-operation','test.route','b0000000-0000-4000-8000-000000000002','forge','test-model',100,100,1),
 ('cumulative-operation','test.route','b0000000-0000-4000-8000-000000000003','forge','test-model',100,100,1),
 ('live-operation','test.route','b0000000-0000-4000-8000-000000000004','forge','test-model',100,100,1);

do $$
declare result jsonb; relief_before jsonb;
begin
  if tongs._unconsumed_deposit_credit_units('d0000000-0000-4000-8000-000000000001')<>100 then
    raise exception 'legitimate relief did not restore available credits';
  end if;
  select to_jsonb(relief) into relief_before from tongs.customer_operation_reliefs relief
  where id='e0000000-0000-4000-8000-000000000001';

  begin
    perform tongs.correct_customer_operation_relief(
      'aa000000-0000-4000-8000-000000000010','e0000000-0000-4000-8000-000000000001',
      'b0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000001',
      'f0000000-0000-4000-8000-000000000001','test',22,105000,105000,
      'excess_units','must fail','excess-units-key','a0000000-0000-4000-8000-000000000001','{}');
    raise exception 'unit over-correction was allowed';
  exception when numeric_value_out_of_range then null; end;
  begin
    perform tongs.correct_customer_operation_relief(
      'aa000000-0000-4000-8000-000000000011','e0000000-0000-4000-8000-000000000001',
      'b0000000-0000-4000-8000-000000000002','c0000000-0000-4000-8000-000000000001',
      'f0000000-0000-4000-8000-000000000001','test',21,105000,105000,
      'wrong_reservation','must fail','wrong-reservation-key','a0000000-0000-4000-8000-000000000001','{}');
    raise exception 'wrong reservation was allowed';
  exception when invalid_parameter_value then null; end;
  begin
    perform tongs.correct_customer_operation_relief(
      'aa000000-0000-4000-8000-000000000012','e0000000-0000-4000-8000-000000000001',
      'b0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000002',
      'f0000000-0000-4000-8000-000000000001','test',21,105000,105000,
      'wrong_consumption','must fail','wrong-consumption-key','a0000000-0000-4000-8000-000000000001','{}');
    raise exception 'wrong consumption was allowed';
  exception when invalid_parameter_value then null; end;
  begin
    perform tongs.correct_customer_operation_relief(
      'aa000000-0000-4000-8000-000000000013','e0000000-0000-4000-8000-000000000001',
      'b0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000001',
      'f0000000-0000-4000-8000-000000000001','live',21,105000,105000,
      'wrong_environment','must fail','wrong-environment-key','a0000000-0000-4000-8000-000000000001','{}');
    raise exception 'wrong environment was allowed';
  exception when invalid_parameter_value then null; end;
  begin
    perform tongs.correct_customer_operation_relief(
      'aa000000-0000-4000-8000-000000000014','e0000000-0000-4000-8000-000000000001',
      'b0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000001',
      'f0000000-0000-4000-8000-000000000001','test',21,105000,105000,
      'non_operator','must fail','non-operator-key','a0000000-0000-4000-8000-000000000003','{}');
    raise exception 'non-operator was allowed';
  exception when insufficient_privilege then null; end;
  begin
    perform tongs.correct_customer_operation_relief(
      'aa000000-0000-4000-8000-000000000015','e0000000-0000-4000-8000-000000000001',
      'b0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000001',
      'f9000000-0000-4000-8000-000000000099','test',21,105000,105000,
      'missing_result','must fail','missing-result-key','a0000000-0000-4000-8000-000000000001','{}');
    raise exception 'correction without canonical result was allowed';
  exception when no_data_found then null; end;

  result:=tongs.correct_customer_operation_relief(
    'aa000000-0000-4000-8000-000000000001','e0000000-0000-4000-8000-000000000001',
    'b0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000001',
    'f0000000-0000-4000-8000-000000000001','test',21,105000,105000,
    'erroneous_post_settlement_relief','canonical paid result preceded relief',
    'test-relief-correction-v1','a0000000-0000-4000-8000-000000000001','{"proof":"isolated"}');
  if coalesce((result->>'replay')::boolean,true) then raise exception 'first correction reported replay'; end if;
  if tongs._unconsumed_deposit_credit_units('d0000000-0000-4000-8000-000000000001')<>79
     or tongs._unconsumed_deposit_value_micros('d0000000-0000-4000-8000-000000000001')<>395000 then
    raise exception 'exact correction did not restore the pre-relief balance';
  end if;
  if relief_before is distinct from (select to_jsonb(relief) from tongs.customer_operation_reliefs relief
    where id='e0000000-0000-4000-8000-000000000001') then
    raise exception 'historical relief was mutated';
  end if;
  if (select allocated_processor_fee_micros from tongs.customer_deposit_consumptions
      where id='c0000000-0000-4000-8000-000000000001')<>912 then
    raise exception 'processor allocation changed';
  end if;
  if (select sum(amount_micros) from tongs.accounting_journal_entries
      where event_id='aa000000-0000-4000-8000-000000000001')<>0
     or (select amount_micros from tongs.accounting_journal_entries
      where event_id='aa000000-0000-4000-8000-000000000001' and account_code='service_revenue_reversal')<>-105000
     or (select amount_micros from tongs.accounting_journal_entries
      where event_id='aa000000-0000-4000-8000-000000000001' and account_code='customer_prepaid_liability')<>105000
     or (select quantity_delta from tongs.accounting_journal_entries
      where event_id='aa000000-0000-4000-8000-000000000001' and account_code='live_customer_credits')<>-21 then
    raise exception 'correction journal did not exactly reverse relief economics';
  end if;
  result:=tongs.correct_customer_operation_relief(
    'aa000000-0000-4000-8000-000000000001','e0000000-0000-4000-8000-000000000001',
    'b0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000001',
    'f0000000-0000-4000-8000-000000000001','test',21,105000,105000,
    'erroneous_post_settlement_relief','canonical paid result preceded relief',
    'test-relief-correction-v1','a0000000-0000-4000-8000-000000000001','{"proof":"isolated"}');
  if coalesce((result->>'replay')::boolean,false) is not true
     or (select count(*) from tongs.customer_operation_relief_corrections
        where relief_id='e0000000-0000-4000-8000-000000000001')<>1 then
    raise exception 'exact replay was not idempotent';
  end if;
  begin
    perform tongs.correct_customer_operation_relief(
      'aa000000-0000-4000-8000-000000000001','e0000000-0000-4000-8000-000000000001',
      'b0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000001',
      'f0000000-0000-4000-8000-000000000001','test',21,105000,105000,
      'erroneous_post_settlement_relief','conflicting replay',
      'test-relief-correction-v1','a0000000-0000-4000-8000-000000000001','{"proof":"isolated"}');
    raise exception 'conflicting replay was allowed';
  exception when unique_violation then null; end;

  perform tongs.correct_customer_operation_relief(
    'aa000000-0000-4000-8000-000000000003','e0000000-0000-4000-8000-000000000003',
    'b0000000-0000-4000-8000-000000000003','c0000000-0000-4000-8000-000000000003',
    'f0000000-0000-4000-8000-000000000003','test',4,20000,20000,
    'partial_relief_correction','first proven part','cumulative-correction-one',
    'a0000000-0000-4000-8000-000000000001','{}');
  begin
    perform tongs.correct_customer_operation_relief(
      'aa000000-0000-4000-8000-000000000004','e0000000-0000-4000-8000-000000000003',
      'b0000000-0000-4000-8000-000000000003','c0000000-0000-4000-8000-000000000003',
      'f0000000-0000-4000-8000-000000000003','test',7,35000,35000,
      'partial_relief_correction','exceeds remainder','cumulative-correction-two',
      'a0000000-0000-4000-8000-000000000001','{}');
    raise exception 'cumulative over-correction was allowed';
  exception when numeric_value_out_of_range then null; end;

  if tongs._unconsumed_deposit_credit_units('d0000000-0000-4000-8000-000000000002')<>20 then
    raise exception 'legitimate uncorrected relief behavior changed';
  end if;
  perform tongs.correct_customer_operation_relief(
    'aa000000-0000-4000-8000-000000000005','e0000000-0000-4000-8000-000000000004',
    'b0000000-0000-4000-8000-000000000004','c0000000-0000-4000-8000-000000000004',
    'f0000000-0000-4000-8000-000000000004','live',10,50000,50000,
    'live_relief_correction','same canonical path in live','live-correction-key',
    'a0000000-0000-4000-8000-000000000001','{}');
  if tongs._unconsumed_deposit_credit_units('d0000000-0000-4000-8000-000000000004')<>10
     or tongs._unconsumed_deposit_credit_units('d0000000-0000-4000-8000-000000000001')<>79 then
    raise exception 'Test and Live correction projections were not separated';
  end if;
end $$;

do $$ begin
  if has_table_privilege('authenticated','tongs.customer_operation_relief_corrections','select')
     or has_function_privilege('authenticated',
       'tongs.correct_customer_operation_relief(uuid,uuid,uuid,uuid,uuid,text,bigint,bigint,bigint,text,text,text,uuid,jsonb)','execute') then
    raise exception 'customer correction authority leaked to authenticated users';
  end if;
end $$;

rollback;
