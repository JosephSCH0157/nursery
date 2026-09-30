import assert from "node:assert/strict";
import test from "node:test";
import {
  ForgeOwnerExecutionCoordinator,
  type OwnerAuthorityReader,
  type OwnerCostRpcGate,
} from "../server/accounting/forge-owner-execution-coordinator";
import {
  createTongsCommitApiHandlerWithService,
  TongsCommitService,
} from "../../../packages/tongs/src/workpiece-commit-api";
import {
  createOwnerUnifiedVisualPlanExecutor,
  createOwnerUnifiedVisualPlanPreflight,
} from "../server/hearth/owner-unified-visual-plan-execution";

const USER_ID = "10000000-0000-4000-8000-000000000001";
const WORKSPACE_ID = "20000000-0000-4000-8000-000000000001";
const WORKPIECE_ID = "30000000-0000-4000-8000-000000000001";

type Attempt = {
  attempt_id: string;
  attempt_number: number;
  request_fingerprint: string;
  events: Array<Record<string, unknown>>;
  valuations: Array<Record<string, unknown>>;
};

class OwnerGate implements OwnerCostRpcGate {
  readonly calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  readonly operations = new Map<string, { operation: Record<string, unknown>; attempts: Attempt[] }>();
  readonly products = new Map<string, Record<string, unknown>>();
  failOwnerReservation = false;

  private attempt(id: unknown): Attempt | null {
    return [...this.operations.values()].flatMap((value) => value.attempts)
      .find((value) => value.attempt_id === id) ?? null;
  }

  async rpc(name: string, rawArgs: Record<string, unknown> = {}) {
    const args = structuredClone(rawArgs);
    this.calls.push({ name, args });
    if (name === "read_financial_runtime_environment") return { data: { financial_environment: "test" }, error: null };
    if (name === "read_credential_lifecycle_execution_gate") {
      return { data: { tracked: true, allowed: true, status: "active" }, error: null };
    }
    if (name === "read_owner_cost_operation") {
      const value = this.operations.get(String(args.p_operation_id));
      return { data: value ? { operation: value.operation, attempts: value.attempts, links: [] } : null, error: null };
    }
    if (name === "establish_owner_cost_operation") {
      const id = String(args.p_operation_id);
      if (!this.operations.has(id)) this.operations.set(id, {
        operation: { operation_id: id, operation_key: args.p_operation_key, request_fingerprint: args.p_request_fingerprint, created_at: args.p_created_at },
        attempts: [],
      });
      return { data: { operation_id: id, replay: false }, error: null };
    }
    if (name === "authorize_owner_cost_provider_attempt") {
      const operation = this.operations.get(String(args.p_operation_id));
      assert.ok(operation);
      let attempt = operation.attempts.find((value) => value.attempt_number === Number(args.p_attempt_number));
      if (!attempt) {
        attempt = {
          attempt_id: String(args.p_attempt_id),
          attempt_number: Number(args.p_attempt_number),
          request_fingerprint: String(args.p_request_fingerprint),
          events: [{ event_sequence: 1, lifecycle_state: "authorized", occurred_at: args.p_authorized_at }],
          valuations: [],
        };
        operation.attempts.push(attempt);
      }
      return { data: { attempt_id: attempt.attempt_id, authorized: attempt.events.length === 1, replay: attempt.events.length > 1 }, error: null };
    }
    if (name === "append_owner_cost_attempt_event") {
      const attempt = this.attempt(args.p_attempt_id);
      assert.ok(attempt);
      const sequence = Number(args.p_event_sequence);
      const existing = attempt.events.find((event) => event.event_sequence === sequence);
      if (!existing) attempt.events.push({
        event_sequence: sequence,
        lifecycle_state: args.p_lifecycle_state,
        private_provider_evidence: args.p_private_provider_evidence,
      });
      return { data: { replay: Boolean(existing), provider_submission_created: !existing && args.p_lifecycle_state === "submitted" }, error: null };
    }
    if (name === "record_owner_cost_valuation") {
      const attempt = this.attempt(args.p_attempt_id);
      assert.ok(attempt);
      if (!attempt.valuations.some((value) => value.valuation_id === args.p_valuation_id)) {
        attempt.valuations.push({ valuation_id: args.p_valuation_id, ...args });
      }
      return { data: { valuation_id: args.p_valuation_id, journal_event_id: args.p_valuation_id }, error: null };
    }
    if (name === "begin_owner_unified_visual_plan") {
      if (this.failOwnerReservation) return { data: null, error: { code: "23514", message: "canonical authority rejected" } };
      const operation = [...this.operations.values()].find((value) => value.attempts.some((attempt) => attempt.attempt_id === args.p_owner_cost_attempt_id));
      assert.ok(operation);
      const key = String(operation.operation.operation_key);
      if (!this.products.has(key)) this.products.set(key, {
        operation_id: key,
        operation_fingerprint: args.p_operation_fingerprint,
        owner_cost_attempt_id: args.p_owner_cost_attempt_id,
        state: "pending",
      });
      return { data: { disposition: "reserved", operation: this.products.get(key) }, error: null };
    }
    if (name === "record_unified_visual_plan_provider_response") {
      const row = this.products.get(String(args.p_operation_id));
      assert.ok(row);
      row.provider_response_json = args.p_provider_response_json;
      return { data: row, error: null };
    }
    if (name === "read_owner_unified_visual_plan_operation") {
      const row = [...this.products.values()].find((value) => value.owner_cost_attempt_id === args.p_owner_cost_attempt_id);
      return { data: row ?? null, error: null };
    }
    throw new Error(`Unexpected RPC ${name}`);
  }
}

const authorityReader: OwnerAuthorityReader = {
  async readTransitionAuthority(userId) { return {
    userId, canonicalUserId: userId, accountClass: "owner", accountAuthorityRevision: 1,
    accountAuthorityExplicit: true, legacyUserId: userId, legacyPrincipalStatus: "enabled",
    legacyPrincipalRevision: 1, sameUser: true, consistent: true, eligible: true,
    state: "eligible", authorityMode: "canonical_legacy_dual_read",
  }; },
  async readWorkspaceMembership() { return { role: "owner" }; },
};

function request(completeCanonical: (key: string) => Promise<Record<string, unknown>>) {
  return {
    authenticatedUserId: USER_ID,
    workspaceId: WORKSPACE_ID,
    workpieceId: WORKPIECE_ID,
    canonicalInputFingerprint: "a".repeat(64),
    normalizedInputs: { contract_version: "forge.unified-visual-plan.v3" },
    providerBody: { model: "gpt-5.6-luna", input: "canonical", max_output_tokens: 6144 },
    scriptText: "The prototype failed, and that failure changed the plan.",
    generationScope: "images_only" as const,
    sourceKeys: [],
    scriptApprovalId: "40000000-0000-4000-8000-000000000001",
    expectedImageRevisionId: null,
    expectedImageRevision: 0,
    expectedBrollRevisionId: null,
    expectedBrollRevision: 0,
    expectedReferenceRevisionId: null,
    expectedReferenceRevision: 0,
    expectedReferenceVisualRevisionId: null,
    expectedReferenceVisualRevision: 0,
    completeCanonical: async (key: string) => completeCanonical(key),
  };
}

const plan = {
  images: [{
    context_before: "",
    context_focus: "The prototype failed",
    context_after: "and that failure changed the plan.",
    description: "A visibly cracked prototype on a workbench.",
    visual_intent: "Show the concrete failure.",
    creator_direction: "",
    style: "documentary",
    placement_hint: "on the phrase",
    source_keys: [],
    source_relationship: "none",
    source_rationale: "No linked source is required.",
  }],
  broll: [],
  reference_clips: [],
  reference_visuals: [],
};

test("owner Unified Visual Plan reserves canonical authority before one paid submission and replays", async () => {
  const gate = new OwnerGate();
  let providerCalls = 0;
  let commits = 0;
  const executor = createOwnerUnifiedVisualPlanExecutor({
    gate,
    authorityReader,
    coordinator: new ForgeOwnerExecutionCoordinator({ gate, authorityReader }),
    credential: "isolated-owner-openai-key",
    runtimeEnvironment: "production",
    providerFetch: async (_url, init) => {
      providerCalls += 1;
      assert.equal(gate.calls.some((call) => call.name === "begin_owner_unified_visual_plan"), true);
      assert.equal((init?.headers as Record<string, string>).authorization, "Bearer isolated-owner-openai-key");
      return Response.json({
        id: "resp_owner_unified_1",
        model: "gpt-5.6-luna",
        output: [{ content: [{ type: "output_text", text: JSON.stringify(plan) }] }],
        usage: { input_tokens: 100, output_tokens: 50 },
      }, { headers: { "x-request-id": "request-owner-unified-1" } });
    },
  });
  const complete = async (key: string) => {
    commits += 1;
    const row = gate.products.get(key);
    assert.ok(row);
    row.state = "verified";
    row.receipt_json = { disposition: "verified", operation_id: key };
    return row.receipt_json as Record<string, unknown>;
  };

  const first = await executor(request(complete));
  const replay = await executor(request(complete));

  assert.equal(first?.disposition, "verified");
  assert.equal(replay?.disposition, "verified");
  assert.equal(providerCalls, 1);
  assert.equal(commits, 1);
  const operation = [...gate.operations.values()][0];
  assert.equal(operation.operation.operation_key, [...gate.products.keys()][0]);
  assert.match(String(operation.operation.operation_key), /^hearth:visual\.unified_plan:test:[0-9a-f]{64}$/);
  const attempt = operation.attempts[0]!;
  assert.deepEqual(attempt.events.map((event) => event.lifecycle_state), ["authorized", "submitted", "response_captured", "succeeded"]);
  assert.equal(attempt.valuations[0]?.p_valuation_basis, "usage_calculated");
  assert.equal(attempt.valuations[0]?.p_recognition_mode, "journal_recognized");
  assert.equal(attempt.valuations[0]?.p_amount_micros, 80);
  assert.equal(gate.calls.some((call) => /quote|reservation|settlement|customer|stripe/i.test(call.name)), false);
});

test("ordinary customer authority returns null before owner accounting", async () => {
  const gate = new OwnerGate();
  const denied: OwnerAuthorityReader = {
    async readTransitionAuthority(userId) { return {
      userId, canonicalUserId: null, accountClass: "customer", accountAuthorityRevision: null,
      accountAuthorityExplicit: false, legacyUserId: null, legacyPrincipalStatus: null,
      legacyPrincipalRevision: null, sameUser: true, consistent: true, eligible: false,
      state: "not_owner", authorityMode: "canonical_legacy_dual_read",
    }; },
    async readWorkspaceMembership() { return { role: "owner" }; },
  };
  const executor = createOwnerUnifiedVisualPlanExecutor({
    gate,
    authorityReader: denied,
    coordinator: new ForgeOwnerExecutionCoordinator({ gate, authorityReader: denied }),
    credential: "isolated-owner-openai-key",
    runtimeEnvironment: "production",
  });
  assert.equal(await executor(request(async () => ({}))), null);
  assert.equal(gate.calls.length, 0);
});

test("owner Unified Visual Plan preflight reaches admission without provider or accounting mutation", async () => {
  const gate = new OwnerGate();
  const preflight = createOwnerUnifiedVisualPlanPreflight({
    gate,
    authorityReader,
    credential: "isolated-owner-openai-key",
    runtimeEnvironment: "production",
  });
  const result = await preflight({
    authenticatedUserId: USER_ID,
    workspaceId: WORKSPACE_ID,
    workpieceId: WORKPIECE_ID,
  });
  assert.deepEqual(result, {
    ok: true,
    route_code: "visual.unified_plan",
    authenticated_identity: "verified",
    workspace_membership: "verified",
    owner_authority: "verified",
    credential_lifecycle: "allowed",
    provider_admission: "ready",
    provider_submission: false,
    financial_environment: "test",
    runtime_environment: "production",
  });
  assert.deepEqual(gate.calls.map((call) => call.name), [
    "read_financial_runtime_environment",
    "read_credential_lifecycle_execution_gate",
  ]);
  assert.equal(gate.operations.size, 0);
  assert.equal(gate.products.size, 0);
});

test("Visual Plan preflight requires a bearer and ignores forged client identity claims", async () => {
  const calls: Array<{ workpieceId: string; workspaceId: string; token: string | null | undefined }> = [];
  const service = {
    async preflightUnifiedVisualPlanOwnerAuthority(workpieceId: string, workspaceId: string, token: string | null | undefined) {
      calls.push({ workpieceId, workspaceId, token });
      return { ok: true, authenticated_identity: "verified" };
    },
  };
  const handler = createTongsCommitApiHandlerWithService(service as never);
  const url = `http://localhost/tongs/workpieces/${WORKPIECE_ID}/visual-plan-v2/preflight`;
  const forgedBody = {
    workspace_id: WORKSPACE_ID,
    user_id: USER_ID,
    account_class: "owner",
    owner_authorized: true,
  };
  const anonymous = await handler(new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(forgedBody),
  }));
  assert.equal(anonymous.status, 401);
  assert.equal(calls.length, 0);

  const authenticated = await handler(new Request(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forge-user-authorization": "Bearer fixture-token",
    },
    body: JSON.stringify(forgedBody),
  }));
  assert.equal(authenticated.status, 200);
  assert.deepEqual(calls, [{
    workpieceId: WORKPIECE_ID,
    workspaceId: WORKSPACE_ID,
    token: "fixture-token",
  }]);
});

test("server preflight derives identity through verified bearer membership before owner authority", async () => {
  const order: string[] = [];
  const fakeService = {
    async assertWorkpieceInWorkspace(workpieceId: string, workspaceId: string) {
      assert.equal(workpieceId, WORKPIECE_ID);
      assert.equal(workspaceId, WORKSPACE_ID);
      order.push("workpiece");
    },
    async assertWorkspaceRoleFromAccessToken(workspaceId: string, role: string, token: string) {
      assert.equal(workspaceId, WORKSPACE_ID);
      assert.equal(role, "editor");
      assert.equal(token, "fixture-token");
      order.push("verified_bearer_membership");
      return { userId: USER_ID, role: "owner" };
    },
    userClientFactory: () => ({}),
    async ownerUnifiedVisualPlanPreflight(input: Record<string, unknown>) {
      order.push("owner_authority");
      assert.deepEqual(input, {
        authenticatedUserId: USER_ID,
        workspaceId: WORKSPACE_ID,
        workpieceId: WORKPIECE_ID,
      });
      return { ok: true };
    },
  };
  const result = await TongsCommitService.prototype.preflightUnifiedVisualPlanOwnerAuthority.call(
    fakeService as never,
    WORKPIECE_ID,
    WORKSPACE_ID,
    "fixture-token",
  );
  assert.deepEqual(result, { ok: true });
  assert.deepEqual(order, ["workpiece", "verified_bearer_membership", "owner_authority"]);
});

test("runtime environment separates otherwise identical owner operations", async () => {
  const gate = new OwnerGate();
  let providerCalls = 0;
  const providerFetch = async () => {
    providerCalls += 1;
    return Response.json({ id: `resp_${providerCalls}`, model: "gpt-5.6-luna", output: [{ content: [{ text: JSON.stringify(plan) }] }], usage: { input_tokens: 1, output_tokens: 1 } });
  };
  for (const runtimeEnvironment of ["development", "production"] as const) {
    const executor = createOwnerUnifiedVisualPlanExecutor({
      gate,
      authorityReader,
      coordinator: new ForgeOwnerExecutionCoordinator({ gate, authorityReader }),
      credential: "isolated-owner-openai-key",
      runtimeEnvironment,
      providerFetch,
    });
    await executor(request(async (key) => {
      const row = gate.products.get(key)!;
      row.state = "verified";
      row.receipt_json = { disposition: "verified", operation_id: key };
      return row.receipt_json as Record<string, unknown>;
    }));
  }
  assert.equal(providerCalls, 2);
  assert.equal(gate.operations.size, 2);
});

test("canonical reservation failure is terminal failed evidence, never submission unknown", async () => {
  const gate = new OwnerGate();
  gate.failOwnerReservation = true;
  let providerCalls = 0;
  const executor = createOwnerUnifiedVisualPlanExecutor({
    gate,
    authorityReader,
    coordinator: new ForgeOwnerExecutionCoordinator({ gate, authorityReader }),
    credential: "isolated-owner-openai-key",
    runtimeEnvironment: "production",
    providerFetch: async () => {
      providerCalls += 1;
      return Response.json({});
    },
  });
  await assert.rejects(() => executor(request(async () => ({}))), /pre-submission authority failed/);
  assert.equal(providerCalls, 0);
  const attempt = [...gate.operations.values()][0]!.attempts[0]!;
  assert.deepEqual(attempt.events.map((event) => event.lifecycle_state), ["authorized", "submitted", "failed"]);
  assert.equal(attempt.events.some((event) => event.lifecycle_state === "submission_unknown"), false);
});
