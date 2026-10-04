import { randomUUID } from "node:crypto";
import { mkdirSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const container = process.env.SUPABASE_DB_CONTAINER || "supabase_db_nursery";
const database = `forge_slice6a_${randomUUID().replaceAll("-", "").slice(0, 10)}`;
const schemaPath = resolve(root, ".git/forge-private-evidence/slice6a-connected-schema.sql");
const migrationPath = resolve(root, "supabase/migrations/20261012030000_shared_owner_only_execution_authority.sql");
const testPath = resolve(root, "supabase/tests/shared_owner_only_execution_authority.sql");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 96 * 1024 * 1024,
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(`${options.label || command} failed:\n${result.stderr || result.stdout}`);
  }
  return result.stdout.trim();
}

function docker(args, options = {}) {
  return run("docker", args, options);
}

function psqlFile(hostPath, containerPath, label) {
  docker(["cp", hostPath, `${container}:${containerPath}`], { label: `${label} copy` });
  docker([
    "exec", container, "psql", "-X", "-q", "-v", "ON_ERROR_STOP=1",
    "-U", "postgres", "-d", database, "-f", containerPath,
  ], { label });
}

try {
  mkdirSync(dirname(schemaPath), { recursive: true });
  let schemaReady = false;
  try {
    schemaReady = statSync(schemaPath).size > 0;
  } catch {
    schemaReady = false;
  }
  if (!schemaReady) {
    run("pnpm", ["exec", "supabase", "db", "dump", "--linked", "--schema", "tongs", "--file", schemaPath], {
      label: "read-only connected schema dump",
    });
  }

  docker(["exec", container, "createdb", "-U", "postgres", database], { label: "create isolated database" });
  const bootstrap = String.raw`
create schema if not exists auth;
create table auth.users(id uuid primary key,email text);
create function auth.uid() returns uuid language sql stable as $$select null::uuid$$;
create function auth.role() returns text language sql stable as $$select coalesce(current_setting('request.jwt.claim.role',true),'')$$;
create schema if not exists extensions;
create extension if not exists "uuid-ossp" with schema extensions;
create extension if not exists pgcrypto with schema extensions;
`;
  docker([
    "exec", "-i", container, "psql", "-X", "-q", "-v", "ON_ERROR_STOP=1",
    "-U", "postgres", "-d", database,
  ], { input: bootstrap, label: "isolated bootstrap" });
  psqlFile(schemaPath, "/tmp/forge-slice6a-schema.sql", "connected-shape schema restore");
  psqlFile(migrationPath, "/tmp/forge-slice6a-migration.sql", "Slice 6A migration");
  psqlFile(testPath, "/tmp/forge-slice6a-test.sql", "Slice 6A transactional proof");

  const summary = docker([
    "exec", container, "psql", "-X", "-q", "-A", "-t", "-U", "postgres", "-d", database,
    "-c", `select jsonb_build_object(
      'authorization_kind_owner_only',position('owner_only' in pg_get_constraintdef(oid))>0,
      'owner_creator_service_only',not has_function_privilege('authenticated','tongs.create_owner_only_openai_text_execution_scope_authorization(uuid,uuid,uuid,uuid,text,text,text,timestamptz,timestamptz,text)','EXECUTE'),
      'assignment_guard_rollout_decoupled',position('_current_openai_text_rollout' in pg_get_functiondef('tongs._validate_paid_execution_aggregate_assignment()'::regprocedure))=0,
      'runtime_rollout_gate',position('rollout_halt_new' in pg_get_functiondef('tongs.acquire_openai_text_aggregate_admission(uuid,text,text)'::regprocedure))>0
    ) from pg_constraint where conrelid='tongs.customer_paid_execution_scope_authorizations'::regclass and conname='customer_paid_execution_scope_authorizations_authorization_kind'`,
  ], { label: "isolated summary" });
  console.log(summary);
} finally {
  docker(["exec", container, "dropdb", "-U", "postgres", "--if-exists", "--force", database], {
    label: "drop isolated database",
  });
}
