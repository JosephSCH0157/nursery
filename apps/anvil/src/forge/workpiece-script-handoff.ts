import { applyScript } from "../features/apply-script";
import { appStore } from "../state/app-store";
import { dispatchAuthenticatedWorkpieceScript } from "./workpiece-performance-entrypoint";
import { readCanonicalScriptFile } from "./canonical-script-read";

type ForgeWindow = Window & typeof globalThis & {
  __tpWorkpieceScriptBootLoaded?: boolean;
  __forgeTongsApiToken?: unknown;
  __tpTongsApiToken?: unknown;
  __forgeCanonicalScriptIdentity?: CanonicalScriptIdentity;
};

type CanonicalScriptIdentity = {
  workspaceId: string;
  workpieceId: string;
  path: string;
  scriptRevision: number;
  scriptHash: string;
  readyTransitionId?: string | null;
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

type ScriptReadErrorReason =
  | "not_found"
  | "unauthorized"
  | "request_failed"
  | "invalid_response"
  | "empty";

type ScriptReadResult =
  | { ok: true; text: string; revision: number; hash: string }
  | { ok: false; reason: ScriptReadErrorReason; status?: number };

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

function reportScriptHandoffError(args: {
  workpieceId: string;
  path: string;
  reason: ScriptReadErrorReason;
  status?: number;
}): void {
  const statusText = args.status ? ` (${args.status})` : "";
  const message = args.reason === "not_found"
    ? `Script not found at ${args.path}.`
    : args.reason === "unauthorized"
      ? `Unauthorized while loading script${statusText}. Re-open from Hearth.`
      : args.reason === "empty"
        ? `Script is empty at ${args.path}.`
        : args.reason === "invalid_response"
          ? `Invalid script payload from Tongs${statusText}.`
          : `Failed to load script${statusText}.`;

  try {
    (window as any).__tpWorkpieceScriptLoadError = {
      workpieceId: args.workpieceId,
      path: args.path,
      reason: args.reason,
      status: args.status ?? null,
      message,
      at: Date.now(),
    };
  } catch {
    // ignore
  }

  try {
    window.dispatchEvent(
      new CustomEvent("tp:workpiece-script-handoff-error", {
        detail: {
          workpieceId: args.workpieceId,
          path: args.path,
          reason: args.reason,
          status: args.status ?? null,
          message,
        },
      }),
    );
  } catch {
    // ignore
  }

  try { console.warn("[anvil:workpiece-script-handoff]", message, args); } catch {}
  try { (window as any).toast?.(message, { type: "warning" }); } catch {}
}

async function readWorkpieceScript(workpieceId: string, path: string): Promise<ScriptReadResult> {
  const headers = new Headers();
  const token = resolveTongsApiToken();
  if (token) {
    headers.set("authorization", `Bearer ${token}`);
  }

  return readCanonicalScriptFile(workpieceId, path, headers);
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
  const readResult = await readWorkpieceScript(workpieceId, path);
  if (!readResult.ok) {
    reportScriptHandoffError({
      workpieceId,
      path,
      reason: readResult.reason,
      status: readResult.status,
    });
    return;
  }

  const text = readResult.text;
  if (!text.trim()) {
    reportScriptHandoffError({
      workpieceId,
      path,
      reason: "empty",
    });
    return;
  }

  if (!workspaceId) {
    reportScriptHandoffError({ workpieceId, path, reason: "invalid_response" });
    return;
  }
  const canonicalIdentity: CanonicalScriptIdentity = {
    workspaceId,
    workpieceId,
    path,
    scriptRevision: readResult.revision,
    scriptHash: readResult.hash,
  };
  const dispatchResult = await dispatchAuthenticatedWorkpieceScript({
    canonicalIdentity,
    canonicalText: text,
    scrollMode: String(appStore.get("scrollMode") || ""),
    legacyApply: (legacyText) => applyScript(legacyText, "load", { updateEditor: true }),
  });
  if (dispatchResult.outcome === "rejected" || dispatchResult.outcome === "discarded") return;
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
