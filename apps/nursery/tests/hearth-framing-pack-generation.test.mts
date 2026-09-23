import assert from "node:assert/strict";
import test from "node:test";
import {
  HEARTH_FRAMING_PACK_CONTRACT,
  HEARTH_FRAMING_PACK_MAX_ATTEMPTS,
  HEARTH_FRAMING_PACK_MAX_INPUT_TOKENS,
  HEARTH_FRAMING_PACK_MAX_OUTPUT_TOKENS,
  HEARTH_FRAMING_PACK_MODEL,
  HEARTH_FRAMING_PACK_OUTPUT_CONTRACT,
  HEARTH_FRAMING_PACK_ROUTE,
  buildPaidFramingPackMessages,
  paidFramingPackFingerprintPayload,
  validatePaidFramingPackOutput,
} from "../server/hearth/hearth-paid-framing-pack-generation";
import {
  buildBoundedPaidJsonOpenAiRequest,
  executePaidJsonOpenAiRoute,
  PaidJsonOpenAiRouteError,
} from "../server/billing/paid-json-openai-route";
import { hashApprovedTitleScript } from "../server/hearth/hearth-paid-title-generation";
import { createHearthAiHandler } from "../server/hearth/create-hearth-ai-handler";
import type { HearthRuntimeConfig } from "../server/hearth/hearth-runtime-config";
import { buildProductionPrompt } from "../../hearth/src/lib/hearth-production-actions";
import { fingerprintOpenAiTextPaidRequest } from "../../../packages/tongs/src/providers/paid-openai-text-route-execution";

const APPROVAL_ID = "be87d40f-516b-4dcf-bd25-094b922cc682";
const SCRIPT = "[s1]\nGas prices reflect crude oil, refining, taxes, and distribution.\n[/s1]";
const sections = {
  YOUTUBE_OPTIMIZED_CUT: "Open with the pump-price question, then move through crude oil, refining, taxes, and distribution in that order.",
  SHORT_DESCRIPTION: "Why gasoline prices rise—and what crude oil, refining, taxes, and distribution each add at the pump.",
  LONG_DESCRIPTION: "Gasoline prices are not controlled by one lever. This episode follows the price from crude oil through refinery capacity, fuel taxes, and local distribution so listeners can see where each part of the pump price comes from.",
  SHORT_FORM_HOOK_20S: "Why can oil prices fall while the number at your gas station barely moves? Four different costs help explain the gap.",
  TONE_VARIANT_CREATOR: "You know that moment when the pump stops and the total feels personal? Let’s trace where that money actually goes.",
  AUDIENCE_VARIANT: "For drivers planning a monthly budget, frame the episode around which price inputs change quickly and which stay stubborn.",
  MONETIZATION_ANGLE: "Position a sponsor as a practical companion for household budgeting, then invite listeners to compare the four price inputs in their own region.",
} as const;
const order = Object.keys(sections) as Array<keyof typeof sections>;
const render = (keys = order, crlf = false) => keys
  .map((key) => `${key}:\n${sections[key]}`)
  .join(crlf ? "\r\n\r\n" : "\n\n");

test("paid Framing Pack accepts any section order and emits one canonical byte form", () => {
  const canonical = render();
  for (const candidate of [
    canonical,
    render([...order].reverse()),
    `\n\n${render([order[2]!, order[0]!, order[6]!, order[1]!, order[5]!, order[3]!, order[4]!], true)}\r\n`,
    canonical.replace("SHORT_DESCRIPTION:\n", " short_description :   "),
  ]) {
    const result = validatePaidFramingPackOutput(candidate);
    assert.equal(result.ok, true, candidate);
    if (result.ok) assert.equal(result.text, canonical);
  }
});

test("paid Framing Pack rejects malformed, extra, placeholder, and oversized output without truncating", () => {
  const canonical = render();
  const invalid = [
    canonical.replace(/MONETIZATION_ANGLE:[\s\S]*$/, ""),
    `${canonical}\n\nSHORT_DESCRIPTION:\nduplicate`,
    `${canonical}\n\nTITLE_OPTIONS:\nA title`,
    `${canonical}\n\nUNKNOWN_SECTION:\nextra`,
    `${canonical}\n\nEXPLANATION:\nextra`,
    `Here is your pack:\n${canonical}`,
    `\`\`\`\n${canonical}\n\`\`\``,
    canonical.replace(sections.AUDIENCE_VARIANT, "TBD"),
    canonical.replace(sections.LONG_DESCRIPTION, "too short"),
    canonical.replace(sections.SHORT_DESCRIPTION, "x".repeat(181)),
    canonical.replace(sections.SHORT_FORM_HOOK_20S, Array.from({ length: 61 }, () => "word").join(" ")),
  ];
  for (const candidate of invalid) assert.equal(validatePaidFramingPackOutput(candidate).ok, false, candidate);
});

test("paid Framing Pack request is one bounded Luna attempt tied to the exact approval", async () => {
  const approved = {
    approvalId: APPROVAL_ID,
    approvalRevision: 1,
    scriptHash: await hashApprovedTitleScript(SCRIPT),
    scriptText: SCRIPT,
    episodeTitle: "Why gasoline costs more",
  };
  const messages = buildPaidFramingPackMessages(approved);
  assert.ok(messages[1].content.endsWith(SCRIPT));
  assert.doesNotMatch(messages[0].content, /^TITLE_OPTIONS:/m);
  const identity = paidFramingPackFingerprintPayload({
    userId: "44444444-4444-4444-8444-444444444444",
    workspaceId: "cc5478ff-37be-403e-824c-467fa7da061e",
    workpieceId: "21d16d6a-905b-491e-8761-028789612ae5",
    approved,
    operationIntentId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  });
  assert.equal(identity.schema, HEARTH_FRAMING_PACK_CONTRACT);
  assert.equal(identity.output_contract, HEARTH_FRAMING_PACK_OUTPUT_CONTRACT);
  assert.equal(identity.route_code, HEARTH_FRAMING_PACK_ROUTE);
  assert.equal(identity.maximum_attempts, HEARTH_FRAMING_PACK_MAX_ATTEMPTS);
  assert.equal(identity.maximum_input_tokens, HEARTH_FRAMING_PACK_MAX_INPUT_TOKENS);
  assert.equal(identity.maximum_output_tokens, HEARTH_FRAMING_PACK_MAX_OUTPUT_TOKENS);
  assert.deepEqual([identity.browsing_requests, identity.retrieval_requests, identity.tools, identity.attachments], [0, 0, 0, 0]);
  const bounded = await buildBoundedPaidJsonOpenAiRequest({
    body: { model: HEARTH_FRAMING_PACK_MODEL, reasoning_effort: "none", messages },
    model: HEARTH_FRAMING_PACK_MODEL,
    maximumOutputTokens: HEARTH_FRAMING_PACK_MAX_OUTPUT_TOKENS,
    maximumAttempts: HEARTH_FRAMING_PACK_MAX_ATTEMPTS,
  });
  assert.equal(bounded.maximumAttempts, 1);
  assert.ok(bounded.boundedInputTokens <= HEARTH_FRAMING_PACK_MAX_INPUT_TOKENS);
  assert.equal(JSON.parse(bounded.serializedBody).max_completion_tokens, 2048);
});

test("the Framing Pack product remains economically bounded at two Credits", () => {
  const inputMicros = Math.ceil(12_000 * 200_000 / 1_000_000);
  const outputMicros = Math.ceil(2_048 * 1_200_000 / 1_000_000);
  const direct = inputMicros + outputMicros;
  const target = Math.ceil(direct * 133 / 100);
  const credits = Math.ceil(target / 5_000);
  assert.deepEqual({ inputMicros, outputMicros, direct, target, credits }, {
    inputMicros: 2_400, outputMicros: 2_458, direct: 4_858, target: 6_462, credits: 2,
  });
});

test("invalid Framing Pack output records generic evidence once, releases, and never retries", async () => {
  const operationId = "operation-framing-validation-v1";
  const reservationId = "11111111-1111-4111-8111-111111111111";
  const fingerprintPayload = { schema: HEARTH_FRAMING_PACK_CONTRACT, output_contract: HEARTH_FRAMING_PACK_OUTPUT_CONTRACT };
  const requestFingerprint = await fingerprintOpenAiTextPaidRequest(fingerprintPayload);
  const rawBody = JSON.stringify({
    id: "chatcmpl_framing_invalid",
    choices: [{ message: { content: render().replace(/MONETIZATION_ANGLE:[\s\S]*$/, "") } }],
    usage: { prompt_tokens: 2501, completion_tokens: 110 },
  });
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  let state = "reserved";
  let providerCalls = 0;
  let persistenceCalls = 0;
  const gate = {
    async rpc(name: string, args: Record<string, unknown>) {
      calls.push({ name, args });
      if (name === "resolve_openai_text_paid_execution_context") return { data: {
        operation_id: operationId, reservation_id: reservationId,
        quote_id: "22222222-2222-4222-8222-222222222222", route_code: HEARTH_FRAMING_PACK_ROUTE,
        funding_source_type: "customer_deposit", funding_source_id: "33333333-3333-4333-8333-333333333333",
        funding_environment: "test", credential_funding: "forge", model: HEARTH_FRAMING_PACK_MODEL,
        maximum_input_units: 12000, maximum_output_units: 2048, maximum_attempts: 1,
        maximum_failure_exposure_micros: 4858, direct_provider_ceiling_micros: 4858,
        supporting_cost_ceiling_micros: 0, input_micros_per_million_tokens: 200000,
        output_micros_per_million_tokens: 1200000, reservation_state: state,
      }, error: null };
      if (name === "acquire_openai_text_aggregate_admission") return {
        data: { enforcement_enabled: true, authorized: true, hold_id: "framing-hold" }, error: null,
      };
      if (name === "authorize_openai_text_provider_attempt_with_aggregate") return {
        data: { provider_execution_authorized: true }, error: null,
      };
      if (name === "record_openai_text_validation_failure_evidence") return {
        data: { evidence_id: "44444444-4444-4444-8444-444444444444" }, error: null,
      };
      if (name === "settle_openai_customer_failure_without_duplicate_expense") {
        state = "released";
        return { data: {}, error: null };
      }
      return { data: {}, error: null };
    },
  };
  const run = () => executePaidJsonOpenAiRoute({
    gate, routeCode: HEARTH_FRAMING_PACK_ROUTE,
    handle: { operationId, reservationId, requestFingerprint, fundingEnvironment: "test" },
    userId: "44444444-4444-4444-8444-444444444444",
    workspaceId: "cc5478ff-37be-403e-824c-467fa7da061e",
    workpieceId: "21d16d6a-905b-491e-8761-028789612ae5",
    credentialSource: "forge_managed", apiKey: "fake-key", requestFingerprintPayload: fingerprintPayload,
    providerRequestBody: (model) => ({ model, messages: [{ role: "user", content: "framing" }] }),
    fetchImpl: async () => {
      providerCalls += 1;
      return new Response(rawBody, { status: 200, headers: { "x-request-id": "req_framing_invalid" } });
    },
    validationEvidence: {
      contractRevision: HEARTH_FRAMING_PACK_OUTPUT_CONTRACT,
      recordFailure: async (failure) => {
        const recorded = await gate.rpc("record_openai_text_validation_failure_evidence", failure);
        if (recorded.error) throw new Error(recorded.error.message);
      },
    },
    validate: (payload) => {
      const content = (payload.choices as Array<{ message: { content: string } }>)[0]!.message.content;
      const output = validatePaidFramingPackOutput(content);
      if (!output.ok) throw new Error(output.error);
      return { assistant_text: output.text, sections: output.sections };
    },
    persist: async (result) => { persistenceCalls += 1; return result; },
  });
  await assert.rejects(run, (error: unknown) =>
    error instanceof PaidJsonOpenAiRouteError && error.state === "failed_released");
  assert.equal(providerCalls, 1);
  assert.equal(persistenceCalls, 0);
  const evidence = calls.find((call) => call.name === "record_openai_text_validation_failure_evidence");
  assert.equal(evidence?.args.rawProviderResponseText, rawBody);
  assert.equal(evidence?.args.errorCode, "missing_framing_pack_section");
  assert.equal(calls.filter((call) => call.name === "settle_operation").length, 0);
  assert.equal(calls.filter((call) => call.name === "settle_openai_customer_failure_without_duplicate_expense").length, 1);
  await assert.rejects(run, (error: unknown) =>
    error instanceof PaidJsonOpenAiRouteError && error.state === "failed_released");
  assert.equal(providerCalls, 1);
  assert.equal(calls.filter((call) => call.name === "record_openai_text_validation_failure_evidence").length, 1);
});

test("Generate Framing Pack quotes two Credits without a provider call", async () => {
  const approval = {
    approvalId: APPROVAL_ID,
    approvalRevision: 1,
    scriptHash: await hashApprovedTitleScript(SCRIPT),
    scriptText: SCRIPT,
    episodeTitle: "Why gasoline costs more",
  };
  let providerCalls = 0;
  const rpcCalls: string[] = [];
  const gate = {
    async rpc(name: string, args: Record<string, unknown>) {
      rpcCalls.push(name);
      if (name === "read_openai_execution_requirement") return {
        data: { mode: "enforce", funding_context_required: true }, error: null,
      };
      if (name === "resolve_openai_text_model_for_funding_quote") return { data: {
        catalog_revision_id: "16000000-0000-4000-8000-000000000005",
        catalog_revision: 9,
        model_catalog_entry_id: "88888888-8888-4888-8888-888888888888",
        runtime_model_id: HEARTH_FRAMING_PACK_MODEL,
        provider_model_id: HEARTH_FRAMING_PACK_MODEL,
        display_name: "GPT-5.6 Luna",
        tradeoff_summary: "Bounded seven-section Framing Pack.",
      }, error: null };
      if (name === "create_customer_openai_text_quote") {
        assert.equal(args.p_route_code, HEARTH_FRAMING_PACK_ROUTE);
        return { data: {
          quote_id: args.p_quote_id,
          operation_id: args.p_operation_id,
          quote_hash: "b".repeat(64),
          request_fingerprint: args.p_request_fingerprint,
          currency: "USD",
          maximum_customer_charge_micros: 10_000,
          customer_credit_units: 2,
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
        model: HEARTH_FRAMING_PACK_MODEL,
        maximum_input_units: 12_000,
        maximum_output_units: 2_048,
        maximum_attempts: 1,
      }, error: null };
      if (name === "bind_bounded_provider_quote_request") {
        assert.equal(args.p_route_code, HEARTH_FRAMING_PACK_ROUTE);
        assert.ok(Number(args.p_bounded_input_tokens) <= 12_000);
        assert.equal(args.p_maximum_output_tokens, 2_048);
        assert.equal(args.p_maximum_attempts, 1);
        return { data: { replay: false }, error: null };
      }
      return { data: {}, error: null };
    },
  };
  const config: HearthRuntimeConfig = {
    textApiKey: "fake-forge-key", imageApiKey: null, researchApiKey: null,
    apiKey: "fake-forge-key", model: HEARTH_FRAMING_PACK_MODEL,
    sttModel: "gpt-4o-mini-transcribe", configuredBillingMode: "forge",
    initialTokenBalance: 0, supabaseUrl: null, supabaseServiceRoleKey: null,
    supabaseRpcKey: null, sttBucket: "forge-workpieces",
    disableForgeLaneAi: false, disableUserKeys: false,
    disableExpensiveAiActions: false, disableCdcGeneration: false,
    openAiTextGate: gate,
    resolveUserIdForAccessToken: async () => "44444444-4444-4444-8444-444444444444",
    readApprovedTitleScript: async () => approval,
    openAiProviderFetch: async () => {
      providerCalls += 1;
      return new Response(null, { status: 500 });
    },
  };
  const handler = createHearthAiHandler(config);
  const requestContent = buildProductionPrompt({
    action: "release_prep_pack", scriptVersion: 1, episodeTitle: "Why gasoline costs more",
  });
  const request = new Request("http://localhost/api/hearth/chat", {
    method: "POST",
    headers: { authorization: "Bearer fake-user-token", "content-type": "application/json" },
    body: JSON.stringify({
      lane: "forge",
      action_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      messages: [{ role: "user", content: requestContent }],
      user_authored_text: requestContent,
      explicit_action: { kind: "production", action: "release_prep_pack" },
      production_action: "release_prep_pack",
      production_script_version: 1,
      attachment_context: { include_episode_attachments: false, attachment_ids: [] },
      episode_context: {
        episodeId: "21d16d6a-905b-491e-8761-028789612ae5",
        workspaceId: "cc5478ff-37be-403e-824c-467fa7da061e",
        title: "Untrusted browser title", titleVariants: { A: "", B: "", C: "" },
        outline: "", body: SCRIPT, tonePreset: null, sources: [], sparks: [],
      },
    }),
  });
  const response = await handler(request);
  const payload = await response.json() as Record<string, any>;
  assert.equal(response.status, 409, JSON.stringify(payload));
  assert.equal(payload.code, "hearth_spending_confirmation_required");
  assert.equal(payload.billing_quote.credit_charge, 2);
  assert.equal(providerCalls, 0);
  assert.ok(rpcCalls.includes("bind_bounded_provider_quote_request"));
});
