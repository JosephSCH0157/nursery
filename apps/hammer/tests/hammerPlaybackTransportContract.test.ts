import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { describeHammerMediaPlaybackFailure, resolveHammerEndedTransportTime } from "../src/editor/useHammerWorkspaceShellPlayback";
import { activeMediaTimeToTransportTime, resolvePackagingTransport } from "../src/editor/hammerPackagingTransport";

test("native end reaches the accepted terminal duration even when the container ends 59 ms early", () => {
  assert.equal(resolveHammerEndedTransportTime(603.789, {
    playbackMediaDurationSec: 603.848,
    playbackTransportDurationSec: 603.848,
    resolveTransportTimeForMediaTime: (time) => time,
  }), 603.848);
});

test("native end retains source mapping and advances packaging phases without skipping the program", () => {
  for (const [playheadSec, nativeEnd, acceptedEnd, expected] of [
    [0, 4.941, 5, 5.01],
    [10, 603.789, 603.848, 608.858],
    [610, 1.941, 2, 610.848],
  ]) {
    const transport = resolvePackagingTransport({ introDurationSec: 5, compositionDurationSec: 603.848, outroDurationSec: 2, playheadSec });
    const result = resolveHammerEndedTransportTime(nativeEnd, {
      playbackMediaDurationSec: acceptedEnd,
      playbackTransportDurationSec: transport.totalDurationSec,
      resolveTransportTimeForMediaTime: (timeSec) => activeMediaTimeToTransportTime({ transport, timeSec }),
    });
    assert.ok(Math.abs(result - expected) < 0.000001, `${playheadSec}: ${result} != ${expected}`);
  }
});

test("native end remains usable without duration metadata and never moves backward from a later native end", () => {
  for (const duration of [null, 2]) {
    assert.ok(Math.abs(resolveHammerEndedTransportTime(2.53, {
      playbackMediaDurationSec: duration,
      playbackTransportDurationSec: 10,
      resolveTransportTimeForMediaTime: (time) => time + 3,
    }) - 5.54) < 0.000001);
  }
});

test("primary Hammer transport retains synchronous audible play and explicit rejection diagnostics", () => {
  const source = readFileSync(new URL("../src/editor/useHammerWorkspaceShellPlayback.ts", import.meta.url), "utf8");
  const toggleStart = source.indexOf("const togglePlayback = useCallback");
  const toggleEnd = source.indexOf("const seekPlayheadToTime", toggleStart);
  const toggle = source.slice(toggleStart, toggleEnd);
  assert.ok(toggleStart > 0 && toggleEnd > toggleStart);
  assert.match(toggle, /previewAudio\.muted = false/);
  assert.match(toggle, /previewAudio\.volume = 1/);
  assert.match(toggle, /resumeHammerStudioRackNativePreview\(previewAudio\)/);
  assert.match(toggle, /const playRequest = previewAudio\.play\(\)/);
  assert.match(toggle, /user_activation_play/);
  assert.match(toggle, /activationProgress = resolvePlaybackTransportProgress/);
  assert.match(toggle, /PLAYHEAD_WINDOW_EPSILON_SEC/);
  assert.match(toggle, /previewAudio\.pause\(\)/);
  assert.match(toggle, /previewVideoRef\.current\?\.pause\(\)/);
  assert.match(toggle, /setIsPlaybackActive\(false\)/);
});

test("source bookkeeping cannot pause a user-activation play request", () => {
  const source = readFileSync(new URL("../src/editor/useHammerWorkspaceShellPlayback.ts", import.meta.url), "utf8");
  const syncStart = source.indexOf("let srcChanged = false");
  const syncEnd = source.indexOf("if (!args.playbackMediaSrc)", syncStart);
  const sourceBookkeeping = source.slice(syncStart, syncEnd);
  assert.ok(syncStart > 0 && syncEnd > syncStart);
  assert.doesNotMatch(sourceBookkeeping, /previewAudio\.pause\(\)/);
  assert.doesNotMatch(sourceBookkeeping, /previewVideo\.pause\(\)/);
  assert.doesNotMatch(sourceBookkeeping, /segmentationVideo\.pause\(\)/);
});

test("media failures retain browser and media-element diagnostics", () => {
  const media = {
    error: { code: 4, message: "Unsupported source" },
    networkState: 3,
    readyState: 0,
  } as unknown as HTMLMediaElement;
  assert.deepEqual(describeHammerMediaPlaybackFailure(media, new DOMException("User activation is required", "NotAllowedError")), {
    name: "NotAllowedError",
    message: "User activation is required",
    mediaErrorCode: 4,
    mediaErrorMessage: "Unsupported source",
    networkState: 3,
    readyState: 0,
  });
});

test("raw canonical media remains the transport source when optional polish is unavailable", () => {
  const source = readFileSync(new URL("../src/editor/HammerWorkspaceShell.tsx", import.meta.url), "utf8");
  assert.match(source, /if \(preferredPlayback\.kind === "raw"\)/);
  assert.match(source, /effectivePlaybackMediaSrc/);
  assert.match(source, /playbackMediaSrc: effectivePlaybackMediaSrc/);
});
