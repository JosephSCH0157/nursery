import assert from "node:assert/strict";
import { buildHammerReleasePrepPackage } from "../src/lib/hammerReleasePrepPackage";
import {
  HAMMER_QUENCH_RELEASE_PACKET_MANIFEST_PATH,
  HAMMER_QUENCH_RELEASE_PACKET_SRT_PATH,
  HAMMER_QUENCH_RELEASE_PACKET_TRANSCRIPT_PATH,
  HAMMER_QUENCH_RELEASE_PACKET_VISUALS_PATH,
  buildHammerQuenchReleasePacket,
} from "../src/lib/hammerQuenchReleasePacket";
import type { HammerPersistedStructuredTranscript } from "../src/persistence/hammerPersistenceContract";
import { projectEditorialAuthorityGraphFromEditPlan } from "../src/editor/hammerRenderAssembly";
import { buildHammerRenderAssembly } from "../src/editor/hammerRenderAssembly";
import {
  appendAuthorityInstructionToGraph,
  createHearthBrollSuggestionInstruction,
  createInsertBrollInstruction,
  remapResolvedBrollOperationsForRippleDelete,
  createRippleDeleteInstruction,
  updateResolvedInsertBrollOperationInGraph,
} from "../src/editor/hammerAuthorityOps";

const transcript: HammerPersistedStructuredTranscript = {
  schema_version: 1,
  transcript_id: "tx_release_packet",
  media_id: "media_release_packet",
  media_signature: "sig_release_packet",
  source_media_ref: {
    media_id: "media_release_packet",
    kind: "recording_audio",
    local_relpath: "recordings/release.wav",
    cloud_uri: null,
    source_hint: "local",
    mime_type: "audio/wav",
    byte_size: null,
    duration_ms: 18_420,
    sha256: null,
  },
  diarization: {
    labels: ["S1", "S2"],
    raw_labels: ["S1", "S2"],
    low_confidence_turn_ids: [],
  },
  confidence_flags: [],
  segments: [
    {
      segment_id: "seg_001",
      start_sec: 0,
      end_sec: 3.2,
      speaker: "S1",
      text: "Welcome back to the show.",
    },
  ],
  derived_text_layers: {
    schema_version: 1,
    active_layer_id: "macro_run_panel",
    output_layer_id: "macro_run_panel",
    layers: [
      {
        layer_id: "macro_run_panel",
        recipe_ref: "speaker_panel:balanced",
        macro_kind: "speaker_panel",
        status: "active",
        created_at: "2026-03-24T10:00:00.000Z",
        based_on_transcript_id: "tx_release_packet",
        summary: {
          changed_segment_count: 1,
          removal_count: 1,
          untouched_segment_count: 0,
        },
        changes: [
          {
            segment_id: "seg_001",
            original_text: "Welcome back to the show.",
            cleaned_text: "Welcome back to the show.",
            operations: [],
          },
        ],
      },
    ],
  },
  subtitle_outputs: {
    schema_version: 1,
    last_generated_format: "srt",
    srt: {
      format: "srt",
      generated_at: "2026-03-24T10:00:00.000Z",
      source_transcript_id: "tx_release_packet",
      source_layer_id: "macro_run_panel",
      source_kind: "derived",
      source_recipe_ref: "speaker_panel:balanced",
      approximate_timing: false,
      entry_count: 1,
      content: "1\n00:00:00,000 --> 00:00:03,200\nWelcome back to the show.\n",
    },
    vtt: null,
  },
};

async function testBuildQuenchPacketManifest() {
  const prep = buildHammerReleasePrepPackage({
    workspaceId: "ws_demo",
    workpieceId: "wp_demo",
    prepStatus: "prepared",
    alignmentStatus: "aligned",
    structuredTranscript: transcript,
    visualPlacements: {
      schema_version: 1,
      transcript_source_ref: "transcript:tx_release_packet",
      source_refs: ["transcript:tx_release_packet"],
      status: "prepared",
      placement_count: 1,
      uncertainty_flags: [],
      placements: [
        {
          placement_id: "pl_001",
          anchor_segment_id: "seg_001",
          start_sec: 0.5,
          end_sec: 2.7,
          asset_path: "visuals/card-a.png",
          visual_mode: "still",
          status: "matched",
          confidence: 0.9,
          matched_segment_ids: ["seg_001"],
          uncertainty_flags: [],
          timing_source: "transcript_match",
          prompt_basis: "Anchor to opening line.",
          source_type: "hearth_image_map",
          created_at: "2026-03-24T10:00:00.000Z",
          updated_at: "2026-03-24T10:00:00.000Z",
        },
      ],
    },
    audioPolish: null,
    editorSession: {
      schema_version: 1,
      session_id: "session_demo",
      source_mode: "tongs",
      preview_mode: "edit-aware",
      transcript_source_id: "tx_release_packet",
      selected_segment_id: "seg_001",
      selected_overlay_row_id: "seg_001",
      media_ref: transcript.source_media_ref,
      workspace_mapping: null,
      media_source_label: "demo-source",
      last_opened_at: "2026-03-24T10:00:00.000Z",
    },
  });

  const packet = buildHammerQuenchReleasePacket({
    releasePrepPackage: prep,
    preparedAt: "2026-03-24T10:01:00.000Z",
  });

  assert.equal(packet.manifest.packet_kind, "quench_release_packet");
  assert.equal(packet.manifest.generated_by, "Hammer");
  assert.equal(packet.manifest.workpiece_id, "wp_demo");
  assert.equal(packet.manifest.transcript.text_path, HAMMER_QUENCH_RELEASE_PACKET_TRANSCRIPT_PATH);
  assert.equal(packet.manifest.captions.srt_path, HAMMER_QUENCH_RELEASE_PACKET_SRT_PATH);
  assert.equal(packet.manifest.visuals.placements_path, HAMMER_QUENCH_RELEASE_PACKET_VISUALS_PATH);
  assert.equal(packet.manifest.readiness.ready_for_quench, true);
  assert.equal(packet.transcriptText?.includes("Welcome back to the show."), true);
  assert.equal(packet.visuals.length, 1);
}

async function testManifestPathConstant() {
  assert.equal(HAMMER_QUENCH_RELEASE_PACKET_MANIFEST_PATH, "hammer/release-packet/manifest.v1.json");
}

async function testPacketIncludesEditorialTruthExtensionWhenProvided() {
  const prep = buildHammerReleasePrepPackage({
    workspaceId: "ws_demo",
    workpieceId: "wp_demo",
    prepStatus: "prepared",
    alignmentStatus: "aligned",
    structuredTranscript: transcript,
    visualPlacements: null,
    audioPolish: null,
    editorSession: null,
  });
  const canonicalGraph = projectEditorialAuthorityGraphFromEditPlan({
    editPlan: {
      edit_plan_id: "plan_packet_ext_01",
      version: "1",
      created_at: "2026-03-24T10:00:00.000Z",
      updated_at: "2026-03-24T10:00:00.000Z",
      source_transcript_id: "tx_release_packet",
      instructions: [
        {
          instruction_id: "ins_01",
          segment_id: "seg_001",
          type: "delete",
          created_at: "2026-03-24T10:00:00.000Z",
        },
      ],
    },
    workspaceId: "ws_demo",
    workpieceId: "wp_demo",
    sessionId: "session_demo",
  });
  const assembly = buildHammerRenderAssembly({
    canonicalGraph,
    runtimeCapabilities: {
      preview_supported_operation_types: ["delete"],
      export_supported_operation_types: ["delete"],
      handoff_supported_operation_types: ["delete"],
    },
  });
  const packet = buildHammerQuenchReleasePacket({
    releasePrepPackage: prep,
    canonicalGraph,
    renderAssembly: assembly,
    preparedAt: "2026-03-24T10:01:00.000Z",
  });
  assert.equal(packet.manifest.editorial_truth?.authority_graph_id, canonicalGraph.graph_id);
  assert.equal(packet.manifest.editorial_truth?.active_operations.length, 1);
  assert.equal(packet.manifest.editorial_truth?.export_timeline_snapshot.final_duration_ms >= 0, true);
  assert.equal(
    packet.manifest.editorial_truth?.export_timeline_snapshot.export_posture,
    packet.manifest.editorial_truth?.posture_summary.export,
  );
}

async function testPacketDistinguishesUnresolvedVsResolvedBroll() {
  const prep = buildHammerReleasePrepPackage({
    workspaceId: "ws_demo",
    workpieceId: "wp_demo",
    prepStatus: "prepared",
    alignmentStatus: "aligned",
    structuredTranscript: transcript,
    visualPlacements: null,
    audioPolish: null,
    editorSession: null,
  });
  const baseGraph = projectEditorialAuthorityGraphFromEditPlan({
    editPlan: {
      edit_plan_id: "plan_packet_ext_02",
      version: "1",
      created_at: "2026-03-24T10:00:00.000Z",
      updated_at: "2026-03-24T10:00:00.000Z",
      source_transcript_id: "tx_release_packet",
      instructions: [],
    },
    workspaceId: "ws_demo",
    workpieceId: "wp_demo",
    sessionId: "session_demo",
  });
  const graph = appendAuthorityInstructionToGraph({
    graph: baseGraph,
    instruction: createHearthBrollSuggestionInstruction({
      segmentId: "seg_001",
      intentRef: "hearth-suggestion-02",
      intentDescription: "insert cutaway shot",
      startSec: 0.2,
      endSec: 1.8,
    }),
    fallback: {
      graphId: baseGraph.graph_id,
      workspaceId: "ws_demo",
      workpieceId: "wp_demo",
      sessionId: "session_demo",
      sourceTranscriptId: "tx_release_packet",
    },
  });
  const assembly = buildHammerRenderAssembly({
    canonicalGraph: graph,
    runtimeCapabilities: {
      preview_supported_operation_types: ["insert_broll"],
      export_supported_operation_types: ["insert_broll"],
      handoff_supported_operation_types: ["insert_broll"],
    },
  });
  const packet = buildHammerQuenchReleasePacket({
    releasePrepPackage: prep,
    canonicalGraph: graph,
    renderAssembly: assembly,
    preparedAt: "2026-03-24T10:01:00.000Z",
  });
  assert.equal(packet.manifest.editorial_truth?.broll_resolution_summary.unresolved_intents.length, 1);
  assert.equal(packet.manifest.editorial_truth?.broll_resolution_summary.resolved_bindings.length, 0);
  assert.equal(packet.manifest.editorial_truth?.duck_linkage_summary.linked_duck_bindings.length, 0);
}

async function testPacketReflectsResolvedBindingEdits() {
  const prep = buildHammerReleasePrepPackage({
    workspaceId: "ws_demo",
    workpieceId: "wp_demo",
    prepStatus: "prepared",
    alignmentStatus: "aligned",
    structuredTranscript: transcript,
    visualPlacements: null,
    audioPolish: null,
    editorSession: null,
  });
  const baseGraph = projectEditorialAuthorityGraphFromEditPlan({
    editPlan: {
      edit_plan_id: "plan_packet_ext_03",
      version: "1",
      created_at: "2026-03-24T10:00:00.000Z",
      updated_at: "2026-03-24T10:00:00.000Z",
      source_transcript_id: "tx_release_packet",
      instructions: [],
    },
    workspaceId: "ws_demo",
    workpieceId: "wp_demo",
    sessionId: "session_demo",
  });
  const inserted = appendAuthorityInstructionToGraph({
    graph: baseGraph,
    instruction: createInsertBrollInstruction({
      segmentId: "seg_001",
      assetRef: "assets/broll/original.mp4",
      startSec: 0.4,
      endSec: 1.4,
      assetBindingState: "resolved",
    }),
    fallback: {
      graphId: baseGraph.graph_id,
      workspaceId: "ws_demo",
      workpieceId: "wp_demo",
      sessionId: "session_demo",
      sourceTranscriptId: "tx_release_packet",
    },
  });
  const opId = inserted.operations.at(-1)?.operation_id ?? "";
  const edited = updateResolvedInsertBrollOperationInGraph({
    graph: inserted,
    operationId: opId,
    changes: {
      asset_ref: "assets/broll/replaced.mp4",
      start_sec: 0.6,
      end_sec: 1.8,
    },
  }) ?? inserted;
  const assembly = buildHammerRenderAssembly({
    canonicalGraph: edited,
    runtimeCapabilities: {
      preview_supported_operation_types: ["insert_broll"],
      export_supported_operation_types: ["insert_broll"],
      handoff_supported_operation_types: ["insert_broll"],
    },
  });
  const packet = buildHammerQuenchReleasePacket({
    releasePrepPackage: prep,
    canonicalGraph: edited,
    renderAssembly: assembly,
    preparedAt: "2026-03-24T10:01:00.000Z",
  });
  assert.equal(packet.manifest.editorial_truth?.broll_resolution_summary.unresolved_intents.length, 0);
  assert.equal(packet.manifest.editorial_truth?.broll_resolution_summary.resolved_bindings.length, 1);
  assert.equal(packet.manifest.editorial_truth?.broll_resolution_summary.resolved_bindings[0]?.asset_ref, "assets/broll/replaced.mp4");
  assert.equal(packet.manifest.editorial_truth?.broll_timeline_remap_summary.adjusted_bindings.length, 1);
}

async function testPacketReflectsRippleDeleteBrollRemapTruth() {
  const prep = buildHammerReleasePrepPackage({
    workspaceId: "ws_demo",
    workpieceId: "wp_demo",
    prepStatus: "prepared",
    alignmentStatus: "aligned",
    structuredTranscript: transcript,
    visualPlacements: null,
    audioPolish: null,
    editorSession: null,
  });
  const baseGraph = projectEditorialAuthorityGraphFromEditPlan({
    editPlan: {
      edit_plan_id: "plan_packet_ext_04",
      version: "1",
      created_at: "2026-03-24T10:00:00.000Z",
      updated_at: "2026-03-24T10:00:00.000Z",
      source_transcript_id: "tx_release_packet",
      instructions: [],
    },
    workspaceId: "ws_demo",
    workpieceId: "wp_demo",
    sessionId: "session_demo",
  });
  const withSpan = appendAuthorityInstructionToGraph({
    graph: baseGraph,
    instruction: createInsertBrollInstruction({
      segmentId: "seg_001",
      assetRef: "assets/broll/span.mp4",
      startSec: 1,
      endSec: 7,
      assetBindingState: "resolved",
    }),
    fallback: {
      graphId: baseGraph.graph_id,
      workspaceId: "ws_demo",
      workpieceId: "wp_demo",
      sessionId: "session_demo",
      sourceTranscriptId: "tx_release_packet",
    },
  });
  const withInside = appendAuthorityInstructionToGraph({
    graph: withSpan,
    instruction: createInsertBrollInstruction({
      segmentId: "seg_001",
      assetRef: "assets/broll/inside.mp4",
      startSec: 2.2,
      endSec: 3.5,
      assetBindingState: "resolved",
    }),
    fallback: {
      graphId: baseGraph.graph_id,
      workspaceId: "ws_demo",
      workpieceId: "wp_demo",
      sessionId: "session_demo",
      sourceTranscriptId: "tx_release_packet",
    },
  });
  const withRipple = appendAuthorityInstructionToGraph({
    graph: withInside,
    instruction: createRippleDeleteInstruction({
      segmentId: "seg_001",
      startSec: 2,
      endSec: 4,
    }),
    fallback: {
      graphId: baseGraph.graph_id,
      workspaceId: "ws_demo",
      workpieceId: "wp_demo",
      sessionId: "session_demo",
      sourceTranscriptId: "tx_release_packet",
    },
  });
  const rippleOperationId = withRipple.operations.at(-1)?.operation_id ?? "";
  const spanBrollOperationId = withRipple.operations.find((op) => op.instruction.type === "insert_broll" && op.instruction.asset_ref === "assets/broll/span.mp4")?.operation_id ?? "";
  const withLinkedDuck = appendAuthorityInstructionToGraph({
    graph: withRipple,
    instruction: {
      instruction_id: "duck_linked_packet",
      segment_id: "seg_001",
      type: "audio_duck",
      start_sec: 1,
      end_sec: 7,
      duck_gain_db: -9,
      linked_broll_operation_id: spanBrollOperationId,
      created_at: "2026-03-24T10:00:30.000Z",
    },
    fallback: {
      graphId: baseGraph.graph_id,
      workspaceId: "ws_demo",
      workpieceId: "wp_demo",
      sessionId: "session_demo",
      sourceTranscriptId: "tx_release_packet",
    },
  });
  const remapped = remapResolvedBrollOperationsForRippleDelete({
    graph: withLinkedDuck,
    rippleDeleteOperationId: rippleOperationId,
    removedStartSec: 2,
    removedEndSec: 4,
  }).graph;
  const assembly = buildHammerRenderAssembly({
    canonicalGraph: remapped,
    runtimeCapabilities: {
      preview_supported_operation_types: ["insert_broll", "ripple_delete"],
      export_supported_operation_types: ["insert_broll", "ripple_delete"],
      handoff_supported_operation_types: ["insert_broll", "ripple_delete"],
    },
  });
  const packet = buildHammerQuenchReleasePacket({
    releasePrepPackage: prep,
    canonicalGraph: remapped,
    renderAssembly: assembly,
    preparedAt: "2026-03-24T10:01:00.000Z",
  });
  assert.equal(packet.manifest.editorial_truth?.broll_timeline_remap_summary.removed_binding_operation_ids.length, 1);
  assert.equal(packet.manifest.editorial_truth?.broll_timeline_remap_summary.attention_binding_operation_ids.length, 1);
  assert.equal(packet.manifest.editorial_truth?.duck_linkage_summary.linked_duck_bindings.length, 1);
  assert.equal(packet.manifest.editorial_truth?.duck_linkage_summary.orphaned_duck_operation_ids.length, 0);
}

async function run() {
  await testBuildQuenchPacketManifest();
  await testManifestPathConstant();
  await testPacketIncludesEditorialTruthExtensionWhenProvided();
  await testPacketDistinguishesUnresolvedVsResolvedBroll();
  await testPacketReflectsResolvedBindingEdits();
  await testPacketReflectsRippleDeleteBrollRemapTruth();
  // eslint-disable-next-line no-console
  console.log("Hammer Quench release packet tests passed.");
}

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Hammer Quench release packet tests failed:", error);
  process.exit(1);
});
