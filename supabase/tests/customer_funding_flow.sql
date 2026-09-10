do $$
declare
  v_customer uuid := 'cf100000-0000-4000-8000-000000000001';
  v_other uuid := 'cf100000-0000-4000-8000-000000000002';
  v_operator uuid := 'cf100000-0000-4000-8000-000000000003';
  v_policy uuid := 'cf100000-0000-4000-8000-000000000010';
  v_revision uuid := 'cf100000-0000-4000-8000-000000000011';
  v_live uuid := 'cf100000-0000-4000-8000-000000000020';
  v_test uuid := 'cf100000-0000-4000-8000-000000000021';
  v_fee uuid := 'cf100000-0000-4000-8000-000000000022';
  v_quote uuid := 'cf100000-0000-4000-8000-000000000030';
  v_accept uuid := 'cf100000-0000-4000-8000-000000000031';
  v_reservation uuid := 'cf100000-0000-4000-8000-000000000032';
  v_refund uuid := 'cf100000-0000-4000-8000-000000000033';
  v_snapshot jsonb;
  v_replay jsonb;
begin
  insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
  values
    (v_customer,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','funded@example.test','',now(),now(),now()),
    (v_other,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','other@example.test','',now(),now(),now()),
    (v_operator,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','operator@example.test','',now(),now(),now());
  insert into tongs.platform_operators(user_id,reason,granted_by)
  values(v_operator,'isolated customer funding proof',v_operator);

  perform set_config('request.jwt.claim.role','authenticated',true);
  perform set_config('request.jwt.claim.sub',v_operator::text,true);
  set local role authenticated;
  perform tongs.commit_private_pricing_revision(
    v_policy,'customer-funding-isolated','provider','customer-funding-isolated',null,0,
    v_revision,0,70,'usd',
    '[{"component_code":"provider","component_kind":"direct_provider","credential_funding":"forge","provider_label":"Synthetic","success_ceiling_micros":700000,"failure_ceiling_micros":0,"cost_policy_revision":"synthetic-v1","tail_policy":"none"}]'::jsonb,
    '[]'::jsonb,'["provider_failure","forge_validation_failure","persistence_failure"]'::jsonb,
    '{"operations":1}'::jsonb,'{"kind":"none"}'::jsonb,'isolated funding proof');

  reset role;
  perform set_config('request.jwt.claim.role','service_role',true);
  perform set_config('request.jwt.claim.sub','',true);
  set local role service_role;
  perform tongs.record_customer_deposit(v_live,v_customer,'evt_live_funding','cs_live_funding','pi_live_funding',true,'ai_small',1000000,'usd',100,now(),'{}');
  perform tongs.record_customer_deposit(v_test,v_customer,'evt_test_funding','cs_test_funding','pi_test_funding',false,'ai_small',500000,'usd',50,now(),'{}');

  reset role;
  perform set_config('request.jwt.claim.role','authenticated',true);
  perform set_config('request.jwt.claim.sub',v_customer::text,true);
  set local role authenticated;
  v_snapshot := tongs.read_my_customer_funding();
  if (v_snapshot#>>'{live_verified_purchases,available_micros}')::bigint <> 0
     or (v_snapshot#>>'{live_pending_fee_evidence,gross_amount_micros}')::bigint <> 1000000
     or (v_snapshot#>>'{test_funding,credit_units}')::bigint <> 50 then
    raise exception 'funding classes were not isolated before fee evidence: %', v_snapshot;
  end if;

  reset role;
  perform set_config('request.jwt.claim.role','service_role',true);
  perform set_config('request.jwt.claim.sub','',true);
  set local role service_role;
  perform tongs.record_customer_deposit_processor_fee(v_fee,v_live,'txn_live_funding',32000,now(),'{}');
  v_replay := tongs.record_customer_deposit('cf100000-0000-4000-8000-000000000099',v_customer,'evt_live_funding','cs_live_funding','pi_live_funding',true,'ai_small',1000000,'usd',100,now(),'{}');
  if coalesce((v_replay->>'replay')::boolean,false) is not true
     or (select count(*) from tongs.customer_deposits where stripe_event_id='evt_live_funding') <> 1 then
    raise exception 'signed webhook replay duplicated a deposit';
  end if;
  perform tongs.create_shadow_spending_quote(v_quote,v_customer,'customer-funded-operation-1','isolated',null,v_revision,repeat('a',64),'[{"component":"provider","provider_label":"Synthetic","credential_source":"forge"}]'::jsonb,now()+interval '10 minutes');

  reset role;
  perform set_config('request.jwt.claim.role','authenticated',true);
  perform set_config('request.jwt.claim.sub',v_customer::text,true);
  set local role authenticated;
  v_snapshot := tongs.read_my_customer_funding();
  if (v_snapshot#>>'{live_verified_purchases,available_micros}')::bigint <> 1000000
     or (v_snapshot#>>'{live_verified_purchases,available_credit_units}')::bigint <> 100 then
    raise exception 'verified Live purchase did not become available: %', v_snapshot;
  end if;
  perform tongs.accept_quote(v_quote,v_accept,'accept-customer-funded-operation',tongs.read_my_spending_quote(v_quote)->>'quote_hash');

  reset role;
  perform set_config('request.jwt.claim.role','service_role',true);
  perform set_config('request.jwt.claim.sub','',true);
  set local role service_role;
  perform tongs.reserve_operation(v_reservation,v_quote,'customer_deposit',v_live,'reserve-customer-funded-operation');

  reset role;
  perform set_config('request.jwt.claim.role','authenticated',true);
  perform set_config('request.jwt.claim.sub',v_customer::text,true);
  set local role authenticated;
  v_snapshot := tongs.read_my_customer_funding();
  if (v_snapshot#>>'{live_verified_purchases,available_micros}')::bigint <> 300000
     or (v_snapshot#>>'{active_reservations,reserved_customer_charge_micros}')::bigint <> 700000 then
    raise exception 'active reservation was not separated from available funding: %', v_snapshot;
  end if;

  reset role;
  perform set_config('request.jwt.claim.role','service_role',true);
  perform set_config('request.jwt.claim.sub','',true);
  set local role service_role;
  perform tongs.record_customer_deposit_refund(v_refund,v_live,'re_live_funding','evt_refund_live_funding','refund',500000,now(),'{}');

  reset role;
  perform set_config('request.jwt.claim.role','authenticated',true);
  perform set_config('request.jwt.claim.sub',v_customer::text,true);
  set local role authenticated;
  v_snapshot := tongs.read_my_customer_funding();
  if (v_snapshot#>>'{live_verified_purchases,available_micros}')::bigint <> 0
     or (v_snapshot#>>'{live_verified_purchases,refunded_micros}')::bigint <> 500000 then
    raise exception 'reversed funding remained available for new spending: %', v_snapshot;
  end if;

  perform set_config('request.jwt.claim.sub',v_other::text,true);
  v_snapshot := tongs.read_my_customer_funding();
  if (v_snapshot#>>'{live_verified_purchases,purchased_micros}')::bigint <> 0
     or jsonb_array_length(v_snapshot->'deposits') <> 0 then
    raise exception 'customer funding privacy boundary failed: %', v_snapshot;
  end if;

  reset role;
  if (select count(*) from tongs.customer_deposit_consumptions where deposit_id=v_live) <> 0 then
    raise exception 'reservation or refund recognized operation revenue';
  end if;
  if (select count(*) from tongs.customer_deposits where user_id=v_customer) <> 2 then
    raise exception 'abandoned checkout or replay manufactured a deposit';
  end if;
end;
$$;
