import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  synthesizeBrollMotionPrompt,
  validateBrollMotionBrief,
} from "../dist/providers/broll-motion-interpretation-provider.js";

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
  assert.match(prompt, /camera travels south through the grove/i);
  assert.match(prompt, /Begin on workers beside crates/i);
  assert.match(prompt, /Target usable duration: 6 seconds/i);
  assert.match(prompt, /Avoid on-screen text, logos, still-image motion/i);
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
