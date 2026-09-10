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
      if (name === "resolve_hearth_chat_paid_execution_context" || name === "resolve_openai_text_paid_execution_context") {
        return {
          data: {
            operation_id: OPERATION_ID,
            reservation_id: RESERVATION_ID,
            quote_id: QUOTE_ID,
            route_code: "hearth.chat_completion",
            funding_source_type: "owner_budget",
            funding_source_id: BUDGET_ID,
            credential_funding: "forge",
            model: "gpt-5.3-chat-latest",
            maximum_input_units: 20000,
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
      if (name === "authorize_openai_text_provider_attempt"
        || name === "authorize_openai_text_provider_attempt_with_aggregate") {
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
      assert.ok(gateCalls.includes("authorize_openai_text_provider_attempt_with_aggregate"));
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
        if (name === "read_existing_openai_text_funding_handle") return { data: {}, error: null };
        if (name === "resolve_openai_text_model_for_funding_quote") return { data: {
          catalog_revision_id: "77777777-7777-4777-8777-777777777777", catalog_revision: 1,
          model_catalog_entry_id: "88888888-8888-4888-8888-888888888888",
          runtime_model_id: "gpt-5.6-luna", provider_model_id: "gpt-5.6-luna",
          display_name: "GPT-5.6 Luna", tradeoff_summary: "Bounded test model.",
        }, error: null };
        if (name === "create_customer_openai_text_quote") return { data: {
          quote_id: QUOTE_ID, operation_id: OPERATION_ID, quote_hash: "b".repeat(64),
          request_fingerprint: "a".repeat(64), currency: "USD", maximum_customer_charge_micros: 20000,
          failure_customer_charge_micros: 0, funding_eligible: false, funding_source: "none",
          payer_kind: "personal", funding_label: "No verified eligible funds", expires_at: new Date(Date.now() + 60_000).toISOString(),
        }, error: null };
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
      attachment_context: { include_episode_attachments: false, attachment_ids: [] },
      episode_context: { episodeId: "episode-1", workspaceId: "55555555-5555-4555-8555-555555555555", title: "", titleVariants: { A: "", B: "", C: "" }, outline: "", body: "", sources: [], sparks: [] },
    }),
  }));
  assert.equal(response.status, 402);
  assert.equal(providerCalls, 0);
});

test("customer quote acceptance reserves, executes, settles, closes, and replays without a second charge or provider call", async () => {
  const workspaceId = "55555555-5555-4555-8555-555555555555";
  const depositId = "66666666-6666-4666-8666-666666666666";
  const quoteHash = "b".repeat(64);
  let providerCalls = 0;
  let reservationState = "reserved";
  let settlementCalls = 0;
  let quoteArgs: Record<string, unknown> = {};
  let reserveArgs: Record<string, unknown> = {};
  let persistedResult: Record<string, unknown> | null = null;
  const gate = {
    async rpc(name: string, args: Record<string, unknown>) {
      if (name === "read_openai_text_route_execution_requirement") {
        return { data: { mode: "enforce", funding_context_required: true }, error: null };
      }
      if (name === "read_existing_openai_text_funding_handle") {
        return reservationState === "settled" ? { data: {
          operation_id: quoteArgs.p_operation_id,
          reservation_id: reserveArgs.p_reservation_id,
          request_fingerprint: quoteArgs.p_request_fingerprint,
        }, error: null } : { data: {}, error: null };
      }
      if (name === "resolve_openai_text_model_for_funding_quote") {
        return { data: {
          catalog_revision_id: "77777777-7777-4777-8777-777777777777", catalog_revision: 1,
          model_catalog_entry_id: "88888888-8888-4888-8888-888888888888",
          runtime_model_id: "gpt-5.6-luna", provider_model_id: "gpt-5.6-luna",
          display_name: "GPT-5.6 Luna", tradeoff_summary: "Bounded test model.",
        }, error: null };
      }
      if (name === "create_customer_openai_text_quote") {
        quoteArgs = args;
        return { data: {
          quote_id: args.p_quote_id,
          operation_id: args.p_operation_id,
          quote_hash: quoteHash,
          request_fingerprint: args.p_request_fingerprint,
          currency: "USD",
          maximum_customer_charge_micros: 20000,
          failure_customer_charge_micros: 0,
          funding_eligible: true, funding_source: "customer_deposit", payer_kind: "personal",
          funding_label: "Verified AI credit purchase",
          included_quantity: { input_tokens: 2000, output_tokens: 512, attempts: 1 },
          expires_at: args.p_expires_at,
          provider_funding_summary: [{ component: "text_generation", provider_label: "OpenAI", credential_source: "forge" }],
        }, error: null };
      }
      if (name === "reserve_customer_openai_text_quote") {
        reserveArgs = args;
        return { data: { paid_execution: {
          operation_id: args.p_operation_id,
          reservation_id: args.p_reservation_id,
          request_fingerprint: args.p_request_fingerprint,
        }, funding_source: "customer_deposit", reservation_state: reservationState }, error: null };
      }
      if (name === "resolve_openai_text_paid_execution_context") {
        return { data: {
          operation_id: quoteArgs.p_operation_id,
          reservation_id: reserveArgs.p_reservation_id,
          quote_id: quoteArgs.p_quote_id,
          route_code: "hearth.chat_completion",
          funding_source_type: "customer_deposit",
          funding_source_id: depositId,
          credential_funding: "forge",
          model: "gpt-5.6-luna",
          maximum_input_units: 20000,
          maximum_output_units: 512,
          maximum_attempts: 1,
          maximum_failure_exposure_micros: 11015,
          direct_provider_ceiling_micros: 1015,
          supporting_cost_ceiling_micros: 10000,
          input_micros_per_million_tokens: 200000,
          output_micros_per_million_tokens: 1200000,
          reservation_state: reservationState,
        }, error: null };
      }
      if (name === "authorize_openai_text_provider_attempt"
        || name === "authorize_openai_text_provider_attempt_with_aggregate") {
        return { data: { provider_execution_authorized: true }, error: null };
      }
      if (name === "persist_hearth_chat_paid_result") {
        persistedResult = args;
        return { data: { replay: false }, error: null };
      }
      if (name === "settle_operation") {
        settlementCalls += 1;
        reservationState = "settled";
        return { data: { customer_charge_micros: 20000 }, error: null };
      }
      if (name === "read_hearth_chat_paid_result") {
        return { data: {
          provider_request_id: "req_customer_fake_1",
          input_units: 30,
          output_units: 9,
          customer_charge_micros: 20000,
          result_json: (persistedResult?.p_result_json as Record<string, unknown>) ?? {
            assistantText: "Review your outline before recording so the episode stays focused.",
            ops: [], scriptText: null, tagAudit: null,
          },
        }, error: null };
      }
      return { data: {}, error: null };
    },
  };
  const config = {
    textApiKey: "fake-forge-key",
    imageApiKey: null,
    researchApiKey: null,
    apiKey: "fake-forge-key",
    model: "gpt-5.6-luna",
    sttModel: "gpt-4o-mini-transcribe",
    configuredBillingMode: "forge" as const,
    initialTokenBalance: 42,
    supabaseUrl: "https://example.supabase.co",
    supabaseServiceRoleKey: null,
    supabaseRpcKey: "fake-publishable-key",
    sttBucket: "forge-workpieces",
    disableForgeLaneAi: false,
    disableUserKeys: false,
    disableExpensiveAiActions: false,
    disableCdcGeneration: false,
    openAiTextGate: gate,
    resolveUserIdForAccessToken: async () => USER_ID,
    openAiProviderFetch: async () => {
      providerCalls += 1;
      return new Response(JSON.stringify({
        id: "chatcmpl_customer_fake",
        choices: [{ message: { content: "Review your outline before recording so the episode stays focused." } }],
        usage: { prompt_tokens: 30, completion_tokens: 9 },
      }), { status: 200, headers: { "x-request-id": "req_customer_fake_1" } });
    },
  } satisfies HearthRuntimeConfig;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
  try {
    const handler = createHearthAiHandler(config);
    const body = {
      lane: "forge",
      messages: [{ role: "user", content: USER_MESSAGE }],
      user_authored_text: USER_MESSAGE,
      attachment_context: { include_episode_attachments: false, attachment_ids: [] },
      episode_context: {
        episodeId: "episode-1", workspaceId, title: "Bounded customer test",
        titleVariants: { A: "", B: "", C: "" }, outline: "", body: "", tonePreset: null, sources: [], sparks: [],
      },
    };
    const quotedResponse = await handler(new Request("http://localhost/api/hearth/chat", {
      method: "POST", headers: { authorization: "Bearer fake-user-token", "content-type": "application/json" },
      body: JSON.stringify(body),
    }));
    const quoted = await quotedResponse.json() as Record<string, any>;
    assert.equal(quotedResponse.status, 409, JSON.stringify(quoted));
    assert.equal(quoted.billing_quote.maximum_customer_charge_micros, 20000);
    assert.equal(quoted.billing_quote.failure_customer_charge_micros, 0);
    assert.equal(providerCalls, 0);

    const acceptedBody = {
      ...body,
      spending_acceptance: {
        operation_id: quoted.billing_quote.operation_id,
        quote_id: quoted.billing_quote.quote_id,
        quote_hash: quoted.billing_quote.quote_hash,
        request_fingerprint: quoted.billing_quote.request_fingerprint,
      },
    };
    const settledResponse = await handler(new Request("http://localhost/api/hearth/chat", {
      method: "POST", headers: { authorization: "Bearer fake-user-token", "content-type": "application/json" },
      body: JSON.stringify(acceptedBody),
    }));
    const settled = await settledResponse.json() as Record<string, any>;
    assert.equal(settledResponse.status, 200, JSON.stringify(settled));
    assert.equal(settled.billing_receipt.customer_charge_micros, 20000);
    assert.equal(settled.billing_receipt.funding_source, "customer_deposit");
    assert.equal(providerCalls, 1);
    assert.equal(settlementCalls, 1);

    const replayResponse = await handler(new Request("http://localhost/api/hearth/chat", {
      method: "POST", headers: { authorization: "Bearer fake-user-token", "content-type": "application/json" },
      body: JSON.stringify(acceptedBody),
    }));
    const replay = await replayResponse.json() as Record<string, any>;
    assert.equal(replayResponse.status, 200, JSON.stringify(replay));
    assert.equal(replay.billing_receipt.status, "settled_replay");
    assert.equal(replay.billing_receipt.customer_charge_micros, 20000);
    assert.equal(providerCalls, 1);
    assert.equal(settlementCalls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
