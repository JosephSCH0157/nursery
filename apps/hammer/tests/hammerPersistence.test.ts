import assert from "node:assert/strict";
import {
  buildHammerLaunchContextFromPersistence,
  buildHammerPersistenceSaveRequest,
  loadHammerPersistenceSnapshot,
  readHammerPersistenceTarget,
} from "../src/persistence/hammerPersistence";
import { projectEditorialAuthorityGraphFromEditPlan } from "../src/editor/hammerRenderAssembly";
import type { HammerWorkspaceSnapshot } from "../src/editor/hammerWorkspaceSnapshot";
import type { HammerPersistenceSnapshot } from "../src/persistence/hammerPersistenceContract";

const target = {
  workspaceId: "11111111-1111-4111-8111-111111111111",
  workpieceId: "22222222-2222-4222-8222-222222222222",
};

const snapshot: HammerWorkspaceSnapshot = {
  workspaceId: target.workspaceId,
  workpieceId: target.workpieceId,
  sessionId: "session_hammer_01",
  sourceMode: "tongs",
  previewMode: "edit-aware",
  editPlanStatus: "dirty",
  editPlanSignature: "sig_abc",
  transcriptSourceId: "transcript_01",
  currentPass: "transcript_cleanup",
  passOrderVersion: 2,
  passStatus: {
    transcript_cleanup: "in_progress",
    retakes: "not_started",
  },
  transcriptSegments: [
    {
      segment_id: "seg_001",
      start_sec: 0,
      end_sec: 4,
      speaker: "S1",
      text: "Line one.",
    },
    {
      segment_id: "seg_002",
      start_sec: 4,
      end_sec: 8,
      speaker: "G1",
      text: "Line two.",
    },
  ],
  selectedSegmentId: "seg_001",
  selectedOverlayRowId: "row_001",
  mediaRef: {
    media_id: "media_01",
    kind: "recording_video",
    source_hint: "local",
    local_relpath: "recordings/episode-1.mp4",
  },
  workspaceMapping: {
    workspace_id: target.workspaceId,
    local_root_abs: "D:\\ForgeMedia\\workspace",
  },
  mediaSourceLabel: "tongs:media_01",
  selectedMacroRecipeRef: "macro:podcast_cleanup.v1",
  lastMacroRunRef: null,
  structuredTranscript: {
    schema_version: 1,
    transcript_id: "transcript_01",
    media_id: "media_01",
    media_signature: "media_sig_01",
    prepared_at: "2026-03-13T10:00:00.000Z",
    structure: "speaker_turns",
    source_media_ref: {
      media_id: "media_01",
      kind: "recording_video",
      source_hint: "local",
      local_relpath: "recordings/episode-1.mp4",
    },
    diarization: {
      label_scheme: "forge-neutral-speakers.v1",
      labels: ["S1", "G1"],
      raw_labels: ["host", "guest"],
      version: "gpt-4o-transcribe",
      provider: "openai",
      provider_request_id: "req_01",
      model: "gpt-4o-transcribe",
    },
    confidence_flags: [],
    segments: [
      {
        segment_id: "seg_001",
        start_sec: 0,
        end_sec: 4,
        speaker: "S1",
        text: "Um line one.",
      },
      {
        segment_id: "seg_002",
        start_sec: 4,
        end_sec: 8,
        speaker: "G1",
        text: "Line two.",
      },
    ],
    derived_text_layers: {
      schema_version: 1,
      active_layer_id: null,
      output_layer_id: "macro_run_01",
      layers: [
        {
          layer_id: "macro_run_01",
          recipe_ref: "macro:podcast_cleanup.v1",
          macro_kind: "filler_cleanup",
          status: "review",
          created_at: "2026-03-13T10:12:00.000Z",
          based_on_transcript_id: "transcript_01",
          summary: {
            changed_segment_count: 1,
            removal_count: 1,
            untouched_segment_count: 1,
          },
          changes: [
            {
              segment_id: "seg_001",
              original_text: "Um line one.",
              cleaned_text: "line one.",
              operations: [
                {
                  kind: "filler_removed",
                  value: "Um",
                  start: 0,
                  end: 3,
                },
              ],
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
        generated_at: "2026-03-13T10:14:00.000Z",
        source_transcript_id: "transcript_01",
        source_layer_id: "macro_run_01",
        source_kind: "derived",
        source_recipe_ref: "macro:podcast_cleanup.v1",
        approximate_timing: false,
        entry_count: 2,
        content: "1\n00:00:00,000 --> 00:00:04,000\nline one.\n\n2\n00:00:04,000 --> 00:00:08,000\nLine two.",
      },
      vtt: null,
    },
  },
  editPlan: {
    edit_plan_id: "plan_01",
    version: "1",
    created_at: "2026-03-13T10:00:00.000Z",
    updated_at: "2026-03-13T10:05:00.000Z",
    source_transcript_id: "transcript_01",
    preview_mode: "edit-aware",
    instructions: [],
  },
  editorialAuthorityGraph: projectEditorialAuthorityGraphFromEditPlan({
    editPlan: {
      edit_plan_id: "plan_01",
      version: "1",
      created_at: "2026-03-13T10:00:00.000Z",
      updated_at: "2026-03-13T10:05:00.000Z",
      source_transcript_id: "transcript_01",
      preview_mode: "edit-aware",
      instructions: [],
    },
    workspaceId: target.workspaceId,
    workpieceId: target.workpieceId,
    sessionId: "session_hammer_01",
    nowIso: "2026-03-13T10:05:00.000Z",
  }),
  visualPlacements: {
    schema_version: 1,
    status: "prepared",
    source_refs: [
      "transcript:transcript_01",
      "script:2026-03-13T10:00:00.000Z",
      "image-map:2026-03-13T10:05:00.000Z",
    ],
    uncertainty_flags: ["match_missing:image-map-02"],
    placements: [
      {
        placement_id: "placement_image-map-01",
        entry_id: "image-map-01",
        anchor_segment_id: "seg_001",
        matched_segment_ids: ["seg_001"],
        anchor_text: "Line one.",
        asset_ref: "asset_01",
        asset_id: "asset_01",
        asset_path: "assets/image-map/candidates/example.png",
        storage_key: "workpieces/example/assets/image-map/candidates/example.png",
        label: "explainer",
        visual_mode: "comparison",
        start_sec: 0,
        end_sec: 4,
        confidence: 0.91,
        timing_source: "transcript_match",
        status: "placed",
        uncertainty_flags: [],
      },
    ],
  },
  audioPolish: {
    schema_version: 1,
    status: "prepared",
    prepared_passes: ["studio_sound", "level_consistency"],
    source_artifact_paths: ["recordings/episode-1.wav"],
    settings_summary: {
      supported_source: true,
      source_extension: ".wav",
    },
    analysis: {
      schema_version: 1,
      source_ref: "workpiece:recordings/episode-1.wav",
      analyzed_at: "2026-03-25T12:00:00.000Z",
      loudness: {
        integrated_lufs: -18.2,
        loudness_range_lu: 3.1,
        true_peak_dbtp: -1.4,
        rms_dbfs: -20.5,
      },
      segmentation: {
        strategy: "ffmpeg_silencedetect_v1",
        noise_floor_db: -35,
        min_silence_sec: 0.25,
        regions: [
          {
            id: "speech_1",
            start_sec: 0,
            end_sec: 8,
            kind: "speech",
            confidence: 0.99,
          },
        ],
        speech_region_count: 1,
        silence_region_count: 0,
      },
      transcript_prep: {
        strategy: "fixed_chunk_with_silence_bias_v1",
        target_chunk_sec: 60,
        max_chunk_sec: 90,
        chunks: [
          {
            id: "chunk_1",
            start_sec: 0,
            end_sec: 8,
            duration_sec: 8,
            source: "short_file",
          },
        ],
      },
      channel_characterization: {
        channel_count: 1,
        silent_channel: null,
        dual_mono: false,
        phase_correlation: 1,
        phase_concern: false,
      },
      waveform_proxy: {
        version: "v1",
        duration_sec: 8,
        bucket_count: 4,
        bucket_duration_sec: 2,
        channel_mode: "mono_mixdown",
        peaks: [0.1, 0.45, 0.35, 0.7],
      },
    },
    audio_edit: {
      version: "v1",
      operations: [
        {
          id: "cut_01",
          type: "cut",
          start_sec: 1.25,
          end_sec: 2.5,
        },
        {
          id: "cut_02",
          type: "cut",
          start_sec: 6,
          end_sec: 7,
        },
      ],
    },
    source_media_id: "media_01",
    source_media_signature: "media_sig_01",
    processor_version: "forge-v1.2.0/audio-polish.v4",
    prepared_at: "2026-03-13T10:10:05.000Z",
    output_local_relpath: "hammer/prep/audio-polish/episode-1--abcd1234.wav",
    output_mime_type: "audio/wav",
    output_duration_ms: 8_000,
    failure_code: null,
    failure_reason: null,
  },
};

const saveRequest = buildHammerPersistenceSaveRequest(snapshot);
assert.equal(saveRequest.active_session_id, "session_hammer_01");
assert.equal(saveRequest.edit_plan_signature, "sig_abc");
assert.equal(saveRequest.current_pass, "transcript_cleanup");
assert.equal(saveRequest.pass_order_version, 2);
assert.equal(saveRequest.pass_status?.transcript_cleanup, "in_progress");
assert.equal(saveRequest.macro_recipe_ref, "macro:podcast_cleanup.v1");
assert.equal(saveRequest.last_macro_run_ref, null);
assert.equal(saveRequest.structured_transcript?.data.derived_text_layers?.layers[0]?.layer_id, "macro_run_01");
assert.equal(saveRequest.structured_transcript?.data.derived_text_layers?.output_layer_id, "macro_run_01");
assert.equal(saveRequest.structured_transcript?.data.subtitle_outputs?.last_generated_format, "srt");
assert.equal(saveRequest.structured_transcript?.data.subtitle_outputs?.srt?.source_layer_id, "macro_run_01");
assert.deepEqual(
  saveRequest.speaker_map?.data.default_labels,
  ["S1", "S2", "S3", "G1", "G2"],
);
assert.deepEqual(
  saveRequest.speaker_map?.data.mappings.map((entry) => entry.speaker_label),
  ["S1", "G1"],
);
assert.deepEqual(
  saveRequest.audio_polish?.data.prepared_passes,
  ["studio_sound", "level_consistency"],
);
assert.equal(
  saveRequest.audio_polish?.data.output_local_relpath,
  "hammer/prep/audio-polish/episode-1--abcd1234.wav",
);
assert.equal(
  saveRequest.audio_polish?.data.analysis?.loudness.integrated_lufs,
  -18.2,
);
assert.equal(
  saveRequest.audio_polish?.data.analysis?.transcript_prep.chunks[0]?.source,
  "short_file",
);
assert.equal(
  saveRequest.audio_polish?.data.analysis?.waveform_proxy?.version,
  "v1",
);
assert.equal(
  saveRequest.audio_polish?.data.analysis?.waveform_proxy?.peaks.length,
  saveRequest.audio_polish?.data.analysis?.waveform_proxy?.bucket_count,
);
assert.notEqual(saveRequest.audio_polish?.data.audio_edit, snapshot.audioPolish?.audio_edit);
assert.notEqual(
  saveRequest.audio_polish?.data.audio_edit?.operations,
  snapshot.audioPolish?.audio_edit?.operations,
);
assert.deepEqual(
  saveRequest.audio_polish?.data.audio_edit,
  snapshot.audioPolish?.audio_edit,
);
assert.equal(saveRequest.visual_placements?.data.placements[0]?.asset_ref, "asset_01");
assert.deepEqual(
  saveRequest.visual_placements?.data.uncertainty_flags,
  ["match_missing:image-map-02"],
);
assert.equal(saveRequest.editorial_authority?.data.graph_id, "plan_01:authority");

const persistedSnapshot: HammerPersistenceSnapshot = {
  schema_version: 1,
  state: {
    workspace_id: target.workspaceId,
    workpiece_id: target.workpieceId,
    active_session_id: "session_hammer_01",
    current_pass: "transcript_cleanup",
    pass_order_version: 2,
    pass_status: {
      transcript_cleanup: "in_progress",
      retakes: "not_started",
    },
    editor_session_path: "hammer/session/editor-state.v1.json",
    transcript_artifact_path: "hammer/transcript/structured.v1.json",
    speaker_map_artifact_path: "hammer/transcript/speaker-map.v1.json",
    visual_placement_artifact_path: "hammer/prep/visual-placements.v1.json",
    audio_polish_artifact_path: "hammer/prep/audio-polish.v1.json",
    edit_plan_artifact_path: "hammer/edit-plan/current.v1.json",
    editorial_authority_artifact_path: "hammer/session/editorial-authority.v1.json",
    edit_plan_signature: "sig_abc",
    prep_status: "prepared",
    alignment_status: "aligned",
    macro_recipe_ref: "macro:podcast_cleanup.v1",
    last_macro_run_ref: null,
    last_opened_at: "2026-03-13T10:10:00.000Z",
    updated_at: "2026-03-13T10:10:05.000Z",
    updated_by: "33333333-3333-4333-8333-333333333333",
  },
  editor_session: {
    path: "hammer/session/editor-state.v1.json",
    updated_at: "2026-03-13T10:10:01.000Z",
    data: saveRequest.editor_session?.data ?? null,
  },
  structured_transcript: {
    path: "hammer/transcript/structured.v1.json",
    updated_at: "2026-03-13T10:10:02.000Z",
    data: saveRequest.structured_transcript?.data ?? null,
  },
  speaker_map: {
    path: "hammer/transcript/speaker-map.v1.json",
    updated_at: "2026-03-13T10:10:03.000Z",
    data: saveRequest.speaker_map?.data ?? null,
  },
  visual_placements: {
    path: "hammer/prep/visual-placements.v1.json",
    updated_at: "2026-03-13T10:10:04.000Z",
    data: saveRequest.visual_placements?.data ?? null,
  },
  audio_polish: {
    path: "hammer/prep/audio-polish.v1.json",
    updated_at: "2026-03-13T10:10:05.000Z",
    data: saveRequest.audio_polish?.data ?? null,
  },
  edit_plan: {
    path: "hammer/edit-plan/current.v1.json",
    updated_at: "2026-03-13T10:10:06.000Z",
    data: saveRequest.edit_plan?.data ?? null,
  },
  editorial_authority: {
    path: "hammer/session/editorial-authority.v1.json",
    updated_at: "2026-03-13T10:10:06.500Z",
    data: saveRequest.editorial_authority?.data ?? null,
  },
  macro_hooks: {
    recipe_ref: "macro:podcast_cleanup.v1",
    last_run_ref: null,
  },
};

const hydrated = buildHammerLaunchContextFromPersistence(target, persistedSnapshot);
assert.ok(hydrated);
assert.equal(hydrated?.source, "persistence");
assert.equal(hydrated?.launchContext.session_id, "session_hammer_01");
assert.equal(hydrated?.launchContext.transcript.kind, "tongs-stub");
assert.equal(hydrated?.launchContext.media.kind, "tongs-stub");
assert.equal(hydrated?.launchContext.edit_plan?.edit_plan_id, "plan_01");
assert.equal(hydrated?.launchContext.edit_plan?.instructions.length, 0);
assert.equal(
  persistedSnapshot.audio_polish.data?.analysis?.segmentation.regions[0]?.kind,
  "speech",
);
assert.deepEqual(
  persistedSnapshot.audio_polish.data?.analysis?.waveform_proxy?.peaks,
  [0.1, 0.45, 0.35, 0.7],
);
assert.deepEqual(
  persistedSnapshot.audio_polish.data?.audio_edit?.operations,
  [
    {
      id: "cut_01",
      type: "cut",
      start_sec: 1.25,
      end_sec: 2.5,
    },
    {
      id: "cut_02",
      type: "cut",
      start_sec: 6,
      end_sec: 7,
    },
  ],
);

const legacyOnlySnapshot: HammerPersistenceSnapshot = {
  ...persistedSnapshot,
  edit_plan: { ...persistedSnapshot.edit_plan, data: snapshot.editPlan },
  editorial_authority: { path: null, updated_at: null, data: null },
};
const hydratedLegacyOnly = buildHammerLaunchContextFromPersistence(target, legacyOnlySnapshot);
assert.equal(hydratedLegacyOnly?.launchContext.edit_plan?.edit_plan_id, "plan_01");

const canonicalOnlySnapshot: HammerPersistenceSnapshot = {
  ...persistedSnapshot,
  edit_plan: { path: null, updated_at: null, data: null },
  editorial_authority: {
    path: "hammer/session/editorial-authority.v1.json",
    updated_at: "2026-03-13T10:10:06.500Z",
    data: saveRequest.editorial_authority?.data ?? null,
  },
};
const hydratedCanonicalOnly = buildHammerLaunchContextFromPersistence(target, canonicalOnlySnapshot);
assert.equal(hydratedCanonicalOnly?.launchContext.edit_plan?.source_transcript_id, "transcript_01");

assert.deepEqual(
  readHammerPersistenceTarget("?workspace_id=aaa&workpiece_id=bbb"),
  { workspaceId: "aaa", workpieceId: "bbb" },
);

const originalFetch = globalThis.fetch;
const originalWindow = (globalThis as typeof globalThis & { window?: unknown }).window;
const toApiArtifact = <T,>(artifact: { path: string | null; updated_at: string | null; data: T | null }) => ({
  path: artifact.path,
  file_updated_at: artifact.updated_at,
  data: artifact.data,
});

try {
  (globalThis as typeof globalThis & { window?: unknown }).window = {
    location: { search: "" },
    localStorage: {
      getItem: () => "hammer_user_token",
      key: () => null,
      length: 0,
    },
  };

  globalThis.fetch = async (): Promise<Response> => new Response(JSON.stringify({
    ok: true,
    data: {
      snapshot: {
        schema_version: 1,
        state: persistedSnapshot.state,
        editor_session: toApiArtifact(persistedSnapshot.editor_session),
        structured_transcript: toApiArtifact(persistedSnapshot.structured_transcript),
        speaker_map: toApiArtifact(persistedSnapshot.speaker_map),
        visual_placements: toApiArtifact(persistedSnapshot.visual_placements),
        audio_polish: {
          path: persistedSnapshot.audio_polish.path,
          file_updated_at: persistedSnapshot.audio_polish.updated_at,
          data: {
            ...persistedSnapshot.audio_polish.data,
            audio_edit: {
              version: "v1",
              operations: [
                {
                  id: "cut_invalid",
                  type: "cut",
                  start_sec: 5,
                  end_sec: 5,
                },
              ],
            },
          },
        },
        edit_plan: toApiArtifact(persistedSnapshot.edit_plan),
        editorial_authority: toApiArtifact(persistedSnapshot.editorial_authority),
        macro_hooks: persistedSnapshot.macro_hooks,
      },
    },
  }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

  const invalidEditResult = await loadHammerPersistenceSnapshot(target);
  assert.equal(invalidEditResult.ok, true);
  assert.equal(invalidEditResult.ok && invalidEditResult.data.audio_polish.data?.audio_edit, null);

  globalThis.fetch = async (): Promise<Response> => new Response(JSON.stringify({
    ok: true,
    data: {
      snapshot: {
        schema_version: 1,
        state: persistedSnapshot.state,
        editor_session: toApiArtifact(persistedSnapshot.editor_session),
        structured_transcript: toApiArtifact(persistedSnapshot.structured_transcript),
        speaker_map: toApiArtifact(persistedSnapshot.speaker_map),
        visual_placements: toApiArtifact(persistedSnapshot.visual_placements),
        audio_polish: {
          path: persistedSnapshot.audio_polish.path,
          file_updated_at: persistedSnapshot.audio_polish.updated_at,
          data: {
            ...persistedSnapshot.audio_polish.data,
            audio_edit: undefined,
          },
        },
        edit_plan: toApiArtifact(persistedSnapshot.edit_plan),
        editorial_authority: toApiArtifact(persistedSnapshot.editorial_authority),
        macro_hooks: persistedSnapshot.macro_hooks,
      },
    },
  }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

  const legacyEditResult = await loadHammerPersistenceSnapshot(target);
  assert.equal(legacyEditResult.ok, true);
  assert.equal(legacyEditResult.ok && legacyEditResult.data.audio_polish.data?.audio_edit, null);
} finally {
  globalThis.fetch = originalFetch;
  if (originalWindow === undefined) {
    delete (globalThis as typeof globalThis & { window?: unknown }).window;
  } else {
    (globalThis as typeof globalThis & { window?: unknown }).window = originalWindow;
  }
}



