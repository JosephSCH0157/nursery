import assert from "node:assert/strict";
import test from "node:test";
import { encryptUserAiKey } from "../../../packages/tongs/src/server/ai-key-crypto";
import { createHearthAiHandler } from "../server/hearth/create-hearth-ai-handler";
import type { HearthRuntimeConfig } from "../server/hearth/hearth-runtime-config";
import { HEARTH_AI_ROUTES } from "../../hearth/src/lib/hearth-ai-runtime-contract";

const SUPABASE_URL = "https://attribution-test.supabase.co";
const USER_ID = "b1111111-1111-4111-8111-111111111111";
const ACCESS_TOKEN = "attribution-token";
const ORIGINAL_SECRET = process.env.FORGE_USER_KEY_ENCRYPTION_SECRET;

type UsageEvent = Record<string, unknown>;

type PolicyRow = {
  decision_type: "ALLOW" | "SOFT_DENY" | "HARD_DENY";
  reason_code: string | null;
  selected_funding_source: "forge_managed_credits" | "personal_byo_key";
  fallback_available: boolean;
  fallback_used: boolean;
  effective_policy_snapshot: Record<string, unknown>;
};

class AttributionBackend {
  public usageEvents: UsageEvent[] = [];
  public policy: PolicyRow = {
    decision_type: "ALLOW",
    reason_code: null,
    selected_funding_source: "forge_managed_credits",
    fallback_available: false,
    fallback_used: false,
    effective_policy_snapshot: {},
  };

  public userKeyStatus: "active" | "missing" = "missing";
  public encryptedUserKey: string | null = null;
  private readonly originalFetch: typeof fetch;

  constructor() {
    this.originalFetch = globalThis.fetch;
  }

  install(): void {
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;

      if (url === "https://api.openai.com/v1/chat/completions") {
        return new Response(JSON.stringify({
          choices: [{ message: { content: JSON.stringify({ assistantText: "ok", ops: [], scriptText: null, tagAudit: null }) } }],
          usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
        }), { status: 200, headers: { "content-type": "application/json", "x-request-id": "req-attr" } });
      }

      if (url.endsWith("/auth/v1/user")) {
        return new Response(JSON.stringify({ id: USER_ID }), { status: 200, headers: { "content-type": "application/json" } });
      }

      if (url.includes("/rest/v1/rpc/resolve_ai_policy") && init?.method === "POST") {
        return new Response(JSON.stringify([this.policy]), { status: 200, headers: { "content-type": "application/json" } });
      }

      if (url.includes("/rest/v1/rpc/get_user_ai_key_for_resolution") && init?.method === "POST") {
        if (this.encryptedUserKey) {
          return new Response(JSON.stringify([{ encrypted_api_key: this.encryptedUserKey, status: "active" }]), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        return new Response(JSON.stringify([]), { status: 200, headers: { "content-type": "application/json" } });
      }

      if (url.includes("/rest/v1/user_ai_keys") && init?.method === "GET") {
        const row = this.userKeyStatus === "active" ? [{ status: "active" }] : [];
        return new Response(JSON.stringify(row), { status: 200, headers: { "content-type": "application/json" } });
      }

      if (url.endsWith("/rest/v1/ai_usage_events") && init?.method === "POST") {
        const body = typeof init.body === "string" ? JSON.parse(init.body) : {};
        this.usageEvents.push(body as UsageEvent);
        return new Response(JSON.stringify([{}]), { status: 201, headers: { "content-type": "application/json" } });
      }

      if (url.includes("/rest/v1/rpc/") && init?.method === "POST") {
        return new Response(JSON.stringify([]), { status: 200, headers: { "content-type": "application/json" } });
      }

      throw new Error(`Unexpected url in attribution backend: ${url}`);
    }) as typeof fetch;
  }

  restore(): void {
    globalThis.fetch = this.originalFetch;
  }
}

function buildConfig(overrides: Partial<HearthRuntimeConfig> = {}): HearthRuntimeConfig {
  return {
    textApiKey: "forge-key",
    imageApiKey: null,
    researchApiKey: null,
    apiKey: "forge-key",
    model: "gpt-5.3",
    sttModel: "gpt-4o-mini-transcribe",
    configuredBillingMode: "forge",
    initialTokenBalance: 999_999,
    supabaseUrl: SUPABASE_URL,
    supabaseServiceRoleKey: "service-role",
    supabaseRpcKey: "rpc-key",
    sttBucket: "forge-workpieces",
    disableForgeLaneAi: false,
    disableUserKeys: false,
    disableExpensiveAiActions: false,
    disableCdcGeneration: false,
    ...overrides,
  };
}

function buildEpisodeContext() {
  return {
    episodeId: "episode-1",
    workspaceId: null,
    title: "Episode",
    titleVariants: { A: "", B: "", C: "" },
    outline: "",
    body: "",
    tonePreset: null,
    sources: [],
    sparks: [],
  };
}

async function invokeChat(handler: ReturnType<typeof createHearthAiHandler>, lane: "forge" | "byo"): Promise<Response> {
  return handler(new Request(`http://localhost${HEARTH_AI_ROUTES.chat}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${ACCESS_TOKEN}`,
    },
    body: JSON.stringify({
      lane,
      action_id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      messages: [{ role: "user", content: "Draft this." }],
      episode_context: buildEpisodeContext(),
      behavior: "careful",
    }),
  }));
}

test.beforeEach(() => {
  process.env.FORGE_USER_KEY_ENCRYPTION_SECRET = "attribution-secret";
});

test.afterEach(() => {
  if (ORIGINAL_SECRET == null) delete process.env.FORGE_USER_KEY_ENCRYPTION_SECRET;
  else process.env.FORGE_USER_KEY_ENCRYPTION_SECRET = ORIGINAL_SECRET;
});

test("forge lane logs forge attribution fields", async () => {
  const backend = new AttributionBackend();
  backend.policy = { ...backend.policy, selected_funding_source: "forge_managed_credits" };
  backend.install();
  try {
    const response = await invokeChat(createHearthAiHandler(buildConfig()), "forge");
    assert.equal(response.status, 200);
    const success = backend.usageEvents.find((row) => row.status === "success");
    assert.equal(success?.key_source, "forge");
    assert.equal(success?.effective_ai_key_source, "forge_managed");
    assert.equal(success?.effective_billing_lane, "forge");
    assert.equal(success?.policy_decision_type, "ALLOW");
  } finally {
    backend.restore();
  }
});

test("byo lane logs byo attribution fields", async () => {
  const backend = new AttributionBackend();
  backend.policy = { ...backend.policy, selected_funding_source: "personal_byo_key" };
  backend.userKeyStatus = "active";
  backend.encryptedUserKey = encryptUserAiKey("sk-user-abc12345678901234");
  backend.install();
  try {
    const response = await invokeChat(createHearthAiHandler(buildConfig()), "byo");
    assert.equal(response.status, 200);
    const success = backend.usageEvents.find((row) => row.status === "success");
    assert.equal(success?.key_source, "byo");
    assert.equal(success?.effective_ai_key_source, "user_byo");
    assert.equal(success?.effective_billing_lane, "byo");
    assert.equal(success?.policy_decision_type, "ALLOW");
  } finally {
    backend.restore();
  }
});

test("policy-denied request logs denial context without execution tokens", async () => {
  const backend = new AttributionBackend();
  backend.policy = {
    decision_type: "HARD_DENY",
    reason_code: "ORG_AI_DISABLED",
    selected_funding_source: "forge_managed_credits",
    fallback_available: false,
    fallback_used: false,
    effective_policy_snapshot: {},
  };
  backend.install();
  try {
    const response = await invokeChat(createHearthAiHandler(buildConfig()), "forge");
    assert.equal(response.status, 403);
    const denial = backend.usageEvents.find((row) => row.status === "error");
    assert.equal(denial?.policy_decision_type, "HARD_DENY");
    assert.equal(denial?.key_resolution_status, "policy_denied");
    assert.equal(denial?.total_tokens, 0);
  } finally {
    backend.restore();
  }
});

test("missing-required-key logs policy-native missing-key context", async () => {
  const backend = new AttributionBackend();
  backend.policy = {
    decision_type: "ALLOW",
    reason_code: null,
    selected_funding_source: "personal_byo_key",
    fallback_available: false,
    fallback_used: false,
    effective_policy_snapshot: {},
  };
  backend.userKeyStatus = "missing";
  backend.encryptedUserKey = null;
  backend.install();
  try {
    const response = await invokeChat(createHearthAiHandler(buildConfig()), "byo");
    assert.equal(response.status, 422);
    const missing = backend.usageEvents.find((row) => row.status === "error");
    assert.equal(missing?.key_resolution_status, "missing_required_key");
    assert.equal(missing?.policy_reason_code, "PERSONAL_AI_REQUIRED_NOT_CONFIGURED");
  } finally {
    backend.restore();
  }
});

test("kill switch forces forge attribution and snapshot shows why", async () => {
  const backend = new AttributionBackend();
  backend.policy = { ...backend.policy, selected_funding_source: "personal_byo_key" };
  backend.install();
  try {
    const response = await invokeChat(createHearthAiHandler(buildConfig({ disableUserKeys: true })), "byo");
    assert.equal(response.status, 200);
    const success = backend.usageEvents.find((row) => row.status === "success");
    assert.equal(success?.key_source, "forge");
    assert.equal(success?.effective_ai_key_source, "forge_managed");
    const snapshot = (success?.policy_snapshot ?? {}) as Record<string, unknown>;
    assert.equal(snapshot.kill_switch_user_keys_disabled, true);
  } finally {
    backend.restore();
  }
});

test("reporting aggregate groups by provider/lane/decision type", async () => {
  const backend = new AttributionBackend();
  backend.policy = { ...backend.policy, selected_funding_source: "forge_managed_credits" };
  backend.install();
  try {
    await invokeChat(createHearthAiHandler(buildConfig()), "forge");
    const grouped = backend.usageEvents.reduce((acc, row) => {
      const key = `${String(row.provider)}|${String(row.effective_billing_lane)}|${String(row.policy_decision_type)}`;
      acc.set(key, (acc.get(key) ?? 0) + 1);
      return acc;
    }, new Map<string, number>());
    assert.equal(grouped.get("openai|forge|ALLOW"), 1);
  } finally {
    backend.restore();
  }
});
