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
      status: "ready",
      ready_for_quench: true,
      overall_status: "ready",
      reason_codes: [],
      reasons_detail: [],
      blocking_reason_codes: [],
      blocking_reasons_detail: [],
      review_reason_codes: [],
      review_reasons_detail: [],
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
  assert.equal(result.verdict?.status, "ready");
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
  assert.equal(result.state, "ready");
  assert.equal(result.status_label, "Ready for publish");
  assert.equal(result.verdict?.status, "ready");
  assert.equal(result.verdict?.ready_for_quench, true);
  assert.equal(result.verdict?.reason_codes.includes("quench_audio_reference_unresolved"), false);
  assert.equal(result.issues.some((issue) => issue.code === "quench_audio_reference_unresolved"), true);
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
  assert.equal(result.state, "ready");
  assert.equal(result.status_label, "Ready for publish");
  assert.equal(result.verdict?.status, "ready");
  assert.equal(result.verdict?.reason_codes.includes("quench_captions_missing"), false);
  assert.equal(result.issues.some((issue) => issue.code === "quench_captions_missing"), true);
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
  assert.equal(result.verdict?.status, "ready");
  assert.equal(result.verdict?.reason_codes.includes("quench_visuals_missing"), false);
  assert.equal(result.issues.some((issue) => issue.code === "quench_visuals_missing"), true);
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
  assert.equal(result.state, "ready");
  assert.equal(result.status_label, "Ready for publish");
  assert.equal(result.verdict?.status, "ready");
  assert.equal(result.verdict?.reason_codes.includes("quench_transcript_missing"), false);
  assert.equal(result.issues.some((issue) => issue.code === "quench_transcript_missing"), true);
}

async function testManifestAcceptsEditorialTruthExtension() {
  const manifest = buildManifest({
    editorial_truth: {
      schema_version: 1,
      authority_graph_id: "graph_01",
      authority_graph_version: 1,
      active_operations: [],
      posture_summary: {
        preview: "authoritative",
        export: "authoritative",
        handoff: "authoritative",
      },
      deferred_or_unsupported_operation_ids: [],
      artifact_operation_links: {
        transcript_text_path: "hammer/release-packet/transcript/transcript.txt",
        captions_srt_path: "hammer/release-packet/captions/episode.srt",
        captions_vtt_path: null,
        visuals_path: "hammer/release-packet/visuals/placements.json",
        operation_ids: [],
      },
    },
  });
  const store: MemoryStore = {
    [HAMMER_QUENCH_RELEASE_PACKET_MANIFEST_PATH]: manifest,
    [manifest.transcript.text_path]: "Resolved transcript text.",
    [manifest.captions.srt_path]: "1\n00:00:00,000 --> 00:00:01,000\nhello\n",
    [manifest.visuals.placements_path]: [],
  };
  const result = await ingestHammerReleasePacket({
    reader: createReader(store),
  });
  assert.equal(result.state, "ready");
  assert.equal(result.manifest?.editorial_truth?.authority_graph_id, "graph_01");
}

async function testManifestNeedsReviewSurvivesIngestWithoutReinterpretation() {
  const manifest = buildManifest({
    readiness: {
      status: "needs_review",
      ready_for_quench: false,
      overall_status: "stale",
      reason_codes: ["artifact_visuals_stale"],
      reasons_detail: [{
        code: "artifact_visuals_stale",
        label: "Visual placements are stale.",
        severity: "review",
        source: "artifact",
        operationId: null,
        operation_id: null,
      }],
      blocking_reason_codes: [],
      blocking_reasons_detail: [],
      review_reason_codes: ["artifact_visuals_stale"],
      review_reasons_detail: [{
        code: "artifact_visuals_stale",
        label: "Visual placements are stale.",
        severity: "review",
        source: "artifact",
        operationId: null,
        operation_id: null,
      }],
      reasons: ["Visual placements are stale."],
    },
  });
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
  assert.equal(result.state, "needs_review");
  assert.equal(result.status_label, "Needs review before publish");
  assert.equal(result.verdict?.reason_codes.includes("artifact_visuals_stale"), true);
}

async function testManifestBlockedTruthOutranksLocalReviewOnlyIssue() {
  const manifest = buildManifest({
    readiness: {
      status: "blocked",
      ready_for_quench: false,
      overall_status: "failed",
      reason_codes: ["handoff_blocked"],
      reasons_detail: [{
        code: "handoff_blocked",
        label: "Handoff is blocked.",
        severity: "blocking",
        source: "handoff",
        operationId: null,
        operation_id: null,
      }],
      blocking_reason_codes: ["handoff_blocked"],
      blocking_reasons_detail: [{
        code: "handoff_blocked",
        label: "Handoff is blocked.",
        severity: "blocking",
        source: "handoff",
        operationId: null,
        operation_id: null,
      }],
      review_reason_codes: [],
      review_reasons_detail: [],
      reasons: ["Handoff is blocked."],
    },
  });
  const store: MemoryStore = {
    [HAMMER_QUENCH_RELEASE_PACKET_MANIFEST_PATH]: manifest,
    [manifest.transcript.text_path]: "Resolved transcript text.",
    [manifest.captions.srt_path]: "1\n00:00:00,000 --> 00:00:01,000\nhello\n",
  };
  const result = await ingestHammerReleasePacket({
    reader: createReader(store),
  });
  assert.equal(result.state, "blocked");
  assert.equal(result.verdict?.reason_codes.includes("handoff_blocked"), true);
  assert.equal(result.verdict?.reason_codes.includes("quench_visuals_missing"), false);
  assert.equal(result.issues.some((issue) => issue.code === "quench_visuals_missing"), true);
}

async function testManifestReadyForQuenchFlagIsNotRecomputed() {
  const manifest = buildManifest({
    readiness: {
      status: "ready",
      ready_for_quench: false,
      overall_status: "ready",
      reason_codes: [],
      reasons_detail: [],
      blocking_reason_codes: [],
      blocking_reasons_detail: [],
      review_reason_codes: [],
      review_reasons_detail: [],
      reasons: [],
    },
  });
  const store: MemoryStore = {
    [HAMMER_QUENCH_RELEASE_PACKET_MANIFEST_PATH]: manifest,
    [manifest.transcript.text_path]: "Resolved transcript text.",
    [manifest.captions.srt_path]: "1\n00:00:00,000 --> 00:00:01,000\nhello\n",
    [manifest.visuals.placements_path]: [],
  };
  const result = await ingestHammerReleasePacket({
    reader: createReader(store),
  });
  assert.equal(result.state, "ready");
  assert.equal(result.status_label, "Ready for publish");
  assert.equal(result.verdict?.status, "ready");
  assert.equal(result.verdict?.ready_for_quench, false);
}

async function testManifestReasonDetailsArePreservedWithoutQuenchBackfill() {
  const manifest = buildManifest({
    readiness: {
      status: "blocked",
      ready_for_quench: false,
      overall_status: "failed",
      reason_codes: ["handoff_blocked", "artifact_visuals_stale"],
      reasons_detail: [
        {
          code: "handoff_blocked",
          label: "Handoff is blocked.",
          severity: "blocking",
          source: "handoff",
          operation_id: "op_blocked_01",
        },
        {
          code: "artifact_visuals_stale",
          label: "Visual placements are stale.",
          severity: "review",
          source: "artifact",
          operationId: "op_review_01",
        },
      ],
      blocking_reason_codes: ["handoff_blocked"],
      blocking_reasons_detail: [
        {
          code: "handoff_blocked",
          label: "Handoff is blocked.",
          severity: "blocking",
          source: "handoff",
          operation_id: "op_blocked_01",
        },
      ],
      review_reason_codes: ["artifact_visuals_stale"],
      review_reasons_detail: [
        {
          code: "artifact_visuals_stale",
          label: "Visual placements are stale.",
          severity: "review",
          source: "artifact",
          operationId: "op_review_01",
        },
      ],
      reasons: ["Handoff is blocked.", "Visual placements are stale."],
    },
  });
  const store: MemoryStore = {
    [HAMMER_QUENCH_RELEASE_PACKET_MANIFEST_PATH]: manifest,
    [manifest.captions.srt_path]: "1\n00:00:00,000 --> 00:00:01,000\nhello\n",
  };
  const result = await ingestHammerReleasePacket({
    reader: createReader(store),
  });
  assert.equal(result.state, "blocked");
  assert.equal(result.verdict?.status, "blocked");
  assert.deepEqual(result.verdict?.reason_codes, ["handoff_blocked", "artifact_visuals_stale"]);
  assert.deepEqual(result.verdict?.blocking_reason_codes, ["handoff_blocked"]);
  assert.deepEqual(result.verdict?.review_reason_codes, ["artifact_visuals_stale"]);
  assert.equal(result.verdict?.reasons_detail[0]?.operationId, "op_blocked_01");
  assert.equal(result.verdict?.reasons_detail[0]?.operation_id, "op_blocked_01");
  assert.equal(result.verdict?.reasons_detail[1]?.operationId, "op_review_01");
  assert.equal(result.verdict?.reasons_detail[1]?.operation_id, "op_review_01");
  assert.equal(result.verdict?.reason_codes.includes("quench_transcript_missing"), false);
  assert.equal(result.verdict?.reason_codes.includes("quench_visuals_missing"), false);
  assert.equal(result.issues.some((issue) => issue.code === "quench_transcript_missing"), true);
  assert.equal(result.issues.some((issue) => issue.code === "quench_visuals_missing"), true);
}

async function run() {
  await testReadyPacket();
  await testAttentionWhenAudioUnresolved();
  await testAttentionWhenCaptionsMissingButPacketValid();
  await testVisualsMissingIsWarningNotInvalid();
  await testInvalidManifestShape();
  await testInvalidWhenManifestNotFound();
  await testAttentionWhenTranscriptMissing();
  await testManifestAcceptsEditorialTruthExtension();
  await testManifestNeedsReviewSurvivesIngestWithoutReinterpretation();
  await testManifestBlockedTruthOutranksLocalReviewOnlyIssue();
  await testManifestReadyForQuenchFlagIsNotRecomputed();
  await testManifestReasonDetailsArePreservedWithoutQuenchBackfill();
  // eslint-disable-next-line no-console
  console.log("Quench hammer release packet ingest tests passed.");
}

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Quench hammer release packet ingest tests failed:", error);
  process.exit(1);
});
