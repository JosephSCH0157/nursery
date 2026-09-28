-- Slice 1: private Forge-funded operational cost evidence.
-- The accounting journal remains the only financial authority. These relations
-- retain evidence and attribution, never balances or independently authoritative totals.
begin;

create table tongs.owner_cost_operations (
  operation_id uuid primary key,
  operation_key text not null unique check (length(btrim(operation_key)) between 16 and 300),
  request_fingerprint text not null check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  financial_environment text not null check (financial_environment in ('live', 'test')),
  runtime_environment text not null check (runtime_environment in ('production', 'preview', 'development')),
  payer text not null default 'forge' check (payer = 'forge'),
  originating_tool text not null check (length(btrim(originating_tool)) between 2 and 80),
  operation_type text not null check (length(btrim(operation_type)) between 2 and 100),
  workspace_id uuid references tongs.workspaces(id) on delete restrict,
  workpiece_id uuid references tongs.episodes(id) on delete restrict,
  recording_session_id uuid references tongs.recording_sessions(id) on delete restrict,
  recording_capture_authority_id uuid references tongs.recording_capture_authorities(id) on delete restrict,
  anvil_capture_execution_id uuid references tongs.anvil_capture_executions(execution_id) on delete restrict,
  owner_operating_budget_id uuid references tongs.owner_operating_budgets(id) on delete restrict,
  establishment_status text not null default 'established' check (establishment_status = 'established'),
  creation_evidence jsonb not null default '{}'::jsonb check (jsonb_typeof(creation_evidence) = 'object'),
  created_at timestamptz not null
);

create table tongs.owner_cost_provider_attempts (
  attempt_id uuid primary key,
  operation_id uuid not null references tongs.owner_cost_operations(operation_id) on delete restrict,
  attempt_number integer not null check (attempt_number > 0),
  attempt_key text not null check (length(btrim(attempt_key)) between 8 and 300),
  request_fingerprint text not null check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  provider text not null check (length(btrim(provider)) between 2 and 80),
  service text not null check (length(btrim(service)) between 2 and 100),
  model text,
  sku text,
  credential_identity_hash text check (credential_identity_hash is null or credential_identity_hash ~ '^[0-9a-f]{64}$'),
  authorized_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (operation_id, attempt_number),
  unique (operation_id, attempt_key)
);

create table tongs.owner_cost_attempt_events (
  attempt_event_id uuid primary key,
  attempt_id uuid not null references tongs.owner_cost_provider_attempts(attempt_id) on delete restrict,
  event_sequence integer not null check (event_sequence > 0),
  lifecycle_state text not null check (lifecycle_state in (
    'authorized', 'submitted', 'response_captured', 'succeeded',
    'definitively_rejected', 'failed', 'submission_unknown'
  )),
  provider_reference_id text,
  normalized_usage_evidence jsonb not null default '{}'::jsonb check (jsonb_typeof(normalized_usage_evidence) = 'object'),
  private_provider_evidence jsonb not null default '{}'::jsonb check (jsonb_typeof(private_provider_evidence) = 'object'),
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (attempt_id, event_sequence)
);

create unique index owner_cost_attempt_one_authorized_uidx
  on tongs.owner_cost_attempt_events(attempt_id) where lifecycle_state = 'authorized';
create unique index owner_cost_attempt_one_submission_uidx
  on tongs.owner_cost_attempt_events(attempt_id) where lifecycle_state = 'submitted';
create index owner_cost_attempt_events_attempt_time_idx
  on tongs.owner_cost_attempt_events(attempt_id, event_sequence desc);

create table tongs.owner_cost_valuations (
  valuation_id uuid primary key,
  valuation_key text not null unique check (length(btrim(valuation_key)) between 8 and 300),
  attempt_id uuid not null references tongs.owner_cost_provider_attempts(attempt_id) on delete restrict,
  cost_component text not null check (length(btrim(cost_component)) between 2 and 100),
  revision integer not null check (revision > 0),
  prior_valuation_id uuid references tongs.owner_cost_valuations(valuation_id) on delete restrict,
  valuation_basis text not null check (valuation_basis in (
    'estimated', 'usage_calculated', 'provider_reported', 'invoice_reconciled'
  )),
  amount_micros bigint not null check (amount_micros >= 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  recognition_mode text not null check (recognition_mode in ('evidence_only', 'journal_recognized')),
  reconciliation_reference text,
  normalized_usage_evidence jsonb not null default '{}'::jsonb check (jsonb_typeof(normalized_usage_evidence) = 'object'),
  private_valuation_evidence jsonb not null default '{}'::jsonb check (jsonb_typeof(private_valuation_evidence) = 'object'),
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  journal_event_id uuid unique references tongs.accounting_journal_events(id) on delete restrict,
  journal_adjustment_micros bigint,
  valued_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (attempt_id, cost_component, revision),
  check (
    (recognition_mode = 'evidence_only' and journal_event_id is null and journal_adjustment_micros is null)
    or
    (recognition_mode = 'journal_recognized' and journal_event_id = valuation_id and journal_adjustment_micros is not null)
  ),
  check ((valuation_basis = 'invoice_reconciled') = (reconciliation_reference is not null))
);

create index owner_cost_valuations_attempt_component_idx
  on tongs.owner_cost_valuations(attempt_id, cost_component, revision desc);
create index owner_cost_valuations_journal_idx
  on tongs.owner_cost_valuations(journal_event_id) where journal_event_id is not null;

create table tongs.owner_cost_operation_links (
  link_id uuid primary key,
  operation_id uuid not null references tongs.owner_cost_operations(operation_id) on delete restrict,
  link_key text not null unique check (length(btrim(link_key)) between 8 and 300),
  link_type text not null check (link_type in (
    'workspace', 'workpiece', 'recording_session', 'recording_capture_authority',
    'anvil_capture_execution', 'anvil_recording_completion'
  )),
  workspace_id uuid references tongs.workspaces(id) on delete restrict,
  workpiece_id uuid references tongs.episodes(id) on delete restrict,
  recording_session_id uuid references tongs.recording_sessions(id) on delete restrict,
  recording_capture_authority_id uuid references tongs.recording_capture_authorities(id) on delete restrict,
  anvil_capture_execution_id uuid references tongs.anvil_capture_executions(execution_id) on delete restrict,
  anvil_recording_completion_id uuid references tongs.anvil_recording_completion_requests(id) on delete restrict,
  association_evidence jsonb not null default '{}'::jsonb check (jsonb_typeof(association_evidence) = 'object'),
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  associated_at timestamptz not null,
  created_at timestamptz not null default now(),
  check (num_nonnulls(
    workspace_id, workpiece_id, recording_session_id, recording_capture_authority_id,
    anvil_capture_execution_id, anvil_recording_completion_id
  ) = 1),
  check (
    (link_type = 'workspace' and workspace_id is not null) or
    (link_type = 'workpiece' and workpiece_id is not null) or
    (link_type = 'recording_session' and recording_session_id is not null) or
    (link_type = 'recording_capture_authority' and recording_capture_authority_id is not null) or
    (link_type = 'anvil_capture_execution' and anvil_capture_execution_id is not null) or
    (link_type = 'anvil_recording_completion' and anvil_recording_completion_id is not null)
  )
);

create index owner_cost_operations_workspace_idx on tongs.owner_cost_operations(workspace_id, created_at desc);
create index owner_cost_operations_environment_idx on tongs.owner_cost_operations(financial_environment, runtime_environment, created_at desc);
create index owner_cost_operations_workpiece_idx on tongs.owner_cost_operations(workpiece_id) where workpiece_id is not null;
create index owner_cost_operations_session_idx on tongs.owner_cost_operations(recording_session_id) where recording_session_id is not null;
create index owner_cost_operations_authority_idx on tongs.owner_cost_operations(recording_capture_authority_id) where recording_capture_authority_id is not null;
create index owner_cost_operations_execution_idx on tongs.owner_cost_operations(anvil_capture_execution_id) where anvil_capture_execution_id is not null;
create index owner_cost_attempts_operation_idx on tongs.owner_cost_provider_attempts(operation_id, attempt_number);
create index owner_cost_links_operation_idx on tongs.owner_cost_operation_links(operation_id, associated_at);

create or replace function tongs._require_owner_cost_reader()
returns void language plpgsql stable security definer set search_path = pg_catalog as $$
declare v_actor uuid := auth.uid();
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and (v_actor is null or not tongs.is_platform_operator(v_actor)) then
    raise exception 'platform operator required' using errcode = '42501';
  end if;
end;
$$;

create or replace function tongs._validate_owner_cost_attribution(
  p_workspace_id uuid,
  p_workpiece_id uuid,
  p_recording_session_id uuid,
  p_recording_capture_authority_id uuid,
  p_anvil_capture_execution_id uuid
) returns void language plpgsql stable security definer set search_path = pg_catalog as $$
declare
  v_authority tongs.recording_capture_authorities%rowtype;
  v_execution tongs.anvil_capture_executions%rowtype;
begin
  if p_workpiece_id is not null and not exists (
    select 1 from tongs.episodes e
    where e.id = p_workpiece_id and (p_workspace_id is null or e.workspace_id = p_workspace_id)
  ) then raise exception 'owner-cost workpiece attribution mismatch' using errcode = '23514'; end if;

  if p_recording_session_id is not null and not exists (
    select 1 from tongs.recording_sessions s
    where s.id = p_recording_session_id and (p_workspace_id is null or s.workspace_id = p_workspace_id)
  ) then raise exception 'owner-cost recording session attribution mismatch' using errcode = '23514'; end if;

  if p_recording_capture_authority_id is not null then
    select * into v_authority from tongs.recording_capture_authorities a
      where a.id = p_recording_capture_authority_id;
    if not found
       or (p_workspace_id is not null and v_authority.workspace_id <> p_workspace_id)
       or (p_workpiece_id is not null and v_authority.workpiece_id <> p_workpiece_id)
       or (p_recording_session_id is not null and v_authority.recording_session_id is distinct from p_recording_session_id) then
      raise exception 'owner-cost capture authority attribution mismatch' using errcode = '23514';
    end if;
  end if;

  if p_anvil_capture_execution_id is not null then
    select * into v_execution from tongs.anvil_capture_executions e
      where e.execution_id = p_anvil_capture_execution_id;
    if not found
       or (p_recording_capture_authority_id is not null and v_execution.recording_capture_authority_id <> p_recording_capture_authority_id) then
      raise exception 'owner-cost Anvil execution attribution mismatch' using errcode = '23514';
    end if;
    if p_recording_capture_authority_id is null then
      perform tongs._validate_owner_cost_attribution(
        p_workspace_id, p_workpiece_id, p_recording_session_id,
        v_execution.recording_capture_authority_id, null
      );
    end if;
  end if;
end;
$$;

create or replace function tongs.establish_owner_cost_operation(
  p_operation_id uuid,
  p_operation_key text,
  p_request_fingerprint text,
  p_financial_environment text,
  p_runtime_environment text,
  p_originating_tool text,
  p_operation_type text,
  p_workspace_id uuid,
  p_workpiece_id uuid,
  p_recording_session_id uuid,
  p_recording_capture_authority_id uuid,
  p_anvil_capture_execution_id uuid,
  p_owner_operating_budget_id uuid,
  p_creation_evidence jsonb,
  p_created_at timestamptz
) returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_key text := btrim(coalesce(p_operation_key, ''));
  v_fingerprint text := lower(btrim(coalesce(p_request_fingerprint, '')));
  v_financial text := lower(btrim(coalesce(p_financial_environment, '')));
  v_runtime text := lower(btrim(coalesce(p_runtime_environment, '')));
  v_tool text := lower(btrim(coalesce(p_originating_tool, '')));
  v_type text := lower(btrim(coalesce(p_operation_type, '')));
  v_payload jsonb;
  v_hash text;
  v_existing tongs.owner_cost_operations%rowtype;
begin
  perform tongs._require_accounting_service_role();
  if p_operation_id is null or length(v_key) not between 16 and 300
     or v_fingerprint !~ '^[0-9a-f]{64}$' or v_financial not in ('live', 'test')
     or v_runtime not in ('production', 'preview', 'development')
     or length(v_tool) not between 2 and 80 or length(v_type) not between 2 and 100
     or p_created_at is null
     or jsonb_typeof(coalesce(p_creation_evidence, '{}'::jsonb)) <> 'object' then
    raise exception 'invalid owner-cost operation' using errcode = '22023';
  end if;
  perform tongs._validate_owner_cost_attribution(
    p_workspace_id, p_workpiece_id, p_recording_session_id,
    p_recording_capture_authority_id, p_anvil_capture_execution_id
  );
  if p_owner_operating_budget_id is not null and not exists (
    select 1 from tongs.owner_operating_budgets b
    where b.id = p_owner_operating_budget_id and b.environment = v_runtime
      and (b.workspace_id is null or b.workspace_id is not distinct from p_workspace_id)
  ) then raise exception 'owner budget classification mismatch' using errcode = '23514'; end if;

  v_payload := jsonb_build_object(
    'operation_id', p_operation_id, 'operation_key', v_key, 'request_fingerprint', v_fingerprint,
    'financial_environment', v_financial, 'runtime_environment', v_runtime, 'payer', 'forge',
    'originating_tool', v_tool, 'operation_type', v_type, 'workspace_id', p_workspace_id,
    'workpiece_id', p_workpiece_id, 'recording_session_id', p_recording_session_id,
    'recording_capture_authority_id', p_recording_capture_authority_id,
    'anvil_capture_execution_id', p_anvil_capture_execution_id,
    'owner_operating_budget_id', p_owner_operating_budget_id,
    'creation_evidence', coalesce(p_creation_evidence, '{}'::jsonb),
    'created_at', p_created_at
  );
  v_hash := tongs._accounting_payload_hash(v_payload);
  perform pg_advisory_xact_lock(hashtextextended('owner-cost-operation:' || v_key, 0));
  select * into v_existing from tongs.owner_cost_operations o
    where o.operation_key = v_key or o.operation_id = p_operation_id limit 1;
  if found then
    if v_existing.operation_id <> p_operation_id or v_existing.payload_hash <> v_hash then
      raise exception 'owner-cost operation replay conflict' using errcode = '23505';
    end if;
    return jsonb_build_object('operation_id', v_existing.operation_id, 'replay', true);
  end if;
  insert into tongs.owner_cost_operations(
    operation_id, operation_key, request_fingerprint, payload_hash, financial_environment,
    runtime_environment, originating_tool, operation_type, workspace_id, workpiece_id,
    recording_session_id, recording_capture_authority_id, anvil_capture_execution_id,
    owner_operating_budget_id, creation_evidence, created_at
  ) values (
    p_operation_id, v_key, v_fingerprint, v_hash, v_financial, v_runtime, v_tool, v_type,
    p_workspace_id, p_workpiece_id, p_recording_session_id, p_recording_capture_authority_id,
    p_anvil_capture_execution_id, p_owner_operating_budget_id,
    coalesce(p_creation_evidence, '{}'::jsonb), p_created_at
  );
  return jsonb_build_object('operation_id', p_operation_id, 'replay', false);
end;
$$;

create or replace function tongs.authorize_owner_cost_provider_attempt(
  p_attempt_id uuid,
  p_operation_id uuid,
  p_attempt_number integer,
  p_attempt_key text,
  p_request_fingerprint text,
  p_provider text,
  p_service text,
  p_model text,
  p_sku text,
  p_credential_identity_hash text,
  p_private_authorization_evidence jsonb,
  p_authorized_at timestamptz
) returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_key text := btrim(coalesce(p_attempt_key, ''));
  v_fingerprint text := lower(btrim(coalesce(p_request_fingerprint, '')));
  v_provider text := lower(btrim(coalesce(p_provider, '')));
  v_service text := lower(btrim(coalesce(p_service, '')));
  v_credential text := nullif(lower(btrim(coalesce(p_credential_identity_hash, ''))), '');
  v_payload jsonb;
  v_hash text;
  v_existing tongs.owner_cost_provider_attempts%rowtype;
begin
  perform tongs._require_accounting_service_role();
  if p_attempt_id is null or p_operation_id is null or p_attempt_number <= 0
     or length(v_key) not between 8 and 300 or v_fingerprint !~ '^[0-9a-f]{64}$'
     or length(v_provider) not between 2 and 80 or length(v_service) not between 2 and 100
     or (v_credential is not null and v_credential !~ '^[0-9a-f]{64}$')
     or p_authorized_at is null
     or jsonb_typeof(coalesce(p_private_authorization_evidence, '{}'::jsonb)) <> 'object' then
    raise exception 'invalid owner-cost provider attempt' using errcode = '22023';
  end if;
  if not exists (select 1 from tongs.owner_cost_operations o where o.operation_id = p_operation_id) then
    raise exception 'owner-cost operation not found' using errcode = '23503';
  end if;
  v_payload := jsonb_build_object(
    'attempt_id', p_attempt_id, 'operation_id', p_operation_id, 'attempt_number', p_attempt_number,
    'attempt_key', v_key, 'request_fingerprint', v_fingerprint, 'provider', v_provider,
    'service', v_service, 'model', nullif(btrim(coalesce(p_model, '')), ''),
    'sku', nullif(btrim(coalesce(p_sku, '')), ''), 'credential_identity_hash', v_credential,
    'private_authorization_evidence', coalesce(p_private_authorization_evidence, '{}'::jsonb),
    'authorized_at', p_authorized_at
  );
  v_hash := tongs._accounting_payload_hash(v_payload);
  perform pg_advisory_xact_lock(hashtextextended('owner-cost-attempt:' || p_operation_id::text || ':' || p_attempt_number::text, 0));
  select * into v_existing from tongs.owner_cost_provider_attempts a
    where a.attempt_id = p_attempt_id or (a.operation_id = p_operation_id and (a.attempt_number = p_attempt_number or a.attempt_key = v_key))
    limit 1;
  if found then
    if v_existing.attempt_id <> p_attempt_id or v_existing.payload_hash <> v_hash then
      raise exception 'owner-cost provider attempt replay conflict' using errcode = '23505';
    end if;
    return jsonb_build_object('attempt_id', v_existing.attempt_id, 'authorized', false, 'replay', true);
  end if;
  insert into tongs.owner_cost_provider_attempts(
    attempt_id, operation_id, attempt_number, attempt_key, request_fingerprint, payload_hash,
    provider, service, model, sku, credential_identity_hash, authorized_at
  ) values (
    p_attempt_id, p_operation_id, p_attempt_number, v_key, v_fingerprint, v_hash,
    v_provider, v_service, nullif(btrim(coalesce(p_model, '')), ''),
    nullif(btrim(coalesce(p_sku, '')), ''), v_credential, p_authorized_at
  );
  insert into tongs.owner_cost_attempt_events(
    attempt_event_id, attempt_id, event_sequence, lifecycle_state,
    private_provider_evidence, occurred_at
  ) values (
    p_attempt_id, p_attempt_id, 1, 'authorized',
    coalesce(p_private_authorization_evidence, '{}'::jsonb), p_authorized_at
  );
  return jsonb_build_object('attempt_id', p_attempt_id, 'authorized', true, 'replay', false);
end;
$$;

create or replace function tongs.append_owner_cost_attempt_event(
  p_attempt_event_id uuid,
  p_attempt_id uuid,
  p_event_sequence integer,
  p_lifecycle_state text,
  p_provider_reference_id text,
  p_normalized_usage_evidence jsonb,
  p_private_provider_evidence jsonb,
  p_occurred_at timestamptz
) returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_state text := lower(btrim(coalesce(p_lifecycle_state, '')));
  v_previous text;
  v_existing tongs.owner_cost_attempt_events%rowtype;
begin
  perform tongs._require_accounting_service_role();
  if p_attempt_event_id is null or p_attempt_id is null or p_event_sequence <= 1
     or v_state not in ('submitted', 'response_captured', 'succeeded', 'definitively_rejected', 'failed', 'submission_unknown')
     or p_occurred_at is null
     or jsonb_typeof(coalesce(p_normalized_usage_evidence, '{}'::jsonb)) <> 'object'
     or jsonb_typeof(coalesce(p_private_provider_evidence, '{}'::jsonb)) <> 'object' then
    raise exception 'invalid owner-cost attempt event' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('owner-cost-attempt-events:' || p_attempt_id::text, 0));
  select * into v_existing from tongs.owner_cost_attempt_events e
    where e.attempt_event_id = p_attempt_event_id
       or (e.attempt_id = p_attempt_id and e.event_sequence = p_event_sequence)
    limit 1;
  if found then
    if v_existing.attempt_event_id <> p_attempt_event_id or v_existing.lifecycle_state <> v_state
       or v_existing.provider_reference_id is distinct from nullif(btrim(coalesce(p_provider_reference_id, '')), '')
       or v_existing.normalized_usage_evidence <> coalesce(p_normalized_usage_evidence, '{}'::jsonb)
       or v_existing.private_provider_evidence <> coalesce(p_private_provider_evidence, '{}'::jsonb)
       or v_existing.occurred_at <> coalesce(p_occurred_at, v_existing.occurred_at) then
      raise exception 'owner-cost attempt event replay conflict' using errcode = '23505';
    end if;
    return jsonb_build_object('attempt_event_id', v_existing.attempt_event_id, 'replay', true, 'provider_submission_created', false);
  end if;
  select e.lifecycle_state into v_previous from tongs.owner_cost_attempt_events e
    where e.attempt_id = p_attempt_id order by e.event_sequence desc limit 1;
  if not found then raise exception 'owner-cost attempt not found' using errcode = '23503'; end if;
  if p_event_sequence <> (select max(e.event_sequence) + 1 from tongs.owner_cost_attempt_events e where e.attempt_id = p_attempt_id) then
    raise exception 'owner-cost attempt event sequence gap' using errcode = '23514';
  end if;
  if not (
    (v_previous = 'authorized' and v_state in ('submitted', 'definitively_rejected', 'failed')) or
    (v_previous = 'submitted' and v_state in ('response_captured', 'succeeded', 'failed', 'submission_unknown')) or
    (v_previous = 'submission_unknown' and v_state in ('response_captured', 'succeeded', 'failed')) or
    (v_previous = 'response_captured' and v_state in ('succeeded', 'failed'))
  ) then raise exception 'invalid owner-cost attempt lifecycle transition' using errcode = '23514'; end if;
  insert into tongs.owner_cost_attempt_events(
    attempt_event_id, attempt_id, event_sequence, lifecycle_state, provider_reference_id,
    normalized_usage_evidence, private_provider_evidence, occurred_at
  ) values (
    p_attempt_event_id, p_attempt_id, p_event_sequence, v_state,
    nullif(btrim(coalesce(p_provider_reference_id, '')), ''),
    coalesce(p_normalized_usage_evidence, '{}'::jsonb),
    coalesce(p_private_provider_evidence, '{}'::jsonb), p_occurred_at
  );
  return jsonb_build_object(
    'attempt_event_id', p_attempt_event_id, 'replay', false,
    'provider_submission_created', v_state = 'submitted'
  );
end;
$$;

create or replace function tongs.record_owner_cost_valuation(
  p_valuation_id uuid,
  p_valuation_key text,
  p_attempt_id uuid,
  p_cost_component text,
  p_prior_valuation_id uuid,
  p_valuation_basis text,
  p_amount_micros bigint,
  p_currency text,
  p_recognition_mode text,
  p_reconciliation_reference text,
  p_normalized_usage_evidence jsonb,
  p_private_valuation_evidence jsonb,
  p_valued_at timestamptz
) returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_key text := btrim(coalesce(p_valuation_key, ''));
  v_component text := lower(btrim(coalesce(p_cost_component, '')));
  v_basis text := lower(btrim(coalesce(p_valuation_basis, '')));
  v_currency text := upper(btrim(coalesce(p_currency, '')));
  v_mode text := lower(btrim(coalesce(p_recognition_mode, '')));
  v_reconciliation text := nullif(btrim(coalesce(p_reconciliation_reference, '')), '');
  v_attempt tongs.owner_cost_provider_attempts%rowtype;
  v_operation tongs.owner_cost_operations%rowtype;
  v_latest tongs.owner_cost_valuations%rowtype;
  v_existing tongs.owner_cost_valuations%rowtype;
  v_previous_recognized bigint := 0;
  v_revision integer := 1;
  v_adjustment bigint;
  v_payload jsonb;
  v_hash text;
  v_created boolean;
begin
  perform tongs._require_accounting_service_role();
  if p_valuation_id is null or length(v_key) not between 8 and 300
     or length(v_component) not between 2 and 100
     or v_basis not in ('estimated', 'usage_calculated', 'provider_reported', 'invoice_reconciled')
     or p_amount_micros < 0 or v_currency !~ '^[A-Z]{3}$'
     or v_mode not in ('evidence_only', 'journal_recognized')
     or p_valued_at is null
     or (v_basis = 'invoice_reconciled') <> (v_reconciliation is not null)
     or jsonb_typeof(coalesce(p_normalized_usage_evidence, '{}'::jsonb)) <> 'object'
     or jsonb_typeof(coalesce(p_private_valuation_evidence, '{}'::jsonb)) <> 'object' then
    raise exception 'invalid owner-cost valuation' using errcode = '22023';
  end if;
  select * into v_attempt from tongs.owner_cost_provider_attempts a where a.attempt_id = p_attempt_id;
  if not found then raise exception 'owner-cost attempt not found' using errcode = '23503'; end if;
  select * into v_operation from tongs.owner_cost_operations o where o.operation_id = v_attempt.operation_id;
  perform pg_advisory_xact_lock(hashtextextended('owner-cost-valuation:' || p_attempt_id::text || ':' || v_component, 0));
  select * into v_existing from tongs.owner_cost_valuations v
    where v.valuation_id = p_valuation_id or v.valuation_key = v_key limit 1;
  v_payload := jsonb_build_object(
    'valuation_id', p_valuation_id, 'valuation_key', v_key, 'attempt_id', p_attempt_id,
    'cost_component', v_component, 'prior_valuation_id', p_prior_valuation_id,
    'valuation_basis', v_basis, 'amount_micros', p_amount_micros, 'currency', v_currency,
    'recognition_mode', v_mode, 'reconciliation_reference', v_reconciliation,
    'normalized_usage_evidence', coalesce(p_normalized_usage_evidence, '{}'::jsonb),
    'private_valuation_evidence', coalesce(p_private_valuation_evidence, '{}'::jsonb),
    'valued_at', p_valued_at
  );
  v_hash := tongs._accounting_payload_hash(v_payload);
  if found then
    if v_existing.valuation_id <> p_valuation_id or v_existing.payload_hash <> v_hash then
      raise exception 'owner-cost valuation replay conflict' using errcode = '23505';
    end if;
    return jsonb_build_object(
      'valuation_id', v_existing.valuation_id, 'journal_event_id', v_existing.journal_event_id,
      'journal_adjustment_micros', v_existing.journal_adjustment_micros, 'replay', true
    );
  end if;
  select * into v_latest from tongs.owner_cost_valuations v
    where v.attempt_id = p_attempt_id and v.cost_component = v_component
    order by v.revision desc limit 1;
  if found then
    v_revision := v_latest.revision + 1;
    if p_prior_valuation_id is distinct from v_latest.valuation_id then
      raise exception 'owner-cost valuation prior revision mismatch' using errcode = '23514';
    end if;
    if (case v_basis when 'estimated' then 1 when 'usage_calculated' then 2 when 'provider_reported' then 3 else 4 end)
       < (case v_latest.valuation_basis when 'estimated' then 1 when 'usage_calculated' then 2 when 'provider_reported' then 3 else 4 end) then
      raise exception 'owner-cost valuation basis cannot regress' using errcode = '23514';
    end if;
    if v_latest.currency <> v_currency then
      raise exception 'owner-cost valuation currency cannot change' using errcode = '23514';
    end if;
  elsif p_prior_valuation_id is not null then
    raise exception 'first owner-cost valuation cannot have a prior revision' using errcode = '23514';
  end if;
  if v_operation.owner_operating_budget_id is not null and not exists (
    select 1 from tongs.owner_operating_budgets b
    where b.id = v_operation.owner_operating_budget_id
      and b.environment = v_operation.runtime_environment and b.currency = v_currency
  ) then raise exception 'owner budget currency classification mismatch' using errcode = '23514'; end if;

  if v_mode = 'journal_recognized' then
    select v.amount_micros into v_previous_recognized
    from tongs.owner_cost_valuations v
    where v.attempt_id = p_attempt_id and v.cost_component = v_component
      and v.recognition_mode = 'journal_recognized'
    order by v.revision desc limit 1;
    v_previous_recognized := coalesce(v_previous_recognized, 0);
    v_adjustment := p_amount_micros - v_previous_recognized;
    v_payload := v_payload || jsonb_build_object(
      'operation_id', v_operation.operation_id, 'revision', v_revision,
      'previous_recognized_amount_micros', v_previous_recognized,
      'journal_adjustment_micros', v_adjustment,
      'authority', 'accounting_journal_events_and_entries'
    );
    v_created := tongs._create_accounting_event(
      p_valuation_id, 'owner-cost-valuation:' || v_key, 'forge_operating_expense_valuation',
      v_operation.financial_environment, 'owner_cost_valuation', p_valuation_id::text,
      v_currency, null, v_operation.workspace_id, null, v_payload, p_valued_at
    );
    if not v_created then raise exception 'owner-cost journal event exists without valuation' using errcode = '23514'; end if;
    insert into tongs.owner_cost_valuations(
      valuation_id, valuation_key, attempt_id, cost_component, revision, prior_valuation_id,
      valuation_basis, amount_micros, currency, recognition_mode, reconciliation_reference,
      normalized_usage_evidence, private_valuation_evidence, payload_hash, journal_event_id,
      journal_adjustment_micros, valued_at
    ) values (
      p_valuation_id, v_key, p_attempt_id, v_component, v_revision, p_prior_valuation_id,
      v_basis, p_amount_micros, v_currency, v_mode, v_reconciliation,
      coalesce(p_normalized_usage_evidence, '{}'::jsonb),
      coalesce(p_private_valuation_evidence, '{}'::jsonb),
      tongs._accounting_payload_hash(v_payload - 'operation_id' - 'revision' - 'previous_recognized_amount_micros' - 'journal_adjustment_micros' - 'authority'),
      p_valuation_id, v_adjustment, p_valued_at
    );
    if v_adjustment <> 0 then
      insert into tongs.accounting_journal_entries(
        event_id, line_number, account_code, workspace_id, owner_budget_id,
        currency, amount_micros, metadata_json
      ) values
        (p_valuation_id, 1,
          case when v_operation.financial_environment = 'live' then 'forge_operating_expense' else 'test_forge_operating_expense' end,
          v_operation.workspace_id, v_operation.owner_operating_budget_id, v_currency, v_adjustment,
          jsonb_build_object('valuation_id', p_valuation_id, 'operation_id', v_operation.operation_id)),
        (p_valuation_id, 2,
          case when v_operation.financial_environment = 'live' then 'forge_cash_clearing' else 'test_cash_clearing' end,
          v_operation.workspace_id, v_operation.owner_operating_budget_id, v_currency, -v_adjustment,
          jsonb_build_object('valuation_id', p_valuation_id, 'operation_id', v_operation.operation_id));
    end if;
    perform tongs._assert_accounting_event_balanced(p_valuation_id);
  else
    insert into tongs.owner_cost_valuations(
      valuation_id, valuation_key, attempt_id, cost_component, revision, prior_valuation_id,
      valuation_basis, amount_micros, currency, recognition_mode, reconciliation_reference,
      normalized_usage_evidence, private_valuation_evidence, payload_hash, valued_at
    ) values (
      p_valuation_id, v_key, p_attempt_id, v_component, v_revision, p_prior_valuation_id,
      v_basis, p_amount_micros, v_currency, v_mode, v_reconciliation,
      coalesce(p_normalized_usage_evidence, '{}'::jsonb),
      coalesce(p_private_valuation_evidence, '{}'::jsonb), v_hash, p_valued_at
    );
  end if;
  return jsonb_build_object(
    'valuation_id', p_valuation_id,
    'journal_event_id', case when v_mode = 'journal_recognized' then p_valuation_id else null end,
    'journal_adjustment_micros', v_adjustment, 'replay', false
  );
end;
$$;

create or replace function tongs.link_owner_cost_operation(
  p_link_id uuid,
  p_operation_id uuid,
  p_link_key text,
  p_link_type text,
  p_workspace_id uuid,
  p_workpiece_id uuid,
  p_recording_session_id uuid,
  p_recording_capture_authority_id uuid,
  p_anvil_capture_execution_id uuid,
  p_anvil_recording_completion_id uuid,
  p_association_evidence jsonb,
  p_associated_at timestamptz
) returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_key text := btrim(coalesce(p_link_key, ''));
  v_type text := lower(btrim(coalesce(p_link_type, '')));
  v_operation tongs.owner_cost_operations%rowtype;
  v_completion tongs.anvil_recording_completion_requests%rowtype;
  v_execution tongs.anvil_capture_executions%rowtype;
  v_payload jsonb;
  v_hash text;
  v_existing tongs.owner_cost_operation_links%rowtype;
begin
  perform tongs._require_accounting_service_role();
  if p_link_id is null or length(v_key) not between 8 and 300
     or v_type not in ('workspace', 'workpiece', 'recording_session', 'recording_capture_authority', 'anvil_capture_execution', 'anvil_recording_completion')
     or num_nonnulls(p_workspace_id, p_workpiece_id, p_recording_session_id, p_recording_capture_authority_id, p_anvil_capture_execution_id, p_anvil_recording_completion_id) <> 1
     or p_associated_at is null
     or jsonb_typeof(coalesce(p_association_evidence, '{}'::jsonb)) <> 'object' then
    raise exception 'invalid owner-cost operation link' using errcode = '22023';
  end if;
  select * into v_operation from tongs.owner_cost_operations o where o.operation_id = p_operation_id;
  if not found then raise exception 'owner-cost operation not found' using errcode = '23503'; end if;

  if p_workspace_id is not null and v_operation.workspace_id is not null and p_workspace_id <> v_operation.workspace_id then
    raise exception 'owner-cost workspace link mismatch' using errcode = '23514';
  elsif p_workpiece_id is not null then
    perform tongs._validate_owner_cost_attribution(v_operation.workspace_id, p_workpiece_id, null, null, null);
  elsif p_recording_session_id is not null then
    perform tongs._validate_owner_cost_attribution(v_operation.workspace_id, null, p_recording_session_id, null, null);
  elsif p_recording_capture_authority_id is not null then
    perform tongs._validate_owner_cost_attribution(v_operation.workspace_id, v_operation.workpiece_id, v_operation.recording_session_id, p_recording_capture_authority_id, null);
  elsif p_anvil_capture_execution_id is not null then
    perform tongs._validate_owner_cost_attribution(v_operation.workspace_id, v_operation.workpiece_id, v_operation.recording_session_id, v_operation.recording_capture_authority_id, p_anvil_capture_execution_id);
  elsif p_anvil_recording_completion_id is not null then
    select * into v_completion from tongs.anvil_recording_completion_requests c where c.id = p_anvil_recording_completion_id;
    if not found or (v_operation.workspace_id is not null and v_completion.workspace_id <> v_operation.workspace_id)
       or (v_operation.workpiece_id is not null and v_completion.workpiece_id <> v_operation.workpiece_id) then
      raise exception 'owner-cost completion link mismatch' using errcode = '23514';
    end if;
    if v_operation.recording_capture_authority_id is not null then
      if v_completion.capture_authority_id <> v_operation.recording_capture_authority_id then
        raise exception 'owner-cost completion capture authority mismatch' using errcode = '23514';
      end if;
    elsif v_operation.anvil_capture_execution_id is not null then
      select * into v_execution from tongs.anvil_capture_executions e where e.execution_id = v_operation.anvil_capture_execution_id;
      if v_completion.capture_authority_id <> v_execution.recording_capture_authority_id then
        raise exception 'owner-cost completion execution mismatch' using errcode = '23514';
      end if;
    else
      raise exception 'completion link requires an existing capture authority or execution anchor' using errcode = '23514';
    end if;
  end if;
  v_payload := jsonb_build_object(
    'link_id', p_link_id, 'operation_id', p_operation_id, 'link_key', v_key, 'link_type', v_type,
    'workspace_id', p_workspace_id, 'workpiece_id', p_workpiece_id,
    'recording_session_id', p_recording_session_id,
    'recording_capture_authority_id', p_recording_capture_authority_id,
    'anvil_capture_execution_id', p_anvil_capture_execution_id,
    'anvil_recording_completion_id', p_anvil_recording_completion_id,
    'association_evidence', coalesce(p_association_evidence, '{}'::jsonb),
    'associated_at', p_associated_at
  );
  v_hash := tongs._accounting_payload_hash(v_payload);
  perform pg_advisory_xact_lock(hashtextextended('owner-cost-link:' || v_key, 0));
  select * into v_existing from tongs.owner_cost_operation_links l
    where l.link_id = p_link_id or l.link_key = v_key limit 1;
  if found then
    if v_existing.link_id <> p_link_id or v_existing.payload_hash <> v_hash then
      raise exception 'owner-cost link replay conflict' using errcode = '23505';
    end if;
    return jsonb_build_object('link_id', v_existing.link_id, 'replay', true);
  end if;
  insert into tongs.owner_cost_operation_links(
    link_id, operation_id, link_key, link_type, workspace_id, workpiece_id,
    recording_session_id, recording_capture_authority_id, anvil_capture_execution_id,
    anvil_recording_completion_id, association_evidence, payload_hash, associated_at
  ) values (
    p_link_id, p_operation_id, v_key, v_type, p_workspace_id, p_workpiece_id,
    p_recording_session_id, p_recording_capture_authority_id, p_anvil_capture_execution_id,
    p_anvil_recording_completion_id, coalesce(p_association_evidence, '{}'::jsonb),
    v_hash, p_associated_at
  );
  return jsonb_build_object('link_id', p_link_id, 'replay', false);
end;
$$;

create or replace function tongs.read_owner_cost_operation(p_operation_id uuid)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog as $$
declare v_result jsonb;
begin
  perform tongs._require_owner_cost_reader();
  select jsonb_build_object(
    'operation', to_jsonb(o),
    'attempts', coalesce((
      select jsonb_agg(to_jsonb(a) || jsonb_build_object(
        'events', coalesce((select jsonb_agg(to_jsonb(e) order by e.event_sequence)
          from tongs.owner_cost_attempt_events e where e.attempt_id = a.attempt_id), '[]'::jsonb),
        'valuations', coalesce((select jsonb_agg(to_jsonb(v) order by v.cost_component, v.revision)
          from tongs.owner_cost_valuations v where v.attempt_id = a.attempt_id), '[]'::jsonb)
      ) order by a.attempt_number)
      from tongs.owner_cost_provider_attempts a where a.operation_id = o.operation_id
    ), '[]'::jsonb),
    'links', coalesce((select jsonb_agg(to_jsonb(l) order by l.associated_at)
      from tongs.owner_cost_operation_links l where l.operation_id = o.operation_id), '[]'::jsonb)
  ) into v_result
  from tongs.owner_cost_operations o where o.operation_id = p_operation_id;
  return v_result;
end;
$$;

create or replace function tongs.read_owner_cost_summary(
  p_financial_environment text,
  p_currency text default null
) returns jsonb language plpgsql stable security definer set search_path = pg_catalog as $$
declare
  v_environment text := lower(btrim(coalesce(p_financial_environment, '')));
  v_currency text := nullif(upper(btrim(coalesce(p_currency, ''))), '');
  v_totals jsonb;
begin
  perform tongs._require_owner_cost_reader();
  if v_environment not in ('live', 'test') or (v_currency is not null and v_currency !~ '^[A-Z]{3}$') then
    raise exception 'financial environment and optional ISO currency are required' using errcode = '22023';
  end if;
  select coalesce(jsonb_agg(to_jsonb(summary_row) order by summary_row.currency), '[]'::jsonb)
  into v_totals
  from (
    select entry.currency, sum(entry.amount_micros)::bigint as recognized_expense_micros
    from tongs.accounting_journal_entries entry
    join tongs.accounting_journal_events event on event.id = entry.event_id
    where event.source_type = 'owner_cost_valuation'
      and event.environment = v_environment
      and entry.account_code = case when v_environment = 'live' then 'forge_operating_expense' else 'test_forge_operating_expense' end
      and (v_currency is null or entry.currency = v_currency)
    group by entry.currency
  ) summary_row;
  return jsonb_build_object('financial_environment', v_environment, 'totals_from_canonical_journal', v_totals);
end;
$$;

create or replace function tongs.verify_owner_cost_reconstruction()
returns table(issue_code text, valuation_id uuid, journal_event_id uuid, details jsonb)
language plpgsql stable security definer set search_path = pg_catalog as $$
begin
  perform tongs._require_owner_cost_reader();
  return query
  with recognized as (
    select v.*, a.operation_id, o.financial_environment
    from tongs.owner_cost_valuations v
    join tongs.owner_cost_provider_attempts a on a.attempt_id = v.attempt_id
    join tongs.owner_cost_operations o on o.operation_id = a.operation_id
    where v.recognition_mode = 'journal_recognized'
  ), checks as (
    select 'journal_header_mismatch'::text as issue_code, r.valuation_id, r.journal_event_id,
      jsonb_build_object('source_type', e.source_type, 'source_id', e.source_id, 'environment', e.environment, 'currency', e.currency) as details
    from recognized r
    left join tongs.accounting_journal_events e on e.id = r.journal_event_id
    where e.id is null or e.source_type <> 'owner_cost_valuation' or e.source_id <> r.valuation_id::text
       or e.environment <> r.financial_environment or e.currency <> r.currency
    union all
    select 'journal_adjustment_mismatch', r.valuation_id, r.journal_event_id,
      jsonb_build_object('expected_adjustment_micros', r.journal_adjustment_micros, 'journal_expense_micros', coalesce(sum(j.amount_micros), 0))
    from recognized r
    left join tongs.accounting_journal_entries j on j.event_id = r.journal_event_id
      and j.account_code = case when r.financial_environment = 'live' then 'forge_operating_expense' else 'test_forge_operating_expense' end
    group by r.valuation_id, r.journal_event_id, r.journal_adjustment_micros
    having coalesce(sum(j.amount_micros), 0) <> r.journal_adjustment_micros
    union all
    select 'journal_unbalanced', r.valuation_id, r.journal_event_id,
      jsonb_build_object('imbalance_micros', coalesce(sum(j.amount_micros), 0))
    from recognized r
    left join tongs.accounting_journal_entries j on j.event_id = r.journal_event_id
    group by r.valuation_id, r.journal_event_id
    having coalesce(sum(j.amount_micros), 0) <> 0
    union all
    select 'cumulative_recognition_mismatch', latest.valuation_id, latest.journal_event_id,
      jsonb_build_object('latest_amount_micros', latest.amount_micros, 'cumulative_adjustments_micros', sums.total_adjustment)
    from (
      select distinct on (v.attempt_id, v.cost_component) v.*
      from recognized v order by v.attempt_id, v.cost_component, v.revision desc
    ) latest
    join (
      select v.attempt_id, v.cost_component, sum(v.journal_adjustment_micros)::bigint as total_adjustment
      from recognized v group by v.attempt_id, v.cost_component
    ) sums using (attempt_id, cost_component)
    where latest.amount_micros <> sums.total_adjustment
  )
  select c.issue_code, c.valuation_id, c.journal_event_id, c.details from checks c;
end;
$$;

do $$
declare v_table text;
begin
  foreach v_table in array array[
    'owner_cost_operations', 'owner_cost_provider_attempts', 'owner_cost_attempt_events',
    'owner_cost_valuations', 'owner_cost_operation_links'
  ] loop
    execute format(
      'create trigger %I before update or delete on tongs.%I for each row execute function tongs._reject_accounting_mutation()',
      'trg_' || v_table || '_append_only', v_table
    );
    execute format('alter table tongs.%I enable row level security', v_table);
    execute format('revoke all on tongs.%I from public, anon, authenticated, service_role', v_table);
    execute format('grant select on tongs.%I to service_role', v_table);
  end loop;
end;
$$;

revoke all on function tongs._require_owner_cost_reader() from public, anon, authenticated, service_role;
revoke all on function tongs._validate_owner_cost_attribution(uuid, uuid, uuid, uuid, uuid) from public, anon, authenticated, service_role;

revoke all on function tongs.establish_owner_cost_operation(uuid, text, text, text, text, text, text, uuid, uuid, uuid, uuid, uuid, uuid, jsonb, timestamptz) from public, anon, authenticated;
revoke all on function tongs.authorize_owner_cost_provider_attempt(uuid, uuid, integer, text, text, text, text, text, text, text, jsonb, timestamptz) from public, anon, authenticated;
revoke all on function tongs.append_owner_cost_attempt_event(uuid, uuid, integer, text, text, jsonb, jsonb, timestamptz) from public, anon, authenticated;
revoke all on function tongs.record_owner_cost_valuation(uuid, text, uuid, text, uuid, text, bigint, text, text, text, jsonb, jsonb, timestamptz) from public, anon, authenticated;
revoke all on function tongs.link_owner_cost_operation(uuid, uuid, text, text, uuid, uuid, uuid, uuid, uuid, uuid, jsonb, timestamptz) from public, anon, authenticated;
grant execute on function tongs.establish_owner_cost_operation(uuid, text, text, text, text, text, text, uuid, uuid, uuid, uuid, uuid, uuid, jsonb, timestamptz) to service_role;
grant execute on function tongs.authorize_owner_cost_provider_attempt(uuid, uuid, integer, text, text, text, text, text, text, text, jsonb, timestamptz) to service_role;
grant execute on function tongs.append_owner_cost_attempt_event(uuid, uuid, integer, text, text, jsonb, jsonb, timestamptz) to service_role;
grant execute on function tongs.record_owner_cost_valuation(uuid, text, uuid, text, uuid, text, bigint, text, text, text, jsonb, jsonb, timestamptz) to service_role;
grant execute on function tongs.link_owner_cost_operation(uuid, uuid, text, text, uuid, uuid, uuid, uuid, uuid, uuid, jsonb, timestamptz) to service_role;

revoke all on function tongs.read_owner_cost_operation(uuid) from public, anon;
revoke all on function tongs.read_owner_cost_summary(text, text) from public, anon;
revoke all on function tongs.verify_owner_cost_reconstruction() from public, anon;
grant execute on function tongs.read_owner_cost_operation(uuid) to authenticated, service_role;
grant execute on function tongs.read_owner_cost_summary(text, text) to authenticated, service_role;
grant execute on function tongs.verify_owner_cost_reconstruction() to authenticated, service_role;

comment on table tongs.owner_cost_operations is 'Private operational identity for Forge-funded work. Not an accounting ledger or balance.';
comment on table tongs.owner_cost_provider_attempts is 'Private immutable provider-attempt authorization evidence; one row does not imply zero or nonzero expense.';
comment on table tongs.owner_cost_attempt_events is 'Append-only provider-attempt lifecycle and private evidence.';
comment on table tongs.owner_cost_valuations is 'Append-only valuation evidence. Only journal_recognized rows have financial effect, exclusively through their canonical journal event.';
comment on table tongs.owner_cost_operation_links is 'Append-only late attribution to existing canonical Forge identities; creates no replacement identity.';
comment on function tongs.read_owner_cost_summary(text, text) is 'Owner-only recognized expense summary derived exclusively from canonical accounting journal entries and requiring an explicit financial environment.';

notify pgrst, 'reload schema';
commit;
