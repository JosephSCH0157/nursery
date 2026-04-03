import assert from "node:assert/strict";
import {
  HAMMER_QUENCH_RELEASE_PACKET_MANIFEST_PATH,
  ingestHammerReleasePacket,
  type HammerQuenchReleasePacketManifest,
} from "../../quench/src/index.ts";

type MemoryStore = Record<string, unknown>;

function createReader(store: MemoryStore) {
  return {
    async readJson(path: string): Promise<unknown | null> {
      return store[path] ?? null;
    },
    async readText(path: string): Promise<string | null> {
      const value = store[path];
      return typeof value === "string" ? value : null;
    },
  };
}

function buildManifest(
  overrides?: Partial<HammerQuenchReleasePacketManifest>,
): HammerQuenchReleasePacketManifest {
  return {
    version: 1,
    packet_kind: "quench_release_packet",
    generated_by: "Hammer",
    generated_at: "2026-04-02T12:00:00.000Z",
    workpiece_id: "wp_contract",
    workspace_id: "ws_contract",
    episode_title: "Contract test",
    duration_seconds: 1200,
    audio: {
      kind: "raw",
      media_id: "media_contract",
      local_relpath: "recordings/contract.wav",
      workpiece_path: "recordings/contract.wav",
      mime_type: "audio/wav",
      source_label: "raw source",
    },
    captions: {
      srt_path: "hammer/release-packet/captions/episode.srt",
      vtt_path: null,
    },
    transcript: {
      text_path: "hammer/release-packet/transcript/transcript.txt",
      source_layer_id: "layer_contract",
      source_recipe_ref: "recipe_contract",
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
      handoff_status: "ready",
      reason_codes: [],
      reasons_detail: [],
      blocking_reason_codes: [],
      blocking_reasons_detail: [],
      review_reason_codes: [],
      review_reasons_detail: [],
      artifact_reason_codes: [],
      artifact_reasons_detail: [],
      artifact_reasons: [],
      review_reasons: [],
      reasons: [],
    },
    ...overrides,
  };
}

async function testReadyParity() {
  const manifest = buildManifest();
  const store: MemoryStore = {
    [HAMMER_QUENCH_RELEASE_PACKET_MANIFEST_PATH]: manifest,
    [manifest.transcript.text_path!]: "Resolved transcript text.",
    [manifest.captions.srt_path!]: "1\n00:00:00,000 --> 00:00:01,000\nhello\n",
    [manifest.visuals.placements_path]: [],
  };

  const result = await ingestHammerReleasePacket({
    reader: createReader(store),
  });

  assert.equal(result.state, "ready");
  assert.equal(result.verdict?.reason_codes.includes("quench_visuals_missing"), false);
  assert.equal(result.verdict?.reason_codes.includes("handoff_blocked"), false);
}

async function testNeedsReviewParity() {
  const manifest = buildManifest({
    readiness: {
      status: "needs_review",
      ready_for_quench: false,
      overall_status: "stale",
      handoff_status: "needs_review",
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
      artifact_reason_codes: ["artifact_visuals_stale"],
      artifact_reasons_detail: [{
        code: "artifact_visuals_stale",
        label: "Visual placements are stale.",
        severity: "review",
        source: "artifact",
        operationId: null,
        operation_id: null,
      }],
      artifact_reasons: ["Visual placements are stale."],
      review_reasons: ["Visual placements are stale."],
      reasons: ["Visual placements are stale."],
    },
  });
  const store: MemoryStore = {
    [HAMMER_QUENCH_RELEASE_PACKET_MANIFEST_PATH]: manifest,
    [manifest.transcript.text_path!]: "Resolved transcript text.",
    [manifest.captions.srt_path!]: "1\n00:00:00,000 --> 00:00:01,000\nhello\n",
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
  assert.equal(result.verdict?.reason_codes.includes("artifact_visuals_stale"), true);
  assert.equal(result.verdict?.reason_codes.some((code) => code.startsWith("quench_")), false);
}

async function testBlockedParity() {
  const manifest = buildManifest({
    readiness: {
      status: "blocked",
      ready_for_quench: false,
      overall_status: "failed",
      handoff_status: "blocked",
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
      artifact_reason_codes: [],
      artifact_reasons_detail: [],
      artifact_reasons: [],
      review_reasons: [],
      reasons: ["Handoff is blocked."],
    },
  });
  const store: MemoryStore = {
    [HAMMER_QUENCH_RELEASE_PACKET_MANIFEST_PATH]: manifest,
    [manifest.transcript.text_path!]: "Resolved transcript text.",
    [manifest.captions.srt_path!]: "1\n00:00:00,000 --> 00:00:01,000\nhello\n",
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

  assert.equal(result.state, "blocked");
  assert.equal(result.verdict?.reason_codes.includes("handoff_blocked"), true);
}

async function testQuenchAddsExplicitDownstreamReason() {
  const manifest = buildManifest();
  const store: MemoryStore = {
    [HAMMER_QUENCH_RELEASE_PACKET_MANIFEST_PATH]: manifest,
    [manifest.captions.srt_path!]: "1\n00:00:00,000 --> 00:00:01,000\nhello\n",
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

  assert.equal(result.state, "blocked");
  assert.equal(result.verdict?.reason_codes.includes("quench_transcript_missing"), true);
}

await testReadyParity();
await testNeedsReviewParity();
await testBlockedParity();
await testQuenchAddsExplicitDownstreamReason();

console.log("Hammer/Quench readiness contract tests passed.");
