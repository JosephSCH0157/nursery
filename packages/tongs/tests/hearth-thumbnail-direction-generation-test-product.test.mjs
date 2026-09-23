import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(new URL(
  "../../../supabase/migrations/20261011620000_hearth_thumbnail_direction_generation_test_product.sql",
  import.meta.url,
), "utf8");
const routeContracts = readFileSync(new URL("../src/providers/openai-text-route-contracts.ts", import.meta.url), "utf8");
const boundary = readFileSync(new URL("../src/providers/openai-text-paid-boundary.ts", import.meta.url), "utf8");
const serverProduct = readFileSync(new URL(
  "../../../apps/nursery/server/hearth/hearth-paid-thumbnail-direction-generation.ts",
  import.meta.url,
), "utf8");
const outputContract = readFileSync(new URL(
  "../../../apps/hearth/src/lib/hearth-thumbnail-direction-contract.ts",
  import.meta.url,
), "utf8");
const handler = readFileSync(new URL(
  "../../../apps/nursery/server/hearth/create-hearth-ai-handler.ts",
  import.meta.url,
), "utf8");
const repository = readFileSync(new URL(
  "../../../apps/hearth/src/lib/hearth-production-repo.ts",
  import.meta.url,
), "utf8");
const canonicalPersistence = readFileSync(new URL(
  "../../../apps/hearth/src/lib/hearth-paid-thumbnail-direction-persistence.ts",
  import.meta.url,
), "utf8");

test("Thumbnail Directions is a distinct bounded paid text route", () => {
  assert.match(boundary, /"hearth\.thumbnail_direction_generation"/);
  assert.match(routeContracts, /"hearth\.thumbnail_direction_generation"[\s\S]+maximumInputUnits:\s*16000[\s\S]+maximumOutputUnits:\s*2048[\s\S]+maximumAttempts:\s*1/);
  assert.match(serverProduct, /forge\.hearth\.thumbnail-direction-generation\.v1/);
  assert.match(serverProduct, /HEARTH_THUMBNAIL_DIRECTION_OUTPUT_CONTRACT/);
  assert.match(outputContract, /thumbnail_directions_three\.v1/);
  assert.match(serverProduct, /image_provider_calls:\s*0/);
  assert.match(handler, /routeCode:\s*HEARTH_THUMBNAIL_DIRECTION_ROUTE/);
  assert.match(handler, /executePaidJsonOpenAiRoute/);
  assert.doesNotMatch(serverProduct, /openai\/images|runway|imageApiKey/i);
});
test("Thumbnail Directions has exact two-credit Test economics and no Live scope", () => {
  assert.match(migration, /16000,2048,1,5658,0,5658,'complete','active'/);
  assert.match(migration, /actor,7526,2474,10000/);
  assert.match(migration, /customer_credit_units=2/);
  assert.match(migration, /maximum_customer_charge_micros[\s\S]+10000,5658,1/);
  assert.match(migration, /'test','18000000-0000-4000-8000-000000000006'[\s\S]+'live','18000000-0000-4000-8000-000000000007'/);
  assert.match(migration, /Live Thumbnail Directions scope must remain absent/);
  assert.doesNotMatch(migration, /select[\s\S]{0,250}'live','hearth\.thumbnail_direction_generation'[\s\S]{0,250}'active'/i);
});

test("result and validation evidence are private, immutable, and replay-safe", () => {
  assert.match(migration, /create table tongs\.hearth_thumbnail_direction_generation_results/);
  assert.match(migration, /force row level security/);
  assert.match(migration, /revoke all on tongs\.hearth_thumbnail_direction_generation_results from public,anon,authenticated,service_role/);
  assert.match(migration, /grant select on tongs\.hearth_thumbnail_direction_generation_results to service_role/);
  assert.match(migration, /create or replace function tongs\.record_openai_text_validation_failure_evidence/);
  assert.match(migration, /'hearth\.framing_pack_generation','visual\.unified_plan','hearth\.thumbnail_direction_generation'/);
  assert.match(migration, /thumbnail_directions_three\.v1/);
  assert.match(migration, /Hearth Thumbnail Directions result replay conflict/);
});

test("canonical persistence writes a true deterministic three-member V3 set", () => {
  assert.match(repository, /buildPaidThumbnailDirectionMutation/);
  assert.match(canonicalPersistence, /deterministicUuid\("paid-thumbnail-direction-set", args\.identity\.resultId\)/);
  assert.match(canonicalPersistence, /deterministicUuid\("paid-thumbnail-direction-strategy", args\.identity\.resultId\)/);
  assert.match(canonicalPersistence, /validated\.output\.directions\.map/);
  assert.match(canonicalPersistence, /validateConceptGenerationSet\([\s\S]+,\s*3/);
  assert.match(canonicalPersistence, /prompt_schema_version: "thumbnail_directions_three\.v1"/);
  assert.match(canonicalPersistence, /concept_revision_ids: concepts\.map/);
});

