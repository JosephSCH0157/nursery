-- Admin panel v1: org-admin scoped AI usage overview + user AI inspection + safe org AI toggle.
begin;

create or replace function tongs.admin_get_ai_usage_overview(
  p_org_id uuid
)
returns table (
  total_usage_today bigint,
  total_estimated_cost_today numeric,
  total_actual_cost_today numeric,
  total_billable_tokens_today bigint,
  usage_by_feature jsonb,
  usage_by_lane jsonb
)
language plpgsql
security definer
set search_path = tongs, public
as $$
declare
  v_today_start timestamptz := date_trunc('day', now());
begin
  perform tongs.assert_org_role(p_org_id, 'admin');

  return query
  with base as (
    select e.*
    from tongs.ai_usage_events e
    join tongs.workspaces w
      on w.id = e.workspace_id
    where w.org_id = p_org_id
      and e.created_at >= v_today_start
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
    count(*)::bigint as total_usage_today,
    coalesce(sum(b.estimated_cost_usd), 0)::numeric as total_estimated_cost_today,
    coalesce(sum(b.actual_cost_usd), 0)::numeric as total_actual_cost_today,
    coalesce(sum(b.billable_tokens), 0)::bigint as total_billable_tokens_today,
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

create or replace function tongs.admin_list_ai_usage_events(
  p_org_id uuid,
  p_user_id uuid default null,
  p_limit integer default 40
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
  v_limit integer := least(greatest(coalesce(p_limit, 40), 1), 200);
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
    and (p_user_id is null or e.user_id = p_user_id)
  order by e.created_at desc
  limit v_limit;
end;
$$;

create or replace function tongs.admin_get_user_ai_inspection(
  p_org_id uuid,
  p_target_user_id uuid,
  p_workspace_id uuid default null
)
returns table (
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
  fallback_used boolean,
  effective_policy_snapshot jsonb
)
language plpgsql
security definer
set search_path = tongs, public
as $$
declare
  v_org_policy tongs.organization_ai_policy%rowtype;
  v_member_policy tongs.member_ai_policy%rowtype;
  v_membership record;
  v_policy record;
  v_byo_provider text := null;
begin
  perform tongs.assert_org_role(p_org_id, 'admin');

  if p_target_user_id is null then
    raise exception 'p_target_user_id is required'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from tongs.org_members om
    where om.org_id = p_org_id
      and om.user_id = p_target_user_id
  ) then
    raise exception 'Target user is not a member of this organization'
      using errcode = '42501';
  end if;

  select *
  into v_org_policy
  from tongs.organization_ai_policy op
  where op.org_id = p_org_id;

  select *
  into v_member_policy
  from tongs.member_ai_policy mp
  where mp.org_id = p_org_id
    and mp.user_id = p_target_user_id;

  select *
  into v_membership
  from tongs.resolve_membership_entitlement(p_target_user_id, p_org_id, p_workspace_id);

  select k.provider
  into v_byo_provider
  from tongs.user_ai_keys_safe k
  where k.user_id = p_target_user_id
    and k.status = 'active'
  order by k.updated_at desc
  limit 1;

  select *
  into v_policy
  from tongs.resolve_ai_policy(
    p_org_id,
    p_workspace_id,
    p_target_user_id,
    'admin',
    'admin_lookup',
    'inspect_user',
    null,
    (v_byo_provider is not null),
    true,
    null,
    null,
    null,
    null,
    null,
    false
  );

  return query
  select
    p_target_user_id,
    v_membership.profile_tier,
    v_membership.active_plan_code,
    coalesce(v_membership.founders_club_flag, false),
    coalesce(v_membership.is_founder_entitled, false),
    coalesce(v_membership.is_studio_entitled, false),
    coalesce(v_membership.org_toolbox_allowed, false),
    v_membership.org_role,
    v_membership.workspace_role,
    coalesce(v_org_policy.default_mode, 'ORG_FIRST_PERSONAL_FALLBACK'::tongs.ai_mode),
    coalesce(v_org_policy.shared_org_ai_enabled, true),
    coalesce(v_org_policy.member_byo_allowed, true),
    v_member_policy.mode_override,
    coalesce(v_member_policy.allow_heavy_tasks, true),
    (v_byo_provider is not null),
    v_byo_provider,
    v_policy.decision_type,
    v_policy.reason_code,
    v_policy.selected_funding_source,
    case
      when v_policy.selected_funding_source = 'personal_byo_key' then 'user_byo'
      when v_policy.selected_funding_source in ('org_byo_key', 'org_shared_credits') then 'org_shared'
      else 'forge_managed'
    end,
    coalesce(v_policy.fallback_available, false),
    coalesce(v_policy.fallback_used, false),
    coalesce(v_policy.effective_policy_snapshot, '{}'::jsonb);
end;
$$;

create or replace function tongs.admin_set_org_shared_ai_enabled(
  p_org_id uuid,
  p_enabled boolean
)
returns table (
  org_id uuid,
  shared_org_ai_enabled boolean,
  default_mode tongs.ai_mode,
  member_byo_allowed boolean
)
language plpgsql
security definer
set search_path = tongs, public
as $$
begin
  perform tongs.assert_org_role(p_org_id, 'admin');

  if p_enabled is null then
    raise exception 'p_enabled is required'
      using errcode = '22023';
  end if;

  insert into tongs.organization_ai_policy (
    org_id,
    shared_org_ai_enabled
  )
  values (
    p_org_id,
    p_enabled
  )
  on conflict (org_id)
  do update set
    shared_org_ai_enabled = excluded.shared_org_ai_enabled,
    updated_at = now();

  return query
  select
    op.org_id,
    op.shared_org_ai_enabled,
    op.default_mode,
    op.member_byo_allowed
  from tongs.organization_ai_policy op
  where op.org_id = p_org_id;
end;
$$;

revoke all on function tongs.admin_get_ai_usage_overview(uuid) from public;
revoke all on function tongs.admin_list_ai_usage_events(uuid, uuid, integer) from public;
revoke all on function tongs.admin_get_user_ai_inspection(uuid, uuid, uuid) from public;
revoke all on function tongs.admin_set_org_shared_ai_enabled(uuid, boolean) from public;

grant execute on function tongs.admin_get_ai_usage_overview(uuid) to authenticated;
grant execute on function tongs.admin_get_ai_usage_overview(uuid) to service_role;
grant execute on function tongs.admin_list_ai_usage_events(uuid, uuid, integer) to authenticated;
grant execute on function tongs.admin_list_ai_usage_events(uuid, uuid, integer) to service_role;
grant execute on function tongs.admin_get_user_ai_inspection(uuid, uuid, uuid) to authenticated;
grant execute on function tongs.admin_get_user_ai_inspection(uuid, uuid, uuid) to service_role;
grant execute on function tongs.admin_set_org_shared_ai_enabled(uuid, boolean) to authenticated;
grant execute on function tongs.admin_set_org_shared_ai_enabled(uuid, boolean) to service_role;

commit;
