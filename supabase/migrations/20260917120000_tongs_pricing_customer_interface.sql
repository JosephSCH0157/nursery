-- Operator pricing controls, customer-safe Runway quote/reservation adapters, and
-- owner financial reporting. This release creates no pricing data and does not
-- change any paid-execution control or Runway rollout revision.
begin;

create table tongs.private_markup_rule_revisions (
  id uuid primary key,
  revision integer not null unique check (revision > 0),
  previous_revision_id uuid references tongs.private_markup_rule_revisions(id) on delete restrict,
  default_markup_basis_points integer not null check (default_markup_basis_points >= 0),
  overrides_json jsonb not null default '[]'::jsonb check (jsonb_typeof(overrides_json) = 'array'),
  change_reason text not null check (nullif(btrim(change_reason), '') is not null),
  content_hash text not null unique check (content_hash ~ '^[0-9a-f]{64}$'),
  actor_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table tongs.private_pricing_revision_markup_sources (
  pricing_revision_id uuid primary key references tongs.private_pricing_revisions(id) on delete restrict,
  markup_rule_revision_id uuid not null references tongs.private_markup_rule_revisions(id) on delete restrict,
  effective_markup_basis_points integer not null check (effective_markup_basis_points >= 0),
  created_at timestamptz not null default now()
);

create table tongs.private_pricing_publications (
  id uuid primary key,
  policy_id uuid not null references tongs.private_pricing_policies(id) on delete restrict,
  pricing_revision_id uuid references tongs.private_pricing_revisions(id) on delete restrict,
  publication_revision integer not null check (publication_revision > 0),
  action text not null check (action in ('published', 'withdrawn')),
  reason text not null check (nullif(btrim(reason), '') is not null),
  actor_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (policy_id, publication_revision),
  check ((action = 'published' and pricing_revision_id is not null)
    or (action = 'withdrawn' and pricing_revision_id is null))
);

create index private_pricing_publications_current_idx
  on tongs.private_pricing_publications(policy_id, publication_revision desc);

create trigger private_markup_rule_revisions_immutable before update or delete
  on tongs.private_markup_rule_revisions
  for each row execute function tongs._reject_accounting_mutation();
create trigger private_pricing_revision_markup_sources_immutable before update or delete
  on tongs.private_pricing_revision_markup_sources
  for each row execute function tongs._reject_accounting_mutation();
create trigger private_pricing_publications_immutable before update or delete
  on tongs.private_pricing_publications
  for each row execute function tongs._reject_accounting_mutation();

create or replace function tongs._validate_markup_overrides(p_overrides jsonb)
returns void language plpgsql immutable set search_path = pg_catalog as $$
declare
  v_item jsonb;
begin
  if jsonb_typeof(coalesce(p_overrides, 'null'::jsonb)) <> 'array' then
    raise exception 'markup overrides must be an array' using errcode = '22023';
  end if;
  for v_item in select value from jsonb_array_elements(p_overrides) loop
    if jsonb_typeof(v_item) <> 'object'
       or v_item->>'scope_kind' not in ('provider', 'sku')
       or nullif(lower(btrim(coalesce(v_item->>'provider', ''))), '') is null
       or not (v_item ? 'markup_basis_points')
       or (v_item->>'markup_basis_points')::numeric < 0
       or (v_item->>'markup_basis_points')::numeric > 2147483647
       or (v_item->>'scope_kind' = 'provider'
         and nullif(btrim(coalesce(v_item->>'sku', '')), '') is not null)
       or (v_item->>'scope_kind' = 'sku'
         and nullif(btrim(coalesce(v_item->>'sku', '')), '') is null) then
      raise exception 'invalid markup override' using errcode = '22023';
    end if;
  end loop;
  if exists (
    select 1 from (
      select lower(value->>'scope_kind') as scope_kind,
        lower(btrim(value->>'provider')) as provider,
        lower(btrim(coalesce(value->>'sku', ''))) as sku,
        count(*)
      from jsonb_array_elements(p_overrides)
      group by 1,2,3 having count(*) > 1
    ) duplicate
  ) then
    raise exception 'duplicate markup override scope' using errcode = '22023';
  end if;
end;
$$;

create or replace function tongs.commit_private_markup_rule_revision(
  p_revision_id uuid,
  p_expected_revision integer,
  p_default_markup_basis_points integer,
  p_overrides_json jsonb,
  p_change_reason text
) returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_actor uuid := auth.uid();
  v_previous tongs.private_markup_rule_revisions%rowtype;
  v_existing tongs.private_markup_rule_revisions%rowtype;
  v_revision integer;
  v_overrides jsonb := coalesce(p_overrides_json, '[]'::jsonb);
  v_reason text := nullif(btrim(coalesce(p_change_reason, '')), '');
  v_hash text;
begin
  if v_actor is null or not tongs.is_platform_operator(v_actor) then
    raise exception 'platform operator required' using errcode = '42501';
  end if;
  if p_revision_id is null or p_default_markup_basis_points is null
     or p_default_markup_basis_points < 0 or v_reason is null then
    raise exception 'invalid markup rule revision' using errcode = '22023';
  end if;
  perform tongs._validate_markup_overrides(v_overrides);
  perform pg_advisory_xact_lock(hashtextextended('private-markup-rules', 0));
  select * into v_existing from tongs.private_markup_rule_revisions where id = p_revision_id;
  if found then
    return jsonb_build_object('revision_id', v_existing.id, 'revision', v_existing.revision,
      'replay', true, 'published', false);
  end if;
  select * into v_previous from tongs.private_markup_rule_revisions order by revision desc limit 1;
  if coalesce(v_previous.revision, 0) <> coalesce(p_expected_revision, 0) then
    raise exception 'stale markup rule revision' using errcode = '40001';
  end if;
  v_revision := coalesce(v_previous.revision, 0) + 1;
  v_hash := encode(extensions.digest(convert_to(jsonb_build_object(
    'revision', v_revision,
    'default_markup_basis_points', p_default_markup_basis_points,
    'overrides', v_overrides,
    'change_reason', v_reason
  )::text, 'utf8'), 'sha256'), 'hex');
  insert into tongs.private_markup_rule_revisions(
    id, revision, previous_revision_id, default_markup_basis_points,
    overrides_json, change_reason, content_hash, actor_id
  ) values (
    p_revision_id, v_revision, v_previous.id, p_default_markup_basis_points,
    v_overrides, v_reason, v_hash, v_actor
  );
  return jsonb_build_object('revision_id', p_revision_id, 'revision', v_revision,
    'replay', false, 'published', false);
end;
$$;

create or replace function tongs._effective_markup_basis_points(
  p_rule_revision_id uuid,
  p_provider text,
  p_sku text
) returns integer language plpgsql stable security definer set search_path = pg_catalog as $$
declare
  v_rules tongs.private_markup_rule_revisions%rowtype;
  v_markup integer;
begin
  select * into v_rules from tongs.private_markup_rule_revisions where id = p_rule_revision_id;
  if not found then raise exception 'markup rule revision not found' using errcode = 'P0002'; end if;
  select (item->>'markup_basis_points')::integer into v_markup
  from jsonb_array_elements(v_rules.overrides_json) item
  where item->>'scope_kind' = 'sku'
    and lower(btrim(item->>'provider')) = lower(btrim(p_provider))
    and lower(btrim(item->>'sku')) = lower(btrim(p_sku))
  limit 1;
  if v_markup is null then
    select (item->>'markup_basis_points')::integer into v_markup
    from jsonb_array_elements(v_rules.overrides_json) item
    where item->>'scope_kind' = 'provider'
      and lower(btrim(item->>'provider')) = lower(btrim(p_provider))
    limit 1;
  end if;
  return coalesce(v_markup, v_rules.default_markup_basis_points);
end;
$$;

create or replace function tongs.commit_operator_pricing_revision(
  p_markup_rule_revision_id uuid,
  p_policy_id uuid,
  p_policy_code text,
  p_scope_kind text,
  p_provider text,
  p_sku text,
  p_expected_revision integer,
  p_revision_id uuid,
  p_customer_credit_units bigint,
  p_currency text,
  p_cost_components jsonb,
  p_billable_failure_classes jsonb,
  p_free_failure_classes jsonb,
  p_included_quantity jsonb,
  p_retention_policy jsonb,
  p_change_reason text
) returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_actor uuid := auth.uid();
  v_markup integer;
  v_result jsonb;
begin
  if v_actor is null or not tongs.is_platform_operator(v_actor) then
    raise exception 'platform operator required' using errcode = '42501';
  end if;
  v_markup := tongs._effective_markup_basis_points(
    p_markup_rule_revision_id, coalesce(p_provider, ''), coalesce(p_sku, ''));
  v_result := tongs.commit_private_pricing_revision(
    p_policy_id, p_policy_code, p_scope_kind, p_provider, p_sku,
    p_expected_revision, p_revision_id, v_markup, p_customer_credit_units,
    p_currency, p_cost_components, p_billable_failure_classes,
    p_free_failure_classes, p_included_quantity, p_retention_policy, p_change_reason
  );
  insert into tongs.private_pricing_revision_markup_sources(
    pricing_revision_id, markup_rule_revision_id, effective_markup_basis_points
  ) values (p_revision_id, p_markup_rule_revision_id, v_markup)
  on conflict (pricing_revision_id) do nothing;
  return v_result || jsonb_build_object(
    'markup_rule_revision_id', p_markup_rule_revision_id,
    'effective_markup_basis_points', v_markup,
    'published', false
  );
end;
$$;

create or replace function tongs.publish_private_pricing_revision(
  p_publication_id uuid,
  p_pricing_revision_id uuid,
  p_reason text
) returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_actor uuid := auth.uid();
  v_pricing tongs.private_pricing_revisions%rowtype;
  v_existing tongs.private_pricing_publications%rowtype;
  v_publication_revision integer;
begin
  if v_actor is null or not tongs.is_platform_operator(v_actor) then
    raise exception 'platform operator required' using errcode = '42501';
  end if;
  if p_publication_id is null or nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'invalid pricing publication' using errcode = '22023';
  end if;
  select * into v_pricing from tongs.private_pricing_revisions where id = p_pricing_revision_id;
  if not found or v_pricing.lifecycle_state <> 'review_ready' then
    raise exception 'review-ready pricing revision required' using errcode = 'P0001';
  end if;
  if not exists (select 1 from tongs.private_pricing_revision_markup_sources
      where pricing_revision_id = v_pricing.id)
     or exists (select 1 from tongs.private_pricing_cost_components component
      where component.pricing_revision_id = v_pricing.id
        and component.tail_policy = 'recurring_metered') then
    raise exception 'pricing revision has an unpriced or recurring cost tail' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('pricing-publication:' || v_pricing.policy_id::text, 0));
  select * into v_existing from tongs.private_pricing_publications where id = p_publication_id;
  if found then
    return jsonb_build_object('publication_id', v_existing.id,
      'publication_revision', v_existing.publication_revision, 'replay', true);
  end if;
  select coalesce(max(publication_revision), 0) + 1 into v_publication_revision
  from tongs.private_pricing_publications where policy_id = v_pricing.policy_id;
  insert into tongs.private_pricing_publications(
    id, policy_id, pricing_revision_id, publication_revision, action, reason, actor_id
  ) values (
    p_publication_id, v_pricing.policy_id, v_pricing.id, v_publication_revision,
    'published', btrim(p_reason), v_actor
  );
  return jsonb_build_object('publication_id', p_publication_id,
    'pricing_revision_id', v_pricing.id, 'publication_revision', v_publication_revision,
    'replay', false, 'customer_spending_enabled', false);
end;
$$;

create or replace function tongs.withdraw_private_pricing_policy(
  p_publication_id uuid,
  p_policy_id uuid,
  p_reason text
) returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_actor uuid := auth.uid();
  v_revision integer;
begin
  if v_actor is null or not tongs.is_platform_operator(v_actor) then
    raise exception 'platform operator required' using errcode = '42501';
  end if;
  if p_publication_id is null or p_policy_id is null
     or nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'invalid pricing withdrawal' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('pricing-publication:' || p_policy_id::text, 0));
  select coalesce(max(publication_revision), 0) + 1 into v_revision
  from tongs.private_pricing_publications where policy_id = p_policy_id;
  insert into tongs.private_pricing_publications(
    id, policy_id, publication_revision, action, reason, actor_id
  ) values (p_publication_id, p_policy_id, v_revision, 'withdrawn', btrim(p_reason), v_actor);
  return jsonb_build_object('publication_id', p_publication_id,
    'publication_revision', v_revision, 'action', 'withdrawn');
end;
$$;

create or replace function tongs._published_pricing_revision(
  p_provider text,
  p_sku text
) returns tongs.private_pricing_revisions
language sql stable security definer set search_path = pg_catalog as $$
  with candidates as (
    select policy.id as policy_id,
      case policy.scope_kind when 'sku' then 3 when 'provider' then 2 else 1 end as priority
    from tongs.private_pricing_policies policy
    where (policy.scope_kind = 'sku' and lower(policy.provider) = lower(btrim(p_provider))
      and lower(policy.sku) = lower(btrim(p_sku)))
      or (policy.scope_kind = 'provider' and lower(policy.provider) = lower(btrim(p_provider)))
      or policy.scope_kind = 'default'
  ), current_publication as (
    select distinct on (publication.policy_id) publication.*
    from tongs.private_pricing_publications publication
    join candidates candidate on candidate.policy_id = publication.policy_id
    order by publication.policy_id, publication.publication_revision desc
  )
  select revision.*
  from candidates candidate
  join current_publication publication on publication.policy_id = candidate.policy_id
    and publication.action = 'published'
  join tongs.private_pricing_revisions revision on revision.id = publication.pricing_revision_id
  where revision.lifecycle_state = 'review_ready'
  order by candidate.priority desc
  limit 1;
$$;

create or replace function tongs._select_customer_funding_for_quote(p_quote_id uuid)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog as $$
declare
  v_quote tongs.customer_spending_quotes%rowtype;
  v_source record;
begin
  perform tongs._require_pricing_service_role();
  select * into v_quote from tongs.customer_spending_quotes where id = p_quote_id;
  if not found then raise exception 'spending quote not found' using errcode = 'P0002'; end if;
  select candidate.* into v_source from (
    select 'customer_deposit'::text as source_type, deposit.id as source_id,
      'Verified AI credit purchase'::text as customer_label, deposit.received_at as sort_time
    from tongs.customer_deposits deposit
    join tongs.customer_deposit_processor_fees fee on fee.deposit_id = deposit.id
    left join lateral (
      select coalesce(sum(consumption.recognized_revenue_micros),0)::bigint as used_charge,
        coalesce(sum(consumption.credit_units_consumed),0)::bigint as used_units
      from tongs.customer_deposit_consumptions consumption where consumption.deposit_id = deposit.id
    ) used on true
    left join lateral (
      select coalesce(sum(refund.liability_release_micros),0)::bigint as refunded_charge,
        coalesce(sum(refund.refunded_credit_units),0)::bigint as refunded_units
      from tongs.customer_deposit_refunds refund where refund.deposit_id = deposit.id
    ) refunded on true
    left join lateral tongs._active_funding_hold('customer_deposit', deposit.id) held on true
    where deposit.user_id = v_quote.user_id and deposit.stripe_mode = 'live'
      and deposit.currency = v_quote.currency
      and deposit.gross_amount_micros - used.used_charge - refunded.refunded_charge
        - held.customer_charge_micros >= v_quote.normal_maximum_charge_micros
      and deposit.credit_units - used.used_units - refunded.refunded_units
        - held.credit_units >= v_quote.customer_credit_units
    union all
    select 'paid_allowance', allowance.id, 'Paid-plan allowance', allowance.period_end
    from tongs.paid_allowance_grants allowance
    join tongs.subscription_cycle_receipts receipt on receipt.id = allowance.receipt_id
    left join lateral (
      select coalesce(sum(consumption.recognized_revenue_micros),0)::bigint as used_charge,
        coalesce(sum(consumption.entitlement_units_consumed),0)::bigint as used_units,
        coalesce(sum(consumption.wholesale_spend_micros),0)::bigint as used_wholesale
      from tongs.paid_allowance_consumptions consumption
      where consumption.allowance_grant_id = allowance.id
    ) used on true
    left join lateral tongs._active_funding_hold('paid_allowance', allowance.id) held on true
    where allowance.user_id = v_quote.user_id and receipt.stripe_mode = 'live'
      and allowance.currency = v_quote.currency
      and now() >= allowance.period_start and now() < allowance.period_end
      and not exists (select 1 from tongs.subscription_cycle_adjustments adjustment
        where adjustment.receipt_id = allowance.receipt_id)
      and allowance.allocated_revenue_micros - used.used_charge - held.customer_charge_micros
        >= v_quote.normal_maximum_charge_micros
      and allowance.entitlement_units - used.used_units - held.credit_units
        >= v_quote.customer_credit_units
      and allowance.maximum_wholesale_spend_micros - used.used_wholesale - held.wholesale_spend_micros
        >= v_quote.full_cost_ceiling_micros
  ) candidate
  order by case candidate.source_type when 'customer_deposit' then 1 else 2 end,
    candidate.sort_time asc limit 1;
  if not found then
    return jsonb_build_object('eligible', false, 'funding_source', 'none',
      'customer_label', 'No verified eligible funds');
  end if;
  return jsonb_build_object('eligible', true, 'funding_source', v_source.source_type,
    'funding_source_id', v_source.source_id, 'customer_label', v_source.customer_label);
end;
$$;

create or replace function tongs.create_customer_runway_quote(
  p_quote_id uuid,
  p_user_id uuid,
  p_operation_id text,
  p_workspace_id uuid,
  p_operation_fingerprint text,
  p_model text,
  p_duration_seconds integer,
  p_ratio text,
  p_expires_at timestamptz
) returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_pricing tongs.private_pricing_revisions%rowtype;
  v_policy tongs.private_pricing_policies%rowtype;
  v_quote tongs.customer_spending_quotes%rowtype;
  v_control tongs.paid_execution_control_revisions%rowtype;
  v_create jsonb;
  v_funding jsonb;
  v_sku text;
begin
  perform tongs._require_pricing_service_role();
  select * into v_control from tongs._current_paid_execution_control();
  if p_model <> 'gen4.5' or p_duration_seconds not between 2 and 10
     or p_ratio not in ('1280:720', '720:1280') then
    raise exception 'unsupported Runway customer SKU' using errcode = '22023';
  end if;
  v_sku := lower(p_model || ':' || p_duration_seconds::text || 's:' || p_ratio);
  select * into v_pricing from tongs._published_pricing_revision('runway', v_sku);
  if not found then raise exception 'pricing_not_configured' using errcode = 'P0001'; end if;
  select * into v_policy from tongs.private_pricing_policies where id = v_pricing.policy_id;
  if v_policy.scope_kind <> 'sku' or lower(coalesce(v_policy.provider, '')) <> 'runway'
     or lower(coalesce(v_policy.sku, '')) <> v_sku then
    raise exception 'pricing_not_configured' using errcode = 'P0001';
  end if;
  v_create := tongs.create_shadow_spending_quote(
    p_quote_id, p_user_id, p_operation_id, 'tongs_broll_v2', p_workspace_id,
    v_pricing.id, p_operation_fingerprint,
    jsonb_build_array(jsonb_build_object(
      'component', 'video_generation', 'provider_label', 'Runway',
      'credential_source', 'forge'
    )), p_expires_at
  );
  select * into v_quote from tongs.customer_spending_quotes where id = p_quote_id;
  v_funding := tongs._select_customer_funding_for_quote(p_quote_id);
  return jsonb_build_object(
    'quote_id', v_quote.id,
    'operation_id', v_quote.operation_id,
    'quote_hash', v_quote.quote_hash,
    'currency', v_quote.currency,
    'normal_maximum_charge_micros', v_quote.normal_maximum_charge_micros,
    'billable_failure_maximum_charge_micros', v_quote.billable_failure_maximum_charge_micros,
    'customer_credit_units', v_quote.customer_credit_units,
    'billable_failure_classes', v_quote.billable_failure_classes,
    'free_failure_classes', v_quote.free_failure_classes,
    'included_quantity', v_quote.included_quantity,
    'retention_policy', v_quote.retention_policy,
    'provider_funding_summary', v_quote.provider_funding_summary,
    'expires_at', v_quote.expires_at,
    'funding', v_funding,
    'customer_spending_enabled', v_control.pricing_activation_enabled
      and v_control.customer_settlement_enabled and v_control.provider_execution_enabled,
    'replay', coalesce((v_create->>'replay')::boolean, false)
  );
end;
$$;

create or replace function tongs.reserve_customer_runway_quote(
  p_quote_id uuid,
  p_reservation_id uuid,
  p_idempotency_key text,
  p_operation_fingerprint text,
  p_model text,
  p_duration_seconds integer,
  p_ratio text
) returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_control tongs.paid_execution_control_revisions%rowtype;
  v_quote tongs.customer_spending_quotes%rowtype;
  v_existing tongs.funding_reservations%rowtype;
  v_funding jsonb;
  v_result jsonb;
  v_binding jsonb;
begin
  perform tongs._require_pricing_service_role();
  select * into v_control from tongs._current_paid_execution_control();
  if not v_control.pricing_activation_enabled or not v_control.customer_settlement_enabled
     or not v_control.provider_execution_enabled then
    raise exception 'customer spending is not activated' using errcode = '42501';
  end if;
  select * into v_quote from tongs.customer_spending_quotes where id = p_quote_id;
  if not found then raise exception 'spending quote not found' using errcode = 'P0002'; end if;
  if v_quote.request_fingerprint <> p_operation_fingerprint then
    raise exception 'Runway quote fingerprint mismatch' using errcode = '42501';
  end if;
  select * into v_existing from tongs.funding_reservations where quote_id = p_quote_id;
  if found then
    if v_existing.id <> p_reservation_id or v_existing.idempotency_key <> btrim(p_idempotency_key) then
      raise exception 'operation reservation replay conflict' using errcode = '23505';
    end if;
    v_funding := jsonb_build_object('eligible', true,
      'funding_source', v_existing.funding_source_type,
      'funding_source_id', v_existing.funding_source_id,
      'customer_label', case v_existing.funding_source_type
        when 'customer_deposit' then 'Verified AI credit purchase'
        when 'paid_allowance' then 'Paid-plan allowance'
        else 'Verified funding' end);
  else
    v_funding := tongs._select_customer_funding_for_quote(p_quote_id);
    if not coalesce((v_funding->>'eligible')::boolean, false) then
      raise exception 'insufficient verified funding' using errcode = 'P0001';
    end if;
  end if;
  v_result := tongs.reserve_operation(
    p_reservation_id, p_quote_id, v_funding->>'funding_source',
    (v_funding->>'funding_source_id')::uuid, p_idempotency_key
  );
  v_binding := tongs.bind_runway_funding_reservation(
    v_quote.operation_id, p_operation_fingerprint, p_reservation_id, v_quote.user_id,
    v_quote.workspace_id, p_model, p_duration_seconds, p_ratio
  );
  return jsonb_build_object(
    'reservation_id', p_reservation_id,
    'state', v_result->>'state',
    'replay', coalesce((v_result->>'replay')::boolean, false),
    'funding_source', v_funding->>'funding_source',
    'funding_label', v_funding->>'customer_label',
    'provider_execution_authorized', false,
    'binding_replay', coalesce((v_binding->>'replay')::boolean, false)
  );
end;
$$;

create or replace function tongs.read_my_spending_operation(p_operation_id text)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog as $$
declare
  v_user uuid := auth.uid();
  v_quote tongs.customer_spending_quotes%rowtype;
  v_reservation tongs.funding_reservations%rowtype;
  v_settlement tongs.funding_reservation_events%rowtype;
  v_funding_label text;
begin
  if v_user is null then raise exception 'authentication required' using errcode = '42501'; end if;
  select * into v_quote from tongs.customer_spending_quotes
    where user_id = v_user and operation_id = btrim(p_operation_id);
  if not found then raise exception 'spending operation not found' using errcode = 'P0002'; end if;
  select * into v_reservation from tongs.funding_reservations where quote_id = v_quote.id;
  if v_reservation.id is not null then
    select * into v_settlement from tongs.funding_reservation_events
      where reservation_id = v_reservation.id and event_type = 'settled'
      order by sequence desc limit 1;
    v_funding_label := case v_reservation.funding_source_type
      when 'customer_deposit' then 'Verified AI credit purchase'
      when 'paid_allowance' then 'Paid-plan allowance'
      when 'owner_budget' then 'Forge owner testing budget'
      else 'No monetary funding required' end;
  end if;
  return jsonb_build_object(
    'operation_id', v_quote.operation_id,
    'quote_id', v_quote.id,
    'currency', v_quote.currency,
    'normal_maximum_charge_micros', v_quote.normal_maximum_charge_micros,
    'billable_failure_maximum_charge_micros', v_quote.billable_failure_maximum_charge_micros,
    'provider_funding_summary', v_quote.provider_funding_summary,
    'accepted', exists (select 1 from tongs.customer_spending_quote_acceptances
      where quote_id = v_quote.id),
    'reservation_state', case when v_reservation.id is null then null
      else tongs._funding_reservation_state(v_reservation.id) end,
    'funding_source', v_reservation.funding_source_type,
    'funding_label', v_funding_label,
    'customer_charge_micros', v_settlement.customer_charge_micros,
    'credit_units', v_settlement.credit_units,
    'settled_at', v_settlement.created_at,
    'receipt_status', case
      when v_reservation.id is null then 'quoted'
      when v_settlement.id is not null then 'settled'
      else tongs._funding_reservation_state(v_reservation.id) end,
    'execution_authorized', false
  );
end;
$$;

create or replace function tongs.read_owner_billing_console(p_limit integer default 250)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog as $$
declare
  v_actor uuid := auth.uid();
  v_limit integer := least(greatest(coalesce(p_limit, 250), 1), 2000);
  v_control tongs.paid_execution_control_revisions%rowtype;
  v_rollout tongs.runway_execution_rollout_revisions%rowtype;
  v_rules jsonb;
  v_pricing jsonb;
  v_operations jsonb;
  v_funding jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and (v_actor is null or not tongs.is_platform_operator(v_actor)) then
    raise exception 'platform operator required' using errcode = '42501';
  end if;
  select * into v_control from tongs._current_paid_execution_control();
  select * into v_rollout from tongs._current_runway_execution_rollout();
  select coalesce(jsonb_agg(to_jsonb(rule_row) order by rule_row.revision desc), '[]'::jsonb)
  into v_rules from (
    select id, revision, default_markup_basis_points, overrides_json,
      change_reason, content_hash, created_at
    from tongs.private_markup_rule_revisions order by revision desc limit v_limit
  ) rule_row;
  select coalesce(jsonb_agg(to_jsonb(price_row) order by price_row.created_at desc), '[]'::jsonb)
  into v_pricing from (
    select policy.id as policy_id, policy.policy_code, policy.scope_kind,
      policy.provider, policy.sku, revision.id as pricing_revision_id,
      revision.revision, revision.lifecycle_state, revision.currency,
      revision.markup_basis_points,
      revision.full_cost_ceiling_micros, revision.failure_cost_ceiling_micros,
      revision.customer_price_ceiling_micros, revision.billable_failure_ceiling_micros,
      revision.customer_credit_units, revision.billable_failure_classes,
      revision.free_failure_classes, revision.included_quantity, revision.retention_policy,
      revision.change_reason, revision.created_at,
      source.markup_rule_revision_id,
      coalesce((select publication.action from tongs.private_pricing_publications publication
        where publication.policy_id = policy.id order by publication.publication_revision desc limit 1),
        'unpublished') as publication_state,
      coalesce((select jsonb_agg(to_jsonb(component) order by component.ordinal)
        from tongs.private_pricing_cost_components component
        where component.pricing_revision_id = revision.id), '[]'::jsonb) as cost_components,
      revision.customer_price_ceiling_micros - revision.full_cost_ceiling_micros
        as expected_contribution_profit_micros,
      case when coalesce(revision.customer_price_ceiling_micros, 0) = 0 then null
        else round(100::numeric *
          (revision.customer_price_ceiling_micros - revision.full_cost_ceiling_micros)::numeric /
          revision.customer_price_ceiling_micros::numeric, 4) end as expected_contribution_margin_percentage
    from tongs.private_pricing_revisions revision
    join tongs.private_pricing_policies policy on policy.id = revision.policy_id
    left join tongs.private_pricing_revision_markup_sources source
      on source.pricing_revision_id = revision.id
    order by revision.created_at desc limit v_limit
  ) price_row;
  select coalesce(jsonb_agg(to_jsonb(operation_row) order by operation_row.created_at desc), '[]'::jsonb)
  into v_operations from (
    select reservation.id as reservation_id, reservation.operation_id, reservation.user_id,
      reservation.funding_source_type, reservation.currency,
      reservation.reserved_customer_charge_micros,
      reservation.reserved_credit_units, reservation.reserved_wholesale_spend_micros,
      tongs._funding_reservation_state(reservation.id) as reservation_state,
      quote.normal_maximum_charge_micros, quote.billable_failure_maximum_charge_micros,
      settlement.customer_charge_micros as recognized_revenue_micros,
      case when reservation.funding_source_type = 'customer_deposit'
        then consumption.allocated_processor_fee_micros else 0 end as allocated_processor_fee_micros,
      receipt.direct_provider_estimated_micros,
      receipt.direct_provider_actual_micros,
      receipt.supporting_actual_micros,
      receipt.supporting_cost_status,
      case
        when receipt.supporting_cost_status = 'finalized'
          and receipt.direct_provider_actual_micros is not null
          and receipt.supporting_actual_micros is not null then 'confirmed'
        when receipt.direct_provider_estimated_micros is not null then 'estimated_unresolved'
        else 'unresolved' end as expense_coverage,
      case when settlement.customer_charge_micros is not null
          and receipt.supporting_cost_status = 'finalized'
          and receipt.direct_provider_actual_micros is not null
          and receipt.supporting_actual_micros is not null
        then settlement.customer_charge_micros - receipt.direct_provider_actual_micros
          - receipt.supporting_actual_micros
          - case when reservation.funding_source_type = 'customer_deposit'
            then coalesce(consumption.allocated_processor_fee_micros, 0) else 0 end
        else null end as contribution_profit_micros,
      receipt.provider_task_id, receipt.reconciled_at,
      binding.model, binding.duration_seconds, binding.ratio,
      reservation.created_at
    from tongs.funding_reservations reservation
    join tongs.customer_spending_quotes quote on quote.id = reservation.quote_id
    left join lateral (
      select event.* from tongs.funding_reservation_events event
      where event.reservation_id = reservation.id and event.event_type = 'settled'
      order by event.sequence desc limit 1
    ) settlement on true
    left join tongs.customer_deposit_consumptions consumption
      on consumption.deposit_id = reservation.funding_source_id
      and consumption.operation_id = reservation.operation_id
      and reservation.funding_source_type = 'customer_deposit'
    left join tongs.runway_funding_bindings binding on binding.reservation_id = reservation.id
    left join tongs.runway_execution_reconciliation_receipts receipt
      on receipt.reservation_id = reservation.id
    order by reservation.created_at desc limit v_limit
  ) operation_row;
  v_funding := jsonb_build_object(
    'customer_deposits', (select coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.received_at desc), '[]'::jsonb)
      from (select id, user_id, stripe_mode, stripe_session_id, stripe_payment_intent_id,
        pack_id, currency, gross_amount_micros, credit_units, received_at
        from tongs.customer_deposits order by received_at desc limit v_limit) row_data),
    'subscription_receipts', (select coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.received_at desc), '[]'::jsonb)
      from (select id, user_id, stripe_mode, stripe_invoice_id, stripe_subscription_id,
        purchase_type, plan_item_id, currency, gross_amount_micros, period_start, period_end, received_at
        from tongs.subscription_cycle_receipts order by received_at desc limit v_limit) row_data),
    'deposit_consumptions', (select coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.consumed_at desc), '[]'::jsonb)
      from (select id, deposit_id, user_id, operation_id, recognized_revenue_micros,
        credit_units_consumed, allocated_processor_fee_micros, consumed_at
        from tongs.customer_deposit_consumptions order by consumed_at desc limit v_limit) row_data),
    'allowance_consumptions', (select coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.consumed_at desc), '[]'::jsonb)
      from (select id, allowance_grant_id, user_id, operation_id, recognized_revenue_micros,
        entitlement_units_consumed, wholesale_spend_micros, consumed_at
        from tongs.paid_allowance_consumptions order by consumed_at desc limit v_limit) row_data),
    'owner_expenses', (select coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.consumed_at desc), '[]'::jsonb)
      from (select consumption.id, consumption.budget_id, consumption.operation_id,
        budget.provider, budget.route, budget.sku, consumption.expense_amount_micros,
        consumption.currency, 'not_applicable'::text as margin_classification,
        consumption.consumed_at
        from tongs.owner_operating_budget_consumptions consumption
        join tongs.owner_operating_budgets budget on budget.id = consumption.budget_id
        order by consumption.consumed_at desc limit v_limit) row_data)
  );
  return jsonb_build_object(
    'control', to_jsonb(v_control),
    'runway_rollout', to_jsonb(v_rollout),
    'markup_rule_revisions', v_rules,
    'pricing_revisions', v_pricing,
    'operations', v_operations,
    'funding_activity', v_funding,
    'pricing_discrepancies', (select coalesce(jsonb_agg(to_jsonb(discrepancy)
      order by discrepancy.created_at desc), '[]'::jsonb)
      from (select * from tongs.pricing_discrepancies order by created_at desc limit v_limit) discrepancy)
  );
end;
$$;

alter table tongs.private_markup_rule_revisions enable row level security;
alter table tongs.private_pricing_revision_markup_sources enable row level security;
alter table tongs.private_pricing_publications enable row level security;
revoke all on tongs.private_markup_rule_revisions from public, anon, authenticated, service_role;
revoke all on tongs.private_pricing_revision_markup_sources from public, anon, authenticated, service_role;
revoke all on tongs.private_pricing_publications from public, anon, authenticated, service_role;
grant select on tongs.private_markup_rule_revisions to service_role;
grant select on tongs.private_pricing_revision_markup_sources to service_role;
grant select on tongs.private_pricing_publications to service_role;

revoke all on function tongs._validate_markup_overrides(jsonb) from public, anon, authenticated, service_role;
revoke all on function tongs._effective_markup_basis_points(uuid,text,text) from public, anon, authenticated, service_role;
revoke all on function tongs._published_pricing_revision(text,text) from public, anon, authenticated, service_role;
revoke all on function tongs._select_customer_funding_for_quote(uuid) from public, anon, authenticated, service_role;

revoke all on function tongs.commit_private_markup_rule_revision(uuid,integer,integer,jsonb,text) from public, anon;
revoke all on function tongs.commit_operator_pricing_revision(uuid,uuid,text,text,text,text,integer,uuid,bigint,text,jsonb,jsonb,jsonb,jsonb,jsonb,text) from public, anon;
revoke all on function tongs.publish_private_pricing_revision(uuid,uuid,text) from public, anon;
revoke all on function tongs.withdraw_private_pricing_policy(uuid,uuid,text) from public, anon;
revoke all on function tongs.read_owner_billing_console(integer) from public, anon;
grant execute on function tongs.commit_private_markup_rule_revision(uuid,integer,integer,jsonb,text) to authenticated;
grant execute on function tongs.commit_operator_pricing_revision(uuid,uuid,text,text,text,text,integer,uuid,bigint,text,jsonb,jsonb,jsonb,jsonb,jsonb,text) to authenticated;
grant execute on function tongs.publish_private_pricing_revision(uuid,uuid,text) to authenticated;
grant execute on function tongs.withdraw_private_pricing_policy(uuid,uuid,text) to authenticated;
grant execute on function tongs.read_owner_billing_console(integer) to authenticated, service_role;

revoke all on function tongs.create_customer_runway_quote(uuid,uuid,text,uuid,text,text,integer,text,timestamptz) from public, anon, authenticated;
revoke all on function tongs.reserve_customer_runway_quote(uuid,uuid,text,text,text,integer,text) from public, anon, authenticated;
grant execute on function tongs.create_customer_runway_quote(uuid,uuid,text,uuid,text,text,integer,text,timestamptz) to service_role;
grant execute on function tongs.reserve_customer_runway_quote(uuid,uuid,text,text,text,integer,text) to service_role;

revoke all on function tongs.read_my_spending_operation(text) from public, anon;
grant execute on function tongs.read_my_spending_operation(text) to authenticated;

comment on table tongs.private_markup_rule_revisions is
  'Owner-only immutable proposed markup-on-cost rules. Saving a revision does not publish a customer price.';
comment on table tongs.private_pricing_publications is
  'Owner-only append-only publication pointer. Customer execution still requires independent paid-execution activation.';
comment on function tongs.create_customer_runway_quote(uuid,uuid,text,uuid,text,text,integer,text,timestamptz) is
  'Service-only customer-safe quote adapter. It returns accepted customer terms and funding eligibility, never wholesale rates or markup.';
comment on function tongs.read_owner_billing_console(integer) is
  'Platform-operator financial read. Contribution profit is null until fulfillment cost coverage is confirmed.';

notify pgrst, 'reload schema';
commit;
