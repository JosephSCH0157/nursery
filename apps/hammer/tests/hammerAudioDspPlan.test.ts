import assert from "node:assert/strict";
import test from "node:test";
import { buildHammerAudioDspPlan, buildHammerAudioRenderIdentity, canonicalHammerAudioJson } from "../src/editor/hammerAudioDspPlan";
import { createDefaultHammerStudioRackState } from "../src/editor/hammerStudioRack";
import { applyHammerStudioRackNativePreview, buildDeterministicReverbImpulse } from "../src/editor/hammerStudioRackNativePreview";

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
