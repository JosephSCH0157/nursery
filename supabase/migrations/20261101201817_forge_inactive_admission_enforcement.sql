-- Slice 2B prepares account-admission enforcement without activating it.
--
-- Activation remains a separately governed release operation:
--   * account_admission_pre_request() is intentionally NOT registered in
--     pgrst.db_pre_request;
--   * the financial INSERT guards are inert unless the exact transaction/role
--     setting forge.account_admission_enforcement is "on";
--   * no Storage policy is installed by this migration; and
--   * server and browser enforcement use separate disabled-by-default flags.

begin;

create or replace function tongs.account_admission_enforcement_version()
returns text
language sql
immutable
set search_path = pg_catalog
as $$ select 'forge.account-admission-enforcement.v1'::text $$;

comment on function tongs.account_admission_enforcement_version() is
  'Slice 2B prepared-enforcement contract identifier; its presence does not activate enforcement.';

create or replace function tongs.require_account_admission(p_user_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'service-role authority required' using errcode = '42501';
  end if;

  if p_user_id is null or not exists (
    select 1
    from tongs.account_admissions admission
    where admission.user_id = p_user_id
      and admission.effective_state = 'admitted'
  ) then
    raise exception 'account admission required' using errcode = '42501';
  end if;
end;
$$;

comment on function tongs.require_account_admission(uuid) is
  'Service-boundary guard for a previously verified Auth UUID; service_role is transport authority, not admission authority.';

create or replace function tongs.current_request_is_admitted()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1
    from tongs.account_admissions admission
    where admission.user_id = auth.uid()
      and admission.effective_state = 'admitted'
  )
$$;

comment on function tongs.current_request_is_admitted() is
  'Prepared restrictive-policy predicate. No Storage or data policy is installed by Slice 2B.';

create or replace function tongs.account_admission_pre_request()
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_role text := coalesce(auth.jwt() ->> 'role', '');
  v_user_id uuid := auth.uid();
begin
  -- Existing public/trial behavior remains governed by its current RLS.
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

  if not exists (
    select 1
    from tongs.account_admissions admission
    where admission.user_id = v_user_id
      and admission.effective_state = 'admitted'
  ) then
    raise exception 'account admission required' using errcode = '42501';
  end if;
end;
$$;

comment on function tongs.account_admission_pre_request() is
  'Prepared PostgREST pre-request guard. Slice 2B does not register it in pgrst.db_pre_request.';

create or replace function tongs._guard_new_customer_financial_authorization()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  -- Fail-open only while enforcement is explicitly inactive. Future activation
  -- must set the exact custom setting to "on" through a separately certified
  -- rollout. Existing settlement/reconciliation/relief UPDATE paths never pass
  -- through this INSERT-only trigger.
  if coalesce(current_setting('forge.account_admission_enforcement', true), '') <> 'on' then
    return new;
  end if;

  if not exists (
    select 1
    from tongs.account_admissions admission
    where admission.user_id = new.user_id
      and admission.effective_state = 'admitted'
  ) then
    raise exception 'account admission required for new financial authorization'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function tongs._guard_new_customer_financial_authorization() is
  'Inactive-by-default INSERT guard for new spending acceptance and funding reservations; never gates settlement, reconciliation, relief, or cleanup.';

create trigger customer_spending_acceptance_admission_guard
before insert on tongs.customer_spending_quote_acceptances
for each row execute function tongs._guard_new_customer_financial_authorization();

create trigger funding_reservation_admission_guard
before insert on tongs.funding_reservations
for each row execute function tongs._guard_new_customer_financial_authorization();

alter function tongs.account_admission_enforcement_version() owner to postgres;
alter function tongs.require_account_admission(uuid) owner to postgres;
alter function tongs.current_request_is_admitted() owner to postgres;
alter function tongs.account_admission_pre_request() owner to postgres;
alter function tongs._guard_new_customer_financial_authorization() owner to postgres;

revoke all on function tongs.account_admission_enforcement_version()
  from public, anon, authenticated, service_role;
grant execute on function tongs.account_admission_enforcement_version()
  to service_role;

revoke all on function tongs.require_account_admission(uuid)
  from public, anon, authenticated, service_role;
grant execute on function tongs.require_account_admission(uuid)
  to service_role;

revoke all on function tongs.current_request_is_admitted()
  from public, anon, authenticated, service_role;
grant execute on function tongs.current_request_is_admitted()
  to authenticated, service_role;

revoke all on function tongs.account_admission_pre_request()
  from public, anon, authenticated, service_role;
grant execute on function tongs.account_admission_pre_request()
  to anon, authenticated, service_role;

revoke all on function tongs._guard_new_customer_financial_authorization()
  from public, anon, authenticated, service_role;

commit;
