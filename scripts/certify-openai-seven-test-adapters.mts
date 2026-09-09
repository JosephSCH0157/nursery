import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { createOpenAiTextTestCertificationHandler } from "../apps/nursery/server/billing/openai-text-test-certification.ts";
import { fingerprintOpenAiTextPaidRequest } from "../packages/tongs/src/providers/paid-openai-text-route-execution.ts";

type Row = Record<string, unknown>;
type RpcResult = { data: unknown; error: { message?: string } | null };

const routes = [
  "hearth.research_synthesis",
  "visual.unified_plan",
  "visual.narrative_interpretation",
  "motion.broll_interpretation",
  "hammer.transcript_cleanup",
  "shorts.discovery",
  "quench.metadata",
] as const;

const failures = new Map<string, string>([
  ["hearth.research_synthesis", "provider_failure"],
  ["visual.unified_plan", "validation_failure"],
  ["visual.narrative_interpretation", "persistence_failure"],
  ["motion.broll_interpretation", "provider_failure"],
  ["hammer.transcript_cleanup", "validation_failure"],
  ["shorts.discovery", "persistence_failure"],
  ["quench.metadata", "provider_failure"],
]);

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function record(value: unknown): Row {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
}

function list(value: unknown): Row[] {
  return Array.isArray(value) ? value.filter((item): item is Row => Boolean(item) && typeof item === "object" && !Array.isArray(item)) : [];
}

async function rpc(schema: ReturnType<ReturnType<typeof createClient>["schema"]>, name: string, args: Row = {}): Promise<unknown> {
  const result = await (schema as unknown as { rpc(name: string, args?: Row): Promise<RpcResult> }).rpc(name, args);
  if (result.error) throw new Error(`${name}: ${result.error.message ?? "unknown RPC error"}`);
  return result.data;
}

const supabaseUrl = required("CERT_SUPABASE_URL");
const serviceRoleKey = required("CERT_SERVICE_ROLE_KEY");
const anonKey = process.env.CERT_ANON_KEY?.trim() ?? "";
const seedIsolated = process.env.CERT_SEED_ISOLATED === "true";
const endpoint = process.env.CERT_ENDPOINT?.trim() ?? "";
const service = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
const tongs = service.schema("tongs");

let actorId = process.env.CERT_ACTOR_ID?.trim() ?? "";
let userId = process.env.CERT_USER_ID?.trim() ?? "";
let workspaceId = process.env.CERT_WORKSPACE_ID?.trim() ?? "";
let depositId = process.env.CERT_DEPOSIT_ID?.trim() ?? "";
let ordinaryEmail = "";
let actorEmail = "";
const isolatedPassword = `Forge-Test-${randomUUID()}!Aa1`;

if (seedIsolated) {
  actorId = randomUUID();
  userId = randomUUID();
  workspaceId = randomUUID();
  depositId = randomUUID();
  const ordinaryId = randomUUID();
  ordinaryEmail = `ordinary-${ordinaryId}@example.test`;
  actorEmail = `operator-${actorId}@example.test`;
  const identities = [
    { id: actorId, email: actorEmail },
    { id: userId, email: `customer-${userId}@example.test` },
    { id: ordinaryId, email: ordinaryEmail },
  ];
  for (const identity of identities) {
    const created = await service.auth.admin.createUser({ id: identity.id, email: identity.email, password: isolatedPassword, email_confirm: true });
    if (created.error) throw created.error;
  }
  const orgLookup = await tongs.from("orgs").select("id").eq("personal_owner_user_id", userId).single();
  if (orgLookup.error) throw orgLookup.error;
  const orgId = String(orgLookup.data.id);
  const workspace = await tongs.from("workspaces").insert({ id: workspaceId, created_by: userId, org_id: orgId, name: "Seven-route Test certification" });
  if (workspace.error) throw workspace.error;
  const members = await tongs.from("workspace_members").upsert([
    { workspace_id: workspaceId, user_id: userId, role: "owner" },
    { workspace_id: workspaceId, user_id: ordinaryId, role: "viewer" },
  ], { onConflict: "workspace_id,user_id" });
  if (members.error) throw members.error;
  await rpc(tongs, "set_platform_operator", { p_user_id: actorId, p_enabled: true, p_reason: "Isolated seven-route Test certification" });
  await rpc(tongs, "record_customer_deposit", {
    p_deposit_id: depositId,
    p_user_id: userId,
    p_stripe_event_id: `evt_test_${depositId}`,
    p_stripe_session_id: `cs_test_${depositId}`,
    p_stripe_payment_intent_id: `pi_test_${depositId}`,
    p_livemode: false,
    p_pack_id: "ai_certification_fixture",
    p_gross_amount_micros: 40_000_000,
    p_currency: "USD",
    p_credit_units: 15_000,
    p_received_at: new Date().toISOString(),
    p_metadata_json: { fixture: true },
  });
}

assert.match(actorId, /^[0-9a-f-]{36}$/i);
assert.match(userId, /^[0-9a-f-]{36}$/i);
assert.match(workspaceId, /^[0-9a-f-]{36}$/i);
assert.match(depositId, /^[0-9a-f-]{36}$/i);

const before = record(await rpc(tongs, "read_customer_test_billing", { p_user_id: userId }));
const beforeBalance = Number(before.test_credit_balance);
assert.ok(Number.isSafeInteger(beforeBalance) && beforeBalance >= 7, "at least seven existing Test credits are required");

const batchId = randomUUID();
const invocationToken = `forge-test-cert-${randomUUID()}-${randomUUID()}`;
const invocationTokenHash = createHash("sha256").update(invocationToken, "utf8").digest("hex");
const terms = routes.map((route) => {
  const large = route === "hearth.research_synthesis" || route === "hammer.transcript_cleanup" || route === "shorts.discovery" || route === "quench.metadata";
  return {
    route_code: route,
    model: large ? "gpt-5.3" : "gpt-5-mini",
    maximum_input_units: 4_096,
    maximum_output_units: large ? 1_024 : 768,
    maximum_attempts: 1,
    input_micros_per_million_tokens: 1_000,
    output_micros_per_million_tokens: 4_000,
    direct_provider_ceiling_micros: large ? 5_000 : 3_000,
    supporting_cost_ceiling_micros: large ? 2_000 : 1_500,
    failure_exposure_ceiling_micros: large ? 5_000 : 3_000,
    markup_basis_points: 3_300,
    customer_price_ceiling_micros: 10_000,
    customer_credit_units: 1,
    rate_evidence_status: "synthetic_test",
    supporting_cost_policy: {
      scope: "validation_and_tongs_persistence_only",
      search_allowed: false,
      external_enrichment_allowed: false,
      extraction_allowed: false,
      transcription_allowed: false,
      synthetic_test: true,
    },
  };
});

const opened = record(await rpc(tongs, "open_openai_text_test_certification", {
  p_batch_id: batchId,
  p_actor_id: actorId,
  p_user_id: userId,
  p_workspace_id: workspaceId,
  p_deposit_id: depositId,
  p_invocation_token_hash: invocationTokenHash,
  p_expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  p_terms: terms,
  p_reason: "Controlled seven-route Stripe Test certification; no Live provider authorization",
}));
assert.equal(opened.real_provider_authorized, false);
assert.equal(Number(opened.maximum_aggregate_charge_micros), 70_000);

const localHandler = endpoint ? null : createOpenAiTextTestCertificationHandler({ supabaseUrl, serviceRoleKey });
let realProviderCalls = 0;
async function invoke(operationId: string, reservationId: string): Promise<{ status: number; body: Row }> {
  const request = new Request(endpoint || "http://local.test/.netlify/functions/openai-text-test-certification", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${invocationToken}` },
    body: JSON.stringify({ batch_id: batchId, operation_id: operationId, reservation_id: reservationId }),
  });
  const response = endpoint ? await fetch(request) : await localHandler!(request);
  const body = record(await response.json());
  if (body.real_provider_called === true) realProviderCalls += 1;
  return { status: response.status, body };
}

type Prepared = { route: string; scenario: string; operationId: string; operationRecordId: string; reservationId: string; requestPayload: Row };
async function prepare(route: string, scenario: string): Promise<Prepared> {
  const operationRecordId = randomUUID();
  const reservationId = randomUUID();
  const operationId = `test-cert:${batchId}:${route}:${scenario}`;
  const requestPayload = {
    certification_contract: "forge.openai-text-test-certification.v1",
    route_code: route,
    scenario,
    supplied_source_only: true,
    supporting_services: [],
    source_fixture: "Neutral supplied Test fixture. No search, extraction, enrichment, or transcription is permitted.",
  };
  const requestFingerprint = await fingerprintOpenAiTextPaidRequest(requestPayload);
  await rpc(tongs, "prepare_openai_text_test_certification_operation", {
    p_operation_record_id: operationRecordId,
    p_batch_id: batchId,
    p_route_code: route,
    p_scenario: scenario,
    p_operation_id: operationId,
    p_workpiece_id: `TEST-CERT-${batchId}-${route}-${scenario}`,
    p_request_fingerprint: requestFingerprint,
    p_request_json: requestPayload,
    p_actor_id: actorId,
  });
  return { route, scenario, operationId, operationRecordId, reservationId, requestPayload };
}

async function reserve(prepared: Prepared): Promise<Row> {
  return record(await rpc(tongs, "reserve_openai_text_test_certification_operation", {
    p_reservation_id: prepared.reservationId,
    p_operation_record_id: prepared.operationRecordId,
    p_idempotency_key: `${prepared.operationId}:reservation`,
  }));
}

const matrix: Row[] = [];
let concurrencyBlocked = false;
let concurrencyBlockReason = "";
for (let index = 0; index < routes.length; index += 1) {
  const route = routes[index];
  const success = await prepare(route, "success");
  const failure = await prepare(route, failures.get(route)!);
  await reserve(success);
  if (index === 0) {
    try { await reserve(failure); } catch (error) { concurrencyBlocked = true; concurrencyBlockReason = String(error); }
    assert.equal(concurrencyBlocked, true, "a second concurrent reservation must be blocked");
  }
  const successResponse = await invoke(success.operationId, success.reservationId);
  assert.equal(successResponse.status, 200, `${route} success HTTP status`);
  assert.equal(successResponse.body.ok, true, `${route} success response`);
  assert.equal(record(successResponse.body.outcome).state, "settled", `${route} success settlement`);
  assert.equal(Number(record(successResponse.body.outcome).customerChargeMicros), 10_000, `${route} one-credit Test charge`);
  const replayResponse = await invoke(success.operationId, success.reservationId);
  assert.equal(replayResponse.status, 200, `${route} replay HTTP status`);
  assert.equal(record(replayResponse.body.outcome).state, "settled_replay", `${route} replay state`);

  await reserve(failure);
  const failureResponse = await invoke(failure.operationId, failure.reservationId);
  assert.equal(failureResponse.status, 200, `${route} failure exercise HTTP status`);
  assert.equal(failureResponse.body.ok, true, `${route} handled failure response`);
  assert.equal(record(failureResponse.body.outcome).state, "failed_released", `${route} failure release`);
  assert.equal(Number(record(failureResponse.body.outcome).customerChargeMicros), 0, `${route} failure customer relief`);
  const failureReplay = await invoke(failure.operationId, failure.reservationId);
  assert.equal(failureReplay.status, 200, `${route} failure replay HTTP status`);
  assert.equal(record(failureReplay.body.outcome).state, "failed_released", `${route} failure replay state`);

  matrix.push({ route, success_operation_id: success.operationId, success_reservation_id: success.reservationId, failure_operation_id: failure.operationId, failure_reservation_id: failure.reservationId });
}

await rpc(tongs, "close_openai_text_test_certification", {
  p_batch_id: batchId,
  p_actor_id: actorId,
  p_reason: "All fourteen bounded Test operations completed; close new reservations",
});

const after = record(await rpc(tongs, "read_customer_test_billing", { p_user_id: userId }));
const owner = record(await rpc(tongs, "read_openai_text_test_certification", { p_batch_id: batchId }));
const operations = list(owner.operations);
const batches = list(owner.batches);
assert.equal(batches.length, 1);
assert.equal(batches[0].status, "closed");
assert.equal(operations.length, 14);
assert.equal(operations.filter((row) => row.reservation_state === "settled").length, 7);
assert.equal(operations.filter((row) => row.reservation_state === "released").length, 7);
assert.equal(operations.reduce((sum, row) => sum + Number(row.customer_charge_micros ?? 0), 0), 70_000);
assert.equal(operations.filter((row) => row.scenario === "success" && Number(row.provider_execution_count) === 1).length, 7);
assert.equal(operations.filter((row) => row.scenario !== "success" && row.failure_class && Number(row.customer_charge_micros) === 0).length, 7);
assert.equal(Number(after.test_credit_balance), beforeBalance - 7);
assert.equal(realProviderCalls, 0);

if (seedIsolated && anonKey && ordinaryEmail) {
  const operator = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const operatorSignedIn = await operator.auth.signInWithPassword({ email: actorEmail, password: isolatedPassword });
  if (operatorSignedIn.error) throw operatorSignedIn.error;
  const operatorRead = await (operator.schema("tongs") as unknown as { rpc(name: string, args?: Row): Promise<RpcResult> }).rpc("read_openai_text_test_certification", { p_batch_id: batchId });
  assert.equal(record(operatorRead.data).environment, "test", "authenticated platform operator can read private Test evidence");

  const ordinary = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const signedIn = await ordinary.auth.signInWithPassword({ email: ordinaryEmail, password: isolatedPassword });
  if (signedIn.error) throw signedIn.error;
  const privateRead = await (ordinary.schema("tongs") as unknown as { rpc(name: string, args?: Row): Promise<RpcResult> }).rpc("read_openai_text_test_certification", { p_batch_id: batchId });
  assert.ok(privateRead.error, "ordinary workspace members must not read private Test cost evidence");
}

process.stdout.write(`${JSON.stringify({
  ok: true,
  batch_id: batchId,
  before_test_credit_balance: beforeBalance,
  after_test_credit_balance: Number(after.test_credit_balance),
  aggregate_customer_debit_micros: 70_000,
  success_count: 7,
  zero_charge_failure_count: 7,
  duplicate_replays_verified: 14,
  concurrency_blocked: concurrencyBlocked,
  concurrency_block_reason: concurrencyBlockReason,
  real_provider_calls: realProviderCalls,
  authorization_status: batches[0].status,
  terms,
  matrix,
}, null, 2)}\n`);
