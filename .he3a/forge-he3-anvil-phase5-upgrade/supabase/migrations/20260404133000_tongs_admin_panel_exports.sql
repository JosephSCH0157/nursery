-- Admin panel v1.1: windowed AI overview and CSV export support.
begin;

create or replace function tongs.admin_get_ai_usage_overview_window(
  p_org_id uuid,
  p_days integer default 1
)
returns table (
  total_usage bigint,
  total_estimated_cost numeric,
  total_actual_cost numeric,
  total_billable_tokens bigint,
  usage_by_feature jsonb,
  usage_by_lane jsonb
)
language plpgsql
security definer
set search_path = tongs, public
as $$
declare
  v_days integer := least(greatest(coalesce(p_days, 1), 1), 31);
  v_window_start timestamptz := date_trunc('day', now()) - make_interval(days => (v_days - 1));
begin
  perform tongs.assert_org_role(p_org_id, 'admin');

  return query
  with base as (
    select e.*
    from tongs.ai_usage_events e
    join tongs.workspaces w
      on w.id = e.workspace_id
    where w.org_id = p_org_id
      and e.created_at >= v_window_start
  ),
  feature_rollup as (
    select
      b.feature,
      b.subfeature,
      count(*)::bigint as call_count,
      coalesce(sum(b.estimated_cost_usd), 0)::numeric as total_estimated_cost_usd,
      coalesce(sum(b.actual_cost_usd), 0)::numeric as total_actual_cost_usd,
      coalesce(sum(b.billable_tokens), 0)::bigint as total_billable_tokens
    from base b
    group by b.feature, b.subfeature
  ),
  lane_rollup as (
    select
      coalesce(nullif(btrim(coalesce(b.effective_billing_lane, b.lane, '')), ''), 'unknown') as lane,
      count(*)::bigint as call_count,
      coalesce(sum(b.estimated_cost_usd), 0)::numeric as total_estimated_cost_usd,
      coalesce(sum(b.actual_cost_usd), 0)::numeric as total_actual_cost_usd,
      coalesce(sum(b.billable_tokens), 0)::bigint as total_billable_tokens
    from base b
    group by coalesce(nullif(btrim(coalesce(b.effective_billing_lane, b.lane, '')), ''), 'unknown')
  )
  select
    count(*)::bigint as total_usage,
    coalesce(sum(b.estimated_cost_usd), 0)::numeric as total_estimated_cost,
    coalesce(sum(b.actual_cost_usd), 0)::numeric as total_actual_cost,
    coalesce(sum(b.billable_tokens), 0)::bigint as total_billable_tokens,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'feature', f.feature,
        'subfeature', f.subfeature,
        'call_count', f.call_count,
        'total_estimated_cost_usd', f.total_estimated_cost_usd,
        'total_actual_cost_usd', f.total_actual_cost_usd,
        'total_billable_tokens', f.total_billable_tokens
      ) order by f.total_actual_cost_usd desc, f.call_count desc, f.feature asc)
      from feature_rollup f
    ), '[]'::jsonb) as usage_by_feature,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'lane', l.lane,
        'call_count', l.call_count,
        'total_estimated_cost_usd', l.total_estimated_cost_usd,
        'total_actual_cost_usd', l.total_actual_cost_usd,
        'total_billable_tokens', l.total_billable_tokens
      ) order by l.total_actual_cost_usd desc, l.call_count desc, l.lane asc)
      from lane_rollup l
    ), '[]'::jsonb) as usage_by_lane
  from base b;
end;
$$;

create or replace function tongs.admin_get_ai_usage_export_rows(
  p_org_id uuid,
  p_days integer default 1,
  p_limit integer default 5000
)
returns table (
  created_at timestamptz,
  user_id uuid,
  workspace_id uuid,
  feature text,
  subfeature text,
  lane text,
  status text,
  estimated_cost_usd numeric,
  actual_cost_usd numeric,
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
security definer
set search_path = tongs, public
as $$
declare
  v_days integer := least(greatest(coalesce(p_days, 1), 1), 31);
  v_limit integer := least(greatest(coalesce(p_limit, 5000), 1), 20000);
  v_window_start timestamptz := date_trunc('day', now()) - make_interval(days => (v_days - 1));
begin
  perform tongs.assert_org_role(p_org_id, 'admin');

  return query
  select
    e.created_at,
    e.user_id,
    e.workspace_id,
    e.feature,
    e.subfeature,
    e.lane,
    e.status,
    e.estimated_cost_usd,
    e.actual_cost_usd,
    e.billable_tokens,
    e.model,
    e.provider,
    e.action_id,
    e.effective_ai_key_source,
    e.effective_billing_lane,
    e.policy_decision_type,
    e.key_resolution_status
  from tongs.ai_usage_events e
  join tongs.workspaces w
    on w.id = e.workspace_id
  where w.org_id = p_org_id
    and e.created_at >= v_window_start
  order by e.created_at desc
  limit v_limit;
end;
$$;

revoke all on function tongs.admin_get_ai_usage_overview_window(uuid, integer) from public;
revoke all on function tongs.admin_get_ai_usage_export_rows(uuid, integer, integer) from public;

grant execute on function tongs.admin_get_ai_usage_overview_window(uuid, integer) to authenticated;
grant execute on function tongs.admin_get_ai_usage_overview_window(uuid, integer) to service_role;
grant execute on function tongs.admin_get_ai_usage_export_rows(uuid, integer, integer) to authenticated;
grant execute on function tongs.admin_get_ai_usage_export_rows(uuid, integer, integer) to service_role;

commit;
