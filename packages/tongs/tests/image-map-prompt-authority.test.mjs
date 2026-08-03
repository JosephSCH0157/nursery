import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateSubstantiveVisualBrief, synthesizeConcreteVendorPrompt } from "../dist/providers/narrative-interpretation-provider.js";

const migration=readFileSync(new URL("../../../supabase/migrations/20260802130000_tongs_image_map_prompt_authority.sql",import.meta.url),"utf8");
test("prompt authority reserves before provider and records provider output durably",()=>{
  assert.match(migration,/begin_image_prompt_interpretation/);assert.match(migration,/state='provider_completed'/);assert.match(migration,/provider_response_json/);assert.match(migration,/for update/);
});
test("prompt revisions and terminal receipts are immutable and direct writes revoked",()=>{
  assert.match(migration,/image_map_prompt_revisions_immutable/);assert.match(migration,/revoke all on tongs\.image_map_prompt_revisions/);assert.match(migration,/state='committed'.*receipt_json/s);
});
test("candidate generation provenance is keyed to exact canonical prompt revision",()=>{
  const source=readFileSync(new URL("../src/workpiece-commit-api.ts",import.meta.url),"utf8");assert.match(source,/prompt_revision_id:canonicalPromptId/);assert.match(source,/prompt_content_hash:canonicalPromptHash/);assert.match(source,/const prompt = canonicalPrompt/);
});
test("generic interpretation is rejected and concrete synthesis has no empty section",()=>{
  const brief={narrative_purpose:"supporting the stated narrative idea",central_message:"Florida juice competes with California fruit",primary_subjects:["glass of juice","crates of oranges"],relationship_or_action:"competing for shoppers",emotional_tone:"energetic rivalry",visual_mode:"editorial",setting:"grocery citrus display backed by two different orchard climates",composition:"products face one another in balanced opposing halves",essential_visual_evidence:["juice glass","orange crates"],avoid:["maps","state outlines"],source_context:{before:null,focus:"Florida versus California",after:null}};
  assert.deepEqual(validateSubstantiveVisualBrief(brief),["narrative_purpose"]);
  brief.narrative_purpose="Show a commercial rivalry between regional citrus industries";
  const prompt=synthesizeConcreteVendorPrompt(brief,null);assert.doesNotMatch(prompt,/Essential visual evidence:\s*;/);assert.match(prompt,/glass of juice/);assert.match(prompt,/state outlines/);
});

const verboseSynthesis=(brief,style=null)=>[
  `Create a ${brief.visual_mode.replaceAll("_"," ")} image showing ${brief.primary_subjects.join(", ")}.`,
  `${brief.relationship_or_action}. The viewer should understand ${brief.central_message}.`,
  `The scene takes place in ${brief.setting}, with a ${brief.emotional_tone} mood.`,
  brief.composition,
  `Include ${brief.essential_visual_evidence.join(", ")}.`,
  `Exclude ${brief.avoid.join(", ")}.`,
  style?`Visual style: ${style}.`:null,
].filter(Boolean).join("\n\n");

const promptBriefs=[
  {
    narrative_purpose:"Show Florida citrus growers adapting after blight destroys their northern groves",
    central_message:"Blight forces Florida orange growers to abandon declining northern orchards and move south together",
    primary_subjects:["Florida orange growers","a blight-stricken orchard","trucks carrying citrus equipment south"],
    relationship_or_action:"growers load crates and irrigation gear while a convoy leaves the failing orchard for southern Florida",
    emotional_tone:"bleak, resigned, and quietly determined",
    visual_mode:"documentary",
    setting:"a thinning Florida orange grove beside an empty packing shed at golden hour",
    composition:"Use a slightly wide documentary frame with one diseased leaf prominent and the workers, trucks, and declining rows legible behind it",
    essential_visual_evidence:["a diseased yellow leaf with brown lesions","wooden citrus crates","coiled irrigation tubing","trucks carrying citrus equipment south","an empty packing shed"],
    avoid:["corporate logos","staged promotional smiles","healthy lush crops","scientific diagram overlays"],
    source_context:{before:null,focus:"Growers moved south",after:null},
  },
  {
    narrative_purpose:"Show the rivalry between fresh Florida oranges and processed orange juice",
    central_message:"Two citrus businesses compete through different products made from the same crop",
    primary_subjects:["a fresh-orange packing crew","an orange-juice bottling crew"],
    relationship_or_action:"the two crews load competing products at neighboring Florida packing houses",
    emotional_tone:"energetic and competitive",
    visual_mode:"editorial",
    setting:"two neighboring citrus packing houses at humid dawn",
    composition:"Frame both loading docks in one balanced wide shot with crates on one side and glass bottles on the other",
    essential_visual_evidence:["fresh orange crates","clear juice bottles","forklifts","humid grove rows"],
    avoid:["brand labels","text overlays","state maps","staged handshakes"],
    source_context:{before:null,focus:"There was a rivalry",after:null},
  },
  {
    narrative_purpose:"Establish how pervasive orange blossom scent once was around Orlando",
    central_message:"Orange groves once shaped the everyday sensory identity of northern Orlando",
    primary_subjects:["a family driving an older car","flowering orange groves along Orange Blossom Trail"],
    relationship_or_action:"the passengers lower the windows as dense white blossoms line both sides of the road",
    emotional_tone:"warm, nostalgic, and lived-in",
    visual_mode:"historical_reconstruction",
    setting:"Orange Blossom Trail north of Orlando in the mid-twentieth century",
    composition:"Use an eye-level roadside view that keeps the car, open windows, and blossom-heavy grove rows immediately readable",
    essential_visual_evidence:["white orange blossoms","an older family car","open windows","roadside grove rows"],
    avoid:["modern vehicles","logos","tourism advertising","fantasy haze"],
    source_context:{before:null,focus:"Orange Blossom Trail used to smell amazing",after:null},
  },
];

test("v2 synthesis is shorter and removes repeated meaning without losing concrete evidence",()=>{
  const brief=promptBriefs[0];
  const prompt=synthesizeConcreteVendorPrompt(brief,null);
  const previous=verboseSynthesis(brief);
  assert.ok(prompt.length<previous.length*0.85,`${prompt.length} should be materially shorter than ${previous.length}`);
  assert.match(prompt,/Florida orange growers/i);
  assert.match(prompt,/load crates and irrigation gear/i);
  assert.match(prompt,/Florida orange grove/i);
  assert.match(prompt,/diseased yellow leaf with brown lesions/i);
  assert.match(prompt,/Avoid corporate logos/i);
  assert.equal((prompt.match(/trucks carrying citrus equipment south/gi)??[]).length,1);
  assert.doesNotMatch(prompt,/The viewer should understand|Narrative purpose|Central message|strongly conveys|supports the narrative/i);
});

test("single-image synthesis rejects diversification language and keeps three moments distinct",()=>{
  const prompts=promptBriefs.map((brief)=>synthesizeConcreteVendorPrompt(brief,null));
  assert.equal(new Set(prompts).size,3);
  assert.match(prompts[0],/blight-stricken orchard/i);
  assert.match(prompts[1],/orange-juice bottling crew/i);
  assert.match(prompts[2],/Orange Blossom Trail/i);
  for(const prompt of prompts)assert.doesNotMatch(prompt,/same story through two|alternate angles|multiple interpretations/i);
  const invalid={...promptBriefs[1],relationship_or_action:"Offer alternate angles of the same rivalry"};
  assert.ok(validateSubstantiveVisualBrief(invalid).includes("relationship_or_action"));
});

test("v3 synthesis selects defining details and cleans exclusion prefixes",()=>{
  const verbose={...promptBriefs[0],primary_subjects:[...promptBriefs[0].primary_subjects,"a fourth background subject","a fifth background subject"],essential_visual_evidence:[...promptBriefs[0].essential_visual_evidence,"a sixth incidental object","a seventh incidental object"],avoid:["No corporate logos","Do not show staged smiles","Avoid healthy lush crops","scientific overlays","political banners","extra exclusion"]};
  const prompt=synthesizeConcreteVendorPrompt(verbose,"cinematic_realism");
  assert.equal((prompt.match(/a fourth background subject|a fifth background subject/g)??[]).length,0);
  assert.doesNotMatch(prompt,/Avoid (?:No|Do not|Avoid)\b/i);
  assert.match(prompt,/Avoid corporate logos, staged smiles, healthy lush crops, scientific overlays, political banners\./i);
  assert.doesNotMatch(prompt,/extra exclusion/i);
});
