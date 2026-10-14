import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import {
  EXACT_TARGET,
  connectedPreflightSql,
  executeExactTargetReconciliation,
  loadExactTargetEvidence,
  validateConnectedPreflight,
  validateRawEvidence,
} from "./lib/hammer-6c-exact-target-reconciliation.mjs";

const root = resolve(import.meta.dirname, "..");
const evidenceDirectory = resolve(root, ".git/forge-private-evidence/hammer-6c-supplier-evidence-run-38582959657");

async function rawEvidence() {
  return JSON.parse(await readFile(resolve(evidenceDirectory, "raw-openai-evidence.json"), "utf8"));
}

function connectedState(overrides = {}) {
  return {
    migration_count: 1,
    batch_id_count: 0,
    source_key_count: 0,
    candidate_count: 1,
    candidate_expense_ids: [EXACT_TARGET.supplierExpenseId],
    candidate_reservation_ids: [EXACT_TARGET.reservationId],
    candidate_input_tokens: 118,
    candidate_cached_input_tokens: 0,
    candidate_output_tokens: 35,
    candidate_request_count: 1,
    target: {
      id: EXACT_TARGET.supplierExpenseId,
      reservation_id: EXACT_TARGET.reservationId,
      route_code: "hammer.transcript_cleanup",
      runtime_model: EXACT_TARGET.runtimeModel,
      credential_funding: "forge",
      operation_id: `${EXACT_TARGET.operationPrefix}:transcript-cleanup`,
      amount_micros: 246,
      evidence_status: "estimated",
      obligation_status: "open",
      reserved_customer_charge_micros: 0,
      input_units: 118,
      cached_input_units: 0,
      output_units: 35,
      provider_reported: true,
      result_validated: true,
      canonical_persistence_confirmed: true,
      recorded_at: "2026-10-07T08:38:25.000Z",
    },
    verified_zero_support: true,
    owner_consumption_count: 1,
    owner_consumption_micros: 246,
    owner_expense_journal_micros: 246,
    cash_clearing_journal_micros: -246,
    customer_charge_micros: 0,
    latest_exposure_micros: 249,
    existing_allocations: 0,
    existing_supplier_adjustments: 0,
    existing_obligation_settlements: 0,
    existing_budget_adjustments: 0,
    ...overrides,
  };
}

test("loads only the exact preserved evidence and retains deterministic identities", async () => {
  const originalFetch = globalThis.fetch;
  let providerCalls = 0;
  globalThis.fetch = async () => {
    providerCalls += 1;
    throw new Error("network forbidden");
  };
  try {
    const { evidence } = await loadExactTargetEvidence({ evidenceDirectory });
    assert.equal(providerCalls, 0);
    assert.equal(evidence.batchId, "d7a8ef3e-9722-45d2-8451-a97d87898535");
    assert.equal(evidence.sourceKey, "openai-costs:1791331200:1791417600:d7a8ef3e972295d2b451a97d87898535b17a6887be2428c06e880b6c80cdf089");
    assert.equal(evidence.totalCostMicros, 0);
    assert.deepEqual(evidence.usageBuckets.map(({ model, input_tokens, cached_input_tokens, output_tokens, request_count, evidence: bucketEvidence }) => ({
      model, input_tokens, cached_input_tokens, output_tokens, request_count, service_tier: bucketEvidence.service_tier,
    })), [{
      model: EXACT_TARGET.providerSnapshot,
      input_tokens: 118,
      cached_input_tokens: 0,
      output_tokens: 35,
      request_count: 1,
      service_tier: "incentivized-tier",
    }]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("altered, incomplete, or duplicate supplier evidence fails closed", async () => {
  const source = await rawEvidence();
  const variants = [
    (copy) => { copy.usage_pages[0].response.raw_body = copy.usage_pages[0].response.raw_body.replace("incentivized-tier", "standard"); },
    (copy) => { const payload = JSON.parse(copy.usage_pages[0].response.raw_body); payload.data.pop(); copy.usage_pages[0].response.raw_body = JSON.stringify(payload); },
    (copy) => { const payload = JSON.parse(copy.usage_pages[0].response.raw_body); payload.data.push(payload.data[0]); copy.usage_pages[0].response.raw_body = JSON.stringify(payload); },
    (copy) => { const payload = JSON.parse(copy.cost_pages[0].response.raw_body); payload.has_more = true; payload.next_page = "unexpected"; copy.cost_pages[0].response.raw_body = JSON.stringify(payload); },
  ];
  for (const mutate of variants) {
    const copy = structuredClone(source);
    mutate(copy);
    assert.throws(() => validateRawEvidence(copy), /hammer_6c_exact_target_/);
  }
});

test("connected preflight is read-only and rejects ambiguity or changed state", async () => {
  const { evidence } = await loadExactTargetEvidence({ evidenceDirectory });
  const sql = connectedPreflightSql(evidence);
  assert.match(sql, /^with candidates as \(/);
  assert.doesNotMatch(sql, /\b(insert|update|delete|call|create|alter|drop|truncate)\b/i);
  assert.equal(validateConnectedPreflight(connectedState(), evidence), true);
  assert.throws(() => validateConnectedPreflight(connectedState({ candidate_count: 2 }), evidence), /candidate_set_changed/);
  assert.throws(() => validateConnectedPreflight(connectedState({ existing_allocations: 1 }), evidence), /target_already_reconciled/);
  assert.throws(() => validateConnectedPreflight(connectedState({ latest_exposure_micros: 250 }), evidence), /financial_precondition_changed/);
});

test("write path is unavailable without exact authorization and only reaches the supported RPC", async () => {
  const { evidence } = await loadExactTargetEvidence({ evidenceDirectory });
  let calls = 0;
  const fetchImpl = async (url, options) => {
    calls += 1;
    assert.equal(url, "https://example.invalid/rest/v1/rpc/record_openai_organization_reconciliation");
    assert.equal(options.method, "POST");
    assert.equal(options.headers["content-profile"], "tongs");
    const payload = JSON.parse(options.body);
    assert.equal(payload.p_batch_id, evidence.batchId);
    assert.equal(payload.p_source_key, evidence.sourceKey);
    assert.equal(payload.p_total_cost_micros, 0);
    assert.equal(payload.p_usage_buckets[0].evidence.service_tier, "incentivized-tier");
    return { ok: true, json: async () => ({ allocation_status: "defensibly_allocated" }) };
  };
  await assert.rejects(executeExactTargetReconciliation({
    evidence, fetchImpl, supabaseUrl: "https://example.invalid", serviceRoleKey: "not-a-real-secret", authorization: "denied",
  }), /write_not_authorized/);
  assert.equal(calls, 0);
  const result = await executeExactTargetReconciliation({
    evidence,
    fetchImpl,
    supabaseUrl: "https://example.invalid",
    serviceRoleKey: "not-a-real-secret",
    authorization: `owner-authorized:${evidence.batchId}:${EXACT_TARGET.supplierExpenseId}`,
  });
  assert.equal(calls, 1);
  assert.equal(result.allocation_status, "defensibly_allocated");
});
