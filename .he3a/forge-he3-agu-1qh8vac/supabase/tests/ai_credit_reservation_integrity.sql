begin;

do $$
declare
  u1 constant uuid := '71000000-0000-4000-8000-000000000001';
  u2 constant uuid := '71000000-0000-4000-8000-000000000002';
  r1 constant uuid := '71000000-0000-4000-8000-000000000011';
  r2 constant uuid := '71000000-0000-4000-8000-000000000012';
  s2 constant uuid := '71000000-0000-4000-8000-000000000022';
  released jsonb;
  settled jsonb;
  replay jsonb;
  settlement_event bigint;
begin
  insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at) values
    (u1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','credit-one@example.test','',now(),now(),now()),
    (u2,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','credit-two@example.test','',now(),now(),now());
  insert into tongs.ai_credits(user_id,token_balance) values (u1,100),(u2,50);

  perform tongs.reserve_ai_credits(u1,'test:reserve:one','tongs','test','image',60,repeat('a',64),'{}',r1);
  if tongs._ai_credit_active_holds(u1) <> 60 then raise exception 'reservation did not create hold'; end if;
  if (select token_balance from tongs.ai_credits where user_id=u1) <> 100 then raise exception 'reservation changed settled balance'; end if;
  begin
    perform tongs.reserve_ai_credits(u1,'test:reserve:insufficient','tongs','test','image',41,repeat('b',64),'{}','71000000-0000-4000-8000-000000000013');
    raise exception 'insufficient reservation succeeded';
  exception when sqlstate 'P0001' then null; end;

  released := tongs.release_ai_credit_reservation(u1,r1,'71000000-0000-4000-8000-000000000021','test_release','{}');
  if tongs._ai_credit_active_holds(u1) <> 0 then raise exception 'release did not restore availability'; end if;
  if (tongs.release_ai_credit_reservation(u1,r1,'71000000-0000-4000-8000-000000000021','test_release','{}')->>'replay')::boolean is not true then raise exception 'release replay failed'; end if;

  perform tongs.reserve_ai_credits(u1,'test:reserve:settle','tongs','test','image',80,repeat('c',64),'{}',r2);
  settled := tongs.settle_ai_credit_reservation(u1,r2,s2,70,'provider-request','test_settle','{}');
  if (select token_balance from tongs.ai_credits where user_id=u1) <> 30 then raise exception 'settlement did not debit exactly'; end if;
  if tongs._ai_credit_active_holds(u1) <> 0 or (settled->>'released_amount')::bigint <> 10 then raise exception 'settlement release is wrong'; end if;
  replay := tongs.settle_ai_credit_reservation(u1,r2,s2,70,'provider-request','test_settle','{}');
  if (replay->>'replay')::boolean is not true or (select token_balance from tongs.ai_credits where user_id=u1) <> 30 then raise exception 'settlement replay debited twice'; end if;
  select id into settlement_event from tongs.ai_credit_reservation_events where reservation_id=r2 and event_type='settled';
  perform tongs.apply_ai_credit_correction(u1,'71000000-0000-4000-8000-000000000031',settlement_event,'refund',20,'forge_delivery_failure',u1,'{}');
  if (select token_balance from tongs.ai_credits where user_id=u1) <> 50 then raise exception 'refund did not append credit'; end if;
  perform tongs.apply_ai_credit_correction(u1,'71000000-0000-4000-8000-000000000031',settlement_event,'refund',20,'forge_delivery_failure',u1,'{}');
  if (select token_balance from tongs.ai_credits where user_id=u1) <> 50 then raise exception 'refund replay duplicated credit'; end if;

  perform tongs.reserve_ai_credits(u1,'test:reserve:legacy-guard','tongs','test','text',40,repeat('d',64),'{}','71000000-0000-4000-8000-000000000014');
  begin
    perform tongs.apply_ai_token_delta(u1,-11,'legacy_test','71000000-0000-4000-8000-000000000041',null);
    raise exception 'legacy debit consumed reserved credits';
  exception when sqlstate 'P0001' then null; end;
  perform tongs.apply_ai_token_delta(u1,-10,'legacy_test','71000000-0000-4000-8000-000000000042',null);
  if (select token_balance from tongs.ai_credits where user_id=u1) <> 40 then raise exception 'legacy exact debit failed'; end if;
  begin
    perform tongs.apply_ai_token_delta(u2,-51,'legacy_oversize','71000000-0000-4000-8000-000000000043',null);
    raise exception 'oversized debit was clamped';
  exception when sqlstate 'P0001' then null; end;
  if (select token_balance from tongs.ai_credits where user_id=u2) <> 50 then raise exception 'oversized debit changed balance'; end if;
  perform tongs.record_ai_credit_unfunded_expense(u2,'71000000-0000-4000-8000-000000000043','provider-test',51,'postpaid_debit_unfunded','{}');
  perform tongs.record_ai_credit_unfunded_expense(u2,'71000000-0000-4000-8000-000000000043','provider-test',51,'postpaid_debit_unfunded','{}');
  if (select count(*) from tongs.ai_credit_unfunded_expenses where id='71000000-0000-4000-8000-000000000043') <> 1 then raise exception 'unfunded evidence replay duplicated'; end if;
end $$;

do $$
declare
  u constant uuid := '71000000-0000-4000-8000-000000000001';
  p1 constant uuid := '71000000-0000-4000-8000-000000000051';
  p2 constant uuid := '71000000-0000-4000-8000-000000000052';
  q1 constant uuid := '71000000-0000-4000-8000-000000000061';
  policy jsonb;
  quote jsonb;
  fingerprint text;
  test_policy_id uuid;
begin
  policy := tongs.commit_ai_pricing_policy_revision('test-image-policy',0,p1,'test-provider','image-v1','image','generate',
    '{"size":"1024x1024","quality":"high"}','output',1000000,'USD',1,1000,6,5,2,
    now()-interval '1 minute',null,true,'operator_entered','test-only economics','v1',u);
  test_policy_id := (policy#>>'{revision,policy_id}')::uuid;
  fingerprint := encode(extensions.digest(convert_to(jsonb_build_object(
    'user_id',u,'operation_id','test:quote:one','tool','hearth','workspace_id',null,'workpiece_id',null,
    'provider','test-provider','model','image-v1','media_kind','image','generation_mode','generate',
    'request_parameters','{"size":"1024x1024","quality":"high"}'::jsonb,'requested_output_count',2,
    'provider_billable_units',2,'pricing_policy_revision_id',p1,'pricing_policy_revision',1
  )::text,'utf8'),'sha256'),'hex');
  quote := tongs.create_ai_credit_quote(q1,u,'test:quote:one','hearth',null,null,p1,
    '{"size":"1024x1024","quality":"high"}',2,2,2402,fingerprint,now(),now()+interval '10 minutes');
  if (quote#>>'{quote,estimated_provider_expense_micros}')::bigint <> 2000000
     or (quote#>>'{quote,customer_credit_charge}')::bigint <> 2402 then raise exception 'exact quote arithmetic failed: %',quote; end if;
  perform tongs.commit_ai_pricing_policy_revision('test-image-policy',1,p2,'test-provider','image-v1','image','generate',
    '{"size":"1024x1024","quality":"high"}','output',2000000,'USD',1,1000,6,5,2,
    now(),null,true,'operator_entered','test-only economics','v2',u);
  if (select customer_credit_charge from tongs.ai_credit_quotes where id=q1) <> 2402 then raise exception 'historical quote changed'; end if;
  begin
    update tongs.ai_pricing_policy_revisions set model='mutated' where id=p1;
    raise exception 'pricing revision mutation succeeded';
  exception when sqlstate '55000' then null; end;
  if (select s.current_revision from tongs.ai_pricing_policy_sequences s where s.policy_id=test_policy_id) <> 2 then raise exception 'pricing sequence did not advance'; end if;
end $$;

-- Deterministic Reference Visual rendering remains outside paid accounting.
do $$ begin
  if exists (select 1 from tongs.ai_credit_reservations where purpose like '%reference_visual%') then
    raise exception 'deterministic Reference Visual touched paid accounting';
  end if;
end $$;

do $$ begin
  if has_function_privilege('authenticated','tongs.reserve_ai_credits(uuid,text,text,text,text,bigint,text,jsonb,uuid)','EXECUTE') then
    raise exception 'authenticated can reserve credits';
  end if;
  if has_table_privilege('authenticated','tongs.ai_credit_reservations','INSERT') then
    raise exception 'authenticated can directly insert reservations';
  end if;
  if not has_function_privilege('service_role','tongs.reserve_ai_credits(uuid,text,text,text,text,bigint,text,jsonb,uuid)','EXECUTE') then
    raise exception 'service role cannot reserve credits';
  end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000002',true);
do $$ begin
  if exists(select 1 from tongs.ai_credit_reservations where user_id='71000000-0000-4000-8000-000000000001') then
    raise exception 'cross-account reservation read succeeded';
  end if;
end $$;
reset role;

rollback;
