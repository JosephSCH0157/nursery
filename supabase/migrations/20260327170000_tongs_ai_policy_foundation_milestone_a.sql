-- Milestone A: Canonical AI policy foundation (contracts, entitlement seam, policy tables, RLS, resolver skeleton).

begin;

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'tongs'
      and t.typname = 'ai_mode'
  ) then
    create type tongs.ai_mode as enum (
      'AI_DISABLED',
      'ORG_ONLY',
      'PERSONAL_ONLY',
      'ORG_FIRST_PERSONAL_FALLBACK'
    );
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'tongs'
      and t.typname = 'ai_decision_type'
  ) then
    create type tongs.ai_decision_type as enum (
      'ALLOW',
      'SOFT_DENY',
      'HARD_DENY'
    );
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'tongs'
      and t.typname = 'ai_funding_source'
  ) then
    create type tongs.ai_funding_source as enum (
      'org_byo_key',
      'org_shared_credits',
      'personal_byo_key',
      'personal_credits',
      'forge_managed_credits'
    );
  end if;
end;
$$;

create table if not exists tongs.organization_ai_policy (
  org_id uuid primary key references tongs.orgs(id) on delete cascade,
  shared_org_ai_enabled boolean not null default true,
  member_byo_allowed boolean not null default true,
  fallback_allowed boolean not null default true,
  default_mode tongs.ai_mode not null default 'ORG_FIRST_PERSONAL_FALLBACK',
  org_monthly_cap_usd numeric(12, 4) null check (org_monthly_cap_usd is null or org_monthly_cap_usd >= 0),
  org_daily_cap_usd numeric(12, 4) null check (org_daily_cap_usd is null or org_daily_cap_usd >= 0),
  feature_flags jsonb not null default jsonb_build_object(
    'heavy_tasks', true,
    'image_generation', true,
    'research_flows', true
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_ai_policy_feature_flags_object
    check (jsonb_typeof(feature_flags) = 'object')
);

create table if not exists tongs.member_ai_policy (
  org_id uuid not null references tongs.orgs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  ai_enabled boolean not null default true,
  mode_override tongs.ai_mode null,
  monthly_cap_usd numeric(12, 4) null check (monthly_cap_usd is null or monthly_cap_usd >= 0),
  daily_cap_usd numeric(12, 4) null check (daily_cap_usd is null or daily_cap_usd >= 0),
  allow_heavy_tasks boolean not null default true,
  allow_image_generation boolean not null default true,
  allow_research_flows boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

create table if not exists tongs.ai_usage_ledger (
  id uuid primary key default gen_random_uuid(),
  org_id uuid null references tongs.orgs(id) on delete set null,
  workspace_id uuid null references tongs.workspaces(id) on delete set null,
  user_id uuid not null references auth.users(id) on delete cascade,
  tool text not null,
  feature text null,
  action text null,
  provider text null,
  model text null,
  funding_source tongs.ai_funding_source null,
  estimated_cost_usd numeric(12, 4) null check (estimated_cost_usd is null or estimated_cost_usd >= 0),
  actual_cost_usd numeric(12, 4) null check (actual_cost_usd is null or actual_cost_usd >= 0),
  decision_type tongs.ai_decision_type not null,
  reason_code text null,
  allowed boolean generated always as (decision_type = 'ALLOW'::tongs.ai_decision_type) stored,
  fallback_available boolean not null default false,
  fallback_used boolean not null default false,
  fallback_from tongs.ai_funding_source null,
  fallback_to tongs.ai_funding_source null,
  request_id text null,
  effective_policy_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint ai_usage_ledger_effective_policy_snapshot_object
    check (jsonb_typeof(effective_policy_snapshot) = 'object')
);

create index if not exists ai_usage_ledger_org_created_idx
  on tongs.ai_usage_ledger (org_id, created_at desc);

create index if not exists ai_usage_ledger_user_created_idx
  on tongs.ai_usage_ledger (user_id, created_at desc);

create index if not exists ai_usage_ledger_workspace_created_idx
  on tongs.ai_usage_ledger (workspace_id, created_at desc);

create index if not exists ai_usage_ledger_request_id_idx
  on tongs.ai_usage_ledger (request_id)
  where request_id is not null;

drop trigger if exists trg_organization_ai_policy_updated_at on tongs.organization_ai_policy;
create trigger trg_organization_ai_policy_updated_at
before update on tongs.organization_ai_policy
for each row execute function tongs.set_updated_at();

drop trigger if exists trg_member_ai_policy_updated_at on tongs.member_ai_policy;
create trigger trg_member_ai_policy_updated_at
before update on tongs.member_ai_policy
for each row execute function tongs.set_updated_at();

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
  v_profile_tier text;
  v_plan_code text;
  v_workspace_role text;
  v_org_role text;
  v_from_profile_founder boolean := false;
  v_from_user_plan_founder boolean := false;
  v_from_public_balance_founder boolean := false;
  v_founders boolean := false;
begin
  if p_user_id is null then
    raise exception 'p_user_id required'
      using errcode = '22023';
  end if;

  select lower(btrim(btrim(coalesce(p.tier, 'free'), '"')))
  into v_profile_tier
  from public.profiles p
  where p.user_id = p_user_id;

  if v_profile_tier is null then
    v_profile_tier := 'free';
  end if;

  select lower(btrim(coalesce(ab.plan_item_id, '')))
  into v_plan_code
  from tongs.account_balances ab
  where ab.user_id = p_user_id;

  if v_plan_code = '' then
    v_plan_code := null;
  end if;

  if v_profile_tier in ('founder', 'founders_club', 'founders club', 'founder''s club') then
    v_from_profile_founder := true;
  end if;

  if pg_catalog.to_regclass('public.user_plans') is not null then
    execute $sql$
      select exists (
        select 1
        from public.user_plans up
        where up.user_id = $1
          and coalesce(up.is_founder, false) = true
          and coalesce(up.status, '') in ('active', 'trialing')
      )
    $sql$
    into v_from_user_plan_founder
    using p_user_id;
  end if;

  if pg_catalog.to_regclass('public.account_balances') is not null
     and exists (
       select 1
       from information_schema.columns c
       where c.table_schema = 'public'
         and c.table_name = 'account_balances'
         and c.column_name = 'founders_club'
     ) then
    execute $sql$
      select coalesce(ab.founders_club, false)
      from public.account_balances ab
      where ab.user_id = $1
      limit 1
    $sql$
    into v_from_public_balance_founder
    using p_user_id;

    v_from_public_balance_founder := coalesce(v_from_public_balance_founder, false);
  end if;

  v_founders := v_from_profile_founder or v_from_user_plan_founder or v_from_public_balance_founder;

  if p_workspace_id is not null then
    select case
      when w.created_by = p_user_id then 'owner'
      else wm.role
    end
    into v_workspace_role
    from tongs.workspaces w
    left join tongs.workspace_members wm
      on wm.workspace_id = w.id
     and wm.user_id = p_user_id
    where w.id = p_workspace_id
    limit 1;
  end if;

  if p_org_id is not null then
    select om.org_role
    into v_org_role
    from tongs.org_members om
    where om.org_id = p_org_id
      and om.user_id = p_user_id
    limit 1;
  end if;

  return query
  select
    v_profile_tier,
    v_plan_code,
    v_founders,
    v_founders,
    (v_plan_code = 'studio' or v_profile_tier = 'studio'),
    (
      v_founders
      or v_plan_code = 'studio'
      or v_profile_tier = 'studio'
    ),
    v_workspace_role,
    v_org_role,
    jsonb_build_object(
      'profile_tier', v_profile_tier,
      'plan_item_id', v_plan_code,
      'founder_sources', jsonb_build_object(
        'profile_tier', v_from_profile_founder,
        'public_user_plans', v_from_user_plan_founder,
        'public_account_balances_founders_club', v_from_public_balance_founder
      )
    );
end;
$$;

create or replace function tongs.resolve_ai_policy(
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
)
returns table (
  decision_type tongs.ai_decision_type,
  reason_code text,
  selected_funding_source tongs.ai_funding_source,
  fallback_available boolean,
  fallback_used boolean,
  effective_policy_snapshot jsonb
)
language plpgsql
security definer
set search_path = tongs, public
as $$
declare
  v_membership record;
  v_org_policy tongs.organization_ai_policy%rowtype;
  v_member_policy tongs.member_ai_policy%rowtype;
  v_resolved_mode tongs.ai_mode := 'ORG_FIRST_PERSONAL_FALLBACK'::tongs.ai_mode;
  v_decision tongs.ai_decision_type;
  v_reason text := null;
  v_selected_funding tongs.ai_funding_source := null;
  v_fallback_available boolean := false;
  v_fallback_used boolean := false;
  v_fallback_from tongs.ai_funding_source := null;
  v_fallback_to tongs.ai_funding_source := null;
  v_effective_snapshot jsonb := '{}'::jsonb;
  v_feature_key text := lower(btrim(coalesce(p_feature, '')));
  v_org_features jsonb := jsonb_build_object(
    'heavy_tasks', true,
    'image_generation', true,
    'research_flows', true
  );
  v_org_monthly_cap numeric := null;
  v_member_monthly_cap numeric := null;
  v_org_usage_month numeric := 0;
  v_member_usage_month numeric := 0;
  v_org_allowed boolean := false;
  v_personal_allowed boolean := false;
  v_mode_from text := 'org_default';
  v_org_fallback_allowed boolean := true;
begin
  if p_user_id is null then
    raise exception 'p_user_id required'
      using errcode = '22023';
  end if;

  if nullif(btrim(coalesce(p_tool, '')), '') is null then
    raise exception 'p_tool required'
      using errcode = '22023';
  end if;

  select *
  into v_membership
  from tongs.resolve_membership_entitlement(p_user_id, p_org_id, p_workspace_id);

  select *
  into v_org_policy
  from tongs.organization_ai_policy op
  where op.org_id = p_org_id;

  select *
  into v_member_policy
  from tongs.member_ai_policy mp
  where mp.org_id = p_org_id
    and mp.user_id = p_user_id;

  if found then
    null;
  end if;

  if v_org_policy.org_id is not null then
    v_resolved_mode := v_org_policy.default_mode;
    v_mode_from := 'org_default';
    v_org_features := coalesce(v_org_policy.feature_flags, v_org_features);
    v_org_monthly_cap := v_org_policy.org_monthly_cap_usd;
    v_org_fallback_allowed := v_org_policy.fallback_allowed;
  end if;

  if v_member_policy.org_id is not null then
    if not v_member_policy.ai_enabled then
      v_resolved_mode := 'AI_DISABLED'::tongs.ai_mode;
      v_mode_from := 'member_ai_enabled_false';
    elsif v_member_policy.mode_override is not null then
      v_resolved_mode := v_member_policy.mode_override;
      v_mode_from := 'member_override';
    end if;

    v_member_monthly_cap := v_member_policy.monthly_cap_usd;
  end if;

  if p_requested_mode is not null then
    v_resolved_mode := p_requested_mode;
    v_mode_from := 'request_override';
  end if;

  v_org_allowed :=
    coalesce(v_org_policy.shared_org_ai_enabled, true)
    and coalesce(p_org_ai_available, true)
    and coalesce(v_membership.org_toolbox_allowed, false);

  v_personal_allowed :=
    coalesce(v_org_policy.member_byo_allowed, true)
    and coalesce(p_personal_ai_configured, false);

  v_fallback_available :=
    (v_resolved_mode = 'ORG_FIRST_PERSONAL_FALLBACK'::tongs.ai_mode)
    and coalesce(v_org_fallback_allowed, true)
    and v_personal_allowed;

  if v_feature_key in ('heavy_tasks', 'image_generation', 'research_flows') then
    if coalesce((v_org_features ->> v_feature_key)::boolean, true) = false then
      v_decision := 'HARD_DENY';
      if v_feature_key = 'heavy_tasks' then
        v_reason := 'FEATURE_DISABLED_HEAVY_TASKS';
      elsif v_feature_key = 'image_generation' then
        v_reason := 'FEATURE_DISABLED_IMAGE';
      else
        v_reason := 'FEATURE_DISABLED_RESEARCH';
      end if;
    elsif v_member_policy.org_id is not null then
      if v_feature_key = 'heavy_tasks' and not v_member_policy.allow_heavy_tasks then
        v_decision := 'HARD_DENY';
        v_reason := 'FEATURE_DISABLED_HEAVY_TASKS';
      elsif v_feature_key = 'image_generation' and not v_member_policy.allow_image_generation then
        v_decision := 'HARD_DENY';
        v_reason := 'FEATURE_DISABLED_IMAGE';
      elsif v_feature_key = 'research_flows' and not v_member_policy.allow_research_flows then
        v_decision := 'HARD_DENY';
        v_reason := 'FEATURE_DISABLED_RESEARCH';
      end if;
    end if;
  end if;

  if v_decision is null then
    if v_resolved_mode = 'AI_DISABLED'::tongs.ai_mode then
      v_decision := 'HARD_DENY';
      v_reason := 'ORG_AI_DISABLED';
    elsif v_resolved_mode = 'ORG_ONLY'::tongs.ai_mode then
      if v_org_allowed then
        v_decision := 'ALLOW';
        v_selected_funding := coalesce(
          case
            when p_requested_funding_source in ('org_byo_key', 'org_shared_credits', 'forge_managed_credits')
              then p_requested_funding_source
            else null
          end,
          'org_shared_credits'::tongs.ai_funding_source
        );
      elsif not coalesce(v_membership.org_toolbox_allowed, false) then
        v_decision := 'HARD_DENY';
        v_reason := 'MEMBERSHIP_REQUIRED_STUDIO_OR_FOUNDER';
      else
        v_decision := 'HARD_DENY';
        v_reason := 'ORG_MEMBER_NOT_AUTHORIZED';
      end if;
    elsif v_resolved_mode = 'PERSONAL_ONLY'::tongs.ai_mode then
      if v_personal_allowed then
        v_decision := 'ALLOW';
        v_selected_funding := coalesce(
          case
            when p_requested_funding_source in ('personal_byo_key', 'personal_credits')
              then p_requested_funding_source
            else null
          end,
          'personal_byo_key'::tongs.ai_funding_source
        );
      else
        v_decision := 'SOFT_DENY';
        v_reason := 'PERSONAL_AI_REQUIRED_NOT_CONFIGURED';
      end if;
    else
      if v_org_allowed then
        v_decision := 'ALLOW';
        v_selected_funding := coalesce(
          case
            when p_requested_funding_source in ('org_byo_key', 'org_shared_credits', 'forge_managed_credits')
              then p_requested_funding_source
            else null
          end,
          'org_shared_credits'::tongs.ai_funding_source
        );
      elsif v_personal_allowed and coalesce(v_org_fallback_allowed, true) then
        v_decision := 'ALLOW';
        v_fallback_used := true;
        v_fallback_from := 'org_shared_credits'::tongs.ai_funding_source;
        v_fallback_to := coalesce(
          case
            when p_requested_funding_source in ('personal_byo_key', 'personal_credits')
              then p_requested_funding_source
            else null
          end,
          'personal_byo_key'::tongs.ai_funding_source
        );
        v_selected_funding := v_fallback_to;
      elsif not coalesce(v_membership.org_toolbox_allowed, false) and not v_personal_allowed then
        v_decision := 'HARD_DENY';
        v_reason := 'MEMBERSHIP_REQUIRED_STUDIO_OR_FOUNDER';
      else
        v_decision := 'SOFT_DENY';
        v_reason := 'NO_VALID_FUNDING_SOURCE';
      end if;
    end if;
  end if;

  if v_decision = 'ALLOW' and v_org_monthly_cap is not null and v_selected_funding in ('org_byo_key', 'org_shared_credits', 'forge_managed_credits') then
    select coalesce(sum(coalesce(l.actual_cost_usd, l.estimated_cost_usd, 0)), 0)
    into v_org_usage_month
    from tongs.ai_usage_ledger l
    where l.org_id = p_org_id
      and l.decision_type = 'ALLOW'
      and l.created_at >= date_trunc('month', now());

    if (v_org_usage_month + coalesce(p_estimated_cost_usd, 0)) > v_org_monthly_cap then
      if v_personal_allowed and v_resolved_mode = 'ORG_FIRST_PERSONAL_FALLBACK'::tongs.ai_mode and coalesce(v_org_fallback_allowed, true) then
        v_fallback_used := true;
        v_fallback_from := v_selected_funding;
        v_fallback_to := coalesce(
          case
            when p_requested_funding_source in ('personal_byo_key', 'personal_credits')
              then p_requested_funding_source
            else null
          end,
          'personal_byo_key'::tongs.ai_funding_source
        );
        v_selected_funding := v_fallback_to;
      else
        v_decision := 'HARD_DENY';
        v_reason := 'ORG_CAP_EXCEEDED';
        v_selected_funding := null;
      end if;
    end if;
  end if;

  if v_decision = 'ALLOW' and v_member_monthly_cap is not null then
    select coalesce(sum(coalesce(l.actual_cost_usd, l.estimated_cost_usd, 0)), 0)
    into v_member_usage_month
    from tongs.ai_usage_ledger l
    where l.user_id = p_user_id
      and l.org_id = p_org_id
      and l.decision_type = 'ALLOW'
      and l.created_at >= date_trunc('month', now());

    if (v_member_usage_month + coalesce(p_estimated_cost_usd, 0)) > v_member_monthly_cap then
      v_decision := 'HARD_DENY';
      v_reason := 'ORG_CAP_EXCEEDED';
      v_selected_funding := null;
    end if;
  end if;

  if v_decision <> 'ALLOW' and v_reason is null then
    v_reason := 'NO_VALID_FUNDING_SOURCE';
  end if;

  v_effective_snapshot := jsonb_build_object(
    'resolved_mode', v_resolved_mode,
    'mode_source', v_mode_from,
    'caps', jsonb_build_object(
      'org_monthly_cap_usd', v_org_monthly_cap,
      'member_monthly_cap_usd', v_member_monthly_cap,
      'org_usage_month_usd', v_org_usage_month,
      'member_usage_month_usd', v_member_usage_month
    ),
    'feature_flags', jsonb_build_object(
      'org', v_org_features,
      'member', jsonb_build_object(
        'allow_heavy_tasks', coalesce(v_member_policy.allow_heavy_tasks, true),
        'allow_image_generation', coalesce(v_member_policy.allow_image_generation, true),
        'allow_research_flows', coalesce(v_member_policy.allow_research_flows, true)
      )
    ),
    'membership_entitlement', jsonb_build_object(
      'profile_tier', v_membership.profile_tier,
      'active_plan_code', v_membership.active_plan_code,
      'founders_club_flag', v_membership.founders_club_flag,
      'is_founder_entitled', v_membership.is_founder_entitled,
      'is_studio_entitled', v_membership.is_studio_entitled,
      'org_toolbox_allowed', v_membership.org_toolbox_allowed,
      'workspace_role', v_membership.workspace_role,
      'org_role', v_membership.org_role,
      'source_meta', v_membership.source_meta
    ),
    'fallback', jsonb_build_object(
      'available', v_fallback_available,
      'used', v_fallback_used,
      'from', v_fallback_from,
      'to', v_fallback_to,
      'org_fallback_allowed', v_org_fallback_allowed
    ),
    'inputs', jsonb_build_object(
      'requested_mode', p_requested_mode,
      'requested_funding_source', p_requested_funding_source,
      'personal_ai_configured', coalesce(p_personal_ai_configured, false),
      'org_ai_available', coalesce(p_org_ai_available, true),
      'tool', btrim(p_tool),
      'feature', nullif(btrim(coalesce(p_feature, '')), ''),
      'action', nullif(btrim(coalesce(p_action, '')), '')
    )
  );

  if coalesce(p_write_ledger, true) then
    insert into tongs.ai_usage_ledger (
      org_id,
      workspace_id,
      user_id,
      tool,
      feature,
      action,
      provider,
      model,
      funding_source,
      estimated_cost_usd,
      actual_cost_usd,
      decision_type,
      reason_code,
      fallback_available,
      fallback_used,
      fallback_from,
      fallback_to,
      request_id,
      effective_policy_snapshot
    )
    values (
      p_org_id,
      p_workspace_id,
      p_user_id,
      btrim(p_tool),
      nullif(btrim(coalesce(p_feature, '')), ''),
      nullif(btrim(coalesce(p_action, '')), ''),
      nullif(btrim(coalesce(p_provider, '')), ''),
      nullif(btrim(coalesce(p_model, '')), ''),
      v_selected_funding,
      p_estimated_cost_usd,
      null,
      v_decision,
      v_reason,
      v_fallback_available,
      v_fallback_used,
      v_fallback_from,
      v_fallback_to,
      nullif(btrim(coalesce(p_request_id, '')), ''),
      v_effective_snapshot
    );
  end if;

  return query
  select
    v_decision,
    v_reason,
    v_selected_funding,
    v_fallback_available,
    v_fallback_used,
    v_effective_snapshot;
end;
$$;

alter table tongs.organization_ai_policy enable row level security;
alter table tongs.member_ai_policy enable row level security;
alter table tongs.ai_usage_ledger enable row level security;

drop policy if exists organization_ai_policy_select_if_org_member on tongs.organization_ai_policy;
create policy organization_ai_policy_select_if_org_member
on tongs.organization_ai_policy
for select
to authenticated
using (
  exists (
    select 1
    from tongs.org_members om
    where om.org_id = tongs.organization_ai_policy.org_id
      and om.user_id = auth.uid()
  )
);

drop policy if exists organization_ai_policy_write_if_org_admin on tongs.organization_ai_policy;
create policy organization_ai_policy_write_if_org_admin
on tongs.organization_ai_policy
for all
to authenticated
using (
  exists (
    select 1
    from tongs.org_members om
    where om.org_id = tongs.organization_ai_policy.org_id
      and om.user_id = auth.uid()
      and om.org_role in ('owner', 'admin')
  )
)
with check (
  exists (
    select 1
    from tongs.org_members om
    where om.org_id = tongs.organization_ai_policy.org_id
      and om.user_id = auth.uid()
      and om.org_role in ('owner', 'admin')
  )
);

drop policy if exists member_ai_policy_select_if_self_or_org_admin on tongs.member_ai_policy;
create policy member_ai_policy_select_if_self_or_org_admin
on tongs.member_ai_policy
for select
to authenticated
using (
  tongs.member_ai_policy.user_id = auth.uid()
  or exists (
    select 1
    from tongs.org_members om
    where om.org_id = tongs.member_ai_policy.org_id
      and om.user_id = auth.uid()
      and om.org_role in ('owner', 'admin')
  )
);

drop policy if exists member_ai_policy_write_if_org_admin on tongs.member_ai_policy;
create policy member_ai_policy_write_if_org_admin
on tongs.member_ai_policy
for all
to authenticated
using (
  exists (
    select 1
    from tongs.org_members om
    where om.org_id = tongs.member_ai_policy.org_id
      and om.user_id = auth.uid()
      and om.org_role in ('owner', 'admin')
  )
)
with check (
  exists (
    select 1
    from tongs.org_members om
    where om.org_id = tongs.member_ai_policy.org_id
      and om.user_id = auth.uid()
      and om.org_role in ('owner', 'admin')
  )
);

drop policy if exists ai_usage_ledger_select_if_self_or_org_admin on tongs.ai_usage_ledger;
create policy ai_usage_ledger_select_if_self_or_org_admin
on tongs.ai_usage_ledger
for select
to authenticated
using (
  tongs.ai_usage_ledger.user_id = auth.uid()
  or exists (
    select 1
    from tongs.org_members om
    where om.org_id = tongs.ai_usage_ledger.org_id
      and om.user_id = auth.uid()
      and om.org_role in ('owner', 'admin')
  )
);

revoke all on tongs.organization_ai_policy from public;
revoke all on tongs.member_ai_policy from public;
revoke all on tongs.ai_usage_ledger from public;

revoke all on function tongs.resolve_membership_entitlement(uuid, uuid, uuid) from public;
revoke all on function tongs.resolve_ai_policy(uuid, uuid, uuid, text, text, text, tongs.ai_mode, boolean, boolean, tongs.ai_funding_source, numeric, text, text, text, boolean) from public;

grant select, insert, update, delete on tongs.organization_ai_policy to authenticated;
grant select, insert, update, delete on tongs.member_ai_policy to authenticated;
grant select on tongs.ai_usage_ledger to authenticated;

grant all on tongs.organization_ai_policy to service_role;
grant all on tongs.member_ai_policy to service_role;
grant all on tongs.ai_usage_ledger to service_role;

grant execute on function tongs.resolve_membership_entitlement(uuid, uuid, uuid) to authenticated;
grant execute on function tongs.resolve_membership_entitlement(uuid, uuid, uuid) to service_role;
grant execute on function tongs.resolve_ai_policy(uuid, uuid, uuid, text, text, text, tongs.ai_mode, boolean, boolean, tongs.ai_funding_source, numeric, text, text, text, boolean) to authenticated;
grant execute on function tongs.resolve_ai_policy(uuid, uuid, uuid, text, text, text, tongs.ai_mode, boolean, boolean, tongs.ai_funding_source, numeric, text, text, text, boolean) to service_role;

commit;
