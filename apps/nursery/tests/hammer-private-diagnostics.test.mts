import assert from "node:assert/strict";
import test from "node:test";

import {
  hammerCleanupCustomerFailure,
  instrumentHammerDiagnosticGate,
  toHammerPrivateDiagnostic,
  type HammerPrivateDiagnosticState,
} from "../scripts/mw-hammer-prep.ts";

function state(): HammerPrivateDiagnosticState {
  return {
    route: "hammer.transcript_cleanup",
    operation_id: "hammer-diagnostic-operation",
    quote_id: "00000000-0000-4000-8000-000000000001",
    request_fingerprint: "a".repeat(64),
    reservation_id: "00000000-0000-4000-8000-000000000002",
    stage: "paid_execution_context",
    rpc_name: null,
    sqlstate: null,
    safe_details: {},
    bounded_binding_created: false,
    aggregate_admission_created: false,
    provider_authorization_created: false,
    provider_transport_invoked: false,
    provider_submission_count: 0,
    last_error: null,
    rpc_failures: [],
  };
}

test("bounded-binding rejection stays private while preserving its safe cause", async () => {
  const capture = state();
  const gate = instrumentHammerDiagnosticGate({
    rpc: async () => ({ data: null, error: { message: "accepted request hash mismatch", code: "42501", details: "safe detail" } }),
  }, capture);
  await gate.rpc("bind_bounded_provider_request", {});
  const diagnostic = toHammerPrivateDiagnostic(capture, new Error("bind_bounded_provider_request: accepted request hash mismatch"));
  assert.equal(diagnostic.stage, "bounded_provider_request_binding");
  assert.equal(diagnostic.rpc_name, "bind_bounded_provider_request");
  assert.equal(diagnostic.sqlstate, "42501");
  assert.equal(diagnostic.provider_transport_invoked, false);
  assert.deepEqual(hammerCleanupCustomerFailure(), {
    ok: false,
    error: { code: "hammer_transcript_cleanup_failed", message: "Transcript cleanup could not be completed." },
  });
  assert.doesNotMatch(JSON.stringify(hammerCleanupCustomerFailure()), /hash mismatch|42501|safe detail/);
});

test("aggregate rejection records the authority reason without authorizing transport", async () => {
  const capture = state();
  const gate = instrumentHammerDiagnosticGate({
    rpc: async () => ({ data: { authorized: false, reason: "caller_not_permitted" }, error: null }),
  }, capture);
  await gate.rpc("acquire_openai_text_aggregate_admission", {});
  assert.equal(capture.stage, "aggregate_admission");
  assert.equal(capture.aggregate_admission_created, false);
  assert.deepEqual(capture.safe_details, { reason: "caller_not_permitted" });
  assert.equal(capture.provider_transport_invoked, false);
});

test("provider-authorization rejection remains distinct from aggregate admission", async () => {
  const capture = state();
  capture.aggregate_admission_created = true;
  const gate = instrumentHammerDiagnosticGate({
    rpc: async () => ({ data: { provider_execution_authorized: false, reason: "duplicate_attempt_blocked" }, error: null }),
  }, capture);
  await gate.rpc("authorize_openai_text_provider_attempt_with_aggregate", {});
  assert.equal(capture.stage, "provider_authorization");
  assert.equal(capture.aggregate_admission_created, true);
  assert.equal(capture.provider_authorization_created, false);
  assert.deepEqual(capture.safe_details, { reason: "duplicate_attempt_blocked" });
  assert.equal(capture.provider_transport_invoked, false);
});
