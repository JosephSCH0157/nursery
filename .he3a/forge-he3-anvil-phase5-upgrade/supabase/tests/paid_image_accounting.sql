begin;

do $$
declare
  v_user constant uuid := '75000000-0000-4000-8000-000000000001';
  v_workspace constant uuid := '75000000-0000-4000-8000-000000000002';
  v_workpiece constant uuid := '75000000-0000-4000-8000-000000000003';
  v_quote constant uuid := '75000000-0000-4000-8000-000000000004';
  v_operation constant uuid := '75000000-0000-4000-8000-000000000005';
  v_reservation constant uuid := '75000000-0000-4000-8000-000000000006';
  v_attempt constant uuid := '75000000-0000-4000-8000-000000000007';
  v_settlement constant uuid := '75000000-0000-4000-8000-000000000008';
  v_overage constant uuid := '75000000-0000-4000-8000-000000000009';
  v_fingerprint text;
  v_result jsonb;
  v_before bigint;
  v_org uuid;
begin
  insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
  values(v_user,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','paid-image@example.test','',now(),now(),now());
  insert into tongs.orgs(name) values('Paid image test') returning id into v_org;
  insert into tongs.workspaces(id,name,created_by,org_id) values(v_workspace,'Paid image test',v_user,v_org);
  insert into tongs.episodes(id,workspace_id,label) values(v_workpiece,v_workspace,'Paid image test');
  insert into tongs.ai_credits(user_id,token_balance) values(v_user,1000000)
    on conflict(user_id) do update set token_balance=excluded.token_balance;

  if tongs._gpt_image_2_output_tokens(1536,1024,'high')<>5488 then raise exception 'official output calculation drifted'; end if;
  v_fingerprint:=encode(extensions.digest(convert_to(jsonb_build_object(
    'user_id',v_user,'operation_id','test:paid-image','tool','hearth','workspace_id',v_workspace,'workpiece_id',v_workpiece,
    'originating_entity_id','moment-1','prompt_revision_id',null,'prompt_content_hash',repeat('a',64),'prompt_utf8_bytes',5,
    'request_parameters',jsonb_build_object('size','1536x1024','quality','high','output_count',2,'operation','generation','metadata',jsonb_build_object('originating_entity_id','moment-1')),
    'pricing_policy_revision_id','72000000-0000-4000-8000-000000000001'::uuid,
    'authorization_policy_revision_id','74000000-0000-4000-8000-000000000011'::uuid
  )::text,'utf8'),'sha256'),'hex');
  v_result:=tongs.create_paid_image_authorization_quote(v_quote,v_user,'test:paid-image','hearth',v_workspace,v_workpiece,
    'moment-1',null,repeat('a',64),'hello','1536x1024','high',2,jsonb_build_object('originating_entity_id','moment-1'),v_fingerprint,now(),now()+interval '1 hour');
  if (v_result#>>'{quote,known_image_output_tokens}')::bigint<>10976
     or (v_result#>>'{quote,known_image_output_expense_micros}')::bigint<>329280
     or (v_result#>>'{quote,authorization_text_contingency_micros}')::bigint<>100000
     or (v_result#>>'{quote,authorized_customer_ceiling}')::bigint<>72120 then raise exception 'Path B quote economics are wrong: %',v_result; end if;
  if (tongs.create_paid_image_authorization_quote(v_quote,v_user,'test:paid-image','hearth',v_workspace,v_workpiece,
    'moment-1',null,repeat('a',64),'hello','1536x1024','high',2,jsonb_build_object('originating_entity_id','moment-1'),v_fingerprint,now(),now()+interval '1 hour')->>'replay')::boolean is not true then
    raise exception 'quote replay did not preserve identity'; end if;

  v_result:=tongs.approve_and_reserve_paid_media_operation(v_operation,'test:paid-image',v_fingerprint,v_quote,v_reservation,v_user,
    jsonb_build_object('authorized_ceiling',72120,'approved_at','2026-08-07T00:00:00Z'),'forge.paid-media.v1');
  if (v_result#>>'{operation,state}')<>'reserved' or tongs._ai_credit_active_holds(v_user)<>72120 then raise exception 'reserve-before-provider failed'; end if;
  select token_balance into v_before from tongs.ai_credits where user_id=v_user;
  if v_before<>1000000 then raise exception 'reservation changed settled balance'; end if;

  perform tongs.begin_paid_media_provider_attempt(v_operation,v_fingerprint,v_attempt,repeat('b',64),jsonb_build_object('model','gpt-image-2-2026-04-21'));
  perform tongs.record_paid_media_provider_result(v_operation,v_fingerprint,v_attempt,'req_test','response_test',
    jsonb_build_object('id','response_test','usage',jsonb_build_object('input_tokens',100,'output_tokens',10976)),
    jsonb_build_array(jsonb_build_object('component_kind','text_input','quantity',100),jsonb_build_object('component_kind','image_output','quantity',10976)));
  perform tongs.mark_paid_media_delivery(v_operation,v_fingerprint,jsonb_build_object('asset_ids',jsonb_build_array('asset-1'),'candidate_ids',jsonb_build_array('candidate-1')));
  v_result:=tongs.settle_paid_media_operation(v_operation,v_fingerprint,v_settlement,v_overage);
  if (v_result#>>'{receipt,settled_customer_charge}')::bigint<>55404
     or (v_result#>>'{receipt,released_reservation}')::bigint<>16716
     or (select token_balance from tongs.ai_credits where user_id=v_user)<>944596
     or tongs._ai_credit_active_holds(v_user)<>0 then raise exception 'exact settlement/release failed: %',v_result; end if;
  if (tongs.settle_paid_media_operation(v_operation,v_fingerprint,v_settlement,v_overage)->>'replay')::boolean is not true then raise exception 'terminal replay failed'; end if;

  begin
    perform tongs.create_paid_image_authorization_quote(gen_random_uuid(),v_user,'test:auto','hearth',v_workspace,v_workpiece,
      null,null,repeat('c',64),'x','auto','high',1,'{}',repeat('d',64),now(),null);
    raise exception 'auto size accepted';
  exception when sqlstate '22023' then null; end;
  begin
    perform tongs.create_paid_image_authorization_quote(gen_random_uuid(),v_user,'test:edit','hearth',v_workspace,v_workpiece,
      null,null,repeat('c',64),'x','1024x1024','high',1,'{"image":"payload"}',repeat('d',64),now(),null);
    raise exception 'image input accepted';
  exception when sqlstate '22023' then null; end;
  begin
    perform tongs.create_paid_image_authorization_quote(gen_random_uuid(),v_user,'test:long','hearth',v_workspace,v_workpiece,
      null,null,repeat('c',64),repeat('x',16385),'1024x1024','high',1,'{}',repeat('d',64),now(),null);
    raise exception 'over-limit prompt accepted';
  exception when sqlstate '22023' then null; end;
end $$;

create or replace function pg_temp.create_path_b_quote(
  p_user uuid,p_workspace uuid,p_workpiece uuid,p_quote uuid,p_operation text,p_output_count integer default 1
) returns jsonb language plpgsql as $$
declare v_fingerprint text;
begin
  v_fingerprint:=encode(extensions.digest(convert_to(jsonb_build_object(
    'user_id',p_user,'operation_id',p_operation,'tool','hearth','workspace_id',p_workspace,'workpiece_id',p_workpiece,
    'originating_entity_id','moment-1','prompt_revision_id',null,'prompt_content_hash',repeat('a',64),'prompt_utf8_bytes',5,
    'request_parameters',jsonb_build_object('size','1536x1024','quality','high','output_count',p_output_count,'operation','generation','metadata',jsonb_build_object('originating_entity_id','moment-1')),
    'pricing_policy_revision_id','72000000-0000-4000-8000-000000000001'::uuid,
    'authorization_policy_revision_id','74000000-0000-4000-8000-000000000011'::uuid
  )::text,'utf8'),'sha256'),'hex');
  return tongs.create_paid_image_authorization_quote(p_quote,p_user,p_operation,'hearth',p_workspace,p_workpiece,
    'moment-1',null,repeat('a',64),'hello','1536x1024','high',p_output_count,jsonb_build_object('originating_entity_id','moment-1'),v_fingerprint,now(),now()+interval '1 hour');
end $$;

do $$
declare
  v_user constant uuid := '75000000-0000-4000-8000-000000000001';
  v_workspace constant uuid := '75000000-0000-4000-8000-000000000002';
  v_workpiece constant uuid := '75000000-0000-4000-8000-000000000003';
  v_result jsonb; v_fingerprint text; v_balance bigint; v_hold_before bigint;
  v_quote uuid; v_operation uuid; v_reservation uuid; v_attempt uuid;
begin
  -- Insufficient available credits stops before any provider attempt exists.
  update tongs.ai_credits set token_balance=10 where user_id=v_user;
  v_quote:='75000000-0000-4000-8000-000000000014';
  v_result:=pg_temp.create_path_b_quote(v_user,v_workspace,v_workpiece,v_quote,'test:insufficient',1);
  v_fingerprint:=v_result#>>'{quote,request_fingerprint}';
  begin
    perform tongs.approve_and_reserve_paid_media_operation('75000000-0000-4000-8000-000000000015','test:insufficient',v_fingerprint,v_quote,
      '75000000-0000-4000-8000-000000000016',v_user,'{"approved":true}','forge.paid-media.v1');
    raise exception 'insufficient credits reserved';
  exception when sqlstate 'P0001' then null; end;
  if exists(select 1 from tongs.paid_media_provider_attempts where paid_media_operation_id='75000000-0000-4000-8000-000000000015') then raise exception 'provider attempt existed after insufficient funds'; end if;
  update tongs.ai_credits set token_balance=944596 where user_id=v_user;

  -- A complete provider rejection releases the entire hold and preserves exact failure evidence.
  v_quote:='75000000-0000-4000-8000-000000000024'; v_operation:='75000000-0000-4000-8000-000000000025';
  v_reservation:='75000000-0000-4000-8000-000000000026'; v_attempt:='75000000-0000-4000-8000-000000000027';
  v_result:=pg_temp.create_path_b_quote(v_user,v_workspace,v_workpiece,v_quote,'test:rejected',1); v_fingerprint:=v_result#>>'{quote,request_fingerprint}';
  perform tongs.approve_and_reserve_paid_media_operation(v_operation,'test:rejected',v_fingerprint,v_quote,v_reservation,v_user,'{"approved":true}','forge.paid-media.v1');
  perform tongs.begin_paid_media_provider_attempt(v_operation,v_fingerprint,v_attempt,repeat('b',64),'{}');
  perform tongs.record_paid_media_definitive_rejection(v_operation,v_fingerprint,v_attempt,'invalid_request','Unsupported size','{"status":400,"request_id":"req-rejected"}',
    '75000000-0000-4000-8000-000000000028');
  if tongs._ai_credit_active_holds(v_user)<>0 or (select state from tongs.paid_media_operations where id=v_operation)<>'provider_failed' then raise exception 'definitive rejection did not release hold'; end if;

  -- Ambiguous submission retains the hold and cannot create a second attempt on replay.
  v_quote:='75000000-0000-4000-8000-000000000034'; v_operation:='75000000-0000-4000-8000-000000000035';
  v_reservation:='75000000-0000-4000-8000-000000000036'; v_attempt:='75000000-0000-4000-8000-000000000037';
  v_result:=pg_temp.create_path_b_quote(v_user,v_workspace,v_workpiece,v_quote,'test:unknown',1); v_fingerprint:=v_result#>>'{quote,request_fingerprint}';
  perform tongs.approve_and_reserve_paid_media_operation(v_operation,'test:unknown',v_fingerprint,v_quote,v_reservation,v_user,'{"approved":true}','forge.paid-media.v1');
  perform tongs.begin_paid_media_provider_attempt(v_operation,v_fingerprint,v_attempt,repeat('c',64),'{}');
  v_result:=tongs.mark_paid_media_submission_unknown(v_operation,v_fingerprint,v_attempt,'response_lost','response lost','{"transmitted":true}');
  if (v_result#>>'{operation,reconciliation_required}')::boolean is not true or tongs._ai_credit_active_holds(v_user)<>44460 then raise exception 'ambiguous submission did not retain exactly one hold'; end if;
  perform tongs.begin_paid_media_provider_attempt(v_operation,v_fingerprint,v_attempt,repeat('c',64),'{}');
  if (select count(*) from tongs.paid_media_provider_attempts where paid_media_operation_id=v_operation)<>1 then raise exception 'ambiguous replay created a second provider attempt'; end if;
  -- Release only inside this rolled-back test so following scenarios are isolated.
  perform tongs.release_ai_credit_reservation(v_user,v_reservation,'75000000-0000-4000-8000-000000000038','test_cleanup','{}');

  -- Billable provider failure records Forge expense but charges the customer zero.
  v_quote:='75000000-0000-4000-8000-000000000044'; v_operation:='75000000-0000-4000-8000-000000000045';
  v_reservation:='75000000-0000-4000-8000-000000000046'; v_attempt:='75000000-0000-4000-8000-000000000047';
  v_result:=pg_temp.create_path_b_quote(v_user,v_workspace,v_workpiece,v_quote,'test:billable-failure',1); v_fingerprint:=v_result#>>'{quote,request_fingerprint}';
  perform tongs.approve_and_reserve_paid_media_operation(v_operation,'test:billable-failure',v_fingerprint,v_quote,v_reservation,v_user,'{"approved":true}','forge.paid-media.v1');
  perform tongs.begin_paid_media_provider_attempt(v_operation,v_fingerprint,v_attempt,repeat('d',64),'{}');
  select token_balance into v_balance from tongs.ai_credits where user_id=v_user;
  perform tongs.record_paid_media_terminal_failure(v_operation,v_fingerprint,v_attempt,'provider_billable_failure','provider_failed','Provider billed a failed result','{"status":500}',
    jsonb_build_array(jsonb_build_object('component_kind','text_input','quantity',100)), '75000000-0000-4000-8000-000000000048');
  if (select token_balance from tongs.ai_credits where user_id=v_user)<>v_balance or tongs._ai_credit_active_holds(v_user)<>0
    or not exists(select 1 from tongs.paid_media_actual_usage_components where provider_attempt_id=v_attempt and component_kind='text_input') then raise exception 'billable provider failure accounting is wrong'; end if;

  -- Delivery failure after durable provider success also charges zero and preserves usage.
  v_quote:='75000000-0000-4000-8000-000000000054'; v_operation:='75000000-0000-4000-8000-000000000055';
  v_reservation:='75000000-0000-4000-8000-000000000056'; v_attempt:='75000000-0000-4000-8000-000000000057';
  v_result:=pg_temp.create_path_b_quote(v_user,v_workspace,v_workpiece,v_quote,'test:delivery-failure',1); v_fingerprint:=v_result#>>'{quote,request_fingerprint}';
  perform tongs.approve_and_reserve_paid_media_operation(v_operation,'test:delivery-failure',v_fingerprint,v_quote,v_reservation,v_user,'{"approved":true}','forge.paid-media.v1');
  perform tongs.begin_paid_media_provider_attempt(v_operation,v_fingerprint,v_attempt,repeat('e',64),'{}');
  perform tongs.record_paid_media_provider_result(v_operation,v_fingerprint,v_attempt,'req-delivery','resp-delivery','{"usage":{}}',
    jsonb_build_array(jsonb_build_object('component_kind','text_input','quantity',100),jsonb_build_object('component_kind','image_output','quantity',5488)));
  select token_balance into v_balance from tongs.ai_credits where user_id=v_user;
  perform tongs.record_paid_media_terminal_failure(v_operation,v_fingerprint,v_attempt,'delivery_failure','storage_failed','Canonical storage failed','{}','[]',
    '75000000-0000-4000-8000-000000000058');
  if (select token_balance from tongs.ai_credits where user_id=v_user)<>v_balance or tongs._ai_credit_active_holds(v_user)<>0
    or (select state from tongs.paid_media_operations where id=v_operation)<>'delivery_failed' then raise exception 'delivery failure charged customer or retained hold'; end if;

  -- Provider expense over the authorized ceiling is recorded, never additionally debited.
  v_quote:='75000000-0000-4000-8000-000000000064'; v_operation:='75000000-0000-4000-8000-000000000065';
  v_reservation:='75000000-0000-4000-8000-000000000066'; v_attempt:='75000000-0000-4000-8000-000000000067';
  v_result:=pg_temp.create_path_b_quote(v_user,v_workspace,v_workpiece,v_quote,'test:overage',1); v_fingerprint:=v_result#>>'{quote,request_fingerprint}';
  perform tongs.approve_and_reserve_paid_media_operation(v_operation,'test:overage',v_fingerprint,v_quote,v_reservation,v_user,'{"approved":true}','forge.paid-media.v1');
  perform tongs.begin_paid_media_provider_attempt(v_operation,v_fingerprint,v_attempt,repeat('f',64),'{}');
  perform tongs.record_paid_media_provider_result(v_operation,v_fingerprint,v_attempt,'req-overage','resp-overage','{"usage":{}}',
    jsonb_build_array(jsonb_build_object('component_kind','text_input','quantity',100),jsonb_build_object('component_kind','image_output','quantity',10000)));
  perform tongs.mark_paid_media_delivery(v_operation,v_fingerprint,'{"asset_id":"asset-overage"}');
  v_result:=tongs.settle_paid_media_operation(v_operation,v_fingerprint,'75000000-0000-4000-8000-000000000068','75000000-0000-4000-8000-000000000069');
  if (v_result#>>'{receipt,settled_customer_charge}')::bigint<>44460 or (v_result#>>'{receipt,forge_pricing_overage}')::bigint<>6024
    or not exists(select 1 from tongs.paid_media_pricing_overages where paid_media_operation_id=v_operation and amount_credits=6024) then raise exception 'customer ceiling overage policy failed: %',v_result; end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub','75000000-0000-4000-8000-000000000001',true);
do $$ begin
  if tongs.read_my_paid_media_operation('75000000-0000-4000-8000-000000000005') is null then raise exception 'owned operation read failed'; end if;
  begin
    perform tongs.create_paid_image_authorization_quote(gen_random_uuid(),auth.uid(),'unauthorized','hearth',null,null,null,null,repeat('a',64),'x','1024x1024','high',1,'{}',repeat('b',64),now(),null);
    raise exception 'authenticated direct quote mutation succeeded';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','75000000-0000-4000-8000-000000000099',true);
do $$ begin
  if tongs.read_my_paid_media_operation('75000000-0000-4000-8000-000000000005') is not null then raise exception 'cross-account operation read leaked'; end if;
end $$;
reset role;

rollback;
