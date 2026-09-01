import assert from "node:assert/strict";
import test from "node:test";
import { buildHammerAudioDspPlan, buildHammerAudioRenderIdentity, canonicalHammerAudioJson } from "../src/editor/hammerAudioDspPlan";
import { createDefaultHammerStudioRackState } from "../src/editor/hammerStudioRack";
import { applyHammerStudioRackNativePreview, buildDeterministicReverbImpulse } from "../src/editor/hammerStudioRackNativePreview";
import { buildHammerExactAudioRenderReceipt, HAMMER_AUDIO_ALGORITHM_VERSIONS, validateHammerExactAudioReleaseReceipt } from "../src/editor/hammerExactAudioReceipt";

test("canonical DSP plan has locked order and stable normalized fingerprint", () => {
  const rack = createDefaultHammerStudioRackState(); rack.is_enabled = true; rack.modules.eq.is_enabled = true; rack.modules.eq.mid_gain_db = 0.30000000004;
  const first = buildHammerAudioDspPlan(rack); rack.modules.eq.mid_gain_db = 0.3; const second = buildHammerAudioDspPlan(rack);
  assert.equal(first.schemaVersion, "HammerAudioDspPlanV1");
  assert.deepEqual(first.operations.map((operation) => operation.order), [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120]);
  assert.equal(first.dspFingerprint, second.dspFingerprint);
  assert.equal(canonicalHammerAudioJson({ b: 2, a: 1 }), '{"a":1,"b":2}');
});

test("render identity separates source and history from DSP intent", () => {
  const dsp = buildHammerAudioDspPlan(createDefaultHammerStudioRackState()).dspFingerprint;
  const a = buildHammerAudioRenderIdentity({ sourceIdentity: "source-a", timelineIdentity: "timeline", historyHead: "head", dspFingerprint: dsp });
  const b = buildHammerAudioRenderIdentity({ sourceIdentity: "source-b", timelineIdentity: "timeline", historyHead: "head", dspFingerprint: dsp });
  assert.equal(a.dspFingerprint, b.dspFingerprint); assert.notEqual(a.renderFingerprint, b.renderFingerprint);
});

test("exact receipt binds operation, loudness, artifact, and render identities", () => {
  const rack = createDefaultHammerStudioRackState(); rack.is_enabled = true; rack.voice_polish!.fixes.level_volume = true;
  const plan = buildHammerAudioDspPlan(rack); const identity = buildHammerAudioRenderIdentity({ sourceIdentity: "asset:source", timelineIdentity: "timeline:1", historyHead: "head:1", dspFingerprint: plan.dspFingerprint });
  const measurement = { integrated_lufs: -16.1, loudness_range_lu: 5, true_peak_dbtp: -1.7, threshold_lufs: -26, offset_lu: 0.1 };
  const receipt = buildHammerExactAudioRenderReceipt({ dspImplementationVersion: plan.implementationVersion, rendererVersion: identity.rendererVersion, algorithmVersions: HAMMER_AUDIO_ALGORITHM_VERSIONS, dspFingerprint: plan.dspFingerprint, renderIdentity: identity, operations: plan.operations.map((operation) => ({ id: operation.id, order: operation.order, state: operation.enabled ? "applied" as const : "bypassed" as const, detail: null })), ffmpegFilterPlan: "[0:a]loudnorm,alimiter[outa]", loudness: { status: "verified", target_lufs: -16, target_lra_lu: 7, true_peak_ceiling_dbtp: -1.5, first_pass: measurement, second_pass_parameters: { measured_I: -20, measured_TP: -4 }, verification: measurement, sample_peak_dbfs: -2 }, output: { canonicalAssetId: "asset:master", contentHash: "a".repeat(64), workpiecePath: "hammer/master.wav", mimeType: "audio/wav", durationMs: 1000, sampleRate: 48000, channels: 2 } });
  assert.equal(validateHammerExactAudioReleaseReceipt({ receipt, plan, renderIdentity: identity, canonicalAssetId: "asset:master", contentHash: "a".repeat(64) }).ok, true);
  assert.equal(validateHammerExactAudioReleaseReceipt({ receipt, plan, renderIdentity: buildHammerAudioRenderIdentity({ sourceIdentity: "asset:other", timelineIdentity: "timeline:1", historyHead: "head:1", dspFingerprint: plan.dspFingerprint }) }).reasons.some((reason) => reason.code === "exact_audio_render_identity_mismatch"), true);
  assert.throws(() => buildHammerExactAudioRenderReceipt({ ...receipt, loudness: { ...receipt.loudness, sample_peak_dbfs: Number.NaN } }));
});

test("deterministic reverb produces the same impulse for the same seed", () => {
  const makeContext = () => ({ sampleRate: 100, createBuffer: (channels: number, frames: number) => { const data = Array.from({ length: channels }, () => new Float32Array(frames)); return { numberOfChannels: channels, getChannelData: (channel: number) => data[channel]! }; } }) as unknown as BaseAudioContext;
  const first = buildDeterministicReverbImpulse(makeContext(), { decaySec: 0.1, seed: "stable" });
  const second = buildDeterministicReverbImpulse(makeContext(), { decaySec: 0.1, seed: "stable" });
  assert.deepEqual(Array.from(first.getChannelData(0)), Array.from(second.getChannelData(0)));
});

test("native preview creates one MediaElementSource and only reroutes downstream", () => {
  let sourceCreations = 0;
  const parameter = () => ({ value: 0, setValueAtTime(value: number) { this.value = value; } });
  const node = () => ({ connect() { return this; }, disconnect() {}, gain: parameter() });
  class MockContext {
    currentTime = 0; destination = node();
    createMediaElementSource() { sourceCreations += 1; return node(); }
    createGain() { return node(); }
    resume() { return Promise.resolve(); }
  }
  const previousWindow = (globalThis as { window?: unknown }).window;
  (globalThis as { window?: unknown }).window = { AudioContext: MockContext };
  try {
    const media = { addEventListener() {} } as unknown as HTMLMediaElement;
    const rack = createDefaultHammerStudioRackState();
    assert.equal(applyHammerStudioRackNativePreview(media, rack), true);
    assert.equal(applyHammerStudioRackNativePreview(media, rack), true);
    assert.equal(sourceCreations, 1);
  } finally { (globalThis as { window?: unknown }).window = previousWindow; }
});
