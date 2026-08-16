import assert from "node:assert/strict";
import test from "node:test";
import {
  buildStructuredTranscriptResetKey,
  buildVisualTimelineResetKey,
} from "../src/editor/hammerWorkspaceShellResetKeys";

test("reset keys preserve empty authority sentinels", () => {
  assert.equal(buildStructuredTranscriptResetKey(null), "structured-transcript:none");
  assert.equal(buildVisualTimelineResetKey(null), "visual-timeline:none");
});

test("transcript reset keys change for editable segment truth", () => {
  const transcript = {
    transcript_id: "transcript-1",
    prepared_at: "2026-01-01T00:00:00.000Z",
    media_signature: "media-1",
    segments: [{ segment_id: "s1", speaker: "S1", text: "hello", start_sec: 0, end_sec: 1 }],
  } as never;
  const initial = buildStructuredTranscriptResetKey(transcript);
  const changed = buildStructuredTranscriptResetKey({
    ...transcript,
    segments: [{ ...transcript.segments[0], text: "hello again" }],
  });
  assert.match(initial, /^structured-transcript:/);
  assert.notEqual(initial, changed);
});

test("timeline reset keys include revision and clip identity", () => {
  const timeline = {
    revision: 1,
    updated_at: "2026-01-01T00:00:00.000Z",
    selected_clip_id: "clip-1",
    clips: [{ clip_id: "clip-1" }],
    assets: [],
  } as never;
  assert.notEqual(buildVisualTimelineResetKey(timeline), buildVisualTimelineResetKey({ ...timeline, revision: 2 }));
});
