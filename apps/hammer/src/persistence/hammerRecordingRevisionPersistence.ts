import { tongsFetch } from "../lib/tongsFetch";
import { HAMMER_RUNTIME_WRITTEN_BY } from "../prep/hammerPrep";
import type {
  HammerPersistedAudioPolish,
  HammerPersistedEditorSession,
  HammerPersistedSpeakerMap,
  HammerPersistedStructuredTranscript,
  HammerPersistenceTarget,
} from "./hammerPersistenceContract";
import type { HammerVisualTimelineState } from "../visuals/model/hammerVisualTypes";
import type { HammerPersistedVisualPlacements } from "./hammerPersistenceContract";

type JsonObject = Record<string, unknown>;

export type HammerCanonicalRecordingStatus = "draft" | "sealed" | "archived";

export type HammerCanonicalRecordingRecord = {
  id: string;
  workspace_id: string;
  workpiece_id: string;
  status: HammerCanonicalRecordingStatus;
  media_path: string;
  sealed_at: string | null;
  baseline_transcript_path: string | null;
  baseline_speaker_map_path: string | null;
  baseline_timing_path: string | null;
};

export type HammerRecordingRevisionStatus = "active" | "superseded" | "discarded";

export type HammerRecordingRevisionRecord = {
  id: string;
  workspace_id: string;
  workpiece_id: string;
  canonical_recording_id: string;
  status: HammerRecordingRevisionStatus;
  label: string | null;
  editor_session_path: string | null;
  revision_transcript_path: string | null;
  audio_polish_path: string | null;
  visual_timeline_path: string | null;
  visual_placements_path: string | null;
  history_path: string | null;
  snapshots_manifest_path: string | null;
};

type PersistenceResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; error: string };

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function readJsonObject(value: unknown): JsonObject | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as JsonObject;
}

function toErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return fallback;
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
  const root = readJsonObject(payload);
  const error = readJsonObject(root?.error);
  return readString(error?.message) ?? fallback;
}

function isMissingFileResponse(status: number, payload: unknown): boolean {
  if (status !== 404) return false;
  const root = readJsonObject(payload);
  return root?.ok === true && root?.exists === false;
}

async function readWorkpieceJsonFile<T>(
  workpieceId: string,
  path: string,
  timeoutMs = 30_000,
): Promise<{ ok: true; exists: boolean; data: T | null } | { ok: false; error: string; status: number }> {
  let response: Response;
  try {
    response = await tongsFetch(
      `/tongs/workpieces/${encodeURIComponent(workpieceId)}/read-file?path=${encodeURIComponent(path)}`,
      { method: "GET", timeoutMs },
    );
  } catch (error) {
    return { ok: false, status: 504, error: toErrorMessage(error, "Tongs read-file timed out.") };
  }

  const payload = await readJsonBody(response);
  if (!response.ok) {
    if (isMissingFileResponse(response.status, payload)) {
      return { ok: true, exists: false, data: null };
    }
    return { ok: false, status: response.status, error: readErrorMessage(payload, "Failed to read artifact.") };
  }

  const root = readJsonObject(payload);
  const exists = root?.exists === true;
  const data = (root?.data ?? null) as T | null;
  return { ok: true, exists, data: exists ? data : null };
}

export type OpenHammerRecordingSessionResult = {
  canonical_recording: HammerCanonicalRecordingRecord;
  revision: HammerRecordingRevisionRecord;
};

export async function openHammerRecordingSession(
  target: HammerPersistenceTarget,
  args?: { revision_label?: string | null },
): Promise<PersistenceResult<OpenHammerRecordingSessionResult>> {
  let response: Response;
  try {
    response = await tongsFetch(
      `/tongs/workspaces/${encodeURIComponent(target.workspaceId)}/workpieces/${encodeURIComponent(target.workpieceId)}/hammer/session`,
      {
        method: "POST",
        json: {
          written_by: { ...HAMMER_RUNTIME_WRITTEN_BY },
          ...(typeof args?.revision_label === "undefined" ? {} : { revision_label: args.revision_label }),
        },
        timeoutMs: 45_000,
      },
    );
  } catch (error) {
    return { ok: false, status: 504, error: toErrorMessage(error, "Failed to open Hammer session.") };
  }

  const payload = await readJsonBody(response);
  if (!response.ok) {
    return { ok: false, status: response.status, error: readErrorMessage(payload, "Failed to open Hammer session.") };
  }

  const root = readJsonObject(payload);
  const data = readJsonObject(root?.data);
  const canonical = (data?.canonical_recording ?? null) as HammerCanonicalRecordingRecord | null;
  const revision = (data?.revision ?? null) as HammerRecordingRevisionRecord | null;
  if (!canonical?.id || !revision?.id) {
    return { ok: false, status: response.status, error: "Hammer session response was invalid." };
  }

  return { ok: true, status: response.status, data: { canonical_recording: canonical, revision } };
}

export type HammerCanonicalBaselineArtifacts = {
  structured_transcript: HammerPersistedStructuredTranscript | null;
  speaker_map: HammerPersistedSpeakerMap | null;
  timing_baseline: unknown | null;
};

export async function loadHammerCanonicalBaselineArtifacts(
  canonical: HammerCanonicalRecordingRecord,
): Promise<PersistenceResult<HammerCanonicalBaselineArtifacts>> {
  const workpieceId = canonical.workpiece_id;
  const transcriptPath = canonical.baseline_transcript_path;
  const speakerMapPath = canonical.baseline_speaker_map_path;
  const timingPath = canonical.baseline_timing_path;

  const [transcriptResult, speakerMapResult, timingResult] = await Promise.all([
    transcriptPath
      ? readWorkpieceJsonFile<HammerPersistedStructuredTranscript>(workpieceId, transcriptPath, 30_000)
      : Promise.resolve({ ok: true as const, exists: false, data: null }),
    speakerMapPath
      ? readWorkpieceJsonFile<HammerPersistedSpeakerMap>(workpieceId, speakerMapPath, 30_000)
      : Promise.resolve({ ok: true as const, exists: false, data: null }),
    timingPath
      ? readWorkpieceJsonFile<unknown>(workpieceId, timingPath, 20_000)
      : Promise.resolve({ ok: true as const, exists: false, data: null }),
  ]);

  const failures = [transcriptResult, speakerMapResult, timingResult].filter((entry) => !entry.ok) as Array<{
    ok: false;
    status: number;
    error: string;
  }>;
  if (failures.length > 0) {
    return { ok: false, status: failures[0].status, error: failures[0].error };
  }

  return {
    ok: true,
    status: 200,
    data: {
      structured_transcript: transcriptResult.ok ? transcriptResult.data : null,
      speaker_map: speakerMapResult.ok ? speakerMapResult.data : null,
      timing_baseline: timingResult.ok ? timingResult.data : null,
    },
  };
}

export type HammerRevisionArtifacts = {
  editor_session: HammerPersistedEditorSession | null;
  revision_transcript: HammerPersistedStructuredTranscript | null;
  audio_polish: HammerPersistedAudioPolish | null;
  visual_timeline: HammerVisualTimelineState | null;
  visual_placements: HammerPersistedVisualPlacements | null;
};

export async function loadHammerRecordingRevisionArtifacts(
  revision: HammerRecordingRevisionRecord,
): Promise<PersistenceResult<HammerRevisionArtifacts>> {
  const workpieceId = revision.workpiece_id;
  const [
    editorSessionResult,
    transcriptResult,
    audioPolishResult,
    visualTimelineResult,
    visualPlacementsResult,
  ] = await Promise.all([
    revision.editor_session_path
      ? readWorkpieceJsonFile<HammerPersistedEditorSession>(workpieceId, revision.editor_session_path, 20_000)
      : Promise.resolve({ ok: true as const, exists: false, data: null }),
    revision.revision_transcript_path
      ? readWorkpieceJsonFile<HammerPersistedStructuredTranscript>(workpieceId, revision.revision_transcript_path, 30_000)
      : Promise.resolve({ ok: true as const, exists: false, data: null }),
    revision.audio_polish_path
      ? readWorkpieceJsonFile<HammerPersistedAudioPolish>(workpieceId, revision.audio_polish_path, 30_000)
      : Promise.resolve({ ok: true as const, exists: false, data: null }),
    revision.visual_timeline_path
      ? readWorkpieceJsonFile<HammerVisualTimelineState>(workpieceId, revision.visual_timeline_path, 20_000)
      : Promise.resolve({ ok: true as const, exists: false, data: null }),
    revision.visual_placements_path
      ? readWorkpieceJsonFile<HammerPersistedVisualPlacements>(workpieceId, revision.visual_placements_path, 20_000)
      : Promise.resolve({ ok: true as const, exists: false, data: null }),
  ]);

  const failures = [
    editorSessionResult,
    transcriptResult,
    audioPolishResult,
    visualTimelineResult,
    visualPlacementsResult,
  ].filter((entry) => !entry.ok) as Array<{ ok: false; status: number; error: string }>;
  if (failures.length > 0) {
    return { ok: false, status: failures[0].status, error: failures[0].error };
  }

  return {
    ok: true,
    status: 200,
    data: {
      editor_session: editorSessionResult.ok ? editorSessionResult.data : null,
      revision_transcript: transcriptResult.ok ? transcriptResult.data : null,
      audio_polish: audioPolishResult.ok ? audioPolishResult.data : null,
      visual_timeline: visualTimelineResult.ok ? visualTimelineResult.data : null,
      visual_placements: visualPlacementsResult.ok ? visualPlacementsResult.data : null,
    },
  };
}

export type SaveHammerRecordingRevisionRequest = {
  written_by: typeof HAMMER_RUNTIME_WRITTEN_BY;
  label?: string | null;
  editor_session?: { data: unknown; expected_previous_updated_at?: string | null };
  revision_transcript?: { data: unknown; expected_previous_updated_at?: string | null };
  audio_polish?: { data: unknown; expected_previous_updated_at?: string | null };
  visual_timeline?: { data: unknown; expected_previous_updated_at?: string | null };
  visual_placements?: { data: unknown; expected_previous_updated_at?: string | null };
  history?: { data: unknown; expected_previous_updated_at?: string | null };
  snapshots_manifest?: { data: unknown; expected_previous_updated_at?: string | null };
};

export async function saveHammerRecordingRevision(
  target: HammerPersistenceTarget,
  revisionId: string,
  request: Omit<SaveHammerRecordingRevisionRequest, "written_by">,
): Promise<PersistenceResult<{ revision: HammerRecordingRevisionRecord }>> {
  let response: Response;
  try {
    response = await tongsFetch(
      `/tongs/workspaces/${encodeURIComponent(target.workspaceId)}/workpieces/${encodeURIComponent(target.workpieceId)}/hammer/revisions/${encodeURIComponent(revisionId)}`,
      {
        method: "PUT",
        json: {
          written_by: { ...HAMMER_RUNTIME_WRITTEN_BY },
          ...request,
        },
        timeoutMs: 45_000,
      },
    );
  } catch (error) {
    return { ok: false, status: 504, error: toErrorMessage(error, "Failed to save Hammer revision.") };
  }

  const payload = await readJsonBody(response);
  if (!response.ok) {
    return { ok: false, status: response.status, error: readErrorMessage(payload, "Failed to save Hammer revision.") };
  }

  const root = readJsonObject(payload);
  const data = readJsonObject(root?.data);
  const revision = (data?.revision ?? null) as HammerRecordingRevisionRecord | null;
  if (!revision?.id) {
    return { ok: false, status: response.status, error: "Hammer revision save response was invalid." };
  }

  return { ok: true, status: response.status, data: { revision } };
}

export async function resetHammerRecordingRevision(
  target: HammerPersistenceTarget,
  revisionId: string,
  args?: { reason?: string | null },
): Promise<PersistenceResult<{ result: { reset_at: string; discarded_revision_id: string; new_revision_id: string } }>> {
  let response: Response;
  try {
    response = await tongsFetch(
      `/tongs/workspaces/${encodeURIComponent(target.workspaceId)}/workpieces/${encodeURIComponent(target.workpieceId)}/hammer/revisions/${encodeURIComponent(revisionId)}/reset`,
      {
        method: "POST",
        json: {
          written_by: { ...HAMMER_RUNTIME_WRITTEN_BY },
          ...(typeof args?.reason === "undefined" ? {} : { reason: args.reason }),
        },
        timeoutMs: 45_000,
      },
    );
  } catch (error) {
    return { ok: false, status: 504, error: toErrorMessage(error, "Failed to reset Hammer revision.") };
  }

  const payload = await readJsonBody(response);
  if (!response.ok) {
    return { ok: false, status: response.status, error: readErrorMessage(payload, "Failed to reset Hammer revision.") };
  }

  const root = readJsonObject(payload);
  const data = readJsonObject(root?.data);
  const result = readJsonObject(data?.result);
  const resetAt = readString(result?.reset_at);
  const discardedRevisionId = readString(result?.discarded_revision_id);
  const newRevisionId = readString(result?.new_revision_id);
  if (!resetAt || !discardedRevisionId || !newRevisionId) {
    return { ok: false, status: response.status, error: "Hammer revision reset response was invalid." };
  }

  return {
    ok: true,
    status: response.status,
    data: { result: { reset_at: resetAt, discarded_revision_id: discardedRevisionId, new_revision_id: newRevisionId } },
  };
}

export async function sealHammerCanonicalBaseline(
  target: HammerPersistenceTarget,
  canonicalRecordingId: string,
  input: {
    structured_transcript: HammerPersistedStructuredTranscript;
    speaker_map: HammerPersistedSpeakerMap;
    timing_baseline?: unknown;
  },
): Promise<PersistenceResult<{ canonical_recording: HammerCanonicalRecordingRecord }>> {
  let response: Response;
  try {
    response = await tongsFetch(
      `/tongs/workspaces/${encodeURIComponent(target.workspaceId)}/workpieces/${encodeURIComponent(target.workpieceId)}/hammer/canonical-recording/${encodeURIComponent(canonicalRecordingId)}/seal-baseline`,
      {
        method: "POST",
        json: {
          written_by: { ...HAMMER_RUNTIME_WRITTEN_BY },
          structured_transcript: { data: input.structured_transcript },
          speaker_map: { data: input.speaker_map },
          ...(typeof input.timing_baseline === "undefined"
            ? {}
            : { timing_baseline: { data: input.timing_baseline } }),
        },
        timeoutMs: 60_000,
      },
    );
  } catch (error) {
    return { ok: false, status: 504, error: toErrorMessage(error, "Failed to seal canonical baseline.") };
  }

  const payload = await readJsonBody(response);
  if (!response.ok) {
    return { ok: false, status: response.status, error: readErrorMessage(payload, "Failed to seal canonical baseline.") };
  }

  const root = readJsonObject(payload);
  const data = readJsonObject(root?.data);
  const result = readJsonObject(data?.result);
  const canonical = (result?.canonical_recording ?? null) as HammerCanonicalRecordingRecord | null;
  if (!canonical?.id) {
    return { ok: false, status: response.status, error: "Seal canonical baseline response was invalid." };
  }

  return { ok: true, status: response.status, data: { canonical_recording: canonical } };
}

