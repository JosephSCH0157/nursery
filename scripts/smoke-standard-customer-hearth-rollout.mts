import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { createClient } from "@supabase/supabase-js";
import { config as loadDotEnv } from "dotenv";

import {
  OpenAiTextQuoteRequiredError,
  resolveOrdinaryOpenAiTextFunding,
} from "../packages/tongs/src/providers/openai-text-customer-funding.ts";
import type { OpenAiTextGateClient } from "../packages/tongs/src/providers/paid-openai-text-execution-coordinator.ts";
import {
  buildBoundedHearthChatProviderRequest,
  deriveHearthCustomerPaidIdentifiers,
  executePaidHearthChatCompletion,
  fingerprintPaidHearthChatRequest,
} from "../apps/nursery/server/hearth/hearth-paid-chat-execution.ts";

type Row = Record<string, unknown>;
type QueryResult = { data: unknown; error: { message?: string } | null; count?: number | null };

const repoRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
loadDotEnv({ path: path.join(repoRoot, "apps", "nursery", ".env.local"), override: false });
loadDotEnv({ path: path.join(repoRoot, "apps", "nursery", ".env"), override: false });

if (!process.argv.includes("--execute")) {
  throw new Error("Pass --execute to authorize exactly two minimal Test Luna provider calls.");
}
const resumeAfterOperationOne = process.argv.includes("--resume-after-operation-one");

const ROUTE = "hearth.chat_completion";
const MODEL = "gpt-5.6-luna";
const CUSTOMER_CREDITS = 3;
const CUSTOMER_CHARGE_MICROS = 15_000;
const WHOLESALE_CEILING_MICROS = 11_015;
const NORMAL_AUTHORIZATION_ID = "4e28dc91-5042-4c98-ad2e-8fd8bd5ddd51";

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
  assert.ok(Number.isSafeInteger(parsed), `Expected integer, received ${String(value)}`);
  return parsed;
}

async function must<T extends QueryResult>(promise: PromiseLike<T>, label: string): Promise<T> {
  const result = await promise;
  if (result.error) throw new Error(`${label}: ${result.error.message ?? "unknown error"}`);
  return result;
}

async function rpc(gate: OpenAiTextGateClient, name: string, args: Row = {}): Promise<unknown> {
  const result = await gate.rpc(name, args);
  if (result.error) throw new Error(`${name}: ${result.error.message ?? "unknown error"}`);
  return result.data;
}

const supabaseUrl = process.env.TONGS_SUPABASE_URL?.trim()
  || process.env.VITE_SUPABASE_URL?.trim()
  || "";
const serviceRoleKey = process.env.TONGS_SERVICE_ROLE_KEY?.trim() || "";
const publishableKey = process.env.VITE_SUPABASE_ANON_KEY?.trim() || "";
const openAiApiKey = process.env.OPENAI_TEXT_API_KEY?.trim()
  || process.env.OPENAI_API_KEY?.trim()
  || "";
if (!supabaseUrl || !serviceRoleKey || !publishableKey || !openAiApiKey) {
  throw new Error("Supabase and Forge-managed OpenAI credentials are required.");
}

const userId = process.env.CERT_USER_ID?.trim() || "71daf61b-57b3-4e5f-a8c8-64befecb5950";
const workspaceId = process.env.CERT_WORKSPACE_ID?.trim() || "cc5478ff-37be-403e-824c-467fa7da061e";
const workpieceId = process.env.CERT_WORKPIECE_ID?.trim() || "21d16d6a-905b-491e-8761-028789612ae5";
process.env.FORGE_OPENAI_TEXT_EXECUTION_MODE = "enforce";

const service = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const tongs = service.schema("tongs") as any;
const serviceGate = tongs as unknown as OpenAiTextGateClient;

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
    countRows("customer_deposits", [["stripe_mode", "live"]]),
    countRows("paid_allowance_grants", [["financial_environment", "live"]]),
    countRows("funding_reservations", [["funding_source_type", "none"]]),
  ]);
  return {
    simulator: {
      test_authorizations: values[0],
      test_evidence: values[1],
      certification_operations: values[2],
      certification_evidence: values[3],
    },
    owner: {
      hearth_authorizations: values[4],
      operation_authorizations: values[5],
      research_authorizations: values[6],
    },
    live: { deposits: values[7], allowance_grants: values[8] },
    byo_reservations: values[9],
  };
}

async function fundingSnapshot(gate: OpenAiTextGateClient): Promise<Row> {
  const funding = object(await rpc(gate, "read_my_customer_funding"));
  assert.equal(funding.active_environment, "test");
  return funding;
}

function balances(funding: Row): Row {
  const spendable = object(funding.active_spendable);
  return {
    purchased: integer(object(spendable.purchased).available_credit_units),
    allowance: integer(object(spendable.allowances).available_entitlement_units),
    beta_grant: integer(object(spendable.beta_grants).available_credit_units),
    legacy_nonspendable: integer(object(funding.legacy_unverified).credit_units),
  };
}

const configResult = await must(tongs.from("financial_environment_configuration_revisions")
  .select("environment,revision,lifecycle_state,maximum_operation_count,rolling_window_seconds,maximum_concurrency,wholesale_exposure_ceiling_micros")
  .in("environment", ["test", "live"]).order("revision", { ascending: false }), "financial configurations");
const configs = (configResult.data ?? []) as Row[];
const testConfig = configs.find((row) => row.environment === "test");
const liveConfig = configs.find((row) => row.environment === "live");
assert.equal(testConfig?.lifecycle_state, "customer_rollout_active");
assert.equal(testConfig?.maximum_operation_count, null);
assert.equal(testConfig?.rolling_window_seconds, null);
assert.equal(integer(testConfig?.maximum_concurrency), 1);
assert.equal(integer(testConfig?.wholesale_exposure_ceiling_micros), WHOLESALE_CEILING_MICROS);
assert.equal(liveConfig?.lifecycle_state, "inactive_ready");

const authResult = await must(tongs.from("customer_paid_execution_scope_authorizations")
  .select("id,authorization_kind,status,maximum_operation_count,rolling_window_seconds,valid_until,maximum_concurrency,maximum_customer_charge_micros,maximum_wholesale_exposure_micros")
  .eq("id", NORMAL_AUTHORIZATION_ID).single(), "normal customer authorization");
const authorization = object(authResult.data);
assert.equal(authorization.authorization_kind, "normal_customer");
assert.equal(authorization.status, "active");
assert.equal(authorization.maximum_operation_count, null);
assert.equal(authorization.rolling_window_seconds, null);
assert.equal(authorization.valid_until, null);
assert.equal(integer(authorization.maximum_concurrency), 1);
assert.equal(integer(authorization.maximum_customer_charge_micros), CUSTOMER_CHARGE_MICROS);
assert.equal(integer(authorization.maximum_wholesale_exposure_micros), WHOLESALE_CEILING_MICROS);

const customerResult = await service.auth.admin.getUserById(userId);
if (customerResult.error || !customerResult.data.user?.email) {
  throw customerResult.error ?? new Error("Customer email is unavailable");
}
const linkResult = await service.auth.admin.generateLink({
  type: "magiclink",
  email: customerResult.data.user.email,
});
if (linkResult.error || !linkResult.data.properties?.hashed_token) {
  throw linkResult.error ?? new Error("Could not create a non-delivered customer sign-in token");
}
const customer = createClient(supabaseUrl, publishableKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const verified = await customer.auth.verifyOtp({
  token_hash: linkResult.data.properties.hashed_token,
  type: "magiclink",
});
if (verified.error || verified.data.user?.id !== userId || !verified.data.session) {
  throw verified.error ?? new Error("Customer-scoped authentication failed");
}
const userGate = customer.schema("tongs") as unknown as OpenAiTextGateClient;

const isolationBefore = await isolationSnapshot();
const fundingBefore = await fundingSnapshot(userGate);
const startingBalances = balances(fundingBefore);
assert.equal(startingBalances.purchased, resumeAfterOperationOne ? 7_976 : 7_979);
assert.equal(startingBalances.allowance, 1_000);
assert.equal(startingBalances.beta_grant, 0);

let providerCallCount = 0;
const operationEvidence: Row[] = [];
const prompts = [
  "Reply with one short neutral sentence confirming Hearth is ready.",
  "Reply with one short neutral sentence confirming the studio is quiet.",
];

for (const [relativeIndex, prompt] of prompts.slice(resumeAfterOperationOne ? 1 : 0).entries()) {
  const index = relativeIndex + (resumeAfterOperationOne ? 1 : 0);
  const readiness = object(await rpc(serviceGate, "read_openai_execution_requirement", {
    p_route_code: ROUTE,
    p_credential_funding: "forge",
  }));
  assert.equal(readiness.mode, "enforce");
  const selection = object(await rpc(serviceGate, "resolve_openai_text_model_for_funding_quote", {
    p_user_id: userId,
    p_workspace_id: workspaceId,
    p_route_code: ROUTE,
    p_credential_funding: "forge",
  }));
  assert.equal(selection.runtime_model_id, MODEL);

  const messages = [
    { role: "system", content: "You are Hearth. Answer with exactly one concise neutral sentence." },
    { role: "user", content: prompt },
  ];
  const requestFingerprint = fingerprintPaidHearthChatRequest({
    smoke_contract: "forge.standard-customer-normal-rollout.v1",
    request_nonce: randomUUID(),
    route: ROUTE,
    user_id: userId,
    workspace_id: workspaceId,
    workpiece_id: workpieceId,
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

  let quoteError: OpenAiTextQuoteRequiredError | null = null;
  try {
    await resolveOrdinaryOpenAiTextFunding(fundingArgs);
  } catch (error) {
    if (error instanceof OpenAiTextQuoteRequiredError) quoteError = error;
    else throw error;
  }
  assert.ok(quoteError, `operation ${index + 1} must produce a quote`);
  const quote = quoteError.quote;
  assert.equal(quote.customerCreditUnits, CUSTOMER_CREDITS);
  assert.equal(quote.maximumCustomerChargeMicros, CUSTOMER_CHARGE_MICROS);
  assert.equal(quote.fundingEligible, true);
  assert.equal(quote.fundingLabel, "Forge Credits");
  assert.equal(quote.providerModelId, MODEL);

  const handle = await resolveOrdinaryOpenAiTextFunding({
    ...fundingArgs,
    acceptance: {
      operationId: quote.operationId,
      quoteId: quote.quoteId,
      quoteHash: quote.quoteHash,
      requestFingerprint: quote.requestFingerprint,
    },
  });
  assert.ok(handle);

  const reservationBeforeExecution = await must(tongs.from("funding_reservations")
    .select("id,operation_id,funding_source_type,funding_environment,reserved_customer_charge_micros,reserved_credit_units,reserved_wholesale_spend_micros,rollout_authorization_id")
    .eq("id", handle.reservationId).single(), `operation ${index + 1} reservation`);
  const reservation = object(reservationBeforeExecution.data);
  assert.equal(reservation.rollout_authorization_id, NORMAL_AUTHORIZATION_ID);
  assert.equal(reservation.funding_source_type, "customer_deposit");
  assert.equal(reservation.funding_environment, "test");
  assert.equal(integer(reservation.reserved_credit_units), CUSTOMER_CREDITS);
  assert.equal(integer(reservation.reserved_wholesale_spend_micros), WHOLESALE_CEILING_MICROS);

  let operationProviderCalls = 0;
  const providerFetch: typeof fetch = async (input, init) => {
    operationProviderCalls += 1;
    providerCallCount += 1;
    assert.equal(operationProviderCalls, 1, `operation ${index + 1} attempted multiple provider calls`);
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
    providerFetch,
    validateAndNormalize: (rawReply: string) => ({
      assistantText: rawReply.trim(),
      ops: [],
      scriptText: null,
      tagAudit: { smoke: "forge.standard-customer-normal-rollout.v1" },
    }),
  };
  const settled = await executePaidHearthChatCompletion(executionArgs);
  assert.equal(settled.state, "settled");
  if (settled.state !== "settled") throw new Error(`operation ${index + 1} did not settle`);
  assert.equal(settled.customerChargeMicros, CUSTOMER_CHARGE_MICROS);
  assert.equal(settled.attempts, 1);
  assert.ok(settled.result.assistantText);

  const callsBeforeReplay = providerCallCount;
  const replay = await executePaidHearthChatCompletion({
    ...executionArgs,
    signal: AbortSignal.timeout(30_000),
    providerFetch: async () => {
      throw new Error(`operation ${index + 1} replay attempted a provider call`);
    },
  });
  assert.equal(replay.state, "settled_replay");
  assert.equal(replay.attempts, 0);
  assert.equal(providerCallCount, callsBeforeReplay);

  const resultRecord = await must(tongs.from("openai_text_persisted_results")
    .select("id,provider_request_id,result_hash,input_units,output_units,persisted_at")
    .eq("operation_id", handle.operationId).single(), `operation ${index + 1} persisted result`);
  const consumptionResult = await must(tongs.from("customer_deposit_consumptions")
    .select("id,credit_units_consumed,recognized_revenue_micros,journal_event_id")
    .eq("operation_id", String(reservation.operation_id)).single(), `operation ${index + 1} consumption`);
  const consumption = object(consumptionResult.data);
  assert.equal(integer(consumption.credit_units_consumed), CUSTOMER_CREDITS);
  assert.equal(integer(consumption.recognized_revenue_micros), CUSTOMER_CHARGE_MICROS);
  const journalResult = await must(tongs.from("accounting_journal_entries")
    .select("amount_micros,quantity_delta")
    .eq("event_id", consumption.journal_event_id), `operation ${index + 1} journal`);
  const journalRows = (journalResult.data ?? []) as Row[];
  assert.equal(journalRows.reduce((sum, row) => sum + Number(row.amount_micros ?? 0), 0), 0);

  operationEvidence.push({
    ordinal: index + 1,
    readiness: "available",
    customer_quote: { model: "GPT-5.6 Luna", cost: "3 Credits", funding: "Forge Credits" },
    operation_id: handle.operationId,
    quote_id: quote.quoteId,
    reservation_id: handle.reservationId,
    rollout_authorization_id: reservation.rollout_authorization_id,
    funding_source: reservation.funding_source_type,
    provider_request_id: object(resultRecord.data).provider_request_id,
    provider_calls: operationProviderCalls,
    persisted_result_id: object(resultRecord.data).id,
    settled_credits: CUSTOMER_CREDITS,
    journal_balanced: true,
    replay: { state: replay.state, provider_calls: 0, additional_charge_credits: 0 },
    response_sha256: createHash("sha256").update(settled.result.assistantText).digest("hex"),
  });
}

assert.equal(providerCallCount, resumeAfterOperationOne ? 1 : 2);
const fundingAfter = await fundingSnapshot(userGate);
const endingBalances = balances(fundingAfter);
assert.equal(endingBalances.purchased, integer(startingBalances.purchased) - (resumeAfterOperationOne ? 3 : 6));
assert.equal(endingBalances.allowance, startingBalances.allowance);
assert.equal(endingBalances.beta_grant, startingBalances.beta_grant);
assert.equal(endingBalances.legacy_nonspendable, startingBalances.legacy_nonspendable);
const isolationAfter = await isolationSnapshot();
assert.deepEqual(isolationAfter, isolationBefore);

process.stdout.write(`${JSON.stringify({
  ok: true,
  environment: "test",
  route: ROUTE,
  model: MODEL,
  normal_authorization: authorization,
  customer_controls: {
    maximum_operation_count: null,
    rolling_window_seconds: null,
    maximum_concurrency: 1,
    per_operation_wholesale_ceiling_micros: WHOLESALE_CEILING_MICROS,
  },
  starting_balances: startingBalances,
  operations: operationEvidence,
  ending_balances: endingBalances,
  total_provider_calls: providerCallCount,
  isolation_before: isolationBefore,
  isolation_after: isolationAfter,
  live_configuration: liveConfig,
}, null, 2)}\n`);
