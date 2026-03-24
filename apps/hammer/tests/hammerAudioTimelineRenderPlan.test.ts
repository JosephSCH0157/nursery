import assert from "node:assert/strict";
import {
  buildHammerTimelineAudioRenderPlan,
  resolveHammerActiveTimelineAudioSegments,
} from "../src/editor/hammerAudioTimelineRenderPlan";

function testDisabledSegmentsExcluded() {
  const segments = [
    { segment_id: "a", start_sec: 0, end_sec: 1, is_disabled: true },
    { segment_id: "b", start_sec: 1, end_sec: 2, is_disabled: false },
  ];
  const active = resolveHammerActiveTimelineAudioSegments(segments);
  assert.equal(active.length, 1);
  assert.equal(active[0]?.segment_id, "b");
  const plan = buildHammerTimelineAudioRenderPlan({ segments });
  assert.equal(plan?.summary.disabled_segments_excluded, 1);
}

function testGainAffectsFilterPlan() {
  const plan = buildHammerTimelineAudioRenderPlan({
    segments: [
      { segment_id: "a", start_sec: 0, end_sec: 1, gain_db: 6 },
    ],
  });
  assert.ok(plan);
  assert.equal(plan?.filterComplex.includes("volume=1.995262"), true);
}

function testTimelineOrderPreserved() {
  const plan = buildHammerTimelineAudioRenderPlan({
    segments: [
      { segment_id: "a", start_sec: 2, end_sec: 3 },
      { segment_id: "b", start_sec: 0, end_sec: 1 },
      { segment_id: "c", start_sec: 1, end_sec: 2 },
    ],
  });
  assert.ok(plan);
  assert.equal(plan?.activeSegments[0]?.segment_id, "a");
  assert.equal(plan?.activeSegments[1]?.segment_id, "b");
  assert.equal(plan?.activeSegments[2]?.segment_id, "c");
  assert.equal(plan?.filterComplex.includes("[seg0][seg1][seg2]concat=n=3:v=0:a=1[timeline]"), true);
}

function testPostChainAppliedFlag() {
  const plan = buildHammerTimelineAudioRenderPlan({
    segments: [
      { segment_id: "a", start_sec: 0, end_sec: 1 },
    ],
    postFilterChain: "acompressor=threshold=0.2",
  });
  assert.equal(plan?.summary.post_filter_chain_applied, true);
  assert.equal(plan?.filterComplex.includes("[timeline]acompressor=threshold=0.2[outa]"), true);
}

function testEmptyActiveSegmentsReturnsNull() {
  const plan = buildHammerTimelineAudioRenderPlan({
    segments: [
      { segment_id: "a", start_sec: 0, end_sec: 0, is_disabled: false },
      { segment_id: "b", start_sec: 1, end_sec: 2, is_disabled: true },
    ],
  });
  assert.equal(plan, null);
}

function run() {
  testDisabledSegmentsExcluded();
  testGainAffectsFilterPlan();
  testTimelineOrderPreserved();
  testPostChainAppliedFlag();
  testEmptyActiveSegmentsReturnsNull();
  // eslint-disable-next-line no-console
  console.log("Hammer audio timeline render plan tests passed.");
}

run();
