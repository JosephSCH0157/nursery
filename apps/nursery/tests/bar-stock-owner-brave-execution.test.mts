import assert from "node:assert/strict";
import test from "node:test";
import {
  BAR_STOCK_OWNER_BRAVE_RATE,
  BarStockOwnerBraveAttemptError,
  deriveBarStockOwnerDiscoveryIdentity,
  executeBarStockOwnerBraveQueries,
} from "../server/bar-stock/bar-stock-owner-brave-execution";
import {
  ForgeOwnerAuthorizationError,
  ForgeOwnerExecutionCoordinator,
  type OwnerAuthorityReader,
  type OwnerCostRpcGate,
} from "../server/accounting/forge-owner-execution-coordinator";

type Row = Record<string, unknown>;
type Attempt = Row & { events: Row[]; valuations: Row[] };
type Operation = { operation: Row; attempts: Attempt[] };

class MemoryOwnerCostGate implements OwnerCostRpcGate {
  readonly calls: Array<{ name: string; args: Row }> = [];
  readonly operations = new Map<string, Operation>();
  readonly journalValuations: Row[] = [];

  async rpc(name: string, args: Row = {}) {
    this.calls.push({ name, args });
    if (name === "read_financial_runtime_environment") {
      return { data: { financial_environment: "live" }, error: null };
    }
    if (name === "read_owner_cost_operation") {
      return { data: this.operations.get(String(args.p_operation_id)) ?? null, error: null };
    }
    if (name === "establish_owner_cost_operation") {
      const id = String(args.p_operation_id);
      const existing = this.operations.get(id);
      if (existing) {
        if (existing.operation.request_fingerprint !== args.p_request_fingerprint) {
          return { data: null, error: { message: "operation fingerprint conflict", code: "23505" } };
        }
        return { data: existing.operation, error: null };
      }
      const operation = {
        operation_id: id,
        request_fingerprint: args.p_request_fingerprint,
        operation_key: args.p_operation_key,
        created_at: args.p_created_at,
        financial_environment: args.p_financial_environment,
        creation_evidence: args.p_creation_evidence,
      };
      this.operations.set(id, { operation, attempts: [] });
      return { data: operation, error: null };
    }
    if (name === "authorize_owner_cost_provider_attempt") {
      const operation = this.operations.get(String(args.p_operation_id));
      if (!operation) return { data: null, error: { message: "operation missing" } };
      const attemptNumber = Number(args.p_attempt_number);
      const existing = operation.attempts.find((attempt) => Number(attempt.attempt_number) === attemptNumber);
      if (existing) {
        if (existing.request_fingerprint !== args.p_request_fingerprint) {
          return { data: null, error: { message: "attempt fingerprint conflict", code: "23505" } };
        }
        return { data: existing, error: null };
      }
      const attempt: Attempt = {
        attempt_id: args.p_attempt_id,
        attempt_number: attemptNumber,
        request_fingerprint: args.p_request_fingerprint,
        provider: args.p_provider,
        service: args.p_service,
        private_authorization_evidence: args.p_private_authorization_evidence,
        events: [{ lifecycle_state: "authorized", event_sequence: 1 }],
        valuations: [],
      };
      operation.attempts.push(attempt);
      return { data: attempt, error: null };
    }
    if (name === "append_owner_cost_attempt_event") {
      const attempt = [...this.operations.values()].flatMap((operation) => operation.attempts)
        .find((candidate) => candidate.attempt_id === args.p_attempt_id);
      if (!attempt) return { data: null, error: { message: "attempt missing" } };
      const sequence = Number(args.p_event_sequence);
      const existing = attempt.events.find((event) => Number(event.event_sequence) === sequence);
      if (existing) return { data: { ...existing, provider_submission_created: false }, error: null };
      const event = {
        attempt_event_id: args.p_attempt_event_id,
        event_sequence: sequence,
        lifecycle_state: args.p_lifecycle_state,
        provider_reference_id: args.p_provider_reference_id,
        normalized_usage_evidence: args.p_normalized_usage_evidence,
        private_provider_evidence: args.p_private_provider_evidence,
      };
      attempt.events.push(event);
      return { data: { ...event, provider_submission_created: sequence === 2 }, error: null };
    }
    if (name === "record_owner_cost_valuation") {
      const attempt = [...this.operations.values()].flatMap((operation) => operation.attempts)
        .find((candidate) => candidate.attempt_id === args.p_attempt_id);
      if (!attempt) return { data: null, error: { message: "attempt missing" } };
      const existing = attempt.valuations.find((valuation) => valuation.valuation_key === args.p_valuation_key);
      if (existing) return { data: existing, error: null };
      const valuation = {
        valuation_id: args.p_valuation_id,
        valuation_key: args.p_valuation_key,
        cost_component: args.p_cost_component,
        valuation_basis: args.p_valuation_basis,
        amount_micros: args.p_amount_micros,
        recognition_mode: args.p_recognition_mode,
        normalized_usage_evidence: args.p_normalized_usage_evidence,
        private_valuation_evidence: args.p_private_valuation_evidence,
      };
      attempt.valuations.push(valuation);
      if (args.p_recognition_mode === "journal_recognized") this.journalValuations.push(valuation);
      return { data: valuation, error: null };
    }
    return { data: null, error: { message: `unexpected RPC ${name}` } };
  }
}

function authorityReader(enabled = true): OwnerAuthorityReader {
  return {
    readEnabledPrincipal: async () => enabled ? { revision: 4 } : null,
    readWorkspaceMembership: async () => ({ role: "owner" }),
  };
}

function setup(args: { enabled?: boolean; fetchImpl?: typeof fetch; queries?: string[] } = {}) {
  const gate = new MemoryOwnerCostGate();
  const coordinator = new ForgeOwnerExecutionCoordinator({
    gate,
    authorityReader: authorityReader(args.enabled ?? true),
    now: () => new Date("2026-09-29T12:00:00.000Z"),
  });
  const providerCalls = new Set<string>();
  let fetchCalls = 0;
  const fetchImpl: typeof fetch = args.fetchImpl ?? (async (input) => {
    fetchCalls += 1;
    return new Response(JSON.stringify({
      web: { results: [{ title: `Result ${fetchCalls}`, url: `https://example.test/${fetchCalls}`, description: "Evidence" }] },
    }), { status: 200, headers: { "content-type": "application/json", "x-request-id": `brave-${fetchCalls}` } });
  });
  const input = {
    coordinator,
    authenticatedUserId: "10000000-0000-4000-8000-000000000001",
    workspaceId: "20000000-0000-4000-8000-000000000001",
    discoveryRunId: "30000000-0000-4000-8000-000000000001",
    preferenceRevision: 7,
    queries: args.queries ?? ["query a", "query b", "query c"],
    financialEnvironment: "live" as const,
    runtimeEnvironment: "production" as const,
    credential: "dedicated-bar-stock-owner-key",
    routeAuthorization: { required: true as const, authorize: async () => ({ authorized: true }) },
    providerFetch: (async (request, init) => {
      const operation = [...gate.operations.values()][0];
      const latest = operation?.attempts.at(-1)?.events.at(-1)?.lifecycle_state;
      assert.equal(latest, "submitted", "provider transport must follow the submitted event");
      assert.match(String(request), /^https:\/\/api\.search\.brave\.com\/res\/v1\/web\/search/);
      assert.equal(new Headers(init?.headers).get("x-subscription-token"), "dedicated-bar-stock-owner-key");
      return fetchImpl(request, init);
    }) as typeof fetch,
    providerCallAlreadyRecorded: async (requestKey: string) => providerCalls.has(requestKey),
    recordProviderCall: async (requestKey: string) => { providerCalls.add(requestKey); },
  };
  return { gate, input, providerCalls, fetchCalls: () => fetchCalls };
}

test("three Brave queries create three submitted-first attempts and exact replay makes no provider calls", async () => {
  const state = setup();
  const first = await executeBarStockOwnerBraveQueries(state.input);
  assert.equal(first.length, 3);
  assert.equal(state.fetchCalls(), 3);
  assert.equal(state.providerCalls.size, 3);

  const operation = [...state.gate.operations.values()][0]!;
  assert.deepEqual(operation.attempts.map((attempt) => attempt.attempt_number), [1, 2, 3]);
  for (const attempt of operation.attempts) {
    assert.deepEqual(attempt.events.map((event) => event.lifecycle_state), ["authorized", "submitted", "response_captured", "succeeded"]);
    assert.equal(attempt.valuations.length, 1);
    assert.equal(attempt.valuations[0]!.valuation_basis, "usage_calculated");
    assert.equal(attempt.valuations[0]!.amount_micros, 5_000);
    assert.equal(attempt.valuations[0]!.recognition_mode, "journal_recognized");
  }
  assert.equal(state.gate.journalValuations.length, 3);

  const replay = await executeBarStockOwnerBraveQueries(state.input);
  assert.equal(replay.length, 3);
  assert.equal(state.fetchCalls(), 3, "replay must recover captured responses without Brave resubmission");
});

test("a later definitive rejection preserves earlier Brave evidence and journal valuations", async () => {
  let calls = 0;
  const state = setup({
    fetchImpl: (async () => {
      calls += 1;
      if (calls === 3) return new Response(JSON.stringify({ error: { id: "reject-3" } }), { status: 429 });
      return new Response(JSON.stringify({ web: { results: [] } }), { status: 200 });
    }) as typeof fetch,
  });
  await assert.rejects(
    executeBarStockOwnerBraveQueries(state.input),
    (error) => error instanceof BarStockOwnerBraveAttemptError && error.outcome === "definitively_rejected",
  );
  const attempts = [...state.gate.operations.values()][0]!.attempts;
  assert.equal(attempts.length, 3);
  assert.deepEqual(attempts[2]!.events.map((event) => event.lifecycle_state), ["authorized", "submitted", "definitively_rejected"]);
  assert.equal(attempts[2]!.valuations[0]!.recognition_mode, "evidence_only");
  assert.equal(state.gate.journalValuations.length, 2);
  assert.equal(state.gate.journalValuations.every((valuation) => valuation.amount_micros === 5_000), true);
});

test("network ambiguity becomes submission_unknown and cannot be retried automatically", async () => {
  let calls = 0;
  const state = setup({
    queries: ["ambiguous query"],
    fetchImpl: (async () => { calls += 1; throw new TypeError("connection ended after transmission"); }) as typeof fetch,
  });
  await assert.rejects(
    executeBarStockOwnerBraveQueries(state.input),
    (error) => error instanceof BarStockOwnerBraveAttemptError && error.outcome === "submission_unknown",
  );
  await assert.rejects(
    executeBarStockOwnerBraveQueries(state.input),
    (error) => error instanceof BarStockOwnerBraveAttemptError && error.outcome === "submission_unknown",
  );
  assert.equal(calls, 1);
  const attempt = [...state.gate.operations.values()][0]!.attempts[0]!;
  assert.deepEqual(attempt.events.map((event) => event.lifecycle_state), ["authorized", "submitted", "submission_unknown"]);
  assert.equal(attempt.valuations[0]!.recognition_mode, "evidence_only");
});

test("ordinary customers cannot invoke the owner coordinator and request fields cannot select it", async () => {
  const state = setup({ enabled: false, queries: ["owner only"] });
  await assert.rejects(executeBarStockOwnerBraveQueries(state.input), ForgeOwnerAuthorizationError);
  assert.equal(state.fetchCalls(), 0);
  assert.equal(state.gate.operations.size, 0);
  assert.equal("fundingLane" in state.input, false);
  assert.equal("owner" in state.input, false);
  assert.equal("payer" in state.input, false);
});

test("same run identity is stable while a conflicting query fingerprint fails closed", async () => {
  const original = deriveBarStockOwnerDiscoveryIdentity({
    financialEnvironment: "live",
    runtimeEnvironment: "production",
    workspaceId: "20000000-0000-4000-8000-000000000001",
    discoveryRunId: "30000000-0000-4000-8000-000000000001",
    preferenceRevision: 7,
    queries: ["query a"],
  });
  const replay = deriveBarStockOwnerDiscoveryIdentity({
    financialEnvironment: "live",
    runtimeEnvironment: "production",
    workspaceId: "20000000-0000-4000-8000-000000000001",
    discoveryRunId: "30000000-0000-4000-8000-000000000001",
    preferenceRevision: 7,
    queries: ["query a"],
  });
  const conflict = deriveBarStockOwnerDiscoveryIdentity({
    financialEnvironment: "live",
    runtimeEnvironment: "production",
    workspaceId: "20000000-0000-4000-8000-000000000001",
    discoveryRunId: "30000000-0000-4000-8000-000000000001",
    preferenceRevision: 7,
    queries: ["changed query"],
  });
  assert.deepEqual(replay, original);
  assert.equal(conflict.operationId, original.operationId);
  assert.notEqual(conflict.requestFingerprint, original.requestFingerprint);

  const state = setup({ queries: ["query a"] });
  await executeBarStockOwnerBraveQueries(state.input);
  await assert.rejects(
    executeBarStockOwnerBraveQueries({ ...state.input, queries: ["changed query"] }),
    /operation fingerprint conflict/,
  );
  assert.equal(state.fetchCalls(), 1);
});

test("the Bar Stock adapter uses only owner-cost RPCs and the certified direct Brave rate", async () => {
  const state = setup({ queries: ["cost isolation"] });
  await executeBarStockOwnerBraveQueries(state.input);
  const names = state.gate.calls.map((call) => call.name);
  const allowed = new Set([
    "read_financial_runtime_environment",
    "read_owner_cost_operation",
    "establish_owner_cost_operation",
    "authorize_owner_cost_provider_attempt",
    "append_owner_cost_attempt_event",
    "record_owner_cost_valuation",
  ]);
  assert.equal(names.every((name) => allowed.has(name)), true);
  const serialized = JSON.stringify(state.gate.calls).toLowerCase();
  for (const forbidden of ["customer_spending", "quote", "reservation", "settlement", "stripe", "credit_balance", "openai"]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
  const valuationEvidence = state.gate.journalValuations[0]!.private_valuation_evidence as Row;
  assert.equal(valuationEvidence.customer_markup_applied, false);
  assert.deepEqual(BAR_STOCK_OWNER_BRAVE_RATE, {
    amountMicros: 5_000,
    revisionId: "brave-search-web-usd-5-per-1000-2026-09-29",
    source: "https://api-dashboard.search.brave.com/app/plans",
  });
});
