import type { HammerEditPlan } from "../../../../packages/contracts/hammer/edit-plan.contract";
import type { HammerLaunchContext } from "../../../../packages/contracts/hammer/launch-context.contract";
import type { HammerTranscriptSegment } from "../../../../packages/contracts/hammer/transcript.contract";
import { normalizeHammerAudioEdit } from "../../../../packages/tongs/src/hammer-audio-edit-contract";
import { normalizeHammerOrchestrationState } from "../../../../packages/tongs/src/hammer-orchestration-contract";
import {
  cloneHammerEditorialAuthorityGraph,
  type HammerEditorialAuthorityGraph,
} from "../../../../packages/contracts/hammer/editorial-authority.contract";
import { tongsFetch } from "../lib/tongsFetch";
import { cloneHammerStructuredTranscript } from "../macros/hammerDerivedTranscriptLayers";
import {
  cloneVisualPlacements,
  normalizeHammerVisualPlacementsState,
} from "../lib/hammerVisualPlacements";
import { buildHammerVisualTimelineSaveRequest } from "../visuals/persistence/hammerVisualTimelinePersistence";
import { deriveLegacyVisualPlacementsFromTimeline } from "../visuals/persistence/hammerVisualTimelineLegacyAdapter";
import type { HammerWorkspaceSnapshot } from "../editor/hammerWorkspaceSnapshot";
import {
  projectEditPlanFromEditorialAuthorityGraph,
  projectEditorialAuthorityGraphFromEditPlan,
} from "../editor/hammerRenderAssembly";
import {
  DEFAULT_FORGE_NEUTRAL_SPEAKER_LABELS,
  HAMMER_RUNTIME_WRITTEN_BY,
  preserveTranscriptMetadata,
} from "../prep/hammerPrep";
import {
  buildNotStartedHammerAudioPolish,
  cloneHammerAudioPolish,
} from "../prep/hammerAudioPolish";
import type {
  HammerHydratedLaunchContext,
  HammerPersistenceSaveRequest,
  HammerPersistenceSnapshot,
  HammerPersistenceTarget,
  HammerPersistedAudioPolish,
  HammerPersistedEditorSession,
  HammerPersistedStateRecord,
  HammerPersistedSpeakerMap,
  HammerPersistedStructuredTranscript,
  HammerPersistedVisualPreviewSettings,
  HammerPersistedVisualPlacements,
  HammerPresenceRequest,
  HammerPresenceRow,
} from "./hammerPersistenceContract";

type PersistenceResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; error: string };

const HAMMER_PERSISTENCE_LOAD_TIMEOUT_MS = 30_000;
const HAMMER_PERSISTENCE_SAVE_TIMEOUT_MS = 45_000;
const HAMMER_PRESENCE_TIMEOUT_MS = 15_000;

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function readJsonObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function buildDefaultVisualPreviewSettings(): HammerPersistedVisualPreviewSettings {
  return {
    white_balance: 0,
    color_amount: 0,
    background_blur: false,
    eye_contact_assist_enabled: false,
    eye_contact_assist_strength: 0.25,
    background_blur_px: 14,
    background_blur_feather_px: 6,
    background_blur_temporal_smoothing: 0.25,
    background_blur_subject_expansion_px: 0,
    background_blur_quality_mode: "medium",
    background_blur_fallback_mode: "disable",
    background_blur_provider: "mediapipe_selfie_segmentation",
    background_replace_enabled: false,
    background_replace_mode: "solid",
    background_replace_color: "#2b2b2b",
    background_replace_image_url: null,
    background_wash_enabled: false,
    background_wash_dim_amount: 0.35,
    background_wash_desaturate_amount: 0.25,
  };
}

function normalizeVisualPreviewSettings(
  value: unknown,
): HammerPersistedVisualPreviewSettings {
  const row = readJsonObject(value);
  const defaults = buildDefaultVisualPreviewSettings();
  const whiteBalance = readNumber(row?.white_balance);
  const colorAmount = readNumber(row?.color_amount);
  const eyeContactEnabled = typeof row?.eye_contact_assist_enabled === "boolean"
    ? row.eye_contact_assist_enabled
    : defaults.eye_contact_assist_enabled!;
  const eyeContactStrength = readNumber(row?.eye_contact_assist_strength) ?? defaults.eye_contact_assist_strength!;
  const blurEnabled = typeof row?.background_blur === "boolean"
    ? row.background_blur
    : typeof row?.background_blur === "object" && row.background_blur != null
    ? true
    : defaults.background_blur;
  const blurPx = readNumber(row?.background_blur_px) ?? readNumber(readJsonObject(row?.background_blur)?.blur_px) ?? defaults.background_blur_px!;
  const featherPx = readNumber(row?.background_blur_feather_px) ?? readNumber(readJsonObject(row?.background_blur)?.edge_feather_px) ?? defaults.background_blur_feather_px!;
  const temporal = readNumber(row?.background_blur_temporal_smoothing) ?? readNumber(readJsonObject(row?.background_blur)?.temporal_smoothing) ?? defaults.background_blur_temporal_smoothing!;
  const expansion = readNumber(row?.background_blur_subject_expansion_px) ?? readNumber(readJsonObject(row?.background_blur)?.subject_expansion_px) ?? defaults.background_blur_subject_expansion_px!;
  const quality = readString(row?.background_blur_quality_mode)
    ?? readString(readJsonObject(row?.background_blur)?.quality_mode)
    ?? defaults.background_blur_quality_mode!;
  const fallback = readString(row?.background_blur_fallback_mode)
    ?? readString(readJsonObject(row?.background_blur)?.fallback_mode)
    ?? defaults.background_blur_fallback_mode!;
  const provider = readString(row?.background_blur_provider)
    ?? readString(readJsonObject(row?.background_blur)?.provider)
    ?? defaults.background_blur_provider!;
  const replaceEnabled = typeof row?.background_replace_enabled === "boolean" ? row.background_replace_enabled : defaults.background_replace_enabled!;
  const replaceMode = readString(row?.background_replace_mode) ?? defaults.background_replace_mode!;
  const replaceColor = readString(row?.background_replace_color) ?? defaults.background_replace_color!;
  const replaceImageUrl = readString(row?.background_replace_image_url) ?? defaults.background_replace_image_url!;
  const washEnabled = typeof row?.background_wash_enabled === "boolean" ? row.background_wash_enabled : defaults.background_wash_enabled!;
  const washDim = readNumber(row?.background_wash_dim_amount) ?? defaults.background_wash_dim_amount!;
  const washDesat = readNumber(row?.background_wash_desaturate_amount) ?? defaults.background_wash_desaturate_amount!;
  return {
    white_balance: whiteBalance == null ? defaults.white_balance : clamp(Math.round(whiteBalance), -100, 100),
    color_amount: colorAmount == null ? defaults.color_amount : clamp(Math.round(colorAmount), -100, 100),
    background_blur: blurEnabled,
    eye_contact_assist_enabled: Boolean(eyeContactEnabled),
    eye_contact_assist_strength: clamp(eyeContactStrength, 0, 1),
    background_blur_px: clamp(blurPx, 0, 64),
    background_blur_feather_px: clamp(featherPx, 0, 64),
    background_blur_temporal_smoothing: clamp(temporal, 0, 1),
    background_blur_subject_expansion_px: clamp(expansion, 0, 48),
    background_blur_quality_mode: (quality === "low" || quality === "high") ? quality : "medium",
    background_blur_fallback_mode: fallback === "passthrough" ? "passthrough" : "disable",
    background_blur_provider: provider,
    background_replace_enabled: replaceEnabled,
    background_replace_mode: replaceMode === "image" ? "image" : replaceMode === "checkerboard" ? "checkerboard" : "solid",
    background_replace_color: replaceColor,
    background_replace_image_url: replaceImageUrl,
    background_wash_enabled: washEnabled,
    background_wash_dim_amount: clamp(washDim, 0, 1),
    background_wash_desaturate_amount: clamp(washDesat, 0, 1),
  };
}

function cloneTranscriptSegments(segments: HammerTranscriptSegment[]): HammerTranscriptSegment[] {
  return segments.map((segment) => ({ ...segment }));
}

function cloneEditPlan(plan: HammerEditPlan): HammerEditPlan {
  return {
    ...plan,
    instructions: plan.instructions.map((instruction) => ({ ...instruction })),
  };
}

function cloneEditorialAuthorityGraph(
  graph: HammerEditorialAuthorityGraph,
): HammerEditorialAuthorityGraph {
  return cloneHammerEditorialAuthorityGraph(graph);
}

function cloneLaunchContext(context: HammerLaunchContext): HammerLaunchContext {
  return {
    ...context,
    transcript: context.transcript.kind === "tongs-stub"
      ? {
        ...context.transcript,
        segments: cloneTranscriptSegments(context.transcript.segments),
      }
      : { ...context.transcript },
    media: context.media.kind === "mapped-local"
      ? {
        ...context.media,
        ref: { ...context.media.ref },
      }
      : context.media.kind === "tongs-stub"
      ? {
        ...context.media,
        ref: { ...context.media.ref },
        workspace_mapping: context.media.workspace_mapping
          ? { ...context.media.workspace_mapping }
          : undefined,
      }
      : { ...context.media },
    edit_plan: context.edit_plan ? cloneEditPlan(context.edit_plan) : undefined,
  };
}

function uniqueSpeakerLabels(segments: HammerTranscriptSegment[]): string[] {
  const labels: string[] = [];
  const seen = new Set<string>();
  for (const segment of segments) {
    const label = segment.speaker.trim();
    if (!label || seen.has(label)) continue;
    seen.add(label);
    labels.push(label);
  }
  return labels;
}

function toStructuredTranscript(
  snapshot: HammerWorkspaceSnapshot,
  existingStructuredTranscript?: HammerPersistedStructuredTranscript | null,
): HammerPersistedStructuredTranscript {
  const persistedStructuredTranscript = cloneHammerStructuredTranscript(snapshot.structuredTranscript);
  if (persistedStructuredTranscript) {
    return persistedStructuredTranscript;
  }

  return preserveTranscriptMetadata(
    snapshot.transcriptSegments,
    existingStructuredTranscript,
    snapshot.mediaRef,
    snapshot.transcriptSourceId,
  );
}

function toSpeakerMap(snapshot: HammerWorkspaceSnapshot): HammerPersistedSpeakerMap {
  const labels = uniqueSpeakerLabels(snapshot.transcriptSegments);
  return {
    schema_version: 1,
    default_labels: [...DEFAULT_FORGE_NEUTRAL_SPEAKER_LABELS],
    mappings: labels.map((speakerLabel) => ({
      speaker_label: speakerLabel,
      display_name: null,
      source: "default" as const,
    })),
  };
}

function toVisualPlacements(snapshot: HammerWorkspaceSnapshot): HammerPersistedVisualPlacements {
  if (snapshot.visualTimeline) {
    const derived = deriveLegacyVisualPlacementsFromTimeline(snapshot.visualTimeline);
    if (derived) {
      return derived;
    }
  }
  const existingPlacements = cloneVisualPlacements(snapshot.visualPlacements);
  if (existingPlacements) {
    return existingPlacements;
  }

  return {
    schema_version: 1,
    status: snapshot.transcriptSegments.length > 0 ? "prepared" : "not_started",
    source_refs: [snapshot.transcriptSourceId],
    uncertainty_flags: [],
    placements: [],
  };
}

function toAudioPolish(
  snapshot: HammerWorkspaceSnapshot,
  existingAudioPolish?: HammerPersistedAudioPolish | null,
): HammerPersistedAudioPolish {
  return cloneHammerAudioPolish(snapshot.audioPolish)
    ?? cloneHammerAudioPolish(existingAudioPolish)
    ?? buildNotStartedHammerAudioPolish();
}

function toEditorSession(
  snapshot: HammerWorkspaceSnapshot,
  lastOpenedAt: string,
): HammerPersistedEditorSession {
  const selectedOverlayRowId = snapshot.visualTimeline?.selected_clip_id ?? snapshot.selectedOverlayRowId;
  return {
    schema_version: 1,
    session_id: snapshot.sessionId,
    source_mode: snapshot.sourceMode,
    preview_mode: snapshot.previewMode,
    transcript_source_id: snapshot.transcriptSourceId,
    selected_segment_id: snapshot.selectedSegmentId,
    selected_overlay_row_id: selectedOverlayRowId,
    media_ref: snapshot.mediaRef ? { ...snapshot.mediaRef } : null,
    workspace_mapping: snapshot.workspaceMapping ? { ...snapshot.workspaceMapping } : null,
    media_source_label: snapshot.mediaSourceLabel,
    visual_preview: normalizeVisualPreviewSettings(snapshot.visualPreviewSettings),
    last_opened_at: lastOpenedAt,
  };
}

export function readHammerPersistenceTarget(
  routeSearch: string,
  launchContext?: HammerLaunchContext,
): HammerPersistenceTarget | null {
  const fromLaunchWorkspaceId = launchContext?.workspace_id?.trim();
  const fromLaunchWorkpieceId = launchContext?.workpiece_id?.trim();
  if (fromLaunchWorkspaceId && fromLaunchWorkpieceId) {
    return {
      workspaceId: fromLaunchWorkspaceId,
      workpieceId: fromLaunchWorkpieceId,
    };
  }

  const params = new URLSearchParams(routeSearch);
  const workspaceId = readString(
    params.get("workspace_id") ?? params.get("workspaceId") ?? params.get("workspace"),
  );
  const workpieceId = readString(
    params.get("workpiece_id") ?? params.get("workpieceId"),
  );

  if (!workspaceId || !workpieceId) return null;
  return { workspaceId, workpieceId };
}

export function buildHammerPersistenceSaveRequest(
  snapshot: HammerWorkspaceSnapshot,
  existingStructuredTranscript?: HammerPersistedStructuredTranscript | null,
  existingAudioPolish?: HammerPersistedAudioPolish | null,
  lastOpenedAt = new Date().toISOString(),
): HammerPersistenceSaveRequest {
  const canonicalGraph = snapshot.editorialAuthorityGraph
    ? cloneEditorialAuthorityGraph(snapshot.editorialAuthorityGraph)
    : projectEditorialAuthorityGraphFromEditPlan({
      editPlan: snapshot.editPlan,
      workspaceId: snapshot.workspaceId,
      workpieceId: snapshot.workpieceId,
      sessionId: snapshot.sessionId,
    });
  const compatibilityEditPlan = projectEditPlanFromEditorialAuthorityGraph({
    graph: canonicalGraph,
    fallback: cloneEditPlan(snapshot.editPlan),
  });
  const canonicalOrchestration = normalizeHammerOrchestrationState({
    prep_status: snapshot.transcriptSegments.length > 0 ? "prepared" : "idle",
    alignment_status: snapshot.transcriptSegments.length > 0 ? "aligned" : "not_started",
    current_pass: snapshot.currentPass,
    pass_order_version: snapshot.passOrderVersion,
    pass_status: snapshot.passStatus,
    edit_plan_signature: snapshot.editPlanSignature,
    macro_recipe_ref: snapshot.selectedMacroRecipeRef,
    last_macro_run_ref: snapshot.lastMacroRunRef,
  });

  return {
    written_by: { ...HAMMER_RUNTIME_WRITTEN_BY },
    active_session_id: snapshot.sessionId,
    prep_status: canonicalOrchestration.prep_status,
    alignment_status: canonicalOrchestration.alignment_status,
    current_pass: canonicalOrchestration.current_pass,
    pass_order_version: canonicalOrchestration.pass_order_version,
    pass_status: canonicalOrchestration.pass_status,
    last_opened_at: lastOpenedAt,
    edit_plan_signature: canonicalOrchestration.edit_plan_signature,
    macro_recipe_ref: canonicalOrchestration.macro_recipe_ref,
    last_macro_run_ref: canonicalOrchestration.last_macro_run_ref,
    editor_session: {
      data: toEditorSession(snapshot, lastOpenedAt),
    },
    structured_transcript: {
      data: toStructuredTranscript(snapshot, existingStructuredTranscript),
    },
    speaker_map: {
      data: toSpeakerMap(snapshot),
    },
    visual_placements: {
      data: toVisualPlacements(snapshot),
    },
    ...(snapshot.visualTimeline
      ? buildHammerVisualTimelineSaveRequest({
        timeline: snapshot.visualTimeline,
        active_session_id: snapshot.sessionId,
        last_opened_at: lastOpenedAt,
      })
      : {}),
    audio_polish: {
      data: toAudioPolish(snapshot, existingAudioPolish),
    },
    edit_plan: {
      data: compatibilityEditPlan,
    },
    editorial_authority: {
      data: canonicalGraph,
    },
  };
}

export function buildHammerLaunchContextFromPersistence(
  target: HammerPersistenceTarget,
  snapshot: HammerPersistenceSnapshot,
  fallbackLaunchContext?: HammerLaunchContext,
): HammerHydratedLaunchContext | null {
  const editorSession = snapshot.editor_session.data;
  const transcript = snapshot.structured_transcript.data;
  const canonicalGraph = snapshot.editorial_authority.data;
  const projectedEditPlan = canonicalGraph
    ? projectEditPlanFromEditorialAuthorityGraph({
      graph: canonicalGraph,
      fallback: snapshot.edit_plan.data ?? fallbackLaunchContext?.edit_plan ?? {
        edit_plan_id: `${target.workpieceId}:legacy-fallback-plan`,
        version: "1",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        source_transcript_id: transcript?.transcript_id ?? "unknown-transcript",
        instructions: [],
        preview_mode: editorSession?.preview_mode ?? "edit-aware",
        workspace_id: target.workspaceId,
        workpiece_id: target.workpieceId,
        session_id: editorSession?.session_id ?? undefined,
      },
    })
    : snapshot.edit_plan.data;
  const editPlan = projectedEditPlan;
  const hasPersistedState = Boolean(snapshot.state || editorSession || transcript || editPlan);

  let launchContext = fallbackLaunchContext ? cloneLaunchContext(fallbackLaunchContext) : null;

  if (!launchContext) {
    if (!editorSession || !transcript || !editorSession.media_ref) {
      return null;
    }

    launchContext = {
      workspace_id: target.workspaceId,
      workpiece_id: target.workpieceId,
      session_id: editorSession.session_id,
      source_mode: editorSession.source_mode,
      transcript: {
        kind: "tongs-stub",
        transcript_id: transcript.transcript_id,
        segments: cloneTranscriptSegments(transcript.segments),
        label: transcript.transcript_id,
      },
      media: {
        kind: "tongs-stub",
        ref: { ...editorSession.media_ref },
        workspace_mapping: editorSession.workspace_mapping
          ? { ...editorSession.workspace_mapping }
          : undefined,
        label: editorSession.media_source_label ?? "tongs:persisted-media",
      },
      ...(editPlan ? { edit_plan: cloneEditPlan(editPlan) } : {}),
      preview_mode: editPlan?.preview_mode ?? editorSession.preview_mode,
    };

    return {
      launchContext,
      source: "persistence",
    };
  }

  if (!hasPersistedState) {
    return {
      launchContext,
      source: "launch",
    };
  }

  launchContext.workspace_id = target.workspaceId;
  launchContext.workpiece_id = target.workpieceId;
  if (editorSession?.session_id) {
    launchContext.session_id = editorSession.session_id;
  }
  if (editorSession?.source_mode) {
    launchContext.source_mode = editorSession.source_mode;
  }
  if (transcript) {
    launchContext.transcript = {
      kind: "tongs-stub",
      transcript_id: transcript.transcript_id,
      segments: cloneTranscriptSegments(transcript.segments),
      label: transcript.transcript_id,
    };
  }
  if (editorSession?.media_ref) {
    launchContext.media = {
      kind: "tongs-stub",
      ref: { ...editorSession.media_ref },
      workspace_mapping: editorSession.workspace_mapping
        ? { ...editorSession.workspace_mapping }
        : undefined,
      label: editorSession.media_source_label ?? "tongs:persisted-media",
    };
  }
  if (editPlan) {
    launchContext.edit_plan = cloneEditPlan(editPlan);
  }
  launchContext.preview_mode = editPlan?.preview_mode
    ?? editorSession?.preview_mode
    ?? launchContext.preview_mode;

  return {
    launchContext,
    source: "persistence",
  };
}

async function readJsonBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { raw: text };
  }
}

function readErrorMessage(payload: unknown, fallback: string): string {
  const row = readJsonObject(payload);
  const error = readJsonObject(row?.error);
  const message = readString(error?.message)
    ?? readString(row?.message)
    ?? readString((row?.raw));
  return message ?? fallback;
}

function toRequestErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  if (typeof error === "string" && error.trim()) {
    return error;
  }
  return fallback;
}

function normalizeArtifact<T>(value: unknown): { path: string | null; file_updated_at: string | null; data: T | null } {
  const row = readJsonObject(value);
  return {
    path: readString(row?.path),
    file_updated_at: readString(row?.file_updated_at),
    data: (row?.data ?? null) as T | null,
  };
}

function normalizeAudioPolishArtifact(
  value: unknown,
): { path: string | null; file_updated_at: string | null; data: HammerPersistedAudioPolish | null } {
  const artifact = normalizeArtifact<Record<string, unknown>>(value);
  const dataRow = readJsonObject(artifact.data);
  if (!dataRow) {
    return {
      path: artifact.path,
      file_updated_at: artifact.file_updated_at,
      data: null,
    };
  }

  return {
    path: artifact.path,
    file_updated_at: artifact.file_updated_at,
    data: {
      ...(dataRow as unknown as HammerPersistedAudioPolish),
      audio_edit: normalizeHammerAudioEdit(dataRow.audio_edit),
    },
  };
}

function normalizeEditorSessionArtifact(
  value: unknown,
): { path: string | null; file_updated_at: string | null; data: HammerPersistedEditorSession | null } {
  const artifact = normalizeArtifact<Record<string, unknown>>(value);
  const dataRow = readJsonObject(artifact.data);
  const sessionId = readString(dataRow?.session_id);
  const sourceMode = readString(dataRow?.source_mode);
  const previewMode = readString(dataRow?.preview_mode);
  const transcriptSourceId = readString(dataRow?.transcript_source_id);
  const lastOpenedAt = readString(dataRow?.last_opened_at);
  if (!dataRow || !sessionId || !sourceMode || !previewMode || !transcriptSourceId || !lastOpenedAt) {
    return {
      path: artifact.path,
      file_updated_at: artifact.file_updated_at,
      data: null,
    };
  }

  return {
    path: artifact.path,
    file_updated_at: artifact.file_updated_at,
    data: {
      schema_version: 1,
      session_id: sessionId,
      source_mode: sourceMode as HammerPersistedEditorSession["source_mode"],
      preview_mode: previewMode as HammerPersistedEditorSession["preview_mode"],
      transcript_source_id: transcriptSourceId,
      selected_segment_id: readString(dataRow.selected_segment_id),
      selected_overlay_row_id: readString(dataRow.selected_overlay_row_id),
      media_ref: readJsonObject(dataRow.media_ref) as HammerPersistedEditorSession["media_ref"],
      workspace_mapping: readJsonObject(dataRow.workspace_mapping) as HammerPersistedEditorSession["workspace_mapping"],
      media_source_label: readString(dataRow.media_source_label),
      visual_preview: normalizeVisualPreviewSettings(dataRow.visual_preview),
      last_opened_at: lastOpenedAt,
    },
  };
}

function normalizeStructuredTranscriptArtifact(
  value: unknown,
): { path: string | null; file_updated_at: string | null; data: HammerPersistedStructuredTranscript | null } {
  const artifact = normalizeArtifact<Record<string, unknown>>(value);
  const dataRow = readJsonObject(artifact.data);
  if (!dataRow) {
    return {
      path: artifact.path,
      file_updated_at: artifact.file_updated_at,
      data: null,
    };
  }

  try {
    return {
      path: artifact.path,
      file_updated_at: artifact.file_updated_at,
      data: cloneHammerStructuredTranscript(dataRow as unknown as HammerPersistedStructuredTranscript),
    };
  } catch {
    return {
      path: artifact.path,
      file_updated_at: artifact.file_updated_at,
      data: null,
    };
  }
}

function normalizeVisualPlacementsArtifact(
  value: unknown,
): { path: string | null; file_updated_at: string | null; data: HammerPersistedVisualPlacements | null } {
  const artifact = normalizeArtifact<Record<string, unknown>>(value);
  return {
    path: artifact.path,
    file_updated_at: artifact.file_updated_at,
    data: normalizeHammerVisualPlacementsState(artifact.data),
  };
}

function normalizeVisualTimelineArtifact(
  value: unknown,
): { path: string | null; file_updated_at: string | null; data: HammerPersistenceSnapshot["visual_timeline"]["data"] } {
  const artifact = normalizeArtifact<Record<string, unknown>>(value);
  return {
    path: artifact.path,
    file_updated_at: artifact.file_updated_at,
    data: artifact.data as HammerPersistenceSnapshot["visual_timeline"]["data"],
  };
}

function normalizeStateRecord(value: unknown): HammerPersistedStateRecord | null {
  const row = readJsonObject(value);
  if (!row) return null;
  const workspaceId = readString(row.workspace_id);
  const workpieceId = readString(row.workpiece_id);
  const lastOpenedAt = readString(row.last_opened_at);
  const updatedAt = readString(row.updated_at);
  const updatedBy = readString(row.updated_by);
  if (!workspaceId || !workpieceId || !lastOpenedAt || !updatedAt || !updatedBy) {
    return null;
  }
  const orchestration = normalizeHammerOrchestrationState(row);

  return {
    workspace_id: workspaceId,
    workpiece_id: workpieceId,
    active_session_id: readString(row.active_session_id),
    current_pass: orchestration.current_pass,
    pass_order_version: orchestration.pass_order_version,
    pass_status: orchestration.pass_status,
    editor_session_path: readString(row.editor_session_path),
    transcript_artifact_path: readString(row.transcript_artifact_path),
    speaker_map_artifact_path: readString(row.speaker_map_artifact_path),
    visual_placement_artifact_path: readString(row.visual_placement_artifact_path),
    visual_timeline_artifact_path: readString(row.visual_timeline_artifact_path),
    audio_polish_artifact_path: readString(row.audio_polish_artifact_path),
    edit_plan_artifact_path: readString(row.edit_plan_artifact_path),
    editorial_authority_artifact_path: readString(row.editorial_authority_artifact_path),
    edit_plan_signature: orchestration.edit_plan_signature,
    prep_status: orchestration.prep_status,
    alignment_status: orchestration.alignment_status,
    macro_recipe_ref: orchestration.macro_recipe_ref,
    last_macro_run_ref: orchestration.last_macro_run_ref,
    last_opened_at: lastOpenedAt,
    updated_at: updatedAt,
    updated_by: updatedBy,
  };
}

function normalizeSnapshot(payload: unknown): HammerPersistenceSnapshot | null {
  const root = readJsonObject(payload);
  const data = readJsonObject(root?.data);
  const snapshot = readJsonObject(data?.snapshot);
  if (!snapshot) return null;
  const state = normalizeStateRecord(snapshot.state);
  const macroHooksRow = readJsonObject(snapshot.macro_hooks);
  const audioPolish = normalizeAudioPolishArtifact(snapshot.audio_polish);
  const structuredTranscript = normalizeStructuredTranscriptArtifact(snapshot.structured_transcript);
  const visualPlacements = normalizeVisualPlacementsArtifact(snapshot.visual_placements);
  const visualTimeline = normalizeVisualTimelineArtifact(snapshot.visual_timeline);

  return {
    schema_version: 1,
    state,
    editor_session: {
      path: normalizeEditorSessionArtifact(snapshot.editor_session).path,
      updated_at: normalizeEditorSessionArtifact(snapshot.editor_session).file_updated_at,
      data: normalizeEditorSessionArtifact(snapshot.editor_session).data,
    },
    structured_transcript: {
      path: structuredTranscript.path,
      updated_at: structuredTranscript.file_updated_at,
      data: structuredTranscript.data,
    },
    speaker_map: {
      path: normalizeArtifact<HammerPersistedSpeakerMap>(snapshot.speaker_map).path,
      updated_at: normalizeArtifact<HammerPersistedSpeakerMap>(snapshot.speaker_map).file_updated_at,
      data: normalizeArtifact<HammerPersistedSpeakerMap>(snapshot.speaker_map).data,
    },
    visual_placements: {
      path: visualPlacements.path,
      updated_at: visualPlacements.file_updated_at,
      data: visualPlacements.data,
    },
    visual_timeline: {
      path: visualTimeline.path,
      updated_at: visualTimeline.file_updated_at,
      data: visualTimeline.data,
    },
    audio_polish: {
      path: audioPolish.path,
      updated_at: audioPolish.file_updated_at,
      data: audioPolish.data,
    },
    edit_plan: {
      path: normalizeArtifact<HammerEditPlan>(snapshot.edit_plan).path,
      updated_at: normalizeArtifact<HammerEditPlan>(snapshot.edit_plan).file_updated_at,
      data: normalizeArtifact<HammerEditPlan>(snapshot.edit_plan).data,
    },
    editorial_authority: {
      path: normalizeArtifact<HammerEditorialAuthorityGraph>(snapshot.editorial_authority).path,
      updated_at: normalizeArtifact<HammerEditorialAuthorityGraph>(snapshot.editorial_authority).file_updated_at,
      data: normalizeArtifact<HammerEditorialAuthorityGraph>(snapshot.editorial_authority).data,
    },
    macro_hooks: {
      recipe_ref: readString(macroHooksRow?.recipe_ref) ?? state?.macro_recipe_ref ?? null,
      last_run_ref: readString(macroHooksRow?.last_run_ref) ?? state?.last_macro_run_ref ?? null,
    },
  };
}

function normalizePresenceRows(payload: unknown): HammerPresenceRow[] {
  const normalizeRow = (value: unknown): HammerPresenceRow | null => {
    const row = readJsonObject(value);
    const workspaceId = readString(row?.workspace_id);
    const workpieceId = readString(row?.workpiece_id);
    const userId = readString(row?.user_id);
    const mode = readString(row?.mode);
    const lastSeenAt = readString(row?.last_seen_at);
    const createdAt = readString(row?.created_at);
    if (!workspaceId || !workpieceId || !userId || !mode || !lastSeenAt || !createdAt) {
      return null;
    }
    return {
      workspace_id: workspaceId,
      workpiece_id: workpieceId,
      user_id: userId,
      session_id: readString(row?.session_id),
      display_name: readString(row?.display_name),
      mode: (mode === "editing" ? "editing" : "viewing"),
      last_seen_at: lastSeenAt,
      created_at: createdAt,
    };
  };

  const root = readJsonObject(payload);
  const data = readJsonObject(root?.data);
  if (Array.isArray(data?.presence)) {
    return data.presence
      .map((row) => normalizeRow(row))
      .filter((row): row is HammerPresenceRow => Boolean(row));
  }
  const singleRow = normalizeRow(data?.presence);
  return singleRow ? [singleRow] : [];
}

function buildStateUrl(target: HammerPersistenceTarget): string {
  return `/tongs/workspaces/${encodeURIComponent(target.workspaceId)}/workpieces/${encodeURIComponent(target.workpieceId)}/hammer/state`;
}

function buildPresenceUrl(target: HammerPersistenceTarget): string {
  return `/tongs/workspaces/${encodeURIComponent(target.workspaceId)}/workpieces/${encodeURIComponent(target.workpieceId)}/hammer/presence`;
}

function buildResetToRawUrl(target: HammerPersistenceTarget): string {
  return `/tongs/workspaces/${encodeURIComponent(target.workspaceId)}/workpieces/${encodeURIComponent(target.workpieceId)}/hammer/reset-to-raw`;
}

export async function loadHammerPersistenceSnapshot(
  target: HammerPersistenceTarget,
): Promise<PersistenceResult<HammerPersistenceSnapshot>> {
  let response: Response;
  try {
    response = await tongsFetch(buildStateUrl(target), {
      method: "GET",
      timeoutMs: HAMMER_PERSISTENCE_LOAD_TIMEOUT_MS,
    });
  } catch (error) {
    return {
      ok: false,
      status: 504,
      error: toRequestErrorMessage(error, "Hammer persistence load timed out."),
    };
  }
  const payload = await readJsonBody(response);
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: readErrorMessage(payload, "Failed to load Hammer persistence."),
    };
  }

  const snapshot = normalizeSnapshot(payload);
  if (!snapshot) {
    return {
      ok: false,
      status: response.status,
      error: "Hammer persistence response was invalid.",
    };
  }

  return {
    ok: true,
    status: response.status,
    data: snapshot,
  };
}

export async function saveHammerPersistenceSnapshot(
  target: HammerPersistenceTarget,
  request: HammerPersistenceSaveRequest,
): Promise<PersistenceResult<HammerPersistenceSnapshot>> {
  let response: Response;
  try {
    response = await tongsFetch(buildStateUrl(target), {
      method: "PUT",
      json: request,
      timeoutMs: HAMMER_PERSISTENCE_SAVE_TIMEOUT_MS,
    });
  } catch (error) {
    return {
      ok: false,
      status: 504,
      error: toRequestErrorMessage(error, "Hammer persistence save timed out."),
    };
  }
  const payload = await readJsonBody(response);
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: readErrorMessage(payload, "Failed to save Hammer persistence."),
    };
  }

  const snapshot = normalizeSnapshot(payload);
  if (!snapshot) {
    return {
      ok: false,
      status: response.status,
      error: "Hammer persistence save response was invalid.",
    };
  }

  return {
    ok: true,
    status: response.status,
    data: snapshot,
  };
}

export async function resetHammerWorkpieceToRaw(
  target: HammerPersistenceTarget,
  args?: { reason?: string | null },
): Promise<PersistenceResult<{ reset_at: string }>> {
  let response: Response;
  try {
    response = await tongsFetch(buildResetToRawUrl(target), {
      method: "POST",
      json: {
        written_by: { ...HAMMER_RUNTIME_WRITTEN_BY },
        reason: typeof args?.reason === "undefined" ? undefined : args?.reason,
      },
      timeoutMs: HAMMER_PERSISTENCE_SAVE_TIMEOUT_MS,
    });
  } catch (error) {
    return {
      ok: false,
      status: 504,
      error: toRequestErrorMessage(error, "Hammer reset to raw timed out."),
    };
  }

  const payload = await readJsonBody(response);
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: readErrorMessage(payload, "Failed to reset Hammer episode to raw."),
    };
  }

  const root = readJsonObject(payload);
  const data = readJsonObject(root?.data);
  const result = readJsonObject(data?.result);
  const resetAt = readString(result?.reset_at);
  if (!resetAt) {
    return {
      ok: false,
      status: response.status,
      error: "Hammer reset-to-raw response was invalid.",
    };
  }

  return {
    ok: true,
    status: response.status,
    data: { reset_at: resetAt },
  };
}

export async function upsertHammerPresence(
  target: HammerPersistenceTarget,
  request: HammerPresenceRequest,
): Promise<PersistenceResult<HammerPresenceRow[]>> {
  let response: Response;
  try {
    response = await tongsFetch(buildPresenceUrl(target), {
      method: "PUT",
      json: request,
      timeoutMs: HAMMER_PRESENCE_TIMEOUT_MS,
    });
  } catch (error) {
    return {
      ok: false,
      status: 504,
      error: toRequestErrorMessage(error, "Failed to update Hammer presence."),
    };
  }
  const payload = await readJsonBody(response);
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: readErrorMessage(payload, "Failed to update Hammer presence."),
    };
  }

  return {
    ok: true,
    status: response.status,
    data: normalizePresenceRows(payload),
  };
}

export async function loadHammerPresence(
  target: HammerPersistenceTarget,
): Promise<PersistenceResult<HammerPresenceRow[]>> {
  let response: Response;
  try {
    response = await tongsFetch(buildPresenceUrl(target), {
      method: "GET",
      timeoutMs: HAMMER_PRESENCE_TIMEOUT_MS,
    });
  } catch (error) {
    return {
      ok: false,
      status: 504,
      error: toRequestErrorMessage(error, "Failed to load Hammer presence."),
    };
  }
  const payload = await readJsonBody(response);
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: readErrorMessage(payload, "Failed to load Hammer presence."),
    };
  }

  return {
    ok: true,
    status: response.status,
    data: normalizePresenceRows(payload),
  };
}
