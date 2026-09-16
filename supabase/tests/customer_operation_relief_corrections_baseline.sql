-- Minimal current-shape financial schema for the disposable relief-correction proof.
-- This database contains no application or production data.
create schema extensions;
create schema auth;
create schema tongs;
create extension pgcrypto with schema extensions;

create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;
create function auth.role() returns text language sql stable as $$
  select nullif(current_setting('request.jwt.claim.role',true),'')
$$;

create table auth.users(id uuid primary key);
create table tongs.workspaces(id uuid primary key,name text);
create table tongs.platform_operators(
  user_id uuid primary key references auth.users(id),reason text not null,
  granted_by uuid references auth.users(id),granted_at timestamptz not null default now()
);
create function tongs.is_platform_operator(p_user_id uuid)
returns boolean language plpgsql stable security definer set search_path=pg_catalog as $$
declare caller uuid:=auth.uid(); caller_role text:=coalesce(auth.role(),'');
begin
  if p_user_id is null then return false; end if;
  if caller_role<>'service_role' and caller is distinct from p_user_id then return false; end if;
  return exists(select 1 from tongs.platform_operators where user_id=p_user_id);
end $$;

create table tongs.accounting_journal_events(
  id uuid primary key,idempotency_key text not null unique,event_type text not null,
  environment text not null,source_type text not null,source_id text not null,currency text,
  user_id uuid,workspace_id uuid,actor_id uuid,payload_hash text not null,
  metadata_json jsonb not null default '{}'::jsonb,occurred_at timestamptz not null,
  created_at timestamptz not null default now()
);
create table tongs.customer_deposits(
  id uuid primary key,user_id uuid not null references auth.users(id),stripe_mode text not null,
  gross_amount_micros bigint not null,credit_units bigint not null,currency text not null
);
create table tongs.customer_deposit_consumptions(
  id uuid primary key,deposit_id uuid not null references tongs.customer_deposits(id),
  user_id uuid not null references auth.users(id),allocation_key text not null,
  operation_id text not null,recognized_revenue_micros bigint not null,
  credit_units_consumed bigint not null,allocated_processor_fee_micros bigint not null default 0,
  journal_event_id uuid not null references tongs.accounting_journal_events(id),
  metadata_json jsonb not null default '{}'::jsonb,consumed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create table tongs.customer_deposit_refunds(
  id uuid primary key,deposit_id uuid not null references tongs.customer_deposits(id),
  refunded_credit_units bigint not null,liability_release_micros bigint not null
);
create table tongs.legacy_deposit_credit_conversions(
  deposit_id uuid primary key references tongs.customer_deposits(id),
  canonical_available_credit_units bigint not null
);
create table tongs.legacy_deposit_conversion_consumptions(
  consumption_id uuid primary key references tongs.customer_deposit_consumptions(id)
);
create table tongs.legacy_deposit_conversion_refunds(
  refund_id uuid primary key references tongs.customer_deposit_refunds(id)
);

create table tongs.customer_spending_quotes(
  id uuid primary key,user_id uuid not null references auth.users(id),operation_id text not null,
  currency text not null,normal_maximum_charge_micros bigint not null,
  provider_funding_summary jsonb not null default '{}'::jsonb
);
create table tongs.customer_spending_quote_acceptances(
  quote_id uuid primary key references tongs.customer_spending_quotes(id)
);
create table tongs.funding_reservations(
  id uuid primary key,quote_id uuid references tongs.customer_spending_quotes(id),
  user_id uuid not null references auth.users(id),operation_id text not null,
  funding_source_type text not null,funding_source_id uuid,currency text not null,
  reserved_customer_charge_micros bigint not null,reserved_credit_units bigint not null,
  reserved_wholesale_spend_micros bigint not null,idempotency_key text not null,
  created_at timestamptz not null default now(),funding_environment text not null,
  rollout_authorization_id uuid
);
create table tongs.funding_reservation_events(
  id uuid primary key,reservation_id uuid not null references tongs.funding_reservations(id),
  sequence integer not null,event_key text not null,event_type text not null,
  customer_charge_micros bigint,credit_units bigint,wholesale_spend_micros bigint,
  failure_class text,evidence_json jsonb not null default '{}'::jsonb,
  actor_id uuid,lease_expires_at timestamptz,provider_attempt_key text,
  created_at timestamptz not null default now()
);
create table tongs.openai_text_persisted_results(
  id uuid primary key,reservation_id uuid not null references tongs.funding_reservations(id),
  operation_id text not null,route_code text not null,user_id uuid not null references auth.users(id),
  workspace_id uuid,workpiece_id text,request_fingerprint text not null,provider_request_id text,
  model text not null,input_units bigint not null,output_units bigint not null,
  result_hash text not null,result_json jsonb not null,persisted_at timestamptz not null default now()
);
create table tongs.openai_text_funding_bindings(
  operation_id text primary key,route_code text not null,reservation_id uuid not null unique
    references tongs.funding_reservations(id),credential_funding text not null,
  model text not null,pricing_revision_id uuid,maximum_input_units bigint not null,
  maximum_output_units bigint not null,maximum_attempts smallint not null,
  created_at timestamptz not null default now(),cost_policy_revision_id uuid,rollout_revision integer
);
create table tongs.customer_operation_reliefs(
  id uuid primary key,reservation_id uuid not null references tongs.funding_reservations(id),
  relief_key text not null unique,funding_source_type text not null,funding_source_id uuid not null,
  original_consumption_id uuid not null,currency text not null,
  customer_credit_micros bigint not null,restored_units bigint not null,
  revenue_reversal_micros bigint not null,reason text not null,
  journal_event_id uuid not null references tongs.accounting_journal_events(id),
  evidence_json jsonb not null default '{}'::jsonb,relieved_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create table tongs.accounting_journal_entries(
  event_id uuid not null references tongs.accounting_journal_events(id),
  line_number smallint not null,account_code text not null,user_id uuid,workspace_id uuid,
  deposit_id uuid references tongs.customer_deposits(id),allowance_grant_id uuid,
  owner_budget_id uuid,currency text,amount_micros bigint not null default 0,
  unit_kind text,quantity_delta bigint not null default 0,
  metadata_json jsonb not null default '{}'::jsonb,created_at timestamptz not null default now(),
  primary key(event_id,line_number)
);

create function tongs._reject_accounting_mutation()
returns trigger language plpgsql set search_path=pg_catalog as $$
begin raise exception 'accounting records are append-only' using errcode='55000'; end $$;
create function tongs._require_accounting_service_role()
returns void language plpgsql stable security definer set search_path=pg_catalog as $$
begin
  if coalesce(auth.role(),'')<>'service_role' then
    raise exception 'service role required' using errcode='42501';
  end if;
end $$;
create function tongs._accounting_payload_hash(p_payload jsonb)
returns text language sql immutable set search_path=pg_catalog as $$
  select encode(extensions.digest(convert_to(coalesce(p_payload,'{}'::jsonb)::text,'utf8'),'sha256'),'hex')
$$;
create function tongs._create_accounting_event(
  p_event_id uuid,p_idempotency_key text,p_event_type text,p_environment text,
  p_source_type text,p_source_id text,p_currency text,p_user_id uuid,p_workspace_id uuid,
  p_actor_id uuid,p_payload jsonb,p_occurred_at timestamptz
) returns boolean language plpgsql security definer set search_path=pg_catalog as $$
declare hash text:=tongs._accounting_payload_hash(p_payload); existing tongs.accounting_journal_events%rowtype;
begin
  select * into existing from tongs.accounting_journal_events where idempotency_key=p_idempotency_key;
  if found then
    if existing.id<>p_event_id or existing.payload_hash<>hash then
      raise exception 'accounting event replay conflict' using errcode='23505';
    end if;
    return false;
  end if;
  insert into tongs.accounting_journal_events(
    id,idempotency_key,event_type,environment,source_type,source_id,currency,user_id,
    workspace_id,actor_id,payload_hash,metadata_json,occurred_at
  ) values (
    p_event_id,p_idempotency_key,p_event_type,p_environment,p_source_type,p_source_id,p_currency,
    p_user_id,p_workspace_id,p_actor_id,hash,p_payload,coalesce(p_occurred_at,now())
  );
  return true;
end $$;
create function tongs._assert_accounting_event_balanced(p_event_id uuid)
returns void language plpgsql stable security definer set search_path=pg_catalog as $$
begin
  if exists(select 1 from tongs.accounting_journal_entries where event_id=p_event_id
    and amount_micros<>0 group by currency having sum(amount_micros)<>0) then
    raise exception 'accounting event is not balanced' using errcode='23514';
  end if;
end $$;

create function tongs._unconsumed_deposit_credit_units(p_deposit_id uuid)
returns bigint language sql stable security definer set search_path=pg_catalog as $$
  select credit_units from tongs.customer_deposits where id=p_deposit_id
$$;
create function tongs._unconsumed_deposit_value_micros(p_deposit_id uuid)
returns bigint language sql stable security definer set search_path=pg_catalog as $$
  select gross_amount_micros from tongs.customer_deposits where id=p_deposit_id
$$;
create function tongs._funding_reservation_state(p_reservation_id uuid)
returns text language sql stable as $$
  select coalesce((select event_type from tongs.funding_reservation_events
    where reservation_id=p_reservation_id order by sequence desc limit 1),'reserved')
$$;

create function tongs.read_failure_financials(p_limit integer default 250)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
begin
 return (select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from (
  select r.id reservation_id,
   coalesce(s.customer_charge_micros,0)-coalesce(rel.revenue_reversal_micros,0) recognized_revenue_micros,
   r.created_at
  from tongs.funding_reservations r
  left join lateral(select customer_charge_micros from tongs.funding_reservation_events
    where reservation_id=r.id and event_type='settled' order by sequence desc limit 1)s on true
  left join tongs.customer_operation_reliefs rel on rel.reservation_id=r.id
  order by r.created_at desc limit p_limit
 )x);
end $$;
create function tongs.read_my_spending_operation(p_operation_id text)
returns jsonb language sql stable security definer set search_path=pg_catalog as $$
  select '{}'::jsonb
$$;

grant usage on schema auth,tongs to anon,authenticated,service_role;
grant execute on function auth.uid(),auth.role(),tongs.is_platform_operator(uuid) to authenticated,service_role;
grant execute on all functions in schema tongs to service_role;
