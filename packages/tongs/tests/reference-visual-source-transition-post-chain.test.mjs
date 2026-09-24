import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const orderedMigrations = [
  "20261011675000_reference_visual_acquisition_order_compatibility.sql",
  "20261011680000_reference_material_rights_acquisition_boundary_repair.sql",
  "20261011690000_reference_visual_evidence_claim_identity.sql",
  "20261011700000_reference_visual_evidence_reset_claim_compatibility.sql",
  "20261011710000_reference_visual_source_transition_authority_reassert.sql",
];
const migrationText = new Map(await Promise.all(orderedMigrations.map(async name => [
  name,
  await readFile(new URL(`../../../supabase/migrations/${name}`, import.meta.url), "utf8"),
])));
const compatibility = migrationText.get(orderedMigrations[0]);
const acquisitionRepair = migrationText.get(orderedMigrations[1]);
const claimIdentity = migrationText.get(orderedMigrations[2]);
const resetCompatibility = migrationText.get(orderedMigrations[3]);
const reassertion = migrationText.get(orderedMigrations[4]);

test("post-chain Source-transition authority is ordered after claim and reset authority", () => {
  assert.deepEqual([...orderedMigrations].sort(), orderedMigrations);
  assert.match(acquisitionRepair, /create function tongs\.begin_reference_visual_acquisition/);
  assert.match(claimIdentity, /create or replace function tongs\.read_current_reference_visual_plan/);
  assert.match(resetCompatibility, /create or replace function tongs\.read_current_reference_visual_plan/);
  assert.match(reassertion, /create or replace function tongs\.read_current_reference_visual_plan/);
  assert.match(reassertion, /select tongs\.read_reference_visual_plan_source_transition/);
});

test("compatibility bridge drops only the conflicting acquisition signature on clean replay", () => {
  assert.match(compatibility, /where version='20261011680000'/);
  assert.match(compatibility, /drop function if exists tongs\.begin_reference_visual_acquisition\(\s*uuid,uuid,uuid,uuid,uuid,text,text,text,uuid\s*\)/s);
  assert.doesNotMatch(compatibility, /drop (table|schema|type|view|policy|trigger)/i);
  assert.equal((compatibility.match(/drop function/gi) ?? []).length, 1);
  assert.doesNotMatch(compatibility, /cascade/i);
  assert.doesNotMatch(compatibility, /\b(revoke|grant|delete|update|insert|truncate)\b/i);
});

test("final evidence currentness combines claim identity, reset activation, and exact Source pairs", () => {
  assert.match(reassertion, /join tongs\.reference_visual_evidence_claims claim/);
  assert.match(reassertion, /claim\.claim_fingerprint=tongs\.reference_visual_evidence_claim_fingerprint/);
  assert.match(reassertion, /reference_visual_evidence_claim_activations/);
  assert.match(reassertion, /greatest\(claim\.created_at/);
  assert.match(reassertion, /active\.source_revision_id=e\.source_revision_id[\s\S]*active\.workpiece_source_link_revision_id=e\.workpiece_source_link_revision_id/);
  assert.match(reassertion, /'canonical_claim_id',claim\.claim_id/);
  assert.match(reassertion, /'historical_source_set_member_id',e\.source_set_member_id,'source_set_member_id',active\.id/);
});

test("final candidate, Source-use, rights, and projection authority is reasserted", () => {
  assert.match(reassertion, /primary_source\.ordinal=1/);
  assert.match(reassertion, /r\.source_set_revision_id=p_source_set_revision_id/);
  assert.match(reassertion, /c\.created_at>coalesce\(\(select max\(r\.reset_at\)/);
  assert.match(reassertion, /candidate_not_current_for_plan/);
  assert.match(reassertion, /current_source_collection_required/);
  assert.match(reassertion, /current_rights_declaration_required/);
  assert.match(reassertion, /reference_visual_candidate_release_ready\(c\.id\) and tongs\.reference_visual_candidate_current_for_plan\(c\.id\)/);
  assert.match(reassertion, /forge\.reference-visual\.hammer\.v4/);
});

test("final authority keeps immutable tables RPC-only and pins privileged search paths", () => {
  assert.match(reassertion, /security definer set search_path=pg_catalog,tongs/g);
  assert.match(reassertion, /from public,anon/g);
  assert.match(reassertion, /authenticated direct mutation leaked for immutable Reference Visual authority tables/);
  assert.doesNotMatch(reassertion, /\b(update|delete)\s+tongs\.reference_visual_(evidence_revisions|rights_declaration_revisions|source_use_revisions|recipe_revisions|candidate_revisions|selections)\b/i);
});
