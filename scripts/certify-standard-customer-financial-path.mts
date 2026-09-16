import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { createClient } from "@supabase/supabase-js";
import { config as loadDotEnv } from "dotenv";

import {
  OpenAiTextQuoteRequiredError,
  resolveOrdinaryOpenAiTextFunding,
  type CustomerOpenAiTextQuote,
} from "../packages/tongs/src/providers/openai-text-customer-funding.ts";
import type { OpenAiTextPaidExecutionHandle } from "../packages/tongs/src/providers/paid-openai-text-route-execution.ts";
import type { OpenAiTextGateClient } from "../packages/tongs/src/providers/paid-openai-text-execution-coordinator.ts";
import {
  buildBoundedHearthChatProviderRequest,
  deriveHearthCustomerPaidIdentifiers,
  executePaidHearthChatCompletion,
  fingerprintPaidHearthChatRequest,
} from "../apps/nursery/server/hearth/hearth-paid-chat-execution.ts";

type Row = Record<string, unknown>;
type RpcResult = { data: unknown; error: { message?: string } | null };

const REPO_ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
loadDotEnv({ path: path.join(REPO_ROOT, "apps", "nursery", ".env.local"), override: false });
loadDotEnv({ path: path.join(REPO_ROOT, "apps", "nursery", ".env"), override: false });

const EXECUTE = process.argv.includes("--execute");
const RESUME = process.argv.includes("--resume");
const INSTALL_AGGREGATE_RECOVERY = process.argv.includes("--install-aggregate-recovery");
const ACQUIRE_AGGREGATE = process.argv.includes("--acquire-aggregate");
const SETTLE_POST_PROVIDER = process.argv.includes("--settle-post-provider");
const ROUTE = "hearth.chat_completion";
const MODEL = "gpt-5.6-luna";
const PRICING_REVISION_ID = "b4c4472f-0325-4c2e-b2ef-9aef5e59e64a";
const COST_POLICY_REVISION_ID = "10000000-0000-4000-8000-000000000010";
const CUSTOMER_CHARGE_MICROS = 15_000;
const CUSTOMER_CREDITS = 3;
const WHOLESALE_CEILING_MICROS = 11_015;

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function object(value: unknown): Row {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
}

function integer(value: unknown): number {
  const parsed = Number(value);
  assert.ok(Number.isSafeInteger(parsed), `Expected an integer, received ${String(value)}`);
  return parsed;
}

async function rpc(gate: OpenAiTextGateClient, name: string, args: Row = {}): Promise<unknown> {
  const result = await gate.rpc(name, args);
  if (result.error) throw new Error(`${name}: ${result.error.message}`);
  return result.data;
}

async function must<T extends { data: unknown; error: { message?: string } | null }>(
  promise: PromiseLike<T>,
  label: string,
): Promise<T> {
  const result = await promise;
  if (result.error) throw new Error(`${label}: ${result.error.message ?? "unknown error"}`);
  return result;
}

const supabaseUrl = process.env.TONGS_SUPABASE_URL?.trim()
  || process.env.VITE_SUPABASE_URL?.trim()
  || "";
const serviceRoleKey = process.env.TONGS_SERVICE_ROLE_KEY?.trim() || "";
const publishableKey = process.env.VITE_SUPABASE_ANON_KEY?.trim() || "";
const openAiApiKey = process.env.OPENAI_TEXT_API_KEY?.trim()
  || process.env.OPENAI_API_KEY?.trim()
  || "";
if (!supabaseUrl || !serviceRoleKey || !publishableKey) {
  throw new Error("Supabase URL, service-role key, and publishable key are required");
}
if (EXECUTE && !openAiApiKey) throw new Error("A Forge-managed OpenAI API key is required");
if (EXECUTE && process.env.CERTIFICATION_CONFIRMATION !== "ONE_REAL_OPENAI_CALL") {
  throw new Error("Set CERTIFICATION_CONFIRMATION=ONE_REAL_OPENAI_CALL to use --execute");
}

const userId = required("CERT_USER_ID");
const workspaceId = required("CERT_WORKSPACE_ID");
const workpieceId = required("CERT_WORKPIECE_ID");
const operatorId = required("CERT_OPERATOR_ID");

process.env.FORGE_OPENAI_TEXT_EXECUTION_MODE = "enforce";

const service = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const tongs = service.schema("tongs") as any;
const serviceGate = tongs as unknown as OpenAiTextGateClient;

if (INSTALL_AGGREGATE_RECOVERY) {
  const scopeAuthorizationId = required("CERT_SCOPE_AUTHORIZATION_ID");
  const reservationId = required("CERT_RESERVATION_ID");
  const assignment = await rpc(serviceGate,
    "create_standard_customer_certification_aggregate_assignment", {
      p_assignment_id: randomUUID(),
      p_actor_id: operatorId,
      p_scope_authorization_id: scopeAuthorizationId,
      p_reason: "Bounded standard-customer financial-path certification: one Test Luna operation.",
    });
  const recovery = await rpc(serviceGate, "rearm_standard_customer_preprovider_release", {
    p_reservation_id: reservationId,
    p_actor_id: operatorId,
    p_event_key: `${reservationId}:standard-customer-aggregate-recovery`,
  });
  process.stdout.write(`${JSON.stringify({ assignment, recovery }, null, 2)}\n`);
  process.exit(0);
}

if (ACQUIRE_AGGREGATE) {
  const admission = await rpc(serviceGate, "acquire_openai_text_aggregate_admission", {
    p_reservation_id: required("CERT_RESERVATION_ID"),
    p_caller_class: "interactive",
    p_provider_mode: "real",
  });
  process.stdout.write(`${JSON.stringify({ admission }, null, 2)}\n`);
  process.exit(0);
}

if (SETTLE_POST_PROVIDER) {
  const reservationId = required("CERT_RESERVATION_ID");
  const operationId = required("CERT_RESUME_OPERATION_ID");
  const usageResult = await must(tongs.from("openai_text_usage_evidence")
    .select("provider_request_id,input_units,output_units,provider_reported,result_validated,canonical_persistence_confirmed")
    .eq("reservation_id", reservationId), "post-provider usage evidence");
  const persistedResult = await must(tongs.from("openai_text_persisted_results")
    .select("provider_request_id,result_hash")
    .eq("reservation_id", reservationId), "post-provider persisted result");
  const expensesResult = await must(tongs.from("supplier_expenses")
    .select("amount_micros,evidence_status")
    .eq("reservation_id", reservationId), "post-provider expenses");
  const usageRows = (usageResult.data ?? []) as Row[];
  const persistedRows = (persistedResult.data ?? []) as Row[];
  const expenseRows = (expensesResult.data ?? []) as Row[];
  assert.equal(usageRows.length, 1, "exactly one provider usage record is required");
  assert.equal(persistedRows.length, 1, "exactly one canonical persisted result is required");
  assert.equal(usageRows[0]?.provider_request_id, persistedRows[0]?.provider_request_id);
  assert.equal(usageRows[0]?.provider_reported, true);
  assert.equal(usageRows[0]?.result_validated, true);
  assert.equal(usageRows[0]?.canonical_persistence_confirmed, true);
  assert.equal(expenseRows.length, 2, "direct and supporting expenses are required");
  const actualFulfillmentCostMicros = expenseRows.reduce(
    (sum, row) => sum + integer(row.amount_micros), 0,
  );
  const settlementId = randomUUID();
  const settlementArgs = {
    p_reservation_id: reservationId,
    p_settlement_id: settlementId,
    p_settlement_key: `${operationId}:settlement`,
    p_outcome: "success",
    p_failure_class: null,
    p_actual_fulfillment_cost_micros: actualFulfillmentCostMicros,
    p_evidence_json: {
      provider: "openai",
      provider_request_id: usageRows[0]?.provider_request_id,
      authoritative: false,
      cost_coverage: "estimated",
      attempts: 1,
      recovery: "post_provider_accounting_constraint",
    },
  };
  const settlement = await rpc(serviceGate, "settle_operation", settlementArgs);
  const aggregate = await rpc(serviceGate, "record_paid_operation_aggregate_outcome", {
    p_reservation_id: reservationId,
    p_event_key: `${operationId}:openai:attempt:1:aggregate-success`,
    p_outcome: "settled_unconfirmed",
    p_supplier_obligation_micros: actualFulfillmentCostMicros,
    p_supplier_recovery_micros: null,
    p_evidence_json: {
      provider: "openai",
      provider_request_id: usageRows[0]?.provider_request_id,
      authoritative: false,
      provider_usage_reported: true,
      recovery: "post_provider_accounting_constraint",
    },
  });
  const replay = await rpc(serviceGate, "settle_operation", settlementArgs);
  process.stdout.write(`${JSON.stringify({
    settlement, aggregate, replay,
    provider_request_id: usageRows[0]?.provider_request_id,
    actual_fulfillment_cost_micros: actualFulfillmentCostMicros,
  }, null, 2)}\n`);
  process.exit(0);
}

async function countRows(table: string, filters: Array<[string, unknown]> = []): Promise<number> {
  let query = tongs.from(table).select("id", { count: "exact", head: true });
  for (const [column, value] of filters) query = query.eq(column, value);
  const result = await must(query, `count ${table}`);
  return result.count ?? 0;
}

async function isolationSnapshot(): Promise<Row> {
  const values = await Promise.all([
    countRows("test_paid_execution_authorizations"),
    countRows("test_paid_execution_evidence"),
    countRows("openai_text_test_certification_operations"),
    countRows("openai_text_test_certification_evidence"),
    countRows("owner_hearth_authorizations"),
    countRows("owner_hearth_operation_authorizations"),
    countRows("owner_hearth_research_authorizations"),
    countRows("customer_deposits", [["user_id", userId], ["stripe_mode", "live"]]),
    countRows("paid_allowance_grants", [["user_id", userId], ["financial_environment", "live"]]),
  ]);
  return {
    simulator: {
      test_authorizations: values[0],
      test_evidence: values[1],
      openai_cert_operations: values[2],
      openai_cert_evidence: values[3],
    },
    owner: {
      hearth_authorizations: values[4],
      operation_authorizations: values[5],
      research_authorizations: values[6],
    },
    live_customer_deposits: values[7],
    live_allowance_grants: values[8],
  };
}

const requirement = object(await rpc(serviceGate, "read_openai_execution_requirement", {
  p_route_code: ROUTE,
  p_credential_funding: "forge",
}));
assert.equal(requirement.mode, "enforce", "standard customer OpenAI route must be enforced");

const selection = object(await rpc(serviceGate, "resolve_openai_text_model_for_funding_quote", {
  p_user_id: userId,
  p_workspace_id: workspaceId,
  p_route_code: ROUTE,
  p_credential_funding: "forge",
}));
assert.equal(selection.runtime_model_id, MODEL, "exact Luna runtime model must be selected");
assert.equal(selection.provider_model_id, MODEL, "exact Luna provider model must be selected");

const testConfigResult = await must(tongs.from("financial_environment_configuration_revisions")
  .select("environment,revision,lifecycle_state,workflow_contract,route_code,provider,model,pricing_revision_id,cost_policy_revision_id,wholesale_exposure_ceiling_micros,maximum_concurrency,rolling_window_seconds,maximum_operation_count")
  .eq("environment", "test").order("revision", { ascending: false }).limit(1).single(), "Test financial config");
const liveConfigResult = await must(tongs.from("financial_environment_configuration_revisions")
  .select("environment,revision,lifecycle_state,workflow_contract,route_code,provider,model,pricing_revision_id,cost_policy_revision_id,wholesale_exposure_ceiling_micros,maximum_concurrency,rolling_window_seconds,maximum_operation_count")
  .eq("environment", "live").order("revision", { ascending: false }).limit(1).single(), "Live financial config");
const testConfig = object(testConfigResult.data);
const liveConfig = object(liveConfigResult.data);
for (const config of [testConfig, liveConfig]) {
  assert.equal(config.workflow_contract, "forge.customer-financial-path.v2");
  assert.equal(config.route_code, ROUTE);
  assert.equal(config.provider, "openai");
  assert.equal(config.model, MODEL);
  assert.equal(config.pricing_revision_id, PRICING_REVISION_ID);
  assert.equal(config.cost_policy_revision_id, COST_POLICY_REVISION_ID);
  assert.equal(integer(config.wholesale_exposure_ceiling_micros), WHOLESALE_CEILING_MICROS);
  assert.equal(integer(config.maximum_concurrency), 1);
  assert.equal(integer(config.rolling_window_seconds), 86_400);
  assert.equal(integer(config.maximum_operation_count), 1);
}
assert.equal(testConfig.lifecycle_state, "certification_ready");
assert.equal(liveConfig.lifecycle_state, "inactive_ready");

const pricingResult = await must(tongs.from("private_pricing_revisions")
  .select("id,revision,lifecycle_state,currency,markup_basis_points,full_cost_ceiling_micros,customer_price_ceiling_micros,customer_credit_units,unrounded_customer_price_micros,rounding_adjustment_micros,settled_customer_price_micros")
  .eq("id", PRICING_REVISION_ID).single(), "Luna pricing revision");
const pricing = object(pricingResult.data);
assert.equal(integer(pricing.full_cost_ceiling_micros), WHOLESALE_CEILING_MICROS);
assert.equal(integer(pricing.markup_basis_points), 3_300);
assert.equal(integer(pricing.unrounded_customer_price_micros), 14_650);
assert.equal(integer(pricing.rounding_adjustment_micros), 350);
assert.equal(integer(pricing.settled_customer_price_micros), CUSTOMER_CHARGE_MICROS);
assert.equal(integer(pricing.customer_credit_units), CUSTOMER_CREDITS);

const preflight = {
  ok: true,
  mode: EXECUTE ? "execute" : "read_only",
  requirement,
  selection: {
    catalog_revision: selection.catalog_revision,
    runtime_model_id: selection.runtime_model_id,
    provider_model_id: selection.provider_model_id,
  },
  test_configuration: testConfig,
  live_configuration: liveConfig,
  pricing,
  isolation: await isolationSnapshot(),
};

if (!EXECUTE) {
  process.stdout.write(`${JSON.stringify(preflight, null, 2)}\n`);
  process.exit(0);
}

const existingScopeResult = await must(tongs.from("customer_paid_execution_scope_authorizations")
  .select("id", { count: "exact", head: true })
  .eq("user_id", userId).eq("workspace_id", workspaceId).eq("route_code", ROUTE), "existing scope guard");
assert.equal(existingScopeResult.count ?? 0, RESUME ? 1 : 0,
  RESUME ? "resume requires exactly one existing customer certification scope" : "refusing to create a second customer certification scope");

const customerResult = await service.auth.admin.getUserById(userId);
if (customerResult.error || !customerResult.data.user?.email) {
  throw customerResult.error ?? new Error("Certification customer email is unavailable");
}
const linkResult = await service.auth.admin.generateLink({
  type: "magiclink",
  email: customerResult.data.user.email,
});
if (linkResult.error || !linkResult.data.properties?.hashed_token) {
  throw linkResult.error ?? new Error("Could not create a non-delivered certification sign-in token");
}
const customer = createClient(supabaseUrl, publishableKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const verified = await customer.auth.verifyOtp({
  token_hash: linkResult.data.properties.hashed_token,
  type: "magiclink",
});
if (verified.error || verified.data.user?.id !== userId || !verified.data.session) {
  throw verified.error ?? new Error("Customer-scoped certification authentication failed");
}
const userGate = customer.schema("tongs") as unknown as OpenAiTextGateClient;
const fundingBefore = object(await rpc(userGate, "read_my_customer_funding"));
assert.equal(fundingBefore.active_environment, "test");
const beforeSpendable = object(fundingBefore.active_spendable);
const beforePurchased = object(beforeSpendable.purchased);
const beforeAllowance = object(beforeSpendable.allowances);
const beforeReservations = object(fundingBefore.active_reservations);
const purchasedCreditsBefore = integer(beforePurchased.available_credit_units)
  + (RESUME ? integer(beforeReservations.reserved_credit_units) : 0);
assert.equal(purchasedCreditsBefore, 7_982);
assert.equal(integer(beforeAllowance.available_entitlement_units), 1_000);

const messages = [
  { role: "system", content: "You are Hearth. Provide a concise readiness confirmation." },
  { role: "user", content: "Reply with one short neutral sentence confirming readiness." },
];
const requestFingerprint = RESUME ? required("CERT_RESUME_REQUEST_FINGERPRINT") : fingerprintPaidHearthChatRequest({
  certification: "forge.standard-customer-financial-path.v1",
  request_nonce: randomUUID(),
  route: ROUTE,
  user_id: userId,
  workspace_id: workspaceId,
  workpiece_id: workpieceId,
  credential_funding: "forge",
  messages,
});
const identifiers = deriveHearthCustomerPaidIdentifiers({ userId, workspaceId, requestFingerprint });
const fundingArgs = {
  routeCode: ROUTE,
  operationId: identifiers.operationId,
  userId,
  workspaceId,
  workpieceId,
  requestFingerprint,
  model: MODEL,
  credentialFunding: "forge" as const,
  serviceGate,
  userGate,
  quoteLifetimeSeconds: 600,
  prepareBoundedRequest: (limits: { model: string; maximumOutputTokens: number; maximumAttempts: number }) =>
    buildBoundedHearthChatProviderRequest({
      messages,
      model: limits.model,
      maximumOutputTokens: limits.maximumOutputTokens,
      maximumAttempts: limits.maximumAttempts,
    }),
};

let quote: CustomerOpenAiTextQuote;
let authorizationId: string;
let handle: OpenAiTextPaidExecutionHandle;
if (RESUME) {
  authorizationId = required("CERT_RESUME_AUTHORIZATION_ID");
  const resumeOperationId = required("CERT_RESUME_OPERATION_ID");
  const resumeReservationId = required("CERT_RESUME_RESERVATION_ID");
  const resumeQuoteId = required("CERT_RESUME_QUOTE_ID");
  assert.equal(resumeOperationId, identifiers.operationId, "resume operation must match the exact request fingerprint");
  const storedQuote = object(await rpc(userGate, "read_my_spending_quote", { p_quote_id: resumeQuoteId }));
  assert.equal(integer(storedQuote.normal_maximum_charge_micros), CUSTOMER_CHARGE_MICROS);
  assert.equal(integer(storedQuote.customer_credit_units), CUSTOMER_CREDITS);
  assert.ok(storedQuote.accepted_at);
  quote = {
    quoteId: resumeQuoteId,
    operationId: resumeOperationId,
    quoteHash: String(storedQuote.quote_hash),
    requestFingerprint,
    currency: "USD",
    maximumCustomerChargeMicros: CUSTOMER_CHARGE_MICROS,
    failureCustomerChargeMicros: 0,
    failureTerms: "Forge-caused and provider-caused failures cost you $0.",
    fundingEligible: true,
    fundingSource: "customer_deposit",
    fundingEnvironment: "test",
    payerKind: "personal",
    fundingLabel: "Verified Forge Credit purchase",
    modelDisplayName: "GPT-5.6 Luna",
    providerModelId: MODEL,
    modelTradeoffSummary: "Bounded standard-customer certification.",
    catalogRevision: 4,
    estimatedCustomerChargeMicros: CUSTOMER_CHARGE_MICROS,
    expiresAt: String(storedQuote.expires_at),
  };
  handle = { operationId: resumeOperationId, reservationId: resumeReservationId, requestFingerprint };
} else {
  let quoteError: OpenAiTextQuoteRequiredError | null = null;
  try {
    await resolveOrdinaryOpenAiTextFunding(fundingArgs);
  } catch (error) {
    if (error instanceof OpenAiTextQuoteRequiredError) quoteError = error;
    else throw error;
  }
  assert.ok(quoteError, "the first standard-customer request must return an exact quote");
  quote = quoteError.quote;
  assert.equal(quote.operationId, identifiers.operationId);
  assert.equal(quote.requestFingerprint, requestFingerprint);
  assert.equal(quote.providerModelId, MODEL);
  assert.equal(quote.maximumCustomerChargeMicros, CUSTOMER_CHARGE_MICROS);
  assert.equal(quote.estimatedCustomerChargeMicros, CUSTOMER_CHARGE_MICROS);
  assert.equal(quote.failureCustomerChargeMicros, 0);
  assert.equal(quote.fundingEligible, true);
  assert.equal(quote.fundingSource, "customer_deposit");
  assert.equal(quote.fundingEnvironment, "test");

  authorizationId = randomUUID();
  const authorization = object(await rpc(serviceGate, "create_customer_paid_execution_scope_authorization", {
    p_authorization_id: authorizationId,
    p_actor_id: operatorId,
    p_user_id: userId,
    p_workspace_id: workspaceId,
    p_financial_environment: "test",
    p_route_code: ROUTE,
    p_provider: "openai",
    p_model_or_sku: MODEL,
    p_pricing_revision_id: PRICING_REVISION_ID,
    p_cost_policy_revision_id: COST_POLICY_REVISION_ID,
    p_valid_from: new Date(Date.now() - 5_000).toISOString(),
    p_valid_until: new Date(Date.now() + 60 * 60 * 1_000).toISOString(),
    p_reason: "One bounded standard-customer Forge Credit certification; one provider operation only.",
  }));
  assert.equal(authorization.authorization_id, authorizationId);
  assert.equal(authorization.replay, false);

  const resolvedHandle = await resolveOrdinaryOpenAiTextFunding({
    ...fundingArgs,
    acceptance: {
      operationId: quote.operationId,
      quoteId: quote.quoteId,
      quoteHash: quote.quoteHash,
      requestFingerprint: quote.requestFingerprint,
    },
  });
  assert.ok(resolvedHandle, "accepted quote must produce a standard paid execution handle");
  handle = resolvedHandle;
}
assert.equal(handle.operationId, identifiers.operationId);
assert.equal(handle.requestFingerprint, requestFingerprint);

let providerCallCount = 0;
const exactlyOneProviderFetch: typeof fetch = async (input, init) => {
  if (providerCallCount >= 1) throw new Error("A second OpenAI provider request was blocked");
  providerCallCount += 1;
  return fetch(input, init);
};
const executionArgs = {
  gate: serviceGate,
  handle,
  userId,
  workspaceId,
  workpieceId,
  credentialSource: "forge_managed" as const,
  apiKey: openAiApiKey,
  messages,
  signal: AbortSignal.timeout(120_000),
  providerFetch: exactlyOneProviderFetch,
  validateAndNormalize: (rawReply: string) => ({
    assistantText: rawReply.trim(),
    ops: [],
    scriptText: null,
    tagAudit: { certification: "forge.standard-customer-financial-path.v1" },
  }),
};
const settled = await executePaidHearthChatCompletion(executionArgs);
if (settled.state !== "settled") {
  process.stdout.write(`${JSON.stringify({
    ok: false,
    terminal_state: settled.state,
    provider_call_count: providerCallCount,
    authorization_id: authorizationId,
    operation_id: handle.operationId,
    reservation_id: handle.reservationId,
  }, null, 2)}\n`);
  throw new Error(`Certification did not settle; no retry was attempted (${settled.state})`);
}
assert.equal(providerCallCount, 1);
assert.equal(settled.attempts, 1);
assert.equal(settled.customerChargeMicros, CUSTOMER_CHARGE_MICROS);
assert.ok(settled.result.assistantText.trim());

const replay = await executePaidHearthChatCompletion({
  ...executionArgs,
  signal: AbortSignal.timeout(30_000),
});
assert.equal(replay.state, "settled_replay");
assert.equal(replay.attempts, 0);
assert.equal(replay.customerChargeMicros, CUSTOMER_CHARGE_MICROS);
assert.equal(providerCallCount, 1, "settled replay must not call OpenAI again");

const fundingAfter = object(await rpc(userGate, "read_my_customer_funding"));
const afterSpendable = object(fundingAfter.active_spendable);
const afterPurchased = object(afterSpendable.purchased);
const afterAllowance = object(afterSpendable.allowances);
assert.equal(integer(afterPurchased.available_credit_units), 7_979);
assert.equal(integer(afterAllowance.available_entitlement_units), 1_000);

const resultRecord = await must(tongs.from("openai_text_persisted_results")
  .select("id,reservation_id,operation_id,route_code,user_id,workspace_id,workpiece_id,provider_request_id,model,input_units,output_units,result_hash,persisted_at")
  .eq("operation_id", handle.operationId).single(), "persisted Hearth result");
const reservationRecord = await must(tongs.from("funding_reservations")
  .select("id,quote_id,operation_id,funding_source_type,funding_source_id,currency,reserved_customer_charge_micros,reserved_credit_units,reserved_wholesale_spend_micros,funding_environment,rollout_authorization_id")
  .eq("id", handle.reservationId).single(), "funding reservation");
const eventRecords = await must(tongs.from("funding_reservation_events")
  .select("sequence,event_type,provider_attempt_key,customer_charge_micros,credit_units,wholesale_spend_micros,failure_class,created_at")
  .eq("reservation_id", handle.reservationId).order("sequence", { ascending: true }), "reservation events");
const consumptionRecords = await must(tongs.from("customer_deposit_consumptions")
  .select("id,deposit_id,operation_id,recognized_revenue_micros,credit_units_consumed,allocated_processor_fee_micros,journal_event_id,consumed_at")
  .eq("operation_id", handle.operationId), "deposit consumption");
const journalRecords = await must(tongs.from("accounting_journal_events")
  .select("id,event_type,environment,source_type,source_id,currency,occurred_at")
  .eq("source_id", handle.operationId), "accounting journal events");
const isolationAfter = await isolationSnapshot();
assert.deepEqual(isolationAfter, preflight.isolation, "simulator, owner, BYO, and Live funding state must remain unchanged");

const responseHash = createHash("sha256").update(settled.result.assistantText).digest("hex");
process.stdout.write(`${JSON.stringify({
  ok: true,
  environment: "test",
  workflow_contract: "forge.customer-financial-path.v2",
  authorization_id: authorizationId,
  quote: {
    id: quote.quoteId,
    operation_id: quote.operationId,
    request_fingerprint: quote.requestFingerprint,
    quote_hash: quote.quoteHash,
    model: quote.providerModelId,
    funding_source: quote.fundingSource,
    funding_environment: quote.fundingEnvironment,
    maximum_customer_charge_micros: quote.maximumCustomerChargeMicros,
    customer_credit_units: CUSTOMER_CREDITS,
    failure_customer_charge_micros: quote.failureCustomerChargeMicros,
  },
  reservation: reservationRecord.data,
  provider: {
    request_id: settled.requestId,
    provider_call_count: providerCallCount,
    attempts: settled.attempts,
    input_units: settled.inputUnits,
    output_units: settled.outputUnits,
    response_sha256: responseHash,
    response_characters: settled.result.assistantText.length,
  },
  persistence: resultRecord.data,
  settlement: {
    state: settled.state,
    customer_charge_micros: settled.customerChargeMicros,
    customer_credit_units: CUSTOMER_CREDITS,
    reservation_events: eventRecords.data,
    deposit_consumptions: consumptionRecords.data,
    accounting_journal_events: journalRecords.data,
  },
  replay: {
    state: replay.state,
    attempts: replay.attempts,
    customer_charge_micros: replay.customerChargeMicros,
    total_provider_call_count: providerCallCount,
  },
  balances: {
    purchased_credits_before: purchasedCreditsBefore,
    purchased_credits_after: integer(afterPurchased.available_credit_units),
    allowance_credits_before: integer(beforeAllowance.available_entitlement_units),
    allowance_credits_after: integer(afterAllowance.available_entitlement_units),
  },
  binding: {
    operation_id: settled.context.operationId,
    reservation_id: settled.context.reservationId,
    model: settled.context.model,
    credential_funding: settled.context.credentialFunding,
    funding_source_type: settled.context.fundingSourceType,
  },
  isolation_before: preflight.isolation,
  isolation_after: isolationAfter,
  live_configuration: liveConfig,
}, null, 2)}\n`);
