import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("../../../supabase/migrations/20260929120000_tongs_openai_text_model_catalog.sql", import.meta.url), "utf8");
const evidenceMigration = await readFile(new URL("../../../supabase/migrations/20260930120000_tongs_openai_evidence_and_support_proposal.sql", import.meta.url), "utf8");
const controls = await readFile(new URL("../src/components/hearth/AiControlsPanel.tsx", import.meta.url), "utf8");
const ownerConsole = await readFile(new URL("../src/components/OwnerBillingConsole.tsx", import.meta.url), "utf8");
const preference = await readFile(new URL("../src/lib/hearth/openai-text-model-preference.ts", import.meta.url), "utf8");
const funding = await readFile(new URL("../../../packages/tongs/src/providers/openai-text-customer-funding.ts", import.meta.url), "utf8");
const customerQuote = await readFile(new URL("../../../packages/tongs/src/customer-spending-confirmation.ts", import.meta.url), "utf8");
const reconciliation = await readFile(new URL("../../../scripts/lib/openai-organization-reconciliation.mjs", import.meta.url), "utf8");
const modelChecker = await readFile(new URL("../../../scripts/verify-openai-model-availability.mjs", import.meta.url), "utf8");
const evidenceWorkflow = await readFile(new URL("../../../.github/workflows/openai-billing-evidence.yml", import.meta.url), "utf8");

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
  const resolveIndex = funding.indexOf('"resolve_openai_text_model_for_funding_quote"');
  const quoteIndex = funding.indexOf('"create_customer_openai_text_quote"');
  assert.ok(resolveIndex >= 0 && quoteIndex > resolveIndex);
  assert.match(funding, /catalogRevisionId.*modelCatalogEntryId.*providerModelId/s);
  assert.match(funding, /p_model: selection\.runtimeModelId/);
});

test("customer quote shows model and Forge Credits without dollar or internal economics", () => {
  assert.match(customerQuote, /Model: \$\{quote\.model_display_name\}/);
  assert.match(customerQuote, /Cost: \$\{quote\.credit_charge/);
  assert.match(customerQuote, /Funding: \$\{quote\.funding_label\}/);
  assert.doesNotMatch(customerQuote, /maximum_customer_charge_micros|estimated_customer_charge_micros|provider_cost|wholesale|markup_basis_points/);
});

test("authoritative reconciliation uses the tongs profile and a replacement delta", () => {
  assert.match(reconciliation, /"content-profile": "tongs"/);
  assert.match(migration, /adjustment_micros/);
  assert.match(migration, /p_confirmed_amount_micros-e\.amount_micros/);
  assert.match(migration, /source_key text not null unique/);
});

test("project model checks are append-only, sanitized, private, and distinct from generation compatibility", () => {
  assert.match(evidenceMigration, /openai_text_model_visibility_observations/);
  assert.match(evidenceMigration, /_require_pricing_service_role/);
  assert.match(evidenceMigration, /unsanitized model evidence rejected/);
  assert.match(evidenceMigration, /Visibility does not prove API parameter, fixture, or generation compatibility/);
  assert.match(ownerConsole, /Model visibility is not generation compatibility/);
  assert.match(ownerConsole, /Project visibility:/);
});

test("support proposal stays draft and leaves persistence unresolved", () => {
  assert.match(evidenceMigration, /'hosting',2225::bigint,'estimated_allocation'/);
  assert.match(evidenceMigration, /'storage',123::bigint,'estimated_allocation'/);
  assert.match(evidenceMigration, /'egress',219::bigint,'estimated_allocation'/);
  assert.match(evidenceMigration, /'persistence',null::bigint,'unresolved'/);
  assert.match(evidenceMigration, /No catalog, route, price, or paid-execution state is activated/);
});

test("evidence credentials are isolated from ordinary paid execution names", () => {
  assert.match(modelChecker, /OPENAI_MODEL_EVIDENCE_API_KEY/);
  assert.doesNotMatch(modelChecker, /OPENAI_TEXT_API_KEY|OPENAI_API_KEY/);
  assert.match(evidenceWorkflow, /environment: openai-billing-evidence/);
  assert.match(evidenceWorkflow, /OPENAI_RECONCILIATION_ADMIN_KEY/);
  assert.doesNotMatch(evidenceWorkflow, /OPENAI_TEXT_API_KEY|OPENAI_API_KEY/);
});
