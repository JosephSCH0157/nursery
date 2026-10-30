begin;

-- Migration 425 introduced a service-only, exact-recording owner sponsorship
-- for Brad while deliberately leaving the ordinary owner-testing authority
-- contract unchanged. The generic reservation function was subsequently
-- observed still requiring the ordinary owner-testing payer binding before it
-- would admit that exact sponsorship. Admit either the established ordinary
-- owner-testing authority or migration 425's bounded sponsorship; all budget,
-- quote, expiry, scope, aggregate, and zero-customer-debit guards remain in the
-- existing function and trigger contracts.
do $hammer_owner_sponsorship_reservation_compatibility$
declare
  definition text;
  changed text;
  old_guard text;
  new_guard text;
begin
  select pg_get_functiondef(
    'tongs.reserve_operation(uuid,uuid,text,uuid,text)'::regprocedure
  ) into definition;
  definition := replace(definition, chr(13), '');

  old_guard := $guard$if not found or not tongs._quote_owner_budget_allows(v_quote.id, v_budget.id) or v_budget_revision.status <> 'active' or v_budget_revision.maximum_amount_micros is null$guard$;
  new_guard := $guard$if not found or (
      not tongs._quote_owner_budget_allows(v_quote.id, v_budget.id)
      and not exists(
        select 1
        from tongs._active_hammer_owner_sponsorship_for_quote(v_quote.id) sponsorship
        where sponsorship.owner_budget_id=v_budget.id
          and sponsorship.beneficiary_user_id=v_quote.user_id
      )
    ) or v_budget_revision.status <> 'active' or v_budget_revision.maximum_amount_micros is null$guard$;

  changed := replace(definition, old_guard, new_guard);
  if changed = definition
     or position('_quote_owner_budget_allows(v_quote.id, v_budget.id)' in changed) = 0
     or position('_active_hammer_owner_sponsorship_for_quote(v_quote.id)' in changed) = 0
     or position('sponsorship.owner_budget_id=v_budget.id' in changed) = 0
     or position('sponsorship.beneficiary_user_id=v_quote.user_id' in changed) = 0
  then
    raise exception 'reserve_operation owner-budget authority contract changed upstream; explicit review required';
  end if;

  execute changed;
end
$hammer_owner_sponsorship_reservation_compatibility$;

do $hammer_owner_sponsorship_reservation_verify$
declare
  definition text;
begin
  select pg_get_functiondef(
    'tongs.reserve_operation(uuid,uuid,text,uuid,text)'::regprocedure
  ) into definition;
  if position('_quote_owner_budget_allows(v_quote.id, v_budget.id)' in definition) = 0
     or position('_active_hammer_owner_sponsorship_for_quote(v_quote.id)' in definition) = 0
     or position('sponsorship.owner_budget_id=v_budget.id' in definition) = 0
     or position('sponsorship.beneficiary_user_id=v_quote.user_id' in definition) = 0
     or position('owner-budget spending is not activated' in definition) = 0
     or position('insufficient owner operating budget' in definition) = 0
  then
    raise exception 'owner-sponsored reservation compatibility verification failed';
  end if;

  if has_function_privilege('public',
      'tongs.reserve_operation(uuid,uuid,text,uuid,text)','EXECUTE')
     or has_function_privilege('anon',
      'tongs.reserve_operation(uuid,uuid,text,uuid,text)','EXECUTE')
     or has_function_privilege('authenticated',
      'tongs.reserve_operation(uuid,uuid,text,uuid,text)','EXECUTE')
     or not has_function_privilege('service_role',
      'tongs.reserve_operation(uuid,uuid,text,uuid,text)','EXECUTE')
  then
    raise exception 'reserve_operation service-only ACL changed';
  end if;
end
$hammer_owner_sponsorship_reservation_verify$;

commit;
