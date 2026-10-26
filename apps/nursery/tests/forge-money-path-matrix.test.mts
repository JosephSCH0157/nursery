import assert from "node:assert/strict";
import { createHearthAiHandler } from "../server/hearth/create-hearth-ai-handler";
import type { HearthRuntimeConfig } from "../server/hearth/hearth-runtime-config";
import {
  ANVIL_WHISPER_ROUTE,
  createAnvilWhisperHandler,
  type AnvilWhisperRuntimeConfig,
} from "../server/anvil/create-anvil-whisper-handler";
import { HEARTH_AI_ROUTES } from "../../hearth/src/lib/hearth-ai-runtime-contract";

const SUPABASE_URL = "https://matrix-test.supabase.co";
const USER_ID = "a1111111-1111-4111-8111-111111111111";
const WORKSPACE_ID = "a2222222-2222-4222-8222-222222222222";
const EPISODE_ID = "a3333333-3333-4333-8333-333333333333";
const WORKPIECE_ID = "a4444444-4444-4444-8444-444444444444";
const ACCESS_TOKEN = "matrix-user-token";

type UsageEventRow = {
  status?: string;
  action_id?: string | null;
  feature?: string;
  subfeature?: string | null;
  lane?: string;
  model?: string;
  actual_cost_usd?: number;
  billable_tokens?: number;
  provider_request_id?: string | null;
};

type DeltaRpcRow = {
  p_user_id: string;
  p_delta: number;
  p_reason: string;
  p_request_id: string;
  p_provider_request_id?: string;
};

type PolicyReply = "allow" | "soft_deny" | "hard_deny" | "missing" | "malformed" | "unavailable";
type OwnerAuthorityReply = "not_owner" | "missing" | "mismatched";

class MockMatrixBackend {
  public usageEvents: UsageEventRow[] = [];
  public deltaCalls: DeltaRpcRow[] = [];
  public chargedRequestIds = new Set<string>();
  public chatCalls = 0;
  public sttCalls = 0;
  public ownerCostCalls: string[] = [];
  public tokenBalance: number;
  public failDeduction = false;
  public chatTemperature400Once = false;
  public policyReply: PolicyReply = "allow";
  public ownerAuthorityReply: OwnerAuthorityReply = "not_owner";
  public scriptReply: string | null = null;

  private readonly originalFetch: typeof fetch;
  private chatTemperature400Used = false;

  constructor(initialBalance = 1_000_000_000) {
    this.tokenBalance = initialBalance;
    this.originalFetch = globalThis.fetch;
  }

  install(): void {
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = toUrl(input);

      if (url === "https://api.openai.com/v1/chat/completions") {
        this.chatCalls += 1;
        const body = parseJsonBody(init?.body);
        const hasTemperature = typeof (body as Record<string, unknown> | null)?.temperature === "number";
        if (this.chatTemperature400Once && hasTemperature && !this.chatTemperature400Used) {
          this.chatTemperature400Used = true;
          return jsonResponse(400, {
            error: { message: "temperature is unsupported; only the default is allowed" },
          }, { "x-request-id": "req-chat-temp-400" });
        }

        return jsonResponse(200, {
          choices: [
            {
              message: {
                content: JSON.stringify({
                  assistantText: "Money-path matrix response.",
                  ops: this.scriptReply ? [{ op: "set_body", value: this.scriptReply }] : [],
                  scriptText: this.scriptReply,
                  tagAudit: null,
                }),
              },
            },
          ],
          usage: {
            prompt_tokens: 500_000,
            completion_tokens: 500_000,
            total_tokens: 1_000_000,
          },
        }, { "x-request-id": "req-chat-success" });
      }

      if (url === "https://api.openai.com/v1/audio/transcriptions") {
        this.sttCalls += 1;
        return jsonResponse(200, {
          text: "transcribed words",
          usage: {
            prompt_tokens: 300_000,
            completion_tokens: 300_000,
            total_tokens: 600_000,
          },
        }, { "x-request-id": "req-stt-success" });
      }

      if (url.endsWith("/auth/v1/user")) {
        return jsonResponse(200, { id: USER_ID });
      }

      if (url.includes("/storage/v1/object/") && init?.method === "GET") {
        return new Response(new Blob(["fake audio bytes"], { type: "audio/webm" }), {
          status: 200,
          headers: { "content-type": "audio/webm" },
        });
      }

      if (url.endsWith("/rest/v1/ai_usage_events") && init?.method === "POST") {
        const body = parseJsonBody(init?.body);
        if (Array.isArray(body)) {
          for (const row of body) {
            if (row && typeof row === "object") this.usageEvents.push(row as UsageEventRow);
          }
        } else if (body && typeof body === "object") {
          this.usageEvents.push(body as UsageEventRow);
        }
        return jsonResponse(201, [{}]);
      }

      if (url.includes("/rest/v1/user_ai_keys") && (!init?.method || init.method === "GET")) {
        return jsonResponse(200, []);
      }

      if ((url.includes("/rest/v1/owner_testing_principals") || url.includes("/rest/v1/workspace_members"))
        && (!init?.method || init.method === "GET")) {
        return jsonResponse(200, []);
      }

      if (url.endsWith("/rest/v1/rpc/resolve_ai_access_policy") && init?.method === "POST") {
        if (this.policyReply === "unavailable") return jsonResponse(503, { message: "policy unavailable" });
        if (this.policyReply === "missing") return jsonResponse(200, []);
        if (this.policyReply === "malformed") return jsonResponse(200, [{ decision_type: "ALLOW" }]);
        const denied = this.policyReply === "soft_deny" || this.policyReply === "hard_deny";
        return jsonResponse(200, [{
          decision_type: this.policyReply === "soft_deny" ? "SOFT_DENY" : this.policyReply === "hard_deny" ? "HARD_DENY" : "ALLOW",
          reason_code: denied ? "NO_VALID_FUNDING_SOURCE" : null,
          selected_funding_source: denied ? null : "forge_managed_credits",
          fallback_available: false,
          fallback_used: false,
          effective_policy_snapshot: { source: "money_path_matrix" },
        }]);
      }

      if (url.endsWith("/rest/v1/rpc/resolve_transition_owner_authority") && init?.method === "POST") {
        if (this.ownerAuthorityReply === "missing") return jsonResponse(200, []);
        return jsonResponse(200, {
          user_id: USER_ID,
          canonical_user_id: this.ownerAuthorityReply === "mismatched"
            ? "a9999999-9999-4999-8999-999999999999"
            : USER_ID,
          account_class: "customer",
          account_authority_revision: null,
          account_authority_explicit: false,
          legacy_user_id: null,
          legacy_principal_status: null,
          legacy_principal_revision: null,
          same_user: true,
          consistent: true,
          eligible: false,
          state: "not_owner",
          authority_mode: "canonical_legacy_dual_read",
        });
      }

      if (url.endsWith("/rest/v1/rpc/resolve_openai_text_model_for_funding_quote") && init?.method === "POST") {
        return jsonResponse(200, {
          catalog_revision_id: "a5555555-5555-4555-8555-555555555555",
          catalog_revision: 1,
          model_catalog_entry_id: "a6666666-6666-4666-8666-666666666666",
          customer_selection_key: "a7777777-7777-4777-8777-777777777777",
          runtime_model_id: "gpt-5.3",
          provider_model_id: "gpt-5.3",
          display_name: "GPT-5.3",
          tradeoff_summary: "Money-path matrix fixture model.",
        });
      }

      if (url.endsWith("/rest/v1/rpc/apply_ai_token_delta") && init?.method === "POST") {
        const body = parseJsonBody(init?.body) as DeltaRpcRow | null;
        if (!body) {
          return jsonResponse(400, { message: "bad rpc body" });
        }
        this.deltaCalls.push(body);

        if (this.failDeduction) {
          return jsonResponse(500, { message: "forced deduction failure" });
        }

        if (!this.chargedRequestIds.has(body.p_request_id)) {
          this.chargedRequestIds.add(body.p_request_id);
          this.tokenBalance = Math.max(0, this.tokenBalance + body.p_delta);
        }

        return jsonResponse(200, [{ token_balance: this.tokenBalance }]);
      }

      if (url.includes("/rest/v1/rpc/") && init?.method === "POST") {
        const name = url.slice(url.lastIndexOf("/") + 1);
        if ([
          "read_financial_runtime_environment",
          "establish_owner_cost_operation",
          "authorize_owner_cost_provider_attempt",
          "append_owner_cost_attempt_event",
          "record_owner_cost_valuation",
        ].includes(name)) {
          this.ownerCostCalls.push(name);
          if (name === "read_financial_runtime_environment") {
            return jsonResponse(200, { financial_environment: "test" });
          }
          if (name === "append_owner_cost_attempt_event") {
            const body = parseJsonBody(init.body) as Record<string, unknown> | null;
            return jsonResponse(200, {
              replay: false,
              provider_submission_created: body?.p_lifecycle_state === "submitted",
            });
          }
          if (name === "record_owner_cost_valuation") {
            return jsonResponse(200, { valuation_id: "a8888888-8888-4888-8888-888888888888", replay: false });
          }
          return jsonResponse(200, { replay: false, authorized: true });
        }
      }

      if (url.includes("/rest/v1/rpc/") && init?.method === "POST") {
        return jsonResponse(200, []);
      }

      throw new Error(`Unexpected fetch url in matrix harness: ${url}`);
    }) as typeof fetch;
  }

  restore(): void {
    globalThis.fetch = this.originalFetch;
  }
}

function toUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function parseJsonBody(body: RequestInit["body"] | null | undefined): unknown {
  if (typeof body !== "string") return null;
  try {
    return JSON.parse(body) as unknown;
  } catch {
    return null;
  }
}

function jsonResponse(status: number, payload: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...headers,
    },
  });
}

function buildHearthConfig(overrides: Partial<HearthRuntimeConfig> = {}): HearthRuntimeConfig {
  return {
    textApiKey: "test-openai-key",
    imageApiKey: null,
    apiKey: "test-openai-key",
    model: "gpt-5.3",
    sttModel: "gpt-4o-mini-transcribe",
    configuredBillingMode: "forge",
    initialTokenBalance: 1_000_000_000,
    supabaseUrl: SUPABASE_URL,
    supabaseServiceRoleKey: "service-role",
    supabaseRpcKey: "anon-role",
    sttBucket: "forge-workpieces",
    disableForgeLaneAi: false,
    disableExpensiveAiActions: false,
    disableCdcGeneration: false,
    ...overrides,
  };
}

function buildAnvilConfig(overrides: Partial<AnvilWhisperRuntimeConfig> = {}): AnvilWhisperRuntimeConfig {
  return {
    apiKey: "test-openai-key",
    sttModel: "gpt-4o-mini-transcribe",
    configuredBillingMode: "forge",
    supabaseUrl: SUPABASE_URL,
    supabaseServiceRoleKey: "service-role",
    ...overrides,
  };
}

function buildEpisodeContext() {
  return {
    episodeId: EPISODE_ID,
    workspaceId: WORKSPACE_ID,
    title: "Matrix Episode",
    titleVariants: { A: "", B: "", C: "" },
    outline: "",
    body: "",
    tonePreset: null,
    sources: [],
    sparks: [],
  };
}

async function runTest1HearthChatHappyPath(): Promise<void> {
  const backend = new MockMatrixBackend();
  backend.install();
  try {
    const actionId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const handler = createHearthAiHandler(buildHearthConfig());
    const response = await handler(new Request(`http://localhost${HEARTH_AI_ROUTES.chat}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ACCESS_TOKEN}`,
      },
      body: JSON.stringify({
        lane: "forge",
        action_id: actionId,
        messages: [{ role: "user", content: "Draft this quickly" }],
        episode_context: buildEpisodeContext(),
        behavior: "careful",
      }),
    }));

    assert.equal(response.status, 200, await response.clone().text());
    const payload = await response.json() as Record<string, unknown>;
    assert.equal(payload.ok, true);
    assert((payload.actual_cost_usd as number) > 0);
    assert((payload.billable_tokens as number) > 0);

    const successRows = backend.usageEvents.filter((row) => row.status === "success" && row.action_id === actionId);
    assert.equal(successRows.length, 1);

    assert.equal(backend.deltaCalls.length, 1);
    assert.equal(backend.deltaCalls[0]?.p_request_id, actionId);
    assert(backend.deltaCalls[0]?.p_delta < 0);
    assert.equal(backend.chargedRequestIds.size, 1);
  } finally {
    backend.restore();
  }
}

async function runTest2HearthSttHappyPath(): Promise<void> {
  const backend = new MockMatrixBackend();
  backend.install();
  try {
    const actionId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    const handler = createHearthAiHandler(buildHearthConfig());
    const response = await handler(new Request(`http://localhost${HEARTH_AI_ROUTES.stt}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ACCESS_TOKEN}`,
      },
      body: JSON.stringify({
        lane: "forge",
        action_id: actionId,
        workpiece_id: WORKPIECE_ID,
        storage_key: `workpieces/${WORKPIECE_ID}/stt/chunk.webm`,
        mime_type: "audio/webm",
      }),
    }));

    assert.equal(response.status, 200, await response.clone().text());
    const payload = await response.json() as Record<string, unknown>;
    assert.equal(payload.ok, true);
    assert((payload.actual_cost_usd as number) > 0);
    assert((payload.billable_tokens as number) > 0);

    const successRows = backend.usageEvents.filter((row) => row.status === "success" && row.action_id === actionId);
    assert.equal(successRows.length, 1);
    assert.equal(backend.deltaCalls.length, 1);
    assert.equal(backend.deltaCalls[0]?.p_request_id, actionId);
    assert(backend.deltaCalls[0]?.p_delta < 0);
    assert.equal(backend.chargedRequestIds.size, 1);
  } finally {
    backend.restore();
  }
}

async function runTest3AnvilHappyPath(): Promise<void> {
  const backend = new MockMatrixBackend();
  backend.install();
  try {
    const handler = createAnvilWhisperHandler(buildAnvilConfig());
    const explicitActionId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

    const formWithAction = new FormData();
    formWithAction.set("lane", "forge");
    formWithAction.set("action_id", explicitActionId);
    formWithAction.set("operation_created_at", "2026-10-24T12:00:00.000Z");
    formWithAction.set("file", new Blob(["audio"], { type: "audio/webm" }), "audio.webm");

    const firstResponse = await handler(new Request(`http://localhost${ANVIL_WHISPER_ROUTE}`, {
      method: "POST",
      headers: { authorization: `Bearer ${ACCESS_TOKEN}` },
      body: formWithAction,
    }));

    assert.equal(firstResponse.status, 200, await firstResponse.clone().text());

    const formWithoutAction = new FormData();
    formWithoutAction.set("lane", "forge");
    formWithoutAction.set("operation_created_at", "2026-10-24T12:00:01.000Z");
    formWithoutAction.set("file", new Blob(["audio"], { type: "audio/webm" }), "audio.webm");

    const secondResponse = await handler(new Request(`http://localhost${ANVIL_WHISPER_ROUTE}`, {
      method: "POST",
      headers: { authorization: `Bearer ${ACCESS_TOKEN}` },
      body: formWithoutAction,
    }));

    assert.equal(secondResponse.status, 200, await secondResponse.clone().text());

    assert.equal(backend.sttCalls, 2);
    assert.equal(backend.deltaCalls.length, 0, "owner-cost ASR must not mutate customer token balances");
    assert.equal(backend.usageEvents.filter((row) => row.subfeature === "anvil_whisper").length, 0);
    assert.equal(backend.ownerCostCalls.filter((name) => name === "establish_owner_cost_operation").length, 2);
    assert.equal(backend.ownerCostCalls.filter((name) => name === "authorize_owner_cost_provider_attempt").length, 2);
    assert.equal(backend.ownerCostCalls.filter((name) => name === "record_owner_cost_valuation").length, 2);
  } finally {
    backend.restore();
  }
}

async function runTest4MissingAuthBlocked(): Promise<void> {
  {
    const backend = new MockMatrixBackend();
    backend.install();
    try {
      const handler = createHearthAiHandler(buildHearthConfig());
      const response = await handler(new Request(`http://localhost${HEARTH_AI_ROUTES.chat}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          lane: "forge",
          messages: [{ role: "user", content: "Draft this" }],
          episode_context: buildEpisodeContext(),
        }),
      }));

      assert.equal(response.status, 401);
      assert.equal(backend.deltaCalls.length, 0);
      assert.equal(backend.usageEvents.length, 0);
    } finally {
      backend.restore();
    }
  }

  {
    const backend = new MockMatrixBackend();
    backend.install();
    try {
      const handler = createHearthAiHandler(buildHearthConfig());
      const response = await handler(new Request(`http://localhost${HEARTH_AI_ROUTES.stt}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          lane: "forge",
          workpiece_id: WORKPIECE_ID,
          storage_key: `workpieces/${WORKPIECE_ID}/stt/chunk.webm`,
        }),
      }));

      assert.equal(response.status, 401);
      assert.equal(backend.deltaCalls.length, 0);
      assert.equal(backend.usageEvents.length, 0);
    } finally {
      backend.restore();
    }
  }

  {
    const backend = new MockMatrixBackend();
    backend.install();
    try {
      const handler = createAnvilWhisperHandler(buildAnvilConfig());
      const form = new FormData();
      form.set("lane", "forge");
      form.set("file", new Blob(["audio"], { type: "audio/webm" }), "audio.webm");

      const response = await handler(new Request(`http://localhost${ANVIL_WHISPER_ROUTE}`, {
        method: "POST",
        body: form,
      }));

      assert.equal(response.status, 401);
      assert.equal(backend.deltaCalls.length, 0);
      assert.equal(backend.usageEvents.length, 0);
    } finally {
      backend.restore();
    }
  }
}

async function runTest5ForcedDeductionFailure(): Promise<void> {
  const runOne = async (kind: "chat" | "stt", actionId: string): Promise<void> => {
    const backend = new MockMatrixBackend();
    backend.failDeduction = true;
    backend.install();
    try {
      if (kind === "chat") {
        const handler = createHearthAiHandler(buildHearthConfig());
        const response = await handler(new Request(`http://localhost${HEARTH_AI_ROUTES.chat}`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${ACCESS_TOKEN}`,
          },
          body: JSON.stringify({
            lane: "forge",
            action_id: actionId,
            messages: [{ role: "user", content: "Draft this" }],
            episode_context: buildEpisodeContext(),
            behavior: "careful",
          }),
        }));
        assert.equal(response.status, 502);
        const payload = await response.json() as Record<string, unknown>;
        assert.equal(payload.code, "forge_deduction_failed");
      } else if (kind === "stt") {
        const handler = createHearthAiHandler(buildHearthConfig());
        const response = await handler(new Request(`http://localhost${HEARTH_AI_ROUTES.stt}`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${ACCESS_TOKEN}`,
          },
          body: JSON.stringify({
            lane: "forge",
            action_id: actionId,
            workpiece_id: WORKPIECE_ID,
            storage_key: `workpieces/${WORKPIECE_ID}/stt/chunk.webm`,
            mime_type: "audio/webm",
          }),
        }));
        assert.equal(response.status, 502);
        const payload = await response.json() as Record<string, unknown>;
        assert.equal(payload.code, "forge_deduction_failed");
      }

      const successRows = backend.usageEvents.filter((row) => row.status === "success" && row.action_id === actionId);
      assert.equal(successRows.length, 1);
    } finally {
      backend.restore();
    }
  };

  await runOne("chat", "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee");
  await runOne("stt", "ffffffff-ffff-4fff-8fff-ffffffffffff");
}

async function runTest6DuplicateActionRetryNoDoubleCharge(): Promise<void> {
  const backend = new MockMatrixBackend();
  backend.install();
  try {
    const actionId = "66666666-7777-4888-8999-aaaaaaaaaaaa";
    const handler = createHearthAiHandler(buildHearthConfig());

    for (let i = 0; i < 2; i += 1) {
      const response = await handler(new Request(`http://localhost${HEARTH_AI_ROUTES.chat}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${ACCESS_TOKEN}`,
        },
        body: JSON.stringify({
          lane: "forge",
          action_id: actionId,
          messages: [{ role: "user", content: "Retry-safe draft" }],
          episode_context: buildEpisodeContext(),
          behavior: "careful",
        }),
      }));
      assert.equal(response.status, 200);
    }

    assert.equal(backend.deltaCalls.length, 2);
    assert.equal(backend.deltaCalls[0]?.p_request_id, actionId);
    assert.equal(backend.deltaCalls[1]?.p_request_id, actionId);
    assert.equal(backend.chargedRequestIds.size, 1);

    const successRows = backend.usageEvents.filter((row) => row.status === "success" && row.action_id === actionId);
    assert.equal(successRows.length, 2);
  } finally {
    backend.restore();
  }
}

async function runTest7CurrentGpt5RequestShape(): Promise<void> {
  const backend = new MockMatrixBackend();
  backend.scriptReply = "Welcome to the Forge. Today we will verify our runtime contracts before recording, so each step has a clear input, a reliable output, and a recovery path when something goes wrong.";
  backend.install();
  try {
    const handler = createHearthAiHandler(buildHearthConfig({ model: "gpt-5.3" }));
    const response = await handler(new Request(`http://localhost${HEARTH_AI_ROUTES.chat}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ACCESS_TOKEN}`,
      },
      body: JSON.stringify({
        lane: "forge",
        action_id: "77777777-8888-4999-8aaa-bbbbbbbbbbbb",
        messages: [{ role: "user", content: "Draft a complete podcast intro about runtime contract verification. Do not ask questions." }],
        episode_context: buildEpisodeContext(),
        behavior: "creative",
      }),
    }));

    assert.equal(response.status, 200, await response.clone().text());
    const payload = await response.json() as Record<string, unknown>;
    assert.equal(payload.ok, true);
    assert.equal(backend.chatCalls, 1);
    const bodyOp = (payload.ops as Array<{ op: string; value: string }>).find((op) => op.op === "set_body");
    assert.ok(bodyOp, "the substantive provider fixture must produce a validated script operation");
    assert.equal(bodyOp.value.replace(/^\[\/?s\d+\]$/gm, "").replace(/\s+/g, " ").trim(), backend.scriptReply);
  } finally {
    backend.restore();
  }
}

async function runPolicyAuthorityMatrix(): Promise<void> {
  for (const policyReply of ["soft_deny", "hard_deny", "missing", "malformed", "unavailable"] as const) {
    const backend = new MockMatrixBackend();
    backend.policyReply = policyReply;
    backend.install();
    try {
      const handler = createHearthAiHandler(buildHearthConfig());
      const response = await handler(new Request(`http://localhost${HEARTH_AI_ROUTES.chat}`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${ACCESS_TOKEN}` },
        body: JSON.stringify({
          lane: "forge",
          action_id: `88888888-8888-4888-8888-${String(["soft_deny", "hard_deny", "missing", "malformed", "unavailable"].indexOf(policyReply) + 1).padStart(12, "0")}`,
          messages: [{ role: "user", content: "Draft a complete podcast introduction about authority testing. Use the supplied episode context and do not ask clarifying questions." }],
          episode_context: buildEpisodeContext(),
          behavior: "creative",
        }),
      }));
      const body = await response.clone().text();
      assert.notEqual(response.status, 200, `${policyReply} unexpectedly allowed: ${body}`);
      assert.equal(backend.chatCalls, 0, `${policyReply} reached generation`);
      assert.equal(backend.deltaCalls.length, 0, `${policyReply} reached billing`);
      if (policyReply === "soft_deny" || policyReply === "hard_deny") {
        assert.equal(response.status, 403, `${policyReply} response: ${body}`);
      } else {
        assert.equal(response.status, 500, `${policyReply} response: ${body}`);
      }
    } finally {
      backend.restore();
    }
  }
}

async function runInsufficientFundsBlockedBeforeGeneration(): Promise<void> {
  const backend = new MockMatrixBackend(0);
  backend.install();
  try {
    const handler = createHearthAiHandler(buildHearthConfig({ initialTokenBalance: 0 }));
    const response = await handler(new Request(`http://localhost${HEARTH_AI_ROUTES.chat}`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${ACCESS_TOKEN}` },
      body: JSON.stringify({
        lane: "forge",
        action_id: "99999999-9999-4999-8999-999999999999",
        messages: [{ role: "user", content: "Do not spend unavailable credits" }],
        episode_context: buildEpisodeContext(),
      }),
    }));
    assert.equal(response.status, 402, await response.clone().text());
    assert.equal(backend.chatCalls, 0);
    assert.equal(backend.deltaCalls.length, 0);
  } finally {
    backend.restore();
  }
}

async function runOwnerAuthorityFailClosedMatrix(): Promise<void> {
  for (const ownerAuthorityReply of ["missing", "mismatched"] as const) {
    const backend = new MockMatrixBackend();
    backend.ownerAuthorityReply = ownerAuthorityReply;
    backend.install();
    try {
      const handler = createHearthAiHandler(buildHearthConfig());
      const response = await handler(new Request(`http://localhost${HEARTH_AI_ROUTES.chat}`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${ACCESS_TOKEN}` },
        body: JSON.stringify({
          lane: "forge",
          action_id: ownerAuthorityReply === "missing"
            ? "aaaaaaaa-0000-4000-8000-000000000001"
            : "aaaaaaaa-0000-4000-8000-000000000002",
          messages: [{ role: "user", content: "Do not execute without valid owner authority." }],
          episode_context: buildEpisodeContext(),
        }),
      }));
      const payload = await response.json() as Record<string, unknown>;
      assert.equal(response.status, 403, JSON.stringify(payload));
      assert.equal(
        payload.code,
        ownerAuthorityReply === "missing" ? "owner_authority_unavailable" : "owner_authority_mismatch",
      );
      assert.equal(backend.chatCalls, 0);
      assert.equal(backend.deltaCalls.length, 0);
    } finally {
      backend.restore();
    }
  }
}

async function main(): Promise<void> {
  await runTest1HearthChatHappyPath();
  await runTest2HearthSttHappyPath();
  await runTest3AnvilHappyPath();
  await runTest4MissingAuthBlocked();
  await runTest5ForcedDeductionFailure();
  await runTest6DuplicateActionRetryNoDoubleCharge();
  await runTest7CurrentGpt5RequestShape();
  await runPolicyAuthorityMatrix();
  await runInsufficientFundsBlockedBeforeGeneration();
  await runOwnerAuthorityFailClosedMatrix();

  console.log("Forge money-path matrix passed, including owner-cost ASR, customer policy denial/failure, billing, insufficient funds, and idempotent replay.");
}

main().catch((error) => {
  console.error("Forge money-path matrix failed:", error);
  process.exit(1);
});
