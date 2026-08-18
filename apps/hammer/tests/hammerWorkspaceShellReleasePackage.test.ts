import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { HammerLaunchContext } from "../../../packages/contracts/hammer/launch-context.contract";
import type { HammerWorkspaceShellReleaseBasisInput, HammerWorkspaceShellReleasePackageInput } from "../src/editor/hammerWorkspaceShellReleasePackage";
import { buildHammerWorkspaceShellReleaseBasis, buildHammerWorkspaceShellReleasePackage } from "../src/editor/hammerWorkspaceShellReleasePackage";
import { buildCaptionBasisFingerprint } from "../src/editor/hammerWorkspaceShellCaptionUtils";

const formatting = {
  style: "sentence" as const,
  maxCharsPerLine: 42,
  maxLinesPerCaption: 2,
  includeSpeakerLabels: false,
  punctuationMode: "preserve" as const,
  readingSpeed: "standard" as const,
};

function buildInput(selectedFormat: "srt" | "vtt" = "srt"): HammerWorkspaceShellReleasePackageInput {
  const mediaRef = {
    media_id: "media-release-01",
    kind: "recording_video" as const,
    source_hint: "local" as const,
    local_relpath: "recordings/oranges.mp4",
    duration_ms: 8000,
  };
  const structuredTranscript = {
    schema_version: 1 as const,
    transcript_id: "transcript-release-01",
    media_id: mediaRef.media_id,
    media_signature: "media-fingerprint-01",
    prepared_at: "2026-08-18T12:00:00.000Z",
    structure: "speaker_turns" as const,
    source_media_ref: { ...mediaRef },
    diarization: {
      label_scheme: "forge-neutral-speakers.v1" as const,
      labels: ["S1"],
      raw_labels: ["host"],
      version: "1",
      provider: "openai" as const,
      provider_request_id: "request-01",
      model: "gpt-4o-transcribe",
    },
    confidence_flags: [],
    segments: [
      { segment_id: "seg-1", start_sec: 0, end_sec: 4, speaker: "S1", text: "Florida oranges are bright." },
      { segment_id: "seg-2", start_sec: 4, end_sec: 8, speaker: "S1", text: "The harvest starts today." },
    ],
    derived_text_layers: { schema_version: 1 as const, active_layer_id: null, output_layer_id: null, layers: [] },
    subtitle_outputs: { schema_version: 1 as const, last_generated_format: null, srt: null, vtt: null },
  };
  const fingerprint = buildCaptionBasisFingerprint({
    transcript: structuredTranscript,
    outputLayerId: null,
    outputRecipeRef: null,
    formatting,
  });
  const captionBuildState = {
    builtAt: "2026-08-18T12:01:00.000Z",
    sourceLayerId: null,
    sourceLabel: "Raw transcript",
    fingerprint,
    chunkCount: 2,
    segmentCount: 2,
    approximateTiming: false,
    chunks: [],
    srt: "1\n00:00:00,000 --> 00:00:04,000\nFlorida oranges are bright.\n",
    vtt: "WEBVTT\n\n00:00.000 --> 00:04.000\nFlorida oranges are bright.\n",
  };
  return {
    workspaceId: "workspace-release-01",
    workpieceId: "workpiece-release-01",
    sessionId: "session-release-01",
    sourceMode: "tongs",
    previewMode: "edit-aware",
    transcriptSourceId: structuredTranscript.transcript_id,
    editPlan: {
      edit_plan_id: "plan-release-01",
      version: "1",
      created_at: "2026-08-18T12:00:00.000Z",
      updated_at: "2026-08-18T12:02:00.000Z",
      source_transcript_id: structuredTranscript.transcript_id,
      preview_mode: "edit-aware",
      workspace_id: "workspace-release-01",
      workpiece_id: "workpiece-release-01",
      session_id: "session-release-01",
      instructions: [
        { instruction_id: "ins-broll", segment_id: "seg-1", type: "insert_broll", asset_ref: "asset:grove", start_sec: 1, end_sec: 3, asset_binding_state: "resolved", created_at: "2026-08-18T12:02:00.000Z" },
        { instruction_id: "ins-transition", segment_id: "seg-1", type: "crossfade", next_segment_id: "seg-2", duration_sec: 0.25, start_sec: 3.75, end_sec: 4, created_at: "2026-08-18T12:02:01.000Z" },
        { instruction_id: "ins-look", segment_id: "seg-1", type: "apply_look", preset: "warm_studio", created_at: "2026-08-18T12:02:02.000Z" },
      ],
    },
    transcriptSegments: structuredTranscript.segments.map((segment) => ({ ...segment })),
    structuredTranscript,
    transcriptPreparedAt: structuredTranscript.prepared_at,
    outputSelection: { layerId: null, sourceRecipeRef: null },
    captionFormatting: formatting,
    selectedCaptionArtifactFormat: selectedFormat,
    captionBuildState,
    captionEditedState: null,
    editorialAuthorityGraph: null,
    canonicalGraphUpdatedAt: "2026-08-18T12:03:00.000Z",
    visualTimeline: null,
    visualPlacements: {
      schema_version: 1,
      status: "prepared",
      source_refs: ["transcript:transcript-release-01", "hearth:visual-map-01"],
      uncertainty_flags: [],
      placements: [{
        placement_id: "placement-01",
        entry_id: "entry-01",
        anchor_segment_id: "seg-1",
        matched_segment_ids: ["seg-1"],
        anchor_text: "Florida oranges",
        asset_ref: "asset:grove",
        asset_id: "asset-grove-01",
        asset_path: "assets/grove.mp4",
        storage_key: "workpieces/workpiece-release-01/assets/grove.mp4",
        label: "Orange grove",
        visual_mode: "broll",
        start_sec: 1,
        end_sec: 3,
        confidence: 0.98,
        timing_source: "transcript_match",
        status: "placed",
        uncertainty_flags: [],
      }],
    },
    audioPolish: {
      schema_version: 1,
      status: "prepared",
      prepared_passes: ["studio_sound", "noise_cleanup", "level_consistency"],
      source_artifact_paths: ["recordings/oranges.mp4"],
      settings_summary: { source_media_kind: "recording_video", source_local_relpath: "recordings/oranges.mp4", supported_source: true },
      analysis: null,
      source_media_id: mediaRef.media_id,
      source_media_signature: "media-fingerprint-01",
      processor_version: "forge-v1.2.0/audio-polish.v4",
      prepared_at: "2026-08-18T12:04:00.000Z",
      output_local_relpath: "hammer/prep/audio-polish/oranges.wav",
      output_workpiece_path: "hammer/prep/audio-polish/oranges.wav",
      output_mime_type: "audio/wav",
      output_duration_ms: 8000,
      failure_code: null,
      failure_reason: null,
      audio_edit: null,
    },
    selectedSegmentId: "seg-1",
    selectedClipId: "placement-01",
    mediaRef,
    workspaceMapping: { workspace_id: "workspace-release-01", local_root_abs: "D:\\ForgeMedia\\workspace-release-01" },
    mediaSourceLabel: "Florida Oranges",
    visualPreview: {
      white_balance: 0.15,
      color_amount: 0.25,
      background_blur: true,
      eye_contact_assist_enabled: false,
      eye_contact_assist_strength: 0.25,
      background_blur_px: 18,
      background_blur_feather_px: 6,
      background_blur_temporal_smoothing: 0.25,
      background_blur_subject_expansion_px: 0,
      background_blur_quality_mode: "medium",
      background_blur_fallback_mode: "disable",
      background_blur_provider: "mediapipe_selfie_segmentation",
      background_replace_enabled: true,
      background_replace_mode: "image",
      background_replace_color: "#2b2b2b",
      background_replace_image_url: null,
      background_replace_image_asset_path: "assets/background.jpg",
      background_replace_image_asset_id: "background-01",
      background_replace_image_asset_type: "image",
      background_wash_enabled: false,
      background_wash_dim_amount: 0.35,
      background_wash_desaturate_amount: 0.25,
    },
    editorLastOpenedAt: "2026-08-18T12:05:00.000Z",
    ffmpegAvailable: true,
  };
}

function buildBasisInput(input: HammerWorkspaceShellReleasePackageInput): HammerWorkspaceShellReleaseBasisInput {
  return {
    launchContext: {
      workspace_id: input.workspaceId,
      workpiece_id: input.workpieceId,
      session_id: input.sessionId,
      source_mode: input.sourceMode,
      preview_mode: input.previewMode,
      media: { kind: "dev-tone", duration_sec: 8, label: "Florida Oranges" },
      edit_plan: structuredClone(input.editPlan),
    } as HammerLaunchContext,
    previewMode: input.previewMode,
    transcriptSourceId: input.transcriptSourceId,
    transcriptSegments: input.transcriptSegments,
    structuredTranscript: input.structuredTranscript,
    outputSelection: input.outputSelection,
    captionFormatting: input.captionFormatting,
    selectedCaptionArtifactFormat: input.selectedCaptionArtifactFormat,
    captionBuildState: input.captionBuildState,
    captionEditedState: input.captionEditedState,
    editorialAuthorityGraph: input.editorialAuthorityGraph,
    visualTimeline: input.visualTimeline,
    visualPlacements: input.visualPlacements,
    audioPolish: input.audioPolish,
    selectedSegmentId: input.selectedSegmentId,
    selectedClipId: input.selectedClipId,
    mediaRef: input.mediaRef,
    workspaceMapping: input.workspaceMapping,
    mediaSourceLabel: input.mediaSourceLabel,
    visualWhiteBalance: input.visualPreview.white_balance,
    visualColorAmount: input.visualPreview.color_amount,
    visualBackgroundBlur: input.visualPreview.background_blur,
    visualEyeContactAssistEnabled: Boolean(input.visualPreview.eye_contact_assist_enabled),
    visualEyeContactAssistStrength: Number(input.visualPreview.eye_contact_assist_strength),
    visualBackgroundBlurPx: Number(input.visualPreview.background_blur_px),
    visualBackgroundBlurFeatherPx: Number(input.visualPreview.background_blur_feather_px),
    visualBackgroundBlurTemporalSmoothing: Number(input.visualPreview.background_blur_temporal_smoothing),
    visualBackgroundBlurSubjectExpansionPx: Number(input.visualPreview.background_blur_subject_expansion_px),
    visualBackgroundBlurQualityMode: input.visualPreview.background_blur_quality_mode,
    visualBackgroundBlurFallbackMode: input.visualPreview.background_blur_fallback_mode,
    visualBackgroundBlurProviderId: input.visualPreview.background_blur_provider ?? null,
    visualBackgroundReplaceEnabled: Boolean(input.visualPreview.background_replace_enabled),
    visualBackgroundReplaceMode: input.visualPreview.background_replace_mode,
    visualBackgroundReplaceColor: String(input.visualPreview.background_replace_color),
    visualBackgroundReplaceImageUrl: String(input.visualPreview.background_replace_image_url ?? ""),
    visualBackgroundReplaceImageAssetPath: input.visualPreview.background_replace_image_asset_path ?? null,
    selectedBackgroundReplacementAssetId: input.visualPreview.background_replace_image_asset_id ?? null,
    visualBackgroundWashEnabled: Boolean(input.visualPreview.background_wash_enabled),
    visualBackgroundWashDimAmount: Number(input.visualPreview.background_wash_dim_amount),
    visualBackgroundWashDesaturateAmount: Number(input.visualPreview.background_wash_desaturate_amount),
    ffmpegAvailable: input.ffmpegAvailable,
  };
}

{
  const legacyInput = buildInput("srt");
  const basisInput = buildBasisInput(legacyInput);
  const before = structuredClone(basisInput);
  const timestamps: string[] = [];
  const basis = buildHammerWorkspaceShellReleaseBasis(basisInput, () => {
    timestamps.push("2026-08-18T12:05:00.000Z");
    return "2026-08-18T12:05:00.000Z";
  });
  const expected = buildHammerWorkspaceShellReleasePackage(legacyInput);
  assert.deepEqual(basis, expected, "basis projection must preserve the exact serialized release package");
  assert.equal(JSON.stringify(basis), JSON.stringify(expected));
  assert.deepEqual(timestamps, ["2026-08-18T12:05:00.000Z"], "timestamp injection must retain capture count and position");
  assert.deepEqual(basisInput, before, "basis projection must not mutate authority inputs");
  assert.deepEqual(buildHammerWorkspaceShellReleaseBasis(structuredClone(basisInput), () => "2026-08-18T12:05:00.000Z"), basis);
  basisInput.transcriptSegments[0]!.text = "later mutation";
  basisInput.visualBackgroundReplaceImageUrl = "later mutation";
  assert.equal(basis.transcriptForRelease.segments[0]?.text, "Florida oranges are bright.");
}

{
  const input = buildInput("srt");
  const before = structuredClone(input);
  const first = buildHammerWorkspaceShellReleasePackage(input);
  const second = buildHammerWorkspaceShellReleasePackage(structuredClone(input));

  assert.deepEqual(input, before, "construction must not mutate captured inputs");
  assert.deepEqual(first, second, "equal inputs must produce equal output");
  assert.equal(JSON.stringify(first.currentReleasePackage.identity), "{\"workspace_id\":\"workspace-release-01\",\"workpiece_id\":\"workpiece-release-01\",\"prep_status\":\"prepared\",\"alignment_status\":\"aligned\",\"source_mode\":\"tongs\",\"preview_mode\":\"edit-aware\",\"editor_session_id\":\"session-release-01\",\"transcript_source_id\":\"transcript-release-01\",\"media_id\":\"media-release-01\"}");
  assert.deepEqual(first.currentReleasePackage.media_prep_outputs.visuals.placements.map((placement) => placement.placement_id), ["placement-01"]);
  assert.deepEqual(first.currentReleasePackage.media_prep_outputs.visuals.source_refs, ["transcript:transcript-release-01", "hearth:visual-map-01"]);
  assert.equal(first.currentReleasePackage.media_prep_outputs.audio.polish.output_mime_type, "audio/wav");
  assert.equal(first.currentReleasePackage.media_prep_outputs.audio.polish.output_local_relpath, "hammer/prep/audio-polish/oranges.wav");
  assert.equal(first.currentReleasePackage.text_outputs?.subtitles.srt.artifact?.content, input.captionBuildState?.srt);
  assert.equal(first.currentReleasePackage.text_outputs?.subtitles.vtt.artifact?.content, input.captionBuildState?.vtt);
  assert.equal(first.transcriptForRelease.subtitle_outputs.last_generated_format, "srt");
  assert.deepEqual(first.renderAssembly.operations.map((operation) => operation.type), ["insert_broll", "crossfade", "apply_look"]);
  assert.deepEqual(first.renderAssembly.export_timeline.transition_layers.map((transition) => transition.kind), ["crossfade"]);
  assert.equal(first.renderAssembly.export_timeline.visual_layers.find((layer) => layer.kind === "broll")?.meta?.asset_ref, "asset:grove");
  assert.equal(first.currentReleasePackage.readiness.fully_prepared, true);

  input.transcriptSegments[0]!.text = "mutated live text";
  input.visualPlacements!.placements[0]!.asset_path = "mutated.mp4";
  input.audioPolish!.output_local_relpath = "mutated.wav";
  assert.equal(first.transcriptForRelease.segments[0]?.text, "Florida oranges are bright.");
  assert.equal(first.currentReleasePackage.media_prep_outputs.visuals.placements[0]?.asset_path, "assets/grove.mp4");
  assert.equal(first.currentReleasePackage.media_prep_outputs.audio.polish.output_local_relpath, "hammer/prep/audio-polish/oranges.wav");
}

{
  const vtt = buildHammerWorkspaceShellReleasePackage(buildInput("vtt"));
  assert.equal(vtt.transcriptForRelease.subtitle_outputs.last_generated_format, "vtt");
  const missingInput = buildInput();
  missingInput.transcriptSegments = [];
  missingInput.structuredTranscript = null;
  missingInput.captionBuildState = null;
  missingInput.visualPlacements = null;
  missingInput.audioPolish = null;
  missingInput.mediaRef = null;
  const missing = buildHammerWorkspaceShellReleasePackage(missingInput);
  assert.equal(missing.currentReleasePackage.identity.prep_status, "idle");
  assert.equal(missing.currentReleasePackage.text_outputs?.resolved_output.segment_count, 0);
  assert.equal(missing.currentReleasePackage.readiness.transcript_output, "missing");
  assert.equal(missing.currentReleasePackage.readiness.visuals, "missing");
  assert.equal(missing.currentReleasePackage.readiness.audio_polish, "missing");
  assert.equal(missing.subtitles.srt, null);
  assert.equal(missing.subtitles.vtt, null);
}

{
  const shellPath = fileURLToPath(new URL("../src/editor/HammerWorkspaceShell.tsx", import.meta.url));
  const modulePath = fileURLToPath(new URL("../src/editor/hammerWorkspaceShellReleasePackage.ts", import.meta.url));
  const shellSource = readFileSync(shellPath, "utf8");
  const moduleSource = readFileSync(modulePath, "utf8");
  assert.equal(shellSource.includes("buildHammerReleasePrepPackage({"), false);
  assert.equal(shellSource.includes("buildHammerRenderAssembly({"), false);
  assert.equal(shellSource.includes("buildHammerWorkspaceShellReleasePackage"), false);
  assert.equal(shellSource.includes("const exportBasis = useMemo"), false);
  assert.equal(shellSource.includes("useHammerWorkspaceShellReleaseBasis({"), true);
  for (const forbidden of ["useState(", "useEffect(", "useRef(", "localStorage", "saveHammer", "fetch(", "onWorkspaceSnapshotChange"] as const) {
    assert.equal(moduleSource.includes(forbidden), false, `release constructor must not contain ${forbidden}`);
  }
}

console.log("Hammer workspace-shell release-package golden tests passed.");
