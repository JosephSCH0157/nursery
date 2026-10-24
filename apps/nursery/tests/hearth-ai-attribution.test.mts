import assert from "node:assert/strict";
import test from "node:test";
import { encryptUserAiKey } from "../../../packages/tongs/src/server/ai-key-crypto";
import { createHearthAiHandler } from "../server/hearth/create-hearth-ai-handler";
import { fingerprintPaidHearthChatRequest } from "../server/hearth/hearth-paid-chat-execution";
import type { HearthRuntimeConfig } from "../server/hearth/hearth-runtime-config";
import { HEARTH_AI_ROUTES } from "../../hearth/src/lib/hearth-ai-runtime-contract";

const SUPABASE_URL = "https://attribution-test.supabase.co";
const USER_ID = "b1111111-1111-4111-8111-111111111111";
const ACCESS_TOKEN = "attribution-token";
const WORKSPACE_ID = "b2222222-2222-4222-8222-222222222222";
const WORKPIECE_ID = "b3333333-3333-4333-8333-333333333333";
const OPERATION_ID = "hearth-attribution-funded-operation";
const RESERVATION_ID = "b4444444-4444-4444-8444-444444444444";
const QUOTE_ID = "b5555555-5555-4555-8555-555555555555";
const USER_MESSAGE = "Write one neutral sentence describing a quiet morning in a studio.";
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
  public providerCalls = 0;
  public gateCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
  public requirementUnavailable = false;
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
        this.providerCalls += 1;
        return new Response(JSON.stringify({
          choices: [{ message: { content: JSON.stringify({ assistantText: "ok", ops: [], scriptText: null, tagAudit: null }) } }],
          usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
        }), { status: 200, headers: { "content-type": "application/json", "x-request-id": "req-attr" } });
      }

      if (url.endsWith("/auth/v1/user")) {
        return new Response(JSON.stringify({ id: USER_ID }), { status: 200, headers: { "content-type": "application/json" } });
      }

      if (url.includes("/rest/v1/rpc/resolve_ai_access_policy") && init?.method === "POST") {
        return new Response(JSON.stringify([this.policy]), { status: 200, headers: { "content-type": "application/json" } });
      }

      if (url.includes("/rest/v1/rpc/resolve_transition_owner_authority") && init?.method === "POST") {
        return new Response(JSON.stringify({
          user_id: USER_ID,
          canonical_user_id: USER_ID,
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
        }), { status: 200, headers: { "content-type": "application/json" } });
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

      if (url.includes("/rest/v1/workspace_members") && init?.method === "GET") {
        return new Response(JSON.stringify([]), { status: 200, headers: { "content-type": "application/json" } });
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

  async rpc(name: string, args: Record<string, unknown> = {}) {
    this.gateCalls.push({ name, args: structuredClone(args) });
    if (name === "read_openai_execution_requirement") {
      if (this.requirementUnavailable) {
        return { data: null, error: { message: "funding requirement metadata unavailable" } };
      }
      return { data: {
        mode: "enforce",
        funding_context_required: args.p_credential_funding === "forge",
      }, error: null };
    }
    if (name === "resolve_openai_text_paid_execution_context") {
      const context = {
        operation_id: OPERATION_ID,
        reservation_id: RESERVATION_ID,
        quote_id: QUOTE_ID,
        route_code: "hearth.chat_completion",
        funding_source_type: "customer_deposit",
        funding_source_id: "b6666666-6666-4666-8666-666666666666",
        funding_environment: "test",
        credential_funding: "forge",
        model: "gpt-5.3",
        maximum_input_units: 20_000,
        maximum_output_units: 512,
        maximum_attempts: 1,
        maximum_failure_exposure_micros: 20_668,
        direct_provider_ceiling_micros: 10_668,
        supporting_cost_ceiling_micros: 10_000,
        input_micros_per_million_tokens: 1_750_000,
        cached_input_micros_per_million_tokens: 175_000,
        output_micros_per_million_tokens: 14_000_000,
        reservation_state: "reserved",
      };
      return { data: context, error: null };
    }
    if (name === "acquire_openai_text_aggregate_admission") {
      return { data: { enforcement_enabled: true, authorized: true, hold_id: "attribution-hold" }, error: null };
    }
    if (name === "authorize_openai_text_provider_attempt"
      || name === "authorize_openai_text_provider_attempt_with_aggregate") {
      return { data: { provider_execution_authorized: true }, error: null };
    }
    if (name === "settle_customer_operation" || name === "settle_owner_operation") {
      return { data: { customer_charge_micros: 1_000 }, error: null };
    }
    return { data: {}, error: null };
  }
}

function buildConfig(backend: AttributionBackend, overrides: Partial<HearthRuntimeConfig> = {}): HearthRuntimeConfig {
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
    openAiTextGate: backend,
    resolveUserIdForAccessToken: async (accessToken) => accessToken === ACCESS_TOKEN ? USER_ID : null,
    openAiProviderFetch: (input, init) => globalThis.fetch(input, init),
    ...overrides,
  };
}

function buildEpisodeContext() {
  return {
    episodeId: WORKPIECE_ID,
    workspaceId: WORKSPACE_ID,
    title: "Episode",
    titleVariants: { A: "", B: "", C: "" },
    outline: "",
    body: "",
    tonePreset: null,
    sources: [],
    sparks: [],
  };
}

const FUNDED_REQUEST_FINGERPRINT = fingerprintPaidHearthChatRequest({
  schema: "forge.hearth.paid-chat-request.v1",
  route_code: "hearth.chat_completion",
  workspace_id: WORKSPACE_ID,
  workpiece_id: WORKPIECE_ID,
  lane: "forge",
  messages: [{ role: "user", content: USER_MESSAGE }],
  user_authored_text: USER_MESSAGE,
  behavior: null,
});

async function invokeChat(
  handler: ReturnType<typeof createHearthAiHandler>,
  lane: "forge" | "byo",
  fundedForge = false,
): Promise<Response> {
  return handler(new Request(`http://localhost${HEARTH_AI_ROUTES.chat}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${ACCESS_TOKEN}`,
    },
    body: JSON.stringify({
      lane,
      action_id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      messages: [{ role: "user", content: USER_MESSAGE }],
      attachment_context: { include_episode_attachments: false, attachment_ids: [] },
      episode_context: buildEpisodeContext(),
      ...(fundedForge ? { paid_execution: {
        operation_id: OPERATION_ID,
        reservation_id: RESERVATION_ID,
        request_fingerprint: FUNDED_REQUEST_FINGERPRINT,
        funding_environment: "test",
      } } : {}),
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
    const response = await invokeChat(createHearthAiHandler(buildConfig(backend)), "forge", true);
    assert.equal(response.status, 200, await response.clone().text());
    const success = backend.usageEvents.find((row) => row.status === "success");
    assert.equal(backend.providerCalls, 1);
    assert.ok(backend.gateCalls.some((call) => call.name === "authorize_openai_text_provider_attempt_with_aggregate"));
    assert.ok(backend.gateCalls.some((call) => call.name === "persist_hearth_chat_paid_result"));
    assert.ok(backend.gateCalls.some((call) => call.name === "record_paid_operation_aggregate_outcome"));
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
    const response = await invokeChat(createHearthAiHandler(buildConfig(backend)), "byo");
    assert.equal(response.status, 200, await response.clone().text());
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
    const response = await invokeChat(createHearthAiHandler(buildConfig(backend)), "forge", true);
    assert.equal(response.status, 403);
    const denial = backend.usageEvents.find((row) => row.status === "error");
    assert.equal(denial?.policy_decision_type, "HARD_DENY");
    assert.equal(denial?.key_resolution_status, "policy_denied");
    assert.equal(denial?.total_tokens, 0);
    assert.equal(backend.providerCalls, 0);
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
    const response = await invokeChat(createHearthAiHandler(buildConfig(backend)), "byo");
    assert.equal(response.status, 422);
    const missing = backend.usageEvents.find((row) => row.status === "error");
    assert.equal(missing?.key_resolution_status, "missing_required_key");
    assert.equal(missing?.policy_reason_code, "PERSONAL_AI_REQUIRED_NOT_CONFIGURED");
    assert.equal(backend.providerCalls, 0);
  } finally {
    backend.restore();
  }
});

test("kill switch forces forge attribution and snapshot shows why", async () => {
  const backend = new AttributionBackend();
  backend.policy = { ...backend.policy, selected_funding_source: "personal_byo_key" };
  backend.install();
  try {
    const response = await invokeChat(createHearthAiHandler(buildConfig(backend, { disableUserKeys: true })), "forge", true);
    assert.equal(response.status, 200, await response.clone().text());
    assert.equal(backend.providerCalls, 1);
    assert.ok(backend.gateCalls.some((call) => call.name === "persist_hearth_chat_paid_result"));
  } finally {
    backend.restore();
  }
});

test("funded Forge execution records a paid aggregate outcome after provider execution", async () => {
  const backend = new AttributionBackend();
  backend.policy = { ...backend.policy, selected_funding_source: "forge_managed_credits" };
  backend.install();
  try {
    const response = await invokeChat(createHearthAiHandler(buildConfig(backend)), "forge", true);
    assert.equal(response.status, 200, await response.clone().text());
    const outcomes = backend.gateCalls.filter((call) => call.name === "record_paid_operation_aggregate_outcome");
    assert.ok(outcomes.length >= 1);
    assert.ok(outcomes.some((call) => call.args.p_outcome === "settled_unconfirmed"));
    assert.equal(backend.providerCalls, 1);
  } finally {
    backend.restore();
  }
});

test("incomplete Forge funding metadata fails closed before provider attribution", async () => {
  const backend = new AttributionBackend();
  backend.requirementUnavailable = true;
  backend.install();
  try {
    const response = await invokeChat(createHearthAiHandler(buildConfig(backend)), "forge", true);
    assert.equal(response.status, 503, await response.clone().text());
    assert.equal(backend.providerCalls, 0);
    assert.equal(backend.usageEvents.some((row) => row.status === "success"), false);
  } finally {
    backend.restore();
  }
});
