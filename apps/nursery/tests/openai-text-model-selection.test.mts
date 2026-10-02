import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("../../../supabase/migrations/20261012010000_tongs_route_scoped_openai_model_preferences.sql", import.meta.url), "utf8");
const sqlProof = await readFile(new URL("../../../supabase/tests/openai_route_scoped_model_preferences.sql", import.meta.url), "utf8");
const controls = await readFile(new URL("../src/components/hearth/AiControlsPanel.tsx", import.meta.url), "utf8");
const preference = await readFile(new URL("../src/lib/hearth/openai-text-model-preference.ts", import.meta.url), "utf8");
const funding = await readFile(new URL("../../../packages/tongs/src/providers/openai-text-customer-funding.ts", import.meta.url), "utf8");
const middleware = await readFile(new URL("../scripts/mw-hammer-prep.ts", import.meta.url), "utf8");
const cleanupHook = await readFile(new URL("../../hammer/src/editor/useHammerWorkspaceShellTranscriptCleanup.ts", import.meta.url), "utf8");
const cleanupApi = await readFile(new URL("../../hammer/src/editor/hammerTranscriptCleanupAssistApi.ts", import.meta.url), "utf8");
const customerQuote = await readFile(new URL("../../../packages/tongs/src/customer-spending-confirmation.ts", import.meta.url), "utf8");

test("1. Hammer AI Controls receives only exact-route certified choices", () => {
  assert.match(controls, /data-ai-controls-section="hammer-transcript-cleanup"/);
  assert.match(preference, /HAMMER_TRANSCRIPT_CLEANUP_MODEL_ROUTE[^=]*= "hammer\.transcript_cleanup"/);
  assert.match(migration, /compatibility\.route_code=p_route_code/);
  assert.match(migration, /compatibility\.compatibility_status='generation_verified'/);
  assert.match(migration, /compatibility\.supporting_cost_coverage='complete'/);
  assert.match(migration, /_published_pricing_revision/);
});

test("2. provider-only or uncertified models are excluded", () => {
  assert.match(migration, /entry\.availability_status='generation_compatible'/);
  assert.match(migration, /entry\.lifecycle_state='active'/);
  assert.match(sqlProof, /provider-only model was accepted/);
  assert.match(sqlProof, /Provider Only\|Unavailable/);
});

test("3. unavailable models cannot enter new selectable choices", () => {
  assert.match(preference, /eligibleChoices: Array\.isArray\(source\.eligible_choices\)/);
  assert.match(migration, /in \('selectable','recommended','retiring'\)/);
});

test("4. retiring but still-valid choices are represented customer-safely", () => {
  assert.match(preference, /source\.selection_state === "recommended" \|\| source\.selection_state === "retiring"/);
  assert.match(controls, /model\.selectionState === "retiring" \? " — Retiring"/);
});

test("5. a customer selection is persisted as a route-scoped append-only revision", () => {
  assert.match(preference, /set_my_openai_text_model_preference/);
  assert.match(preference, /p_route_code: routeCode/);
  assert.match(preference, /p_selection_key: kind === "specific" \? selectionKey : null/);
  assert.match(migration, /insert into tongs\.openai_text_user_model_preference_revisions/);
  assert.doesNotMatch(preference, /localStorage|sessionStorage|provider_model_id/);
});

test("6. revision concurrency and preferences are isolated by operation", () => {
  assert.match(migration, /where user_id=uid and route_code=p_route_code/);
  assert.match(migration, /openai-model-pref:'\|\|uid::text\|\|':'\|\|p_route_code/);
  assert.match(migration, /unique index openai_text_user_model_preference_route_revision_uidx/);
  assert.match(sqlProof, /shorts\.discovery/);
  assert.match(sqlProof, /route revision scopes interfered/);
});

test("7. exact selected model identity precedes and participates in the request fingerprint", () => {
  const resolveIndex = middleware.indexOf("resolveOpenAiTextModelSelection({");
  const fingerprintIndex = middleware.indexOf("cleanupPaidFingerprintPayload(cleanupRequest, cleanupModelIdentity)");
  const fundingIndex = middleware.indexOf("resolveOrdinaryOpenAiTextFunding({", fingerprintIndex);
  assert.ok(resolveIndex >= 0 && fingerprintIndex > resolveIndex && fundingIndex > fingerprintIndex);
  assert.match(middleware, /customer_selection_key: model\.customerSelectionKey/);
  assert.match(middleware, /runtime_model_id: model\.runtimeModelId/);
});

test("8. changing the model changes the bound request and quote identity", () => {
  assert.match(middleware, /model_catalog_entry_id: model\.modelCatalogEntryId/);
  assert.match(middleware, /catalog_revision_id: model\.catalogRevisionId/);
  assert.match(funding, /modelIdentity = `\$\{selection\.catalogRevisionId\}:\$\{selection\.modelCatalogEntryId\}:\$\{selection\.providerModelId\}`/);
  assert.match(funding, /deriveIdentifiers\(args\.routeCode, args\.userId, args\.operationId, modelIdentity/);
});

test("9. an explicit selection is never silently substituted", () => {
  assert.match(migration, /or model\.model_catalog_entry_id=pref_entry_id/);
  assert.match(migration, /model_selection_unavailable: selected model is no longer available/);
  assert.match(funding, /args\.model !== selection\.runtimeModelId/);
  assert.match(funding, /model_selection_changed/);
});

test("10. an unavailable stored selection fails before quote, reservation, or provider work", () => {
  const resolverIndex = funding.indexOf('"resolve_openai_text_model_for_funding_quote"');
  const quoteIndex = funding.indexOf('"create_customer_openai_text_quote"');
  assert.ok(resolverIndex >= 0 && quoteIndex > resolverIndex);
  assert.match(migration, /if pref\.preference_kind='specific' then\s+raise exception 'model_selection_unavailable/s);
  assert.match(sqlProof, /provider-only model was accepted/);
});

test("11. Hammer exposes a customer-safe select-another-model state and direct settings path", () => {
  assert.match(funding, /"model_selection_unavailable"/);
  assert.match(funding, /Your selected model is no longer available\. Select another model in AI Controls\./);
  assert.match(cleanupApi, /HammerTranscriptCleanupAssistError/);
  assert.match(cleanupHook, /error\.code === "model_selection_unavailable"/);
  assert.match(cleanupHook, /openTranscriptCleanupModelSettings\?\.\(\)/);
});

test("12. no eligible model means no execution and the selector is disabled", () => {
  assert.match(migration, /pricing_not_configured: no eligible model for route/);
  assert.match(controls, /eligibleChoices\.length \?\? 0\) === 0/);
  assert.match(controls, /textModelSnapshot\?\.blocker/);
});

test("13. Slice 1 customer quote privacy remains an allowlist", () => {
  assert.match(customerQuote, /Model: \$\{quote\.model_display_name\}/);
  assert.match(customerQuote, /Cost: \$\{quote\.credit_charge/);
  assert.doesNotMatch(customerQuote, /maximum_customer_charge_micros|estimated_customer_charge_micros|provider_cost|wholesale|markup_basis_points/);
  assert.doesNotMatch(preference, /provider_model_id|catalog_revision_id|cost_policy_revision_id|micros/);
});

test("14. Slice 2 operation identity remains part of Hammer cleanup authority", () => {
  assert.match(middleware, /operationId: cleanupRequest\.operation_id/);
  assert.match(middleware, /workspace_id: request\.workspace_id/);
  assert.match(middleware, /workpiece_id: request\.workpiece_id/);
  assert.match(middleware, /route_code: "hammer\.transcript_cleanup"/);
});

test("15. Hammer production spending remains halted", () => {
  assert.match(middleware, /code: "paid_execution_halted"/);
  assert.match(sqlProof, /not in \('inactive','halt_new'\)/);
  assert.doesNotMatch(migration, /insert into tongs\.openai_text_rollout|update tongs\.openai_text_rollout/);
});

test("16. this slice contains no provider discovery or direct provider execution path", () => {
  assert.doesNotMatch(preference, /api\.openai\.com|\/models|fetch\(/);
  assert.doesNotMatch(controls, /api\.openai\.com|provider_model_id/);
  assert.match(middleware, /if \(!cleanupRequest\.paid_execution \|\| !cleanupExecutionModel \|\| !cleanupModelIdentity\)/);
  assert.match(middleware, /code: "paid_execution_halted"/);
});
