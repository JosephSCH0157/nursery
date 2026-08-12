import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
import {validateReferenceVisualSourceSetReceipt} from "../src/lib/hearth-reference-visual-collections";

const collection=readFileSync(new URL("../src/lib/hearth-reference-visual-collections.ts",import.meta.url),"utf8");
const panel=readFileSync(new URL("../src/components/visuals/CanonicalReferenceVisualPanel.tsx",import.meta.url),"utf8");
const shell=readFileSync(new URL("../src/routes/HearthShell.tsx",import.meta.url),"utf8");
const dispositionControl=readFileSync(new URL("../src/components/visuals/VisualOpportunityDispositionControl.tsx",import.meta.url),"utf8");
const migration=readFileSync(new URL("../../../supabase/migrations/20260810130000_tongs_reference_visual_source_sets.sql",import.meta.url),"utf8");
const originMigration=readFileSync(new URL("../../../supabase/migrations/20260811120000_tongs_reference_visual_evidence_extracted_content_origin.sql",import.meta.url),"utf8");
const resetReadbackRepair=readFileSync(new URL("../../../supabase/migrations/20260812150000_tongs_reference_visual_reset_readback_repair.sql",import.meta.url),"utf8");

test("Reference Visual Sources use immutable ordered set authority",()=>{
 for(const table of ["reference_visual_source_set_revisions","reference_visual_source_set_members"])assert.match(migration,new RegExp(`create table tongs\\.${table}`));
 assert.match(migration,/commit_reference_visual_source_set/);assert.match(migration,/p_expected_source_set_revision/);assert.match(migration,/source_set_revision_conflict/);assert.match(migration,/duplicate_source/);assert.match(migration,/reference_visual_source_set_retention/);assert.match(migration,/forge\.reference-visual\.hammer\.v3/);
});

test("Hearth commits and verifies the complete ordered collection",()=>{
 assert.match(collection,/reference-visuals\/source-set/);assert.match(collection,/expected_source_set_revision/);assert.match(collection,/source_set_receipt_invalid/);assert.match(collection,/source_set_readback_mismatch/);assert.match(collection,/sameMembers/);assert.match(collection,/removeReferenceVisualSourceMember/);
});

test("collection receipts reject stale conflicts, malformed members, and wrong ordering",()=>{
 const intended=[{sourceRevisionId:"source-a",sourceLinkRevisionId:"link-a"},{sourceRevisionId:"source-b",sourceLinkRevisionId:"link-b"}],receipt={disposition:"committed",source_set_revision:{revision:2},members:[{source_revision_id:"source-a",workpiece_source_link_revision_id:"link-a"},{source_revision_id:"source-b",workpiece_source_link_revision_id:"link-b"}]};
 assert.deepEqual(validateReferenceVisualSourceSetReceipt(receipt,intended,1),{ok:true,data:{revision:2}});
 assert.equal(validateReferenceVisualSourceSetReceipt({...receipt,members:[...receipt.members].reverse()},intended,1).ok,false);
 assert.equal(validateReferenceVisualSourceSetReceipt({...receipt,source_set_revision:{revision:1}},intended,1).ok,false);
 assert.deepEqual(validateReferenceVisualSourceSetReceipt({disposition:"source_set_revision_conflict"},intended,1),{ok:false,status:409,code:"source_set_revision_conflict",error:"Reference Visual Sources were not committed."});
 assert.equal(validateReferenceVisualSourceSetReceipt({disposition:"committed",members:"bad",source_set_revision:{revision:2}},intended,1).ok,false);
});

test("URL-first workflow exposes working, decision, and ready states without requiring fabricated dates",()=>{
 assert.match(panel,/Hearth is working/);assert.match(panel,/Ready/);assert.match(panel,/publicationDateStatus==="not_provided"\?"Not provided"/);for(const action of ["Approve","Replace","Skip"])assert.ok(panel.includes(`>${action}<`));assert.match(panel,/Save edits/);assert.match(panel,/readCanonicalReferenceVisualCollections/);assert.match(panel,/Approved Sources/);
 assert.match(panel,/Source title/);assert.match(panel,/Publisher or organization/);assert.match(panel,/setSourceProposal\(\{\.\.\.sourceProposal,title:event\.target\.value\}\)/);
});

test("post-action and authority-event refreshes keep the work area mounted",()=>{
 assert.match(panel,/async function refresh\(blocking=false\)/);
 assert.match(panel,/void refresh\(true\)/);
 assert.match(panel,/listener=\(\)=>void refresh\(false\)/);
 assert.match(panel,/await refresh\(false\)/);
 assert.doesNotMatch(panel,/async function refresh\(\)\{setLoading\(true\)/);
 assert.match(panel,/setSelectedId\(current=>/);
});

test("Reference Material completion treats current selections and explicit skips as resolved and receives live progress",()=>{
 assert.match(shell,/selectedRevisionIds\.length > 0 \|\| skippedReferenceClipIds\.has\(opportunity\.id\)/);
 assert.match(shell,/selectedCandidateRevisionId\) \|\| skippedReferenceVisualIds\.has\(opportunity\.id\)/);
 assert.match(shell,/forge:canonical-reference-visuals-progress/);
 assert.match(shell,/forge:visual-opportunity-dispositions-progress/);
 assert.match(panel,/forge:canonical-reference-visuals-progress/);
 assert.match(dispositionControl,/forge:visual-opportunity-dispositions-progress/);
 assert.match(panel,/Boolean\(item\.selectedCandidateRevisionId\)&&!skippedIds\.has\(item\.id\)/);
});

test("confirmed collection evidence uses the canonical extracted-content origin without remapping",()=>{
 assert.match(panel,/origin:"hearth_extracted_source_content"/);
 assert.match(panel,/date:proposal\.evidenceDate/);
 assert.doesNotMatch(panel,/evidence_date:proposal\.evidenceDate/);
 for(const origin of ["ai_extracted","creator_entered","hearth_proposed_source_metadata","hearth_extracted_source_content"])assert.match(originMigration,new RegExp(`'${origin}'`));
 assert.match(originMigration,/reference_visual_evidence_revisions_origin_check/);
});

test("each newly confirmed collection claim starts its own immutable evidence sequence",()=>{
 assert.match(panel,/confirmProposal[\s\S]*?expectedRevision:0/);
 assert.match(panel,/confirmEvidence[\s\S]*?expectedRevision:0/);
 assert.doesNotMatch(panel,/confirmProposal[\s\S]*?expectedRevision:opportunity\.evidenceSequenceRevision/);
});

test("evidence reset readback preserves ordered canonical Source collections",()=>{
 assert.match(resetReadbackRepair,/'source_set',to_jsonb\(ss\)/);
 assert.match(resetReadbackRepair,/'sources',coalesce/);
 assert.match(resetReadbackRepair,/reference_visual_source_set_members sm/);
 assert.match(resetReadbackRepair,/order by sm\.ordinal/);
 assert.match(resetReadbackRepair,/reference_visual_evidence_resets/);
});
