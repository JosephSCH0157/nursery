import assert from "node:assert/strict";
import test from "node:test";
import { createHearthAiHandler } from "../server/hearth/create-hearth-ai-handler";
import {
  HEARTH_TITLE_CONTRACT,
  HEARTH_TITLE_CONTRACT_V1,
  HEARTH_TITLE_MODEL,
  HEARTH_TITLE_ROUTE,
  buildPaidTitleMessages,
  hashApprovedTitleScript,
  paidTitleFingerprintPayload,
  validatePaidTitleOutput,
} from "../server/hearth/hearth-paid-title-generation";
import { validateExactSeoTitleBlock } from "../../hearth/src/lib/hearth-production-feedback";
import { HEARTH_EPISODE_TITLE_CONTRACT } from "../../hearth/src/lib/hearth-episode-title-contract";
import { HEARTH_THUMBNAIL_TITLE_CONTRACT } from "../../hearth/src/lib/hearth-thumbnail-title-contract";
import { buildProductionPrompt } from "../../hearth/src/lib/hearth-production-actions";
import { buildBoundedPaidJsonOpenAiRequest } from "../server/billing/paid-json-openai-route";
import { deriveHearthCustomerPaidIdentifiers } from "../server/hearth/hearth-paid-chat-execution";
import { fingerprintOpenAiTextPaidRequest } from "../../../packages/tongs/src/providers/paid-openai-text-route-execution";
import type { HearthRuntimeConfig } from "../server/hearth/hearth-runtime-config";
import { getEncoding } from "js-tiktoken";

const USER_ID = "44444444-4444-4444-8444-444444444444";
const WORKSPACE_ID = "cc5478ff-37be-403e-824c-467fa7da061e";
const WORKPIECE_ID = "21d16d6a-905b-491e-8761-028789612ae5";
const APPROVAL_ID = "be87d40f-516b-4dcf-bd25-094b922cc682";
const SCRIPT = "[s1]\nCrude oil, refining capacity, fuel taxes, and distribution affect gasoline prices.\n[/s1]\n";
const TITLES = "SEO_TITLES:\nSAFE: Why Gas Costs More\nSPICY: Gas Prices Exposed\nBALANCED_1: The Gas Price Puzzle\nBALANCED_2: Behind Every Gas Pump\nBALANCED_3: Fuel Costs Explained";
const titleBlock = (titles: readonly string[]) => [
  "SEO_TITLES:",
  ...["SAFE", "SPICY", "BALANCED_1", "BALANCED_2", "BALANCED_3"].map((label, index) => `${label}: ${titles[index]}`),
].join("\n");

test("paid title contract accepts exactly five distinct labeled episode titles", () => {
  assert.equal(validateExactSeoTitleBlock(TITLES).ok, true);
  for (const invalid of [
    TITLES.replace("BALANCED_3: Fuel Costs Explained", ""),
    TITLES.replace("BALANCED_3: Fuel Costs Explained", "BALANCED_3: Gas Prices Exposed"),
    TITLES.replace("SAFE: Why Gas Costs More", "SAFE: Why Gasoline Prices Keep Rising Across The United States Despite Global Oil Supply And Demand Changes"),
    "FENCED\n" + TITLES + "\nFENCED",
    TITLES + "\nSHORT_DESCRIPTION: Not included",
  ]) assert.equal(validateExactSeoTitleBlock(invalid).ok, false);
});

test("historical accepted v1 titles replay read-only and cannot make another provider attempt", async () => {
  const scriptHash = await hashApprovedTitleScript(SCRIPT);
  const approval = {
    approvalId: APPROVAL_ID, approvalRevision: 1, scriptHash,
    scriptText: SCRIPT, episodeTitle: "Why gasoline costs more",
  };
  const legacyPayload = paidTitleFingerprintPayload({
    userId: USER_ID, workspaceId: WORKSPACE_ID, workpieceId: WORKPIECE_ID,
    approved: approval, contractVersion: 1,
  });
  const requestFingerprint = await fingerprintOpenAiTextPaidRequest(legacyPayload);
  const identifiers = deriveHearthCustomerPaidIdentifiers({
    userId: USER_ID, workspaceId: WORKSPACE_ID, requestFingerprint,
  });
  let reservationState = "settled";
  let providerCalls = 0;
  const gate = { async rpc(name: string) {
    if (name === "read_owner_hearth_execution_requirement") return {
      data: { owner_testing_effective: false }, error: null,
    };
    if (name === "read_existing_openai_text_funding_handle") return { data: {
      operation_id: identifiers.operationId, reservation_id: identifiers.reservationId,
      request_fingerprint: requestFingerprint, funding_environment: "test",
    }, error: null };
    if (name === "resolve_openai_text_paid_execution_context") return { data: {
      operation_id: identifiers.operationId, reservation_id: identifiers.reservationId,
      quote_id: identifiers.quoteId, route_code: HEARTH_TITLE_ROUTE,
      funding_source_type: "customer_deposit", funding_source_id: "66666666-6666-4666-8666-666666666666",
      funding_environment: "test", credential_funding: "forge", model: HEARTH_TITLE_MODEL,
      maximum_input_units: 12_000, maximum_output_units: 512, maximum_attempts: 1,
      maximum_failure_exposure_micros: 3_015, direct_provider_ceiling_micros: 3_015,
      supporting_cost_ceiling_micros: 0, input_micros_per_million_tokens: 200_000,
      output_micros_per_million_tokens: 1_200_000, reservation_state: reservationState,
    }, error: null };
    if (name === "read_openai_text_paid_result") return { data: {
      result_json: {
        assistant_text: TITLES, title_result_id: "99999999-9999-4999-8999-999999999999",
        script_approval_id: APPROVAL_ID, script_approval_revision: 1,
        script_content_hash: scriptHash, contract: HEARTH_TITLE_CONTRACT_V1,
      }, provider_request_id: "req_legacy_title", customer_charge_micros: 5_000,
    }, error: null };
    throw new Error(`Unexpected legacy replay RPC: ${name}`);
  } };
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
    readApprovedTitleScript: async () => approval,
    openAiProviderFetch: async () => {
      providerCalls += 1;
      throw new Error("Historical replay must not call OpenAI");
    },
  };
  const body = {
    lane: "forge", messages: [{ role: "user", content: "Generate five titles" }],
    user_authored_text: "Generate five titles",
    explicit_action: { kind: "production", action: "seo" },
    production_action: "seo", production_script_version: 1,
    attachment_context: { include_episode_attachments: false, attachment_ids: [] },
    spending_acceptance: {
      operation_id: identifiers.operationId, quote_id: identifiers.quoteId,
      quote_hash: "b".repeat(64), request_fingerprint: requestFingerprint,
    },
    episode_context: {
      episodeId: WORKPIECE_ID, workspaceId: WORKSPACE_ID,
      title: "Untrusted browser title", titleVariants: { A: "", B: "", C: "" },
      outline: "", body: SCRIPT, tonePreset: null, sources: [], sparks: [],
    },
  };
  const handler = createHearthAiHandler(config);
  const invoke = async () => {
    const response = await handler(new Request("http://localhost/api/hearth/chat", {
      method: "POST",
      headers: { authorization: "Bearer fake-user-token", "content-type": "application/json" },
      body: JSON.stringify(body),
    }));
    return { status: response.status, payload: await response.json() as Record<string, any> };
  };
  const replayed = await invoke();
  assert.equal(replayed.status, 200, JSON.stringify(replayed.payload));
  assert.equal(replayed.payload.billing_receipt.status, "settled_replay");
  assert.equal(replayed.payload.assistant_text, TITLES);
  reservationState = "released";
  const unreplayable = await invoke();
  assert.equal(unreplayable.status, 409);
  assert.equal(unreplayable.payload.code, "title_legacy_quote_not_replayable");
  assert.equal(providerCalls, 0);
});

test("episode-title lengths are distinct from thumbnail hooks and v1 remains identifiable", async () => {
  assert.deepEqual(HEARTH_EPISODE_TITLE_CONTRACT, {
    preferred_min_words: 4, preferred_max_words: 10, hard_max_words: 12,
  });
  assert.equal(HEARTH_THUMBNAIL_TITLE_CONTRACT.preferred_max_words, 4);
  assert.equal(HEARTH_THUMBNAIL_TITLE_CONTRACT.hard_max_words, 6);
  const candidates = [
    "Why Gas Prices Rise", // 4
    "Why Gas Prices Rise Across America", // 6
    "How World Oil Markets Shape Gas Prices Across The Country", // 10
    "Why Global Oil Supply And Local Refining Both Shape American Gasoline Prices", // 12
    "Fuel Costs Explained", // 3: preference is not a minimum
  ];
  assert.deepEqual(candidates.map((title) => title.split(/\s+/).length), [4, 6, 10, 12, 3]);
  assert.equal(validateExactSeoTitleBlock(titleBlock(candidates)).ok, true);
  assert.equal(validatePaidTitleOutput(titleBlock(candidates), 1).ok, false);
  assert.equal(validateExactSeoTitleBlock(titleBlock([
    ...candidates.slice(0, 4),
    "Why Global Oil Supply And Local Refining Both Shape American Gasoline Prices Today", // 13
  ])).ok, false);
  assert.equal(validateExactSeoTitleBlock(titleBlock([
    candidates[0], "WHY  GAS PRICES RISE", ...candidates.slice(2),
  ])).ok, false);
  const prompt = buildProductionPrompt({ action: "seo", scriptVersion: 1, episodeTitle: "Gasoline" });
  assert.match(prompt, /Prefer 4–10 words and do not exceed 12 words/);
  assert.doesNotMatch(prompt, /thumbnail-safe hook of 4 words/);
  const approval = {
    approvalId: APPROVAL_ID, approvalRevision: 1,
    scriptHash: await hashApprovedTitleScript(SCRIPT), scriptText: SCRIPT,
    episodeTitle: "Gasoline",
  };
  const oldPayload = paidTitleFingerprintPayload({
    userId: USER_ID, workspaceId: WORKSPACE_ID, workpieceId: WORKPIECE_ID,
    approved: approval, contractVersion: 1,
  });
  const currentPayload = paidTitleFingerprintPayload({
    userId: USER_ID, workspaceId: WORKSPACE_ID, workpieceId: WORKPIECE_ID,
    approved: approval,
  });
  assert.equal(oldPayload.schema, HEARTH_TITLE_CONTRACT_V1);
  assert.equal(oldPayload.output_contract, "seo_titles_five_lines.v1");
  assert.equal(currentPayload.schema, HEARTH_TITLE_CONTRACT);
  assert.equal(currentPayload.output_contract, "seo_titles_five_lines.v2");
  assert.notDeepEqual(oldPayload, currentPayload);
  assert.match(buildPaidTitleMessages(approval, 1)[0].content, /at most four words/);
  assert.match(buildPaidTitleMessages(approval)[0].content, /do not exceed 12 words/);
  const words = ["gasoline", "prices", "reflect", "global", "oil", "supply", "refining", "capacity", "seasonal", "demand", "regional", "taxes"];
  const maximumLengthExample = titleBlock(Array.from({ length: 5 }, (_, offset) =>
    [...words.slice(offset), ...words.slice(0, offset)].join(" ")));
  const outputTokens = getEncoding("o200k_base").encode(maximumLengthExample).length;
  assert.ok(outputTokens < 256, `five 12-word titles used ${outputTokens} output tokens`);
  assert.ok(outputTokens < 512);
  assert.equal(Math.ceil(12_000 * 0.2 + 512 * 1.2), 3_015);
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
  let contractReady = false;
  const gate = {
    async rpc(name: string, args: Record<string, unknown>) {
      if (name === "read_hearth_title_generation_contract_version") return contractReady
        ? { data: 2, error: null }
        : { data: null, error: { message: "v2 migration pending" } };
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
  const titleRequest = () => new Request("http://localhost/api/hearth/chat", {
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
  });
  const blocked = await handler(titleRequest());
  assert.equal(blocked.status, 503);
  assert.equal((await blocked.json() as Record<string, unknown>).code, "title_contract_migration_required");
  assert.equal(quoteCalls, 0);
  assert.equal(providerCalls, 0);
  contractReady = true;
  const response = await handler(titleRequest());
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
      if (name === "read_hearth_title_generation_contract_version") return { data: 2, error: null };
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
