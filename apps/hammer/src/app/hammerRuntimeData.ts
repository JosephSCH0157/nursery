import { tongsFetch } from "../lib/tongsFetch";
import { loadHammerPersistenceSnapshot } from "../persistence/hammerPersistence";

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
  return {
    hasKeptTake: truth?.recorded === true,
    latestKeptTakePath: readString(latestKeptTake?.file_path),
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
  const episodes = await listHammerWorkspaceEpisodes(workspaceId);
  const detailResults = await Promise.allSettled(
    episodes.map(async (episode) => {
      const [snapshotResult, truthResult] = await Promise.allSettled([
        loadHammerPersistenceSnapshot({
          workspaceId,
          workpieceId: episode.id,
        }),
        loadHammerWorkpieceRecordingTruth(episode.id),
      ]);

      return {
        snapshotResult: snapshotResult.status === "fulfilled" ? snapshotResult.value : null,
        recordingTruth: truthResult.status === "fulfilled"
          ? truthResult.value
          : { hasKeptTake: false, latestKeptTakePath: null },
        recordingTruthUnavailable: truthResult.status === "rejected",
      };
    }),
  );

  return episodes.map((episode, index) => {
    const detailResult = detailResults[index];
    const snapshotResult = detailResult?.status === "fulfilled"
      ? detailResult.value.snapshotResult
      : null;
    const recordingTruth = detailResult?.status === "fulfilled"
      ? detailResult.value.recordingTruth
      : { hasKeptTake: false, latestKeptTakePath: null };
    const snapshot = snapshotResult?.ok
      ? snapshotResult.data
      : null;
    const prepStatus = readString(snapshot?.state?.prep_status);
    const hasEditorSession = Boolean(snapshot?.state?.editor_session_path || snapshot?.editor_session.path || snapshot?.editor_session.data);
    const hasStructuredTranscript = Boolean(
      snapshot?.state?.transcript_artifact_path
      || snapshot?.structured_transcript.path
      || snapshot?.structured_transcript.data?.segments?.length,
    );
    const hasVisualPlacements = Boolean(
      snapshot?.state?.visual_placement_artifact_path
      || snapshot?.visual_placements.path
      || snapshot?.visual_placements.data,
    );
    const hasAudioPolish = Boolean(
      snapshot?.state?.audio_polish_artifact_path
      || snapshot?.audio_polish.path
      || snapshot?.audio_polish.data,
    );
    const hasEditPlan = Boolean(
      snapshot?.state?.edit_plan_artifact_path
      || snapshot?.edit_plan.path
      || snapshot?.edit_plan.data,
    );
    const editReadiness = classifyHammerRuntimeProject({
      hasKeptTake: recordingTruth.hasKeptTake,
      hasEditorSession,
      hasStructuredTranscript,
      hasVisualPlacements,
      hasAudioPolish,
      hasEditPlan,
    });
    const editInstructionCount = snapshot?.edit_plan.data?.instructions.length ?? 0;
    const stateUnavailable = detailResult?.status === "rejected"
      || (detailResult?.status === "fulfilled" && (!snapshotResult?.ok || detailResult.value.recordingTruthUnavailable));

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
    };
  });
}

export async function loadHammerWorkspaceWorkpieceLabel(
  workspaceId: string,
  workpieceId: string,
): Promise<string | null> {
  const episodes = await listHammerWorkspaceEpisodes(workspaceId);
  const match = episodes.find((episode) => episode.id === workpieceId);
  return match?.label ?? null;
}
