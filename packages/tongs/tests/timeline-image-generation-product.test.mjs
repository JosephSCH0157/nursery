import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration=readFileSync(new URL("../../../supabase/migrations/20261011670000_hearth_timeline_image_generation_test_product.sql",import.meta.url),"utf8");
const service=readFileSync(new URL("../src/workpiece-commit-api.ts",import.meta.url),"utf8");
const ui=readFileSync(new URL("../../../apps/hearth/src/hooks/visuals/useImageMapCandidateActions.ts",import.meta.url),"utf8");

test("Timeline Image authority is one bounded Test n=2 product and Live remains zero",()=>{
  assert.match(migration,/hearth\.timeline_image_generation/);
  assert.match(migration,/334900,0,334900/);
  assert.match(migration,/customer_credit_units[\s\S]*90/);
  assert.match(migration,/445417,4583,450000/);
  assert.match(migration,/maximum_concurrency[\s\S]*334900[\s\S]*86400,1/);
  assert.match(migration,/financial_environment='live'[\s\S]*status='active'/);
  assert.match(migration,/live_aggregate_micros'[\s\S]*,0/);
});

test("provider execution binds one exact body, one attempt, two retained outputs, and recovery",()=>{
  assert.match(service,/imageCount:\s*TIMELINE_IMAGE_GENERATION_CONTRACT\.imageCount/);
  assert.match(service,/generateImages\(\{[\s\S]*imageCount:\s*2/);
  assert.match(service,/images\.length !== 2/);
  assert.match(service,/stage_timeline_image_generation_result/);
  assert.match(service,/read_staged_timeline_image_generation_result/);
  assert.match(service,/recoverCanonical:/);
  assert.doesNotMatch(service.slice(service.indexOf("private async generateTimelineImageCandidatesPaid"),service.indexOf("async saveWorkpieceImageMap")),/ILLUSTRATIVE_RETRY/);
});

test("timeline Generate no longer saves source_type before quote",()=>{
  const start=ui.indexOf("const onGenerateImageMapCandidates");
  const end=ui.indexOf("const onUploadImageMapGenerationReference",start);
  const flow=ui.slice(start,end);
  assert.doesNotMatch(flow,/persistImageMapEntries/);
  assert.match(flow,/requestCustomerSpendingAcceptance/);
  assert.match(flow,/spendingAcceptance/);
});

test("restricted immutable parent, children, and delivery evidence are service-only",()=>{
  assert.match(migration,/hearth_timeline_image_generation_results enable row level security/);
  assert.match(migration,/hearth_timeline_image_generation_results force row level security/);
  assert.match(migration,/revoke all on tongs\.hearth_timeline_image_generation_results[\s\S]*authenticated/);
  assert.match(migration,/timeline_image_results_immutable/);
  assert.match(migration,/timeline_image_outputs_immutable/);
  assert.match(migration,/timeline_image_receipts_immutable/);
});
