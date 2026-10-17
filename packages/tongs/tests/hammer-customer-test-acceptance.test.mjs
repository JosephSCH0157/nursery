import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  executePaidOpenAiTextRoute,
  fingerprintOpenAiTextPaidRequest,
} from "../dist/providers/paid-openai-text-route-execution.js";
import { OpenAiTextProviderError } from "../dist/providers/paid-openai-text-execution-coordinator.js";
import {
  OpenAiTextQuoteRequiredError,
  resolveOrdinaryOpenAiTextFunding,
} from "../dist/providers/openai-text-customer-funding.js";
import { buildBoundedOpenAiProviderRequest } from "../dist/providers/bounded-provider-request.js";

const MIGRATION = new URL(
  "../../../supabase/migrations/20261017201640_hammer_customer_test_acceptance.sql",
  import.meta.url,
);
const PAID_JSON_ROUTE = new URL(
  "../../../apps/nursery/server/billing/paid-json-openai-route.ts",
  import.meta.url,
);
const CONNECTED_VERIFIER = new URL(
  "../../../scripts/verify-hammer-customer-test-acceptance.mts",
  import.meta.url,
);
const ROUTE = "hammer.transcript_cleanup";
const AUTHORIZATION_ID = "a1000000-0000-4000-8000-000000000001";
const RESERVATION_ID = "a1000000-0000-4000-8000-000000000002";

function makeGate({ state = "reserved", stored = null } = {}) {
  const calls = [];
  return {
    calls,
    async rpc(name, args) {
      calls.push({ name, args });
      if (name === "resolve_openai_text_paid_execution_context") {
        return {
          data: {
            operation_id: "forge:hammer:cleanup:customer-acceptance",
            reservation_id: RESERVATION_ID,
            quote_id: "a1000000-0000-4000-8000-000000000003",
            route_code: ROUTE,
            funding_source_type: "customer_deposit",
            funding_source_id: "a1000000-0000-4000-8000-000000000004",
            funding_environment: "test",
            rollout_authorization_id: AUTHORIZATION_ID,
            credential_funding: "forge",
            model: "gpt-5.4-mini",
            pricing_revision_id: "40010000-0000-4000-8000-000000000402",
            cost_policy_revision_id: "40010000-0000-4000-8000-000000000301",
            customer_credit_units: 46,
            maximum_input_units: 128000,
            maximum_output_units: 16384,
            maximum_attempts: 1,
            maximum_failure_exposure_micros: 169728,
            direct_provider_ceiling_micros: 169728,
            supporting_cost_ceiling_micros: 0,
            input_micros_per_million_tokens: 250,
            cached_input_micros_per_million_tokens: 25,
            output_micros_per_million_tokens: 2000,
            reservation_state: state,
          },
          error: null,
        };
      }
      if (name === "resolve_openai_text_verified_zero_supporting_cost") {
        return { data: { authoritative: true, amount_micros: 0 }, error: null };
      }
      if (name === "acquire_openai_text_aggregate_admission") {
        return {
          data: {
            enforcement_enabled: false,
            authorized: true,
            replay: false,
            reason: "normal_customer_credit_bounded",
          },
          error: null,
        };
      }
      if (name === "authorize_openai_text_provider_attempt_with_aggregate") {
        return { data: { provider_execution_authorized: true }, error: null };
      }
      if (name === "read_openai_text_paid_result") return { data: stored, error: null };
      if (name === "settle_operation") {
        return { data: { customer_charge_micros: 230000 }, error: null };
      }
      return { data: {}, error: null };
    },
  };
}

async function argsFor(gate) {
  const requestFingerprintPayload = {
    schema: "forge.hammer.transcript-cleanup.customer-acceptance.v1",
    segments: [{ segment_id: "segment-1", text: "um this is the transcript" }],
  };
  const requestFingerprint = await fingerprintOpenAiTextPaidRequest(requestFingerprintPayload);
  return {
    gate,
    routeCode: ROUTE,
    handle: {
      operationId: "forge:hammer:cleanup:customer-acceptance",
      reservationId: RESERVATION_ID,
      requestFingerprint,
      fundingEnvironment: "test",
    },
    userId: "a1000000-0000-4000-8000-000000000005",
    workspaceId: "a1000000-0000-4000-8000-000000000006",
    workpieceId: "workpiece-customer-acceptance",
    credentialSource: "forge_managed",
    inputUnitUpperBound: 512,
    requestFingerprintPayload,
    executeProvider: async () => ({
      value: {
        resultSegments: [{ segment_id: "segment-1", text: "This is the transcript." }],
        suggestions: [{ segmentId: "segment-1", kind: "cleanup" }],
      },
      requestId: "openai-request-customer-acceptance",
      inputUnits: 128,
      cachedInputUnits: 0,
      outputUnits: 32,
      supplierCostMicros: 96,
      supplierCostAuthoritative: false,
      supportingCostMicros: 0,
      supportingCostAuthoritative: true,
      costCoverageComplete: true,
    }),
    validateResult: (candidate) => {
      if (!Array.isArray(candidate?.resultSegments) || !Array.isArray(candidate?.suggestions)) {
        throw new Error("invalid Hammer cleanup result");
      }
    },
    persistCanonical: async (candidate) => ({
      result_id: "a1000000-0000-4000-8000-000000000007",
      resultSegments: candidate.resultSegments,
      suggestions: candidate.suggestions,
    }),
  };
}

function makeFundingGate() {
  const calls = [];
  return {
    calls,
    async rpc(name, args) {
      calls.push({ name, args });
      if (name === "read_openai_execution_requirement") return { data: { mode: "enforce" }, error: null };
      if (name === "read_existing_openai_text_funding_handle") return { data: {}, error: null };
      if (name === "resolve_openai_text_model_for_funding_quote") return { data: {
        catalog_revision_id: "a1000000-0000-4000-8000-000000000010",
        catalog_revision: 17,
        model_catalog_entry_id: "a1000000-0000-4000-8000-000000000011",
        customer_selection_key: "a1000000-0000-4000-8000-000000000012",
        runtime_model_id: "gpt-5.4-mini",
        provider_model_id: "gpt-5.4-mini-2026-03-17",
        display_name: "GPT-5.4 Mini",
        tradeoff_summary: "Lower cost",
      }, error: null };
      if (name === "create_customer_openai_text_quote") return { data: {
        quote_id: "a1000000-0000-4000-8000-000000000003",
        operation_id: "forge:hammer:cleanup:customer-acceptance",
        quote_hash: "b".repeat(64),
        request_fingerprint: "a".repeat(64),
        currency: "USD",
        maximum_customer_charge_micros: 230000,
        customer_credit_units: 46,
        failure_customer_charge_micros: 0,
        failure_terms: "Forge-caused and provider-caused failures cost you $0.",
        funding_eligible: true,
        funding_source: "customer_deposit",
        funding_environment: "test",
        funding_label: "Forge Credits",
        expires_at: new Date(Date.now() + 60_000).toISOString(),
      }, error: null };
      if (name === "read_openai_text_quote_bounding_context") return { data: {
        model: "gpt-5.4-mini",
        maximum_input_units: 128000,
        maximum_output_units: 16384,
        maximum_attempts: 1,
      }, error: null };
      if (name === "bind_bounded_provider_quote_request") return { data: { replay: false }, error: null };
      if (name === "accept_quote") return { data: { accepted: true }, error: null };
      if (name === "reserve_customer_openai_text_quote") return { data: { paid_execution: {
        operation_id: "forge:hammer:cleanup:customer-acceptance",
        reservation_id: RESERVATION_ID,
        request_fingerprint: "a".repeat(64),
        funding_environment: "test",
      } }, error: null };
      return { data: {}, error: null };
    },
  };
}

function fundingArgs(serviceGate, userGate, acceptance = null) {
  return {
    routeCode: ROUTE,
    operationId: "forge:hammer:cleanup:customer-acceptance",
    userId: "a1000000-0000-4000-8000-000000000005",
    workspaceId: "a1000000-0000-4000-8000-000000000006",
    workpieceId: "workpiece-customer-acceptance",
    requestFingerprint: "a".repeat(64),
    fundingEnvironment: "test",
    model: "gpt-5.4-mini",
    credentialFunding: "forge",
    acceptance,
    serviceGate,
    userGate,
    prepareBoundedRequest: ({ model, maximumOutputTokens, maximumAttempts }) =>
      buildBoundedOpenAiProviderRequest({
        body: { model, messages: [{ role: "user", content: "bounded cleanup" }] },
        model,
        maximumOutputTokens,
        maximumAttempts,
        serviceTier: "default",
      }),
  };
}

test("activation migration is inert until an exact service-role call and remains Test-only", async () => {
  const sql = await readFile(MIGRATION, "utf8");
  const paidJsonRoute = await readFile(PAID_JSON_ROUTE, "utf8");
  assert.match(sql, /Applying this migration creates no rollout, scope, quote, reservation/);
  assert.match(sql, /activate_hammer_customer_test_acceptance/);
  assert.match(sql, /perform tongs\._require_pricing_service_role\(\)/);
  assert.match(sql, /v_rollout\.revision <> 3 or v_rollout\.mode <> 'halt_new'/);
  assert.match(sql, /'hammer\.transcript_cleanup', 4, 'enforce'/);
  assert.match(sql, /'hammer\.transcript_cleanup', 'test', 2, 'enforce'/);
  assert.match(sql, /'gpt-5\.4-mini'/);
  assert.match(sql, /'40010000-0000-4000-8000-000000000402'/);
  assert.match(sql, /'40010000-0000-4000-8000-000000000301'/);
  assert.match(sql, /1, 230000, 169728, 1, null/);
  assert.match(sql, /financial_environment = 'live'/);
  assert.match(sql, /<> 'halt_new'/);
  assert.match(sql, /maximum_operation_count is null or maximum_operation_count > 0/);
  assert.match(sql, /_hammer_scope_has_remaining_authority/);
  assert.match(sql, /_funding_reservation_counts_paid_scope_concurrency/);
  assert.match(sql, /authorization_kind in \('certification', 'owner_only'\)/);
  assert.match(sql, /authorization_kind = 'normal_customer'/);
  assert.doesNotMatch(sql, /insert into tongs\.customer_paid_execution_scope_authorizations[\s\S]*?values\s*\(\s*'[0-9a-f-]{36}'/i);
  assert.match(paidJsonRoute, /args\.routeCode !== "hammer\.transcript_cleanup"/);
  assert.match(paidJsonRoute, /resolve_openai_text_verified_zero_supporting_cost/);
  assert.match(paidJsonRoute, /row\.authoritative !== true \|\| row\.amount_micros !== 0/);
});

test("shutdown is append-only, service-role-only, replay-safe, and preserves financial obligations", async () => {
  const sql = await readFile(MIGRATION, "utf8");
  const closeStart = sql.indexOf("create or replace function tongs.close_hammer_customer_test_acceptance");
  assert.ok(closeStart >= 0);
  const closeSql = sql.slice(closeStart);
  assert.match(sql, /create table tongs\.hammer_customer_test_acceptance_closures/);
  assert.match(closeSql, /perform tongs\._require_pricing_service_role\(\)/);
  assert.match(closeSql, /'hammer\.transcript_cleanup', 5, 'halt_new', null/);
  assert.match(closeSql, /'hammer\.transcript_cleanup', 'test', 3, 'halt_new'/);
  assert.match(closeSql, /v_live_loss\.revision <> 1 or v_live_loss\.mode <> 'halt_new'/);
  assert.match(closeSql, /Hammer customer Test shutdown replay conflict/);
  assert.match(closeSql, /Hammer customer Test shutdown already exists/);
  assert.match(closeSql, /specific B1-C Hammer activation required for shutdown/);
  assert.match(closeSql, /grant execute on function tongs\.close_hammer_customer_test_acceptance[\s\S]*?to service_role/);
  assert.doesNotMatch(closeSql, /\b(update|delete|truncate)\b[\s\S]*?tongs\.(funding_reservations|funding_reservation_events|supplier_expenses)/i);
  assert.doesNotMatch(closeSql, /insert into tongs\.(funding_reservations|funding_reservation_events|supplier_expenses)/i);
});

test("connected operation verifier is select-only and requires exact deployment identities", async () => {
  const source = await readFile(CONNECTED_VERIFIER, "utf8");
  for (const name of [
    "HAMMER_ACCEPTANCE_OPERATION_ID",
    "HAMMER_ACCEPTANCE_RESERVATION_ID",
    "HAMMER_ACCEPTANCE_AUTHORIZATION_ID",
    "HAMMER_ACCEPTANCE_CLOSE_ID",
    "HAMMER_ACCEPTANCE_USER_ID",
    "HAMMER_ACCEPTANCE_WORKSPACE_ID",
  ]) assert.match(source, new RegExp(name));
  assert.match(source, /db\.from\(table\)\.select\("\*"\)/);
  assert.doesNotMatch(source, /\.(insert|update|upsert|delete)\s*\(/);
  assert.doesNotMatch(source, /\.rpc\s*\(/);
  assert.match(source, /supplier expense .* must be reconciled exactly once/);
  assert.match(source, /pre_activation/);
  assert.match(source, /active/);
  assert.match(source, /post_close/);
  assert.match(source, /historicalOwnerScopes/);
  assert.match(source, /live_scope_count: 0/);
});

test("Hammer customer funding stops for the 46-credit acceptance, then reserves exactly once before execution", async () => {
  const quoteGate = makeFundingGate();
  await assert.rejects(
    resolveOrdinaryOpenAiTextFunding(fundingArgs(quoteGate, makeFundingGate())),
    (error) => error instanceof OpenAiTextQuoteRequiredError
      && error.quote.customerCreditUnits === 46
      && error.quote.maximumCustomerChargeMicros === 230000,
  );
  assert.equal(quoteGate.calls.some(({ name }) => name === "reserve_customer_openai_text_quote"), false);

  const serviceGate = makeFundingGate();
  const userGate = makeFundingGate();
  const handle = await resolveOrdinaryOpenAiTextFunding(fundingArgs(serviceGate, userGate, {
    operationId: "forge:hammer:cleanup:customer-acceptance",
    quoteId: "a1000000-0000-4000-8000-000000000003",
    quoteHash: "b".repeat(64),
    requestFingerprint: "a".repeat(64),
  }));
  assert.equal(handle.reservationId, RESERVATION_ID);
  assert.equal(handle.fundingEnvironment, "test");
  assert.equal(userGate.calls.filter(({ name }) => name === "accept_quote").length, 1);
  assert.equal(serviceGate.calls.filter(({ name }) => name === "reserve_customer_openai_text_quote").length, 1);
  assert.ok(serviceGate.calls.findIndex(({ name }) => name === "bind_bounded_provider_quote_request")
    < serviceGate.calls.findIndex(({ name }) => name === "reserve_customer_openai_text_quote"));
});

test("one accepted Hammer cleanup reserves before provider work, persists before settlement, and charges 46 credits", async () => {
  const gate = makeGate();
  const result = await executePaidOpenAiTextRoute(await argsFor(gate));
  assert.equal(result.state, "settled");
  assert.equal(result.customerChargeMicros, 230000);
  assert.equal(result.result.result_id, "a1000000-0000-4000-8000-000000000007");
  const names = gate.calls.map(({ name }) => name);
  assert.ok(names.indexOf("authorize_openai_text_provider_attempt_with_aggregate") >= 0);
  assert.ok(names.indexOf("record_openai_text_provider_capture") > names.indexOf("authorize_openai_text_provider_attempt_with_aggregate"));
  assert.ok(names.indexOf("persist_openai_text_paid_result") > names.indexOf("record_openai_text_provider_capture"));
  assert.ok(names.indexOf("settle_operation") > names.indexOf("persist_openai_text_paid_result"));
  assert.equal(names.filter((name) => name === "authorize_openai_text_provider_attempt_with_aggregate").length, 1);
  assert.equal(names.filter((name) => name === "settle_operation").length, 1);
});

test("settled Hammer replay returns canonical evidence without a provider call or second settlement", async () => {
  const storedResult = {
    result_json: {
      result_id: "a1000000-0000-4000-8000-000000000007",
      resultSegments: [{ segment_id: "segment-1", text: "This is the transcript." }],
      suggestions: [{ segmentId: "segment-1", kind: "cleanup" }],
    },
    provider_request_id: "openai-request-customer-acceptance",
    customer_charge_micros: 230000,
  };
  const gate = makeGate({ state: "settled", stored: storedResult });
  const args = await argsFor(gate);
  let providerCalls = 0;
  args.executeProvider = async () => {
    providerCalls += 1;
    throw new Error("settled replay must not call the provider");
  };
  const result = await executePaidOpenAiTextRoute(args);
  assert.equal(result.state, "settled_replay");
  assert.equal(result.customerChargeMicros, 230000);
  assert.equal(providerCalls, 0);
  assert.equal(gate.calls.some(({ name }) => name === "settle_operation"), false);
  assert.equal(gate.calls.some(({ name }) => name === "authorize_openai_text_provider_attempt_with_aggregate"), false);
});

test("ambiguous Hammer submission is fail-closed, never retried, and never settled", async () => {
  const gate = makeGate();
  const args = await argsFor(gate);
  let providerCalls = 0;
  args.executeProvider = async () => {
    providerCalls += 1;
    throw new OpenAiTextProviderError("provider response lost", true, null);
  };
  const result = await executePaidOpenAiTextRoute(args);
  assert.equal(result.state, "submission_unknown");
  assert.equal(result.customerChargeMicros, 0);
  assert.equal(providerCalls, 1);
  assert.equal(gate.calls.filter(({ name }) => name === "authorize_openai_text_provider_attempt_with_aggregate").length, 1);
  assert.equal(gate.calls.some(({ name }) => name === "settle_operation"), false);
});

test("Hammer validation failure retains supplier evidence and releases the customer at zero charge", async () => {
  const gate = makeGate();
  const args = await argsFor(gate);
  args.executeProvider = async () => ({
    value: {},
    requestId: "openai-request-invalid-cleanup",
    inputUnits: 128,
    outputUnits: 2,
    supplierCostMicros: 40,
    supplierCostAuthoritative: false,
    supportingCostMicros: 0,
    supportingCostAuthoritative: true,
    costCoverageComplete: true,
  });
  const result = await executePaidOpenAiTextRoute(args);
  assert.equal(result.state, "failed_released");
  assert.equal(result.customerChargeMicros, 0);
  assert.equal(gate.calls.filter(({ name }) => name === "record_openai_text_supplier_attempt_expense").length, 1);
  const failure = gate.calls.find(({ name }) => name === "record_provider_failure");
  assert.equal(failure.args.p_failure_class, "forge_validation_failure");
});
