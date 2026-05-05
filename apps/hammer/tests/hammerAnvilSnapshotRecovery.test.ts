import assert from "node:assert/strict";
import {
  findRecoveredAnvilSnapshotByWorkpieceId,
  convertAnvilSnapshotToHammerTranscript,
  type HammerRecoveredAnvilSnapshot,
} from "../src/transcript/hammerAnvilSnapshotRecovery";

type MemoryStorage = Storage & {
  _keys: string[];
  _map: Map<string, string>;
};

function createMemoryStorage(seed: Record<string, string>): MemoryStorage {
  const map = new Map<string, string>(Object.entries(seed));
  const keys = Array.from(map.keys());
  return {
    _keys: keys,
    _map: map,
    get length() {
      return this._keys.length;
    },
    clear() {
      this._keys = [];
      this._map.clear();
    },
    getItem(key: string): string | null {
      return this._map.get(key) ?? null;
    },
    key(index: number): string | null {
      return this._keys[index] ?? null;
    },
    removeItem(key: string) {
      if (this._map.delete(key)) {
        this._keys = this._keys.filter((candidate) => candidate !== key);
      }
    },
    setItem(key: string, value: string) {
      if (!this._map.has(key)) {
        this._keys.push(key);
      }
      this._map.set(key, value);
    },
  };
}

function testFindsSnapshotByWorkpieceId() {
  const storage = createMemoryStorage({
    "forge_anvil_live_transcript_v1:abc": JSON.stringify({
      capture_session_id: "abc",
      workpiece_id: "workpiece-1",
      status: "ready",
      live_path: "anvil/transcript/live/abc.snapshot.v1.json",
      final_path: "anvil/transcript/final/abc.structured.v1.json",
      segment_count: 11,
    }),
  });
  const found = findRecoveredAnvilSnapshotByWorkpieceId("workpiece-1", storage);
  assert.ok(found);
  assert.equal(found?.capture_session_id, "abc");
  assert.equal(found?.segment_count, 11);
}

function testPrefersHighestSegmentCount() {
  const storage = createMemoryStorage({
    "forge_anvil_live_transcript_v1:small": JSON.stringify({
      capture_session_id: "small",
      workpiece_id: "workpiece-2",
      segment_count: 3,
    }),
    "forge_anvil_live_transcript_v1:large": JSON.stringify({
      capture_session_id: "large",
      workpiece_id: "workpiece-2",
      segment_count: 17,
    }),
  });
  const found = findRecoveredAnvilSnapshotByWorkpieceId("workpiece-2", storage);
  assert.ok(found);
  assert.equal(found?.capture_session_id, "large");
  assert.equal(found?.segment_count, 17);
}

function testIgnoresMalformedEntries() {
  const storage = createMemoryStorage({
    "forge_anvil_live_transcript_v1:bad": "{not-json",
    "forge_anvil_live_transcript_v1:ok": JSON.stringify({
      capture_session_id: "ok",
      workpiece_id: "workpiece-3",
      segment_count: 4,
    }),
  });
  const found = findRecoveredAnvilSnapshotByWorkpieceId("workpiece-3", storage);
  assert.ok(found);
  assert.equal(found?.capture_session_id, "ok");
}

function testIncludesSegmentsFromSnapshot() {
  const storage = createMemoryStorage({
    "forge_anvil_live_transcript_v1:seg-test": JSON.stringify({
      capture_session_id: "seg-test",
      workpiece_id: "workpiece-4",
      status: "ready",
      segment_count: 2,
      segments: [
        { segment_id: "seg-1", start_sec: 0, end_sec: 1.5, speaker: "unknown", text: "Hello world" },
        { segment_id: "seg-2", start_sec: 1.5, end_sec: 3.0, speaker: "unknown", text: "How are you" },
      ],
    }),
  });
  const found = findRecoveredAnvilSnapshotByWorkpieceId("workpiece-4", storage);
  assert.ok(found);
  assert.equal(found.segments.length, 2);
  assert.equal(found.segments[0].text, "Hello world");
  assert.equal(found.segments[1].text, "How are you");
  // segment_count should reflect actual segments length
  assert.equal(found.segment_count, 2);
}

function testIgnoresSegmentsWithEmptyText() {
  const storage = createMemoryStorage({
    "forge_anvil_live_transcript_v1:empty-text": JSON.stringify({
      capture_session_id: "empty-text",
      workpiece_id: "workpiece-5",
      status: "ready",
      segment_count: 3,
      segments: [
        { segment_id: "seg-1", start_sec: 0, end_sec: 1.0, speaker: "unknown", text: "Good text" },
        { segment_id: "seg-2", start_sec: 1.0, end_sec: 2.0, speaker: "unknown", text: "   " },
        { segment_id: "seg-3", start_sec: 2.0, end_sec: 3.0, speaker: "unknown", text: "" },
      ],
    }),
  });
  const found = findRecoveredAnvilSnapshotByWorkpieceId("workpiece-5", storage);
  assert.ok(found);
  assert.equal(found.segments.length, 1);
  assert.equal(found.segments[0].text, "Good text");
}

function testConvertAnvilSnapshotToHammerTranscript() {
  const snapshot: HammerRecoveredAnvilSnapshot = {
    key: "forge_anvil_live_transcript_v1:conv-test",
    capture_session_id: "conv-test-session",
    workpiece_id: "workpiece-6",
    status: "ready",
    final_path: "anvil/transcript/final/conv-test-session.structured.v1.json",
    live_path: "anvil/transcript/live/conv-test-session.snapshot.v1.json",
    segment_count: 2,
    segments: [
      { segment_id: "seg-1", start_sec: 0, end_sec: 2.0, speaker: "unknown", text: "First segment" },
      { segment_id: "seg-2", start_sec: 2.0, end_sec: 4.5, speaker: "unknown", text: "Second segment" },
    ],
  };

  const transcript = convertAnvilSnapshotToHammerTranscript(snapshot);
  assert.equal(transcript.schema_version, 1);
  assert.equal(transcript.transcript_id, "conv-test-session");
  assert.equal(transcript.structure, "speaker_turns");
  assert.equal(transcript.segments.length, 2);
  assert.equal(transcript.segments[0].text, "First segment");
  assert.equal(transcript.segments[1].text, "Second segment");
  assert.equal(transcript.diarization.label_scheme, "forge-neutral-speakers.v1");
  assert.equal(transcript.diarization.version, "anvil-live-transcript.v1");
  assert.equal(transcript.confidence_flags.length, 0);
}

function testSnapshotWorkpieceIdIsPresent() {
  // Verifies that the snapshot stored in localStorage includes workpiece_id,
  // which is required for Hammer's local recovery scan to work correctly.
  const storage = createMemoryStorage({
    "forge_anvil_live_transcript_v1:wp-id-check": JSON.stringify({
      schema_version: 1,
      capture_session_id: "wp-id-check",
      workpiece_id: "workpiece-7",
      started_at: "2026-05-05T10:00:00.000Z",
      updated_at: "2026-05-05T10:05:00.000Z",
      status: "ready",
      segment_count: 1,
      segments: [
        { segment_id: "seg-1", start_sec: 0, end_sec: 1.0, speaker: "unknown", text: "Test content" },
      ],
    }),
  });
  const found = findRecoveredAnvilSnapshotByWorkpieceId("workpiece-7", storage);
  assert.ok(found, "Should find snapshot by workpiece_id");
  assert.equal(found.workpiece_id, "workpiece-7");
  assert.equal(found.capture_session_id, "wp-id-check");
}

try {
  testFindsSnapshotByWorkpieceId();
  testPrefersHighestSegmentCount();
  testIgnoresMalformedEntries();
  testIncludesSegmentsFromSnapshot();
  testIgnoresSegmentsWithEmptyText();
  testConvertAnvilSnapshotToHammerTranscript();
  testSnapshotWorkpieceIdIsPresent();
  console.log("Hammer Anvil snapshot recovery tests passed.");
} catch (error) {
  console.error("Hammer Anvil snapshot recovery tests failed:", error);
  process.exitCode = 1;
}
