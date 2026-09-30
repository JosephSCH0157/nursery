import assert from "node:assert/strict";
import test from "node:test";
import {
  ForgeOwnerExecutionCoordinator,
  type OwnerCostRpcGate,
} from "../server/accounting/forge-owner-execution-coordinator";
import {
  HEARTH_OWNER_TEXT_RATE,
  executeOwnerHearthText,
} from "../server/hearth/owner-hearth-text-execution";
import { createOwnerHearthResearchCostSession } from "../server/hearth/owner-hearth-research-cost-execution";

const USER_ID = "10000000-0000-4000-8000-000000000001";
const WORKSPACE_ID = "20000000-0000-4000-8000-000000000001";
const WORKPIECE_ID = "30000000-0000-4000-8000-000000000001";
const ACTION_ID = "40000000-0000-4000-8000-000000000001";

type Attempt = {
  attempt_id: string;
  attempt_number: number;
  events: Array<Record<string, unknown>>;
  valuations: Array<Record<string, unknown>>;
};

class HearthOwnerGate implements OwnerCostRpcGate {
  readonly calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  readonly operations = new Map<string, { operation: Record<string, unknown>; attempts: Attempt[] }>();
  readonly results = new Map<string, Record<string, unknown>>();

  private attempt(id: unknown): Attempt | null {
    return [...this.operations.values()].flatMap((value) => value.attempts)
      .find((value) => value.attempt_id === id) ?? null;
  }

  async rpc(name: string, rawArgs: Record<string, unknown> = {}) {
    const args = structuredClone(rawArgs);
    this.calls.push({ name, args });
    if (name === "read_financial_runtime_environment") return { data: { financial_environment: "test" }, error: null };
    if (name === "read_owner_cost_operation") {
      const value = this.operations.get(String(args.p_operation_id));
      return { data: value ? { operation: value.operation, attempts: value.attempts, links: [] } : null, error: null };
    }
    if (name === "establish_owner_cost_operation") {
      const id = String(args.p_operation_id);
      if (!this.operations.has(id)) {
        this.operations.set(id, {
          operation: {
            operation_id: id,
            operation_key: args.p_operation_key,
            request_fingerprint: args.p_request_fingerprint,
            created_at: args.p_created_at,
          },
          attempts: [],
        });
      }
      return { data: { operation_id: id, replay: false }, error: null };
    }
    if (name === "authorize_owner_cost_provider_attempt") {
      const operation = this.operations.get(String(args.p_operation_id));
      assert.ok(operation);
      let attempt = operation.attempts.find((value) => value.attempt_id === args.p_attempt_id);
      if (!attempt) {
        attempt = {
          attempt_id: String(args.p_attempt_id),
          attempt_number: Number(args.p_attempt_number),
          events: [{
            attempt_event_id: args.p_attempt_id,
            event_sequence: 1,
            lifecycle_state: "authorized",
            occurred_at: args.p_authorized_at,
          }],
          valuations: [],
        };
        operation.attempts.push(attempt);
      }
      return { data: { attempt_id: attempt.attempt_id, authorized: true, replay: attempt.events.length > 1 }, error: null };
    }
    if (name === "append_owner_cost_attempt_event") {
      const attempt = this.attempt(args.p_attempt_id);
      assert.ok(attempt);
      const sequence = Number(args.p_event_sequence);
      const existing = attempt.events.find((value) => value.event_sequence === sequence);
      if (!existing) {
        attempt.events.push({
          attempt_event_id: args.p_attempt_event_id,
          event_sequence: sequence,
          lifecycle_state: args.p_lifecycle_state,
          provider_reference_id: args.p_provider_reference_id,
          normalized_usage_evidence: args.p_normalized_usage_evidence,
          private_provider_evidence: args.p_private_provider_evidence,
          occurred_at: args.p_occurred_at,
        });
      }
      return { data: {
        attempt_event_id: args.p_attempt_event_id,
        replay: Boolean(existing),
        provider_submission_created: !existing && args.p_lifecycle_state === "submitted",
      }, error: null };
    }
    if (name === "record_owner_cost_valuation") {
      const attempt = this.attempt(args.p_attempt_id);
      assert.ok(attempt);
      const existing = attempt.valuations.find((value) => value.valuation_id === args.p_valuation_id);
      if (!existing) attempt.valuations.push({ valuation_id: args.p_valuation_id, ...args });
      return { data: {
        valuation_id: args.p_valuation_id,
        journal_event_id: args.p_recognition_mode === "journal_recognized" ? args.p_valuation_id : null,
        replay: Boolean(existing),
      }, error: null };
    }
    if (name === "read_owner_hearth_text_result") {
      return { data: this.results.get(String(args.p_owner_cost_attempt_id)) ?? null, error: null };
    }
    if (name === "persist_owner_hearth_text_result") {
      const id = String(args.p_owner_cost_attempt_id);
      const row = {
        result_json: args.p_result_json,
        owner_cost_attempt_id: id,
        reservation_id: null,
        provider_request_id: args.p_provider_request_id,
        input_units: args.p_input_units,
        output_units: args.p_output_units,
      };
      this.results.set(id, row);
      return { data: row, error: null };
    }
    throw new Error(`Unexpected RPC ${name}`);
  }
}

function coordinator(gate: HearthOwnerGate) {
  return new ForgeOwnerExecutionCoordinator({
    gate,
    authorityReader: {
      async readTransitionAuthority(userId) { return {
        userId, canonicalUserId: userId, accountClass: "owner" as const, accountAuthorityRevision: 1,
        accountAuthorityExplicit: true, legacyUserId: userId, legacyPrincipalStatus: "enabled" as const,
        legacyPrincipalRevision: 1, sameUser: true, consistent: true, eligible: true,
        state: "eligible" as const, authorityMode: "canonical_legacy_dual_read" as const,
      }; },
      async readWorkspaceMembership() { return { role: "owner" }; },
    },
  });
}

function textInput(args: {
  gate: HearthOwnerGate;
  providerFetch: typeof fetch;
  parse?: (payload: Record<string, unknown>) => Record<string, unknown>;
}) {
  return {
    coordinator: coordinator(args.gate),
    gate: args.gate,
    authenticatedUserId: USER_ID,
    workspaceId: WORKSPACE_ID,
    workpieceId: WORKPIECE_ID,
    routeCode: "hearth.chat_completion" as const,
    operationIntentId: ACTION_ID,
    financialEnvironment: "test" as const,
    runtimeEnvironment: "development" as const,
    credential: "owner-openai-test-key",
    providerBody: { model: "gpt-5.6-luna", messages: [{ role: "user", content: "hello" }] },
    logicalRequest: { prompt: "hello" },
    providerFetch: args.providerFetch,
    parseAndValidate: args.parse ?? ((payload) => ({ assistant_text: String((payload.choices as any[])[0].message.content) })),
  };
}

test("owner OpenAI valuation uses exact Luna direct rates, journal recognition, and no retail markup", async () => {
  const gate = new HearthOwnerGate();
  const result = await executeOwnerHearthText(textInput({
    gate,
    providerFetch: async () => Response.json({
      id: "chatcmpl-owner-1",
      choices: [{ message: { content: "hello back" } }],
      usage: { prompt_tokens: 1_000, completion_tokens: 500, prompt_tokens_details: { cached_tokens: 200 } },
    }, { headers: { "x-request-id": "request-owner-1" } }),
  }));
  assert.equal(result.state, "succeeded");
  const attempt = [...gate.operations.values()][0].attempts[0];
  assert.deepEqual(attempt.events.map((value) => value.lifecycle_state), ["authorized", "submitted", "response_captured", "succeeded"]);
  assert.equal(attempt.valuations.length, 1);
  const valuation = attempt.valuations[0];
  assert.equal(valuation.p_valuation_basis, "usage_calculated");
  assert.equal(valuation.p_recognition_mode, "journal_recognized");
  assert.equal(valuation.p_amount_micros, 764);
  const privateEvidence = valuation.p_private_valuation_evidence as Record<string, unknown>;
  assert.equal(privateEvidence.provider_rate_revision_id, HEARTH_OWNER_TEXT_RATE.revisionId);
  assert.equal(privateEvidence.customer_markup_applied, false);
  const saved = gate.results.get(result.attemptId);
  assert.equal(saved?.owner_cost_attempt_id, result.attemptId);
  assert.equal(saved?.reservation_id, null);
});

test("every supported owner text route keeps its route identity, persistence binding, and exact replay", async () => {
  const routes = [
    "hearth.chat_completion",
    "hearth.script_generation",
    "hearth.research_synthesis",
    "hearth.title_generation",
    "hearth.tag_generation",
    "hearth.framing_pack_generation",
  ] as const;
  for (const routeCode of routes) {
    const gate = new HearthOwnerGate();
    let providerCalls = 0;
    const input = {
      ...textInput({
        gate,
        providerFetch: async () => {
          providerCalls += 1;
          return Response.json({
            id: `response-${routeCode}`,
            choices: [{ message: { content: routeCode } }],
            usage: { prompt_tokens: 2, completion_tokens: 1 },
          });
        },
        parse: () => ({ assistant_text: routeCode }),
      }),
      routeCode,
      logicalRequest: { route_code: routeCode, request: "stable" },
    };
    const first = await executeOwnerHearthText(input);
    const replay = await executeOwnerHearthText(input);
    assert.equal(first.state, "succeeded", routeCode);
    assert.equal(replay.state, "succeeded", routeCode);
    assert.equal(providerCalls, 1, routeCode);
    assert.equal(replay.replay, true, routeCode);
    assert.equal(gate.results.get(first.attemptId)?.reservation_id, null, routeCode);
    const establishment = gate.calls.find((value) => value.name === "establish_owner_cost_operation");
    assert.equal(establishment?.args.p_operation_type, routeCode, routeCode);
    assert.match(String(establishment?.args.p_request_fingerprint), /^[0-9a-f]{64}$/, routeCode);
  }
});

test("captured OpenAI evidence survives product validation failure and recovery never resubmits", async () => {
  const gate = new HearthOwnerGate();
  let providerCalls = 0;
  const providerFetch = async () => {
    providerCalls += 1;
    return Response.json({ id: "chatcmpl-owner-recover", choices: [{ message: { content: "captured" } }], usage: { prompt_tokens: 4, completion_tokens: 2 } });
  };
  await assert.rejects(executeOwnerHearthText(textInput({
    gate,
    providerFetch,
    parse: () => { throw new Error("product validation failed"); },
  })), /Owner provider response parsing failed/);
  assert.equal(providerCalls, 1);
  const attempt = [...gate.operations.values()][0].attempts[0];
  assert.equal(attempt.events.some((value) => value.lifecycle_state === "response_captured"), true);

  const recovered = await executeOwnerHearthText(textInput({
    gate,
    providerFetch,
    parse: () => ({ assistant_text: "captured" }),
  }));
  assert.equal(recovered.state, "succeeded");
  assert.equal(providerCalls, 1);
  assert.equal(gate.results.has(recovered.attemptId), true);
});

test("definitive rejection and submission ambiguity remain distinct and never auto-retry", async () => {
  const rejectedGate = new HearthOwnerGate();
  let rejectedCalls = 0;
  const rejectedInput = textInput({
    gate: rejectedGate,
    providerFetch: async () => {
      rejectedCalls += 1;
      return Response.json({ error: "bad request" }, { status: 400, headers: { "x-request-id": "reject-1" } });
    },
  });
  const rejected = await executeOwnerHearthText(rejectedInput);
  assert.equal(rejected.state, "definitively_rejected");
  const rejectedReplay = await executeOwnerHearthText(rejectedInput);
  assert.equal(rejectedReplay.state, "definitively_rejected");
  assert.equal(rejectedCalls, 1);

  const unknownGate = new HearthOwnerGate();
  let unknownCalls = 0;
  const unknownInput = textInput({
    gate: unknownGate,
    providerFetch: async () => {
      unknownCalls += 1;
      throw new TypeError("connection reset");
    },
  });
  const unknown = await executeOwnerHearthText(unknownInput);
  assert.equal(unknown.state, "submission_unknown");
  const unknownReplay = await executeOwnerHearthText(unknownInput);
  assert.equal(unknownReplay.state, "submission_unknown");
  assert.equal(unknownCalls, 1);
});

test("research keeps independent Brave attempts and binds Luna synthesis to the next attempt", async () => {
  const gate = new HearthOwnerGate();
  const sharedCoordinator = coordinator(gate);
  let braveCalls = 0;
  const session = createOwnerHearthResearchCostSession({
    coordinator: sharedCoordinator,
    authenticatedUserId: USER_ID,
    workspaceId: WORKSPACE_ID,
    workpieceId: WORKPIECE_ID,
    operationIntentId: ACTION_ID,
    financialEnvironment: "test",
    runtimeEnvironment: "development",
    braveCredential: "hearth-owner-brave-test-key",
    plan: {
      schema: "forge.owner-hearth.research-plan.v1",
      route_code: "hearth.research_synthesis",
      workspace_id: WORKSPACE_ID,
      workpiece_id: WORKPIECE_ID,
      user_id: USER_ID,
      operation_intent_id: ACTION_ID,
      research_request: { query: "owner research" },
      maximum_search_attempts: 2,
      maximum_retrieval_attempts: 2,
      maximum_input_tokens: 1_000,
      maximum_output_tokens: 500,
      requested_model: "gpt-5.6-luna",
      limit_profile: "creator_session",
    } as any,
    providerFetch: async (_input, init) => {
      braveCalls += 1;
      assert.equal(new Headers(init?.headers).get("x-subscription-token"), "hearth-owner-brave-test-key");
      if (braveCalls === 2) return Response.json({ error: "rejected" }, { status: 429 });
      return Response.json({ web: { results: [] } }, { headers: { "x-request-id": `brave-${braveCalls}` } });
    },
  });
  assert.equal((await session.fetch("https://api.search.brave.com/res/v1/web/search?q=one")).status, 200);
  assert.equal((await session.fetch("https://api.search.brave.com/res/v1/web/search?q=two")).status, 502);
  assert.equal(braveCalls, 2);
  assert.equal(session.braveAttemptCount(), 2);

  let openAiCalls = 0;
  const synthesis = await executeOwnerHearthText({
    ...textInput({
      gate,
      providerFetch: async () => {
        openAiCalls += 1;
        return Response.json({ id: "chatcmpl-synthesis", choices: [{ message: { content: "synthesis" } }], usage: { prompt_tokens: 10, completion_tokens: 5 } });
      },
    }),
    coordinator: sharedCoordinator,
    routeCode: "hearth.research_synthesis",
    operationIdentity: session.operationIdentity,
    attemptNumber: session.nextAttemptNumber(),
  });
  assert.equal(synthesis.state, "succeeded");
  assert.equal(openAiCalls, 1);
  const operation = [...gate.operations.values()][0];
  assert.deepEqual(operation.attempts.map((value) => value.attempt_number), [1, 2, 3]);
  assert.deepEqual(operation.attempts.map((value) => value.valuations[0]?.p_recognition_mode), ["evidence_only", "evidence_only", "journal_recognized"]);
  assert.equal(
    (operation.attempts[0].valuations[0].p_private_valuation_evidence as Record<string, unknown>).unresolved_reason,
    "hearth_owner_brave_credential_rate_not_verified",
  );
});

test("failed synthesis preserves completed Brave evidence and expense", async () => {
  const gate = new HearthOwnerGate();
  const sharedCoordinator = coordinator(gate);
  const session = createOwnerHearthResearchCostSession({
    coordinator: sharedCoordinator,
    authenticatedUserId: USER_ID,
    workspaceId: WORKSPACE_ID,
    workpieceId: WORKPIECE_ID,
    operationIntentId: ACTION_ID,
    financialEnvironment: "test",
    runtimeEnvironment: "development",
    braveCredential: "hearth-owner-brave-test-key",
    plan: {
      schema: "forge.owner-hearth.research-plan.v1",
      route_code: "hearth.research_synthesis",
      workspace_id: WORKSPACE_ID,
      workpiece_id: WORKPIECE_ID,
      user_id: USER_ID,
      operation_intent_id: ACTION_ID,
      research_request: { query: "preserve the search attempt" },
      maximum_search_attempts: 1,
      maximum_retrieval_attempts: 1,
      maximum_input_tokens: 1_000,
      maximum_output_tokens: 500,
      requested_model: "gpt-5.6-luna",
      limit_profile: "creator_session",
    } as any,
    providerFetch: async () => Response.json(
      { web: { results: [] } },
      { headers: { "x-request-id": "brave-before-synthesis-failure" } },
    ),
  });

  assert.equal((await session.fetch("https://api.search.brave.com/res/v1/web/search?q=preserve")).status, 200);
  const synthesis = await executeOwnerHearthText({
    ...textInput({
      gate,
      providerFetch: async () => Response.json(
        { error: "provider rejected synthesis" },
        { status: 503, headers: { "x-request-id": "synthesis-rejected" } },
      ),
    }),
    coordinator: sharedCoordinator,
    routeCode: "hearth.research_synthesis",
    operationIdentity: session.operationIdentity,
    attemptNumber: session.nextAttemptNumber(),
  });

  assert.equal(synthesis.state, "definitively_rejected");
  const operation = [...gate.operations.values()][0];
  assert.deepEqual(operation.attempts.map((value) => value.attempt_number), [1, 2]);
  assert.equal(operation.attempts[0].events.some((value) => value.lifecycle_state === "response_captured"), true);
  assert.equal(operation.attempts[0].valuations.length, 1);
  assert.equal(operation.attempts[0].valuations[0].p_recognition_mode, "evidence_only");
  assert.equal(operation.attempts[1].events.at(-1)?.lifecycle_state, "definitively_rejected");
});
