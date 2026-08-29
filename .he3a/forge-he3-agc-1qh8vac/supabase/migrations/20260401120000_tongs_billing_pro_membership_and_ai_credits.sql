-- Forge billing model update:
-- - Add Pro plan to entitlement mapping
-- - Enforce membership-required AI access (including BYO lane)
-- - Add included monthly base credits per active plan cycle
-- - Move storage add-ons to stackable entitlement accounting
-- - Keep image-generation billing excluded from Forge credit funding

begin;

create or replace function tongs.billing_item_is_plan(
  p_item_id text
)
returns boolean
language sql
immutable
as $$
  select coalesce(lower(btrim(p_item_id)), '') in ('creator', 'pro', 'studio');
$$;

create or replace function tongs.billing_storage_entitlement_active(
  p_status text,
  p_current_period_end timestamptz
)
returns boolean
language sql
stable
as $$
  select (
    coalesce(lower(btrim(p_status)), '') in ('active', 'trialing')
    and coalesce(p_current_period_end > now(), true)
  )
  or (
    coalesce(lower(btrim(p_status)), '') in ('past_due', 'unpaid')
    and coalesce(p_current_period_end > now(), false)
  );
$$;

create or replace function tongs.billing_storage_entitled_bytes(
  p_item_id text
)
returns bigint
language sql
immutable
as $$
  select case coalesce(lower(btrim(p_item_id)), '')
    -- Legacy ladder values (kept for existing subscriptions)
    when '50gb' then 268435456000::bigint
    when '100gb' then 1099511627776::bigint
    when '1tb' then 5497558138880::bigint
    -- New stackable ladder values
    when '50gb_v2' then 53687091200::bigint
    when '150gb' then 161061273600::bigint
    when '500gb' then 536870912000::bigint
    else 0::bigint
  end;
$$;

create or replace function tongs.recompute_account_balance(
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = tongs, public
as $$
declare
  v_customer_id text;
  v_plan_item_id text;
  v_plan_interval text;
  v_plan_status text;
  v_plan_current_period_end timestamptz;
  v_plan_entitled boolean := false;
  v_storage_item_id text;
  v_storage_status text;
  v_storage_current_period_end timestamptz;
  v_storage_bytes_entitled bigint := 0;
  v_ai_credit_balance bigint := 0;
begin
  if p_user_id is null then
    raise exception 'p_user_id required'
      using errcode = '22023';
  end if;

  select c.stripe_customer_id
  into v_customer_id
  from tongs.billing_customers c
  where c.user_id = p_user_id;

  select
    s.item_id,
    s.interval,
    s.status,
    s.current_period_end
  into
    v_plan_item_id,
    v_plan_interval,
    v_plan_status,
    v_plan_current_period_end
  from tongs.billing_subscriptions s
  where s.user_id = p_user_id
    and s.purchase_type = 'subscription'
    and tongs.billing_item_is_plan(s.item_id)
  order by
    case when tongs.billing_status_entitles_access(s.status) then 0 else 1 end,
    s.current_period_end desc nulls last,
    s.updated_at desc
  limit 1;

  v_plan_entitled := tongs.billing_status_entitles_access(v_plan_status);

  -- Keep one representative storage row for status/period display.
  select
    s.item_id,
    s.status,
    s.current_period_end
  into
    v_storage_item_id,
    v_storage_status,
    v_storage_current_period_end
  from tongs.billing_subscriptions s
  where s.user_id = p_user_id
    and s.purchase_type = 'cloud_storage'
  order by
    case when tongs.billing_storage_entitlement_active(s.status, s.current_period_end) then 0 else 1 end,
    s.current_period_end desc nulls last,
    s.updated_at desc
  limit 1;

  -- Recurring storage requires both status and valid paid-through period.
  -- Status-only checks can over-grant when Stripe/webhook status updates lag.
  select coalesce(sum(tongs.billing_storage_entitled_bytes(s.item_id)), 0)
  into v_storage_bytes_entitled
  from tongs.billing_subscriptions s
  where s.user_id = p_user_id
    and s.purchase_type = 'cloud_storage'
    and tongs.billing_storage_entitlement_active(s.status, s.current_period_end);

  select c.token_balance
  into v_ai_credit_balance
  from tongs.ai_credits c
  where c.user_id = p_user_id;

  v_ai_credit_balance := coalesce(v_ai_credit_balance, 0);

  insert into tongs.account_balances (
    user_id,
    stripe_customer_id,
    plan_item_id,
    plan_interval,
    plan_status,
    plan_current_period_end,
    plan_entitled,
    storage_item_id,
    storage_status,
    storage_current_period_end,
    storage_bytes_entitled,
    ai_credit_balance
  )
  values (
    p_user_id,
    v_customer_id,
    v_plan_item_id,
    v_plan_interval,
    v_plan_status,
    v_plan_current_period_end,
    coalesce(v_plan_entitled, false),
    v_storage_item_id,
    v_storage_status,
    v_storage_current_period_end,
    coalesce(v_storage_bytes_entitled, 0),
    v_ai_credit_balance
  )
  on conflict (user_id) do update
  set
    stripe_customer_id = excluded.stripe_customer_id,
    plan_item_id = excluded.plan_item_id,
    plan_interval = excluded.plan_interval,
    plan_status = excluded.plan_status,
    plan_current_period_end = excluded.plan_current_period_end,
    plan_entitled = excluded.plan_entitled,
    storage_item_id = excluded.storage_item_id,
    storage_status = excluded.storage_status,
    storage_current_period_end = excluded.storage_current_period_end,
    storage_bytes_entitled = excluded.storage_bytes_entitled,
    ai_credit_balance = excluded.ai_credit_balance,
    updated_at = now();
end;
$$;

create or replace function tongs.upsert_billing_subscription(
  p_user_id uuid,
  p_stripe_customer_id text,
  p_stripe_subscription_id text,
  p_purchase_type text,
  p_item_id text,
  p_interval text,
  p_status text,
  p_price_id text default null,
  p_current_period_start timestamptz default null,
  p_current_period_end timestamptz default null,
  p_cancel_at_period_end boolean default false,
  p_canceled_at timestamptz default null,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = tongs, public
as $$
declare
  v_customer_id text := nullif(btrim(coalesce(p_stripe_customer_id, '')), '');
  v_subscription_id text := nullif(btrim(coalesce(p_stripe_subscription_id, '')), '');
  v_purchase_type text := nullif(lower(btrim(coalesce(p_purchase_type, ''))), '');
  v_item_id text := nullif(lower(btrim(coalesce(p_item_id, ''))), '');
  v_interval text := nullif(lower(btrim(coalesce(p_interval, ''))), '');
  v_status text := nullif(lower(btrim(coalesce(p_status, ''))), '');
  v_price_id text := nullif(btrim(coalesce(p_price_id, '')), '');
  v_metadata jsonb := coalesce(p_metadata, '{}'::jsonb);
begin
  if p_user_id is null then
    raise exception 'p_user_id required'
      using errcode = '22023';
  end if;

  if v_customer_id is null then
    raise exception 'p_stripe_customer_id required'
      using errcode = '22023';
  end if;

  if v_subscription_id is null then
    raise exception 'p_stripe_subscription_id required'
      using errcode = '22023';
  end if;

  if v_purchase_type not in ('subscription', 'cloud_storage') then
    raise exception 'Unsupported subscription purchase_type: %', coalesce(v_purchase_type, 'null')
      using errcode = '22023';
  end if;

  if v_item_id is null then
    raise exception 'p_item_id required'
      using errcode = '22023';
  end if;

  if v_interval is null then
    raise exception 'p_interval required'
      using errcode = '22023';
  end if;

  if v_status is null then
    raise exception 'p_status required'
      using errcode = '22023';
  end if;

  if v_purchase_type = 'subscription' and v_interval not in ('monthly', 'quarterly') then
    raise exception 'Invalid interval for subscription: %', v_interval
      using errcode = '22023';
  end if;

  if v_purchase_type = 'cloud_storage' and v_interval <> 'monthly' then
    raise exception 'Invalid interval for cloud_storage: %', v_interval
      using errcode = '22023';
  end if;

  -- Plan subscriptions remain mutually exclusive by entitled plan.
  if v_purchase_type = 'subscription'
     and tongs.billing_item_is_plan(v_item_id)
     and tongs.billing_status_entitles_access(v_status) then
    update tongs.billing_subscriptions s
    set
      status = 'replaced',
      cancel_at_period_end = true,
      canceled_at = coalesce(s.canceled_at, now()),
      updated_at = now()
    where s.user_id = p_user_id
      and s.purchase_type = 'subscription'
      and tongs.billing_item_is_plan(s.item_id)
      and s.stripe_subscription_id <> v_subscription_id
      and tongs.billing_status_entitles_access(s.status);
  end if;

  insert into tongs.billing_subscriptions (
    stripe_subscription_id,
    user_id,
    stripe_customer_id,
    purchase_type,
    item_id,
    interval,
    status,
    price_id,
    current_period_start,
    current_period_end,
    cancel_at_period_end,
    canceled_at,
    metadata_json
  )
  values (
    v_subscription_id,
    p_user_id,
    v_customer_id,
    v_purchase_type,
    v_item_id,
    v_interval,
    v_status,
    v_price_id,
    p_current_period_start,
    p_current_period_end,
    coalesce(p_cancel_at_period_end, false),
    p_canceled_at,
    v_metadata
  )
  on conflict (stripe_subscription_id) do update
  set
    user_id = excluded.user_id,
    stripe_customer_id = excluded.stripe_customer_id,
    purchase_type = excluded.purchase_type,
    item_id = excluded.item_id,
    interval = excluded.interval,
    status = excluded.status,
    price_id = coalesce(excluded.price_id, tongs.billing_subscriptions.price_id),
    current_period_start = excluded.current_period_start,
    current_period_end = excluded.current_period_end,
    cancel_at_period_end = excluded.cancel_at_period_end,
    canceled_at = excluded.canceled_at,
    metadata_json = tongs.billing_subscriptions.metadata_json || excluded.metadata_json,
    updated_at = now();
end;
$$;

create table if not exists tongs.plan_credit_grants (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  stripe_subscription_id text not null,
  plan_item_id text not null,
  period_start timestamptz not null,
  period_end timestamptz null,
  credits_granted bigint not null check (credits_granted > 0),
  source_event_id text null,
  created_at timestamptz not null default now(),
  unique (stripe_subscription_id, plan_item_id, period_start)
);

create index if not exists plan_credit_grants_user_created_idx
  on tongs.plan_credit_grants (user_id, created_at desc);

alter table tongs.plan_credit_grants enable row level security;

drop policy if exists plan_credit_grants_select_self on tongs.plan_credit_grants;
create policy plan_credit_grants_select_self
on tongs.plan_credit_grants
for select
to authenticated
using (user_id = auth.uid());

create or replace function tongs.plan_included_ai_credits(
  p_plan_item_id text
)
returns bigint
language sql
immutable
as $$
  select case coalesce(lower(btrim(p_plan_item_id)), '')
    when 'creator' then 1000::bigint
    when 'pro' then 4000::bigint
    when 'studio' then 10000::bigint
    else 0::bigint
  end;
$$;

create or replace function tongs.grant_plan_cycle_ai_credits(
  p_user_id uuid,
  p_stripe_subscription_id text,
  p_plan_item_id text,
  p_period_start timestamptz,
  p_period_end timestamptz default null,
  p_source_event_id text default null
)
returns bigint
language plpgsql
security definer
set search_path = tongs, public
as $$
declare
  v_subscription_id text := nullif(btrim(coalesce(p_stripe_subscription_id, '')), '');
  v_plan_item_id text := nullif(lower(btrim(coalesce(p_plan_item_id, ''))), '');
  v_source_event_id text := nullif(btrim(coalesce(p_source_event_id, '')), '');
  v_credits bigint := 0;
begin
  if p_user_id is null then
    raise exception 'p_user_id required'
      using errcode = '22023';
  end if;

  if v_subscription_id is null then
    raise exception 'p_stripe_subscription_id required'
      using errcode = '22023';
  end if;

  if v_plan_item_id is null then
    raise exception 'p_plan_item_id required'
      using errcode = '22023';
  end if;

  if p_period_start is null then
    raise exception 'p_period_start required'
      using errcode = '22023';
  end if;

  v_credits := tongs.plan_included_ai_credits(v_plan_item_id);
  if v_credits <= 0 then
    return 0;
  end if;

  insert into tongs.ai_credits (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  insert into tongs.plan_credit_grants (
    user_id,
    stripe_subscription_id,
    plan_item_id,
    period_start,
    period_end,
    credits_granted,
    source_event_id
  )
  values (
    p_user_id,
    v_subscription_id,
    v_plan_item_id,
    p_period_start,
    p_period_end,
    v_credits,
    v_source_event_id
  )
  on conflict do nothing;

  if not found then
    return 0;
  end if;

  update tongs.ai_credits c
  set
    token_balance = c.token_balance + v_credits,
    updated_at = now()
  where c.user_id = p_user_id;

  return v_credits;
end;
$$;

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
  v_plan_entitled boolean := false;
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

  select
    lower(btrim(coalesce(ab.plan_item_id, ''))),
    coalesce(ab.plan_entitled, false)
  into
    v_plan_code,
    v_plan_entitled
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
    ((v_plan_entitled and v_plan_code = 'studio') or v_profile_tier = 'studio'),
    (
      v_founders
      or (v_plan_entitled and v_plan_code in ('creator', 'pro', 'studio'))
    ),
    v_workspace_role,
    v_org_role,
    jsonb_build_object(
      'profile_tier', v_profile_tier,
      'plan_item_id', v_plan_code,
      'plan_entitled', v_plan_entitled,
      'founder_sources', jsonb_build_object(
        'profile_tier', v_from_profile_founder,
        'public_user_plans', v_from_user_plan_founder,
        'public_account_balances_founders_club', v_from_public_balance_founder
      )
    );
end;
$$;

do $$
begin
  if to_regprocedure(
    'tongs.resolve_ai_policy_legacy(uuid, uuid, uuid, text, text, text, tongs.ai_mode, boolean, boolean, tongs.ai_funding_source, numeric, text, text, text, boolean)'
  ) is null
  and to_regprocedure(
    'tongs.resolve_ai_policy(uuid, uuid, uuid, text, text, text, tongs.ai_mode, boolean, boolean, tongs.ai_funding_source, numeric, text, text, text, boolean)'
  ) is not null then
    alter function tongs.resolve_ai_policy(
      uuid, uuid, uuid, text, text, text, tongs.ai_mode, boolean, boolean, tongs.ai_funding_source, numeric, text, text, text, boolean
    ) rename to resolve_ai_policy_legacy;
  end if;
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
  v_feature_key text := lower(btrim(coalesce(p_feature, '')));
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

  if not coalesce(v_membership.org_toolbox_allowed, false) then
    return query
    select
      'HARD_DENY'::tongs.ai_decision_type,
      'MEMBERSHIP_REQUIRED_STUDIO_OR_FOUNDER'::text,
      null::tongs.ai_funding_source,
      false,
      false,
      jsonb_build_object(
        'membership_required', true,
        'profile_tier', v_membership.profile_tier,
        'active_plan_code', v_membership.active_plan_code,
        'source_meta', v_membership.source_meta
      );
    return;
  end if;

  -- Explicit exclusion: Forge credit funding does not cover image-generation flows.
  if v_feature_key = 'image_generation'
     and p_requested_funding_source in (
       'org_shared_credits'::tongs.ai_funding_source,
       'forge_managed_credits'::tongs.ai_funding_source,
       'personal_credits'::tongs.ai_funding_source
     ) then
    if coalesce(p_personal_ai_configured, false) then
      return query
      select
        'SOFT_DENY'::tongs.ai_decision_type,
        'NO_VALID_FUNDING_SOURCE'::text,
        null::tongs.ai_funding_source,
        true,
        false,
        jsonb_build_object(
          'image_generation_credit_excluded', true,
          'feature', 'image_generation',
          'recommended_funding', 'personal_byo_key'
        );
      return;
    end if;

    return query
    select
      'HARD_DENY'::tongs.ai_decision_type,
      'PERSONAL_AI_REQUIRED_NOT_CONFIGURED'::text,
      null::tongs.ai_funding_source,
      false,
      false,
      jsonb_build_object(
        'image_generation_credit_excluded', true,
        'feature', 'image_generation',
        'requires_personal_byo', true
      );
    return;
  end if;

  return query
  select *
  from tongs.resolve_ai_policy_legacy(
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
  );
end;
$$;

revoke all on tongs.plan_credit_grants from public;
revoke all on function tongs.plan_included_ai_credits(text) from public;
revoke all on function tongs.grant_plan_cycle_ai_credits(uuid, text, text, timestamptz, timestamptz, text) from public;

grant select on tongs.plan_credit_grants to authenticated;
grant all on tongs.plan_credit_grants to service_role;

grant execute on function tongs.plan_included_ai_credits(text) to authenticated;
grant execute on function tongs.plan_included_ai_credits(text) to service_role;
grant execute on function tongs.grant_plan_cycle_ai_credits(uuid, text, text, timestamptz, timestamptz, text) to service_role;

grant execute on function tongs.resolve_membership_entitlement(uuid, uuid, uuid) to authenticated;
grant execute on function tongs.resolve_membership_entitlement(uuid, uuid, uuid) to service_role;
grant execute on function tongs.resolve_ai_policy(uuid, uuid, uuid, text, text, text, tongs.ai_mode, boolean, boolean, tongs.ai_funding_source, numeric, text, text, text, boolean) to authenticated;
grant execute on function tongs.resolve_ai_policy(uuid, uuid, uuid, text, text, text, tongs.ai_mode, boolean, boolean, tongs.ai_funding_source, numeric, text, text, text, boolean) to service_role;

commit;
