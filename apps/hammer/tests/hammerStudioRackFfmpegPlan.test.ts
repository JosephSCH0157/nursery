import assert from "node:assert/strict";
import { buildHammerStudioRackFfmpegPlan } from "../src/editor/hammerStudioRackFfmpegPlan";
import { createDefaultHammerStudioRackState, isHammerStudioRackIdentity, normalizeHammerStudioRackState } from "../src/editor/hammerStudioRack";

function testConservativeGateCompressorDefaults() {
  const rack = createDefaultHammerStudioRackState();
  assert.equal(rack.modules.gate.threshold_db <= -48, true);
  assert.equal(rack.modules.gate.range_db >= -12, true);
  assert.equal(rack.modules.compressor.ratio <= 2.0, true);
  assert.equal(rack.modules.compressor.makeup_gain_db <= 1, true);
}

function testPersistedRackNormalizationIsBoundedAndIdentityAware() {
  const defaults = createDefaultHammerStudioRackState();
  assert.equal(isHammerStudioRackIdentity(defaults), true);
  const normalized = normalizeHammerStudioRackState({
    is_enabled: true,
    is_bypassed: false,
    backend_preference: "ffmpeg",
    modules: {
      gate: { is_enabled: true, threshold_db: 999, range_db: Number.NaN },
      compressor: { is_enabled: true, ratio: -12, makeup_gain_db: 999 },
      eq: null,
      reverb: "invalid",
    },
  });
  assert.equal(normalized.is_enabled, true);
  assert.equal(normalized.backend_preference, "ffmpeg");
  assert.notEqual(normalized.modules.gate.threshold_db, 999);
  assert.notEqual(normalized.modules.compressor.ratio, -12);
  assert.equal(Number.isFinite(normalized.modules.gate.range_db), true);
  assert.equal(isHammerStudioRackIdentity(normalized), false);
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

function testEqReverbTubeAreApplied() {
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
  assert.equal(eqDecision?.applied, true);
  assert.equal(eqDecision?.reason, "applied_in_v1");
  assert.equal(reverbDecision?.applied, true);
  assert.equal(tubeDecision?.applied, true);
  assert.match(plan.filterChain, /lowshelf/);
  assert.match(plan.filterChain, /aecho/);
  assert.match(plan.filterChain, /asoftclip/);
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

function testVoicePolishAdvancedSettingsChangeRenderedFilters() {
  const rack = createDefaultHammerStudioRackState();
  rack.is_enabled = true;
  rack.voice_polish = {
    ...rack.voice_polish!,
    fixes: {
      ...rack.voice_polish!.fixes,
      remove_harsh_sibilance: true,
      enhance_voice_clarity: true,
    },
    advanced: {
      de_esser_strength: "high",
      eq_profile: "bright",
    },
  };

  const plan = buildHammerStudioRackFfmpegPlan(rack);
  assert.equal(plan.appliedModules.includes("voice_polish_tier2"), true);
  assert.equal(plan.filterChain.includes("deesser=i=0.55:m=0.65:f=0.58:s=o"), true);
  assert.equal(plan.filterChain.includes("treble=f=8000:t=o:w=0.45:g=1.2"), true);
  assert.equal(plan.summary.voice_polish_de_esser_strength, "high");
  assert.equal(plan.summary.voice_polish_eq_profile, "bright");
}

function testVoiceCleanupPresetChainUsesConservativeSpeechFilters() {
  const rack = createDefaultHammerStudioRackState();
  rack.is_enabled = true;
  rack.voice_polish = {
    ...rack.voice_polish!,
    voice_cleanup_enabled: true,
  };

  const plan = buildHammerStudioRackFfmpegPlan(rack);
  assert.equal(plan.appliedModules.includes("voice_polish_tier2"), true);
  assert.equal(plan.filterChain.includes("highpass=f=80"), true);
  assert.equal(plan.filterChain.includes("equalizer=f=3500:t=q:w=1.2:g=-2"), true);
  assert.equal(plan.filterChain.includes("acompressor=threshold=0.125893:ratio=2.20:attack=12:release=120:makeup=1.258925"), true);
  assert.equal(plan.filterChain.includes("loudnorm=I=-16:TP=-1.5:LRA=11"), true);
}

function run() {
  testConservativeGateCompressorDefaults();
  testPersistedRackNormalizationIsBoundedAndIdentityAware();
  testGateAndCompressorAreApplied();
  testEqReverbTubeAreApplied();
  testBypassedAndDisabledModulesAreNotRequested();
  testVoicePolishAdvancedSettingsChangeRenderedFilters();
  testVoiceCleanupPresetChainUsesConservativeSpeechFilters();
  // eslint-disable-next-line no-console
  console.log("Hammer Studio Rack FFmpeg plan tests passed.");
}

run();
