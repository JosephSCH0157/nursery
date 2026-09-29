import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const container = process.env.SUPABASE_DB_CONTAINER || "supabase_db_nursery";
const sourceDatabase = process.env.SUPABASE_SOURCE_DATABASE || "postgres";
const database = `forge_owner_results_${randomUUID().replaceAll("-", "").slice(0, 10)}`;

function docker(args, input) {
  return spawnSync("docker", args, { input, encoding: "utf8", maxBuffer: 100 * 1024 * 1024 });
}
function check(result, label) {
  if (result.status !== 0) throw new Error(`${label} failed:\n${result.stderr || result.stdout}`);
}

try {
  const inspection = docker(["inspect", container]);
  check(inspection, "inspect local Supabase database container");
  const metadata = JSON.parse(inspection.stdout)[0];
  if (metadata?.Config?.Labels?.["com.supabase.cli.project"] === undefined) {
    throw new Error("refusing a database container that is not owned by the Supabase CLI");
  }
  check(docker(["exec", container, "createdb", "-U", "postgres", database]), "create isolated database");
  const dump = docker([
    "exec", container, "pg_dump", "-U", "postgres", "-d", sourceDatabase,
    "--schema-only", "--no-owner", "--schema=tongs", "--schema=auth", "--schema=extensions", "--schema=public",
  ]);
  check(dump, "capture canonical local schema");
  const schema = dump.stdout
    .replace(/^CREATE SCHEMA public;\r?\n/m, "")
    .replace(/^ALTER DEFAULT PRIVILEGES[\s\S]*?;\r?\n/gm, "");
  check(docker(["exec", "-i", container, "psql", "-X", "-q", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database], schema), "restore canonical schema");
  check(docker(["exec", "-i", container, "psql", "-X", "-q", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database], "create extension if not exists pgcrypto with schema extensions; create extension if not exists \"uuid-ossp\" with schema extensions;"), "restore required extensions");
  const installed = docker([
    "exec", container, "psql", "-X", "-A", "-t", "-U", "postgres", "-d", database,
    "-c", "select exists(select 1 from information_schema.columns where table_schema='tongs' and table_name='openai_text_persisted_results' and column_name='owner_cost_attempt_id')",
  ]);
  check(installed, "inspect Slice 4A installation");
  if (installed.stdout.trim() !== "t") {
    check(docker(
      ["exec", "-i", container, "psql", "-X", "-q", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database],
      readFileSync("supabase/migrations/20261011850000_hearth_owner_result_persistence_authority.sql", "utf8"),
    ), "apply Slice 4A migration");
  }
  check(docker(
    ["exec", "-i", container, "psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database],
    readFileSync("supabase/tests/hearth_owner_result_persistence_authority.sql", "utf8"),
  ), "owner Hearth result authority proof");
  process.stdout.write(`${JSON.stringify({
    isolated_database: true,
    affected_result_tables: 8,
    historical_customer_authority_preserved: "passed",
    xor_authority: "passed",
    owner_attempt_fk_and_restrict: "passed",
    owner_result_idempotency: "passed",
    attribution_and_environment_validation: "passed",
    research_synthesis_attempt_reconstruction: "passed",
    visual_narrative_owner_persistence: "passed",
    customer_finance_isolation: "passed",
    private_rls_and_grants: "passed",
    accounting_reconstruction: "passed",
  }, null, 2)}\n`);
} finally {
  docker(["exec", container, "dropdb", "-U", "postgres", "--if-exists", "--force", database]);
}
