import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const container = process.env.SUPABASE_DB_CONTAINER || "supabase_db_nursery";
const database = `forge_live_compat_${randomUUID().replaceAll("-", "").slice(0, 12)}`;

function docker(args, input) {
  return spawnSync("docker", args, { input, encoding: "utf8" });
}

function assertSuccess(result, step) {
  if (result.status !== 0) {
    throw new Error(`${step} failed:\n${result.stderr || result.stdout}`);
  }
}

function psql(sql, step) {
  const result = docker([
    "exec", "-i", container, "psql", "-X", "-q", "-v", "ON_ERROR_STOP=1",
    "-U", "postgres", "-d", database,
  ], sql);
  assertSuccess(result, step);
}

const files = [
  "supabase/tests/billing_isolated_baseline.sql",
  "supabase/tests/live_subscription_compatibility_baseline.sql",
  "supabase/migrations/20260910120000_tongs_accounting_foundation.sql",
  "supabase/migrations/20260914120000_tongs_live_subscription_compatibility.sql",
  "supabase/tests/live_subscription_compatibility.sql",
];

try {
  assertSuccess(
    docker(["exec", container, "createdb", "-U", "postgres", database]),
    "create isolated database",
  );
  for (const file of files) {
    let sql = readFileSync(file, "utf8");
    if (file.endsWith("billing_isolated_baseline.sql")) {
      sql = sql
        .replace("create role anon nologin;\n", "")
        .replace("create role authenticated nologin;\n", "")
        .replace("create role service_role nologin bypassrls;\n", "");
    }
    psql(sql, file);
  }
  console.log(JSON.stringify({
    live_subscription_compatibility: "passed",
    isolated_database: true,
    live_receipt_separate_from_entitlement: true,
    replay_safe: true,
    historical_entitlement_preserved: true,
    test_funding_blocked: true,
    shared_spending_gate_activated: false,
  }));
} finally {
  docker(["exec", container, "dropdb", "-U", "postgres", "--if-exists", database]);
}
