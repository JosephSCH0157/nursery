import assert from "node:assert/strict";
import test from "node:test";
import type { OwnerAuthorityReader, OwnerCostRpcGate } from "../server/accounting/forge-owner-execution-coordinator";
import {
  createOwnerHearthRunwayExecutionBoundary,
  HEARTH_OWNER_RUNWAY_RATE,
} from "../server/hearth/owner-hearth-runway-execution";

const USER_ID = "10000000-0000-4000-8000-000000000001";
const WORKSPACE_ID = "20000000-0000-4000-8000-000000000001";
const WORKPIECE_ID = "30000000-0000-4000-8000-000000000001";

type Attempt = {
  attempt_id: string;
  attempt_number: number;
  events: Array<Record<string, unknown>>;
  valuations: Array<Record<string, unknown>>;
};

class RunwayOwnerGate implements OwnerCostRpcGate {
  readonly calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  operation: Record<string, unknown> | null = null;
  attempts: Attempt[] = [];

  private attempt(id: unknown): Attempt {
    const attempt = this.attempts.find((value) => value.attempt_id === id);
    assert.ok(attempt);
    return attempt;
  }

  async rpc(name: string, rawArgs: Record<string, unknown> = {}) {
    const args = structuredClone(rawArgs);
    this.calls.push({ name, args });
    if (name === "read_financial_runtime_environment") {
      return { data: { financial_environment: "test" }, error: null };
    }
    if (name === "read_owner_cost_operation") {
      return {
        data: this.operation ? { operation: this.operation, attempts: this.attempts, links: [] } : null,
        error: null,
      };
    }
    if (name === "establish_owner_cost_operation") {
      this.operation ??= {
        operation_id: args.p_operation_id,
        operation_key: args.p_operation_key,
        request_fingerprint: args.p_request_fingerprint,
        created_at: args.p_created_at,
      };
      return { data: { operation_id: args.p_operation_id, replay: this.attempts.length > 0 }, error: null };
    }
    if (name === "authorize_owner_cost_provider_attempt") {
      let attempt = this.attempts.find((value) => value.attempt_id === args.p_attempt_id);
      if (!attempt) {
        attempt = {
          attempt_id: String(args.p_attempt_id),
          attempt_number: Number(args.p_attempt_number),
          events: [{ event_sequence: 1, lifecycle_state: "authorized" }],
          valuations: [],
        };
        this.attempts.push(attempt);
      }
      return { data: { attempt_id: attempt.attempt_id, replay: attempt.events.length > 1 }, error: null };
    }
    if (name === "append_owner_cost_attempt_event") {
      const attempt = this.attempt(args.p_attempt_id);
      const sequence = Number(args.p_event_sequence);
      const existing = attempt.events.find((event) => event.event_sequence === sequence);
      if (!existing) {
        attempt.events.push({
          attempt_event_id: args.p_attempt_event_id,
          event_sequence: sequence,
          lifecycle_state: args.p_lifecycle_state,
          provider_reference_id: args.p_provider_reference_id,
          normalized_usage_evidence: args.p_normalized_usage_evidence,
          private_provider_evidence: args.p_private_provider_evidence,
        });
      }
      return {
        data: {
          replay: Boolean(existing),
          provider_submission_created: !existing && args.p_lifecycle_state === "submitted",
        },
        error: null,
      };
    }
    if (name === "record_owner_cost_valuation") {
      const attempt = this.attempt(args.p_attempt_id);
      const existing = attempt.valuations.find((value) => value.valuation_id === args.p_valuation_id);
      if (!existing) attempt.valuations.push({ valuation_id: args.p_valuation_id, ...args });
      return {
        data: {
          valuation_id: args.p_valuation_id,
          journal_event_id: args.p_recognition_mode === "journal_recognized" ? args.p_valuation_id : null,
          replay: Boolean(existing),
        },
        error: null,
      };
    }
    throw new Error(`Unexpected RPC ${name}`);
  }
}

const ownerReader: OwnerAuthorityReader = {
  async readEnabledPrincipal() { return { revision: 1 }; },
  async readWorkspaceMembership() { return { role: "owner" }; },
};

function request(overrides: Partial<Parameters<ReturnType<typeof createOwnerHearthRunwayExecutionBoundary>["prepare"]>[0]> = {}) {
  return {
    authenticatedUserId: USER_ID,
    workspaceId: WORKSPACE_ID,
    workpieceId: WORKPIECE_ID,
    beatId: "beat-1",
    productOperationId: "runway-operation-1",
    promptRevisionId: "40000000-0000-4000-8000-000000000001",
    promptRevision: 1,
    promptContentHash: "a".repeat(64),
    model: "gen4.5" as const,
    durationSeconds: 5,
    ratio: "1280:720" as const,
    referenceImageCount: 0,
    exactProviderRequest: { prompt: "A forge at dusk", model: "gen4.5", duration_seconds: 5, ratio: "1280:720" },
    ...overrides,
  };
}

test("owner Runway authority fails closed without its isolated credential and never falls back", async () => {
  const gate = new RunwayOwnerGate();
  const boundary = createOwnerHearthRunwayExecutionBoundary({ gate, authorityReader: ownerReader });
  await assert.rejects(boundary.prepare(request()), /isolated Hearth owner Runway credential is unavailable/);
  assert.equal(gate.calls.length, 0);

  const nonOwner = createOwnerHearthRunwayExecutionBoundary({
    gate,
    credential: "owner-only-test-key",
    authorityReader: {
      async readEnabledPrincipal() { return null; },
      async readWorkspaceMembership() { return { role: "owner" }; },
    },
  });
  assert.equal(await nonOwner.prepare(request()), null);
  assert.equal(gate.calls.length, 0);
});

test("owner Runway rejects noncanonical shape before accounting or provider submission", async () => {
  const gate = new RunwayOwnerGate();
  const boundary = createOwnerHearthRunwayExecutionBoundary({ gate, authorityReader: ownerReader, credential: "owner-only-test-key" });
  await assert.rejects(boundary.prepare(request({ durationSeconds: 10 })), /restricted to one reference-free Gen-4.5/);
  await assert.rejects(boundary.prepare(request({ referenceImageCount: 1 })), /restricted to one reference-free Gen-4.5/);
  assert.equal(gate.calls.length, 0);
});

test("owner Runway records operation, authorization, and submitted evidence before returning provider authority", async () => {
  const gate = new RunwayOwnerGate();
  const boundary = createOwnerHearthRunwayExecutionBoundary({ gate, authorityReader: ownerReader, credential: "owner-only-test-key" });
  const prepared = await boundary.prepare(request());
  assert.ok(prepared);
  assert.equal(prepared.disposition, "submit");
  assert.deepEqual(gate.calls.map((call) => call.name), [
    "read_financial_runtime_environment",
    "read_owner_cost_operation",
    "establish_owner_cost_operation",
    "authorize_owner_cost_provider_attempt",
    "append_owner_cost_attempt_event",
  ]);
  const submitted = gate.calls.at(-1)!;
  assert.equal(submitted.args.p_lifecycle_state, "submitted");
  assert.equal(submitted.args.p_provider_reference_id, null);
  assert.equal((gate.calls.find((call) => call.name === "establish_owner_cost_operation")!.args.p_creation_evidence as Record<string, unknown>).customer_finance_involved, false);
});

test("accepted Runway task creates one journal-recognized valuation and replays without a second submission", async () => {
  const gate = new RunwayOwnerGate();
  const boundary = createOwnerHearthRunwayExecutionBoundary({ gate, authorityReader: ownerReader, credential: "owner-only-test-key" });
  const prepared = await boundary.prepare(request());
  assert.ok(prepared);
  await boundary.recordAccepted(prepared.context, "runway-task-1", { id: "runway-task-1" });

  const valuation = gate.calls.find((call) => call.name === "record_owner_cost_valuation")!;
  assert.equal(valuation.args.p_amount_micros, HEARTH_OWNER_RUNWAY_RATE.amountMicros);
  assert.equal(valuation.args.p_valuation_basis, "usage_calculated");
  assert.equal(valuation.args.p_recognition_mode, "journal_recognized");
  assert.equal((valuation.args.p_private_valuation_evidence as Record<string, unknown>).provider_rate_revision_id, HEARTH_OWNER_RUNWAY_RATE.revisionId);
  assert.equal((valuation.args.p_private_valuation_evidence as Record<string, unknown>).customer_finance_involved, false);
  assert.equal(gate.calls.some((call) => /quote|reservation|credit|spending|settlement|charge|stripe/i.test(call.name)), false);

  const replay = await boundary.prepare(request());
  assert.ok(replay);
  assert.equal(replay.disposition, "recover_task");
  assert.equal(replay.providerTaskId, "runway-task-1");
  assert.equal(gate.attempts.length, 1);
  assert.equal(gate.attempts[0].events.filter((event) => event.lifecycle_state === "submitted").length, 1);
});

test("owner Runway preserves unknown, rejection, failure, and canonical success lifecycle evidence", async () => {
  for (const [kind, expected] of [["unknown", "submission_unknown"], ["rejected", "definitively_rejected"]] as const) {
    const gate = new RunwayOwnerGate();
    const boundary = createOwnerHearthRunwayExecutionBoundary({ gate, authorityReader: ownerReader, credential: "owner-only-test-key" });
    const prepared = await boundary.prepare(request({ productOperationId: `operation-${kind}` }));
    assert.ok(prepared);
    if (kind === "unknown") await boundary.recordSubmissionUnknown(prepared.context, { transport: "ambiguous" });
    else await boundary.recordDefinitiveRejection(prepared.context, { status: 400 });
    assert.equal(gate.attempts[0].events.at(-1)?.lifecycle_state, expected);
    assert.equal(gate.attempts[0].valuations[0].p_recognition_mode, "evidence_only");
    assert.equal(gate.attempts[0].valuations[0].p_amount_micros, 0);
  }

  const gate = new RunwayOwnerGate();
  const boundary = createOwnerHearthRunwayExecutionBoundary({ gate, authorityReader: ownerReader, credential: "owner-only-test-key" });
  const prepared = await boundary.prepare(request({ productOperationId: "operation-terminal" }));
  assert.ok(prepared);
  await boundary.recordAccepted(prepared.context, "runway-task-terminal", { id: "runway-task-terminal" });
  await boundary.recordProviderFailure(prepared.context, "runway-task-terminal", { status: "FAILED" });
  assert.equal(gate.attempts[0].events.at(-1)?.lifecycle_state, "failed");

  const successGate = new RunwayOwnerGate();
  const successBoundary = createOwnerHearthRunwayExecutionBoundary({ gate: successGate, authorityReader: ownerReader, credential: "owner-only-test-key" });
  const success = await successBoundary.prepare(request({ productOperationId: "operation-success" }));
  assert.ok(success);
  await successBoundary.recordAccepted(success.context, "runway-task-success", { id: "runway-task-success" });
  await successBoundary.recordCanonicalSuccess(success.context, "runway-task-success", { candidate_committed: true });
  assert.equal(successGate.attempts[0].events.at(-1)?.lifecycle_state, "succeeded");
});
