-- Test-only prerequisite for customer_funding_flow.sql.
-- The semantic row is copied exactly from historical migration
-- 20260916110806_tongs_forge_credit_economy.sql. This fixture must run only
-- in an owned disposable baseline-v1 database and never becomes migration data.

begin;

do $fixture_guard$
declare
  v_lineage text;
  v_lineage_count bigint;
  v_migration_count bigint;
  v_migration_head text;
begin
  select count(*), min(lineage)
    into v_lineage_count, v_lineage
  from forge_meta.database_lineage;
  if v_lineage_count is distinct from 1 or v_lineage is distinct from 'baseline-v1' then
    raise exception 'customer-funding fixture requires exactly one baseline-v1 lineage marker';
  end if;

  select count(*), max(version)
    into v_migration_count, v_migration_head
  from supabase_migrations.schema_migrations;
  if v_migration_count is distinct from 17
     or v_migration_head is distinct from '20261101201817' then
    raise exception 'customer-funding fixture requires the certified 17-migration head 20261101201817';
  end if;

  if exists(select 1 from tongs.forge_credit_contract_revisions)
     or exists(select 1 from tongs.forge_credit_pack_terms)
     or exists(select 1 from tongs.customer_subscription_allowance_terms)
     or exists(select 1 from tongs.financial_runtime_environment_revisions) then
    raise exception 'customer-funding fixture requires empty contract, pack, allowance, and runtime state';
  end if;

  if exists(select 1 from tongs.account_balances)
     or exists(select 1 from tongs.customer_deposits)
     or exists(select 1 from tongs.paid_allowance_grants)
     or exists(select 1 from tongs.beta_credit_grants)
     or exists(select 1 from tongs.legacy_credit_opening_balances)
     or exists(select 1 from tongs.organization_funding_account_revisions) then
    raise exception 'customer-funding fixture requires empty customer balance state';
  end if;

  if exists(select 1 from tongs.funding_reservations)
     or exists(select 1 from tongs.ai_credit_reservations)
     or exists(select 1 from tongs.test_funding_reservations)
     or exists(select 1 from tongs.openai_text_test_certification_reservations) then
    raise exception 'customer-funding fixture requires empty reservation state';
  end if;

  if exists(select 1 from tongs.paid_execution_control_revisions)
     or exists(select 1 from tongs.private_pricing_policies)
     or exists(select 1 from tongs.private_pricing_revisions)
     or exists(select 1 from tongs.private_pricing_publications)
     or exists(select 1 from tongs.financial_environment_configuration_revisions)
     or exists(select 1 from tongs.owner_paid_execution_canary_activation_revisions)
     or exists(select 1 from tongs.openai_text_activation_decisions)
     or exists(select 1 from tongs.openai_text_activation_proposals)
     or exists(select 1 from tongs.openai_text_rollout_revisions)
     or exists(select 1 from tongs.openai_text_failure_loss_rollout_revisions)
     or exists(select 1 from tongs.runway_execution_rollout_revisions) then
    raise exception 'customer-funding fixture requires empty financial activation state';
  end if;

  if exists(select 1 from tongs.credential_lifecycle_records)
     or exists(select 1 from tongs.publishing_provider_connections)
     or exists(select 1 from tongs.publishing_provider_credential_authorities)
     or exists(select 1 from tongs.publishing_provider_credential_generations) then
    raise exception 'customer-funding fixture requires empty provider credential state';
  end if;

  if exists(select 1 from tongs.owner_cost_provider_attempts)
     or exists(select 1 from tongs.paid_media_provider_attempts)
     or exists(select 1 from tongs.openai_text_provider_captures)
     or exists(select 1 from tongs.hammer_transcription_operations)
     or exists(select 1 from tongs.hammer_transcription_provider_attempts) then
    raise exception 'customer-funding fixture requires zero provider operations and attempts';
  end if;
end
$fixture_guard$;

insert into tongs.forge_credit_contract_revisions(
  contract_code,
  revision,
  lifecycle_state,
  credit_value_micros,
  currency,
  markup_basis_points,
  tax_treatment,
  reason
) values (
  'forge.credit-economy.v1',
  1,
  'active',
  5000,
  'USD',
  3300,
  'pre_tax_customer_value',
  'One Forge Credit is exactly $0.005 of pre-tax customer value; supplier cost is private.'
);

do $fixture_proof$
begin
  if (select count(*) from tongs.forge_credit_contract_revisions) is distinct from 1
     or not exists(
       select 1
       from tongs.forge_credit_contract_revisions
       where contract_code = 'forge.credit-economy.v1'
         and revision = 1
         and lifecycle_state = 'active'
         and credit_value_micros = 5000
         and currency = 'USD'
         and markup_basis_points = 3300
         and tax_treatment = 'pre_tax_customer_value'
         and reason = 'One Forge Credit is exactly $0.005 of pre-tax customer value; supplier cost is private.'
     ) then
    raise exception 'customer-funding fixture semantic fingerprint mismatch';
  end if;

  if exists(select 1 from tongs.forge_credit_pack_terms)
     or exists(select 1 from tongs.customer_subscription_allowance_terms)
     or exists(select 1 from tongs.financial_runtime_environment_revisions)
     or exists(select 1 from tongs.account_balances)
     or exists(select 1 from tongs.customer_deposits)
     or exists(select 1 from tongs.paid_allowance_grants)
     or exists(select 1 from tongs.beta_credit_grants)
     or exists(select 1 from tongs.legacy_credit_opening_balances)
     or exists(select 1 from tongs.organization_funding_account_revisions)
     or exists(select 1 from tongs.funding_reservations)
     or exists(select 1 from tongs.ai_credit_reservations)
     or exists(select 1 from tongs.test_funding_reservations)
     or exists(select 1 from tongs.openai_text_test_certification_reservations)
     or exists(select 1 from tongs.paid_execution_control_revisions)
     or exists(select 1 from tongs.private_pricing_policies)
     or exists(select 1 from tongs.private_pricing_revisions)
     or exists(select 1 from tongs.private_pricing_publications)
     or exists(select 1 from tongs.financial_environment_configuration_revisions)
     or exists(select 1 from tongs.owner_paid_execution_canary_activation_revisions)
     or exists(select 1 from tongs.openai_text_activation_decisions)
     or exists(select 1 from tongs.openai_text_activation_proposals)
     or exists(select 1 from tongs.openai_text_rollout_revisions)
     or exists(select 1 from tongs.openai_text_failure_loss_rollout_revisions)
     or exists(select 1 from tongs.runway_execution_rollout_revisions)
     or exists(select 1 from tongs.credential_lifecycle_records)
     or exists(select 1 from tongs.publishing_provider_connections)
     or exists(select 1 from tongs.publishing_provider_credential_authorities)
     or exists(select 1 from tongs.publishing_provider_credential_generations)
     or exists(select 1 from tongs.owner_cost_provider_attempts)
     or exists(select 1 from tongs.paid_media_provider_attempts)
     or exists(select 1 from tongs.openai_text_provider_captures)
     or exists(select 1 from tongs.hammer_transcription_operations)
     or exists(select 1 from tongs.hammer_transcription_provider_attempts) then
    raise exception 'customer-funding fixture introduced unapproved financial state';
  end if;
end
$fixture_proof$;

commit;
