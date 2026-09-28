import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const container = process.env.SUPABASE_DB_CONTAINER || "supabase_db_nursery";
const sourceDatabase = process.env.SUPABASE_SOURCE_DATABASE || "postgres";
const database = `forge_owner_cost_${randomUUID().replaceAll("-", "").slice(0, 12)}`;

function docker(args, input) {
  return spawnSync("docker", args, {
    input,
    encoding: "utf8",
    maxBuffer: 80 * 1024 * 1024,
  });
}

function check(result, label) {
  if (result.status !== 0) {
    throw new Error(`${label} failed:\n${result.stderr || result.stdout}`);
  }
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
    "--schema-only", "--no-owner", "--schema=tongs", "--schema=auth",
    "--schema=extensions", "--schema=public",
  ]);
  check(dump, "capture canonical local schema");
  const isolatedSchema = dump.stdout
    .replace(/^CREATE SCHEMA public;\r?\n/m, "")
    .replace(/^ALTER DEFAULT PRIVILEGES[\s\S]*?;\r?\n/gm, "");
  check(
    docker(
      ["exec", "-i", container, "psql", "-X", "-q", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database],
      isolatedSchema,
    ),
    "restore canonical schema into isolated database",
  );
  check(
    docker(
      ["exec", "-i", container, "psql", "-X", "-q", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database],
      "create extension if not exists pgcrypto with schema extensions;",
    ),
    "restore canonical pgcrypto extension",
  );
  const removeClonedSlice = `
    drop table if exists tongs.owner_cost_operation_links cascade;
    drop table if exists tongs.owner_cost_valuations cascade;
    drop table if exists tongs.owner_cost_attempt_events cascade;
    drop table if exists tongs.owner_cost_provider_attempts cascade;
    drop table if exists tongs.owner_cost_operations cascade;
    drop function if exists tongs._require_owner_cost_reader() cascade;
    drop function if exists tongs._validate_owner_cost_attribution(uuid,uuid,uuid,uuid,uuid) cascade;
    drop function if exists tongs.read_owner_cost_summary(text,text) cascade;
  `;
  check(
    docker(
      ["exec", "-i", container, "psql", "-X", "-q", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database],
      removeClonedSlice,
    ),
    "remove cloned Slice 1 objects",
  );
  check(
    docker(
      ["exec", "-i", container, "psql", "-X", "-q", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database],
      readFileSync("supabase/migrations/20261011820000_tongs_owner_cost_accounting_authority.sql", "utf8"),
    ),
    "apply Slice 1 migration to isolated canonical schema",
  );
  check(
    docker(
      ["exec", "-i", container, "psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database],
      readFileSync("supabase/tests/owner_cost_accounting_authority.sql", "utf8"),
    ),
    "owner-cost accounting authority proof",
  );

  process.stdout.write(`${JSON.stringify({
    isolated_database: true,
    journal_is_sole_financial_authority: "passed",
    evidence_only_excluded_from_totals: "passed",
    bidirectional_reconstruction: "passed",
    append_only_reconciliation: "passed",
    operation_attempt_valuation_idempotency: "passed",
    canonical_identity_references: "passed",
    late_attribution_preserves_provider_history: "passed",
    private_rls_and_grants: "passed",
    environment_isolation: "passed",
    customer_finance_dependency_isolation: "passed",
  }, null, 2)}\n`);
} finally {
  docker(["exec", container, "dropdb", "-U", "postgres", "--if-exists", "--force", database]);
}
