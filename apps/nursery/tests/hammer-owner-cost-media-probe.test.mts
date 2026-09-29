import assert from "node:assert/strict";
import test from "node:test";
import {
  deriveHammerOwnerCostProbeIdentity,
  probeHammerSourceDeskMediaWithOwnerCost,
  resolveHammerSourceDeskAssetRole,
  type HammerOwnerCostRpcGate,
} from "../server/hammer/forge-owner-cost-media-probe";
import { ForgeFfmpegMediaProbeError } from "../server/forge-ffmpeg-client";

type RpcCall = { name: string; args: Record<string, unknown> };

function createGate(): {
  gate: HammerOwnerCostRpcGate;
  calls: RpcCall[];
  operations: Map<string, Record<string, unknown>>;
} {
  const calls: RpcCall[] = [];
  const operations = new Map<string, Record<string, unknown>>();
  const attempts = new Map<string, Record<string, unknown>>();
  const attemptByOperation = new Map<string, string>();
  const events = new Map<string, Array<Record<string, unknown>>>();
  const valuations = new Map<string, Record<string, unknown>>();
  const gate: HammerOwnerCostRpcGate = {
    async rpc(name, args = {}) {
      calls.push({ name, args });
      if (name === "read_financial_runtime_environment") {
        return { data: { financial_environment: "test" }, error: null };
      }
      if (name === "read_owner_cost_operation") {
        const operation = operations.get(String(args.p_operation_id));
        if (!operation) return { data: null, error: null };
        const attemptId = attemptByOperation.get(String(args.p_operation_id));
        const attempt = attemptId ? attempts.get(attemptId) : null;
        return {
          data: {
            operation,
            attempts: attempt ? [{
              ...attempt,
              events: events.get(attemptId!) ?? [],
              valuations: [...valuations.values()].filter((row) => row.attempt_id === attemptId),
            }] : [],
            links: [],
          },
          error: null,
        };
      }
      if (name === "establish_owner_cost_operation") {
        const operationId = String(args.p_operation_id);
        const existing = operations.get(operationId);
        if (existing) {
          if (existing.request_fingerprint !== args.p_request_fingerprint) {
            return { data: null, error: { message: "owner-cost operation replay conflict", code: "23505" } };
          }
          return { data: { operation_id: operationId, replay: true }, error: null };
        }
        operations.set(operationId, {
          operation_id: operationId,
          request_fingerprint: args.p_request_fingerprint,
          created_at: args.p_created_at,
          originating_tool: args.p_originating_tool,
          operation_type: args.p_operation_type,
          creation_evidence: args.p_creation_evidence,
        });
        return { data: { operation_id: operationId, replay: false }, error: null };
      }
      if (name === "authorize_owner_cost_provider_attempt") {
        const attemptId = String(args.p_attempt_id);
        if (!attempts.has(attemptId)) {
          attempts.set(attemptId, {
            attempt_id: attemptId,
            operation_id: args.p_operation_id,
            attempt_number: args.p_attempt_number,
            provider: args.p_provider,
            service: args.p_service,
          });
          attemptByOperation.set(String(args.p_operation_id), attemptId);
          events.set(attemptId, [{
            attempt_event_id: attemptId,
            attempt_id: attemptId,
            event_sequence: 1,
            lifecycle_state: "authorized",
          }]);
          return { data: { attempt_id: attemptId, authorized: true, replay: false }, error: null };
        }
        return { data: { attempt_id: attemptId, authorized: false, replay: true }, error: null };
      }
      if (name === "append_owner_cost_attempt_event") {
        const attemptId = String(args.p_attempt_id);
        const rows = events.get(attemptId) ?? [];
        const sequence = Number(args.p_event_sequence);
        const existing = rows.find((row) => row.event_sequence === sequence);
        if (existing) {
          return { data: { attempt_event_id: existing.attempt_event_id, replay: true, provider_submission_created: false }, error: null };
        }
        rows.push({
          attempt_event_id: args.p_attempt_event_id,
          attempt_id: attemptId,
          event_sequence: sequence,
          lifecycle_state: args.p_lifecycle_state,
          provider_reference_id: args.p_provider_reference_id,
          normalized_usage_evidence: args.p_normalized_usage_evidence,
          private_provider_evidence: args.p_private_provider_evidence,
        });
        events.set(attemptId, rows);
        return {
          data: {
            attempt_event_id: args.p_attempt_event_id,
            replay: false,
            provider_submission_created: args.p_lifecycle_state === "submitted",
          },
          error: null,
        };
      }
      if (name === "record_owner_cost_valuation") {
        const valuationId = String(args.p_valuation_id);
        valuations.set(valuationId, {
          valuation_id: valuationId,
          attempt_id: args.p_attempt_id,
          ...args,
        });
        return { data: { valuation_id: valuationId, journal_event_id: null, replay: false }, error: null };
      }
      return { data: null, error: { message: `Unexpected RPC ${name}` } };
    },
  };
  return { gate, calls, operations };
}

const client = {
  baseUrl: "https://forge-ffmpeg.example.test",
  callerId: "netlify" as const,
  serviceToken: `test-token-${"x".repeat(32)}`,
  timeoutMs: 1_000,
  maxAttempts: 1,
  retryDelayMs: 1,
};
const sourceBytes = new Uint8Array([0, 0, 0, 20, 0x66, 0x74, 0x79, 0x70, 1, 2, 3, 4]);
const context = {
  workspaceId: "10000000-0000-4000-8000-000000000001",
  workpieceId: "10000000-0000-4000-8000-000000000002",
  path: "assets/uploads/introoutro/workspace-default-intro.mp4",
  sourceAssetId: "10000000-0000-4000-8000-000000000003",
  contentType: "video/mp4",
};
const fixedNow = () => new Date("2026-09-29T12:00:00.000Z");
const successfulProbe = async () => ({
  width: 1920,
  height: 1080,
  durationMs: 3_250,
  hasAudio: true,
  requestId: "fly_req_123",
  responseStatus: 200,
  elapsedMs: 47,
  responseBytes: 144,
});

test("intro/outro roles and logical probe identities are deterministic", () => {
  assert.equal(resolveHammerSourceDeskAssetRole(context.path), "intro");
  assert.equal(resolveHammerSourceDeskAssetRole("assets/uploads/introoutro/workspace-default-outro.webm"), "outro");
  assert.equal(resolveHammerSourceDeskAssetRole("assets/uploads/introoutro/123-opening.mp4"), "introoutro_upload");
  const first = deriveHammerOwnerCostProbeIdentity({ financialEnvironment: "test", sourceBytes, context });
  const replay = deriveHammerOwnerCostProbeIdentity({ financialEnvironment: "test", sourceBytes, context });
  const outro = deriveHammerOwnerCostProbeIdentity({
    financialEnvironment: "test",
    sourceBytes,
    context: { ...context, path: "assets/uploads/introoutro/workspace-default-outro.mp4" },
  });
  const directUploadA = deriveHammerOwnerCostProbeIdentity({
    financialEnvironment: "test",
    sourceBytes,
    context: { ...context, path: "assets/uploads/introoutro/1000-intro.mp4", sourceAssetId: null },
  });
  const directUploadB = deriveHammerOwnerCostProbeIdentity({
    financialEnvironment: "test",
    sourceBytes,
    context: { ...context, path: "assets/uploads/introoutro/2000-intro-copy.mp4", sourceAssetId: null },
  });
  assert.deepEqual(first, replay);
  assert.notEqual(first.operationId, outro.operationId);
  assert.equal(directUploadA.operationId, directUploadB.operationId);
  assert.equal(directUploadA.requestFingerprint, directUploadB.requestFingerprint);
});

test("provider submission follows durable operation/attempt and exact replay recovers without Fly", async () => {
  const state = createGate();
  let providerCalls = 0;
  const probe = async (..._args: Parameters<typeof successfulProbe>) => {
    providerCalls += 1;
    const names = state.calls.map((call) => call.name);
    assert(names.includes("establish_owner_cost_operation"));
    assert(names.includes("authorize_owner_cost_provider_attempt"));
    assert.equal(names.at(-1), "append_owner_cost_attempt_event");
    assert.equal(state.calls.at(-1)?.args.p_lifecycle_state, "submitted");
    return successfulProbe();
  };
  const first = await probeHammerSourceDeskMediaWithOwnerCost({
    gate: state.gate, client, sourceBytes, context, probe, now: fixedNow,
  });
  const replay = await probeHammerSourceDeskMediaWithOwnerCost({
    gate: state.gate, client, sourceBytes, context, probe, now: () => new Date("2026-10-01T00:00:00Z"),
  });
  assert.equal(providerCalls, 1);
  assert.equal(replay.ownerCostOperationId, first.ownerCostOperationId);
  assert.equal(replay.requestId, "fly_req_123");
  const lifecycle = state.calls
    .filter((call) => call.name === "append_owner_cost_attempt_event")
    .map((call) => call.args.p_lifecycle_state);
  assert.deepEqual(lifecycle.slice(0, 3), ["submitted", "response_captured", "succeeded"]);
  const response = state.calls.find((call) => call.args.p_lifecycle_state === "response_captured")!;
  assert.equal(response.args.p_provider_reference_id, "fly_req_123");
  assert.equal((response.args.p_normalized_usage_evidence as Record<string, unknown>).input_bytes, sourceBytes.byteLength);
  const valuation = state.calls.find((call) => call.name === "record_owner_cost_valuation")!;
  assert.equal(valuation.args.p_recognition_mode, "evidence_only");
  assert.equal(valuation.args.p_amount_micros, 0);
  assert.equal(valuation.args.p_valuation_basis, "estimated");
});

test("same logical key with a conflicting MIME fingerprint fails closed", async () => {
  const state = createGate();
  let providerCalls = 0;
  const probe = async () => { providerCalls += 1; return successfulProbe(); };
  await probeHammerSourceDeskMediaWithOwnerCost({ gate: state.gate, client, sourceBytes, context, probe, now: fixedNow });
  await assert.rejects(
    () => probeHammerSourceDeskMediaWithOwnerCost({
      gate: state.gate,
      client,
      sourceBytes,
      context: { ...context, contentType: "video/webm" },
      probe,
      now: fixedNow,
    }),
    /owner-cost operation replay conflict/,
  );
  assert.equal(providerCalls, 1);
});

test("network ambiguity is durable and browser/default replay cannot resubmit", async () => {
  const state = createGate();
  let providerCalls = 0;
  const ambiguousProbe = async () => {
    providerCalls += 1;
    throw new ForgeFfmpegMediaProbeError({
      message: "timed out",
      outcome: "submission_unknown",
      elapsedMs: 1_000,
    });
  };
  await assert.rejects(
    () => probeHammerSourceDeskMediaWithOwnerCost({
      gate: state.gate, client, sourceBytes, context, probe: ambiguousProbe, now: fixedNow,
    }),
    /timed out/,
  );
  await assert.rejects(
    () => probeHammerSourceDeskMediaWithOwnerCost({
      gate: state.gate, client, sourceBytes, context, probe: ambiguousProbe, now: fixedNow,
    }),
    /cannot be resubmitted safely/,
  );
  assert.equal(providerCalls, 1);
  assert(state.calls.some((call) => call.args.p_lifecycle_state === "submission_unknown"));
});

test("definitive Fly rejection and successful evidence survive the user-visible result", async () => {
  const rejected = createGate();
  await assert.rejects(
    () => probeHammerSourceDeskMediaWithOwnerCost({
      gate: rejected.gate,
      client,
      sourceBytes,
      context,
      now: fixedNow,
      probe: async () => { throw new ForgeFfmpegMediaProbeError({
        message: "unsupported container",
        outcome: "definitively_rejected",
        requestId: "fly_req_rejected",
        responseStatus: 415,
        responseBytes: 88,
        elapsedMs: 9,
      }); },
    }),
    /unsupported container/,
  );
  const rejection = rejected.calls.find((call) => call.args.p_lifecycle_state === "definitively_rejected")!;
  assert.equal(rejection.args.p_provider_reference_id, "fly_req_rejected");

  const completed = createGate();
  const result = await probeHammerSourceDeskMediaWithOwnerCost({
    gate: completed.gate, client, sourceBytes, context, probe: successfulProbe, now: fixedNow,
  });
  assert.equal(result.requestId, "fly_req_123");
  assert.throws(() => { throw new Error("later Source Desk registration failed"); });
  const readback = await completed.gate.rpc("read_owner_cost_operation", { p_operation_id: result.ownerCostOperationId });
  const attempts = (readback.data as { attempts: Array<{ events: Array<Record<string, unknown>> }> }).attempts;
  assert(attempts[0]!.events.some((event) => event.provider_reference_id === "fly_req_123"));
});

test("Hammer owner-cost RPC payloads contain no customer-finance semantics", async () => {
  const state = createGate();
  await probeHammerSourceDeskMediaWithOwnerCost({
    gate: state.gate, client, sourceBytes, context, probe: successfulProbe, now: fixedNow,
  });
  const serialized = JSON.stringify(state.calls).toLowerCase();
  for (const prohibited of [
    "customer_credit", "quote", "spending_acceptance", "funding_reservation",
    "customer_settlement", "customer_charge", "stripe", "markup", "byo",
  ]) {
    assert.equal(serialized.includes(prohibited), false, `unexpected customer-finance token: ${prohibited}`);
  }
});
