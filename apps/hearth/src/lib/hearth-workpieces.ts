import { tongsFetch } from "./tongs-fetch";
import { classifyHttpDependencyFailure, HearthDependencyError } from "./hearth-dependency-state";
import { HearthDiscoveryError } from "./hearth-discovery-retry";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type HearthWorkpieceSummaryApiRow = {
  id?: unknown;
  workspace_id?: unknown;
  label?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
  archived_at?: unknown;
  archived_by?: unknown;
  archive_reason?: unknown;
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
  archivedAt: string | null;
  archivedBy: string | null;
  archiveReason: string | null;
  isArchived: boolean;
};

export type ListHearthWorkpiecesOptions = {
  includeArchived?: boolean;
  signal?: AbortSignal;
};

export type ArchiveHearthWorkpieceInput = {
  workspaceId: string;
  workpieceId: string;
  reason?: string | null;
};

export type RestoreHearthWorkpieceInput = {
  workspaceId: string;
  workpieceId: string;
};

export type RenameHearthWorkpieceInput = { workspaceId: string; workpieceId: string; title: string };

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
  const archivedAt = normalizeIso(item.archived_at);
  const archivedBy = normalizeUuid(item.archived_by);
  const archiveReason = readString(item.archive_reason);

  return {
    workpieceId,
    workspaceId: rowWorkspaceId,
    title: normalizeWorkpieceTitle(item.label, workpieceId),
    label: readString(item.label),
    createdAt,
    updatedAt,
    createdAtMs: createdAt ? Date.parse(createdAt) : 0,
    updatedAtMs: updatedAt ? Date.parse(updatedAt) : 0,
    archivedAt,
    archivedBy,
    archiveReason,
    isArchived: Boolean(archivedAt),
  };
}

function choosePreferredWorkpieceSummary(
  current: HearthWorkpieceSummary,
  next: HearthWorkpieceSummary,
): HearthWorkpieceSummary {
  if (next.updatedAtMs !== current.updatedAtMs) {
    return next.updatedAtMs > current.updatedAtMs ? next : current;
  }
  if (next.createdAtMs !== current.createdAtMs) {
    return next.createdAtMs > current.createdAtMs ? next : current;
  }
  const currentHasLabel = Boolean(current.label);
  const nextHasLabel = Boolean(next.label);
  if (currentHasLabel !== nextHasLabel) {
    return nextHasLabel ? next : current;
  }
  if (current.isArchived !== next.isArchived) {
    return next.isArchived ? next : current;
  }
  return current;
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
  const byWorkpieceId = new Map<string, HearthWorkpieceSummary>();
  for (const item of items) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const summary = parseWorkpieceSummaryRow(item as HearthWorkpieceSummaryApiRow, normalizedWorkspaceId);
    if (!summary) continue;
    const existing = byWorkpieceId.get(summary.workpieceId);
    if (!existing) {
      byWorkpieceId.set(summary.workpieceId, summary);
      continue;
    }
    byWorkpieceId.set(summary.workpieceId, choosePreferredWorkpieceSummary(existing, summary));
  }

  return [...byWorkpieceId.values()].sort((left, right) => {
    if (left.updatedAtMs !== right.updatedAtMs) return right.updatedAtMs - left.updatedAtMs;
    if (left.createdAtMs !== right.createdAtMs) return right.createdAtMs - left.createdAtMs;
    return left.title.localeCompare(right.title);
  });
}

function parseWorkpieceSummaryFromMutationPayload(
  workspaceId: string,
  payload: unknown,
): HearthWorkpieceSummary | null {
  const normalizedWorkspaceId = normalizeUuid(workspaceId);
  if (!normalizedWorkspaceId) return null;

  const body = payload as {
    ok?: unknown;
    data?: {
      workpiece?: unknown;
    };
  } | null;
  const item = body?.data?.workpiece;
  if (!item || typeof item !== "object" || Array.isArray(item)) return null;
  return parseWorkpieceSummaryRow(item as HearthWorkpieceSummaryApiRow, normalizedWorkspaceId);
}

function isDiscoveryTransportFailure(error: unknown): boolean {
  return error instanceof TypeError &&
    ["Failed to fetch", "fetch failed", "Load failed", "NetworkError when attempting to fetch resource."].includes(error.message);
}

export async function listHearthWorkpieces(
  workspaceId: string,
  options?: ListHearthWorkpiecesOptions,
): Promise<HearthWorkpieceSummary[]> {
  const normalizedWorkspaceId = normalizeUuid(workspaceId);
  if (!normalizedWorkspaceId) throw new HearthDiscoveryError("Invalid Episode workspace identity.", "terminal", undefined, "invalid_workspace");

  options?.signal?.throwIfAborted();
  const search = options?.includeArchived ? "?include_archived=1" : "";
  let response: Response;
  try {
    response = await tongsFetch(`/tongs/workspaces/${encodeURIComponent(normalizedWorkspaceId)}/episodes${search}`, {
      method: "GET",
      signal: options?.signal,
    });
  } catch (error) {
    options?.signal?.throwIfAborted();
    const networkFailure = isDiscoveryTransportFailure(error);
    throw new HearthDiscoveryError("Failed to load Episodes.", networkFailure ? "transport" : "terminal", undefined, undefined, error);
  }
  options?.signal?.throwIfAborted();
  if (!response.ok) {
    // A definitive terminal status cannot turn into a retryable timeout merely
    // because consuming its optional diagnostic body stalls.
    if (![502, 503, 504].includes(response.status)) {
      throw new HearthDiscoveryError("Failed to load Episodes.", "terminal", response.status);
    }
    let body: { error?: { code?: unknown } | string } | null = null;
    try {
      body = await response.json();
    } catch (error) {
      options?.signal?.throwIfAborted();
      // Gateways may return HTML instead of JSON. Other unknown exceptions
      // cannot acquire transient authority from the HTTP status alone.
      if (!(error instanceof SyntaxError) && !isDiscoveryTransportFailure(error)) {
        throw new HearthDiscoveryError("Failed to read Episode discovery response.", "terminal", response.status, undefined, error);
      }
    }
    options?.signal?.throwIfAborted();
    const code = typeof body?.error === "string" ? body.error : typeof body?.error?.code === "string" ? body.error.code : undefined;
    const temporary = code === undefined || ["temporarily_unavailable", "service_unavailable", "bad_gateway", "gateway_timeout", "upstream_timeout"].includes(code);
    throw new HearthDiscoveryError(
      classifyHttpDependencyFailure(response.status) === "unavailable" ? "Episode discovery is currently unavailable." : "Failed to load Episodes.",
      temporary ? "temporary_service" : "terminal", response.status, code,
    );
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch (error) {
    options?.signal?.throwIfAborted();
    if (isDiscoveryTransportFailure(error)) {
      throw new HearthDiscoveryError("Failed to consume Episode discovery response.", "transport", response.status, undefined, error);
    }
    throw new HearthDependencyError({
      dependency: "workpieces",
      kind: "failed",
      status: response.status,
      message: "Episode discovery returned an unreadable response.",
      cause: error,
    });
  }
  options?.signal?.throwIfAborted();
  const episodes = (
    body
    && typeof body === "object"
    && (body as { ok?: unknown }).ok === true
    && (body as { data?: unknown }).data
    && typeof (body as { data?: unknown }).data === "object"
  )
    ? (body as { data: { episodes?: unknown } }).data.episodes
    : null;
  if (!Array.isArray(episodes)) {
    throw new HearthDependencyError({
      dependency: "workpieces",
      kind: "failed",
      status: response.status,
      message: "Episode discovery returned a malformed response.",
    });
  }
  // This read boundary must not repair identity from request scope or silently
  // discard malformed rows. Mutation parsers retain their separate contracts.
  for (const row of episodes) {
    if (!row || typeof row !== "object" || Array.isArray(row) ||
      !normalizeUuid(row.id) || !normalizeUuid(row.workspace_id)) {
      throw new HearthDiscoveryError("Episode discovery returned malformed canonical identity.", "terminal", response.status, "invalid_canonical_identity");
    }
    if (normalizeUuid(row.workspace_id) !== normalizedWorkspaceId) {
      throw new HearthDiscoveryError("Episode discovery returned a different workspace.", "terminal", response.status, "workspace_mismatch");
    }
  }
  const parsed = parseHearthWorkpiecesPayload(normalizedWorkspaceId, body);
  if (episodes.length > 0 && parsed.length === 0) {
    throw new HearthDependencyError({
      dependency: "workpieces",
      kind: "failed",
      status: response.status,
      message: "Episode discovery returned no structurally usable entries.",
    });
  }
  return parsed;
}

export async function archiveHearthWorkpiece(
  input: ArchiveHearthWorkpieceInput,
): Promise<HearthWorkpieceSummary> {
  const workspaceId = normalizeUuid(input.workspaceId);
  const workpieceId = normalizeUuid(input.workpieceId);
  if (!workspaceId || !workpieceId) {
    throw new Error("workpiece_archive_failed");
  }

  const response = await tongsFetch(`/tongs/workpieces/${encodeURIComponent(workpieceId)}/archive`, {
    method: "POST",
    json: {
      workspace_id: workspaceId,
      reason: input.reason ?? null,
    },
  });
  if (!response.ok) {
    throw new Error("workpiece_archive_failed");
  }

  const body = await response.json();
  const summary = parseWorkpieceSummaryFromMutationPayload(workspaceId, body);
  if (!summary) {
    throw new Error("workpiece_archive_failed");
  }
  return summary;
}

export async function restoreHearthWorkpiece(
  input: RestoreHearthWorkpieceInput,
): Promise<HearthWorkpieceSummary> {
  const workspaceId = normalizeUuid(input.workspaceId);
  const workpieceId = normalizeUuid(input.workpieceId);
  if (!workspaceId || !workpieceId) {
    throw new Error("workpiece_restore_failed");
  }

  const response = await tongsFetch(`/tongs/workpieces/${encodeURIComponent(workpieceId)}/restore`, {
    method: "POST",
    json: {
      workspace_id: workspaceId,
    },
  });
  if (!response.ok) {
    throw new Error("workpiece_restore_failed");
  }

  const body = await response.json();
  const summary = parseWorkpieceSummaryFromMutationPayload(workspaceId, body);
  if (!summary) {
    throw new Error("workpiece_restore_failed");
  }
  return summary;
}

export async function renameHearthWorkpiece(input: RenameHearthWorkpieceInput): Promise<HearthWorkpieceSummary> {
  const workspaceId = normalizeUuid(input.workspaceId); const workpieceId = normalizeUuid(input.workpieceId); const title = input.title.trim();
  if (!workspaceId || !workpieceId || !title || title.length > 200) throw new Error("workpiece_rename_failed");
  const response = await tongsFetch(`/tongs/workpieces/${encodeURIComponent(workpieceId)}/title`, { method: "POST", json: { workspace_id: workspaceId, label: title } });
  if (!response.ok) throw new Error("workpiece_rename_failed");
  const summary = parseWorkpieceSummaryFromMutationPayload(workspaceId, await response.json());
  if (!summary) throw new Error("workpiece_rename_failed");
  return summary;
}
