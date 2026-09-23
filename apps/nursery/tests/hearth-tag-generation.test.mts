import assert from "node:assert/strict";
import test from "node:test";
import { createHearthAiHandler } from "../server/hearth/create-hearth-ai-handler";
import {
  HEARTH_TAG_CONTRACT,
  HEARTH_TAG_MODEL,
  HEARTH_TAG_OUTPUT_CONTRACT,
  HEARTH_TAG_ROUTE,
  buildPaidTagMessages,
  paidTagFingerprintPayload,
  validatePaidTagOutput,
} from "../server/hearth/hearth-paid-tag-generation";
import { hashApprovedTitleScript } from "../server/hearth/hearth-paid-title-generation";
import {
  buildBoundedPaidJsonOpenAiRequest,
  executePaidJsonOpenAiRoute,
  PaidJsonOpenAiRouteError,
} from "../server/billing/paid-json-openai-route";
import { fingerprintOpenAiTextPaidRequest } from "../../../packages/tongs/src/providers/paid-openai-text-route-execution";
import type { HearthRuntimeConfig } from "../server/hearth/hearth-runtime-config";

const USER_ID = "44444444-4444-4444-8444-444444444444";
const WORKSPACE_ID = "cc5478ff-37be-403e-824c-467fa7da061e";
const WORKPIECE_ID = "21d16d6a-905b-491e-8761-028789612ae5";
const APPROVAL_ID = "be87d40f-516b-4dcf-bd25-094b922cc682";
const ACTION_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ACTION_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SCRIPT = "[s1]\nCrude oil, refining capacity, fuel taxes, and distribution affect gasoline prices.\n[/s1]\n";
const TAGS = "TAGS_TOP10:\ngas prices, crude oil, refining capacity, fuel taxes, fuel distribution, gasoline costs";

test("paid tag parser canonicalizes harmless block formatting", () => {
  const expected = {
    ok: true, text: TAGS,
    tags: ["gas prices", "crude oil", "refining capacity", "fuel taxes", "fuel distribution", "gasoline costs"],
  };
  for (const candidate of [
    TAGS,
    TAGS.replace("TAGS_TOP10:\n", "TAGS_TOP10: "),
    ` \n\n ${TAGS} \n\n`,
    TAGS.replace(/\n/g, "\r\n"),
  ]) assert.deepEqual(validatePaidTagOutput(candidate), expected);
  const ten = "TAGS_TOP10: one, two, three, four, five, six, seven, eight, nine, ten";
  const tenResult = validatePaidTagOutput(ten);
  assert.equal(tenResult.ok, true);
  if (tenResult.ok) assert.equal(tenResult.tags.length, 10);
});

test("paid tag contract rejects extra, empty, duplicate, and malformed tags without truncation", () => {
  for (const bad of [
    "TAGS_TOP10:\none, two, three, four, five",
    TAGS + ", economy, oil, energy, podcast, eleventh",
    "TAGS_TOP10:\none, two, three, four, five, six, seven, eight, nine, ten, eleven",
    TAGS.replace("crude oil", "  "),
    TAGS.replace("crude oil", "GAS   PRICES"),
    TAGS.replace("crude oil", "gas prices"),
    TAGS.replace("crude oil", "gas-prices"),
    "```\n" + TAGS + "\n```",
    "Here are the tags:\n" + TAGS,
    TAGS + "\nEXPLANATION: extra",
    "TAGS_TOP10:\n- one\n- two\n- three\n- four\n- five\n- six",
    "TAGS_TOP10:\n\none, two, three, four, five, six",
    "tags_top10: one, two, three, four, five, six",
  ]) assert.equal(validatePaidTagOutput(bad).ok, false, bad);
});

test("tag request is one approved-script attempt with bounded Luna output", async () => {
  const approval = {
    approvalId: APPROVAL_ID, approvalRevision: 1,
    scriptHash: await hashApprovedTitleScript(SCRIPT), scriptText: SCRIPT,
    episodeTitle: "Why gasoline costs more",
  };
  const messages = buildPaidTagMessages(approval);
  assert.ok(messages[1].content.includes(SCRIPT));
  const identity = paidTagFingerprintPayload({
    userId: USER_ID, workspaceId: WORKSPACE_ID, workpieceId: WORKPIECE_ID,
    approved: approval, operationIntentId: ACTION_A,
  });
  assert.equal(identity.schema, HEARTH_TAG_CONTRACT);
  assert.equal(identity.output_contract, HEARTH_TAG_OUTPUT_CONTRACT);
  assert.equal(identity.route_code, HEARTH_TAG_ROUTE);
  assert.equal(identity.maximum_attempts, 1);
  assert.equal(identity.maximum_input_tokens, 12_000);
  assert.equal(identity.maximum_output_tokens, 256);
  assert.equal(identity.browsing_requests, 0);
  assert.equal(identity.retrieval_requests, 0);
  assert.equal(identity.tools, 0);
  assert.equal(identity.attachments, 0);
  assert.notDeepEqual(identity, paidTagFingerprintPayload({
    userId: USER_ID, workspaceId: WORKSPACE_ID, workpieceId: WORKPIECE_ID,
    approved: approval, operationIntentId: ACTION_B,
  }));
  const bounded = await buildBoundedPaidJsonOpenAiRequest({
    body: { model: HEARTH_TAG_MODEL, reasoning_effort: "none", messages },
    model: HEARTH_TAG_MODEL, maximumOutputTokens: 256, maximumAttempts: 1,
  });
  assert.ok(bounded.boundedInputTokens <= 12_000);
  assert.equal(bounded.maximumAttempts, 1);
  assert.equal(JSON.parse(bounded.serializedBody).max_completion_tokens, 256);
});

test("invalid provider text is retained privately, releases the credit, and never retries", async () => {
  const operationId = "operation-tag-validation-v2";
  const reservationId = "11111111-1111-4111-8111-111111111111";
  const requestFingerprintPayload = { schema: HEARTH_TAG_CONTRACT, output_contract: HEARTH_TAG_OUTPUT_CONTRACT };
  const requestFingerprint = await fingerprintOpenAiTextPaidRequest(requestFingerprintPayload);
  const rawReply = "Here are the tags:\n" + TAGS;
  const rawBody = JSON.stringify({
    id: "chatcmpl_tag_invalid",
    choices: [{ message: { content: rawReply } }],
    usage: { prompt_tokens: 1955, completion_tokens: 53 },
  });
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  let state = "reserved";
  let providerCalls = 0;
  let persisted = 0;
  const gate = {
    async rpc(name: string, args: Record<string, unknown>) {
      calls.push({ name, args });
      if (name === "resolve_openai_text_paid_execution_context") return { data: {
        operation_id: operationId, reservation_id: reservationId,
        quote_id: "22222222-2222-4222-8222-222222222222", route_code: HEARTH_TAG_ROUTE,
        funding_source_type: "customer_deposit",
        funding_source_id: "33333333-3333-4333-8333-333333333333",
        funding_environment: "test", credential_funding: "forge", model: HEARTH_TAG_MODEL,
        maximum_input_units: 12000, maximum_output_units: 256, maximum_attempts: 1,
        maximum_failure_exposure_micros: 2708, direct_provider_ceiling_micros: 2708,
        supporting_cost_ceiling_micros: 0,
        input_micros_per_million_tokens: 200000,
        output_micros_per_million_tokens: 1200000,
        reservation_state: state,
      }, error: null };
      if (name === "acquire_openai_text_aggregate_admission") return {
        data: { enforcement_enabled: true, authorized: true, hold_id: "tag-hold" }, error: null,
      };
      if (name === "authorize_openai_text_provider_attempt_with_aggregate") return {
        data: { provider_execution_authorized: true }, error: null,
      };
      if (name === "record_hearth_tag_validation_failure_evidence") return {
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
    gate, routeCode: HEARTH_TAG_ROUTE,
    handle: { operationId, reservationId, requestFingerprint, fundingEnvironment: "test" },
    userId: USER_ID, workspaceId: WORKSPACE_ID, workpieceId: WORKPIECE_ID,
    credentialSource: "forge_managed", apiKey: "fake-key",
    requestFingerprintPayload,
    providerRequestBody: (model) => ({ model, messages: [{ role: "user", content: "tags" }] }),
    fetchImpl: async () => {
      providerCalls += 1;
      return new Response(rawBody, { status: 200, headers: { "x-request-id": "req_tag_invalid" } });
    },
    validationEvidence: {
      contractRevision: HEARTH_TAG_OUTPUT_CONTRACT,
      recordFailure: async (failure) => {
        const recorded = await gate.rpc("record_hearth_tag_validation_failure_evidence", failure);
        if (recorded.error) throw new Error(recorded.error.message);
      },
    },
    validate: (payload) => {
      const content = (payload.choices as Array<{ message: { content: string } }>)[0].message.content;
      const output = validatePaidTagOutput(content);
      if (!output.ok) throw new Error(output.error);
      return { assistant_text: output.text, tags: output.tags };
    },
    persist: async (result) => { persisted += 1; return result; },
  });
  await assert.rejects(run, (error: unknown) =>
    error instanceof PaidJsonOpenAiRouteError && error.state === "failed_released");
  assert.equal(providerCalls, 1);
  assert.equal(persisted, 0);
  const capture = calls.find((call) => call.name === "record_openai_text_provider_capture");
  assert.equal((capture?.args.p_response_evidence_json as Record<string, unknown>).raw_provider_response_text, rawBody);
  assert.equal((capture?.args.p_response_evidence_json as Record<string, unknown>).validation_contract_revision, HEARTH_TAG_OUTPUT_CONTRACT);
  const failureEvidence = calls.find((call) => call.name === "record_hearth_tag_validation_failure_evidence");
  assert.equal(failureEvidence?.args.rawProviderResponseText, rawBody);
  assert.equal(failureEvidence?.args.errorCode, "invalid_tag_structure");
  assert.equal(failureEvidence?.args.contractRevision, HEARTH_TAG_OUTPUT_CONTRACT);
  const failure = calls.find((call) => call.name === "record_provider_failure");
  assert.equal(failure?.args.p_failure_class, "forge_validation_failure");
  assert.equal((failure?.args.p_evidence_json as Record<string, unknown>).raw_provider_response_text, undefined);
  assert.equal(calls.filter((call) => call.name === "settle_operation").length, 0);
  assert.equal(calls.filter((call) => call.name === "settle_openai_customer_failure_without_duplicate_expense").length, 1);
  await assert.rejects(run, (error: unknown) =>
    error instanceof PaidJsonOpenAiRouteError && error.state === "failed_released");
  assert.equal(providerCalls, 1);
  assert.equal(calls.filter((call) => call.name === "record_hearth_tag_validation_failure_evidence").length, 1);
});

test("Generate Tags quotes one credit without provider execution; fresh clicks have new identities", async () => {
  const approval = {
    approvalId: APPROVAL_ID, approvalRevision: 1,
    scriptHash: await hashApprovedTitleScript(SCRIPT), scriptText: SCRIPT,
    episodeTitle: "Why gasoline costs more",
  };
  let providerCalls = 0;
  const quoteIds: string[] = [];
  const gate = {
    async rpc(name: string, args: Record<string, unknown>) {
      if (name === "read_openai_execution_requirement") return {
        data: { mode: "enforce", funding_context_required: true }, error: null,
      };
      if (name === "resolve_openai_text_model_for_funding_quote") return { data: {
        catalog_revision_id: "15000000-0000-4000-8000-000000000005",
        catalog_revision: 8,
        model_catalog_entry_id: "88888888-8888-4888-8888-888888888888",
        runtime_model_id: HEARTH_TAG_MODEL, provider_model_id: HEARTH_TAG_MODEL,
        display_name: "GPT-5.6 Luna", tradeoff_summary: "Bounded episode tags.",
      }, error: null };
      if (name === "create_customer_openai_text_quote") {
        assert.equal(args.p_route_code, HEARTH_TAG_ROUTE);
        quoteIds.push(String(args.p_quote_id));
        return { data: {
          quote_id: args.p_quote_id, operation_id: args.p_operation_id,
          quote_hash: "b".repeat(64), request_fingerprint: args.p_request_fingerprint,
          currency: "USD", maximum_customer_charge_micros: 5000,
          customer_credit_units: 1, failure_customer_charge_micros: 0,
          funding_eligible: true, funding_source: "customer_deposit",
          funding_environment: "test", payer_kind: "personal",
          funding_label: "Forge Credits", expires_at: args.p_expires_at,
        }, error: null };
      }
      if (name === "read_openai_text_quote_bounding_context") return { data: {
        model: HEARTH_TAG_MODEL, maximum_input_units: 12_000,
        maximum_output_units: 256, maximum_attempts: 1,
      }, error: null };
      if (name === "bind_bounded_provider_quote_request") {
        assert.equal(args.p_route_code, HEARTH_TAG_ROUTE);
        assert.ok(Number(args.p_bounded_input_tokens) <= 12_000);
        assert.equal(args.p_maximum_output_tokens, 256);
        assert.equal(args.p_maximum_attempts, 1);
        return { data: { replay: false }, error: null };
      }
      return { data: {}, error: null };
    },
  };
  const config: HearthRuntimeConfig = {
    textApiKey: "fake-forge-key", imageApiKey: null, researchApiKey: null,
    apiKey: "fake-forge-key", model: HEARTH_TAG_MODEL,
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
      return new Response(null, { status: 500 });
    },
  };
  const handler = createHearthAiHandler(config);
  const request = (actionId: string, scriptVersion = 1, scriptBody = SCRIPT) => new Request("http://localhost/api/hearth/chat", {
    method: "POST",
    headers: { authorization: "Bearer fake-user-token", "content-type": "application/json" },
    body: JSON.stringify({
      lane: "forge", action_id: actionId,
      messages: [{ role: "user", content: "Generate tags" }],
      user_authored_text: "Generate tags",
      explicit_action: { kind: "production", action: "tags" },
      production_action: "tags", production_script_version: scriptVersion,
      attachment_context: { include_episode_attachments: false, attachment_ids: [] },
      episode_context: {
        episodeId: WORKPIECE_ID, workspaceId: WORKSPACE_ID,
        title: "Untrusted browser title", titleVariants: { A: "", B: "", C: "" },
        outline: "", body: scriptBody, tonePreset: null, sources: [], sparks: [],
      },
    }),
  });
  const first = await handler(request(ACTION_A));
  const firstBody = await first.json() as Record<string, any>;
  assert.equal(first.status, 409, JSON.stringify(firstBody));
  assert.equal(firstBody.code, "hearth_spending_confirmation_required");
  assert.equal(firstBody.billing_quote.credit_charge, 1);
  assert.equal(providerCalls, 0);
  const second = await handler(request(ACTION_B));
  assert.equal(second.status, 409);
  assert.equal(quoteIds.length, 2);
  assert.notEqual(quoteIds[0], quoteIds[1]);
  const missingAction = await handler(request("not-a-uuid"));
  assert.equal(missingAction.status, 422);
  assert.equal((await missingAction.json() as Record<string, unknown>).code, "tag_action_id_required");
  const stale = await handler(request(ACTION_A, 2));
  assert.equal(stale.status, 409);
  assert.equal((await stale.json() as Record<string, unknown>).code, "tag_approval_stale");
  const changedBytes = await handler(request(ACTION_A, 1, SCRIPT.trimEnd()));
  assert.equal(changedBytes.status, 409);
  assert.equal((await changedBytes.json() as Record<string, unknown>).code, "tag_approval_stale");
  assert.equal(quoteIds.length, 2);
  assert.equal(providerCalls, 0);
});
test("accepted tag quote settles once and exact replay reads the canonical result", async () => {
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
        catalog_revision_id: "15000000-0000-4000-8000-000000000005",
        catalog_revision: 8,
        model_catalog_entry_id: "88888888-8888-4888-8888-888888888888",
        runtime_model_id: HEARTH_TAG_MODEL, provider_model_id: HEARTH_TAG_MODEL,
        display_name: "GPT-5.6 Luna", tradeoff_summary: "Bounded episode tags.",
      }, error: null };
      if (name === "create_customer_openai_text_quote") {
        quoteCalls += 1;
        quoteArgs = args;
        assert.equal(args.p_route_code, HEARTH_TAG_ROUTE);
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
        model: HEARTH_TAG_MODEL, maximum_input_units: 12_000,
        maximum_output_units: 256, maximum_attempts: 1,
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
        route_code: HEARTH_TAG_ROUTE,
        funding_source_type: "customer_deposit",
        funding_source_id: "66666666-6666-4666-8666-666666666666",
        funding_environment: "test",
        credential_funding: "forge", model: HEARTH_TAG_MODEL,
        maximum_input_units: 12_000, maximum_output_units: 256,
        maximum_attempts: 1, maximum_failure_exposure_micros: 2708,
        direct_provider_ceiling_micros: 2708, supporting_cost_ceiling_micros: 0,
        input_micros_per_million_tokens: 200000,
        output_micros_per_million_tokens: 1200000,
        reservation_state: reservationState,
      }, error: null };
      if (name === "acquire_openai_text_aggregate_admission") return {
        data: { enforcement_enabled: true, authorized: true, hold_id: "tag-hold" }, error: null,
      };
      if (name === "authorize_openai_text_provider_attempt"
        || name === "authorize_openai_text_provider_attempt_with_aggregate") return {
        data: { provider_execution_authorized: true }, error: null,
      };
      if (name === "persist_hearth_tag_generation_result") {
        resultWrites += 1;
        savedResult = {
          ...(args.p_result_json as Record<string, unknown>),
          tag_result_id: "99999999-9999-4999-8999-999999999999",
          provider_request_id: "req_tag_fake_1",
          input_units: 240, output_units: 50,
        };
        return { data: savedResult, error: null };
      }
      if (name === "read_hearth_tag_generation_result") return {
        data: savedResult, error: null,
      };
      if (name === "read_openai_text_paid_result") return { data: {
        result_json: savedResult, provider_request_id: "req_tag_fake_1",
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
    apiKey: "fake-forge-key", model: HEARTH_TAG_MODEL,
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
      assert.equal(providerBody.max_completion_tokens, 256);
      assert.equal(providerBody.reasoning_effort, "none");
      assert.equal(providerBody.messages.length, 2);
      assert.ok(providerBody.messages[1].content.includes(SCRIPT));
      assert.ok(!providerBody.messages[1].content.includes("Untrusted browser title"));
      return new Response(JSON.stringify({
        id: "chatcmpl_tag_fake",
        choices: [{ message: { content: TAGS } }],
        usage: { prompt_tokens: 240, completion_tokens: 50 },
      }), { status: 200, headers: { "x-request-id": "req_tag_fake_1" } });
    },
  };
  const body = {
    action_id: ACTION_A,
    lane: "forge", messages: [{ role: "user", content: "Generate tags" }],
    user_authored_text: "Generate tags",
    explicit_action: { kind: "production", action: "tags" },
    production_action: "tags", production_script_version: 1,
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
  const changedAction = await invoke({
    ...body, action_id: ACTION_B,
    spending_acceptance: {
      operation_id: quoted.body.billing_quote.operation_id,
      quote_id: quoted.body.billing_quote.quote_id,
      quote_hash: quoted.body.billing_quote.quote_hash,
      request_fingerprint: quoted.body.billing_quote.request_fingerprint,
    },
  });
  assert.equal(changedAction.status, 409);
  assert.equal(changedAction.body.code, "paid_request_fingerprint_mismatch");
  assert.equal(quoteCalls, 1);
  assert.equal(reserveCalls, 0);
  assert.equal(providerCalls, 0);
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
  assert.equal(settled.body.assistant_text, TAGS);
  assert.equal(providerCalls, 1);
  assert.equal(resultWrites, 1);
  assert.equal(reserveCalls, 1);
  assert.equal(settlementCalls, 1);
  const quoteCallsBeforeReplay = quoteCalls;
  const replayed = await invoke(acceptedBody);
  assert.equal(replayed.status, 200, JSON.stringify({ response: replayed.body, calls }));
  assert.equal(replayed.body.billing_receipt.status, "settled_replay");
  assert.equal(replayed.body.assistant_text, TAGS);
  assert.equal(quoteCalls, quoteCallsBeforeReplay);
  assert.equal(reserveCalls, 1);
  assert.equal(providerCalls, 1);
  assert.equal(resultWrites, 1);
  assert.equal(settlementCalls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
