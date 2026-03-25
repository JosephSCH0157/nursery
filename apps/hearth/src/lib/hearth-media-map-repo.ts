import type { EpisodeMediaMap } from "./episode-package-v2";
import { tongsFetch } from "./tongs-fetch";

export const HEARTH_MEDIA_MAP_PATH = "hearth/media_map.v1.json";

type MediaMapReadResult =
  | { ok: true; mediaMap: EpisodeMediaMap | null }
  | { ok: false; status: number; error: string };

type MediaMapSaveResult =
  | { ok: true; status: number }
  | { ok: false; status: number; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readErrorMessage(payload: unknown, fallback: string): string {
  if (!isRecord(payload)) return fallback;
  const error = isRecord(payload.error) ? payload.error : null;
  return readString(error?.message) ?? readString(payload.message) ?? fallback;
}

async function readJsonBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

export async function readWorkpieceEpisodeMediaMap(workpieceId: string): Promise<MediaMapReadResult> {
  const response = await tongsFetch(
    `/tongs/workpieces/${encodeURIComponent(workpieceId)}/read-file?path=${encodeURIComponent(HEARTH_MEDIA_MAP_PATH)}`,
    { method: "GET" },
  );
  const payload = await readJsonBody(response);
  if (response.status === 404) {
    return { ok: true, mediaMap: null };
  }
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: readErrorMessage(payload, "Unable to read Episode Media Map."),
    };
  }
  if (!isRecord(payload) || payload.ok !== true || !isRecord(payload.data)) {
    return {
      ok: false,
      status: response.status,
      error: "Episode Media Map response was invalid.",
    };
  }
  return {
    ok: true,
    mediaMap: payload.data as unknown as EpisodeMediaMap,
  };
}

export async function saveWorkpieceEpisodeMediaMap(args: {
  workpieceId: string;
  mediaMap: EpisodeMediaMap;
  writtenBy?: { tool: string; tool_version: string; lane: string };
  eventName?: string;
  eventPayload?: Record<string, unknown>;
}): Promise<MediaMapSaveResult> {
  const response = await tongsFetch(
    `/tongs/workpieces/${encodeURIComponent(args.workpieceId)}/commit-file`,
    {
      method: "POST",
      json: {
        path: HEARTH_MEDIA_MAP_PATH,
        content_type: "application/json",
        json: args.mediaMap,
        written_by: args.writtenBy ?? {
          tool: "hearth",
          tool_version: "forge-v1.2.0",
          lane: "forge-managed",
        },
        event_name: args.eventName ?? "hearth.media_map.saved.v1",
        event_payload: args.eventPayload ?? {
          entry_count: args.mediaMap.entries.length,
          script_version_id: args.mediaMap.script_version_id,
        },
      },
    },
  );
  const payload = await readJsonBody(response);
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: readErrorMessage(payload, "Unable to save Episode Media Map."),
    };
  }
  return {
    ok: true,
    status: response.status,
  };
}
