import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const container = process.env.SUPABASE_DB_CONTAINER || "supabase_db_nursery";
const sourceDatabase = process.env.SUPABASE_SOURCE_DATABASE || "postgres";
const database = `forge_account_authority_${randomUUID().replaceAll("-", "").slice(0, 12)}`;

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

  const seed = `
    create table tongs.owner_testing_principals (
      user_id uuid primary key references auth.users(id) on delete restrict,
      status text not null check (status in ('enabled', 'disabled')),
      revision integer not null check (revision > 0),
      reason text not null,
      configured_by uuid not null references auth.users(id) on delete restrict,
      configured_at timestamptz not null default now()
    );
    create table tongs.owner_testing_principal_events (
      id uuid primary key,
      user_id uuid not null references auth.users(id) on delete restrict,
      revision integer not null check (revision > 0),
      status text not null check (status in ('enabled', 'disabled')),
      reason text not null,
      actor_id uuid not null references auth.users(id) on delete restrict,
      created_at timestamptz not null default now(),
      unique (user_id, revision)
    );
    insert into auth.users(id,email) values
      ('ca900000-0000-4000-8000-000000000001','legacy-owner@example.test'),
      ('ca900000-0000-4000-8000-000000000002','legacy-operator@example.test');
    insert into tongs.platform_operators(user_id,reason,granted_by) values
      ('ca900000-0000-4000-8000-000000000002','verified migration operator','ca900000-0000-4000-8000-000000000002');
    insert into tongs.owner_testing_principals(user_id,status,revision,reason,configured_by)
    values('ca900000-0000-4000-8000-000000000001','enabled',1,'verified legacy owner principal','ca900000-0000-4000-8000-000000000002');
    insert into tongs.owner_testing_principal_events(id,user_id,revision,status,reason,actor_id)
    values('ca900000-0000-4000-8000-000000000003','ca900000-0000-4000-8000-000000000001',1,'enabled','verified legacy owner principal','ca900000-0000-4000-8000-000000000002');
  `;
  check(
    docker(
      ["exec", "-i", container, "psql", "-X", "-q", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database],
      seed,
    ),
    "seed verified legacy owner authority",
  );
  check(
    docker(
      ["exec", "-i", container, "psql", "-X", "-q", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database],
      readFileSync("supabase/migrations/20261011940000_canonical_account_owner_authority.sql", "utf8"),
    ),
    "apply canonical account owner authority migration",
  );
  check(
    docker(
      ["exec", "-i", container, "psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database],
      readFileSync("supabase/tests/account_authority_classifications.sql", "utf8"),
    ),
    "canonical account owner authority proof",
  );

  process.stdout.write(`${JSON.stringify({
    isolated_database: true,
    verified_owner_backfill: "passed",
    service_operator_mutation: "passed",
    customer_and_anonymous_isolation: "passed",
    deterministic_revisions: "passed",
    append_only_revocation_history: "passed",
    implicit_customer_default: "passed",
    workspace_operator_subscription_credit_isolation: "passed",
    guarded_operator_read: "passed",
  }, null, 2)}\n`);
} finally {
  docker(["exec", container, "dropdb", "-U", "postgres", "--if-exists", "--force", database]);
}
