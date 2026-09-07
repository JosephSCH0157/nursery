-- Release 1A: isolate customer billing views from Forge wholesale pricing and cost data.
-- Workspace and organization authority never imply Forge platform-operator authority.

begin;

create table if not exists tongs.platform_operators (
  user_id uuid primary key references auth.users(id) on delete restrict,
  reason text not null check (nullif(btrim(reason), '') is not null),
  granted_by uuid references auth.users(id) on delete set null,
  granted_at timestamptz not null default now()
);

alter table tongs.platform_operators enable row level security;

revoke all on tongs.platform_operators from public, anon, authenticated, service_role;
grant select, insert, update, delete on tongs.platform_operators to service_role;

create or replace function tongs.is_platform_operator(p_user_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_caller uuid := auth.uid();
  v_role text := coalesce(auth.role(), '');
begin
  if p_user_id is null then
    return false;
  end if;

  -- Authenticated callers may only inspect their own operator state. Service-role
  -- callers need the wider form for bootstrapping and server-side authorization.
  if v_role <> 'service_role' and v_caller is distinct from p_user_id then
    return false;
  end if;

  return exists (
    select 1
    from tongs.platform_operators po
    where po.user_id = p_user_id
  );
end;
$$;

create or replace function tongs.set_platform_operator(
  p_user_id uuid,
  p_enabled boolean,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'service role authority required' using errcode = '42501';
  end if;
  if p_user_id is null or p_enabled is null or nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'user, enabled state, and reason are required' using errcode = '22023';
  end if;
  if not exists (select 1 from auth.users u where u.id = p_user_id) then
    raise exception 'platform operator user not found' using errcode = 'P0002';
  end if;

  if p_enabled then
    insert into tongs.platform_operators(user_id, reason, granted_by)
    values (p_user_id, btrim(p_reason), auth.uid())
    on conflict (user_id) do update
      set reason = excluded.reason,
          granted_by = excluded.granted_by,
          granted_at = now();
  else
    delete from tongs.platform_operators where user_id = p_user_id;
  end if;

  return jsonb_build_object(
    'user_id', p_user_id,
    'enabled', p_enabled,
    'changed_at', now()
  );
end;
$$;

revoke all on function tongs.is_platform_operator(uuid) from public, anon;
grant execute on function tongs.is_platform_operator(uuid) to authenticated, service_role;
revoke all on function tongs.set_platform_operator(uuid, boolean, text) from public, anon, authenticated;
grant execute on function tongs.set_platform_operator(uuid, boolean, text) to service_role;

-- Remove direct authenticated access to provider pricing, provider evidence, and
-- internal financial telemetry. Service-role execution paths retain their access.
drop policy if exists external_cost_observations_workspace_viewer on tongs.external_cost_observations;
drop policy if exists ai_pricing_revisions_read_authenticated on tongs.ai_pricing_policy_revisions;
drop policy if exists ai_pricing_rate_components_read_authenticated on tongs.ai_pricing_rate_components;
drop policy if exists ai_media_authorization_revisions_read on tongs.ai_media_authorization_policy_revisions;
drop policy if exists ai_image_output_schedules_read on tongs.ai_image_output_token_schedules;
drop policy if exists ai_credit_quotes_read_self on tongs.ai_credit_quotes;
drop policy if exists ai_credit_quote_usage_components_read_self on tongs.ai_credit_quote_usage_components;
drop policy if exists paid_media_operations_read_self on tongs.paid_media_operations;
drop policy if exists paid_media_events_read_self on tongs.paid_media_operation_events;
drop policy if exists paid_media_attempts_read_self on tongs.paid_media_provider_attempts;
drop policy if exists paid_media_usage_read_self on tongs.paid_media_actual_usage_components;
drop policy if exists paid_media_overages_read_self on tongs.paid_media_pricing_overages;
drop policy if exists ai_credit_reservations_read_self on tongs.ai_credit_reservations;
drop policy if exists ai_credit_reservation_events_read_self on tongs.ai_credit_reservation_events;
drop policy if exists ai_credit_corrections_read_self on tongs.ai_credit_corrections;
drop policy if exists ai_credit_unfunded_expenses_read_self on tongs.ai_credit_unfunded_expenses;
drop policy if exists ai_usage_events_select_own on tongs.ai_usage_events;
drop policy if exists ai_usage_ledger_select_if_self_or_org_admin on tongs.ai_usage_ledger;

revoke select on
  tongs.external_cost_observations,
  tongs.ai_pricing_policies,
  tongs.ai_pricing_policy_revisions,
  tongs.ai_pricing_policy_sequences,
  tongs.ai_pricing_rate_components,
  tongs.ai_media_authorization_policies,
  tongs.ai_media_authorization_policy_revisions,
  tongs.ai_media_authorization_policy_sequences,
  tongs.ai_image_output_token_schedules,
  tongs.ai_credit_quotes,
  tongs.ai_credit_quote_usage_components,
  tongs.ai_credit_reservations,
  tongs.ai_credit_reservation_events,
  tongs.ai_credit_corrections,
  tongs.ai_credit_unfunded_expenses,
  tongs.paid_media_operations,
  tongs.paid_media_operation_events,
  tongs.paid_media_provider_attempts,
  tongs.paid_media_actual_usage_components,
  tongs.paid_media_pricing_overages,
  tongs.ai_usage_events,
  tongs.ai_usage_ledger
from authenticated;

revoke all on function tongs.read_workspace_cost_ledger(uuid, timestamptz, timestamptz) from authenticated;
revoke all on function tongs.read_active_ai_pricing_policies() from authenticated;
revoke all on function tongs.read_ai_pricing_policy(uuid) from authenticated;
revoke all on function tongs.resolve_active_compound_ai_pricing_policy(text, text, text, text, text, text, text, timestamptz) from authenticated;
revoke all on function tongs.read_my_ai_credit_quote(uuid) from authenticated;
revoke all on function tongs.read_my_ai_credit_quote_v2(uuid) from authenticated;
revoke all on function tongs.read_my_ai_credit_reservation(uuid) from authenticated;
revoke all on function tongs.read_my_paid_media_operation(uuid) from authenticated;
revoke all on function tongs.create_paid_media_authorization_quote(uuid, uuid, text, text, uuid, uuid, text, uuid, text, text, text, text, jsonb, jsonb, text, timestamptz, timestamptz, uuid, uuid) from public, anon, authenticated;
grant execute on function tongs.create_paid_media_authorization_quote(uuid, uuid, text, text, uuid, uuid, text, uuid, text, text, text, text, jsonb, jsonb, text, timestamptz, timestamptz, uuid, uuid) to service_role;
revoke all on function tongs.resolve_ai_policy(uuid, uuid, uuid, text, text, text, tongs.ai_mode, boolean, boolean, tongs.ai_funding_source, numeric, text, text, text, boolean) from public, anon, authenticated;
grant execute on function tongs.resolve_ai_policy(uuid, uuid, uuid, text, text, text, tongs.ai_mode, boolean, boolean, tongs.ai_funding_source, numeric, text, text, text, boolean) to service_role;
revoke all on function tongs.resolve_ai_policy_legacy(uuid, uuid, uuid, text, text, text, tongs.ai_mode, boolean, boolean, tongs.ai_funding_source, numeric, text, text, text, boolean) from public, anon, authenticated;
grant execute on function tongs.resolve_ai_policy_legacy(uuid, uuid, uuid, text, text, text, tongs.ai_mode, boolean, boolean, tongs.ai_funding_source, numeric, text, text, text, boolean) to service_role;
revoke all on function tongs._ai_pricing_gcd(numeric, numeric) from public, anon, authenticated;
revoke all on function tongs._ai_pricing_ceil_fraction(numeric, numeric) from public, anon, authenticated;
grant execute on function tongs._ai_pricing_gcd(numeric, numeric) to service_role;
grant execute on function tongs._ai_pricing_ceil_fraction(numeric, numeric) to service_role;
revoke all on function tongs.admin_get_ai_usage_overview(uuid) from authenticated;
revoke all on function tongs.admin_list_ai_usage_events(uuid, uuid, integer) from authenticated;
revoke all on function tongs.admin_get_ai_usage_overview_window(uuid, integer) from authenticated;
revoke all on function tongs.admin_get_ai_usage_export_rows(uuid, integer, integer) from authenticated;
revoke all on function tongs.admin_get_user_ai_inspection(uuid, uuid, uuid) from authenticated;

-- Retain the legacy cost-ledger implementation as a service-only primitive and
-- require an operator check when it is reached through the owner audit wrapper.
create or replace function tongs.read_workspace_cost_ledger(
  p_workspace_id uuid,
  p_from timestamptz,
  p_to timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_components jsonb;
  v_fly_count bigint;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and not tongs.is_platform_operator(auth.uid()) then
    raise exception 'platform operator authority required' using errcode = '42501';
  end if;
  if p_workspace_id is null or p_from is null or p_to is null or p_to <= p_from then
    raise exception 'invalid ledger scope or time range' using errcode = '22023';
  end if;

  with component_rows as (
    select e.created_at as incurred_at, 'ai_request'::text as category, e.feature, e.subfeature,
      coalesce(nullif(e.provider, ''), 'unknown') as provider,
      coalesce(nullif(e.effective_ai_key_source, ''), nullif(e.key_source, ''),
        case when e.lane = 'byo' then 'user_byo' else 'forge_managed' end) as key_source,
      case when coalesce(nullif(e.effective_ai_key_source, ''), nullif(e.key_source, ''), '') in ('user_byo', 'byo')
        then 'customer_provider_account' else 'forge' end as payer,
      'pricing_estimate'::text as cost_basis,
      coalesce(e.estimated_cost_usd, e.actual_cost_usd, 0)::numeric as cost_usd,
      e.workpiece_id
    from tongs.ai_usage_events e
    where e.workspace_id = p_workspace_id and e.status = 'success'
      and e.created_at >= p_from and e.created_at < p_to

    union all

    select coalesce(a.completed_at, a.created_at), 'paid_media'::text, o.originating_tool, o.media_kind,
      coalesce(nullif(a.provider, ''), nullif(o.provider, ''), 'unknown'),
      o.credential_source, o.payer, 'provider_usage_actual'::text,
      usage_totals.cost_usd, o.workpiece_id
    from tongs.paid_media_provider_attempts a
    join tongs.paid_media_operations o on o.id = a.paid_media_operation_id
    join lateral (
      select (sum(u.expense_numerator / u.expense_denominator) / 1000000)::numeric as cost_usd
      from tongs.paid_media_actual_usage_components u
      where u.provider_attempt_id = a.id
    ) usage_totals on usage_totals.cost_usd is not null
    where o.workspace_id = p_workspace_id
      and coalesce(a.completed_at, a.created_at) >= p_from
      and coalesce(a.completed_at, a.created_at) < p_to

    union all

    select x.incurred_at, 'infrastructure'::text, x.service, null::text, x.provider,
      'external_billing'::text, x.payer, x.cost_basis, x.amount_usd::numeric, x.workpiece_id
    from tongs.external_cost_observations x
    where x.workspace_id = p_workspace_id
      and x.incurred_at >= p_from and x.incurred_at < p_to
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'incurred_at', incurred_at, 'category', category, 'feature', feature,
    'subfeature', subfeature, 'provider', provider, 'key_source', key_source,
    'payer', payer, 'cost_basis', cost_basis, 'cost_usd', cost_usd,
    'workpiece_id', workpiece_id
  ) order by incurred_at desc), '[]'::jsonb)
  into v_components from component_rows where cost_usd > 0;

  select count(*) into v_fly_count
  from tongs.external_cost_observations x
  where x.workspace_id = p_workspace_id
    and lower(x.provider) in ('fly', 'fly.io', 'fly_io')
    and x.incurred_at >= p_from and x.incurred_at < p_to;

  return jsonb_build_object(
    'contract_version', 'forge.owner-workspace-cost-audit.v1',
    'workspace_id', p_workspace_id, 'from', p_from, 'to', p_to,
    'components', v_components,
    'coverage', jsonb_build_object(
      'ai_requests', jsonb_build_object('state', 'estimated'),
      'paid_media', jsonb_build_object('state', 'provider_usage_actual'),
      'fly_io', jsonb_build_object('state', case when v_fly_count > 0 then 'invoice_actual' else 'unavailable' end)
    )
  );
end;
$$;

revoke all on function tongs.read_workspace_cost_ledger(uuid, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function tongs.read_workspace_cost_ledger(uuid, timestamptz, timestamptz) to service_role;

create or replace function tongs.read_owner_workspace_cost_audit(
  p_workspace_id uuid,
  p_from timestamptz,
  p_to timestamptz
) returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and not tongs.is_platform_operator(auth.uid()) then
    raise exception 'platform operator authority required' using errcode = '42501';
  end if;
  return tongs.read_workspace_cost_ledger(p_workspace_id, p_from, p_to);
end;
$$;

revoke all on function tongs.read_owner_workspace_cost_audit(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function tongs.read_owner_workspace_cost_audit(uuid, timestamptz, timestamptz) to authenticated, service_role;

-- Customer-safe workspace ledger. It intentionally contains accepted customer
-- ceilings and settled customer debits, never provider costs or pricing inputs.
create or replace function tongs.read_workspace_billing_ledger(
  p_workspace_id uuid,
  p_from timestamptz,
  p_to timestamptz
) returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_operations jsonb;
  v_balance bigint;
begin
  if auth.uid() is null or not tongs.has_workspace_role(p_workspace_id, 'viewer') then
    raise exception 'workspace viewer authority required' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to <= p_from then
    raise exception 'invalid ledger time range' using errcode = '22023';
  end if;

  select c.token_balance into v_balance
  from tongs.ai_credits c
  where c.user_id = auth.uid();

  select coalesce(jsonb_agg(jsonb_build_object(
    'operation_id', o.operation_id,
    'occurred_at', o.created_at,
    'state', o.state,
    'tool', o.originating_tool,
    'media_kind', o.media_kind,
    'provider', o.provider,
    'payment_source', case
      when o.payer = 'customer_provider_account' then 'provider_byo'
      when o.payer = 'forge' then 'forge_funded'
      else 'unknown'
    end,
    'maximum_customer_charge_credits', o.authorized_customer_ceiling,
    'settled_customer_charge_credits', case
      when o.state = 'settled' then coalesce((o.terminal_receipt_json->>'settled_customer_charge')::bigint, 0)
      else null
    end,
    'workpiece_id', o.workpiece_id
  ) order by o.created_at desc), '[]'::jsonb)
  into v_operations
  from tongs.paid_media_operations o
  where o.workspace_id = p_workspace_id
    and o.created_at >= p_from and o.created_at < p_to;

  return jsonb_build_object(
    'contract_version', 'forge.workspace-billing-ledger.v1',
    'workspace_id', p_workspace_id,
    'from', p_from,
    'to', p_to,
    'current_user_credit_balance', coalesce(v_balance, 0),
    'operations', v_operations,
    'coverage', jsonb_build_object(
      'paid_media', 'customer_charge_receipts',
      'legacy_ai_activity', 'unavailable_until_workspace_scoped_accounting'
    )
  );
end;
$$;

revoke all on function tongs.read_workspace_billing_ledger(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function tongs.read_workspace_billing_ledger(uuid, timestamptz, timestamptz) to authenticated, service_role;

-- The legacy policy resolver needs wholesale spend to enforce its caps. Keep
-- that evidence in the owner-only ledger while returning only the access
-- decision and non-financial policy context to customer callers.
create or replace function tongs.resolve_ai_access_policy(
  p_org_id uuid,
  p_workspace_id uuid,
  p_user_id uuid,
  p_tool text,
  p_feature text default null,
  p_action text default null,
  p_requested_mode tongs.ai_mode default null,
  p_personal_ai_configured boolean default false,
  p_org_ai_available boolean default true,
  p_requested_funding_source tongs.ai_funding_source default null,
  p_estimated_cost_usd numeric default null,
  p_provider text default null,
  p_model text default null,
  p_request_id text default null,
  p_write_ledger boolean default true
) returns table (
  decision_type tongs.ai_decision_type,
  reason_code text,
  selected_funding_source tongs.ai_funding_source,
  fallback_available boolean,
  fallback_used boolean,
  effective_policy_snapshot jsonb
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' and auth.uid() is distinct from p_user_id then
    raise exception 'policy may only be resolved for the current user' using errcode = '42501';
  end if;
  if coalesce(auth.role(), '') <> 'service_role'
     and p_org_id is not null
     and not exists (
       select 1 from tongs.org_members membership
       where membership.org_id = p_org_id and membership.user_id = auth.uid()
     ) then
    raise exception 'organization membership required' using errcode = '42501';
  end if;
  if coalesce(auth.role(), '') <> 'service_role'
     and p_workspace_id is not null
     and not tongs.has_workspace_role(p_workspace_id, 'viewer') then
    raise exception 'workspace viewer authority required' using errcode = '42501';
  end if;

  return query
  select resolved.decision_type,
    resolved.reason_code,
    resolved.selected_funding_source,
    resolved.fallback_available,
    resolved.fallback_used,
    coalesce(resolved.effective_policy_snapshot, '{}'::jsonb) - 'caps'
  from tongs.resolve_ai_policy(
    p_org_id,
    p_workspace_id,
    p_user_id,
    p_tool,
    p_feature,
    p_action,
    p_requested_mode,
    p_personal_ai_configured,
    p_org_ai_available,
    p_requested_funding_source,
    p_estimated_cost_usd,
    p_provider,
    p_model,
    p_request_id,
    p_write_ledger
  ) resolved;
end;
$$;

revoke all on function tongs.resolve_ai_access_policy(uuid, uuid, uuid, text, text, text, tongs.ai_mode, boolean, boolean, tongs.ai_funding_source, numeric, text, text, text, boolean) from public, anon;
grant execute on function tongs.resolve_ai_access_policy(uuid, uuid, uuid, text, text, text, tongs.ai_mode, boolean, boolean, tongs.ai_funding_source, numeric, text, text, text, boolean) to authenticated, service_role;

-- Cost-free organization-admin usage contracts. These expose activity and
-- customer-facing billable units, never provider estimates or actual costs.
create or replace function tongs.admin_get_ai_activity_overview(
  p_org_id uuid
) returns table (
  total_usage_today bigint,
  total_billable_tokens_today bigint,
  usage_by_feature jsonb,
  usage_by_lane jsonb
)
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_today_start timestamptz := date_trunc('day', now());
begin
  perform tongs.assert_org_role(p_org_id, 'admin');
  return query
  with base as (
    select e.* from tongs.ai_usage_events e
    join tongs.workspaces w on w.id = e.workspace_id
    where w.org_id = p_org_id and e.created_at >= v_today_start
  ), feature_rollup as (
    select b.feature, b.subfeature, count(*)::bigint as call_count,
      coalesce(sum(b.billable_tokens), 0)::bigint as total_billable_tokens
    from base b group by b.feature, b.subfeature
  ), lane_rollup as (
    select coalesce(nullif(btrim(coalesce(b.effective_billing_lane, b.lane, '')), ''), 'unknown') as lane,
      count(*)::bigint as call_count,
      coalesce(sum(b.billable_tokens), 0)::bigint as total_billable_tokens
    from base b group by coalesce(nullif(btrim(coalesce(b.effective_billing_lane, b.lane, '')), ''), 'unknown')
  )
  select count(*)::bigint,
    coalesce(sum(b.billable_tokens), 0)::bigint,
    coalesce((select jsonb_agg(jsonb_build_object(
      'feature', f.feature, 'subfeature', f.subfeature, 'call_count', f.call_count,
      'total_billable_tokens', f.total_billable_tokens
    ) order by f.call_count desc, f.feature asc) from feature_rollup f), '[]'::jsonb),
    coalesce((select jsonb_agg(jsonb_build_object(
      'lane', l.lane, 'call_count', l.call_count,
      'total_billable_tokens', l.total_billable_tokens
    ) order by l.call_count desc, l.lane asc) from lane_rollup l), '[]'::jsonb)
  from base b;
end;
$$;

create or replace function tongs.admin_get_ai_activity_overview_window(
  p_org_id uuid,
  p_days integer default 1
) returns table (
  total_usage bigint,
  total_billable_tokens bigint,
  usage_by_feature jsonb,
  usage_by_lane jsonb
)
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_days integer := least(greatest(coalesce(p_days, 1), 1), 31);
  v_window_start timestamptz := date_trunc('day', now()) - make_interval(days => (v_days - 1));
begin
  perform tongs.assert_org_role(p_org_id, 'admin');
  return query
  with base as (
    select e.* from tongs.ai_usage_events e
    join tongs.workspaces w on w.id = e.workspace_id
    where w.org_id = p_org_id and e.created_at >= v_window_start
  ), feature_rollup as (
    select b.feature, b.subfeature, count(*)::bigint as call_count,
      coalesce(sum(b.billable_tokens), 0)::bigint as total_billable_tokens
    from base b group by b.feature, b.subfeature
  ), lane_rollup as (
    select coalesce(nullif(btrim(coalesce(b.effective_billing_lane, b.lane, '')), ''), 'unknown') as lane,
      count(*)::bigint as call_count,
      coalesce(sum(b.billable_tokens), 0)::bigint as total_billable_tokens
    from base b group by coalesce(nullif(btrim(coalesce(b.effective_billing_lane, b.lane, '')), ''), 'unknown')
  )
  select count(*)::bigint,
    coalesce(sum(b.billable_tokens), 0)::bigint,
    coalesce((select jsonb_agg(jsonb_build_object(
      'feature', f.feature, 'subfeature', f.subfeature, 'call_count', f.call_count,
      'total_billable_tokens', f.total_billable_tokens
    ) order by f.call_count desc, f.feature asc) from feature_rollup f), '[]'::jsonb),
    coalesce((select jsonb_agg(jsonb_build_object(
      'lane', l.lane, 'call_count', l.call_count,
      'total_billable_tokens', l.total_billable_tokens
    ) order by l.call_count desc, l.lane asc) from lane_rollup l), '[]'::jsonb)
  from base b;
end;
$$;

create or replace function tongs.admin_list_ai_activity_events(
  p_org_id uuid,
  p_user_id uuid default null,
  p_limit integer default 40
) returns table (
  created_at timestamptz,
  user_id uuid,
  workspace_id uuid,
  feature text,
  subfeature text,
  lane text,
  status text,
  billable_tokens integer,
  model text,
  provider text,
  action_id text,
  effective_ai_key_source text,
  effective_billing_lane text,
  policy_decision_type text,
  key_resolution_status text
)
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 40), 1), 200);
begin
  perform tongs.assert_org_role(p_org_id, 'admin');
  return query
  select e.created_at, e.user_id, e.workspace_id, e.feature, e.subfeature,
    e.lane, e.status, e.billable_tokens, e.model, e.provider, e.action_id,
    e.effective_ai_key_source, e.effective_billing_lane,
    e.policy_decision_type, e.key_resolution_status
  from tongs.ai_usage_events e
  join tongs.workspaces w on w.id = e.workspace_id
  where w.org_id = p_org_id and (p_user_id is null or e.user_id = p_user_id)
  order by e.created_at desc limit v_limit;
end;
$$;

create or replace function tongs.admin_get_ai_activity_export_rows(
  p_org_id uuid,
  p_days integer default 1,
  p_limit integer default 5000
) returns table (
  created_at timestamptz,
  user_id uuid,
  workspace_id uuid,
  feature text,
  subfeature text,
  lane text,
  status text,
  billable_tokens integer,
  model text,
  provider text,
  action_id text,
  effective_ai_key_source text,
  effective_billing_lane text,
  policy_decision_type text,
  key_resolution_status text
)
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_days integer := least(greatest(coalesce(p_days, 1), 1), 31);
  v_limit integer := least(greatest(coalesce(p_limit, 5000), 1), 20000);
  v_window_start timestamptz := date_trunc('day', now()) - make_interval(days => (v_days - 1));
begin
  perform tongs.assert_org_role(p_org_id, 'admin');
  return query
  select e.created_at, e.user_id, e.workspace_id, e.feature, e.subfeature,
    e.lane, e.status, e.billable_tokens, e.model, e.provider, e.action_id,
    e.effective_ai_key_source, e.effective_billing_lane,
    e.policy_decision_type, e.key_resolution_status
  from tongs.ai_usage_events e
  join tongs.workspaces w on w.id = e.workspace_id
  where w.org_id = p_org_id and e.created_at >= v_window_start
  order by e.created_at desc limit v_limit;
end;
$$;

create or replace function tongs.admin_get_user_ai_access_inspection(
  p_org_id uuid,
  p_target_user_id uuid,
  p_workspace_id uuid default null
) returns table (
  target_user_id uuid,
  profile_tier text,
  active_plan_code text,
  founders_club_flag boolean,
  is_founder_entitled boolean,
  is_studio_entitled boolean,
  org_toolbox_allowed boolean,
  org_role text,
  workspace_role text,
  org_policy_default_mode tongs.ai_mode,
  org_shared_ai_enabled boolean,
  org_member_byo_allowed boolean,
  member_mode_override tongs.ai_mode,
  member_allow_heavy_tasks boolean,
  byo_configured boolean,
  byo_provider text,
  policy_decision_type tongs.ai_decision_type,
  policy_reason_code text,
  selected_funding_source tongs.ai_funding_source,
  effective_ai_key_source text,
  fallback_available boolean,
  fallback_used boolean
)
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select inspection.target_user_id, inspection.profile_tier, inspection.active_plan_code,
    inspection.founders_club_flag, inspection.is_founder_entitled, inspection.is_studio_entitled,
    inspection.org_toolbox_allowed, inspection.org_role, inspection.workspace_role,
    inspection.org_policy_default_mode, inspection.org_shared_ai_enabled,
    inspection.org_member_byo_allowed, inspection.member_mode_override,
    inspection.member_allow_heavy_tasks, inspection.byo_configured, inspection.byo_provider,
    inspection.policy_decision_type, inspection.policy_reason_code,
    inspection.selected_funding_source, inspection.effective_ai_key_source,
    inspection.fallback_available, inspection.fallback_used
  from tongs.admin_get_user_ai_inspection(p_org_id, p_target_user_id, p_workspace_id) inspection;
$$;

revoke all on function tongs.admin_get_ai_activity_overview(uuid) from public, anon;
revoke all on function tongs.admin_get_ai_activity_overview_window(uuid, integer) from public, anon;
revoke all on function tongs.admin_list_ai_activity_events(uuid, uuid, integer) from public, anon;
revoke all on function tongs.admin_get_ai_activity_export_rows(uuid, integer, integer) from public, anon;
revoke all on function tongs.admin_get_user_ai_access_inspection(uuid, uuid, uuid) from public, anon;
grant execute on function tongs.admin_get_ai_activity_overview(uuid) to authenticated, service_role;
grant execute on function tongs.admin_get_ai_activity_overview_window(uuid, integer) to authenticated, service_role;
grant execute on function tongs.admin_list_ai_activity_events(uuid, uuid, integer) to authenticated, service_role;
grant execute on function tongs.admin_get_ai_activity_export_rows(uuid, integer, integer) to authenticated, service_role;
grant execute on function tongs.admin_get_user_ai_access_inspection(uuid, uuid, uuid) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
