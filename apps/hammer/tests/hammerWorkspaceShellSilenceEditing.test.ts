import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { analyzeDeadAirGaps, applyDeadAirClosure } from "../src/editor/hammerDeadAirClosure";
import { buildSilenceCutSuggestions, filterDismissedSilenceCutSuggestions } from "../src/editor/hammerSilenceCutSuggestions";

test("silence suggestions remain advisory and dismissal does not mutate analysis", () => {
  const segmentation = {
    regions: [{ id: "gap-1", kind: "silence" as const, start_sec: 1, end_sec: 3 }],
  };
  const before = structuredClone(segmentation);
  const suggestions = buildSilenceCutSuggestions({ segmentation, durationSec: 10 });
  assert.equal(suggestions.length, 1);
  assert.equal(filterDismissedSilenceCutSuggestions({
    suggestions,
    dismissedSuggestionIds: new Set([suggestions[0].id]),
  }).length, 0);
  assert.deepEqual(segmentation, before);
});

test("dead-air analysis is advisory and closure preserves the established timing result", () => {
  const segments = [
    { segment_id: "a", speaker: "S1", text: "A", start_sec: 0, end_sec: 1 },
    { segment_id: "b", speaker: "S1", text: "B", start_sec: 4, end_sec: 5 },
  ];
  const before = structuredClone(segments);
  const analysis = analyzeDeadAirGaps(segments, 1.5);
  assert.deepEqual(segments, before);
  assert.equal(analysis.totalRemovableSec, 1.5);
  const closure = applyDeadAirClosure({ segments, thresholdSec: 1.5 });
  assert.deepEqual(closure.segments.map(({ start_sec, end_sec }) => [start_sec, end_sec]), [[0, 1], [2.5, 3.5]]);
});

test("controller uses one canonical history command for accepted silence edits", async () => {
  const source = await readFile(new URL("../src/editor/useHammerWorkspaceShellSilenceEditing.ts", import.meta.url), "utf8");
  assert.ok(source.includes("args.applyHistoryMutation({"));
  assert.ok(source.includes('label: "Add audio cut"'));
  assert.ok(source.includes('label: `Trim dead air'));
  assert.ok(source.includes('kind: "timing_adjustment"'));
  assert.ok(source.includes("immediatePersist: true"));
  assert.ok(source.includes("applyInFlightRef.current"));
});

test("silence controller excludes neighboring cleanup, candidate, caption, and finishing authorities", async () => {
  const source = await readFile(new URL("../src/editor/useHammerWorkspaceShellSilenceEditing.ts", import.meta.url), "utf8");
  assert.equal(source.includes("useHammerWorkspaceShellTranscriptCleanup"), false);
  assert.equal(source.includes("hammerCandidateQueue"), false);
  assert.equal(source.includes("Caption"), false);
  assert.equal(source.includes("StudioRack"), false);
  assert.equal(source.includes("audioProcessingBackend"), false);
});
