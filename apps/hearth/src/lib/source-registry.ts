import type { SourceIndexEntry, ScriptSource, WorkpieceSourceRef } from "../domain/source";
import { SCRIPT_SOURCES_SCHEMA, SOURCES_INDEX_SCHEMA } from "../domain/source";

const LEGACY_WORKPIECE_SOURCES_KEY = "hearth:script:sources:v1";
const WORKPIECE_SOURCES_PREFIX = "hearth:script:sources:v1:";
const LEGACY_SOURCES_INDEX_FALLBACK_KEY = "forge:sources:index:v1";
const SOURCES_INDEX_PREFIX = "forge:sources:index:v1:";
const LEGACY_SOURCE_LIBRARY_KEY = "forge:sources:library:v1";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

function resolveIndexKey(workspaceId: string | null | undefined): string | null {
  const normalizedWorkspaceId = normalizeUuid(workspaceId);
  return normalizedWorkspaceId ? `${SOURCES_INDEX_PREFIX}${normalizedWorkspaceId}` : null;
}

export function resolveWorkpieceSourcesCacheKey(
  workspaceId: string | null | undefined,
  workpieceId: string | null | undefined,
): string | null {
  const normalizedWorkspaceId = normalizeUuid(workspaceId);
  const normalizedWorkpieceId = normalizeUuid(workpieceId);
  if (!normalizedWorkspaceId || !normalizedWorkpieceId) return null;
  return `${WORKPIECE_SOURCES_PREFIX}${normalizedWorkspaceId}:${normalizedWorkpieceId}`;
}

export function readWorkpieceSources(
  workspaceId: string | null | undefined,
  workpieceId: string | null | undefined,
): WorkpieceSourceRef[] {
  if (typeof window === "undefined") return [];
  const key = resolveWorkpieceSourcesCacheKey(workspaceId, workpieceId);
  return key ? normalizeWorkpieceSources(readJson(key)) : [];
}

export function readLegacyWorkpieceSourcesRecoveryEvidence(): WorkpieceSourceRef[] {
  if (typeof window === "undefined") return [];
  return normalizeWorkpieceSources(readJson(LEGACY_WORKPIECE_SOURCES_KEY));
}

export function readSourceIndex(workspaceId: string | null | undefined): SourceIndexEntry[] {
  if (typeof window === "undefined") return [];
  const key = resolveIndexKey(workspaceId);
  return key ? normalizeSourceIndex(readJson(key)) : [];
}

export function readLegacySourceLibraryRecoveryEvidence(): ScriptSource[] {
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

export function writeWorkpieceSourcesCache(
  workspaceId: string | null | undefined,
  workpieceId: string | null | undefined,
  refs: WorkpieceSourceRef[],
): void {
  if (typeof window === "undefined") return;
  const key = resolveWorkpieceSourcesCacheKey(workspaceId, workpieceId);
  if (!key) return;
  try {
    const payload = {
      schema: SCRIPT_SOURCES_SCHEMA,
      updated_at: new Date().toISOString(),
      refs,
    };
    window.localStorage.setItem(key, JSON.stringify(payload));
  } catch {
    // ignore
  }
}

export function writeSourceIndexCache(
  workspaceId: string | null | undefined,
  sources: SourceIndexEntry[],
): void {
  if (typeof window === "undefined") return;
  const key = resolveIndexKey(workspaceId);
  if (!key) return;
  try {
    const payload = {
      schema: SOURCES_INDEX_SCHEMA,
      updated_at: new Date().toISOString(),
      sources,
    };
    window.localStorage.setItem(key, JSON.stringify(payload));
  } catch {
    // ignore
  }
}

export function isSourceRegistryKey(key: string | null): boolean {
  if (!key) return true;
  if (key === LEGACY_WORKPIECE_SOURCES_KEY) return true;
  if (key.startsWith(WORKPIECE_SOURCES_PREFIX)) return true;
  if (key === LEGACY_SOURCES_INDEX_FALLBACK_KEY) return true;
  if (key === LEGACY_SOURCE_LIBRARY_KEY) return true;
  if (key.startsWith(SOURCES_INDEX_PREFIX)) return true;
  return false;
}
