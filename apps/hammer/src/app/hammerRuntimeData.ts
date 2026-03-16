import { tongsFetch } from "../lib/tongsFetch";
import { loadHammerPersistenceSnapshot } from "../persistence/hammerPersistence";

const WORKSPACE_CACHE_KEY = "forge_workspaces_cache_v1";
const ACTIVE_WORKSPACE_STORAGE_KEYS = ["forge_workspace_id_v1", "barstock_workspace_id"] as const;

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
  readiness: HammerRuntimeReadiness;
};

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

export function resolveHammerRouteWorkspaceId(search: string): string | null {
  return readWorkspaceIdFromSearch(search) ?? readHammerStoredActiveWorkspaceId();
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
  prepStatus: string | null;
  transcriptReady: boolean;
  visualReady: boolean;
  audioReady: boolean;
  editInstructionCount: number;
  stateUnavailable: boolean;
}): HammerRuntimeReadiness {
  const indicators: string[] = [];
  if (args.transcriptReady) {
    indicators.push("Transcript ready");
  }
  if (args.visualReady) {
    indicators.push("Visuals prepared");
  }
  if (args.audioReady) {
    indicators.push("Audio polish ready");
  }
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
        indicators: ["No Hammer state saved yet"],
      };
  }
}

export async function loadHammerWorkspaceProjects(
  workspaceId: string,
): Promise<HammerRuntimeProjectCard[]> {
  const episodes = await listHammerWorkspaceEpisodes(workspaceId);
  const stateResults = await Promise.allSettled(
    episodes.map((episode) => loadHammerPersistenceSnapshot({
      workspaceId,
      workpieceId: episode.id,
    })),
  );

  return episodes.map((episode, index) => {
    const stateResult = stateResults[index];
    const snapshot = stateResult?.status === "fulfilled" && stateResult.value.ok
      ? stateResult.value.data
      : null;
    const prepStatus = readString(snapshot?.state?.prep_status);
    const transcriptReady = Boolean(snapshot?.structured_transcript.data?.segments?.length);
    const visualReady = snapshot?.visual_placements.data?.status === "prepared";
    const audioReady = snapshot?.audio_polish.data?.status === "prepared";
    const editInstructionCount = snapshot?.edit_plan.data?.instructions.length ?? 0;
    const stateUnavailable = stateResult?.status === "rejected"
      || (stateResult?.status === "fulfilled" && !stateResult.value.ok);

    return {
      workpieceId: episode.id,
      workspaceId: episode.workspace_id,
      label: episode.label,
      createdAt: episode.created_at,
      updatedAt: episode.updated_at,
      archivedAt: episode.archived_at,
      readiness: buildRuntimeReadiness({
        prepStatus,
        transcriptReady,
        visualReady,
        audioReady,
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
