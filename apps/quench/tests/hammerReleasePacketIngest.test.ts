import assert from "node:assert/strict";
import {
  HAMMER_QUENCH_RELEASE_PACKET_MANIFEST_PATH,
  ingestHammerReleasePacket,
  type QuenchPacketAudioResolution,
} from "../src";

type MemoryStore = Record<string, unknown>;

function createReader(store: MemoryStore) {
  return {
    async readJson(path: string): Promise<unknown | null> {
      const value = store[path];
      if (value == null) return null;
      return value;
    },
    async readText(path: string): Promise<string | null> {
      const value = store[path];
      return typeof value === "string" ? value : null;
    },
  };
}

function buildManifest(overrides?: Partial<Record<string, unknown>>) {
  return {
    version: 1,
    packet_kind: "quench_release_packet",
    generated_by: "Hammer",
    generated_at: "2026-03-24T12:00:00.000Z",
    workpiece_id: "wp_01",
    workspace_id: "ws_01",
    episode_title: "Episode title",
    duration_seconds: 1800,
    audio: {
      kind: "raw",
      media_id: "media_01",
      local_relpath: "recordings/episode.wav",
      workpiece_path: "recordings/episode.wav",
      mime_type: "audio/wav",
      source_label: "raw source",
    },
    captions: {
      srt_path: "hammer/release-packet/captions/episode.srt",
      vtt_path: null,
    },
    transcript: {
      text_path: "hammer/release-packet/transcript/transcript.txt",
      source_layer_id: "macro_run_panel",
      source_recipe_ref: "speaker_panel:balanced",
      source_kind: "derived",
    },
    visuals: {
      placements_path: "hammer/release-packet/visuals/placements.json",
      count: 1,
    },
    readiness: {
      ready_for_quench: true,
      overall_status: "ready",
      reasons: [],
    },
    ...(overrides ?? {}),
  };
}

async function testReadyPacket() {
  const manifest = buildManifest();
  const store: MemoryStore = {
    [HAMMER_QUENCH_RELEASE_PACKET_MANIFEST_PATH]: manifest,
    [manifest.transcript.text_path]: "Resolved transcript text.",
    [manifest.captions.srt_path]: "1\n00:00:00,000 --> 00:00:01,000\nhello\n",
    [manifest.visuals.placements_path]: [
      {
        placement_id: "pl_01",
        anchor_segment_id: "seg_01",
        start_sec: 0.1,
        end_sec: 1.4,
        asset_path: "visuals/card.png",
        status: "matched",
      },
    ],
  };
  const result = await ingestHammerReleasePacket({
    reader: createReader(store),
  });
  assert.equal(result.state, "ready");
  assert.equal(result.status_label, "Ready for publish");
  assert.equal(result.audio.resolved, true);
  assert.equal(result.issues.length, 0);
}

async function testAttentionWhenAudioUnresolved() {
  const manifest = buildManifest();
  const store: MemoryStore = {
    [HAMMER_QUENCH_RELEASE_PACKET_MANIFEST_PATH]: manifest,
    [manifest.transcript.text_path]: "Resolved transcript text.",
    [manifest.captions.srt_path]: "1\n00:00:00,000 --> 00:00:01,000\nhello\n",
    [manifest.visuals.placements_path]: [],
  };
  const result = await ingestHammerReleasePacket({
    reader: createReader(store),
    audioResolver: {
      async resolveAudioReference(): Promise<QuenchPacketAudioResolution> {
        return {
          resolved: false,
          uri: null,
          reason: "Test resolver could not find audio.",
        };
      },
    },
  });
  assert.equal(result.state, "attention");
  assert.equal(result.status_label, "Needs attention: audio reference unresolved");
  assert.equal(result.issues.some((issue) => issue.code === "AUDIO_REFERENCE_UNRESOLVED"), true);
}

async function testAttentionWhenCaptionsMissingButPacketValid() {
  const manifest = buildManifest({
    captions: {
      srt_path: null,
      vtt_path: null,
    },
  });
  const store: MemoryStore = {
    [HAMMER_QUENCH_RELEASE_PACKET_MANIFEST_PATH]: manifest,
    [manifest.transcript.text_path]: "Resolved transcript text.",
    [manifest.visuals.placements_path]: [],
  };
  const result = await ingestHammerReleasePacket({
    reader: createReader(store),
  });
  assert.equal(result.state, "attention");
  assert.equal(result.status_label, "Needs attention: captions missing");
  assert.equal(result.issues.some((issue) => issue.code === "CAPTIONS_MISSING"), true);
}

async function testVisualsMissingIsWarningNotInvalid() {
  const manifest = buildManifest();
  const store: MemoryStore = {
    [HAMMER_QUENCH_RELEASE_PACKET_MANIFEST_PATH]: manifest,
    [manifest.transcript.text_path]: "Resolved transcript text.",
    [manifest.captions.srt_path]: "1\n00:00:00,000 --> 00:00:01,000\nhello\n",
  };
  const result = await ingestHammerReleasePacket({
    reader: createReader(store),
  });
  assert.equal(result.state, "ready");
  assert.equal(result.issues.some((issue) => issue.code === "VISUALS_MISSING"), true);
}

async function testInvalidManifestShape() {
  const store: MemoryStore = {
    [HAMMER_QUENCH_RELEASE_PACKET_MANIFEST_PATH]: {
      packet_kind: "wrong",
    },
  };
  const result = await ingestHammerReleasePacket({
    reader: createReader(store),
  });
  assert.equal(result.state, "invalid");
  assert.equal(result.status_label, "Needs attention: packet invalid");
}

async function testInvalidWhenManifestNotFound() {
  const result = await ingestHammerReleasePacket({
    reader: createReader({}),
  });
  assert.equal(result.state, "invalid");
  assert.equal(result.status_label, "Needs attention: packet invalid");
  assert.equal(result.issues.some((issue) => issue.code === "MANIFEST_NOT_FOUND"), true);
}

async function testAttentionWhenTranscriptMissing() {
  const manifest = buildManifest();
  const store: MemoryStore = {
    [HAMMER_QUENCH_RELEASE_PACKET_MANIFEST_PATH]: manifest,
    [manifest.captions.srt_path]: "1\n00:00:00,000 --> 00:00:01,000\nhello\n",
    [manifest.visuals.placements_path]: [],
  };
  const result = await ingestHammerReleasePacket({
    reader: createReader(store),
  });
  assert.equal(result.state, "attention");
  assert.equal(result.status_label, "Needs attention: transcript missing");
  assert.equal(result.issues.some((issue) => issue.code === "TRANSCRIPT_MISSING"), true);
}

async function run() {
  await testReadyPacket();
  await testAttentionWhenAudioUnresolved();
  await testAttentionWhenCaptionsMissingButPacketValid();
  await testVisualsMissingIsWarningNotInvalid();
  await testInvalidManifestShape();
  await testInvalidWhenManifestNotFound();
  await testAttentionWhenTranscriptMissing();
  // eslint-disable-next-line no-console
  console.log("Quench hammer release packet ingest tests passed.");
}

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Quench hammer release packet ingest tests failed:", error);
  process.exit(1);
});
