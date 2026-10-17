-- Customer-funded Hammer transcript-cleanup Test acceptance authority.
--
-- Applying this migration creates no rollout, scope, quote, reservation,
-- provider attempt, or spend authority. A later, explicitly approved
-- service-role call must supply the real customer/workspace/operator IDs and a
-- bounded validity window. That call appends exactly one Test-only scope and
-- the matching append-only rollout revisions.
begin;

-- The runtime reservation trigger already enforces optional finite operation
-- counts and validity windows for normal-customer scopes. Permit those safer
-- finite values while preserving the existing unbounded normal-customer shape.
alter table tongs.customer_paid_execution_scope_authorizations
  drop constraint customer_paid_execution_scope_aut_maximum_operation_count_check,
  drop constraint customer_paid_execution_scope_auth_rolling_window_seconds_check,
  drop constraint customer_paid_execution_scope_authorizations_check;

alter table tongs.customer_paid_execution_scope_authorizations
  add constraint customer_paid_execution_scope_aut_maximum_operation_count_check
    check (
      (authorization_kind in ('certification', 'owner_only') and maximum_operation_count > 0)
      or (authorization_kind = 'normal_customer'
          and (maximum_operation_count is null or maximum_operation_count > 0))
    ),
  add constraint customer_paid_execution_scope_auth_rolling_window_seconds_check
    check (
      (authorization_kind in ('certification', 'owner_only') and rolling_window_seconds > 0)
      or (authorization_kind = 'normal_customer'
          and (rolling_window_seconds is null or rolling_window_seconds > 0))
    ),
  add constraint customer_paid_execution_scope_authorizations_check
    check (
      (authorization_kind in ('certification', 'owner_only') and valid_until > valid_from)
      or (authorization_kind = 'normal_customer'
          and (valid_until is null or valid_until > valid_from))
    );

-- Closing the one-customer acceptance is a separate, independently callable
-- authority. The immutable receipt binds the close request to the exact scope;
-- rollout rows remain the executable authority and all financial evidence stays
-- in its existing canonical tables.
create table tongs.hammer_customer_test_acceptance_closures (
  id uuid primary key,
  authorization_id uuid not null unique
    references tongs.customer_paid_execution_scope_authorizations(id),
  actor_id uuid not null references auth.users(id),
  reason text not null check (length(btrim(reason)) between 8 and 500),
  route_revision integer not null check (route_revision = 5),
  test_loss_revision integer not null check (test_loss_revision = 3),
  closed_at timestamptz not null default clock_timestamp()
);

alter table tongs.hammer_customer_test_acceptance_closures enable row level security;
revoke all on table tongs.hammer_customer_test_acceptance_closures
  from public, anon, authenticated, service_role;
grant select on table tongs.hammer_customer_test_acceptance_closures
  to service_role;

comment on table tongs.hammer_customer_test_acceptance_closures is
  'Immutable service-role receipt for the one bounded Hammer customer Test shutdown. It never settles, releases, or erases financial evidence.';

-- A scope row has remaining admission authority only when the canonical
-- reservation trigger could still select it and both its operation and
-- concurrency limits have capacity. This deliberately does not treat an
-- expired timestamp as the sole proof of inactivity.
create or replace function tongs._hammer_scope_has_remaining_authority(
  p_authorization_id uuid,
  p_at timestamptz default clock_timestamp()
) returns boolean
language sql stable security definer set search_path = pg_catalog as $$
  select exists (
    select 1
    from tongs.customer_paid_execution_scope_authorizations scope_auth
    where scope_auth.id = p_authorization_id
      and scope_auth.route_code = 'hammer.transcript_cleanup'
      and scope_auth.financial_environment = 'test'
      and scope_auth.status = 'active'
      and scope_auth.valid_from <= p_at
      and (scope_auth.valid_until is null or scope_auth.valid_until > p_at)
      and (
        scope_auth.maximum_operation_count is null
        or (select count(*)
            from tongs.funding_reservations reservation
            where reservation.rollout_authorization_id = scope_auth.id)
          < scope_auth.maximum_operation_count
      )
      and (
        select count(*)
        from tongs.funding_reservations reservation
        where reservation.rollout_authorization_id = scope_auth.id
          and tongs._funding_reservation_counts_paid_scope_concurrency(
            reservation.id
          )
      ) < scope_auth.maximum_concurrency
  );
$$;

-- Effective Hammer customer execution additionally requires both append-only
-- rollout controls to be enforcing the exact approved Mini authority.
create or replace function tongs._hammer_scope_is_effective(
  p_authorization_id uuid,
  p_at timestamptz default clock_timestamp()
) returns boolean
language sql stable security definer set search_path = pg_catalog as $$
  select tongs._hammer_scope_has_remaining_authority(p_authorization_id, p_at)
    and exists (
      select 1
      from tongs.customer_paid_execution_scope_authorizations scope_auth
      where scope_auth.id = p_authorization_id
        and scope_auth.authorization_kind = 'normal_customer'
        and scope_auth.provider = 'openai'
        and scope_auth.model_or_sku = 'gpt-5.4-mini'
        and scope_auth.pricing_revision_id =
          '40010000-0000-4000-8000-000000000402'::uuid
        and scope_auth.cost_policy_revision_id =
          '40010000-0000-4000-8000-000000000301'::uuid
    )
    and (
      select rollout.mode = 'enforce'
        and rollout.cost_policy_revision_id =
          '40010000-0000-4000-8000-000000000301'::uuid
      from tongs.openai_text_rollout_revisions rollout
      where rollout.route_code = 'hammer.transcript_cleanup'
      order by rollout.revision desc limit 1
    )
    and (
      select loss.mode = 'enforce'
        and loss.loss_policy_revision_id =
          '40010000-0000-4000-8000-000000000601'::uuid
      from tongs.openai_text_failure_loss_rollout_revisions loss
      where loss.route_code = 'hammer.transcript_cleanup'
        and loss.financial_environment = 'test'
      order by loss.revision desc limit 1
    );
$$;

revoke all on function tongs._hammer_scope_has_remaining_authority(
  uuid, timestamptz
) from public, anon, authenticated, service_role;
revoke all on function tongs._hammer_scope_is_effective(
  uuid, timestamptz
) from public, anon, authenticated, service_role;

-- Fail migration application if the B1-A halt-new baseline has drifted. This
-- block is deliberately read-only: installing the migration is not activation.
do $$
declare
  v_rollout tongs.openai_text_rollout_revisions%rowtype;
  v_test_loss tongs.openai_text_failure_loss_rollout_revisions%rowtype;
  v_live_loss tongs.openai_text_failure_loss_rollout_revisions%rowtype;
begin
  select * into v_rollout
  from tongs.openai_text_rollout_revisions
  where route_code = 'hammer.transcript_cleanup'
  order by revision desc limit 1;
  select * into v_test_loss
  from tongs.openai_text_failure_loss_rollout_revisions
  where route_code = 'hammer.transcript_cleanup' and financial_environment = 'test'
  order by revision desc limit 1;
  select * into v_live_loss
  from tongs.openai_text_failure_loss_rollout_revisions
  where route_code = 'hammer.transcript_cleanup' and financial_environment = 'live'
  order by revision desc limit 1;

  if v_rollout.revision <> 3 or v_rollout.mode <> 'halt_new'
     or v_rollout.funding_scope <> 'forge'
     or v_test_loss.revision <> 1 or v_test_loss.mode <> 'halt_new'
     or v_test_loss.loss_policy_revision_id <> '40010000-0000-4000-8000-000000000601'::uuid
     or v_live_loss.revision <> 1 or v_live_loss.mode <> 'halt_new'
     or v_live_loss.loss_policy_revision_id <> '40010000-0000-4000-8000-000000000602'::uuid
     or exists (
       select 1 from tongs.customer_paid_execution_scope_authorizations
       where route_code = 'hammer.transcript_cleanup'
         and authorization_kind = 'normal_customer'
     )
     or exists (
       select 1 from tongs.customer_paid_execution_scope_authorizations
       where route_code = 'hammer.transcript_cleanup'
         and financial_environment = 'live'
     )
     or exists (
       select 1
       from tongs.customer_paid_execution_scope_authorizations scope_auth
       where scope_auth.route_code = 'hammer.transcript_cleanup'
         and scope_auth.authorization_kind in ('certification', 'owner_only')
         and tongs._hammer_scope_has_remaining_authority(
           scope_auth.id, clock_timestamp()
         )
     )
     or exists (
       select 1
       from tongs.customer_paid_execution_scope_authorizations scope_auth
       where scope_auth.route_code = 'hammer.transcript_cleanup'
         and tongs._hammer_scope_is_effective(
           scope_auth.id, clock_timestamp()
         )
     ) then
    raise exception 'Hammer B1-A halt-new baseline drifted; migration remains inert'
      using errcode = 'P0001';
  end if;
end
$$;

create or replace function tongs.activate_hammer_customer_test_acceptance(
  p_authorization_id uuid,
  p_actor_id uuid,
  p_user_id uuid,
  p_workspace_id uuid,
  p_valid_until timestamptz,
  p_reason text
) returns jsonb
language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_now timestamptz := clock_timestamp();
  v_existing tongs.customer_paid_execution_scope_authorizations%rowtype;
  v_rollout tongs.openai_text_rollout_revisions%rowtype;
  v_test_loss tongs.openai_text_failure_loss_rollout_revisions%rowtype;
  v_live_loss tongs.openai_text_failure_loss_rollout_revisions%rowtype;
  v_cost tongs.openai_text_cost_policy_revisions%rowtype;
  v_price tongs.private_pricing_revisions%rowtype;
  v_eligible record;
  v_eligible_credits jsonb;
begin
  perform tongs._require_pricing_service_role();
  if p_authorization_id is null or p_actor_id is null
     or not tongs.is_platform_operator(p_actor_id)
     or p_user_id is null or p_user_id = p_actor_id or p_workspace_id is null
     or p_valid_until is null or p_valid_until <= v_now
     or p_valid_until > v_now + interval '24 hours'
     or length(btrim(coalesce(p_reason, ''))) not between 8 and 500 then
    raise exception 'invalid bounded Hammer customer Test activation'
      using errcode = '22023';
  end if;
  if not exists (select 1 from auth.users where id = p_user_id)
     or tongs.is_platform_operator(p_user_id)
     or exists (
       select 1 from tongs.account_authority_classifications
       where user_id = p_user_id and account_class = 'owner'
     )
     or not exists (
       select 1 from tongs.workspace_members
       where user_id = p_user_id and workspace_id = p_workspace_id
     ) then
    raise exception 'canonical customer and workspace membership required'
      using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('hammer-customer-test-acceptance', 0)
  );

  select * into v_existing
  from tongs.customer_paid_execution_scope_authorizations
  where id = p_authorization_id;
  if found then
    if v_existing.authorization_kind <> 'normal_customer'
       or v_existing.user_id <> p_user_id
       or v_existing.workspace_id <> p_workspace_id
       or v_existing.financial_environment <> 'test'
       or v_existing.route_code <> 'hammer.transcript_cleanup'
       or v_existing.provider <> 'openai'
       or v_existing.model_or_sku <> 'gpt-5.4-mini'
       or v_existing.pricing_revision_id <> '40010000-0000-4000-8000-000000000402'::uuid
       or v_existing.cost_policy_revision_id <> '40010000-0000-4000-8000-000000000301'::uuid
       or v_existing.maximum_operation_count <> 1
       or v_existing.maximum_customer_charge_micros <> 230000
       or v_existing.maximum_wholesale_exposure_micros <> 169728
       or v_existing.maximum_concurrency <> 1
       or v_existing.valid_until <> p_valid_until
       or v_existing.reason <> btrim(p_reason)
       or (select revision from tongs.openai_text_rollout_revisions
           where route_code = 'hammer.transcript_cleanup'
           order by revision desc limit 1) <> 4
       or (select mode from tongs.openai_text_rollout_revisions
           where route_code = 'hammer.transcript_cleanup'
           order by revision desc limit 1) <> 'enforce'
       or (select revision from tongs.openai_text_failure_loss_rollout_revisions
           where route_code = 'hammer.transcript_cleanup'
             and financial_environment = 'test'
           order by revision desc limit 1) <> 2
       or (select mode from tongs.openai_text_failure_loss_rollout_revisions
           where route_code = 'hammer.transcript_cleanup'
             and financial_environment = 'test'
           order by revision desc limit 1) <> 'enforce'
       or (select mode from tongs.openai_text_failure_loss_rollout_revisions
           where route_code = 'hammer.transcript_cleanup'
             and financial_environment = 'live'
           order by revision desc limit 1) <> 'halt_new'
       or exists (
         select 1 from tongs.customer_paid_execution_scope_authorizations
         where route_code = 'hammer.transcript_cleanup'
           and financial_environment = 'live'
       ) then
      raise exception 'Hammer customer Test activation replay conflict'
        using errcode = '23505';
    end if;
    return jsonb_build_object(
      'authorization_id', v_existing.id,
      'financial_environment', 'test',
      'route_code', 'hammer.transcript_cleanup',
      'model', 'gpt-5.4-mini',
      'customer_credit_units', 46,
      'maximum_customer_charge_micros', 230000,
      'maximum_wholesale_exposure_micros', 169728,
      'maximum_operation_count', 1,
      'valid_until', v_existing.valid_until,
      'live_authority_count', 0,
      'replay', true
    );
  end if;

  if exists (
    select 1 from tongs.customer_paid_execution_scope_authorizations
    where route_code = 'hammer.transcript_cleanup'
      and authorization_kind = 'normal_customer'
  )
  or exists (
    select 1 from tongs.customer_paid_execution_scope_authorizations
    where route_code = 'hammer.transcript_cleanup'
      and financial_environment = 'live'
  )
  or exists (
    select 1
    from tongs.customer_paid_execution_scope_authorizations scope_auth
    where scope_auth.route_code = 'hammer.transcript_cleanup'
      and scope_auth.authorization_kind in ('certification', 'owner_only')
      and tongs._hammer_scope_has_remaining_authority(
        scope_auth.id, v_now
      )
  )
  or exists (
    select 1
    from tongs.customer_paid_execution_scope_authorizations scope_auth
    where scope_auth.route_code = 'hammer.transcript_cleanup'
      and tongs._hammer_scope_is_effective(scope_auth.id, v_now)
  ) then
    raise exception 'Hammer customer Test activation already exists'
      using errcode = '23505';
  end if;

  select * into v_rollout
  from tongs.openai_text_rollout_revisions
  where route_code = 'hammer.transcript_cleanup'
  order by revision desc limit 1;
  select * into v_test_loss
  from tongs.openai_text_failure_loss_rollout_revisions
  where route_code = 'hammer.transcript_cleanup' and financial_environment = 'test'
  order by revision desc limit 1;
  select * into v_live_loss
  from tongs.openai_text_failure_loss_rollout_revisions
  where route_code = 'hammer.transcript_cleanup' and financial_environment = 'live'
  order by revision desc limit 1;
  if v_rollout.revision <> 3 or v_rollout.mode <> 'halt_new'
     or v_rollout.funding_scope <> 'forge'
     or v_test_loss.revision <> 1 or v_test_loss.mode <> 'halt_new'
     or v_live_loss.revision <> 1 or v_live_loss.mode <> 'halt_new'
     or exists (
       select 1 from tongs.customer_paid_execution_scope_authorizations
       where route_code = 'hammer.transcript_cleanup'
         and financial_environment = 'live'
     ) then
    raise exception 'exact Hammer halt-new baseline required for activation'
      using errcode = '42501';
  end if;

  select * into v_eligible
  from tongs._eligible_ai_models_for_operation('hammer.transcript_cleanup') eligible
  where eligible.runtime_model_id = 'gpt-5.4-mini'
    and eligible.cost_policy_revision_id = '40010000-0000-4000-8000-000000000301'::uuid
    and eligible.customer_credit_units = 46;
  select jsonb_agg(customer_credit_units order by customer_credit_units)
    into v_eligible_credits
  from tongs._eligible_ai_models_for_operation('hammer.transcript_cleanup');
  select * into v_cost from tongs.openai_text_cost_policy_revisions
  where id = '40010000-0000-4000-8000-000000000301'::uuid;
  select * into v_price from tongs.private_pricing_revisions
  where id = '40010000-0000-4000-8000-000000000402'::uuid;

  if v_eligible.runtime_model_id is null
     or v_eligible_credits <> '[46,129,258]'::jsonb
     or v_cost.route_code <> 'hammer.transcript_cleanup'
     or v_cost.maximum_attempts <> 1
     or v_cost.full_cost_ceiling_micros <> 169728
     or v_cost.cost_coverage <> 'complete'
     or v_cost.lifecycle_state <> 'active'
     or v_price.lifecycle_state <> 'review_ready'
     or v_price.currency <> 'USD'
     or v_price.customer_credit_units <> 46
     or v_price.customer_price_ceiling_micros <> 230000
     or v_price.full_cost_ceiling_micros <> 169728
     or v_price.failure_cost_ceiling_micros <> 0
     or not exists (
       select 1
       from tongs.private_pricing_publications publication
       where publication.pricing_revision_id = v_price.id
         and publication.action = 'published'
         and publication.publication_revision = 1
     )
     or v_test_loss.loss_policy_revision_id <> '40010000-0000-4000-8000-000000000601'::uuid
     or not exists (
       select 1 from tongs.openai_text_failure_loss_policy_revisions
       where id = v_test_loss.loss_policy_revision_id
         and route_code = 'hammer.transcript_cleanup'
         and environment = 'test' and revision = 1
         and per_operation_limit_micros = 967680
         and aggregate_limit_micros = 967680
         and rolling_window_seconds = 86400
         and maximum_concurrency = 1
         and lifecycle_state = 'active'
     ) then
    raise exception 'approved Hammer Mini price, cost, and loss authority required'
      using errcode = '42501';
  end if;

  insert into tongs.openai_text_rollout_revisions(
    route_code, revision, mode, cost_policy_revision_id,
    reason, actor_id, funding_scope
  ) values (
    'hammer.transcript_cleanup', 4, 'enforce',
    '40010000-0000-4000-8000-000000000301',
    btrim(p_reason), p_actor_id, 'forge'
  );
  insert into tongs.openai_text_failure_loss_rollout_revisions(
    route_code, financial_environment, revision, mode,
    loss_policy_revision_id, source_limit_event_id, reason, actor_id
  ) values (
    'hammer.transcript_cleanup', 'test', 2, 'enforce',
    '40010000-0000-4000-8000-000000000601', null,
    btrim(p_reason), p_actor_id
  );
  insert into tongs.customer_paid_execution_scope_authorizations(
    id, user_id, workspace_id, financial_environment, route_code, provider,
    model_or_sku, pricing_revision_id, cost_policy_revision_id,
    maximum_operation_count, maximum_customer_charge_micros,
    maximum_wholesale_exposure_micros, maximum_concurrency,
    rolling_window_seconds, valid_from, valid_until, status, reason,
    created_by, authorization_kind
  ) values (
    p_authorization_id, p_user_id, p_workspace_id, 'test',
    'hammer.transcript_cleanup', 'openai', 'gpt-5.4-mini',
    '40010000-0000-4000-8000-000000000402',
    '40010000-0000-4000-8000-000000000301',
    1, 230000, 169728, 1, null,
    v_now, p_valid_until, 'active', btrim(p_reason),
    p_actor_id, 'normal_customer'
  ) returning * into v_existing;

  if (select count(*) from tongs.customer_paid_execution_scope_authorizations
      where route_code = 'hammer.transcript_cleanup'
        and financial_environment = 'test'
        and authorization_kind = 'normal_customer') <> 1
     or (select count(*)
         from tongs.customer_paid_execution_scope_authorizations scope_auth
         where scope_auth.route_code = 'hammer.transcript_cleanup'
           and tongs._hammer_scope_is_effective(scope_auth.id, v_now)) <> 1
     or not tongs._hammer_scope_is_effective(v_existing.id, v_now)
     or exists (
       select 1 from tongs.customer_paid_execution_scope_authorizations
       where route_code = 'hammer.transcript_cleanup'
         and financial_environment = 'live'
     )
     or (select mode from tongs.openai_text_failure_loss_rollout_revisions
         where route_code = 'hammer.transcript_cleanup'
           and financial_environment = 'live'
         order by revision desc limit 1) <> 'halt_new' then
    raise exception 'Hammer activation escaped its single Test-only boundary'
      using errcode = '42501';
  end if;

  return jsonb_build_object(
    'authorization_id', v_existing.id,
    'financial_environment', 'test',
    'route_code', 'hammer.transcript_cleanup',
    'model', 'gpt-5.4-mini',
    'customer_credit_units', 46,
    'maximum_customer_charge_micros', 230000,
    'maximum_wholesale_exposure_micros', 169728,
    'maximum_operation_count', 1,
    'valid_until', v_existing.valid_until,
    'live_authority_count', 0,
    'replay', false
  );
end
$$;

revoke all on function tongs.activate_hammer_customer_test_acceptance(
  uuid, uuid, uuid, uuid, timestamptz, text
) from public, anon, authenticated, service_role;
grant execute on function tongs.activate_hammer_customer_test_acceptance(
  uuid, uuid, uuid, uuid, timestamptz, text
) to service_role;

comment on function tongs.activate_hammer_customer_test_acceptance(
  uuid, uuid, uuid, uuid, timestamptz, text
) is 'Explicit service-role activation for one customer-funded Hammer transcript-cleanup Test operation. Applying the migration alone grants no execution authority.';

create or replace function tongs.close_hammer_customer_test_acceptance(
  p_close_id uuid,
  p_authorization_id uuid,
  p_actor_id uuid,
  p_reason text
) returns jsonb
language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_scope tongs.customer_paid_execution_scope_authorizations%rowtype;
  v_existing tongs.hammer_customer_test_acceptance_closures%rowtype;
  v_rollout tongs.openai_text_rollout_revisions%rowtype;
  v_test_loss tongs.openai_text_failure_loss_rollout_revisions%rowtype;
  v_live_loss tongs.openai_text_failure_loss_rollout_revisions%rowtype;
begin
  perform tongs._require_pricing_service_role();
  if p_close_id is null or p_authorization_id is null or p_actor_id is null
     or not tongs.is_platform_operator(p_actor_id)
     or length(btrim(coalesce(p_reason, ''))) not between 8 and 500 then
    raise exception 'invalid Hammer customer Test shutdown'
      using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('hammer-customer-test-acceptance', 0)
  );

  select * into v_existing
  from tongs.hammer_customer_test_acceptance_closures
  where id = p_close_id;
  if found then
    if v_existing.authorization_id <> p_authorization_id
       or v_existing.actor_id <> p_actor_id
       or v_existing.reason <> btrim(p_reason)
       or v_existing.route_revision <> 5
       or v_existing.test_loss_revision <> 3
       or (select revision from tongs.openai_text_rollout_revisions
           where route_code = 'hammer.transcript_cleanup'
           order by revision desc limit 1) <> 5
       or (select mode from tongs.openai_text_rollout_revisions
           where route_code = 'hammer.transcript_cleanup'
           order by revision desc limit 1) <> 'halt_new'
       or (select revision from tongs.openai_text_failure_loss_rollout_revisions
           where route_code = 'hammer.transcript_cleanup'
             and financial_environment = 'test'
           order by revision desc limit 1) <> 3
       or (select mode from tongs.openai_text_failure_loss_rollout_revisions
           where route_code = 'hammer.transcript_cleanup'
             and financial_environment = 'test'
           order by revision desc limit 1) <> 'halt_new'
       or (select revision from tongs.openai_text_failure_loss_rollout_revisions
           where route_code = 'hammer.transcript_cleanup'
             and financial_environment = 'live'
           order by revision desc limit 1) <> 1
       or (select mode from tongs.openai_text_failure_loss_rollout_revisions
           where route_code = 'hammer.transcript_cleanup'
             and financial_environment = 'live'
           order by revision desc limit 1) <> 'halt_new'
       or exists (
         select 1
         from tongs.customer_paid_execution_scope_authorizations scope_auth
         where scope_auth.route_code = 'hammer.transcript_cleanup'
           and tongs._hammer_scope_is_effective(
             scope_auth.id, clock_timestamp()
           )
       ) then
      raise exception 'Hammer customer Test shutdown replay conflict'
        using errcode = '23505';
    end if;
    return jsonb_build_object(
      'close_id', v_existing.id,
      'authorization_id', v_existing.authorization_id,
      'route_revision', 5,
      'route_mode', 'halt_new',
      'test_loss_revision', 3,
      'test_loss_mode', 'halt_new',
      'live_loss_revision', 1,
      'live_loss_mode', 'halt_new',
      'effective_scope_count', 0,
      'replay', true
    );
  end if;

  if exists (
    select 1 from tongs.hammer_customer_test_acceptance_closures
    where authorization_id = p_authorization_id
  ) then
    raise exception 'Hammer customer Test shutdown already exists'
      using errcode = '23505';
  end if;

  select * into v_scope
  from tongs.customer_paid_execution_scope_authorizations
  where id = p_authorization_id;
  if not found
     or v_scope.authorization_kind <> 'normal_customer'
     or v_scope.financial_environment <> 'test'
     or v_scope.route_code <> 'hammer.transcript_cleanup'
     or v_scope.provider <> 'openai'
     or v_scope.model_or_sku <> 'gpt-5.4-mini'
     or v_scope.pricing_revision_id <>
       '40010000-0000-4000-8000-000000000402'::uuid
     or v_scope.cost_policy_revision_id <>
       '40010000-0000-4000-8000-000000000301'::uuid
     or v_scope.maximum_operation_count <> 1
     or v_scope.maximum_customer_charge_micros <> 230000
     or v_scope.maximum_wholesale_exposure_micros <> 169728
     or v_scope.maximum_concurrency <> 1 then
    raise exception 'specific B1-C Hammer activation required for shutdown'
      using errcode = '42501';
  end if;

  select * into v_rollout
  from tongs.openai_text_rollout_revisions
  where route_code = 'hammer.transcript_cleanup'
  order by revision desc limit 1;
  select * into v_test_loss
  from tongs.openai_text_failure_loss_rollout_revisions
  where route_code = 'hammer.transcript_cleanup'
    and financial_environment = 'test'
  order by revision desc limit 1;
  select * into v_live_loss
  from tongs.openai_text_failure_loss_rollout_revisions
  where route_code = 'hammer.transcript_cleanup'
    and financial_environment = 'live'
  order by revision desc limit 1;

  if v_rollout.revision <> 4 or v_rollout.mode <> 'enforce'
     or v_rollout.cost_policy_revision_id <>
       '40010000-0000-4000-8000-000000000301'::uuid
     or v_test_loss.revision <> 2 or v_test_loss.mode <> 'enforce'
     or v_test_loss.loss_policy_revision_id <>
       '40010000-0000-4000-8000-000000000601'::uuid
     or v_live_loss.revision <> 1 or v_live_loss.mode <> 'halt_new'
     or v_live_loss.loss_policy_revision_id <>
       '40010000-0000-4000-8000-000000000602'::uuid
     or exists (
       select 1 from tongs.customer_paid_execution_scope_authorizations
       where route_code = 'hammer.transcript_cleanup'
         and financial_environment = 'live'
     ) then
    raise exception 'exact active Hammer customer Test authority required for shutdown'
      using errcode = '42501';
  end if;

  insert into tongs.openai_text_rollout_revisions(
    route_code, revision, mode, cost_policy_revision_id,
    reason, actor_id, funding_scope
  ) values (
    'hammer.transcript_cleanup', 5, 'halt_new', null,
    btrim(p_reason), p_actor_id, 'forge'
  );
  insert into tongs.openai_text_failure_loss_rollout_revisions(
    route_code, financial_environment, revision, mode,
    loss_policy_revision_id, source_limit_event_id, reason, actor_id
  ) values (
    'hammer.transcript_cleanup', 'test', 3, 'halt_new',
    '40010000-0000-4000-8000-000000000601', null,
    btrim(p_reason), p_actor_id
  );
  insert into tongs.hammer_customer_test_acceptance_closures(
    id, authorization_id, actor_id, reason,
    route_revision, test_loss_revision
  ) values (
    p_close_id, p_authorization_id, p_actor_id, btrim(p_reason), 5, 3
  ) returning * into v_existing;

  if exists (
    select 1
    from tongs.customer_paid_execution_scope_authorizations scope_auth
    where scope_auth.route_code = 'hammer.transcript_cleanup'
      and tongs._hammer_scope_is_effective(
        scope_auth.id, clock_timestamp()
      )
  )
  or (select revision from tongs.openai_text_failure_loss_rollout_revisions
      where route_code = 'hammer.transcript_cleanup'
        and financial_environment = 'live'
      order by revision desc limit 1) <> 1
  or (select mode from tongs.openai_text_failure_loss_rollout_revisions
      where route_code = 'hammer.transcript_cleanup'
        and financial_environment = 'live'
      order by revision desc limit 1) <> 'halt_new' then
    raise exception 'Hammer shutdown did not remove effective customer authority'
      using errcode = '42501';
  end if;

  return jsonb_build_object(
    'close_id', v_existing.id,
    'authorization_id', v_existing.authorization_id,
    'route_revision', 5,
    'route_mode', 'halt_new',
    'test_loss_revision', 3,
    'test_loss_mode', 'halt_new',
    'live_loss_revision', 1,
    'live_loss_mode', 'halt_new',
    'effective_scope_count', 0,
    'replay', false
  );
end
$$;

revoke all on function tongs.close_hammer_customer_test_acceptance(
  uuid, uuid, uuid, text
) from public, anon, authenticated, service_role;
grant execute on function tongs.close_hammer_customer_test_acceptance(
  uuid, uuid, uuid, text
) to service_role;

comment on function tongs.close_hammer_customer_test_acceptance(
  uuid, uuid, uuid, text
) is 'Independent, append-only, service-role shutdown for one exact Hammer customer Test acceptance. It changes no reservation, settlement, supplier, or reconciliation evidence.';

notify pgrst, 'reload schema';
commit;
