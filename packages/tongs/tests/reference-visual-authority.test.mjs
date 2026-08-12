import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationSql = [
  "20260805120000_tongs_reference_visual_authority.sql",
  "20260806132000_tongs_reference_visual_source_use_authority.sql",
  "20260806133000_tongs_reference_visual_recipe_ambiguity.sql",
  "20260806134000_tongs_restore_reference_visual_asset_kind.sql",
  "20260806135000_tongs_restore_reference_visual_selection_rpc.sql",
  "20260806136000_tongs_restore_reference_visual_selection_errors.sql",
  "20260806140000_tongs_visual_source_reassignment.sql",
  "20260806141000_tongs_reference_visual_source_projection.sql",
  "20260807120000_tongs_reference_visual_evidence_proposal_origin.sql",
  "20260811120000_tongs_reference_visual_evidence_extracted_content_origin.sql",
  "20260811130000_tongs_restore_collection_aware_reference_visual_acquisition.sql",
  "20260811140000_tongs_restore_reference_visual_archival_completion_rpcs.sql",
].map(async (migration) => readFile(new URL(`../../../supabase/migrations/${migration}`, import.meta.url), "utf8"));
const sql = (await Promise.all(migrationSql)).join("\n");
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

test("facts-only Source use is immutable, creator-confirmed, and does not require media rights",()=>{
  for(const table of ["reference_visual_source_use_revisions","reference_visual_source_use_sequences"])assert.match(sql,new RegExp(`create table tongs\\.${table}`));
  for(const classification of ["facts_data_only","quoted_or_excerpted_text","third_party_media","mixed"])assert.match(sql,new RegExp(`'${classification}'`));
  assert.match(sql,/source_use_incompatible_with_treatment/);
  assert.match(sql,/begin_reference_visual_render_v2/);
  assert.match(sql,/rights_not_applicable/);
  assert.match(sql,/candidate_not_release_ready/);
});

test("the base authority does not mutate the unified planner contract", () => {
  assert.doesNotMatch(sql, /alter table tongs\.unified_visual_plan_operations/);
});

test("Source reassignment appends immutable current revisions and invalidates predecessor candidates",()=>{
 assert.match(sql,/function tongs\.reassign_reference_visual_source/);
 assert.match(sql,/function tongs\.reassign_reference_clip_source/);
 assert.match(sql,/source_transition_opportunity_revision/);
 assert.match(sql,/revision\+1,id,revision,new_plan\.id/);
 assert.match(sql,/p_source_revision_id is null then 'unresolved' else 'linked'/);
 assert.match(sql,/opportunity_revision_id=m\.opportunity_revision_id/);
 assert.match(sql,/u\.opportunity_revision_id=o\.id/);
});

test("Hammer projection preserves exact Source use, evidence, recipe, rights, and asset provenance",()=>{
  assert.match(sql,/read_reference_visual_visual_package/);
  assert.match(sql,/'source_use',to_jsonb\(u\)/);
  assert.match(sql,/'evidence'.*reference_visual_evidence_revisions/s);
  assert.match(service,/reference_visual_evidence/);
  assert.match(service,/rpc\("read_reference_visual_visual_package"/);
});

test("Reference Visual evidence preserves Hearth metadata proposal provenance",()=>{
  assert.match(sql,/hearth_proposed_source_metadata/);
  assert.match(sql,/hearth_extracted_source_content/);
  assert.match(sql,/reference_visual_evidence_revisions_origin_check/);
  for(const origin of ["ai_extracted","creator_entered","hearth_proposed_source_metadata","hearth_extracted_source_content"])assert.match(sql,new RegExp(`'${origin}'`));
  assert.doesNotMatch(sql,/origin\s+is\s+not\s+null/i);
  assert.doesNotMatch(sql,/disable row level security|drop policy/i);
});

test("Tongs reconstructs canonical readback before deterministic rendering and commits only after storage readback", () => {
  const method = service.slice(service.indexOf("async renderReferenceVisual"), service.indexOf("private async referenceClipRpc"));
  assert.ok(method.indexOf('rpc("read_current_reference_visual_plan"') < method.indexOf('rpc("begin_reference_visual_render_v2"'));
  assert.ok(method.indexOf('rpc("begin_reference_visual_render_v2"') < method.indexOf("brollAcquisitionRuntime.renderReferenceVisual"));
  assert.ok(method.indexOf("downloadStorageObject") < method.indexOf('rpc("commit_reference_visual_render"'));
  assert.match(method, /canonical_svg_hash/);
  assert.match(method, /renderer_contract_version/);
  assert.match(method, /forge\.reference-visual-renderer\.v2/);
  assert.match(method, /forge_\$\{subtype\}_v\$\{rendererVersion\}/);
  assert.match(method, /subtype==="comparison"\|\|subtype==="stat_card"\?"3"/);
  assert.match(method, /reference_visual_source_coverage_required/);
  assert.match(method, /sourceTitles\.size>1/);
  assert.match(method, /evidencedMembers/);
  assert.match(service, /reference-visuals"&&parts\[4\]==="render"/);
});

test("Tongs reserves archival acquisition before safe fetch or upload and commits only inspected storage readback", () => {
  const method = service.slice(service.indexOf("async acquireReferenceVisual"), service.indexOf("private async referenceClipRpc"));
  assert.ok(method.indexOf('rpc("read_current_reference_visual_plan"') < method.indexOf('rpc("begin_reference_visual_acquisition"'));
  assert.ok(method.indexOf('rpc("begin_reference_visual_acquisition"') < method.indexOf("brollAcquisitionRuntime.fetchExternalBytes"));
  assert.ok(method.indexOf("downloadStorageObject") < method.indexOf('rpc("record_reference_visual_source_acquired"'));
  assert.ok(method.indexOf('rpc("record_reference_visual_source_acquired"') < method.indexOf('rpc("commit_reference_visual_acquisition"'));
  assert.match(method, /brollAcquisitionRuntime\.inspectReferenceImage\(stored\)/);
  assert.match(method, /Array\.isArray\(opportunity\.sources\)/);
  assert.match(method, /member\.source_revision/);
  assert.match(method, /member\.source_link_revision/);
  assert.doesNotMatch(method, /rights_declaration_revision_id\|\|readStringField\(opportunity\.opportunity_revision,"source_status"\)!=="linked"/);
  assert.match(service, /reference-visuals"&&parts\[4\]==="acquire"/);
});

test("the forward acquisition repair restores the RPC with current Source collection and rights authority", () => {
  assert.match(sql, /create or replace function tongs\.begin_reference_visual_acquisition/);
  assert.match(sql, /reference_visual_source_set_revisions/);
  assert.match(sql, /reference_visual_source_set_members/);
  assert.match(sql, /current_declaration_revision_id=p_rights_declaration_revision_id/);
  assert.match(sql, /grant execute on function tongs\.begin_reference_visual_acquisition/);
  assert.match(sql, /notify pgrst,'reload schema'/);
  assert.match(sql, /create or replace function tongs\.record_reference_visual_source_acquired/);
  assert.match(sql, /create or replace function tongs\.commit_reference_visual_acquisition/);
  assert.match(sql, /create or replace function tongs\.commit_reference_visual_sequence/);
  assert.match(sql, /create table if not exists tongs\.reference_visual_sequence_sequences/);
  assert.match(sql, /current_source_collection_required/);
});
