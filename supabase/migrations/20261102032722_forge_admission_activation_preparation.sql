-- Slice 2C prepares the two narrowly scoped Data API exceptions that must
-- remain usable when the global admission pre-request hook is activated.
--
-- This migration does not register pgrst.db_pre_request, install policies, or
-- enable the financial guard. Runtime activation remains a separate governed
-- operation.

begin;

create or replace function tongs.account_admission_enforcement_version()
returns text
language sql
immutable
set search_path = pg_catalog
as $$ select 'forge.account-admission-enforcement.v2'::text $$;

comment on function tongs.account_admission_enforcement_version() is
  'Slice 2C prepared-enforcement contract identifier; its presence does not activate enforcement.';

create or replace function tongs.account_admission_pre_request()
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_role text := coalesce(auth.jwt() ->> 'role', '');
  v_user_id uuid := auth.uid();
  v_path text := coalesce(current_setting('request.path', true), '');
  v_method text := upper(coalesce(current_setting('request.method', true), ''));
begin
  -- The registered pre-request hook sets the financial guard only for the
  -- current PostgREST transaction. Managed Supabase does not permit postgres
  -- to persist arbitrary custom GUC defaults with ALTER ROLE/DATABASE. This
  -- transaction-local setting therefore activates the existing INSERT-only
  -- guards without affecting direct settlement or recovery sessions.
  perform set_config('forge.account_admission_enforcement', 'on', true);

  -- Existing anonymous trial and public Bellows behavior remains governed by
  -- its current function contracts and RLS policies.
  if v_role = 'anon' then
    return;
  end if;

  -- Trusted background, settlement, recovery, and operator services continue
  -- to authenticate their own customer/actor boundary. service_role alone is
  -- never enough for a new customer operation: those entrypoints call
  -- require_account_admission() with the verified customer UUID.
  if v_role = 'service_role' then
    return;
  end if;

  if v_role <> 'authenticated' or v_user_id is null then
    raise exception 'authenticated account required' using errcode = '42501';
  end if;

  if exists (
    select 1
    from tongs.account_admissions admission
    where admission.user_id = v_user_id
      and admission.effective_state = 'admitted'
  ) then
    return;
  end if;

  -- Platform authority is independent from customer admission. An
  -- unadmitted operator may use only these operator RPCs, whose own trusted
  -- contracts re-check platform_operators and actor/operation identity.
  -- This exception never permits an ordinary customer table or RPC path.
  if v_method = 'POST'
     and v_path in (
       '/rpc/list_beta_access_applications',
       '/rpc/decide_beta_access_application',
       '/rpc/set_account_admission_state',
       '/rpc/list_beta_invitation_applications'
     )
     and exists (
       select 1 from tongs.platform_operators operator
       where operator.user_id = v_user_id
     ) then
    return;
  end if;

  -- These are the only authenticated pre-admission Data API exceptions.
  -- read_my_admission_onboarding is self-scoped to auth.uid() and read-only.
  -- resolve_bellows_join_link is the reviewed public guest capability: the
  -- opaque token, expiry, revocation and use limits remain authoritative.
  if v_method = 'POST' and v_path in (
    '/rpc/read_my_admission_onboarding',
    '/rpc/resolve_bellows_join_link'
  ) then
    return;
  end if;

  raise exception 'account admission required' using errcode = '42501';
end;
$$;

comment on function tongs.account_admission_pre_request() is
  'Prepared PostgREST pre-request guard with exact onboarding and Bellows guest RPC exceptions. Slice 2C does not register it.';

alter function tongs.account_admission_enforcement_version() owner to postgres;
alter function tongs.account_admission_pre_request() owner to postgres;

revoke all on function tongs.account_admission_enforcement_version()
  from public, anon, authenticated, service_role;
grant execute on function tongs.account_admission_enforcement_version()
  to service_role;

revoke all on function tongs.account_admission_pre_request()
  from public, anon, authenticated, service_role;
grant execute on function tongs.account_admission_pre_request()
  to anon, authenticated, service_role;

commit;
