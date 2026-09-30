import assert from "node:assert/strict";
import test from "node:test";
import {
  createHearthAiHandler,
  hasSufficientCustomerResearchEvidence,
} from "../server/hearth/create-hearth-ai-handler";
import { fingerprintPaidHearthChatRequest } from "../server/hearth/hearth-paid-chat-execution";
import type { HearthRuntimeConfig } from "../server/hearth/hearth-runtime-config";
import type { OwnerCostRpcGate } from "../server/accounting/forge-owner-execution-coordinator";

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

function ownerAuthorityReader() {
  return {
    async readTransitionAuthority(userId: string) { return {
      userId, canonicalUserId: userId, accountClass: "owner" as const, accountAuthorityRevision: 1,
      accountAuthorityExplicit: true, legacyUserId: userId, legacyPrincipalStatus: "enabled" as const,
      legacyPrincipalRevision: 1, sameUser: true, consistent: true, eligible: true,
      state: "eligible" as const, authorityMode: "canonical_legacy_dual_read" as const,
    }; },
    async readWorkspaceMembership() { return { role: "owner" }; },
  };
}

function createOwnerTextGate() {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  let operation: Record<string, unknown> | null = null;
  let attempt: Record<string, any> | null = null;
  let persisted: Record<string, unknown> | null = null;
  const gate: OwnerCostRpcGate = {
    async rpc(name: string, args: Record<string, unknown> = {}) {
      calls.push({ name, args: structuredClone(args) });
      if (name === "read_financial_runtime_environment") {
        return { data: { financial_environment: "test" }, error: null };
      }
      if (name === "read_owner_cost_operation") {
        return { data: operation ? { operation, attempts: attempt ? [attempt] : [], links: [] } : null, error: null };
      }
      if (name === "establish_owner_cost_operation") {
        operation ??= {
          operation_id: args.p_operation_id,
          operation_key: args.p_operation_key,
          request_fingerprint: args.p_request_fingerprint,
          created_at: args.p_created_at,
        };
        return { data: { operation_id: args.p_operation_id, replay: false }, error: null };
      }
      if (name === "authorize_owner_cost_provider_attempt") {
        if (!attempt) {
          attempt = {
            attempt_id: args.p_attempt_id,
            attempt_number: args.p_attempt_number,
            events: [{ event_sequence: 1, lifecycle_state: "authorized", occurred_at: args.p_authorized_at }],
            valuations: [],
          };
        }
        return { data: { attempt_id: args.p_attempt_id, authorized: true, replay: attempt.events.length > 1 }, error: null };
      }
      if (name === "append_owner_cost_attempt_event") {
        assert.ok(attempt);
        const sequence = Number(args.p_event_sequence);
        const existing = attempt.events.find((event: Record<string, unknown>) => event.event_sequence === sequence);
        if (!existing) {
          attempt.events.push({
            attempt_event_id: args.p_attempt_event_id,
            event_sequence: sequence,
            lifecycle_state: args.p_lifecycle_state,
            provider_reference_id: args.p_provider_reference_id,
            normalized_usage_evidence: args.p_normalized_usage_evidence,
            private_provider_evidence: args.p_private_provider_evidence,
            occurred_at: args.p_occurred_at,
          });
        }
        return { data: { replay: Boolean(existing), provider_submission_created: !existing && args.p_lifecycle_state === "submitted" }, error: null };
      }
      if (name === "record_owner_cost_valuation") {
        assert.ok(attempt);
        const existing = attempt.valuations.find((value: Record<string, unknown>) => value.valuation_id === args.p_valuation_id);
        if (!existing) attempt.valuations.push({ valuation_id: args.p_valuation_id, ...args });
        return { data: { valuation_id: args.p_valuation_id, journal_event_id: args.p_valuation_id, replay: Boolean(existing) }, error: null };
      }
      if (name === "read_owner_hearth_text_result") return { data: persisted, error: null };
      if (name === "persist_owner_hearth_text_result") {
        persisted = {
          ...args.p_result_json as Record<string, unknown>,
          result_json: args.p_result_json,
          owner_cost_attempt_id: args.p_owner_cost_attempt_id,
          route_code: args.p_route_code,
          provider_request_id: args.p_provider_request_id,
          input_units: args.p_input_units,
          output_units: args.p_output_units,
        };
        return { data: persisted, error: null };
      }
      return { data: {}, error: null };
    },
  };
  return { gate, calls };
}

test("the real Hearth chat handler requires funding before its one fake OpenAI call and settles after persistence", async () => {
  const gateCalls: string[] = [];
  let providerCalls = 0;
  const gate = {
    async rpc(name: string, _args: Record<string, unknown>) {
      gateCalls.push(name);
      if (name === "acquire_openai_text_aggregate_admission") return { data: { enforcement_enabled: true, authorized: true, hold_id: "isolated-hold" }, error: null };
      if (name === "read_openai_execution_requirement") {
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
            funding_environment: "owner_internal",
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
        funding_environment: "owner_internal",
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
        if (name === "read_openai_execution_requirement") {
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
          customer_credit_units: 4,
          failure_customer_charge_micros: 0, funding_eligible: false, funding_source: "none",
          funding_environment: "test",
          payer_kind: "personal", funding_label: "No verified eligible funds", expires_at: new Date(Date.now() + 60_000).toISOString(),
        }, error: null };
        if (name === "read_openai_text_quote_bounding_context") return { data: {
          model: "gpt-5.6-luna", maximum_input_units: 20000, maximum_output_units: 512, maximum_attempts: 1,
        }, error: null };
        if (name === "bind_bounded_provider_quote_request") return { data: { replay: false }, error: null };
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

test("script-preparation readiness reaches ordinary customer chat pricing without generating a script", async () => {
  const prompt = "are we ready to put together a script?";
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
      async rpc(name: string, args: Record<string, unknown>) {
        if (name === "read_openai_execution_requirement") {
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
          quote_id: QUOTE_ID,
          operation_id: args.p_operation_id,
          quote_hash: "b".repeat(64),
          request_fingerprint: args.p_request_fingerprint,
          currency: "USD",
          maximum_customer_charge_micros: 15_000,
          customer_credit_units: 3,
          failure_customer_charge_micros: 0,
          funding_eligible: true,
          funding_source: "customer_deposit",
          funding_environment: "test",
          payer_kind: "personal",
          funding_label: "Forge Credits",
          expires_at: new Date(Date.now() + 60_000).toISOString(),
        }, error: null };
        if (name === "read_openai_text_quote_bounding_context") return { data: {
          model: "gpt-5.6-luna", maximum_input_units: 2_000, maximum_output_units: 512, maximum_attempts: 1,
        }, error: null };
        if (name === "bind_bounded_provider_quote_request") return { data: { replay: false }, error: null };
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
      messages: [{ role: "user", content: prompt }],
      user_authored_text: prompt,
      attachment_context: { include_episode_attachments: false, attachment_ids: [] },
      episode_context: {
        episodeId: "episode-1",
        workspaceId: "55555555-5555-4555-8555-555555555555",
        title: "Script readiness",
        titleVariants: { A: "", B: "", C: "" },
        outline: "",
        body: "",
        sources: [],
        sparks: [],
      },
    }),
  }));
  const payload = await response.json() as Record<string, any>;
  assert.equal(response.status, 409, JSON.stringify(payload));
  assert.equal(payload.code, "hearth_spending_confirmation_required");
  assert.equal(payload.billing_quote.credit_charge, 3);
  assert.notEqual(payload.code, "paid_quote_scope_mismatch");
  assert.equal(providerCalls, 0);
});

test("research with an inactive customer price is unavailable before retrieval", async () => {
  const workspaceId = "55555555-5555-4555-8555-555555555555";
  const routeReads: string[] = [];
  const gateCalls: string[] = [];
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
      async rpc(name: string, args: Record<string, unknown>) {
        gateCalls.push(name);
        if (name === "read_openai_execution_requirement") {
          return { data: { mode: "inactive", funding_context_required: false }, error: null };
        }
        if (name === "read_openai_text_route_execution_requirement") {
          const route = String(args.p_route_code ?? "");
          routeReads.push(route);
          return {
            data: route === "hearth.chat_completion"
              ? { mode: "enforce", funding_context_required: true }
              : { mode: "inactive", funding_context_required: false },
            error: null,
          };
        }
        if (name === "create_customer_hearth_chat_quote") {
          return {
            data: null,
            error: { message: "customer Hearth paid test authorization is not active" },
          };
        }
        return { data: {}, error: null };
      },
    },
    resolveUserIdForAccessToken: async () => USER_ID,
    openAiProviderFetch: async () => {
      providerCalls += 1;
      return new Response();
    },
  } satisfies HearthRuntimeConfig;
  const handler = createHearthAiHandler(config);
  const episodeContext = {
    episodeId: "episode-1",
    workspaceId,
    title: "Unfamiliar certification subject",
    titleVariants: { A: "", B: "", C: "" },
    outline: "",
    body: "",
    sources: [],
    sparks: [],
  };

  const researchResponse = await handler(new Request("http://localhost/api/hearth/chat", {
    method: "POST",
    headers: { authorization: "Bearer fake-user-token", "content-type": "application/json" },
    body: JSON.stringify({
      lane: "forge",
      messages: [{ role: "user", content: "how has the war with Iran affected oil prices in the United States and how has the Venezuala situation been involved?" }],
      user_authored_text: "how has the war with Iran affected oil prices in the United States and how has the Venezuala situation been involved?",
      attachment_context: { include_episode_attachments: false, attachment_ids: [] },
      episode_context: episodeContext,
    }),
  }));
  const researchPayload = await researchResponse.json() as Record<string, any>;
  assert.equal(researchResponse.status, 503, JSON.stringify(researchPayload));
  assert.equal(researchPayload.code, "customer_research_unavailable");
  assert.match(researchPayload.error, /pricing is not active/i);
  assert.deepEqual(routeReads, []);
  assert.equal(gateCalls.includes("quote_owner_hearth_research_operation"), false);
  assert.equal(gateCalls.includes("authorize_owner_hearth_research_openai_attempt"), false);
  assert.equal(providerCalls, 0);
});

test("insufficient inspected customer research evidence releases the reservation with no Luna call or charge", async () => {
  const workspaceId = "55555555-5555-4555-8555-555555555555";
  const quoteHash = "c".repeat(64);
  let quoteArgs: Record<string, unknown> = {};
  let reserveArgs: Record<string, unknown> = {};
  let providerCalls = 0;
  let releaseCalls = 0;
  let settlementCalls = 0;
  const gate = {
    async rpc(name: string, args: Record<string, unknown>) {
      if (name === "read_openai_execution_requirement") {
        return { data: { mode: "enforce", funding_context_required: true }, error: null };
      }
      if (name === "read_existing_openai_text_funding_handle") return { data: {}, error: null };
      if (name === "resolve_openai_text_model_for_funding_quote") return { data: {
        catalog_revision_id: "77777777-7777-4777-8777-777777777777",
        catalog_revision: 1,
        model_catalog_entry_id: "88888888-8888-4888-8888-888888888888",
        runtime_model_id: "gpt-5.6-luna",
        provider_model_id: "gpt-5.6-luna",
        display_name: "Hearth Research",
        tradeoff_summary: "Current sources with bounded evidence synthesis.",
      }, error: null };
      if (name === "create_customer_openai_text_quote") {
        quoteArgs = args;
        return { data: {
          quote_id: args.p_quote_id,
          operation_id: args.p_operation_id,
          quote_hash: quoteHash,
          request_fingerprint: args.p_request_fingerprint,
          currency: "USD",
          maximum_customer_charge_micros: 105000,
          customer_credit_units: 21,
          failure_customer_charge_micros: 0,
          funding_eligible: true,
          funding_source: "customer_deposit",
          payer_kind: "personal",
          funding_environment: "test",
          funding_label: "Forge Credits",
          included_quantity: { input_tokens: 128000, output_tokens: 16384, attempts: 1 },
          expires_at: args.p_expires_at,
          provider_funding_summary: [{ component: "research", provider_label: "Forge Research", credential_source: "forge" }],
        }, error: null };
      }
      if (name === "reserve_customer_openai_text_quote") {
        reserveArgs = args;
        return { data: { paid_execution: {
          operation_id: args.p_operation_id,
          reservation_id: args.p_reservation_id,
          request_fingerprint: args.p_request_fingerprint,
          funding_environment: "test",
        } }, error: null };
      }
      if (name === "resolve_openai_text_paid_execution_context") {
        return { data: {
          operation_id: quoteArgs.p_operation_id,
          reservation_id: reserveArgs.p_reservation_id,
          quote_id: quoteArgs.p_quote_id,
          route_code: "hearth.research_synthesis",
          funding_source_type: "customer_deposit",
          funding_source_id: "66666666-6666-4666-8666-666666666666",
          funding_environment: "test",
          credential_funding: "forge",
          model: "gpt-5.6-luna",
          maximum_input_units: 128000,
          maximum_output_units: 16384,
          maximum_attempts: 1,
          maximum_failure_exposure_micros: 16759,
          direct_provider_ceiling_micros: 16759,
          supporting_cost_ceiling_micros: 0,
          input_micros_per_million_tokens: 200000,
          cached_input_micros_per_million_tokens: 20000,
          output_micros_per_million_tokens: 1200000,
          reservation_state: "reserved",
        }, error: null };
      }
      if (name === "settle_customer_hearth_research_before_synthesis") {
        releaseCalls += 1;
        assert.equal(args.p_failure_class, "research_no_verifiable_sources");
        return { data: { reservation_state: "released", customer_charge_micros: 0 }, error: null };
      }
      if (name === "settle_operation") settlementCalls += 1;
      return { data: {}, error: null };
    },
  };
  const prompt = "As of today, how has the war with Iran affected U.S. oil prices? Use current sources.";
  const body = {
    lane: "forge",
    messages: [{ role: "user", content: prompt }],
    user_authored_text: prompt,
    attachment_context: { include_episode_attachments: false, attachment_ids: [] },
    episode_context: {
      episodeId: "episode-1",
      workspaceId,
      title: "Current oil prices",
      titleVariants: { A: "", B: "", C: "" },
      outline: "",
      body: "",
      tonePreset: null,
      sources: [],
      sparks: [],
    },
  };
  const config = {
    textApiKey: "fake-forge-key",
    imageApiKey: null,
    researchApiKey: "fake-brave-key",
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
    researchRuntime: {
      async run(args: any) {
        return {
          mode: "partial_retrieval" as const,
          runtimeStatus: "partial" as const,
          providerStatus: "configured_and_operational" as const,
          brief: args.brief,
          sources: [{
            sourceId: "retrieval-1",
            title: "Oversized report",
            url: "https://example.test/oversized",
            domain: "example.test",
            publishedAt: null,
            snippet: null,
            extractedText: null,
            extractionStatus: "skipped" as const,
            extractionError: "Aggregate evidence budget exhausted before this source could be retained",
            provenance: {
              origin: "search" as const,
              briefFingerprint: args.brief.briefFingerprint,
              inspectedAt: null,
              inspectionStatus: "inaccessible" as const,
              accessFailureReason: "extraction_failed" as const,
              verifiedInCurrentRequest: false,
            },
          }],
          evidence: [{
            evidenceId: "evidence-1",
            briefFingerprint: args.brief.briefFingerprint,
            workpieceId: args.brief.workpieceId,
            sourceId: "retrieval-1",
            excerpt: null,
            authority: "unassessed" as const,
            state: "inaccessible" as const,
            uncertainty: "Aggregate evidence budget exhausted",
          }],
          artifact: null,
          synthesis: { summary: "Limited", keyPoints: [], uncertainties: [], coverageNote: "0/1" },
        };
      },
    },
    openAiProviderFetch: async () => {
      providerCalls += 1;
      return new Response();
    },
  } satisfies HearthRuntimeConfig;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
  try {
    const handler = createHearthAiHandler(config);
    const quoteResponse = await handler(new Request("http://localhost/api/hearth/chat", {
      method: "POST",
      headers: { authorization: "Bearer fake-user-token", "content-type": "application/json" },
      body: JSON.stringify(body),
    }));
    const quote = await quoteResponse.json() as Record<string, any>;
    assert.equal(quoteResponse.status, 409, JSON.stringify(quote));
    assert.equal(quote.billing_quote.credit_charge, 21);

    const failedResponse = await handler(new Request("http://localhost/api/hearth/chat", {
      method: "POST",
      headers: { authorization: "Bearer fake-user-token", "content-type": "application/json" },
      body: JSON.stringify({
        ...body,
        spending_acceptance: {
          operation_id: quote.billing_quote.operation_id,
          quote_id: quote.billing_quote.quote_id,
          quote_hash: quote.billing_quote.quote_hash,
          request_fingerprint: quote.billing_quote.request_fingerprint,
        },
      }),
    }));
    const failed = await failedResponse.json() as Record<string, any>;
    assert.equal(failedResponse.status, 503, JSON.stringify(failed));
    assert.equal(failed.code, "current_verification_unavailable");
    assert.match(String(failed.error), /No Forge Credits were charged/i);
    assert.equal(String(quoteArgs.p_operation_id), String(reserveArgs.p_operation_id));
    assert.equal(releaseCalls, 1);
    assert.equal(settlementCalls, 0);
    assert.equal(providerCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("settled customer research replay returns its canonical result without new funding or supplier work", async () => {
  const workspaceId = "55555555-5555-4555-8555-555555555555";
  const workpieceId = "21d16d6a-905b-491e-8761-028789612ae5";
  const reservationId = "3d6eb033-d322-4b9e-8287-ec0d95fe94eb";
  const domainResultId = "9daad93b-fc07-447b-90aa-64a73e7b85f2";
  const prompt = "For a September 16, 2026 update, explain how the Iran war is changing U.S. crude oil and gasoline prices and how Venezuela is affecting supply and prices. Use current sources, cite each factual claim, and state any evidence limitations.";
  const canonicalAssistantText = "Persisted current-evidence synthesis with citations.";
  const gateCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
  let quoteCalls = 0;
  let reservationCalls = 0;
  let settlementCalls = 0;
  let openAiCalls = 0;
  let supplierNetworkCalls = 0;
  let replayedCaptureReads = 0;
  let quoteBindingCalls = 0;
  let reliefCalls = 0;
  let aggregateWrites = 0;
  let creditBalance = 7_928;

  const gate = {
    async rpc(name: string, args: Record<string, unknown>) {
      gateCalls.push({ name, args });
      if (name === "read_openai_execution_requirement") {
        return { data: { mode: "enforce", funding_context_required: true }, error: null };
      }
      if (name === "read_existing_openai_text_funding_handle") {
        return { data: {
          operation_id: args.p_operation_id,
          reservation_id: reservationId,
          request_fingerprint: args.p_request_fingerprint,
          funding_environment: "test",
          reservation_state: "settled",
        }, error: null };
      }
      if (name === "begin_customer_hearth_research_stage") {
        replayedCaptureReads += 1;
        const search = args.p_stage_type === "search";
        const body = search
          ? JSON.stringify({ web: { results: [{ title: "Current source", url: "https://example.test/current" }] } })
          : "Current inspected evidence about oil and gasoline prices.";
        return { data: {
          replay: true,
          event_type: "captured",
          capture: {
            status: 200,
            headers: { "content-type": search ? "application/json" : "text/plain" },
            body_base64: Buffer.from(body).toString("base64"),
            response_bytes: Buffer.byteLength(body),
          },
        }, error: null };
      }
      if (name === "bind_customer_hearth_research_quote_request") {
        quoteBindingCalls += 1;
        return { data: null, error: { message: "bounded provider quote request replay conflict" } };
      }
      if (name === "resolve_openai_text_paid_execution_context") {
        return { data: {
          operation_id: args.p_operation_id,
          reservation_id: reservationId,
          quote_id: "1aba576b-6927-4aff-b2c3-3d08be2df0ea",
          route_code: "hearth.research_synthesis",
          funding_source_type: "customer_deposit",
          funding_source_id: "66666666-6666-4666-8666-666666666666",
          funding_environment: "test",
          credential_funding: "forge",
          model: "gpt-5.6-luna",
          maximum_input_units: 128000,
          maximum_output_units: 16384,
          maximum_attempts: 1,
          maximum_failure_exposure_micros: 36759,
          direct_provider_ceiling_micros: 16759,
          supporting_cost_ceiling_micros: 20000,
          input_micros_per_million_tokens: 200000,
          cached_input_micros_per_million_tokens: 20000,
          output_micros_per_million_tokens: 1200000,
          reservation_state: "settled",
        }, error: null };
      }
      if (name === "read_openai_text_paid_result") {
        return { data: {
          provider_request_id: "req_original_luna",
          input_units: 7244,
          output_units: 586,
          customer_charge_micros: 105000,
          result_json: {
            assistant_text: canonicalAssistantText,
            ops: [],
            script_text: null,
            tag_audit: null,
            research_result: { sources: [{ sourceId: "original-source" }] },
            domain_result_id: domainResultId,
          },
        }, error: null };
      }
      if (name === "record_paid_operation_aggregate_outcome") {
        aggregateWrites += 1;
        return { data: { replay: true }, error: null };
      }
      if (name === "settle_customer_hearth_research_before_synthesis") {
        reliefCalls += 1;
        creditBalance += 21;
        return { data: { state: "relieved" }, error: null };
      }
      if (name === "create_customer_openai_text_quote") quoteCalls += 1;
      if (name === "reserve_customer_openai_text_quote") reservationCalls += 1;
      if (name === "settle_operation") {
        settlementCalls += 1;
        creditBalance -= 21;
      }
      return { data: {}, error: null };
    },
  };
  const config = {
    textApiKey: "fake-forge-key",
    imageApiKey: null,
    researchApiKey: "fake-brave-key",
    apiKey: "fake-forge-key",
    model: "gpt-5.6-luna",
    sttModel: "gpt-4o-mini-transcribe",
    configuredBillingMode: "forge" as const,
    initialTokenBalance: creditBalance,
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
    researchRuntime: {
      async run(args: any) {
        assert.equal(await (await args.fetchImpl("https://api.search.brave.com/res/v1/web/search?q=current")).text() !== "", true);
        assert.equal(await (await args.fetchImpl("https://example.test/current")).text() !== "", true);
        return {
          mode: "knowledge_first" as const,
          runtimeStatus: "complete" as const,
          providerStatus: "configured_and_operational" as const,
          brief: args.brief,
          sources: [{
            sourceId: "retrieval-1",
            title: "Current source",
            url: "https://example.test/current",
            domain: "example.test",
            publishedAt: "2026-09-16",
            snippet: "Current evidence",
            extractedText: "Current inspected evidence about oil and gasoline prices.",
            extractionStatus: "extracted" as const,
            extractionError: null,
            provenance: {
              origin: "search" as const,
              briefFingerprint: args.brief.briefFingerprint,
              inspectedAt: "2026-09-16T12:00:00.000Z",
              inspectionStatus: "inspected" as const,
              accessFailureReason: null,
              verifiedInCurrentRequest: true,
            },
          }],
          evidence: [{
            evidenceId: "evidence-1",
            briefFingerprint: args.brief.briefFingerprint,
            workpieceId: args.brief.workpieceId,
            sourceId: "retrieval-1",
            excerpt: "Current inspected evidence about oil and gasoline prices.",
            authority: "secondary" as const,
            state: "inspected" as const,
            uncertainty: null,
          }],
          artifact: null,
          synthesis: { summary: "Current evidence", keyPoints: [], uncertainties: [], coverageNote: "1/1" },
        };
      },
    },
    openAiProviderFetch: async () => {
      openAiCalls += 1;
      throw new Error("settled replay must not call Luna");
    },
  } satisfies HearthRuntimeConfig;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("api.search.brave.com") || url.includes("example.test/current")) {
      supplierNetworkCalls += 1;
      throw new Error("settled replay must use captured evidence only");
    }
    return new Response("{}", { status: 503, headers: { "content-type": "application/json" } });
  };
  try {
    const handler = createHearthAiHandler(config);
    const response = await handler(new Request("http://localhost/api/hearth/chat", {
      method: "POST",
      headers: { authorization: "Bearer fake-user-token", "content-type": "application/json" },
      body: JSON.stringify({
        lane: "forge",
        messages: [{ role: "user", content: prompt }],
        user_authored_text: prompt,
        attachment_context: { include_episode_attachments: false, attachment_ids: [] },
        episode_context: {
          episodeId: workpieceId,
          workspaceId,
          title: "Current oil and gasoline prices",
          titleVariants: { A: "", B: "", C: "" },
          outline: "",
          body: "",
          tonePreset: null,
          sources: [],
          sparks: [],
        },
      }),
    }));
    const replay = await response.json() as Record<string, any>;
    assert.equal(response.status, 200, JSON.stringify(replay));
    assert.equal(replay.billing_receipt.status, "settled_replay");
    assert.equal(replay.billing_receipt.customer_charge_micros, 105000);
    assert.equal(replay.domain_result_id, domainResultId);
    assert.equal(replay.assistant_text, canonicalAssistantText);
    assert.equal(replayedCaptureReads, 0);
    assert.equal(quoteBindingCalls, 0);
    assert.equal(quoteCalls, 0);
    assert.equal(reservationCalls, 0);
    assert.equal(settlementCalls, 0);
    assert.equal(creditBalance, 7_928);
    assert.equal(supplierNetworkCalls, 0);
    assert.equal(openAiCalls, 0);
    assert.equal(reliefCalls, 0);
    assert.equal(aggregateWrites, 0);
    assert.equal(gateCalls.some((call) => call.name === "read_openai_text_paid_result"), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("customer quote acceptance reserves, executes, settles, closes, and replays without a second charge or provider call", async () => {
  const workspaceId = "55555555-5555-4555-8555-555555555555";
  const depositId = "66666666-6666-4666-8666-666666666666";
  const quoteHash = "b".repeat(64);
  let providerCalls = 0;
  let reservationState = "reserved";
  let settlementCalls = 0;
  let providerRequestMessages: Array<{ role: string; content: string }> = [];
  let quoteArgs: Record<string, unknown> = {};
  let reserveArgs: Record<string, unknown> = {};
  let persistedResult: Record<string, unknown> | null = null;
  const gate = {
    async rpc(name: string, args: Record<string, unknown>) {
      if (name === "acquire_openai_text_aggregate_admission") return { data: { enforcement_enabled: true, authorized: true, hold_id: "isolated-hold" }, error: null };
      if (name === "read_openai_execution_requirement") {
        return { data: { mode: "enforce", funding_context_required: true }, error: null };
      }
      if (name === "read_existing_openai_text_funding_handle") {
        return reservationState === "settled" ? { data: {
          operation_id: quoteArgs.p_operation_id,
          reservation_id: reserveArgs.p_reservation_id,
          request_fingerprint: quoteArgs.p_request_fingerprint,
          funding_environment: "test",
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
          customer_credit_units: 4,
          failure_customer_charge_micros: 0,
          funding_eligible: true, funding_source: "customer_deposit", payer_kind: "personal",
          funding_environment: "test",
          funding_label: "Verified AI credit purchase",
          included_quantity: { input_tokens: 2000, output_tokens: 512, attempts: 1 },
          expires_at: args.p_expires_at,
          provider_funding_summary: [{ component: "text_generation", provider_label: "OpenAI", credential_source: "forge" }],
        }, error: null };
      }
      if (name === "read_openai_text_quote_bounding_context") return { data: {
        model: "gpt-5.6-luna", maximum_input_units: 20000, maximum_output_units: 512, maximum_attempts: 1,
      }, error: null };
      if (name === "bind_bounded_provider_quote_request" || name === "bind_bounded_provider_request") {
        return { data: { replay: false }, error: null };
      }
      if (name === "reserve_customer_openai_text_quote") {
        reserveArgs = args;
        return { data: { paid_execution: {
          operation_id: args.p_operation_id,
          reservation_id: args.p_reservation_id,
          request_fingerprint: args.p_request_fingerprint,
          funding_environment: "test",
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
          funding_environment: "test",
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
    openAiProviderFetch: async (_url, init) => {
      providerCalls += 1;
      const requestBody = JSON.parse(String(init?.body ?? "{}")) as {
        messages?: Array<{ role: string; content: string }>;
      };
      providerRequestMessages = requestBody.messages ?? [];
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
      messages: [
        { role: "user", content: "Find strong sources for this episode." },
        { role: "assistant", content: "Use EIA first and PBS for current Iran-war reporting." },
        { role: "user", content: USER_MESSAGE },
      ],
      user_authored_text: USER_MESSAGE,
      attachment_context: { include_episode_attachments: false, attachment_ids: [] },
      episode_context: {
        episodeId: "episode-1", workspaceId, title: "Bounded customer test",
        titleVariants: { A: "", B: "", C: "" }, outline: "Evidence-led episode outline", body: "Opening draft",
        tonePreset: "Neutral conversational",
        sources: [{ id: "source-eia", title: "EIA gasoline explainer", url: "https://www.eia.gov/example", note: "Primary source", citedIn: [] }],
        sparks: [{ id: "spark-gas", text: "Explain current gasoline prices." }],
      },
    };
    const quotedResponse = await handler(new Request("http://localhost/api/hearth/chat", {
      method: "POST", headers: { authorization: "Bearer fake-user-token", "content-type": "application/json" },
      body: JSON.stringify(body),
    }));
    const quoted = await quotedResponse.json() as Record<string, any>;
    assert.equal(quotedResponse.status, 409, JSON.stringify(quoted));
    assert.equal(quoted.billing_quote.credit_charge, 4, JSON.stringify(quoted));
    for (const internalKey of [
      "currency", "maximum_customer_charge_micros", "failure_customer_charge_micros",
      "funding_source", "payer_kind", "provider_model_id", "catalog_revision",
      "estimated_customer_charge_micros", "cost_components", "limits",
    ]) assert.equal(internalKey in quoted.billing_quote, false, internalKey);
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
    const providerVisible = providerRequestMessages.map((message) => message.content).join("\n");
    assert.match(providerVisible, /Do not behave as if each message is a new conversation/);
    assert.match(providerVisible, /Bounded customer test/);
    assert.match(providerVisible, /EIA gasoline explainer/);
    assert.match(providerVisible, /Use EIA first and PBS/);

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

test("explicit owner Hearth authority fails closed without exposing or falling back from its isolated credential", async () => {
  const workspaceId = "55555555-5555-4555-8555-555555555555";
  let providerCalls = 0;
  const handler = createHearthAiHandler({
    textApiKey: "legacy-key-must-not-be-used",
    ownerTextApiKey: null,
    imageApiKey: null,
    researchApiKey: null,
    apiKey: "legacy-key-must-not-be-used",
    model: "gpt-5.3",
    sttModel: "gpt-4o-mini-transcribe",
    configuredBillingMode: "forge",
    initialTokenBalance: 0,
    supabaseUrl: null,
    supabaseServiceRoleKey: null,
    supabaseRpcKey: null,
    sttBucket: "forge-workpieces",
    disableForgeLaneAi: false,
    disableUserKeys: false,
    disableExpensiveAiActions: false,
    disableCdcGeneration: false,
    openAiTextGate: { async rpc() { return { data: {}, error: null }; } },
    ownerAuthorityReader: ownerAuthorityReader(),
    resolveUserIdForAccessToken: async () => USER_ID,
    openAiProviderFetch: async () => {
      providerCalls += 1;
      return new Response(null, { status: 500 });
    },
  });
  const response = await handler(new Request("http://localhost/api/hearth/chat", {
    method: "POST",
    headers: { authorization: "Bearer owner-token", "content-type": "application/json" },
    body: JSON.stringify({
      lane: "forge",
      messages: [{ role: "user", content: USER_MESSAGE }],
      user_authored_text: USER_MESSAGE,
      attachment_context: { include_episode_attachments: false, attachment_ids: [] },
      episode_context: { episodeId: "owner-workpiece", workspaceId, title: "", titleVariants: { A: "", B: "", C: "" }, outline: "", body: "", sources: [], sparks: [] },
    }),
  }));
  const payload = await response.json() as Record<string, unknown>;
  assert.equal(response.status, 500, JSON.stringify(payload));
  assert.equal(payload.code, "owner_hearth_runtime_unavailable");
  assert.equal(payload.error, "Private owner AI is unavailable in this runtime.");
  assert.equal(JSON.stringify(payload).includes("OPENAI_HEARTH_OWNER_API_KEY"), false);
  assert.equal(providerCalls, 0);
});

test("one-sided owner authority cannot fall through to customer finance", async () => {
  const workspaceId = "55555555-5555-4555-8555-555555555555";
  let providerCalls = 0;
  const gateCalls: string[] = [];
  const handler = createHearthAiHandler({
    textApiKey: "customer-key-must-not-be-used",
    ownerTextApiKey: "owner-key-must-not-be-used",
    imageApiKey: null,
    researchApiKey: null,
    apiKey: "customer-key-must-not-be-used",
    model: "gpt-5.6-luna",
    sttModel: "gpt-4o-mini-transcribe",
    configuredBillingMode: "forge",
    initialTokenBalance: 99,
    supabaseUrl: null,
    supabaseServiceRoleKey: null,
    supabaseRpcKey: null,
    sttBucket: "forge-workpieces",
    disableForgeLaneAi: false,
    disableUserKeys: false,
    disableExpensiveAiActions: false,
    disableCdcGeneration: false,
    openAiTextGate: { async rpc(name: string) { gateCalls.push(name); return { data: {}, error: null }; } },
    ownerAuthorityReader: {
      async readTransitionAuthority(userId: string) { return {
        userId, canonicalUserId: userId, accountClass: "owner" as const, accountAuthorityRevision: 1,
        accountAuthorityExplicit: true, legacyUserId: null, legacyPrincipalStatus: null,
        legacyPrincipalRevision: null, sameUser: true, consistent: false, eligible: false,
        state: "authority_mismatch" as const, authorityMode: "canonical_legacy_dual_read" as const,
      }; },
      async readWorkspaceMembership() { return { role: "owner" }; },
    },
    resolveUserIdForAccessToken: async () => USER_ID,
    openAiProviderFetch: async () => { providerCalls += 1; return new Response(); },
  });
  const response = await handler(new Request("http://localhost/api/hearth/chat", {
    method: "POST",
    headers: { authorization: "Bearer owner-token", "content-type": "application/json" },
    body: JSON.stringify({
      lane: "forge",
      messages: [{ role: "user", content: USER_MESSAGE }],
      user_authored_text: USER_MESSAGE,
      attachment_context: { include_episode_attachments: false, attachment_ids: [] },
      episode_context: { episodeId: "owner-workpiece", workspaceId, title: "", titleVariants: { A: "", B: "", C: "" }, outline: "", body: "", sources: [], sparks: [] },
    }),
  }));
  const payload = await response.json() as Record<string, unknown>;
  assert.equal(response.status, 403, JSON.stringify(payload));
  assert.equal(payload.code, "owner_authority_mismatch");
  assert.equal(payload.error, "Owner execution is not authorized.");
  assert.equal(providerCalls, 0);
  assert.equal(gateCalls.some((name) => /quote|reserv|settle|customer/i.test(name)), false);
});

test("customer research synthesis admission requires current inspected evidence, not merely a source row", () => {
  const brief = {
    schema: "forge.hearth.research-brief.v1" as const,
    workspaceId: "55555555-5555-4555-8555-555555555555",
    workpieceId: "episode-1",
    briefFingerprint: "f".repeat(64),
    creatorRequest: "Verify current evidence",
    episodeTitle: "Current evidence",
    goals: ["Verify current evidence"],
    queries: ["current evidence"],
    sourcePriorities: ["Primary records"],
  };
  const skippedOnly = {
    mode: "partial_retrieval" as const,
    runtimeStatus: "partial" as const,
    brief,
    sources: [{
      sourceId: "retrieval-1",
      title: "Oversized source",
      url: "https://example.test/oversized",
      domain: "example.test",
      publishedAt: null,
      snippet: null,
      extractedText: null,
      extractionStatus: "skipped" as const,
      extractionError: "Aggregate evidence budget exhausted before this source could be retained",
      provenance: {
        origin: "search" as const,
        briefFingerprint: brief.briefFingerprint,
        inspectedAt: null,
        inspectionStatus: "inaccessible" as const,
        accessFailureReason: "extraction_failed" as const,
        verifiedInCurrentRequest: false,
      },
    }],
    evidence: [{
      evidenceId: "evidence-1",
      briefFingerprint: brief.briefFingerprint,
      workpieceId: brief.workpieceId,
      sourceId: "retrieval-1",
      excerpt: null,
      authority: "unassessed" as const,
      state: "inaccessible" as const,
      uncertainty: "Aggregate evidence budget exhausted",
    }],
    artifact: null,
    synthesis: { summary: "Limited", keyPoints: [], uncertainties: [], coverageNote: "0/1" },
  };
  assert.equal(hasSufficientCustomerResearchEvidence(skippedOnly), false);

  const inspected = {
    ...skippedOnly,
    sources: [{
      ...skippedOnly.sources[0],
      extractedText: "Current inspected evidence",
      extractionStatus: "extracted" as const,
      extractionError: null,
      provenance: {
        ...skippedOnly.sources[0].provenance,
        inspectedAt: "2026-09-16T00:00:00.000Z",
        inspectionStatus: "inspected" as const,
        verifiedInCurrentRequest: true,
      },
    }],
    evidence: [{
      ...skippedOnly.evidence[0],
      excerpt: "Current inspected evidence",
      state: "inspected" as const,
      uncertainty: null,
    }],
  };
  assert.equal(hasSufficientCustomerResearchEvidence(inspected), true);
  assert.equal(hasSufficientCustomerResearchEvidence({
    ...inspected,
    evidence: [{ ...inspected.evidence[0], briefFingerprint: "0".repeat(64) }],
  }), false);
});

test("script generation prepares the distinct five-credit bounded quote without a provider call", async () => {
  const workspaceId = "cc5478ff-37be-403e-824c-467fa7da061e";
  const workpieceId = "21d16d6a-905b-491e-8761-028789612ae5";
  const prompt = "lets see the first draft of this script for a single presenter";
  let providerCalls = 0;
  let quotedRoute = "";
  let boundedRoute = "";
  const gate = {
    async rpc(name: string, args: Record<string, unknown>) {
      if (name === "read_openai_execution_requirement") {
        return { data: { mode: "enforce", funding_context_required: true }, error: null };
      }
      if (name === "read_existing_openai_text_funding_handle") return { data: {}, error: null };
      if (name === "resolve_openai_text_model_for_funding_quote") return { data: {
        catalog_revision_id: "13000000-0000-4000-8000-000000000005",
        catalog_revision: 6,
        model_catalog_entry_id: "88888888-8888-4888-8888-888888888888",
        runtime_model_id: "gpt-5.6-luna",
        provider_model_id: "gpt-5.6-luna",
        display_name: "GPT-5.6 Luna",
        tradeoff_summary: "Bounded script-generation canary.",
      }, error: null };
      if (name === "create_customer_openai_text_quote") {
        quotedRoute = String(args.p_route_code ?? "");
        return { data: {
          quote_id: args.p_quote_id,
          operation_id: args.p_operation_id,
          quote_hash: "b".repeat(64),
          request_fingerprint: args.p_request_fingerprint,
          currency: "USD",
          maximum_customer_charge_micros: 25_000,
          customer_credit_units: 5,
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
        model: "gpt-5.6-luna",
        maximum_input_units: 32_000,
        maximum_output_units: 8_000,
        maximum_attempts: 1,
      }, error: null };
      if (name === "bind_bounded_provider_quote_request") {
        boundedRoute = String(args.p_route_code ?? "");
        assert.ok(Number(args.p_bounded_input_tokens) <= 32_000);
        assert.equal(args.p_maximum_output_tokens, 8_000);
        assert.equal(args.p_maximum_attempts, 1);
        return { data: { replay: false }, error: null };
      }
      return { data: {}, error: null };
    },
  };
  try {
    const handler = createHearthAiHandler({
      textApiKey: "fake-forge-key",
      imageApiKey: null,
      researchApiKey: null,
      apiKey: "fake-forge-key",
      model: "gpt-5.6-luna",
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
      openAiProviderFetch: async () => {
        providerCalls += 1;
        return new Response(null, { status: 500 });
      },
    });
    const response = await handler(new Request("http://localhost/api/hearth/chat", {
      method: "POST",
      headers: { authorization: "Bearer fake-user-token", "content-type": "application/json" },
      body: JSON.stringify({
        lane: "forge",
        messages: [
          { role: "assistant", content: "The retained research supports a U.S.-focused episode." },
          { role: "user", content: prompt },
        ],
        user_authored_text: prompt,
        attachment_context: { include_episode_attachments: false, attachment_ids: [] },
        episode_context: {
          episodeId: workpieceId,
          workspaceId,
          title: "Why gasoline prices are high",
          titleVariants: { A: "", B: "", C: "" },
          outline: "Crude, refining, inventories, taxes, and current world events.",
          body: "[s1]\nDraft intro goes here.\n[/s1]",
          tonePreset: "Neutral conversational",
          sources: [{ id: "eia", title: "EIA gasoline factors", url: "https://www.eia.gov/example", note: "Primary", citedIn: [] }],
          sparks: [],
        },
      }),
    }));
    const payload = await response.json() as Record<string, any>;
    assert.equal(response.status, 409, JSON.stringify(payload));
    assert.equal(payload.code, "hearth_spending_confirmation_required");
    assert.equal(payload.billing_quote.credit_charge, 5);
    assert.equal(quotedRoute, "hearth.script_generation");
    assert.equal(boundedRoute, "hearth.script_generation");
    assert.equal(providerCalls, 0);
  } finally {
    // The quote-only test intentionally never creates a Supabase or provider transport.
  }
});

test("explicit owner Hearth authority uses only the isolated credential and bypasses neither coordinator nor persistence", async (t) => {
  const prior = process.env.FORGE_OPENAI_TEXT_EXECUTION_MODE;
  process.env.FORGE_OPENAI_TEXT_EXECUTION_MODE = "enforce";
  t.after(() => { if (prior === undefined) delete process.env.FORGE_OPENAI_TEXT_EXECUTION_MODE; else process.env.FORGE_OPENAI_TEXT_EXECUTION_MODE = prior; });
  const workspaceId = "55555555-5555-4555-8555-555555555555";
  let providerCalls = 0;
  const { gate, calls } = createOwnerTextGate();
  const handler = createHearthAiHandler({
    textApiKey: "legacy-key-must-not-be-used",
    ownerTextApiKey: "isolated-owner-key",
    imageApiKey: null,
    researchApiKey: null,
    apiKey: "legacy-key-must-not-be-used",
    model: "gpt-5.3",
    sttModel: "gpt-4o-mini-transcribe",
    configuredBillingMode: "forge",
    initialTokenBalance: 0,
    supabaseUrl: null,
    supabaseServiceRoleKey: null,
    supabaseRpcKey: null,
    sttBucket: "forge-workpieces",
    disableForgeLaneAi: false,
    disableUserKeys: false,
    disableExpensiveAiActions: false,
    disableCdcGeneration: false,
    openAiTextGate: gate,
    ownerCostGate: gate,
    ownerAuthorityReader: ownerAuthorityReader(),
    resolveUserIdForAccessToken: async () => USER_ID,
    openAiProviderFetch: async (_url, init) => {
      providerCalls += 1;
      assert.equal((init?.headers as Record<string, string>).authorization, "Bearer isolated-owner-key");
      return new Response(JSON.stringify({
        id: "chatcmpl_owner_fake",
        choices: [{ message: { content: "The quiet room makes it easier to hear the story take shape." } }],
        usage: { prompt_tokens: 35, completion_tokens: 12 },
      }), { status: 200, headers: { "x-request-id": "req_owner_fake_1" } });
    },
  });
  const response = await handler(new Request("http://localhost/api/hearth/chat", {
    method: "POST",
    headers: { authorization: "Bearer owner-token", "content-type": "application/json" },
    body: JSON.stringify({
      lane: "forge",
      messages: [{ role: "user", content: USER_MESSAGE }],
      user_authored_text: USER_MESSAGE,
      attachment_context: { include_episode_attachments: false, attachment_ids: [] },
      episode_context: { episodeId: "owner-workpiece", workspaceId, title: "", titleVariants: { A: "", B: "", C: "" }, outline: "", body: "", sources: [], sparks: [] },
    }),
  }));
  const payload = await response.json() as Record<string, any>;
  assert.equal(response.status, 200, JSON.stringify(payload));
  assert.equal(providerCalls, 1);
  assert.equal(payload.owner_execution_receipt.customer_charge_micros, 0);
  assert.equal(payload.billing_receipt, undefined);
  const callNames = calls.map((entry) => entry.name);
  assert.ok(callNames.indexOf("establish_owner_cost_operation") < callNames.indexOf("authorize_owner_cost_provider_attempt"));
  assert.ok(callNames.indexOf("authorize_owner_cost_provider_attempt") < callNames.indexOf("persist_owner_hearth_text_result"));
  assert.equal(callNames.includes("resolve_openai_text_paid_execution_context"), false);
  assert.equal(callNames.some((name) => /quote|reservation|settle|customer/i.test(name)), false);

  const replay = await handler(new Request("http://localhost/api/hearth/chat", {
    method: "POST",
    headers: { authorization: "Bearer owner-token", "content-type": "application/json" },
    body: JSON.stringify({
      lane: "forge",
      messages: [{ role: "user", content: USER_MESSAGE }],
      user_authored_text: USER_MESSAGE,
      attachment_context: { include_episode_attachments: false, attachment_ids: [] },
      episode_context: { episodeId: "owner-workpiece", workspaceId, title: "", titleVariants: { A: "", B: "", C: "" }, outline: "", body: "", sources: [], sparks: [] },
    }),
  }));
  assert.equal(replay.status, 200, await replay.text());
  assert.equal(providerCalls, 1);
});
