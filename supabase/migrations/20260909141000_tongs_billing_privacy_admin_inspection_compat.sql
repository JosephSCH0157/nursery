begin;

-- Keep organization-admin inspection customer-safe while avoiding the legacy
-- wholesale inspection function. That function still expects columns removed
-- from user_ai_keys_safe and is intentionally no longer executable by clients.
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
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_org_policy tongs.organization_ai_policy%rowtype;
  v_member_policy tongs.member_ai_policy%rowtype;
  v_membership record;
  v_policy record;
  v_byo_provider text;
begin
  perform tongs.assert_org_role(p_org_id, 'admin');

  if p_target_user_id is null then
    raise exception 'p_target_user_id is required' using errcode = '22023';
  end if;
  if not exists (
    select 1
    from tongs.org_members membership
    where membership.org_id = p_org_id
      and membership.user_id = p_target_user_id
  ) then
    raise exception 'Target user is not a member of this organization'
      using errcode = '42501';
  end if;

  select * into v_org_policy
  from tongs.organization_ai_policy policy
  where policy.org_id = p_org_id;

  select * into v_member_policy
  from tongs.member_ai_policy policy
  where policy.org_id = p_org_id
    and policy.user_id = p_target_user_id;

  select * into v_membership
  from tongs.resolve_membership_entitlement(
    p_target_user_id,
    p_org_id,
    p_workspace_id
  );

  select safe_key.provider into v_byo_provider
  from tongs.user_ai_keys_safe safe_key
  where safe_key.user_id = p_target_user_id
  order by safe_key.updated_at desc
  limit 1;

  select * into v_policy
  from tongs.resolve_ai_access_policy(
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

  return query select
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
    coalesce(v_policy.fallback_used, false);
end;
$$;

revoke all on function tongs.admin_get_user_ai_access_inspection(uuid, uuid, uuid)
  from public, anon;
grant execute on function tongs.admin_get_user_ai_access_inspection(uuid, uuid, uuid)
  to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
