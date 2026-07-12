import type { BarStockSpark } from "./barstock-sparks";
import { tongsFetch } from "./tongs-fetch";
import { classifyHttpDependencyFailure, HearthDependencyError } from "./hearth-dependency-state";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type HearthBarStockSparkApiRow = {
  id?: unknown;
  workspace_id?: unknown;
  assignment_id?: unknown;
  title?: unknown;
  body?: unknown;
  tags?: unknown;
  status?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
  linked_workpiece_id?: unknown;
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

function normalizeTimestampMs(value: unknown): number {
  const iso = readString(value);
  if (!iso) return 0;
  const timestamp = Date.parse(iso);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function compareSparkFreshness(left: BarStockSpark, right: BarStockSpark): number {
  if (left.updatedAt !== right.updatedAt) return left.updatedAt - right.updatedAt;
  if (left.createdAt !== right.createdAt) return left.createdAt - right.createdAt;
  return left.id.localeCompare(right.id);
}

function mergeSparkRecords(primary: BarStockSpark, overlay: BarStockSpark): BarStockSpark {
  const freshest = compareSparkFreshness(primary, overlay) >= 0 ? primary : overlay;
  const fallback = freshest === primary ? overlay : primary;
  const fallbackTags = Array.isArray(fallback.tags) ? fallback.tags : undefined;
  const freshestTags = Array.isArray(freshest.tags) ? freshest.tags : undefined;
  const mergedWorkpieceId = freshest.links?.hearthWorkpieceId ?? fallback.links?.hearthWorkpieceId;
  const mergedDraftId = freshest.links?.hearthDraftId ?? fallback.links?.hearthDraftId;

  return {
    ...freshest,
    title: freshest.title ?? fallback.title,
    body: freshest.body || fallback.body,
    assignmentId: freshest.assignmentId ?? fallback.assignmentId,
    tags: freshestTags?.length ? freshestTags : fallbackTags,
    status: freshest.status ?? fallback.status,
    links: mergedWorkpieceId || mergedDraftId
      ? {
          hearthWorkpieceId: mergedWorkpieceId ?? undefined,
          hearthDraftId: mergedDraftId ?? undefined,
        }
      : undefined,
  };
}

function parseSparkRow(item: HearthBarStockSparkApiRow): BarStockSpark | null {
  const id = normalizeUuid(item.id);
  if (!id) return null;

  const body = typeof item.body === "string" ? item.body : "";
  if (!body.trim()) return null;

  const tags = Array.isArray(item.tags)
    ? item.tags.filter((value): value is string => typeof value === "string")
    : undefined;
  const linkedWorkpieceId = normalizeUuid(item.linked_workpiece_id);

  return {
    id,
    assignmentId: normalizeUuid(item.assignment_id) ?? undefined,
    title: readString(item.title) ?? undefined,
    body,
    tags,
    status: readString(item.status) ?? undefined,
    createdAt: normalizeTimestampMs(item.created_at),
    updatedAt: normalizeTimestampMs(item.updated_at),
    links: linkedWorkpieceId
      ? {
          hearthWorkpieceId: linkedWorkpieceId,
        }
      : undefined,
  };
}

export function mergeBarStockSparkSources(
  canonical: readonly BarStockSpark[],
  local: readonly BarStockSpark[],
): BarStockSpark[] {
  const merged = new Map<string, BarStockSpark>();

  for (const spark of canonical) {
    merged.set(spark.id, { ...spark });
  }

  for (const spark of local) {
    const existing = merged.get(spark.id);
    if (!existing) {
      merged.set(spark.id, { ...spark });
      continue;
    }
    merged.set(spark.id, mergeSparkRecords(existing, spark));
  }

  return [...merged.values()].sort((left, right) => {
    if (left.createdAt !== right.createdAt) return right.createdAt - left.createdAt;
    if (left.updatedAt !== right.updatedAt) return right.updatedAt - left.updatedAt;
    return left.id.localeCompare(right.id);
  });
}

export function isCanonicalSparkDiscoveryResolved(
  workspaceId: string | null | undefined,
  discoveryWorkspaceId: string | null | undefined,
): boolean {
  const normalizedWorkspaceId = normalizeUuid(workspaceId);
  if (!normalizedWorkspaceId) return true;
  return normalizeUuid(discoveryWorkspaceId) === normalizedWorkspaceId;
}

export function resolveCanonicalSparkIntakeError(args: {
  routeProjectId?: string | null;
  routeSparkId?: string | null;
  workspaceId?: string | null;
  discoveryWorkspaceId?: string | null;
  spark?: BarStockSpark | null;
}): string | null {
  if (readString(args.routeProjectId) || !readString(args.routeSparkId)) return null;

  const normalizedWorkspaceId = normalizeUuid(args.workspaceId);
  if (!normalizedWorkspaceId) {
    return "Spark intake requires workspace_id.";
  }

  if (!isCanonicalSparkDiscoveryResolved(normalizedWorkspaceId, args.discoveryWorkspaceId)) {
    return null;
  }

  return args.spark ? null : "Spark not found in Bar Stock. Sync and retry.";
}

export function parseHearthBarStockSparksPayload(
  payload: unknown,
): BarStockSpark[] {
  const body = payload as {
    ok?: unknown;
    data?: {
      sparks?: unknown;
    };
  } | null;

  const items = Array.isArray(body?.data?.sparks) ? body.data.sparks : [];
  const sparks: BarStockSpark[] = [];
  for (const item of items) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const spark = parseSparkRow(item as HearthBarStockSparkApiRow);
    if (spark) sparks.push(spark);
  }
  return sparks.sort((left, right) => {
    if (left.createdAt !== right.createdAt) return right.createdAt - left.createdAt;
    if (left.updatedAt !== right.updatedAt) return right.updatedAt - left.updatedAt;
    return left.id.localeCompare(right.id);
  });
}

export async function listHearthBarStockSparks(workspaceId: string): Promise<BarStockSpark[]> {
  const normalizedWorkspaceId = normalizeUuid(workspaceId);
  if (!normalizedWorkspaceId) {
    throw new HearthDependencyError({
      dependency: "bar_stock_sparks",
      kind: "unavailable",
      message: "Bar Stock spark discovery requires a valid workspace.",
    });
  }

  let response: Response;
  try {
    response = await tongsFetch(`/tongs/workspaces/${encodeURIComponent(normalizedWorkspaceId)}/sparks`, {
      method: "GET",
    });
  } catch (error) {
    throw new HearthDependencyError({
      dependency: "bar_stock_sparks",
      kind: "failed",
      message: "Failed to load Bar Stock sparks.",
      cause: error,
    });
  }
  if (!response.ok) {
    throw new HearthDependencyError({
      dependency: "bar_stock_sparks",
      kind: classifyHttpDependencyFailure(response.status),
      status: response.status,
      message: response.status === 404 || response.status === 501 || response.status === 503
        ? "Bar Stock spark discovery is currently unavailable."
        : "Failed to load Bar Stock sparks.",
    });
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch (error) {
    throw new HearthDependencyError({
      dependency: "bar_stock_sparks",
      kind: "failed",
      status: response.status,
      message: "Bar Stock spark discovery returned an unreadable response.",
      cause: error,
    });
  }
  const sparks = (
    body
    && typeof body === "object"
    && (body as { ok?: unknown }).ok === true
    && (body as { data?: unknown }).data
    && typeof (body as { data?: unknown }).data === "object"
  )
    ? (body as { data: { sparks?: unknown } }).data.sparks
    : null;
  if (!Array.isArray(sparks)) {
    throw new HearthDependencyError({
      dependency: "bar_stock_sparks",
      kind: "failed",
      status: response.status,
      message: "Bar Stock spark discovery returned a malformed response.",
    });
  }
  const parsed = parseHearthBarStockSparksPayload(body);
  if (sparks.length > 0 && parsed.length === 0) {
    throw new HearthDependencyError({
      dependency: "bar_stock_sparks",
      kind: "failed",
      status: response.status,
      message: "Bar Stock spark discovery returned no structurally usable entries.",
    });
  }
  return parsed;
}
