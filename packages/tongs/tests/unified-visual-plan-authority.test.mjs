import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { normalizeUnifiedVisualPlanContextAnchors, OpenAiUnifiedVisualPlanProvider, validateUnifiedVisualPlan } from "../dist/providers/unified-visual-plan-provider.js";

const migration=await readFile(new URL("../../../supabase/migrations/20260804200000_tongs_unresolved_reference_and_unified_visual_plan.sql",import.meta.url),"utf8");
const fourChildMigration=await readFile(new URL("../../../supabase/migrations/20260805130000_tongs_unified_visual_plan_reference_visual_child.sql",import.meta.url),"utf8");
const service=await readFile(new URL("../src/workpiece-commit-api.ts",import.meta.url),"utf8");
const provider=await readFile(new URL("../src/providers/unified-visual-plan-provider.ts",import.meta.url),"utf8");

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
  assert.match(service,/action==="fulfill-source"/);
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
  assert.match(service,/state==="provider_completed"[\s\S]*record_unified_visual_plan_child/);
  assert.match(service,/state==="image_plan_committed"[\s\S]*commit_broll_plan/);
  assert.match(service,/state==="broll_plan_committed"[\s\S]*commit_reference_clip_plan/);
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
  assert.match(service,/state==="reference_plan_committed"[\s\S]*commit_reference_visual_plan[\s\S]*reference_visual_plan_committed/);
});

test("Unified provider submits once and validates exact script-relative mixed output",async()=>{
  const originalFetch=globalThis.fetch;let calls=0;const script="The growers moved south through Florida.";const plan={images:[{context_before:"",context_focus:script,context_after:"",description:"Florida citrus growers relocating",visual_intent:"Explain geographic change",creator_direction:"Show a Florida map",style:"documentary",placement_hint:"on phrase"}],broll:[{context_before:"",context_focus:script,context_after:"",narrative_purpose:"Show movement",placement_hint:"on phrase",duration_target_ms:5000,shot_type:"tracking",motion_intent:"Vehicles move south",mood_pacing:"steady",asset_category:"location"}],reference_clips:[{context_before:"",context_focus:script,context_after:"",editorial_reason:"Authentic archive establishes the historical scale",desired_material:"Archival Florida citrus packing footage",search_terms:["Florida citrus archive","orange packing house"],narrative_purpose:"Ground the history",placement_hint:"on phrase",duration_target_ms:6000}],reference_visuals:[]};
  globalThis.fetch=async()=>{calls+=1;return new Response(JSON.stringify({id:"response-1",output:[{content:[{text:JSON.stringify(plan)}]}],usage:{input_tokens:10,output_tokens:20}}),{status:200,headers:{"x-request-id":"request-1"}});};
  try{const result=await new OpenAiUnifiedVisualPlanProvider("test-key").generate({scriptText:script,creatorDirection:null});assert.equal(calls,1);assert.deepEqual(result.plan,plan);assert.deepEqual(validateUnifiedVisualPlan(result.plan,script),[]);}finally{globalThis.fetch=originalFetch;}
});

test("every visual category may be intentionally empty",()=>{
  assert.deepEqual(validateUnifiedVisualPlan({images:[],broll:[],reference_clips:[],reference_visuals:[]},"Approved script."),[]);
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
