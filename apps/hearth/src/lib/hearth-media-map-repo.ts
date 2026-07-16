import {
  createEmptyEpisodePackageV2,
  ensureMediaMapV2,
  type EpisodeMediaMap,
} from "./episode-package-v2";
import { tongsFetch } from "./tongs-fetch";

export const HEARTH_MEDIA_MAP_PATH = "hearth/media_map.v1.json";
export const HEARTH_MEDIA_MAP_RECOVERY_PATH = "hearth/media_map.last-generation.v1.json";

type MediaMapReadResult =
  | { ok: true; mediaMap: EpisodeMediaMap | null }
  | { ok: false; status: number; error: string };

type MediaMapSaveResult =
  | { ok: true; status: number; mediaMap: EpisodeMediaMap; artifactUpdatedAt: string }
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

function readCanonicalCommitUpdatedAt(payload: unknown, expectedPath: string): string | null {
  if (!isRecord(payload) || payload.ok !== true || !isRecord(payload.data)) return null;
  if (readString(payload.data.path) !== expectedPath || !isRecord(payload.data.file_row)) return null;
  return readString(payload.data.file_row.updated_at);
}

function mediaMapsEqual(left: EpisodeMediaMap, right: EpisodeMediaMap): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export async function readWorkpieceEpisodeMediaMap(workpieceId: string): Promise<MediaMapReadResult> {
  let response: Response;
  try {
    response = await tongsFetch(
      `/tongs/workpieces/${encodeURIComponent(workpieceId)}/read-file?path=${encodeURIComponent(HEARTH_MEDIA_MAP_PATH)}`,
      { method: "GET" },
    );
  } catch {
    return {
      ok: false,
      status: 0,
      error: "Unable to read Episode Media Map.",
    };
  }
  const payload = await readJsonBody(response);
  if (response.status === 404) {
    return { ok: true, mediaMap: null };
  }
  if (
    response.ok
    && isRecord(payload)
    && payload.ok === true
    && (
      payload.exists === false
      || payload.data == null
    )
  ) {
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
    mediaMap: ensureMediaMapV2({
      ...createEmptyEpisodePackageV2(),
      media_map: payload.data as unknown as EpisodeMediaMap,
    }).media_map,
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
  const artifactUpdatedAt = readCanonicalCommitUpdatedAt(payload, HEARTH_MEDIA_MAP_PATH);
  if (!response.ok || !artifactUpdatedAt) {
    return {
      ok: false,
      status: response.status,
      error: response.ok
        ? "Episode Media Map save returned an invalid canonical acknowledgement."
        : readErrorMessage(payload, "Unable to save Episode Media Map."),
    };
  }

  // A write acknowledgement only proves that Tongs accepted the request. Do not
  // tell the user the map is saved until the same cold-boot read path recovers it.
  const verified = await readWorkpieceEpisodeMediaMap(args.workpieceId);
  if (!verified.ok) {
    return {
      ok: false,
      status: verified.status,
      error: "Episode Media Map was written, but Hearth could not verify the durable saved state.",
    };
  }
  if (!verified.mediaMap || !mediaMapsEqual(verified.mediaMap, args.mediaMap)) {
    return {
      ok: false,
      status: 409,
      error: "Episode Media Map save acknowledgement did not match the canonical reload state.",
    };
  }
  return {
    ok: true,
    status: response.status,
    mediaMap: verified.mediaMap,
    artifactUpdatedAt,
  };
}

export async function readRecoverableEpisodeMediaMap(workpieceId: string): Promise<MediaMapReadResult> {
  let response: Response;
  try {
    response = await tongsFetch(
      `/tongs/workpieces/${encodeURIComponent(workpieceId)}/read-file?path=${encodeURIComponent(HEARTH_MEDIA_MAP_RECOVERY_PATH)}`,
      { method: "GET" },
    );
  } catch {
    return { ok: false, status: 0, error: "Unable to read the recoverable media-map generation." };
  }
  const payload = await readJsonBody(response);
  if (response.status === 404 || (response.ok && isRecord(payload) && payload.ok === true && (payload.exists === false || payload.data == null))) {
    return { ok: true, mediaMap: null };
  }
  if (!response.ok || !isRecord(payload) || payload.ok !== true || !isRecord(payload.data)) {
    return { ok: false, status: response.status, error: readErrorMessage(payload, "Unable to read the recoverable media-map generation.") };
  }
  return {
    ok: true,
    mediaMap: ensureMediaMapV2({ ...createEmptyEpisodePackageV2(), media_map: payload.data as unknown as EpisodeMediaMap }).media_map,
  };
}

export async function saveRecoverableEpisodeMediaMap(args: {
  workpieceId: string;
  mediaMap: EpisodeMediaMap;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const response = await tongsFetch(`/tongs/workpieces/${encodeURIComponent(args.workpieceId)}/commit-file`, {
    method: "POST",
    json: {
      path: HEARTH_MEDIA_MAP_RECOVERY_PATH,
      content_type: "application/json",
      json: args.mediaMap,
      written_by: { tool: "hearth", tool_version: "forge-v1.2.0", lane: "recovery" },
      event_name: "hearth.media_map.generation.staged.v1",
      event_payload: { entry_count: args.mediaMap.entries.length, script_version_id: args.mediaMap.script_version_id },
    },
  });
  const payload = await readJsonBody(response);
  return response.ok && readCanonicalCommitUpdatedAt(payload, HEARTH_MEDIA_MAP_RECOVERY_PATH)
    ? { ok: true }
    : { ok: false, error: readErrorMessage(payload, "Unable to stage the recoverable media-map generation.") };
}
