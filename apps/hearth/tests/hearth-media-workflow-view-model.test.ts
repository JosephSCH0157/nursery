import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { deriveHearthMediaWorkflow } from "../src/lib/hearth-media-workflow-view-model";

const input=(overrides:Record<string,unknown>={})=>({hasApprovedScript:true,visualPlan:{status:null,total:0,images:0,broll:0,referenceClips:0,referenceVisuals:0,version:0},thumbnails:{eligible:0,total:0},images:{planned:0,completed:0,canonicalCount:0,projectionLoaded:true},referenceClips:{planned:0,completed:0,exists:false},referenceVisuals:{planned:0,completed:0,exists:false},broll:{planned:0,completed:0},...overrides});

test("cold recovery selects the first canonically incomplete stage",()=>{
  assert.equal(deriveHearthMediaWorkflow(input()).activeStage,"visual_plan");
  assert.equal(deriveHearthMediaWorkflow(input({visualPlan:{status:"activated",total:4,images:3,broll:1,version:1}})).activeStage,"thumbnails");
  assert.equal(deriveHearthMediaWorkflow(input({visualPlan:{status:"activated",total:4,images:3,broll:1,version:1},thumbnails:{eligible:3,total:3,previewAssetPaths:["a","b","c"]},images:{planned:3,completed:1,canonicalCount:3,projectionLoaded:true}})).activeStage,"images");
  assert.equal(deriveHearthMediaWorkflow(input({visualPlan:{status:"activated",total:5,images:3,broll:1,referenceClips:1,version:1},thumbnails:{eligible:3,total:3,previewAssetPaths:["a","b","c"]},images:{planned:3,completed:3,canonicalCount:3,projectionLoaded:true},referenceClips:{planned:1,completed:0,exists:true},broll:{planned:1,completed:0}})).activeStage,"reference_clips");
  assert.equal(deriveHearthMediaWorkflow(input({visualPlan:{status:"activated",total:5,images:3,broll:1,referenceClips:1,version:1},thumbnails:{eligible:3,total:3,previewAssetPaths:["a","b","c"]},images:{planned:3,completed:3,canonicalCount:3,projectionLoaded:true},referenceClips:{planned:1,completed:1,exists:true},broll:{planned:1,completed:0}})).activeStage,"broll");
  assert.equal(deriveHearthMediaWorkflow(input({visualPlan:{status:"fulfilled",total:5,images:3,broll:1,referenceClips:1,version:1},thumbnails:{eligible:3,total:3,previewAssetPaths:["a","b","c"]},images:{planned:3,completed:3,canonicalCount:3,projectionLoaded:true},referenceClips:{planned:1,completed:1,exists:true},broll:{planned:1,completed:1}})).activeStage,"review");
});

test("thumbnail completion requires three Tongs-eligible candidates",()=>{
  const workflow=deriveHearthMediaWorkflow(input({visualPlan:{status:"activated",total:2,images:2,broll:0,version:1},thumbnails:{eligible:2,total:3}}));
  assert.equal(workflow.stages[1]?.status,"in_progress");assert.equal(workflow.activeStage,"thumbnails");
});

test("approved short episodes can create thumbnails without visual opportunities",()=>{
  const workflow=deriveHearthMediaWorkflow(input({visualPlan:{status:null,total:0,images:0,broll:0,version:0},thumbnails:{eligible:0,total:0},images:{planned:0,completed:0,canonicalCount:0,projectionLoaded:true}}));
  assert.equal(workflow.stages[1]?.status,"ready");
  assert.equal(workflow.stages[1]?.reviewAvailable,true);
});

test("thumbnail completion requires three recoverable canonical preview paths",()=>{
  const workflow=deriveHearthMediaWorkflow(input({visualPlan:{status:"activated",total:2,images:2,broll:0,version:1},thumbnails:{eligible:3,total:3,previewAssetPaths:[]}}));
  assert.equal(workflow.stages[1]?.status,"in_progress");assert.equal(workflow.activeStage,"thumbnails");
});

test("thumbnail refresh failure cannot preserve a stale complete workflow projection",()=>{
  const workflow=deriveHearthMediaWorkflow(input({visualPlan:{status:"activated",total:2,images:2,broll:0,version:1},thumbnails:{eligible:3,total:3,previewAssetPaths:["a","b","c"],authorityState:"error"}}));
  assert.equal(workflow.stages[1]?.status,"needs_attention");
  assert.equal(workflow.stages[1]?.summary,"Canonical thumbnail status could not be refreshed");
  assert.equal(workflow.activeStage,"thumbnails");
});

test("cold recovery opens Images with canonical thumbnail preview identities",()=>{
  const workflow=deriveHearthMediaWorkflow(input({visualPlan:{status:"activated",total:2,images:2,broll:0,version:1},thumbnails:{eligible:3,total:3,previewAssetPaths:["a","b","c"]},images:{planned:2,completed:0,canonicalCount:2,projectionLoaded:true}}));
  assert.equal(workflow.stages[1]?.status,"complete");
  assert.equal(workflow.stages[1]?.summary,"Three thumbnail candidates are ready");
  assert.equal(workflow.activeStage,"images");
});

test("strict image and B-roll completion never infers skipped work",()=>{
  const workflow=deriveHearthMediaWorkflow(input({visualPlan:{status:"activated",total:3,images:2,broll:1,version:1},thumbnails:{eligible:3,total:3,previewAssetPaths:["a","b","c"]},images:{planned:2,completed:1,canonicalCount:2,projectionLoaded:true},broll:{planned:1,completed:1}}));
  assert.equal(workflow.activeStage,"images");assert.equal(workflow.stages[4]?.status,"blocked");
});

test("Reference Material follows Images and combines Source Clip and Reference Visual progress",()=>{
  const workflow=deriveHearthMediaWorkflow(input({visualPlan:{status:"activated",total:4,images:2,broll:1,referenceClips:1,version:1},thumbnails:{eligible:3,total:3,previewAssetPaths:["a","b","c"]},images:{planned:2,completed:2,canonicalCount:2,projectionLoaded:true},referenceClips:{planned:1,completed:0,exists:true},broll:{planned:1,completed:0}}));
  assert.equal(workflow.activeStage,"reference_clips");
  assert.equal(workflow.stages[3]?.label,"Reference Material");
  assert.equal(workflow.stages[3]?.summary,"0 of 1 sourced Clips · 0 of 0 sourced Visuals");
  assert.equal(workflow.stages[4]?.status,"ready");
});

test("Reference Material remains accessible while Images are incomplete",()=>{
  const workflow=deriveHearthMediaWorkflow(input({visualPlan:{status:"activated",total:5,images:3,broll:0,referenceClips:1,referenceVisuals:1,version:4},thumbnails:{eligible:3,total:3,previewAssetPaths:["a","b","c"]},images:{planned:3,completed:0,canonicalCount:3,projectionLoaded:true},referenceClips:{planned:1,completed:0,exists:true},referenceVisuals:{planned:1,completed:0,exists:true}}));
  assert.equal(workflow.stages[2]?.status,"ready");
  assert.equal(workflow.stages[2]?.summary,"0 of 3 images ready");
  assert.equal(workflow.stages[3]?.status,"ready");
  assert.equal(workflow.stages[3]?.reviewAvailable,true);
  assert.equal(workflow.stages[5]?.status,"blocked");
});

test("canonical empty Reference Material child plans are accessible",()=>{
  const workflow=deriveHearthMediaWorkflow(input({visualPlan:{status:"activated",total:2,images:2,broll:0,referenceClips:0,referenceVisuals:0,version:4},images:{planned:2,completed:0,canonicalCount:2,projectionLoaded:true},referenceClips:{planned:0,completed:0,exists:true},referenceVisuals:{planned:0,completed:0,exists:true}}));
  assert.equal(workflow.stages[3]?.status,"complete");
  assert.equal(workflow.stages[3]?.reviewAvailable,true);
});

test("verified zero Reference Material requirements cannot block episode completion",()=>{
  const workflow=deriveHearthMediaWorkflow(input({visualPlan:{status:"activated",total:16,images:16,broll:0,referenceClips:0,referenceVisuals:0,version:4},thumbnails:{eligible:3,total:3,previewAssetPaths:["a","b","c"]},images:{planned:16,completed:16,canonicalCount:16,projectionLoaded:true},referenceClips:{planned:0,completed:0,exists:false,authorityState:"available"},referenceVisuals:{planned:0,completed:0,exists:false,authorityState:"available"},broll:{planned:0,completed:0}}));
  assert.equal(workflow.stages[3]?.status,"complete");
  assert.equal(workflow.stages[3]?.reviewAvailable,true);
  assert.equal(workflow.stages[5]?.status,"ready");
  assert.equal(workflow.activeStage,"review");
  assert.equal(workflow.overallStatus,"ready_for_review");
});

test("unsourced planning suggestions remain reviewable but cannot block episode completion",()=>{
  const workflow=deriveHearthMediaWorkflow(input({visualPlan:{status:"activated",total:13,images:1,broll:2,referenceClips:2,referenceVisuals:8,version:4},thumbnails:{eligible:3,total:3,previewAssetPaths:["a","b","c"]},images:{planned:1,completed:1,canonicalCount:1,projectionLoaded:true},referenceClips:{planned:0,completed:0,unsourced:2,exists:true,authorityState:"available"},referenceVisuals:{planned:0,completed:0,unsourced:8,exists:true,authorityState:"available"},broll:{planned:2,completed:2}}));
  assert.equal(workflow.stages[3]?.status,"complete");
  assert.equal(workflow.stages[3]?.reviewAvailable,true);
  assert.equal(workflow.stages[3]?.summary,"0 of 0 sourced Clips · 0 of 0 sourced Visuals · 10 unsourced suggestions (optional)");
  assert.equal(workflow.stages[5]?.status,"ready");
});

test("zero Reference Material remains fail-closed until both canonical authorities load",()=>{
  const workflow=deriveHearthMediaWorkflow(input({visualPlan:{status:"activated",total:16,images:16,broll:0,referenceClips:0,referenceVisuals:0,version:4},thumbnails:{eligible:3,total:3,previewAssetPaths:["a","b","c"]},images:{planned:16,completed:16,canonicalCount:16,projectionLoaded:true},referenceClips:{planned:0,completed:0,exists:false,authorityState:"error"},referenceVisuals:{planned:0,completed:0,exists:false,authorityState:"available"},broll:{planned:0,completed:0}}));
  assert.equal(workflow.stages[3]?.status,"blocked");
  assert.equal(workflow.stages[5]?.status,"blocked");
  assert.equal(workflow.overallStatus,"in_progress");
});

test("upstream revision requests review without deleting downstream summaries",()=>{
  const workflow=deriveHearthMediaWorkflow(input({visualPlan:{status:"activated",total:3,images:2,broll:1,version:2},thumbnails:{eligible:3,total:3,previewAssetPaths:["a","b","c"]},images:{planned:2,completed:2,canonicalCount:2,projectionLoaded:true},broll:{planned:1,completed:1},upstreamChanged:true}));
  assert.equal(workflow.activeStage,"visual_plan");assert.equal(workflow.stages[2]?.status,"blocked");assert.match(workflow.stages[2]?.summary??"",/2 of 2/);
});

test("creator UI translates Visual Plan while canonical media_map identities remain",async()=>{
  const surface=await readFile(new URL("../src/views/surfaces/VisualsSurface.tsx",import.meta.url),"utf8");
  const panel=await readFile(new URL("../src/components/visuals/EpisodeMediaMapPanel.tsx",import.meta.url),"utf8");
  const css=await readFile(new URL("../src/views/surfaces/VisualsSurface.css",import.meta.url),"utf8");
  const repo=await readFile(new URL("../src/lib/hearth-media-map-repo.ts",import.meta.url),"utf8");
  assert.match(surface,/Visual Plan/);assert.match(panel,/Create visual plan/);assert.doesNotMatch(surface,/Collapse/);assert.match(surface,/aria-live="polite"/);assert.match(css,/prefers-reduced-motion/);
  assert.match(surface,/displayedStage==="reference_clips"/);
  assert.doesNotMatch(surface,/Canonical Reference Clip opportunities/);
  assert.match(repo,/hearth\/media_map\.v1\.json/);assert.match(repo,/media_map/);
  assert.match(repo,/HEARTH_MEDIA_MAP_RECOVERY_PATH\)\}&optional=1/);
});

test("generated thumbnail revisions are reported as awaiting finalization",()=>{
  const workflow=deriveHearthMediaWorkflow(input({visualPlan:{status:"activated",total:2,images:2,broll:0,version:1},thumbnails:{eligible:0,total:0,pending:3,previewAssetPaths:[]}}));
  assert.equal(workflow.stages[1]?.status,"in_progress");
  assert.equal(workflow.stages[1]?.summary,"3 generated · awaiting thumbnail-set finalization");
  assert.equal(workflow.activeStage,"thumbnails");
});

test("stage navigation contains no automatic generation, credit, Hammer, or Quench action",async()=>{
  const source=await readFile(new URL("../src/lib/hearth-media-workflow-view-model.ts",import.meta.url),"utf8");
  for(const forbidden of [/generateThumbnail/,/consume.*credit/i,/publish/i,/experiment/i,/timeline/i])assert.doesNotMatch(source,forbidden);
});
