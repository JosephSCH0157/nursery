import { tongsFetch } from "../lib/tongsFetch";
import { HAMMER_RUNTIME_WRITTEN_BY } from "../prep/hammerPrep";
import type {
  HammerPersistedAudioPolish,
  HammerPersistedEditorSession,
  HammerPersistedSpeakerMap,
  HammerPersistedStructuredTranscript,
  HammerPersistenceTarget,
  HammerPersistedVisualPlacements,
} from "./hammerPersistenceContract";
import type { HammerVisualTimelineState } from "../visuals/model/hammerVisualTypes";
import { assertValidTimelineState } from "../visuals/model/hammerVisualGuards";
import { normalizeLegacyCanonicalVisualTimelineV1 } from "../visuals/persistence/hammerVisualTimelinePersistence";
import type { HammerCompositionV2, HammerCompositionHistoryV2 } from "../composition/hammerCompositionV2";
import type { HammerCompositionTransactionV2 } from "../composition/hammerCompositionTransactionV2";
import type { HammerMediaProvenanceManifest } from "../composition/hammerMediaProvenance";
import type { HammerRenderJobV1 } from "../composition/hammerRenderJobV1";
import type { HammerReleasePacketV2 } from "../composition/hammerReleasePacketV2";
import { parseTongsReadFileResponse } from "../lib/tongsReadFileResponse";
import type { HammerEditorialAuthorityGraph } from "../../../../packages/contracts/hammer/editorial-authority.contract";

type JsonObject = Record<string, unknown>;

function isHammerCompositionHistoryV2(value: unknown): value is HammerCompositionHistoryV2 {
  if (!value || typeof value !== "object") return false;
  const row = value as { schema_version?: unknown; base?: { schema_version?: unknown }; entries?: unknown; head_index?: unknown };
  return row.schema_version === 2
    && row.base?.schema_version === 2
    && Array.isArray(row.entries)
    && typeof row.head_index === "number";
}

const LEGACY_STRUCTURED_TRANSCRIPT_PATH = "hammer/transcript/structured.v1.json";
const LEGACY_SPEAKER_MAP_PATH = "hammer/transcript/speaker-map.v1.json";
const canonicalVisualTimelinePath = (revisionId: string) => `hammer/revisions/${revisionId}/visual-timeline.v1.json`;

export function validateCanonicalVisualTimelineArtifact(value: unknown):
  | { ok: true; timeline: HammerVisualTimelineState }
  | { ok: false; classification: "malformed_json" | "schema_invalid"; error: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, classification: "malformed_json", error: "Canonical visual timeline JSON must be an object." };
  }
  const version = (value as { version?: unknown }).version;
  try {
    if (version === 2) {
      return { ok: true, timeline: assertValidTimelineState(value as HammerVisualTimelineState) };
    }
    if (version === 1) {
      const normalized = normalizeLegacyCanonicalVisualTimelineV1(value);
      if (!normalized) throw new Error("Legacy visual timeline v1 is structurally invalid.");
      return { ok: true, timeline: assertValidTimelineState(normalized) };
    }
    throw new Error(`Unsupported visual timeline version: ${String(version)}.`);
  } catch (error) {
    return { ok: false, classification: "schema_invalid", error: toErrorMessage(error, "validation failed") };
  }
}

export type HammerCanonicalRecordingStatus = "draft" | "sealed" | "archived";

export type HammerCanonicalRecordingRecord = {
  id: string;
  workspace_id: string;
  workpiece_id: string;
  status: HammerCanonicalRecordingStatus;
  media_path: string;
  media_id?: string | null;
  media_signature?: string | null;
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
  composition_v2_path?: string | null;
  media_provenance_path?: string | null;
  render_jobs_path?: string | null;
  release_packet_path?: string | null;
  composition_revision?: number | null;
  composition_fingerprint?: string | null;
  composition_history_head_id?: string | null;
  editorial_authority_path: string | null;
  editorial_authority_fingerprint: string | null;
  editorial_authority_revision: number;
  updated_at: string;
};

type PersistenceResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; error: string; error_code?: string | null; error_details?: unknown };

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

function readErrorInfo(payload: unknown, fallback: string): { message: string; code: string | null; details?: unknown } {
  const root = readJsonObject(payload);
  const error = readJsonObject(root?.error);
  return {
    message: readString(error?.message) ?? fallback,
    code: readString(error?.code),
    ...(typeof error?.details === "undefined" ? {} : { details: error?.details }),
  };
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
  const parsed = parseTongsReadFileResponse<T>({ status: response.status, responseOk: response.ok, payload });
  if (parsed.kind === "absent") return { ok: true, exists: false, data: null };
  if (parsed.kind === "failure") return { ok: false, status: response.status, error: parsed.message };
  return { ok: true, exists: true, data: parsed.data };
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
    const info = readErrorInfo(payload, "Failed to open Hammer session.");
    return {
      ok: false,
      status: response.status,
      error: info.message,
      error_code: info.code,
      ...(typeof info.details === "undefined" ? {} : { error_details: info.details }),
    };
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
  visual_timeline_authority: "canonical" | "absent";
  visual_placements: HammerPersistedVisualPlacements | null;
  composition_v2: HammerCompositionV2 | null;
  composition_transaction: HammerCompositionTransactionV2 | null;
  history_v2: HammerCompositionHistoryV2 | null;
  media_provenance: HammerMediaProvenanceManifest | null;
  render_jobs: readonly HammerRenderJobV1[] | null;
  release_packet: HammerReleasePacketV2 | null;
  editorial_authority: HammerEditorialAuthorityGraph | null;
};

type HammerRevisionEditorialAuthorityArtifactV1 = {
  schema_version: 1;
  workspace_id: string;
  workpiece_id: string;
  canonical_recording_id: string;
  recording_revision_id: string;
  authority: HammerEditorialAuthorityGraph;
};

function validateRevisionEditorialAuthorityArtifact(args: {
  value: unknown;
  revision: HammerRecordingRevisionRecord;
}): HammerRevisionEditorialAuthorityArtifactV1 | null {
  const artifact = readJsonObject(args.value);
  const authority = readJsonObject(artifact?.authority);
  if (
    artifact?.schema_version !== 1
    || artifact.workspace_id !== args.revision.workspace_id
    || artifact.workpiece_id !== args.revision.workpiece_id
    || artifact.canonical_recording_id !== args.revision.canonical_recording_id
    || artifact.recording_revision_id !== args.revision.id
    || authority?.schema_version !== 1
    || typeof authority.graph_id !== "string"
    || !Number.isSafeInteger(authority.graph_version)
    || !Array.isArray(authority.operation_order)
    || !Array.isArray(authority.operations)
    || typeof authority.created_at !== "string"
    || typeof authority.updated_at !== "string"
  ) return null;
  if (authority.workspace_id != null && authority.workspace_id !== args.revision.workspace_id) return null;
  if (authority.workpiece_id != null && authority.workpiece_id !== args.revision.workpiece_id) return null;
  return artifact as unknown as HammerRevisionEditorialAuthorityArtifactV1;
}

async function readRevisionEditorialAuthority(
  revision: HammerRecordingRevisionRecord,
): Promise<PersistenceResult<HammerEditorialAuthorityGraph | null>> {
  if (!revision.editorial_authority_path) return { ok: true, status: 200, data: null };
  const expectedPath = `hammer/revisions/${revision.id}/editorial-authority.v1.json`;
  if (revision.editorial_authority_path !== expectedPath) {
    return { ok: false, status: 409, error: "The active revision editorial-authority pointer is not revision-scoped." };
  }
  if (!revision.editorial_authority_fingerprint) {
    return { ok: false, status: 409, error: "The active revision editorial-authority pointer has no fingerprint." };
  }
  let response: Response;
  try {
    response = await tongsFetch(
      `/tongs/workpieces/${encodeURIComponent(revision.workpiece_id)}/read-file?path=${encodeURIComponent(revision.editorial_authority_path)}`,
      { method: "GET", timeoutMs: 20_000 },
    );
  } catch (error) {
    return { ok: false, status: 504, error: toErrorMessage(error, "Failed to read revision editorial authority.") };
  }
  const payload = await readJsonBody(response);
  const parsed = parseTongsReadFileResponse<unknown>({ status: response.status, responseOk: response.ok, payload });
  if (parsed.kind === "absent") {
    return { ok: false, status: 409, error: "The active revision points to an editorial-authority artifact that is missing." };
  }
  if (parsed.kind === "failure") {
    return { ok: false, status: response.status || 502, error: parsed.message };
  }
  const committedFingerprint = readString(parsed.fileRow?.hash_value)?.toLowerCase() ?? null;
  if (committedFingerprint !== revision.editorial_authority_fingerprint.toLowerCase()) {
    return { ok: false, status: 409, error: "The revision editorial-authority artifact fingerprint does not match its canonical pointer." };
  }
  const artifact = validateRevisionEditorialAuthorityArtifact({ value: parsed.data, revision });
  if (!artifact) {
    return { ok: false, status: 422, error: "The revision editorial-authority artifact is malformed or belongs to stale authority." };
  }
  return { ok: true, status: 200, data: artifact.authority };
}

export async function loadHammerRecordingRevisionArtifacts(
  revision: HammerRecordingRevisionRecord,
): Promise<PersistenceResult<HammerRevisionArtifacts>> {
  const workpieceId = revision.workpiece_id;
  const pointerTimelinePath = revision.visual_timeline_path;
  const standardTimelinePath = canonicalVisualTimelinePath(revision.id);
  const pointerTimelineResult = pointerTimelinePath
    ? await readWorkpieceJsonFile<HammerVisualTimelineState>(workpieceId, pointerTimelinePath, 20_000)
    : null;
  if (pointerTimelineResult && (!pointerTimelineResult.ok || !pointerTimelineResult.exists || !pointerTimelineResult.data)) {
    return {
      ok: false,
      status: pointerTimelineResult.ok ? 409 : pointerTimelineResult.status,
      error: pointerTimelineResult.ok
        ? "The active revision points to a canonical visual timeline that is missing. Legacy fallback is forbidden."
        : pointerTimelineResult.error,
    };
  }
  const standardTimelineResult = !pointerTimelinePath
    ? await readWorkpieceJsonFile<HammerVisualTimelineState>(workpieceId, standardTimelinePath, 20_000)
    : null;
  if (standardTimelineResult && !standardTimelineResult.ok) {
    return { ok: false, status: standardTimelineResult.status, error: standardTimelineResult.error };
  }
  const rawVisualTimeline = pointerTimelineResult?.data ?? standardTimelineResult?.data ?? null;
  let canonicalVisualTimeline: HammerVisualTimelineState | null = null;
  if (rawVisualTimeline) {
    const validation = validateCanonicalVisualTimelineArtifact(rawVisualTimeline);
    if (!validation.ok) {
      return {
        ok: false,
        status: 422,
        error: `The active revision canonical visual timeline is invalid (${validation.classification}): ${validation.error}`,
      };
    }
    canonicalVisualTimeline = validation.timeline;
  }

  const editorialAuthorityResult = await readRevisionEditorialAuthority(revision);
  if (!editorialAuthorityResult.ok) return editorialAuthorityResult;

  const [
    editorSessionResult,
    transcriptResult,
    audioPolishResult,
    visualPlacementsResult,
    compositionResult,
    historyResult,
    provenanceResult,
    renderJobsResult,
    releasePacketResult,
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
    revision.visual_placements_path
      ? readWorkpieceJsonFile<HammerPersistedVisualPlacements>(workpieceId, revision.visual_placements_path, 20_000)
      : Promise.resolve({ ok: true as const, exists: false, data: null }),
    revision.composition_v2_path ? readWorkpieceJsonFile<HammerCompositionTransactionV2>(workpieceId, revision.composition_v2_path) : Promise.resolve({ ok: true as const, exists: false, data: null }),
    revision.history_path ? readWorkpieceJsonFile<unknown>(workpieceId, revision.history_path) : Promise.resolve({ ok: true as const, exists: false, data: null }),
    revision.media_provenance_path ? readWorkpieceJsonFile<HammerMediaProvenanceManifest>(workpieceId, revision.media_provenance_path) : Promise.resolve({ ok: true as const, exists: false, data: null }),
    revision.render_jobs_path ? readWorkpieceJsonFile<readonly HammerRenderJobV1[]>(workpieceId, revision.render_jobs_path) : Promise.resolve({ ok: true as const, exists: false, data: null }),
    revision.release_packet_path ? readWorkpieceJsonFile<HammerReleasePacketV2>(workpieceId, revision.release_packet_path) : Promise.resolve({ ok: true as const, exists: false, data: null }),
  ]);

  const failures = [
    editorSessionResult,
    transcriptResult,
    audioPolishResult,
    visualPlacementsResult,
    compositionResult,
    historyResult,
    provenanceResult,
    renderJobsResult,
    releasePacketResult,
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
      visual_timeline: canonicalVisualTimeline,
      visual_timeline_authority: canonicalVisualTimeline ? "canonical" : "absent",
      visual_placements: visualPlacementsResult.ok ? visualPlacementsResult.data : null,
      composition_v2: compositionResult.ok && compositionResult.data?.schema_version === 2 ? compositionResult.data.composition : null,
      composition_transaction: compositionResult.ok ? compositionResult.data : null,
      history_v2: compositionResult.ok && compositionResult.data?.history?.schema_version === 2
        ? compositionResult.data.history
        : historyResult.ok && isHammerCompositionHistoryV2(historyResult.data) ? historyResult.data : null,
      media_provenance: provenanceResult.ok ? provenanceResult.data : null,
      render_jobs: renderJobsResult.ok ? renderJobsResult.data : null,
      release_packet: releasePacketResult.ok ? releasePacketResult.data : null,
      editorial_authority: editorialAuthorityResult.data,
    },
  };
}

export async function loadLegacyHammerTranscriptArtifacts(
  workpieceId: string,
): Promise<PersistenceResult<{ structured_transcript: HammerPersistedStructuredTranscript | null; speaker_map: HammerPersistedSpeakerMap | null }>> {
  const [transcriptResult, speakerMapResult] = await Promise.all([
    readWorkpieceJsonFile<HammerPersistedStructuredTranscript>(workpieceId, LEGACY_STRUCTURED_TRANSCRIPT_PATH, 30_000),
    readWorkpieceJsonFile<HammerPersistedSpeakerMap>(workpieceId, LEGACY_SPEAKER_MAP_PATH, 20_000),
  ]);

  const failures = [transcriptResult, speakerMapResult].filter((entry) => !entry.ok) as Array<{ ok: false; status: number; error: string }>;
  if (failures.length > 0) {
    return { ok: false, status: failures[0].status, error: failures[0].error };
  }

  return {
    ok: true,
    status: 200,
    data: {
      structured_transcript: transcriptResult.ok ? transcriptResult.data : null,
      speaker_map: speakerMapResult.ok ? speakerMapResult.data : null,
    },
  };
}

export type SaveHammerRecordingRevisionRequest = {
  written_by: typeof HAMMER_RUNTIME_WRITTEN_BY;
  expected_revision_updated_at?: string;
  label?: string | null;
  editor_session?: { data: unknown; expected_previous_updated_at?: string | null };
  revision_transcript?: { data: unknown; expected_previous_updated_at?: string | null };
  audio_polish?: { data: unknown; expected_previous_updated_at?: string | null };
  visual_timeline?: { data: unknown; expected_previous_updated_at?: string | null };
  visual_placements?: { data: unknown; expected_previous_updated_at?: string | null };
  history?: { data: unknown; expected_previous_updated_at?: string | null };
  snapshots_manifest?: { data: unknown; expected_previous_updated_at?: string | null };
  composition_v2?: { data: HammerCompositionTransactionV2; expected_previous_updated_at?: string | null };
  media_provenance?: { data: HammerMediaProvenanceManifest; expected_previous_updated_at?: string | null };
  render_jobs?: { data: readonly HammerRenderJobV1[]; expected_previous_updated_at?: string | null };
  release_packet?: { data: HammerReleasePacketV2; expected_previous_updated_at?: string | null };
};

export async function saveHammerRecordingRevision(
  target: HammerPersistenceTarget,
  revisionId: string,
  request: Omit<SaveHammerRecordingRevisionRequest, "written_by">,
): Promise<PersistenceResult<{ revision: HammerRecordingRevisionRecord }>> {
  if (request.composition_v2 && !request.expected_revision_updated_at) {
    return { ok: false, status: 428, error: "Composition V2 writes require the last acknowledged recording revision timestamp." };
  }
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
    const info = readErrorInfo(payload, "Failed to seal canonical baseline.");
    return {
      ok: false,
      status: response.status,
      error: info.message,
      error_code: info.code,
      ...(typeof info.details === "undefined" ? {} : { error_details: info.details }),
    };
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
