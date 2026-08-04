import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const sql=await readFile(new URL("../../../supabase/migrations/20260804170000_tongs_reference_clip_authority.sql",import.meta.url),"utf8");
const hammerEvidenceSql=await readFile(new URL("../../../supabase/migrations/20260804210000_tongs_reference_clip_hammer_evidence.sql",import.meta.url),"utf8");
const service=await readFile(new URL("../src/workpiece-commit-api.ts",import.meta.url),"utf8");
test("Reference Clip authority is immutable, Source-relative, and excludes legacy composites",()=>{
 for(const table of ["reference_clip_plan_revisions","reference_clip_opportunity_revisions","reference_clip_candidate_revisions","reference_clip_selections","reference_clip_operation_receipts"])assert.match(sql,new RegExp(`create table tongs\\.${table}`));
 assert.match(sql,/source_revision_id uuid not null/);assert.match(sql,/workpiece_source_link_revision_id uuid not null/);
 assert.match(sql,/rights_basis text not null/);assert.match(sql,/rights_evidence_json jsonb not null/);
 assert.match(sql,/legacy cdc_plan is not authority/);assert.doesNotMatch(sql,/chart_candidate|timeline_candidate|document_composite/);
});
test("Tongs exposes canonical Reference Clip routes and adds selected clips to Hammer",()=>{
 for(const action of ["plan","candidate","select","current"])assert.match(service,new RegExp(`action===\\"${action}\\"`));
 assert.match(service,/read_reference_clip_visual_package/);assert.match(service,/asset_class:"reference_clip"/);
});
test("Reference Clip mutations are replay-safe, concurrent, RLS protected, and Hammer projected",()=>{
 assert.match(sql,/operation_identity_conflict/g);assert.match(sql,/plan_revision_conflict/g);assert.match(sql,/selection_revision_conflict/);
 assert.match(sql,/reject_reference_clip_immutable_mutation/);assert.match(sql,/enable row level security/);assert.match(sql,/revoke all on tongs\.%I from public,anon,authenticated/);
 assert.match(sql,/read_current_reference_clip_plan/);assert.match(sql,/read_reference_clip_visual_package/);
});
test("Hammer projection preserves exact media, Source, rights, and provenance evidence",()=>{
 for(const field of ["plan_revision_id","opportunity_revision_id","candidate_revision_id","source_revision_id","source_link_revision_id","asset_content_hash","mime_type","duration_ms","poster_asset_id","rights","provenance"])assert.match(hammerEvidenceSql,new RegExp(`'${field}'`));
 assert.match(hammerEvidenceSql,/forge\.reference-clips\.hammer\.v2/);
 assert.match(service,/reference_clip_evidence/);
 assert.match(service,/mime_type:readStringField\(clip,"mime_type"\)/);
});
