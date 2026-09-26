import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(new URL(
  "../../../supabase/migrations/20261011810000_runway_success_financial_finalization.sql",
  import.meta.url), "utf8");
const workpiece = readFileSync(new URL("../src/workpiece-commit-api.ts", import.meta.url), "utf8");

test("finalization is ordered after the latest Runway recovery migration and preserves the RPC contract", () => {
  assert.match(migration, /version='20261011800000'/);
  assert.match(migration, /rename to _reconcile_runway_execution_before_success_finalization/);
  assert.match(migration, /create function tongs\.reconcile_runway_execution\(\s*p_operation_id text,\s*p_direct_provider_actual_micros bigint,\s*p_supporting_actual_micros bigint,\s*p_settlement_id uuid,\s*p_settlement_key text,\s*p_evidence_json jsonb default '\{\}'::jsonb/);
  assert.match(migration, /grant execute on function tongs\.reconcile_runway_execution\(text,bigint,bigint,uuid,text,jsonb\) to service_role/);
  assert.match(migration, /revoke all on function tongs\._reconcile_runway_execution_before_success_finalization[\s\S]*from public,anon,authenticated,service_role/);
});

test("direct actual derives from persisted Runway credits and is cross-checked against bound pricing", () => {
  assert.match(migration, /evidence_json#>'\{cost,credits\}'/);
  assert.match(migration, /v_derived:=\(v_credits\*10000\)::bigint/);
  assert.match(migration, /v_bound:=v_binding\.duration_seconds::bigint\*120000/);
  assert.match(migration, /'SUCCEEDED'/);
  assert.match(migration, /wholesale_ceiling_overrun/);
  assert.match(migration, /disagrees with bound pricing/);
});

test("one confirmed supplier expense and the canonical success settlement precede receipt finalization", () => {
  const expense = migration.indexOf("tongs.record_supplier_expense(");
  const settle = migration.indexOf("tongs.settle_operation(");
  const finalize = migration.indexOf("set supporting_cost_status='finalized'");
  assert.ok(expense > 0 && settle > expense && finalize > settle);
  assert.match(migration, /'runway-direct-supplier-expense:'\|\|v_binding\.operation_id/);
  assert.match(migration, /'confirmed',\s*'closed'/);
  assert.match(migration, /'success',null,v_total,v_evidence/);
  assert.doesNotMatch(migration, /settle_owner_operation\s*\(/);
});

test("migration touches no pricing, historical operation, or financial row directly", () => {
  assert.doesNotMatch(migration, /eca82dd315133b5db4197005ee769f7bfae6cd064ff80dea53f787d5feae176f/);
  assert.doesNotMatch(migration, /c632e963d53d306f951703cd9559d8656bceaf9d530f0d577f024a82a2b9a120/);
  assert.doesNotMatch(migration, /private_pricing_revisions\s+set|insert into tongs\.private_pricing|funding_reservation_events\s*\(/i);
  assert.doesNotMatch(migration, /\b(update|delete from)\s+tongs\.(funding_reservations|supplier_expenses|customer_deposit_consumptions)/i);
});

test("financial reconciliation runs only on the fresh commit path, after aggregate success", () => {
  const calls = [...workpiece.matchAll(/reconcileSuccessfulExecution\(/g)].map((match) => match.index);
  assert.equal(calls.length, 1);
  const commit = workpiece.indexOf('rpc("commit_broll_candidate"');
  const lastCanonical = workpiece.lastIndexOf("recordCanonicalSuccessForReconciliation(");
  assert.ok(commit < lastCanonical && lastCanonical < calls[0]);
  const replayMarker = workpiece.indexOf("recovered_from_candidate_replay: true");
  const replayStart = workpiece.lastIndexOf('state === "candidate_committed" && isRecord(operation?.receipt_json)', replayMarker);
  const replayEnd = workpiece.indexOf("return operation.receipt_json as Record<string, Json>;", replayMarker);
  assert.ok(replayStart > 0 && replayEnd > replayStart);
  const replayBlock = workpiece.slice(replayStart, replayEnd);
  assert.match(replayBlock, /recordCanonicalSuccessForReconciliation\(/);
  assert.doesNotMatch(replayBlock, /reconcileSuccessfulExecution\(/, "candidate_committed replay path must not reconcile");
});
