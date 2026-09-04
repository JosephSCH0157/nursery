import assert from "node:assert/strict";
import { test } from "node:test";
import { createDefaultHammerStudioRackState } from "../src/editor/hammerStudioRack";
import { fingerprintHammerShortProjection, projectHammerShortArtifacts } from "../src/editor/hammerShortsProjection";
import type { HammerPersistedEditorSession, HammerPersistedStructuredTranscript, HammerPersistedVisualPlacements } from "../src/persistence/hammerPersistenceContract";
import type { HammerVisualTimelineState } from "../src/visuals/model/hammerVisualTypes";

const transcript = {
  schema_version: 1, transcript_id: "parent-transcript", media_id: "media", media_signature: "sig", prepared_at: "2026-01-01T00:00:00.000Z",
  structure: "speaker_turns", source_media_ref: null, diarization: { label_scheme: "forge-neutral-speakers.v1", labels: ["S1"], raw_labels: ["S1"], version: "v1", provider: "openai", provider_request_id: null, model: "test" }, confidence_flags: [],
  segments: [
    { segment_id: "a", start_sec: 10, end_sec: 20, speaker: "S1", text: "before" },
    { segment_id: "b", start_sec: 20, end_sec: 30, speaker: "S1", text: "inside", gain_db: -2 },
    { segment_id: "c", start_sec: 40, end_sec: 50, speaker: "S1", text: "after" },
  ],
} satisfies HammerPersistedStructuredTranscript;

const session = { schema_version: 1, session_id: "parent", source_mode: "tongs", preview_mode: "edit-aware", transcript_source_id: "parent-transcript", selected_segment_id: "b", selected_overlay_row_id: "clip", media_ref: null, workspace_mapping: null, media_source_label: "source", visual_preview: { white_balance: 0, color_amount: 1, background_blur: false }, last_opened_at: "2026-01-01T00:00:00.000Z" } satisfies HammerPersistedEditorSession;

test("projects a discontinuous candidate into deterministic child-relative authority", async () => {
  const visualTimeline = { version: 2, revision: 3, updated_at: "old", source_mode: "packaging", selected_clip_id: "clip", packaging: { version: 1, intro_asset_id: null, outro_asset_id: null, intro_source: null, outro_source: null }, assets: [{ asset_id: "asset", asset_ref: "ref", kind: "image", label: "image", path: "image.png", storage_key: "key", mime_type: "image/png", source_mode: "manual", roles: ["timeline_visual"], updated_at: "old" }], lanes: [{ lane_id: "lane", label: "Visual", clip_ids: ["clip"] }], clips: [{ clip_id: "clip", asset_id: "asset", lane_id: "lane", entry_id: null, label: "clip", visual_mode: null, confidence: 1, placement_status: "placed", ingest_state: "approved", uncertainty_flags: [], start_sec: 9, end_sec: 25, geometry: { x: 0, y: 0, width: 1, height: 1, anchor: "center" }, animation: { preset: "fade_in" }, opacity: 1, z_index: 1, enabled: true, locked: false, source_mode: "manual", anchor_hint: { anchor_segment_id: "b", matched_segment_ids: ["b"], anchor_text: null, anchor_label: null, detached: false }, semantic_anchor: { status: "anchored", hearth_entry_id: null, hearth_beat_id: null, purpose: null, origin: "hammer_timeline", placement_intent: null, script: { script_path: null, script_approval_id: null, script_approval_revision: null, script_content_hash: null, anchor_contract_version: null, section_id: null, paragraph_id: null, sentence_start: null, sentence_end: null, char_start: null, char_end: null, quoted_phrase: null, resolution_state: "unresolved" }, transcript: { transcript_id: "parent", media_id: "media", media_signature: "sig", segment_ids: ["b"], start_sec: 20, end_sec: 30, resolution_state: "resolved" }, resolution_method: "manual_transcript", resolution_confidence: 1, resolver_version: "v1", resolved_at: "old" }, divergence: { state: "aligned", start_delta_sec: 0, end_delta_sec: 0 }, updated_at: "old" }] } as HammerVisualTimelineState;
  const placements = { schema_version: 1, status: "prepared", source_refs: ["ref"], uncertainty_flags: [], placements: [{ placement_id: "placement", entry_id: "entry", anchor_segment_id: "b", matched_segment_ids: ["b"], anchor_text: null, asset_ref: "ref", asset_id: "asset", asset_path: "image.png", storage_key: "key", label: "image", visual_mode: null, start_sec: 9, end_sec: 25, confidence: 1, timing_source: "transcript_match", status: "placed", uncertainty_flags: [] }] } as HammerPersistedVisualPlacements;
  const input = { childWorkpieceId: "child", childRevisionId: "revision", basisLockId: "basis", candidateId: "candidate", projectedAt: "2026-09-01T00:00:00.000Z", envelope: { start_sec: 8, end_sec: 22 }, core: { start_sec: 10, end_sec: 20 }, transcript: transcript.segments, structuredTranscript: transcript, timingMap: [{ segment_id: "a", source_start_sec: 10, source_end_sec: 20, output_start_sec: 0, output_end_sec: 10 }, { segment_id: "b", source_start_sec: 20, source_end_sec: 30, output_start_sec: 10, output_end_sec: 20 }, { segment_id: "c", source_start_sec: 40, source_end_sec: 50, output_start_sec: 20, output_end_sec: 30 }], editorSession: session, visualTimeline, visualPlacements: placements, audioEdit: { version: "v1", operations: [{ id: "cut", type: "cut", start_sec: 5, end_sec: 12 }] }, studioRack: createDefaultHammerStudioRackState() } as const;
  const projected = projectHammerShortArtifacts(input);
  assert.deepEqual(projected.core_range, { start_sec: 2, end_sec: 12 });
  assert.deepEqual(projected.transcript.segments.map((segment) => [segment.segment_id, segment.start_sec, segment.end_sec]), [["a", 0, 2], ["b", 2, 12], ["c", 12, 14]]);
  assert.deepEqual(projected.timing_map.intervals.map((interval) => [interval.source_start_sec, interval.source_end_sec, interval.output_start_sec, interval.output_end_sec]), [[18, 20, 0, 2], [20, 30, 2, 12], [40, 42, 12, 14]]);
  assert.deepEqual(projected.audio_polish.audio_edit?.operations[0], { id: "cut", type: "cut", start_sec: 0, end_sec: 4 });
  assert.equal(projected.visual_timeline?.clips[0]?.start_sec, 1);
  assert.equal(projected.visual_timeline?.clips[0]?.end_sec, 14);
  assert.equal(projected.history.entries.length, 0);
  assert.equal(projected.history.undoStack.length, 0);
  assert.equal(await fingerprintHammerShortProjection(projected), await fingerprintHammerShortProjection(projectHammerShortArtifacts(input)));
});

test("rejects invalid projection ranges", () => {
  assert.throws(() => projectHammerShortArtifacts({ childWorkpieceId: "c", childRevisionId: "r", basisLockId: "b", candidateId: "x", projectedAt: "now", envelope: { start_sec: 20, end_sec: 10 }, core: { start_sec: 20, end_sec: 10 }, transcript: [], structuredTranscript: transcript, timingMap: [], editorSession: session, visualTimeline: null, visualPlacements: null, audioEdit: null, studioRack: createDefaultHammerStudioRackState() }), /projection_range_invalid/);
});
