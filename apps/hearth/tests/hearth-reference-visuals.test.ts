import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const authority=readFileSync(new URL("../src/lib/hearth-reference-visual-authority.ts",import.meta.url),"utf8");
const panel=readFileSync(new URL("../src/components/visuals/CanonicalReferenceVisualPanel.tsx",import.meta.url),"utf8");
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

test("Reference Visual workflow uses immutable Source, evidence, recipe, rights, render, and selection authority",()=>{
 for(const rpc of ["fulfill_reference_visual_opportunity","commit_reference_visual_evidence","commit_reference_visual_recipe","commit_reference_visual_rights_declaration","commit_reference_visual_sequence","select_reference_visual_candidate"]){assert.ok(authority.includes(rpc),`missing ${rpc}`);}
 assert.match(authority,/reference-visuals\/render/);
 assert.match(authority,/reference-visuals\/acquire/);
 for(const copy of ["Why this visual belongs here","Confirm canonical evidence","Rights and permissions","Save canonical recipe","Create Reference Visual","Verify and add archival still","Build canonical sequence","Use this visual"]){assert.ok(panel.includes(copy),`missing ${copy}`);}
 assert.match(panel,/Forge records your declaration; it does not determine fair use/);
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
