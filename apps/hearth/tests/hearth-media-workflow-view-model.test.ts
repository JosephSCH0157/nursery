import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { deriveHearthMediaWorkflow } from "../src/lib/hearth-media-workflow-view-model";

const input=(overrides:Record<string,unknown>={})=>({hasApprovedScript:true,visualPlan:{status:null,total:0,images:0,broll:0,version:0},thumbnails:{eligible:0,total:0},images:{planned:0,completed:0},broll:{planned:0,completed:0},...overrides});

test("cold recovery selects the first canonically incomplete stage",()=>{
  assert.equal(deriveHearthMediaWorkflow(input()).activeStage,"visual_plan");
  assert.equal(deriveHearthMediaWorkflow(input({visualPlan:{status:"activated",total:4,images:3,broll:1,version:1}})).activeStage,"thumbnails");
  assert.equal(deriveHearthMediaWorkflow(input({visualPlan:{status:"activated",total:4,images:3,broll:1,version:1},thumbnails:{eligible:3,total:3},images:{planned:3,completed:1}})).activeStage,"images");
  assert.equal(deriveHearthMediaWorkflow(input({visualPlan:{status:"activated",total:4,images:3,broll:1,version:1},thumbnails:{eligible:3,total:3},images:{planned:3,completed:3},broll:{planned:1,completed:0}})).activeStage,"broll");
  assert.equal(deriveHearthMediaWorkflow(input({visualPlan:{status:"fulfilled",total:4,images:3,broll:1,version:1},thumbnails:{eligible:3,total:3},images:{planned:3,completed:3},broll:{planned:1,completed:1}})).activeStage,"review");
});

test("thumbnail completion requires three Tongs-eligible candidates",()=>{
  const workflow=deriveHearthMediaWorkflow(input({visualPlan:{status:"activated",total:2,images:2,broll:0,version:1},thumbnails:{eligible:2,total:3}}));
  assert.equal(workflow.stages[1]?.status,"in_progress");assert.equal(workflow.activeStage,"thumbnails");
});

test("strict image and B-roll completion never infers skipped work",()=>{
  const workflow=deriveHearthMediaWorkflow(input({visualPlan:{status:"activated",total:3,images:2,broll:1,version:1},thumbnails:{eligible:3,total:3},images:{planned:2,completed:1},broll:{planned:1,completed:1}}));
  assert.equal(workflow.activeStage,"images");assert.equal(workflow.stages[3]?.status,"blocked");
});

test("upstream revision requests review without deleting downstream summaries",()=>{
  const workflow=deriveHearthMediaWorkflow(input({visualPlan:{status:"activated",total:3,images:2,broll:1,version:2},thumbnails:{eligible:3,total:3},images:{planned:2,completed:2},broll:{planned:1,completed:1},upstreamChanged:true}));
  assert.equal(workflow.activeStage,"visual_plan");assert.equal(workflow.stages[2]?.status,"blocked");assert.match(workflow.stages[2]?.summary??"",/2 of 2/);
});

test("creator UI translates Visual Plan while canonical media_map identities remain",async()=>{
  const surface=await readFile(new URL("../src/views/surfaces/VisualsSurface.tsx",import.meta.url),"utf8");
  const panel=await readFile(new URL("../src/components/visuals/EpisodeMediaMapPanel.tsx",import.meta.url),"utf8");
  const css=await readFile(new URL("../src/views/surfaces/VisualsSurface.css",import.meta.url),"utf8");
  const repo=await readFile(new URL("../src/lib/hearth-media-map-repo.ts",import.meta.url),"utf8");
  assert.match(surface,/Visual Plan/);assert.match(panel,/Create visual plan/);assert.doesNotMatch(surface,/Collapse/);assert.match(surface,/aria-live="polite"/);assert.match(css,/prefers-reduced-motion/);
  assert.match(repo,/hearth\/media_map\.v1\.json/);assert.match(repo,/media_map/);
});

test("stage navigation contains no automatic generation, credit, Hammer, or Quench action",async()=>{
  const source=await readFile(new URL("../src/lib/hearth-media-workflow-view-model.ts",import.meta.url),"utf8");
  for(const forbidden of [/generateThumbnail/,/consume.*credit/i,/publish/i,/experiment/i,/timeline/i])assert.doesNotMatch(source,forbidden);
});
