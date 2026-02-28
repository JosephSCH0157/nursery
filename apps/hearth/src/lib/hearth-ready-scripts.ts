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
  if (path.startsWith("/") || path.includes("..")) return null;
  return path;
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
    const path = normalizePath(entry);
    if (path && !paths.includes(path)) {
      paths.push(path);
    }
  }
  return paths;
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

function parseReadyScriptsPayload(payload: unknown, workspaceId: string): HearthReadyScript[] {
  if (!payload || typeof payload !== "object") return [];
  const root = payload as { ok?: unknown; data?: unknown };
  if (root.ok !== true) return [];

  const scripts = (root.data as { scripts?: unknown } | null | undefined)?.scripts;
  if (!Array.isArray(scripts)) return [];

  const byId = new Map<string, HearthReadyScript>();
  for (const row of scripts) {
    if (!row || typeof row !== "object") continue;
    const item = row as ReadyScriptApiRow;
    const rowWorkspaceId = normalizeUuid(item.workspace_id) ?? workspaceId;
    const workpieceId = normalizeUuid(item.workpiece_id);
    const primaryPath = normalizePath(item.primary_script_path) ?? normalizePath(item.path);
    const scriptPaths = normalizeScriptPaths(item.script_paths);
    const path = primaryPath ?? scriptPaths[0] ?? null;
    if (!rowWorkspaceId || !workpieceId || !path) continue;
    const normalizedScriptPaths = scriptPaths.length
      ? (scriptPaths.includes(path) ? scriptPaths : [path, ...scriptPaths])
      : [path];
    const title = readString(item.title) ?? `Episode ${workpieceId.slice(0, 8)}`;
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

    const existing = byId.get(next.id);
    if (!existing || compareReadyScriptFreshness(existing, next) <= 0) {
      byId.set(next.id, next);
    }
  }

  const out = [...byId.values()];
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
