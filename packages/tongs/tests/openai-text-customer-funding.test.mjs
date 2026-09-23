import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  OpenAiTextFundingPreparationError,
  OpenAiTextQuoteRequiredError,
  resolveOrdinaryOpenAiTextFunding,
} from "../dist/providers/openai-text-customer-funding.js";
import { buildBoundedOpenAiProviderRequest } from "../dist/providers/bounded-provider-request.js";

const quoteId = "11111111-1111-4111-8111-111111111111";
const reservationId = "22222222-2222-4222-8222-222222222222";
const fingerprint = "a".repeat(64);
const quoteHash = "b".repeat(64);

test("existing funding handle SQL returns the strict environment-bound shape without weakening delivery authority", () => {
  const repair = readFileSync(new URL(
    "../../../supabase/migrations/20260916180205_tongs_existing_openai_funding_handle_environment.sql",
    import.meta.url,
  ), "utf8");
  const original = readFileSync(new URL(
    "../../../supabase/migrations/20260928120000_tongs_openai_text_ordinary_customer_funding.sql",
    import.meta.url,
  ), "utf8");
  assert.match(repair, /'funding_environment',\s*v_res\.funding_environment/);
  assert.match(repair, /v_quote_binding\.user_id\s*<>\s*p_user_id/);
  assert.match(repair, /v_quote_binding\.request_fingerprint\s*<>\s*p_request_fingerprint/);
  assert.match(repair, /v_res\.funding_environment\s+not in\s*\('test', 'live', 'owner_internal'\)/);
  assert.match(original, /v_qb\.workspace_id<>p_workspace_id/);
  assert.match(original, /v_qb\.workpiece_id<>btrim\(p_workpiece_id\)/);
});

function makeGate(mode = "enforce", selectedModel = "gpt-5.6-terra") {
  const calls = [];
  return {
    calls,
    async rpc(name, args) {
      calls.push({ name, args });
      if (name === "read_openai_execution_requirement") return { data: { mode }, error: null };
      if (name === "read_existing_openai_text_funding_handle") return { data: {}, error: null };
      if (name === "resolve_openai_text_model_for_funding_quote") return { data: {
        catalog_revision_id: "55555555-5555-4555-8555-555555555555",
        catalog_revision: 7,
        model_catalog_entry_id: selectedModel === "gpt-5.6-terra"
          ? "66666666-6666-4666-8666-666666666666"
          : "77777777-7777-4777-8777-777777777777",
        runtime_model_id: selectedModel,
        provider_model_id: selectedModel,
        display_name: selectedModel === "gpt-5.6-terra" ? "GPT-5.6 Terra" : "GPT-5.6 Luna",
        tradeoff_summary: "Server-selected exact model.",
      }, error: null };
      if (name === "create_customer_openai_text_quote") return { data: {
        quote_id: quoteId,
        operation_id: "ordinary-operation-1",
        quote_hash: quoteHash,
        request_fingerprint: fingerprint,
        currency: "USD",
        maximum_customer_charge_micros: 20000,
        customer_credit_units: 4,
        failure_customer_charge_micros: 0,
        failure_terms: "Forge-caused and provider-caused failures cost you $0.",
        funding_eligible: true,
        funding_source: "customer_deposit",
        funding_environment: "test",
        funding_label: "Verified prepaid balance",
        expires_at: new Date(Date.now() + 60_000).toISOString(),
      }, error: null };
      if (name === "read_openai_text_quote_bounding_context") return { data: {
        model: selectedModel,
        maximum_input_units: 10000,
        maximum_output_units: 512,
        maximum_attempts: 1,
      }, error: null };
      if (name === "bind_bounded_provider_quote_request") return { data: { replay: false }, error: null };
      if (name === "reserve_customer_openai_text_quote") return { data: { paid_execution: {
        operation_id: "ordinary-operation-1",
        reservation_id: reservationId,
        request_fingerprint: fingerprint,
        funding_environment: "test",
      } }, error: null };
      if (name === "accept_quote") return { data: { accepted: true }, error: null };
      return { data: {}, error: null };
    },
  };
}

function input(serviceGate, userGate, acceptance = null) {
  return {
    routeCode: "visual.unified_plan",
    operationId: "ordinary-operation-1",
    userId: "33333333-3333-4333-8333-333333333333",
    workspaceId: "44444444-4444-4444-8444-444444444444",
    workpieceId: "workpiece-1",
    requestFingerprint: fingerprint,
    fundingEnvironment: "test",
    model: "gpt-5-mini",
    credentialFunding: "forge",
    acceptance,
    serviceGate,
    userGate,
    prepareBoundedRequest: ({ model, maximumOutputTokens, maximumAttempts }) =>
      buildBoundedOpenAiProviderRequest({
        body: {
          model,
          instructions: "Bounded system instructions",
          input: JSON.stringify({ history: ["prior turn"], context: "injected context", request: "creator request" }),
          max_output_tokens: maximumOutputTokens,
        },
        model,
        maximumOutputTokens,
        maximumAttempts,
        serviceTier: "standard",
      }),
  };
}

test("inactive routes preserve the legacy path without creating a quote", async () => {
  const service = makeGate("inactive");
  const result = await resolveOrdinaryOpenAiTextFunding(input(service, makeGate()));
  assert.equal(result, null);
  assert.deepEqual(service.calls.map((call) => call.name), ["read_openai_execution_requirement", "read_existing_openai_text_funding_handle"]);
});

test("enforced routes return only a customer-safe quote before acceptance", async () => {
  const service = makeGate();
  await assert.rejects(resolveOrdinaryOpenAiTextFunding(input(service, makeGate())), (error) => {
    assert.ok(error instanceof OpenAiTextQuoteRequiredError);
    assert.equal(error.quote.maximumCustomerChargeMicros, 20000);
    assert.equal(error.quote.customerCreditUnits, 4);
    assert.equal(error.quote.failureCustomerChargeMicros, 0);
    assert.equal("provider_cost" in error.quote, false);
    assert.equal("markup" in error.quote, false);
    return true;
  });
  assert.equal(service.calls.some((call) => call.name === "reserve_customer_openai_text_quote"), false);
  assert.equal(service.calls.some((call) => call.name === "resolve_openai_text_model_for_funding_quote"), true);
  assert.equal(service.calls.filter((call) => call.name === "bind_bounded_provider_quote_request").length, 1);
});

test("an exact acceptance is atomically reserved and returned as an opaque handle", async () => {
  const service = makeGate();
  const user = makeGate();
  const result = await resolveOrdinaryOpenAiTextFunding(input(service, user, {
    operationId: "ordinary-operation-1",
    quoteId,
    quoteHash,
    requestFingerprint: fingerprint,
  }));
  assert.deepEqual(result, {
    operationId: "ordinary-operation-1",
    reservationId,
    requestFingerprint: fingerprint,
    fundingEnvironment: "test",
  });
  assert.equal(user.calls.filter((call) => call.name === "accept_quote").length, 1);
  assert.equal(service.calls.filter((call) => call.name === "reserve_customer_openai_text_quote").length, 1);
  assert.equal(service.calls.find((call) => call.name === "create_customer_openai_text_quote").args.p_model, "gpt-5.6-terra");
  assert.ok(service.calls.findIndex((call) => call.name === "bind_bounded_provider_quote_request")
    < service.calls.findIndex((call) => call.name === "reserve_customer_openai_text_quote"));
});

test("bounded Hearth research may reserve from its immutable plan before the final synthesis body exists", async () => {
  const service = makeGate("enforce", "gpt-5.6-luna");
  const user = makeGate();
  const args = input(service, user, {
    operationId: "ordinary-operation-1",
    quoteId,
    quoteHash,
    requestFingerprint: fingerprint,
  });
  args.routeCode = "hearth.research_synthesis";
  args.deferProviderRequestBinding = true;
  const result = await resolveOrdinaryOpenAiTextFunding(args);
  assert.equal(result?.reservationId, reservationId);
  assert.equal(service.calls.some((call) => call.name === "bind_bounded_provider_quote_request"), false);
  assert.ok(service.calls.findIndex((call) => call.name === "create_customer_openai_text_quote")
    < service.calls.findIndex((call) => call.name === "reserve_customer_openai_text_quote"));
});

test("changed inputs cannot use an accepted quote", async () => {
  const service = makeGate();
  await assert.rejects(resolveOrdinaryOpenAiTextFunding(input(service, makeGate(), {
    operationId: "ordinary-operation-1",
    quoteId,
    quoteHash,
    requestFingerprint: "c".repeat(64),
  })), (error) => error instanceof OpenAiTextFundingPreparationError && error.code === "quote_request_changed");
  assert.equal(service.calls.some((call) => call.name === "reserve_customer_openai_text_quote"), false);
});

test("an existing reservation is replayed without accepting or reserving again", async () => {
  const service = makeGate();
  service.rpc = async function rpc(name) {
    this.calls.push({ name });
    if (name === "read_openai_execution_requirement") return { data: { mode: "enforce" }, error: null };
    if (name === "read_existing_openai_text_funding_handle") return { data: {
      operation_id: "ordinary-operation-1",
      reservation_id: reservationId,
      request_fingerprint: fingerprint,
      funding_environment: "test",
    }, error: null };
    throw new Error(`unexpected ${name}`);
  };
  const result = await resolveOrdinaryOpenAiTextFunding(input(service, makeGate()));
  assert.equal(result?.reservationId, reservationId);
});

test("an existing authority missing its immutable funding environment fails closed", async () => {
  const service = makeGate();
  service.rpc = async function rpc(name) {
    this.calls.push({ name });
    if (name === "read_openai_execution_requirement") return { data: { mode: "enforce" }, error: null };
    if (name === "read_existing_openai_text_funding_handle") return { data: {
      operation_id: "ordinary-operation-1",
      reservation_id: reservationId,
      request_fingerprint: fingerprint,
      reservation_state: "settled",
    }, error: null };
    throw new Error(`unexpected ${name}`);
  };
  await assert.rejects(
    resolveOrdinaryOpenAiTextFunding(input(service, makeGate())),
    (error) => error instanceof OpenAiTextFundingPreparationError
      && error.code === "invalid_funding_handle",
  );
});

test("an existing authority for a different operation or fingerprint fails closed", async () => {
  const service = makeGate();
  service.rpc = async function rpc(name) {
    this.calls.push({ name });
    if (name === "read_openai_execution_requirement") return { data: { mode: "enforce" }, error: null };
    if (name === "read_existing_openai_text_funding_handle") return { data: {
      operation_id: "ordinary-operation-other",
      reservation_id: reservationId,
      request_fingerprint: "f".repeat(64),
      funding_environment: "test",
      reservation_state: "settled",
    }, error: null };
    throw new Error(`unexpected ${name}`);
  };
  await assert.rejects(
    resolveOrdinaryOpenAiTextFunding(input(service, makeGate())),
    (error) => error instanceof OpenAiTextFundingPreparationError
      && error.code === "invalid_funding_handle",
  );
});

test("server model resolution is customer-visible and a changed model produces a different quote identity", async () => {
  const terra = makeGate("enforce", "gpt-5.6-terra");
  const luna = makeGate("enforce", "gpt-5.6-luna");
  let terraError;
  let lunaError;
  await resolveOrdinaryOpenAiTextFunding(input(terra, makeGate())).catch((error) => { terraError = error; });
  await resolveOrdinaryOpenAiTextFunding(input(luna, makeGate())).catch((error) => { lunaError = error; });
  assert.equal(terraError.quote.modelDisplayName, "GPT-5.6 Terra");
  assert.equal(terraError.quote.catalogRevision, 7);
  assert.equal(lunaError.quote.modelDisplayName, "GPT-5.6 Luna");
  const terraQuoteId = terra.calls.find((call) => call.name === "create_customer_openai_text_quote").args.p_quote_id;
  const lunaQuoteId = luna.calls.find((call) => call.name === "create_customer_openai_text_quote").args.p_quote_id;
  assert.notEqual(terraQuoteId, lunaQuoteId);
});
