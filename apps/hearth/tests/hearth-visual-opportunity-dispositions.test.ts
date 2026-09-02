import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const control=readFileSync(new URL("../src/components/visuals/VisualOpportunityDispositionControl.tsx",import.meta.url),"utf8");
const images=readFileSync(new URL("../src/components/visuals/ImageMapPanel.tsx",import.meta.url),"utf8");
const clips=readFileSync(new URL("../src/components/visuals/CanonicalReferenceClipPanel.tsx",import.meta.url),"utf8");
const visuals=readFileSync(new URL("../src/components/visuals/CanonicalReferenceVisualPanel.tsx",import.meta.url),"utf8");
const broll=readFileSync(new URL("../src/components/visuals/BrollPlanPanel.tsx",import.meta.url),"utf8");

test("all canonical visual opportunity classes expose one revision-safe skip and restore control",()=>{
 for(const source of [images,clips,visuals,broll])assert.match(source,/VisualOpportunityDispositionControl/);
 for(const kind of ["image","reference_clip","reference_visual","broll"])assert.ok([images,clips,visuals,broll].some(source=>source.includes(`kind="${kind}"`)),`missing ${kind}`);
 assert.match(control,/Skip this opportunity/);
 assert.match(control,/Skipped by you/);
 assert.match(control,/Restore to plan/);
 assert.match(control,/setVisualOpportunityDisposition/);
 assert.match(control,/rights_unavailable/);
 assert.match(control,/material_unobtainable/);
});

test("progress distinguishes fulfilled, skipped, and unresolved without deleting evidence",()=>{
 for(const source of [images,clips,visuals,broll]){
   assert.match(source,/fulfilled/);
   assert.match(source,/skipped/);
   assert.match(source,/unresolved/);
 }
 assert.doesNotMatch(control,/delete|remove/i);
});

test("every opportunity surface keeps skipped work visibly reachable",()=>{
 for(const source of [images,clips,visuals,broll]){
   assert.match(source,/Review skipped/);
   assert.match(source,/Skipped/);
 }
 assert.match(images,/onSelectEntry\(first\.id\)/);
 assert.match(broll,/onSelectBeat\(first\.id\)/);
 assert.match(clips,/setSelectedId\(state\.opportunities\.find/);
 assert.match(visuals,/setSelectedId\(state\.opportunities\.find/);
});

test("restore terminalizes pending state and publishes the returned canonical snapshot",()=>{
 assert.match(control,/finally\{setPending\(false\);\}/);
 assert.match(control,/onChanged\(result\.data\)/);
 assert.match(control,/dispositions:result\.data/);
 assert.match(control,/aria-busy=\{pending\}/);
 assert.match(control,/role="status"/);
});
