import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sql = await readFile(new URL("../../../supabase/migrations/20260805140000_tongs_visual_plan_creator_amendments.sql", import.meta.url), "utf8");
const retentionRepair = await readFile(new URL("../../../supabase/migrations/20260806120000_tongs_reference_clip_retention_ordinals.sql", import.meta.url), "utf8");
const creatorSupersession = await readFile(new URL("../../../supabase/migrations/20260806121000_tongs_unified_reference_visual_creator_supersession.sql", import.meta.url), "utf8");
const imageRepairSuccessor = await readFile(new URL("../../../supabase/migrations/20260806122000_tongs_unified_image_repair_successor.sql", import.meta.url), "utf8");
const service = await readFile(new URL("../src/workpiece-commit-api.ts", import.meta.url), "utf8");

test("creator amendments append a new immutable Reference Visual plan without provider work", () => {
  assert.match(sql, /create or replace function tongs\.append_reference_visual_opportunity/);
  assert.match(sql, /for member in select \* from tongs\.reference_visual_plan_membership/);
  assert.match(sql, /'origin','creator_added'/);
  assert.match(sql, /derived_from_opportunity_revision_id/);
  assert.match(sql, /'provider_request_performed',false/);
  assert.doesNotMatch(sql, /update tongs\.reference_visual_opportunity_revisions/);
});

test("creator amendments reject stale plan, script, anchor, and replay evidence", () => {
  for (const disposition of [
    "operation_identity_conflict",
    "plan_revision_conflict",
    "script_revision_conflict",
    "script_anchor_unresolved",
    "historical_opportunity_not_found",
  ]) assert.match(sql, new RegExp(disposition));
  assert.match(sql, /reference_visual_operation_receipts/);
});

test("unified recovery loads the frozen operation before rebuilding canonical inputs", () => {
  const method = service.slice(service.indexOf("async generateUnifiedVisualPlan"), service.indexOf("async acquireReferenceClipCandidate"));
  const read = method.indexOf('rpc("read_unified_visual_plan_operation"');
  const hash = method.indexOf("const expectedFingerprint=await sha256Hex");
  const begin = method.indexOf('rpc("begin_unified_visual_plan"');
  assert.ok(read >= 0 && read < hash && hash < begin);
  assert.match(method, /const normalizedInputs=frozen\?\?/);
  assert.match(method, /providerResponse=isRecord\(operation\.provider_response_json\)/);
});

test("successor plans retain canonical B-roll, Source Clip, and Reference Visual selections", () => {
  assert.match(sql, /create or replace function tongs\.retain_unified_visual_plan_selections/);
  for (const child of ["broll", "reference_clip", "reference_visual", "image"]) assert.match(sql, new RegExp(`p_child_kind='${child}'`));
  assert.match(sql, /creator_retained/);
  assert.match(sql, /child_membership_evidence_json/);
  assert.match(service, /unified_broll_retention_failed/);
  assert.match(service, /unified_reference_retention_failed/);
  assert.match(service, /unified_reference_visual_retention_failed/);
});

test("Source Clip retention uses a dedicated one-based deterministic merge", () => {
  assert.match(retentionRepair, /create or replace function tongs\.retain_unified_reference_clip_selections/);
  assert.match(retentionRepair, /next_ordinal integer := 1/);
  assert.match(retentionRepair, /order by ordinal, opportunity_id/);
  assert.match(retentionRepair, /order by s\.opportunity_id, s\.revision desc/);
  assert.match(retentionRepair, /not exists \([\s\S]*m\.opportunity_id = s\.opportunity_id/);
  assert.match(retentionRepair, /provider_proposed', provider_members/);
  assert.match(retentionRepair, /creator_retained', retained/);
  assert.match(service, /rpc\("retain_unified_reference_clip_selections"/);
  assert.match(service, /p_failed_stage:"reference_clip_retention"/);
  assert.match(service, /fail_unified_visual_plan/);
});

test("a direct creator-authored Reference Visual successor can supersede the frozen child safely", () => {
  assert.match(creatorSupersession, /create or replace function tongs\.adopt_creator_amended_reference_visual_plan/);
  assert.match(creatorSupersession, /current_plan\.previous_revision_id is distinct from op\.expected_reference_visual_revision_id/);
  assert.match(creatorSupersession, /forge\.reference-visual\.creator-amendment\.v1/);
  assert.match(creatorSupersession, /provider_output_applied', false/);
  assert.match(creatorSupersession, /superseded_by_creator_plan', true/);
  assert.match(creatorSupersession, /opportunity_origin = 'creator_added'/);
  assert.match(service, /rpc\("adopt_creator_amended_reference_visual_plan"/);
  assert.match(service, /p_failed_stage:"reference_visual_retention"/);
});

test("a direct canonical Image anchor-repair successor can be adopted before final verification", () => {
  assert.match(imageRepairSuccessor, /create or replace function tongs\.adopt_repaired_image_map_for_unified_operation/);
  assert.match(imageRepairSuccessor, /current_map\.previous_revision_id is distinct from op\.image_map_revision_id/);
  assert.match(imageRepairSuccessor, /forge\.image-map-anchor\.v1/);
  assert.match(imageRepairSuccessor, /current_map\.provenance_state <> 'current'/);
  assert.match(imageRepairSuccessor, /authority_repair_successor', true/);
  assert.match(service, /rpc\("adopt_repaired_image_map_for_unified_operation"/);
  assert.match(service, /p_failed_stage:"verification"/);
});

test("the authenticated route exposes the canonical append operation", () => {
  assert.match(service, /parts\[4\]===\"append-opportunity\"/);
  assert.match(service, /service\.appendReferenceVisualOpportunity/);
});
