import type { HammerEditPlan } from "../../../../packages/contracts/hammer/edit-plan.contract";
import type { HammerLaunchContext } from "../../../../packages/contracts/hammer/launch-context.contract";
import type { HammerTranscriptSegment } from "../../../../packages/contracts/hammer/transcript.contract";
import {
  cloneHammerEditorialAuthorityGraph,
  type HammerEditorialAuthorityGraph,
} from "../../../../packages/contracts/hammer/editorial-authority.contract";
import { tongsFetch } from "../lib/tongsFetch";
import { cloneHammerStructuredTranscript } from "../macros/hammerDerivedTranscriptLayers";
import { cloneVisualPlacements } from "../lib/hammerVisualPlacements";
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
  HammerPersistedSpeakerMap,
  HammerPersistedStructuredTranscript,
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
  return {
    schema_version: 1,
    session_id: snapshot.sessionId,
    source_mode: snapshot.sourceMode,
    preview_mode: snapshot.previewMode,
    transcript_source_id: snapshot.transcriptSourceId,
    selected_segment_id: snapshot.selectedSegmentId,
    selected_overlay_row_id: snapshot.selectedOverlayRowId,
    media_ref: snapshot.mediaRef ? { ...snapshot.mediaRef } : null,
    workspace_mapping: snapshot.workspaceMapping ? { ...snapshot.workspaceMapping } : null,
    media_source_label: snapshot.mediaSourceLabel,
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

  return {
    written_by: { ...HAMMER_RUNTIME_WRITTEN_BY },
    active_session_id: snapshot.sessionId,
    prep_status: snapshot.transcriptSegments.length > 0 ? "prepared" : "idle",
    alignment_status: snapshot.transcriptSegments.length > 0 ? "aligned" : "not_started",
    last_opened_at: lastOpenedAt,
    edit_plan_signature: snapshot.editPlanSignature,
    macro_recipe_ref: snapshot.selectedMacroRecipeRef,
    last_macro_run_ref: snapshot.lastMacroRunRef,
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

function normalizeSnapshot(payload: unknown): HammerPersistenceSnapshot | null {
  const root = readJsonObject(payload);
  const data = readJsonObject(root?.data);
  const snapshot = readJsonObject(data?.snapshot);
  if (!snapshot) return null;

  return {
    schema_version: 1,
    state: (snapshot.state ?? null) as HammerPersistenceSnapshot["state"],
    editor_session: {
      path: normalizeArtifact<HammerPersistedEditorSession>(snapshot.editor_session).path,
      updated_at: normalizeArtifact<HammerPersistedEditorSession>(snapshot.editor_session).file_updated_at,
      data: normalizeArtifact<HammerPersistedEditorSession>(snapshot.editor_session).data,
    },
    structured_transcript: {
      path: normalizeArtifact<HammerPersistedStructuredTranscript>(snapshot.structured_transcript).path,
      updated_at: normalizeArtifact<HammerPersistedStructuredTranscript>(snapshot.structured_transcript).file_updated_at,
      data: normalizeArtifact<HammerPersistedStructuredTranscript>(snapshot.structured_transcript).data,
    },
    speaker_map: {
      path: normalizeArtifact<HammerPersistedSpeakerMap>(snapshot.speaker_map).path,
      updated_at: normalizeArtifact<HammerPersistedSpeakerMap>(snapshot.speaker_map).file_updated_at,
      data: normalizeArtifact<HammerPersistedSpeakerMap>(snapshot.speaker_map).data,
    },
    visual_placements: {
      path: normalizeArtifact<HammerPersistedVisualPlacements>(snapshot.visual_placements).path,
      updated_at: normalizeArtifact<HammerPersistedVisualPlacements>(snapshot.visual_placements).file_updated_at,
      data: normalizeArtifact<HammerPersistedVisualPlacements>(snapshot.visual_placements).data,
    },
    audio_polish: {
      path: normalizeArtifact<HammerPersistedAudioPolish>(snapshot.audio_polish).path,
      updated_at: normalizeArtifact<HammerPersistedAudioPolish>(snapshot.audio_polish).file_updated_at,
      data: normalizeArtifact<HammerPersistedAudioPolish>(snapshot.audio_polish).data,
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
      recipe_ref: readString(readJsonObject(snapshot.macro_hooks)?.recipe_ref),
      last_run_ref: readString(readJsonObject(snapshot.macro_hooks)?.last_run_ref),
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
