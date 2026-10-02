import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const container = process.env.SUPABASE_DB_CONTAINER || "supabase_db_nursery";
const database = `forge_model_pref_${randomUUID().replaceAll("-", "").slice(0, 10)}`;
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
  "20261008220000_tongs_owner_hearth_model_choice_view.sql",
  "20261009120000_tongs_openai_coordinated_cutover.sql",
];

function docker(args, input) {
  return spawnSync("docker", args, { input, encoding: "utf8", maxBuffer: 60 * 1024 * 1024 });
}
function check(result, label) {
  if (result.status !== 0) throw new Error(`${label} failed:\n${result.stderr || result.stdout}`);
}
function psql(sql, label) {
  const result = docker(["exec", "-i", container, "psql", "-X", "-q", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database], sql);
  check(result, label);
}

try {
  check(docker(["exec", container, "createdb", "-U", "postgres", database]), "create isolated database");
  const baseline = readFileSync("supabase/tests/billing_isolated_baseline.sql", "utf8")
    .replace(/^create role anon nologin;\r?\n/m, "")
    .replace(/^create role authenticated nologin;\r?\n/m, "")
    .replace(/^create role service_role nologin bypassrls;\r?\n/m, "");
  psql(baseline, "billing baseline");
  psql(`
    create table tongs.orgs(id uuid primary key,name text not null,created_by uuid references auth.users(id),personal_owner_user_id uuid references auth.users(id),created_at timestamptz default now(),updated_at timestamptz default now());
    create table tongs.org_members(org_id uuid references tongs.orgs(id),user_id uuid references auth.users(id),org_role text not null,created_at timestamptz default now(),created_by uuid references auth.users(id),primary key(org_id,user_id));
    alter table tongs.workspaces add column org_id uuid references tongs.orgs(id);
    alter table tongs.workspaces add column created_by uuid references auth.users(id);
    create table tongs.workspace_members(workspace_id uuid references tongs.workspaces(id),user_id uuid references auth.users(id),role text not null default 'member',primary key(workspace_id,user_id));
    create table tongs.workpiece_jobs(id uuid primary key,job_type text not null,status text not null);
    create table tongs.episodes(id uuid primary key,workspace_id uuid not null references tongs.workspaces(id),unique(id,workspace_id));
    create function tongs._transition_owner_authority_agrees(uuid) returns boolean language sql stable security definer set search_path=pg_catalog as 'select false';
    revoke all on function tongs._transition_owner_authority_agrees(uuid) from public,anon,authenticated,service_role;
  `, "compatibility baseline");
  psql('create extension if not exists "uuid-ossp" with schema extensions;', "uuid compatibility");
  for (const migration of migrations) {
    psql(readFileSync(`supabase/migrations/${migration}`, "utf8"), migration);
  }
  psql(readFileSync("supabase/migrations/20261012010000_tongs_route_scoped_openai_model_preferences.sql", "utf8"), "route-scoped preference migration");
  psql(readFileSync("supabase/tests/openai_route_scoped_model_preferences.sql", "utf8"), "route-scoped preference SQL/RLS proof");
  console.log(JSON.stringify({
    isolated_database: true,
    route_scoped_revision_concurrency: "passed",
    historical_global_preference_not_inherited: "passed",
    selectable_only_customer_projection: "passed",
    opaque_selection_key: "passed",
    retiring_choice_representation: "passed",
    provider_only_and_unavailable_excluded: "passed",
    unavailable_selection_preserved_without_substitution: "passed",
    no_eligible_model_no_execution: "passed",
    exact_model_resolution: "passed",
    customer_table_visibility_denied: "passed",
    service_resolver_boundary: "passed",
    hammer_rollout: "halted",
  }));
} finally {
  docker(["exec", container, "dropdb", "-U", "postgres", "--if-exists", "--force", database]);
}
