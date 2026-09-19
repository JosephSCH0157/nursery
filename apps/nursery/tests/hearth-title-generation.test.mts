import assert from "node:assert/strict";
import test from "node:test";
import { createHearthAiHandler } from "../server/hearth/create-hearth-ai-handler";
import {
  HEARTH_TITLE_CONTRACT,
  HEARTH_TITLE_MODEL,
  HEARTH_TITLE_ROUTE,
  buildPaidTitleMessages,
  hashApprovedTitleScript,
  paidTitleFingerprintPayload,
} from "../server/hearth/hearth-paid-title-generation";
import { validateExactSeoTitleBlock } from "../../hearth/src/lib/hearth-production-feedback";
import { buildBoundedPaidJsonOpenAiRequest } from "../server/billing/paid-json-openai-route";
import type { HearthRuntimeConfig } from "../server/hearth/hearth-runtime-config";

const USER_ID = "44444444-4444-4444-8444-444444444444";
const WORKSPACE_ID = "cc5478ff-37be-403e-824c-467fa7da061e";
const WORKPIECE_ID = "21d16d6a-905b-491e-8761-028789612ae5";
const APPROVAL_ID = "be87d40f-516b-4dcf-bd25-094b922cc682";
const SCRIPT = "[s1]\nCrude oil, refining capacity, fuel taxes, and distribution affect gasoline prices.\n[/s1]\n";
const TITLES = "SEO_TITLES:\nSAFE: Why Gas Costs More\nSPICY: Gas Prices Exposed\nBALANCED_1: The Gas Price Puzzle\nBALANCED_2: Behind Every Gas Pump\nBALANCED_3: Fuel Costs Explained";

test("paid title contract accepts exactly five distinct labeled, thumbnail-safe titles", () => {
  assert.equal(validateExactSeoTitleBlock(TITLES).ok, true);
  for (const invalid of [
    TITLES.replace("BALANCED_3: Fuel Costs Explained", ""),
    TITLES.replace("BALANCED_3: Fuel Costs Explained", "BALANCED_3: Gas Prices Exposed"),
    TITLES.replace("SAFE: Why Gas Costs More", "SAFE: Why Gasoline Prices Are So Very High"),
    "FENCED\n" + TITLES + "\nFENCED",
    TITLES + "\nSHORT_DESCRIPTION: Not included",
  ]) assert.equal(validateExactSeoTitleBlock(invalid).ok, false);
});

test("title request is deterministic and bounded to one Luna attempt without tools", async () => {
  const approval = {
    approvalId: APPROVAL_ID,
    approvalRevision: 1,
    scriptHash: await hashApprovedTitleScript(SCRIPT),
    scriptText: SCRIPT,
    episodeTitle: "Why gasoline costs more",
  };
  const messages = buildPaidTitleMessages(approval);
  assert.deepEqual(messages, buildPaidTitleMessages(approval));
  assert.ok(messages[1].content.includes(SCRIPT));
  assert.equal(messages.length, 2);
  const fingerprint = paidTitleFingerprintPayload({
    userId: USER_ID, workspaceId: WORKSPACE_ID, workpieceId: WORKPIECE_ID, approved: approval,
  });
  assert.equal(fingerprint.route_code, HEARTH_TITLE_ROUTE);
  assert.equal(fingerprint.schema, HEARTH_TITLE_CONTRACT);
  assert.equal(fingerprint.maximum_input_tokens, 12_000);
  assert.equal(fingerprint.maximum_output_tokens, 512);
  assert.equal(fingerprint.maximum_attempts, 1);
  assert.equal(fingerprint.browsing_requests, 0);
  assert.equal(fingerprint.retrieval_requests, 0);
  assert.equal(fingerprint.tools, 0);
  assert.equal(fingerprint.attachments, 0);
  const bounded = await buildBoundedPaidJsonOpenAiRequest({
    body: { model: HEARTH_TITLE_MODEL, reasoning_effort: "none", messages },
    model: HEARTH_TITLE_MODEL,
    maximumOutputTokens: 512,
    maximumAttempts: 1,
  });
  assert.ok(bounded.boundedInputTokens <= 12_000);
  assert.equal(bounded.maximumOutputTokens, 512);
  assert.equal(bounded.maximumAttempts, 1);
  assert.equal(JSON.parse(bounded.serializedBody).max_completion_tokens, 512);
});

test("Generate Titles requests a distinct one-credit quote before any provider call", async () => {
  const scriptHash = await hashApprovedTitleScript(SCRIPT);
  let providerCalls = 0;
  let quotedRoute = "";
  let boundedRoute = "";
  let quoteCalls = 0;
  const gate = {
    async rpc(name: string, args: Record<string, unknown>) {
      if (name === "read_openai_execution_requirement") {
        return { data: { mode: "enforce", funding_context_required: true }, error: null };
      }
      if (name === "read_existing_openai_text_funding_handle") return { data: {}, error: null };
      if (name === "resolve_openai_text_model_for_funding_quote") return { data: {
        catalog_revision_id: "14000000-0000-4000-8000-000000000005",
        catalog_revision: 7,
        model_catalog_entry_id: "88888888-8888-4888-8888-888888888888",
        runtime_model_id: HEARTH_TITLE_MODEL,
        provider_model_id: HEARTH_TITLE_MODEL,
        display_name: "GPT-5.6 Luna",
        tradeoff_summary: "Five bounded titles.",
      }, error: null };
      if (name === "create_customer_openai_text_quote") {
        quoteCalls += 1;
        quotedRoute = String(args.p_route_code ?? "");
        return { data: {
          quote_id: args.p_quote_id,
          operation_id: args.p_operation_id,
          quote_hash: "b".repeat(64),
          request_fingerprint: args.p_request_fingerprint,
          currency: "USD",
          maximum_customer_charge_micros: 5000,
          customer_credit_units: 1,
          failure_customer_charge_micros: 0,
          funding_eligible: true,
          funding_source: "customer_deposit",
          funding_environment: "test",
          payer_kind: "personal",
          funding_label: "Forge Credits",
          expires_at: args.p_expires_at,
        }, error: null };
      }
      if (name === "read_openai_text_quote_bounding_context") return { data: {
        model: HEARTH_TITLE_MODEL, maximum_input_units: 12_000,
        maximum_output_units: 512, maximum_attempts: 1,
      }, error: null };
      if (name === "bind_bounded_provider_quote_request") {
        boundedRoute = String(args.p_route_code ?? "");
        assert.ok(Number(args.p_bounded_input_tokens) <= 12_000);
        assert.equal(args.p_maximum_output_tokens, 512);
        assert.equal(args.p_maximum_attempts, 1);
        return { data: { replay: false }, error: null };
      }
      return { data: {}, error: null };
    },
  };
  const config: HearthRuntimeConfig = {
    textApiKey: "fake-forge-key", imageApiKey: null, researchApiKey: null,
    apiKey: "fake-forge-key", model: HEARTH_TITLE_MODEL,
    sttModel: "gpt-4o-mini-transcribe", configuredBillingMode: "forge",
    initialTokenBalance: 0, supabaseUrl: null, supabaseServiceRoleKey: null,
    supabaseRpcKey: null, sttBucket: "forge-workpieces",
    disableForgeLaneAi: false, disableUserKeys: false,
    disableExpensiveAiActions: false, disableCdcGeneration: false,
    openAiTextGate: gate,
    resolveUserIdForAccessToken: async () => USER_ID,
    readApprovedTitleScript: async () => ({
      approvalId: APPROVAL_ID, approvalRevision: 1, scriptHash,
      scriptText: SCRIPT, episodeTitle: "Why gasoline costs more",
    }),
    openAiProviderFetch: async () => {
      providerCalls += 1;
      return new Response(null, { status: 500 });
    },
  };
  const handler = createHearthAiHandler(config);
  const response = await handler(new Request("http://localhost/api/hearth/chat", {
    method: "POST",
    headers: { authorization: "Bearer fake-user-token", "content-type": "application/json" },
    body: JSON.stringify({
      lane: "forge",
      messages: [{ role: "user", content: "Generate five titles" }],
      user_authored_text: "Generate five titles",
      explicit_action: { kind: "production", action: "seo" },
      production_action: "seo",
      production_script_version: 1,
      attachment_context: { include_episode_attachments: false, attachment_ids: [] },
      episode_context: {
        episodeId: WORKPIECE_ID, workspaceId: WORKSPACE_ID,
        title: "Untrusted browser title", titleVariants: { A: "", B: "", C: "" },
        outline: "", body: SCRIPT, tonePreset: null, sources: [], sparks: [],
      },
    }),
  }));
  const payload = await response.json() as Record<string, any>;
  assert.equal(response.status, 409, JSON.stringify(payload));
  assert.equal(payload.code, "hearth_spending_confirmation_required");
  assert.equal(payload.billing_quote.credit_charge, 1);
  assert.equal(quotedRoute, HEARTH_TITLE_ROUTE);
  assert.equal(boundedRoute, HEARTH_TITLE_ROUTE);
  assert.equal(quoteCalls, 1);
  assert.equal(providerCalls, 0);

  const staleResponse = await handler(new Request("http://localhost/api/hearth/chat", {
    method: "POST",
    headers: { authorization: "Bearer fake-user-token", "content-type": "application/json" },
    body: JSON.stringify({
      lane: "forge", messages: [{ role: "user", content: "Generate five titles" }],
      user_authored_text: "Generate five titles",
      explicit_action: { kind: "production", action: "seo" },
      production_action: "seo", production_script_version: 2,
      attachment_context: { include_episode_attachments: false, attachment_ids: [] },
      episode_context: {
        episodeId: WORKPIECE_ID, workspaceId: WORKSPACE_ID,
        title: "Untrusted browser title", titleVariants: { A: "", B: "", C: "" },
        outline: "", body: SCRIPT, tonePreset: null, sources: [], sparks: [],
      },
    }),
  }));
  const stalePayload = await staleResponse.json() as Record<string, unknown>;
  assert.equal(staleResponse.status, 409);
  assert.equal(stalePayload.code, "title_approval_stale");
  assert.equal(quoteCalls, 1);
  assert.equal(providerCalls, 0);

  const changedBytesResponse = await handler(new Request("http://localhost/api/hearth/chat", {
    method: "POST",
    headers: { authorization: "Bearer fake-user-token", "content-type": "application/json" },
    body: JSON.stringify({
      lane: "forge", messages: [{ role: "user", content: "Generate five titles" }],
      user_authored_text: "Generate five titles",
      explicit_action: { kind: "production", action: "seo" },
      production_action: "seo", production_script_version: 1,
      attachment_context: { include_episode_attachments: false, attachment_ids: [] },
      episode_context: {
        episodeId: WORKPIECE_ID, workspaceId: WORKSPACE_ID,
        title: "Untrusted browser title", titleVariants: { A: "", B: "", C: "" },
        outline: "", body: SCRIPT.trimEnd(), tonePreset: null, sources: [], sparks: [],
      },
    }),
  }));
  assert.equal(changedBytesResponse.status, 409);
  assert.equal((await changedBytesResponse.json() as Record<string, unknown>).code, "title_approval_stale");
  assert.equal(quoteCalls, 1);
  assert.equal(providerCalls, 0);
});

test("accepted title quote settles once and exact replay reads the canonical result", async () => {
  const scriptHash = await hashApprovedTitleScript(SCRIPT);
  let quoteArgs: Record<string, unknown> = {};
  let reserveArgs: Record<string, unknown> = {};
  let savedResult: Record<string, unknown> | null = null;
  let reservationState = "reserved";
  let quoteCalls = 0;
  let reserveCalls = 0;
  let providerCalls = 0;
  let resultWrites = 0;
  let settlementCalls = 0;
  const calls: string[] = [];
  const gate = {
    async rpc(name: string, args: Record<string, unknown>) {
      calls.push(name);
      if (name === "read_openai_execution_requirement") return {
        data: { mode: "enforce", funding_context_required: true }, error: null,
      };
      if (name === "read_existing_openai_text_funding_handle") return {
        data: reservationState === "settled" ? {
          operation_id: quoteArgs.p_operation_id,
          reservation_id: reserveArgs.p_reservation_id,
          request_fingerprint: quoteArgs.p_request_fingerprint,
          funding_environment: "test",
        } : {}, error: null,
      };
      if (name === "resolve_openai_text_model_for_funding_quote") return { data: {
        catalog_revision_id: "14000000-0000-4000-8000-000000000005",
        catalog_revision: 7,
        model_catalog_entry_id: "88888888-8888-4888-8888-888888888888",
        runtime_model_id: HEARTH_TITLE_MODEL, provider_model_id: HEARTH_TITLE_MODEL,
        display_name: "GPT-5.6 Luna", tradeoff_summary: "Five bounded titles.",
      }, error: null };
      if (name === "create_customer_openai_text_quote") {
        quoteCalls += 1;
        quoteArgs = args;
        assert.equal(args.p_route_code, HEARTH_TITLE_ROUTE);
        return { data: {
          quote_id: args.p_quote_id, operation_id: args.p_operation_id,
          quote_hash: "b".repeat(64), request_fingerprint: args.p_request_fingerprint,
          currency: "USD", maximum_customer_charge_micros: 5000,
          customer_credit_units: 1, failure_customer_charge_micros: 0,
          funding_eligible: true, funding_source: "customer_deposit",
          payer_kind: "personal", funding_environment: "test",
          funding_label: "Forge Credits", expires_at: args.p_expires_at,
        }, error: null };
      }
      if (name === "read_openai_text_quote_bounding_context") return { data: {
        model: HEARTH_TITLE_MODEL, maximum_input_units: 12_000,
        maximum_output_units: 512, maximum_attempts: 1,
      }, error: null };
      if (name === "bind_bounded_provider_quote_request" || name === "bind_bounded_provider_request") {
        assert.ok(Number(args.p_bounded_input_tokens) <= 12_000);
        return { data: { replay: false }, error: null };
      }
      if (name === "reserve_customer_openai_text_quote") {
        reserveCalls += 1;
        reserveArgs = args;
        return { data: { paid_execution: {
          operation_id: args.p_operation_id, reservation_id: args.p_reservation_id,
          request_fingerprint: args.p_request_fingerprint, funding_environment: "test",
        }, funding_source: "customer_deposit", reservation_state: reservationState }, error: null };
      }
      if (name === "resolve_openai_text_paid_execution_context") return { data: {
        operation_id: quoteArgs.p_operation_id,
        reservation_id: reserveArgs.p_reservation_id,
        quote_id: quoteArgs.p_quote_id,
        route_code: HEARTH_TITLE_ROUTE,
        funding_source_type: "customer_deposit",
        funding_source_id: "66666666-6666-4666-8666-666666666666",
        funding_environment: "test",
        credential_funding: "forge", model: HEARTH_TITLE_MODEL,
        maximum_input_units: 12_000, maximum_output_units: 512,
        maximum_attempts: 1, maximum_failure_exposure_micros: 3015,
        direct_provider_ceiling_micros: 3015, supporting_cost_ceiling_micros: 0,
        input_micros_per_million_tokens: 200000,
        output_micros_per_million_tokens: 1200000,
        reservation_state: reservationState,
      }, error: null };
      if (name === "acquire_openai_text_aggregate_admission") return {
        data: { enforcement_enabled: true, authorized: true, hold_id: "title-hold" }, error: null,
      };
      if (name === "authorize_openai_text_provider_attempt"
        || name === "authorize_openai_text_provider_attempt_with_aggregate") return {
        data: { provider_execution_authorized: true }, error: null,
      };
      if (name === "persist_hearth_title_generation_result") {
        resultWrites += 1;
        savedResult = {
          ...(args.p_result_json as Record<string, unknown>),
          title_result_id: "99999999-9999-4999-8999-999999999999",
          provider_request_id: "req_title_fake_1",
          input_units: 240, output_units: 50,
        };
        return { data: savedResult, error: null };
      }
      if (name === "read_hearth_title_generation_result") return {
        data: savedResult, error: null,
      };
      if (name === "read_openai_text_paid_result") return { data: {
        result_json: savedResult, provider_request_id: "req_title_fake_1",
        input_units: 240, output_units: 50, customer_charge_micros: 5000,
      }, error: null };
      if (name === "settle_operation") {
        settlementCalls += 1;
        reservationState = "settled";
        return { data: { customer_charge_micros: 5000 }, error: null };
      }
      return { data: {}, error: null };
    },
  };
  const config: HearthRuntimeConfig = {
    textApiKey: "fake-forge-key", imageApiKey: null, researchApiKey: null,
    apiKey: "fake-forge-key", model: HEARTH_TITLE_MODEL,
    sttModel: "gpt-4o-mini-transcribe", configuredBillingMode: "forge",
    initialTokenBalance: 0, supabaseUrl: "https://example.supabase.co", supabaseServiceRoleKey: null,
    supabaseRpcKey: "fake-publishable-key", sttBucket: "forge-workpieces",
    disableForgeLaneAi: false, disableUserKeys: false,
    disableExpensiveAiActions: false, disableCdcGeneration: false,
    openAiTextGate: gate,
    resolveUserIdForAccessToken: async () => USER_ID,
    readApprovedTitleScript: async () => ({
      approvalId: APPROVAL_ID, approvalRevision: 1, scriptHash,
      scriptText: SCRIPT, episodeTitle: "Why gasoline costs more",
    }),
    openAiProviderFetch: async (_url, init) => {
      providerCalls += 1;
      const providerBody = JSON.parse(String(init?.body ?? "{}"));
      assert.equal(providerBody.max_completion_tokens, 512);
      assert.equal(providerBody.reasoning_effort, "none");
      assert.equal(providerBody.messages.length, 2);
      assert.ok(providerBody.messages[1].content.includes(SCRIPT));
      assert.ok(!providerBody.messages[1].content.includes("Untrusted browser title"));
      return new Response(JSON.stringify({
        id: "chatcmpl_title_fake",
        choices: [{ message: { content: TITLES } }],
        usage: { prompt_tokens: 240, completion_tokens: 50 },
      }), { status: 200, headers: { "x-request-id": "req_title_fake_1" } });
    },
  };
  const body = {
    lane: "forge", messages: [{ role: "user", content: "Generate five titles" }],
    user_authored_text: "Generate five titles",
    explicit_action: { kind: "production", action: "seo" },
    production_action: "seo", production_script_version: 1,
    attachment_context: { include_episode_attachments: false, attachment_ids: [] },
    episode_context: {
      episodeId: WORKPIECE_ID, workspaceId: WORKSPACE_ID,
      title: "Untrusted browser title", titleVariants: { A: "", B: "", C: "" },
      outline: "", body: SCRIPT, tonePreset: null, sources: [], sparks: [],
    },
  };
  const handler = createHearthAiHandler(config);
  const invoke = async (payload: unknown) => {
    const response = await handler(new Request("http://localhost/api/hearth/chat", {
      method: "POST",
      headers: { authorization: "Bearer fake-user-token", "content-type": "application/json" },
      body: JSON.stringify(payload),
    }));
    return { status: response.status, body: await response.json() as Record<string, any> };
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("{}", {
    status: 200, headers: { "content-type": "application/json" },
  });
  try {
  const quoted = await invoke(body);
  assert.equal(quoted.status, 409, JSON.stringify(quoted.body));
  assert.equal(quoted.body.billing_quote.credit_charge, 1);
  assert.equal(providerCalls, 0);
  assert.equal(reserveCalls, 0);
  const acceptedBody = {
    ...body,
    spending_acceptance: {
      operation_id: quoted.body.billing_quote.operation_id,
      quote_id: quoted.body.billing_quote.quote_id,
      quote_hash: quoted.body.billing_quote.quote_hash,
      request_fingerprint: quoted.body.billing_quote.request_fingerprint,
    },
  };
  const settled = await invoke(acceptedBody);
  assert.equal(settled.status, 200, JSON.stringify({ response: settled.body, calls }));
  assert.equal(settled.body.billing_receipt.customer_charge_micros, 5000);
  assert.equal(settled.body.assistant_text, TITLES);
  assert.equal(providerCalls, 1);
  assert.equal(resultWrites, 1);
  assert.equal(reserveCalls, 1);
  assert.equal(settlementCalls, 1);
  const quoteCallsBeforeReplay = quoteCalls;
  const replayed = await invoke(acceptedBody);
  assert.equal(replayed.status, 200, JSON.stringify({ response: replayed.body, calls }));
  assert.equal(replayed.body.billing_receipt.status, "settled_replay");
  assert.equal(replayed.body.assistant_text, TITLES);
  assert.equal(quoteCalls, quoteCallsBeforeReplay);
  assert.equal(reserveCalls, 1);
  assert.equal(providerCalls, 1);
  assert.equal(resultWrites, 1);
  assert.equal(settlementCalls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
