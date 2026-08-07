import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const authority=readFileSync(new URL("../src/lib/hearth-reference-visual-authority.ts",import.meta.url),"utf8");
const panel=readFileSync(new URL("../src/components/visuals/CanonicalReferenceVisualPanel.tsx",import.meta.url),"utf8");
const referenceClipAuthority=readFileSync(new URL("../src/lib/hearth-reference-clip-authority.ts",import.meta.url),"utf8");
const referenceClipPanel=readFileSync(new URL("../src/components/visuals/CanonicalReferenceClipPanel.tsx",import.meta.url),"utf8");
const shell=readFileSync(new URL("../src/components/visuals/CanonicalReferenceMaterialPanel.tsx",import.meta.url),"utf8");
const unified=readFileSync(new URL("../src/lib/hearth-unified-visual-plan-authority.ts",import.meta.url),"utf8");

test("Reference Material keeps Source Clips intact and exposes Reference Visuals separately",()=>{
 assert.match(shell,/CanonicalReferenceClipPanel/);
 assert.match(shell,/CanonicalReferenceVisualPanel/);
 assert.match(shell,/Source Clips/);
 assert.match(shell,/Reference Visuals/);
});

test("Hearth consumes the fourth canonical child and never falls back to cdc_plan",()=>{
 for(const field of ["reference_visual_plan_sequences","expected_reference_visual_revision_id","reference_visual_plan_revision_id","referenceVisualPlanRevisionId"]){assert.ok(unified.includes(field),`missing ${field}`);}
 assert.doesNotMatch(authority,/cdc_plan|metadata\.json|localStorage/);
 assert.match(authority,/read_current_reference_visual_plan/);
});

test("Reference Visual workflow separates factual Source use from third-party media rights",()=>{
 for(const rpc of ["fulfill_reference_visual_opportunity","commit_reference_visual_evidence","commit_reference_visual_source_use","commit_reference_visual_recipe","commit_reference_visual_rights_declaration","commit_reference_visual_sequence","select_reference_visual_candidate"]){assert.ok(authority.includes(rpc),`missing ${rpc}`);}
 assert.match(authority,/reference-visuals\/render/);
 assert.match(authority,/reference-visuals\/acquire/);
 for(const copy of ["Why this visual belongs here","Confirm evidence","How this Source is used","Using facts/data only","Rights and permissions","Prepare visual design","Generate visual","Verify and add archival still","Assemble archival sequence","Use this visual"]){assert.ok(panel.includes(copy),`missing ${copy}`);}
 assert.match(panel,/Forge records your declaration; it does not determine fair use/);
 assert.match(panel,/sourceUse\.classification!=="facts_data_only"/);
 assert.match(authority,/rights_declaration_revision_id:factsOnly\?null/);
 assert.match(panel,/Find supporting evidence/);
 assert.match(panel,/You decide whether the Source supports them/);
 assert.match(authority,/hearth_proposed_source_metadata/);
 assert.match(authority,/title\.match\(\/\\b\(\\d\+/);
 assert.doesNotMatch(authority,/\\s\*%\\b/);
 assert.match(panel,/Canonical provenance/);
 assert.match(panel,/source_use_revision_id/);
});

test("Hearth leads creators from confirmed evidence to a canonical finished visual",()=>{
 for(const copy of ["Find supporting evidence","Confirm evidence","Prepare visual design","Generate visual","Adjust design","Use this visual","no AI image credits"]){assert.ok(panel.includes(copy),`missing ${copy}`);}
 assert.match(authority,/proposeReferenceVisualRecipe/);
 assert.match(authority,/source_evidence_revision_ids/);
 assert.match(authority,/target_duration_ms/);
 assert.match(authority,/reference-visuals\/render/);
 assert.doesNotMatch(authority,/imageToVideo|textToImage|generateImage|debit.*credit/i);
});

test("linked Reference Material Sources can be changed or removed canonically",()=>{
 assert.match(authority,/reassign_reference_visual_source/);
 assert.match(authority,/removeReferenceVisualSource/);
 assert.match(referenceClipAuthority,/reassign_reference_clip_source/);
 assert.match(referenceClipAuthority,/removeReferenceClipSource/);
 assert.match(panel,/Change Source/);
 assert.match(panel,/Remove Source/);
 assert.match(referenceClipPanel,/Change Source/);
 assert.match(referenceClipPanel,/Remove Source/);
});

test("creator-added Reference Visual opportunities use the canonical amendment route",()=>{
 assert.match(panel,/Add visual opportunity/);
 assert.match(panel,/Use prior suggestion/);
 assert.match(panel,/appendCreatorReferenceVisualOpportunity/);
 assert.match(authority,/reference-visuals\/append-opportunity/);
 assert.match(authority,/creator-amendment/);
 assert.match(authority,/derived_from_opportunity_revision_id/);
 assert.doesNotMatch(authority,/generateUnifiedVisualPlan/);
});
