import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const container = process.env.SUPABASE_DB_CONTAINER || "supabase_db_nursery";
const sourceDatabase = process.env.SUPABASE_SOURCE_DATABASE || "postgres";
const database = `forge_zero_beat_broll_${randomUUID().replaceAll("-", "").slice(0, 10)}`;

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
  check(docker(
    ["exec", "-i", container, "psql", "-X", "-q", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database],
    'create extension if not exists pgcrypto with schema extensions; create extension if not exists "uuid-ossp" with schema extensions;',
  ), "restore required extensions");
  check(docker(
    ["exec", "-i", container, "psql", "-X", "-q", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database],
    readFileSync("supabase/migrations/20261012000000_allow_zero_beat_unified_broll_plan.sql", "utf8"),
  ), "apply zero-beat B-roll migration");
  check(docker(
    ["exec", "-i", container, "psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database],
    readFileSync("supabase/tests/zero_beat_broll_plan.sql", "utf8"),
  ), "zero-beat B-roll proof");

  process.stdout.write(`${JSON.stringify({
    isolated_database: true,
    zero_beat_plan_committed: "passed",
    explicit_empty_receipt: "passed",
    canonical_readback_empty: "passed",
    replay_idempotency: "passed",
    non_array_rejected: "passed",
    invalid_beat_rejected_atomically: "passed",
    customer_editor_authority: "passed",
    viewer_denied: "passed",
    grants_preserved: "passed",
  }, null, 2)}\n`);
} finally {
  docker(["exec", container, "dropdb", "-U", "postgres", "--if-exists", "--force", database]);
}
