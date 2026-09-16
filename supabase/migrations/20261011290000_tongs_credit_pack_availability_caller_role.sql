-- Accept both authenticated customer reads and service-role checkout reads by
-- using Supabase's canonical request role helper. The prior raw JWT setting is
-- absent for the Edge function's service client and incorrectly failed closed
-- as a 500 before the intended product-availability response could be emitted.
begin;

create or replace function tongs.read_credit_pack_purchase_availability()
returns jsonb
language plpgsql stable security definer set search_path = pg_catalog as $$
declare
  caller_role text := coalesce(auth.role(), '');
  environment_name text;
  revision_row tongs.customer_product_availability_revisions%rowtype;
begin
  if caller_role not in ('authenticated', 'service_role') then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  environment_name := tongs._current_financial_environment();
  select * into revision_row
  from tongs.customer_product_availability_revisions
  where financial_environment = environment_name
    and product_code = 'forge_credit_pack_purchase'
  order by revision desc limit 1;
  if not found then
    return jsonb_build_object(
      'contract_version','forge.product-availability.v1',
      'product_code','forge_credit_pack_purchase',
      'financial_environment',environment_name,
      'purchase_enabled',false,
      'reason_code','financial_environment_inactive'
    );
  end if;
  return jsonb_build_object(
    'contract_version','forge.product-availability.v1',
    'product_code',revision_row.product_code,
    'financial_environment',revision_row.financial_environment,
    'purchase_enabled',revision_row.availability_state = 'enabled',
    'reason_code',revision_row.customer_reason_code,
    'revision',revision_row.revision
  );
end $$;

revoke all on function tongs.read_credit_pack_purchase_availability() from public, anon;
grant execute on function tongs.read_credit_pack_purchase_availability() to authenticated, service_role;

notify pgrst, 'reload schema';
commit;
