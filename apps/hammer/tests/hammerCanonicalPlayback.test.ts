import assert from "node:assert/strict";
import {
  createHammerPlaybackSourceResolutionGuard,
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
assert.equal(failHammerPlayback(createHammerPlaybackReadiness("signed-4"), "signed-4", "network").status, "failed");

assert.equal(clampHammerMediaSeekTime(5.32, 603.848), 5.32);
assert.equal(clampHammerMediaSeekTime(700, 603.848), 603.848);
assert.equal(clampHammerMediaSeekTime(-5, 603.848), 0);

console.log("hammer canonical playback lifecycle tests passed");
