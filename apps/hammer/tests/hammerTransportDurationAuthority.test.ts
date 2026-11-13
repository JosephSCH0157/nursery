import assert from "node:assert/strict";
import test from "node:test";
import type { MediaRef } from "../../../packages/contracts/hammer/media-resolver.contract";
import type { HammerRawPlaybackSource } from "../src/editor/hammerCanonicalPlayback";
import { resolveHammerTransportDurationAuthority } from "../src/editor/hammerTransportDurationAuthority";

const identity = {
  canonicalRecordingId: "4cc846e3-187c-46d9-8733-e7402488236c",
  recordingRevisionId: "9c991aa7-f551-4f03-a4d6-41eb40ef81ec",
  sourceSha256: "595ea9d8abc571a5e92be6eec0c5e5c23e82a6a6956a598dc391c82d80224e24",
} as const;

function mediaRef(duration_ms?: number): MediaRef {
  return {
    media_id: "recording-session:brad",
    kind: "recording_video",
    source_hint: "cloud",
    local_relpath: "recordings/brad.webm",
    sha256: identity.sourceSha256,
    ...(duration_ms === undefined ? {} : { duration_ms }),
  };
}

function signedSource(overrides?: Partial<NonNullable<HammerRawPlaybackSource["authority"]>>): HammerRawPlaybackSource {
  return {
    url: "https://storage.example/brad.webm?signed=1",
    kind: "canonical_signed",
    expiresAt: "2026-11-09T23:00:00.000Z",
    authority: {
      ...identity,
      durationSec: 603.848,
      ...overrides,
    },
  };
}

test("verified signed authority extends transport beyond the saved transcript for a legacy hydrated row", () => {
  const result = resolveHammerTransportDurationAuthority({
    mediaRef: mediaRef(),
    transcriptDurationSec: 601.406,
    canonicalRecordingId: identity.canonicalRecordingId,
    recordingRevisionId: identity.recordingRevisionId,
    rawPlaybackSource: signedSource(),
  });
  assert.deepEqual(result, {
    durationSec: 603.848,
    source: "verified_canonical_authority",
    playbackSourceAccepted: true,
    verifiedDurationAuthority: {
      source: "https://storage.example/brad.webm?signed=1",
      durationSec: 603.848,
    },
    diagnostic: null,
  });
});

test("mismatched recording, revision, or hash cannot authorize an unknown native duration", () => {
  for (const authority of [
    signedSource({ canonicalRecordingId: "other-recording" }),
    signedSource({ recordingRevisionId: "other-revision" }),
    signedSource({ sourceSha256: "a".repeat(64) }),
  ]) {
    const result = resolveHammerTransportDurationAuthority({
      mediaRef: mediaRef(),
      transcriptDurationSec: 601.406,
      canonicalRecordingId: identity.canonicalRecordingId,
      recordingRevisionId: identity.recordingRevisionId,
      rawPlaybackSource: authority,
    });
    assert.equal(result.durationSec, 601.406);
    assert.equal(result.verifiedDurationAuthority, null);
    assert.equal(result.playbackSourceAccepted, false);
    assert.equal(result.diagnostic?.code, "hammer_transport_canonical_authority_mismatch");
  }
});

test("contradictory hydrated and signed durations reject signed duration authority", () => {
  const result = resolveHammerTransportDurationAuthority({
    mediaRef: mediaRef(610_000),
    transcriptDurationSec: 601.406,
    canonicalRecordingId: identity.canonicalRecordingId,
    recordingRevisionId: identity.recordingRevisionId,
    rawPlaybackSource: signedSource(),
  });
  assert.equal(result.durationSec, 610);
  assert.equal(result.source, "hydrated_media");
  assert.equal(result.verifiedDurationAuthority, null);
  assert.equal(result.playbackSourceAccepted, false);
  assert.equal(result.diagnostic?.code, "hammer_transport_canonical_duration_mismatch");
});

test("generic previews preserve hydrated-media and transcript fallback behavior", () => {
  const buffered: HammerRawPlaybackSource = {
    url: "blob:https://forge.example/preview",
    kind: "buffered_preview",
    expiresAt: null,
    authority: null,
  };
  assert.equal(resolveHammerTransportDurationAuthority({
    mediaRef: mediaRef(42_000),
    transcriptDurationSec: 40,
    canonicalRecordingId: null,
    recordingRevisionId: null,
    rawPlaybackSource: buffered,
  }).durationSec, 42);
  assert.equal(resolveHammerTransportDurationAuthority({
    mediaRef: mediaRef(),
    transcriptDurationSec: 40,
    canonicalRecordingId: null,
    recordingRevisionId: null,
    rawPlaybackSource: buffered,
  }).durationSec, 40);
});
