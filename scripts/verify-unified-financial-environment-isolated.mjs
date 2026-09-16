import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const container = process.env.SUPABASE_DB_CONTAINER || "supabase_db_nursery";
const database = `forge_financial_parity_${randomUUID().replaceAll("-", "").slice(0, 10)}`;
const migrations = [
  "20260910120000_tongs_accounting_foundation.sql",
  "20260911120000_tongs_private_pricing_reservations_shadow.sql",
  "20260912120000_tongs_owner_budget_reservations_shadow.sql",
  "20260915120000_tongs_runway_paid_execution_boundary.sql",
  "20260916120000_tongs_runway_owner_pilot_activation.sql",
  "20260917120000_tongs_pricing_customer_interface.sql",
  "20260918120000_tongs_failure_relief_openai_text_shadow.sql",
  "20260919120000_tongs_openai_text_enforcement_foundation.sql",
  "20260920120000_tongs_hearth_chat_paid_execution.sql",
  "20260921120000_tongs_openai_hearth_owner_pilot_control.sql",
  "20260922120000_tongs_openai_hearth_luna_pilot_proposal.sql",
  "20260922130000_tongs_openai_hearth_luna_pilot_control.sql",
  "20260922140000_tongs_openai_hearth_luna_pilot_emergency_halt.sql",
  "20260922150000_tongs_openai_loss_policy_scope_and_preprovider_rearm.sql",
  "20260922160000_tongs_failure_class_corrections_and_luna_retest.sql",
  "20260922170000_tongs_precise_forge_failure_classes.sql",
  "20260923120000_tongs_customer_hearth_luna_canary.sql",
  "20260923140000_tongs_owner_pricing_rounded_customer_ceiling.sql",
  "20260923150000_tongs_owner_pricing_nullable_markup_fix.sql",
  "20260923160000_tongs_owner_pricing_nullable_markup_short_circuit.sql",
  "20260924120000_tongs_test_customer_paid_execution.sql",
  "20260925120000_tongs_openai_text_route_execution_adapters.sql",
  "20260926120000_tongs_openai_text_test_certification.sql",
  "20260928120000_tongs_openai_text_ordinary_customer_funding.sql",
  "20260929120000_tongs_openai_text_model_catalog.sql",
  "20260930120000_tongs_openai_evidence_and_support_proposal.sql",
  "20261001120000_tongs_restricted_beta_financial_policy.sql",
  "20261002120000_tongs_aggregate_paid_execution_connection.sql",
  "20261003120000_tongs_openai_cost_reconciliation_connection.sql",
  "20261004120000_tongs_openai_transcription_financial_coordination.sql",
  "20261005120000_tongs_customer_funding_read_model.sql",
  "20261006120000_tongs_owner_org_funding_authority.sql",
  "20261006130000_tongs_openai_model_catalog_revision_2.sql",
  "20261007120000_tongs_non_spending_financial_repairs.sql",
  "20261008120000_tongs_owner_funded_hearth_activation.sql",
  "20261008130000_tongs_owner_hearth_runway_commitment_repair.sql",
  "20261008140000_tongs_owner_hearth_attempt_signature_repair.sql",
  "20261008150000_tongs_owner_hearth_definitive_rejection_recovery.sql",
  "20261008160000_tongs_owner_hearth_compatibility_result_corrections.sql",
  "20261008170000_tongs_owner_hearth_compatibility_rpc_alias.sql",
  "20261008180000_tongs_owner_hearth_fresh_compatibility_retry.sql",
  "20261008190000_tongs_owner_hearth_terminal_concurrency_recovery.sql",
  "20261008200000_tongs_owner_hearth_preprovider_recovery_expiry.sql",
  "20261008210000_tongs_owner_hearth_recovery_renewal.sql",
  "20261008220000_tongs_owner_hearth_model_choice_view.sql",
  "20261009120000_tongs_openai_coordinated_cutover.sql",
  "20261010120000_tongs_owner_funded_hearth_research.sql",
  "20261010130000_tongs_owner_hearth_research_permissions.sql",
  "20261011140000_tongs_unified_financial_environment.sql",
];

function docker(args, input) {
  return spawnSync("docker", args, { input, encoding: "utf8", maxBuffer: 80 * 1024 * 1024 });
}

function check(result, label) {
  if (result.status !== 0) throw new Error(`${label} failed:\n${result.stderr || result.stdout}`);
}

function psql(sql, label) {
  const result = docker([
    "exec", "-i", container, "psql", "-X", "-q", "-A", "-t",
    "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database,
  ], sql);
  check(result, label);
  return result.stdout.trim();
}

try {
  check(docker(["exec", container, "createdb", "-U", "postgres", database]), "create isolated database");
  const baseline = readFileSync("supabase/tests/billing_isolated_baseline.sql", "utf8")
    .replace(/^create role anon nologin;\r?\n/m, "")
    .replace(/^create role authenticated nologin;\r?\n/m, "")
    .replace(/^create role service_role nologin bypassrls;\r?\n/m, "");
  psql(baseline, "billing baseline");
  psql(`
    create table tongs.orgs(
      id uuid primary key,name text not null,created_by uuid references auth.users(id),
      personal_owner_user_id uuid references auth.users(id),created_at timestamptz default now(),updated_at timestamptz default now());
    create table tongs.org_members(
      org_id uuid references tongs.orgs(id),user_id uuid references auth.users(id),
      org_role text not null check(org_role in ('owner','admin','member')),created_at timestamptz default now(),
      created_by uuid references auth.users(id),primary key(org_id,user_id));
    alter table tongs.workspaces add column org_id uuid references tongs.orgs(id);
    alter table tongs.workspaces add column created_by uuid references auth.users(id);
    create table tongs.workspace_members(
      workspace_id uuid references tongs.workspaces(id),user_id uuid references auth.users(id),
      role text not null default 'member',primary key(workspace_id,user_id));
    create table tongs.workpiece_jobs(id uuid primary key,job_type text not null,status text not null);
    create table tongs.episodes(
      id uuid primary key,workspace_id uuid not null references tongs.workspaces(id),unique(id,workspace_id));
    create table tongs.billing_customers(
      user_id uuid primary key references auth.users(id),stripe_customer_id text unique not null,
      email text,customer_name text,metadata_json jsonb not null default '{}',created_at timestamptz default now(),updated_at timestamptz default now());
    create table tongs.billing_events(
      stripe_event_id text primary key,event_type text not null,user_id uuid,stripe_customer_id text,
      stripe_subscription_id text,stripe_session_id text,livemode boolean,payload_json jsonb not null default '{}',processed_at timestamptz default now(),created_at timestamptz default now());
    create table tongs.hearth_research_synthesis_results(
      id uuid primary key default gen_random_uuid(),operation_id text not null unique,reservation_id uuid not null unique,
      user_id uuid not null references auth.users(id),workspace_id uuid not null references tongs.workspaces(id),
      workpiece_id uuid not null references tongs.episodes(id),request_fingerprint text not null,provider_request_id text,
      input_units bigint not null,output_units bigint not null,result_json jsonb not null,created_at timestamptz not null default now());
    create or replace function tongs.read_owner_purchase_activity(p_stripe_mode text default 'test',p_limit integer default 100)
      returns jsonb language sql stable as $$ select jsonb_build_object('contract_version','forge.owner-purchase-activity.v1','stripe_mode',p_stripe_mode,'purchases','[]'::jsonb) $$;
  `, "compatibility baseline");
  psql('create extension if not exists "uuid-ossp" with schema extensions;', "uuid compatibility");

  for (const migration of migrations) {
    psql(readFileSync(`supabase/migrations/${migration}`, "utf8"), migration);
  }

  const proof = JSON.parse(psql(`
    select jsonb_build_object(
      'current_environment', tongs._current_financial_environment(),
      'configuration_count', (select count(*) from tongs.financial_environment_configuration_revisions),
      'baseline_count', (select count(*) from tongs.financial_parity_baseline_captures),
      'live_identifier_slots', (select jsonb_array_length(required_stripe_identifier_slots) from tongs.financial_environment_configuration_revisions where environment='live' order by revision desc limit 1),
      'test_configuration', (select lifecycle_state from tongs.financial_environment_configuration_revisions where environment='test' order by revision desc limit 1),
      'live_configuration', (select lifecycle_state from tongs.financial_environment_configuration_revisions where environment='live' order by revision desc limit 1),
      'legacy_case_count', (select count(*) from tongs.legacy_credit_reconciliation_cases),
      'simulator_execute_grants', (select count(*) from information_schema.routine_privileges where specific_schema='tongs' and grantee='service_role' and privilege_type='EXECUTE' and routine_name not like 'read_%' and (routine_name like '%hearth_chat_test%' or routine_name like '%openai_text_test_certification%')),
      'funding_contract', (select prosrc like '%forge.customer-funding.v2%' from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='tongs' and p.proname='read_my_customer_funding')
    );
  `, "parity proof"));
  if (proof.current_environment !== "test"
    || proof.configuration_count !== 2
    || proof.baseline_count !== 1
    || proof.live_identifier_slots !== 3
    || proof.test_configuration !== "structurally_ready"
    || proof.live_configuration !== "structurally_ready"
    || proof.simulator_execute_grants !== 0
    || proof.funding_contract !== true) {
    throw new Error(`Unexpected parity proof: ${JSON.stringify(proof)}`);
  }

  console.log(JSON.stringify({
    isolated_database: true,
    shared_financial_path: "passed",
    test_runtime_selected: "passed",
    live_configuration_present_inactive: "passed",
    simulator_authority_revoked: "passed",
    customer_funding_v2: "passed",
    commercial_price_publication: "not_performed",
  }));
} finally {
  docker(["exec", container, "dropdb", "-U", "postgres", "--if-exists", database]);
}
