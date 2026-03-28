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
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

class MockMatrixBackend {
  public usageEvents: UsageEventRow[] = [];
  public deltaCalls: DeltaRpcRow[] = [];
  public chargedRequestIds = new Set<string>();
  public chatCalls = 0;
  public sttCalls = 0;
  public tokenBalance: number;
  public failDeduction = false;
  public chatTemperature400Once = false;

  private readonly originalFetch: typeof fetch;
  private chatTemperature400Used = false;

  constructor(initialBalance = 10_000) {
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
                  ops: [],
                  scriptText: null,
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
    model: "gpt-5.4-mini",
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

    assert.equal(response.status, 200);
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

    assert.equal(response.status, 200);
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
    formWithAction.set("file", new Blob(["audio"], { type: "audio/webm" }), "audio.webm");

    const firstResponse = await handler(new Request(`http://localhost${ANVIL_WHISPER_ROUTE}`, {
      method: "POST",
      headers: { authorization: `Bearer ${ACCESS_TOKEN}` },
      body: formWithAction,
    }));

    assert.equal(firstResponse.status, 200);

    const formWithoutAction = new FormData();
    formWithoutAction.set("lane", "forge");
    formWithoutAction.set("file", new Blob(["audio"], { type: "audio/webm" }), "audio.webm");

    const secondResponse = await handler(new Request(`http://localhost${ANVIL_WHISPER_ROUTE}`, {
      method: "POST",
      headers: { authorization: `Bearer ${ACCESS_TOKEN}` },
      body: formWithoutAction,
    }));

    assert.equal(secondResponse.status, 200);

    const successRows = backend.usageEvents.filter((row) => row.status === "success" && row.subfeature === "anvil_whisper");
    assert.equal(successRows.length, 2);

    assert.equal(backend.deltaCalls.length, 2);
    assert.equal(backend.deltaCalls[0]?.p_request_id, explicitActionId);
    assert(UUID_RE.test(backend.deltaCalls[1]?.p_request_id ?? ""));
    assert.notEqual(backend.deltaCalls[1]?.p_request_id, explicitActionId);
    assert.equal(backend.chargedRequestIds.size, 2);
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
  const runOne = async (kind: "chat" | "stt" | "anvil", actionId: string): Promise<void> => {
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
      } else {
        const handler = createAnvilWhisperHandler(buildAnvilConfig());
        const form = new FormData();
        form.set("lane", "forge");
        form.set("action_id", actionId);
        form.set("file", new Blob(["audio"], { type: "audio/webm" }), "audio.webm");

        const response = await handler(new Request(`http://localhost${ANVIL_WHISPER_ROUTE}`, {
          method: "POST",
          headers: { authorization: `Bearer ${ACCESS_TOKEN}` },
          body: form,
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
  await runOne("anvil", "11111111-2222-4333-8444-555555555555");
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

async function runTest7TemperatureFallbackAttempt(): Promise<void> {
  const backend = new MockMatrixBackend();
  backend.chatTemperature400Once = true;
  backend.install();
  try {
    const handler = createHearthAiHandler(buildHearthConfig({ model: "gpt-4o-mini" }));
    const response = await handler(new Request(`http://localhost${HEARTH_AI_ROUTES.chat}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ACCESS_TOKEN}`,
      },
      body: JSON.stringify({
        lane: "forge",
        action_id: "77777777-8888-4999-8aaa-bbbbbbbbbbbb",
        messages: [{ role: "user", content: "Fallback check" }],
        episode_context: buildEpisodeContext(),
        behavior: "creative",
      }),
    }));

    // Current production allowlist is GPT-5.4 family only, so this path is blocked before upstream call.
    assert.equal(response.status, 503);
    const payload = await response.json() as Record<string, unknown>;
    assert.equal(payload.code, "model_not_allowlisted");
    assert.equal(backend.chatCalls, 0);
  } finally {
    backend.restore();
  }
}

async function main(): Promise<void> {
  await runTest1HearthChatHappyPath();
  await runTest2HearthSttHappyPath();
  await runTest3AnvilHappyPath();
  await runTest4MissingAuthBlocked();
  await runTest5ForcedDeductionFailure();
  await runTest6DuplicateActionRetryNoDoubleCharge();
  await runTest7TemperatureFallbackAttempt();

  console.log("Forge money-path matrix passed (Tests 1-6) and Test 7 is policy-blocked by model allowlist as expected.");
}

main().catch((error) => {
  console.error("Forge money-path matrix failed:", error);
  process.exit(1);
});
