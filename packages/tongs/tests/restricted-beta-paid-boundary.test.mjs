import test from "node:test";
import assert from "node:assert/strict";
import { executeRestrictedBetaPaidBoundary, RESTRICTED_BETA_PAID_CAPABILITIES } from "../dist/providers/restricted-beta-paid-boundary.js";

const exact = (overrides = {}) => ({
  enrolled: true, policyState: "authorized", capability: "openai.text.hearth_research",
  operationIdentity: "operation-00000001", requestFingerprint: "a".repeat(64),
  opaqueFundingHandle: "opaque-server-handle-0001", fundingClass: "verified_customer_deposit",
  providerMode: "real", modelOrSku: "gpt-5.6-luna", attemptNumber: 1, maximumAttempts: 1,
  latestOutcome: "reserved", ...overrides,
});

test("inventory spans paid provider and continuing-cost families", () => {
  for (const capability of ["openai.image", "openai.audio", "runway.video", "brave.search", "huggingface.inference", "fly.transcode", "postmark.auth_email", "storage.persistence", "delivery.egress"]) {
    assert.ok(RESTRICTED_BETA_PAID_CAPABILITIES.includes(capability));
  }
});

test("inactive or non-enrolled policy preserves existing production behavior", async () => {
  let existing = 0;
  const value = await executeRestrictedBetaPaidBoundary({ admission: exact({ enrolled: false, policyState: "inactive" }), callerClass: "interactive", executeExisting: async () => ++existing, executeAuthorized: async () => 99 });
  assert.equal(value, 1); assert.equal(existing, 1);
});

test("enrolled uncovered paid action cannot fall back for UI or background callers", async () => {
  for (const callerClass of ["interactive", "background", "retry", "recovery"]) {
    let existing = 0;
    await assert.rejects(() => executeRestrictedBetaPaidBoundary({ admission: exact({ policyState: "blocked", reason: "coverage_missing" }), callerClass, executeExisting: async () => ++existing, executeAuthorized: async () => 99 }), /restricted_beta_capability_blocked/);
    assert.equal(existing, 0);
  }
});

test("authorized execution receives only the exact opaque server binding", async () => {
  let existing = 0;
  const value = await executeRestrictedBetaPaidBoundary({ admission: exact(), callerClass: "background", executeExisting: async () => ++existing, executeAuthorized: async (authorization) => authorization });
  assert.equal(existing, 0);
  assert.deepEqual(value, { operationIdentity: "operation-00000001", requestFingerprint: "a".repeat(64), opaqueFundingHandle: "opaque-server-handle-0001", callerClass: "background" });
});

test("verified funding can reach the shared provider path and BYO does not require Forge funding", async () => {
  assert.equal(await executeRestrictedBetaPaidBoundary({ admission: exact({ fundingClass: "verified_customer_deposit" }), callerClass: "interactive", executeExisting: async () => "legacy", executeAuthorized: async () => "provider" }), "provider");
  const byo = await executeRestrictedBetaPaidBoundary({ admission: exact({ fundingClass: "byo", providerMode: "byo" }), callerClass: "interactive", executeExisting: async () => "legacy", executeAuthorized: async () => "byo" });
  assert.equal(byo, "byo");
});

test("changed binding, exhausted attempts, and ambiguous submissions fail before transport", async () => {
  for (const admission of [exact({ requestFingerprint: "" }), exact({ attemptNumber: 2 }), exact({ latestOutcome: "ambiguous" }), exact({ latestOutcome: "supplier_obligation" })]) {
    let calls = 0;
    await assert.rejects(() => executeRestrictedBetaPaidBoundary({ admission, callerClass: "recovery", executeExisting: async () => "legacy", executeAuthorized: async () => { calls += 1; return "paid"; } }), /restricted_beta_(binding_invalid|retry_forbidden)/);
    assert.equal(calls, 0);
  }
});
