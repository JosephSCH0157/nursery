import assert from "node:assert/strict";
import { buildHammerStudioRackFfmpegPlan } from "../src/editor/hammerStudioRackFfmpegPlan";
import { createDefaultHammerStudioRackState } from "../src/editor/hammerStudioRack";

function testConservativeGateCompressorDefaults() {
  const rack = createDefaultHammerStudioRackState();
  assert.equal(rack.modules.gate.threshold_db <= -48, true);
  assert.equal(rack.modules.gate.range_db >= -12, true);
  assert.equal(rack.modules.compressor.ratio <= 2.0, true);
  assert.equal(rack.modules.compressor.makeup_gain_db <= 1, true);
}

function testGateAndCompressorAreApplied() {
  const rack = createDefaultHammerStudioRackState();
  rack.is_enabled = true;
  rack.modules.gate.is_enabled = true;
  rack.modules.compressor.is_enabled = true;

  const plan = buildHammerStudioRackFfmpegPlan(rack);
  assert.equal(plan.filters.length >= 2, true);
  assert.equal(plan.appliedModules.includes("gate"), true);
  assert.equal(plan.appliedModules.includes("compressor"), true);
  assert.equal(plan.filterChain.includes("agate"), true);
  assert.equal(plan.filterChain.includes("acompressor"), true);
}

function testEqReverbTubeAreReservedForLater() {
  const rack = createDefaultHammerStudioRackState();
  rack.is_enabled = true;
  rack.modules.eq.is_enabled = true;
  rack.modules.reverb.is_enabled = true;
  rack.modules.tubeMicCharacter.is_enabled = true;

  const plan = buildHammerStudioRackFfmpegPlan(rack);
  const eqDecision = plan.decisions.find((item) => item.moduleId === "eq");
  const reverbDecision = plan.decisions.find((item) => item.moduleId === "reverb");
  const tubeDecision = plan.decisions.find((item) => item.moduleId === "tubeMicCharacter");
  assert.equal(eqDecision?.requested, true);
  assert.equal(eqDecision?.applied, false);
  assert.equal(eqDecision?.reason, "reserved_for_future_slice");
  assert.equal(reverbDecision?.reason, "reserved_for_future_slice");
  assert.equal(tubeDecision?.reason, "reserved_for_future_slice");
}

function testBypassedAndDisabledModulesAreNotRequested() {
  const rack = createDefaultHammerStudioRackState();
  rack.is_enabled = true;
  rack.modules.gate.is_enabled = false;
  rack.modules.compressor.is_enabled = true;
  rack.modules.compressor.is_bypassed = true;

  const plan = buildHammerStudioRackFfmpegPlan(rack);
  const gateDecision = plan.decisions.find((item) => item.moduleId === "gate");
  const compressorDecision = plan.decisions.find((item) => item.moduleId === "compressor");
  assert.equal(gateDecision?.requested, false);
  assert.equal(gateDecision?.reason, "module_disabled");
  assert.equal(compressorDecision?.requested, false);
  assert.equal(compressorDecision?.reason, "module_bypassed");
}

function run() {
  testConservativeGateCompressorDefaults();
  testGateAndCompressorAreApplied();
  testEqReverbTubeAreReservedForLater();
  testBypassedAndDisabledModulesAreNotRequested();
  // eslint-disable-next-line no-console
  console.log("Hammer Studio Rack FFmpeg plan tests passed.");
}

run();
