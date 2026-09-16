import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const container = process.env.SUPABASE_DB_CONTAINER || "supabase_db_nursery";
const database = `forge_relief_correction_${randomUUID().replaceAll("-", "").slice(0, 10)}`;

function docker(args, input) {
  return spawnSync("docker", args, { input, encoding: "utf8", maxBuffer: 40 * 1024 * 1024 });
}
function check(result, label) {
  if (result.status !== 0) throw new Error(`${label} failed:\n${result.stderr || result.stdout}`);
}
function psql(sql, label) {
  const result = docker([
    "exec", "-i", container, "psql", "-X", "-q", "-v", "ON_ERROR_STOP=1",
    "-U", "postgres", "-d", database,
  ], sql);
  check(result, label);
}

try {
  check(docker(["exec", container, "createdb", "-U", "postgres", database]), "create isolated database");
  psql(
    readFileSync("supabase/tests/customer_operation_relief_corrections_baseline.sql", "utf8"),
    "relief-correction current-shape baseline",
  );
  psql(
    readFileSync("supabase/migrations/20261011360000_customer_operation_relief_corrections.sql", "utf8"),
    "relief-correction migration",
  );
  psql(
    readFileSync("supabase/migrations/20261011370000_customer_operation_relief_canonical_binding_evidence.sql", "utf8"),
    "relief-correction canonical binding repair",
  );
  psql(
    readFileSync("supabase/tests/customer_operation_relief_corrections.sql", "utf8"),
    "relief-correction proof",
  );
  console.log(JSON.stringify({
    isolated_database: true,
    legitimate_relief_restoration: "passed",
    exact_append_only_correction: "passed",
    correction_journal_reinstates_revenue: "passed",
    unit_and_cumulative_bounds: "passed",
    exact_replay_idempotent: "passed",
    conflicting_replay_rejected: "passed",
    relationship_and_environment_guards: "passed",
    operator_only_authority: "passed",
    canonical_result_evidence_required: "passed",
    test_live_shared_path_separated: "passed",
    processor_allocation_unchanged: "passed",
  }));
} finally {
  docker(["exec", container, "dropdb", "-U", "postgres", "--if-exists", database]);
}
