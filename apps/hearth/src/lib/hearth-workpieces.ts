import { tongsFetch } from "./tongs-fetch";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type HearthWorkpieceSummaryApiRow = {
  id?: unknown;
  workspace_id?: unknown;
  label?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
};

export type HearthWorkpieceSummary = {
  workpieceId: string;
  workspaceId: string;
  title: string;
  label: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  createdAtMs: number;
  updatedAtMs: number;
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

function normalizeIso(value: unknown): string | null {
  const iso = readString(value);
  if (!iso) return null;
  const timestamp = Date.parse(iso);
  if (!Number.isFinite(timestamp)) return null;
  return new Date(timestamp).toISOString();
}

export function normalizeWorkpieceTitle(label: unknown, workpieceId: string): string {
  const normalizedLabel = readString(label);
  if (normalizedLabel) return normalizedLabel;
  const shortId = workpieceId.length > 8 ? workpieceId.slice(0, 8) : workpieceId;
  return `Episode ${shortId}`;
}

function parseWorkpieceSummaryRow(
  item: HearthWorkpieceSummaryApiRow,
  workspaceId: string,
): HearthWorkpieceSummary | null {
  const workpieceId = normalizeUuid(item.id);
  const rowWorkspaceId = normalizeUuid(item.workspace_id) ?? workspaceId;
  if (!workpieceId || !rowWorkspaceId) return null;

  const createdAt = normalizeIso(item.created_at);
  const updatedAt = normalizeIso(item.updated_at);

  return {
    workpieceId,
    workspaceId: rowWorkspaceId,
    title: normalizeWorkpieceTitle(item.label, workpieceId),
    label: readString(item.label),
    createdAt,
    updatedAt,
    createdAtMs: createdAt ? Date.parse(createdAt) : 0,
    updatedAtMs: updatedAt ? Date.parse(updatedAt) : 0,
  };
}

export function parseHearthWorkpiecesPayload(
  workspaceId: string,
  payload: unknown,
): HearthWorkpieceSummary[] {
  const normalizedWorkspaceId = normalizeUuid(workspaceId);
  if (!normalizedWorkspaceId) return [];

  const body = payload as {
    ok?: unknown;
    data?: {
      episodes?: unknown;
    };
  } | null;

  const items = Array.isArray(body?.data?.episodes) ? body.data.episodes : [];
  const out: HearthWorkpieceSummary[] = [];
  for (const item of items) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const summary = parseWorkpieceSummaryRow(item as HearthWorkpieceSummaryApiRow, normalizedWorkspaceId);
    if (summary) out.push(summary);
  }

  return out.sort((left, right) => {
    if (left.updatedAtMs !== right.updatedAtMs) return right.updatedAtMs - left.updatedAtMs;
    if (left.createdAtMs !== right.createdAtMs) return right.createdAtMs - left.createdAtMs;
    return left.title.localeCompare(right.title);
  });
}

export async function listHearthWorkpieces(workspaceId: string): Promise<HearthWorkpieceSummary[]> {
  const normalizedWorkspaceId = normalizeUuid(workspaceId);
  if (!normalizedWorkspaceId) return [];

  const response = await tongsFetch(`/tongs/workspaces/${encodeURIComponent(normalizedWorkspaceId)}/episodes`, {
    method: "GET",
  });
  if (!response.ok) {
    throw new Error("workpiece_list_failed");
  }

  const body = await response.json();
  return parseHearthWorkpiecesPayload(normalizedWorkspaceId, body);
}
