import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("../../../supabase/migrations/20260929120000_tongs_openai_text_model_catalog.sql", import.meta.url), "utf8");
const controls = await readFile(new URL("../src/components/hearth/AiControlsPanel.tsx", import.meta.url), "utf8");
const preference = await readFile(new URL("../src/lib/hearth/openai-text-model-preference.ts", import.meta.url), "utf8");
const funding = await readFile(new URL("../../../packages/tongs/src/providers/openai-text-customer-funding.ts", import.meta.url), "utf8");
const customerQuote = await readFile(new URL("../../../packages/tongs/src/customer-spending-confirmation.ts", import.meta.url), "utf8");
const reconciliation = await readFile(new URL("../../../scripts/lib/openai-organization-reconciliation.mjs", import.meta.url), "utf8");

test("model preference is Supabase SSOT and only eligible choices enter the selector", () => {
  assert.match(migration, /openai_text_user_model_preference_revisions/);
  assert.match(preference, /set_my_openai_text_model_preference/);
  assert.doesNotMatch(preference, /localStorage|sessionStorage/);
  assert.match(controls, /Best available/);
  assert.match(controls, /eligibleChoices \?\? \[\]/);
  assert.doesNotMatch(controls.match(/<select[\s\S]*?<\/select>/)?.[0] ?? "", /candidateStatus\.map/);
});

test("draft and deprecated catalog records cannot become executable", () => {
  assert.match(migration, /'draft','Operator-reviewed ranking/);
  assert.match(migration, /'gpt-5\.3-chat-latest'[\s\S]*?'deprecated'/);
  assert.match(migration, /availability_status='generation_compatible'/);
  assert.match(migration, /supporting_cost_coverage='complete'/);
  assert.match(migration, /cost_coverage='complete'/);
  assert.match(migration, /pricing_not_configured: no active model catalog/);
});

test("server resolves an exact model before quote creation and model identity changes quote identity", () => {
  const resolveIndex = funding.indexOf('"resolve_openai_text_model_for_quote"');
  const quoteIndex = funding.indexOf('"create_customer_openai_text_quote"');
  assert.ok(resolveIndex >= 0 && quoteIndex > resolveIndex);
  assert.match(funding, /catalogRevisionId.*modelCatalogEntryId.*providerModelId/s);
  assert.match(funding, /p_model: selection\.runtimeModelId/);
});

test("customer quote shows model, estimate, and maximum without wholesale or markup", () => {
  assert.match(customerQuote, /Model: \$\{quote\.model_display_name\}/);
  assert.match(customerQuote, /Conservative estimate:/);
  assert.match(customerQuote, /Maximum charge:/);
  assert.doesNotMatch(customerQuote, /provider_cost|wholesale|markup_basis_points/);
});

test("authoritative reconciliation uses the tongs profile and a replacement delta", () => {
  assert.match(reconciliation, /"content-profile": "tongs"/);
  assert.match(migration, /adjustment_micros/);
  assert.match(migration, /p_confirmed_amount_micros-e\.amount_micros/);
  assert.match(migration, /source_key text not null unique/);
});
