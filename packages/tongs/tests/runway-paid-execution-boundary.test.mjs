import test from "node:test";
import assert from "node:assert/strict";
import { SupabaseRunwayPaidExecutionBoundary } from "../dist/providers/runway-paid-execution-boundary.js";

const input = {
  operationId: "forge:broll:paid-boundary-test-0001",
  operationFingerprint: "a".repeat(64),
  submissionAttemptId: "attempt-paid-boundary-0001",
  userId: "11111111-1111-4111-8111-111111111111",
  workspaceId: "22222222-2222-4222-8222-222222222222",
  model: "gen4.5",
  durationSeconds: 5,
  ratio: "1280:720",
};

test("Runway boundary resolves exact operation funding before legacy accounting", async () => {
  const calls = [];
  const boundary = new SupabaseRunwayPaidExecutionBoundary({
    async rpc(name, args) {
      calls.push({ name, args });
      return {
        data: {
          mode: "enforce",
          rollout_revision: 2,
          shared_funding_ready: true,
          use_legacy_accounting: false,
          reason: "owner_budget_reserved",
          reservation_id: "33333333-3333-4333-8333-333333333333",
          funding_source_type: "owner_budget",
        },
        error: null,
      };
    },
  });
  const operation = {
    operationId: input.operationId,
    operationFingerprint: input.operationFingerprint,
    userId: input.userId,
    workspaceId: input.workspaceId,
    model: input.model,
    durationSeconds: input.durationSeconds,
    ratio: input.ratio,
  };
  const result = await boundary.resolveOperationFunding(operation);
  assert.equal(result.sharedFundingReady, true);
  assert.equal(result.useLegacyAccounting, false);
  assert.equal(result.fundingSourceType, "owner_budget");
  assert.deepEqual(calls[0], {
    name: "resolve_runway_execution_funding",
    args: {
      p_operation_id: input.operationId,
      p_operation_fingerprint: input.operationFingerprint,
      p_user_id: input.userId,
      p_workspace_id: input.workspaceId,
      p_model: "gen4.5",
      p_duration_seconds: 5,
      p_ratio: "1280:720",
    },
  });
});

test("Runway boundary preserves the database cutover decision and exact SKU identity", async () => {
  const calls = [];
  const boundary = new SupabaseRunwayPaidExecutionBoundary({
    async rpc(name, args) {
      calls.push({ name, args });
      return {
        data: {
          mode: "enforce",
          rollout_revision: 2,
          provider_execution_authorized: true,
          legacy_execution_allowed: false,
          reason: "owner_budget_authorized",
          replay: false,
          reservation_id: "33333333-3333-4333-8333-333333333333",
          funding_source_type: "owner_budget",
        },
        error: null,
      };
    },
  });
  const result = await boundary.authorizeSubmission(input);
  assert.equal(result.providerExecutionAuthorized, true);
  assert.equal(result.legacyExecutionAllowed, false);
  assert.equal(result.fundingSourceType, "owner_budget");
  assert.deepEqual(calls[0], {
    name: "authorize_runway_submission_with_aggregate",
    args: {
      p_operation_id: input.operationId,
      p_operation_fingerprint: input.operationFingerprint,
      p_submission_attempt_id: input.submissionAttemptId,
      p_user_id: input.userId,
      p_workspace_id: input.workspaceId,
      p_model: "gen4.5",
      p_duration_seconds: 5,
      p_ratio: "1280:720",
      p_caller_class: "interactive",
      p_evidence_json: {
        boundary: "tongs_broll_v2",
        provider: "runway",
        model: "gen4.5",
        duration_seconds: 5,
        ratio: "1280:720",
      },
    },
  });
});

test("ambiguous and definitive failures update the same funded reservation", async () => {
  const calls = [];
  const boundary = new SupabaseRunwayPaidExecutionBoundary({
    async rpc(name, args) {
      calls.push({ name, args });
      return { data: {}, error: null };
    },
  });
  const authorization = {
    mode: "enforce",
    rolloutRevision: 2,
    providerExecutionAuthorized: true,
    legacyExecutionAllowed: false,
    reason: "owner_budget_authorized",
    replay: false,
    reservationId: "33333333-3333-4333-8333-333333333333",
    fundingSourceType: "owner_budget",
  };
  await boundary.markSubmissionUnknown(authorization, input, { transmitted: "unknown" });
  await boundary.recordDefinitiveRejection(authorization, input, { transmitted: true, http_status: 400 });
  assert.deepEqual(calls.map((call) => call.name), [
    "mark_submission_unknown",
    "record_paid_operation_aggregate_outcome",
    "record_provider_failure",
    "release_operation",
    "record_paid_operation_aggregate_outcome",
  ]);
  assert.ok(calls.every((call) => call.args.p_reservation_id === authorization.reservationId));
});

test("completed and failed tasks are retained for cost reconciliation without estimating support expense", async () => {
  const calls = [];
  const boundary = new SupabaseRunwayPaidExecutionBoundary({
    async rpc(name, args) {
      calls.push({ name, args });
      if (name === "resolve_runway_execution_funding") return { data: {
        mode: "enforce", rollout_revision: 2, shared_funding_ready: false,
        use_legacy_accounting: false, reason: "reconciliation_only",
        reservation_id: "33333333-3333-4333-8333-333333333333",
        funding_source_type: "owner_budget",
      }, error: null };
      return { data: { recorded: true }, error: null };
    },
  });
  await boundary.recordCompletionForReconciliation(input, "runway-task-1", { status: "SUCCEEDED" });
  await boundary.recordProviderFailure(input, "runway-task-2", { status: "FAILED" });
  assert.deepEqual(calls.map((call) => call.name), [
    "record_runway_completion_for_reconciliation",
    "record_runway_failure_for_reconciliation",
    "resolve_runway_execution_funding",
    "settle_owner_operation",
    "record_paid_operation_aggregate_outcome",
  ]);
  assert.ok(calls.every((call) => !("p_supporting_actual_micros" in call.args)));
});
