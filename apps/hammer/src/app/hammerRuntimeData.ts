import { tongsFetch } from "../lib/tongsFetch";
import type { HammerLaunchContext } from "../../../../packages/contracts/hammer/launch-context.contract";
import type { MediaKind, WorkspaceMediaMapping } from "../../../../packages/contracts/hammer/media-resolver.contract";
import { openHammerRecordingSession } from "../persistence/hammerRecordingRevisionPersistence";

const WORKSPACE_CACHE_KEY = "forge_workspaces_cache_v1";
const HAMMER_ACTIVE_WORKSPACE_KEY = "hammer_workspace_id_v1";
const ACTIVE_WORKSPACE_STORAGE_KEYS = [
  HAMMER_ACTIVE_WORKSPACE_KEY,
  "forge_workspace_id_v1",
  "barstock_workspace_id",
] as const;
const MANIFEST_PATH = "manifest.json";

type JsonRecord = Record<string, unknown>;

type HammerWorkspaceCacheRow = {
  id: string;
  name: string;
};

type HammerWorkspaceEpisodeRow = {
  id: string;
  workspace_id: string;
  label: string;
  created_at: string | null;
  updated_at: string | null;
  archived_at: string | null;
};

const workspaceProjectsInFlight = new Map<string, Promise<HammerRuntimeProjectCard[]>>();

export type HammerRuntimeReadinessTone = "ready" | "active" | "blocked";

export type HammerRuntimeReadiness = {
  statusLabel: string;
  tone: HammerRuntimeReadinessTone;
  indicators: string[];
};

export type HammerRuntimeProjectCard = {
  workpieceId: string;
  workspaceId: string;
  label: string;
  createdAt: string | null;
  updatedAt: string | null;
  archivedAt: string | null;
  isEditReady: boolean;
  readiness: HammerRuntimeReadiness;
  recording: {
    hasKeptTake: boolean;
    keptTakePath: string | null;
    keptTakeKind: "recording_video" | "recording_audio" | "unknown";
    keptTakeDurationMs: number | null;
    thumbnailPath: string | null;
  };
};

export type HammerRuntimeProjectSignals = {
  hasKeptTake: boolean;
  hasEditorSession: boolean;
  hasStructuredTranscript: boolean;
  hasVisualPlacements: boolean;
  hasAudioPolish: boolean;
  hasEditPlan: boolean;
};

export type HammerWorkpieceRecordingTruth = {
  hasKeptTake: boolean;
  latestKeptTakePath: string | null;
  latestKeptTake: {
    eventId: number | null;
    createdAt: string | null;
    filePath: string | null;
    recordingSessionId: string | null;
    anvilCaptureSessionId: string | null;
    contentType: string | null;
    bytes: number | null;
    durationMs: number | null;
    originalName: string | null;
  } | null;
};

export type HammerWorkpieceManifestContext = {
  workspaceId: string | null;
};

export function classifyHammerRuntimeProject(
  signals: HammerRuntimeProjectSignals,
): { isEditReady: boolean; editReadyReasons: string[] } {
  const editReadyReasons: string[] = [];

  if (signals.hasKeptTake) {
    editReadyReasons.push("Kept take available");
  }
  if (signals.hasEditorSession) {
    editReadyReasons.push("Hammer session saved");
  }
  if (signals.hasStructuredTranscript) {
    editReadyReasons.push("Transcript artifact saved");
  }
  if (signals.hasVisualPlacements) {
    editReadyReasons.push("Visual prep saved");
  }
  if (signals.hasAudioPolish) {
    editReadyReasons.push("Audio prep saved");
  }
  if (signals.hasEditPlan) {
    editReadyReasons.push("Edit plan saved");
  }

  return {
    isEditReady: editReadyReasons.length > 0,
    editReadyReasons,
  };
}

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readJsonRecord(value: unknown): JsonRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as JsonRecord;
}

function readFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readBrowserStorage(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return readString(window.localStorage.getItem(key));
  } catch {
    return null;
  }
}

function readWorkspaceIdFromSearch(search: string): string | null {
  const params = new URLSearchParams(search);
  return readString(
    params.get("workspace_id") ?? params.get("workspaceId") ?? params.get("workspace"),
  );
}

export function readHammerRouteWorkspaceId(search: string): string | null {
  return readWorkspaceIdFromSearch(search);
}

export function resolveHammerRouteWorkpieceId(search: string): string | null {
  const params = new URLSearchParams(search);
  return readString(
    params.get("workpiece_id") ?? params.get("workpieceId") ?? params.get("workpiece") ?? params.get("cradle_id"),
  );
}

export function readHammerStoredActiveWorkspaceId(): string | null {
  for (const key of ACTIVE_WORKSPACE_STORAGE_KEYS) {
    const value = readBrowserStorage(key);
    if (value) return value;
  }
  return null;
}

export function persistHammerStoredActiveWorkspaceId(workspaceId: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (workspaceId) {
      window.localStorage.setItem(HAMMER_ACTIVE_WORKSPACE_KEY, workspaceId);
      return;
    }
    window.localStorage.removeItem(HAMMER_ACTIVE_WORKSPACE_KEY);
  } catch {
    // ignore storage errors
  }
}

export function resolveHammerRouteWorkspaceId(search: string): string | null {
  return readHammerRouteWorkspaceId(search) ?? readHammerStoredActiveWorkspaceId();
}

export function readHammerWorkspaceCache(): HammerWorkspaceCacheRow[] {
  if (typeof window === "undefined") return [];
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(WORKSPACE_CACHE_KEY);
  } catch {
    return [];
  }
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((entry) => {
        const row = readJsonRecord(entry);
        const id = readString(row?.id);
        const name = readString(row?.name);
        if (!id || !name) return null;
        return { id, name };
      })
      .filter((row): row is HammerWorkspaceCacheRow => Boolean(row));
  } catch {
    return [];
  }
}

export function buildHammerCanonicalEditorHref(
  baseSearch: string,
  target: { workspaceId: string; workpieceId: string },
): string {
  const params = new URLSearchParams(baseSearch);
  params.set("workspace_id", target.workspaceId);
  params.set("workpiece_id", target.workpieceId);
  params.delete("hammer_stub");
  params.delete("output");
  const nextSearch = params.toString();
  return nextSearch ? `/app/hammer/editor?${nextSearch}` : "/app/hammer/editor";
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

async function listHammerWorkspaceEpisodes(workspaceId: string): Promise<HammerWorkspaceEpisodeRow[]> {
  const response = await tongsFetch(
    `/tongs/workspaces/${encodeURIComponent(workspaceId)}/episodes`,
    {
      method: "GET",
      headers: {
        accept: "application/json",
      },
    },
  );
  const payload = await readJsonBody(response);
  if (!response.ok) {
    const message = readString(readJsonRecord(readJsonRecord(payload)?.error)?.message)
      ?? "Hammer could not load projects for this workspace.";
    throw new Error(message);
  }

  const data = readJsonRecord(readJsonRecord(payload)?.data);
  const episodes = Array.isArray(data?.episodes)
    ? data.episodes as unknown[]
    : [];

  return episodes
    .map((entry) => {
      const row = readJsonRecord(entry);
      const id = readString(row?.id);
      const workspaceIdValue = readString(row?.workspace_id);
      if (!id || !workspaceIdValue) return null;
      return {
        id,
        workspace_id: workspaceIdValue,
        label: readString(row?.label) ?? "Untitled workpiece",
        created_at: readString(row?.created_at),
        updated_at: readString(row?.updated_at),
        archived_at: readString(row?.archived_at),
      };
    })
    .filter((row): row is HammerWorkspaceEpisodeRow => Boolean(row));
}

function buildRuntimeReadiness(args: {
  editReadyReasons: string[];
  prepStatus: string | null;
  editInstructionCount: number;
  stateUnavailable: boolean;
}): HammerRuntimeReadiness {
  const indicators = [...args.editReadyReasons];
  if (args.editInstructionCount > 0) {
    indicators.push(`${args.editInstructionCount} staged edit${args.editInstructionCount === 1 ? "" : "s"}`);
  }
  if (args.stateUnavailable && indicators.length === 0) {
    indicators.push("Hammer state unavailable");
  }

  switch (args.prepStatus) {
    case "prepared":
      return {
        statusLabel: "Ready",
        tone: "ready",
        indicators: indicators.length > 0 ? indicators : ["Hammer state saved"],
      };
    case "preparing":
      return {
        statusLabel: "Preparing",
        tone: "active",
        indicators: indicators.length > 0 ? indicators : ["Transcript prep in progress"],
      };
    case "prep_failed":
      return {
        statusLabel: "Needs attention",
        tone: "blocked",
        indicators: indicators.length > 0 ? indicators : ["Prep failed"],
      };
    default:
      if (indicators.length > 0) {
        return {
          statusLabel: "In progress",
          tone: "active",
          indicators,
        };
      }
      return {
        statusLabel: "Not started",
        tone: "blocked",
        indicators: ["No kept take or Hammer-editable state yet"],
      };
  }
}

export function extractHammerWorkpieceRecordingTruth(
  value: unknown,
): HammerWorkpieceRecordingTruth {
  const truth = readJsonRecord(value);
  const latestKeptTake = readJsonRecord(truth?.latest_kept_take);
  const keptTake = latestKeptTake
    ? {
      eventId: readFiniteNumber(latestKeptTake.event_id),
      createdAt: readString(latestKeptTake.created_at),
      filePath: readString(latestKeptTake.file_path),
      recordingSessionId: readString(latestKeptTake.recording_session_id),
      anvilCaptureSessionId: readString(latestKeptTake.anvil_capture_session_id),
      contentType: readString(latestKeptTake.content_type),
      bytes: readFiniteNumber(latestKeptTake.bytes),
      durationMs: readFiniteNumber(latestKeptTake.duration_ms),
      originalName: readString(latestKeptTake.original_name),
    }
    : null;
  return {
    hasKeptTake: truth?.recorded === true,
    latestKeptTakePath: keptTake?.filePath ?? null,
    latestKeptTake: keptTake,
  };
}

function inferKeptTakeMediaKind(
  receipt: NonNullable<HammerWorkpieceRecordingTruth["latestKeptTake"]>,
): MediaKind {
  const contentType = receipt.contentType?.trim().toLowerCase() ?? "";
  if (contentType.startsWith("audio/")) return "recording_audio";
  if (contentType.startsWith("video/")) return "recording_video";

  const filePath = receipt.filePath?.trim().toLowerCase() ?? "";
  if (/\.(wav|mp3|m4a|aac|flac|ogg|opus)$/i.test(filePath)) {
    return "recording_audio";
  }

  return "recording_video";
}

function inferRecordingKindFromTruth(truth: HammerWorkpieceRecordingTruth): "recording_video" | "recording_audio" | "unknown" {
  if (!truth.hasKeptTake || !truth.latestKeptTake) return "unknown";
  const kind = inferKeptTakeMediaKind(truth.latestKeptTake);
  if (kind === "recording_audio") return "recording_audio";
  if (kind === "recording_video") return "recording_video";
  return "unknown";
}

function buildKeptTakeMediaId(
  workpieceId: string,
  receipt: NonNullable<HammerWorkpieceRecordingTruth["latestKeptTake"]>,
): string {
  if (receipt.recordingSessionId) {
    return `recording-session:${receipt.recordingSessionId}`;
  }
  if (receipt.anvilCaptureSessionId) {
    return `capture-session:${receipt.anvilCaptureSessionId}`;
  }
  if (receipt.eventId != null) {
    return `kept-take:${workpieceId}:${receipt.eventId}`;
  }
  return `kept-take:${workpieceId}`;
}

export function buildHammerLaunchContextFromRecordingTruth(args: {
  workspaceId: string;
  workpieceId: string;
  recordingTruth: HammerWorkpieceRecordingTruth;
  workspaceMapping: WorkspaceMediaMapping | null;
}): HammerLaunchContext | null {
  const keptTake = args.recordingTruth.latestKeptTake;
  if (!args.recordingTruth.hasKeptTake || !keptTake) {
    return null;
  }

  const filePath = keptTake.filePath?.trim() ?? "";
  if (!filePath) {
    return null;
  }

  const mediaId = buildKeptTakeMediaId(args.workpieceId, keptTake);
  const hasLocalWorkspaceMapping = Boolean(args.workspaceMapping?.local_root_abs);
  return {
    workspace_id: args.workspaceId,
    workpiece_id: args.workpieceId,
    source_mode: "tongs",
    transcript: {
      kind: "tongs-stub",
      transcript_id: `transcript_seed:${args.workpieceId}`,
      segments: [],
      label: "pending transcript",
    },
    media: {
      kind: "tongs-stub",
      ref: {
        media_id: mediaId,
        kind: inferKeptTakeMediaKind(keptTake),
        source_hint: hasLocalWorkspaceMapping ? "local" : "cloud",
        local_relpath: filePath,
        ...(!hasLocalWorkspaceMapping
          ? { cloud_uri: `tongs://workpieces/${args.workpieceId}/${filePath}` }
          : {}),
        ...(keptTake.bytes != null ? { byte_size: keptTake.bytes } : {}),
        ...(keptTake.durationMs != null ? { duration_ms: keptTake.durationMs } : {}),
      },
      ...(args.workspaceMapping ? { workspace_mapping: { ...args.workspaceMapping } } : {}),
      label: keptTake.originalName?.trim() || `tongs:${mediaId}`,
    },
    preview_mode: "edit-aware",
  };
}

export function extractHammerWorkpieceManifestContext(
  manifestValue: unknown,
): HammerWorkpieceManifestContext {
  const manifest = readJsonRecord(manifestValue);
  return {
    workspaceId: readString(manifest?.workspace_id),
  };
}

export async function loadHammerWorkpieceManifestContext(
  workpieceId: string,
): Promise<HammerWorkpieceManifestContext> {
  const response = await tongsFetch(
    `/tongs/workpieces/${encodeURIComponent(workpieceId)}/read-file?path=${encodeURIComponent(MANIFEST_PATH)}`,
    {
      method: "GET",
      headers: {
        accept: "application/json",
      },
    },
  );

  if (response.status === 404) {
    return {
      workspaceId: null,
    };
  }

  const payload = await readJsonBody(response);
  if (!response.ok) {
    throw new Error(
      readString(readJsonRecord(readJsonRecord(payload)?.error)?.message)
        ?? "Hammer could not read workpiece manifest state.",
    );
  }

  const manifest = readJsonRecord(readJsonRecord(payload)?.data);
  return extractHammerWorkpieceManifestContext(manifest);
}

export async function loadHammerWorkpieceRecordingTruth(
  workpieceId: string,
): Promise<HammerWorkpieceRecordingTruth> {
  const response = await tongsFetch(
    `/tongs/workpieces/${encodeURIComponent(workpieceId)}/recording-truth`,
    {
      method: "GET",
      headers: {
        accept: "application/json",
      },
    },
  );

  if (response.status === 404) {
    return {
      hasKeptTake: false,
      latestKeptTakePath: null,
      latestKeptTake: null,
    };
  }

  const payload = await readJsonBody(response);
  if (!response.ok) {
    throw new Error(
      readString(readJsonRecord(readJsonRecord(payload)?.error)?.message)
        ?? "Hammer could not read recording truth.",
    );
  }

  const truth = readJsonRecord(readJsonRecord(payload)?.data)?.truth;
  return extractHammerWorkpieceRecordingTruth(truth);
}

export async function loadHammerWorkspaceProjects(
  workspaceId: string,
): Promise<HammerRuntimeProjectCard[]> {
  const existing = workspaceProjectsInFlight.get(workspaceId);
  if (existing) {
    return existing;
  }

  const loadPromise = (async (): Promise<HammerRuntimeProjectCard[]> => {
    const episodes = await listHammerWorkspaceEpisodes(workspaceId);
    const detailResults = await Promise.allSettled(
      episodes.map(async (episode) => {
        const truthResult = await Promise.allSettled([loadHammerWorkpieceRecordingTruth(episode.id)]);
        const recordingTruth = truthResult[0]?.status === "fulfilled"
          ? truthResult[0].value
          : { hasKeptTake: false, latestKeptTakePath: null, latestKeptTake: null };

        // Avoid POST /hammer/session when the workpiece has no kept take; session open would correctly 409 but it clutters the runtime library.
        const sessionResult = recordingTruth.hasKeptTake
          ? await Promise.allSettled([
              openHammerRecordingSession({
                workspaceId,
                workpieceId: episode.id,
              }),
            ])
          : [{ status: "fulfilled" as const, value: null }];

        return {
          sessionResult: sessionResult[0]?.status === "fulfilled" ? sessionResult[0].value : null,
          recordingTruth,
          recordingTruthUnavailable: truthResult[0]?.status === "rejected",
        };
      }),
    );

    return episodes.map((episode, index) => {
      const detailResult = detailResults[index];
      const sessionResult = detailResult?.status === "fulfilled"
        ? detailResult.value.sessionResult
        : null;
      const recordingTruth = detailResult?.status === "fulfilled"
        ? detailResult.value.recordingTruth
        : { hasKeptTake: false, latestKeptTakePath: null, latestKeptTake: null };
      const canonicalRecording = sessionResult?.ok ? sessionResult.data.canonical_recording : null;
      const revision = sessionResult?.ok ? sessionResult.data.revision : null;
      const prepStatus = canonicalRecording?.baseline_transcript_path
        ? "prepared"
        : revision?.revision_transcript_path
        ? "prepared"
        : null;
      const hasEditorSession = Boolean(revision?.editor_session_path);
      const hasStructuredTranscript = Boolean(
        canonicalRecording?.baseline_transcript_path || revision?.revision_transcript_path,
      );
      const hasVisualPlacements = Boolean(revision?.visual_placements_path);
      const hasAudioPolish = Boolean(revision?.audio_polish_path);
      const hasEditPlan = false;
      const editReadiness = classifyHammerRuntimeProject({
        hasKeptTake: recordingTruth.hasKeptTake,
        hasEditorSession,
        hasStructuredTranscript,
        hasVisualPlacements,
        hasAudioPolish,
        hasEditPlan,
      });
      const editInstructionCount = 0;
      const stateUnavailable = detailResult?.status === "rejected"
        || (detailResult?.status === "fulfilled" && (!sessionResult?.ok || detailResult.value.recordingTruthUnavailable));

      return {
        workpieceId: episode.id,
        workspaceId: episode.workspace_id,
        label: episode.label,
        createdAt: episode.created_at,
        updatedAt: episode.updated_at,
        archivedAt: episode.archived_at,
        isEditReady: editReadiness.isEditReady,
        readiness: buildRuntimeReadiness({
          editReadyReasons: editReadiness.editReadyReasons,
          prepStatus,
          editInstructionCount,
          stateUnavailable,
        }),
        recording: {
          hasKeptTake: recordingTruth.hasKeptTake,
          keptTakePath: recordingTruth.latestKeptTakePath,
          keptTakeKind: inferRecordingKindFromTruth(recordingTruth),
          keptTakeDurationMs: recordingTruth.latestKeptTake?.durationMs ?? null,
          thumbnailPath: null,
        },
      };
    });
  })();

  workspaceProjectsInFlight.set(workspaceId, loadPromise);
  try {
    return await loadPromise;
  } finally {
    if (workspaceProjectsInFlight.get(workspaceId) === loadPromise) {
      workspaceProjectsInFlight.delete(workspaceId);
    }
  }
}

export async function loadHammerWorkspaceWorkpieceLabel(
  workspaceId: string,
  workpieceId: string,
): Promise<string | null> {
  const episodes = await listHammerWorkspaceEpisodes(workspaceId);
  const match = episodes.find((episode) => episode.id === workpieceId);
  return match?.label ?? null;
}
