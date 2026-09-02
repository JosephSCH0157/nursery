import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { arbitrateUnifiedVisualPlanCoverage, deriveUnifiedVisualMomentBudget, normalizeUnifiedVisualPlanContextAnchors, OpenAiUnifiedVisualPlanProvider, validateUnifiedVisualPlan, validateUnifiedVisualPlanScope } from "../dist/providers/unified-visual-plan-provider.js";

const migration=await readFile(new URL("../../../supabase/migrations/20260804200000_tongs_unresolved_reference_and_unified_visual_plan.sql",import.meta.url),"utf8");
const fourChildMigration=await readFile(new URL("../../../supabase/migrations/20260805130000_tongs_unified_visual_plan_reference_visual_child.sql",import.meta.url),"utf8");
const service=await readFile(new URL("../src/workpiece-commit-api.ts",import.meta.url),"utf8");
const provider=await readFile(new URL("../src/providers/unified-visual-plan-provider.ts",import.meta.url),"utf8");
const attributionMigration=await readFile(new URL("../../../supabase/migrations/20260902090000_tongs_visual_source_attribution.sql",import.meta.url),"utf8");
const coverageMigration=await readFile(new URL("../../../supabase/migrations/20260902163000_tongs_unified_visual_coverage_exclusivity.sql",import.meta.url),"utf8");
const imageRetentionMigration=await readFile(new URL("../../../supabase/migrations/20260902170000_tongs_unified_image_retention_no_append.sql",import.meta.url),"utf8");

test("cross-family visual coverage is arbitrated before canonical child plans commit",()=>{
  assert.match(provider,/Each script passage belongs to exactly one visual family/);
  assert.match(service,/arbitrateUnifiedVisualPlanCoverage\(\s*normalizeUnifiedVisualPlanContextAnchors/);
  assert.match(service,/assert_unified_visual_plan_coverage_exclusive/);
  assert.match(coverageMigration,/has_workspace_role\(p_workspace_id, 'editor'\)/);
  assert.match(coverageMigration,/having count\(\*\) > 1/);
  assert.match(coverageMigration,/grant execute on function tongs\.assert_unified_visual_plan_coverage_exclusive/);
});

test("image regeneration replaces semantic duplicates and retains selections in place",()=>{
  assert.match(service,/currentByAnchor\s*=\s*new Map/);
  assert.match(service,/retained\?\.candidate_assets\s*\?\?\s*\[\]/);
  assert.match(service,/retained\?\.selected_asset_id\s*\?\?\s*null/);
  assert.match(service,/record_unified_image_plan_membership/);
  assert.doesNotMatch(service,/p_child_kind:"image",p_provider_plan_revision_id/);
  assert.match(imageRetentionMigration,/creator_retained/);
  assert.doesNotMatch(imageRetentionMigration,/\|\|retained_entries/);
  assert.match(imageRetentionMigration,/has_workspace_role\(op\.workspace_id,'editor'\)/);
});

test("visual Source attribution is immutable, role-guarded, and bound to canonical Source links",()=>{
  assert.match(attributionMigration,/create table tongs\.visual_source_attribution_revisions/);
  assert.match(attributionMigration,/create table tongs\.visual_source_attribution_members/);
  assert.match(attributionMigration,/visual_source_attribution_revisions_immutable/);
  assert.match(attributionMigration,/has_workspace_role\(p_workspace_id,'editor'\)/);
  assert.match(attributionMigration,/workpiece_source_link_revisions/);
  assert.match(attributionMigration,/read_current_visual_source_attributions/);
  assert.match(attributionMigration,/resolve_visual_source_attribution/);
  assert.match(attributionMigration,/reassign_reference_clip_source/);
  assert.match(attributionMigration,/reassign_reference_visual_source/);
  assert.match(attributionMigration,/commit_reference_visual_source_set/);
  assert.match(attributionMigration,/visual attribution and family authority diverged/);
  assert.match(attributionMigration,/operation_identity_conflict/);
});

test("source-aware validation rejects invented keys and invalid relationship cardinality",()=>{
  const base={context_before:"",context_focus:"Approved script.",context_after:"",description:"Image",visual_intent:"Explain",creator_direction:"Clear",style:"documentary",placement_hint:"on phrase",source_rationale:"The supplied report supports this visual."};
  const plan={images:[{...base,source_keys:["invented"],source_relationship:"direct"}],broll:[],reference_clips:[],reference_visuals:[]};
  assert.deepEqual(validateUnifiedVisualPlan(plan,"Approved script.",new Set(["src_known"])),["images[0]:unknown_source_key"]);
  plan.images[0]={...base,source_keys:[],source_relationship:"direct"};
  assert.deepEqual(validateUnifiedVisualPlan(plan,"Approved script.",new Set(["src_known"])),["images[0]:direct_source_count"]);
  plan.images[0]={...base,source_keys:["src_known"],source_relationship:"ambiguous"};
  assert.deepEqual(validateUnifiedVisualPlan(plan,"Approved script.",new Set(["src_known"])),["images[0]:ambiguous_source_count"]);
});

test("Reference Clip planning can be unresolved without fabricating Source authority",()=>{
  assert.match(migration,/source_status text not null default 'linked'/);
  assert.match(migration,/source_status='unresolved'.*source_id is null/s);
  assert.match(migration,/source_status='linked'.*source_id is not null/s);
  assert.match(migration,/left join tongs\.source_revisions/);
  assert.match(migration,/source_link_required/);
});

test("Source fulfillment appends an immutable opportunity and advances the plan",()=>{
  assert.match(migration,/create or replace function tongs\.fulfill_reference_clip_opportunity/);
  assert.match(migration,/old\.revision\+1/);
  assert.match(migration,/source_fulfillment/);
  assert.match(migration,/opportunity_revision_conflict/);
  assert.match(service,/action\s*===\s*"fulfill-source"/);
  assert.match(service,/fulfillReferenceClipOpportunity/);
});

test("Unified planning reserves before provider work and records exact child identities",()=>{
  for(const fn of ["begin_unified_visual_plan","record_unified_visual_plan_provider_response","record_unified_visual_plan_child","verify_unified_visual_plan","read_unified_visual_plan_operation"]){
    assert.match(migration,new RegExp(`function tongs\\.${fn}`));
  }
  assert.match(migration,/provider_response_json jsonb/);
  assert.match(migration,/image_map_revision_id uuid/);
  assert.match(migration,/broll_plan_revision_id uuid/);
  assert.match(migration,/reference_clip_plan_revision_id uuid/);
  assert.match(migration,/verified unified visual plan operation is immutable/);
  assert.match(service,/begin_unified_visual_plan[\s\S]*unifiedVisualPlanProvider[\s\S]*record_unified_visual_plan_provider_response/);
  assert.match(service,/state\s*===\s*"provider_completed"[\s\S]*record_unified_visual_plan_child/);
  assert.match(service,/repairEntriesAgainstApprovedScript\(\s*draftEntries,\s*scriptText/);
  assert.doesNotMatch(service,/paragraph_id:`visual-\$\{index\+1\}`/);
  assert.match(service,/state\s*===\s*"image_plan_committed"[\s\S]*commit_broll_plan/);
  assert.match(service,/state\s*===\s*"broll_plan_committed"[\s\S]*commit_reference_clip_plan/);
  assert.match(service,/verify_unified_visual_plan/);
  assert.match(provider,/never invent a Source, statistic, quote, URL, archive, rights claim, or existing asset/);
});

test("v2 unified planning requires four canonical children while preserving v1 receipts",()=>{
  assert.match(fourChildMigration,/forge\.unified-visual-plan\.v1','forge\.unified-visual-plan\.v2/);
  assert.match(fourChildMigration,/reference_visual_plan_committed/);
  assert.match(fourChildMigration,/p_child_kind='reference_visual'/);
  assert.match(fourChildMigration,/reference_visual_plan_content_hash/);
  assert.match(fourChildMigration,/'empty',op\.reference_visual_plan_empty/);
  assert.match(fourChildMigration,/historical three-child evidence/);
  assert.match(service,/state\s*===\s*"reference_plan_committed"[\s\S]*commit_reference_visual_plan[\s\S]*reference_visual_plan_committed/);
});

test("Unified provider submits once and validates exact script-relative mixed output",async()=>{
  const originalFetch=globalThis.fetch;let calls=0;let providerInput=null;const script="The growers moved south through Florida.";const plan={images:[{context_before:"",context_focus:script,context_after:"",description:"Florida citrus growers relocating",visual_intent:"Explain geographic change",creator_direction:"Show a Florida map",style:"documentary",placement_hint:"on phrase"}],broll:[{context_before:"",context_focus:script,context_after:"",narrative_purpose:"Show movement",placement_hint:"on phrase",duration_target_ms:5000,shot_type:"tracking",motion_intent:"Vehicles move south",mood_pacing:"steady",asset_category:"location"}],reference_clips:[{context_before:"",context_focus:script,context_after:"",editorial_reason:"Authentic archive establishes the historical scale",desired_material:"Archival Florida citrus packing footage",search_terms:["Florida citrus archive","orange packing house"],narrative_purpose:"Ground the history",placement_hint:"on phrase",duration_target_ms:6000}],reference_visuals:[]};
  globalThis.fetch=async(_url,init)=>{calls+=1;providerInput=JSON.parse(JSON.parse(String(init.body)).input);return new Response(JSON.stringify({id:"response-1",output:[{content:[{text:JSON.stringify(plan)}]}],usage:{input_tokens:10,output_tokens:20}}),{status:200,headers:{"x-request-id":"request-1"}});};
  try{const result=await new OpenAiUnifiedVisualPlanProvider("test-key").generate({scriptText:script,creatorDirection:null,generationScope:"full_media_plan"});assert.equal(calls,1);assert.equal(providerInput.generation_scope,"full_media_plan");assert.deepEqual(result.plan,plan);assert.deepEqual(validateUnifiedVisualPlan(result.plan,script),[]);}finally{globalThis.fetch=originalFetch;}
});

test("mixed planning selects one strongest family for an overlapping script span",()=>{
  const focus="County data showed average waits around 42 minutes.";
  const source={source_keys:["src_report"],source_relationship:"direct",source_rationale:"County reporting supports the number."};
  const plan={
    images:[{context_before:"",context_focus:focus,context_after:"",description:"Transit rider",visual_intent:"Explain",creator_direction:"Show transit",style:"documentary",placement_hint:"on claim",...source}],
    broll:[{context_before:"",context_focus:focus,context_after:"",narrative_purpose:"Show transit",placement_hint:"on claim",duration_target_ms:5000,shot_type:"wide",motion_intent:"Bus moving",mood_pacing:"steady",asset_category:"transit",...source}],
    reference_clips:[{context_before:"",context_focus:focus,context_after:"",editorial_reason:"News report",desired_material:"Original report",search_terms:["wait report"],narrative_purpose:"Corroborate",placement_hint:"on claim",duration_target_ms:5000,...source}],
    reference_visuals:[{context_before:"",context_focus:focus,context_after:"",visual_subtype:"stat_card",editorial_reason:"Make the wait legible",audience_understanding:"See the number",required_evidence:"42 minute average",required_source_type:"report",desired_material:"Stat card",search_terms:["wait data"],placement_hint:"on claim",duration_target_ms:5000,creator_direction:"Use exact value",...source}],
  };
  const result=arbitrateUnifiedVisualPlanCoverage(plan,focus);
  assert.equal(result.reference_visuals.length,1);
  assert.equal(result.images.length+result.broll.length+result.reference_clips.length,0);
});

test("coverage arbitration keeps non-overlapping moments and prefers motion B-roll",()=>{
  const first="Riders boarded buses across the county.";const second="The service cost $2.50 at peak hours.";const script=`${first} ${Array.from({length:180},()=>"narration").join(" ")} ${second}`;
  const none={source_keys:[],source_relationship:"none",source_rationale:"No source required."};
  const plan={images:[{context_before:"",context_focus:first,context_after:"",description:"Bus",visual_intent:"Coverage",creator_direction:"Show bus",style:"documentary",placement_hint:"on line",...none}],broll:[{context_before:"",context_focus:first,context_after:"",narrative_purpose:"Show riders boarding",placement_hint:"on line",duration_target_ms:4000,shot_type:"wide",motion_intent:"Riders board",mood_pacing:"steady",asset_category:"transit",...none}],reference_clips:[],reference_visuals:[{context_before:"",context_focus:second,context_after:"",visual_subtype:"stat_card",editorial_reason:"Show price",audience_understanding:"See fare",required_evidence:"Peak fare",required_source_type:"fare page",desired_material:"Fare card",search_terms:["peak fare"],placement_hint:"on line",duration_target_ms:4000,creator_direction:"Show $2.50",source_keys:["src_fare"],source_relationship:"direct",source_rationale:"Fare page."}]};
  const result=arbitrateUnifiedVisualPlanCoverage(plan,script);
  assert.equal(result.broll.length,1);assert.equal(result.images.length,0);assert.equal(result.reference_visuals.length,1);
});

test("coverage arbitration enforces a duration-aware episode-wide visual budget",()=>{
  const moments=Array.from({length:24},(_,index)=>`Moment ${index+1} explains a distinct part of the episode with enough narration words for timing.`);const script=moments.join(" ");const none={source_keys:[],source_relationship:"none",source_rationale:"No source required."};
  const plan={images:moments.map((focus,index)=>({context_before:"",context_focus:focus,context_after:"",description:`Image ${index+1}`,visual_intent:"Explain",creator_direction:"Clear",style:"documentary",placement_hint:"on line",...none})),broll:[],reference_clips:[],reference_visuals:[]};
  const result=arbitrateUnifiedVisualPlanCoverage(plan,script);
  assert.equal(result.images.length,deriveUnifiedVisualMomentBudget(script));
  const hourScript=Array.from({length:9000},()=>"word").join(" ");
  assert.ok(deriveUnifiedVisualMomentBudget(hourScript)>=37);
});

test("generation scope fails closed when provider output widens the selected media family",()=>{
  const item={context_before:"",context_focus:"Approved script.",context_after:"",description:"Image",visual_intent:"Explain",creator_direction:"Clear",style:"documentary",placement_hint:"on phrase"};
  const plan={images:[item],broll:[],reference_clips:[{context_before:"",context_focus:"Approved script.",context_after:"",editorial_reason:"Archive",desired_material:"Footage",search_terms:["archive"],narrative_purpose:"Ground",placement_hint:"on phrase",duration_target_ms:4000}],reference_visuals:[]};
  assert.deepEqual(validateUnifiedVisualPlanScope(plan,"images_broll"),["reference_clips:disallowed_by_generation_scope"]);
  assert.deepEqual(validateUnifiedVisualPlanScope(plan,"full_media_plan"),[]);
  assert.match(service,/generation_scope:\s*input\.generation_scope/);
  assert.match(service,/validateUnifiedVisualPlanScope\(\s*plan,\s*generationScope[\s\S]*visual_plan_scope_violation[\s\S]*state\s*===\s*"provider_completed"/);
  assert.match(service,/generation_scope:\s*normalizeUnifiedVisualPlanGenerationScope\(\s*body\.generation_scope/);
});

test("individual visual categories may be empty but the complete plan may not",()=>{
  assert.deepEqual(validateUnifiedVisualPlan({images:[],broll:[],reference_clips:[],reference_visuals:[]},"Approved script."),["visual_plan:empty"]);
  assert.match(provider,/images:\s*\{\s*type:\s*"array",\s*minItems:\s*1/);
  assert.match(provider,/named public figures/);
  assert.doesNotMatch(provider,/images:required|broll:required|reference_clips:required|reference_visuals:required/);
});

test("stored provider output recovers a unique exact script span across whitespace differences",()=>{
  const script="Florida citrus didn’t start small.\nCommercial production took off after the Civil War.\nRailroads connected the state to northern markets.";
  const plan={images:[],broll:[],reference_clips:[],reference_visuals:[{context_before:"",context_focus:"Florida citrus didn’t start small.\nCommercial production took off after the Civil War.\n\nRailroads connected the state to northern markets.",context_after:"",visual_subtype:"timeline",editorial_reason:"Explain the history",audience_understanding:"See the sequence",required_evidence:"Exact historical dates",required_source_type:"State archive",desired_material:"Sourced timeline",search_terms:["Florida citrus history"],placement_hint:"During the history passage",duration_target_ms:5000,creator_direction:"Use exact evidence"}]};
  normalizeUnifiedVisualPlanContextAnchors(plan,script);
  assert.equal(plan.reference_visuals[0].context_focus,script);
  assert.deepEqual(validateUnifiedVisualPlan(plan,script),[]);
});

test("stored provider output chooses a unique exact sentence when script structure separates its prose",()=>{
  const script="[s1]\nFlorida citrus didn’t start small.\nCommercial production took off after the Civil War.\n[/s1]\n\n[s1]\nRailroads connected the state to northern markets.\n[/s1]";
  const plan={images:[],broll:[],reference_clips:[],reference_visuals:[{context_before:"",context_focus:"Florida citrus didn’t start small.\nCommercial production took off after the Civil War.\n\nRailroads connected the state to northern markets.",context_after:"",visual_subtype:"timeline",editorial_reason:"Explain the history",audience_understanding:"See the sequence",required_evidence:"Exact historical dates",required_source_type:"State archive",desired_material:"Sourced timeline",search_terms:["Florida citrus history"],placement_hint:"During the history passage",duration_target_ms:5000,creator_direction:"Use exact evidence"}]};
  normalizeUnifiedVisualPlanContextAnchors(plan,script);
  assert.equal(plan.reference_visuals[0].context_focus,"Commercial production took off after the Civil War.");
  assert.deepEqual(validateUnifiedVisualPlan(plan,script),[]);
});
