import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const container = process.env.SUPABASE_DB_CONTAINER || "supabase_db_nursery";
const sourceDatabase = process.env.SUPABASE_SOURCE_DATABASE || "postgres";
const database = `forge_credential_lifecycle_${randomUUID().replaceAll("-", "").slice(0, 10)}`;

function docker(args, input) {
  return spawnSync("docker", args, { input, encoding: "utf8", maxBuffer: 80 * 1024 * 1024 });
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
  check(docker(["exec", "-i", container, "psql", "-X", "-q", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database], "create extension if not exists pgcrypto with schema extensions;"), "restore pgcrypto");
  check(docker(["exec", "-i", container, "psql", "-X", "-q", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database], "create extension if not exists plpgsql_check with schema extensions;"), "restore plpgsql_check");
  const remove = `
    drop table if exists tongs.credential_lifecycle_alerts cascade;
    drop table if exists tongs.credential_lifecycle_events cascade;
    drop table if exists tongs.credential_lifecycle_records cascade;
    drop function if exists tongs._credential_lifecycle_metadata_safe(jsonb) cascade;
    drop function if exists tongs._require_credential_lifecycle_reader() cascade;
    drop function if exists tongs._require_credential_lifecycle_writer() cascade;
  `;
  check(docker(["exec", "-i", container, "psql", "-X", "-q", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database], remove), "remove cloned lifecycle objects");
  check(docker(["exec", "-i", container, "psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database], readFileSync("supabase/migrations/20261011900000_forge_credential_lifecycle.sql", "utf8")), "apply credential lifecycle migration");
  check(docker(["exec", "-i", container, "psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database], readFileSync("supabase/migrations/20261011910000_credential_lifecycle_secret_key_role.sql", "utf8")), "apply secret-key role compatibility migration");
  check(docker(["exec", "-i", container, "psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database], readFileSync("supabase/migrations/20261011930000_credential_lifecycle_activation_ordering.sql", "utf8")), "apply credential lifecycle activation ordering migration");
  const lintSql = `
    do $lint$
    declare
      issue record;
    begin
      for issue in
        select p.proname, checked.sqlstate, checked.message
        from pg_proc p
        cross join lateral extensions.plpgsql_check_function_tb(p.oid) checked
        where p.pronamespace = 'tongs'::regnamespace
          and p.proname in (
            '_credential_lifecycle_metadata_safe',
            '_require_credential_lifecycle_reader',
            '_require_credential_lifecycle_writer',
            'register_credential_lifecycle',
            'set_credential_lifecycle_deadline',
            'record_credential_lifecycle_verification',
            'transition_credential_lifecycle',
            'refresh_credential_lifecycle_alerts',
            'read_credential_lifecycle_execution_gate',
            'read_credential_lifecycle_report'
          )
      loop
        raise exception 'credential lifecycle lint issue in % [%]: %', issue.proname, issue.sqlstate, issue.message;
      end loop;
    end
    $lint$;
  `;
  check(docker(["exec", "-i", container, "psql", "-X", "-q", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database], lintSql), "lint credential lifecycle functions");
  check(docker(["exec", "-i", container, "psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database], readFileSync("supabase/tests/credential_lifecycle.sql", "utf8")), "credential lifecycle proof");
  process.stdout.write(`${JSON.stringify({
    isolated_database: true,
    lifecycle_transitions: "passed",
    deadline_and_alert_escalation: "passed",
    replacement_and_revocation_history: "passed",
    raw_secret_rejection: "passed",
    customer_and_anon_containment: "passed",
    operator_and_service_authority: "passed",
    runway_actual_expiration_calculation: "passed",
    expired_credential_fail_closed: "passed",
    focused_database_lint: "passed",
    codex_handoff_metadata: "passed",
  }, null, 2)}\n`);
} finally {
  docker(["exec", container, "dropdb", "-U", "postgres", "--if-exists", "--force", database]);
}
