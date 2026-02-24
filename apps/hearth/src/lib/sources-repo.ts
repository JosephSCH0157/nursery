import type { ScriptSource, SourceIndexEntry, WorkpieceSourceRef } from "../domain/source";
import {
  SCRIPT_SOURCES_PATH,
  SCRIPT_SOURCES_SCHEMA,
  SOURCES_INDEX_PATH,
  SOURCES_INDEX_SCHEMA,
  sourceEntryPath,
} from "../domain/source";

type ReadResult<T> = { ok: true; data: T } | { ok: false; status?: number; reason: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const WORKSPACE_KEYS = ["forge_workspace_id_v1", "barstock_workspace_id"] as const;
const WORKPIECE_KEYS = [
  "forge_hearth_script_workpiece_id_v1",
  "forge_active_workpiece_id_v1",
  "forge_workpiece_id_v1",
  "tp_workpiece_id",
];

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function normalizeUuid(value: unknown): string | null {
  const str = readString(value);
  if (!str) return null;
  return UUID_RE.test(str) ? str.toLowerCase() : null;
}

function readLocalStorage(key: string): string | null {
  try {
    return readString(window.localStorage.getItem(key));
  } catch {
    return null;
  }
}

function getQueryParam(...keys: string[]): string | null {
  try {
    const q = new URLSearchParams(window.location.search || "");
    for (const key of keys) {
      const value = readString(q.get(key));
      if (value) return value;
    }
  } catch {
    // ignore
  }
  return null;
}

export function resolveWorkspaceId(): string | null {
  const fromQuery = normalizeUuid(getQueryParam("workspace_id", "workspaceId", "workspace"));
  if (fromQuery) return fromQuery;

  const w = window as typeof window & {
    __forgeWorkspaceId?: unknown;
    __tpWorkspaceId?: unknown;
    __forgeWorkspace?: unknown;
    __tpWorkspace?: unknown;
  };
  const fromWindow = normalizeUuid(
    w.__forgeWorkspaceId ?? w.__tpWorkspaceId ?? w.__forgeWorkspace ?? w.__tpWorkspace,
  );
  if (fromWindow) return fromWindow;

  for (const key of WORKSPACE_KEYS) {
    const value = normalizeUuid(readLocalStorage(key));
    if (value) return value;
  }

  return null;
}

export function resolveWorkpieceId(): string | null {
  const fromQuery = normalizeUuid(
    getQueryParam("workpiece_id", "workpieceId", "workpiece", "cradle_id", "cradleId"),
  );
  if (fromQuery) return fromQuery;

  const w = window as typeof window & {
    __forgeWorkpieceId?: unknown;
    __tpWorkpieceId?: unknown;
    __forgeCradleId?: unknown;
    __tpCradleId?: unknown;
  };
  const fromWindow = normalizeUuid(
    w.__forgeWorkpieceId ?? w.__tpWorkpieceId ?? w.__forgeCradleId ?? w.__tpCradleId,
  );
  if (fromWindow) return fromWindow;

  for (const key of WORKPIECE_KEYS) {
    const value = normalizeUuid(readLocalStorage(key));
    if (value) return value;
  }

  return null;
}

function resolveApiToken(): string | undefined {
  const fromQuery = readString(getQueryParam("tongs_api_token", "tongsApiToken"));
  if (fromQuery) return fromQuery;
  const w = window as typeof window & {
    __forgeTongsApiToken?: unknown;
    __tpTongsApiToken?: unknown;
  };
  const fromWindow = readString(w.__forgeTongsApiToken ?? w.__tpTongsApiToken);
  if (fromWindow) return fromWindow;
  return readLocalStorage("forge_tongs_api_token_v1") ?? undefined;
}

async function readJsonFromTongs(url: string): Promise<ReadResult<unknown>> {
  const headers: Record<string, string> = {};
  const apiToken = resolveApiToken();
  if (apiToken) headers.authorization = `Bearer ${apiToken}`;

  const response = await fetch(url, { headers });
  if (response.status === 404) {
    return { ok: false, status: 404, reason: "not_found" };
  }
  if (!response.ok) {
    return { ok: false, status: response.status, reason: "request_failed" };
  }

  const body = await response.json();
  if (!body || typeof body !== "object" || (body as { ok?: boolean }).ok !== true) {
    return { ok: false, status: response.status, reason: "invalid_response" };
  }

  return { ok: true, data: (body as { data?: unknown }).data };
}

function normalizeWorkpieceRefs(raw: unknown): WorkpieceSourceRef[] {
  if (!raw || typeof raw !== "object") return [];
  const doc = raw as { schema?: unknown; refs?: unknown };
  if (doc.schema !== SCRIPT_SOURCES_SCHEMA || !Array.isArray(doc.refs)) return [];
  return doc.refs.filter((ref): ref is WorkpieceSourceRef => {
    return !!ref && typeof ref === "object" && typeof (ref as { source_id?: unknown }).source_id === "string";
  });
}

function normalizeSourceIndex(raw: unknown): SourceIndexEntry[] {
  if (!raw || typeof raw !== "object") return [];
  const doc = raw as { schema?: unknown; sources?: unknown };
  if (doc.schema !== SOURCES_INDEX_SCHEMA || !Array.isArray(doc.sources)) return [];
  return doc.sources.filter((entry): entry is SourceIndexEntry => {
    return !!entry && typeof entry === "object" && typeof (entry as { source_id?: unknown }).source_id === "string";
  });
}

function normalizeSource(raw: unknown): ScriptSource | null {
  if (!raw || typeof raw !== "object") return null;
  const src = raw as ScriptSource;
  return typeof src.source_id === "string" && src.source_id.trim() ? src : null;
}

export async function readWorkpieceSourceRefs(workpieceId: string): Promise<WorkpieceSourceRef[] | null> {
  const url = `/tongs/workpieces/${encodeURIComponent(workpieceId)}/read-file?path=${encodeURIComponent(
    SCRIPT_SOURCES_PATH,
  )}`;
  const result = await readJsonFromTongs(url);
  if (!result.ok) return null;
  return normalizeWorkpieceRefs(result.data);
}

export async function readWorkspaceSourcesIndex(workspaceId: string): Promise<SourceIndexEntry[] | null> {
  const url = `/tongs/workspaces/${encodeURIComponent(workspaceId)}/read-file?path=${encodeURIComponent(
    SOURCES_INDEX_PATH,
  )}`;
  const result = await readJsonFromTongs(url);
  if (!result.ok) return null;
  return normalizeSourceIndex(result.data);
}

export async function readWorkspaceSource(workspaceId: string, sourceId: string): Promise<ScriptSource | null> {
  const path = sourceEntryPath(sourceId);
  const url = `/tongs/workspaces/${encodeURIComponent(workspaceId)}/read-file?path=${encodeURIComponent(path)}`;
  const result = await readJsonFromTongs(url);
  if (!result.ok) return null;
  return normalizeSource(result.data);
}
