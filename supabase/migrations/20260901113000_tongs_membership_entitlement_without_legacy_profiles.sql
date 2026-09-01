-- Keep AI membership resolution valid when the optional legacy public.profiles
-- projection is not installed. Canonical plan entitlement remains in Tongs.
begin;

create or replace function tongs.resolve_membership_entitlement(
  p_user_id uuid,
  p_org_id uuid,
  p_workspace_id uuid default null
)
returns table (
  profile_tier text,
  active_plan_code text,
  founders_club_flag boolean,
  is_founder_entitled boolean,
  is_studio_entitled boolean,
  org_toolbox_allowed boolean,
  workspace_role text,
  org_role text,
  source_meta jsonb
)
language plpgsql
security definer
set search_path = tongs, public
as $$
declare
  v_profile_tier text := 'free';
  v_plan_code text;
  v_plan_entitled boolean := false;
  v_workspace_role text;
  v_org_role text;
  v_from_profile_founder boolean := false;
  v_from_user_plan_founder boolean := false;
  v_from_public_balance_founder boolean := false;
  v_founders boolean := false;
begin
  if p_user_id is null then
    raise exception 'p_user_id required' using errcode = '22023';
  end if;

  if pg_catalog.to_regclass('public.profiles') is not null then
    execute $sql$
      select lower(btrim(btrim(coalesce(p.tier, 'free'), '"')))
      from public.profiles p
      where p.user_id = $1
    $sql$ into v_profile_tier using p_user_id;
    v_profile_tier := coalesce(v_profile_tier, 'free');
  end if;

  select lower(btrim(coalesce(ab.plan_item_id, ''))), coalesce(ab.plan_entitled, false)
  into v_plan_code, v_plan_entitled
  from tongs.account_balances ab
  where ab.user_id = p_user_id;
  if v_plan_code = '' then v_plan_code := null; end if;

  v_from_profile_founder := v_profile_tier in ('founder', 'founders_club', 'founders club', 'founder''s club');

  if pg_catalog.to_regclass('public.user_plans') is not null then
    execute $sql$
      select exists (select 1 from public.user_plans up where up.user_id = $1
        and coalesce(up.is_founder, false) and coalesce(up.status, '') in ('active', 'trialing'))
    $sql$ into v_from_user_plan_founder using p_user_id;
  end if;

  if pg_catalog.to_regclass('public.account_balances') is not null
     and exists (select 1 from information_schema.columns c where c.table_schema = 'public'
       and c.table_name = 'account_balances' and c.column_name = 'founders_club') then
    execute $sql$
      select coalesce(ab.founders_club, false) from public.account_balances ab
      where ab.user_id = $1 limit 1
    $sql$ into v_from_public_balance_founder using p_user_id;
    v_from_public_balance_founder := coalesce(v_from_public_balance_founder, false);
  end if;

  v_founders := v_from_profile_founder or v_from_user_plan_founder or v_from_public_balance_founder;

  if p_workspace_id is not null then
    select case when w.created_by = p_user_id then 'owner' else wm.role end
    into v_workspace_role from tongs.workspaces w
    left join tongs.workspace_members wm on wm.workspace_id = w.id and wm.user_id = p_user_id
    where w.id = p_workspace_id limit 1;
  end if;

  if p_org_id is not null then
    select om.org_role into v_org_role from tongs.org_members om
    where om.org_id = p_org_id and om.user_id = p_user_id limit 1;
  end if;

  return query select
    v_profile_tier, v_plan_code, v_founders, v_founders,
    ((v_plan_entitled and v_plan_code = 'studio') or v_profile_tier = 'studio'),
    (v_founders or (v_plan_entitled and v_plan_code in ('creator', 'pro', 'studio'))),
    v_workspace_role, v_org_role,
    jsonb_build_object('profile_tier', v_profile_tier, 'plan_item_id', v_plan_code,
      'plan_entitled', v_plan_entitled, 'legacy_profile_available', pg_catalog.to_regclass('public.profiles') is not null,
      'founder_sources', jsonb_build_object('profile_tier', v_from_profile_founder,
        'public_user_plans', v_from_user_plan_founder,
        'public_account_balances_founders_club', v_from_public_balance_founder));
end;
$$;

revoke all on function tongs.resolve_membership_entitlement(uuid, uuid, uuid) from public;
grant execute on function tongs.resolve_membership_entitlement(uuid, uuid, uuid) to authenticated;
grant execute on function tongs.resolve_membership_entitlement(uuid, uuid, uuid) to service_role;

commit;
