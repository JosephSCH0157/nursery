import assert from "node:assert/strict";
import type { HammerEditPlan } from "../../../packages/contracts/hammer/edit-plan.contract";
import {
  buildHammerRenderAssembly,
  projectEditorialAuthorityGraphFromEditPlan,
} from "../src/editor/hammerRenderAssembly";

function buildPlan(): HammerEditPlan {
  return {
    edit_plan_id: "plan_render_01",
    version: "1",
    created_at: "2026-03-24T12:00:00.000Z",
    updated_at: "2026-03-24T12:00:00.000Z",
    source_transcript_id: "transcript_render_01",
    preview_mode: "edit-aware",
    instructions: [
      {
        instruction_id: "ins_delete_01",
        segment_id: "seg_01",
        type: "delete",
        created_at: "2026-03-24T12:00:00.000Z",
      },
      {
        instruction_id: "ins_broll_01",
        segment_id: "seg_02",
        type: "insert_broll",
        asset_ref: "assets/broll-01.mp4",
        start_sec: 2,
        end_sec: 6,
        created_at: "2026-03-24T12:00:00.000Z",
      },
    ],
  };
}

async function testAssemblyDeterminismAndPosture() {
  const graph = projectEditorialAuthorityGraphFromEditPlan({
    editPlan: buildPlan(),
    workspaceId: "ws_render",
    workpieceId: "wp_render",
    sessionId: "session_render",
    nowIso: "2026-03-24T12:00:00.000Z",
  });

  const full = buildHammerRenderAssembly({
    canonicalGraph: graph,
    runtimeCapabilities: {
      preview_supported_operation_types: ["delete", "insert_broll"],
      export_supported_operation_types: ["delete", "insert_broll"],
      handoff_supported_operation_types: ["delete", "insert_broll"],
    },
  });
  const fullSecond = buildHammerRenderAssembly({
    canonicalGraph: graph,
    runtimeCapabilities: {
      preview_supported_operation_types: ["delete", "insert_broll"],
      export_supported_operation_types: ["delete", "insert_broll"],
      handoff_supported_operation_types: ["delete", "insert_broll"],
    },
  });
  assert.deepEqual(full, fullSecond);
  assert.equal(full.preview.posture, "authoritative");
  assert.equal(full.export.posture, "authoritative");
  assert.equal(full.handoff.posture, "authoritative");

  const degradedPreview = buildHammerRenderAssembly({
    canonicalGraph: graph,
    runtimeCapabilities: {
      preview_supported_operation_types: ["delete"],
      export_supported_operation_types: ["delete", "insert_broll"],
      handoff_supported_operation_types: ["delete", "insert_broll"],
    },
  });
  assert.equal(degradedPreview.preview.posture, "degraded");
  assert.equal(degradedPreview.export.posture, "authoritative");
}

async function testUnresolvedBrollIsNeverTreatedAsBoundMediaTruth() {
  const graph = projectEditorialAuthorityGraphFromEditPlan({
    editPlan: {
      edit_plan_id: "plan_render_02",
      version: "1",
      created_at: "2026-03-24T12:10:00.000Z",
      updated_at: "2026-03-24T12:10:00.000Z",
      source_transcript_id: "transcript_render_02",
      preview_mode: "edit-aware",
      instructions: [
        {
          instruction_id: "ins_broll_unresolved",
          segment_id: "seg_10",
          type: "insert_broll",
          asset_ref: "unresolved:hearth-suggestion-01",
          start_sec: 4,
          end_sec: 8,
          intent_source: "hearth_suggestion",
          intent_ref: "hearth-suggestion-01",
          intent_description: "city establishing shot",
          asset_binding_state: "unresolved",
          duck_preference: "auto",
          created_at: "2026-03-24T12:10:00.000Z",
        },
      ],
    },
    workspaceId: "ws_render",
    workpieceId: "wp_render",
    sessionId: "session_render",
  });
  const assembly = buildHammerRenderAssembly({
    canonicalGraph: graph,
    runtimeCapabilities: {
      preview_supported_operation_types: ["insert_broll"],
      export_supported_operation_types: ["insert_broll"],
      handoff_supported_operation_types: ["insert_broll"],
    },
  });
  assert.equal(assembly.preview.posture, "unavailable");
  assert.equal(assembly.export.posture, "degraded");
  assert.equal(assembly.handoff.posture, "degraded");
}

async function testOrphanedLinkedDuckIsExplicitlyDegraded() {
  const graph = projectEditorialAuthorityGraphFromEditPlan({
    editPlan: {
      edit_plan_id: "plan_render_03",
      version: "1",
      created_at: "2026-03-24T12:20:00.000Z",
      updated_at: "2026-03-24T12:20:00.000Z",
      source_transcript_id: "transcript_render_03",
      preview_mode: "edit-aware",
      instructions: [
        {
          instruction_id: "ins_duck_orphaned",
          segment_id: "seg_20",
          type: "audio_duck",
          start_sec: 5,
          end_sec: 7,
          duck_gain_db: -9,
          linked_broll_operation_id: "op:missing-broll",
          created_at: "2026-03-24T12:20:00.000Z",
        },
      ],
    },
    workspaceId: "ws_render",
    workpieceId: "wp_render",
    sessionId: "session_render",
  });
  const assembly = buildHammerRenderAssembly({
    canonicalGraph: graph,
    runtimeCapabilities: {
      preview_supported_operation_types: ["audio_duck"],
      export_supported_operation_types: ["audio_duck"],
      handoff_supported_operation_types: ["audio_duck"],
    },
  });
  assert.equal(assembly.preview.posture, "degraded");
  assert.equal(assembly.operations[0]?.capability, "degraded");
  assert.equal(assembly.operations[0]?.reason_codes.includes("operation_conflict"), true);
}

async function testExportTimelineAssemblyIsDeterministicAndComposed() {
  const graph = projectEditorialAuthorityGraphFromEditPlan({
    editPlan: {
      edit_plan_id: "plan_render_04",
      version: "1",
      created_at: "2026-03-24T12:30:00.000Z",
      updated_at: "2026-03-24T12:30:00.000Z",
      source_transcript_id: "transcript_render_04",
      preview_mode: "edit-aware",
      instructions: [
        {
          instruction_id: "ins_ripple_01",
          segment_id: "seg_01",
          type: "ripple_delete",
          start_sec: 1,
          end_sec: 2,
          created_at: "2026-03-24T12:30:00.000Z",
        },
        {
          instruction_id: "ins_broll_02",
          segment_id: "seg_02",
          type: "insert_broll",
          asset_ref: "assets/broll-02.mp4",
          start_sec: 2,
          end_sec: 5,
          asset_binding_state: "resolved",
          created_at: "2026-03-24T12:30:00.000Z",
        },
        {
          instruction_id: "ins_duck_02",
          segment_id: "seg_02",
          type: "audio_duck",
          start_sec: 2,
          end_sec: 5,
          duck_gain_db: -9,
          created_at: "2026-03-24T12:30:00.000Z",
        },
        {
          instruction_id: "ins_transition_01",
          segment_id: "seg_03",
          type: "crossfade",
          next_segment_id: "seg_04",
          duration_sec: 0.4,
          start_sec: 5.4,
          end_sec: 5.8,
          created_at: "2026-03-24T12:30:00.000Z",
        },
      ],
    },
    workspaceId: "ws_render",
    workpieceId: "wp_render",
    sessionId: "session_render",
  });
  const capabilities = {
    preview_supported_operation_types: ["ripple_delete", "insert_broll", "audio_duck", "crossfade"],
    export_supported_operation_types: ["ripple_delete", "insert_broll", "audio_duck", "crossfade"],
    handoff_supported_operation_types: ["ripple_delete", "insert_broll", "audio_duck", "crossfade"],
  } as const;
  const first = buildHammerRenderAssembly({
    canonicalGraph: graph,
    runtimeCapabilities: capabilities,
    transcriptSegments: [
      { segment_id: "seg_01", start_sec: 0, end_sec: 4 },
      { segment_id: "seg_02", start_sec: 4, end_sec: 10 },
    ],
    captionChunks: [
      { chunk_id: "cap_01", start_sec: 0, end_sec: 1, segment_ids: ["seg_01"] },
      { chunk_id: "cap_02", start_sec: 3, end_sec: 4, segment_ids: ["seg_01"] },
    ],
  });
  const second = buildHammerRenderAssembly({
    canonicalGraph: graph,
    runtimeCapabilities: capabilities,
    transcriptSegments: [
      { segment_id: "seg_01", start_sec: 0, end_sec: 4 },
      { segment_id: "seg_02", start_sec: 4, end_sec: 10 },
    ],
    captionChunks: [
      { chunk_id: "cap_01", start_sec: 0, end_sec: 1, segment_ids: ["seg_01"] },
      { chunk_id: "cap_02", start_sec: 3, end_sec: 4, segment_ids: ["seg_01"] },
    ],
  });
  assert.deepEqual(first.export_timeline, second.export_timeline);
  assert.equal(first.export_timeline.final_duration_sec, 9);
  assert.equal(first.export_timeline.export_posture, "authoritative");
  assert.equal(first.export_timeline.audio_layers.some((layer) => layer.kind === "duck_region"), true);
  assert.equal(first.export_timeline.visual_layers.some((layer) => layer.kind === "broll"), true);
  assert.equal(first.export_timeline.transition_layers.some((layer) => layer.kind === "crossfade"), true);
  assert.equal(first.export_timeline.caption_timing_map.find((entry) => entry.chunk_id === "cap_02")?.start_sec, 2);
}

async function testPodcastMasterPassPostureTracksRuntimeCapability() {
  const graph = projectEditorialAuthorityGraphFromEditPlan({
    editPlan: {
      edit_plan_id: "plan_render_05",
      version: "1",
      created_at: "2026-03-24T12:40:00.000Z",
      updated_at: "2026-03-24T12:40:00.000Z",
      source_transcript_id: "transcript_render_05",
      preview_mode: "edit-aware",
      instructions: [
        {
          instruction_id: "ins_master_01",
          segment_id: "seg_01",
          type: "podcast_master_pass",
          preset: "podcast_master_v1",
          noise_cleanup: "light",
          normalization_lufs: -16,
          compression_amount: "medium",
          limiter_ceiling_dbtp: -1,
          created_at: "2026-03-24T12:40:00.000Z",
        },
      ],
    },
    workspaceId: "ws_render",
    workpieceId: "wp_render",
    sessionId: "session_render",
  });
  const available = buildHammerRenderAssembly({
    canonicalGraph: graph,
    runtimeCapabilities: {
      preview_supported_operation_types: [],
      export_supported_operation_types: ["podcast_master_pass"],
      handoff_supported_operation_types: ["podcast_master_pass"],
      podcast_master: {
        available: true,
        preview_supported: false,
        stages: {
          normalize: true,
          compress: true,
          limit: true,
          noise_cleanup_light: true,
        },
      },
    },
    transcriptSegments: [{ segment_id: "seg_01", start_sec: 0, end_sec: 10 }],
    captionChunks: [{ chunk_id: "cap_01", start_sec: 0, end_sec: 1, segment_ids: ["seg_01"] }],
  });
  const unavailable = buildHammerRenderAssembly({
    canonicalGraph: graph,
    runtimeCapabilities: {
      preview_supported_operation_types: [],
      export_supported_operation_types: [],
      handoff_supported_operation_types: ["podcast_master_pass"],
      podcast_master: {
        available: false,
        preview_supported: false,
        stages: {
          normalize: false,
          compress: false,
          limit: false,
          noise_cleanup_light: false,
        },
      },
    },
    transcriptSegments: [{ segment_id: "seg_01", start_sec: 0, end_sec: 10 }],
    captionChunks: [{ chunk_id: "cap_01", start_sec: 0, end_sec: 1, segment_ids: ["seg_01"] }],
  });
  const partial = buildHammerRenderAssembly({
    canonicalGraph: graph,
    runtimeCapabilities: {
      preview_supported_operation_types: [],
      export_supported_operation_types: ["podcast_master_pass"],
      handoff_supported_operation_types: ["podcast_master_pass"],
      podcast_master: {
        available: true,
        preview_supported: false,
        stages: {
          normalize: true,
          compress: false,
          limit: true,
          noise_cleanup_light: false,
        },
      },
    },
    transcriptSegments: [{ segment_id: "seg_01", start_sec: 0, end_sec: 10 }],
    captionChunks: [{ chunk_id: "cap_01", start_sec: 0, end_sec: 1, segment_ids: ["seg_01"] }],
  });
  assert.equal(available.export_timeline.audio_layers.some((layer) => layer.kind === "podcast_master_pass"), true);
  assert.equal(available.export_timeline.export_posture, "authoritative");
  assert.equal(partial.export_timeline.export_posture, "degraded");
  const partialLayer = partial.export_timeline.audio_layers.find((layer) => layer.kind === "podcast_master_pass");
  assert.equal(partialLayer?.meta?.skipped_stages?.includes("compress"), true);
  assert.equal(unavailable.export_timeline.export_posture, "unavailable");
  assert.equal(unavailable.operations[0]?.export_posture, "unavailable");
}

async function testApplyLookInstructionFlowsIntoVisualTimeline() {
  const graph = projectEditorialAuthorityGraphFromEditPlan({
    editPlan: {
      edit_plan_id: "plan_render_06",
      version: "1",
      created_at: "2026-03-24T12:50:00.000Z",
      updated_at: "2026-03-24T12:50:00.000Z",
      source_transcript_id: "transcript_render_06",
      preview_mode: "edit-aware",
      instructions: [
        {
          instruction_id: "ins_look_01",
          segment_id: "seg_01",
          type: "apply_look",
          preset: "warm_studio",
          created_at: "2026-03-24T12:50:00.000Z",
        },
      ],
    },
    workspaceId: "ws_render",
    workpieceId: "wp_render",
    sessionId: "session_render",
  });
  const assembly = buildHammerRenderAssembly({
    canonicalGraph: graph,
    runtimeCapabilities: {
      preview_supported_operation_types: ["apply_look"],
      export_supported_operation_types: ["apply_look"],
      handoff_supported_operation_types: ["apply_look"],
    },
    transcriptSegments: [{ segment_id: "seg_01", start_sec: 0, end_sec: 12 }],
    captionChunks: [{ chunk_id: "cap_look_01", start_sec: 0, end_sec: 1, segment_ids: ["seg_01"] }],
  });
  const lookLayer = assembly.export_timeline.visual_layers.find((layer) => layer.kind === "look_treatment");
  assert.equal(assembly.export_timeline.export_posture, "authoritative");
  assert.equal(lookLayer?.meta?.preset, "warm_studio");
  assert.equal(lookLayer?.meta?.preview_mode, "previewable");
}

async function testApplyExposureInstructionFlowsIntoVisualTimeline() {
  const graph = projectEditorialAuthorityGraphFromEditPlan({
    editPlan: {
      edit_plan_id: "plan_render_07",
      version: "1",
      created_at: "2026-03-24T12:55:00.000Z",
      updated_at: "2026-03-24T12:55:00.000Z",
      source_transcript_id: "transcript_render_07",
      preview_mode: "edit-aware",
      instructions: [
        {
          instruction_id: "ins_exposure_01",
          segment_id: "seg_01",
          type: "apply_exposure",
          exposure: 24,
          created_at: "2026-03-24T12:55:00.000Z",
        },
      ],
    },
    workspaceId: "ws_render",
    workpieceId: "wp_render",
    sessionId: "session_render",
  });
  const assembly = buildHammerRenderAssembly({
    canonicalGraph: graph,
    runtimeCapabilities: {
      preview_supported_operation_types: ["apply_exposure"],
      export_supported_operation_types: ["apply_exposure"],
      handoff_supported_operation_types: ["apply_exposure"],
    },
    transcriptSegments: [{ segment_id: "seg_01", start_sec: 0, end_sec: 12 }],
    captionChunks: [{ chunk_id: "cap_exposure_01", start_sec: 0, end_sec: 1, segment_ids: ["seg_01"] }],
  });
  const exposureLayer = assembly.export_timeline.visual_layers.find((layer) => layer.kind === "exposure_adjustment");
  assert.equal(assembly.export_timeline.export_posture, "authoritative");
  assert.equal(exposureLayer?.meta?.exposure, 24);
  assert.equal(exposureLayer?.meta?.preview_mode, "previewable");
}

async function run() {
  await testAssemblyDeterminismAndPosture();
  await testUnresolvedBrollIsNeverTreatedAsBoundMediaTruth();
  await testOrphanedLinkedDuckIsExplicitlyDegraded();
  await testExportTimelineAssemblyIsDeterministicAndComposed();
  await testPodcastMasterPassPostureTracksRuntimeCapability();
  await testApplyLookInstructionFlowsIntoVisualTimeline();
  await testApplyExposureInstructionFlowsIntoVisualTimeline();
  // eslint-disable-next-line no-console
  console.log("Hammer render assembly tests passed.");
}

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Hammer render assembly tests failed:", error);
  process.exit(1);
});
