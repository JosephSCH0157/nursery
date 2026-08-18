import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createHammerWorkspaceShellSnapshotAuthority } from "../src/editor/hammerWorkspaceShellSnapshotEmitter";
import type { HammerHistoryPostSaveSnapshotRequest } from "../src/editor/hammerWorkspaceShellHistoryController";
import { createDefaultHammerStudioRackState } from "../src/editor/hammerStudioRack";
import type { HammerHistorySnapshotV1, HammerSnapshotManifestV1 } from "../src/lib/hammerSnapshotArtifactApi";

function request(headEntryId: string, undoDepth: number, text: string): HammerHistoryPostSaveSnapshotRequest {
  return Object.freeze({
    workpieceId: "w1",
    sessionId: "session1",
    baseRevisionId: "base1",
    headEntryId,
    undoDepth,
    redoDepth: 0,
    editorState: {
      transcriptSegments: [{ segment_id: "s1", speaker: "S1", text, start_sec: 0, end_sec: 1 }],
      visualPlacements: null,
      visualTimeline: null,
      audioEdit: null,
      studioRack: createDefaultHammerStudioRackState(),
      editorialAuthorityGraph: null,
      outputSelection: { layerId: null, sourceRecipeRef: null },
      selectedSegmentId: "s1",
      playheadSec: 0,
      transcriptTimingHint: null,
    },
  });
}

function successfulManifest(manifest: HammerSnapshotManifestV1) {
  return { ok: true as const, status: 200, exists: true, data: manifest };
}

test("snapshot authority preserves immutable request and payload then manifest ordering", async () => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  const order: string[] = [];
  const payloads: HammerHistorySnapshotV1[] = [];
  const authority = createHammerWorkspaceShellSnapshotAuthority({
    savePayload: async ({ snapshot }) => {
      payloads.push(structuredClone(snapshot));
      await pending;
      order.push("payload");
      return { ok: true, status: 200, exists: true, data: snapshot };
    },
    saveManifest: async ({ manifest }) => {
      order.push("manifest");
      return successfulManifest(manifest);
    },
  });
  const captured = request("head-40", 40, "captured");
  const operation = authority.produce(captured);
  const liveText = { value: "later" };
  liveText.value = "newest";
  release();
  await operation;
  assert.deepEqual(order, ["payload", "manifest"]);
  assert.equal(payloads[0]!.editorState.transcriptSegments[0]!.text, "captured");
});

test("eligibility deduplicates an in-flight head and allows the next interval head", async () => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  const attemptedHeads: Array<string | null> = [];
  const authority = createHammerWorkspaceShellSnapshotAuthority({
    savePayload: async ({ snapshot }) => {
      attemptedHeads.push(snapshot.headEntryId);
      if (snapshot.headEntryId === "head-40") await pending;
      return { ok: true, status: 200, exists: true, data: snapshot };
    },
    saveManifest: async ({ manifest }) => successfulManifest(manifest),
  });
  const first = authority.produce(request("head-40", 40, "first"));
  await authority.produce(request("head-40", 40, "duplicate"));
  release();
  await first;
  await authority.produce(request("head-40", 40, "persisted duplicate"));
  await authority.produce(request("head-80", 80, "next"));
  assert.deepEqual(attemptedHeads, ["head-40", "head-80"]);
});

test("newer overlapping completion remains manifest authority", async () => {
  let releaseOld!: () => void;
  const oldPending = new Promise<void>((resolve) => { releaseOld = resolve; });
  const manifestHeads: Array<string | null> = [];
  const authority = createHammerWorkspaceShellSnapshotAuthority({
    savePayload: async ({ snapshot }) => {
      if (snapshot.headEntryId === "head-40") await oldPending;
      return { ok: true, status: 200, exists: true, data: snapshot };
    },
    saveManifest: async ({ manifest }) => {
      const active = manifest.snapshots.find((entry) => entry.snapshotRef === manifest.activeSnapshotRef);
      manifestHeads.push(active?.headEntryId ?? null);
      return successfulManifest(manifest);
    },
  });
  const old = authority.produce(request("head-40", 40, "old"));
  await authority.produce(request("head-80", 80, "new"));
  releaseOld();
  await old;
  assert.deepEqual(manifestHeads, ["head-80"]);
});

test("reset suppresses stale completion and failures preserve non-fatal behavior", async () => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  let manifests = 0;
  const warnings: string[] = [];
  const authority = createHammerWorkspaceShellSnapshotAuthority({
    savePayload: async ({ snapshot }) => {
      await pending;
      return { ok: true, status: 200, exists: true, data: snapshot };
    },
    saveManifest: async ({ manifest }) => {
      manifests += 1;
      return successfulManifest(manifest);
    },
    warn: (message) => { warnings.push(String(message)); },
  });
  const stale = authority.produce(request("head-40", 40, "old workpiece"));
  authority.reset();
  release();
  await stale;
  assert.equal(manifests, 0);

  const payloadFailure = createHammerWorkspaceShellSnapshotAuthority({
    savePayload: async () => ({ ok: false, status: 503, error: "payload failed" }),
    warn: (message) => { warnings.push(String(message)); },
  });
  await assert.doesNotReject(payloadFailure.produce(request("head-40", 40, "failure")));
  assert.ok(warnings.includes("Hammer snapshot payload write skipped"));

  const manifestFailure = createHammerWorkspaceShellSnapshotAuthority({
    savePayload: async ({ snapshot }) => ({ ok: true, status: 200, exists: true, data: snapshot }),
    saveManifest: async () => ({ ok: false, status: 503, error: "manifest failed" }),
    warn: (message) => { warnings.push(String(message)); },
  });
  await assert.doesNotReject(manifestFailure.produce(request("head-40", 40, "failure")));
  assert.ok(warnings.includes("Hammer snapshot manifest write skipped"));
});

test("snapshot authority ref ownership remains inside the emitter contract", () => {
  const shellSource = readFileSync(new URL("../src/editor/HammerWorkspaceShell.tsx", import.meta.url), "utf8");
  const emitterSource = readFileSync(new URL("../src/editor/hammerWorkspaceShellSnapshotEmitter.ts", import.meta.url), "utf8");
  assert.equal(shellSource.includes("snapshotAuthorityRef"), false);
  assert.equal(shellSource.includes("createHammerWorkspaceShellSnapshotAuthority()"), false);
  assert.equal(shellSource.includes("useHammerWorkspaceShellSnapshotAuthority()"), true);
  assert.equal(emitterSource.includes("const authorityRef = useRef<HammerWorkspaceShellSnapshotAuthority | null>(null)"), true);
});
