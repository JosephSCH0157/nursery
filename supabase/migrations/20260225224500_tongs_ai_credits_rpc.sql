-- Forge AI credit accounting primitives.
-- Provides:
-- - tongs.get_my_ai_credits()
-- - tongs.apply_ai_token_delta(...)
-- - auditable ledger rows keyed by request_id

begin;

create table if not exists tongs.ai_credits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  token_balance bigint not null default 0 check (token_balance >= 0),
  billing_mode text not null default 'forge' check (billing_mode in ('forge', 'byo')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists tongs.ai_credit_ledger (
  id bigserial primary key,
  request_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  delta integer not null,
  reason text not null,
  provider_request_id text,
  created_at timestamptz not null default now(),
  unique (request_id, user_id)
);

create index if not exists ai_credit_ledger_user_created_at_idx
  on tongs.ai_credit_ledger (user_id, created_at desc);

alter table tongs.ai_credits enable row level security;
alter table tongs.ai_credit_ledger enable row level security;

drop policy if exists ai_credits_select_self on tongs.ai_credits;
create policy ai_credits_select_self
on tongs.ai_credits
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists ai_credit_ledger_select_self on tongs.ai_credit_ledger;
create policy ai_credit_ledger_select_self
on tongs.ai_credit_ledger
for select
to authenticated
using (user_id = auth.uid());

create or replace function tongs.get_my_ai_credits()
returns table (
  token_balance bigint,
  billing_mode text
)
language plpgsql
security definer
set search_path = tongs, public
as $$
declare
  v_user uuid;
begin
  v_user := auth.uid();
  if v_user is null then
    raise exception 'Not authenticated'
      using errcode = '42501';
  end if;

  insert into tongs.ai_credits (user_id)
  values (v_user)
  on conflict (user_id) do nothing;

  return query
  select c.token_balance, c.billing_mode
  from tongs.ai_credits c
  where c.user_id = v_user;
end;
$$;

create or replace function tongs.apply_ai_token_delta(
  p_user_id uuid,
  p_delta integer,
  p_reason text,
  p_request_id uuid,
  p_provider_request_id text default null
)
returns table (
  token_balance bigint,
  billing_mode text
)
language plpgsql
security definer
set search_path = tongs, public
as $$
declare
  v_reason text;
begin
  if p_user_id is null then
    raise exception 'p_user_id required'
      using errcode = '22023';
  end if;

  if p_request_id is null then
    raise exception 'p_request_id required'
      using errcode = '22023';
  end if;

  v_reason := nullif(trim(coalesce(p_reason, '')), '');
  if v_reason is null then
    v_reason := 'hearth:chat';
  end if;

  insert into tongs.ai_credits (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  insert into tongs.ai_credit_ledger (
    request_id,
    user_id,
    delta,
    reason,
    provider_request_id
  )
  values (
    p_request_id,
    p_user_id,
    p_delta,
    v_reason,
    p_provider_request_id
  )
  on conflict (request_id, user_id) do nothing;

  -- If request_id already exists for this user, skip balance mutation (idempotent).
  if not found then
    return query
    select c.token_balance, c.billing_mode
    from tongs.ai_credits c
    where c.user_id = p_user_id;
    return;
  end if;

  update tongs.ai_credits c
  set
    token_balance = greatest(0, c.token_balance + p_delta),
    updated_at = now()
  where c.user_id = p_user_id;

  return query
  select c.token_balance, c.billing_mode
  from tongs.ai_credits c
  where c.user_id = p_user_id;
end;
$$;

revoke all on tongs.ai_credits from public;
revoke all on tongs.ai_credit_ledger from public;

revoke all on function tongs.get_my_ai_credits() from public;
revoke all on function tongs.apply_ai_token_delta(uuid, integer, text, uuid, text) from public;

grant execute on function tongs.get_my_ai_credits() to authenticated;
grant execute on function tongs.get_my_ai_credits() to service_role;
grant execute on function tongs.apply_ai_token_delta(uuid, integer, text, uuid, text) to service_role;

commit;
