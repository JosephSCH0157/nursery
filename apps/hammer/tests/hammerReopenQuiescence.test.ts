import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import type { HammerPersistenceSnapshot } from "../src/persistence/hammerPersistenceContract";
import type { HammerRecordingRevisionRecord } from "../src/persistence/hammerRecordingRevisionPersistence";
import {
  areHammerAuthorityGraphsSemanticallyEqual,
  createHammerSingleFlightCoordinator,
  selectChangedHammerRevisionArtifacts,
  serializeHammerCanonicalArtifact,
  type HammerRevisionAutosaveArtifacts,
} from "../src/persistence/hammerAutosaveQuiescence";
import { persistHammerCanonicalSave, type HammerAsyncResponseLane } from "../src/persistence/hammerVisualAuthority";

const timestamp = "2026-08-15T23:04:36.397Z";
const authority = (updatedAt = timestamp, operations: unknown[] = []) => ({
  schema_version: 1 as const,
  graph_id: "workpiece:plan:authority",
  graph_version: 1,
  workspace_id: "workspace",
  workpiece_id: "workpiece",
  session_id: "session",
  source_transcript_id: "transcript",
  operation_order: operations.map((_, index) => `operation-${index}`),
  operations: operations as any,
  created_at: timestamp,
  updated_at: updatedAt,
});

function snapshot(): HammerPersistenceSnapshot {
  const artifact = (path: string, data: any) => ({ path, updated_at: timestamp, data });
  return {
    schema_version: 1,
    state: null,
    editor_session: artifact("revision/editor", {
      schema_version: 1, session_id: "session", source_mode: "canonical", preview_mode: "edit-aware",
      transcript_source_id: "transcript", selected_segment_id: "turn_017", selected_overlay_row_id: "packaging-intro",
      media_ref: null, workspace_mapping: null, media_source_label: null, visual_preview: { white_balance: 0, color_amount: 0, background_blur: false },
      last_opened_at: timestamp,
    }),
    structured_transcript: artifact("revision/transcript", { schema_version: 1, transcript_id: "transcript", segments: [{ segment_id: "turn_001", text: "Original" }] }),
    transcript_version_registry: artifact("", null), speaker_map: artifact("", null),
    visual_placements: artifact("revision/placements", { schema_version: 1, status: "prepared", source_refs: ["transcript"], uncertainty_flags: [], placements: [{ placement_id: "placement-1", asset_id: "asset-1" }] }),
    visual_timeline: artifact("revision/timeline", { version: 2, source_mode: "packaging", revision: 3, updated_at: timestamp, selected_clip_id: "packaging-intro", assets: [], clips: [], lanes: [], debug_origin: "legacy_migration", debug_migration_hash: "legacy" }),
    audio_polish: artifact("revision/audio", { schema_version: 1, status: "prepared", prepared_passes: [], source_artifact_paths: [], settings_summary: {}, analysis: null, audio_edit: null, source_media_id: null, source_media_signature: null, processor_version: null, prepared_at: null, output_local_relpath: null, output_workpiece_path: null, output_mime_type: null, output_duration_ms: null, failure_code: null, failure_reason: null }),
    edit_plan: artifact("", null), editorial_authority: artifact("revision/authority", authority()),
    macro_hooks: { recipe_ref: null, last_run_ref: null },
  } as HammerPersistenceSnapshot;
}

function allArtifacts(installed: HammerPersistenceSnapshot): HammerRevisionAutosaveArtifacts {
  return {
    editor_session: { data: structuredClone(installed.editor_session.data!) },
    revision_transcript: { data: structuredClone(installed.structured_transcript.data!) },
    audio_polish: { data: structuredClone(installed.audio_polish.data!) },
    visual_timeline: { data: structuredClone(installed.visual_timeline.data!) },
    visual_placements: { data: structuredClone(installed.visual_placements.data!) },
  };
}

const revision: HammerRecordingRevisionRecord = {
  id: "revision", workspace_id: "workspace", workpiece_id: "workpiece", canonical_recording_id: "recording",
  status: "active", label: null, editor_session_path: "revision/editor", revision_transcript_path: "revision/transcript",
  audio_polish_path: "revision/audio", visual_timeline_path: "revision/timeline", visual_placements_path: "revision/placements",
  history_path: "revision/history", snapshots_manifest_path: null, editorial_authority_path: "revision/authority",
  editorial_authority_fingerprint: "a".repeat(64), editorial_authority_revision: 1, updated_at: timestamp,
};

function saveArgs(installed: HammerPersistenceSnapshot, request: HammerRevisionAutosaveArtifacts, nextAuthority = authority()) {
  const lanes: Record<HammerAsyncResponseLane, number> = { canonical_hydration: 0, revision_mutation: 0, workpiece_reconciliation: 0, lifecycle_flush: 0 };
  const identity = { workspaceId: "workspace", workpieceId: "workpiece", revisionId: "revision", editorGeneration: 1 };
  return {
    target: { workspaceId: "workspace", workpieceId: "workpiece" }, canonicalRecordingId: "recording",
    revisionId: "revision", currentRevision: revision, revisionRequest: request,
    persistenceRequest: { written_by: { tool: "hammer", tool_version: "test", lane: "test" }, editorial_authority: { data: nextAuthority } },
    canonicalSnapshot: installed, identity, currentIdentity: () => identity, laneSequences: lanes,
  };
}

test("canonical mount and four hydration emissions remain byte-clean", async () => {
  const installed = snapshot();
  const hydration = allArtifacts(installed);
  hydration.editor_session!.data.last_opened_at = "2026-08-19T09:02:07.600Z";
  hydration.editor_session!.data.selected_segment_id = "turn_137";
  hydration.editor_session!.data.selected_overlay_row_id = null;
  hydration.visual_timeline!.data.debug_origin = "canonical_load";
  hydration.visual_timeline!.data.selected_clip_id = null;
  for (let index = 0; index < 4; index += 1) {
    assert.deepEqual(selectChangedHammerRevisionArtifacts({ request: hydration, installed }), {});
  }
  let revisionWrites = 0; let workpieceWrites = 0; let authorityWrites = 0;
  const result = await persistHammerCanonicalSave({
    ...saveArgs(installed, hydration, authority("2026-08-19T09:02:08.374Z")),
    adapters: {
      saveRevision: async () => { revisionWrites += 1; return { ok: true, status: 200, data: { revision } }; },
      saveWorkpiece: async () => { workpieceWrites += 1; return { ok: true, status: 200, data: installed }; },
      saveRevisionAuthority: async () => { authorityWrites += 1; return { revision, disposition: "committed", fingerprint: "b".repeat(64) }; },
    },
  });
  assert.equal(result.ok, true);
  assert.deepEqual([revisionWrites, workpieceWrites, authorityWrites], [0, 0, 0]);
  assert.equal(areHammerAuthorityGraphsSemanticallyEqual(authority(), authority("2026-08-19T09:02:08.374Z")), true);
  assert.equal(serializeHammerCanonicalArtifact(installed.editorial_authority.data), serializeHammerCanonicalArtifact(authority()));
});

test("overlapping work is single-flight and deterministically keeps the newest pending request", async () => {
  const started: number[] = [];
  const releases: Array<() => void> = [];
  const coordinator = createHammerSingleFlightCoordinator<number>({ run: async (value) => {
    started.push(value);
    await new Promise<void>((resolve) => releases.push(resolve));
  } });
  coordinator.enqueue(1);
  coordinator.enqueue(2);
  coordinator.enqueue(3);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(started, [1]);
  assert.equal(coordinator.pending(), 3);
  releases.shift()?.();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(started, [1, 3]);
  releases.shift()?.();
  await coordinator.whenIdle();
  assert.equal(coordinator.isRunning(), false);
});

test("transcript-only edits write only the transcript artifact and do not advance authority", async () => {
  const installed = snapshot();
  const request = allArtifacts(installed);
  request.revision_transcript!.data.segments[0]!.text = "Edited";
  let sent: Record<string, unknown> | null = null; let authorityWrites = 0;
  const result = await persistHammerCanonicalSave({
    ...saveArgs(installed, request),
    adapters: {
      saveRevision: async (_target, _revisionId, body) => { sent = body; return { ok: true, status: 200, data: { revision } }; },
      saveWorkpiece: async () => ({ ok: true, status: 200, data: installed }),
      saveRevisionAuthority: async () => { authorityWrites += 1; return { revision, disposition: "committed", fingerprint: "b".repeat(64) }; },
    },
  });
  assert.equal(result.ok, true);
  assert.deepEqual(Object.keys(sent ?? {}), ["revision_transcript"]);
  assert.equal(authorityWrites, 0);
});

test("timeline plus semantic authority change writes each lane exactly once", async () => {
  const installed = snapshot();
  const request = allArtifacts(installed);
  request.visual_timeline!.data.revision = 4;
  const changedAuthority = authority("2026-08-19T10:00:00.000Z", [{ operation_id: "operation-0", operation_type: "transcript_cut" }]);
  let sent: Record<string, unknown> | null = null; let authorityWrites = 0;
  const advanced = { ...revision, editorial_authority_revision: 2, editorial_authority_fingerprint: "b".repeat(64) };
  const result = await persistHammerCanonicalSave({
    ...saveArgs(installed, request, changedAuthority),
    adapters: {
      saveRevision: async (_target, _revisionId, body) => { sent = body; return { ok: true, status: 200, data: { revision } }; },
      saveWorkpiece: async () => ({ ok: true, status: 200, data: installed }),
      saveRevisionAuthority: async () => { authorityWrites += 1; return { revision: advanced, disposition: "committed", fingerprint: "b".repeat(64) }; },
    },
  });
  assert.equal(result.ok, true);
  assert.deepEqual(Object.keys(sent ?? {}), ["visual_timeline"]);
  assert.equal(authorityWrites, 1);
  if (result.ok) assert.equal(result.revision.editorial_authority_revision, 2);
});

test("authority-only semantic change skips revision artifacts and advances authority once", async () => {
  const installed = snapshot();
  const changedAuthority = authority("2026-08-19T10:00:00.000Z", [{ operation_id: "operation-0", operation_type: "transcript_cut" }]);
  let revisionWrites = 0; let authorityWrites = 0;
  const advanced = { ...revision, editorial_authority_revision: 2, editorial_authority_fingerprint: "b".repeat(64) };
  const result = await persistHammerCanonicalSave({
    ...saveArgs(installed, allArtifacts(installed), changedAuthority),
    adapters: {
      saveRevision: async () => { revisionWrites += 1; return { ok: true, status: 200, data: { revision } }; },
      saveWorkpiece: async () => ({ ok: true, status: 200, data: installed }),
      saveRevisionAuthority: async () => { authorityWrites += 1; return { revision: advanced, disposition: "committed", fingerprint: "b".repeat(64) }; },
    },
  });
  assert.equal(result.ok, true);
  assert.deepEqual([revisionWrites, authorityWrites], [0, 1]);
});

test("workspace shell persists hydrated authority rather than release timestamp projection", () => {
  const source = readFileSync(new URL("../src/editor/HammerWorkspaceShell.tsx", import.meta.url), "utf8");
  assert.equal(source.includes("exportCanonicalGraph: editableEditorialAuthorityGraph ?? exportBasis.canonicalGraph"), true);
});
