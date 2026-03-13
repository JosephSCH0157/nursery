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

function normalizePresenceListPayload(body: unknown): HearthWorkpiecePresence[] {
  const rows = (body as { data?: { presence?: unknown } })?.data?.presence;
  if (!Array.isArray(rows)) return [];
  return rows
    .map((entry) => normalizePresenceRow(entry))
    .filter((entry): entry is HearthWorkpiecePresence => Boolean(entry));
}

function normalizePresencePayload(body: unknown): HearthWorkpiecePresence | null {
  const row = (body as { data?: { presence?: unknown } })?.data?.presence;
  return normalizePresenceRow(row);
}

export async function listHearthWorkpiecePresence(
  workspaceId: string,
  workpieceId: string,
): Promise<HearthWorkpiecePresence[]> {
  const safeWorkspaceId = normalizeUuid(workspaceId);
  const safeWorkpieceId = normalizeUuid(workpieceId);
  if (!safeWorkspaceId || !safeWorkpieceId) return [];
  if (!(await hasTongsUserAccessToken())) return [];
  const response = await tongsFetch(
    `/tongs/workspaces/${encodeURIComponent(safeWorkspaceId)}/workpieces/${encodeURIComponent(safeWorkpieceId)}/presence`,
    { method: "GET" },
  );
  if (!response.ok) return [];
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    return [];
  }
  return normalizePresenceListPayload(body);
}

export async function upsertHearthWorkpiecePresence(args: {
  workspaceId: string;
  workpieceId: string;
  mode: HearthPresenceMode;
  displayName?: string | null;
}): Promise<HearthWorkpiecePresence | null> {
  const safeWorkspaceId = normalizeUuid(args.workspaceId);
  const safeWorkpieceId = normalizeUuid(args.workpieceId);
  if (!safeWorkspaceId || !safeWorkpieceId) return null;
  if (!(await hasTongsUserAccessToken())) return null;
  const response = await tongsFetch(
    `/tongs/workspaces/${encodeURIComponent(safeWorkspaceId)}/workpieces/${encodeURIComponent(safeWorkpieceId)}/presence`,
    {
      method: "PUT",
      json: {
        mode: args.mode,
        display_name: args.displayName ?? null,
      },
    },
  );
  if (!response.ok) return null;
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    return null;
  }
  return normalizePresencePayload(body);
}
