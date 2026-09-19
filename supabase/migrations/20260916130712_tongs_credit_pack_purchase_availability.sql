-- Versioned product availability gate. Stripe Test/Live catalog parity remains
-- intact while beta credit-pack checkout is disabled in both inactive Live and
-- the current admin-provisioned Test beta.
begin;

create table tongs.customer_product_availability_revisions (
  financial_environment text not null check (financial_environment in ('test','live')),
  product_code text not null check (product_code = 'forge_credit_pack_purchase'),
  revision integer not null check (revision > 0),
  availability_state text not null check (availability_state in ('enabled','disabled')),
  customer_reason_code text not null check (
    customer_reason_code in ('available','beta_admin_provisioned_only','financial_environment_inactive')
  ),
  reason text not null check (length(btrim(reason)) between 3 and 300),
  created_at timestamptz not null default now(),
  primary key (financial_environment, product_code, revision),
  check (
    (availability_state = 'enabled' and customer_reason_code = 'available')
    or (availability_state = 'disabled' and customer_reason_code <> 'available')
  )
);

insert into tongs.customer_product_availability_revisions(
  financial_environment, product_code, revision, availability_state,
  customer_reason_code, reason
) values
  ('test','forge_credit_pack_purchase',1,'disabled','beta_admin_provisioned_only',
   'Beta accounts receive operator-provisioned Test Forge Credits and cannot initiate pack checkout.'),
  ('live','forge_credit_pack_purchase',1,'disabled','financial_environment_inactive',
   'Live customer financial activation remains inactive.');

alter table tongs.customer_product_availability_revisions enable row level security;
revoke all on tongs.customer_product_availability_revisions from public, anon, authenticated;
grant select on tongs.customer_product_availability_revisions to service_role;

create trigger customer_product_availability_revisions_immutable
before update or delete on tongs.customer_product_availability_revisions
for each row execute function tongs._reject_accounting_mutation();

create or replace function tongs.read_credit_pack_purchase_availability()
returns jsonb
language plpgsql stable security definer set search_path = pg_catalog as $$
declare
  caller_role text := coalesce(current_setting('request.jwt.claim.role', true), '');
  environment_name text;
  revision_row tongs.customer_product_availability_revisions%rowtype;
begin
  if auth.uid() is null and caller_role <> 'service_role' then
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

comment on table tongs.customer_product_availability_revisions is
  'Versioned Test/Live product availability; it gates checkout initiation without changing the canonical purchase or funding workflow.';

notify pgrst, 'reload schema';
commit;

