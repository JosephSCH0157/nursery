import type {
  ScriptSource,
  ScriptSourcesDocument,
  SourceIndexEntry,
  SourcesIndexDocument,
  WorkpieceSourceRef,
} from "../domain/source";
import {
  SCRIPT_SOURCES_PATH,
  SCRIPT_SOURCES_SCHEMA,
  SOURCES_INDEX_PATH,
  SOURCES_INDEX_SCHEMA,
  sourceEntryPath,
} from "../domain/source";
import { tongsFetch } from "./tongs-fetch";

type ReadResult<T> = { ok: true; data: T } | { ok: false; status?: number; reason: string };
type CommitResult = { ok: true; skipped?: boolean } | { ok: false; status?: number; reason: string };

type WrittenBy = {
  tool: string;
  tool_version: string;
  lane: string;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEFAULT_LANE = "forge-managed";
const DEFAULT_TOOL_VERSION = "0.0.0";
let correlationSeq = 0;

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

function resolveLane(): string {
  const fromQuery = readString(getQueryParam("forge_lane", "lane"));
  if (fromQuery) return fromQuery;
  const w = window as typeof window & { __forgeLane?: unknown; __tpLane?: unknown };
  const fromWindow = readString(w.__forgeLane ?? w.__tpLane);
  if (fromWindow) return fromWindow;
  return readLocalStorage("forge_lane_v1") ?? DEFAULT_LANE;
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

function nextCorrelationId(prefix: string): string {
  correlationSeq += 1;
  return `${prefix}:${Date.now().toString(36)}:${correlationSeq}`;
}

async function readJsonFromTongs(url: string): Promise<ReadResult<unknown>> {
  const response = await tongsFetch(url);
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

async function postJsonToTongs(url: string, payload: unknown): Promise<ReadResult<unknown>> {
  const response = await tongsFetch(url, {
    method: "POST",
    json: payload,
  });

  if (!response.ok) {
    return { ok: false, status: response.status, reason: "request_failed" };
  }

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    return { ok: false, status: response.status, reason: "invalid_response" };
  }

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

function buildScriptSourcesDocument(refs: WorkpieceSourceRef[]): ScriptSourcesDocument {
  return {
    schema: SCRIPT_SOURCES_SCHEMA,
    updated_at: new Date().toISOString(),
    refs,
  };
}

function buildSourcesIndexDocument(sources: SourceIndexEntry[]): SourcesIndexDocument {
  return {
    schema: SOURCES_INDEX_SCHEMA,
    updated_at: new Date().toISOString(),
    sources,
  };
}

async function commitJsonFile(
  url: string,
  path: string,
  json: unknown,
  options?: { eventName?: string; eventPayload?: unknown },
): Promise<CommitResult> {
  const payload: Record<string, unknown> = {
    path,
    content_type: "application/json",
    json,
    written_by: buildWrittenBy(),
    correlation_id: nextCorrelationId("hearth-sources"),
  };
  if (options?.eventName) payload.event_name = options.eventName;
  if (typeof options?.eventPayload !== "undefined") payload.event_payload = options.eventPayload;

  const result = await postJsonToTongs(url, payload);
  if (!result.ok) {
    return { ok: false, status: result.status, reason: result.reason };
  }
  return { ok: true };
}

export async function commitWorkpieceSourceRefs(
  workpieceId: string,
  refs: WorkpieceSourceRef[],
  options?: { allowEmpty?: boolean },
): Promise<CommitResult> {
  if (!options?.allowEmpty && refs.length === 0) {
    return { ok: true, skipped: true };
  }

  const payload = buildScriptSourcesDocument(refs);
  const url = `/tongs/workpieces/${encodeURIComponent(workpieceId)}/commit-file`;
  return commitJsonFile(url, SCRIPT_SOURCES_PATH, payload, {
    eventName: "hearth.script.sources.v1",
    eventPayload: { count: refs.length },
  });
}

export async function commitWorkspaceSource(
  workspaceId: string,
  source: ScriptSource,
): Promise<CommitResult> {
  const path = sourceEntryPath(source.source_id);
  const url = `/tongs/workspaces/${encodeURIComponent(workspaceId)}/commit-file`;
  return commitJsonFile(url, path, source, {
    eventName: "hearth.source.upsert.v1",
    eventPayload: { source_id: source.source_id },
  });
}

export async function commitWorkspaceSourcesIndex(
  workspaceId: string,
  index: SourceIndexEntry[],
  options?: { allowEmpty?: boolean },
): Promise<CommitResult> {
  if (!options?.allowEmpty && index.length === 0) {
    return { ok: true, skipped: true };
  }

  const payload = buildSourcesIndexDocument(index);
  const url = `/tongs/workspaces/${encodeURIComponent(workspaceId)}/commit-file`;
  return commitJsonFile(url, SOURCES_INDEX_PATH, payload, {
    eventName: "hearth.sources.index.v1",
    eventPayload: { count: index.length },
  });
}

export async function commitWorkspaceSourcesLibrary(
  workspaceId: string,
  sources: ScriptSource[],
  index: SourceIndexEntry[],
  options?: { allowEmpty?: boolean },
): Promise<CommitResult> {
  if (!options?.allowEmpty && (sources.length === 0 || index.length === 0)) {
    return { ok: true, skipped: true };
  }

  for (const source of sources) {
    const result = await commitWorkspaceSource(workspaceId, source);
    if (!result.ok) return result;
  }

  return commitWorkspaceSourcesIndex(workspaceId, index, options);
}
