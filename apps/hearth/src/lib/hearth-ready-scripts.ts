import { tongsFetch } from "./tongs-fetch";
import { buildDefaultMetadataDocument, mirrorEpisodePackageV2ToLegacy } from "./episode-package-v2";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEFAULT_TOOL_VERSION = "0.0.0";
const DEFAULT_LANE = "forge-managed";
const CONTENT_CATEGORY_VALUES = [
  "evergreen",
  "hot_topic",
  "viral_reaction",
  "strategic_anchor",
  "community",
  "reflective",
  "explainer",
  "experimental",
  "backup",
] as const;
const CONTENT_CATEGORY_SET = new Set<string>(CONTENT_CATEGORY_VALUES as readonly string[]);
const READY_SCRIPT_PATH_PREFERENCE = [
  "script/script.published.md",
  "script/script.md",
  "scripts/script.anvil.txt",
  "scripts/script.source.md",
] as const;
const READY_SCRIPT_PATH_PREFERENCE_INDEX = new Map<string, number>(
  READY_SCRIPT_PATH_PREFERENCE.map((path, index) => [path, index]),
);
const DROPPED_READY_ROWS_LOGGED_BY_WORKSPACE = new Set<string>();
const READY_RAIL_DEBUG_QUERY_KEYS = ["debug_ready_rail", "debugReadyRail", "readyRailDebug"] as const;

type ReadyScriptApiRow = {
  workspace_id?: unknown;
  workpiece_id?: unknown;
  path?: unknown;
  primary_script_path?: unknown;
  script_paths?: unknown;
  title?: unknown;
  updated_at?: unknown;
  content_category?: unknown;
};

type WrittenBy = {
  tool: string;
  tool_version: string;
  lane: string;
};

export type HearthContentCategory = (typeof CONTENT_CATEGORY_VALUES)[number];
export const HEARTH_CONTENT_CATEGORIES: readonly HearthContentCategory[] = CONTENT_CATEGORY_VALUES;

export type HearthReadyScript = {
  id: string;
  workspaceId: string;
  workpieceId: string;
  path: string;
  primaryScriptPath: string;
  scriptPaths: string[];
  title: string;
  updatedAt: string | null;
  contentCategory: HearthContentCategory | null;
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

function normalizePath(value: unknown): string | null {
  const path = readString(value);
  if (!path) return null;
  if (path.startsWith("/") || path.includes("..") || path.includes("\\")) return null;
  return path;
}

function isLikelyReadyScriptPath(path: string): boolean {
  if (READY_SCRIPT_PATH_PREFERENCE_INDEX.has(path)) return true;
  if (!(path.startsWith("script/") || path.startsWith("scripts/"))) return false;
  const lower = path.toLowerCase();
  return lower.endsWith(".md") || lower.endsWith(".txt");
}

function normalizeReadyScriptPath(value: unknown): string | null {
  const path = normalizePath(value);
  if (!path) return null;
  return isLikelyReadyScriptPath(path) ? path : null;
}

function normalizeIso(value: unknown): string | null {
  const iso = readString(value);
  if (!iso) return null;
  const timestamp = Date.parse(iso);
  if (!Number.isFinite(timestamp)) return null;
  return new Date(timestamp).toISOString();
}

function normalizeCategory(value: unknown): HearthContentCategory | null {
  const candidate = readString(value)?.toLowerCase() ?? null;
  if (!candidate) return null;
  return CONTENT_CATEGORY_SET.has(candidate) ? (candidate as HearthContentCategory) : null;
}

function resolveLane(): string {
  try {
    const params = new URLSearchParams(window.location.search || "");
    const fromQuery = readString(params.get("forge_lane") ?? params.get("lane"));
    if (fromQuery) return fromQuery;
  } catch {
    // ignore query parsing failures
  }

  const w = window as typeof window & { __forgeLane?: unknown; __tpLane?: unknown };
  const fromWindow = readString(w.__forgeLane ?? w.__tpLane);
  if (fromWindow) return fromWindow;

  try {
    const fromStorage = readString(window.localStorage.getItem("forge_lane_v1"));
    if (fromStorage) return fromStorage;
  } catch {
    // ignore storage failures
  }

  return DEFAULT_LANE;
}

function resolveToolVersion(): string {
  const w = window as typeof window & { APP_VERSION?: unknown };
  const fromWindow = readString(w.APP_VERSION);
  return fromWindow ?? DEFAULT_TOOL_VERSION;
}

function buildWrittenBy(): WrittenBy {
  return {
    tool: "hearth",
    tool_version: resolveToolVersion(),
    lane: resolveLane(),
  };
}

async function readBodyAsJson(response: Response): Promise<unknown> {
  const text = await response.text();
  const raw = readString(text);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return { raw };
  }
}

function isCommitAck(body: unknown): boolean {
  const row = body as {
    ok?: unknown;
    success?: unknown;
    error?: unknown;
    data?: {
      ok?: unknown;
      success?: unknown;
    };
  };

  if (row?.error) return false;
  return row?.ok === true
    || row?.success === true
    || row?.data?.ok === true
    || row?.data?.success === true;
}

function toScriptId(workpieceId: string, path: string): string {
  return `ready:${workpieceId}:${path}`;
}

function normalizeScriptPaths(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const paths: string[] = [];
  for (const entry of value) {
    const path = normalizeReadyScriptPath(entry);
    if (path && !paths.includes(path)) {
      paths.push(path);
    }
  }
  return sortScriptPaths(paths);
}

function readyScriptPathPriority(path: string): number {
  return READY_SCRIPT_PATH_PREFERENCE_INDEX.get(path) ?? READY_SCRIPT_PATH_PREFERENCE.length;
}

function sortScriptPaths(paths: readonly string[]): string[] {
  const out: string[] = [];
  for (const path of paths) {
    if (path && !out.includes(path)) {
      out.push(path);
    }
  }
  out.sort((a, b) => {
    const byPriority = readyScriptPathPriority(a) - readyScriptPathPriority(b);
    if (byPriority !== 0) return byPriority;
    return a.localeCompare(b);
  });
  return out;
}

function compareReadyScriptFreshness(a: HearthReadyScript, b: HearthReadyScript): number {
  const aUpdated = a.updatedAt ?? "";
  const bUpdated = b.updatedAt ?? "";
  const byUpdated = aUpdated.localeCompare(bUpdated);
  if (byUpdated !== 0) return byUpdated;
  const byPathCount = a.scriptPaths.length - b.scriptPaths.length;
  if (byPathCount !== 0) return byPathCount;
  return a.title.localeCompare(b.title);
}

type DroppedReadyScriptStats = {
  invalidIdentity: number;
  missingScriptPath: number;
  missingTitle: number;
};

function readBoolean(value: unknown): boolean | null {
  const normalized = readString(value)?.toLowerCase();
  if (!normalized) return null;
  if (normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on") return true;
  if (normalized === "0" || normalized === "false" || normalized === "no" || normalized === "off") return false;
  return null;
}

function shouldLogDroppedReadyRows(): boolean {
  try {
    const metaEnv = (import.meta as { env?: Record<string, unknown> }).env;
    if (metaEnv?.DEV === true) return true;
    const fromEnv = readBoolean(metaEnv?.VITE_DEBUG_READY_RAIL);
    if (fromEnv !== null) return fromEnv;
  } catch {
    // ignore env failures
  }

  if (typeof window === "undefined") return false;

  try {
    const params = new URLSearchParams(window.location.search || "");
    for (const key of READY_RAIL_DEBUG_QUERY_KEYS) {
      const value = readBoolean(params.get(key));
      if (value !== null) return value;
    }
  } catch {
    // ignore query parsing failures
  }

  try {
    return window.localStorage.getItem("tp_dev_mode") === "1";
  } catch {
    return false;
  }
}

function logDroppedReadyScriptRowsOnce(workspaceId: string, stats: DroppedReadyScriptStats): void {
  const totalDropped = stats.invalidIdentity + stats.missingScriptPath + stats.missingTitle;
  if (totalDropped <= 0) return;
  if (!shouldLogDroppedReadyRows()) return;
  if (DROPPED_READY_ROWS_LOGGED_BY_WORKSPACE.has(workspaceId)) return;
  DROPPED_READY_ROWS_LOGGED_BY_WORKSPACE.add(workspaceId);
  try {
    console.warn("[hearth-ready-scripts] dropped invalid ready rows", {
      workspaceId,
      totalDropped,
      invalidIdentity: stats.invalidIdentity,
      missingScriptPath: stats.missingScriptPath,
      missingTitle: stats.missingTitle,
    });
  } catch {
    // ignore logging failures
  }
}

function parseReadyScriptsPayload(payload: unknown, workspaceId: string): HearthReadyScript[] {
  if (!payload || typeof payload !== "object") return [];
  const root = payload as { ok?: unknown; data?: unknown };
  if (root.ok !== true) return [];

  const scripts = (root.data as { scripts?: unknown } | null | undefined)?.scripts;
  if (!Array.isArray(scripts)) return [];

  const byWorkpieceId = new Map<string, HearthReadyScript>();
  const droppedStats: DroppedReadyScriptStats = {
    invalidIdentity: 0,
    missingScriptPath: 0,
    missingTitle: 0,
  };
  for (const row of scripts) {
    if (!row || typeof row !== "object") continue;
    const item = row as ReadyScriptApiRow;
    const rowWorkspaceId = normalizeUuid(item.workspace_id) ?? workspaceId;
    const workpieceId = normalizeUuid(item.workpiece_id);
    if (!rowWorkspaceId || !workpieceId) {
      droppedStats.invalidIdentity += 1;
      continue;
    }
    const primaryPath = normalizeReadyScriptPath(item.primary_script_path) ?? normalizeReadyScriptPath(item.path);
    const scriptPaths = normalizeScriptPaths(item.script_paths);
    const path = primaryPath ?? scriptPaths[0] ?? null;
    if (!path) {
      droppedStats.missingScriptPath += 1;
      continue;
    }
    const title = readString(item.title);
    if (!title) {
      droppedStats.missingTitle += 1;
      continue;
    }
    const normalizedScriptPaths = sortScriptPaths(scriptPaths.length
      ? (scriptPaths.includes(path) ? scriptPaths : [path, ...scriptPaths])
      : [path]);
    const next: HearthReadyScript = {
      id: toScriptId(workpieceId, path),
      workspaceId: rowWorkspaceId,
      workpieceId,
      path,
      primaryScriptPath: path,
      scriptPaths: normalizedScriptPaths,
      title,
      updatedAt: normalizeIso(item.updated_at),
      contentCategory: normalizeCategory(item.content_category),
    };

    const existing = byWorkpieceId.get(workpieceId);
    if (!existing) {
      byWorkpieceId.set(workpieceId, next);
      continue;
    }

    const winner = compareReadyScriptFreshness(existing, next) <= 0 ? next : existing;
    const mergedScriptPaths = sortScriptPaths([...existing.scriptPaths, ...next.scriptPaths]);
    const mergedPrimaryPath = mergedScriptPaths[0] ?? winner.primaryScriptPath;
    byWorkpieceId.set(workpieceId, {
      ...winner,
      id: toScriptId(workpieceId, mergedPrimaryPath),
      path: mergedPrimaryPath,
      primaryScriptPath: mergedPrimaryPath,
      scriptPaths: mergedScriptPaths,
    });
  }

  logDroppedReadyScriptRowsOnce(workspaceId, droppedStats);

  const out = [...byWorkpieceId.values()];
  out.sort((a, b) => {
    const aUpdated = a.updatedAt ?? "";
    const bUpdated = b.updatedAt ?? "";
    const byUpdated = bUpdated.localeCompare(aUpdated);
    if (byUpdated !== 0) return byUpdated;
    return a.title.localeCompare(b.title);
  });
  return out;
}

export async function listHearthReadyScripts(workspaceId: string): Promise<HearthReadyScript[]> {
  const safeWorkspaceId = normalizeUuid(workspaceId);
  if (!safeWorkspaceId) return [];

  const url = `/tongs/workspaces/${encodeURIComponent(safeWorkspaceId)}/ready-scripts?unrecorded=1`;
  const response = await tongsFetch(url, { method: "GET" });
  if (!response.ok) return [];

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    return [];
  }

  return parseReadyScriptsPayload(body, safeWorkspaceId);
}

export async function setHearthReadyScriptCategory(args: {
  workspaceId: string;
  workpieceId: string;
  category: HearthContentCategory | null;
}): Promise<{ ok: true } | { ok: false; status?: number; reason: string }> {
  const workspaceId = normalizeUuid(args.workspaceId);
  const workpieceId = normalizeUuid(args.workpieceId);
  if (!workspaceId || !workpieceId) {
    return { ok: false, reason: "invalid_ids" };
  }

  const category = args.category == null ? null : normalizeCategory(args.category);
  if (args.category != null && !category) {
    return { ok: false, reason: "invalid_category" };
  }

  const nowIso = new Date().toISOString();
  let metadata: Record<string, unknown> = buildDefaultMetadataDocument({
    workpieceId,
    workspaceId,
    createdAt: nowIso,
    updatedAt: nowIso,
    status: "draft",
    notes: null,
    origin: null,
    contentCategory: null,
  });

  const readResponse = await tongsFetch(
    `/tongs/workpieces/${encodeURIComponent(workpieceId)}/read-file?path=${encodeURIComponent("metadata.json")}`,
    { method: "GET" },
  );

  if (readResponse.ok) {
    const body = await readBodyAsJson(readResponse);
    const data = (body as { ok?: unknown; data?: unknown })?.data;
    if (data && typeof data === "object" && !Array.isArray(data)) {
      const row = data as Record<string, unknown>;
      metadata = {
        ...row,
        schema: readString(row.schema) ?? "forge.metadata.v1",
        workpiece_id: normalizeUuid(row.workpiece_id) ?? workpieceId,
        workspace_id: normalizeUuid(row.workspace_id) ?? workspaceId,
        created_at: normalizeIso(row.created_at) ?? nowIso,
        updated_at: nowIso,
        status: readString(row.status) ?? "draft",
      };
    }
  } else if (readResponse.status !== 404) {
    return { ok: false, status: readResponse.status, reason: "read_failed" };
  }

  metadata.content_category = category;
  metadata.updated_at = nowIso;
  metadata = mirrorEpisodePackageV2ToLegacy(metadata);

  const commitResponse = await tongsFetch(`/tongs/workpieces/${encodeURIComponent(workpieceId)}/commit-file`, {
    method: "POST",
    json: {
      path: "metadata.json",
      content_type: "application/json",
      json: metadata,
      written_by: buildWrittenBy(),
      event_name: "hearth.content_category.set.v1",
      event_payload: {
        content_category: category,
      },
      correlation_id: `hearth-category:${Date.now().toString(36)}`,
    },
  });

  const commitBody = await readBodyAsJson(commitResponse);
  if (!commitResponse.ok || !isCommitAck(commitBody)) {
    return { ok: false, status: commitResponse.status, reason: "commit_failed" };
  }

  return { ok: true };
}
