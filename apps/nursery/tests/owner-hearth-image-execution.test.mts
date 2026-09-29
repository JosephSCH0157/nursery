import assert from "node:assert/strict";
import test from "node:test";
import {
  ForgeOwnerExecutionCoordinator,
  type OwnerAuthorityReader,
  type OwnerCostRpcGate,
} from "../server/accounting/forge-owner-execution-coordinator";
import {
  HEARTH_OWNER_OPENAI_IMAGE_RATE,
  createOwnerHearthImageExecutionExecutor,
} from "../server/hearth/owner-hearth-image-execution";
import {
  ImageProviderRequestError,
  type GenerateImageOutput,
  type ImageProvider,
} from "../../../packages/tongs/src/providers/image-provider";

const USER_ID = "10000000-0000-4000-8000-000000000001";
const WORKSPACE_ID = "20000000-0000-4000-8000-000000000001";
const WORKPIECE_ID = "30000000-0000-4000-8000-000000000001";
const CONCEPT_ID = "40000000-0000-4000-8000-000000000001";
const RECIPE_ID = "50000000-0000-4000-8000-000000000001";

type Attempt = {
  attempt_id: string;
  attempt_number: number;
  events: Array<Record<string, unknown>>;
  valuations: Array<Record<string, unknown>>;
};

class OwnerImageGate implements OwnerCostRpcGate {
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
      let attempt = operation.attempts.find((value) => value.attempt_id === args.p_attempt_id);
      if (!attempt) {
        attempt = {
          attempt_id: String(args.p_attempt_id),
          attempt_number: Number(args.p_attempt_number),
          events: [{ event_sequence: 1, lifecycle_state: "authorized", occurred_at: args.p_authorized_at }],
          valuations: [],
        };
        operation.attempts.push(attempt);
      }
      return { data: { attempt_id: attempt.attempt_id, authorized: true, replay: false }, error: null };
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
      return {
        data: { replay: Boolean(existing), provider_submission_created: !existing && args.p_lifecycle_state === "submitted" },
        error: null,
      };
    }
    if (name === "record_owner_cost_valuation") {
      const attempt = this.attempt(args.p_attempt_id);
      assert.ok(attempt);
      const existing = attempt.valuations.find((value) => value.valuation_id === args.p_valuation_id);
      if (!existing) attempt.valuations.push({ valuation_id: args.p_valuation_id, ...args });
      return { data: { valuation_id: args.p_valuation_id, journal_event_id: args.p_valuation_id, replay: Boolean(existing) }, error: null };
    }
    if (name === "read_owner_hearth_image_result") {
      return { data: this.results.get(String(args.p_owner_cost_attempt_id)) ?? null, error: null };
    }
    throw new Error(`Unexpected RPC ${name}`);
  }
}

const ownerReader: OwnerAuthorityReader = {
  async readEnabledPrincipal() { return { revision: 1 }; },
  async readWorkspaceMembership() { return { role: "owner" }; },
};

function output(ordinal = 1): GenerateImageOutput {
  return {
    bytesBase64: Buffer.from(`owner-image-${ordinal}`).toString("base64"),
    mimeType: "image/png",
    provider: "openai",
    providerRequestId: "request-owner-image-1",
    revisedPrompt: null,
    tokensUsed: 10,
    usage: {
      textInputTokens: 2,
      cachedTextInputTokens: 0,
      imageInputTokens: 0,
      cachedImageInputTokens: 0,
      imageOutputTokens: 8,
      totalTokens: 10,
      raw: { total_tokens: 10 },
    },
    providerResponseId: "response-owner-image-1",
    responseEvidence: { id: "response-owner-image-1" },
  };
}

function thumbnailInput() {
  return {
    authenticatedUserId: USER_ID,
    workspaceId: WORKSPACE_ID,
    workpieceId: WORKPIECE_ID,
    routeCode: "hearth.thumbnail_base_generation" as const,
    productOperationId: "hearth-thumbnail-product-operation",
    stableOperationInput: {
      canonical_image_role: "thumbnail_base",
      concept_revision_id: CONCEPT_ID,
      render_recipe_id: RECIPE_ID,
      render_recipe_revision: 1,
      prompt_package_hash: "a".repeat(64),
    },
    exactProviderRequest: {
      model: "gpt-image-2-2026-04-21",
      prompt: "canonical owner thumbnail prompt",
      size: "1536x1024",
      quality: "high",
      output_format: "png",
    },
    providerBodySha256: "b".repeat(64),
    imageCount: 1 as const,
  };
}

function provider(args: { calls: string[]; scenario?: "success" | "rejected" | "ambiguous"; count?: 1 | 2 }): ImageProvider {
  const run = async (): Promise<GenerateImageOutput[]> => {
    args.calls.push("provider");
    if (args.scenario === "rejected") {
      throw new ImageProviderRequestError("rejected", {
        delivery: "definitive_response", status: 400, providerRequestId: "request-rejected",
      });
    }
    if (args.scenario === "ambiguous") {
      throw new ImageProviderRequestError("network timeout", { delivery: "ambiguous_transport" });
    }
    return Array.from({ length: args.count ?? 1 }, (_, index) => output(index + 1));
  };
  return {
    async generateImage() { return (await run())[0]!; },
    async generateImages() { return run(); },
  };
}

test("owner image accounting is durable before provider submission and exact replay does not resubmit", async () => {
  const gate = new OwnerImageGate();
  const calls: string[] = [];
  let persisted = 0;
  const executor = createOwnerHearthImageExecutionExecutor({
    gate,
    authorityReader: ownerReader,
    coordinator: new ForgeOwnerExecutionCoordinator({ gate, authorityReader: ownerReader }),
    credential: "isolated-owner-image-key",
    providerFactory: () => provider({ calls }),
  });
  const request = {
    ...thumbnailInput(),
    readPersistedResult: async (context: { ownerCostAttemptId: string }) => gate.results.has(context.ownerCostAttemptId)
      ? { canonical_stage_only: true, replay: true } : null,
    persistCanonical: async (_images: GenerateImageOutput[], context: { ownerCostAttemptId: string }) => {
      assert.equal(gate.calls.some((call) => call.name === "append_owner_cost_attempt_event"
        && call.args.p_lifecycle_state === "submitted"), true);
      persisted += 1;
      gate.results.set(context.ownerCostAttemptId, { provider_request_id: "request-owner-image-1" });
      return { canonical_stage_only: true };
    },
  };

  const first = await executor(request);
  const replay = await executor(request);
  assert.equal(first?.state, "succeeded");
  assert.equal(replay?.state, "succeeded");
  assert.equal(calls.length, 1);
  assert.equal(persisted, 1);
  const attempt = [...gate.operations.values()][0]!.attempts[0]!;
  assert.deepEqual(attempt.events.map((event) => event.lifecycle_state), ["authorized", "submitted", "response_captured", "succeeded"]);
  assert.equal(attempt.valuations[0]?.p_amount_micros, HEARTH_OWNER_OPENAI_IMAGE_RATE.amountMicrosPerImage);
  assert.equal(attempt.valuations[0]?.p_recognition_mode, "journal_recognized");
  assert.equal(attempt.valuations[0]?.p_valuation_basis, "usage_calculated");
  assert.equal(gate.calls.some((call) => /quote|reservation|settlement|customer/i.test(call.name)), false);
});

test("non-owner cannot select owner image execution and missing owner credential fails before provider", async () => {
  const deniedReader: OwnerAuthorityReader = {
    async readEnabledPrincipal() { return null; },
    async readWorkspaceMembership() { return { role: "owner" }; },
  };
  const deniedGate = new OwnerImageGate();
  const deniedCalls: string[] = [];
  const denied = createOwnerHearthImageExecutionExecutor({
    gate: deniedGate,
    authorityReader: deniedReader,
    coordinator: new ForgeOwnerExecutionCoordinator({ gate: deniedGate, authorityReader: deniedReader }),
    credential: "isolated-owner-image-key",
    providerFactory: () => provider({ calls: deniedCalls }),
  });
  assert.equal(await denied({
    ...thumbnailInput(),
    readPersistedResult: async () => null,
    persistCanonical: async () => assert.fail("non-owner must not persist owner image result"),
  }), null);
  assert.equal(deniedCalls.length, 0);
  assert.equal(deniedGate.operations.size, 0);

  const gate = new OwnerImageGate();
  let constructed = false;
  const absent = createOwnerHearthImageExecutionExecutor({
    gate,
    authorityReader: ownerReader,
    coordinator: new ForgeOwnerExecutionCoordinator({ gate, authorityReader: ownerReader }),
    providerFactory: () => { constructed = true; return provider({ calls: [] }); },
  });
  await assert.rejects(absent({
    ...thumbnailInput(),
    readPersistedResult: async () => null,
    persistCanonical: async () => ({}),
  }), /isolated Hearth owner OpenAI image credential is unavailable/);
  assert.equal(constructed, false);
  assert.equal(gate.operations.size, 0);
});

test("owner image definitive rejection and transport ambiguity preserve distinct terminal evidence", async () => {
  for (const scenario of ["rejected", "ambiguous"] as const) {
    const gate = new OwnerImageGate();
    const calls: string[] = [];
    const executor = createOwnerHearthImageExecutionExecutor({
      gate,
      authorityReader: ownerReader,
      coordinator: new ForgeOwnerExecutionCoordinator({ gate, authorityReader: ownerReader }),
      credential: "isolated-owner-image-key",
      providerFactory: () => provider({ calls, scenario }),
    });
    const outcome = await executor({
      ...thumbnailInput(),
      productOperationId: `thumbnail-${scenario}`,
      readPersistedResult: async () => null,
      persistCanonical: async () => assert.fail("provider failure must not persist"),
    });
    assert.equal(outcome?.state, scenario === "rejected" ? "definitively_rejected" : "submission_unknown");
    assert.equal(calls.length, 1);
    const attempt = [...gate.operations.values()][0]!.attempts[0]!;
    assert.equal(attempt.events.at(-1)?.lifecycle_state,
      scenario === "rejected" ? "definitively_rejected" : "submission_unknown");
    assert.equal(attempt.valuations[0]?.p_recognition_mode, "evidence_only");
  }
});

test("captured owner image evidence recovers persistence without a second provider submission", async () => {
  const gate = new OwnerImageGate();
  const calls: string[] = [];
  let failPersistence = true;
  const executor = createOwnerHearthImageExecutionExecutor({
    gate,
    authorityReader: ownerReader,
    coordinator: new ForgeOwnerExecutionCoordinator({ gate, authorityReader: ownerReader }),
    credential: "isolated-owner-image-key",
    providerFactory: () => provider({ calls }),
  });
  const request = {
    ...thumbnailInput(),
    productOperationId: "thumbnail-persistence-recovery",
    readPersistedResult: async (context: { ownerCostAttemptId: string }) => gate.results.has(context.ownerCostAttemptId) ? { recovered: true } : null,
    persistCanonical: async (_images: GenerateImageOutput[], context: { ownerCostAttemptId: string }) => {
      if (failPersistence) throw new Error("persistence unavailable");
      gate.results.set(context.ownerCostAttemptId, { provider_request_id: "request-owner-image-1" });
      return { recovered: true };
    },
  };
  await assert.rejects(executor(request), /Owner product result persistence failed/);
  failPersistence = false;
  const recovered = await executor(request);
  assert.equal(recovered?.state, "succeeded");
  assert.equal(calls.length, 1);
});

test("timeline owner image uses one n=2 attempt and direct provider cost without markup", async () => {
  const gate = new OwnerImageGate();
  const calls: string[] = [];
  const executor = createOwnerHearthImageExecutionExecutor({
    gate,
    authorityReader: ownerReader,
    coordinator: new ForgeOwnerExecutionCoordinator({ gate, authorityReader: ownerReader }),
    credential: "isolated-owner-image-key",
    providerFactory: () => provider({ calls, count: 2 }),
  });
  const result = await executor({
    authenticatedUserId: USER_ID,
    workspaceId: WORKSPACE_ID,
    workpieceId: WORKPIECE_ID,
    routeCode: "hearth.timeline_image_generation",
    productOperationId: "timeline-owner-operation",
    stableOperationInput: {
      canonical_image_role: "timeline_image_candidates",
      image_map_revision_id: "60000000-0000-4000-8000-000000000001",
      image_moment_id: "image-moment-1",
      prompt_revision_id: "70000000-0000-4000-8000-000000000001",
      prompt_content_hash: "c".repeat(64),
      semantic_authority_hash: "d".repeat(64),
    },
    exactProviderRequest: {
      model: "gpt-image-2-2026-04-21",
      prompt: "canonical timeline image prompt",
      size: "1536x1024",
      quality: "high",
      output_format: "png",
      n: 2,
    },
    providerBodySha256: "e".repeat(64),
    imageCount: 2,
    readPersistedResult: async () => null,
    persistCanonical: async (images, context) => {
      assert.equal(images.length, 2);
      gate.results.set(context.ownerCostAttemptId, { provider_request_id: context.providerReferenceId });
      return { generated_assets: [{}, {}] };
    },
  });
  assert.equal(result?.state, "succeeded");
  assert.equal(calls.length, 1);
  const attempt = [...gate.operations.values()][0]!.attempts[0]!;
  assert.equal(attempt.valuations[0]?.p_amount_micros, HEARTH_OWNER_OPENAI_IMAGE_RATE.amountMicrosPerImage * 2);
  assert.equal((attempt.valuations[0]?.p_private_valuation_evidence as Record<string, unknown>).customer_markup_applied, false);
});
