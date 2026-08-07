-- Shared Forge AI-credit reservation, settlement, release, and correction authority.
-- This extends the single tongs.ai_credits balance; it does not create media balances.

begin;

alter table tongs.ai_credit_ledger alter column delta type bigint;

create table tongs.ai_credit_reservations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  operation_id text not null,
  tool text not null,
  purpose text not null,
  media_class text,
  amount bigint not null check (amount > 0),
  request_fingerprint text not null check (length(request_fingerprint) = 64),
  authorization_json jsonb not null,
  created_at timestamptz not null default now(),
  unique (user_id, operation_id)
);

create table tongs.ai_credit_reservation_events (
  id bigserial primary key,
  reservation_id uuid not null references tongs.ai_credit_reservations(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  event_type text not null check (event_type in ('reserved', 'released', 'settled')),
  amount bigint not null check (amount >= 0),
  idempotency_key uuid not null,
  reason text not null,
  actor_id uuid references auth.users(id) on delete set null,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (reservation_id, idempotency_key)
);

create unique index ai_credit_reservation_reserved_once_idx
  on tongs.ai_credit_reservation_events (reservation_id)
  where event_type = 'reserved';
create unique index ai_credit_reservation_settled_once_idx
  on tongs.ai_credit_reservation_events (reservation_id)
  where event_type = 'settled';

create table tongs.ai_credit_corrections (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete restrict,
  settlement_event_id bigint references tongs.ai_credit_reservation_events(id) on delete restrict,
  correction_type text not null check (correction_type in ('refund', 'credit_adjustment', 'debit_adjustment')),
  amount bigint not null check (amount > 0),
  reason_code text not null,
  actor_id uuid references auth.users(id) on delete set null,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table tongs.ai_credit_unfunded_expenses (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete restrict,
  provider_request_id text,
  attempted_charge bigint not null check (attempted_charge > 0),
  reason_code text not null,
  evidence_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, id)
);

create or replace function tongs._ai_credit_active_holds(p_user_id uuid)
returns bigint
language sql
security definer
set search_path = pg_catalog
stable
as $$
  select coalesce(sum(greatest(0, r.amount - coalesce(e.settled, 0) - coalesce(e.released, 0))), 0)::bigint
  from tongs.ai_credit_reservations r
  left join lateral (
    select
      coalesce(sum(ev.amount) filter (where ev.event_type = 'settled'), 0)::bigint as settled,
      coalesce(sum(ev.amount) filter (where ev.event_type = 'released'), 0)::bigint as released
    from tongs.ai_credit_reservation_events ev
    where ev.reservation_id = r.id
  ) e on true
  where r.user_id = p_user_id;
$$;

create or replace function tongs.get_my_ai_credit_account()
returns table (
  settled_balance bigint,
  reserved_balance bigint,
  available_balance bigint,
  billing_mode text
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  insert into tongs.ai_credits (user_id) values (v_user_id) on conflict do nothing;
  return query
  select c.token_balance,
         tongs._ai_credit_active_holds(v_user_id),
         c.token_balance - tongs._ai_credit_active_holds(v_user_id),
         c.billing_mode
  from tongs.ai_credits c where c.user_id = v_user_id;
end;
$$;

create or replace function tongs.read_my_ai_credit_reservation(p_reservation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_result jsonb;
begin
  if v_user_id is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  select jsonb_build_object(
    'reservation', to_jsonb(r),
    'events', coalesce((select jsonb_agg(to_jsonb(e) order by e.id) from tongs.ai_credit_reservation_events e where e.reservation_id = r.id), '[]'::jsonb)
  ) into v_result
  from tongs.ai_credit_reservations r
  where r.id = p_reservation_id and r.user_id = v_user_id;
  return v_result;
end;
$$;

create or replace function tongs.reserve_ai_credits(
  p_user_id uuid,
  p_operation_id text,
  p_tool text,
  p_purpose text,
  p_media_class text,
  p_amount bigint,
  p_request_fingerprint text,
  p_authorization_json jsonb,
  p_reservation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_account tongs.ai_credits%rowtype;
  v_existing tongs.ai_credit_reservations%rowtype;
  v_holds bigint;
begin
  if p_user_id is null or p_reservation_id is null or p_amount <= 0
     or nullif(btrim(coalesce(p_operation_id, '')), '') is null
     or nullif(btrim(coalesce(p_tool, '')), '') is null
     or nullif(btrim(coalesce(p_purpose, '')), '') is null
     or p_request_fingerprint !~ '^[0-9a-f]{64}$'
     or jsonb_typeof(p_authorization_json) <> 'object' then
    raise exception 'invalid AI-credit reservation' using errcode = '22023';
  end if;
  insert into tongs.ai_credits (user_id) values (p_user_id) on conflict do nothing;
  select * into v_account from tongs.ai_credits where user_id = p_user_id for update;
  select * into v_existing from tongs.ai_credit_reservations
    where user_id = p_user_id and operation_id = p_operation_id for update;
  if found then
    if v_existing.id <> p_reservation_id or v_existing.amount <> p_amount
       or v_existing.tool <> btrim(p_tool) or v_existing.purpose <> btrim(p_purpose)
       or v_existing.media_class is distinct from nullif(btrim(coalesce(p_media_class, '')), '')
       or v_existing.request_fingerprint <> p_request_fingerprint
       or v_existing.authorization_json <> p_authorization_json then
      raise exception 'AI-credit reservation replay conflict' using errcode = '23505';
    end if;
    return jsonb_build_object('reservation', to_jsonb(v_existing), 'settled_balance', v_account.token_balance,
      'reserved_balance', tongs._ai_credit_active_holds(p_user_id),
      'available_balance', v_account.token_balance - tongs._ai_credit_active_holds(p_user_id));
  end if;
  v_holds := tongs._ai_credit_active_holds(p_user_id);
  if p_amount > v_account.token_balance - v_holds then
    raise exception 'insufficient AI credits' using errcode = 'P0001',
      detail = jsonb_build_object('required', p_amount, 'available', v_account.token_balance - v_holds)::text;
  end if;
  insert into tongs.ai_credit_reservations (
    id, user_id, operation_id, tool, purpose, media_class, amount, request_fingerprint, authorization_json
  ) values (
    p_reservation_id, p_user_id, btrim(p_operation_id), btrim(p_tool), btrim(p_purpose),
    nullif(btrim(coalesce(p_media_class, '')), ''), p_amount, p_request_fingerprint, p_authorization_json
  ) returning * into v_existing;
  insert into tongs.ai_credit_reservation_events (
    reservation_id, user_id, event_type, amount, idempotency_key, reason, actor_id, metadata_json
  ) values (p_reservation_id, p_user_id, 'reserved', p_amount, p_reservation_id, 'reservation_created', p_user_id, p_authorization_json);
  return jsonb_build_object('reservation', to_jsonb(v_existing), 'settled_balance', v_account.token_balance,
    'reserved_balance', tongs._ai_credit_active_holds(p_user_id),
    'available_balance', v_account.token_balance - tongs._ai_credit_active_holds(p_user_id));
end;
$$;

create or replace function tongs.release_ai_credit_reservation(
  p_user_id uuid,
  p_reservation_id uuid,
  p_release_id uuid,
  p_reason text,
  p_metadata_json jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_account tongs.ai_credits%rowtype;
  v_reservation tongs.ai_credit_reservations%rowtype;
  v_existing tongs.ai_credit_reservation_events%rowtype;
  v_remaining bigint;
begin
  select * into v_account from tongs.ai_credits where user_id = p_user_id for update;
  if not found then raise exception 'AI-credit account not found' using errcode = 'P0002'; end if;
  select * into v_reservation from tongs.ai_credit_reservations where id = p_reservation_id and user_id = p_user_id for update;
  if not found then raise exception 'reservation not found' using errcode = 'P0002'; end if;
  select * into v_existing from tongs.ai_credit_reservation_events where reservation_id = p_reservation_id and idempotency_key = p_release_id;
  if found then return jsonb_build_object('event', to_jsonb(v_existing), 'replay', true); end if;
  select greatest(0, v_reservation.amount - coalesce(sum(amount), 0)) into v_remaining
    from tongs.ai_credit_reservation_events where reservation_id = p_reservation_id and event_type in ('settled', 'released');
  insert into tongs.ai_credit_reservation_events (
    reservation_id, user_id, event_type, amount, idempotency_key, reason, actor_id, metadata_json
  ) values (p_reservation_id, p_user_id, 'released', v_remaining, p_release_id,
    coalesce(nullif(btrim(p_reason), ''), 'reservation_released'), p_user_id, coalesce(p_metadata_json, '{}'::jsonb))
  returning * into v_existing;
  return jsonb_build_object('event', to_jsonb(v_existing), 'replay', false,
    'settled_balance', v_account.token_balance, 'reserved_balance', tongs._ai_credit_active_holds(p_user_id),
    'available_balance', v_account.token_balance - tongs._ai_credit_active_holds(p_user_id));
end;
$$;

create or replace function tongs.settle_ai_credit_reservation(
  p_user_id uuid,
  p_reservation_id uuid,
  p_settlement_id uuid,
  p_customer_charge bigint,
  p_provider_request_id text,
  p_reason text,
  p_metadata_json jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_account tongs.ai_credits%rowtype;
  v_reservation tongs.ai_credit_reservations%rowtype;
  v_event tongs.ai_credit_reservation_events%rowtype;
  v_release bigint;
  v_prior_release bigint;
begin
  if p_customer_charge < 0 then raise exception 'customer charge cannot be negative' using errcode = '22023'; end if;
  select * into v_account from tongs.ai_credits where user_id = p_user_id for update;
  if not found then raise exception 'AI-credit account not found' using errcode = 'P0002'; end if;
  select * into v_reservation from tongs.ai_credit_reservations where id = p_reservation_id and user_id = p_user_id for update;
  if not found then raise exception 'reservation not found' using errcode = 'P0002'; end if;
  select * into v_event from tongs.ai_credit_reservation_events where reservation_id = p_reservation_id and event_type = 'settled';
  if found then
    if v_event.idempotency_key <> p_settlement_id or v_event.amount <> p_customer_charge then
      raise exception 'settlement replay conflict' using errcode = '23505';
    end if;
    return jsonb_build_object('event', to_jsonb(v_event), 'replay', true);
  end if;
  select coalesce(sum(amount), 0)::bigint into v_prior_release
    from tongs.ai_credit_reservation_events where reservation_id = p_reservation_id and event_type = 'released';
  if v_prior_release > 0 then raise exception 'released reservation cannot be settled' using errcode = 'P0001'; end if;
  if p_customer_charge > v_reservation.amount then raise exception 'charge exceeds reservation' using errcode = '22023'; end if;
  if p_customer_charge > v_account.token_balance then raise exception 'insufficient settled AI credits' using errcode = 'P0001'; end if;
  insert into tongs.ai_credit_ledger (request_id, user_id, delta, reason, provider_request_id)
    values (p_settlement_id, p_user_id, -p_customer_charge,
      coalesce(nullif(btrim(p_reason), ''), 'reservation_settlement'), p_provider_request_id);
  update tongs.ai_credits set token_balance = token_balance - p_customer_charge, updated_at = now() where user_id = p_user_id;
  insert into tongs.ai_credit_reservation_events (
    reservation_id, user_id, event_type, amount, idempotency_key, reason, actor_id, metadata_json
  ) values (p_reservation_id, p_user_id, 'settled', p_customer_charge, p_settlement_id,
    coalesce(nullif(btrim(p_reason), ''), 'reservation_settlement'), p_user_id, coalesce(p_metadata_json, '{}'::jsonb))
  returning * into v_event;
  v_release := v_reservation.amount - p_customer_charge;
  if v_release > 0 then
    insert into tongs.ai_credit_reservation_events (
      reservation_id, user_id, event_type, amount, idempotency_key, reason, actor_id, metadata_json
    ) values (p_reservation_id, p_user_id, 'released', v_release,
      (substr(md5(p_settlement_id::text || ':release'),1,8)||'-'||substr(md5(p_settlement_id::text || ':release'),9,4)||'-4'||substr(md5(p_settlement_id::text || ':release'),14,3)||'-8'||substr(md5(p_settlement_id::text || ':release'),18,3)||'-'||substr(md5(p_settlement_id::text || ':release'),21,12))::uuid,
      'unused_reservation_released', p_user_id, '{}'::jsonb);
  end if;
  return jsonb_build_object('event', to_jsonb(v_event), 'replay', false,
    'released_amount', v_release, 'settled_balance', v_account.token_balance - p_customer_charge,
    'reserved_balance', tongs._ai_credit_active_holds(p_user_id),
    'available_balance', v_account.token_balance - p_customer_charge - tongs._ai_credit_active_holds(p_user_id));
end;
$$;

create or replace function tongs.apply_ai_credit_correction(
  p_user_id uuid,
  p_correction_id uuid,
  p_settlement_event_id bigint,
  p_correction_type text,
  p_amount bigint,
  p_reason_code text,
  p_actor_id uuid,
  p_metadata_json jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_account tongs.ai_credits%rowtype;
  v_existing tongs.ai_credit_corrections%rowtype;
  v_delta bigint;
  v_available bigint;
begin
  select * into v_account from tongs.ai_credits where user_id = p_user_id for update;
  if not found then raise exception 'AI-credit account not found' using errcode = 'P0002'; end if;
  select * into v_existing from tongs.ai_credit_corrections where id = p_correction_id;
  if found then
    if v_existing.user_id <> p_user_id or v_existing.amount <> p_amount or v_existing.correction_type <> p_correction_type
       or v_existing.settlement_event_id is distinct from p_settlement_event_id or v_existing.reason_code <> p_reason_code then
      raise exception 'correction replay conflict' using errcode = '23505';
    end if;
    return jsonb_build_object('correction', to_jsonb(v_existing), 'replay', true);
  end if;
  if p_amount <= 0 or p_correction_type not in ('refund', 'credit_adjustment', 'debit_adjustment') then
    raise exception 'invalid correction' using errcode = '22023';
  end if;
  if p_correction_type = 'refund' and not exists (
    select 1 from tongs.ai_credit_reservation_events e
    where e.id = p_settlement_event_id and e.user_id = p_user_id and e.event_type = 'settled'
  ) then raise exception 'refund requires an owned settlement' using errcode = '22023'; end if;
  v_delta := case when p_correction_type = 'debit_adjustment' then -p_amount else p_amount end;
  v_available := v_account.token_balance - tongs._ai_credit_active_holds(p_user_id);
  if v_delta < 0 and -v_delta > v_available then raise exception 'insufficient available AI credits' using errcode = 'P0001'; end if;
  insert into tongs.ai_credit_corrections values (
    p_correction_id, p_user_id, p_settlement_event_id, p_correction_type, p_amount,
    p_reason_code, p_actor_id, coalesce(p_metadata_json, '{}'::jsonb), now()
  ) returning * into v_existing;
  insert into tongs.ai_credit_ledger (request_id, user_id, delta, reason)
    values (p_correction_id, p_user_id, v_delta, 'correction:' || p_reason_code);
  update tongs.ai_credits set token_balance = token_balance + v_delta, updated_at = now() where user_id = p_user_id;
  return jsonb_build_object('correction', to_jsonb(v_existing), 'replay', false,
    'settled_balance', v_account.token_balance + v_delta);
end;
$$;

create or replace function tongs.record_ai_credit_unfunded_expense(
  p_user_id uuid,
  p_event_id uuid,
  p_provider_request_id text,
  p_attempted_charge bigint,
  p_reason_code text,
  p_evidence_json jsonb default '{}'::jsonb
)
returns tongs.ai_credit_unfunded_expenses
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare v_event tongs.ai_credit_unfunded_expenses%rowtype;
begin
  if p_user_id is null or p_event_id is null or p_attempted_charge <= 0 or nullif(btrim(p_reason_code),'') is null then
    raise exception 'invalid unfunded-expense evidence' using errcode = '22023';
  end if;
  select * into v_event from tongs.ai_credit_unfunded_expenses where id=p_event_id;
  if found then
    if v_event.user_id<>p_user_id or v_event.attempted_charge<>p_attempted_charge
       or v_event.provider_request_id is distinct from p_provider_request_id or v_event.reason_code<>p_reason_code then
      raise exception 'unfunded-expense replay conflict' using errcode = '23505';
    end if;
    return v_event;
  end if;
  insert into tongs.ai_credit_unfunded_expenses(id,user_id,provider_request_id,attempted_charge,reason_code,evidence_json)
    values(p_event_id,p_user_id,p_provider_request_id,p_attempted_charge,p_reason_code,coalesce(p_evidence_json,'{}'::jsonb))
    returning * into v_event;
  return v_event;
end;
$$;

-- Compatibility debit: exact, replay-safe, row-locked, and unable to consume held credits.
create or replace function tongs.apply_ai_token_delta(
  p_user_id uuid,
  p_delta integer,
  p_reason text,
  p_request_id uuid,
  p_provider_request_id text default null
)
returns table (token_balance bigint, billing_mode text)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_account tongs.ai_credits%rowtype;
  v_available bigint;
begin
  if p_user_id is null or p_request_id is null then raise exception 'user and request required' using errcode = '22023'; end if;
  insert into tongs.ai_credits (user_id) values (p_user_id) on conflict do nothing;
  select * into v_account from tongs.ai_credits where user_id = p_user_id for update;
  if exists (select 1 from tongs.ai_credit_ledger where request_id = p_request_id and user_id = p_user_id) then
    return query select c.token_balance, c.billing_mode from tongs.ai_credits c where c.user_id = p_user_id;
    return;
  end if;
  if p_delta < 0 then
    v_available := v_account.token_balance - tongs._ai_credit_active_holds(p_user_id);
    if -p_delta::bigint > v_available then
      raise exception 'insufficient available AI credits' using errcode = 'P0001',
        detail = jsonb_build_object('required', -p_delta::bigint, 'available', v_available)::text;
    end if;
  end if;
  insert into tongs.ai_credit_ledger (request_id, user_id, delta, reason, provider_request_id)
    values (p_request_id, p_user_id, p_delta, coalesce(nullif(btrim(p_reason), ''), 'legacy_ai_credit_delta'), p_provider_request_id);
  update tongs.ai_credits c set token_balance = c.token_balance + p_delta, updated_at = now() where c.user_id = p_user_id;
  return query select c.token_balance, c.billing_mode from tongs.ai_credits c where c.user_id = p_user_id;
end;
$$;

create or replace function tongs._reject_financial_mutation()
returns trigger language plpgsql set search_path = pg_catalog as $$
begin raise exception 'financial history is immutable' using errcode = '55000'; end; $$;

create trigger ai_credit_reservations_immutable before update or delete on tongs.ai_credit_reservations
for each row execute function tongs._reject_financial_mutation();
create trigger ai_credit_reservation_events_immutable before update or delete on tongs.ai_credit_reservation_events
for each row execute function tongs._reject_financial_mutation();
create trigger ai_credit_corrections_immutable before update or delete on tongs.ai_credit_corrections
for each row execute function tongs._reject_financial_mutation();
create trigger ai_credit_unfunded_expenses_immutable before update or delete on tongs.ai_credit_unfunded_expenses
for each row execute function tongs._reject_financial_mutation();

alter table tongs.ai_credit_reservations enable row level security;
alter table tongs.ai_credit_reservation_events enable row level security;
alter table tongs.ai_credit_corrections enable row level security;
alter table tongs.ai_credit_unfunded_expenses enable row level security;
create policy ai_credit_reservations_read_self on tongs.ai_credit_reservations for select to authenticated using (user_id = auth.uid());
create policy ai_credit_reservation_events_read_self on tongs.ai_credit_reservation_events for select to authenticated using (user_id = auth.uid());
create policy ai_credit_corrections_read_self on tongs.ai_credit_corrections for select to authenticated using (user_id = auth.uid());
create policy ai_credit_unfunded_expenses_read_self on tongs.ai_credit_unfunded_expenses for select to authenticated using (user_id = auth.uid());

revoke all on tongs.ai_credit_reservations, tongs.ai_credit_reservation_events, tongs.ai_credit_corrections, tongs.ai_credit_unfunded_expenses from public, anon, authenticated, service_role;
grant select on tongs.ai_credit_reservations, tongs.ai_credit_reservation_events, tongs.ai_credit_corrections, tongs.ai_credit_unfunded_expenses to authenticated;
grant select on tongs.ai_credit_reservations, tongs.ai_credit_reservation_events, tongs.ai_credit_corrections, tongs.ai_credit_unfunded_expenses to service_role;
revoke all on function tongs.reserve_ai_credits(uuid,text,text,text,text,bigint,text,jsonb,uuid) from public, anon, authenticated;
revoke all on function tongs.release_ai_credit_reservation(uuid,uuid,uuid,text,jsonb) from public, anon, authenticated;
revoke all on function tongs.settle_ai_credit_reservation(uuid,uuid,uuid,bigint,text,text,jsonb) from public, anon, authenticated;
revoke all on function tongs.apply_ai_credit_correction(uuid,uuid,bigint,text,bigint,text,uuid,jsonb) from public, anon, authenticated;
revoke all on function tongs.record_ai_credit_unfunded_expense(uuid,uuid,text,bigint,text,jsonb) from public, anon, authenticated;
grant execute on function tongs.reserve_ai_credits(uuid,text,text,text,text,bigint,text,jsonb,uuid) to service_role;
grant execute on function tongs.release_ai_credit_reservation(uuid,uuid,uuid,text,jsonb) to service_role;
grant execute on function tongs.settle_ai_credit_reservation(uuid,uuid,uuid,bigint,text,text,jsonb) to service_role;
grant execute on function tongs.apply_ai_credit_correction(uuid,uuid,bigint,text,bigint,text,uuid,jsonb) to service_role;
grant execute on function tongs.record_ai_credit_unfunded_expense(uuid,uuid,text,bigint,text,jsonb) to service_role;
revoke all on function tongs.get_my_ai_credit_account() from public, anon;
revoke all on function tongs.read_my_ai_credit_reservation(uuid) from public, anon;
grant execute on function tongs.get_my_ai_credit_account() to authenticated, service_role;
grant execute on function tongs.read_my_ai_credit_reservation(uuid) to authenticated, service_role;

commit;
