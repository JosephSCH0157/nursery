-- Customer-authorized charge ceilings and append-only paid-media accounting.
-- The ceiling is a commercial authorization, not a claim about maximum provider cost.

begin;

create table tongs.ai_media_authorization_policies (
  id uuid primary key default gen_random_uuid(),
  policy_code text not null unique,
  created_at timestamptz not null default now()
);

create table tongs.ai_media_authorization_policy_revisions (
  id uuid primary key,
  policy_id uuid not null references tongs.ai_media_authorization_policies(id) on delete restrict,
  revision integer not null check (revision > 0),
  previous_revision_id uuid references tongs.ai_media_authorization_policy_revisions(id) on delete restrict,
  provider text not null,
  model_alias text not null,
  model_snapshot text not null,
  endpoint text not null,
  request_kind text not null check (request_kind = 'image_generation'),
  contract_version text not null,
  prompt_max_utf8_bytes integer not null check (prompt_max_utf8_bytes > 0),
  authorization_text_contingency_micros bigint not null check (authorization_text_contingency_micros >= 0),
  output_cost_contract_version text not null,
  allowed_request_shapes jsonb not null check (jsonb_typeof(allowed_request_shapes) = 'object'),
  provenance_json jsonb not null check (jsonb_typeof(provenance_json) = 'object'),
  effective_from timestamptz not null,
  effective_through timestamptz,
  is_active boolean not null,
  actor_id uuid references auth.users(id) on delete set null,
  content_hash text not null check (length(content_hash) = 64),
  created_at timestamptz not null default now(),
  unique (policy_id, revision),
  check (effective_through is null or effective_through > effective_from)
);

create table tongs.ai_media_authorization_policy_sequences (
  policy_id uuid primary key references tongs.ai_media_authorization_policies(id) on delete restrict,
  current_revision_id uuid not null references tongs.ai_media_authorization_policy_revisions(id) on delete restrict,
  current_revision integer not null check (current_revision > 0),
  updated_at timestamptz not null default now()
);

create table tongs.ai_image_output_token_schedules (
  id uuid primary key,
  authorization_policy_revision_id uuid not null references tongs.ai_media_authorization_policy_revisions(id) on delete restrict,
  size text not null,
  width integer not null check (width > 0),
  height integer not null check (height > 0),
  quality text not null check (quality in ('low','medium','high')),
  output_tokens_per_image bigint not null check (output_tokens_per_image > 0),
  calculation_evidence_json jsonb not null check (jsonb_typeof(calculation_evidence_json) = 'object'),
  content_hash text not null check (length(content_hash) = 64),
  created_at timestamptz not null default now(),
  unique (authorization_policy_revision_id, size, quality)
);

alter table tongs.ai_credit_quotes
  add column authorization_policy_revision_id uuid references tongs.ai_media_authorization_policy_revisions(id) on delete restrict,
  add column authorization_policy_revision integer,
  add column prompt_revision_id uuid,
  add column prompt_content_hash text,
  add column prompt_utf8_bytes integer,
  add column known_image_output_tokens bigint,
  add column known_image_output_expense_micros bigint,
  add column authorization_text_contingency_micros bigint,
  add column authorization_provider_expense_basis_micros bigint,
  add column authorized_customer_ceiling bigint;

alter table tongs.ai_credit_quotes add constraint ai_credit_quotes_path_b_shape_check check (
  authorization_policy_revision_id is null or (
    authorization_policy_revision is not null and authorization_policy_revision > 0
    and prompt_content_hash ~ '^[0-9a-f]{64}$'
    and prompt_utf8_bytes is not null and prompt_utf8_bytes between 1 and 16384
    and known_image_output_tokens is not null and known_image_output_tokens > 0
    and known_image_output_expense_micros is not null and known_image_output_expense_micros >= 0
    and authorization_text_contingency_micros is not null and authorization_text_contingency_micros >= 0
    and authorization_provider_expense_basis_micros is not null and authorization_provider_expense_basis_micros >= known_image_output_expense_micros
    and authorized_customer_ceiling is not null and authorized_customer_ceiling > 0
    and reservation_amount = authorized_customer_ceiling
  )
);

create table tongs.paid_media_operations (
  id uuid primary key,
  operation_id text not null,
  operation_fingerprint text not null check (operation_fingerprint ~ '^[0-9a-f]{64}$'),
  user_id uuid not null references auth.users(id) on delete restrict,
  actor_id uuid not null references auth.users(id) on delete restrict,
  workspace_id uuid references tongs.workspaces(id) on delete restrict,
  workpiece_id uuid references tongs.episodes(id) on delete restrict,
  originating_tool text not null,
  originating_entity_id text,
  media_kind text not null check (media_kind in ('image','video')),
  provider text not null,
  model_snapshot text not null,
  quote_id uuid not null references tongs.ai_credit_quotes(id) on delete restrict,
  authorization_policy_revision_id uuid not null references tongs.ai_media_authorization_policy_revisions(id) on delete restrict,
  pricing_policy_revision_id uuid not null references tongs.ai_pricing_policy_revisions(id) on delete restrict,
  authorized_customer_ceiling bigint not null check (authorized_customer_ceiling > 0),
  reservation_id uuid references tongs.ai_credit_reservations(id) on delete restrict,
  prompt_revision_id uuid,
  prompt_content_hash text not null check (prompt_content_hash ~ '^[0-9a-f]{64}$'),
  request_parameters jsonb not null check (jsonb_typeof(request_parameters) = 'object'),
  creator_approval_json jsonb not null check (jsonb_typeof(creator_approval_json) = 'object'),
  contract_version text not null,
  state text not null check (state in ('approved','reserved','submitting','submission_unknown','provider_failed','provider_completed','delivery_failed','delivered','settled')),
  active_attempt_id uuid,
  failure_code text,
  failure_message text,
  reconciliation_required boolean not null default false,
  terminal_receipt_json jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, operation_id),
  check ((state = 'settled') = (terminal_receipt_json is not null))
);

create table tongs.paid_media_operation_events (
  id uuid primary key,
  paid_media_operation_id uuid not null references tongs.paid_media_operations(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  event_type text not null,
  event_ordinal integer not null check (event_ordinal > 0),
  evidence_json jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence_json) = 'object'),
  actor_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (paid_media_operation_id, event_ordinal),
  unique (paid_media_operation_id, id)
);

create table tongs.paid_media_provider_attempts (
  id uuid primary key,
  paid_media_operation_id uuid not null references tongs.paid_media_operations(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  ordinal integer not null check (ordinal > 0),
  provider text not null,
  model_snapshot text not null,
  endpoint text not null,
  request_payload_hash text not null check (request_payload_hash ~ '^[0-9a-f]{64}$'),
  request_evidence_json jsonb not null check (jsonb_typeof(request_evidence_json) = 'object'),
  state text not null check (state in ('submitting','submission_unknown','rejected','evidence_recorded','failed','completed')),
  transmitted boolean,
  submitted_at timestamptz not null,
  provider_request_id text,
  provider_response_id text,
  provider_response_json jsonb,
  transport_evidence_json jsonb not null default '{}'::jsonb check (jsonb_typeof(transport_evidence_json) = 'object'),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (paid_media_operation_id, ordinal)
);

alter table tongs.paid_media_operations
  add constraint paid_media_active_attempt_fk foreign key (active_attempt_id) references tongs.paid_media_provider_attempts(id) on delete restrict;

create table tongs.paid_media_actual_usage_components (
  id uuid primary key default gen_random_uuid(),
  provider_attempt_id uuid not null references tongs.paid_media_provider_attempts(id) on delete restrict,
  component_kind text not null check (component_kind in ('text_input','cached_text_input','image_input','cached_image_input','image_output')),
  quantity bigint not null check (quantity >= 0),
  rate_numerator bigint not null check (rate_numerator >= 0),
  rate_denominator bigint not null check (rate_denominator > 0),
  expense_numerator numeric not null check (expense_numerator >= 0),
  expense_denominator numeric not null check (expense_denominator > 0),
  evidence_json jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence_json) = 'object'),
  created_at timestamptz not null default now(),
  unique (provider_attempt_id, component_kind)
);

create table tongs.paid_media_pricing_overages (
  id uuid primary key,
  paid_media_operation_id uuid not null unique references tongs.paid_media_operations(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  amount_credits bigint not null check (amount_credits > 0),
  reason_code text not null check (reason_code = 'customer_authorization_ceiling'),
  provider_expense_numerator numeric not null,
  provider_expense_denominator numeric not null,
  evidence_json jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence_json) = 'object'),
  created_at timestamptz not null default now()
);

create or replace function tongs._gpt_image_2_output_tokens(p_width integer,p_height integer,p_quality text)
returns bigint language plpgsql immutable strict set search_path=pg_catalog as $$
declare v_grid integer; v_minor integer;
begin
  if p_width%16<>0 or p_height%16<>0 or p_width*p_height not between 655360 and 8294400
     or greatest(p_width,p_height)>3840 or greatest(p_width,p_height)::numeric/least(p_width,p_height)>3 then
    raise exception 'unsupported GPT Image 2 dimensions' using errcode='22023';
  end if;
  v_grid:=case p_quality when 'low' then 16 when 'medium' then 48 when 'high' then 96 else null end;
  if v_grid is null then raise exception 'unsupported GPT Image 2 quality' using errcode='22023'; end if;
  v_minor:=round(v_grid::numeric*least(p_width,p_height)/greatest(p_width,p_height));
  return ceil((v_grid*v_minor)::numeric*(2000000::numeric+p_width::numeric*p_height)/4000000::numeric)::bigint;
end $$;

create or replace function tongs.create_paid_image_authorization_quote(
  p_quote_id uuid,p_user_id uuid,p_operation_id text,p_tool text,p_workspace_id uuid,p_workpiece_id uuid,
  p_originating_entity_id text,p_prompt_revision_id uuid,p_prompt_content_hash text,p_prompt text,
  p_size text,p_quality text,p_output_count integer,p_request_metadata jsonb,p_request_fingerprint text,
  p_effective_at timestamptz,p_expires_at timestamptz
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_policy tongs.ai_media_authorization_policy_revisions%rowtype; v_pricing tongs.ai_pricing_policy_revisions%rowtype;
  v_schedule tongs.ai_image_output_token_schedules%rowtype; v_existing tongs.ai_credit_quotes%rowtype;
  v_prompt_bytes integer; v_output_tokens bigint; v_output_expense bigint; v_basis bigint; v_ceiling bigint;
  v_params jsonb; v_expected text;
begin
  if p_user_id is null or p_quote_id is null or nullif(btrim(p_operation_id),'') is null or p_request_fingerprint !~ '^[0-9a-f]{64}$'
     or p_prompt_content_hash !~ '^[0-9a-f]{64}$' or nullif(p_prompt,'') is null or p_output_count not between 1 and 4
     or p_size='auto' or p_quality='auto' or coalesce(jsonb_typeof(p_request_metadata),'null')<>'object' then
    raise exception 'unsupported paid image authorization request' using errcode='22023';
  end if;
  v_prompt_bytes:=octet_length(convert_to(p_prompt,'utf8'));
  select r.* into v_policy from tongs.ai_media_authorization_policy_revisions r
    join tongs.ai_media_authorization_policy_sequences s on s.current_revision_id=r.id
    where r.provider='openai' and r.model_snapshot='gpt-image-2-2026-04-21' and r.request_kind='image_generation'
      and r.is_active and r.effective_from<=p_effective_at and (r.effective_through is null or r.effective_through>p_effective_at);
  if not found then raise exception 'active paid image authorization policy not found' using errcode='P0002'; end if;
  if v_prompt_bytes>v_policy.prompt_max_utf8_bytes then raise exception 'image prompt exceeds Forge paid-generation limit' using errcode='22023'; end if;
  if p_request_metadata ?| array['image','images','mask','reference_image','source_image','image_input']
     or coalesce(p_request_metadata->>'operation','generation')<>'generation' then
    raise exception 'image inputs and edits are unsupported for paid image V1' using errcode='22023';
  end if;
  select * into v_schedule from tongs.ai_image_output_token_schedules
    where authorization_policy_revision_id=v_policy.id and size=p_size and quality=p_quality;
  if not found then raise exception 'unsupported paid image size or quality' using errcode='22023'; end if;
  select * into v_pricing from tongs.ai_pricing_policy_revisions where id='72000000-0000-4000-8000-000000000001'::uuid;
  if not found or not v_pricing.is_active then raise exception 'active compound pricing policy not found' using errcode='P0002'; end if;
  v_output_tokens:=v_schedule.output_tokens_per_image*p_output_count;
  v_output_expense:=v_output_tokens*30;
  v_basis:=v_output_expense+v_policy.authorization_text_contingency_micros;
  v_ceiling:=ceil(v_basis::numeric*21/125)::bigint;
  v_params:=jsonb_build_object('size',p_size,'quality',p_quality,'output_count',p_output_count,'operation','generation','metadata',p_request_metadata);
  v_expected:=encode(extensions.digest(convert_to(jsonb_build_object(
    'user_id',p_user_id,'operation_id',btrim(p_operation_id),'tool',btrim(p_tool),'workspace_id',p_workspace_id,
    'workpiece_id',p_workpiece_id,'originating_entity_id',p_originating_entity_id,'prompt_revision_id',p_prompt_revision_id,
    'prompt_content_hash',p_prompt_content_hash,'prompt_utf8_bytes',v_prompt_bytes,'request_parameters',v_params,
    'pricing_policy_revision_id',v_pricing.id,'authorization_policy_revision_id',v_policy.id
  )::text,'utf8'),'sha256'),'hex');
  if v_expected<>p_request_fingerprint then raise exception 'paid image quote fingerprint mismatch' using errcode='22023',detail=v_expected; end if;
  select * into v_existing from tongs.ai_credit_quotes where user_id=p_user_id and operation_id=btrim(p_operation_id);
  if found then
    if v_existing.id<>p_quote_id or v_existing.request_fingerprint<>p_request_fingerprint then raise exception 'paid image quote replay conflict' using errcode='23505'; end if;
    return jsonb_build_object('quote',to_jsonb(v_existing),'replay',true);
  end if;
  insert into tongs.ai_credit_quotes(id,user_id,operation_id,tool,workspace_id,workpiece_id,provider,model,media_kind,generation_mode,
    request_parameters,requested_output_count,provider_billable_units,pricing_policy_revision_id,pricing_policy_revision,
    estimated_provider_expense_micros,provider_currency,customer_credit_charge,reservation_amount,request_fingerprint,effective_at,expires_at,
    pricing_contract_version,estimated_provider_expense_numerator,estimated_provider_expense_denominator,maximum_provider_expense_numerator,
    maximum_provider_expense_denominator,estimated_customer_credit_charge,maximum_customer_credit_charge,
    authorization_policy_revision_id,authorization_policy_revision,prompt_revision_id,prompt_content_hash,prompt_utf8_bytes,
    known_image_output_tokens,known_image_output_expense_micros,authorization_text_contingency_micros,
    authorization_provider_expense_basis_micros,authorized_customer_ceiling)
  values(p_quote_id,p_user_id,btrim(p_operation_id),btrim(p_tool),p_workspace_id,p_workpiece_id,'openai','gpt-image-2','image','generation',
    v_params,p_output_count,v_output_tokens,v_pricing.id,v_pricing.revision,v_basis,'USD',v_ceiling,v_ceiling,p_request_fingerprint,
    p_effective_at,p_expires_at,'compound_v2',v_basis,1,v_basis,1,v_ceiling,v_ceiling,v_policy.id,v_policy.revision,
    p_prompt_revision_id,p_prompt_content_hash,v_prompt_bytes,v_output_tokens,v_output_expense,
    v_policy.authorization_text_contingency_micros,v_basis,v_ceiling) returning * into v_existing;
  return jsonb_build_object('quote',to_jsonb(v_existing),'authorization_policy',to_jsonb(v_policy),'output_schedule',to_jsonb(v_schedule),'replay',false);
end $$;

create or replace function tongs.approve_and_reserve_paid_media_operation(
  p_paid_media_operation_id uuid,p_operation_id text,p_operation_fingerprint text,p_quote_id uuid,p_reservation_id uuid,
  p_actor_id uuid,p_creator_approval_json jsonb,p_contract_version text
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_quote tongs.ai_credit_quotes%rowtype; v_existing tongs.paid_media_operations%rowtype; v_reservation jsonb;
begin
  select * into v_quote from tongs.ai_credit_quotes where id=p_quote_id and user_id=p_actor_id for update;
  if not found then raise exception 'owned paid image quote not found' using errcode='P0002'; end if;
  if v_quote.expires_at is not null and v_quote.expires_at<=now() then raise exception 'paid image quote expired' using errcode='22023'; end if;
  if v_quote.request_fingerprint<>p_operation_fingerprint then raise exception 'paid operation fingerprint mismatch' using errcode='22023'; end if;
  select * into v_existing from tongs.paid_media_operations where user_id=p_actor_id and operation_id=p_operation_id for update;
  if found then
    if v_existing.id<>p_paid_media_operation_id or v_existing.operation_fingerprint<>p_operation_fingerprint or v_existing.quote_id<>p_quote_id then
      raise exception 'paid media operation replay conflict' using errcode='23505'; end if;
    return jsonb_build_object('operation',to_jsonb(v_existing),'replay',true);
  end if;
  v_reservation:=tongs.reserve_ai_credits(p_actor_id,p_operation_id,v_quote.tool,'paid_image_generation','image',
    v_quote.authorized_customer_ceiling,p_operation_fingerprint,jsonb_build_object('quote_id',p_quote_id,'ceiling',v_quote.authorized_customer_ceiling),p_reservation_id);
  insert into tongs.paid_media_operations(id,operation_id,operation_fingerprint,user_id,actor_id,workspace_id,workpiece_id,
    originating_tool,originating_entity_id,media_kind,provider,model_snapshot,quote_id,authorization_policy_revision_id,
    pricing_policy_revision_id,authorized_customer_ceiling,reservation_id,prompt_revision_id,prompt_content_hash,request_parameters,
    creator_approval_json,contract_version,state)
  values(p_paid_media_operation_id,p_operation_id,p_operation_fingerprint,p_actor_id,p_actor_id,v_quote.workspace_id,v_quote.workpiece_id,
    v_quote.tool,v_quote.request_parameters#>>'{metadata,originating_entity_id}','image','openai','gpt-image-2-2026-04-21',v_quote.id,
    v_quote.authorization_policy_revision_id,v_quote.pricing_policy_revision_id,v_quote.authorized_customer_ceiling,p_reservation_id,
    v_quote.prompt_revision_id,v_quote.prompt_content_hash,v_quote.request_parameters,p_creator_approval_json,p_contract_version,'approved')
  returning * into v_existing;
  insert into tongs.paid_media_operation_events values(gen_random_uuid(),v_existing.id,p_actor_id,'creator_approved',1,p_creator_approval_json,p_actor_id,now());
  update tongs.paid_media_operations set state='reserved',updated_at=now() where id=v_existing.id returning * into v_existing;
  insert into tongs.paid_media_operation_events values(gen_random_uuid(),v_existing.id,p_actor_id,'credits_reserved',2,
    jsonb_build_object('reservation_id',p_reservation_id,'amount',v_quote.authorized_customer_ceiling),p_actor_id,now());
  return jsonb_build_object('operation',to_jsonb(v_existing),'reservation',v_reservation,'replay',false);
end $$;

create or replace function tongs.begin_paid_media_provider_attempt(
  p_paid_media_operation_id uuid,p_operation_fingerprint text,p_attempt_id uuid,p_request_payload_hash text,p_request_evidence_json jsonb
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_op tongs.paid_media_operations%rowtype; v_attempt tongs.paid_media_provider_attempts%rowtype; v_ordinal integer;
begin
  select * into v_op from tongs.paid_media_operations where id=p_paid_media_operation_id for update;
  if not found then raise exception 'paid media operation not found' using errcode='P0002'; end if;
  if v_op.operation_fingerprint<>p_operation_fingerprint then raise exception 'paid operation fingerprint mismatch' using errcode='22023'; end if;
  if v_op.state='settled' then return jsonb_build_object('operation',to_jsonb(v_op),'replay',true); end if;
  select * into v_attempt from tongs.paid_media_provider_attempts where paid_media_operation_id=v_op.id order by ordinal desc limit 1;
  if found then
    if v_attempt.id<>p_attempt_id or v_attempt.request_payload_hash<>p_request_payload_hash then raise exception 'provider attempt replay conflict' using errcode='23505'; end if;
    return jsonb_build_object('operation',to_jsonb(v_op),'attempt',to_jsonb(v_attempt),'replay',true);
  end if;
  if v_op.state<>'reserved' then raise exception 'paid operation is not reserved for provider submission' using errcode='P0001'; end if;
  v_ordinal:=1;
  insert into tongs.paid_media_provider_attempts(id,paid_media_operation_id,user_id,ordinal,provider,model_snapshot,endpoint,
    request_payload_hash,request_evidence_json,state,transmitted,submitted_at)
  values(p_attempt_id,v_op.id,v_op.user_id,v_ordinal,v_op.provider,v_op.model_snapshot,'/v1/images/generations',
    p_request_payload_hash,p_request_evidence_json,'submitting',false,now()) returning * into v_attempt;
  update tongs.paid_media_operations set state='submitting',active_attempt_id=v_attempt.id,updated_at=now() where id=v_op.id returning * into v_op;
  insert into tongs.paid_media_operation_events values(gen_random_uuid(),v_op.id,v_op.user_id,'provider_submission_started',3,to_jsonb(v_attempt),v_op.actor_id,now());
  return jsonb_build_object('operation',to_jsonb(v_op),'attempt',to_jsonb(v_attempt),'replay',false);
end $$;

create or replace function tongs.record_paid_media_provider_result(
  p_paid_media_operation_id uuid,p_operation_fingerprint text,p_attempt_id uuid,p_provider_request_id text,
  p_provider_response_id text,p_provider_response_json jsonb,p_usage_components jsonb
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_op tongs.paid_media_operations%rowtype; v_attempt tongs.paid_media_provider_attempts%rowtype; v_component jsonb; v_rate record;
begin
  select * into v_op from tongs.paid_media_operations where id=p_paid_media_operation_id for update;
  if not found or v_op.operation_fingerprint<>p_operation_fingerprint then raise exception 'paid operation not found or mismatched' using errcode='P0002'; end if;
  select * into v_attempt from tongs.paid_media_provider_attempts where id=p_attempt_id and paid_media_operation_id=v_op.id for update;
  if not found then raise exception 'provider attempt not found' using errcode='P0002'; end if;
  if v_attempt.state='completed' then return jsonb_build_object('operation',to_jsonb(v_op),'attempt',to_jsonb(v_attempt),'replay',true); end if;
  if v_attempt.state not in ('submitting','evidence_recorded') then raise exception 'provider attempt is not recoverable' using errcode='P0001'; end if;
  if jsonb_typeof(p_provider_response_json)<>'object' or jsonb_typeof(p_usage_components)<>'array' then raise exception 'invalid provider result evidence' using errcode='22023'; end if;
  update tongs.paid_media_provider_attempts set state='completed',transmitted=true,provider_request_id=p_provider_request_id,
    provider_response_id=p_provider_response_id,provider_response_json=p_provider_response_json,completed_at=now()
    where id=v_attempt.id returning * into v_attempt;
  for v_component in select value from jsonb_array_elements(p_usage_components) loop
    select c.* into v_rate from tongs.ai_pricing_rate_components c where c.pricing_policy_revision_id=v_op.pricing_policy_revision_id and c.component_kind=v_component->>'component_kind';
    if not found or coalesce((v_component->>'quantity')::bigint,-1)<0 then raise exception 'invalid actual usage component' using errcode='22023'; end if;
    insert into tongs.paid_media_actual_usage_components(provider_attempt_id,component_kind,quantity,rate_numerator,rate_denominator,
      expense_numerator,expense_denominator,evidence_json)
    values(v_attempt.id,v_rate.component_kind,(v_component->>'quantity')::bigint,v_rate.rate_numerator,v_rate.rate_denominator,
      (v_component->>'quantity')::numeric*v_rate.rate_numerator,v_rate.rate_denominator,v_component);
  end loop;
  if not exists(select 1 from tongs.paid_media_actual_usage_components where provider_attempt_id=v_attempt.id and component_kind='text_input')
    or not exists(select 1 from tongs.paid_media_actual_usage_components where provider_attempt_id=v_attempt.id and component_kind='image_output') then
    raise exception 'provider result is missing authoritative usage' using errcode='22023';
  end if;
  update tongs.paid_media_operations set state=case when state='delivered' then 'delivered' else 'provider_completed' end,
    failure_code=null,failure_message=null,reconciliation_required=false,updated_at=now() where id=v_op.id returning * into v_op;
  insert into tongs.paid_media_operation_events values(gen_random_uuid(),v_op.id,v_op.user_id,'provider_usage_reconciled',
    (select coalesce(max(event_ordinal),0)+1 from tongs.paid_media_operation_events where paid_media_operation_id=v_op.id),
    jsonb_build_object('attempt_id',v_attempt.id,'provider_request_id',p_provider_request_id,'provider_response_id',p_provider_response_id),v_op.actor_id,now());
  return jsonb_build_object('operation',to_jsonb(v_op),'attempt',to_jsonb(v_attempt),'replay',false);
end $$;

create or replace function tongs.record_paid_media_provider_reconciliation(
  p_paid_media_operation_id uuid,p_operation_fingerprint text,p_attempt_id uuid,p_provider_request_id text,
  p_provider_response_id text,p_provider_response_json jsonb,p_failure_code text,p_failure_message text
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_op tongs.paid_media_operations%rowtype; v_attempt tongs.paid_media_provider_attempts%rowtype;
begin
  select * into v_op from tongs.paid_media_operations where id=p_paid_media_operation_id for update;
  if not found or v_op.operation_fingerprint<>p_operation_fingerprint then raise exception 'paid operation not found or mismatched' using errcode='P0002'; end if;
  select * into v_attempt from tongs.paid_media_provider_attempts where id=p_attempt_id and paid_media_operation_id=v_op.id for update;
  if not found then raise exception 'provider attempt not found' using errcode='P0002'; end if;
  if v_attempt.state='evidence_recorded' then return jsonb_build_object('operation',to_jsonb(v_op),'attempt',to_jsonb(v_attempt),'replay',true); end if;
  if v_attempt.state<>'submitting' or jsonb_typeof(p_provider_response_json)<>'object' then raise exception 'provider attempt cannot enter reconciliation' using errcode='P0001'; end if;
  update tongs.paid_media_provider_attempts set state='evidence_recorded',transmitted=true,provider_request_id=p_provider_request_id,
    provider_response_id=p_provider_response_id,provider_response_json=p_provider_response_json,completed_at=now()
    where id=v_attempt.id returning * into v_attempt;
  update tongs.paid_media_operations set state='provider_completed',failure_code=p_failure_code,failure_message=p_failure_message,
    reconciliation_required=true,updated_at=now() where id=v_op.id returning * into v_op;
  insert into tongs.paid_media_operation_events values(gen_random_uuid(),v_op.id,v_op.user_id,'provider_usage_reconciliation_required',
    (select coalesce(max(event_ordinal),0)+1 from tongs.paid_media_operation_events where paid_media_operation_id=v_op.id),
    jsonb_build_object('attempt_id',v_attempt.id,'provider_request_id',p_provider_request_id,'provider_response_id',p_provider_response_id),v_op.actor_id,now());
  return jsonb_build_object('operation',to_jsonb(v_op),'attempt',to_jsonb(v_attempt),'replay',false);
end $$;

create or replace function tongs.mark_paid_media_delivery(
  p_paid_media_operation_id uuid,p_operation_fingerprint text,p_delivery_evidence_json jsonb
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_op tongs.paid_media_operations%rowtype;
begin
  select * into v_op from tongs.paid_media_operations where id=p_paid_media_operation_id for update;
  if not found or v_op.operation_fingerprint<>p_operation_fingerprint then raise exception 'paid operation not found or mismatched' using errcode='P0002'; end if;
  if v_op.state in ('delivered','settled') then return jsonb_build_object('operation',to_jsonb(v_op),'replay',true); end if;
  if v_op.state<>'provider_completed' or jsonb_typeof(p_delivery_evidence_json)<>'object' then raise exception 'provider completion is required before delivery' using errcode='P0001'; end if;
  update tongs.paid_media_operations set state='delivered',updated_at=now() where id=v_op.id returning * into v_op;
  insert into tongs.paid_media_operation_events values(gen_random_uuid(),v_op.id,v_op.user_id,'canonical_delivery_verified',
    (select coalesce(max(event_ordinal),0)+1 from tongs.paid_media_operation_events where paid_media_operation_id=v_op.id),p_delivery_evidence_json,v_op.actor_id,now());
  return jsonb_build_object('operation',to_jsonb(v_op),'replay',false);
end $$;

create or replace function tongs.record_paid_media_terminal_failure(
  p_paid_media_operation_id uuid,p_operation_fingerprint text,p_attempt_id uuid,p_failure_kind text,
  p_failure_code text,p_failure_message text,p_evidence_json jsonb,p_usage_components jsonb,p_release_id uuid
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_op tongs.paid_media_operations%rowtype; v_attempt tongs.paid_media_provider_attempts%rowtype; v_release jsonb; v_component jsonb; v_rate record;
begin
  select * into v_op from tongs.paid_media_operations where id=p_paid_media_operation_id for update;
  if not found or v_op.operation_fingerprint<>p_operation_fingerprint then raise exception 'paid operation not found or mismatched' using errcode='P0002'; end if;
  if p_failure_kind not in ('provider_billable_failure','delivery_failure') then raise exception 'unsupported paid media terminal failure' using errcode='22023'; end if;
  if v_op.state in ('provider_failed','delivery_failed') then return jsonb_build_object('operation',to_jsonb(v_op),'replay',true); end if;
  select * into v_attempt from tongs.paid_media_provider_attempts where id=p_attempt_id and paid_media_operation_id=v_op.id for update;
  if not found then raise exception 'provider attempt not found' using errcode='P0002'; end if;
  if jsonb_typeof(coalesce(p_usage_components,'[]'))<>'array' then raise exception 'invalid provider failure usage evidence' using errcode='22023'; end if;
  for v_component in select value from jsonb_array_elements(coalesce(p_usage_components,'[]')) loop
    select c.* into v_rate from tongs.ai_pricing_rate_components c where c.pricing_policy_revision_id=v_op.pricing_policy_revision_id and c.component_kind=v_component->>'component_kind';
    if not found or coalesce((v_component->>'quantity')::bigint,-1)<0 then raise exception 'invalid provider failure usage component' using errcode='22023'; end if;
    insert into tongs.paid_media_actual_usage_components(provider_attempt_id,component_kind,quantity,rate_numerator,rate_denominator,expense_numerator,expense_denominator,evidence_json)
    values(v_attempt.id,v_rate.component_kind,(v_component->>'quantity')::bigint,v_rate.rate_numerator,v_rate.rate_denominator,(v_component->>'quantity')::numeric*v_rate.rate_numerator,v_rate.rate_denominator,v_component)
    on conflict(provider_attempt_id,component_kind) do nothing;
  end loop;
  update tongs.paid_media_provider_attempts set state=case when state='completed' then state else 'failed' end,transmitted=true,
    transport_evidence_json=coalesce(p_evidence_json,'{}'),completed_at=coalesce(completed_at,now()) where id=v_attempt.id returning * into v_attempt;
  v_release:=tongs.release_ai_credit_reservation(v_op.user_id,v_op.reservation_id,p_release_id,p_failure_kind,p_evidence_json);
  update tongs.paid_media_operations set state=case when p_failure_kind='delivery_failure' then 'delivery_failed' else 'provider_failed' end,
    failure_code=p_failure_code,failure_message=p_failure_message,reconciliation_required=false,updated_at=now() where id=v_op.id returning * into v_op;
  insert into tongs.paid_media_operation_events values(gen_random_uuid(),v_op.id,v_op.user_id,p_failure_kind,
    (select coalesce(max(event_ordinal),0)+1 from tongs.paid_media_operation_events where paid_media_operation_id=v_op.id),coalesce(p_evidence_json,'{}'),v_op.actor_id,now());
  return jsonb_build_object('operation',to_jsonb(v_op),'attempt',to_jsonb(v_attempt),'release',v_release,'replay',false);
end $$;

create or replace function tongs.record_paid_media_definitive_rejection(
  p_paid_media_operation_id uuid,p_operation_fingerprint text,p_attempt_id uuid,p_failure_code text,p_failure_message text,p_evidence_json jsonb,p_release_id uuid
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_op tongs.paid_media_operations%rowtype; v_attempt tongs.paid_media_provider_attempts%rowtype; v_release jsonb;
begin
  select * into v_op from tongs.paid_media_operations where id=p_paid_media_operation_id for update;
  if not found or v_op.operation_fingerprint<>p_operation_fingerprint then raise exception 'paid operation not found or mismatched' using errcode='P0002'; end if;
  select * into v_attempt from tongs.paid_media_provider_attempts where id=p_attempt_id and paid_media_operation_id=v_op.id for update;
  if not found then raise exception 'provider attempt not found' using errcode='P0002'; end if;
  if v_attempt.state='rejected' then return jsonb_build_object('operation',to_jsonb(v_op),'attempt',to_jsonb(v_attempt),'replay',true); end if;
  update tongs.paid_media_provider_attempts set state='rejected',transmitted=true,transport_evidence_json=coalesce(p_evidence_json,'{}'),completed_at=now() where id=v_attempt.id returning * into v_attempt;
  v_release:=tongs.release_ai_credit_reservation(v_op.user_id,v_op.reservation_id,p_release_id,'provider_not_submitted',p_evidence_json);
  update tongs.paid_media_operations set state='provider_failed',failure_code=p_failure_code,failure_message=p_failure_message,updated_at=now() where id=v_op.id returning * into v_op;
  insert into tongs.paid_media_operation_events values(gen_random_uuid(),v_op.id,v_op.user_id,'provider_rejected_before_task',4,coalesce(p_evidence_json,'{}'),v_op.actor_id,now());
  return jsonb_build_object('operation',to_jsonb(v_op),'attempt',to_jsonb(v_attempt),'release',v_release,'replay',false);
end $$;

create or replace function tongs.mark_paid_media_submission_unknown(
  p_paid_media_operation_id uuid,p_operation_fingerprint text,p_attempt_id uuid,p_failure_code text,p_failure_message text,p_evidence_json jsonb
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_op tongs.paid_media_operations%rowtype; v_attempt tongs.paid_media_provider_attempts%rowtype;
begin
  select * into v_op from tongs.paid_media_operations where id=p_paid_media_operation_id for update;
  if not found or v_op.operation_fingerprint<>p_operation_fingerprint then raise exception 'paid operation not found or mismatched' using errcode='P0002'; end if;
  select * into v_attempt from tongs.paid_media_provider_attempts where id=p_attempt_id and paid_media_operation_id=v_op.id for update;
  if not found then raise exception 'provider attempt not found' using errcode='P0002'; end if;
  if v_attempt.state='submission_unknown' then return jsonb_build_object('operation',to_jsonb(v_op),'attempt',to_jsonb(v_attempt),'replay',true); end if;
  update tongs.paid_media_provider_attempts set state='submission_unknown',transmitted=true,transport_evidence_json=coalesce(p_evidence_json,'{}'),completed_at=now() where id=v_attempt.id returning * into v_attempt;
  update tongs.paid_media_operations set state='submission_unknown',failure_code=p_failure_code,failure_message=p_failure_message,reconciliation_required=true,updated_at=now() where id=v_op.id returning * into v_op;
  insert into tongs.paid_media_operation_events values(gen_random_uuid(),v_op.id,v_op.user_id,'submission_unknown',4,coalesce(p_evidence_json,'{}'),v_op.actor_id,now());
  return jsonb_build_object('operation',to_jsonb(v_op),'attempt',to_jsonb(v_attempt),'replay',false);
end $$;

create or replace function tongs.settle_paid_media_operation(
  p_paid_media_operation_id uuid,p_operation_fingerprint text,p_settlement_id uuid,p_overage_id uuid
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_op tongs.paid_media_operations%rowtype; v_attempt tongs.paid_media_provider_attempts%rowtype;
  v_num numeric:=0; v_den numeric:=1; v_row record; v_gcd numeric; v_calculated bigint; v_settled bigint; v_overage bigint; v_financial jsonb; v_receipt jsonb;
begin
  select * into v_op from tongs.paid_media_operations where id=p_paid_media_operation_id for update;
  if not found or v_op.operation_fingerprint<>p_operation_fingerprint then raise exception 'paid operation not found or mismatched' using errcode='P0002'; end if;
  if v_op.state='settled' then return jsonb_build_object('operation',to_jsonb(v_op),'receipt',v_op.terminal_receipt_json,'replay',true); end if;
  if v_op.state<>'delivered' then raise exception 'canonical delivery is required before settlement' using errcode='P0001'; end if;
  select * into v_attempt from tongs.paid_media_provider_attempts where id=v_op.active_attempt_id;
  for v_row in select expense_numerator,expense_denominator from tongs.paid_media_actual_usage_components where provider_attempt_id=v_attempt.id loop
    v_num:=v_num*v_row.expense_denominator+v_row.expense_numerator*v_den; v_den:=v_den*v_row.expense_denominator;
    v_gcd:=tongs._ai_pricing_gcd(v_num,v_den); v_num:=v_num/v_gcd; v_den:=v_den/v_gcd;
  end loop;
  v_calculated:=ceil(v_num*21/(v_den*125))::bigint; v_settled:=least(v_calculated,v_op.authorized_customer_ceiling); v_overage:=greatest(v_calculated-v_settled,0);
  v_financial:=tongs.settle_ai_credit_reservation(v_op.user_id,v_op.reservation_id,p_settlement_id,v_settled,v_attempt.provider_request_id,
    'paid_media_generation',jsonb_build_object('paid_media_operation_id',v_op.id,'provider_expense_numerator',v_num,'provider_expense_denominator',v_den));
  if v_overage>0 then insert into tongs.paid_media_pricing_overages values(p_overage_id,v_op.id,v_op.user_id,v_overage,'customer_authorization_ceiling',v_num,v_den,'{}',now()); end if;
  v_receipt:=jsonb_build_object('operation_id',v_op.operation_id,'operation_fingerprint',v_op.operation_fingerprint,'user_id',v_op.user_id,
    'workspace_id',v_op.workspace_id,'workpiece_id',v_op.workpiece_id,'tool',v_op.originating_tool,'quote_id',v_op.quote_id,
    'authorization_policy_revision_id',v_op.authorization_policy_revision_id,'pricing_policy_revision_id',v_op.pricing_policy_revision_id,
    'authorized_customer_ceiling',v_op.authorized_customer_ceiling,'reservation_id',v_op.reservation_id,'provider_attempt_id',v_attempt.id,
    'provider_request_id',v_attempt.provider_request_id,'provider_response_id',v_attempt.provider_response_id,
    'actual_usage',(select jsonb_agg(to_jsonb(u) order by u.component_kind) from tongs.paid_media_actual_usage_components u where u.provider_attempt_id=v_attempt.id),
    'provider_expense_numerator',v_num,'provider_expense_denominator',v_den,'calculated_customer_charge',v_calculated,
    'settled_customer_charge',v_settled,'forge_pricing_overage',v_overage,'released_reservation',v_op.authorized_customer_ceiling-v_settled,
    'delivery_evidence',(select evidence_json from tongs.paid_media_operation_events where paid_media_operation_id=v_op.id and event_type='canonical_delivery_verified'),
    'state','settled','contract_version',v_op.contract_version,'settled_at',now());
  update tongs.paid_media_operations set state='settled',terminal_receipt_json=v_receipt,updated_at=now() where id=v_op.id returning * into v_op;
  insert into tongs.paid_media_operation_events values(gen_random_uuid(),v_op.id,v_op.user_id,'settled',
    (select coalesce(max(event_ordinal),0)+1 from tongs.paid_media_operation_events where paid_media_operation_id=v_op.id),v_receipt,v_op.actor_id,now());
  return jsonb_build_object('operation',to_jsonb(v_op),'receipt',v_receipt,'financial',v_financial,'replay',false);
end $$;

create or replace function tongs.read_my_paid_media_operation(p_paid_media_operation_id uuid)
returns jsonb language sql security definer stable set search_path=pg_catalog as $$
  select jsonb_build_object('operation',to_jsonb(o),'quote',to_jsonb(q),'reservation',tongs.read_my_ai_credit_reservation(o.reservation_id),
    'attempts',coalesce((select jsonb_agg(to_jsonb(a) order by a.ordinal) from tongs.paid_media_provider_attempts a where a.paid_media_operation_id=o.id),'[]'::jsonb),
    'events',coalesce((select jsonb_agg(to_jsonb(e) order by e.event_ordinal) from tongs.paid_media_operation_events e where e.paid_media_operation_id=o.id),'[]'::jsonb))
  from tongs.paid_media_operations o join tongs.ai_credit_quotes q on q.id=o.quote_id
  where o.id=p_paid_media_operation_id and o.user_id=auth.uid();
$$;

create trigger ai_media_authorization_policy_revisions_immutable before update or delete on tongs.ai_media_authorization_policy_revisions for each row execute function tongs._reject_financial_mutation();
create trigger ai_image_output_token_schedules_immutable before update or delete on tongs.ai_image_output_token_schedules for each row execute function tongs._reject_financial_mutation();
create trigger paid_media_operation_events_immutable before update or delete on tongs.paid_media_operation_events for each row execute function tongs._reject_financial_mutation();
create trigger paid_media_actual_usage_immutable before update or delete on tongs.paid_media_actual_usage_components for each row execute function tongs._reject_financial_mutation();
create trigger paid_media_pricing_overages_immutable before update or delete on tongs.paid_media_pricing_overages for each row execute function tongs._reject_financial_mutation();

alter table tongs.ai_media_authorization_policy_revisions enable row level security;
alter table tongs.ai_image_output_token_schedules enable row level security;
alter table tongs.paid_media_operations enable row level security;
alter table tongs.paid_media_operation_events enable row level security;
alter table tongs.paid_media_provider_attempts enable row level security;
alter table tongs.paid_media_actual_usage_components enable row level security;
alter table tongs.paid_media_pricing_overages enable row level security;
create policy ai_media_authorization_revisions_read on tongs.ai_media_authorization_policy_revisions for select to authenticated using(true);
create policy ai_image_output_schedules_read on tongs.ai_image_output_token_schedules for select to authenticated using(true);
create policy paid_media_operations_read_self on tongs.paid_media_operations for select to authenticated using(user_id=auth.uid());
create policy paid_media_events_read_self on tongs.paid_media_operation_events for select to authenticated using(user_id=auth.uid());
create policy paid_media_attempts_read_self on tongs.paid_media_provider_attempts for select to authenticated using(user_id=auth.uid());
create policy paid_media_usage_read_self on tongs.paid_media_actual_usage_components for select to authenticated using(exists(select 1 from tongs.paid_media_provider_attempts a where a.id=provider_attempt_id and a.user_id=auth.uid()));
create policy paid_media_overages_read_self on tongs.paid_media_pricing_overages for select to authenticated using(user_id=auth.uid());

revoke all on tongs.ai_media_authorization_policies,tongs.ai_media_authorization_policy_revisions,tongs.ai_media_authorization_policy_sequences,
  tongs.ai_image_output_token_schedules,tongs.paid_media_operations,tongs.paid_media_operation_events,tongs.paid_media_provider_attempts,
  tongs.paid_media_actual_usage_components,tongs.paid_media_pricing_overages from public,anon,authenticated,service_role;
grant select on tongs.ai_media_authorization_policies,tongs.ai_media_authorization_policy_revisions,tongs.ai_media_authorization_policy_sequences,
  tongs.ai_image_output_token_schedules to authenticated,service_role;
grant select on tongs.paid_media_operations,tongs.paid_media_operation_events,tongs.paid_media_provider_attempts,
  tongs.paid_media_actual_usage_components,tongs.paid_media_pricing_overages to authenticated,service_role;

revoke all on function tongs.create_paid_image_authorization_quote(uuid,uuid,text,text,uuid,uuid,text,uuid,text,text,text,text,integer,jsonb,text,timestamptz,timestamptz) from public,anon,authenticated;
revoke all on function tongs.approve_and_reserve_paid_media_operation(uuid,text,text,uuid,uuid,uuid,jsonb,text) from public,anon,authenticated;
revoke all on function tongs.begin_paid_media_provider_attempt(uuid,text,uuid,text,jsonb) from public,anon,authenticated;
revoke all on function tongs.record_paid_media_provider_result(uuid,text,uuid,text,text,jsonb,jsonb) from public,anon,authenticated;
revoke all on function tongs.record_paid_media_provider_reconciliation(uuid,text,uuid,text,text,jsonb,text,text) from public,anon,authenticated;
revoke all on function tongs.mark_paid_media_delivery(uuid,text,jsonb) from public,anon,authenticated;
revoke all on function tongs.settle_paid_media_operation(uuid,text,uuid,uuid) from public,anon,authenticated;
revoke all on function tongs.record_paid_media_definitive_rejection(uuid,text,uuid,text,text,jsonb,uuid) from public,anon,authenticated;
revoke all on function tongs.mark_paid_media_submission_unknown(uuid,text,uuid,text,text,jsonb) from public,anon,authenticated;
revoke all on function tongs.record_paid_media_terminal_failure(uuid,text,uuid,text,text,text,jsonb,jsonb,uuid) from public,anon,authenticated;
grant execute on function tongs.create_paid_image_authorization_quote(uuid,uuid,text,text,uuid,uuid,text,uuid,text,text,text,text,integer,jsonb,text,timestamptz,timestamptz) to service_role;
grant execute on function tongs.approve_and_reserve_paid_media_operation(uuid,text,text,uuid,uuid,uuid,jsonb,text) to service_role;
grant execute on function tongs.begin_paid_media_provider_attempt(uuid,text,uuid,text,jsonb) to service_role;
grant execute on function tongs.record_paid_media_provider_result(uuid,text,uuid,text,text,jsonb,jsonb) to service_role;
grant execute on function tongs.record_paid_media_provider_reconciliation(uuid,text,uuid,text,text,jsonb,text,text) to service_role;
grant execute on function tongs.mark_paid_media_delivery(uuid,text,jsonb) to service_role;
grant execute on function tongs.settle_paid_media_operation(uuid,text,uuid,uuid) to service_role;
grant execute on function tongs.record_paid_media_definitive_rejection(uuid,text,uuid,text,text,jsonb,uuid) to service_role;
grant execute on function tongs.mark_paid_media_submission_unknown(uuid,text,uuid,text,text,jsonb) to service_role;
grant execute on function tongs.record_paid_media_terminal_failure(uuid,text,uuid,text,text,text,jsonb,jsonb,uuid) to service_role;
revoke all on function tongs.read_my_paid_media_operation(uuid) from public,anon;
grant execute on function tongs.read_my_paid_media_operation(uuid) to authenticated,service_role;

-- Stable MVP policy and the two explicit Forge request shapes currently used by Hearth.
insert into tongs.ai_media_authorization_policies(id,policy_code)
values('74000000-0000-4000-8000-000000000001','openai:gpt-image-2:path-b-v1') on conflict do nothing;

insert into tongs.ai_media_authorization_policy_revisions(id,policy_id,revision,provider,model_alias,model_snapshot,endpoint,request_kind,
  contract_version,prompt_max_utf8_bytes,authorization_text_contingency_micros,output_cost_contract_version,allowed_request_shapes,
  provenance_json,effective_from,is_active,content_hash)
values('74000000-0000-4000-8000-000000000011','74000000-0000-4000-8000-000000000001',1,'openai','gpt-image-2',
  'gpt-image-2-2026-04-21','/v1/images/generations','image_generation','forge.paid-image-authorization.path-b.v1',16384,100000,
  'openai.gpt-image-2.output-tokens.2026-08-07','{"sizes":["1024x1024","1536x1024"],"qualities":["high"],"output_count":{"minimum":1,"maximum":4},"image_inputs":false,"auto":false}',
  '{"source":"https://developers.openai.com/api/docs/guides/image-generation","policy":"customer-authorized maximum Forge charge; not provider maximum"}',
  '2026-08-07T00:00:00Z',true,encode(extensions.digest(convert_to('forge.paid-image-authorization.path-b.v1|16384|100000|1024x1024,1536x1024|high|1-4','utf8'),'sha256'),'hex'))
on conflict do nothing;
insert into tongs.ai_media_authorization_policy_sequences values('74000000-0000-4000-8000-000000000001','74000000-0000-4000-8000-000000000011',1,now()) on conflict do nothing;

insert into tongs.ai_image_output_token_schedules(id,authorization_policy_revision_id,size,width,height,quality,output_tokens_per_image,calculation_evidence_json,content_hash)
select id,'74000000-0000-4000-8000-000000000011',size,width,height,'high',tongs._gpt_image_2_output_tokens(width,height,'high'),
  jsonb_build_object('formula','ceil(grid_width*grid_height*(2000000+width*height)/4000000)','quality_grid',96,'source','https://developers.openai.com/api/docs/guides/image-generation'),
  encode(extensions.digest(convert_to(size||'|high|'||tongs._gpt_image_2_output_tokens(width,height,'high'),'utf8'),'sha256'),'hex')
from (values
 ('74000000-0000-4000-8000-000000000021'::uuid,'1024x1024',1024,1024),
 ('74000000-0000-4000-8000-000000000022'::uuid,'1536x1024',1536,1024)
) s(id,size,width,height) on conflict do nothing;

notify pgrst, 'reload schema';

commit;
