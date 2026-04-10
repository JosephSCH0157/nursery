import assert from "node:assert/strict";
import { analyzeDeadAirGaps, applyDeadAirClosure } from "../src/editor/hammerDeadAirClosure";

function seg(args: {
  id: string;
  start: number;
  end: number;
  speaker?: string;
  text?: string;
  is_disabled?: boolean;
}) {
  return {
    segment_id: args.id,
    start_sec: args.start,
    end_sec: args.end,
    speaker: args.speaker ?? "S1",
    text: args.text ?? args.id,
    ...(args.is_disabled === true ? { is_disabled: true } : {}),
  };
}

async function testAnalyzerNoGapsExceedThreshold() {
  const analysis = analyzeDeadAirGaps([
    seg({ id: "a", start: 0, end: 1 }),
    seg({ id: "b", start: 2.4, end: 3 }), // gap 1.4
  ] as never, 1.5);

  assert.equal(analysis.eligibleGapCount, 0);
  assert.equal(analysis.totalRemovableSec, 0);
}

async function testAnalyzerFindsSingleGap() {
  const analysis = analyzeDeadAirGaps([
    seg({ id: "a", start: 0, end: 1 }),
    seg({ id: "b", start: 3.0, end: 4.0 }), // gap 2.0 -> removable 0.5 at 1.5
  ] as never, 1.5);

  assert.equal(analysis.eligibleGapCount, 1);
  assert.equal(analysis.totalRemovableSec, 0.5);
  assert.equal(analysis.gaps[0]?.currentSegmentId, "a");
  assert.equal(analysis.gaps[0]?.nextSegmentId, "b");
  assert.equal(analysis.gaps[0]?.gapSec, 2.0);
  assert.equal(analysis.gaps[0]?.removableSec, 0.5);
}

async function testAnalyzerDoesNotTrimAcrossDisabledBoundary() {
  const analysis = analyzeDeadAirGaps([
    seg({ id: "a", start: 0, end: 1 }),
    seg({ id: "x", start: 1.1, end: 1.2, is_disabled: true }),
    seg({ id: "b", start: 4.0, end: 5.0 }), // large gap from a->b but disabled segment in between
  ] as never, 1.5);

  assert.equal(analysis.eligibleGapCount, 0);
}

async function testApplyShiftsDownstreamByCumulativeRemovedDuration() {
  const before = [
    seg({ id: "a", start: 0.0, end: 1.0 }),
    seg({ id: "b", start: 3.0, end: 4.0 }), // gap 2.0 -> remove 0.5
    seg({ id: "c", start: 6.0, end: 7.0 }), // gap 2.0 from b->c -> remove 0.5
  ];

  const result = applyDeadAirClosure({ segments: before as never, thresholdSec: 1.5 });
  assert.equal(result.analysis.eligibleGapCount, 2);
  assert.equal(result.analysis.totalRemovableSec, 1.0);

  const byId = new Map(result.segments.map((s) => [s.segment_id, s] as const));
  assert.equal(byId.get("a")?.start_sec, 0.0);
  assert.equal(byId.get("a")?.end_sec, 1.0);

  // b shifts earlier by 0.5 => start 2.5, end 3.5
  assert.equal(byId.get("b")?.start_sec, 2.5);
  assert.equal(byId.get("b")?.end_sec, 3.5);

  // c shifts earlier by 1.0 cumulative => start 5.0, end 6.0
  assert.equal(byId.get("c")?.start_sec, 5.0);
  assert.equal(byId.get("c")?.end_sec, 6.0);
}

await testAnalyzerNoGapsExceedThreshold();
await testAnalyzerFindsSingleGap();
await testAnalyzerDoesNotTrimAcrossDisabledBoundary();
await testApplyShiftsDownstreamByCumulativeRemovedDuration();

console.log("Hammer dead air closure tests passed.");

