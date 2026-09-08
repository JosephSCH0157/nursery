import assert from "node:assert/strict";
import test from "node:test";
import { createHearthAiHandler } from "../server/hearth/create-hearth-ai-handler";
import { fingerprintPaidHearthChatRequest } from "../server/hearth/hearth-paid-chat-execution";
import type { HearthRuntimeConfig } from "../server/hearth/hearth-runtime-config";

const USER_ID = "44444444-4444-4444-8444-444444444444";
const RESERVATION_ID = "11111111-1111-4111-8111-111111111111";
const QUOTE_ID = "22222222-2222-4222-8222-222222222222";
const BUDGET_ID = "33333333-3333-4333-8333-333333333333";
const OPERATION_ID = "hearth-chat-handler-fake-1";
const USER_MESSAGE = "Write one neutral sentence describing a quiet morning in a studio.";
const FINGERPRINT = fingerprintPaidHearthChatRequest({
  schema: "forge.hearth.paid-chat-request.v1",
  route_code: "hearth.chat_completion",
  workspace_id: null,
  workpiece_id: "episode-1",
  lane: "forge",
  messages: [{ role: "user", content: USER_MESSAGE }],
  user_authored_text: USER_MESSAGE,
  behavior: null,
});

test("the real Hearth chat handler requires funding before its one fake OpenAI call and settles after persistence", async () => {
  const gateCalls: string[] = [];
  let providerCalls = 0;
  const gate = {
    async rpc(name: string, _args: Record<string, unknown>) {
      gateCalls.push(name);
      if (name === "read_openai_text_route_execution_requirement") {
        return { data: { mode: "enforce", funding_context_required: true }, error: null };
      }
      if (name === "resolve_hearth_chat_paid_execution_context") {
        return {
          data: {
            operation_id: OPERATION_ID,
            reservation_id: RESERVATION_ID,
            quote_id: QUOTE_ID,
            funding_source_type: "owner_budget",
            funding_source_id: BUDGET_ID,
            credential_funding: "forge",
            model: "gpt-5.3-chat-latest",
            maximum_input_units: 2000,
            maximum_output_units: 512,
            maximum_attempts: 1,
            maximum_failure_exposure_micros: 20668,
            direct_provider_ceiling_micros: 10668,
            supporting_cost_ceiling_micros: 10000,
            input_micros_per_million_tokens: 1750000,
            output_micros_per_million_tokens: 14000000,
            reservation_state: "reserved",
          },
          error: null,
        };
      }
      if (name === "authorize_openai_text_provider_attempt") {
        return { data: { provider_execution_authorized: true }, error: null };
      }
      if (name === "settle_owner_operation") {
        return { data: { customer_charge_micros: 0 }, error: null };
      }
      return { data: {}, error: null };
    },
  };
  const config: HearthRuntimeConfig = {
    textApiKey: "fake-forge-key",
    imageApiKey: null,
    researchApiKey: null,
    apiKey: "fake-forge-key",
    model: "gpt-5.3",
    sttModel: "gpt-4o-mini-transcribe",
    configuredBillingMode: "forge",
    initialTokenBalance: 42,
    supabaseUrl: null,
    supabaseServiceRoleKey: null,
    supabaseRpcKey: null,
    sttBucket: "forge-workpieces",
    disableForgeLaneAi: false,
    disableUserKeys: false,
    disableExpensiveAiActions: false,
    disableCdcGeneration: false,
    openAiTextGate: gate,
    resolveUserIdForAccessToken: async () => USER_ID,
    openAiProviderFetch: async (_url, init) => {
      providerCalls += 1;
      const request = JSON.parse(String(init?.body ?? "{}")) as { model?: string };
      assert.equal(request.model, "gpt-5.3-chat-latest");
      assert.ok(gateCalls.includes("authorize_openai_text_provider_attempt"));
      return new Response(JSON.stringify({
        id: "chatcmpl_handler_fake",
        choices: [{ message: { content: "This is a neutral bounded answer." } }],
        usage: { prompt_tokens: 90, completion_tokens: 8 },
      }), { status: 200, headers: { "x-request-id": "req_handler_fake_1" } });
    },
  };
  const handler = createHearthAiHandler(config);
  const response = await handler(new Request("http://localhost/api/hearth/chat", {
    method: "POST",
    headers: { authorization: "Bearer fake-user-token", "content-type": "application/json" },
    body: JSON.stringify({
      lane: "forge",
      messages: [{ role: "user", content: USER_MESSAGE }],
      user_authored_text: USER_MESSAGE,
      attachment_context: { include_episode_attachments: false, attachment_ids: [] },
      episode_context: {
        episodeId: "episode-1",
        workspaceId: null,
        title: "Bounded test",
        titleVariants: { A: "", B: "", C: "" },
        outline: "",
        body: "",
        tonePreset: null,
        sources: [],
        sparks: [],
      },
      paid_execution: {
        operation_id: OPERATION_ID,
        reservation_id: RESERVATION_ID,
        request_fingerprint: FINGERPRINT,
      },
    }),
  }));
  const payload = await response.json() as Record<string, any>;
  assert.equal(response.status, 200, JSON.stringify(payload));
  assert.equal(providerCalls, 1);
  assert.equal(payload.assistant_text, "This is a neutral bounded answer.");
  assert.equal(payload.billing_receipt.status, "settled");
  assert.equal(payload.billing_receipt.customer_charge_micros, 0);
  assert.ok(gateCalls.indexOf("authorize_openai_text_provider_attempt") < gateCalls.indexOf("persist_hearth_chat_paid_result"));
  assert.ok(gateCalls.indexOf("persist_hearth_chat_paid_result") < gateCalls.indexOf("settle_owner_operation"));
  assert.equal(gateCalls.includes("reserve_operation"), false);
});

test("the enforced Hearth route rejects a missing funding handle before OpenAI", async () => {
  let providerCalls = 0;
  const config = {
    textApiKey: "fake-forge-key",
    imageApiKey: null,
    researchApiKey: null,
    apiKey: "fake-forge-key",
    model: "gpt-5.3",
    sttModel: "gpt-4o-mini-transcribe",
    configuredBillingMode: "forge" as const,
    initialTokenBalance: 42,
    supabaseUrl: null,
    supabaseServiceRoleKey: null,
    supabaseRpcKey: null,
    sttBucket: "forge-workpieces",
    disableForgeLaneAi: false,
    disableUserKeys: false,
    disableExpensiveAiActions: false,
    disableCdcGeneration: false,
    openAiTextGate: {
      async rpc(name: string) {
        if (name === "read_openai_text_route_execution_requirement") {
          return { data: { mode: "enforce", funding_context_required: true }, error: null };
        }
        return { data: {}, error: null };
      },
    },
    resolveUserIdForAccessToken: async () => USER_ID,
    openAiProviderFetch: async () => { providerCalls += 1; return new Response(); },
  } satisfies HearthRuntimeConfig;
  const response = await createHearthAiHandler(config)(new Request("http://localhost/api/hearth/chat", {
    method: "POST",
    headers: { authorization: "Bearer fake-user-token", "content-type": "application/json" },
    body: JSON.stringify({
      lane: "forge",
      messages: [{ role: "user", content: "Write one neutral sentence describing a quiet morning in a studio." }],
      episode_context: { episodeId: "episode-1", title: "", titleVariants: { A: "", B: "", C: "" }, outline: "", body: "", sources: [], sparks: [] },
    }),
  }));
  assert.equal(response.status, 402);
  assert.equal(providerCalls, 0);
});
