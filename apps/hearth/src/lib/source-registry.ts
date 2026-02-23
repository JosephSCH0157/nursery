import type { ScriptSource, WorkpieceSourceRef } from "../domain/source";
import { SCRIPT_SOURCES_SCHEMA, SOURCE_LIBRARY_SCHEMA } from "../domain/source";

const WORKPIECE_SOURCES_KEY = "hearth:script:sources:v1";
const SOURCE_LIBRARY_FALLBACK_KEY = "forge:sources:library:v1";
const SOURCE_LIBRARY_PREFIX = "forge:sources:library:v1:";
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
    if (schema === SCRIPT_SOURCES_SCHEMA && Array.isArray(raw.sources)) {
      return raw.sources.map(normalizeWorkpieceSource).filter(Boolean) as WorkpieceSourceRef[];
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

function normalizeSourceLibrary(raw: unknown): ScriptSource[] {
  if (Array.isArray(raw)) {
    return raw.map(normalizeScriptSource).filter(Boolean) as ScriptSource[];
  }
  if (isRecord(raw)) {
    const schema = readString(raw.schema);
    if (schema === SOURCE_LIBRARY_SCHEMA && Array.isArray(raw.sources)) {
      return raw.sources.map(normalizeScriptSource).filter(Boolean) as ScriptSource[];
    }
  }
  return [];
}

function resolveLibraryKey(): string {
  const workspaceId = resolveWorkspaceId();
  return workspaceId ? `${SOURCE_LIBRARY_PREFIX}${workspaceId}` : SOURCE_LIBRARY_FALLBACK_KEY;
}

export function readWorkpieceSources(): WorkpieceSourceRef[] {
  if (typeof window === "undefined") return [];
  return normalizeWorkpieceSources(readJson(WORKPIECE_SOURCES_KEY));
}

export function readSourceLibrary(): ScriptSource[] {
  if (typeof window === "undefined") return [];
  return normalizeSourceLibrary(readJson(resolveLibraryKey()));
}

export function isSourceRegistryKey(key: string | null): boolean {
  if (!key) return true;
  if (key === WORKPIECE_SOURCES_KEY) return true;
  if (key === SOURCE_LIBRARY_FALLBACK_KEY) return true;
  return key.startsWith(SOURCE_LIBRARY_PREFIX);
}
