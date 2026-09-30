import assert from "node:assert/strict";
import test from "node:test";
import {
  ForgeOwnerAuthorizationError,
  ForgeOwnerExecutionCoordinator,
  ForgeOwnerExecutionFailure,
  ForgeOwnerProviderBoundaryError,
  deriveForgeOwnerOperationIdentity,
  forgeOwnerSha256,
  requireForgeOwnerExecutionAuthority,
  type ForgeOwnerExecutionInput,
  type OwnerAuthorityReader,
  type OwnerCostRpcGate,
} from "../server/accounting/forge-owner-execution-coordinator";

const ownerId = "10000000-0000-4000-8000-000000000001";
const workspaceId = "20000000-0000-4000-8000-000000000001";
const workpieceId = "30000000-0000-4000-8000-000000000001";
const credentialIdentityHash = forgeOwnerSha256("test-only-forge-credential");

type StoredAttempt = {
  attempt_id: string;
  attempt_number: number;
  payload: string;
  events: Array<Record<string, unknown>>;
  valuations: Array<Record<string, unknown>>;
};

type StoredOperation = {
  operation_id: string;
  operation_key: string;
  request_fingerprint: string;
  created_at: string;
  payload: string;
  attempts: StoredAttempt[];
};

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

class MemoryOwnerCostGate implements OwnerCostRpcGate {
  readonly calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  readonly operations = new Map<string, StoredOperation>();
  readonly journalValuations: string[] = [];
  financialEnvironment: "test" | "live" = "test";

  async rpc(name: string, rawArgs: Record<string, unknown> = {}) {
    const args = structuredClone(rawArgs);
    this.calls.push({ name, args });
    if (name === "read_financial_runtime_environment") {
      return { data: { financial_environment: this.financialEnvironment }, error: null };
    }
    if (name === "read_owner_cost_operation") {
      const operation = this.operations.get(String(args.p_operation_id));
      return {
        data: operation
          ? { operation: { ...operation, attempts: undefined }, attempts: operation.attempts, links: [] }
          : null,
        error: null,
      };
    }
    if (name === "establish_owner_cost_operation") {
      const operationId = String(args.p_operation_id);
      const operationKey = String(args.p_operation_key);
      const comparable = JSON.stringify(args);
      const byKey = [...this.operations.values()].find((entry) => entry.operation_key === operationKey);
      const existing = this.operations.get(operationId) ?? byKey;
      if (existing) {
        if (existing.operation_id !== operationId || existing.payload !== comparable) {
          return { data: null, error: { message: "owner-cost operation replay conflict", code: "23505" } };
        }
        return { data: { operation_id: operationId, replay: true }, error: null };
      }
      this.operations.set(operationId, {
        operation_id: operationId,
        operation_key: operationKey,
        request_fingerprint: String(args.p_request_fingerprint),
        created_at: String(args.p_created_at),
        payload: comparable,
        attempts: [],
      });
      return { data: { operation_id: operationId, replay: false }, error: null };
    }
    if (name === "authorize_owner_cost_provider_attempt") {
      const operation = this.operations.get(String(args.p_operation_id));
      if (!operation) return { data: null, error: { message: "operation missing", code: "23503" } };
      const attemptId = String(args.p_attempt_id);
      const attemptNumber = Number(args.p_attempt_number);
      const comparable = JSON.stringify(args);
      const existing = operation.attempts.find((attempt) => attempt.attempt_id === attemptId || attempt.attempt_number === attemptNumber);
      if (existing) {
        if (existing.attempt_id !== attemptId || existing.payload !== comparable) {
          return { data: null, error: { message: "owner-cost provider attempt replay conflict", code: "23505" } };
        }
        return { data: { attempt_id: attemptId, authorized: false, replay: true }, error: null };
      }
      operation.attempts.push({
        attempt_id: attemptId,
        attempt_number: attemptNumber,
        payload: comparable,
        events: [{
          attempt_event_id: attemptId,
          event_sequence: 1,
          lifecycle_state: "authorized",
          occurred_at: args.p_authorized_at,
        }],
        valuations: [],
      });
      return { data: { attempt_id: attemptId, authorized: true, replay: false }, error: null };
    }
    if (name === "append_owner_cost_attempt_event") {
      const attempt = [...this.operations.values()].flatMap((operation) => operation.attempts)
        .find((entry) => entry.attempt_id === args.p_attempt_id);
      if (!attempt) return { data: null, error: { message: "attempt missing", code: "23503" } };
      const sequence = Number(args.p_event_sequence);
      const existing = attempt.events.find((event) => event.event_sequence === sequence);
      if (existing) {
        return {
          data: {
            attempt_event_id: existing.attempt_event_id,
            replay: true,
            provider_submission_created: false,
          },
          error: null,
        };
      }
      const event = {
        attempt_event_id: args.p_attempt_event_id,
        event_sequence: sequence,
        lifecycle_state: args.p_lifecycle_state,
        provider_reference_id: args.p_provider_reference_id,
        normalized_usage_evidence: args.p_normalized_usage_evidence,
        private_provider_evidence: args.p_private_provider_evidence,
        occurred_at: args.p_occurred_at,
      };
      attempt.events.push(event);
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
      const attempt = [...this.operations.values()].flatMap((operation) => operation.attempts)
        .find((entry) => entry.attempt_id === args.p_attempt_id);
      if (!attempt) return { data: null, error: { message: "attempt missing", code: "23503" } };
      const existing = attempt.valuations.find((valuation) => valuation.valuation_id === args.p_valuation_id);
      if (!existing) {
        attempt.valuations.push({
          valuation_id: args.p_valuation_id,
          cost_component: args.p_cost_component,
          valuation_basis: args.p_valuation_basis,
          amount_micros: args.p_amount_micros,
          currency: args.p_currency,
          recognition_mode: args.p_recognition_mode,
          normalized_usage_evidence: args.p_normalized_usage_evidence,
          private_valuation_evidence: args.p_private_valuation_evidence,
        });
        if (args.p_recognition_mode === "journal_recognized") {
          this.journalValuations.push(String(args.p_valuation_id));
        }
      }
      return {
        data: {
          valuation_id: args.p_valuation_id,
          journal_event_id: args.p_recognition_mode === "journal_recognized" ? args.p_valuation_id : null,
          replay: Boolean(existing),
        },
        error: null,
      };
    }
    throw new Error(`Unexpected RPC: ${name}`);
  }
}

function authorityReader(args: { principal?: boolean; membership?: boolean } = {}): OwnerAuthorityReader {
  return {
    async readEnabledPrincipal() {
      return args.principal === false ? null : { revision: 7 };
    },
    async readWorkspaceMembership() {
      return args.membership === false ? null : { role: "viewer" };
    },
  };
}

function identity(
  exactRequestInput: unknown = { prompt: "hello" },
  financialEnvironment: "test" | "live" = "test",
  runtimeEnvironment: "production" | "preview" | "development" = "development",
) {
  return deriveForgeOwnerOperationIdentity({
    financialEnvironment,
    runtimeEnvironment,
    originatingTool: "hearth",
    operationType: "test_text_generation",
    stableOperationInput: { workspace_id: workspaceId, workpiece_id: workpieceId, action: "generate" },
    exactRequestInput,
  });
}

function input<TResult = string>(args: {
  gate: MemoryOwnerCostGate;
  operationIdentity?: ReturnType<typeof identity>;
  attemptNumber?: number;
  provider?: string;
  service?: string;
  persisted?: { value: TResult } | null;
  capture?: Record<string, unknown>;
  valuations?: ForgeOwnerExecutionInput<Record<string, unknown>, TResult>["submitProvider"] extends (...args: never[]) => Promise<infer R>
    ? R extends { valuations: infer V } ? V : never
    : never;
  submit?: ForgeOwnerExecutionInput<Record<string, unknown>, TResult>["submitProvider"];
  parse?: (capture: Record<string, unknown>) => TResult;
  validate?: (value: TResult) => Promise<void> | void;
  persist?: (value: TResult) => Promise<void>;
  recover?: ForgeOwnerExecutionInput<Record<string, unknown>, TResult>["recoverCapturedResult"];
  routeAuthorization?: ForgeOwnerExecutionInput<Record<string, unknown>, TResult>["routeAuthorization"];
}): ForgeOwnerExecutionInput<Record<string, unknown>, TResult> {
  const operationIdentity = args.operationIdentity ?? identity();
  let persisted = args.persisted;
  return {
    authenticatedUserId: ownerId,
    routeCode: "hearth.test_text_generation",
    routeAuthorization: args.routeAuthorization,
    operation: {
      identity: operationIdentity,
      runtimeEnvironment: "development",
      originatingTool: "hearth",
      operationType: "test_text_generation",
      attribution: { workspaceId, workpieceId },
      creationEvidence: { test_fixture: true },
    },
    attempt: {
      attemptNumber: args.attemptNumber ?? 1,
      provider: args.provider ?? "openai",
      service: args.service ?? "responses",
      model: "test-model",
      sku: "test-model:standard",
      credentialIdentityHash,
      exactProviderRequest: { body: "exact-request", attempt: args.attemptNumber ?? 1 },
      defaultCostComponent: `${args.provider ?? "openai"}_test_generation`,
    },
    async readPersistedResult() {
      return persisted ? { found: true as const, value: persisted.value } : { found: false as const };
    },
    submitProvider: args.submit ?? (async () => ({
      capture: args.capture ?? { text: "provider-result" },
      providerReferenceId: "provider-request-1",
      normalizedUsage: { input_tokens: 10, output_tokens: 5 },
      privateProviderEvidence: { response_hash: "response-one" },
      valuations: args.valuations ?? [{
        costComponent: "openai_test_generation",
        basis: "usage_calculated" as const,
        amountMicros: 17,
        currency: "USD",
        recognitionMode: "journal_recognized" as const,
        rateRevisionId: "openai:test-model:2026-09-01",
        normalizedUsage: { input_tokens: 10, output_tokens: 5 },
      }],
    })),
    parseResult: async (capture) => args.parse ? args.parse(capture) : String(capture.text) as TResult,
    validateResult: args.validate ?? (() => undefined),
    persistResult: args.persist ?? (async (value) => { persisted = { value }; }),
    recoverCapturedResult: args.recover,
  };
}

function coordinator(gate: MemoryOwnerCostGate, reader: OwnerAuthorityReader = authorityReader()) {
  return new ForgeOwnerExecutionCoordinator({
    gate,
    authorityReader: reader,
    now: () => new Date("2026-09-29T12:00:00.000Z"),
  });
}

test("owner authority requires both the explicit principal and Workspace membership", async () => {
  const valid = await requireForgeOwnerExecutionAuthority({
    reader: authorityReader(), authenticatedUserId: ownerId, workspaceId, routeCode: "hearth.test",
  });
  assert.equal(valid.principalRevision, 7);
  assert.equal(valid.membershipRole, "viewer");

  await assert.rejects(
    requireForgeOwnerExecutionAuthority({
      reader: authorityReader({ principal: false }),
      authenticatedUserId: ownerId,
      workspaceId,
      routeCode: "hearth.test",
      platformOperator: true,
    } as Parameters<typeof requireForgeOwnerExecutionAuthority>[0] & { platformOperator: boolean }),
    ForgeOwnerAuthorizationError,
  );
  await assert.rejects(
    requireForgeOwnerExecutionAuthority({
      reader: authorityReader({ principal: false }),
      authenticatedUserId: ownerId,
      workspaceId,
      routeCode: "hearth.test",
      workspaceRole: "owner",
      owner: true,
      payer: "forge",
      fundingLane: "owner",
    } as Parameters<typeof requireForgeOwnerExecutionAuthority>[0] & Record<string, unknown>),
    ForgeOwnerAuthorizationError,
  );
  await assert.rejects(
    requireForgeOwnerExecutionAuthority({
      reader: authorityReader({ membership: false }), authenticatedUserId: ownerId, workspaceId, routeCode: "hearth.test",
    }),
    ForgeOwnerAuthorizationError,
  );
});

test("required route authority is server-derived and may supply budget classification", async () => {
  let checked = false;
  const result = await requireForgeOwnerExecutionAuthority({
    reader: authorityReader(),
    authenticatedUserId: ownerId,
    workspaceId,
    routeCode: "hearth.research",
    routeAuthorization: {
      required: true,
      async authorize(context) {
        checked = true;
        assert.equal(context.authenticatedUserId, ownerId);
        return { authorized: true, ownerOperatingBudgetId: "40000000-0000-4000-8000-000000000001", evidence: { revision: 3 } };
      },
    },
  });
  assert.equal(checked, true);
  assert.equal(result.ownerOperatingBudgetId, "40000000-0000-4000-8000-000000000001");
  await assert.rejects(requireForgeOwnerExecutionAuthority({
    reader: authorityReader(), authenticatedUserId: ownerId, workspaceId, routeCode: "hearth.research",
    routeAuthorization: { required: true, async authorize() { return { authorized: false }; } },
  }), ForgeOwnerAuthorizationError);
});

test("submission is durably recorded before the provider and exact replay does not submit twice", async () => {
  const gate = new MemoryOwnerCostGate();
  let providerCalls = 0;
  let persisted: string | null = null;
  const base = input({
    gate,
    submit: async () => {
      providerCalls += 1;
      assert.equal(gate.calls.at(-1)?.name, "append_owner_cost_attempt_event");
      assert.equal(gate.calls.at(-1)?.args.p_lifecycle_state, "submitted");
      return {
        capture: { text: "saved-result" },
        providerReferenceId: "request-1",
        normalizedUsage: { input_tokens: 4, output_tokens: 2 },
        privateProviderEvidence: { response_hash: "captured" },
        valuations: [{
          costComponent: "openai_test_generation",
          basis: "usage_calculated",
          amountMicros: 11,
          currency: "USD",
          recognitionMode: "journal_recognized",
          rateRevisionId: "immutable-rate-1",
        }],
      };
    },
    persist: async (value) => { persisted = value; },
  });
  base.readPersistedResult = async () => persisted == null
    ? { found: false as const }
    : { found: true as const, value: persisted };

  const first = await coordinator(gate).executeAttempt(base);
  const second = await coordinator(gate).executeAttempt(base);
  assert.equal(first.state, "succeeded");
  assert.equal(second.state, "succeeded");
  assert.equal(second.replay, true);
  assert.equal(providerCalls, 1);
  assert.equal(gate.journalValuations.length, 1);
  const states = gate.operations.values().next().value!.attempts[0]!.events.map((event) => event.lifecycle_state);
  assert.deepEqual(states, ["authorized", "submitted", "response_captured", "succeeded"]);
});

test("operation-key reuse with a conflicting request fingerprint fails closed", async () => {
  const gate = new MemoryOwnerCostGate();
  const stable = identity({ prompt: "first" });
  await coordinator(gate).executeAttempt(input({ gate, operationIdentity: stable }));
  const changed = identity({ prompt: "second" });
  assert.equal(changed.operationId, stable.operationId);
  assert.notEqual(changed.requestFingerprint, stable.requestFingerprint);
  await assert.rejects(
    coordinator(gate).executeAttempt(input({ gate, operationIdentity: changed })),
    /owner-cost operation replay conflict/,
  );
});

test("operation identity is stable within one runtime and isolated across runtimes", () => {
  const development = identity({ prompt: "same logical request" }, "test", "development");
  const developmentReplay = identity({ prompt: "same logical request" }, "test", "development");
  const production = identity({ prompt: "same logical request" }, "test", "production");

  assert.deepEqual(developmentReplay, development);
  assert.notEqual(production.operationId, development.operationId);
  assert.notEqual(production.operationKey, development.operationKey);
  assert.notEqual(production.requestFingerprint, development.requestFingerprint);
  assert.match(development.operationKey, /^hearth:test_text_generation:test:[0-9a-f]{64}$/);
  assert.match(production.operationKey, /^hearth:test_text_generation:test:[0-9a-f]{64}$/);
});

test("definitive rejection and ambiguity retain evidence without asserting zero provider cost", async () => {
  for (const outcome of ["definitively_rejected", "submission_unknown"] as const) {
    const gate = new MemoryOwnerCostGate();
    let providerCalls = 0;
    const execution = input({
      gate,
      submit: async () => {
        providerCalls += 1;
        throw new ForgeOwnerProviderBoundaryError({
          message: outcome,
          outcome,
          providerReferenceId: `request-${outcome}`,
          privateProviderEvidence: { transmitted: true },
        });
      },
    });
    const first = await coordinator(gate).executeAttempt(execution);
    const second = await coordinator(gate).executeAttempt(execution);
    assert.equal(first.state, outcome);
    assert.equal(second.state, outcome);
    assert.equal(providerCalls, 1);
    const attempt = gate.operations.values().next().value!.attempts[0]!;
    assert.deepEqual(attempt.events.map((event) => event.lifecycle_state), ["authorized", "submitted", outcome]);
    assert.equal(attempt.valuations[0]?.recognition_mode, "evidence_only");
    assert.equal(object(attempt.valuations[0]?.private_valuation_evidence).zero_is_not_asserted_provider_cost, true);
  }
});

test("provider evidence and recognized expense survive validation and persistence failures", async () => {
  for (const phase of ["validation", "persistence"] as const) {
    const gate = new MemoryOwnerCostGate();
    const execution = input({
      gate,
      validate: phase === "validation" ? () => { throw new Error("invalid product result"); } : undefined,
      persist: phase === "persistence" ? async () => { throw new Error("canonical persistence unavailable"); } : undefined,
    });
    await assert.rejects(
      coordinator(gate).executeAttempt(execution),
      (error) => error instanceof ForgeOwnerExecutionFailure && error.phase === phase,
    );
    const attempt = gate.operations.values().next().value!.attempts[0]!;
    assert.deepEqual(attempt.events.map((event) => event.lifecycle_state), ["authorized", "submitted", "response_captured", "failed"]);
    assert.equal(attempt.valuations.length, 1);
    assert.equal(gate.journalValuations.length, 1);
  }
});

test("a successful response without defensible money remains evidence-only", async () => {
  const gate = new MemoryOwnerCostGate();
  const result = await coordinator(gate).executeAttempt(input({ gate, valuations: [] }));
  assert.equal(result.state, "succeeded");
  const valuation = gate.operations.values().next().value!.attempts[0]!.valuations[0]!;
  assert.equal(valuation.valuation_basis, "estimated");
  assert.equal(valuation.amount_micros, 0);
  assert.equal(valuation.recognition_mode, "evidence_only");
  assert.equal(object(valuation.private_valuation_evidence).zero_is_not_asserted_provider_cost, true);
  assert.equal(gate.journalValuations.length, 0);
});

test("captured provider work can recover domain persistence without another submission", async () => {
  const gate = new MemoryOwnerCostGate();
  let providerCalls = 0;
  let persisted: string | null = null;
  const failed = input({
    gate,
    submit: async () => {
      providerCalls += 1;
      return {
        capture: { text: "recoverable" },
        providerReferenceId: "request-recoverable",
        normalizedUsage: { units: 1 },
        privateProviderEvidence: { result_text: "recoverable" },
        valuations: [{
          costComponent: "openai_test_generation",
          basis: "provider_reported",
          amountMicros: 25,
          currency: "USD",
          recognitionMode: "journal_recognized",
          providerMonetaryEvidenceReference: "provider-cost-record-1",
        }],
      };
    },
    persist: async () => { throw new Error("first persistence failed"); },
  });
  await assert.rejects(coordinator(gate).executeAttempt(failed), ForgeOwnerExecutionFailure);
  const recovery = input({
    gate,
    persist: async (value) => { persisted = value; },
    recover: async (attempt) => {
      const response = attempt.events?.find((event) => event.lifecycle_state === "response_captured");
      const evidence = object(response?.private_provider_evidence);
      return { value: String(evidence.result_text) };
    },
  });
  recovery.readPersistedResult = async () => persisted == null
    ? { found: false as const }
    : { found: true as const, value: persisted };
  const result = await coordinator(gate).executeAttempt(recovery);
  assert.equal(result.state, "succeeded");
  assert.equal(result.recovered, true);
  assert.equal(providerCalls, 1);
  assert.equal(persisted, "recoverable");
  assert.equal(gate.journalValuations.length, 1);
});

test("real retries and multi-provider work use independent numbered attempts", async () => {
  const gate = new MemoryOwnerCostGate();
  const operationIdentity = identity();
  await assert.rejects(coordinator(gate).executeAttempt(input({
    gate,
    operationIdentity,
    attemptNumber: 1,
    validate: () => { throw new Error("first result invalid"); },
  })), ForgeOwnerExecutionFailure);
  const second = await coordinator(gate).executeAttempt(input({
    gate,
    operationIdentity,
    attemptNumber: 2,
    provider: "brave",
    service: "web_search",
    valuations: [{
      costComponent: "brave_search",
      basis: "provider_reported",
      amountMicros: 5_000,
      currency: "USD",
      recognitionMode: "journal_recognized",
      providerMonetaryEvidenceReference: "brave-usage-record-2",
    }],
  }));
  assert.equal(second.state, "succeeded");
  const attempts = gate.operations.get(operationIdentity.operationId)!.attempts;
  assert.deepEqual(attempts.map((attempt) => attempt.attempt_number), [1, 2]);
  assert.equal(attempts[0]!.valuations.length, 1);
  assert.equal(attempts[1]!.valuations.length, 1);
  assert.equal(gate.journalValuations.length, 2);
});

test("an ambiguous earlier attempt blocks automatic retry and environments cannot cross", async () => {
  const gate = new MemoryOwnerCostGate();
  const operationIdentity = identity();
  await coordinator(gate).executeAttempt(input({
    gate,
    operationIdentity,
    submit: async () => { throw new Error("connection ended after transmission"); },
  }));
  await assert.rejects(
    coordinator(gate).executeAttempt(input({ gate, operationIdentity, attemptNumber: 2 })),
    (error) => error instanceof ForgeOwnerExecutionFailure && /unresolved/.test(error.message),
  );

  const liveGate = new MemoryOwnerCostGate();
  await assert.rejects(
    coordinator(liveGate).executeAttempt(input({ gate: liveGate, operationIdentity: identity({}, "live") })),
    /financial environment mismatch/,
  );
  assert.equal(liveGate.operations.size, 0);
});

test("owner coordinator invokes only owner-cost/environment RPCs and has no customer or Stripe dependency", async () => {
  const gate = new MemoryOwnerCostGate();
  await coordinator(gate).executeAttempt(input({ gate }));
  const allowed = new Set([
    "read_financial_runtime_environment",
    "read_owner_cost_operation",
    "establish_owner_cost_operation",
    "authorize_owner_cost_provider_attempt",
    "append_owner_cost_attempt_event",
    "record_owner_cost_valuation",
  ]);
  assert.equal(gate.calls.every((call) => allowed.has(call.name)), true);
  const serialized = JSON.stringify(gate.calls).toLowerCase();
  for (const forbidden of ["customer_spending", "quote", "reservation", "settlement", "stripe", "markup", "credit_balance"]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
});
