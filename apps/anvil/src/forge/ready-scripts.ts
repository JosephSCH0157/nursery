type ForgeWindow = Window & typeof globalThis & {
  __forgeTongsApiToken?: unknown;
  __tpTongsApiToken?: unknown;
  __forgeWorkspaceId?: unknown;
  __tpWorkspaceId?: unknown;
  __forgeWorkspace?: unknown;
  __tpWorkspace?: unknown;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const WORKSPACE_STORAGE_KEYS = ["forge_workspace_id_v1", "barstock_workspace_id"] as const;

type ReadyScriptApiRow = {
  workspace_id?: unknown;
  workpiece_id?: unknown;
  path?: unknown;
  primary_script_path?: unknown;
  script_paths?: unknown;
  title?: unknown;
  updated_at?: unknown;
};

export type ReadyScriptReference = {
  id: string;
  workspaceId: string;
  workpieceId: string;
  path: string;
  primaryPath: string;
  scriptPaths: string[];
  title: string;
  updatedAt?: string;
};

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

function resolveWorkspaceId(): string | null {
  const fromQuery = normalizeUuid(getQueryParam("workspace_id", "workspaceId", "workspace"));
  if (fromQuery) return fromQuery;

  const w = window as ForgeWindow;
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

function resolveTongsApiToken(): string | undefined {
  const fromQuery = readString(getQueryParam("tongs_api_token", "tongsApiToken"));
  if (fromQuery) return fromQuery;

  const w = window as ForgeWindow;
  const fromWindow = readString(w.__forgeTongsApiToken ?? w.__tpTongsApiToken);
  if (fromWindow) return fromWindow;

  try {
    const meta = import.meta as unknown as { env?: Record<string, string | undefined> };
    const fromEnv = readString(meta.env?.VITE_TONGS_API_TOKEN);
    if (fromEnv) return fromEnv;
  } catch {
    // ignore env access failures
  }

  return readLocalStorage("forge_tongs_api_token_v1") ?? undefined;
}

function withAuthHeaders(): Headers {
  const headers = new Headers();
  const token = resolveTongsApiToken();
  if (token) {
    headers.set("authorization", `Bearer ${token}`);
  }
  return headers;
}

function normalizeScriptPath(value: unknown): string | null {
  const path = readString(value);
  if (!path) return null;
  if (path.startsWith("/") || path.includes("..")) return null;
  return path;
}

function normalizeIso(value: unknown): string | undefined {
  const iso = readString(value);
  if (!iso) return undefined;
  const timestamp = Date.parse(iso);
  if (!Number.isFinite(timestamp)) return undefined;
  return new Date(timestamp).toISOString();
}

function normalizeScriptPaths(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const entry of value) {
    const path = normalizeScriptPath(entry);
    if (!path || out.includes(path)) continue;
    out.push(path);
  }
  return out;
}

function toReadyScriptId(workpieceId: string, path: string): string {
  return `ready:${workpieceId}:${path}`;
}

function parseReadyScriptsPayload(payload: unknown, workspaceId: string): ReadyScriptReference[] {
  if (!payload || typeof payload !== "object") return [];
  const root = payload as { ok?: unknown; data?: unknown };
  if (root.ok !== true) return [];

  const data = root.data as unknown;
  const rowsMaybe = Array.isArray(data)
    ? data
    : (data && typeof data === "object" && Array.isArray((data as { scripts?: unknown }).scripts))
      ? (data as { scripts: unknown[] }).scripts
      : [];
  if (!rowsMaybe.length) return [];

  const scripts: ReadyScriptReference[] = [];
  for (const row of rowsMaybe) {
    if (!row || typeof row !== "object") continue;
    const item = row as ReadyScriptApiRow;
    const rowWorkspace = normalizeUuid(item.workspace_id) ?? workspaceId;
    const workpieceId = normalizeUuid(item.workpiece_id);
    const primaryPath = normalizeScriptPath(item.primary_script_path) ?? normalizeScriptPath(item.path);
    const scriptPaths = normalizeScriptPaths(item.script_paths);
    const path = primaryPath ?? scriptPaths[0] ?? null;
    if (!rowWorkspace || !workpieceId || !path) continue;
    const normalizedScriptPaths = scriptPaths.length
      ? (scriptPaths.includes(path) ? scriptPaths : [path, ...scriptPaths])
      : [path];
    const title = readString(item.title) ?? `Episode ${workpieceId.slice(0, 8)}`;
    scripts.push({
      id: toReadyScriptId(workpieceId, path),
      workspaceId: rowWorkspace,
      workpieceId,
      path,
      primaryPath: path,
      scriptPaths: normalizedScriptPaths,
      title,
      updatedAt: normalizeIso(item.updated_at),
    });
  }

  scripts.sort((a, b) => {
    const aTs = a.updatedAt ?? "";
    const bTs = b.updatedAt ?? "";
    const byUpdated = bTs.localeCompare(aTs);
    if (byUpdated !== 0) return byUpdated;
    return a.title.localeCompare(b.title);
  });

  return scripts;
}

export async function listWorkspaceReadyScripts(): Promise<ReadyScriptReference[]> {
  const workspaceId = resolveWorkspaceId();
  if (!workspaceId) return [];

  const response = await fetch(`/tongs/workspaces/${encodeURIComponent(workspaceId)}/ready-scripts?unrecorded=1`, {
    method: "GET",
    headers: withAuthHeaders(),
  });
  if (!response.ok) return [];

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    return [];
  }
  return parseReadyScriptsPayload(body, workspaceId);
}

export async function readReadyScriptText(workpieceId: string, path: string): Promise<string | null> {
  const safeWorkpieceId = normalizeUuid(workpieceId);
  const safePath = normalizeScriptPath(path);
  if (!safeWorkpieceId || !safePath) return null;

  const response = await fetch(
    `/tongs/workpieces/${encodeURIComponent(safeWorkpieceId)}/read-file?path=${encodeURIComponent(safePath)}`,
    {
      method: "GET",
      headers: withAuthHeaders(),
    },
  );

  if (response.status === 404) return null;
  if (!response.ok) return null;

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    return null;
  }

  if (!body || typeof body !== "object" || (body as { ok?: unknown }).ok !== true) {
    return null;
  }

  const data = (body as { data?: unknown }).data;
  return typeof data === "string" ? data : null;
}
