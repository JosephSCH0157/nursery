import assert from "node:assert/strict";
import { projectLegacyHammerCompositionV2 } from "../src/composition/hammerLegacyCompositionProjection";
import { buildHammerBaseMediaProjection, decideHammerBaseCompositionInitialization, resolveHammerBaseCompositionDurationSec } from "../src/composition/hammerBaseMediaComposition";
import { buildTimelineDockVM } from "../src/editor/hammerWorkspaceShellViewModels";

const brad = {
  workspaceId: "cc5478ff-37be-403e-824c-467fa7da061e",
  workpieceId: "21d16d6a-905b-491e-8761-028789612ae5",
  canonicalRecordingId: "4cc846e3-187c-46d9-8733-e7402488236c",
  recordingRevisionId: "9c991aa7-f551-4f03-a4d6-41eb40ef81ec",
  mediaId: "recording-session:brad",
  mediaPath: "recordings/brad.webm",
  mediaSha256: "595ea9d8abc571a5e92be6eec0c5e5c23e82a6a6956a598dc391c82d80224e24",
  mimeType: "video/webm;codecs=vp9,opus",
  durationMs: 603_848,
  transcriptId: "60d9c5ea-8cd5-4d4b-b103-06e734d4204a",
  createdAt: "2026-11-07T00:00:00.000Z",
} as const;

const projection = buildHammerBaseMediaProjection(brad);
assert.equal(projection.projected_tracks.length, 2);
for (const track of projection.projected_tracks) {
  assert.deepEqual(
    {
      source_start_sec: track.clips[0]?.source_start_sec,
      source_end_sec: track.clips[0]?.source_end_sec,
      timeline_start_sec: track.clips[0]?.timeline_start_sec,
      timeline_end_sec: track.clips[0]?.timeline_end_sec,
    },
    { source_start_sec: 0, source_end_sec: 603.848, timeline_start_sec: 0, timeline_end_sec: 603.848 },
  );
}
assert.equal(projection.transcript_id, brad.transcriptId);
assert.equal(resolveHammerBaseCompositionDurationSec({ transcriptDurationSec: 601.406, mediaDurationMs: 603848 }), 603.848);
assert.equal(resolveHammerBaseCompositionDurationSec({ transcriptDurationSec: 700, mediaDurationMs: 603848 }), 603.848);
const timeline = buildTimelineDockVM({
  timelineDurationSec: 603.848,
  playbackTransportDurationSec: 603.848,
  playheadSec: 5.32,
  playheadRatioPercent: (5.32 / 603.848) * 100,
  visualTimelineLaneClips: [],
  visualPlacementEditingEnabled: false,
  visualTimelineFocusNonce: 0,
  linkedPrimaryVisualId: null,
  isScrubbing: false,
  isPlaybackActive: false,
  timelineLanes: [],
  laneGapsById: new Map(),
  timelineMinorTicks: [],
  timelineTicks: [],
  sortedTimelineMarkers: [],
  editableTranscriptSegments: [{ segment_id: "segment-1", start_sec: 5.32, end_sec: 601.406, speaker: "A", text: "Brad's transcript" }],
  SCRUB_RATE_OPTIONS: [],
});
assert.equal(timeline.timelineDurationSec, 603.848);
assert.equal(timeline.playheadSec, 5.32);
assert.equal(timeline.visualTimelineDock.durationSec, 603.848);
assert.ok(timeline.playheadRatioPercent > 0 && timeline.playheadRatioPercent < 1);

assert.throws(
  () => decideHammerBaseCompositionInitialization({ identity: brad, existingComposition: null, expectedRevisionUpdatedAt: null }),
  /hammer_base_composition_cas_required/,
);

const existing = projectLegacyHammerCompositionV2(projection);
assert.deepEqual(
  decideHammerBaseCompositionInitialization({ identity: brad, existingComposition: existing, expectedRevisionUpdatedAt: "2026-11-07T00:00:00.000Z" }),
  { kind: "preserve_existing", composition: existing },
);

console.log("hammer base-media composition tests passed");
