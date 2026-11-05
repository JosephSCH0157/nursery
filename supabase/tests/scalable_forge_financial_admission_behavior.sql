begin;

set local session_replication_role=replica;

do $fixture$
declare pricing_id uuid;
begin
  select id into pricing_id from tongs.private_pricing_revisions order by created_at limit 1;
  if pricing_id is null then raise exception 'reviewed pricing prerequisite missing'; end if;

  insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at) values
    ('fa100000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','scalable-a@example.test','',now(),now(),now()),
    ('fa100000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','scalable-b@example.test','',now(),now(),now());
  insert into tongs.orgs(id,name,created_by,personal_owner_user_id) values
    ('fa100000-0000-4000-8000-000000000010','Scalable admission A','fa100000-0000-4000-8000-000000000001','fa100000-0000-4000-8000-000000000001'),
    ('fa100000-0000-4000-8000-000000000011','Scalable admission B','fa100000-0000-4000-8000-000000000002','fa100000-0000-4000-8000-000000000002');
  insert into tongs.workspaces(id,name,created_by,org_id) values
    ('fa100000-0000-4000-8000-000000000020','Scalable A','fa100000-0000-4000-8000-000000000001','fa100000-0000-4000-8000-000000000010'),
    ('fa100000-0000-4000-8000-000000000021','Scalable B','fa100000-0000-4000-8000-000000000002','fa100000-0000-4000-8000-000000000011');

  insert into tongs.accounting_journal_events(id,idempotency_key,event_type,environment,source_type,source_id,currency,user_id,payload_hash,occurred_at) values
    ('fa100000-0000-4000-8000-000000000030','scalable-deposit-a','customer_deposit_received','live','stripe_event','scalable-a','USD','fa100000-0000-4000-8000-000000000001',repeat('a',64),now()),
    ('fa100000-0000-4000-8000-000000000031','scalable-fee-a','customer_deposit_fee','live','stripe_fee','scalable-a-fee','USD','fa100000-0000-4000-8000-000000000001',repeat('b',64),now()),
    ('fa100000-0000-4000-8000-000000000032','scalable-deposit-b','customer_deposit_received','live','stripe_event','scalable-b','USD','fa100000-0000-4000-8000-000000000002',repeat('c',64),now()),
    ('fa100000-0000-4000-8000-000000000033','scalable-fee-b','customer_deposit_fee','live','stripe_fee','scalable-b-fee','USD','fa100000-0000-4000-8000-000000000002',repeat('d',64),now());
  insert into tongs.customer_deposits(id,user_id,stripe_mode,stripe_event_id,stripe_session_id,pack_id,currency,gross_amount_micros,credit_units,journal_event_id,received_at) values
    ('fa100000-0000-4000-8000-000000000040','fa100000-0000-4000-8000-000000000001','live','evt-scalable-a','cs-scalable-a','fixture','USD',95000,100,'fa100000-0000-4000-8000-000000000030',now()),
    ('fa100000-0000-4000-8000-000000000041','fa100000-0000-4000-8000-000000000002','live','evt-scalable-b','cs-scalable-b','fixture','USD',50000,100,'fa100000-0000-4000-8000-000000000032',now());
  insert into tongs.customer_deposit_processor_fees(id,deposit_id,provider_fee_reference,fee_amount_micros,journal_event_id,recorded_at) values
    ('fa100000-0000-4000-8000-000000000042','fa100000-0000-4000-8000-000000000040','fee-scalable-a',5000,'fa100000-0000-4000-8000-000000000031',now()),
    ('fa100000-0000-4000-8000-000000000043','fa100000-0000-4000-8000-000000000041','fee-scalable-b',2000,'fa100000-0000-4000-8000-000000000033',now());

  insert into tongs.accounting_journal_events(id,idempotency_key,event_type,environment,source_type,source_id,currency,user_id,payload_hash,occurred_at) values
    ('fa100000-0000-4000-8000-000000000050','scalable-subscription-receipt','subscription_cycle_received','live','stripe_invoice','scalable-invoice','USD','fa100000-0000-4000-8000-000000000001',repeat('1',64),now()),
    ('fa100000-0000-4000-8000-000000000051','scalable-allowance-grant','paid_allowance_granted','live','subscription_cycle','scalable-allowance','USD','fa100000-0000-4000-8000-000000000001',repeat('2',64),now());
  insert into tongs.subscription_cycle_receipts(id,user_id,stripe_mode,stripe_event_id,stripe_invoice_id,stripe_subscription_id,purchase_type,plan_item_id,currency,gross_amount_micros,period_start,period_end,journal_event_id,received_at)
  values('fa100000-0000-4000-8000-000000000052','fa100000-0000-4000-8000-000000000001','live','evt-scalable-subscription','in-scalable','sub-scalable','subscription','creator','USD',50000,now()-interval '1 day',now()+interval '29 days','fa100000-0000-4000-8000-000000000050',now());
  insert into tongs.paid_allowance_grants(id,receipt_id,user_id,stripe_subscription_id,plan_item_id,period_start,period_end,entitlement_units,allocated_revenue_micros,maximum_wholesale_spend_micros,currency,allocation_policy_revision,journal_event_id,granted_at,financial_environment)
  values('fa100000-0000-4000-8000-000000000053','fa100000-0000-4000-8000-000000000052','fa100000-0000-4000-8000-000000000001','sub-scalable','creator',now()-interval '1 day',now()+interval '29 days',10,50000,40000,'USD','synthetic-scalable-v1','fa100000-0000-4000-8000-000000000051',now(),'live');

  for i in 1..9 loop
    insert into tongs.customer_spending_quotes(id,user_id,operation_id,tool,workspace_id,pricing_revision_id,pricing_revision,currency,
      normal_maximum_charge_micros,billable_failure_maximum_charge_micros,customer_credit_units,full_cost_ceiling_micros,
      billable_failure_classes,free_failure_classes,included_quantity,retention_policy,provider_funding_summary,
      request_fingerprint,quote_hash,expires_at,financial_environment)
    values(extensions.uuid_generate_v5('fa100000-0000-4000-8000-000000000100',i::text),
      case when i=6 then 'fa100000-0000-4000-8000-000000000002'::uuid else 'fa100000-0000-4000-8000-000000000001'::uuid end,
      'scalable-operation-'||i,'fixture',case when i=6 then 'fa100000-0000-4000-8000-000000000021'::uuid else 'fa100000-0000-4000-8000-000000000020'::uuid end,
      pricing_id,1,'USD',40000,0,8,30000,'[]','[]','{}','{}','[]',repeat(i::text,64),
      encode(extensions.digest(convert_to('scalable-quote-'||i,'utf8'),'sha256'),'hex'),now()+interval '1 hour','live');
    insert into tongs.customer_spending_quote_acceptances(id,quote_id,user_id,acceptance_key,accepted_quote_hash)
    values(extensions.uuid_generate_v5('fa100000-0000-4000-8000-000000000110',i::text),
      extensions.uuid_generate_v5('fa100000-0000-4000-8000-000000000100',i::text),
      case when i=6 then 'fa100000-0000-4000-8000-000000000002'::uuid else 'fa100000-0000-4000-8000-000000000001'::uuid end,
      'scalable-acceptance-'||i,encode(extensions.digest(convert_to('scalable-quote-'||i,'utf8'),'sha256'),'hex'));
    insert into tongs.funding_reservations(id,quote_id,user_id,operation_id,funding_source_type,funding_source_id,currency,
      reserved_customer_charge_micros,reserved_credit_units,reserved_wholesale_spend_micros,idempotency_key,funding_environment)
    values(extensions.uuid_generate_v5('fa100000-0000-4000-8000-000000000120',i::text),
      extensions.uuid_generate_v5('fa100000-0000-4000-8000-000000000100',i::text),
      case when i=6 then 'fa100000-0000-4000-8000-000000000002'::uuid else 'fa100000-0000-4000-8000-000000000001'::uuid end,
      'scalable-operation-'||i,
      case when i=5 then 'beta_grant' when i=7 then 'paid_allowance' when i=8 then 'owner_budget' when i=9 then 'none' else 'customer_deposit' end,
      case when i=6 then 'fa100000-0000-4000-8000-000000000041'::uuid when i=5 then 'fa100000-0000-4000-8000-000000000099'::uuid when i=7 then 'fa100000-0000-4000-8000-000000000053'::uuid when i=8 then 'fa100000-0000-4000-8000-000000000054'::uuid when i=9 then null::uuid else 'fa100000-0000-4000-8000-000000000040'::uuid end,
      'USD',case when i=9 then 0 else 40000 end,case when i=9 then 0 else 8 end,case when i=9 then 0 else 30000 end,'scalable-reservation-'||i,'live');
    insert into tongs.funding_reservation_events(id,reservation_id,sequence,event_type,event_key,customer_charge_micros,credit_units,wholesale_spend_micros)
    values(extensions.uuid_generate_v5('fa100000-0000-4000-8000-000000000130',i::text),
      extensions.uuid_generate_v5('fa100000-0000-4000-8000-000000000120',i::text),1,'reserved','scalable-reserved-'||i,
      case when i=9 then 0 else 40000 end,case when i=9 then 0 else 8 end,case when i=9 then 0 else 30000 end);
  end loop;

  insert into tongs.restricted_beta_cost_evidence_revisions(id,capability_code,revision,evidence_state,coverage_state,source_reference,observed_at,valid_until,hard_cap_scope,notes) values
    ('fa100000-0000-4000-8000-000000000200','openai.text.hearth_chat',2147483600,'synthetic_test','complete','synthetic scalable-admission certification',now(),now()+interval '1 day','disposable only','No production authority.'),
    ('fa100000-0000-4000-8000-000000000201','runway.video',2147483600,'synthetic_test','complete','synthetic scalable-admission certification',now(),now()+interval '1 day','disposable only','No production authority.');
  insert into tongs.restricted_beta_policy_revisions(id,environment,revision,lifecycle_state,aggregate_forge_exposure_limit_micros,reserved_headroom_micros,maximum_concurrency,rolling_window_seconds,evidence_max_age_seconds,reason,exposure_accounting_mode,net_forge_loss_limit_micros,emergency_platform_risk_limit_micros) values
    ('fa100000-0000-4000-8000-000000000210','production',2147483600,'active',1,0,20,86400,86400,'Synthetic disposable funded-net policy only.','funded_net_v2',15000,10000);
  insert into tongs.restricted_beta_policy_capabilities(id,policy_revision_id,capability_code,admission_mode,cost_evidence_revision_id,maximum_attempts,maximum_concurrency,per_operation_supplier_ceiling_micros,per_operation_supporting_ceiling_micros,per_operation_tail_ceiling_micros,permitted_callers_json,exact_model_or_sku,notes,provider_code,provider_gross_liquidity_limit_micros) values
    ('fa100000-0000-4000-8000-000000000220','fa100000-0000-4000-8000-000000000210','openai.text.hearth_chat','covered','fa100000-0000-4000-8000-000000000200',1,20,30000,0,0,'["interactive"]','synthetic-openai','Synthetic only.','openai',90000),
    ('fa100000-0000-4000-8000-000000000221','fa100000-0000-4000-8000-000000000210','runway.video','covered','fa100000-0000-4000-8000-000000000201',1,20,30000,0,0,'["interactive"]','synthetic-runway','Synthetic only.','runway',100000);
end
$fixture$;

set local session_replication_role=origin;
select set_config('request.jwt.claim.role','service_role',true);

do $behavior$
declare result jsonb; exposure record; attempt_count bigint; report jsonb;
begin
  -- Three concurrent prepaid operations consume distinct portions of the same
  -- net cash pool. The legacy aggregate limit is deliberately 1 micro and must
  -- not reject funded_net_v2 traffic.
  for i in 1..3 loop
    result:=tongs.reserve_restricted_beta_exposure(
      extensions.uuid_generate_v5('fa100000-0000-4000-8000-000000000300',i::text),
      'fa100000-0000-4000-8000-000000000210','openai.text.hearth_chat','scalable-operation-'||i,
      'fa100000-0000-4000-8000-000000000001','fa100000-0000-4000-8000-000000000020',repeat(i::text,64),'synthetic-openai',
      'verified_customer_deposit',extensions.uuid_generate_v5('fa100000-0000-4000-8000-000000000120',i::text)::text,
      'real','interactive',40000,30000,0,0,0,0,300,'scalable-hold-'||i);
    if coalesce((result->>'authorized')::boolean,false) is not true or (result->>'reserved_net_forge_loss_micros')::bigint<>0 then
      raise exception 'properly funded concurrent operation % was rejected: %',i,result;
    end if;
  end loop;
  select * into exposure from tongs._scalable_policy_exposure('fa100000-0000-4000-8000-000000000210');
  if exposure.gross_micros<>90000 or exposure.net_micros<>0 then raise exception 'funded exposure arithmetic drift: %',row_to_json(exposure); end if;

  -- OpenAI liquidity is exhausted at exactly 90,000 even though net loss is 0.
  result:=tongs.reserve_restricted_beta_exposure(
    'fa100000-0000-4000-8000-000000000304','fa100000-0000-4000-8000-000000000210','openai.text.hearth_chat','scalable-operation-4',
    'fa100000-0000-4000-8000-000000000001','fa100000-0000-4000-8000-000000000020',repeat('4',64),'synthetic-openai',
    'verified_customer_deposit',extensions.uuid_generate_v5('fa100000-0000-4000-8000-000000000120','4')::text,'real','interactive',40000,10000,0,0,0,0,300,'scalable-hold-4');
  if result->>'reason'<>'provider_liquidity_exhausted' then raise exception 'provider liquidity did not fail closed: %',result; end if;

  -- Promotional value creates no collateral and exceeds the net-loss limit.
  result:=tongs.reserve_restricted_beta_exposure(
    'fa100000-0000-4000-8000-000000000305','fa100000-0000-4000-8000-000000000210','runway.video','scalable-operation-5',
    'fa100000-0000-4000-8000-000000000001','fa100000-0000-4000-8000-000000000020',repeat('5',64),'synthetic-runway',
    'operator_provisioned_beta_credit',extensions.uuid_generate_v5('fa100000-0000-4000-8000-000000000120','5')::text,'real','interactive',40000,11000,0,0,0,0,300,'scalable-hold-5');
  if result->>'reason'<>'emergency_platform_risk_limit' then raise exception 'promotional funding bypassed emergency risk: %',result; end if;
  result:=tongs.reserve_restricted_beta_exposure(
    'fa100000-0000-4000-8000-000000000315','fa100000-0000-4000-8000-000000000210','runway.video','scalable-operation-5',
    'fa100000-0000-4000-8000-000000000001','fa100000-0000-4000-8000-000000000020',repeat('5',64),'synthetic-runway',
    'operator_provisioned_beta_credit',extensions.uuid_generate_v5('fa100000-0000-4000-8000-000000000120','5')::text,'real','interactive',40000,16000,0,0,0,0,300,'scalable-hold-5-net');
  if result->>'reason'<>'net_forge_loss_capacity_exhausted' then raise exception 'promotional funding bypassed net-loss capacity: %',result; end if;

  -- A different provider remains independent and customer B has real backing.
  result:=tongs.reserve_restricted_beta_exposure(
    'fa100000-0000-4000-8000-000000000306','fa100000-0000-4000-8000-000000000210','runway.video','scalable-operation-6',
    'fa100000-0000-4000-8000-000000000002','fa100000-0000-4000-8000-000000000021',repeat('6',64),'synthetic-runway',
    'verified_customer_deposit',extensions.uuid_generate_v5('fa100000-0000-4000-8000-000000000120','6')::text,'real','interactive',40000,30000,0,0,0,0,300,'scalable-hold-6');
  if coalesce((result->>'authorized')::boolean,false) is not true then raise exception 'independent provider was rejected: %',result; end if;

  -- Paid subscription allowance is collateral only up to its canonical
  -- wholesale allocation. Owner expense authority is not collateral. BYOK
  -- carries no Forge supplier exposure or customer-credit debit.
  result:=tongs.reserve_restricted_beta_exposure(
    'fa100000-0000-4000-8000-000000000307','fa100000-0000-4000-8000-000000000210','runway.video','scalable-operation-7',
    'fa100000-0000-4000-8000-000000000001','fa100000-0000-4000-8000-000000000020',repeat('7',64),'synthetic-runway',
    'economically_backed_allowance',extensions.uuid_generate_v5('fa100000-0000-4000-8000-000000000120','7')::text,'real','interactive',40000,30000,0,0,0,0,300,'scalable-hold-7');
  if coalesce((result->>'authorized')::boolean,false) is not true or (result->>'eligible_funding_offset_micros')::bigint<>30000 then
    raise exception 'paid allowance collateral drift: %',result;
  end if;
  result:=tongs.reserve_restricted_beta_exposure(
    'fa100000-0000-4000-8000-000000000308','fa100000-0000-4000-8000-000000000210','runway.video','scalable-operation-8',
    'fa100000-0000-4000-8000-000000000001','fa100000-0000-4000-8000-000000000020',repeat('8',64),'synthetic-runway',
    'owner_operating_budget',extensions.uuid_generate_v5('fa100000-0000-4000-8000-000000000120','8')::text,'real','interactive',40000,5000,0,0,0,0,300,'scalable-hold-8');
  if coalesce((result->>'authorized')::boolean,false) is not true or (result->>'eligible_funding_offset_micros')::bigint<>0
     or (result->>'reserved_net_forge_loss_micros')::bigint<>5000 then
    raise exception 'owner sponsorship masqueraded as cash collateral: %',result;
  end if;
  result:=tongs.reserve_restricted_beta_exposure(
    'fa100000-0000-4000-8000-000000000309','fa100000-0000-4000-8000-000000000210','runway.video','scalable-operation-9',
    'fa100000-0000-4000-8000-000000000001','fa100000-0000-4000-8000-000000000020',repeat('9',64),'synthetic-runway',
    'byo',extensions.uuid_generate_v5('fa100000-0000-4000-8000-000000000120','9')::text,'byo','interactive',0,0,0,0,0,0,300,'scalable-hold-9');
  if coalesce((result->>'authorized')::boolean,false) is not true or (result->>'reserved_gross_micros')::bigint<>0 then
    raise exception 'BYOK created Forge supplier exposure: %',result;
  end if;

  -- A valid hold admits one attempt. Exact replay cannot create a second event.
  result:=tongs.begin_restricted_beta_attempt(
    'fa100000-0000-4000-8000-000000000306','scalable-runway-attempt',1::smallint,'interactive');
  if coalesce((result->>'authorized')::boolean,false) is not true then raise exception 'valid funded attempt was rejected: %',result; end if;
  result:=tongs.begin_restricted_beta_attempt(
    'fa100000-0000-4000-8000-000000000306','scalable-runway-attempt',1::smallint,'interactive');
  select count(*) into attempt_count from tongs.restricted_beta_exposure_events where event_key='scalable-runway-attempt';
  if attempt_count<>1 then raise exception 'attempt replay created duplicate exposure events'; end if;

  -- Authoritative partial reconciliation may reveal a supplier overcharge.
  -- The higher obligation must become the gross exposure, and replay must not
  -- append a duplicate outcome.
  result:=tongs.record_restricted_beta_exposure_outcome(
    'fa100000-0000-4000-8000-000000000306','scalable-runway-partial','reconciliation_partial',
    35000,null,0,5000,jsonb_build_object('authoritative',true,'synthetic_test_only',true));
  if coalesce((result->>'replay')::boolean,true) is true
     or tongs._restricted_beta_hold_remaining_gross('fa100000-0000-4000-8000-000000000306')<>35000 then
    raise exception 'partial supplier overcharge was not retained as exposure: %',result;
  end if;
  perform tongs.record_restricted_beta_exposure_outcome(
    'fa100000-0000-4000-8000-000000000306','scalable-runway-partial','reconciliation_partial',
    35000,null,0,5000,jsonb_build_object('authoritative',true,'synthetic_test_only',true));
  select count(*) into attempt_count from tongs.restricted_beta_exposure_events where event_key='scalable-runway-partial';
  if attempt_count<>1 then raise exception 'partial reconciliation replay duplicated exposure'; end if;

  -- A chargeback invalidates every offset from customer A. Attempt admission
  -- must fail before writing an attempt event.
  set constraints all deferred;
  set local session_replication_role=replica;
  insert into tongs.accounting_journal_events(id,idempotency_key,event_type,environment,source_type,source_id,currency,user_id,payload_hash,occurred_at)
  values('fa100000-0000-4000-8000-000000000400','scalable-chargeback','customer_deposit_dispute','live','stripe_adjustment','scalable-dispute','USD','fa100000-0000-4000-8000-000000000001',repeat('e',64),now());
  insert into tongs.customer_deposit_refunds(id,deposit_id,stripe_refund_id,stripe_event_id,adjustment_type,refund_amount_micros,refunded_credit_units,liability_release_micros,discrepancy_expense_micros,journal_event_id,refunded_at)
  values('fa100000-0000-4000-8000-000000000401','fa100000-0000-4000-8000-000000000040','re-scalable','evt-scalable-dispute','dispute',1000,1,1000,0,'fa100000-0000-4000-8000-000000000400',now());
  set local session_replication_role=origin;
  result:=tongs.begin_restricted_beta_attempt(
    extensions.uuid_generate_v5('fa100000-0000-4000-8000-000000000300','1'),
    'scalable-attempt-after-dispute',1::smallint,'interactive');
  if result->>'reason'<>'net_forge_loss_capacity_exhausted' then raise exception 'chargeback did not revoke attempt authority: %',result; end if;
  select count(*) into attempt_count from tongs.restricted_beta_exposure_events where event_key='scalable-attempt-after-dispute';
  if attempt_count<>0 then raise exception 'denied attempt mutated exposure events'; end if;

  -- A refund after provider-attempt admission also revokes collateral for
  -- observability and all subsequent admission. It does not rewrite the hold.
  set local session_replication_role=replica;
  insert into tongs.accounting_journal_events(id,idempotency_key,event_type,environment,source_type,source_id,currency,user_id,payload_hash,occurred_at)
  values('fa100000-0000-4000-8000-000000000402','scalable-refund-b','customer_deposit_refund','live','stripe_refund','scalable-refund-b','USD','fa100000-0000-4000-8000-000000000002',repeat('f',64),now());
  insert into tongs.customer_deposit_refunds(id,deposit_id,stripe_refund_id,stripe_event_id,adjustment_type,refund_amount_micros,refunded_credit_units,liability_release_micros,discrepancy_expense_micros,journal_event_id,refunded_at)
  values('fa100000-0000-4000-8000-000000000403','fa100000-0000-4000-8000-000000000041','re-scalable-b','evt-scalable-refund-b','refund',1000,1,1000,0,'fa100000-0000-4000-8000-000000000402',now());
  set local session_replication_role=origin;
  select * into exposure from tongs._scalable_policy_exposure('fa100000-0000-4000-8000-000000000210');
  if exposure.gross_micros<>160000 or exposure.net_micros<>130000 then
    raise exception 'post-attempt refund was not reflected fail-closed: %',row_to_json(exposure);
  end if;
  select tongs.read_forge_cost_observability() into report;
  if (report#>>'{aggregate_exposure,recorded_net_forge_loss_micros}')::bigint<130000 then
    raise exception 'observability understated dynamically revoked collateral: %',report;
  end if;
end
$behavior$;

rollback;
