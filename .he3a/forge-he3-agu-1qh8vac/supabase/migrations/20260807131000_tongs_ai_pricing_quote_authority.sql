-- Immutable AI pricing-policy revisions and pre-spend quote authority.
-- No commercial price is seeded here: activation requires operator-approved economics.

begin;

create table tongs.ai_pricing_policies (
  id uuid primary key default gen_random_uuid(),
  policy_code text not null unique,
  created_at timestamptz not null default now()
);

create table tongs.ai_pricing_policy_revisions (
  id uuid primary key default gen_random_uuid(),
  policy_id uuid not null references tongs.ai_pricing_policies(id) on delete restrict,
  revision integer not null check (revision > 0),
  previous_revision_id uuid references tongs.ai_pricing_policy_revisions(id) on delete restrict,
  provider text not null,
  model text not null,
  media_kind text not null check (media_kind in ('image', 'video', 'audio', 'text')),
  generation_mode text not null,
  billable_dimensions jsonb not null,
  provider_billing_unit text not null,
  provider_price_micros_per_unit bigint not null check (provider_price_micros_per_unit >= 0),
  provider_currency char(3) not null,
  forge_credit_conversion_numerator bigint not null check (forge_credit_conversion_numerator > 0),
  forge_credit_conversion_denominator bigint not null check (forge_credit_conversion_denominator > 0),
  markup_numerator bigint not null check (markup_numerator > 0),
  markup_denominator bigint not null check (markup_denominator > 0),
  addon_credits bigint not null default 0 check (addon_credits >= 0),
  effective_from timestamptz not null,
  effective_through timestamptz,
  is_active boolean not null,
  price_source_type text not null check (price_source_type in ('provider_documentation', 'contracted_rate', 'canonical_catalog', 'operator_entered')),
  price_source_reference text not null,
  price_source_version text,
  actor_id uuid references auth.users(id) on delete set null,
  content_hash text not null check (length(content_hash) = 64),
  created_at timestamptz not null default now(),
  unique (policy_id, revision),
  check (effective_through is null or effective_through > effective_from),
  check (jsonb_typeof(billable_dimensions) = 'object')
);

create table tongs.ai_pricing_policy_sequences (
  policy_id uuid primary key references tongs.ai_pricing_policies(id) on delete restrict,
  current_revision_id uuid not null references tongs.ai_pricing_policy_revisions(id) on delete restrict,
  current_revision integer not null check (current_revision > 0),
  updated_at timestamptz not null default now()
);

create table tongs.ai_credit_quotes (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete restrict,
  operation_id text not null,
  tool text not null,
  workspace_id uuid references tongs.workspaces(id) on delete restrict,
  workpiece_id uuid references tongs.episodes(id) on delete restrict,
  provider text not null,
  model text not null,
  media_kind text not null,
  generation_mode text not null,
  request_parameters jsonb not null,
  requested_output_count integer not null check (requested_output_count > 0),
  provider_billable_units bigint not null check (provider_billable_units > 0),
  pricing_policy_revision_id uuid not null references tongs.ai_pricing_policy_revisions(id) on delete restrict,
  pricing_policy_revision integer not null,
  estimated_provider_expense_micros bigint not null check (estimated_provider_expense_micros >= 0),
  provider_currency char(3) not null,
  customer_credit_charge bigint not null check (customer_credit_charge >= 0),
  reservation_amount bigint not null check (reservation_amount >= customer_credit_charge),
  request_fingerprint text not null check (length(request_fingerprint) = 64),
  effective_at timestamptz not null,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, operation_id),
  check (jsonb_typeof(request_parameters) = 'object'),
  check (expires_at is null or expires_at > effective_at)
);

create or replace function tongs.commit_ai_pricing_policy_revision(
  p_policy_code text,
  p_expected_revision integer,
  p_revision_id uuid,
  p_provider text,
  p_model text,
  p_media_kind text,
  p_generation_mode text,
  p_billable_dimensions jsonb,
  p_provider_billing_unit text,
  p_provider_price_micros_per_unit bigint,
  p_provider_currency text,
  p_forge_credit_conversion_numerator bigint,
  p_forge_credit_conversion_denominator bigint,
  p_markup_numerator bigint,
  p_markup_denominator bigint,
  p_addon_credits bigint,
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
begin
  if nullif(btrim(p_policy_code), '') is null or p_revision_id is null
     or p_provider_price_micros_per_unit < 0 or p_forge_credit_conversion_numerator <= 0
     or p_forge_credit_conversion_denominator <= 0 or p_markup_numerator <= 0 or p_markup_denominator <= 0
     or p_addon_credits < 0 or jsonb_typeof(p_billable_dimensions) <> 'object' then
    raise exception 'invalid pricing-policy revision' using errcode = '22023';
  end if;
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
  if found then return jsonb_build_object('policy', to_jsonb(v_policy), 'revision', to_jsonb(v_revision), 'replay', true); end if;
  v_next := coalesce(v_sequence.current_revision, 0) + 1;
  v_hash := encode(extensions.digest(convert_to(jsonb_build_object(
    'policy_id', v_policy.id, 'revision', v_next, 'provider', lower(btrim(p_provider)), 'model', btrim(p_model),
    'media_kind', lower(btrim(p_media_kind)), 'generation_mode', btrim(p_generation_mode),
    'billable_dimensions', p_billable_dimensions, 'provider_billing_unit', btrim(p_provider_billing_unit),
    'provider_price_micros_per_unit', p_provider_price_micros_per_unit, 'provider_currency', upper(btrim(p_provider_currency)),
    'forge_credit_conversion_numerator', p_forge_credit_conversion_numerator,
    'forge_credit_conversion_denominator', p_forge_credit_conversion_denominator,
    'markup_numerator', p_markup_numerator, 'markup_denominator', p_markup_denominator,
    'addon_credits', p_addon_credits, 'effective_from', p_effective_from, 'effective_through', p_effective_through,
    'is_active', p_is_active, 'price_source_type', p_price_source_type,
    'price_source_reference', p_price_source_reference, 'price_source_version', p_price_source_version
  )::text, 'utf8'), 'sha256'), 'hex');
  insert into tongs.ai_pricing_policy_revisions (
    id, policy_id, revision, previous_revision_id, provider, model, media_kind, generation_mode,
    billable_dimensions, provider_billing_unit, provider_price_micros_per_unit, provider_currency,
    forge_credit_conversion_numerator, forge_credit_conversion_denominator, markup_numerator, markup_denominator,
    addon_credits, effective_from, effective_through, is_active, price_source_type, price_source_reference,
    price_source_version, actor_id, content_hash
  ) values (
    p_revision_id, v_policy.id, v_next, v_sequence.current_revision_id, lower(btrim(p_provider)), btrim(p_model),
    lower(btrim(p_media_kind)), btrim(p_generation_mode), p_billable_dimensions, btrim(p_provider_billing_unit),
    p_provider_price_micros_per_unit, upper(btrim(p_provider_currency)), p_forge_credit_conversion_numerator,
    p_forge_credit_conversion_denominator, p_markup_numerator, p_markup_denominator, p_addon_credits,
    p_effective_from, p_effective_through, p_is_active, p_price_source_type, p_price_source_reference,
    p_price_source_version, p_actor_id, v_hash
  ) returning * into v_revision;
  insert into tongs.ai_pricing_policy_sequences values (v_policy.id, v_revision.id, v_revision.revision, now())
    on conflict (policy_id) do update set current_revision_id = excluded.current_revision_id,
      current_revision = excluded.current_revision, updated_at = now();
  return jsonb_build_object('policy', to_jsonb(v_policy), 'revision', to_jsonb(v_revision), 'replay', false);
end;
$$;

create or replace function tongs.create_ai_credit_quote(
  p_quote_id uuid,
  p_user_id uuid,
  p_operation_id text,
  p_tool text,
  p_workspace_id uuid,
  p_workpiece_id uuid,
  p_pricing_policy_revision_id uuid,
  p_request_parameters jsonb,
  p_requested_output_count integer,
  p_provider_billable_units bigint,
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
  v_expense numeric;
  v_charge numeric;
  v_expected_fingerprint text;
begin
  select * into v_policy from tongs.ai_pricing_policy_revisions where id = p_pricing_policy_revision_id;
  if not found then raise exception 'pricing-policy revision not found' using errcode = 'P0002'; end if;
  select * into v_sequence from tongs.ai_pricing_policy_sequences where policy_id = v_policy.policy_id;
  if not found or v_sequence.current_revision_id <> v_policy.id or not v_policy.is_active
     or p_effective_at < v_policy.effective_from
     or (v_policy.effective_through is not null and p_effective_at >= v_policy.effective_through) then
    raise exception 'pricing-policy revision is not currently active' using errcode = 'P0001';
  end if;
  v_expense := p_provider_billable_units::numeric * v_policy.provider_price_micros_per_unit::numeric;
  v_charge := ceil(
    v_expense * v_policy.forge_credit_conversion_numerator::numeric * v_policy.markup_numerator::numeric
    / (v_policy.forge_credit_conversion_denominator::numeric * v_policy.markup_denominator::numeric)
  ) + v_policy.addon_credits;
  v_expected_fingerprint := encode(extensions.digest(convert_to(jsonb_build_object(
    'user_id', p_user_id, 'operation_id', p_operation_id, 'tool', p_tool,
    'workspace_id', p_workspace_id, 'workpiece_id', p_workpiece_id,
    'provider', v_policy.provider, 'model', v_policy.model, 'media_kind', v_policy.media_kind,
    'generation_mode', v_policy.generation_mode, 'request_parameters', p_request_parameters,
    'requested_output_count', p_requested_output_count, 'provider_billable_units', p_provider_billable_units,
    'pricing_policy_revision_id', v_policy.id, 'pricing_policy_revision', v_policy.revision
  )::text, 'utf8'), 'sha256'), 'hex');
  if p_request_fingerprint <> v_expected_fingerprint then raise exception 'quote fingerprint mismatch' using errcode = '22023'; end if;
  if p_reservation_amount < v_charge then raise exception 'reservation amount below quoted charge' using errcode = '22023'; end if;
  select * into v_quote from tongs.ai_credit_quotes where user_id = p_user_id and operation_id = p_operation_id;
  if found then
    if v_quote.id <> p_quote_id or v_quote.request_fingerprint <> p_request_fingerprint
       or v_quote.pricing_policy_revision_id <> p_pricing_policy_revision_id then
      raise exception 'quote replay conflict' using errcode = '23505';
    end if;
    return jsonb_build_object('quote', to_jsonb(v_quote), 'replay', true);
  end if;
  insert into tongs.ai_credit_quotes (
    id, user_id, operation_id, tool, workspace_id, workpiece_id, provider, model, media_kind,
    generation_mode, request_parameters, requested_output_count, provider_billable_units,
    pricing_policy_revision_id, pricing_policy_revision, estimated_provider_expense_micros,
    provider_currency, customer_credit_charge, reservation_amount, request_fingerprint, effective_at, expires_at
  ) values (
    p_quote_id, p_user_id, p_operation_id, p_tool, p_workspace_id, p_workpiece_id, v_policy.provider, v_policy.model,
    v_policy.media_kind, v_policy.generation_mode, p_request_parameters, p_requested_output_count,
    p_provider_billable_units, v_policy.id, v_policy.revision, v_expense::bigint, v_policy.provider_currency,
    v_charge::bigint, p_reservation_amount, p_request_fingerprint, p_effective_at, p_expires_at
  ) returning * into v_quote;
  return jsonb_build_object('quote', to_jsonb(v_quote), 'replay', false);
end;
$$;

create or replace function tongs.read_active_ai_pricing_policies()
returns setof tongs.ai_pricing_policy_revisions
language sql
security definer
set search_path = pg_catalog
stable
as $$
  select r.* from tongs.ai_pricing_policy_revisions r
  join tongs.ai_pricing_policy_sequences s on s.current_revision_id = r.id
  where r.is_active and r.effective_from <= now()
    and (r.effective_through is null or r.effective_through > now())
  order by r.provider, r.model, r.media_kind, r.generation_mode;
$$;

create or replace function tongs.read_my_ai_credit_quote(p_quote_id uuid)
returns tongs.ai_credit_quotes
language sql
security definer
set search_path = pg_catalog
stable
as $$ select * from tongs.ai_credit_quotes where id = p_quote_id and user_id = auth.uid(); $$;

create trigger ai_pricing_policies_immutable before update or delete on tongs.ai_pricing_policies
for each row execute function tongs._reject_financial_mutation();
create trigger ai_pricing_policy_revisions_immutable before update or delete on tongs.ai_pricing_policy_revisions
for each row execute function tongs._reject_financial_mutation();
create trigger ai_credit_quotes_immutable before update or delete on tongs.ai_credit_quotes
for each row execute function tongs._reject_financial_mutation();

alter table tongs.ai_pricing_policies enable row level security;
alter table tongs.ai_pricing_policy_revisions enable row level security;
alter table tongs.ai_pricing_policy_sequences enable row level security;
alter table tongs.ai_credit_quotes enable row level security;
create policy ai_pricing_revisions_read_authenticated on tongs.ai_pricing_policy_revisions for select to authenticated using (true);
create policy ai_credit_quotes_read_self on tongs.ai_credit_quotes for select to authenticated using (user_id = auth.uid());
revoke all on tongs.ai_pricing_policies, tongs.ai_pricing_policy_revisions, tongs.ai_pricing_policy_sequences, tongs.ai_credit_quotes from public, anon, authenticated, service_role;
grant select on tongs.ai_pricing_policy_revisions to authenticated;
grant select on tongs.ai_credit_quotes to authenticated;
grant select on tongs.ai_pricing_policies, tongs.ai_pricing_policy_revisions, tongs.ai_pricing_policy_sequences, tongs.ai_credit_quotes to service_role;
revoke all on function tongs.commit_ai_pricing_policy_revision(text,integer,uuid,text,text,text,text,jsonb,text,bigint,text,bigint,bigint,bigint,bigint,bigint,timestamptz,timestamptz,boolean,text,text,text,uuid) from public, anon, authenticated;
revoke all on function tongs.create_ai_credit_quote(uuid,uuid,text,text,uuid,uuid,uuid,jsonb,integer,bigint,bigint,text,timestamptz,timestamptz) from public, anon, authenticated;
grant execute on function tongs.commit_ai_pricing_policy_revision(text,integer,uuid,text,text,text,text,jsonb,text,bigint,text,bigint,bigint,bigint,bigint,bigint,timestamptz,timestamptz,boolean,text,text,text,uuid) to service_role;
grant execute on function tongs.create_ai_credit_quote(uuid,uuid,text,text,uuid,uuid,uuid,jsonb,integer,bigint,bigint,text,timestamptz,timestamptz) to service_role;
revoke all on function tongs.read_active_ai_pricing_policies() from public, anon;
revoke all on function tongs.read_my_ai_credit_quote(uuid) from public, anon;
grant execute on function tongs.read_active_ai_pricing_policies() to authenticated, service_role;
grant execute on function tongs.read_my_ai_credit_quote(uuid) to authenticated, service_role;

commit;
