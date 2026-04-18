import assert from "node:assert/strict";
import { projectEditorialAuthorityGraphFromEditPlan } from "../src/editor/hammerRenderAssembly";
import { applyTranscriptDeleteRangeComposition } from "../src/editor/hammerCompositionMutations";
import { appendAuthorityInstructionToGraph, createInsertBrollInstruction } from "../src/editor/hammerAuthorityOps";
import type { HammerEditorStateSerializable } from "../src/editor/hammerWorkspaceHistory";
import type { HammerWorkspaceSnapshot } from "../src/editor/hammerWorkspaceSnapshot";
import {
  buildHammerLaunchContextFromPersistence,
  buildHammerPersistenceSaveRequest,
} from "../src/persistence/hammerPersistence";
import type { HammerPersistenceSnapshot } from "../src/persistence/hammerPersistenceContract";
import { loadHammerVisualTimelineStateFromSnapshot } from "../src/visuals/persistence/hammerVisualTimelinePersistence";
import {
  createDefaultVisualAnimation,
  createDefaultVisualGeometry,
  createDefaultVisualLane,
  createEmptyVisualTimelineState,
} from "../src/visuals/model/hammerVisualDefaults";
import { deriveLegacyVisualPlacementsFromTimeline } from "../src/visuals/persistence/hammerVisualTimelineLegacyAdapter";
import { createDefaultHammerStudioRackState } from "../src/editor/hammerStudioRack";
import { buildNotStartedHammerAudioPolish } from "../src/prep/hammerAudioPolish";

const target = {
  workspaceId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  workpieceId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
};

function buildBaseState(): HammerEditorStateSerializable {
  const baseGraph = projectEditorialAuthorityGraphFromEditPlan({
    editPlan: {
      edit_plan_id: "plan_sync_01",
      version: "1",
      created_at: "2026-04-18T12:00:00.000Z",
      updated_at: "2026-04-18T12:00:00.000Z",
      source_transcript_id: "transcript_sync_01",
      preview_mode: "edit-aware",
      instructions: [],
      workspace_id: target.workspaceId,
      workpiece_id: target.workpieceId,
      session_id: "session_sync_01",
    },
    workspaceId: target.workspaceId,
    workpieceId: target.workpieceId,
    sessionId: "session_sync_01",
    nowIso: "2026-04-18T12:00:00.000Z",
  });
  const graphWithBroll = appendAuthorityInstructionToGraph({
    graph: baseGraph,
    instruction: createInsertBrollInstruction({
      segmentId: "seg_003",
      assetRef: "assets/broll/bridge-shot.mp4",
      startSec: 4,
      endSec: 6,
      nowIso: "2026-04-18T12:01:00.000Z",
      instructionId: "insert_broll_sync_01",
    }),
    nowIso: "2026-04-18T12:01:00.000Z",
    fallback: {
      graphId: "plan_sync_01:authority",
      workspaceId: target.workspaceId,
      workpieceId: target.workpieceId,
      sessionId: "session_sync_01",
      sourceTranscriptId: "transcript_sync_01",
    },
  });
  const brollOperationId = graphWithBroll.operations.at(-1)?.operation_id ?? null;
  assert.ok(brollOperationId);

  const visualTimeline = createEmptyVisualTimelineState({
    updated_at: "2026-04-18T12:01:00.000Z",
    assets: [
      {
        asset_id: "asset_broll_01",
        asset_ref: "assets/broll/bridge-shot.mp4",
        kind: "broll",
        label: "Bridge Shot",
        path: "assets/broll/bridge-shot.mp4",
        storage_key: "workpieces/example/assets/broll/bridge-shot.mp4",
        mime_type: "video/mp4",
        source_mode: "packaging",
        updated_at: "2026-04-18T12:01:00.000Z",
      },
    ],
    lanes: [
      createDefaultVisualLane({
        lane_id: "lane:primary",
        clip_ids: ["clip_broll_01"],
      }),
    ],
    clips: [
      {
        clip_id: "clip_broll_01",
        authority_operation_id: brollOperationId,
        asset_id: "asset_broll_01",
        lane_id: "lane:primary",
        entry_id: "entry_broll_01",
        label: "Bridge Shot",
        visual_mode: "broll",
        confidence: 1,
        placement_status: "placed",
        ingest_state: "approved",
        uncertainty_flags: [],
        start_sec: 4,
        end_sec: 6,
        geometry: createDefaultVisualGeometry(),
        animation: createDefaultVisualAnimation(),
        opacity: 1,
        z_index: 1,
        enabled: true,
        locked: false,
        source_mode: "packaging",
        anchor_hint: {
          anchor_segment_id: "seg_003",
          matched_segment_ids: ["seg_003"],
          anchor_text: "Third line.",
          anchor_label: "Bridge Shot",
          detached: false,
        },
        updated_at: "2026-04-18T12:01:00.000Z",
      },
    ],
    selected_clip_id: "clip_broll_01",
  });

  return {
    transcriptSegments: [
      { segment_id: "seg_001", speaker: "S1", text: "First line.", start_sec: 0, end_sec: 2 },
      { segment_id: "seg_002", speaker: "S1", text: "Second line.", start_sec: 2, end_sec: 4 },
      { segment_id: "seg_003", speaker: "S1", text: "Third line.", start_sec: 4, end_sec: 6 },
    ],
    visualTimeline,
    visualPlacements: deriveLegacyVisualPlacementsFromTimeline(visualTimeline),
    audioEdit: null,
    studioRack: createDefaultHammerStudioRackState(),
    editorialAuthorityGraph: graphWithBroll,
    outputSelection: {
      layerId: null,
      sourceRecipeRef: null,
    },
    selectedSegmentId: "seg_002",
    playheadSec: 2.5,
    transcriptTimingHint: null,
  };
}

function buildWorkspaceSnapshot(state: HammerEditorStateSerializable): HammerWorkspaceSnapshot {
  const audioPolish = buildNotStartedHammerAudioPolish();
  audioPolish.audio_edit = state.audioEdit;
  return {
    workspaceId: target.workspaceId,
    workpieceId: target.workpieceId,
    sessionId: "session_sync_01",
    sourceMode: "tongs",
    previewMode: "edit-aware",
    editPlanStatus: "dirty",
    editPlanSignature: "sig_sync_01",
    transcriptSourceId: "transcript_sync_01",
    currentPass: "transcript_cleanup",
    passOrderVersion: 2,
    passStatus: {
      transcript_cleanup: "in_progress",
      retakes: "not_started",
    },
    transcriptSegments: state.transcriptSegments,
    selectedSegmentId: state.selectedSegmentId,
    selectedOverlayRowId: state.visualTimeline?.selected_clip_id ?? null,
    visualPreviewSettings: {
      white_balance: 0,
      color_amount: 0,
      background_blur: false,
    },
    mediaRef: {
      media_id: "media_sync_01",
      kind: "recording_video",
      source_hint: "local",
      local_relpath: "recordings/sync-test.mp4",
    },
    workspaceMapping: {
      workspace_id: target.workspaceId,
      local_root_abs: "D:\\ForgeMedia\\workspace",
    },
    mediaSourceLabel: "tongs:media_sync_01",
    selectedMacroRecipeRef: null,
    lastMacroRunRef: null,
    structuredTranscript: {
      schema_version: 1,
      transcript_id: "transcript_sync_01",
      media_id: "media_sync_01",
      media_signature: "media_sig_sync_01",
      prepared_at: "2026-04-18T12:00:00.000Z",
      structure: "speaker_turns",
      source_media_ref: {
        media_id: "media_sync_01",
        kind: "recording_video",
        source_hint: "local",
        local_relpath: "recordings/sync-test.mp4",
      },
      diarization: {
        label_scheme: "forge-neutral-speakers.v1",
        labels: ["S1"],
        raw_labels: ["host"],
        version: "gpt-4o-transcribe",
        provider: "openai",
        provider_request_id: "req_sync_01",
        model: "gpt-4o-transcribe",
      },
      confidence_flags: [],
      segments: state.transcriptSegments,
      derived_text_layers: {
        schema_version: 1,
        active_layer_id: null,
        output_layer_id: null,
        layers: [],
      },
      subtitle_outputs: {
        schema_version: 1,
        last_generated_format: null,
        srt: null,
        vtt: null,
      },
    },
    editPlan: {
      edit_plan_id: "plan_sync_01",
      version: "1",
      created_at: "2026-04-18T12:00:00.000Z",
      updated_at: "2026-04-18T12:01:00.000Z",
      source_transcript_id: "transcript_sync_01",
      preview_mode: "edit-aware",
      instructions: [],
      workspace_id: target.workspaceId,
      workpiece_id: target.workpieceId,
      session_id: "session_sync_01",
    },
    editorialAuthorityGraph: state.editorialAuthorityGraph,
    visualPlacements: state.visualPlacements,
    visualTimeline: state.visualTimeline,
    audioPolish,
  };
}

function buildPersistedSnapshotFromSaveRequest(saveRequest: ReturnType<typeof buildHammerPersistenceSaveRequest>): HammerPersistenceSnapshot {
  return {
    schema_version: 1,
    state: {
      workspace_id: target.workspaceId,
      workpiece_id: target.workpieceId,
      active_session_id: saveRequest.active_session_id ?? null,
      current_pass: saveRequest.current_pass ?? "transcript_cleanup",
      pass_order_version: saveRequest.pass_order_version ?? 2,
      pass_status: saveRequest.pass_status ?? { transcript_cleanup: "in_progress", retakes: "not_started" },
      editor_session_path: "hammer/session/editor-state.v1.json",
      transcript_artifact_path: "hammer/transcript/structured.v1.json",
      speaker_map_artifact_path: "hammer/transcript/speaker-map.v1.json",
      visual_placement_artifact_path: "hammer/prep/visual-placements.v1.json",
      visual_timeline_artifact_path: "hammer/prep/visual-timeline.v1.json",
      audio_polish_artifact_path: "hammer/prep/audio-polish.v1.json",
      edit_plan_artifact_path: "hammer/edit-plan/current.v1.json",
      editorial_authority_artifact_path: "hammer/session/editorial-authority.v1.json",
      edit_plan_signature: saveRequest.edit_plan_signature ?? null,
      prep_status: saveRequest.prep_status ?? "prepared",
      alignment_status: saveRequest.alignment_status ?? "aligned",
      macro_recipe_ref: saveRequest.macro_recipe_ref ?? null,
      last_macro_run_ref: saveRequest.last_macro_run_ref ?? null,
      last_opened_at: saveRequest.last_opened_at ?? "2026-04-18T12:05:00.000Z",
      updated_at: "2026-04-18T12:05:05.000Z",
      updated_by: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    },
    editor_session: {
      path: "hammer/session/editor-state.v1.json",
      updated_at: "2026-04-18T12:05:01.000Z",
      data: saveRequest.editor_session?.data ?? null,
    },
    structured_transcript: {
      path: "hammer/transcript/structured.v1.json",
      updated_at: "2026-04-18T12:05:02.000Z",
      data: saveRequest.structured_transcript?.data ?? null,
    },
    speaker_map: {
      path: "hammer/transcript/speaker-map.v1.json",
      updated_at: "2026-04-18T12:05:02.500Z",
      data: saveRequest.speaker_map?.data ?? null,
    },
    visual_placements: {
      path: "hammer/prep/visual-placements.v1.json",
      updated_at: "2026-04-18T12:05:03.000Z",
      data: saveRequest.visual_placements?.data ?? null,
    },
    visual_timeline: {
      path: "hammer/prep/visual-timeline.v1.json",
      updated_at: "2026-04-18T12:05:03.500Z",
      data: saveRequest.visual_timeline?.data ?? null,
    },
    audio_polish: {
      path: "hammer/prep/audio-polish.v1.json",
      updated_at: "2026-04-18T12:05:04.000Z",
      data: saveRequest.audio_polish?.data ?? null,
    },
    edit_plan: {
      path: "hammer/edit-plan/current.v1.json",
      updated_at: "2026-04-18T12:05:04.500Z",
      data: saveRequest.edit_plan?.data ?? null,
    },
    editorial_authority: {
      path: "hammer/session/editorial-authority.v1.json",
      updated_at: "2026-04-18T12:05:05.000Z",
      data: saveRequest.editorial_authority.data,
    },
    macro_hooks: {
      recipe_ref: saveRequest.macro_recipe_ref ?? null,
      last_run_ref: saveRequest.last_macro_run_ref ?? null,
    },
  };
}

async function testDeleteActionStaysCompositionSynchronized() {
  const before = buildBaseState();
  const after = applyTranscriptDeleteRangeComposition({
    before,
    op: {
      type: "TRANSCRIPT_DELETE_RANGE",
      label: "Delete segment and ripple",
      segmentIds: ["seg_002"],
      kind: "segment_structure",
      immediatePersist: true,
    },
    context: {
      playbackDurationSec: 6,
      authorityFallback: {
        graphId: "plan_sync_01:authority",
        workspaceId: target.workspaceId,
        workpieceId: target.workpieceId,
        sessionId: "session_sync_01",
        sourceTranscriptId: "transcript_sync_01",
      },
      nowIso: "2026-04-18T12:02:00.000Z",
    },
  });

  assert.equal(after.editorialAuthorityGraph?.operations.length, 2);
  assert.equal(after.editorialAuthorityGraph?.operations.at(-1)?.instruction.type, "ripple_delete");
  assert.deepEqual(
    after.transcriptSegments.map((segment) => ({ id: segment.segment_id, start: segment.start_sec, end: segment.end_sec })),
    [
      { id: "seg_001", start: 0, end: 2 },
      { id: "seg_003", start: 2, end: 4 },
    ],
  );
  assert.equal(after.visualTimeline?.clips[0]?.start_sec, 2);
  assert.equal(after.visualTimeline?.clips[0]?.end_sec, 4);
  assert.equal(after.audioEdit?.operations.length, 1);
  assert.deepEqual(after.audioEdit?.operations[0], {
    id: "composition:transcript-delete-range:0",
    type: "cut",
    start_sec: 2,
    end_sec: 4,
  });
  assert.equal(after.selectedSegmentId, "seg_003");
  assert.equal(after.playheadSec, 2);

  const saveRequest = buildHammerPersistenceSaveRequest(buildWorkspaceSnapshot(after));
  assert.equal(saveRequest.editorial_authority.data.operations.length, 2);
  assert.equal(saveRequest.visual_timeline?.data.clips[0]?.start_sec, 2);
  assert.equal(saveRequest.visual_timeline?.data.clips[0]?.end_sec, 4);
  assert.equal(saveRequest.audio_polish?.data.audio_edit?.operations.length, 1);
  assert.equal(saveRequest.editor_session?.data.selected_segment_id, "seg_003");

  const persistedSnapshot = buildPersistedSnapshotFromSaveRequest(saveRequest);
  const reloadedLaunch = buildHammerLaunchContextFromPersistence(target, persistedSnapshot);
  const reloadedTimeline = loadHammerVisualTimelineStateFromSnapshot(persistedSnapshot);

  assert.ok(reloadedLaunch);
  assert.deepEqual(
    reloadedLaunch?.launchContext.transcript.kind === "tongs-stub"
      ? reloadedLaunch.launchContext.transcript.segments
      : [],
    after.transcriptSegments,
  );
  assert.equal(reloadedLaunch?.launchContext.edit_plan?.instructions.length, 2);
  assert.equal(reloadedLaunch?.launchContext.edit_plan?.instructions.at(-1)?.type, "ripple_delete");
  assert.equal(reloadedTimeline.clips[0]?.start_sec, 2);
  assert.equal(reloadedTimeline.clips[0]?.end_sec, 4);
}

await testDeleteActionStaysCompositionSynchronized();
console.log("Hammer composition sync tests passed.");