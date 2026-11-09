import assert from "node:assert/strict";
import {
  createHammerPlaybackSourceResolutionGuard,
  resolveHammerRawPlaybackSource,
  resolveHammerSignedMediaRefreshDelayMs,
  selectHammerEffectivePlaybackUrl,
} from "../src/editor/hammerCanonicalPlayback";
import {
  acceptHammerPlaybackCanPlay,
  acceptHammerPlaybackMetadata,
  clampHammerMediaSeekTime,
  createHammerPlaybackReadiness,
  failHammerPlayback,
} from "../src/editor/hammerPlaybackReadiness";

assert.equal(resolveHammerSignedMediaRefreshDelayMs("2026-11-07T01:00:00.000Z", Date.parse("2026-11-07T00:00:00.000Z")), 3_540_000);
assert.equal(resolveHammerSignedMediaRefreshDelayMs("2026-11-07T00:00:30.000Z", Date.parse("2026-11-07T00:00:00.000Z")), 0);
assert.throws(() => resolveHammerSignedMediaRefreshDelayMs("not-a-date", 0), /hammer_playback_expiry_invalid/);

const guard = createHammerPlaybackSourceResolutionGuard();
const stale = guard.begin();
const current = guard.begin();
assert.equal(guard.accepts(stale), false);
assert.equal(guard.accepts(current), true);
guard.invalidate();
assert.equal(guard.accepts(current), false);

assert.equal(selectHammerEffectivePlaybackUrl({ rawUrl: "raw", processedUrl: null, polishedUrl: null, useProcessed: false, preferPolished: true }), "raw");
assert.equal(selectHammerEffectivePlaybackUrl({ rawUrl: "raw", processedUrl: "processed", polishedUrl: "polished", useProcessed: true, preferPolished: true }), "processed");

let readiness = createHammerPlaybackReadiness("signed-1");
readiness = acceptHammerPlaybackMetadata({ current: readiness, source: "signed-1", durationSec: 603.848, expectedDurationSec: 603.848 });
assert.equal(readiness.status, "metadata_ready");
readiness = acceptHammerPlaybackCanPlay(readiness, "signed-1");
assert.equal(readiness.status, "playable");
assert.equal(acceptHammerPlaybackMetadata({ current: readiness, source: "stale-source", durationSec: 1, expectedDurationSec: 603.848 }), readiness);

const invalidDuration = acceptHammerPlaybackMetadata({ current: createHammerPlaybackReadiness("signed-2"), source: "signed-2", durationSec: Number.NaN, expectedDurationSec: 603.848 });
assert.deepEqual({ status: invalidDuration.status, error: invalidDuration.error }, { status: "failed", error: "media_duration_invalid" });
const mismatchedDuration = acceptHammerPlaybackMetadata({ current: createHammerPlaybackReadiness("signed-3"), source: "signed-3", durationSec: 700, expectedDurationSec: 603.848 });
assert.deepEqual({ status: mismatchedDuration.status, error: mismatchedDuration.error }, { status: "failed", error: "media_duration_mismatch" });
const authorityBackedUnknownDuration = acceptHammerPlaybackMetadata({
  current: createHammerPlaybackReadiness("signed-unknown-duration"),
  source: "signed-unknown-duration",
  durationSec: Number.POSITIVE_INFINITY,
  expectedDurationSec: 601.4,
  verifiedDurationSec: 603.848,
});
assert.deepEqual({
  status: authorityBackedUnknownDuration.status,
  durationSec: authorityBackedUnknownDuration.durationSec,
  durationSource: authorityBackedUnknownDuration.durationSource,
  error: authorityBackedUnknownDuration.error,
}, {
  status: "metadata_ready",
  durationSec: 603.848,
  durationSource: "verified_authority",
  error: null,
});
const unverifiedUnknownDuration = acceptHammerPlaybackMetadata({
  current: createHammerPlaybackReadiness("unsigned-unknown-duration"),
  source: "unsigned-unknown-duration",
  durationSec: Number.POSITIVE_INFINITY,
  expectedDurationSec: 603.848,
});
assert.equal(unverifiedUnknownDuration.error, "media_duration_unknown");
const contradictoryAuthorityDuration = acceptHammerPlaybackMetadata({
  current: authorityBackedUnknownDuration,
  source: "signed-unknown-duration",
  durationSec: 610,
  expectedDurationSec: 603.848,
  verifiedDurationSec: 603.848,
});
assert.equal(contradictoryAuthorityDuration.error, "media_duration_mismatch");
assert.equal(failHammerPlayback(createHammerPlaybackReadiness("signed-4"), "signed-4", "network").status, "failed");

assert.equal(clampHammerMediaSeekTime(5.32, 603.848), 5.32);
assert.equal(clampHammerMediaSeekTime(700, 603.848), 603.848);
assert.equal(clampHammerMediaSeekTime(-5, 603.848), 0);
assert.equal(clampHammerMediaSeekTime(600, Number.POSITIVE_INFINITY, 603.848), 600);
assert.equal(clampHammerMediaSeekTime(700, Number.POSITIVE_INFINITY, 603.848), 603.848);

const canonicalSha256 = "5".repeat(64);
const canonicalCalls: string[] = [];
const canonicalSource = await resolveHammerRawPlaybackSource({
  workspaceId: "workspace-1",
  workpieceId: "workpiece-1",
  canonicalRecordingId: "recording-1",
  recordingRevisionId: "revision-1",
  mediaRef: {
    media_id: "media-1",
    kind: "recording_video",
    source_hint: "cloud",
    local_relpath: "recordings/brad.webm",
    sha256: canonicalSha256,
    duration_ms: 603_848,
  },
  path: "recordings/brad.webm",
  mimeType: "video/webm",
  fetcher: (async (url: string) => {
    canonicalCalls.push(url);
    return new Response(JSON.stringify({ ok: true, data: {
      canonical_recording_id: "recording-1",
      recording_revision_id: "revision-1",
      source_sha256: canonicalSha256,
      media_id: "media-1",
      media_path: "recordings/brad.webm",
      content_type: "video/webm",
      byte_size: 120_617_428,
      duration_ms: 603_848,
      url: "https://storage.example/brad.webm?signed=1",
      expires_at: "2026-11-08T23:00:00.000Z",
    } }), { status: 200, headers: { "content-type": "application/json" } });
  }) as never,
});
assert.equal(canonicalSource.kind, "canonical_signed");
assert.equal(canonicalSource.authority?.durationSec, 603.848);
assert.equal(canonicalCalls.length, 1);
assert.match(canonicalCalls[0]!, /\/hammer\/playable-media$/);
assert.equal(canonicalCalls.some((url) => url.includes("read-file")), false);

let incompleteIdentityFetches = 0;
await assert.rejects(
  resolveHammerRawPlaybackSource({
    workspaceId: "workspace-1",
    workpieceId: "workpiece-1",
    canonicalRecordingId: "recording-1",
    recordingRevisionId: "revision-1",
    mediaRef: { media_id: "media-1", kind: "recording_video", source_hint: "cloud", local_relpath: "recordings/brad.webm" },
    path: "recordings/brad.webm",
    mimeType: "video/webm",
    fetcher: (async () => { incompleteIdentityFetches += 1; return new Response(); }) as never,
  }),
  (error: unknown) => error instanceof Error && "code" in error && error.code === "hammer_canonical_playback_identity_incomplete",
);
assert.equal(incompleteIdentityFetches, 0);

console.log("hammer canonical playback lifecycle tests passed");
