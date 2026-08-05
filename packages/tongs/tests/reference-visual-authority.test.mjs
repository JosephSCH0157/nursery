import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sql = await readFile(new URL("../../../supabase/migrations/20260805120000_tongs_reference_visual_authority.sql", import.meta.url), "utf8");
const service = await readFile(new URL("../src/workpiece-commit-api.ts", import.meta.url), "utf8");

test("Reference Visual authority separates opportunities, evidence, recipes, candidates, and sequences", () => {
  for (const table of [
    "reference_visual_plan_revisions",
    "reference_visual_opportunity_revisions",
    "reference_visual_evidence_revisions",
    "reference_visual_evidence_sequences",
    "reference_visual_recipe_revisions",
    "reference_visual_recipe_sequences",
    "reference_visual_rights_declaration_revisions",
    "reference_visual_rights_declaration_sequences",
    "reference_visual_asset_restriction_revisions",
    "reference_visual_asset_restriction_sequences",
    "reference_visual_candidates",
    "reference_visual_candidate_revisions",
    "reference_visual_sequence_revisions",
    "reference_visual_sequence_membership",
    "reference_visual_selections",
    "reference_visual_render_operations",
    "reference_visual_acquisition_operations",
    "reference_visual_operation_receipts",
  ]) assert.match(sql, new RegExp(`create table tongs\\.${table}`));
});

test("unresolved opportunities cannot fabricate Source evidence and maps remain deferred", () => {
  assert.match(sql, /source_status text not null check\(source_status in\('unresolved','linked'\)\)/);
  assert.match(sql, /source_status='unresolved'.*source_revision_id is null.*workpiece_source_link_revision_id is null/);
  assert.match(sql, /source_status='linked'.*source_revision_id is not null.*workpiece_source_link_revision_id is not null/);
  assert.doesNotMatch(sql, /'map'/);
  assert.match(sql, /Legacy cdc_plan is compatibility data only/);
});

test("only creator-confirmed evidence can enter a canonical recipe and render reservation", () => {
  assert.match(sql, /confirmation_state text not null check\(confirmation_state in\('unconfirmed','creator_confirmed','rejected'\)\)/);
  assert.match(sql, /confirmed_evidence_required/);
  assert.match(sql, /current_confirmed_recipe_required/);
  assert.match(sql, /evidence_revision_ids uuid\[\] not null/);
});

test("authority is replay-safe, concurrency checked, immutable, RLS protected, and RPC-only", () => {
  assert.match(sql, /operation_identity_conflict/g);
  assert.match(sql, /plan_revision_conflict/);
  assert.match(sql, /evidence_revision_conflict/);
  assert.match(sql, /recipe_revision_conflict/);
  assert.match(sql, /reject_reference_visual_immutable_mutation/);
  assert.match(sql, /enable row level security/);
  assert.match(sql, /revoke all on tongs\.%I from public,anon,authenticated/);
});

test("the complete lifecycle has transactional fulfillment, render, acquisition, sequence, failure, and selection RPCs", () => {
  for (const fn of [
    "fulfill_reference_visual_opportunity",
    "begin_reference_visual_render",
    "commit_reference_visual_render",
    "begin_reference_visual_acquisition",
    "record_reference_visual_source_acquired",
    "commit_reference_visual_acquisition",
    "commit_reference_visual_sequence",
    "select_reference_visual_candidate",
    "fail_reference_visual_operation",
    "commit_reference_visual_asset_restriction",
  ]) assert.match(sql, new RegExp(`create or replace function tongs\\.${fn}`));
  assert.match(sql, /terminal Reference Visual operation is immutable/);
  assert.match(sql, /asset_replay_conflict/);
  assert.match(sql, /asset_restricted/);
});

test("rights are creator declarations, unresolved use is not release-ready, and disputes preserve history", () => {
  for (const status of ["creator_owned", "licensed", "public_domain", "permission_obtained", "platform_permitted", "fair_use_asserted_by_creator", "rights_unresolved"]) assert.match(sql, new RegExp(`'${status}'`));
  assert.match(sql, /creator_rights_acknowledgement_required/);
  assert.match(sql, /access_control_circumvention_prohibited/);
  assert.match(sql, /release_ready',p_rights_status<>'rights_unresolved'/);
  assert.match(sql, /availability_state text not null check\(availability_state in\('active','disputed','disabled','restored'\)\)/);
  assert.match(sql, /fair_use_asserted_by_creator is never a Forge legal determination/);
});

test("the first milestone does not extend the unified planner, Hearth, or Hammer", () => {
  assert.doesNotMatch(sql, /alter table tongs\.unified_visual_plan_operations/);
  assert.doesNotMatch(sql, /read_reference_visual_package/);
});

test("Tongs reconstructs canonical readback before deterministic rendering and commits only after storage readback", () => {
  const method = service.slice(service.indexOf("async renderReferenceVisual"), service.indexOf("private async referenceClipRpc"));
  assert.ok(method.indexOf('rpc("read_current_reference_visual_plan"') < method.indexOf('rpc("begin_reference_visual_render"'));
  assert.ok(method.indexOf('rpc("begin_reference_visual_render"') < method.indexOf("brollAcquisitionRuntime.renderReferenceVisual"));
  assert.ok(method.indexOf("downloadStorageObject") < method.indexOf('rpc("commit_reference_visual_render"'));
  assert.match(method, /canonical_svg_hash/);
  assert.match(service, /reference-visuals"&&parts\[4\]==="render"/);
});

test("Tongs reserves archival acquisition before safe fetch or upload and commits only inspected storage readback", () => {
  const method = service.slice(service.indexOf("async acquireReferenceVisual"), service.indexOf("private async referenceClipRpc"));
  assert.ok(method.indexOf('rpc("read_current_reference_visual_plan"') < method.indexOf('rpc("begin_reference_visual_acquisition"'));
  assert.ok(method.indexOf('rpc("begin_reference_visual_acquisition"') < method.indexOf("brollAcquisitionRuntime.fetchExternalBytes"));
  assert.ok(method.indexOf("downloadStorageObject") < method.indexOf('rpc("record_reference_visual_source_acquired"'));
  assert.ok(method.indexOf('rpc("record_reference_visual_source_acquired"') < method.indexOf('rpc("commit_reference_visual_acquisition"'));
  assert.match(method, /brollAcquisitionRuntime\.inspectReferenceImage\(stored\)/);
  assert.match(service, /reference-visuals"&&parts\[4\]==="acquire"/);
});
