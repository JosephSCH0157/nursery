-- Stripe AI credit pack purchase ledger + atomic grant RPC.
-- Idempotency keying:
-- - stripe_event_id unique
-- - stripe_session_id unique

begin;

create table if not exists tongs.ai_credit_purchases (
  id bigserial primary key,
  stripe_event_id text not null unique,
  stripe_session_id text not null unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  pack_id text not null,
  tokens_granted bigint not null check (tokens_granted > 0),
  amount_total bigint,
  currency text,
  created_at timestamptz not null default now()
);

create index if not exists ai_credit_purchases_user_created_at_idx
  on tongs.ai_credit_purchases (user_id, created_at desc);

alter table tongs.ai_credit_purchases enable row level security;

drop policy if exists ai_credit_purchases_select_self on tongs.ai_credit_purchases;
create policy ai_credit_purchases_select_self
on tongs.ai_credit_purchases
for select
to authenticated
using (user_id = auth.uid());

create or replace function tongs.grant_ai_credits(
  p_user_id uuid,
  p_pack_id text,
  p_tokens bigint,
  p_event_id text,
  p_session_id text,
  p_amount_total bigint default null,
  p_currency text default null
)
returns void
language plpgsql
security definer
set search_path = tongs, public
as $$
declare
  v_pack_id text;
  v_event_id text;
  v_session_id text;
  v_currency text;
  v_billing_mode text;
begin
  if p_user_id is null then
    raise exception 'p_user_id required'
      using errcode = '22023';
  end if;

  if p_tokens is null or p_tokens <= 0 then
    raise exception 'p_tokens must be > 0'
      using errcode = '22023';
  end if;

  v_pack_id := nullif(trim(coalesce(p_pack_id, '')), '');
  if v_pack_id is null then
    raise exception 'p_pack_id required'
      using errcode = '22023';
  end if;

  v_event_id := nullif(trim(coalesce(p_event_id, '')), '');
  if v_event_id is null then
    raise exception 'p_event_id required'
      using errcode = '22023';
  end if;

  v_session_id := nullif(trim(coalesce(p_session_id, '')), '');
  if v_session_id is null then
    raise exception 'p_session_id required'
      using errcode = '22023';
  end if;

  v_currency := nullif(lower(trim(coalesce(p_currency, ''))), '');

  insert into tongs.ai_credits (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  select c.billing_mode
  into v_billing_mode
  from tongs.ai_credits c
  where c.user_id = p_user_id
  for update;

  if v_billing_mode = 'byo' then
    raise exception 'BYO_KEY_USERS_CANNOT_PURCHASE_FORGE_CREDITS'
      using errcode = '22023';
  end if;

  insert into tongs.ai_credit_purchases (
    stripe_event_id,
    stripe_session_id,
    user_id,
    pack_id,
    tokens_granted,
    amount_total,
    currency
  )
  values (
    v_event_id,
    v_session_id,
    p_user_id,
    v_pack_id,
    p_tokens,
    p_amount_total,
    v_currency
  )
  on conflict do nothing;

  -- Idempotent no-op on retries / replays.
  if not found then
    return;
  end if;

  update tongs.ai_credits c
  set
    token_balance = c.token_balance + p_tokens,
    updated_at = now()
  where c.user_id = p_user_id;
end;
$$;

revoke all on tongs.ai_credit_purchases from public;
revoke all on function tongs.grant_ai_credits(
  uuid,
  text,
  bigint,
  text,
  text,
  bigint,
  text
) from public;

grant select on tongs.ai_credit_purchases to authenticated;
grant all on tongs.ai_credit_purchases to service_role;
grant execute on function tongs.grant_ai_credits(
  uuid,
  text,
  bigint,
  text,
  text,
  bigint,
  text
) to service_role;

commit;
