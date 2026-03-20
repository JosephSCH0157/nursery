import assert from "node:assert/strict";
import {
  buildFailedHammerAudioPolish,
  buildPreparedHammerAudioPolish,
  buildPreparingHammerAudioPolish,
  isReusableHammerAudioPolish,
} from "../src/prep/hammerAudioPolish";
import type { HammerPrepSource } from "../src/prep/hammerPrep";

const prepSource: HammerPrepSource = {
  mediaRef: {
    media_id: "media_01",
    kind: "recording_audio",
    local_relpath: "recordings/episode-1.wav",
    duration_ms: 8_000,
    byte_size: 1_024_000,
    sha256: "sha_episode_1",
  },
  workspaceMapping: {
    workspace_id: "11111111-1111-4111-8111-111111111111",
    local_root_abs: "D:\\ForgeMedia\\workspace",
  },
  local_root_abs: "D:\\ForgeMedia\\workspace",
  local_relpath: "recordings/episode-1.wav",
  media_signature: "media_01|recording_audio|recordings/episode-1.wav||1024000|8000|sha_episode_1",
};

{
  const preparing = buildPreparingHammerAudioPolish(prepSource);
  assert.equal(preparing.status, "preparing");
  assert.equal(preparing.source_media_signature, prepSource.media_signature);
}

{
  const prepared = buildPreparedHammerAudioPolish({
    prepSource,
    preparedAt: "2026-03-14T10:00:00.000Z",
    outputLocalRelpath: "hammer/prep/audio-polish/workpiece/episode-1.wav",
    outputMimeType: "audio/wav",
    outputDurationMs: 8_000,
  });
  assert.equal(isReusableHammerAudioPolish(prepared, prepSource), true);
}

{
  const unsupported = buildFailedHammerAudioPolish({
    prepSource,
    failureCode: "unsupported_source",
    failureReason: "Unsupported format.",
  });
  assert.equal(isReusableHammerAudioPolish(unsupported, prepSource), true);
}

{
  const retryable = buildFailedHammerAudioPolish({
    prepSource,
    failureCode: "processing_failed",
    failureReason: "Transient processing error.",
  });
  assert.equal(isReusableHammerAudioPolish(retryable, prepSource), false);
}

console.log("Hammer audio polish tests passed.");
