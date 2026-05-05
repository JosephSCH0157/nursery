import assert from "node:assert/strict";
import { findRecoveredAnvilSnapshotByWorkpieceId } from "../src/transcript/hammerAnvilSnapshotRecovery";

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

try {
  testFindsSnapshotByWorkpieceId();
  testPrefersHighestSegmentCount();
  testIgnoresMalformedEntries();
  console.log("Hammer Anvil snapshot recovery tests passed.");
} catch (error) {
  console.error("Hammer Anvil snapshot recovery tests failed:", error);
  process.exitCode = 1;
}
