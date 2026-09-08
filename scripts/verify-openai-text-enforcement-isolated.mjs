import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const container = process.env.SUPABASE_DB_CONTAINER || "supabase_db_nursery";
const database = `forge_openai_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
const migrations = [
  "supabase/migrations/20260910120000_tongs_accounting_foundation.sql",
  "supabase/migrations/20260911120000_tongs_private_pricing_reservations_shadow.sql",
  "supabase/migrations/20260912120000_tongs_owner_budget_reservations_shadow.sql",
  "supabase/migrations/20260915120000_tongs_runway_paid_execution_boundary.sql",
  "supabase/migrations/20260916120000_tongs_runway_owner_pilot_activation.sql",
  "supabase/migrations/20260917120000_tongs_pricing_customer_interface.sql",
  "supabase/migrations/20260918120000_tongs_failure_relief_openai_text_shadow.sql",
  "supabase/migrations/20260919120000_tongs_openai_text_enforcement_foundation.sql",
  "supabase/migrations/20260920120000_tongs_hearth_chat_paid_execution.sql",
  "supabase/migrations/20260921120000_tongs_openai_hearth_owner_pilot_control.sql",
  "supabase/migrations/20260922120000_tongs_openai_hearth_luna_pilot_proposal.sql",
  "supabase/migrations/20260922130000_tongs_openai_hearth_luna_pilot_control.sql",
  "supabase/migrations/20260922140000_tongs_openai_hearth_luna_pilot_emergency_halt.sql",
];

function docker(args, input) {
  return spawnSync("docker", args, { input, encoding: "utf8", maxBuffer: 30 * 1024 * 1024 });
}
function ok(result, step) {
  if (result.status !== 0) throw new Error(`${step} failed:\n${result.stderr || result.stdout}`);
}
function psql(sql, step) {
  const result = docker(["exec", "-i", container, "psql", "-X", "-q", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database], sql);
  ok(result, step);
  return result.stdout.trim();
}

try {
  ok(docker(["exec", container, "createdb", "-U", "postgres", database]), "create isolated database");
  const baseline = readFileSync("supabase/tests/billing_isolated_baseline.sql", "utf8")
    .replace("create role anon nologin;\n", "")
    .replace("create role authenticated nologin;\n", "")
    .replace("create role service_role nologin bypassrls;\n", "");
  psql(baseline, "baseline");
  for (const migration of migrations) psql(readFileSync(migration, "utf8"), migration);
  psql(readFileSync("supabase/tests/openai_text_enforcement_foundation.sql", "utf8"), "OpenAI enforcement proof");
  psql(readFileSync("supabase/tests/openai_hearth_owner_pilot_control.sql", "utf8"), "OpenAI owner pilot control proof");
  psql(readFileSync("supabase/tests/openai_hearth_luna_pilot_proposal.sql", "utf8"), "OpenAI Luna pilot proposal proof");
  psql(readFileSync("supabase/tests/openai_hearth_luna_pilot_control.sql", "utf8"), "OpenAI Luna pilot control proof");
  console.log(JSON.stringify({
    isolated_database: true,
    exact_rate_revisions: "passed",
    duplicate_submission_blocked: "passed",
    aggregate_failure_loss_halt: "passed",
    authoritative_reconciliation_idempotency: "passed",
    private_data_isolation: "passed",
    hearth_server_context: "passed",
    hearth_canonical_result_persistence: "passed",
    customer_settlement: "disabled",
    openai_rollout: "inactive",
    activation_proposal: "awaiting_owner_approval",
    owner_pilot_activation_and_closure: "passed",
    luna_model_metadata_access: "passed",
    luna_inactive_proposal: "awaiting_owner_approval",
    luna_exact_one_reservation_control: "passed",
  }));
} finally {
  docker(["exec", container, "dropdb", "-U", "postgres", "--if-exists", database]);
}
