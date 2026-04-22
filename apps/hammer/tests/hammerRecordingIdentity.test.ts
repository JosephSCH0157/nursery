import assert from "node:assert/strict";
import { resolveHammerRecordingIdentityStatus } from "../src/editor/hammerRecordingIdentity";

async function testLabelMismatchIsAdvisoryWhenPathMatches() {
  const result = resolveHammerRecordingIdentityStatus({
    canonicalWorkpieceLabel: "Episode Alpha",
    legacyCaptureLabel: "Camera A weird name",
    canonicalMediaPath: "takes/episode-alpha.wav",
    mediaRef: {
      media_id: "media_1",
      kind: "recording_audio",
      local_relpath: "takes/episode-alpha.wav",
      cloud_uri: null,
      source_hint: null,
      sha256: null,
      byte_size: null,
      duration_ms: null,
    },
  });

  assert.equal(result.hasActualRecordingMismatch, false);
  assert.ok(result.labelMismatchWarning);
  assert.equal(result.actualRecordingMismatchWarning, null);
}

async function testActualMismatchRequiresIdentityConflict() {
  const result = resolveHammerRecordingIdentityStatus({
    canonicalWorkpieceLabel: "Episode Alpha",
    legacyCaptureLabel: "Episode Alpha",
    canonicalMediaPath: "takes/episode-alpha.wav",
    mediaRef: {
      media_id: "media_2",
      kind: "recording_audio",
      local_relpath: "takes/episode-beta.wav",
      cloud_uri: null,
      source_hint: null,
      sha256: null,
      byte_size: null,
      duration_ms: null,
    },
  });

  assert.equal(result.hasActualRecordingMismatch, true);
  assert.equal(result.labelMismatchWarning, null);
  assert.ok(result.actualRecordingMismatchWarning?.includes("episode-beta.wav"));
}

async function run() {
  await testLabelMismatchIsAdvisoryWhenPathMatches();
  await testActualMismatchRequiresIdentityConflict();
  // eslint-disable-next-line no-console
  console.log("Hammer recording identity tests passed.");
}

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Hammer recording identity tests failed:", error);
  process.exit(1);
});