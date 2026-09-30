import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const container = process.env.SUPABASE_DB_CONTAINER || "supabase_db_nursery";
const sourceDatabase = process.env.SUPABASE_SOURCE_DATABASE || "postgres";
const database = `forge_owner_visual_persistence_${randomUUID().replaceAll("-", "").slice(0, 10)}`;

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

  const ownerCostInstalled = docker([
    "exec", container, "psql", "-X", "-A", "-t", "-U", "postgres", "-d", database,
    "-c", "select to_regclass('tongs.owner_cost_operations') is not null",
  ]);
  check(ownerCostInstalled, "inspect owner-cost foundation");
  if (ownerCostInstalled.stdout.trim() !== "t") {
    for (const migration of [
      "20261011820000_tongs_owner_cost_accounting_authority.sql",
      "20261011830000_index_owner_cost_relations.sql",
      "20261011840000_allow_definitive_provider_rejection.sql",
    ]) {
      check(docker(
        ["exec", "-i", container, "psql", "-X", "-q", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database],
        readFileSync(`supabase/migrations/${migration}`, "utf8"),
      ), `apply accepted prerequisite ${migration}`);
    }
  }

  const ownerAttemptColumn = docker([
    "exec", container, "psql", "-X", "-A", "-t", "-U", "postgres", "-d", database,
    "-c", "select exists(select 1 from information_schema.columns where table_schema='tongs' and table_name='unified_visual_plan_operations' and column_name='owner_cost_attempt_id')",
  ]);
  check(ownerAttemptColumn, "inspect Unified Visual Plan owner-attempt compatibility");
  if (ownerAttemptColumn.stdout.trim() !== "t") {
    check(docker(
      ["exec", "-i", container, "psql", "-X", "-q", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database],
      `alter table tongs.unified_visual_plan_operations add column owner_cost_attempt_id uuid;
       alter table tongs.unified_visual_plan_operations add constraint unified_visual_plan_owner_attempt_fkey
         foreign key(owner_cost_attempt_id) references tongs.owner_cost_provider_attempts(attempt_id) on delete restrict;
       create unique index unified_visual_plan_owner_attempt_uidx
         on tongs.unified_visual_plan_operations(owner_cost_attempt_id) where owner_cost_attempt_id is not null;`,
    ), "install accepted Unified Visual Plan owner-attempt compatibility");
  }

  const installed = docker([
    "exec", container, "psql", "-X", "-A", "-t", "-U", "postgres", "-d", database,
    "-c", "select to_regprocedure('tongs._assert_owner_unified_visual_plan_persistence_authority(uuid,text,text,uuid,uuid,uuid)') is not null",
  ]);
  check(installed, "inspect owner persistence migration installation");
  if (installed.stdout.trim() !== "t") {
    check(docker(
      ["exec", "-i", container, "psql", "-X", "-q", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database],
      readFileSync("supabase/migrations/20261011970000_owner_unified_visual_plan_persistence_authority.sql", "utf8"),
    ), "apply owner persistence authority migration");
  }

  check(docker(
    ["exec", "-i", container, "psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database],
    readFileSync("supabase/tests/owner_unified_visual_plan_persistence_authority.sql", "utf8"),
  ), "owner Unified Visual Plan persistence authority proof");

  process.stdout.write(`${JSON.stringify({
    isolated_database: true,
    public_functions_exercised: 5,
    customer_editor_unchanged: "passed",
    unauthorized_customer_denied: "passed",
    exact_owner_service_binding: "passed",
    wrong_attempt_operation_workspace_workpiece_denied: "passed",
    service_without_owner_binding_denied: "passed",
    authenticated_owner_branch_denied: "passed",
    private_helper_acl: "passed",
    reconstruction: "0/0",
  }, null, 2)}\n`);
} finally {
  docker(["exec", container, "dropdb", "-U", "postgres", "--if-exists", "--force", database]);
}
