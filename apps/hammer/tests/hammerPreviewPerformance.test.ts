import assert from "node:assert/strict";
import {
  buildOneSecondCompositeWindows,
  evaluateHammerPreviewPerformance,
  HammerPreviewPerformanceCollector,
} from "../src/features/visual-effects/render/hammerPreviewPerformance";

function buildThirtyFps(startMs: number, seconds: number): number[] {
  return Array.from({ length: seconds * 30 }, (_, index) => startMs + (index * (1_000 / 30)));
}

{
  const collector = new HammerPreviewPerformanceCollector(0);
  for (let index = 0; index < 25_000; index += 1) collector.recordComposite(2, index);
  assert.equal(collector.snapshot().compositeTimestampsMs.length, 24_000, "collector stays bounded");
}

{
  const timestamps = buildThirtyFps(10_000, 120);
  const windows = buildOneSecondCompositeWindows(timestamps, 10_000, 120_000);
  assert.equal(windows.length, 120);
  assert.ok(windows.every((fps) => fps >= 29 && fps <= 31));
  const result = evaluateHammerPreviewPerformance({
    snapshot: {
      startedAtMs: 0, decodedTimestampsMs: timestamps, compositeTimestampsMs: timestamps, segmentationTimestampsMs: timestamps.filter((_, index) => index % 3 === 0),
      compositeLatenciesMs: [2, 3, 4], segmentationLatenciesMs: [30, 40, 50], controlLatenciesMs: [20, 30], longTasksMs: [40], maximumPendingJobs: 2,
      segmentationAttempted: 1_200, segmentationCompleted: 1_200, segmentationFailed: 0, segmentationSuperseded: 0, rawFrameFlashes: 0, visibleSourceReloads: 0, degradedDurationMs: 0,
    }, sampleStartMs: 10_000, sampleDurationMs: 120_000,
  });
  assert.equal(result.passed, true);
  assert.equal(result.passingWindowShare, 1);
  assert.ok((result.frameIntervalMs.p95 ?? Infinity) <= 35.7);
}

{
  const timestamps = buildThirtyFps(10_000, 120);
  timestamps.splice(300, 5);
  const result = evaluateHammerPreviewPerformance({
    snapshot: {
      startedAtMs: 0, decodedTimestampsMs: timestamps, compositeTimestampsMs: timestamps, segmentationTimestampsMs: [], compositeLatenciesMs: [2], segmentationLatenciesMs: [], controlLatenciesMs: [36], longTasksMs: [], maximumPendingJobs: 3,
      segmentationAttempted: 0, segmentationCompleted: 0, segmentationFailed: 0, segmentationSuperseded: 0, rawFrameFlashes: 1, visibleSourceReloads: 1, degradedDurationMs: 1,
    }, sampleStartMs: 10_000, sampleDurationMs: 120_000,
  });
  assert.equal(result.passed, false);
  assert.ok(result.blockingReasons.includes("compositor_stall_limit_exceeded"));
  assert.ok(result.blockingReasons.includes("analysis_queue_bound_exceeded"));
  assert.ok(result.blockingReasons.includes("control_to_composite_latency_exceeded"));
}

console.log("Hammer Preview performance authority tests passed.");
