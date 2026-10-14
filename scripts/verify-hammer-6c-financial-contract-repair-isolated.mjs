import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const container = process.env.SUPABASE_DB_CONTAINER || "supabase_db_nursery";
const database = `forge_hammer6c_repair_${randomUUID().replaceAll("-", "").slice(0, 10)}`;
const schemaPath = resolve(root, ".git/forge-private-evidence/slice6a-connected-schema-after.sql");
const priorVerifier = readFileSync(resolve(root, "scripts/verify-owner-only-test-canary-scoped-activation-isolated.mjs"), "utf8");
const priorSetup = priorVerifier.match(/const setup = String\.raw`([\s\S]*?)`;\n\ntry \{/);
const fixtureVerifier = readFileSync(resolve(root, "scripts/verify-hammer-test-canary-prerequisites-isolated.mjs"), "utf8");
const fixtureMatch = fixtureVerifier.match(/const fixture = String\.raw`([\s\S]*?)`;\n\ntry \{/);
if (!priorSetup || !fixtureMatch) throw new Error("Hammer isolated fixture could not be located");
const fixture = fixtureMatch[1].replace(
  "'slice6b1-mini','sku','openai','slice6b1-mini'",
  "'slice6b1-mini','sku','openai','openai-text:hammer.transcript_cleanup:gpt-5.4-mini:40010000-0000-4000-8000-000000000301'",
);

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8", maxBuffer: 96 * 1024 * 1024, ...options });
  if (result.status !== 0) throw new Error(`${options.label || command} failed:\n${result.stderr || result.stdout}`);
  return result.stdout.trim();
}
function docker(args, options = {}) { return run("docker", args, options); }
function psql(sql, label) {
  return docker(["exec", "-i", container, "psql", "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database], { input: sql, label });
}
function psqlFile(hostPath, containerPath, label) {
  docker(["cp", hostPath, `${container}:${containerPath}`], { label: `${label} copy` });
  return docker(["exec", container, "psql", "-X", "-q", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database, "-f", containerPath], { label });
}

try {
  docker(["exec", container, "createdb", "-U", "postgres", database], { label: "create isolated database" });
  psql(String.raw`
    create schema if not exists auth;
    create table auth.users(id uuid primary key,email text);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create function auth.role() returns text language sql stable as $$ select coalesce(current_setting('request.jwt.claim.role',true),'') $$;
    create schema if not exists extensions;
    create extension if not exists "uuid-ossp" with schema extensions;
    create extension if not exists pgcrypto with schema extensions;
  `, "isolated bootstrap");
  psqlFile(schemaPath, "/tmp/forge-hammer6c-schema.sql", "connected-shape schema restore");
  psql(fixture, "Hammer authority fixture");
  psqlFile(resolve(root, "supabase/migrations/20261012040000_hammer_test_canary_prerequisites.sql"), "/tmp/forge-hammer6c-prerequisite.sql", "Hammer prerequisite migration");
  psql(priorSetup[1], "Hammer staged authority");
  psqlFile(resolve(root, "supabase/migrations/20261012050000_owner_only_test_canary_scoped_activation.sql"), "/tmp/forge-hammer6c-owner-scope.sql", "owner scope migration");
  psqlFile(resolve(root, "supabase/migrations/20261012060000_scoped_owner_canary_execution_context_activation.sql"), "/tmp/forge-hammer6c-context.sql", "execution context migration");
  psqlFile(resolve(root, "supabase/migrations/20261012070000_return_paid_funding_environment.sql"), "/tmp/forge-hammer6c-environment.sql", "funding environment migration");
  psqlFile(resolve(root, "supabase/migrations/20261012075000_hammer_canary_eligibility_verified_zero_support.sql"), "/tmp/forge-hammer6c-verified-zero.sql", "verified-zero migration");
  const authorityQuery = String.raw`
    select jsonb_build_object(
      'hammer_rollout',(select mode from tongs.openai_text_rollout_revisions where route_code='hammer.transcript_cleanup' order by revision desc limit 1),
      'normal_hammer_scopes',(select count(*) from tongs.customer_paid_execution_scope_authorizations where route_code='hammer.transcript_cleanup' and authorization_kind='normal_customer'),
      'live_hammer_scopes',(select count(*) from tongs.customer_paid_execution_scope_authorizations where route_code='hammer.transcript_cleanup' and financial_environment='live'),
      'all_scopes',(select count(*) from tongs.customer_paid_execution_scope_authorizations),
      'budgets',(select count(*) from tongs.owner_operating_budgets),
      'pricing_revisions',(select count(*) from tongs.private_pricing_revisions),
      'aggregate_assignments',(select count(*) from tongs.paid_execution_aggregate_assignments));
  `;
  const authorityBefore = JSON.parse(psql(authorityQuery, "pre-repair authority snapshot"));
  psqlFile(resolve(root, "supabase/migrations/20261014205219_hammer_6c_financial_contract_repair.sql"), "/tmp/forge-hammer6c-repair.sql", "financial contract repair migration");
  const authorityAfter = JSON.parse(psql(authorityQuery, "post-repair authority snapshot"));
  if (JSON.stringify(authorityBefore) !== JSON.stringify(authorityAfter)) {
    throw new Error(`repair changed financial execution authority: ${JSON.stringify({ authorityBefore, authorityAfter })}`);
  }
  if (authorityAfter.hammer_rollout !== "halt_new" || authorityAfter.normal_hammer_scopes !== 0 || authorityAfter.live_hammer_scopes !== 0) {
    throw new Error(`Hammer containment regressed: ${JSON.stringify(authorityAfter)}`);
  }

  psqlFile(resolve(root, "supabase/tests/hammer_6c_financial_contract_repair.sql"), "/tmp/forge-hammer6c-repair-test.sql", "financial contract repair regression");
  console.log(JSON.stringify({ ok: true, database, authority: authorityAfter, provider_network_calls: 0 }));
} finally {
  docker(["exec", container, "dropdb", "-U", "postgres", "--if-exists", "--force", database], { label: "drop isolated database" });
}
