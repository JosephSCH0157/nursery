import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("../../../supabase/migrations/20261012020000_forge_ai_global_model_preference_and_hammer_authority.sql", import.meta.url), "utf8");
const sqlProof = await readFile(new URL("../../../supabase/tests/forge_ai_global_model_preference_hammer_slice4.sql", import.meta.url), "utf8");
const controls = await readFile(new URL("../src/components/hearth/AiControlsPanel.tsx", import.meta.url), "utf8");
const preference = await readFile(new URL("../src/lib/hearth/ai-model-preference.ts", import.meta.url), "utf8");
const funding = await readFile(new URL("../../../packages/tongs/src/providers/openai-text-customer-funding.ts", import.meta.url), "utf8");
const middleware = await readFile(new URL("../scripts/mw-hammer-prep.ts", import.meta.url), "utf8");
const paidRoute = await readFile(new URL("../server/billing/paid-json-openai-route.ts", import.meta.url), "utf8");
const cleanupHook = await readFile(new URL("../../hammer/src/editor/useHammerWorkspaceShellTranscriptCleanup.ts", import.meta.url), "utf8");
const cleanupApi = await readFile(new URL("../../hammer/src/editor/hammerTranscriptCleanupAssistApi.ts", import.meta.url), "utf8");
const customerQuote = await readFile(new URL("../../../packages/tongs/src/customer-spending-confirmation.ts", import.meta.url), "utf8");

test("1. the global customer preference is provider-neutral intent, not execution authority", () => {
  assert.match(migration, /create table tongs\.ai_model_identities/);
  assert.match(migration, /provider_code text not null/);
  assert.match(migration, /create table tongs\.ai_model_preference_revisions/);
  assert.match(migration, /It grants no operation eligibility, price, funding, rollout, or execution authority/);
  assert.doesNotMatch(preference, /provider_model_id|catalog_revision_id|cost_policy_revision_id|micros/);
  assert.match(controls, />Preferred AI model</);
});

test("2. Hammer eligibility stays operation-specific and financially gated", () => {
  assert.match(preference, /HAMMER_TRANSCRIPT_CLEANUP_OPERATION = "hammer\.transcript_cleanup"/);
  assert.match(migration, /compat\.route_code=p_operation_code/);
  assert.match(migration, /compat\.compatibility_status='generation_verified'/);
  assert.match(migration, /compat\.supporting_cost_coverage='complete'/);
  assert.match(migration, /_published_pricing_revision/);
  assert.match(migration, /pricing\.full_cost_ceiling_micros=cost\.full_cost_ceiling_micros/);
});

test("3. explicit operation override precedes the global preference", () => {
  const overrideLookup = migration.indexOf("select * into override_row from tongs.ai_operation_model_override_revisions");
  const globalLookup = migration.indexOf("select * into global_row from tongs.ai_model_preference_revisions", overrideLookup);
  assert.ok(overrideLookup >= 0 && globalLookup > overrideLookup);
  assert.match(migration, /operation_model_override_unavailable: change or clear the explicit operation override/);
  assert.match(sqlProof, /global preference silently superseded operation override/);
  assert.match(sqlProof, /invalid explicit override silently fell through/);
});

test("4. customers must explicitly clear or replace an operation override", () => {
  assert.match(migration, /override_state text not null check\(override_state in \('specific','clear'\)\)/);
  assert.match(preference, /clear_my_ai_operation_model_override/);
  assert.match(controls, /Use preferred AI model/);
  assert.match(controls, /This explicit override remains authoritative until you change it or select Use preferred AI model\./);
  assert.match(sqlProof, /explicit clear did not restore global preference/);
});

test("5. global and operation revisions have independent optimistic concurrency", () => {
  assert.match(migration, /ai-model-pref:'\|\|uid::text/);
  assert.match(migration, /ai-operation-model:'\|\|uid::text\|\|':'\|\|p_operation_code/);
  assert.match(migration, /p_expected_revision<>prior then raise exception 'preference changed; reload'/);
  assert.match(migration, /p_expected_revision<>prior then raise exception 'operation override changed; reload'/);
  assert.match(migration, /unique\(user_id,operation_code,revision\)/);
});

test("6. AI Controls separates general intent, operation eligibility, and operation charge", () => {
  assert.match(controls, /aria-label="Preferred AI model"/);
  assert.match(controls, /aria-label="Hammer transcript cleanup model override"/);
  assert.match(controls, /model\.creditCharge\} Forge Credits/);
  assert.match(preference, /operationSpecific \? Number\(source\.credit_charge\) : null/);
  assert.doesNotMatch(controls, /Recommended|Best available|Premium/);
});

test("7. customer projections exclude provider and private financial authority", () => {
  assert.match(sqlProof, /provider_model_id\|catalog_revision\|cost_policy\|markup\|micros/);
  assert.match(sqlProof, /"credit_charge": 46/);
  assert.match(sqlProof, /"credit_charge": 129/);
  assert.match(sqlProof, /"credit_charge": 258/);
  assert.doesNotMatch(preference, /provider_model_id|catalog_revision_id|cost_policy_revision_id|markup|micros/);
});

test("8. model-specific Hammer prices share the one 3300-basis-point policy", () => {
  assert.match(migration, /default_markup_basis_points=3300 and overrides_json='\[\]'::jsonb/);
  assert.match(migration, /private_pricing_revision_markup_sources/);
  assert.match(sqlProof, /markup_basis_points=3300/);
  assert.match(sqlProof, /customer_credit_units\*5000=settled_customer_price_micros/);
});

test("9. exact selected model identity still precedes quote fingerprinting", () => {
  const resolveIndex = middleware.indexOf("resolveOpenAiTextModelSelection({");
  const fingerprintIndex = middleware.indexOf("cleanupPaidFingerprintPayload(cleanupRequest, cleanupModelIdentity)");
  const fundingIndex = middleware.indexOf("resolveOrdinaryOpenAiTextFunding({", fingerprintIndex);
  assert.ok(resolveIndex >= 0 && fingerprintIndex > resolveIndex && fundingIndex > fingerprintIndex);
  assert.match(middleware, /customer_selection_key: model\.customerSelectionKey/);
  assert.match(funding, /deriveIdentifiers\(args\.routeCode, args\.userId, args\.operationId, modelIdentity/);
});

test("10. unavailable applicable choice stops before quote, reservation, or provider work", () => {
  const resolverIndex = funding.indexOf('"resolve_openai_text_model_for_funding_quote"');
  const quoteIndex = funding.indexOf('"create_customer_openai_text_quote"');
  assert.ok(resolverIndex >= 0 && quoteIndex > resolverIndex);
  assert.match(migration, /global_model_preference_unavailable: choose an eligible operation override/);
  assert.match(migration, /operation_model_override_unavailable: change or clear the explicit operation override/);
  assert.match(cleanupApi, /HammerTranscriptCleanupAssistError/);
  assert.match(cleanupHook, /openTranscriptCleanupModelSettings\?\.\(\)/);
});

test("11. Sol request compatibility omits temperature without changing Mini", () => {
  assert.match(middleware, /temperature: 0\.2/);
  assert.match(middleware, /model === "gpt-5\.6-sol" \|\| model === "gpt-6\.1-sol"/);
  assert.match(middleware, /delete body\.temperature/);
  assert.match(migration, /'gpt-5\.4-mini-2026-03-17'.*'0\.2'/);
  assert.match(migration, /'gpt-6\.1-sol'.*'omitted'/);
  assert.match(migration, /'gpt-5\.6-sol'.*'omitted'/);
});

test("12. cache-write usage cannot understate supplier cost", () => {
  assert.match(paidRoute, /inputDetails\.cache_write_tokens/);
  assert.match(paidRoute, /usage\.cacheWriteInput > 0/);
  assert.match(paidRoute, /cache_write_input_units: usage\.cacheWriteInput/);
});

test("13. Slice 1 quote confirmation remains a strict customer allowlist", () => {
  assert.match(customerQuote, /Model: \$\{quote\.model_display_name\}/);
  assert.match(customerQuote, /Cost: \$\{quote\.credit_charge/);
  assert.doesNotMatch(customerQuote, /maximum_customer_charge_micros|estimated_customer_charge_micros|provider_cost|wholesale|markup_basis_points/);
});

test("14. Slice 2 operation identity remains part of Hammer cleanup authority", () => {
  assert.match(middleware, /operationId: cleanupRequest\.operation_id/);
  assert.match(middleware, /workspace_id: request\.workspace_id/);
  assert.match(middleware, /workpiece_id: request\.workpiece_id/);
  assert.match(middleware, /route_code: "hammer\.transcript_cleanup"/);
});

test("15. Hammer remains halted with no execution scope or provider discovery", () => {
  assert.match(migration, /'hammer\.transcript_cleanup',3,'halt_new',null/);
  assert.match(sqlProof, /Hammer execution was activated/);
  assert.match(middleware, /code: "paid_execution_halted"/);
  assert.doesNotMatch(preference, /api\.openai\.com|\/models|fetch\(/);
  assert.doesNotMatch(controls, /api\.openai\.com|provider_model_id/);
});
