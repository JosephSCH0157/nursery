begin;

do $$
declare v_operator constant uuid := '9d000000-0000-4000-8000-000000000001';
begin
  insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
  values(v_operator,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',
    'owner-budget-operator@example.test','',now(),now(),now());
  insert into tongs.platform_operators(user_id,reason,granted_by)
  values(v_operator,'owner budget path test',v_operator);
end $$;

set local request.jwt.claim.role='authenticated';
set local request.jwt.claim.sub='9d000000-0000-4000-8000-000000000001';
set local role authenticated;

do $$
declare
  v_components jsonb := jsonb_build_array(
    jsonb_build_object('component_code','runway-generation','component_kind','direct_provider',
      'credential_funding','forge','provider_label','Runway','success_ceiling_micros',500000,
      'failure_ceiling_micros',250000,'cost_policy_revision','fake-runway-v1','tail_policy','none')
  );
begin
  perform tongs.commit_private_pricing_revision(
    '9d000000-0000-4000-8000-000000000010','owner-runway-test','provider','runway',null,0,
    '9d000000-0000-4000-8000-000000000011',0,50,'usd',v_components,
    '["provider_billed_failure"]','["prebilling_rejection"]','{"outputs":1}','{"kind":"none"}',
    'transaction-scoped owner lane test');
  perform tongs.create_owner_operating_budget_draft(
    '9d000000-0000-4000-8000-000000000020','development',null,'runway','tongs_broll_v2',null,
    'usd',now()-interval '1 hour',now()+interval '1 day','transaction-scoped draft');
  perform tongs.revise_owner_operating_budget(
    '9d000000-0000-4000-8000-000000000020','active',700000,
    'transaction-scoped test activation');
end $$;

reset role;
set local request.jwt.claim.role='service_role';
set local request.jwt.claim.sub='';
set local role service_role;

do $$
begin
  perform tongs.create_shadow_spending_quote(
    '9d000000-0000-4000-8000-000000000030','9d000000-0000-4000-8000-000000000001',
    'owner-runway-operation-one','tongs_broll_v2',null,'9d000000-0000-4000-8000-000000000011',
    repeat('a',64),'[{"component":"generation","provider_label":"Runway","credential_source":"forge"}]',
    now()+interval '1 hour');
  perform tongs.create_shadow_spending_quote(
    '9d000000-0000-4000-8000-000000000031','9d000000-0000-4000-8000-000000000001',
    'owner-runway-operation-two','tongs_broll_v2',null,'9d000000-0000-4000-8000-000000000011',
    repeat('b',64),'[{"component":"generation","provider_label":"Runway","credential_source":"forge"}]',
    now()+interval '1 hour');
end $$;

reset role;
set local request.jwt.claim.role='authenticated';
set local request.jwt.claim.sub='9d000000-0000-4000-8000-000000000001';
set local role authenticated;

do $$
begin
  perform tongs.accept_quote('9d000000-0000-4000-8000-000000000030',
    '9d000000-0000-4000-8000-000000000040','accept-owner-runway-one',
    tongs.read_my_spending_quote('9d000000-0000-4000-8000-000000000030')->>'quote_hash');
  perform tongs.accept_quote('9d000000-0000-4000-8000-000000000031',
    '9d000000-0000-4000-8000-000000000041','accept-owner-runway-two',
    tongs.read_my_spending_quote('9d000000-0000-4000-8000-000000000031')->>'quote_hash');
end $$;

reset role;
set local request.jwt.claim.role='service_role';
set local request.jwt.claim.sub='';

do $$
begin
  insert into tongs.paid_execution_control_revisions(
    revision,pricing_activation_enabled,reservation_shadow_enabled,customer_settlement_enabled,
    owner_budget_spending_enabled,provider_execution_enabled,reason,actor_id
  ) values (2,true,true,false,true,true,'transaction-scoped owner path test',
    '9d000000-0000-4000-8000-000000000001');
end $$;

set local role service_role;

do $$
declare v_result jsonb;
begin
  v_result := tongs.reserve_operation('9d000000-0000-4000-8000-000000000050',
    '9d000000-0000-4000-8000-000000000030','owner_budget',
    '9d000000-0000-4000-8000-000000000020','reserve-owner-runway-one');
  if (v_result->>'provider_execution_authorized')::boolean
     or (select reserved_customer_charge_micros from tongs.funding_reservations
       where id='9d000000-0000-4000-8000-000000000050') <> 0 then
    raise exception 'reservation itself bypassed provider lease or debited a customer: %',v_result;
  end if;
  v_result := tongs.begin_provider_attempt('9d000000-0000-4000-8000-000000000050',
    'generic-owner-attempt-blocked',60,'{"fake_provider":true}');
  if (v_result->>'provider_execution_authorized')::boolean
     or v_result->>'reason'<>'owner_budget_requires_owner_boundary' then
    raise exception 'generic provider boundary authorized an owner reservation: %',v_result;
  end if;
  v_result := tongs.begin_owner_provider_attempt('9d000000-0000-4000-8000-000000000050',
    'owner-runway-attempt-one',60,'{"fake_provider":true}');
  if not (v_result->>'provider_execution_authorized')::boolean then
    raise exception 'transaction-scoped owner provider lease was not authorized: %',v_result;
  end if;
  v_result := tongs.settle_owner_operation('9d000000-0000-4000-8000-000000000050',
    '9d000000-0000-4000-8000-000000000060','settle-owner-runway-one','success',null,450000,
    '{"provider":"fake-runway"}');
  if (v_result->>'owner_expense_micros')::bigint<>450000
     or (v_result->>'customer_debit_micros')::bigint<>0
     or (v_result->>'customer_revenue_micros')::bigint<>0
     or v_result->>'margin'<>'not_applicable' then
    raise exception 'owner settlement mixed customer economics: %',v_result;
  end if;
  v_result := tongs.settle_owner_operation('9d000000-0000-4000-8000-000000000050',
    '9d000000-0000-4000-8000-000000000060','settle-owner-runway-one','success',null,450000,
    '{"provider":"fake-runway"}');
  if not (v_result->>'replay')::boolean then raise exception 'owner settlement replay duplicated expense'; end if;
  begin
    perform tongs.reserve_operation('9d000000-0000-4000-8000-000000000051',
      '9d000000-0000-4000-8000-000000000031','owner_budget',
      '9d000000-0000-4000-8000-000000000020','reserve-owner-runway-two');
    raise exception 'consumed owner budget was oversubscribed';
  exception when sqlstate 'P0001' then null; end;
  if (select count(*) from tongs.owner_operating_budget_consumptions
      where budget_id='9d000000-0000-4000-8000-000000000020')<>1
     or (select coalesce(sum(-amount_micros),0) from tongs.accounting_journal_entries
       where account_code='service_revenue' and owner_budget_id='9d000000-0000-4000-8000-000000000020')<>0
     or (select coalesce(sum(amount_micros),0) from tongs.accounting_journal_entries
       where account_code='owner_research_qa_expense' and owner_budget_id='9d000000-0000-4000-8000-000000000020')<>450000 then
    raise exception 'owner budget accounting is not isolated or reconstructible';
  end if;
end $$;

reset role;

do $$
begin
  if has_table_privilege('authenticated','tongs.owner_operating_budget_consumptions','select')
     or has_table_privilege('authenticated','tongs.owner_operating_budget_discrepancies','select')
     or has_function_privilege('authenticated',
       'tongs.begin_owner_provider_attempt(uuid,text,integer,jsonb)','execute')
     or has_function_privilege('authenticated',
       'tongs.settle_owner_operation(uuid,uuid,text,text,text,bigint,jsonb)','execute') then
    raise exception 'customer role reached owner budget internals';
  end if;
  if exists (
    select event_id,currency from tongs.accounting_journal_entries where amount_micros<>0
    group by event_id,currency having sum(amount_micros)<>0
  ) then raise exception 'owner budget journal is not balanced'; end if;
  if (select owner_budget_spending_enabled from tongs.paid_execution_control_revisions where revision=1)
     or (select provider_execution_enabled from tongs.paid_execution_control_revisions where revision=1) then
    raise exception 'deployed shadow control was activated';
  end if;
end $$;

rollback;
