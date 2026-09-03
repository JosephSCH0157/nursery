import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  synthesizeBrollMotionPrompt,
  validateBrollMotionBrief,
} from "../dist/providers/broll-motion-interpretation-provider.js";
import { TongsCommitService } from "../dist/workpiece-commit-api.js";

const completeBrief = {
  narrative_purpose: "Show the geographic shift of Florida orange production",
  central_message: "Growers respond to pressure by relocating farther south",
  visible_subjects: ["Florida orange growers", "working citrus groves"],
  action_over_time: "Workers move harvested oranges as the camera travels south through the grove",
  camera_behavior: "A slow tracking move follows the workers from the grove edge into the rows",
  start_frame: "Workers beside crates at the northern edge of a citrus grove",
  end_frame: "The same workers deeper among dense southern Florida orange trees",
  target_duration: "6 seconds",
  pacing: "measured documentary pace",
  setting: "a working southern Florida orange grove in warm morning light",
  mood: "resilient and grounded",
  continuity: "maintain southbound screen direction and the same workers",
  must_include: ["orange trees", "harvest crates", "working growers"],
  avoid: ["on-screen text", "logos", "still-image motion"],
  loopability: "end on continued worker movement",
};

test("motion brief validation accepts specific action over time and synthesis preserves it", () => {
  assert.deepEqual(validateBrollMotionBrief(completeBrief), []);
  const prompt = synthesizeBrollMotionPrompt(completeBrief);
  assert.ok(prompt.length>=750&&prompt.length<=900,`expected typical Runway prompt in the 750-900 target, received ${prompt.length}`);
  assert.match(prompt, /camera travels south through the grove/i);
  assert.match(prompt, /Begin on workers beside crates/i);
  assert.match(prompt, /6 seconds/i);
  assert.match(prompt, /do not show on-screen text, logos, still-image motion/i);
  assert.ok(prompt.length<=1000);
  for(const evidence of ["Florida orange growers","Workers move harvested oranges","slow tracking move","Workers beside crates","same workers deeper","southern Florida orange grove","resilient","orange trees","on-screen text"])assert.match(prompt,new RegExp(evidence,"i"));
});

test("Runway synthesis compacts verbose fields at word boundaries without slicing the final prompt",()=>{
  const verbose=Object.fromEntries(Object.entries(completeBrief).map(([key,value])=>[key,Array.isArray(value)?value.map((item)=>`${item} ${"specific visual evidence ".repeat(12)}`):`${value} ${"specific documentary context ".repeat(20)}`]));
  const prompt=synthesizeBrollMotionPrompt(verbose);
  assert.ok(prompt.length<=1000,`expected <=1000 UTF-16 code units, received ${prompt.length}`);
  assert.doesNotMatch(prompt,/specific docum$/);
  assert.match(prompt,/Begin on/i);assert.match(prompt,/finish on/i);assert.match(prompt,/Use /i);assert.match(prompt,/do not show/i);
  assert.doesNotMatch(prompt,/^(?:Start|End|Camera|Include|Exclude):/m);
});

test("motion brief validation rejects generic and still-frame interpretations field by field", () => {
  const invalid = {
    ...completeBrief,
    narrative_purpose: "Support the narrative",
    action_over_time: "Relevant visual evidence",
    camera_behavior: "Cinematic movement",
    end_frame: completeBrief.start_frame,
    target_duration: "brief",
  };
  const fields = validateBrollMotionBrief(invalid);
  for (const field of ["narrative_purpose", "action_over_time", "camera_behavior", "end_frame", "target_duration"])
    assert.ok(fields.includes(field), `expected ${field} to be rejected`);
});

test("Runway-ready proposal reads the immutable brief and rejects stale expected revisions without a write",async()=>{
  let writes=0;const authority={schema(){return{async rpc(name){if(name!=="read_broll_prompt_status")writes+=1;return{data:{status:"creator_edited",prompt_revision:{id:"55555555-5555-4555-8555-555555555555",revision:2,motion_brief_json:completeBrief,final_prompt:"old creator wording"}},error:null};}}}};
  const service=new TongsCommitService({},"forge-workpieces",null,()=>authority);
  service.assertWorkpieceInWorkspace=async()=>undefined;service.assertWorkspaceRoleFromAccessToken=async()=>({userId:"11111111-1111-4111-8111-111111111111",role:"editor"});
  const proposal=await service.proposeRunwayReadyBrollPrompt("22222222-2222-4222-8222-222222222222","33333333-3333-4333-8333-333333333333","44444444-4444-4444-8444-444444444444","55555555-5555-4555-8555-555555555555",2,{userAccessToken:"token"});
  assert.equal(proposal.disposition,"proposed");assert.ok(proposal.prompt_length_utf16<=1000);assert.equal(writes,0);
  await assert.rejects(()=>service.proposeRunwayReadyBrollPrompt("22222222-2222-4222-8222-222222222222","33333333-3333-4333-8333-333333333333","44444444-4444-4444-8444-444444444444","55555555-5555-4555-8555-555555555555",1,{userAccessToken:"token"}),error=>error.code==="prompt_revision_conflict");
  assert.equal(writes,0);
});

test("migration derives creative authority in Tongs and gates generated candidates", () => {
  const sql = readFileSync(new URL("../../../supabase/migrations/20260803210000_tongs_broll_motion_prompt_authority.sql", import.meta.url), "utf8");
  assert.match(sql, /create or replace function tongs\.broll_current_creative_input/i);
  assert.match(sql, /create or replace function tongs\.read_broll_prompt_status/i);
  assert.match(sql, /legacy_unverified/i);
  assert.match(sql, /creator_direction_changed/i);
  assert.match(sql, /guard_broll_generated_candidate_prompt/i);
  assert.match(sql, /assert_current_broll_prompt/i);
  assert.doesNotMatch(sql, /candidate_assets|selected_asset|licens(?:e|ing)_metadata|hammer_consumption/i);
});

test("forward repair keeps the B-roll prompt assertion callable by the authenticated API", () => {
  const sql = readFileSync(new URL("../../../supabase/migrations/20260902173000_tongs_broll_prompt_assertion_execute_repair.sql", import.meta.url), "utf8");
  assert.match(sql, /revoke all on function tongs\.assert_current_broll_prompt\(uuid,uuid,uuid,uuid,bigint,text\)\s+from public, anon/i);
  assert.match(sql, /grant execute on function tongs\.assert_current_broll_prompt\(uuid,uuid,uuid,uuid,bigint,text\)\s+to authenticated, service_role/i);
});
