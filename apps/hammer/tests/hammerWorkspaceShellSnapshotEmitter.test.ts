import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildHammerPersistedTranscriptProjection,
  createHammerWorkspaceShellSnapshotAuthority,
} from "../src/editor/hammerWorkspaceShellSnapshotEmitter";
import type { HammerHistoryPostSaveSnapshotRequest } from "../src/editor/hammerWorkspaceShellHistoryController";
import { createDefaultHammerStudioRackState } from "../src/editor/hammerStudioRack";
import type { HammerHistorySnapshotV1, HammerSnapshotManifestV1 } from "../src/lib/hammerSnapshotArtifactApi";
import type { HammerPersistedStructuredTranscript } from "../src/persistence/hammerPersistenceContract";

test("persisted transcript projection preserves canonical metadata and isolates inputs", () => {
  const existing: HammerPersistedStructuredTranscript = {
    schema_version: 1,
    transcript_id: "tx1",
    media_id: "media1",
    media_signature: "signature1",
    prepared_at: "2026-08-18T10:00:00.000Z",
    structure: "speaker_turns",
    source_media_ref: null,
    diarization: {
      label_scheme: "forge-neutral-speakers.v1",
      labels: ["Old"],
      raw_labels: ["SPEAKER_00", "SPEAKER_01"],
      version: "1",
      provider: "openai",
      provider_request_id: "request1",
      model: "whisper-1",
    },
    confidence_flags: [{ turn_id: "s2", code: "speaker_boundary_low_confidence", detail: "review" }],
    segments: [{ segment_id: "old", speaker: "Old", text: "old", start_sec: 0, end_sec: 1 }],
    derived_text_layers: { schema_version: 1, active_layer_id: null, output_layer_id: null, layers: [] },
    subtitle_outputs: {
      schema_version: 1,
      last_generated_format: null,
      srt: null,
      vtt: null,
    },
  };
  const segments = [
    { segment_id: "s1", speaker: "Host", text: "First", start_sec: 0, end_sec: 1 },
    { segment_id: "s2", speaker: "Guest", text: "Second", start_sec: 1, end_sec: 2 },
  ];
  const derivedTextLayers: NonNullable<HammerPersistedStructuredTranscript["derived_text_layers"]> = {
    schema_version: 1,
    active_layer_id: "clean",
    output_layer_id: "clean",
    layers: [{
      layer_id: "clean",
      recipe_ref: "macro:podcast_cleanup.v1",
      macro_kind: "filler_cleanup",
      status: "active",
      created_at: "2026-08-18T11:00:00.000Z",
      based_on_transcript_id: "tx1",
      summary: { changed_segment_count: 1, removal_count: 1, untouched_segment_count: 1 },
      changes: [],
    }],
  };
  const existingBefore = structuredClone(existing);
  const segmentsBefore = structuredClone(segments);
  const layersBefore = structuredClone(derivedTextLayers);
  const projected = buildHammerPersistedTranscriptProjection({
    segments,
    existingTranscript: existing,
    mediaRef: null,
    transcriptId: "tx1",
    derivedTextLayers,
  });
  assert.deepEqual(projected, {
    ...existing,
    diarization: { ...existing.diarization, labels: ["Host", "Guest"], provider: "openai" },
    segments,
    derived_text_layers: derivedTextLayers,
  });
  assert.deepEqual(existing, existingBefore);
  assert.deepEqual(segments, segmentsBefore);
  assert.deepEqual(derivedTextLayers, layersBefore);
  segments[0]!.text = "later";
  existing.diarization.raw_labels[0] = "later";
  derivedTextLayers.layers[0]!.summary.removal_count = 99;
  assert.equal(projected.segments[0]!.text, "First");
  assert.equal(projected.diarization.raw_labels[0], "SPEAKER_00");
  assert.equal(projected.derived_text_layers?.layers[0]?.summary.removal_count, 1);
  assert.deepEqual(projected, buildHammerPersistedTranscriptProjection({
    segments: segmentsBefore,
    existingTranscript: existingBefore,
    mediaRef: null,
    transcriptId: "tx1",
    derivedTextLayers: layersBefore,
  }));
});

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
