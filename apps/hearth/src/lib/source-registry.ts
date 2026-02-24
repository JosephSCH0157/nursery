import type { SourceIndexEntry, ScriptSource, WorkpieceSourceRef } from "../domain/source";
import { SCRIPT_SOURCES_SCHEMA, SOURCES_INDEX_SCHEMA } from "../domain/source";

const WORKPIECE_SOURCES_KEY = "hearth:script:sources:v1";
const SOURCES_INDEX_FALLBACK_KEY = "forge:sources:index:v1";
const SOURCES_INDEX_PREFIX = "forge:sources:index:v1:";
const LEGACY_SOURCE_LIBRARY_KEY = "forge:sources:library:v1";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ForgeWindow = Window & {
  __forgeWorkspaceId?: unknown;
  __tpWorkspaceId?: unknown;
  __forgeWorkspace?: unknown;
  __tpWorkspace?: unknown;
};

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function readNullableString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function normalizeUuid(value: unknown): string | null {
  const candidate = readString(value);
  if (!candidate) return null;
  return UUID_RE.test(candidate) ? candidate.toLowerCase() : null;
}

function resolveWorkspaceId(): string | null {
  try {
    const params = new URLSearchParams(window.location.search);
    const queryCandidate =
      params.get("workspace_id") ?? params.get("workspaceId") ?? params.get("workspace");
    const fromQuery = normalizeUuid(queryCandidate);
    if (fromQuery) return fromQuery;
  } catch {
    // ignore
  }

  try {
    const w = window as ForgeWindow;
    const fromWindow = normalizeUuid(
      w.__forgeWorkspaceId ?? w.__tpWorkspaceId ?? w.__forgeWorkspace ?? w.__tpWorkspace,
    );
    if (fromWindow) return fromWindow;
  } catch {
    // ignore
  }

  return normalizeUuid(readLocalStorage("forge_workspace_id_v1"))
    ?? normalizeUuid(readLocalStorage("barstock_workspace_id"));
}

function readLocalStorage(key: string): string | null {
  try {
    return readString(window.localStorage.getItem(key));
  } catch {
    return null;
  }
}

function readJson(key: string): unknown {
  const raw = readLocalStorage(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function normalizeWorkpieceSource(value: unknown): WorkpieceSourceRef | null {
  if (!isRecord(value)) return null;
  const sourceId = readString(value.source_id);
  if (!sourceId) return null;
  const notes = readNullableString(value.notes);
  const attached = Array.isArray(value.attached_to) ? value.attached_to : undefined;

  const out: WorkpieceSourceRef = { source_id: sourceId };
  if (notes) out.notes = notes;
  if (attached) out.attached_to = attached as WorkpieceSourceRef["attached_to"];
  return out;
}

function normalizeWorkpieceSources(raw: unknown): WorkpieceSourceRef[] {
  if (Array.isArray(raw)) {
    return raw.map(normalizeWorkpieceSource).filter(Boolean) as WorkpieceSourceRef[];
  }
  if (isRecord(raw)) {
    const schema = readString(raw.schema);
    if (schema === SCRIPT_SOURCES_SCHEMA) {
      const list = Array.isArray(raw.refs)
        ? raw.refs
        : Array.isArray(raw.sources)
          ? raw.sources
          : [];
      return list.map(normalizeWorkpieceSource).filter(Boolean) as WorkpieceSourceRef[];
    }
  }
  return [];
}

function normalizeScriptSource(value: unknown): ScriptSource | null {
  if (!isRecord(value)) return null;
  const sourceId = readString(value.source_id);
  if (!sourceId) return null;

  return {
    source_id: sourceId,
    title: readString(value.title) ?? "Untitled Source",
    type: readString(value.type) ?? "other",
    url: readNullableString(value.url),
    author: readNullableString(value.author),
    publisher: readNullableString(value.publisher),
    published_at: readNullableString(value.published_at),
    notes: readNullableString(value.notes),
  };
}

function normalizeSourceIndexEntry(value: unknown): SourceIndexEntry | null {
  if (!isRecord(value)) return null;
  const sourceId = readString(value.source_id);
  if (!sourceId) return null;
  return {
    source_id: sourceId,
    title: readNullableString(value.title),
    type: readNullableString(value.type),
    url: readNullableString(value.url),
    publisher: readNullableString(value.publisher),
    published_at: readNullableString(value.published_at),
  };
}

function normalizeSourceIndex(raw: unknown): SourceIndexEntry[] {
  if (Array.isArray(raw)) {
    return raw.map(normalizeSourceIndexEntry).filter(Boolean) as SourceIndexEntry[];
  }
  if (isRecord(raw)) {
    const schema = readString(raw.schema);
    if (schema === SOURCES_INDEX_SCHEMA && Array.isArray(raw.sources)) {
      return raw.sources.map(normalizeSourceIndexEntry).filter(Boolean) as SourceIndexEntry[];
    }
  }
  return [];
}

function resolveIndexKey(): string {
  const workspaceId = resolveWorkspaceId();
  return workspaceId ? `${SOURCES_INDEX_PREFIX}${workspaceId}` : SOURCES_INDEX_FALLBACK_KEY;
}

export function readWorkpieceSources(): WorkpieceSourceRef[] {
  if (typeof window === "undefined") return [];
  return normalizeWorkpieceSources(readJson(WORKPIECE_SOURCES_KEY));
}

export function readSourceIndex(): SourceIndexEntry[] {
  if (typeof window === "undefined") return [];
  const raw = readJson(resolveIndexKey());
  if (raw) return normalizeSourceIndex(raw);
  const legacy = readJson(LEGACY_SOURCE_LIBRARY_KEY);
  if (legacy) {
    return normalizeSourceIndex({
      schema: SOURCES_INDEX_SCHEMA,
      updated_at: new Date().toISOString(),
      sources: normalizeSourceLibrary(legacy).map((entry) => ({
        source_id: entry.source_id,
        title: entry.title,
        type: entry.type,
        url: entry.url,
        publisher: entry.publisher,
        published_at: entry.published_at,
      })),
    });
  }
  return [];
}

export function readSourceLibrary(): ScriptSource[] {
  if (typeof window === "undefined") return [];
  const legacy = readJson(LEGACY_SOURCE_LIBRARY_KEY);
  return normalizeSourceLibrary(legacy);
}

function normalizeSourceLibrary(raw: unknown): ScriptSource[] {
  if (Array.isArray(raw)) {
    return raw.map(normalizeScriptSource).filter(Boolean) as ScriptSource[];
  }
  if (isRecord(raw)) {
    const schema = readString(raw.schema);
    if (schema === "forge.source.library.v1" && Array.isArray(raw.sources)) {
      return raw.sources.map(normalizeScriptSource).filter(Boolean) as ScriptSource[];
    }
  }
  return [];
}

export function writeWorkpieceSourcesCache(refs: WorkpieceSourceRef[]): void {
  if (typeof window === "undefined") return;
  try {
    const payload = {
      schema: SCRIPT_SOURCES_SCHEMA,
      updated_at: new Date().toISOString(),
      refs,
    };
    window.localStorage.setItem(WORKPIECE_SOURCES_KEY, JSON.stringify(payload));
  } catch {
    // ignore
  }
}

export function writeSourceIndexCache(sources: SourceIndexEntry[]): void {
  if (typeof window === "undefined") return;
  try {
    const payload = {
      schema: SOURCES_INDEX_SCHEMA,
      updated_at: new Date().toISOString(),
      sources,
    };
    window.localStorage.setItem(resolveIndexKey(), JSON.stringify(payload));
  } catch {
    // ignore
  }
}

export function isSourceRegistryKey(key: string | null): boolean {
  if (!key) return true;
  if (key === WORKPIECE_SOURCES_KEY) return true;
  if (key === SOURCES_INDEX_FALLBACK_KEY) return true;
  if (key === LEGACY_SOURCE_LIBRARY_KEY) return true;
  if (key.startsWith(SOURCES_INDEX_PREFIX)) return true;
  return false;
}
