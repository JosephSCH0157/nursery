-- Compound, exact-rational pricing authority for independently metered AI usage.
-- Historical scalar policies and quotes remain immutable under scalar_v1.

begin;

alter table tongs.ai_pricing_policy_revisions
  add column pricing_contract_version text not null default 'scalar_v1',
  add column model_snapshot text,
  add column endpoint text,
  add column customer_rounding_rule text not null default 'ceiling_whole_credit';

alter table tongs.ai_pricing_policy_revisions
  add constraint ai_pricing_contract_version_check
    check (pricing_contract_version in ('scalar_v1', 'compound_v2')),
  add constraint ai_pricing_rounding_rule_check
    check (customer_rounding_rule = 'ceiling_whole_credit'),
  add constraint ai_pricing_compound_identity_check
    check (
      pricing_contract_version <> 'compound_v2'
      or (nullif(btrim(model_snapshot), '') is not null and nullif(btrim(endpoint), '') is not null)
    );

create table tongs.ai_pricing_rate_components (
  id uuid primary key,
  pricing_policy_revision_id uuid not null references tongs.ai_pricing_policy_revisions(id) on delete restrict,
  ordinal integer not null check (ordinal > 0),
  component_kind text not null,
  unit_kind text not null,
  rate_numerator bigint not null check (rate_numerator >= 0),
  rate_denominator bigint not null check (rate_denominator > 0),
  currency char(3) not null,
  metadata_json jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata_json) = 'object'),
  content_hash text not null check (length(content_hash) = 64),
  created_at timestamptz not null default now(),
  unique (pricing_policy_revision_id, component_kind),
  unique (pricing_policy_revision_id, ordinal)
);

alter table tongs.ai_credit_quotes
  add column pricing_contract_version text not null default 'scalar_v1',
  add column estimated_provider_expense_numerator bigint,
  add column estimated_provider_expense_denominator bigint,
  add column maximum_provider_expense_numerator bigint,
  add column maximum_provider_expense_denominator bigint,
  add column estimated_customer_credit_charge bigint,
  add column maximum_customer_credit_charge bigint;

alter table tongs.ai_credit_quotes
  add constraint ai_credit_quotes_contract_version_check
    check (pricing_contract_version in ('scalar_v1', 'compound_v2')),
  add constraint ai_credit_quotes_compound_exact_shape_check
    check (
      pricing_contract_version <> 'compound_v2'
      or (
        estimated_provider_expense_numerator is not null
        and estimated_provider_expense_numerator >= 0
        and estimated_provider_expense_denominator is not null
        and estimated_provider_expense_denominator > 0
        and maximum_provider_expense_numerator is not null
        and maximum_provider_expense_numerator >= 0
        and maximum_provider_expense_denominator is not null
        and maximum_provider_expense_denominator > 0
        and estimated_customer_credit_charge is not null
        and estimated_customer_credit_charge >= 0
        and maximum_customer_credit_charge is not null
        and maximum_customer_credit_charge >= estimated_customer_credit_charge
        and reservation_amount >= maximum_customer_credit_charge
      )
    );

create table tongs.ai_credit_quote_usage_components (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references tongs.ai_credit_quotes(id) on delete restrict,
  pricing_rate_component_id uuid not null references tongs.ai_pricing_rate_components(id) on delete restrict,
  component_kind text not null,
  unit_kind text not null,
  estimated_quantity bigint not null check (estimated_quantity >= 0),
  maximum_quantity bigint not null check (maximum_quantity >= estimated_quantity),
  rate_numerator bigint not null check (rate_numerator >= 0),
  rate_denominator bigint not null check (rate_denominator > 0),
  currency char(3) not null,
  content_hash text not null check (length(content_hash) = 64),
  created_at timestamptz not null default now(),
  unique (quote_id, component_kind),
  unique (quote_id, pricing_rate_component_id)
);

create or replace function tongs._ai_pricing_gcd(p_left numeric, p_right numeric)
returns numeric
language plpgsql
immutable
strict
set search_path = pg_catalog
as $$
declare
  v_left numeric := abs(p_left);
  v_right numeric := abs(p_right);
  v_remainder numeric;
begin
  while v_right <> 0 loop
    v_remainder := v_left % v_right;
    v_left := v_right;
    v_right := v_remainder;
  end loop;
  return greatest(v_left, 1);
end;
$$;

create or replace function tongs._ai_pricing_ceil_fraction(p_numerator numeric, p_denominator numeric)
returns bigint
language sql
immutable
strict
set search_path = pg_catalog
as $$
  select ceil(p_numerator / p_denominator)::bigint;
$$;

create or replace function tongs.commit_compound_ai_pricing_policy_revision(
  p_policy_code text,
  p_expected_revision integer,
  p_revision_id uuid,
  p_provider text,
  p_model text,
  p_model_snapshot text,
  p_media_kind text,
  p_generation_mode text,
  p_endpoint text,
  p_billable_dimensions jsonb,
  p_rate_components jsonb,
  p_provider_currency text,
  p_forge_credit_conversion_numerator bigint,
  p_forge_credit_conversion_denominator bigint,
  p_markup_numerator bigint,
  p_markup_denominator bigint,
  p_addon_credits bigint,
  p_customer_rounding_rule text,
  p_effective_from timestamptz,
  p_effective_through timestamptz,
  p_is_active boolean,
  p_price_source_type text,
  p_price_source_reference text,
  p_price_source_version text,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_policy tongs.ai_pricing_policies%rowtype;
  v_sequence tongs.ai_pricing_policy_sequences%rowtype;
  v_revision tongs.ai_pricing_policy_revisions%rowtype;
  v_next integer;
  v_hash text;
  v_components jsonb;
  v_component jsonb;
  v_component_count integer;
  v_distinct_count integer;
  v_currency text := upper(btrim(coalesce(p_provider_currency, '')));
begin
  if nullif(btrim(p_policy_code), '') is null or p_revision_id is null
     or nullif(btrim(p_provider), '') is null or nullif(btrim(p_model), '') is null
     or nullif(btrim(p_model_snapshot), '') is null or nullif(btrim(p_endpoint), '') is null
     or lower(btrim(coalesce(p_media_kind, ''))) not in ('image', 'video', 'audio', 'text')
     or jsonb_typeof(p_billable_dimensions) <> 'object'
     or jsonb_typeof(p_rate_components) <> 'array'
     or jsonb_array_length(p_rate_components) = 0
     or v_currency !~ '^[A-Z]{3}$'
     or p_forge_credit_conversion_numerator <= 0 or p_forge_credit_conversion_denominator <= 0
     or p_markup_numerator <= 0 or p_markup_denominator <= 0 or p_addon_credits < 0
     or p_customer_rounding_rule <> 'ceiling_whole_credit'
     or (p_effective_through is not null and p_effective_through <= p_effective_from) then
    raise exception 'invalid compound pricing-policy revision' using errcode = '22023';
  end if;

  select count(*), count(distinct value->>'component_kind')
    into v_component_count, v_distinct_count
  from jsonb_array_elements(p_rate_components);
  if v_component_count <> v_distinct_count then
    raise exception 'duplicate compound pricing component kind' using errcode = '22023';
  end if;

  select jsonb_agg(value order by (value->>'ordinal')::integer, value->>'component_kind')
    into v_components
  from jsonb_array_elements(p_rate_components);

  for v_component in select value from jsonb_array_elements(v_components) loop
    if nullif(btrim(v_component->>'component_kind'), '') is null
       or nullif(btrim(v_component->>'unit_kind'), '') is null
       or coalesce((v_component->>'ordinal')::integer, 0) <= 0
       or coalesce((v_component->>'rate_numerator')::bigint, -1) < 0
       or coalesce((v_component->>'rate_denominator')::bigint, 0) <= 0
       or coalesce(upper(v_component->>'currency'), '') <> v_currency
       or coalesce(jsonb_typeof(v_component->'metadata'), 'null') <> 'object' then
      raise exception 'invalid compound pricing component' using errcode = '22023';
    end if;
  end loop;

  insert into tongs.ai_pricing_policies (policy_code) values (btrim(p_policy_code))
    on conflict (policy_code) do nothing;
  select * into v_policy from tongs.ai_pricing_policies where policy_code = btrim(p_policy_code) for update;
  select * into v_sequence from tongs.ai_pricing_policy_sequences where policy_id = v_policy.id for update;
  if found and v_sequence.current_revision <> coalesce(p_expected_revision, 0) then
    raise exception 'stale pricing-policy revision' using errcode = '40001';
  elsif not found and coalesce(p_expected_revision, 0) <> 0 then
    raise exception 'stale pricing-policy revision' using errcode = '40001';
  end if;
  select * into v_revision from tongs.ai_pricing_policy_revisions where id = p_revision_id;
  if found then
    if v_revision.policy_id <> v_policy.id
       or v_revision.provider <> lower(btrim(p_provider))
       or v_revision.model <> btrim(p_model)
       or v_revision.model_snapshot <> btrim(p_model_snapshot)
       or v_revision.media_kind <> lower(btrim(p_media_kind))
       or v_revision.generation_mode <> btrim(p_generation_mode)
       or v_revision.endpoint <> btrim(p_endpoint)
       or v_revision.billable_dimensions <> p_billable_dimensions
       or v_revision.provider_currency <> v_currency
       or v_revision.forge_credit_conversion_numerator <> p_forge_credit_conversion_numerator
       or v_revision.forge_credit_conversion_denominator <> p_forge_credit_conversion_denominator
       or v_revision.markup_numerator <> p_markup_numerator
       or v_revision.markup_denominator <> p_markup_denominator
       or v_revision.addon_credits <> p_addon_credits
       or v_revision.customer_rounding_rule <> p_customer_rounding_rule
       or v_revision.effective_from <> p_effective_from
       or v_revision.effective_through is distinct from p_effective_through
       or v_revision.is_active <> p_is_active
       or v_revision.price_source_type <> p_price_source_type
       or v_revision.price_source_reference <> p_price_source_reference
       or v_revision.price_source_version is distinct from p_price_source_version
       or exists (
         select 1
         from jsonb_array_elements(v_components) proposed
         full join tongs.ai_pricing_rate_components stored
           on stored.pricing_policy_revision_id = v_revision.id
          and stored.component_kind = proposed->>'component_kind'
         where proposed is null or stored.id is null
            or stored.id <> (proposed->>'id')::uuid
            or stored.ordinal <> (proposed->>'ordinal')::integer
            or stored.unit_kind <> proposed->>'unit_kind'
            or stored.rate_numerator <> (proposed->>'rate_numerator')::bigint
            or stored.rate_denominator <> (proposed->>'rate_denominator')::bigint
            or stored.currency <> upper(proposed->>'currency')
            or stored.metadata_json <> proposed->'metadata'
       ) then
      raise exception 'compound pricing-policy replay conflict' using errcode = '23505';
    end if;
    return jsonb_build_object(
      'policy', to_jsonb(v_policy), 'revision', to_jsonb(v_revision),
      'rate_components', (select jsonb_agg(to_jsonb(c) order by c.ordinal) from tongs.ai_pricing_rate_components c where c.pricing_policy_revision_id = v_revision.id),
      'replay', true
    );
  end if;

  v_next := coalesce(v_sequence.current_revision, 0) + 1;
  v_hash := encode(extensions.digest(convert_to(jsonb_build_object(
    'policy_id', v_policy.id, 'revision', v_next, 'pricing_contract_version', 'compound_v2',
    'provider', lower(btrim(p_provider)), 'model', btrim(p_model), 'model_snapshot', btrim(p_model_snapshot),
    'media_kind', lower(btrim(p_media_kind)), 'generation_mode', btrim(p_generation_mode),
    'endpoint', btrim(p_endpoint), 'billable_dimensions', p_billable_dimensions,
    'rate_components', v_components, 'provider_currency', v_currency,
    'forge_credit_conversion_numerator', p_forge_credit_conversion_numerator,
    'forge_credit_conversion_denominator', p_forge_credit_conversion_denominator,
    'markup_numerator', p_markup_numerator, 'markup_denominator', p_markup_denominator,
    'addon_credits', p_addon_credits, 'customer_rounding_rule', p_customer_rounding_rule,
    'effective_from', p_effective_from, 'effective_through', p_effective_through,
    'is_active', p_is_active, 'price_source_type', p_price_source_type,
    'price_source_reference', p_price_source_reference, 'price_source_version', p_price_source_version
  )::text, 'utf8'), 'sha256'), 'hex');

  insert into tongs.ai_pricing_policy_revisions (
    id, policy_id, revision, previous_revision_id, provider, model, media_kind, generation_mode,
    billable_dimensions, provider_billing_unit, provider_price_micros_per_unit, provider_currency,
    forge_credit_conversion_numerator, forge_credit_conversion_denominator, markup_numerator, markup_denominator,
    addon_credits, effective_from, effective_through, is_active, price_source_type, price_source_reference,
    price_source_version, actor_id, content_hash, pricing_contract_version, model_snapshot, endpoint,
    customer_rounding_rule
  ) values (
    p_revision_id, v_policy.id, v_next, v_sequence.current_revision_id, lower(btrim(p_provider)), btrim(p_model),
    lower(btrim(p_media_kind)), btrim(p_generation_mode), p_billable_dimensions, 'compound_component', 0,
    v_currency, p_forge_credit_conversion_numerator, p_forge_credit_conversion_denominator,
    p_markup_numerator, p_markup_denominator, p_addon_credits, p_effective_from, p_effective_through,
    p_is_active, p_price_source_type, p_price_source_reference, p_price_source_version, p_actor_id,
    v_hash, 'compound_v2', btrim(p_model_snapshot), btrim(p_endpoint), p_customer_rounding_rule
  ) returning * into v_revision;

  for v_component in select value from jsonb_array_elements(v_components) loop
    insert into tongs.ai_pricing_rate_components (
      id, pricing_policy_revision_id, ordinal, component_kind, unit_kind, rate_numerator,
      rate_denominator, currency, metadata_json, content_hash
    ) values (
      (v_component->>'id')::uuid, v_revision.id, (v_component->>'ordinal')::integer,
      btrim(v_component->>'component_kind'), btrim(v_component->>'unit_kind'),
      (v_component->>'rate_numerator')::bigint, (v_component->>'rate_denominator')::bigint,
      v_currency, v_component->'metadata',
      encode(extensions.digest(convert_to(jsonb_build_object(
        'pricing_policy_revision_id', v_revision.id, 'ordinal', (v_component->>'ordinal')::integer,
        'component_kind', btrim(v_component->>'component_kind'), 'unit_kind', btrim(v_component->>'unit_kind'),
        'rate_numerator', (v_component->>'rate_numerator')::bigint,
        'rate_denominator', (v_component->>'rate_denominator')::bigint,
        'currency', v_currency, 'metadata', v_component->'metadata'
      )::text, 'utf8'), 'sha256'), 'hex')
    );
  end loop;

  insert into tongs.ai_pricing_policy_sequences values (v_policy.id, v_revision.id, v_revision.revision, now())
    on conflict (policy_id) do update set current_revision_id = excluded.current_revision_id,
      current_revision = excluded.current_revision, updated_at = now();
  return jsonb_build_object(
    'policy', to_jsonb(v_policy), 'revision', to_jsonb(v_revision),
    'rate_components', (select jsonb_agg(to_jsonb(c) order by c.ordinal) from tongs.ai_pricing_rate_components c where c.pricing_policy_revision_id = v_revision.id),
    'replay', false
  );
end;
$$;

create or replace function tongs.create_compound_ai_credit_quote(
  p_quote_id uuid,
  p_user_id uuid,
  p_operation_id text,
  p_tool text,
  p_workspace_id uuid,
  p_workpiece_id uuid,
  p_pricing_policy_revision_id uuid,
  p_request_parameters jsonb,
  p_requested_output_count integer,
  p_usage_estimates jsonb,
  p_reservation_amount bigint,
  p_request_fingerprint text,
  p_effective_at timestamptz,
  p_expires_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_policy tongs.ai_pricing_policy_revisions%rowtype;
  v_sequence tongs.ai_pricing_policy_sequences%rowtype;
  v_quote tongs.ai_credit_quotes%rowtype;
  v_usage jsonb;
  v_row jsonb;
  v_rate tongs.ai_pricing_rate_components%rowtype;
  v_est_num numeric := 0;
  v_est_den numeric := 1;
  v_max_num numeric := 0;
  v_max_den numeric := 1;
  v_new_num numeric;
  v_new_den numeric;
  v_gcd numeric;
  v_estimated_charge bigint;
  v_maximum_charge bigint;
  v_total_max_units bigint := 0;
  v_expected_fingerprint text;
begin
  select * into v_policy from tongs.ai_pricing_policy_revisions where id = p_pricing_policy_revision_id;
  if not found or v_policy.pricing_contract_version <> 'compound_v2' then
    raise exception 'compound pricing-policy revision not found' using errcode = 'P0002';
  end if;
  select * into v_sequence from tongs.ai_pricing_policy_sequences where policy_id = v_policy.policy_id;
  if not found or v_sequence.current_revision_id <> v_policy.id or not v_policy.is_active
     or p_effective_at < v_policy.effective_from
     or (v_policy.effective_through is not null and p_effective_at >= v_policy.effective_through) then
    raise exception 'pricing-policy revision is not currently active' using errcode = 'P0001';
  end if;
  if p_quote_id is null or p_user_id is null or p_requested_output_count <= 0
     or jsonb_typeof(p_request_parameters) <> 'object'
     or jsonb_typeof(p_usage_estimates) <> 'array' or jsonb_array_length(p_usage_estimates) = 0
     or p_request_fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid compound quote request' using errcode = '22023';
  end if;

  select jsonb_agg(value order by value->>'component_kind') into v_usage
  from jsonb_array_elements(p_usage_estimates);
  if (select count(*) from jsonb_array_elements(v_usage)) <>
     (select count(distinct value->>'component_kind') from jsonb_array_elements(v_usage)) then
    raise exception 'duplicate quote usage component' using errcode = '22023';
  end if;

  for v_row in select value from jsonb_array_elements(v_usage) loop
    select * into v_rate from tongs.ai_pricing_rate_components
      where pricing_policy_revision_id = v_policy.id and component_kind = btrim(v_row->>'component_kind');
    if not found or coalesce((v_row->>'estimated_quantity')::bigint, -1) < 0
       or coalesce((v_row->>'maximum_quantity')::bigint, -1) < coalesce((v_row->>'estimated_quantity')::bigint, 0) then
      raise exception 'invalid quote usage component' using errcode = '22023';
    end if;

    v_new_num := v_est_num * v_rate.rate_denominator
      + (v_row->>'estimated_quantity')::bigint * v_rate.rate_numerator * v_est_den;
    v_new_den := v_est_den * v_rate.rate_denominator;
    v_gcd := tongs._ai_pricing_gcd(v_new_num, v_new_den);
    v_est_num := v_new_num / v_gcd;
    v_est_den := v_new_den / v_gcd;

    v_new_num := v_max_num * v_rate.rate_denominator
      + (v_row->>'maximum_quantity')::bigint * v_rate.rate_numerator * v_max_den;
    v_new_den := v_max_den * v_rate.rate_denominator;
    v_gcd := tongs._ai_pricing_gcd(v_new_num, v_new_den);
    v_max_num := v_new_num / v_gcd;
    v_max_den := v_new_den / v_gcd;
    v_total_max_units := v_total_max_units + (v_row->>'maximum_quantity')::bigint;
  end loop;

  v_estimated_charge := tongs._ai_pricing_ceil_fraction(
    v_est_num * v_policy.forge_credit_conversion_numerator * v_policy.markup_numerator,
    v_est_den * v_policy.forge_credit_conversion_denominator * v_policy.markup_denominator
  ) + v_policy.addon_credits;
  v_maximum_charge := tongs._ai_pricing_ceil_fraction(
    v_max_num * v_policy.forge_credit_conversion_numerator * v_policy.markup_numerator,
    v_max_den * v_policy.forge_credit_conversion_denominator * v_policy.markup_denominator
  ) + v_policy.addon_credits;
  if p_reservation_amount <> v_maximum_charge then
    raise exception 'reservation amount must equal canonical maximum charge' using errcode = '22023';
  end if;

  v_expected_fingerprint := encode(extensions.digest(convert_to(jsonb_build_object(
    'user_id', p_user_id, 'operation_id', p_operation_id, 'tool', p_tool,
    'workspace_id', p_workspace_id, 'workpiece_id', p_workpiece_id,
    'provider', v_policy.provider, 'model', v_policy.model, 'model_snapshot', v_policy.model_snapshot,
    'media_kind', v_policy.media_kind, 'generation_mode', v_policy.generation_mode,
    'endpoint', v_policy.endpoint, 'request_parameters', p_request_parameters,
    'requested_output_count', p_requested_output_count, 'usage_estimates', v_usage,
    'pricing_policy_revision_id', v_policy.id, 'pricing_policy_revision', v_policy.revision
  )::text, 'utf8'), 'sha256'), 'hex');
  if p_request_fingerprint <> v_expected_fingerprint then
    raise exception 'quote fingerprint mismatch' using errcode = '22023';
  end if;

  select * into v_quote from tongs.ai_credit_quotes where user_id = p_user_id and operation_id = p_operation_id;
  if found then
    if v_quote.id <> p_quote_id or v_quote.request_fingerprint <> p_request_fingerprint
       or v_quote.pricing_policy_revision_id <> p_pricing_policy_revision_id then
      raise exception 'quote replay conflict' using errcode = '23505';
    end if;
    return jsonb_build_object(
      'quote', to_jsonb(v_quote),
      'usage_components', (select jsonb_agg(to_jsonb(c) order by c.component_kind) from tongs.ai_credit_quote_usage_components c where c.quote_id = v_quote.id),
      'replay', true
    );
  end if;

  insert into tongs.ai_credit_quotes (
    id, user_id, operation_id, tool, workspace_id, workpiece_id, provider, model, media_kind,
    generation_mode, request_parameters, requested_output_count, provider_billable_units,
    pricing_policy_revision_id, pricing_policy_revision, estimated_provider_expense_micros,
    provider_currency, customer_credit_charge, reservation_amount, request_fingerprint, effective_at, expires_at,
    pricing_contract_version, estimated_provider_expense_numerator, estimated_provider_expense_denominator,
    maximum_provider_expense_numerator, maximum_provider_expense_denominator,
    estimated_customer_credit_charge, maximum_customer_credit_charge
  ) values (
    p_quote_id, p_user_id, p_operation_id, p_tool, p_workspace_id, p_workpiece_id, v_policy.provider, v_policy.model,
    v_policy.media_kind, v_policy.generation_mode, p_request_parameters, p_requested_output_count,
    greatest(v_total_max_units, 1), v_policy.id, v_policy.revision,
    ceil(v_est_num / v_est_den)::bigint, v_policy.provider_currency, v_estimated_charge,
    p_reservation_amount, p_request_fingerprint, p_effective_at, p_expires_at, 'compound_v2',
    v_est_num::bigint, v_est_den::bigint, v_max_num::bigint, v_max_den::bigint,
    v_estimated_charge, v_maximum_charge
  ) returning * into v_quote;

  for v_row in select value from jsonb_array_elements(v_usage) loop
    select * into v_rate from tongs.ai_pricing_rate_components
      where pricing_policy_revision_id = v_policy.id and component_kind = btrim(v_row->>'component_kind');
    insert into tongs.ai_credit_quote_usage_components (
      quote_id, pricing_rate_component_id, component_kind, unit_kind,
      estimated_quantity, maximum_quantity, rate_numerator, rate_denominator, currency, content_hash
    ) values (
      v_quote.id, v_rate.id, v_rate.component_kind, v_rate.unit_kind,
      (v_row->>'estimated_quantity')::bigint, (v_row->>'maximum_quantity')::bigint,
      v_rate.rate_numerator, v_rate.rate_denominator, v_rate.currency,
      encode(extensions.digest(convert_to(jsonb_build_object(
        'quote_id', v_quote.id, 'pricing_rate_component_id', v_rate.id,
        'component_kind', v_rate.component_kind, 'unit_kind', v_rate.unit_kind,
        'estimated_quantity', (v_row->>'estimated_quantity')::bigint,
        'maximum_quantity', (v_row->>'maximum_quantity')::bigint,
        'rate_numerator', v_rate.rate_numerator, 'rate_denominator', v_rate.rate_denominator,
        'currency', v_rate.currency
      )::text, 'utf8'), 'sha256'), 'hex')
    );
  end loop;

  return jsonb_build_object(
    'quote', to_jsonb(v_quote),
    'usage_components', (select jsonb_agg(to_jsonb(c) order by c.component_kind) from tongs.ai_credit_quote_usage_components c where c.quote_id = v_quote.id),
    'replay', false
  );
end;
$$;

create or replace function tongs.read_ai_pricing_policy(p_pricing_policy_revision_id uuid)
returns jsonb
language sql
security definer
set search_path = pg_catalog
stable
as $$
  select jsonb_build_object(
    'revision', to_jsonb(r),
    'rate_components', coalesce((
      select jsonb_agg(to_jsonb(c) order by c.ordinal)
      from tongs.ai_pricing_rate_components c where c.pricing_policy_revision_id = r.id
    ), '[]'::jsonb)
  )
  from tongs.ai_pricing_policy_revisions r
  where r.id = p_pricing_policy_revision_id;
$$;

create or replace function tongs.resolve_active_compound_ai_pricing_policy(
  p_provider text,
  p_model text,
  p_model_snapshot text,
  p_media_kind text,
  p_endpoint text,
  p_size text,
  p_quality text,
  p_effective_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
stable
as $$
declare
  v_revision_id uuid;
  v_count integer;
begin
  select count(*), (array_agg(r.id order by r.id))[1]
    into v_count, v_revision_id
  from tongs.ai_pricing_policy_revisions r
  join tongs.ai_pricing_policy_sequences s on s.current_revision_id = r.id
  where r.pricing_contract_version = 'compound_v2'
    and r.is_active
    and r.provider = lower(btrim(p_provider))
    and r.model = btrim(p_model)
    and r.model_snapshot = btrim(p_model_snapshot)
    and r.media_kind = lower(btrim(p_media_kind))
    and r.endpoint = btrim(p_endpoint)
    and r.effective_from <= p_effective_at
    and (r.effective_through is null or r.effective_through > p_effective_at)
    and (r.billable_dimensions->'sizes') ? p_size
    and (r.billable_dimensions->'qualities') ? p_quality;
  if v_count = 0 then
    raise exception 'active compound pricing policy not found' using errcode = 'P0002';
  elsif v_count > 1 then
    raise exception 'ambiguous active compound pricing policy' using errcode = 'P0003';
  end if;
  return tongs.read_ai_pricing_policy(v_revision_id);
end;
$$;

create or replace function tongs.read_my_ai_credit_quote_v2(p_quote_id uuid)
returns jsonb
language sql
security definer
set search_path = pg_catalog
stable
as $$
  select jsonb_build_object(
    'quote', to_jsonb(q),
    'usage_components', coalesce((
      select jsonb_agg(to_jsonb(c) order by c.component_kind)
      from tongs.ai_credit_quote_usage_components c where c.quote_id = q.id
    ), '[]'::jsonb)
  )
  from tongs.ai_credit_quotes q
  where q.id = p_quote_id and q.user_id = auth.uid();
$$;

create trigger ai_pricing_rate_components_immutable
before update or delete on tongs.ai_pricing_rate_components
for each row execute function tongs._reject_financial_mutation();
create trigger ai_credit_quote_usage_components_immutable
before update or delete on tongs.ai_credit_quote_usage_components
for each row execute function tongs._reject_financial_mutation();

alter table tongs.ai_pricing_rate_components enable row level security;
alter table tongs.ai_credit_quote_usage_components enable row level security;
create policy ai_pricing_rate_components_read_authenticated
  on tongs.ai_pricing_rate_components for select to authenticated using (true);
create policy ai_credit_quote_usage_components_read_self
  on tongs.ai_credit_quote_usage_components for select to authenticated
  using (exists (select 1 from tongs.ai_credit_quotes q where q.id = quote_id and q.user_id = auth.uid()));

revoke all on tongs.ai_pricing_rate_components, tongs.ai_credit_quote_usage_components
  from public, anon, authenticated, service_role;
grant select on tongs.ai_pricing_rate_components to authenticated, service_role;
grant select on tongs.ai_credit_quote_usage_components to authenticated, service_role;

revoke all on function tongs.commit_compound_ai_pricing_policy_revision(text,integer,uuid,text,text,text,text,text,text,jsonb,jsonb,text,bigint,bigint,bigint,bigint,bigint,text,timestamptz,timestamptz,boolean,text,text,text,uuid)
  from public, anon, authenticated;
revoke all on function tongs.create_compound_ai_credit_quote(uuid,uuid,text,text,uuid,uuid,uuid,jsonb,integer,jsonb,bigint,text,timestamptz,timestamptz)
  from public, anon, authenticated;
grant execute on function tongs.commit_compound_ai_pricing_policy_revision(text,integer,uuid,text,text,text,text,text,text,jsonb,jsonb,text,bigint,bigint,bigint,bigint,bigint,text,timestamptz,timestamptz,boolean,text,text,text,uuid)
  to service_role;
grant execute on function tongs.create_compound_ai_credit_quote(uuid,uuid,text,text,uuid,uuid,uuid,jsonb,integer,jsonb,bigint,text,timestamptz,timestamptz)
  to service_role;
revoke all on function tongs.read_ai_pricing_policy(uuid), tongs.read_my_ai_credit_quote_v2(uuid),
  tongs.resolve_active_compound_ai_pricing_policy(text,text,text,text,text,text,text,timestamptz) from public, anon;
grant execute on function tongs.read_ai_pricing_policy(uuid),
  tongs.resolve_active_compound_ai_pricing_policy(text,text,text,text,text,text,text,timestamptz) to authenticated, service_role;
grant execute on function tongs.read_my_ai_credit_quote_v2(uuid) to authenticated, service_role;

-- First approved GPT Image 2 policy. Stable identities make clean/hosted replay auditable.
select tongs.commit_compound_ai_pricing_policy_revision(
  'openai:gpt-image-2-2026-04-21:images-generations:standard',
  0,
  '72000000-0000-4000-8000-000000000001'::uuid,
  'openai',
  'gpt-image-2',
  'gpt-image-2-2026-04-21',
  'image',
  'generation',
  '/v1/images/generations',
  jsonb_build_object(
    'sizes', jsonb_build_array('1024x1024', '1536x1024', '1024x1536'),
    'qualities', jsonb_build_array('low', 'medium', 'high'),
    'output_count_semantics', 'per_requested_image',
    'reservation_estimator_status', 'unavailable_pending_canonical_maximum_token_schedule'
  ),
  jsonb_build_array(
    jsonb_build_object('id','72000000-0000-4000-8000-000000000011','ordinal',1,'component_kind','text_input','unit_kind','token','rate_numerator',5,'rate_denominator',1,'currency','USD','metadata',jsonb_build_object('modality','text','cache_status','uncached')),
    jsonb_build_object('id','72000000-0000-4000-8000-000000000012','ordinal',2,'component_kind','cached_text_input','unit_kind','token','rate_numerator',5,'rate_denominator',4,'currency','USD','metadata',jsonb_build_object('modality','text','cache_status','cached')),
    jsonb_build_object('id','72000000-0000-4000-8000-000000000013','ordinal',3,'component_kind','image_input','unit_kind','token','rate_numerator',8,'rate_denominator',1,'currency','USD','metadata',jsonb_build_object('modality','image','cache_status','uncached')),
    jsonb_build_object('id','72000000-0000-4000-8000-000000000014','ordinal',4,'component_kind','cached_image_input','unit_kind','token','rate_numerator',2,'rate_denominator',1,'currency','USD','metadata',jsonb_build_object('modality','image','cache_status','cached')),
    jsonb_build_object('id','72000000-0000-4000-8000-000000000015','ordinal',5,'component_kind','image_output','unit_kind','token','rate_numerator',30,'rate_denominator',1,'currency','USD','metadata',jsonb_build_object('modality','image','direction','output'))
  ),
  'USD',
  140000,
  1000000,
  6,
  5,
  0,
  'ceiling_whole_credit',
  '2026-08-07T00:00:00Z'::timestamptz,
  null,
  true,
  'provider_documentation',
  'https://openai.com/api/pricing/; https://developers.openai.com/api/docs/models/gpt-image-2',
  'verified-2026-08-07; snapshot-2026-04-21',
  null
);

commit;
