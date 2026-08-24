import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { loadHammerReadOnlyAcceptance } from "../src/acceptance/hammerReadOnlyAcceptance";
import type { HammerHistoryComponentAuthority } from "../src/lib/hammerHistoryEpochApi";

const ids = {
  workspaceId: "11111111-1111-4111-8111-111111111111",
  workpieceId: "22222222-2222-4222-8222-222222222222",
  recordingId: "33333333-3333-4333-8333-333333333333",
  revisionId: "44444444-4444-4444-8444-444444444444",
};
const paths = {
  audio: `hammer/revisions/${ids.revisionId}/audio-polish.v1.json`,
  editorial_authority: `hammer/revisions/${ids.revisionId}/editorial-authority.v1.json`,
  transcript: `hammer/revisions/${ids.revisionId}/transcript.v1.json`,
  visual_placements: `hammer/revisions/${ids.revisionId}/visual-placements.v1.json`,
  visual_timeline: `hammer/revisions/${ids.revisionId}/visual-timeline.v1.json`,
} as const;
const authority = Object.fromEntries(Object.entries(paths).map(([component, path], index) => [component, {
  workpiece_id: ids.workpieceId, path, sha256: String(index + 1).repeat(64), bytes: 100 + index,
  registry_revision: 10 + index, registry_updated_at: `2026-08-24T12:00:0${index}.123456Z`, content_type: "application/json",
}])) as HammerHistoryComponentAuthority;

function dependencies(overrides: Record<string, unknown> = {}) {
  const revision = {
    id: ids.revisionId, workspace_id: ids.workspaceId, workpiece_id: ids.workpieceId,
    canonical_recording_id: ids.recordingId, status: "active", label: null,
    editor_session_path: `hammer/revisions/${ids.revisionId}/editor-session.v1.json`,
    revision_transcript_path: paths.transcript, audio_polish_path: paths.audio,
    visual_timeline_path: paths.visual_timeline, visual_placements_path: paths.visual_placements,
    history_path: `hammer/revisions/${ids.revisionId}/history/epochs/e/heads/h.history.v1.json`,
    snapshots_manifest_path: null, editorial_authority_path: paths.editorial_authority,
    editorial_authority_fingerprint: "a".repeat(64), editorial_authority_revision: 2,
    updated_at: "2026-08-24T12:30:00.123456Z",
  } as const;
  return {
    readRevision: async () => ({ ok: true as const, status: 200, data: {
      canonical_recording: { id: ids.recordingId, workspace_id: ids.workspaceId, workpiece_id: ids.workpieceId, status: "sealed" as const, media_path: "hammer/media/canonical.wav", sealed_at: "2026-08-20T00:00:00Z", baseline_transcript_path: null, baseline_speaker_map_path: null, baseline_timing_path: null },
      revision,
    } }),
    loadArtifacts: async () => ({ ok: true as const, status: 200, data: {
      editor_session: null,
      revision_transcript: { segments: Array.from({ length: 137 }, (_, index) => ({ segment_id: `segment:${index}` })) },
      audio_polish: { schema_version: 1 },
      visual_timeline: {
        version: 2, revision: 1, updated_at: "2026-08-24T00:00:00Z", source_mode: "canonical", selected_clip_id: null,
        assets: [{ asset_id: "asset:broll", path: "hammer/broll/a.mp4", label: "B-roll", asset_ref: "asset:broll" }], lanes: [],
        clips: [
          { clip_id: "placement:visible", asset_id: "asset:broll", entry_id: "entry:1", label: "Visible", visual_mode: "broll", start_sec: 1, end_sec: 2, placement_status: "uncertain", confidence: .3, anchor_hint: { anchor_segment_id: "segment:0", matched_segment_ids: [], anchor_text: null, anchor_label: null }, semantic_anchor: { status: "anchored" }, animation: { preset: null } },
          { clip_id: "placement:packaging", asset_id: null, entry_id: "packaging:intro", label: "Intro", visual_mode: "packaging_intro", start_sec: 0, end_sec: 1, placement_status: "placed", confidence: 1, anchor_hint: { anchor_segment_id: null, matched_segment_ids: [], anchor_text: null, anchor_label: null }, semantic_anchor: { status: "no_placement_intent" }, animation: { preset: null } },
        ],
      },
      visual_timeline_authority: "canonical" as const,
      visual_placements: { placements: Array.from({ length: 29 }, (_, index) => ({ placement_id: `placement:${index}`, status: index < 2 ? "uncertain" : "placed" })) },
      composition_v2: null, composition_transaction: null, history_v2: null, media_provenance: null, render_jobs: null, release_packet: null,
      editorial_authority: { schema_version: 1, graph_id: "graph", graph_version: 2, operation_order: [], operations: [], created_at: "2026-08-20T00:00:00Z", updated_at: "2026-08-23T00:00:00Z" },
    } }),
    loadHistory: async () => ({ ok: true as const, status: 200, hydration: {
      kind: "epoch_head" as const, pointer: revision.history_path, epoch_id: "55555555-5555-4555-8555-555555555555", head_id: "66666666-6666-4666-8666-666666666666", sequence: 1,
      document: { version: 1, workpieceId: ids.workpieceId, sessionId: "epoch:test", baseRevisionId: "hammer-state:base0000", createdAt: "2026-08-20T00:00:00Z", updatedAt: "2026-08-24T00:00:00Z", headEntryId: "entry:1", entries: [], checkpoints: [], undoStack: ["entry:1"], redoStack: [], metadata: {} },
      parent: {}, epoch_anchor: {}, base: {}, result: { editor_state_hash: "hammer-state:8387e7e6", component_authority: authority }, boundary: {}, durable_basis: {},
    } }),
    loadComponentAuthority: async () => authority,
    ...overrides,
  };
}

test("acceptance derives facts from production artifact, history, and mounted-clip models", async () => {
  const value = await loadHammerReadOnlyAcceptance({ ...ids, dependencies: dependencies() as never });
  assert.deepEqual(value.facts, { transcript_segments: 137, canonical_placements: 29, mounted_composition_clips: 1, uncertain_placements: 2, undo_depth: 1, redo_depth: 0, history_current_head_mismatch: false });
  assert.equal(value.identities.history_head_state_hash, "hammer-state:8387e7e6");
  assert.equal(value.identities.history_sequence, 1);
});

test("acceptance fails closed when current component authority differs from the immutable head", async () => {
  const mismatch = { ...authority, visual_placements: { ...authority.visual_placements, sha256: "f".repeat(64) } };
  await assert.rejects(() => loadHammerReadOnlyAcceptance({ ...ids, dependencies: dependencies({ loadComponentAuthority: async () => mismatch }) as never }), /history_current_head_mismatch/);
});

test("acceptance route remains detached from editor and mutation machinery", async () => {
  const source = await readFile(new URL("../../nursery/src/routes/HammerAcceptance.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /HammerWorkspaceEditor|HammerWorkspaceShell|openHammerRecordingSession|saveHammer|method:\s*["'](?:POST|PUT|DELETE)/);
  assert.match(source, /loadHammerReadOnlyAcceptance/);
});

console.log("Hammer read-only acceptance tests passed.");
