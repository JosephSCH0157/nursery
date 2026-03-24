import assert from "node:assert/strict";
import {
  buildHammerSnapshotPayloadPath,
  HAMMER_SNAPSHOT_MANIFEST_PATH,
  loadHammerSnapshotManifest,
  loadHammerSnapshotPayload,
  saveHammerSnapshotManifest,
  saveHammerSnapshotPayload,
  type HammerHistorySnapshotV1,
  type HammerSnapshotManifestV1,
} from "../src/lib/hammerSnapshotArtifactApi";
import { createDefaultHammerStudioRackState } from "../src/editor/hammerStudioRack";

type FetchCall = {
  url: string;
  options: Record<string, unknown>;
};

function createOkJsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      "content-type": "application/json",
    },
  });
}

function buildManifest(): HammerSnapshotManifestV1 {
  return {
    version: 1,
    workpieceId: "workpiece-123",
    activeSnapshotRef: "snap-001",
    snapshots: [
      {
        snapshotRef: "snap-001",
        path: "hammer/snapshots/snap-001.v1.json",
        createdAt: "2026-03-24T12:00:00.000Z",
        headEntryId: "entry-100",
        baseRevisionId: "base-abc",
      },
    ],
    retention: {
      maxSnapshots: 20,
    },
    updatedAt: "2026-03-24T12:00:05.000Z",
  };
}

function buildSnapshot(): HammerHistorySnapshotV1 {
  return {
    version: 1,
    snapshotRef: "snap-001",
    createdAt: "2026-03-24T12:00:00.000Z",
    workpieceId: "workpiece-123",
    sessionId: "session-123",
    baseRevisionId: "base-abc",
    headEntryId: "entry-100",
    undoDepth: 7,
    redoDepth: 0,
    editorState: {
      transcriptSegments: [
        {
          segment_id: "seg-1",
          speaker: "S1",
          text: "Hello world",
          start_sec: 0,
          end_sec: 1.2,
        },
      ],
      visualPlacements: null,
      studioRack: createDefaultHammerStudioRackState(),
      outputSelection: {
        layerId: null,
        sourceRecipeRef: null,
      },
      selectedSegmentId: "seg-1",
      playheadSec: 0,
      transcriptTimingHint: null,
    },
  };
}

async function testSnapshotPathConvention() {
  assert.equal(
    buildHammerSnapshotPayloadPath({ snapshotRef: "snap-001" }),
    "hammer/snapshots/snap-001.v1.json",
  );
  assert.throws(
    () => buildHammerSnapshotPayloadPath({ snapshotRef: "bad/ref" }),
    /snapshot ref is invalid/i,
  );
}

async function testSaveAndLoadSnapshotManifest() {
  const calls: FetchCall[] = [];
  const manifest = buildManifest();
  const fakeFetch = async (url: string, options: Record<string, unknown>) => {
    calls.push({ url, options });
    if (url.includes("/commit-file")) {
      return createOkJsonResponse({ ok: true });
    }
    return createOkJsonResponse({
      exists: true,
      data: manifest,
    });
  };

  const saveResult = await saveHammerSnapshotManifest({
    workpieceId: "workpiece-123",
    manifest,
    fetcher: fakeFetch as never,
  });
  assert.equal(saveResult.ok, true);
  assert.equal(calls[0]?.url, "/tongs/workpieces/workpiece-123/commit-file");
  const payload = calls[0]?.options.json as Record<string, unknown>;
  assert.equal(payload.path, HAMMER_SNAPSHOT_MANIFEST_PATH);
  assert.equal(payload.content_type, "application/json");

  const loadResult = await loadHammerSnapshotManifest("workpiece-123", fakeFetch as never);
  assert.equal(loadResult.ok, true);
  assert.equal(loadResult.ok && loadResult.exists, true);
  assert.deepEqual(loadResult.ok ? loadResult.data : null, manifest);
}

async function testManifestNotFoundIsNonError() {
  const fakeFetch = async () => createOkJsonResponse({ exists: false });
  const result = await loadHammerSnapshotManifest("workpiece-123", fakeFetch as never);
  assert.equal(result.ok, true);
  assert.equal(result.ok && result.exists, false);
  assert.equal(result.ok ? result.data : "x", null);
}

async function testSaveAndLoadSnapshotPayload() {
  const calls: FetchCall[] = [];
  const snapshot = buildSnapshot();
  const fakeFetch = async (url: string, options: Record<string, unknown>) => {
    calls.push({ url, options });
    if (url.includes("/commit-file")) {
      return createOkJsonResponse({ ok: true });
    }
    return createOkJsonResponse({
      exists: true,
      data: snapshot,
    });
  };

  const saveResult = await saveHammerSnapshotPayload({
    workpieceId: "workpiece-123",
    snapshot,
    fetcher: fakeFetch as never,
  });
  assert.equal(saveResult.ok, true);
  assert.equal(calls[0]?.url, "/tongs/workpieces/workpiece-123/commit-file");
  const payload = calls[0]?.options.json as Record<string, unknown>;
  assert.equal(payload.path, "hammer/snapshots/snap-001.v1.json");
  assert.equal(payload.content_type, "application/json");

  const loadResult = await loadHammerSnapshotPayload({
    workpieceId: "workpiece-123",
    snapshotRef: "snap-001",
    fetcher: fakeFetch as never,
  });
  assert.equal(loadResult.ok, true);
  assert.equal(loadResult.ok && loadResult.exists, true);
  assert.deepEqual(loadResult.ok ? loadResult.data : null, snapshot);
}

async function testPayloadLoadUsesComputedPath() {
  const calls: FetchCall[] = [];
  const fakeFetch = async (url: string, options: Record<string, unknown>) => {
    calls.push({ url, options });
    return createOkJsonResponse({ exists: false });
  };

  const result = await loadHammerSnapshotPayload({
    workpieceId: "workpiece-123",
    snapshotRef: "snap-xyz",
    fetcher: fakeFetch as never,
  });
  assert.equal(result.ok, true);
  assert.equal(
    calls[0]?.url,
    "/tongs/workpieces/workpiece-123/read-file?path=hammer%2Fsnapshots%2Fsnap-xyz.v1.json",
  );
}

async function run() {
  await testSnapshotPathConvention();
  await testSaveAndLoadSnapshotManifest();
  await testManifestNotFoundIsNonError();
  await testSaveAndLoadSnapshotPayload();
  await testPayloadLoadUsesComputedPath();
  // eslint-disable-next-line no-console
  console.log("Hammer snapshot artifact API tests passed.");
}

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Hammer snapshot artifact API tests failed:", error);
  process.exit(1);
});
