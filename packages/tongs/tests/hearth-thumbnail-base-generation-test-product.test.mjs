import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(new URL(
  "../../../supabase/migrations/20261011630000_hearth_thumbnail_base_generation_test_product.sql",
  import.meta.url,
), "utf8");
const routeContracts = readFileSync(new URL("../src/providers/openai-text-route-contracts.ts", import.meta.url), "utf8");
const boundary = readFileSync(new URL("../src/providers/openai-text-paid-boundary.ts", import.meta.url), "utf8");
const imageProvider = readFileSync(new URL("../src/providers/image-provider.ts", import.meta.url), "utf8");
const service = readFileSync(new URL("../src/workpiece-commit-api.ts", import.meta.url), "utf8");
const client = readFileSync(new URL("../../../apps/hearth/src/lib/hearth-thumbnail-v3-api.ts", import.meta.url), "utf8");
const promptAuthority = readFileSync(new URL("../../../apps/hearth/src/lib/episode-package-v3.ts", import.meta.url), "utf8");
const compositor = readFileSync(new URL("../src/thumbnail-composite.ts", import.meta.url), "utf8");
const quoteRepair = readFileSync(new URL(
  "../../../supabase/migrations/20261011640000_thumbnail_base_quote_model_resolution_repair.sql",
  import.meta.url,
), "utf8");
const quoteCreationRepair = readFileSync(new URL(
  "../../../supabase/migrations/20261011650000_thumbnail_base_quote_creation_sku_repair.sql",
  import.meta.url,
), "utf8");

test("Thumbnail Base is one exact no-reference image generation", () => {
  assert.match(boundary, /"hearth\.thumbnail_base_generation"/);
  assert.match(routeContracts, /"hearth\.thumbnail_base_generation"[\s\S]+maximumInputUnits:\s*16384[\s\S]+maximumOutputUnits:\s*1[\s\S]+maximumAttempts:\s*1/);
  assert.match(imageProvider, /endpoint:\s*"\/v1\/images\/generations"/);
  assert.match(imageProvider, /model:\s*"gpt-image-2-2026-04-21"/);
  assert.match(imageProvider, /size:\s*"1536x1024"/);
  assert.match(imageProvider, /quality:\s*"high"/);
  assert.match(imageProvider, /output_format:\s*"png"/);
  assert.match(service, /buildOpenAiImageGenerationRequestBody/);
  assert.match(service, /preserveBodyPropertyOrder:\s*true/);
  assert.match(service, /reference_not_certified/);
});

test("Thumbnail Base has exact 45-credit bounded Test economics and no Live scope", () => {
  assert.match(migration, /16384,1,1,167450,0,167450,'complete','active'/);
  assert.match(migration, /actor,222709,2291,225000/);
  assert.match(migration, /customer_credit_units=45/);
  assert.match(migration, /where direction\.financial_environment='test'/);
  assert.match(migration, /Live Thumbnail Base scope must remain absent/);
  assert.match(migration, /'test','19630000-0000-4000-8000-000000000010'/);
  assert.match(migration, /'live','19630000-0000-4000-8000-000000000011'/);
  assert.doesNotMatch(migration, /select[\s\S]{0,250}'live','hearth\.thumbnail_base_generation'[\s\S]{0,250}'active'/i);
});

test("prompt, crop, and compositor authority keep title text out of provider base art", () => {
  assert.match(promptAuthority, /hearth-thumbnail-base-prompt-v2/);
  assert.match(promptAuthority, /sanitizeBaseArtProviderSettings/);
  assert.match(promptAuthority, /later Forge typography/);
  assert.match(compositor, /forge-thumbnail-base-center-crop-v1/);
  assert.match(compositor, /fit:\s*"cover"/);
  assert.match(compositor, /position:\s*"centre"/);
  assert.doesNotMatch(compositor, /slice\(0,\s*4\)/);
});

test("Thumbnail Base preflight loads the compositor outside Vite's request module runner", () => {
  assert.match(service, /loadNativeThumbnailCompositeModule/);
  assert.match(service, /new Function\([\s\S]+return import\(specifier\)/);
  assert.doesNotMatch(service, /await import\("\.\/thumbnail-composite\.js"\)/);
});

test("Thumbnail Base model resolution uses its existing image SKU without changing authority", () => {
  assert.match(quoteRepair, /hearth\.thumbnail_base_generation[\s\S]+openai-image:/);
  assert.match(quoteRepair, /all other routes retain openai-text SKU resolution/i);
  assert.match(quoteRepair, /customer_credit_units = 45/);
  assert.match(quoteRepair, /full_cost_ceiling_micros = 167450/);
  assert.match(quoteRepair, /Live Thumbnail Base scope must remain absent/);
  assert.doesNotMatch(quoteRepair, /insert into tongs\.customer_paid_execution_scope_authorizations/i);
  assert.doesNotMatch(quoteRepair, /insert into tongs\.private_pricing_revisions/i);
});

test("Thumbnail Base quote creation retains the evolved shared contract and changes only its SKU family", () => {
  assert.match(quoteCreationRepair, /pg_get_functiondef/);
  assert.match(quoteCreationRepair, /hearth\.thumbnail_base_generation/);
  assert.match(quoteCreationRepair, /openai-image:/);
  assert.match(quoteCreationRepair, /customer_credit_units/);
  assert.match(quoteCreationRepair, /funding_environment/);
  assert.match(quoteCreationRepair, /_openai_rollout_for_funding/);
  assert.match(quoteCreationRepair, /_is_customer_openai_paid_route/);
  assert.doesNotMatch(quoteCreationRepair, /insert into tongs\.private_pricing_revisions/i);
  assert.doesNotMatch(quoteCreationRepair, /insert into tongs\.customer_paid_execution_scope_authorizations/i);
});

test("result evidence is private, immutable, replay-safe, and actually written", () => {
  assert.match(migration, /create table tongs\.hearth_thumbnail_base_generation_results/);
  assert.match(migration, /force row level security/);
  assert.match(migration, /revoke all on tongs\.hearth_thumbnail_base_generation_results from public,anon,authenticated,service_role/);
  assert.match(migration, /grant select on tongs\.hearth_thumbnail_base_generation_results to service_role/);
  assert.match(migration, /create function tongs\.record_hearth_thumbnail_base_generation_result/);
  assert.match(migration, /Thumbnail Base result replay conflict/);
  assert.match(service, /record_hearth_thumbnail_base_generation_result/);
  assert.match(service, /generated_bytes_base64:\s*image\.bytesBase64/);
});

test("UI prepares a deterministic operation and stops at shared customer confirmation", () => {
  assert.match(client, /deterministicUuid\("hearth-thumbnail-base-operation"/);
  assert.match(client, /canonicalSerialize\(\{/);
  assert.match(client, /readCustomerSpendingQuote/);
  assert.match(client, /requestCustomerSpendingAcceptance/);
  assert.match(client, /spending_acceptance/);
  assert.doesNotMatch(client, /Math\.random\(\)/);
});
