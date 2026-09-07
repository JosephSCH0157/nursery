-- Minimal Supabase-compatible catalog used only by disposable billing test databases.
-- It deliberately avoids application data and unrelated migrations.

create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema extensions;
create schema auth;
create schema tongs;
create extension pgcrypto with schema extensions;

create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
create function auth.role() returns text language sql stable as $$
  select nullif(current_setting('request.jwt.claim.role', true), '');
$$;

create table auth.users (
  id uuid primary key,
  instance_id uuid,
  aud text,
  role text,
  email text,
  encrypted_password text,
  email_confirmed_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
);

create table tongs.workspaces (
  id uuid primary key,
  name text
);

create table tongs.ai_credits (
  user_id uuid primary key references auth.users(id) on delete restrict,
  token_balance bigint not null default 0
);

create table tongs.platform_operators (
  user_id uuid primary key references auth.users(id) on delete restrict,
  reason text not null,
  granted_by uuid references auth.users(id) on delete set null,
  granted_at timestamptz not null default now()
);

create function tongs.is_platform_operator(p_user_id uuid)
returns boolean language plpgsql stable security definer set search_path=pg_catalog as $$
declare v_caller uuid:=auth.uid(); v_role text:=coalesce(auth.role(),'');
begin
  if p_user_id is null then return false; end if;
  if v_role<>'service_role' and v_caller is distinct from p_user_id then return false; end if;
  return exists(select 1 from tongs.platform_operators where user_id=p_user_id);
end $$;

create function tongs._reject_financial_mutation()
returns trigger language plpgsql as $$
begin raise exception 'financial records are append-only' using errcode='55000'; end $$;

grant usage on schema tongs,auth to anon,authenticated,service_role;
grant execute on function auth.uid(),auth.role() to anon,authenticated,service_role;
grant execute on function tongs.is_platform_operator(uuid) to authenticated,service_role;
