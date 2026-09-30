import assert from "node:assert/strict";
import test from "node:test";
import {
  ForgeOwnerExecutionCoordinator,
  type OwnerAuthorityReader,
  type OwnerCostRpcGate,
} from "../server/accounting/forge-owner-execution-coordinator";
import { createOwnerNarrativeInterpretationExecutor } from "../server/hearth/owner-narrative-interpretation-execution";

const USER_ID = "10000000-0000-4000-8000-000000000001";
const WORKSPACE_ID = "20000000-0000-4000-8000-000000000001";
const WORKPIECE_ID = "30000000-0000-4000-8000-000000000001";

type Attempt = {
  attempt_id: string;
  attempt_number: number;
  attempt_key: string;
  request_fingerprint: string;
  provider: string;
  service: string;
  model: string | null;
  sku: string | null;
  credential_identity_hash: string;
  events: Array<Record<string, unknown>>;
  valuations: Array<Record<string, unknown>>;
};

class NarrativeOwnerGate implements OwnerCostRpcGate {
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
    if (name === "read_financial_runtime_environment") {
      return { data: { financial_environment: "test" }, error: null };
    }
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
      let attempt = operation.attempts.find((value) => value.attempt_id === args.p_attempt_id
        || value.attempt_number === Number(args.p_attempt_number));
      if (attempt && (attempt.attempt_id !== args.p_attempt_id
        || attempt.request_fingerprint !== args.p_request_fingerprint)) {
        return { data: null, error: { code: "23505", message: "owner-cost provider attempt replay conflict" } };
      }
      if (!attempt) {
        attempt = {
          attempt_id: String(args.p_attempt_id),
          attempt_number: Number(args.p_attempt_number),
          attempt_key: String(args.p_attempt_key),
          request_fingerprint: String(args.p_request_fingerprint),
          provider: String(args.p_provider),
          service: String(args.p_service),
          model: typeof args.p_model === "string" ? args.p_model : null,
          sku: typeof args.p_sku === "string" ? args.p_sku : null,
          credential_identity_hash: String(args.p_credential_identity_hash),
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
      const existing = attempt.events.find((value) => value.event_sequence === sequence);
      if (!existing) {
        attempt.events.push({
          event_sequence: sequence,
          lifecycle_state: args.p_lifecycle_state,
          provider_reference_id: args.p_provider_reference_id,
          normalized_usage_evidence: args.p_normalized_usage_evidence,
          private_provider_evidence: args.p_private_provider_evidence,
          occurred_at: args.p_occurred_at,
        });
      }
      return { data: { replay: Boolean(existing), provider_submission_created: !existing && args.p_lifecycle_state === "submitted" }, error: null };
    }
    if (name === "record_owner_cost_valuation") {
      const attempt = this.attempt(args.p_attempt_id);
      assert.ok(attempt);
      const existing = attempt.valuations.find((value) => value.valuation_id === args.p_valuation_id);
      if (!existing) attempt.valuations.push({ valuation_id: args.p_valuation_id, ...args });
      return { data: { valuation_id: args.p_valuation_id, journal_event_id: args.p_valuation_id, replay: Boolean(existing) }, error: null };
    }
    if (name === "read_owner_visual_narrative_interpretation_result") {
      return { data: this.results.get(String(args.p_owner_cost_attempt_id)) ?? null, error: null };
    }
    if (name === "stage_owner_visual_narrative_interpretation_result") {
      const id = String(args.p_owner_cost_attempt_id);
      const row = {
        owner_cost_attempt_id: id,
        visual_brief_json: args.p_visual_brief_json,
        provider_request_id: args.p_provider_request_id,
        model: args.p_model,
        input_units: args.p_input_units,
        output_units: args.p_output_units,
      };
      this.results.set(id, row);
      return { data: row, error: null };
    }
    throw new Error(`Unexpected RPC ${name}`);
  }
}

const authorityReader: OwnerAuthorityReader = {
  async readEnabledPrincipal() { return { revision: 1 }; },
  async readWorkspaceMembership() { return { role: "owner" }; },
};

const brief = {
  narrative_purpose: "Show the host explaining why a failed prototype changed the product strategy.",
  central_message: "A tangible failed prototype becomes evidence for a clearer product direction.",
  primary_subjects: ["podcast host", "damaged metal prototype"],
  relationship_or_action: "The host points from the damaged prototype to a revised engineering sketch.",
  emotional_tone: "reflective, candid, and cautiously optimistic",
  visual_mode: "editorial" as const,
  setting: "A practical workshop table with the failed part and one revised drawing visible.",
  composition: "Medium-wide view with the host at left and the prototype in the foreground. The revised sketch anchors the right side.",
  essential_visual_evidence: ["cracked prototype casing", "revised engineering sketch", "host pointing between both objects"],
  avoid: ["generic office setting", "unrelated machinery", "multiple alternate scenes"],
  source_context: { before: "The first design failed in testing.", focus: "That failure showed us what mattered.", after: "We rebuilt around the lesson." },
};

function input() {
  return {
    authenticatedUserId: USER_ID,
    workspaceId: WORKSPACE_ID,
    workpieceId: WORKPIECE_ID,
    operationIntentId: "40000000-0000-4000-8000-000000000001",
    logicalRequest: { image_moment_id: "50000000-0000-4000-8000-000000000001" },
    providerBody: { model: "gpt-5.6-luna", input: "canonical request" },
    providerBodySha256: "a".repeat(64),
    imageMapRevisionId: "60000000-0000-4000-8000-000000000001",
    imageMapRevision: 1,
    scriptApprovalId: "70000000-0000-4000-8000-000000000001",
    scriptApprovalRevision: 1,
    creatorDirection: "Make the lesson visually specific.",
    visualStyle: "documentary editorial",
    contracts: { interpretation: "forge.image-prompt-interpretation.v2" },
  };
}

test("owner narrative interpretation establishes accounting before OpenAI and replays without resubmission", async () => {
  const gate = new NarrativeOwnerGate();
  const order: string[] = [];
  let providerCalls = 0;
  let canonicalCommits = 0;
  const executor = createOwnerNarrativeInterpretationExecutor({
    gate,
    authorityReader,
    coordinator: new ForgeOwnerExecutionCoordinator({ gate, authorityReader }),
    credential: "isolated-owner-openai-key",
    providerFetch: async (url, init) => {
      providerCalls += 1;
      order.push("provider");
      assert.equal(gate.calls.some((call) => call.name === "establish_owner_cost_operation"), true);
      assert.equal(gate.calls.some((call) => call.name === "authorize_owner_cost_provider_attempt"), true);
      assert.equal(gate.calls.some((call) => call.name === "append_owner_cost_attempt_event"
        && call.args.p_lifecycle_state === "submitted"), true);
      assert.equal(url, "https://api.openai.com/v1/responses");
      assert.equal((init?.headers as Record<string, string>).authorization, "Bearer isolated-owner-openai-key");
      return Response.json({
        id: "resp_owner_narrative_1",
        model: "gpt-5.6-luna",
        output: [{ content: [{ type: "output_text", text: JSON.stringify(brief) }] }],
        usage: { input_tokens: 100, output_tokens: 50 },
      }, { headers: { "x-request-id": "request-owner-narrative-1" } });
    },
  });
  const request = {
    ...input(),
    prepareCanonical: async () => { order.push("canonical-prepared"); },
    persistCanonical: async (_operationKey: string, _fingerprint: string, value: unknown) => {
      canonicalCommits += 1;
      order.push("canonical-committed");
      return { disposition: "committed", value };
    },
  };

  const first = await executor(request);
  const replay = await executor(request);

  assert.equal(first?.disposition, "committed");
  assert.equal(replay?.disposition, "committed");
  assert.equal(providerCalls, 1);
  assert.equal(canonicalCommits, 2);
  assert.ok(order.indexOf("canonical-prepared") < order.indexOf("provider"));
  const attempt = [...gate.operations.values()][0].attempts[0];
  assert.deepEqual(attempt.events.map((event) => event.lifecycle_state), ["authorized", "submitted", "response_captured", "succeeded"]);
  assert.equal(attempt.valuations.length, 1);
  assert.equal(attempt.valuations[0].p_recognition_mode, "journal_recognized");
  assert.equal(attempt.valuations[0].p_amount_micros, 80);
  assert.equal(gate.calls.some((call) => call.name.includes("reservation") || call.name.includes("quote") || call.name.includes("customer")), false);
});

test("non-owner authority leaves the existing customer narrative path untouched", async () => {
  const gate = new NarrativeOwnerGate();
  let providerCalls = 0;
  const deniedReader: OwnerAuthorityReader = {
    async readEnabledPrincipal() { return null; },
    async readWorkspaceMembership() { return { role: "owner" }; },
  };
  const executor = createOwnerNarrativeInterpretationExecutor({
    gate,
    authorityReader: deniedReader,
    coordinator: new ForgeOwnerExecutionCoordinator({ gate, authorityReader: deniedReader }),
    credential: "isolated-owner-openai-key",
    providerFetch: async () => { providerCalls += 1; return Response.json({}); },
  });
  const result = await executor({
    ...input(),
    prepareCanonical: async () => assert.fail("owner canonical operation must not begin"),
    persistCanonical: async () => assert.fail("owner result must not persist"),
  });
  assert.equal(result, null);
  assert.equal(providerCalls, 0);
  assert.equal(gate.operations.size, 0);
});

test("authorized owner execution fails closed when the isolated credential is absent", async () => {
  const gate = new NarrativeOwnerGate();
  const executor = createOwnerNarrativeInterpretationExecutor({
    gate,
    authorityReader,
    coordinator: new ForgeOwnerExecutionCoordinator({ gate, authorityReader }),
  });
  await assert.rejects(executor({
    ...input(),
    prepareCanonical: async () => undefined,
    persistCanonical: async () => ({ disposition: "unexpected" }),
  }), /isolated Hearth owner OpenAI credential is unavailable/);
  assert.equal(gate.operations.size, 0);
});

test("owner narrative definitive rejection and submission ambiguity remain distinct", async () => {
  for (const scenario of ["rejected", "ambiguous"] as const) {
    const gate = new NarrativeOwnerGate();
    let providerCalls = 0;
    const executor = createOwnerNarrativeInterpretationExecutor({
      gate,
      authorityReader,
      coordinator: new ForgeOwnerExecutionCoordinator({ gate, authorityReader }),
      credential: "isolated-owner-openai-key",
      providerFetch: async () => {
        providerCalls += 1;
        if (scenario === "ambiguous") throw new TypeError("network outcome unknown");
        return Response.json({ error: { message: "request rejected" } }, { status: 400 });
      },
    });
    await assert.rejects(executor({
      ...input(),
      operationIntentId: `${input().operationIntentId}-${scenario}`,
      prepareCanonical: async () => undefined,
      persistCanonical: async () => assert.fail("terminal provider failure must not persist a domain result"),
    }), scenario === "rejected" ? /definitively rejected/ : /submission is unresolved/);
    assert.equal(providerCalls, 1);
    const attempt = [...gate.operations.values()][0].attempts[0];
    assert.equal(attempt.events.at(-1)?.lifecycle_state,
      scenario === "rejected" ? "definitively_rejected" : "submission_unknown");
  }
});

test("owner narrative canonical persistence recovers from captured evidence without resubmission", async () => {
  const gate = new NarrativeOwnerGate();
  let providerCalls = 0;
  let failPersistence = true;
  const executor = createOwnerNarrativeInterpretationExecutor({
    gate,
    authorityReader,
    coordinator: new ForgeOwnerExecutionCoordinator({ gate, authorityReader }),
    credential: "isolated-owner-openai-key",
    providerFetch: async () => {
      providerCalls += 1;
      return Response.json({
        id: "resp_owner_narrative_recovery",
        model: "gpt-5.6-luna",
        output: [{ content: [{ type: "output_text", text: JSON.stringify(brief) }] }],
        usage: { input_tokens: 10, output_tokens: 5 },
      });
    },
  });
  const request = {
    ...input(),
    operationIntentId: `${input().operationIntentId}-recovery`,
    prepareCanonical: async () => undefined,
    persistCanonical: async () => {
      if (failPersistence) throw new Error("canonical persistence unavailable");
      return { disposition: "committed" };
    },
  };
  await assert.rejects(executor(request), /Owner product result persistence failed/);
  assert.equal(providerCalls, 1);
  failPersistence = false;
  const recovered = await executor(request);
  assert.equal(recovered?.disposition, "committed");
  assert.equal(providerCalls, 1);
});

test("owner narrative credential replacement creates attempt 2 and exact replay recovers attempt 2", async () => {
  const gate = new NarrativeOwnerGate();
  let oldProviderCalls = 0;
  let replacementProviderCalls = 0;
  const request = {
    ...input(),
    operationIntentId: `${input().operationIntentId}-credential-replacement`,
    prepareCanonical: async () => undefined,
    persistCanonical: async () => ({ disposition: "committed" }),
  };
  const oldExecutor = createOwnerNarrativeInterpretationExecutor({
    gate,
    authorityReader,
    coordinator: new ForgeOwnerExecutionCoordinator({ gate, authorityReader }),
    credential: "superseded-owner-openai-key",
    providerFetch: async () => {
      oldProviderCalls += 1;
      return Response.json({ error: { message: "invalid_api_key" } }, { status: 401 });
    },
  });
  await assert.rejects(oldExecutor(request), /definitively rejected/);

  const replacementExecutor = createOwnerNarrativeInterpretationExecutor({
    gate,
    authorityReader,
    coordinator: new ForgeOwnerExecutionCoordinator({ gate, authorityReader }),
    credential: "replacement-owner-openai-key",
    providerFetch: async () => {
      replacementProviderCalls += 1;
      return Response.json({
        id: "resp_owner_narrative_retry_2",
        model: "gpt-5.6-luna",
        output: [{ content: [{ type: "output_text", text: JSON.stringify(brief) }] }],
        usage: { input_tokens: 100, output_tokens: 50 },
      });
    },
  });
  const retry = await replacementExecutor(request);
  const replay = await replacementExecutor(request);

  assert.equal(retry?.disposition, "committed");
  assert.equal(replay?.disposition, "committed");
  assert.equal(oldProviderCalls, 1);
  assert.equal(replacementProviderCalls, 1);
  const attempts = [...gate.operations.values()][0].attempts;
  assert.deepEqual(attempts.map((attempt) => attempt.attempt_number), [1, 2]);
  assert.deepEqual(attempts[0].events.map((event) => event.lifecycle_state), ["authorized", "submitted", "definitively_rejected"]);
  assert.deepEqual(attempts[1].events.map((event) => event.lifecycle_state), ["authorized", "submitted", "response_captured", "succeeded"]);
  assert.notEqual(attempts[0].credential_identity_hash, attempts[1].credential_identity_hash);
  assert.equal(gate.calls.some((call) => call.name.includes("reservation") || call.name.includes("quote") || call.name.includes("customer")), false);
});

test("owner narrative explicitly retries a failed captured attempt with the next number", async () => {
  const gate = new NarrativeOwnerGate();
  const request = {
    ...input(),
    operationIntentId: `${input().operationIntentId}-failed-retry`,
    prepareCanonical: async () => undefined,
    persistCanonical: async () => { throw new Error("canonical persistence unavailable"); },
  };
  const firstExecutor = createOwnerNarrativeInterpretationExecutor({
    gate,
    authorityReader,
    coordinator: new ForgeOwnerExecutionCoordinator({ gate, authorityReader }),
    credential: "failed-attempt-owner-key",
    providerFetch: async () => Response.json({
      id: "resp_owner_narrative_failed_1",
      model: "gpt-5.6-luna",
      output: [{ content: [{ type: "output_text", text: JSON.stringify(brief) }] }],
      usage: { input_tokens: 10, output_tokens: 5 },
    }),
  });
  await assert.rejects(firstExecutor(request), /Owner product result persistence failed/);

  let retryCalls = 0;
  const retryExecutor = createOwnerNarrativeInterpretationExecutor({
    gate,
    authorityReader,
    coordinator: new ForgeOwnerExecutionCoordinator({ gate, authorityReader }),
    credential: "failed-attempt-replacement-key",
    providerFetch: async () => {
      retryCalls += 1;
      return Response.json({
        id: "resp_owner_narrative_failed_retry_2",
        model: "gpt-5.6-luna",
        output: [{ content: [{ type: "output_text", text: JSON.stringify(brief) }] }],
        usage: { input_tokens: 10, output_tokens: 5 },
      });
    },
  });
  const retry = await retryExecutor({
    ...request,
    persistCanonical: async () => ({ disposition: "committed" }),
  });
  assert.equal(retry?.disposition, "committed");
  assert.equal(retryCalls, 1);
  const attempts = [...gate.operations.values()][0].attempts;
  assert.deepEqual(attempts.map((attempt) => attempt.attempt_number), [1, 2]);
  assert.equal(attempts[0].events.at(-1)?.lifecycle_state, "failed");
  assert.equal(attempts[1].events.at(-1)?.lifecycle_state, "succeeded");
});

test("owner narrative blocks a changed retry after submission ambiguity", async () => {
  const gate = new NarrativeOwnerGate();
  const request = {
    ...input(),
    operationIntentId: `${input().operationIntentId}-ambiguous-retry`,
    prepareCanonical: async () => undefined,
    persistCanonical: async () => assert.fail("ambiguous submission must not persist"),
  };
  const firstExecutor = createOwnerNarrativeInterpretationExecutor({
    gate,
    authorityReader,
    coordinator: new ForgeOwnerExecutionCoordinator({ gate, authorityReader }),
    credential: "ambiguous-owner-key",
    providerFetch: async () => { throw new TypeError("connection reset"); },
  });
  await assert.rejects(firstExecutor(request), /submission is unresolved/);

  let retryCalls = 0;
  const replacementExecutor = createOwnerNarrativeInterpretationExecutor({
    gate,
    authorityReader,
    coordinator: new ForgeOwnerExecutionCoordinator({ gate, authorityReader }),
    credential: "ambiguous-replacement-key",
    providerFetch: async () => { retryCalls += 1; return Response.json({}); },
  });
  await assert.rejects(replacementExecutor(request), /unresolved \(submission_unknown\)/);
  assert.equal(retryCalls, 0);
  assert.equal([...gate.operations.values()][0].attempts.length, 1);
});

test("owner narrative blocks changed execution while submitted or response-captured work is unresolved", async () => {
  for (const unresolvedState of ["submitted", "response_captured"] as const) {
    const gate = new NarrativeOwnerGate();
    const request = {
      ...input(),
      operationIntentId: `${input().operationIntentId}-${unresolvedState}`,
      prepareCanonical: async () => undefined,
      persistCanonical: async () => { throw new Error("persistence unavailable"); },
    };
    const firstExecutor = createOwnerNarrativeInterpretationExecutor({
      gate,
      authorityReader,
      coordinator: new ForgeOwnerExecutionCoordinator({ gate, authorityReader }),
      credential: `owner-${unresolvedState}-key`,
      providerFetch: async () => Response.json({
        id: `resp_${unresolvedState}`,
        model: "gpt-5.6-luna",
        output: [{ content: [{ type: "output_text", text: JSON.stringify(brief) }] }],
        usage: { input_tokens: 10, output_tokens: 5 },
      }),
    });
    await assert.rejects(firstExecutor(request), /Owner product result persistence failed/);
    const attempt = [...gate.operations.values()][0].attempts[0];
    while (attempt.events.at(-1)?.lifecycle_state !== unresolvedState) attempt.events.pop();

    let retryCalls = 0;
    const replacementExecutor = createOwnerNarrativeInterpretationExecutor({
      gate,
      authorityReader,
      coordinator: new ForgeOwnerExecutionCoordinator({ gate, authorityReader }),
      credential: `owner-${unresolvedState}-replacement-key`,
      providerFetch: async () => { retryCalls += 1; return Response.json({}); },
    });
    await assert.rejects(replacementExecutor(request), new RegExp(`unresolved \\(${unresolvedState}\\)`));
    assert.equal(retryCalls, 0);
    assert.equal([...gate.operations.values()][0].attempts.length, 1);
  }
});

test("owner narrative attempt numbers increase monotonically across deliberate credential retries", async () => {
  const gate = new NarrativeOwnerGate();
  const request = {
    ...input(),
    operationIntentId: `${input().operationIntentId}-monotonic-retries`,
    prepareCanonical: async () => undefined,
    persistCanonical: async () => ({ disposition: "committed" }),
  };
  for (const credential of ["retry-key-one", "retry-key-two"]) {
    const executor = createOwnerNarrativeInterpretationExecutor({
      gate,
      authorityReader,
      coordinator: new ForgeOwnerExecutionCoordinator({ gate, authorityReader }),
      credential,
      providerFetch: async () => Response.json({ error: { message: "rejected" } }, { status: 401 }),
    });
    await assert.rejects(executor(request), /definitively rejected/);
  }
  const finalExecutor = createOwnerNarrativeInterpretationExecutor({
    gate,
    authorityReader,
    coordinator: new ForgeOwnerExecutionCoordinator({ gate, authorityReader }),
    credential: "retry-key-three",
    providerFetch: async () => Response.json({
      id: "resp_owner_narrative_retry_3",
      model: "gpt-5.6-luna",
      output: [{ content: [{ type: "output_text", text: JSON.stringify(brief) }] }],
      usage: { input_tokens: 10, output_tokens: 5 },
    }),
  });
  await finalExecutor(request);
  const attempts = [...gate.operations.values()][0].attempts;
  assert.deepEqual(attempts.map((attempt) => attempt.attempt_number), [1, 2, 3]);
  assert.deepEqual(attempts.slice(0, 2).map((attempt) => attempt.events.at(-1)?.lifecycle_state), ["definitively_rejected", "definitively_rejected"]);
  assert.equal(attempts[2].events.at(-1)?.lifecycle_state, "succeeded");
});
