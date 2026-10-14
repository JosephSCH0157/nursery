import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

import { EXACT_TARGET, loadExactTargetEvidence } from "./lib/hammer-6c-exact-target-reconciliation.mjs";

const root = resolve(import.meta.dirname, "..");
const container = process.env.SUPABASE_DB_CONTAINER || "supabase_db_nursery";
const database = `forge_hammer_exact_${randomUUID().replaceAll("-", "").slice(0, 10)}`;
const schemaPath = resolve(root, ".git/forge-private-evidence/slice6a-connected-schema-after.sql");
const evidenceDirectory = resolve(root, ".git/forge-private-evidence/hammer-6c-supplier-evidence-run-38582959657");
const { evidence } = await loadExactTargetEvidence({ evidenceDirectory });

function extractRaw(path, declaration, terminator) {
  const source = readFileSync(path, "utf8");
  const start = source.indexOf(declaration);
  const end = source.indexOf(terminator, start + declaration.length);
  if (start < 0 || end < 0) throw new Error(`could not extract ${declaration}`);
  return source.slice(start + declaration.length, end);
}

const prerequisiteVerifier = resolve(root, "scripts/verify-hammer-test-canary-prerequisites-isolated.mjs");
const activationVerifier = resolve(root, "scripts/verify-owner-only-test-canary-scoped-activation-isolated.mjs");
const fixture = extractRaw(prerequisiteVerifier, "const fixture = String.raw`", "`;\n\ntry {").replace(
  "'slice6b1-mini','sku','openai','slice6b1-mini'",
  "'slice6b1-mini','sku','openai','openai-text:hammer.transcript_cleanup:gpt-5.4-mini:40010000-0000-4000-8000-000000000301'",
);
const setup = extractRaw(activationVerifier, "const setup = String.raw`", "`;\n\ntry {");

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
function sqlJson(value) { return `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`; }

function exactCall() {
  return `${sqlJson(evidence.costBuckets)},\n    ${sqlJson(evidence.usageBuckets)},\n    ${sqlJson(evidence.rawEvidence)}`;
}

function exactProof() {
  const source = readFileSync(resolve(root, "supabase/tests/hammer_6c_financial_contract_repair.sql"), "utf8");
  const cutoff = source.indexOf("  result:=tongs.record_openai_organization_reconciliation(\n    nonzero_batch_id");
  if (cutoff < 0) throw new Error("exact proof cutoff was not found");
  let proof = `${source.slice(0, cutoff)}end;\n$$;\n\ncommit;\n`;
  proof = proof
    .replace("operation_id text:='hammer-owner-canary-financial-repair-proof';", "operation_id text:='hammer-owner-canary-20261007-0002:isolated-exact-proof';")
    .replace("start_epoch bigint:=extract(epoch from date_trunc('day',now()))::bigint;", `start_epoch bigint:=${EXACT_TARGET.startTime};`)
    .replace("zero_batch_id uuid:='6c9a0000-0000-4000-8000-000000000020';", `zero_batch_id uuid:='${evidence.batchId}';`)
    .replaceAll("'openai-costs-hammer-6c-zero'", `'${evidence.sourceKey}'`);

  const reconciliationPrefix = "  result:=tongs.record_openai_organization_reconciliation(\n";
  const firstCall = proof.indexOf(reconciliationPrefix);
  const firstAssertion = proof.indexOf("  if result->>'allocation_status'", firstCall);
  if (firstCall < 0 || firstAssertion < 0) throw new Error("first exact reconciliation call was not found");
  const fixedArguments = `    zero_batch_id,'${evidence.sourceKey}',to_timestamp(start_epoch),\n    to_timestamp(start_epoch+86400),'USD',0,'organization_costs_api','confirmed',\n    ${exactCall()});\n`;
  proof = proof.slice(0, firstCall) + reconciliationPrefix + fixedArguments + proof.slice(firstAssertion);

  const replayCall = proof.indexOf(reconciliationPrefix, firstCall + reconciliationPrefix.length + fixedArguments.length);
  const replayReadback = proof.indexOf("  select jsonb_build_object(", replayCall);
  if (replayCall < 0 || replayReadback < 0) throw new Error("replay call was not found");
  proof = proof.slice(0, replayCall) + reconciliationPrefix + fixedArguments + proof.slice(replayReadback);
  return proof;
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
  psqlFile(schemaPath, "/tmp/forge-hammer-exact-schema.sql", "connected-shape schema restore");
  psql(fixture, "Hammer authority fixture");
  psqlFile(resolve(root, "supabase/migrations/20261012040000_hammer_test_canary_prerequisites.sql"), "/tmp/forge-hammer-exact-prerequisite.sql", "Hammer prerequisite migration");
  psql(setup, "Hammer staged authority");
  for (const [file, target] of [
    ["20261012050000_owner_only_test_canary_scoped_activation.sql", "/tmp/forge-hammer-exact-activation.sql"],
    ["20261012060000_scoped_owner_canary_execution_context_activation.sql", "/tmp/forge-hammer-exact-context.sql"],
    ["20261012070000_return_paid_funding_environment.sql", "/tmp/forge-hammer-exact-environment.sql"],
    ["20261012075000_hammer_canary_eligibility_verified_zero_support.sql", "/tmp/forge-hammer-exact-verified-zero.sql"],
    ["20261014205219_hammer_6c_financial_contract_repair.sql", "/tmp/forge-hammer-exact-repair.sql"],
  ]) psqlFile(resolve(root, `supabase/migrations/${file}`), target, file);

  psql("alter table tongs.openai_text_usage_evidence alter column recorded_at set default '2026-10-07T08:38:25Z'::timestamptz;", "pin historical usage time in disposable fixture");
  psql(exactProof(), "exact preserved-evidence reconciliation proof");
  const state = JSON.parse(psql(String.raw`
    select jsonb_build_object(
      'batches',(select count(*) from tongs.openai_organization_reconciliation_batches),
      'batch_id',(select id from tongs.openai_organization_reconciliation_batches limit 1),
      'source_key',(select source_key from tongs.openai_organization_reconciliation_batches limit 1),
      'allocations',(select count(*) from tongs.openai_text_operation_cost_allocations),
      'supplier_adjustment',(select adjustment_micros from tongs.openai_supplier_expense_reconciliation_adjustments limit 1),
      'owner_adjustment',(select adjustment_micros from tongs.owner_operating_budget_reconciliation_adjustments limit 1),
      'effective_supplier_amount',(select tongs._effective_supplier_expense_amount_micros(id) from tongs.supplier_expenses where provider='openai' limit 1),
      'effective_obligation',(select tongs._effective_supplier_expense_obligation_status(id) from tongs.supplier_expenses where provider='openai' limit 1),
      'original_supplier_amount',(select amount_micros from tongs.supplier_expenses where provider='openai' limit 1),
      'original_supplier_status',(select obligation_status from tongs.supplier_expenses where provider='openai' limit 1),
      'original_owner_consumption',(select expense_amount_micros from tongs.owner_operating_budget_consumptions limit 1),
      'owner_expense_journal',(select coalesce(sum(amount_micros),0) from tongs.accounting_journal_entries where account_code='owner_research_qa_expense'),
      'cash_clearing_journal',(select coalesce(sum(amount_micros),0) from tongs.accounting_journal_entries where account_code='forge_cash_clearing'),
      'remaining_exposure',(select committed_micros from tongs._restricted_beta_policy_commitment('40010000-0000-4000-8000-000000000701')),
      'customer_charge',(select coalesce(sum(customer_charge_micros),0) from tongs.funding_reservation_events),
      'provider_attempts',(select count(*) from tongs.funding_reservation_events where provider_attempt_key is not null),
      'usage_rows',(select count(*) from tongs.openai_text_usage_evidence),
      'target_usage_recorded_at',(select recorded_at from tongs.openai_text_usage_evidence limit 1));
  `, "exact reconciliation readback"));
  const expected = {
    batches: 1,
    batch_id: evidence.batchId,
    source_key: evidence.sourceKey,
    allocations: 1,
    supplier_adjustment: -246,
    owner_adjustment: -246,
    effective_supplier_amount: 0,
    effective_obligation: "closed",
    original_supplier_amount: 246,
    original_supplier_status: "open",
    original_owner_consumption: 246,
    owner_expense_journal: 0,
    cash_clearing_journal: 0,
    remaining_exposure: 0,
    customer_charge: 0,
    provider_attempts: 1,
    usage_rows: 1,
  };
  for (const [key, value] of Object.entries(expected)) {
    if (state[key] !== value) throw new Error(`isolated invariant ${key} changed: ${JSON.stringify(state)}`);
  }
  if (!String(state.target_usage_recorded_at).startsWith("2026-10-07T08:38:25")) throw new Error("historical usage window was not exact");
  console.log(JSON.stringify({
    ok: true,
    database,
    batch_id: evidence.batchId,
    source_key: evidence.sourceKey,
    state,
    exact_replay_idempotent: true,
    conflicting_replay_failed_closed: true,
    provider_network_calls: 0,
  }, null, 2));
} finally {
  docker(["exec", container, "dropdb", "-U", "postgres", "--if-exists", "--force", database], { label: "drop isolated database" });
}
