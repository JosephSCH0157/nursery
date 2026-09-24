import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const authority=readFileSync(new URL("../src/lib/hearth-reference-visual-authority.ts",import.meta.url),"utf8");
const panel=readFileSync(new URL("../src/components/visuals/CanonicalReferenceVisualPanel.tsx",import.meta.url),"utf8");
const referenceClipAuthority=readFileSync(new URL("../src/lib/hearth-reference-clip-authority.ts",import.meta.url),"utf8");
const referenceClipPanel=readFileSync(new URL("../src/components/visuals/CanonicalReferenceClipPanel.tsx",import.meta.url),"utf8");
const shell=readFileSync(new URL("../src/components/visuals/CanonicalReferenceMaterialPanel.tsx",import.meta.url),"utf8");
const materialWorkflow=readFileSync(new URL("../src/lib/hearth-reference-material-workflow.ts",import.meta.url),"utf8");
const visualStyles=readFileSync(new URL("../src/views/surfaces/VisualsSurface.css",import.meta.url),"utf8");
const unified=readFileSync(new URL("../src/lib/hearth-unified-visual-plan-authority.ts",import.meta.url),"utf8");
const postResetSelection=readFileSync(new URL("../../../supabase/migrations/20260812153000_tongs_reference_visual_post_reset_selection.sql",import.meta.url),"utf8");

test("Reference Material projects Clips and Visuals into one creator review queue",()=>{
 assert.match(shell,/projectReferenceReviewItems/);
 assert.match(shell,/readCanonicalReferenceClips/);
 assert.match(shell,/readCanonicalReferenceVisualCollections/);
 for(const decision of ["Edit","Replace","Skip"])assert.match(shell,new RegExp(`>\\s*${decision}\\s*<`));
 assert.doesNotMatch(shell,/"Prepare image"/);
 assert.match(materialWorkflow,/projectReferenceVisualCustomerWorkflow/);
 assert.doesNotMatch(materialWorkflow,/rights_drawer|source_drawer|acquisition_drawer/);
 assert.match(shell,/"Add Source"/);
 assert.doesNotMatch(shell,/Save rights/);
 assert.doesNotMatch(shell,/Acquire image/);
 assert.doesNotMatch(shell,/"prepare"/);
 assert.doesNotMatch(shell,/commitReferenceVisualRights|acquireReferenceVisual/);
 assert.doesNotMatch(shell,/Save rights and add image/);
 assert.match(shell,/No canonical Source linked/);
 assert.match(shell,/unsourced planning suggestion,\s+not episode\s+Reference Material/);
 assert.match(shell,/Add Source/);
 assert.doesNotMatch(shell,/role="tablist"/);
});

test("the canonical detailed Reference Visual workflow is production-reachable from Reference Material",()=>{
 assert.match(shell,/import CanonicalReferenceVisualPanel/);
 assert.match(shell,/<CanonicalReferenceVisualPanel/);
 assert.match(shell,/focus=\{visualWorkflowFocus\}/);
 assert.match(shell,/data-presentation-mode="workspace"/);
 assert.match(shell,/if \(visualWorkflowFocus\) \{[\s\S]*return \([\s\S]*<CanonicalReferenceVisualPanel[\s\S]*\);[\s\S]*\}[\s\S]*return \([\s\S]*hs-reference-review-queue/);
 assert.match(shell,/returnCardKey\.current = visualWorkflowFocus\?\.returnCardKey/);
 assert.match(shell,/card\?\.scrollIntoView\(\{[\s\S]*?behavior: preferredScrollBehavior\(\),[\s\S]*?block: "center",?[\s\S]*?\}\)/);
 assert.match(shell,/card\?\.focus\(\{ preventScroll: true \}\)/);
 assert.match(shell,/item\.family === "reference_clip" \? \([\s\S]*>\s*Edit\s*</);
 assert.match(panel,/focus\?\.opportunityId/);
 assert.match(panel,/Back to Reference Material/);
});

test("the stage rail controls one active workflow body without locking completed stages",()=>{
 assert.match(panel,/setActiveStageId\(stageId\)/);
 assert.match(panel,/stage\.id===activeStageId\?" is-active":""/);
 assert.match(panel,/aria-current=\{stage\.id===customerWorkflow\.currentStageId\?"step":undefined\}/);
 assert.match(panel,/data-browsed=\{stage\.id===activeStageId\?"true":undefined\}/);
 for(const stage of ["source","evidence","usage-rights","design","generate"])assert.ok(panel.includes(`activeStageId==="${stage}"`),`missing active-body gate for ${stage}`);
 assert.match(panel,/preferredScrollBehavior/);
 assert.match(panel,/prefers-reduced-motion: reduce/);
 assert.doesNotMatch(panel,/disabled=\{stage\.status==="blocked"\}/);
 assert.match(panel,/Return to next step/);
 assert.match(panel,/currentCandidates=opportunity\?\.candidates\.filter\(candidate=>candidate\.currentForPlan!==false\)/);
 assert.match(panel,/Historical candidates/);
 assert.match(panel,/they are not current and cannot be selected/);
 assert.match(visualStyles,/button\.is-active/);
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
 assert.match(panel,/Find stills on linked Source/);
 assert.match(panel,/imageCandidates/);
 assert.match(panel,/Verify and add this still/);
});

test("Hearth leads creators from confirmed evidence to a canonical finished visual",()=>{
 for(const copy of ["Find supporting evidence","Confirm evidence","Prepare visual design","Generate visual","Adjust design","Use this visual","no AI image credits"]){assert.ok(panel.includes(copy),`missing ${copy}`);}
 assert.match(authority,/proposeReferenceVisualRecipe/);
 assert.match(authority,/source_evidence_revision_ids/);
 assert.match(authority,/target_duration_ms/);
 assert.match(authority,/reference-visuals\/render/);
 assert.match(authority,/args\.opportunity\.subtype==="comparison"\|\|args\.opportunity\.subtype==="stat_card"\?"3"/);
 assert.match(authority,/renderer_name:rendererName,renderer_version:version/);
 assert.doesNotMatch(authority,/imageToVideo|textToImage|generateImage|debit.*credit/i);
});

test("linked Reference Material Sources can be changed or removed canonically",()=>{
 assert.match(authority,/reassign_reference_visual_source/);
 assert.match(authority,/removeReferenceVisualSource/);
 assert.match(referenceClipAuthority,/reassign_reference_clip_source/);
 assert.match(referenceClipAuthority,/removeReferenceClipSource/);
 assert.match(panel,/Change Current Source/);
 assert.match(panel,/Remove Current Source/);
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

test("Reference Visual evidence has a distinct canonical start-over action that preserves Sources",()=>{
 assert.match(panel,/Clear evidence and start over/);
 assert.match(panel,/Linked Sources, Source use, and rights stay attached/);
 assert.match(panel,/role="dialog"/);
 assert.match(panel,/verifying canonical readback/);
 assert.doesNotMatch(panel,/window\.confirm\("Clear all confirmed evidence/);
 assert.match(panel,/clearReferenceVisualEvidence/);
 assert.match(authority,/reset_reference_visual_evidence/);
 assert.match(authority,/p_reset_request_id/);
});

test("candidate selection reports failures and can continue its revision chain after start over",()=>{
 assert.match(authority,/selectReferenceVisual[\s\S]*requireCommitted/);
 assert.match(postResetSelection,/active_revision:=case/);
 assert.match(postResetSelection,/previous_selection\.created_at<=latest_reset/);
 assert.match(postResetSelection,/coalesce\(previous_selection\.revision,0\)\+1/);
});

test("structured Source evidence explains inspected media and keeps stronger-Source choice creator controlled",()=>{
 for(const copy of ["What Forge checked","Page text","Structured chart data","Graphics","Current result:","Other available paths","Inspect chart again","Another Source in this episode more directly supports this visual.","Make Current Source"]){assert.ok(panel.includes(copy),`missing ${copy}`);}
 assert.match(panel,/extractReferenceVisualCollectionEvidence/);
 assert.match(panel,/projectReferenceVisualSourceChoice\(current,promoted,"promote"\)/);
 assert.doesNotMatch(panel,/OpenAI|OCR|vision provider|estimate.*geometry/i);
 assert.match(panel,/Linked Sources and confirmed work remain preserved/);
});

test("Reference Clips can be canonically converted to Reference Visuals without losing anchors or Source provenance",()=>{
 assert.match(referenceClipPanel,/Better as a visual\?/);
 assert.match(referenceClipPanel,/Convert to Reference Visual/);
 assert.match(referenceClipPanel,/convert_reference_clip_to_reference_visual/);
 assert.match(referenceClipPanel,/canonical_script_anchor:opportunity\.citation/);
 assert.match(referenceClipPanel,/preserve_source_revision_id:opportunity\.source\?\.revisionId/);
 assert.match(referenceClipPanel,/preserve_source_link_revision_id:opportunity\.sourceLinkRevisionId/);
 assert.match(referenceClipPanel,/context_focus|focus:opportunity\.focus/);
 assert.match(referenceClipPanel,/commitReferenceVisualSourceCollection/);
 assert.match(referenceClipPanel,/linkedVisual\?\.sourceRevisionId!==opportunity\.source\.revisionId/);
 assert.match(referenceClipPanel,/reason:"duplicate_coverage"/);
 assert.match(referenceClipPanel,/original clip remains active/i);
 assert.match(authority,/\.\.\.\(args\.opportunity\.creatorRequest\?\?\{\}\)/);
});
