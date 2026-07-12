import { hasTongsUserAccessToken, tongsFetch } from "./tongs-fetch";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type HearthPresenceMode = "viewing" | "editing";

export type HearthWorkpiecePresence = {
  workspaceId: string;
  workpieceId: string;
  userId: string;
  displayName: string | null;
  mode: HearthPresenceMode;
  lastSeenAt: string;
};

export type HearthPresenceResult<T> =
  | { kind: "success"; value: T }
  | { kind: "unavailable"; reason: string }
  | { kind: "failed"; error: string };

type PresenceApiRow = {
  workspace_id?: unknown;
  workpiece_id?: unknown;
  user_id?: unknown;
  display_name?: unknown;
  mode?: unknown;
  last_seen_at?: unknown;
};

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function normalizeUuid(value: unknown): string | null {
  const candidate = readString(value);
  if (!candidate) return null;
  return UUID_RE.test(candidate) ? candidate.toLowerCase() : null;
}

function normalizePresenceMode(value: unknown): HearthPresenceMode | null {
  const mode = readString(value)?.toLowerCase();
  if (mode === "viewing" || mode === "editing") return mode;
  return null;
}

function normalizeIsoTimestamp(value: unknown): string | null {
  const iso = readString(value);
  if (!iso) return null;
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toISOString();
}

function normalizePresenceRow(row: unknown): HearthWorkpiecePresence | null {
  if (!row || typeof row !== "object" || Array.isArray(row)) return null;
  const item = row as PresenceApiRow;
  const workspaceId = normalizeUuid(item.workspace_id);
  const workpieceId = normalizeUuid(item.workpiece_id);
  const userId = normalizeUuid(item.user_id);
  const mode = normalizePresenceMode(item.mode);
  const lastSeenAt = normalizeIsoTimestamp(item.last_seen_at);
  if (!workspaceId || !workpieceId || !userId || !mode || !lastSeenAt) return null;
  return {
    workspaceId,
    workpieceId,
    userId,
    displayName: readString(item.display_name),
    mode,
    lastSeenAt,
  };
}

function normalizePresenceListPayload(body: unknown): HearthWorkpiecePresence[] | null {
  const rows = (body as { data?: { presence?: unknown } })?.data?.presence;
  if (!Array.isArray(rows)) return null;
  const normalized = rows
    .map((entry) => normalizePresenceRow(entry))
    .filter((entry): entry is HearthWorkpiecePresence => Boolean(entry));
  return rows.length > 0 && normalized.length === 0 ? null : normalized;
}

function normalizePresencePayload(body: unknown): HearthWorkpiecePresence | null {
  const row = (body as { data?: { presence?: unknown } })?.data?.presence;
  return normalizePresenceRow(row);
}

export async function listHearthWorkpiecePresence(
  workspaceId: string,
  workpieceId: string,
): Promise<HearthPresenceResult<HearthWorkpiecePresence[]>> {
  const safeWorkspaceId = normalizeUuid(workspaceId);
  const safeWorkpieceId = normalizeUuid(workpieceId);
  if (!safeWorkspaceId || !safeWorkpieceId) {
    return { kind: "unavailable", reason: "Presence requires a valid workspace and workpiece." };
  }
  if (!(await hasTongsUserAccessToken())) {
    return { kind: "unavailable", reason: "Sign in to use team presence." };
  }
  let response: Response;
  try {
    response = await tongsFetch(
      `/tongs/workspaces/${encodeURIComponent(safeWorkspaceId)}/workpieces/${encodeURIComponent(safeWorkpieceId)}/presence`,
      { method: "GET" },
    );
  } catch {
    return { kind: "failed", error: "Unable to refresh team presence." };
  }
  if (!response.ok) {
    return response.status === 404 || response.status === 501 || response.status === 503
      ? { kind: "unavailable", reason: "Team presence is currently unavailable." }
      : { kind: "failed", error: "Unable to refresh team presence." };
  }
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    return { kind: "failed", error: "Team presence returned an unreadable response." };
  }
  const rows = normalizePresenceListPayload(body);
  return rows
    ? { kind: "success", value: rows }
    : { kind: "failed", error: "Team presence returned a malformed response." };
}

export async function upsertHearthWorkpiecePresence(args: {
  workspaceId: string;
  workpieceId: string;
  mode: HearthPresenceMode;
  displayName?: string | null;
}): Promise<HearthPresenceResult<HearthWorkpiecePresence>> {
  const safeWorkspaceId = normalizeUuid(args.workspaceId);
  const safeWorkpieceId = normalizeUuid(args.workpieceId);
  if (!safeWorkspaceId || !safeWorkpieceId) {
    return { kind: "unavailable", reason: "Presence requires a valid workspace and workpiece." };
  }
  if (!(await hasTongsUserAccessToken())) {
    return { kind: "unavailable", reason: "Sign in to use team presence." };
  }
  let response: Response;
  try {
    response = await tongsFetch(
      `/tongs/workspaces/${encodeURIComponent(safeWorkspaceId)}/workpieces/${encodeURIComponent(safeWorkpieceId)}/presence`,
      {
        method: "PUT",
        json: {
          mode: args.mode,
          display_name: args.displayName ?? null,
        },
      },
    );
  } catch {
    return { kind: "failed", error: "Unable to publish team presence." };
  }
  if (!response.ok) {
    return response.status === 404 || response.status === 501 || response.status === 503
      ? { kind: "unavailable", reason: "Team presence is currently unavailable." }
      : { kind: "failed", error: "Unable to publish team presence." };
  }
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    return { kind: "failed", error: "Team presence returned an unreadable response." };
  }
  const presence = normalizePresencePayload(body);
  return presence
    ? { kind: "success", value: presence }
    : { kind: "failed", error: "Team presence returned a malformed response." };
}
