import assert from "node:assert/strict";
import {
  buildHammerHistorySnapshot,
  createHammerSnapshotRef,
  resolveActiveSnapshotHeadEntryId,
  shouldCreateHammerSnapshot,
  upsertHammerSnapshotManifest,
} from "../src/editor/hammerSnapshotProduction";

const editorState = {
  transcriptSegments: [
    {
      segment_id: "seg-1",
      speaker: "S1",
      text: "Hello",
      start_sec: 0,
      end_sec: 1,
    },
  ],
  visualPlacements: null,
  outputSelection: {
    layerId: null,
    sourceRecipeRef: null,
  },
  selectedSegmentId: "seg-1",
  playheadSec: 0,
  transcriptTimingHint: null,
};

function testSnapshotTriggerRule() {
  assert.equal(
    shouldCreateHammerSnapshot({
      undoDepth: 40,
      headEntryId: "entry-40",
      lastSnapshottedHeadEntryId: "entry-39",
    }),
    true,
  );
  assert.equal(
    shouldCreateHammerSnapshot({
      undoDepth: 39,
      headEntryId: "entry-39",
      lastSnapshottedHeadEntryId: null,
    }),
    false,
  );
  assert.equal(
    shouldCreateHammerSnapshot({
      undoDepth: 80,
      headEntryId: "entry-80",
      lastSnapshottedHeadEntryId: "entry-80",
    }),
    false,
  );
}

function testSnapshotPayloadShape() {
  const snapshot = buildHammerHistorySnapshot({
    workpieceId: "workpiece-1",
    sessionId: "session-1",
    baseRevisionId: "base-1",
    headEntryId: "entry-40",
    undoDepth: 40,
    redoDepth: 0,
    editorState,
    createdAt: "2026-03-24T15:00:00.000Z",
  });

  assert.equal(snapshot.version, 1);
  assert.equal(snapshot.workpieceId, "workpiece-1");
  assert.equal(snapshot.headEntryId, "entry-40");
  assert.equal(snapshot.undoDepth, 40);
  assert.equal(snapshot.snapshotRef.startsWith("snap-20260324t150000Z-"), true);
}

function testManifestUpsertAndLatestSelection() {
  const olderSnapshot = buildHammerHistorySnapshot({
    workpieceId: "workpiece-1",
    sessionId: "session-1",
    baseRevisionId: "base-1",
    headEntryId: "entry-40",
    undoDepth: 40,
    redoDepth: 0,
    editorState,
    createdAt: "2026-03-24T15:00:00.000Z",
  });
  const newerSnapshot = buildHammerHistorySnapshot({
    workpieceId: "workpiece-1",
    sessionId: "session-1",
    baseRevisionId: "base-1",
    headEntryId: "entry-80",
    undoDepth: 80,
    redoDepth: 0,
    editorState,
    createdAt: "2026-03-24T15:01:00.000Z",
  });

  const withOlder = upsertHammerSnapshotManifest({
    manifest: null,
    workpieceId: "workpiece-1",
    snapshot: olderSnapshot,
  });
  assert.equal(withOlder.activeSnapshotRef, olderSnapshot.snapshotRef);
  assert.equal(withOlder.snapshots.length, 1);
  assert.equal(resolveActiveSnapshotHeadEntryId(withOlder), "entry-40");

  const withNewer = upsertHammerSnapshotManifest({
    manifest: withOlder,
    workpieceId: "workpiece-1",
    snapshot: newerSnapshot,
  });
  assert.equal(withNewer.activeSnapshotRef, newerSnapshot.snapshotRef);
  assert.equal(withNewer.snapshots[0]?.snapshotRef, newerSnapshot.snapshotRef);
  assert.equal(withNewer.snapshots[1]?.snapshotRef, olderSnapshot.snapshotRef);
  assert.equal(resolveActiveSnapshotHeadEntryId(withNewer), "entry-80");
}

function testRepeatedSnapshotWriteReplacesExistingRef() {
  const snapshotRef = createHammerSnapshotRef({
    createdAt: "2026-03-24T15:02:00.000Z",
    headEntryId: "entry-120",
  });

  const first = {
    version: 1 as const,
    snapshotRef,
    createdAt: "2026-03-24T15:02:00.000Z",
    workpieceId: "workpiece-1",
    sessionId: "session-1",
    baseRevisionId: "base-1",
    headEntryId: "entry-120",
    undoDepth: 120,
    redoDepth: 0,
    editorState,
  };
  const second = {
    ...first,
    createdAt: "2026-03-24T15:02:10.000Z",
  };

  const withFirst = upsertHammerSnapshotManifest({
    manifest: null,
    workpieceId: "workpiece-1",
    snapshot: first,
  });
  const withSecond = upsertHammerSnapshotManifest({
    manifest: withFirst,
    workpieceId: "workpiece-1",
    snapshot: second,
  });

  assert.equal(withSecond.snapshots.length, 1);
  assert.equal(withSecond.snapshots[0]?.snapshotRef, snapshotRef);
  assert.equal(withSecond.snapshots[0]?.createdAt, "2026-03-24T15:02:10.000Z");
}

function run() {
  testSnapshotTriggerRule();
  testSnapshotPayloadShape();
  testManifestUpsertAndLatestSelection();
  testRepeatedSnapshotWriteReplacesExistingRef();
  // eslint-disable-next-line no-console
  console.log("Hammer snapshot production tests passed.");
}

run();
