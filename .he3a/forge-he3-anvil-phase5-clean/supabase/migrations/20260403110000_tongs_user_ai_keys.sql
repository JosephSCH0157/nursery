-- AI-017-01: Canonical per-user BYO AI key storage (encrypted at rest, server-resolved).
begin;

create table if not exists tongs.user_ai_keys (
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  provider_account_id text null,
  encrypted_api_key text not null,
  key_label text null,
  key_version integer not null default 1,
  validation_mode text not null default 'lazy',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_validated_at timestamptz null,
  last_validation_status text null,
  last_used_at timestamptz null,
  constraint user_ai_keys_provider_check check (char_length(trim(provider)) > 0),
  constraint user_ai_keys_status_check check (status in ('active', 'revoked', 'invalid')),
  constraint user_ai_keys_validation_mode_check check (validation_mode in ('strict', 'lazy')),
  constraint user_ai_keys_key_version_check check (key_version >= 1),
  constraint user_ai_keys_user_provider_account_unique unique nulls not distinct (user_id, provider, provider_account_id)
);

create index if not exists user_ai_keys_user_provider_idx
  on tongs.user_ai_keys (user_id, provider);

create index if not exists user_ai_keys_status_idx
  on tongs.user_ai_keys (status, updated_at desc);

drop trigger if exists trg_user_ai_keys_updated_at on tongs.user_ai_keys;
create trigger trg_user_ai_keys_updated_at
before update on tongs.user_ai_keys
for each row execute function tongs.set_updated_at();

alter table tongs.user_ai_keys enable row level security;

drop policy if exists user_ai_keys_service_role_all on tongs.user_ai_keys;
create policy user_ai_keys_service_role_all
on tongs.user_ai_keys
for all
to service_role
using (true)
with check (true);

-- Authenticated/browser clients must never read encrypted key material directly.
drop policy if exists user_ai_keys_select_denied on tongs.user_ai_keys;
create policy user_ai_keys_select_denied
on tongs.user_ai_keys
for select
to authenticated
using (false);

drop view if exists tongs.user_ai_keys_safe;
create view tongs.user_ai_keys_safe as
select
  user_id,
  provider,
  provider_account_id,
  key_label,
  key_version,
  validation_mode,
  status,
  created_at,
  updated_at,
  last_validated_at,
  last_validation_status,
  last_used_at
from tongs.user_ai_keys;

create or replace function tongs.connect_user_ai_key(
  p_provider text,
  p_encrypted_api_key text,
  p_key_label text default null,
  p_provider_account_id text default null,
  p_key_version integer default 1,
  p_validation_mode text default 'lazy',
  p_last_validated_at timestamptz default null,
  p_last_validation_status text default null
)
returns table (
  provider text,
  provider_account_id text,
  key_label text,
  key_version integer,
  validation_mode text,
  status text,
  connected boolean,
  created_at timestamptz,
  updated_at timestamptz,
  last_validated_at timestamptz,
  last_validation_status text
)
language plpgsql
security definer
set search_path = tongs, public
as $$
declare
  v_user_id uuid;
  v_provider text;
  v_validation_mode text;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  v_provider := lower(btrim(coalesce(p_provider, '')));
  if v_provider = '' then
    raise exception 'Provider is required' using errcode = '22023';
  end if;

  if btrim(coalesce(p_encrypted_api_key, '')) = '' then
    raise exception 'Encrypted API key is required' using errcode = '22023';
  end if;

  v_validation_mode := lower(btrim(coalesce(p_validation_mode, 'lazy')));
  if v_validation_mode not in ('strict', 'lazy') then
    raise exception 'Invalid validation_mode' using errcode = '22023';
  end if;

  insert into tongs.user_ai_keys (
    user_id,
    provider,
    provider_account_id,
    encrypted_api_key,
    key_label,
    key_version,
    validation_mode,
    status,
    last_validated_at,
    last_validation_status
  )
  values (
    v_user_id,
    v_provider,
    nullif(btrim(coalesce(p_provider_account_id, '')), ''),
    p_encrypted_api_key,
    nullif(btrim(coalesce(p_key_label, '')), ''),
    greatest(1, coalesce(p_key_version, 1)),
    v_validation_mode,
    'active',
    p_last_validated_at,
    nullif(btrim(coalesce(p_last_validation_status, '')), '')
  )
  on conflict (user_id, provider, provider_account_id)
  do update set
    encrypted_api_key = excluded.encrypted_api_key,
    key_label = excluded.key_label,
    key_version = excluded.key_version,
    validation_mode = excluded.validation_mode,
    status = 'active',
    last_validated_at = excluded.last_validated_at,
    last_validation_status = excluded.last_validation_status,
    updated_at = now();

  return query
  select
    s.provider,
    s.provider_account_id,
    s.key_label,
    s.key_version,
    s.validation_mode,
    s.status,
    (s.status = 'active') as connected,
    s.created_at,
    s.updated_at,
    s.last_validated_at,
    s.last_validation_status
  from tongs.user_ai_keys_safe s
  where s.user_id = v_user_id
    and s.provider = v_provider
    and s.provider_account_id is not distinct from nullif(btrim(coalesce(p_provider_account_id, '')), '');
end;
$$;

create or replace function tongs.disconnect_user_ai_key(
  p_provider text,
  p_provider_account_id text default null
)
returns table (
  provider text,
  provider_account_id text,
  status text,
  connected boolean,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = tongs, public
as $$
declare
  v_user_id uuid;
  v_provider text;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  v_provider := lower(btrim(coalesce(p_provider, '')));
  if v_provider = '' then
    raise exception 'Provider is required' using errcode = '22023';
  end if;

  update tongs.user_ai_keys
  set
    status = 'revoked',
    updated_at = now()
  where user_id = v_user_id
    and provider = v_provider
    and provider_account_id is not distinct from nullif(btrim(coalesce(p_provider_account_id, '')), '');

  return query
  select
    s.provider,
    s.provider_account_id,
    s.status,
    (s.status = 'active') as connected,
    s.updated_at
  from tongs.user_ai_keys_safe s
  where s.user_id = v_user_id
    and s.provider = v_provider
    and s.provider_account_id is not distinct from nullif(btrim(coalesce(p_provider_account_id, '')), '');
end;
$$;

create or replace function tongs.get_my_ai_key_status(
  p_provider text default null
)
returns table (
  provider text,
  provider_account_id text,
  key_label text,
  key_version integer,
  validation_mode text,
  status text,
  connected boolean,
  created_at timestamptz,
  updated_at timestamptz,
  last_validated_at timestamptz,
  last_validation_status text,
  last_used_at timestamptz
)
language sql
security definer
set search_path = tongs, public
as $$
  select
    s.provider,
    s.provider_account_id,
    s.key_label,
    s.key_version,
    s.validation_mode,
    s.status,
    (s.status = 'active') as connected,
    s.created_at,
    s.updated_at,
    s.last_validated_at,
    s.last_validation_status,
    s.last_used_at
  from tongs.user_ai_keys_safe s
  where s.user_id = auth.uid()
    and (
      p_provider is null
      or s.provider = lower(btrim(p_provider))
    )
  order by s.updated_at desc;
$$;

create or replace function tongs.get_user_ai_key_for_resolution(
  p_user_id uuid,
  p_provider text,
  p_provider_account_id text default null
)
returns table (
  user_id uuid,
  provider text,
  provider_account_id text,
  encrypted_api_key text,
  key_version integer,
  validation_mode text,
  status text,
  last_validated_at timestamptz,
  last_validation_status text
)
language plpgsql
security definer
set search_path = tongs, public
as $$
declare
  v_provider text;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  if p_user_id is null then
    raise exception 'p_user_id required' using errcode = '22023';
  end if;

  v_provider := lower(btrim(coalesce(p_provider, '')));
  if v_provider = '' then
    raise exception 'p_provider required' using errcode = '22023';
  end if;

  update tongs.user_ai_keys
  set
    last_used_at = now(),
    updated_at = now()
  where user_id = p_user_id
    and provider = v_provider
    and provider_account_id is not distinct from nullif(btrim(coalesce(p_provider_account_id, '')), '')
    and status = 'active';

  return query
  select
    k.user_id,
    k.provider,
    k.provider_account_id,
    k.encrypted_api_key,
    k.key_version,
    k.validation_mode,
    k.status,
    k.last_validated_at,
    k.last_validation_status
  from tongs.user_ai_keys k
  where k.user_id = p_user_id
    and k.provider = v_provider
    and k.provider_account_id is not distinct from nullif(btrim(coalesce(p_provider_account_id, '')), '');
end;
$$;

grant select on tongs.user_ai_keys_safe to authenticated;
grant all on tongs.user_ai_keys to service_role;

revoke select, insert, update, delete on tongs.user_ai_keys from authenticated;
revoke select, insert, update, delete on tongs.user_ai_keys from anon;

grant execute on function tongs.connect_user_ai_key(text, text, text, text, integer, text, timestamptz, text) to authenticated;
grant execute on function tongs.connect_user_ai_key(text, text, text, text, integer, text, timestamptz, text) to service_role;
grant execute on function tongs.disconnect_user_ai_key(text, text) to authenticated;
grant execute on function tongs.disconnect_user_ai_key(text, text) to service_role;
grant execute on function tongs.get_my_ai_key_status(text) to authenticated;
grant execute on function tongs.get_my_ai_key_status(text) to service_role;
revoke execute on function tongs.get_user_ai_key_for_resolution(uuid, text, text) from authenticated;
revoke execute on function tongs.get_user_ai_key_for_resolution(uuid, text, text) from anon;
grant execute on function tongs.get_user_ai_key_for_resolution(uuid, text, text) to service_role;

commit;
