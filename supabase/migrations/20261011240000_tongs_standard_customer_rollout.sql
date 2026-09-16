-- Replace the one-operation certification scope with a distinct, ongoing
-- customer rollout authority. Customer value remains bounded by canonical
-- Forge Credit reservations; the restricted-beta aggregate system remains an
-- opt-in operator control and is not a hidden customer quota.
begin;

alter table tongs.financial_environment_configuration_revisions
  drop constraint financial_environment_configuration_revis_lifecycle_state_check,
  drop constraint financial_environment_configurati_maximum_operation_count_check,
  drop constraint financial_environment_configuratio_rolling_window_seconds_check;

alter table tongs.financial_environment_configuration_revisions
  alter column maximum_operation_count drop not null,
  alter column rolling_window_seconds drop not null;

alter table tongs.financial_environment_configuration_revisions
  add constraint financial_environment_configuration_revis_lifecycle_state_check
    check (lifecycle_state in (
      'structurally_ready', 'certification_ready', 'customer_rollout_active',
      'inactive_ready', 'retired'
    )),
  add constraint financial_environment_configurati_maximum_operation_count_check
    check (
      (lifecycle_state = 'customer_rollout_active' and maximum_operation_count is null)
      or (lifecycle_state <> 'customer_rollout_active' and maximum_operation_count = 1)
    ),
  add constraint financial_environment_configuratio_rolling_window_seconds_check
    check (
      (lifecycle_state = 'customer_rollout_active' and rolling_window_seconds is null)
      or (lifecycle_state <> 'customer_rollout_active' and rolling_window_seconds = 86400)
    );

insert into tongs.financial_environment_configuration_revisions(
  environment, revision, lifecycle_state, workflow_contract, route_code,
  provider, model, cost_policy_revision_id, pricing_revision_id,
  wholesale_exposure_ceiling_micros, maximum_concurrency,
  rolling_window_seconds, maximum_operation_count,
  required_stripe_identifier_slots, reason
) values (
  'test', 4, 'customer_rollout_active', 'forge.customer-financial-path.v2',
  'hearth.chat_completion', 'openai', 'gpt-5.6-luna',
  '10000000-0000-4000-8000-000000000010',
  'b4c4472f-0325-4c2e-b2ef-9aef5e59e64a',
  11015, 1, null, null,
  '["ai_credit_pack_price_ids","subscription_price_ids","webhook_endpoint_secret"]',
  'Normal Test customer rollout: credit balance is the customer economic boundary; certification quotas do not apply.'
);

alter table tongs.customer_paid_execution_scope_authorizations
  add column authorization_kind text not null default 'certification'
    check (authorization_kind in ('certification', 'normal_customer'));

alter table tongs.customer_paid_execution_scope_authorizations
  drop constraint customer_paid_execution_scope_aut_maximum_operation_count_check,
  drop constraint customer_paid_execution_scope_auth_rolling_window_seconds_check,
  drop constraint customer_paid_execution_scope_authorizations_check;

alter table tongs.customer_paid_execution_scope_authorizations
  alter column maximum_operation_count drop not null,
  alter column rolling_window_seconds drop not null,
  alter column valid_until drop not null;

alter table tongs.customer_paid_execution_scope_authorizations
  add constraint customer_paid_execution_scope_aut_maximum_operation_count_check
    check (
      (authorization_kind = 'certification' and maximum_operation_count > 0)
      or (authorization_kind = 'normal_customer' and maximum_operation_count is null)
    ),
  add constraint customer_paid_execution_scope_auth_rolling_window_seconds_check
    check (
      (authorization_kind = 'certification' and rolling_window_seconds > 0)
      or (authorization_kind = 'normal_customer' and rolling_window_seconds is null)
    ),
  add constraint customer_paid_execution_scope_authorizations_check
    check (
      (authorization_kind = 'certification' and valid_until > valid_from)
      or (authorization_kind = 'normal_customer' and valid_until is null)
    );

create or replace function tongs.create_normal_customer_paid_execution_authorization(
  p_authorization_id uuid,
  p_actor_id uuid,
  p_user_id uuid,
  p_workspace_id uuid,
  p_financial_environment text,
  p_reason text
) returns jsonb
language plpgsql security definer set search_path = pg_catalog as $$
declare
  config tongs.financial_environment_configuration_revisions%rowtype;
  existing tongs.customer_paid_execution_scope_authorizations%rowtype;
begin
  perform tongs._require_pricing_service_role();
  if p_authorization_id is null or p_actor_id is null
     or not tongs.is_platform_operator(p_actor_id)
     or p_user_id is null or p_workspace_id is null
     or p_financial_environment not in ('test', 'live')
     or nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'service-role platform operator and exact customer scope are required'
      using errcode = '42501';
  end if;
  if not exists (
    select 1 from tongs.workspace_members membership
    where membership.workspace_id = p_workspace_id
      and membership.user_id = p_user_id
  ) then
    raise exception 'customer must belong to the authorized workspace'
      using errcode = '42501';
  end if;
  select * into existing
  from tongs.customer_paid_execution_scope_authorizations
  where id = p_authorization_id;
  if found then
    if existing.authorization_kind <> 'normal_customer'
       or existing.user_id <> p_user_id
       or existing.workspace_id <> p_workspace_id
       or existing.financial_environment <> p_financial_environment then
      raise exception 'normal customer authorization replay conflict'
        using errcode = '23505';
    end if;
    return to_jsonb(existing) || jsonb_build_object('replay', true);
  end if;
  select * into config
  from tongs.financial_environment_configuration_revisions
  where environment = p_financial_environment
  order by revision desc limit 1;
  if not found or config.lifecycle_state <> 'customer_rollout_active'
     or config.workflow_contract <> 'forge.customer-financial-path.v2'
     or config.route_code <> 'hearth.chat_completion'
     or config.provider <> 'openai'
     or config.model <> 'gpt-5.6-luna'
     or config.pricing_revision_id <> 'b4c4472f-0325-4c2e-b2ef-9aef5e59e64a'::uuid
     or config.cost_policy_revision_id <> '10000000-0000-4000-8000-000000000010'::uuid
     or config.wholesale_exposure_ceiling_micros <> 11015
     or config.maximum_concurrency <> 1
     or config.maximum_operation_count is not null
     or config.rolling_window_seconds is not null then
    raise exception 'exact active normal customer Luna configuration required'
      using errcode = '42501';
  end if;
  insert into tongs.customer_paid_execution_scope_authorizations(
    id, user_id, workspace_id, financial_environment, route_code, provider,
    model_or_sku, pricing_revision_id, cost_policy_revision_id,
    maximum_operation_count, maximum_customer_charge_micros,
    maximum_wholesale_exposure_micros, maximum_concurrency,
    rolling_window_seconds, valid_from, valid_until, status, reason,
    created_by, authorization_kind
  ) values (
    p_authorization_id, p_user_id, p_workspace_id, p_financial_environment,
    config.route_code, config.provider, config.model,
    config.pricing_revision_id, config.cost_policy_revision_id,
    null, 15000, config.wholesale_exposure_ceiling_micros,
    config.maximum_concurrency, null, now(), null, 'active',
    btrim(p_reason), p_actor_id, 'normal_customer'
  ) returning * into existing;
  return to_jsonb(existing) || jsonb_build_object('replay', false);
end $$;

revoke all on function tongs.create_normal_customer_paid_execution_authorization(uuid,uuid,uuid,uuid,text,text)
  from public, anon, authenticated;
grant execute on function tongs.create_normal_customer_paid_execution_authorization(uuid,uuid,uuid,uuid,text,text)
  to service_role;

create or replace function tongs._stamp_and_authorize_funding_reservation()
returns trigger language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_quote tongs.customer_spending_quotes%rowtype;
  v_source_environment text;
  v_binding tongs.openai_text_customer_quote_bindings%rowtype;
  v_authorization tongs.customer_paid_execution_scope_authorizations%rowtype;
  v_prior_count bigint;
  v_active_count bigint;
begin
  select * into v_quote from tongs.customer_spending_quotes where id = new.quote_id;
  if not found then raise exception 'spending quote not found' using errcode = 'P0002'; end if;
  if new.funding_source_type = 'customer_deposit' then
    select stripe_mode into v_source_environment from tongs.customer_deposits where id = new.funding_source_id;
  elsif new.funding_source_type = 'paid_allowance' then
    select financial_environment into v_source_environment from tongs.paid_allowance_grants where id = new.funding_source_id;
  elsif new.funding_source_type = 'owner_budget' then
    v_source_environment := 'owner_internal';
  else
    v_source_environment := v_quote.financial_environment;
  end if;
  if v_source_environment is null then raise exception 'funding source environment is unavailable' using errcode = 'P0002'; end if;
  if new.funding_source_type in ('customer_deposit', 'paid_allowance')
     and v_source_environment <> v_quote.financial_environment then
    raise exception 'cross-environment customer funding is forbidden' using errcode = '42501';
  end if;
  new.funding_environment := v_source_environment;
  if new.funding_source_type not in ('customer_deposit', 'paid_allowance') then return new; end if;
  select * into v_binding from tongs.openai_text_customer_quote_bindings where quote_id = new.quote_id;
  if not found then
    raise exception 'generic paid execution authorization requires an immutable provider quote binding' using errcode = '42501';
  end if;
  select scope_auth.* into v_authorization
  from tongs.customer_paid_execution_scope_authorizations scope_auth
  where scope_auth.user_id = new.user_id
    and scope_auth.workspace_id = v_binding.workspace_id
    and scope_auth.financial_environment = v_source_environment
    and scope_auth.route_code = v_binding.route_code
    and scope_auth.provider = 'openai'
    and scope_auth.model_or_sku = v_binding.runtime_model
    and scope_auth.pricing_revision_id = v_binding.pricing_revision_id
    and scope_auth.cost_policy_revision_id = v_binding.cost_policy_revision_id
    and scope_auth.status = 'active'
    and scope_auth.valid_from <= now()
    and (scope_auth.valid_until is null or scope_auth.valid_until > now())
  order by (scope_auth.authorization_kind = 'normal_customer') desc, scope_auth.created_at desc
  limit 1;
  if not found
     or new.reserved_customer_charge_micros > v_authorization.maximum_customer_charge_micros
     or new.reserved_wholesale_spend_micros > v_authorization.maximum_wholesale_exposure_micros then
    raise exception 'customer paid execution is not authorized for this scope' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('paid-scope:' || v_authorization.id::text, 0));
  if v_authorization.maximum_operation_count is not null then
    select count(*) into v_prior_count from tongs.funding_reservations reservation
    where reservation.rollout_authorization_id = v_authorization.id;
    if v_prior_count >= v_authorization.maximum_operation_count then
      raise exception 'customer paid execution operation limit reached' using errcode = 'P0001';
    end if;
  end if;
  select count(*) into v_active_count
  from tongs.funding_reservations reservation
  where reservation.rollout_authorization_id = v_authorization.id
    and tongs._funding_reservation_state(reservation.id) in (
      'reserved', 'attempt_started', 'provider_attempt_shadowed', 'submission_unknown'
    );
  if v_active_count >= v_authorization.maximum_concurrency then
    raise exception 'customer paid execution concurrency limit reached' using errcode = 'P0001';
  end if;
  new.rollout_authorization_id := v_authorization.id;
  return new;
end $$;

do $$
declare definition text; changed text;
begin
  select pg_get_functiondef(
    'tongs.acquire_openai_text_aggregate_admission(uuid,text,text)'::regprocedure
  ) into definition;
  changed := replace(definition,
    'select * into q from tongs.customer_spending_quotes where id=r.quote_id;',
    $replacement$select * into q from tongs.customer_spending_quotes where id=r.quote_id;
 if exists (
   select 1 from tongs.customer_paid_execution_scope_authorizations scope_auth
   where scope_auth.id = r.rollout_authorization_id
     and scope_auth.authorization_kind = 'normal_customer'
     and scope_auth.status = 'active'
 ) then
   return jsonb_build_object(
     'enforcement_enabled', false, 'authorized', true, 'replay', false,
     'reason', 'normal_customer_credit_bounded'
   );
 end if;$replacement$);
  if changed = definition or position('normal_customer_credit_bounded' in changed) = 0 then
    raise exception 'aggregate admission shape changed upstream; explicit review required';
  end if;
  execute changed;
end $$;

comment on column tongs.customer_paid_execution_scope_authorizations.authorization_kind is
  'Separates immutable certification evidence from ongoing customer rollout authority.';
comment on function tongs.create_normal_customer_paid_execution_authorization(uuid,uuid,uuid,uuid,text,text) is
  'Creates an ongoing active-environment customer scope bounded by credits, per-operation cost, concurrency, idempotency, and settlement rather than a certification operation count.';

notify pgrst, 'reload schema';
commit;
