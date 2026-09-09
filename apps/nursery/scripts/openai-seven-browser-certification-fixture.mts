import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { getNurseryRoot, loadNurseryEnv } from "../playwright/helpers/hearth-phase4-fixtures.ts";
import { readFixtureManifestForEnvironment } from "./browser-fixture-authority.mts";

type Row = Record<string, unknown>;
const ROUTES = [
  "hearth.research_synthesis", "visual.unified_plan", "visual.narrative_interpretation",
  "motion.broll_interpretation", "hammer.transcript_cleanup", "shorts.discovery", "quench.metadata",
] as const;

function required(env: Record<string, string>, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}
function sha(value: string): string { return createHash("sha256").update(value).digest("hex"); }
function uuidFor(namespace: string): string {
  const value = sha(namespace).slice(0, 32).split(""); value[12] = "4"; value[16] = "8";
  const hex = value.join(""); return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
async function must<T extends { data: unknown; error: { message: string } | null }>(promise: PromiseLike<T>, label: string): Promise<T["data"]> {
  const result = await promise; if (result.error) throw new Error(`${label}: ${result.error.message}`); return result.data;
}

const env = loadNurseryEnv();
const supabaseUrl = required(env, "TONGS_SUPABASE_URL");
if (!/^http:\/\/(127\.0\.0\.1|localhost):55321\/?$/i.test(supabaseUrl)) throw new Error("Browser certification is pinned to the isolated 55321 Supabase API");
if (env.OPENAI_TEXT_API_KEY || env.OPENAI_API_KEY) throw new Error("OpenAI execution keys are forbidden in the browser-certification environment");
const serviceKey = required(env, "TONGS_SERVICE_ROLE_KEY");
const manifest = readFixtureManifestForEnvironment(env);
if (!manifest || manifest.project_ref !== "local") throw new Error("Provision the isolated browser fixture before preparing certification");
const service = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const tongs = service.schema("tongs") as any;
const dbContainer = env.FORGE_OPENAI_BROWSER_CERTIFICATION_DB_CONTAINER?.trim() || "supabase_db_forge-seven-adapter-isolated";
if (dbContainer !== "supabase_db_forge-seven-adapter-isolated") throw new Error("Unexpected browser-certification database container");
const grant = spawnSync("docker", ["exec", "-i", dbContainer, "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"], {
  input: `grant insert on tongs.openai_text_model_catalog_revisions,tongs.openai_text_model_catalog_entries,tongs.openai_text_model_route_compatibility,tongs.openai_text_cost_policy_revisions,tongs.private_pricing_policies,tongs.private_pricing_revisions,tongs.private_pricing_publications to service_role;`,
  encoding: "utf8",
});
if (grant.status !== 0) throw new Error(`Unable to prepare isolated fixture grants: ${grant.stderr || grant.stdout}`);
const runId = randomUUID();
const operatorId = uuidFor(`forge.openai-browser-cert.operator:${runId}`);
const operatorEmail = `openai-browser-operator-${runId}@example.invalid`;
const createdOperator = await service.auth.admin.createUser({ id: operatorId, email: operatorEmail, password: `Synthetic-${randomUUID()}!aA1`, email_confirm: true, user_metadata: { fixture_namespace: "forge.openai-text-browser-certification.v1" } });
if (createdOperator.error) throw createdOperator.error;
await must(tongs.rpc("set_platform_operator", { p_user_id: operatorId, p_enabled: true, p_reason: "Isolated seven-route browser certification" }), "platform operator");

const depositId = randomUUID();
await must(tongs.rpc("record_customer_deposit", {
  p_deposit_id: depositId,
  p_user_id: manifest.user_id,
  p_stripe_event_id: `evt_test_browser_${runId.replaceAll("-", "")}`,
  p_stripe_session_id: `cs_test_browser_${runId.replaceAll("-", "")}`,
  p_stripe_payment_intent_id: `pi_test_browser_${runId.replaceAll("-", "")}`,
  p_livemode: false,
  p_pack_id: "synthetic_browser_certification",
  p_gross_amount_micros: 1_000_000,
  p_currency: "USD",
  p_credit_units: 100,
  p_received_at: new Date().toISOString(),
  p_metadata_json: { synthetic_test: true, browser_certification_run_id: runId, real_payment: false },
}), "synthetic Test deposit");
// Hearth still renders its pre-coordinator credit badge from tongs.ai_credits.
// Mirror the same isolated Test fixture value only to keep the real creator
// controls operable; settlement below remains exclusively deposit-backed.
await must(tongs.from("ai_credits").upsert({
  user_id: manifest.user_id,
  token_balance: 100,
  updated_at: new Date().toISOString(),
}), "isolated legacy credit display mirror");
await must(tongs.from("account_balances").upsert({
  user_id: manifest.user_id,
  plan_item_id: "creator",
  plan_status: "active",
  plan_entitled: true,
  updated_at: new Date().toISOString(),
}, { onConflict: "user_id" }), "isolated creator entitlement");

const latestCatalog = await must(tongs.from("openai_text_model_catalog_revisions").select("revision").order("revision", { ascending: false }).limit(1), "catalog revision");
const catalogRevision = Number((latestCatalog as Row[])[0]?.revision ?? 0) + 1;
const catalogId = randomUUID();
await must(tongs.from("openai_text_model_catalog_revisions").insert({
  id: catalogId, revision: catalogRevision, lifecycle_state: "active",
  quality_method: "Synthetic Test-only ranking for browser certification; never a Live eligibility statement.",
  source_checked_at: new Date().toISOString(), content_hash: sha(`browser-catalog:${runId}`), actor_id: operatorId,
}), "Test catalog");

const rateRows = await must(tongs.from("openai_text_provider_rate_revisions").select("id,runtime_model_alias,provider_model_id").in("runtime_model_alias", ["gpt-5.3", "gpt-5-mini"]), "rate rows") as Row[];
const rates = new Map(rateRows.map((row) => [String(row.runtime_model_alias), row]));
for (const model of ["gpt-5.3", "gpt-5-mini"]) if (!rates.has(model)) throw new Error(`Missing synthetic fixture rate basis for ${model}`);
const entryIds: Record<string, string> = { "gpt-5.3": randomUUID(), "gpt-5-mini": randomUUID() };
await must(tongs.from("openai_text_model_catalog_entries").insert([
  { id: entryIds["gpt-5.3"], catalog_revision_id: catalogId, runtime_model_id: "gpt-5.3", provider_model_id: String(rates.get("gpt-5.3")!.provider_model_id), display_name: "GPT-5.3 synthetic Test fixture", tradeoff_summary: "Legacy-shaped fixture for bounded Test validation; no real generation is permitted.", quality_rank: 20, quality_basis: "Synthetic route-contract fixture only.", supported_apis: ["chat_completions"], availability_status: "generation_compatible", availability_evidence: { synthetic_test: true, real_generation: false }, lifecycle_state: "active", rate_revision_id: rates.get("gpt-5.3")!.id },
  { id: entryIds["gpt-5-mini"], catalog_revision_id: catalogId, runtime_model_id: "gpt-5-mini", provider_model_id: String(rates.get("gpt-5-mini")!.provider_model_id), display_name: "GPT-5 Mini synthetic Test fixture", tradeoff_summary: "Structured-output fixture for bounded Test validation; no real generation is permitted.", quality_rank: 10, quality_basis: "Synthetic route-contract fixture only.", supported_apis: ["responses", "structured_outputs"], availability_status: "generation_compatible", availability_evidence: { synthetic_test: true, real_generation: false }, lifecycle_state: "active", rate_revision_id: rates.get("gpt-5-mini")!.id },
]), "Test catalog entries");

const pricingRevisionIds: Record<string, string> = {};
const terms: Row[] = [];
for (const route of ROUTES) {
  const visual = route.startsWith("visual.") || route === "motion.broll_interpretation";
  const model = visual ? "gpt-5-mini" : "gpt-5.3";
  const direct = visual ? 3_000 : 5_000;
  const support = visual ? 1_500 : 2_000;
  const full = direct + support;
  const price = 10_000;
  const priorPolicies = await must(tongs.from("openai_text_cost_policy_revisions").select("revision").eq("route_code", route).order("revision", { ascending: false }).limit(1), `cost policy revision ${route}`) as Row[];
  const costRevision = Number(priorPolicies[0]?.revision ?? 0) + 1;
  const costId = randomUUID();
  await must(tongs.from("openai_text_cost_policy_revisions").insert({
    id: costId, route_code: route, revision: costRevision, policy_code: `browser-test:${runId}:${route}`,
    attempt_plan: [{ attempt: 1, rate_revision_id: rates.get(model)!.id, input_max: 65_536, output_max: visual ? 768 : 1_024 }],
    maximum_input_units: 65_536, maximum_output_units: visual ? 768 : 1_024, maximum_attempts: 1,
    direct_provider_ceiling_micros: direct, supporting_cost_ceiling_micros: support,
    full_cost_ceiling_micros: full, cost_coverage: "complete", lifecycle_state: "pilot_candidate",
    notes: "Synthetic Test-only browser certification. No Live price or provider authority.",
  }), `Test cost policy ${route}`);
  const policyId = randomUUID();
  const pricingId = randomUUID(); pricingRevisionIds[route] = pricingId;
  const sku = `openai-text:${route}:${model}:${costId}`.toLowerCase();
  await must(tongs.from("private_pricing_policies").insert({ id: policyId, policy_code: `browser-test:${runId}:${route}`, scope_kind: "sku", provider: "openai", sku, created_by: operatorId }), `Test pricing policy ${route}`);
  await must(tongs.from("private_pricing_revisions").insert({
    id: pricingId, policy_id: policyId, revision: 1, lifecycle_state: "review_ready", currency: "USD",
    markup_basis_points: 3300, full_cost_ceiling_micros: full, failure_cost_ceiling_micros: direct,
    customer_price_ceiling_micros: price, billable_failure_ceiling_micros: 0, customer_credit_units: 1,
    billable_failure_classes: [], free_failure_classes: ["forge_failure", "provider_failure", "forge_validation_failure", "persistence_failure", "unknown_fault"],
    included_quantity: { maximum_input_units: 65_536, maximum_output_units: visual ? 768 : 1_024, maximum_attempts: 1 },
    retention_policy: { kind: "plan_funded", synthetic_test: true },
    change_reason: "Synthetic Test-only browser certification", content_hash: sha(`browser-pricing:${runId}:${route}`), actor_id: operatorId,
  }), `Test pricing revision ${route}`);
  await must(tongs.from("private_pricing_publications").insert({ id: randomUUID(), policy_id: policyId, pricing_revision_id: pricingId, publication_revision: 1, action: "published", reason: "Isolated Test-only publication", actor_id: operatorId }), `Test pricing publication ${route}`);
  await must(tongs.from("openai_text_model_route_compatibility").insert({
    id: randomUUID(), catalog_entry_id: entryIds[model], route_code: route, compatibility_status: "generation_verified",
    maximum_input_tokens: 65_536, maximum_output_tokens: visual ? 768 : 1_024, maximum_attempts: 1,
    supporting_cost_coverage: "complete", cost_policy_revision_id: costId,
    evidence_json: { synthetic_test: true, browser_certification_run_id: runId, real_generation: false },
  }), `Test compatibility ${route}`);
  terms.push({
    route_code: route, model, maximum_input_units: 65_536, maximum_output_units: visual ? 768 : 1_024, maximum_attempts: 1,
    input_micros_per_million_tokens: visual ? 250_000 : 1_750_000,
    output_micros_per_million_tokens: visual ? 2_000_000 : 14_000_000,
    direct_provider_ceiling_micros: direct, supporting_cost_ceiling_micros: support,
    failure_exposure_ceiling_micros: direct, markup_basis_points: 3300,
    customer_price_ceiling_micros: price, customer_credit_units: 1, rate_evidence_status: "synthetic_test",
    supporting_cost_policy: { scope: "validation_and_tongs_persistence_only", search_allowed: false, external_enrichment_allowed: false, extraction_allowed: false, transcription_allowed: false, synthetic_test: true },
  });
}

const batchId = randomUUID();
const invocationToken = `browser-cert-${randomUUID()}-${randomUUID()}`;
await must(tongs.rpc("open_openai_text_test_certification", {
  p_batch_id: batchId, p_actor_id: operatorId, p_user_id: manifest.user_id, p_workspace_id: manifest.workspace_id,
  p_deposit_id: depositId, p_invocation_token_hash: sha(invocationToken),
  p_expires_at: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(), p_terms: terms,
  p_reason: "Actual seven-route creator browser certification; simulated external providers only",
}), "browser certification batch");

const output = {
  contract_version: "forge.openai-text-browser-certification-fixture.v1",
  run_id: runId, batch_id: batchId, operator_id: operatorId, user_id: manifest.user_id,
  workspace_id: manifest.workspace_id, deposit_id: depositId, pricing_revision_ids: pricingRevisionIds,
  real_provider_authorized: false, synthetic_test: true, created_at: new Date().toISOString(),
};
const outputPath = path.resolve(getNurseryRoot(), "playwright/.cache/openai-seven-browser-certification-runtime.json");
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify({ ...output, invocation_token: invocationToken }, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
