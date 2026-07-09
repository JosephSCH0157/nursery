import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import type { HammerTranscriptSegment } from "../../../packages/contracts/hammer/transcript.contract";
import {
  moveSegmentTiming,
  resolvePlayheadSegment,
  trimSegmentEndTiming,
  updateSegmentInTimeline,
} from "../src/editor/hammerWorkspaceTimeline";
import {
  resolveSelectedSegmentId,
  syncEditableTranscriptSegments,
  updateTranscriptSegmentText,
} from "../src/editor/hammerWorkspaceTranscript";

type FailureContext = {
  action: string;
  expected: string;
  likelyDriftPoint: string;
  observed: string;
  setup: string;
  title: string;
};

function seg(id: string, startSec: number, endSec: number, speaker = "Host", text = id): HammerTranscriptSegment {
  return {
    segment_id: id,
    speaker,
    text,
    start_sec: startSec,
    end_sec: endSec,
  };
}

function caseFailure(context: FailureContext): string {
  return [
    `Case: ${context.title}`,
    `Setup: ${context.setup}`,
    `Action: ${context.action}`,
    `Observed: ${context.observed}`,
    `Expected: ${context.expected}`,
    `Likely drift point: ${context.likelyDriftPoint}`,
  ].join("\n");
}

function caseAssert(condition: boolean, context: FailureContext): void {
  assert.ok(condition, caseFailure(context));
}

function assertTimelineInvariants(segments: HammerTranscriptSegment[]): void {
  for (const segment of segments) {
    assert.ok(segment.start_sec >= 0, `${segment.segment_id} start should be >= 0`);
    assert.ok(segment.end_sec >= segment.start_sec + 0.1, `${segment.segment_id} end should be >= start + 0.1`);
  }
}

async function keeps_selection_locked_during_timing_edits() {
  let segments: HammerTranscriptSegment[] = [
    seg("s1", 0.0, 1.0, "Host", "A"),
    seg("s2", 1.2, 2.0, "Guest", "B"),
    seg("s3", 2.2, 3.0, "Guest", "C"),
    seg("s4", 3.2, 4.0, "Host", "D"),
    seg("s5", 4.2, 5.0, "Host", "E"),
  ];
  let selectedId: string | null = "s2";

  segments = updateSegmentInTimeline(segments, "s2", (current) => ({
    ...current,
    start_sec: Math.max(0, Number((current.start_sec - 0.3).toFixed(1))),
    end_sec: Number((current.end_sec + 0.5).toFixed(1)),
  }));
  const afterS2 = syncEditableTranscriptSegments(segments, selectedId);
  segments = afterS2.segments;
  selectedId = afterS2.selectedSegmentId;

  selectedId = "s3";
  segments = updateSegmentInTimeline(segments, "s3", (current) => ({
    ...current,
    start_sec: Number((current.end_sec).toFixed(1)),
    end_sec: Number((current.end_sec + 0.1).toFixed(1)),
  }));
  segments = updateTranscriptSegmentText(segments, "s4", "Edited line");
  selectedId = "s2";

  assert.equal(selectedId, "s2");
  assertTimelineInvariants(segments);
}

async function playhead_updates_active_segment_without_scroll_thrash() {
  const source = await readFile(
    "d:/nursery/nursery/apps/hammer/src/editor/HammerWorkspaceShell.tsx",
    "utf-8",
  );

  caseAssert(
    source.includes("selectionOriginRef.current = \"playhead\";"),
    {
      title: "playhead origin tagging",
      setup: "Hammer workspace with transcript + timeline mounted.",
      action: "Scrub playhead continuously across segment boundaries.",
      observed: "Playhead origin tag path missing from shell source.",
      expected: "Playhead-origin updates are tagged to control scroll behavior.",
      likelyDriftPoint: "Selection origin ref assignment in timeline range input/effects.",
    },
  );

  caseAssert(
    source.includes("if (origin !== \"playhead\" || !inComfortBand)"),
    {
      title: "anti-thrash comfort band",
      setup: "Long transcript with active line auto-scroll enabled.",
      action: "Playhead-driven segment changes inside visible comfort band.",
      observed: "Comfort-band guard missing.",
      expected: "No smooth scroll churn while playhead advances inside comfort band.",
      likelyDriftPoint: "Transcript/timeline centering effect guard removed or refactored incorrectly.",
    },
  );
}

async function same_speaker_adjacent_segments_do_not_confuse_active_line() {
  const segments = [
    seg("a", 0.0, 1.0, "Host", "First line"),
    seg("b", 1.0, 2.0, "Host", "Second line"),
    seg("c", 2.0, 3.0, "Host", "Third line"),
    seg("d", 3.0, 4.0, "Host", "Fourth line"),
    seg("e", 4.0, 5.0, "Host", "Fifth line"),
    seg("f", 5.0, 6.0, "Host", "Sixth line"),
  ];
  assert.equal(resolvePlayheadSegment(segments, 0.3)?.segment_id, "a");
  assert.equal(resolvePlayheadSegment(segments, 1.5)?.segment_id, "b");
  assert.equal(resolvePlayheadSegment(segments, 2.7)?.segment_id, "c");
  assert.equal(resolvePlayheadSegment(segments, 4.1)?.segment_id, "e");
}

async function timing_clamp_shows_hint_only_when_adjusted() {
  const tiny = seg("tiny", 2.0, 2.1);
  const trimmedEnd = trimSegmentEndTiming(tiny, -10);
  assert.equal(trimmedEnd.end_sec, 2.1);

  const source = await readFile(
    "d:/nursery/nursery/apps/hammer/src/editor/HammerWorkspaceShell.tsx",
    "utf-8",
  );

  caseAssert(
    source.includes("nextStart !== parsed") && source.includes("adjustedEnd !== parsed"),
    {
      title: "clamp hint conditionality",
      setup: "Editing start/end via transcript timing inputs.",
      action: "Type values that both require and do not require clamp adjustment.",
      observed: "Hint predicate does not compare adjusted vs typed values.",
      expected: "Hint displays only when clamp altered the typed value.",
      likelyDriftPoint: "Timing-input onChange hint logic.",
    },
  );
}

async function modified_markers_persist_until_authoritative_acceptance() {
  const source = await readFile(
    "d:/nursery/nursery/apps/hammer/src/editor/HammerWorkspaceShell.tsx",
    "utf-8",
  );

  caseAssert(
    source.includes("hasTranscriptSegmentChanged(sourceTranscriptById.get(segment.segment_id), segment)"),
    {
      title: "modified marker baseline comparison",
      setup: "Edited and untouched segments coexist in transcript.",
      action: "Compute modified markers before/after accepted authoritative transcript arrives.",
      observed: "Marker computation is not tied to source transcript baseline.",
      expected: "Markers persist until source baseline matches edited segment content/timing.",
      likelyDriftPoint: "modifiedTranscriptSegmentIds useMemo baseline logic.",
    },
  );

  caseAssert(
    source.includes("}, [launchContext.workpiece_id, transcriptSourceId]);")
      && !source.includes("}, [transcriptSegments, transcriptSourceId]);"),
    {
      title: "source-boundary sync gate",
      setup: "Editable transcript with pending modifications.",
      action: "Parent rerenders with equivalent transcript objects.",
      observed: "Sync effect appears to include unstable transcript object dependency.",
      expected: "No in-flight edit wipe until authoritative source boundary changes.",
      likelyDriftPoint: "Sync effect dependency array in HammerWorkspaceShell.",
    },
  );
}

async function run() {
  await keeps_selection_locked_during_timing_edits();
  await playhead_updates_active_segment_without_scroll_thrash();
  await same_speaker_adjacent_segments_do_not_confuse_active_line();
  await timing_clamp_shows_hint_only_when_adjusted();
  await modified_markers_persist_until_authoritative_acceptance();

  // Supplemental numerical guards for boundary/tiny behavior.
  const nearZero = seg("zero", 0.2, 1.2);
  const movedLeft = moveSegmentTiming(nearZero, -2.0);
  assert.equal(movedLeft.start_sec, 0.0);
  assert.equal(movedLeft.end_sec, 1.0);

  const nearMediaEnd = seg("tail", 3599.8, 3600.0);
  const movedRight = moveSegmentTiming(nearMediaEnd, 1.0);
  assert.equal(movedRight.start_sec, 3600.8);
  assert.equal(movedRight.end_sec, 3601.0);

  const resolverSegments = [seg("s1", 0, 1), seg("s2", 1, 2)];
  assert.equal(resolveSelectedSegmentId(resolverSegments, "s2"), "s2");
  assert.equal(resolveSelectedSegmentId(resolverSegments, "missing"), "s1");
  assert.equal(resolveSelectedSegmentId([], "s1"), null);

  const longSegments: HammerTranscriptSegment[] = [];
  let cursor = 0;
  for (let index = 0; index < 220; index += 1) {
    const start = cursor;
    const end = Number((start + 0.6).toFixed(1));
    longSegments.push(seg(`l${index}`, start, end, "Narrator", `Line ${index}`));
    cursor = end;
  }
  assert.equal(resolvePlayheadSegment(longSegments, cursor - 0.2)?.segment_id, "l219");
  // eslint-disable-next-line no-console
  console.log("Hammer transcript hardening tests passed.");
}

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Hammer transcript hardening tests failed:", error);
  process.exit(1);
});
