-- Complete-request binding, durable cost tails, and conservative aggregate
-- exposure repair. This migration activates no price, budget, assignment,
-- provider credential, rollout, or paid execution.
begin;

create table tongs.bounded_provider_quote_request_bindings (
  quote_id uuid primary key references tongs.customer_spending_quotes(id) on delete restrict,
  route_code text not null,
  operation_id text not null,
  request_fingerprint text not null check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  model text not null,
  service_tier text not null,
  pricing_revision_id uuid not null references tongs.private_pricing_revisions(id) on delete restrict,
  estimator_revision text not null,
  tokenizer_revision text not null,
  serialized_body_sha256 text not null check (serialized_body_sha256 ~ '^[0-9a-f]{64}$'),
  serialized_bytes bigint not null check (serialized_bytes > 0),
  tokenizer_input_tokens bigint not null check (tokenizer_input_tokens > 0),
  protocol_overhead_tokens bigint not null check (protocol_overhead_tokens >= 0),
  utf8_byte_token_upper_bound bigint not null check (utf8_byte_token_upper_bound = serialized_bytes),
  bounded_input_tokens bigint not null check (bounded_input_tokens > 0),
  maximum_output_tokens bigint not null check (maximum_output_tokens > 0),
  maximum_attempts smallint not null check (maximum_attempts between 1 and 4),
  created_at timestamptz not null default now(),
  check (bounded_input_tokens = greatest(tokenizer_input_tokens + protocol_overhead_tokens, utf8_byte_token_upper_bound))
);

create table tongs.bounded_provider_request_bindings (
  reservation_id uuid primary key references tongs.funding_reservations(id) on delete restrict,
  quote_id uuid not null references tongs.customer_spending_quotes(id) on delete restrict,
  operation_id text not null,
  route_code text not null,
  request_fingerprint text not null check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  model text not null,
  service_tier text not null,
  pricing_revision_id uuid not null references tongs.private_pricing_revisions(id) on delete restrict,
  accepted_authority_hash text not null check (accepted_authority_hash ~ '^[0-9a-f]{64}$'),
  retention_policy_hash text not null check (retention_policy_hash ~ '^[0-9a-f]{64}$'),
  estimator_revision text not null,
  tokenizer_revision text not null,
  serialized_body_sha256 text not null check (serialized_body_sha256 ~ '^[0-9a-f]{64}$'),
  serialized_bytes bigint not null check (serialized_bytes > 0),
  tokenizer_input_tokens bigint not null check (tokenizer_input_tokens > 0),
  protocol_overhead_tokens bigint not null check (protocol_overhead_tokens >= 0),
  utf8_byte_token_upper_bound bigint not null check (utf8_byte_token_upper_bound > 0),
  bounded_input_tokens bigint not null check (bounded_input_tokens > 0),
  maximum_output_tokens bigint not null check (maximum_output_tokens > 0),
  maximum_attempts smallint not null check (maximum_attempts between 1 and 4),
  created_at timestamptz not null default now(),
  check (serialized_bytes = utf8_byte_token_upper_bound),
  check (bounded_input_tokens = greatest(tokenizer_input_tokens + protocol_overhead_tokens, utf8_byte_token_upper_bound))
);

create table tongs.paid_operation_tail_obligation_events (
  id uuid primary key,
  reservation_id uuid not null references tongs.funding_reservations(id) on delete restrict,
  sequence integer not null check (sequence > 0),
  event_key text not null unique check (length(btrim(event_key)) between 8 and 300),
  artifact_class text not null check (artifact_class in (
    'canonical_content','provider_evidence','accounting_evidence','disposable_delivery'
  )),
  lifecycle_state text not null check (lifecycle_state in (
    'opened','plan_funded','owner_testing_funded','funding_unresolved','resolved','closed'
  )),
  estimated_amount_micros bigint check (estimated_amount_micros is null or estimated_amount_micros >= 0),
  retained_bytes bigint check (retained_bytes is null or retained_bytes >= 0),
  coverage_ends_at timestamptz,
  retention_reason text not null check (length(btrim(retention_reason)) between 3 and 500),
  evidence_json jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence_json) = 'object'),
  created_at timestamptz not null default now(),
  unique (reservation_id, sequence)
);

create table tongs.aggregate_financial_halt_events (
  id uuid primary key,
  policy_revision_id uuid not null references tongs.restricted_beta_policy_revisions(id) on delete restrict,
  event_key text not null unique check (length(btrim(event_key)) between 8 and 300),
  reason text not null check (length(btrim(reason)) between 3 and 500),
  committed_micros bigint not null check (committed_micros >= 0),
  configured_limit_micros bigint not null check (configured_limit_micros > 0),
  evidence_json jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence_json) = 'object'),
  created_at timestamptz not null default now()
);

create table tongs.aggregate_exposure_opening_commitments (
  hold_id uuid primary key references tongs.restricted_beta_exposure_holds(id) on delete restrict,
  policy_revision_id uuid not null references tongs.restricted_beta_policy_revisions(id) on delete restrict,
  captured_state text not null,
  captured_ceiling_micros bigint not null check (captured_ceiling_micros >= 0),
  captured_at timestamptz not null default now()
);

alter table tongs.restricted_beta_exposure_events
  add column remaining_exposure_micros bigint check (remaining_exposure_micros is null or remaining_exposure_micros >= 0),
  add column exposure_adjustment_micros bigint;

alter table tongs.restricted_beta_exposure_events
  drop constraint restricted_beta_exposure_events_event_type_check;
alter table tongs.restricted_beta_exposure_events
  add constraint restricted_beta_exposure_events_event_type_check check(event_type in (
    'reserved','attempt_started','ambiguous','customer_relieved_supplier_obligation',
    'settled_unconfirmed','reconciliation_partial','supplier_recovery','released','reconciled',
    'realized_estimate','reconciliation_risk','authoritative_adjustment','tail_obligation','halt_new'
  ));

alter table tongs.restricted_beta_tail_policy_revisions
  add column funding_treatment_json jsonb not null default '{}'::jsonb
    check (jsonb_typeof(funding_treatment_json) = 'object');

insert into tongs.restricted_beta_tail_policy_revisions(
  id,revision,lifecycle_state,first_period_days,first_period_storage_ceiling_bytes,
  after_first_period_policy,warning_threshold_basis_points,halt_threshold_basis_points,
  deletion_on_threshold,notes,funding_treatment_json
) values(
  '53000000-0000-4000-8000-000000000003',3,'draft',30,1048576,'unfunded_block',7000,8000,false,
  'Non-spending repair: continuing costs remain explicit and block activation until a funded allocation is selected.',
  jsonb_build_object(
    'canonical_content','plan_allocation_or_owner_testing_context_required',
    'provider_evidence','reconciliation_tail_owner_overhead_until_resolved',
    'accounting_evidence','platform_accounting_overhead',
    'disposable_delivery','first_30_days_then_minimize_only_after_obligations_resolve'
  )
);

do $$ declare n text; begin
  foreach n in array array[
    'bounded_provider_quote_request_bindings','bounded_provider_request_bindings','paid_operation_tail_obligation_events',
    'aggregate_financial_halt_events','aggregate_exposure_opening_commitments'
  ] loop
    execute format('alter table tongs.%I enable row level security',n);
    execute format('alter table tongs.%I force row level security',n);
    execute format('revoke all on tongs.%I from public,anon,authenticated,service_role',n);
    execute format('grant select,insert on tongs.%I to service_role',n);
    execute format('create trigger %I_immutable before update or delete on tongs.%I for each row execute function tongs._reject_accounting_mutation()',n,n);
  end loop;
end $$;

insert into tongs.aggregate_exposure_opening_commitments(
  hold_id,policy_revision_id,captured_state,captured_ceiling_micros
)
select h.id,h.policy_revision_id,last_event.event_type,
  h.supplier_exposure_ceiling_micros+h.supporting_exposure_ceiling_micros+
  h.tail_exposure_ceiling_micros+h.unreconciled_exposure_ceiling_micros+
  h.retry_exposure_ceiling_micros
from tongs.restricted_beta_exposure_holds h
join lateral(
  select e.event_type from tongs.restricted_beta_exposure_events e
  where e.hold_id=h.id order by e.sequence desc limit 1
) last_event on true
where last_event.event_type not in ('released','reconciled')
on conflict(hold_id) do nothing;

create or replace function tongs.read_openai_text_quote_bounding_context(
  p_quote_id uuid,p_user_id uuid,p_operation_id text,p_route_code text,p_request_fingerprint text
) returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare quote_binding tongs.openai_text_customer_quote_bindings%rowtype;
  cost_policy tongs.openai_text_cost_policy_revisions%rowtype;
begin
  perform tongs._require_pricing_service_role();
  select * into quote_binding from tongs.openai_text_customer_quote_bindings where quote_id=p_quote_id;
  if quote_binding.quote_id is null or quote_binding.user_id<>p_user_id
     or quote_binding.canonical_operation_id<>btrim(p_operation_id)
     or quote_binding.route_code<>p_route_code
     or quote_binding.request_fingerprint<>p_request_fingerprint then
    raise exception 'bounded quote context does not match operation authority' using errcode='42501';
  end if;
  select * into cost_policy from tongs.openai_text_cost_policy_revisions where id=quote_binding.cost_policy_revision_id;
  if cost_policy.id is null then raise exception 'bounded quote cost policy missing' using errcode='P0001'; end if;
  return jsonb_build_object(
    'model',quote_binding.runtime_model,
    'maximum_input_units',cost_policy.maximum_input_units,
    'maximum_output_units',cost_policy.maximum_output_units,
    'maximum_attempts',cost_policy.maximum_attempts,
    'pricing_revision_id',quote_binding.pricing_revision_id,
    'cost_policy_revision_id',quote_binding.cost_policy_revision_id
  );
end $$;

create or replace function tongs.bind_bounded_provider_quote_request(
  p_quote_id uuid,p_user_id uuid,p_operation_id text,p_route_code text,p_request_fingerprint text,p_model text,
  p_service_tier text,p_estimator_revision text,p_tokenizer_revision text,
  p_serialized_body_sha256 text,p_serialized_bytes bigint,p_tokenizer_input_tokens bigint,
  p_protocol_overhead_tokens bigint,p_utf8_byte_token_upper_bound bigint,
  p_bounded_input_tokens bigint,p_maximum_output_tokens bigint,p_maximum_attempts smallint
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare existing tongs.bounded_provider_quote_request_bindings%rowtype;
  quote_binding tongs.openai_text_customer_quote_bindings%rowtype;
  cost_policy tongs.openai_text_cost_policy_revisions%rowtype;
begin
  perform tongs._require_pricing_service_role();
  if p_serialized_body_sha256 !~ '^[0-9a-f]{64}$' or p_request_fingerprint !~ '^[0-9a-f]{64}$'
     or p_serialized_bytes<=0 or p_tokenizer_input_tokens<=0 or p_protocol_overhead_tokens<0
     or p_utf8_byte_token_upper_bound<>p_serialized_bytes
     or p_bounded_input_tokens<>greatest(p_tokenizer_input_tokens+p_protocol_overhead_tokens,p_utf8_byte_token_upper_bound)
     or p_maximum_output_tokens<=0 or p_maximum_attempts not between 1 and 4 then
    raise exception 'invalid bounded quote request evidence' using errcode='22023';
  end if;
  select * into quote_binding from tongs.openai_text_customer_quote_bindings where quote_id=p_quote_id;
  select * into cost_policy from tongs.openai_text_cost_policy_revisions where id=quote_binding.cost_policy_revision_id;
  if quote_binding.quote_id is null or quote_binding.user_id<>p_user_id
     or quote_binding.canonical_operation_id<>btrim(p_operation_id)
     or quote_binding.route_code<>p_route_code or quote_binding.request_fingerprint<>p_request_fingerprint
     or quote_binding.runtime_model<>p_model or cost_policy.id is null
     or cost_policy.maximum_input_units<p_bounded_input_tokens
     or cost_policy.maximum_output_units<>p_maximum_output_tokens
     or cost_policy.maximum_attempts<>p_maximum_attempts then
    raise exception 'bounded request does not match quote limits' using errcode='42501';
  end if;
  select * into existing from tongs.bounded_provider_quote_request_bindings where quote_id=p_quote_id;
  if found then
    if existing.serialized_body_sha256<>p_serialized_body_sha256
       or existing.request_fingerprint<>p_request_fingerprint or existing.model<>p_model
       or existing.estimator_revision<>p_estimator_revision or existing.tokenizer_revision<>p_tokenizer_revision
       or existing.bounded_input_tokens<>p_bounded_input_tokens
       or existing.maximum_output_tokens<>p_maximum_output_tokens
       or existing.maximum_attempts<>p_maximum_attempts then
      raise exception 'bounded provider quote request replay conflict' using errcode='23505';
    end if;
    return to_jsonb(existing)||jsonb_build_object('replay',true);
  end if;
  insert into tongs.bounded_provider_quote_request_bindings(
    quote_id,route_code,operation_id,request_fingerprint,model,service_tier,pricing_revision_id,
    estimator_revision,tokenizer_revision,serialized_body_sha256,serialized_bytes,
    tokenizer_input_tokens,protocol_overhead_tokens,utf8_byte_token_upper_bound,bounded_input_tokens,
    maximum_output_tokens,maximum_attempts
  ) values(
    p_quote_id,p_route_code,btrim(p_operation_id),p_request_fingerprint,p_model,btrim(p_service_tier),
    quote_binding.pricing_revision_id,btrim(p_estimator_revision),btrim(p_tokenizer_revision),
    lower(p_serialized_body_sha256),p_serialized_bytes,p_tokenizer_input_tokens,p_protocol_overhead_tokens,
    p_utf8_byte_token_upper_bound,p_bounded_input_tokens,p_maximum_output_tokens,p_maximum_attempts
  ) returning * into existing;
  return to_jsonb(existing)||jsonb_build_object('replay',false);
end $$;

create or replace function tongs.bind_bounded_provider_request(
  p_reservation_id uuid,p_route_code text,p_request_fingerprint text,p_model text,
  p_service_tier text,p_estimator_revision text,p_tokenizer_revision text,
  p_serialized_body_sha256 text,p_serialized_bytes bigint,p_tokenizer_input_tokens bigint,
  p_protocol_overhead_tokens bigint,p_utf8_byte_token_upper_bound bigint,
  p_bounded_input_tokens bigint,p_maximum_output_tokens bigint,p_maximum_attempts smallint
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare existing tongs.bounded_provider_request_bindings%rowtype;
  binding tongs.openai_text_funding_bindings%rowtype;
  reservation tongs.funding_reservations%rowtype;
  quote tongs.customer_spending_quotes%rowtype;
  authority tongs.spending_quote_authority_bindings%rowtype;
  quote_request tongs.bounded_provider_quote_request_bindings%rowtype;
  retention_hash text;
begin
  perform tongs._require_pricing_service_role();
  if p_serialized_body_sha256 !~ '^[0-9a-f]{64}$' or p_request_fingerprint !~ '^[0-9a-f]{64}$'
     or p_serialized_bytes<=0 or p_tokenizer_input_tokens<=0 or p_protocol_overhead_tokens<0
     or p_utf8_byte_token_upper_bound<>p_serialized_bytes
     or p_bounded_input_tokens<>greatest(p_tokenizer_input_tokens+p_protocol_overhead_tokens,p_utf8_byte_token_upper_bound)
     or p_maximum_output_tokens<=0 or p_maximum_attempts not between 1 and 4 then
    raise exception 'invalid bounded provider request evidence' using errcode='22023';
  end if;
  select * into binding from tongs.openai_text_funding_bindings where reservation_id=p_reservation_id;
  select * into reservation from tongs.funding_reservations where id=p_reservation_id;
  if binding.reservation_id is null or reservation.id is null or binding.route_code<>p_route_code
     or binding.model<>p_model or binding.maximum_input_units<p_bounded_input_tokens
     or binding.maximum_output_units<>p_maximum_output_tokens or binding.maximum_attempts<>p_maximum_attempts then
    raise exception 'bounded request does not match accepted funding limits' using errcode='42501';
  end if;
  select * into quote from tongs.customer_spending_quotes where id=reservation.quote_id;
  select * into authority from tongs.spending_quote_authority_bindings where quote_id=quote.id;
  select * into quote_request from tongs.bounded_provider_quote_request_bindings where quote_id=quote.id;
  if quote.id is null or authority.quote_id is null or quote.request_fingerprint<>p_request_fingerprint
     or binding.pricing_revision_id<>quote.pricing_revision_id or quote_request.quote_id is null
     or quote_request.serialized_body_sha256<>p_serialized_body_sha256
     or quote_request.estimator_revision<>p_estimator_revision
     or quote_request.tokenizer_revision<>p_tokenizer_revision
     or quote_request.bounded_input_tokens<>p_bounded_input_tokens
     or quote_request.maximum_output_tokens<>p_maximum_output_tokens
     or quote_request.maximum_attempts<>p_maximum_attempts then
    raise exception 'bounded request does not match accepted quote authority' using errcode='42501';
  end if;
  retention_hash:=encode(extensions.digest(convert_to(quote.retention_policy::text,'utf8'),'sha256'),'hex');
  select * into existing from tongs.bounded_provider_request_bindings where reservation_id=p_reservation_id;
  if found then
    if existing.serialized_body_sha256<>p_serialized_body_sha256 or existing.request_fingerprint<>p_request_fingerprint
       or existing.model<>p_model or existing.estimator_revision<>p_estimator_revision
       or existing.tokenizer_revision<>p_tokenizer_revision or existing.bounded_input_tokens<>p_bounded_input_tokens
       or existing.maximum_output_tokens<>p_maximum_output_tokens or existing.maximum_attempts<>p_maximum_attempts
       or existing.accepted_authority_hash<>authority.accepted_authority_hash then
      raise exception 'bounded provider request replay conflict' using errcode='23505';
    end if;
    return to_jsonb(existing)||jsonb_build_object('replay',true);
  end if;
  insert into tongs.bounded_provider_request_bindings(
    reservation_id,quote_id,operation_id,route_code,request_fingerprint,model,service_tier,
    pricing_revision_id,accepted_authority_hash,retention_policy_hash,estimator_revision,
    tokenizer_revision,serialized_body_sha256,serialized_bytes,tokenizer_input_tokens,
    protocol_overhead_tokens,utf8_byte_token_upper_bound,bounded_input_tokens,
    maximum_output_tokens,maximum_attempts
  ) values(
    p_reservation_id,quote.id,reservation.operation_id,p_route_code,p_request_fingerprint,p_model,
    btrim(p_service_tier),quote.pricing_revision_id,authority.accepted_authority_hash,retention_hash,
    btrim(p_estimator_revision),btrim(p_tokenizer_revision),lower(p_serialized_body_sha256),
    p_serialized_bytes,p_tokenizer_input_tokens,p_protocol_overhead_tokens,
    p_utf8_byte_token_upper_bound,p_bounded_input_tokens,p_maximum_output_tokens,p_maximum_attempts
  ) returning * into existing;
  return to_jsonb(existing)||jsonb_build_object('replay',false);
end $$;

create or replace function tongs.record_paid_operation_tail_obligation(
  p_id uuid,p_reservation_id uuid,p_event_key text,p_artifact_class text,p_lifecycle_state text,
  p_estimated_amount_micros bigint,p_retained_bytes bigint,p_coverage_ends_at timestamptz,
  p_retention_reason text,p_evidence_json jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare existing tongs.paid_operation_tail_obligation_events%rowtype;
begin
  perform tongs._require_pricing_service_role();
  select * into existing from tongs.paid_operation_tail_obligation_events where event_key=btrim(p_event_key);
  if found then return to_jsonb(existing)||jsonb_build_object('replay',true); end if;
  if not exists(select 1 from tongs.funding_reservations where id=p_reservation_id) then
    raise exception 'unknown funding reservation' using errcode='22023'; end if;
  insert into tongs.paid_operation_tail_obligation_events(
    id,reservation_id,sequence,event_key,artifact_class,lifecycle_state,estimated_amount_micros,
    retained_bytes,coverage_ends_at,retention_reason,evidence_json
  ) select p_id,p_reservation_id,coalesce(max(sequence),0)+1,btrim(p_event_key),p_artifact_class,
    p_lifecycle_state,p_estimated_amount_micros,p_retained_bytes,p_coverage_ends_at,
    btrim(p_retention_reason),coalesce(p_evidence_json,'{}'::jsonb)
    from tongs.paid_operation_tail_obligation_events where reservation_id=p_reservation_id
    returning * into existing;
  return to_jsonb(existing)||jsonb_build_object('replay',false);
end $$;

create or replace function tongs._open_paid_operation_tail_obligations()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
declare reservation tongs.funding_reservations%rowtype; class record;
begin
  if new.event_type<>'settled' then return new; end if;
  select * into reservation from tongs.funding_reservations where id=new.reservation_id;
  for class in select * from (values
    ('canonical_content',case when reservation.funding_source_type='owner_budget' then 'owner_testing_funded' else 'funding_unresolved' end,
      'Canonical creator content follows the product lifecycle; funding after day 30 requires a recorded plan allocation or owner-testing context.',null::timestamptz),
    ('provider_evidence',case when reservation.funding_source_type='owner_budget' then 'owner_testing_funded' else 'funding_unresolved' end,
      'Provider evidence remains retained while reconciliation, recovery, dispute, or legal obligations are unresolved.',null::timestamptz),
    ('accounting_evidence','plan_funded','Append-only accounting evidence is retained as explicit platform accounting overhead.',null::timestamptz),
    ('disposable_delivery','opened','Disposable delivery data is covered for 30 days and may be minimized only after every obligation resolves.',new.created_at+interval '30 days')
  ) as v(artifact_class,lifecycle_state,retention_reason,coverage_ends_at)
  loop
    insert into tongs.paid_operation_tail_obligation_events(
      id,reservation_id,sequence,event_key,artifact_class,lifecycle_state,coverage_ends_at,
      retention_reason,evidence_json
    ) select extensions.uuid_generate_v5(new.reservation_id,'tail-open:'||class.artifact_class),
      new.reservation_id,coalesce(max(sequence),0)+1,
      'tail-open:'||new.reservation_id::text||':'||class.artifact_class,
      class.artifact_class,class.lifecycle_state,class.coverage_ends_at,class.retention_reason,
      jsonb_build_object('source','settlement_tail_opening','funding_source_type',reservation.funding_source_type,
        'cost_status',case when class.lifecycle_state='funding_unresolved' then 'incomplete' else 'classified_not_measured' end)
    from tongs.paid_operation_tail_obligation_events where reservation_id=new.reservation_id
    on conflict(event_key) do nothing;
  end loop;
  return new;
end $$;

create trigger funding_reservation_settlement_tail_opening
after insert on tongs.funding_reservation_events
for each row execute function tongs._open_paid_operation_tail_obligations();

with settled as (
  select distinct on (e.reservation_id) e.reservation_id,e.created_at,r.funding_source_type
  from tongs.funding_reservation_events e
  join tongs.funding_reservations r on r.id=e.reservation_id
  where e.event_type='settled' order by e.reservation_id,e.sequence desc
), classes as (
  select * from (values
    (1,'canonical_content','Canonical creator content follows the product lifecycle; funding after day 30 requires a recorded plan allocation or owner-testing context.'),
    (2,'provider_evidence','Provider evidence remains retained while reconciliation, recovery, dispute, or legal obligations are unresolved.'),
    (3,'accounting_evidence','Append-only accounting evidence is retained as explicit platform accounting overhead.'),
    (4,'disposable_delivery','Disposable delivery data is covered for 30 days and may be minimized only after every obligation resolves.')
  ) as v(sequence,artifact_class,retention_reason)
)
insert into tongs.paid_operation_tail_obligation_events(
  id,reservation_id,sequence,event_key,artifact_class,lifecycle_state,coverage_ends_at,
  retention_reason,evidence_json
)
select extensions.uuid_generate_v5(s.reservation_id,'tail-open:'||c.artifact_class),s.reservation_id,c.sequence,
  'tail-open:'||s.reservation_id::text||':'||c.artifact_class,c.artifact_class,
  case when c.artifact_class='accounting_evidence' then 'plan_funded'
       when c.artifact_class='disposable_delivery' then 'opened'
       when s.funding_source_type='owner_budget' then 'owner_testing_funded'
       else 'funding_unresolved' end,
  case when c.artifact_class='disposable_delivery' then s.created_at+interval '30 days' else null end,
  c.retention_reason,jsonb_build_object('source','migration_tail_opening','funding_source_type',s.funding_source_type,
    'cost_status',case when c.artifact_class in ('canonical_content','provider_evidence') and s.funding_source_type<>'owner_budget'
      then 'incomplete' else 'classified_not_measured' end)
from settled s cross join classes c
on conflict(event_key) do nothing;

-- Commitment is environment-wide across policy revisions. This prevents a new
-- revision, lease expiry, or rolling-window boundary from hiding unresolved
-- obligations created by an earlier revision.
create or replace function tongs._restricted_beta_policy_commitment(p_policy_revision_id uuid)
returns table(committed_micros bigint,outstanding_count bigint)
language sql stable security definer set search_path=pg_catalog as $$
 with selected_policy as (
  select * from tongs.restricted_beta_policy_revisions where id=p_policy_revision_id
 ), facts as (
  select h.*,old_policy.environment,
   (select e.event_type from tongs.restricted_beta_exposure_events e where e.hold_id=h.id order by e.sequence desc limit 1) last_type,
   (select e.remaining_exposure_micros from tongs.restricted_beta_exposure_events e where e.hold_id=h.id and e.remaining_exposure_micros is not null order by e.sequence desc limit 1) remaining_exposure,
   (select e.supplier_obligation_micros from tongs.restricted_beta_exposure_events e where e.hold_id=h.id and e.event_type='reconciled' order by e.sequence desc limit 1) reconciled_supplier,
   (select e.supplier_obligation_micros from tongs.restricted_beta_exposure_events e where e.hold_id=h.id and e.event_type='reconciliation_partial' order by e.sequence desc limit 1) partial_supplier,
   (select e.created_at from tongs.restricted_beta_exposure_events e where e.hold_id=h.id and e.event_type='attempt_started' order by e.sequence limit 1) incurred_at,
   (select coalesce(sum(e.supplier_recovery_micros),0) from tongs.restricted_beta_exposure_events e where e.hold_id=h.id and e.event_type='supplier_recovery') recovered
  from tongs.restricted_beta_exposure_holds h
  join tongs.restricted_beta_policy_revisions old_policy on old_policy.id=h.policy_revision_id
  where old_policy.environment=(select environment from selected_policy)
 ), amounts as (
  select f.*,
   case
    when f.last_type='released' then 0
    when f.remaining_exposure is not null then greatest(f.remaining_exposure-f.recovered,0)
    when f.reconciled_supplier is not null then case
      when coalesce(f.incurred_at,f.created_at)>=now()-make_interval(secs=>(select rolling_window_seconds from selected_policy))
      then greatest(f.reconciled_supplier-f.recovered,0) else 0 end
    when f.partial_supplier is not null then greatest(f.partial_supplier-f.recovered,0)+
      f.supporting_exposure_ceiling_micros+f.tail_exposure_ceiling_micros+
      f.unreconciled_exposure_ceiling_micros+f.retry_exposure_ceiling_micros
    else f.supplier_exposure_ceiling_micros+f.supporting_exposure_ceiling_micros+
      f.tail_exposure_ceiling_micros+f.unreconciled_exposure_ceiling_micros+
      f.retry_exposure_ceiling_micros
   end amount
  from facts f
 )
 select coalesce(sum(amount),0)::bigint,
   coalesce(count(*) filter(where amount>0 and last_type<>'reconciled'),0)::bigint
 from amounts;
$$;

create or replace function tongs._maybe_halt_restricted_beta_policy(
  p_policy_revision_id uuid,p_event_key text,p_evidence_json jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare policy tongs.restricted_beta_policy_revisions%rowtype; committed bigint; outstanding bigint;
  existing tongs.aggregate_financial_halt_events%rowtype;
begin
  perform tongs._require_pricing_service_role();
  select * into policy from tongs.restricted_beta_policy_revisions where id=p_policy_revision_id;
  if policy.id is null or policy.lifecycle_state<>'active' then return jsonb_build_object('halted',false); end if;
  select c.committed_micros,c.outstanding_count into committed,outstanding from tongs._restricted_beta_policy_commitment(policy.id)c;
  if committed+policy.reserved_headroom_micros<=policy.aggregate_forge_exposure_limit_micros then
    return jsonb_build_object('halted',false,'committed_micros',committed); end if;
  insert into tongs.aggregate_financial_halt_events(
    id,policy_revision_id,event_key,reason,committed_micros,configured_limit_micros,evidence_json
  ) values(
    extensions.uuid_generate_v5(policy.id,btrim(p_event_key)),policy.id,btrim(p_event_key),
    'Authoritative or conservative supplier exposure exceeds the configured aggregate limit.',
    committed,policy.aggregate_forge_exposure_limit_micros,coalesce(p_evidence_json,'{}'::jsonb)
  ) on conflict(event_key) do nothing;
  select * into existing from tongs.aggregate_financial_halt_events where event_key=btrim(p_event_key);
  return jsonb_build_object('halted',true,'halt_event_id',existing.id,'committed_micros',committed,
    'configured_limit_micros',policy.aggregate_forge_exposure_limit_micros);
end $$;

create or replace function tongs.record_restricted_beta_exposure_adjustment(
  p_hold_id uuid,p_event_key text,p_event_type text,p_remaining_exposure_micros bigint,
  p_exposure_adjustment_micros bigint,p_supplier_obligation_micros bigint default null,
  p_evidence_json jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare hold tongs.restricted_beta_exposure_holds%rowtype; existing tongs.restricted_beta_exposure_events%rowtype;
  halt_result jsonb;
begin
  perform tongs._require_pricing_service_role();
  if p_event_type not in ('realized_estimate','reconciliation_risk','authoritative_adjustment','tail_obligation')
     or p_remaining_exposure_micros<0 then raise exception 'invalid exposure adjustment' using errcode='22023'; end if;
  if p_event_type='authoritative_adjustment' and coalesce((p_evidence_json->>'authoritative')::boolean,false) is not true then
    raise exception 'authoritative adjustment evidence required' using errcode='P0001'; end if;
  select * into existing from tongs.restricted_beta_exposure_events where event_key=btrim(p_event_key);
  if found then return to_jsonb(existing)||jsonb_build_object('replay',true); end if;
  select * into hold from tongs.restricted_beta_exposure_holds where id=p_hold_id for update;
  if hold.id is null then raise exception 'unknown exposure hold' using errcode='22023'; end if;
  insert into tongs.restricted_beta_exposure_events(
    id,hold_id,sequence,event_key,event_type,supplier_obligation_micros,
    remaining_exposure_micros,exposure_adjustment_micros,evidence_json
  ) select extensions.uuid_generate_v5(hold.id,btrim(p_event_key)),hold.id,coalesce(max(sequence),0)+1,
    btrim(p_event_key),p_event_type,p_supplier_obligation_micros,p_remaining_exposure_micros,
    p_exposure_adjustment_micros,coalesce(p_evidence_json,'{}'::jsonb)
    from tongs.restricted_beta_exposure_events where hold_id=hold.id returning * into existing;
  halt_result:=tongs._maybe_halt_restricted_beta_policy(
    hold.policy_revision_id,btrim(p_event_key)||':halt-new',coalesce(p_evidence_json,'{}'::jsonb));
  return to_jsonb(existing)||jsonb_build_object('replay',false,'admission_control',halt_result);
end $$;

create or replace function tongs.record_paid_operation_aggregate_outcome(
 p_reservation_id uuid,p_event_key text,p_outcome text,p_supplier_obligation_micros bigint default null,
 p_supplier_recovery_micros bigint default null,p_evidence_json jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare b tongs.paid_operation_aggregate_bindings%rowtype; event_type text; loss bigint:=0;
  result jsonb; remaining bigint; rounding_risk bigint;
begin
 perform tongs._require_pricing_service_role();
 select * into b from tongs.paid_operation_aggregate_bindings where reservation_id=p_reservation_id;
 if not found then return jsonb_build_object('enforcement_enabled',false,'recorded',false,'reason','aggregate_assignment_inactive'); end if;
 event_type:=case p_outcome when 'preprovider_release' then 'released' when 'ambiguous' then 'ambiguous'
  when 'failure' then 'customer_relieved_supplier_obligation' when 'settled_unconfirmed' then 'settled_unconfirmed'
  when 'reconciled_partial' then 'reconciliation_partial' when 'reconciled' then 'reconciled'
  when 'supplier_recovery' then 'supplier_recovery' else null end;
 if event_type is null then raise exception 'invalid aggregate outcome' using errcode='22023'; end if;
 if p_outcome='failure' then loss:=coalesce(p_supplier_obligation_micros,0); end if;
 result:=tongs.record_restricted_beta_exposure_outcome(
  b.hold_id,p_event_key,event_type,p_supplier_obligation_micros,p_supplier_recovery_micros,
  case when p_outcome='failure' then -b.customer_funding_ceiling_micros else 0 end,loss,p_evidence_json);
 if p_outcome='settled_unconfirmed' and p_supplier_obligation_micros is not null
    and coalesce((p_evidence_json->>'provider_usage_reported')::boolean,false) is true then
  rounding_risk:=case when b.credential_funding='forge' then
    least(greatest(coalesce((p_evidence_json->>'direct_cost_rounding_risk_micros')::bigint,3),0),3)
    else 0 end;
  remaining:=b.supporting_exposure_ceiling_micros+rounding_risk;
  result:=result||jsonb_build_object('conservative_finalization',tongs.record_restricted_beta_exposure_adjustment(
    b.hold_id,p_event_key||':reconciliation-risk','reconciliation_risk',remaining,
    remaining-(b.supplier_exposure_ceiling_micros+b.supporting_exposure_ceiling_micros),
    p_supplier_obligation_micros,jsonb_build_object('authoritative',false,'direct_rounding_risk_micros',rounding_risk,
      'supporting_and_tail_costs_remain_unconfirmed',true)));
 elsif p_outcome in ('reconciled','reconciled_partial') then
  result:=result||jsonb_build_object('admission_control',tongs._maybe_halt_restricted_beta_policy(
    b.policy_revision_id,p_event_key||':capacity-check',p_evidence_json));
 end if;
 return jsonb_build_object('enforcement_enabled',true,'recorded',true)||result;
end $$;

-- Preserve the current reservation contract while adding the append-only halt
-- event as an admission veto. No halt event is created by this migration.
create or replace function tongs.reserve_restricted_beta_exposure(
 p_hold_id uuid,p_policy_revision_id uuid,p_capability_code text,p_operation_identity text,
 p_user_id uuid,p_workspace_id uuid,p_request_fingerprint text,p_model_or_sku text,
 p_funding_class text,p_opaque_funding_handle text,p_provider_mode text,p_caller_class text,
 p_customer_funding_ceiling_micros bigint,p_supplier_exposure_ceiling_micros bigint,
 p_supporting_exposure_ceiling_micros bigint,p_tail_exposure_ceiling_micros bigint,
 p_unreconciled_exposure_ceiling_micros bigint,p_retry_exposure_ceiling_micros bigint,
 p_lease_seconds integer,p_event_key text
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare pol tongs.restricted_beta_policy_revisions%rowtype; term tongs.restricted_beta_policy_capabilities%rowtype;
 existing tongs.restricted_beta_exposure_holds%rowtype; ev tongs.restricted_beta_cost_evidence_revisions%rowtype;
 requested bigint; committed bigint; concurrent_count bigint;
begin
 perform tongs._require_pricing_service_role();
 select * into pol from tongs.restricted_beta_policy_revisions where id=p_policy_revision_id;
 if not found or pol.lifecycle_state='draft' then return jsonb_build_object('authorized',false,'reason','restricted_beta_inactive'); end if;
 if pol.lifecycle_state<>'active' then return jsonb_build_object('authorized',false,'reason','halt_new'); end if;
 if exists(select 1 from tongs.aggregate_financial_halt_events where policy_revision_id=pol.id) then
  return jsonb_build_object('authorized',false,'reason','aggregate_authoritative_overrun_halt'); end if;
 perform pg_advisory_xact_lock(hashtext('restricted-beta:'||pol.environment));
 select * into existing from tongs.restricted_beta_exposure_holds where operation_identity=btrim(p_operation_identity);
 if found then
  if existing.policy_revision_id<>pol.id or existing.request_fingerprint<>lower(p_request_fingerprint)
     or existing.model_or_sku<>p_model_or_sku or existing.user_id is distinct from p_user_id
     or existing.workspace_id is distinct from p_workspace_id then
   raise exception 'operation binding mismatch' using errcode='22023'; end if;
  return jsonb_build_object('authorized',true,'replay',true,'hold_id',existing.id);
 end if;
 select * into term from tongs.restricted_beta_policy_capabilities where policy_revision_id=pol.id and capability_code=p_capability_code;
 if not found or term.admission_mode='block' then return jsonb_build_object('authorized',false,'reason','capability_not_covered'); end if;
 select * into ev from tongs.restricted_beta_cost_evidence_revisions where id=term.cost_evidence_revision_id;
 if not found or ev.coverage_state<>'complete' or ev.evidence_state='unresolved' or ev.valid_until<=now()
    or ev.observed_at < now()-make_interval(secs=>pol.evidence_max_age_seconds) then
  return jsonb_build_object('authorized',false,'reason','cost_evidence_stale_or_incomplete'); end if;
 if p_model_or_sku<>term.exact_model_or_sku then return jsonb_build_object('authorized',false,'reason','model_or_sku_mismatch'); end if;
 if not(term.permitted_callers_json ? p_caller_class) then return jsonb_build_object('authorized',false,'reason','caller_not_permitted'); end if;
 if p_provider_mode='real' and p_funding_class='test_customer' then return jsonb_build_object('authorized',false,'reason','test_funding_real_provider_forbidden'); end if;
 if nullif(btrim(p_opaque_funding_handle),'') is null then return jsonb_build_object('authorized',false,'reason','funding_context_required'); end if;
 if p_supplier_exposure_ceiling_micros>term.per_operation_supplier_ceiling_micros
    or p_supporting_exposure_ceiling_micros>term.per_operation_supporting_ceiling_micros
    or p_tail_exposure_ceiling_micros>term.per_operation_tail_ceiling_micros then
  return jsonb_build_object('authorized',false,'reason','operation_ceiling_exceeded'); end if;
 requested:=p_supplier_exposure_ceiling_micros+p_supporting_exposure_ceiling_micros+p_tail_exposure_ceiling_micros+p_unreconciled_exposure_ceiling_micros+p_retry_exposure_ceiling_micros;
 select c.committed_micros,c.outstanding_count into committed,concurrent_count from tongs._restricted_beta_policy_commitment(pol.id)c;
 if concurrent_count>=pol.maximum_concurrency then return jsonb_build_object('authorized',false,'reason','aggregate_concurrency_exhausted','committed_micros',committed); end if;
 if committed+requested+pol.reserved_headroom_micros>pol.aggregate_forge_exposure_limit_micros then
  return jsonb_build_object('authorized',false,'reason','aggregate_exposure_exhausted','committed_micros',committed,'requested_micros',requested); end if;
 insert into tongs.restricted_beta_exposure_holds(id,policy_revision_id,capability_term_id,operation_identity,user_id,workspace_id,request_fingerprint,model_or_sku,funding_class,funding_handle_hash,provider_mode,caller_class,customer_funding_ceiling_micros,supplier_exposure_ceiling_micros,supporting_exposure_ceiling_micros,tail_exposure_ceiling_micros,unreconciled_exposure_ceiling_micros,retry_exposure_ceiling_micros,lease_expires_at)
 values(p_hold_id,pol.id,term.id,btrim(p_operation_identity),p_user_id,p_workspace_id,lower(p_request_fingerprint),p_model_or_sku,p_funding_class,encode(extensions.digest(convert_to(p_opaque_funding_handle,'utf8'),'sha256'),'hex'),p_provider_mode,p_caller_class,p_customer_funding_ceiling_micros,p_supplier_exposure_ceiling_micros,p_supporting_exposure_ceiling_micros,p_tail_exposure_ceiling_micros,p_unreconciled_exposure_ceiling_micros,p_retry_exposure_ceiling_micros,now()+make_interval(secs=>p_lease_seconds));
 insert into tongs.restricted_beta_exposure_events(id,hold_id,sequence,event_key,event_type,customer_funding_delta_micros,evidence_json)
 values(extensions.uuid_generate_v5(p_hold_id,'reserved'),p_hold_id,1,p_event_key,'reserved',p_customer_funding_ceiling_micros,jsonb_build_object('caller_class',p_caller_class));
 return jsonb_build_object('authorized',true,'replay',false,'hold_id',p_hold_id,'aggregate_before_micros',committed,'reserved_exposure_micros',requested);
end $$;

revoke all on function tongs.bind_bounded_provider_request(uuid,text,text,text,text,text,text,text,bigint,bigint,bigint,bigint,bigint,bigint,smallint) from public,anon,authenticated;
revoke all on function tongs.read_openai_text_quote_bounding_context(uuid,uuid,text,text,text) from public,anon,authenticated;
revoke all on function tongs.bind_bounded_provider_quote_request(uuid,uuid,text,text,text,text,text,text,text,text,bigint,bigint,bigint,bigint,bigint,bigint,smallint) from public,anon,authenticated;
revoke all on function tongs.record_paid_operation_tail_obligation(uuid,uuid,text,text,text,bigint,bigint,timestamptz,text,jsonb) from public,anon,authenticated;
revoke all on function tongs._maybe_halt_restricted_beta_policy(uuid,text,jsonb) from public,anon,authenticated;
revoke all on function tongs.record_restricted_beta_exposure_adjustment(uuid,text,text,bigint,bigint,bigint,jsonb) from public,anon,authenticated;
grant execute on function tongs.bind_bounded_provider_request(uuid,text,text,text,text,text,text,text,bigint,bigint,bigint,bigint,bigint,bigint,smallint) to service_role;
grant execute on function tongs.read_openai_text_quote_bounding_context(uuid,uuid,text,text,text) to service_role;
grant execute on function tongs.bind_bounded_provider_quote_request(uuid,uuid,text,text,text,text,text,text,text,text,bigint,bigint,bigint,bigint,bigint,bigint,smallint) to service_role;
grant execute on function tongs.record_paid_operation_tail_obligation(uuid,uuid,text,text,text,bigint,bigint,timestamptz,text,jsonb) to service_role;
grant execute on function tongs._maybe_halt_restricted_beta_policy(uuid,text,jsonb) to service_role;
grant execute on function tongs.record_restricted_beta_exposure_adjustment(uuid,text,text,bigint,bigint,bigint,jsonb) to service_role;

comment on table tongs.bounded_provider_quote_request_bindings is 'Server-only immutable proof of the exact serialized provider request and conservative token bound accepted with a quote.';
comment on table tongs.bounded_provider_request_bindings is 'Server-only immutable proof that the submitted serialized provider request exactly matched the accepted quote binding.';
comment on table tongs.paid_operation_tail_obligation_events is 'Append-only continuing-cost lifecycle. Canonical content and unresolved evidence do not become zero-cost after day 30.';
comment on table tongs.aggregate_exposure_opening_commitments is 'Migration audit of pre-existing unresolved supplier ceilings. It is not a duplicate expense ledger.';
comment on function tongs._restricted_beta_policy_commitment(uuid) is 'Environment-wide commitment across revisions: unresolved supplier obligations survive lease expiry and window rollover; reconciled realized spend ages out only after the configured window.';

notify pgrst,'reload schema';
commit;
