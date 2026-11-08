import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { describeHammerMediaPlaybackFailure } from "../src/editor/useHammerWorkspaceShellPlayback";

test("primary Hammer transport retains synchronous audible play and explicit rejection diagnostics", () => {
  const source = readFileSync(new URL("../src/editor/useHammerWorkspaceShellPlayback.ts", import.meta.url), "utf8");
  const toggleStart = source.indexOf("const togglePlayback = useCallback");
  const toggleEnd = source.indexOf("const seekPlayheadToTime", toggleStart);
  const toggle = source.slice(toggleStart, toggleEnd);
  assert.ok(toggleStart > 0 && toggleEnd > toggleStart);
  assert.match(toggle, /previewAudio\.muted = false/);
  assert.match(toggle, /previewAudio\.volume = 1/);
  assert.match(toggle, /const playRequest = previewAudio\.play\(\)/);
  assert.match(toggle, /user_activation_play/);
  assert.match(toggle, /previewAudio\.pause\(\)/);
  assert.match(toggle, /previewVideoRef\.current\?\.pause\(\)/);
  assert.match(toggle, /setIsPlaybackActive\(false\)/);
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
