const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const WORKSPACE_STORAGE_KEYS = ["forge_workspace_id_v1", "barstock_workspace_id"] as const;
const WORKPIECE_STORAGE_KEYS = [
  "forge_active_workpiece_id_v1",
  "forge_workpiece_id_v1",
  "tp_workpiece_id",
] as const;
const ACTIVE_WORKPIECE_KEY = "forge_active_workpiece_id_v1";
const WORKSPACE_WORKPIECE_PREFIX = "forge_anvil_recording_workpiece_v1:";

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

function writeLocalStorage(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // ignore
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

function resolveWorkspaceId(): string | null {
  const fromQuery = normalizeUuid(getQueryParam("workspace_id", "workspaceId", "workspace"));
  if (fromQuery) return fromQuery;

  const w = window as Window & {
    __forgeWorkspaceId?: unknown;
    __tpWorkspaceId?: unknown;
    __forgeWorkspace?: unknown;
    __tpWorkspace?: unknown;
  };
  const fromWindow = normalizeUuid(
    w.__forgeWorkspaceId ?? w.__tpWorkspaceId ?? w.__forgeWorkspace ?? w.__tpWorkspace,
  );
  if (fromWindow) return fromWindow;

  for (const key of WORKSPACE_STORAGE_KEYS) {
    const value = normalizeUuid(readLocalStorage(key));
    if (value) return value;
  }
  return null;
}

function resolveDirectWorkpieceId(): string | null {
  const fromQuery = normalizeUuid(
    getQueryParam("workpiece_id", "workpieceId", "workpiece", "cradle_id", "cradleId"),
  );
  if (fromQuery) return fromQuery;

  const w = window as Window & {
    __forgeWorkpieceId?: unknown;
    __tpWorkpieceId?: unknown;
    __forgeCradleId?: unknown;
    __tpCradleId?: unknown;
  };
  const fromWindow = normalizeUuid(
    w.__forgeWorkpieceId ?? w.__tpWorkpieceId ?? w.__forgeCradleId ?? w.__tpCradleId,
  );
  if (fromWindow) return fromWindow;

  for (const key of WORKPIECE_STORAGE_KEYS) {
    const value = normalizeUuid(readLocalStorage(key));
    if (value) return value;
  }
  return null;
}

function loadCachedWorkpiece(workspaceId: string | null): string | null {
  if (!workspaceId) return null;
  return normalizeUuid(readLocalStorage(`${WORKSPACE_WORKPIECE_PREFIX}${workspaceId}`));
}

function parseReadyScriptWorkpieceId(scriptId: string | null | undefined): string | null {
  const id = readString(scriptId);
  if (!id) return null;
  if (!id.toLowerCase().startsWith("ready:")) return null;
  const rest = id.slice("ready:".length);
  const separator = rest.indexOf(":");
  if (separator <= 0) return null;
  return normalizeUuid(rest.slice(0, separator));
}

export function persistActiveWorkpieceFromScriptId(scriptId: string | null | undefined): string | null {
  const workpieceId = parseReadyScriptWorkpieceId(scriptId);
  if (!workpieceId) return null;
  writeLocalStorage(ACTIVE_WORKPIECE_KEY, workpieceId);
  const workspaceId = resolveWorkspaceId();
  if (workspaceId) {
    writeLocalStorage(`${WORKSPACE_WORKPIECE_PREFIX}${workspaceId}`, workpieceId);
  }
  return workpieceId;
}

export function resolveActiveWorkpieceId(): string | null {
  const direct = resolveDirectWorkpieceId();
  if (direct) return direct;
  return loadCachedWorkpiece(resolveWorkspaceId());
}
