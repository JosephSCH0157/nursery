import { applyScript } from "../features/apply-script";

type ForgeWindow = Window & typeof globalThis & {
  __tpWorkpieceScriptBootLoaded?: boolean;
  __forgeTongsApiToken?: unknown;
  __tpTongsApiToken?: unknown;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEFAULT_SCRIPT_PATH = "script/script.md";
const WORKSPACE_STORAGE_KEYS = ["forge_workspace_id_v1", "barstock_workspace_id"] as const;
const WORKPIECE_STORAGE_KEYS = [
  "forge_active_workpiece_id_v1",
  "forge_workpiece_id_v1",
  "tp_workpiece_id",
] as const;
const ACTIVE_WORKPIECE_KEY = "forge_active_workpiece_id_v1";
const WORKSPACE_WORKPIECE_PREFIX = "forge_anvil_recording_workpiece_v1:";

let booted = false;

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

function resolveWorkpieceId(): string | null {
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

function persistWorkpiece(workspaceId: string | null, workpieceId: string): void {
  writeLocalStorage(ACTIVE_WORKPIECE_KEY, workpieceId);
  if (workspaceId) {
    writeLocalStorage(`${WORKSPACE_WORKPIECE_PREFIX}${workspaceId}`, workpieceId);
  }
}

function shouldAutoloadWorkpieceScript(): boolean {
  const open = readString(getQueryParam("open", "intent", "action"))?.toLowerCase();
  if (open === "script" || open === "script_primary") return true;
  return Boolean(readString(getQueryParam("script_path", "path")));
}

function resolveScriptPath(): string {
  const fromQuery = readString(getQueryParam("script_path", "path"));
  if (!fromQuery) return DEFAULT_SCRIPT_PATH;
  if (fromQuery.startsWith("/") || fromQuery.includes("..")) return DEFAULT_SCRIPT_PATH;
  return fromQuery;
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

function fileNameFromPath(path: string): string {
  const idx = path.lastIndexOf("/");
  return idx >= 0 ? path.slice(idx + 1) : path;
}

async function readWorkpieceScript(workpieceId: string, path: string): Promise<string | null> {
  const headers = new Headers();
  const token = resolveTongsApiToken();
  if (token) {
    headers.set("authorization", `Bearer ${token}`);
  }

  const response = await fetch(
    `/tongs/workpieces/${encodeURIComponent(workpieceId)}/read-file?path=${encodeURIComponent(path)}`,
    {
      method: "GET",
      headers,
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

async function loadWorkpieceScriptOnBoot(): Promise<void> {
  if (booted) return;
  booted = true;

  if (!shouldAutoloadWorkpieceScript()) return;

  const workpieceId = resolveWorkpieceId();
  if (!workpieceId) return;

  const workspaceId = resolveWorkspaceId();
  persistWorkpiece(workspaceId, workpieceId);

  const path = resolveScriptPath();
  const text = await readWorkpieceScript(workpieceId, path);
  if (!text || !text.trim()) return;

  applyScript(text, "load", { updateEditor: true });
  try { (window as any).__tpCurrentName = fileNameFromPath(path); } catch {}
  try {
    window.dispatchEvent(
      new CustomEvent("tp:script-load", {
        detail: {
          name: fileNameFromPath(path),
          text,
          skipNormalize: true,
        },
      }),
    );
  } catch {
    // ignore
  }
}

function bootstrapWorkpieceScriptHandoff() {
  const w = window as ForgeWindow;
  if (w.__tpWorkpieceScriptBootLoaded) return;
  w.__tpWorkpieceScriptBootLoaded = true;

  const run = () => {
    void loadWorkpieceScriptOnBoot();
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run, { once: true });
  } else {
    run();
  }
}

if (typeof window !== "undefined") {
  bootstrapWorkpieceScriptHandoff();
}

export {};
