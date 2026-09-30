import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration=readFileSync(new URL("../../../supabase/migrations/20260803170000_tongs_broll_v2_authority.sql",import.meta.url),"utf8");
const paidMediaQuoteMigration=readFileSync(new URL("../../../supabase/migrations/20260808132000_tongs_paid_media_authorization_quote.sql",import.meta.url),"utf8");
const paidMediaContractMigration=readFileSync(new URL("../../../supabase/migrations/20260811150000_tongs_allow_paid_media_quote_contract.sql",import.meta.url),"utf8");
const paidVideoShapeMigration=readFileSync(new URL("../../../supabase/migrations/20260811160000_tongs_fix_paid_video_quote_shape.sql",import.meta.url),"utf8");
const paidVideoOperationMigration=readFileSync(new URL("../../../supabase/migrations/20260811170000_tongs_paid_media_video_operation_identity.sql",import.meta.url),"utf8");
const paidVideoUsageMigration=readFileSync(new URL("../../../supabase/migrations/20260811180000_tongs_allow_paid_video_actual_usage_component.sql",import.meta.url),"utf8");
const runwayPricingMigration=readFileSync(new URL("../../../supabase/migrations/20260808131000_tongs_runway_gen45_pricing.sql",import.meta.url),"utf8");
const zeroBeatMigration=readFileSync(new URL("../../../supabase/migrations/20261012000000_allow_zero_beat_unified_broll_plan.sql",import.meta.url),"utf8");

test("paid-media video quotes retain all canonical quote contract versions",()=>{
  assert.match(paidMediaQuoteMigration,/'forge\.paid-media\.quote\.v1'/);
  assert.match(paidMediaContractMigration,/pricing_contract_version in \(\s*'scalar_v1',\s*'compound_v2',\s*'forge\.paid-media\.quote\.v1'\s*\)/s);
  assert.match(paidMediaContractMigration,/validate constraint ai_credit_quotes_contract_version_check/);
  assert.doesNotMatch(paidMediaContractMigration,/drop constraint if exists/i);
});
test("paid-video quotes use a strict video shape and reserve the Forge-credit ceiling",()=>{
  assert.match(paidVideoShapeMigration,/media_kind = 'image'[\s\S]*known_image_output_tokens is not null/);
  assert.match(paidVideoShapeMigration,/media_kind = 'video'[\s\S]*known_image_output_tokens is null/);
  assert.match(paidVideoShapeMigration,/pricing_contract_version = 'forge\.paid-media\.quote\.v1'/);
  assert.match(paidVideoShapeMigration,/customer_credit_charge = authorized_customer_ceiling/);
  assert.match(paidVideoShapeMigration,/reservation_amount = authorized_customer_ceiling/);
  assert.match(paidVideoShapeMigration,/'video','text_to_video',v_params,1,v_provider_native_units,p_pricing_policy_revision_id,1,\s*v_provider_expense_micros,'USD',v_ceiling,v_ceiling/s);
  assert.doesNotMatch(paidVideoShapeMigration,/authorization_policy_revision_id is null or \(\s*authorization_policy_revision/s);
});
test("Runway quotes bind the pricing revision rather than the stable policy identity",()=>{
  assert.match(runwayPricingMigration,/'78000000-0000-4000-8000-000000000001'::uuid,\s*'77000000-0000-4000-8000-000000000001'::uuid/);
  assert.match(runwayPricingMigration,/values\(\s*'77000000-0000-4000-8000-000000000001'::uuid,\s*'78000000-0000-4000-8000-000000000001'::uuid/s);
});
test("paid-video operations retain their canonical provider identity and endpoint",()=>{
  assert.match(paidVideoOperationMigration,/case when v_quote\.media_kind='video' then 'paid_video_generation'/);
  assert.match(paidVideoOperationMigration,/v_quote\.media_kind,v_quote\.provider,v_quote\.model/);
  assert.match(paidVideoOperationMigration,/case when v_op\.media_kind='video' then '\/v1\/text_to_video'/);
});
test("actual usage permits canonical video output without weakening existing component kinds",()=>{
  assert.match(paidVideoUsageMigration,/component_kind in \(\s*'text_input',\s*'cached_text_input',\s*'image_input',\s*'cached_image_input',\s*'image_output',\s*'video_output'\s*\)/s);
  assert.match(paidVideoUsageMigration,/validate constraint paid_media_actual_usage_components_component_kind_check/);
  assert.doesNotMatch(paidVideoUsageMigration,/drop constraint if exists/i);
});
const readbackMigration=readFileSync(new URL("../../../supabase/migrations/20260804130000_tongs_broll_candidate_readback.sql",import.meta.url),"utf8");
test("B-roll V2 establishes immutable plans, beats, prompts, candidates, selections, and receipts",()=>{
  for(const name of ["broll_plan_revisions","broll_beat_revisions","broll_prompt_revisions","broll_candidate_revisions","broll_selections","broll_operation_receipts"])assert.match(migration,new RegExp(`create table tongs\\.${name}`));
  assert.match(migration,/reject_broll_immutable_mutation/);assert.match(migration,/revoke all on tongs\.%I from public,anon,authenticated/);
});
test("a completed zero-beat B-roll plan is explicit without weakening document validation",()=>{
  assert.match(zeroBeatMigration,/jsonb_typeof\(p_beats\) <> 'array'[\s\S]*beats_array_required/);
  assert.doesNotMatch(zeroBeatMigration,/jsonb_array_length\(p_beats\)\s*=\s*0 then[\s\S]*beats_required/);
  assert.match(zeroBeatMigration,/'beat_count',jsonb_array_length\(p_beats\),'empty',jsonb_array_length\(p_beats\)=0/);
  assert.match(zeroBeatMigration,/for v_beat in select value from jsonb_array_elements\(p_beats\)/);
});
test("B-roll V2 reserves external work and requires a verified video asset before candidate commit",()=>{
  assert.match(migration,/begin_broll_operation/);assert.match(migration,/provider_or_upload_completed/);assert.match(migration,/verify_broll_operation_asset/);assert.match(migration,/status='ready'.*mime_type like 'video\/%'.*content_hash is not null.*ready_at is not null/s);
  assert.match(migration,/verify_broll_operation_poster/);assert.match(migration,/asset_kind='broll_candidate_poster'/);assert.match(migration,/fail_broll_operation/);
});
test("stock and URL references cannot become selections without canonical candidate assets",()=>{
  assert.match(migration,/verified_video_asset_required/);assert.match(migration,/asset_verification_required/);assert.match(migration,/candidate_not_attached/);
});
test("selection is expected-revision concurrent and terminal replay returns the same receipt",()=>{
  assert.match(migration,/selection_revision_conflict/);assert.match(migration,/plan_revision_conflict/);assert.match(migration,/return v_op\.receipt_json/);
  assert.match(migration,/old\.state in\('committed','candidate_committed','selected'\)/);
  assert.match(migration,/asset_path text not null/);
});
test("current B-roll readback projects every candidate with canonical video and poster assets",()=>{
  assert.match(readbackMigration,/'candidate_revisions'/);
  assert.match(readbackMigration,/join tongs\.assets video_asset on video_asset\.id=cr\.asset_id/);
  assert.match(readbackMigration,/left join tongs\.assets poster_asset on poster_asset\.id=cr\.poster_asset_id/);
});
