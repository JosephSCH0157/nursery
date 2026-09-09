import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { fingerprintOpenAiTextPaidRequest } from "../../../packages/tongs/src/providers/paid-openai-text-route-execution.ts";
import { createOpenAiTextTestCertificationHandler } from "../server/billing/openai-text-test-certification.ts";
import { getNurseryRoot, loadNurseryEnv } from "../playwright/helpers/hearth-phase4-fixtures.ts";
import { readFixtureManifestForEnvironment } from "./browser-fixture-authority.mts";

type Row = Record<string, unknown>;
type RpcResult = { data: unknown; error: { message?: string } | null };

const ROUTES = [
  "hearth.research_synthesis", "visual.unified_plan", "visual.narrative_interpretation",
  "motion.broll_interpretation", "hammer.transcript_cleanup", "shorts.discovery", "quench.metadata",
] as const;

function required(values: Record<string, string>, name: string): string {
  const value = values[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}
function row(value: unknown): Row {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
}
function rows(value: unknown): Row[] {
  return Array.isArray(value) ? value.filter((value): value is Row => Boolean(value) && typeof value === "object" && !Array.isArray(value)) : [];
}
async function rpc(client: ReturnType<ReturnType<typeof createClient>["schema"]>, name: string, args: Row): Promise<unknown> {
  const result = await (client as unknown as { rpc(name: string, args?: Row): Promise<RpcResult> }).rpc(name, args);
  if (result.error) throw new Error(`${name}: ${result.error.message ?? "unknown RPC error"}`);
  return result.data;
}

const env = loadNurseryEnv();
const supabaseUrl = required(env, "TONGS_SUPABASE_URL");
if (!/^http:\/\/(127\.0\.0\.1|localhost):55321\/?$/i.test(supabaseUrl)) {
  throw new Error("Browser certification verification is pinned to the isolated 55321 Supabase API");
}
if (env.OPENAI_TEXT_API_KEY || env.OPENAI_API_KEY) throw new Error("OpenAI execution keys are forbidden during browser certification");
const serviceRoleKey = required(env, "TONGS_SERVICE_ROLE_KEY");
const manifest = readFixtureManifestForEnvironment(env);
if (!manifest || manifest.project_ref !== "local") throw new Error("The isolated browser fixture is unavailable");
const runtimePath = path.resolve(getNurseryRoot(), "playwright/.cache/openai-seven-browser-certification-runtime.json");
const runtime = row(JSON.parse(fs.readFileSync(runtimePath, "utf8")));
const batchId = String(runtime.batch_id ?? "");
const operatorId = String(runtime.operator_id ?? "");
const invocationToken = String(runtime.invocation_token ?? "");
assert.ok(batchId && operatorId && invocationToken, "Incomplete browser-certification runtime manifest");

const service = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
const tongs = service.schema("tongs");
const handler = createOpenAiTextTestCertificationHandler({ supabaseUrl, serviceRoleKey });

for (const route of ROUTES) {
  const existing = await (tongs as any).from("openai_text_test_certification_operations")
    .select("operation_id")
    .eq("batch_id", batchId)
    .eq("route_code", route)
    .eq("scenario", "validation_failure")
    .maybeSingle();
  if (existing.error) throw new Error(`Failure exercise lookup ${route}: ${existing.error.message}`);
  if (existing.data) continue;
  const operationRecordId = randomUUID();
  const reservationId = randomUUID();
  const operationId = `browser-cert-failure:${batchId}:${route}`;
  const requestPayload = {
    certification_contract: "forge.openai-text-browser-certification.failure.v1",
    route_code: route,
    scenario: "validation_failure",
    supplied_source_only: true,
    supporting_services: [],
    real_provider_authorized: false,
  };
  const requestFingerprint = await fingerprintOpenAiTextPaidRequest(requestPayload);
  await rpc(tongs, "prepare_openai_text_test_certification_operation", {
    p_operation_record_id: operationRecordId,
    p_batch_id: batchId,
    p_route_code: route,
    p_scenario: "validation_failure",
    p_operation_id: operationId,
    p_workpiece_id: manifest.hearth_workpiece_id,
    p_request_fingerprint: requestFingerprint,
    p_request_json: requestPayload,
    p_actor_id: operatorId,
  });
  await rpc(tongs, "reserve_openai_text_test_certification_operation", {
    p_reservation_id: reservationId,
    p_operation_record_id: operationRecordId,
    p_idempotency_key: `${operationId}:reservation`,
  });
  const request = () => new Request("http://127.0.0.1/openai-text-test-certification", {
    method: "POST",
    headers: { authorization: `Bearer ${invocationToken}`, "content-type": "application/json" },
    body: JSON.stringify({ batch_id: batchId, operation_id: operationId, reservation_id: reservationId }),
  });
  const response = await handler(request());
  const payload = row(await response.json());
  assert.equal(response.status, 200, `${route} handled failure status`);
  assert.equal(row(payload.outcome).state, "failed_released", `${route} failure releases funding`);
  assert.equal(Number(row(payload.outcome).customerChargeMicros), 0, `${route} failure charge`);
  const replay = row(await (await handler(request())).json());
  assert.equal(row(replay.outcome).state, "failed_released", `${route} failure replay state`);
}

const closed = row(await rpc(tongs, "close_openai_text_test_certification", {
  p_batch_id: batchId,
  p_actor_id: operatorId,
  p_reason: "Seven ordinary creator successes and shared zero-charge failure exercises complete",
}));
assert.equal(closed.state, "closed");
const owner = row(await rpc(tongs, "read_openai_text_test_certification", { p_batch_id: batchId }));
const operations = rows(owner.operations);
assert.equal(operations.length, 14);
assert.equal(operations.filter((operation) => operation.reservation_state === "settled").length, 7);
assert.equal(operations.filter((operation) => operation.reservation_state === "released").length, 7);
assert.equal(operations.reduce((sum, operation) => sum + Number(operation.customer_charge_micros ?? 0), 0), 70_000);
assert.equal(operations.filter((operation) => operation.scenario === "success" && Number(operation.provider_execution_count) === 1).length, 7);
assert.equal(operations.filter((operation) => operation.scenario !== "success" && Number(operation.customer_charge_micros) === 0).length, 7);

const domainRows: Array<{ route_code: string; operation_id: string; domain_result_id: string; domain_state: string }> = [];
async function collectDomain(table: string, route: string, idColumn: string, stateColumn?: string, filters: Row = {}): Promise<void> {
  let query = (tongs as any).from(table).select(`operation_id,${idColumn}${stateColumn ? `,${stateColumn}` : ""}`);
  for (const [column, value] of Object.entries(filters)) query = query.eq(column, value);
  const result = await query;
  if (result.error) throw new Error(`Domain evidence ${route}: ${result.error.message}`);
  for (const value of rows(result.data)) domainRows.push({
    route_code: route,
    operation_id: String(value.operation_id),
    domain_result_id: String(value[idColumn]),
    domain_state: stateColumn ? String(value[stateColumn]) : "persisted",
  });
}
await collectDomain("hearth_research_synthesis_results", "hearth.research_synthesis", "id");
await collectDomain("unified_visual_plan_operations", "visual.unified_plan", "image_map_revision_id", "state");
await collectDomain("image_map_prompt_operation_receipts", "visual.narrative_interpretation", "result_revision_id", "state", { operation_type: "interpretation" });
await collectDomain("broll_operation_receipts", "motion.broll_interpretation", "result_prompt_revision_id", "state", { operation_type: "prompt_interpretation" });
await collectDomain("hammer_transcript_cleanup_assist_results", "hammer.transcript_cleanup", "id");
await collectDomain("hammer_shorts_discoveries", "shorts.discovery", "id", "state");
await collectDomain("quench_metadata_assist_results", "quench.metadata", "id");
const successOperationIds = new Set(operations.filter((operation) => operation.scenario === "success").map((operation) => String(operation.operation_id)));
const successDomains = domainRows.filter((value) => successOperationIds.has(value.operation_id));
assert.equal(successDomains.length, 7, "Every successful creator operation must have one canonical domain result");
const termsResult = await (tongs as any).from("openai_text_test_certification_terms")
  .select("route_code,model,maximum_input_units,maximum_output_units,maximum_attempts,customer_price_ceiling_micros")
  .eq("batch_id", batchId);
if (termsResult.error) throw new Error(`Term evidence: ${termsResult.error.message}`);
const quoteResult = await (tongs as any).from("customer_spending_quotes")
  .select("id,operation_id,tool,pricing_revision_id,normal_maximum_charge_micros,customer_spending_quote_acceptances(id,accepted_at)")
  .in("operation_id", [...successOperationIds]);
if (quoteResult.error) throw new Error(`Quote evidence: ${quoteResult.error.message}`);
const acceptedQuotes = rows(quoteResult.data).map((quote) => ({
  route_code: quote.tool,
  operation_id: quote.operation_id,
  quote_id: quote.id,
  pricing_revision_id: quote.pricing_revision_id,
  normal_maximum_charge_micros: quote.normal_maximum_charge_micros,
  acceptance: rows(quote.customer_spending_quote_acceptances)[0] ?? null,
}));
assert.equal(acceptedQuotes.length, 7, "Every successful creator operation must retain an accepted quote");

const evidence = {
  contract_version: "forge.openai-seven-browser-certification-verification.v1",
  batch_id: batchId,
  state: "closed",
  real_provider_called: false,
  successful_creator_operations: 7,
  zero_charge_failure_exercises: 7,
  aggregate_customer_debit_micros: 70_000,
  accepted_terms: rows(termsResult.data),
  accepted_quotes: acceptedQuotes,
  domain_results: successDomains,
  operations: operations.map((operation) => ({
    route_code: operation.route_code,
    scenario: operation.scenario,
    operation_id: operation.operation_id,
    reservation_id: operation.reservation_id,
    result_id: operation.result_id,
    settlement_id: operation.settlement_id,
    reservation_state: operation.reservation_state,
    customer_charge_micros: operation.customer_charge_micros,
    provider_execution_count: operation.provider_execution_count,
  })),
  evidence_hash: createHash("sha256").update(JSON.stringify(operations)).digest("hex"),
};
const outputPath = path.resolve(getNurseryRoot(), "playwright/.cache/openai-seven-browser-certification-verification.json");
fs.writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
