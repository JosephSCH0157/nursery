begin;

do $$
declare
  v_operator constant uuid := '9e000000-0000-4000-8000-000000000001';
  v_workspace constant uuid := '9e000000-0000-4000-8000-000000000002';
begin
  insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
  values(v_operator,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',
    'runway-boundary-operator@example.test','',now(),now(),now());
  insert into tongs.platform_operators(user_id,reason,granted_by)
  values(v_operator,'Runway boundary transaction test',v_operator);
  insert into tongs.workspaces(id,created_by,name,org_id)
  values(v_workspace,v_operator,'Runway boundary test',
    (select id from tongs.orgs where personal_owner_user_id=v_operator));
end $$;

set local request.jwt.claim.role='authenticated';
set local request.jwt.claim.sub='9e000000-0000-4000-8000-000000000001';
set local role authenticated;

do $$
declare
  v_result jsonb;
  v_components jsonb := jsonb_build_array(
    jsonb_build_object('component_code','runway-generation','component_kind','direct_provider',
      'credential_funding','forge','provider_label','Runway','success_ceiling_micros',600000,
      'failure_ceiling_micros',600000,'cost_policy_revision','runway-12-credits-per-second-2026-09-07',
      'tail_policy','none'),
    jsonb_build_object('component_code','forge-processing','component_kind','compute',
      'credential_funding','forge','provider_label','Forge compute','success_ceiling_micros',25000,
      'failure_ceiling_micros',25000,'cost_policy_revision','test-support-ceiling-v1',
      'tail_policy','none'),
    jsonb_build_object('component_code','retained-output','component_kind','retention_tail',
      'credential_funding','forge','provider_label','Supabase Storage','success_ceiling_micros',25000,
      'failure_ceiling_micros',0,'cost_policy_revision','test-support-ceiling-v1',
      'tail_policy','included_until','tail_policy_details',jsonb_build_object('included_until','2026-10-07T00:00:00Z'))
  );
begin
  v_result := tongs.read_runway_execution_control();
  if v_result->>'mode'<>'observe' or (v_result->>'new_paid_submissions_allowed')::boolean then
    raise exception 'migration did not begin in disabled observe mode: %',v_result;
  end if;
  perform tongs.commit_private_pricing_revision(
    '9e000000-0000-4000-8000-000000000010','owner-runway-gen45-5s-16x9',
    'sku','runway','gen4.5:5s:1280:720',0,
    '9e000000-0000-4000-8000-000000000011',0,65,'usd',v_components,
    '["provider_billed_failure"]','["prebilling_rejection"]','{"duration_seconds":5,"outputs":1}',
    '{"kind":"included_until","included_until":"2026-10-07T00:00:00Z"}',
    'transaction-scoped owner Runway boundary test');
  perform tongs.create_owner_operating_budget_draft(
    '9e000000-0000-4000-8000-000000000020','development',
    '9e000000-0000-4000-8000-000000000002','runway','tongs_broll_v2',
    'gen4.5:5s:1280:720','usd',now()-interval '1 hour',now()+interval '1 day',
    'transaction-scoped owner Runway boundary test');
  perform tongs.revise_owner_operating_budget(
    '9e000000-0000-4000-8000-000000000020','active',1300000,
    'transaction-scoped owner Runway boundary test');
end $$;

reset role;
set local request.jwt.claim.role='service_role';
set local request.jwt.claim.sub='';
set local role service_role;

do $$
declare v_result jsonb;
begin
  v_result := tongs.resolve_runway_execution_funding(
    'forge:broll:observe-only-operation',repeat('0',64),
    '9e000000-0000-4000-8000-000000000001','9e000000-0000-4000-8000-000000000002',
    'gen4.5',5,'1280:720');
  if not (v_result->>'use_legacy_accounting')::boolean
     or (v_result->>'shared_funding_ready')::boolean then
    raise exception 'observe mode did not resolve to the legacy compatibility path: %',v_result;
  end if;
  v_result := tongs.authorize_runway_submission(
    'forge:broll:observe-only-operation',repeat('0',64),'observe-attempt-0001',
    '9e000000-0000-4000-8000-000000000001','9e000000-0000-4000-8000-000000000002',
    'gen4.5',5,'1280:720','{"fake_provider":true}');
  if not (v_result->>'legacy_execution_allowed')::boolean
     or (v_result->>'provider_execution_authorized')::boolean then
    raise exception 'observe mode did not remain non-funded and non-activating: %',v_result;
  end if;
  perform tongs.create_shadow_spending_quote(
    '9e000000-0000-4000-8000-000000000030','9e000000-0000-4000-8000-000000000001',
    'forge:broll:funded-owner-operation','tongs_broll_v2','9e000000-0000-4000-8000-000000000002',
    '9e000000-0000-4000-8000-000000000011',repeat('a',64),
    '[{"component":"generation","provider_label":"Runway","credential_source":"forge"},
      {"component":"processing","provider_label":"Forge compute","credential_source":"forge"},
      {"component":"retention","provider_label":"Supabase Storage","credential_source":"forge"}]',
    now()+interval '1 hour');
end $$;

reset role;
set local request.jwt.claim.role='authenticated';
set local request.jwt.claim.sub='9e000000-0000-4000-8000-000000000001';
set local role authenticated;

do $$
begin
  perform tongs.accept_quote(
    '9e000000-0000-4000-8000-000000000030','9e000000-0000-4000-8000-000000000031',
    'accept-owner-runway-boundary',
    tongs.read_my_spending_quote('9e000000-0000-4000-8000-000000000030')->>'quote_hash');
end $$;

reset role;
set local request.jwt.claim.role='service_role';
set local request.jwt.claim.sub='';

do $$
begin
  insert into tongs.paid_execution_control_revisions(
    revision,pricing_activation_enabled,reservation_shadow_enabled,customer_settlement_enabled,
    owner_budget_spending_enabled,provider_execution_enabled,reason,actor_id
  ) values (2,true,true,false,true,true,'transaction-scoped Runway owner pilot test',
    '9e000000-0000-4000-8000-000000000001');
end $$;

set local role service_role;

do $$
begin
  perform tongs.reserve_operation(
    '9e000000-0000-4000-8000-000000000040','9e000000-0000-4000-8000-000000000030',
    'owner_budget','9e000000-0000-4000-8000-000000000020','reserve-owner-runway-boundary');
  perform tongs.bind_runway_funding_reservation(
    'forge:broll:funded-owner-operation',repeat('a',64),
    '9e000000-0000-4000-8000-000000000040','9e000000-0000-4000-8000-000000000001',
    '9e000000-0000-4000-8000-000000000002','gen4.5',5,'1280:720');
end $$;

reset role;
set local request.jwt.claim.role='authenticated';
set local request.jwt.claim.sub='9e000000-0000-4000-8000-000000000001';
set local role authenticated;

do $$
begin
  perform tongs.set_runway_execution_rollout_mode('enforce','transaction-scoped owner pilot cutover');
end $$;

reset role;
set local request.jwt.claim.role='service_role';
set local request.jwt.claim.sub='';
set local role service_role;

do $$
declare v_result jsonb;
begin
  v_result := tongs.resolve_runway_execution_funding(
    'forge:broll:funded-owner-operation',repeat('a',64),
    '9e000000-0000-4000-8000-000000000001','9e000000-0000-4000-8000-000000000002',
    'gen4.5',5,'1280:720');
  if not (v_result->>'shared_funding_ready')::boolean
     or (v_result->>'use_legacy_accounting')::boolean
     or v_result->>'funding_source_type'<>'owner_budget' then
    raise exception 'owner funding resolution did not bypass legacy customer accounting: %',v_result;
  end if;
  v_result := tongs.authorize_runway_submission(
    'forge:broll:funded-owner-operation',repeat('a',64),'funded-owner-runway-attempt-0001',
    '9e000000-0000-4000-8000-000000000001','9e000000-0000-4000-8000-000000000002',
    'gen4.5',5,'1280:720','{"fake_provider":true}');
  if not (v_result->>'provider_execution_authorized')::boolean
     or v_result->>'funding_source_type'<>'owner_budget' then
    raise exception 'funded owner Runway attempt was not authorized: %',v_result;
  end if;
  v_result := tongs.authorize_runway_submission(
    'forge:broll:funded-owner-operation',repeat('a',64),'funded-owner-runway-attempt-0001',
    '9e000000-0000-4000-8000-000000000001','9e000000-0000-4000-8000-000000000002',
    'gen4.5',5,'1280:720','{"fake_provider":true}');
  if (v_result->>'provider_execution_authorized')::boolean
     or not (v_result->>'replay')::boolean then
    raise exception 'duplicate Runway attempt was authorized: %',v_result;
  end if;
  v_result := tongs.record_runway_completion_for_reconciliation(
    'forge:broll:funded-owner-operation',repeat('a',64),'fake-runway-task-0001',
    '{"fake_provider":true,"status":"SUCCEEDED"}');
  if (v_result->>'direct_provider_estimated_micros')::bigint<>600000
     or v_result->>'supporting_cost_status'<>'pending'
     or (v_result->>'customer_revenue_micros')::bigint<>0 then
    raise exception 'Runway completion did not remain pending actual support reconciliation: %',v_result;
  end if;
  v_result := tongs.reconcile_runway_execution(
    'forge:broll:funded-owner-operation',600000,40000,
    '9e000000-0000-4000-8000-000000000050','settle-owner-runway-boundary',
    '{"fake_provider":true,"supporting_costs_measured":true}');
  if (v_result->>'owner_expense_micros')::bigint<>640000
     or (v_result->>'customer_revenue_micros')::bigint<>0
     or v_result->>'margin'<>'not_applicable' then
    raise exception 'owner Runway reconciliation mixed customer economics: %',v_result;
  end if;
end $$;

reset role;
set local request.jwt.claim.role='authenticated';
set local request.jwt.claim.sub='9e000000-0000-4000-8000-000000000001';
set local role authenticated;

do $$ begin
  perform tongs.set_runway_execution_rollout_mode('halt_new','transaction-scoped rollback test');
end $$;

reset role;
set local request.jwt.claim.role='service_role';
set local request.jwt.claim.sub='';
set local role service_role;

do $$
declare v_result jsonb;
begin
  v_result := tongs.authorize_runway_submission(
    'forge:broll:new-after-halt',repeat('b',64),'halted-runway-attempt-0001',
    '9e000000-0000-4000-8000-000000000001','9e000000-0000-4000-8000-000000000002',
    'gen4.5',5,'1280:720','{"fake_provider":true}');
  if v_result->>'mode'<>'halt_new' or (v_result->>'provider_execution_authorized')::boolean
     or (v_result->>'legacy_execution_allowed')::boolean then
    raise exception 'halt-new rollback did not stop new paid submission: %',v_result;
  end if;
  if (select customer_settlement_enabled from tongs.paid_execution_control_revisions order by revision desc limit 1) then
    raise exception 'owner pilot enabled customer settlement';
  end if;
  if (select count(*) from tongs.owner_operating_budget_consumptions
      where budget_id='9e000000-0000-4000-8000-000000000020')<>1
     or (select coalesce(sum(expense_amount_micros),0) from tongs.owner_operating_budget_consumptions
       where budget_id='9e000000-0000-4000-8000-000000000020')<>640000 then
    raise exception 'owner Runway expense is not singular and reconstructible';
  end if;
end $$;

reset role;

do $$
begin
  if has_table_privilege('authenticated','tongs.runway_funding_bindings','select')
     or has_table_privilege('authenticated','tongs.runway_submission_boundary_events','select')
     or has_table_privilege('authenticated','tongs.runway_execution_reconciliation_receipts','select')
     or has_function_privilege('authenticated',
       'tongs.authorize_runway_submission(text,text,text,uuid,uuid,text,integer,text,jsonb)','execute') then
    raise exception 'customer role reached private Runway funding internals';
  end if;
end $$;

rollback;
