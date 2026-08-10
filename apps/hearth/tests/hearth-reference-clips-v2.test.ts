import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const authority=readFileSync(new URL("../src/lib/hearth-reference-clip-authority.ts",import.meta.url),"utf8");
const panel=readFileSync(new URL("../src/components/visuals/CanonicalReferenceClipPanel.tsx",import.meta.url),"utf8");
const surface=readFileSync(new URL("../src/views/surfaces/VisualsSurface.tsx",import.meta.url),"utf8");
const unified=readFileSync(new URL("../src/lib/hearth-unified-visual-plan-authority.ts",import.meta.url),"utf8");
const generation=readFileSync(new URL("../src/hooks/visuals/useMediaMapGenerationActions.ts",import.meta.url),"utf8");

test("Reference Clips consume canonical Tongs readback and never write cdc_plan",()=>{
 assert.match(authority,/read_current_reference_clip_plan/);
 assert.match(authority,/reference-clips\/acquire/);
 assert.match(authority,/reference-clips\/selection-set/);
 assert.doesNotMatch(authority,/cdc_plan|metadata\.json|persistReferenceClipPlan/);
 assert.match(surface,/canonicalWorkspaceId=\{props\.thumbnailAuthority\.workspaceId\}/);
});

test("creator workflow exposes source evidence, upload, external fetch, rights, playback, and selection",()=>{
 for(const contract of ["Why this clip belongs here","Current Source","Change Source","Remove Source","Identify the Source","Material to seek","Useful searches","Upload Clip","Attach External Clip","Rights and provenance","Use this clip","video controls","fulfilled","skipped","unresolved"]){assert.ok(panel.includes(contract),`missing ${contract}`);}
 assert.match(panel,/opportunity\.sourceStatus!=="linked"/);
 assert.match(panel,/readCanonicalReferenceClips\(workspaceId,workpieceId\)/);
});

test("acquisition and selection use immutable revision identities and canonical refresh",()=>{
 for(const field of ["plan_revision_id","opportunity_revision_id","operation_fingerprint","candidate_revision_ids","expected_selection_set_revision"]){assert.ok(authority.includes(field),`missing ${field}`);}
 assert.match(authority,/return readCanonicalReferenceClips\(args\.workspaceId,args\.workpieceId\)/);
 assert.match(authority,/storage_key/);
 assert.match(authority,/media-url\?path=/);
});

test("selection commits and verifies the complete ordered collection",()=>{
 assert.match(authority,/canonicalSelectionRevision:num\(read\.data\.sequence\.current_selection_revision\)/);
 assert.match(authority,/expected_selection_set_revision:args\.opportunity\.selectionSetRevision/);
 assert.match(authority,/addReferenceClipSelectionId\(args\.opportunity\.selectedRevisionIds,args\.candidateRevisionId\)/);
 assert.match(authority,/removeReferenceClipSelectionId\(args\.opportunity\.selectedRevisionIds,args\.candidateRevisionId\)/);
 assert.doesNotMatch(authority,/selectedRevisionId[:?]/);
 assert.match(authority,/disposition!=="committed"/);
 assert.match(authority,/sameIds\(receiptIds,args\.selectedRevisionIds\)/);
 assert.match(authority,/reference_clip_selection_receipt_invalid/);
 assert.match(authority,/reference_clip_selection_readback_mismatch/);
});

test("Hearth renders additive selection, duplicate prevention, individual removal, and opportunity counters",()=>{
 assert.match(panel,/selectedRevisionIds\.includes\(revisionId\)/);
 assert.match(panel,/selectedRevisionIds\.includes\(c\.revisionId\)/);
 assert.match(panel,/removeSelectedReferenceClip/);
 assert.match(panel,/>Remove<\/button>/);
 assert.match(panel,/selectedRevisionIds\.length>0/);
 assert.match(panel,/selectedRevisionIds\.length\?` · \$\{o\.selectedRevisionIds\.length\} selected`/);
});

test("unresolved opportunities create or reuse canonical Sources before fulfillment",()=>{
 for(const route of ["sources/commit-revision","sources/link","reference-clips/fulfill-source"]){assert.ok(authority.includes(route),`missing ${route}`);}
 for(const evidence of ["expected_opportunity_revision_id","source_revision_id","workpiece_source_link_revision_id","script_approval_revision"]){assert.ok(authority.includes(evidence),`missing ${evidence}`);}
 for(const control of ["Identify the Source","Add Source","Use linked Source","Commit and link Source"]){assert.ok(panel.includes(control),`missing ${control}`);}
 assert.match(panel,/sourceStatus!=="linked"/);
 assert.match(panel,/Uploaded Source documents require the separate canonical Source-byte bridge/);
});

test("Generate Visual Plan uses one unified durable operation and does not write the legacy cdc bootstrap",()=>{
 assert.match(unified,/visual-plan-v2\/generate/);
 assert.match(unified,/unified_visual_plan_operations/);
 assert.match(unified,/normalized_inputs_json/);
 assert.match(unified,/forge:unified-visual-plan:/);
 assert.match(generation,/generateUnifiedVisualPlan/);
 assert.match(generation,/notifyCanonicalReferenceClipsChanged/);
 assert.doesNotMatch(generation,/hearth\.cdc_plan\.bootstrapped_from_image_map/);
 assert.doesNotMatch(generation,/hearth\.media_map\.generated_from_plans/);
});

test("selected Reference Clips require exact Hammer visual-package readback",()=>{
 assert.match(authority,/\/visual-package/);
 assert.match(authority,/reference_clip_hammer_readback_mismatch/);
 for(const evidence of ["candidate_revision_id","source_revision_id","source_link_revision_id","rights","provenance"]){assert.match(authority,new RegExp(`evidence\\.${evidence}`));}
 assert.match(authority,/selectedRevisionIds\[index\]/);
 assert.match(panel,/verifyReferenceClipHammerReadback/);
 assert.match(panel,/forge:canonical-reference-clips-progress/);
});
