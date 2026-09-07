begin;

do $$
declare
  v_viewer constant uuid := '9a000000-0000-4000-8000-000000000001';
  v_admin constant uuid := '9a000000-0000-4000-8000-000000000002';
  v_operator constant uuid := '9a000000-0000-4000-8000-000000000003';
  v_org constant uuid := '9a000000-0000-4000-8000-000000000004';
  v_workspace constant uuid := '9a000000-0000-4000-8000-000000000005';
begin
  insert into auth.users(id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
  values
    (v_viewer, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'billing-viewer@example.test', '', now(), now(), now()),
    (v_admin, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'billing-admin@example.test', '', now(), now(), now()),
    (v_operator, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'billing-operator@example.test', '', now(), now(), now());
  insert into tongs.orgs(id, name, created_by) values(v_org, 'Billing containment test', v_admin);
  insert into tongs.org_members(org_id, user_id, org_role, created_by)
  values(v_org, v_admin, 'admin', v_admin), (v_org, v_viewer, 'member', v_admin);
  insert into tongs.workspaces(id, name, created_by, org_id)
  values(v_workspace, 'Billing containment test', v_admin, v_org);
  insert into tongs.workspace_members(workspace_id, user_id, role, created_by)
  values(v_workspace, v_viewer, 'viewer', v_admin);
  insert into tongs.platform_operators(user_id, reason, granted_by)
  values(v_operator, 'containment test', v_operator);
  insert into tongs.ai_credits(user_id, token_balance)
  values(v_viewer, 1234), (v_admin, 5678), (v_operator, 0);
  insert into tongs.external_cost_observations(
    workspace_id, provider, service, incurred_at, amount_usd, cost_basis,
    payer, allocation_method, external_line_item_id
  ) values(
    v_workspace, 'fly.io', 'forge-ffmpeg', now(), 1.25, 'invoice_actual',
    'forge', 'direct', 'billing-containment-test'
  );
end;
$$;

do $$
begin
  if has_table_privilege('authenticated', 'tongs.platform_operators', 'select')
     or has_table_privilege('authenticated', 'tongs.external_cost_observations', 'select')
     or has_table_privilege('authenticated', 'tongs.ai_usage_events', 'select')
     or has_table_privilege('authenticated', 'tongs.ai_usage_ledger', 'select')
     or has_table_privilege('authenticated', 'tongs.ai_pricing_policy_revisions', 'select')
     or has_table_privilege('authenticated', 'tongs.ai_pricing_rate_components', 'select')
     or has_table_privilege('authenticated', 'tongs.paid_media_provider_attempts', 'select')
     or has_table_privilege('authenticated', 'tongs.paid_media_actual_usage_components', 'select')
     or has_table_privilege('authenticated', 'tongs.paid_media_pricing_overages', 'select') then
    raise exception 'authenticated wholesale table access remains';
  end if;

  if has_function_privilege('authenticated', 'tongs.read_workspace_cost_ledger(uuid,timestamptz,timestamptz)', 'execute')
     or has_function_privilege('authenticated', 'tongs.set_platform_operator(uuid,boolean,text)', 'execute')
     or has_function_privilege('authenticated', 'tongs.read_active_ai_pricing_policies()', 'execute')
     or has_function_privilege('authenticated', 'tongs.read_ai_pricing_policy(uuid)', 'execute')
     or has_function_privilege('authenticated', 'tongs.resolve_active_compound_ai_pricing_policy(text,text,text,text,text,text,text,timestamptz)', 'execute')
     or has_function_privilege('authenticated', 'tongs.read_my_ai_credit_quote(uuid)', 'execute')
     or has_function_privilege('authenticated', 'tongs.read_my_ai_credit_quote_v2(uuid)', 'execute')
     or has_function_privilege('authenticated', 'tongs.read_my_ai_credit_reservation(uuid)', 'execute')
     or has_function_privilege('authenticated', 'tongs.read_my_paid_media_operation(uuid)', 'execute')
     or has_function_privilege('authenticated', 'tongs.create_paid_media_authorization_quote(uuid,uuid,text,text,uuid,uuid,text,uuid,text,text,text,text,jsonb,jsonb,text,timestamptz,timestamptz,uuid,uuid)', 'execute')
     or has_function_privilege('authenticated', 'tongs.resolve_ai_policy(uuid,uuid,uuid,text,text,text,tongs.ai_mode,boolean,boolean,tongs.ai_funding_source,numeric,text,text,text,boolean)', 'execute')
     or has_function_privilege('authenticated', 'tongs.resolve_ai_policy_legacy(uuid,uuid,uuid,text,text,text,tongs.ai_mode,boolean,boolean,tongs.ai_funding_source,numeric,text,text,text,boolean)', 'execute')
     or has_function_privilege('authenticated', 'tongs._ai_pricing_gcd(numeric,numeric)', 'execute')
     or has_function_privilege('authenticated', 'tongs._ai_pricing_ceil_fraction(numeric,numeric)', 'execute')
     or has_function_privilege('authenticated', 'tongs.admin_get_ai_usage_overview(uuid)', 'execute')
     or has_function_privilege('authenticated', 'tongs.admin_list_ai_usage_events(uuid,uuid,integer)', 'execute')
     or has_function_privilege('authenticated', 'tongs.admin_get_ai_usage_overview_window(uuid,integer)', 'execute')
     or has_function_privilege('authenticated', 'tongs.admin_get_ai_usage_export_rows(uuid,integer,integer)', 'execute')
     or has_function_privilege('authenticated', 'tongs.admin_get_user_ai_inspection(uuid,uuid,uuid)', 'execute') then
    raise exception 'authenticated wholesale RPC access remains';
  end if;

  if not has_function_privilege('authenticated', 'tongs.read_workspace_billing_ledger(uuid,timestamptz,timestamptz)', 'execute')
     or not has_function_privilege('authenticated', 'tongs.read_owner_workspace_cost_audit(uuid,timestamptz,timestamptz)', 'execute')
     or not has_function_privilege('authenticated', 'tongs.resolve_ai_access_policy(uuid,uuid,uuid,text,text,text,tongs.ai_mode,boolean,boolean,tongs.ai_funding_source,numeric,text,text,text,boolean)', 'execute')
     or not has_function_privilege('authenticated', 'tongs.admin_get_ai_activity_overview(uuid)', 'execute')
     or not has_function_privilege('authenticated', 'tongs.admin_get_user_ai_access_inspection(uuid,uuid,uuid)', 'execute') then
    raise exception 'replacement billing RPC grants are incomplete';
  end if;
end;
$$;

set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = '9a000000-0000-4000-8000-000000000001';

do $$
declare
  v_ledger jsonb;
  v_policy jsonb;
begin
  if tongs.is_platform_operator('9a000000-0000-4000-8000-000000000003') then
    raise exception 'caller inspected another user platform-operator state';
  end if;
  v_ledger := tongs.read_workspace_billing_ledger(
    '9a000000-0000-4000-8000-000000000005', now() - interval '1 day', now() + interval '1 day'
  );
  if v_ledger->>'contract_version' <> 'forge.workspace-billing-ledger.v1'
     or (v_ledger->>'current_user_credit_balance')::bigint <> 1234
     or v_ledger::text ~ '(cost_usd|provider_expense|markup|margin|invoice)' then
    raise exception 'customer ledger leaked an internal financial field: %', v_ledger;
  end if;

  select to_jsonb(p) into v_policy
  from tongs.resolve_ai_access_policy(
    '9a000000-0000-4000-8000-000000000004',
    '9a000000-0000-4000-8000-000000000005',
    '9a000000-0000-4000-8000-000000000001',
    'hearth',
    p_write_ledger => false
  ) p;
  if v_policy::text ~ '(caps|cost_usd|usage_month_usd|monthly_cap_usd)' then
    raise exception 'customer policy response leaked wholesale enforcement data: %', v_policy;
  end if;

  begin
    perform tongs.read_owner_workspace_cost_audit(
      '9a000000-0000-4000-8000-000000000005', now() - interval '1 day', now() + interval '1 day'
    );
    raise exception 'workspace viewer reached owner cost audit';
  exception when insufficient_privilege then null;
  end;
end;
$$;

reset role;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = '9a000000-0000-4000-8000-000000000002';
set local role authenticated;

do $$
declare
  v_inspection jsonb;
  v_overview jsonb;
begin
  select to_jsonb(i) into v_inspection
  from tongs.admin_get_user_ai_access_inspection(
    '9a000000-0000-4000-8000-000000000004',
    '9a000000-0000-4000-8000-000000000001',
    '9a000000-0000-4000-8000-000000000005'
  ) i;
  select to_jsonb(o) into v_overview
  from tongs.admin_get_ai_activity_overview('9a000000-0000-4000-8000-000000000004') o;
  if v_inspection::text ~ '(effective_policy_snapshot|cost_usd|usage_month_usd|monthly_cap_usd)'
     or v_overview::text ~ '(estimated_cost|actual_cost|cost_usd)' then
    raise exception 'organization admin contract leaked internal costs: %, %', v_inspection, v_overview;
  end if;
end;
$$;

reset role;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = '9a000000-0000-4000-8000-000000000003';
set local role authenticated;

do $$
declare
  v_audit jsonb;
begin
  if not tongs.is_platform_operator('9a000000-0000-4000-8000-000000000003') then
    raise exception 'platform operator self-check failed';
  end if;
  v_audit := tongs.read_owner_workspace_cost_audit(
    '9a000000-0000-4000-8000-000000000005', now() - interval '1 day', now() + interval '1 day'
  );
  if v_audit->>'contract_version' <> 'forge.owner-workspace-cost-audit.v1'
     or jsonb_array_length(v_audit->'components') <> 1
     or v_audit#>>'{components,0,cost_usd}' <> '1.25000000' then
    raise exception 'owner cost audit did not return internal evidence: %', v_audit;
  end if;
end;
$$;

reset role;
set local request.jwt.claim.role = 'service_role';
set local request.jwt.claim.sub = '';
set local role service_role;

do $$
declare
  v_audit jsonb;
begin
  v_audit := tongs.read_owner_workspace_cost_audit(
    '9a000000-0000-4000-8000-000000000005', now() - interval '1 day', now() + interval '1 day'
  );
  if v_audit->>'contract_version' <> 'forge.owner-workspace-cost-audit.v1' then
    raise exception 'service role could not read the owner cost audit';
  end if;
end;
$$;

reset role;
rollback;
