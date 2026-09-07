begin;

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
values
  ('a1000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','operator@example.test','',now(),now(),now()),
  ('a1000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','customer@example.test','',now(),now(),now()),
  ('a1000000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','ordinary@example.test','',now(),now(),now());
insert into tongs.platform_operators(user_id,reason,granted_by)
values('a1000000-0000-4000-8000-000000000001','owner purchase read test','a1000000-0000-4000-8000-000000000001');
insert into tongs.billing_customers(user_id,stripe_customer_id,email,customer_name)
values('a1000000-0000-4000-8000-000000000002','cus_test_owner_view','customer@example.test','Test Customer');
insert into tongs.billing_subscriptions(
  stripe_subscription_id,user_id,stripe_customer_id,purchase_type,item_id,interval,status,
  current_period_start,current_period_end
) values (
  'sub_test_owner_view','a1000000-0000-4000-8000-000000000002','cus_test_owner_view',
  'subscription','creator','monthly','active',now(),now()+interval '1 month'
);
insert into tongs.billing_events(
  stripe_event_id,event_type,user_id,stripe_customer_id,stripe_subscription_id,livemode,payload_json,processed_at
) values
  ('evt_test_subscription_created','customer.subscription.created','a1000000-0000-4000-8000-000000000002',
    'cus_test_owner_view','sub_test_owner_view',false,'{"type":"customer.subscription.created"}',now()-interval '1 second'),
  ('evt_test_checkout_completed','checkout.session.completed','a1000000-0000-4000-8000-000000000002',
    'cus_test_owner_view','sub_test_owner_view',false,
    '{"data":{"object":{"id":"cs_test_owner_view","invoice":"in_test_owner_view","payment_status":"paid","currency":"usd","amount_total":1000,"customer_details":{"address":{"postal_code":"never-return-this"}}}}}',now());

set local request.jwt.claim.role='authenticated';
set local request.jwt.claim.sub='a1000000-0000-4000-8000-000000000003';
set local role authenticated;
do $$ begin
  begin
    perform tongs.read_owner_purchase_activity('test',100);
    raise exception 'ordinary authenticated user reached owner purchase activity';
  exception when insufficient_privilege then null; end;
end $$;

reset role;
set local request.jwt.claim.sub='a1000000-0000-4000-8000-000000000001';
set local role authenticated;
do $$
declare v_result jsonb; v_purchase jsonb;
begin
  v_result:=tongs.read_owner_purchase_activity('test',100);
  v_purchase:=v_result->'purchases'->0;
  if jsonb_array_length(v_result->'purchases')<>1
     or v_purchase->>'customer_email'<>'customer@example.test'
     or v_purchase->>'stripe_mode'<>'test'
     or v_purchase->>'accounting_state'<>'invoice_receipt_pending'
     or (v_purchase->>'checkout_amount_minor')::bigint<>1000
     or (v_purchase->>'recognized_revenue_micros')::bigint<>0
     or (v_purchase->>'live_funding_eligible')::boolean
     or v_purchase::text like '%postal_code%'
     or v_purchase::text like '%never-return-this%' then
    raise exception 'owner purchase activity was incomplete or leaked payload details: %',v_result;
  end if;
  if jsonb_array_length(tongs.read_owner_purchase_activity('live',100)->'purchases')<>0 then
    raise exception 'test purchase leaked into live activity';
  end if;
end $$;

reset role;
do $$ begin
  if exists(select 1 from tongs.accounting_journal_events where user_id='a1000000-0000-4000-8000-000000000002') then
    raise exception 'owner purchase read created accounting state';
  end if;
end $$;

rollback;
