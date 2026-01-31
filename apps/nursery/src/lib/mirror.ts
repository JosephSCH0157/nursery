import type { MountRole } from "@forge/tongs";
import { resolveMount } from "@forge/tongs";
import { loadMountRegistry } from "./mount-registry";
import { getHandle } from "./handle-vault";
import { loadSparks } from "@barstock/lib/store";
import { loadSessions } from "@barstock/lib/sessions";
import { buildExportPayload } from "@barstock/lib/io";

export type MirrorReason = "manual" | "session_end";

type MirrorResult =
  | { ok: true; files: { latest: string; snapshot: string } }
  | { ok: false; error: string };

export type MirrorLastStatus = {
  at: string;
  workspaceId: string;
  role: MountRole;
  reason: MirrorReason;
  ok: boolean;
  error?: string;
  vaultKey?: string;
  files?: { latest: string; snapshot: string };
};

const LAST_MIRROR_KEY = "forge_mirror_last_v1";
const AUTO_MIRROR_KEY = "forge_mirror_auto_v1";

function buildLastMirrorKey(workspaceId: string, role: MountRole, vaultKey?: string): string {
  return `${LAST_MIRROR_KEY}:${workspaceId}:${role}:${vaultKey ?? "none"}`;
}

export function loadLastMirrorStatus(
  workspaceId: string,
  role: MountRole,
  vaultKey?: string,
): MirrorLastStatus | null {
  try {
    const raw = localStorage.getItem(buildLastMirrorKey(workspaceId, role, vaultKey));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MirrorLastStatus;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveLastMirrorStatus(status: MirrorLastStatus) {
  try {
    const key = buildLastMirrorKey(status.workspaceId, status.role, status.vaultKey);
    localStorage.setItem(key, JSON.stringify(status));
  } catch {
    // ignore
  }
}

export function isAutoMirrorEnabled(workspaceId: string, role: MountRole): boolean {
  try {
    return localStorage.getItem(`${AUTO_MIRROR_KEY}:${workspaceId}:${role}`) === "true";
  } catch {
    return false;
  }
}

export function setAutoMirrorEnabled(workspaceId: string, role: MountRole, enabled: boolean) {
  try {
    localStorage.setItem(`${AUTO_MIRROR_KEY}:${workspaceId}:${role}`, enabled ? "true" : "false");
  } catch {
    // ignore
  }
}

function toSafeTimestamp(ts: Date): string {
  return ts.toISOString().replace(/[:.]/g, "-");
}

async function ensurePermission(handle: FileSystemDirectoryHandle): Promise<boolean> {
  const opts = { mode: "readwrite" } as const;
  const anyHandle = handle as FileSystemDirectoryHandle & {
    queryPermission?: (options: { mode: "readwrite" | "read" }) => Promise<PermissionState>;
    requestPermission?: (options: { mode: "readwrite" | "read" }) => Promise<PermissionState>;
  };
  if (anyHandle.queryPermission && (await anyHandle.queryPermission(opts)) === "granted") return true;
  if (anyHandle.requestPermission && (await anyHandle.requestPermission(opts)) === "granted") return true;
  return true;
}

async function writeJson(
  dir: FileSystemDirectoryHandle,
  filename: string,
  payload: unknown,
): Promise<void> {
  const fileHandle = await dir.getFileHandle(filename, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(JSON.stringify(payload, null, 2));
  await writable.close();
}

function buildBarstockSnapshot(workspaceId: string, reason: MirrorReason, meta?: Record<string, unknown>) {
  const sparks = loadSparks();
  const sessions = loadSessions();
  return {
    version: "barstock_snapshot_v1",
    mirroredAt: new Date().toISOString(),
    workspaceId,
    role: "barstock",
    reason,
    meta,
    data: buildExportPayload(sparks),
    sessions,
  };
}

const SCRIPT_LIST_KEYS = ["forge_scripts_v1", "hearth_scripts_v1", "scripts_v1"];
const ACTIVE_SCRIPT_KEYS = [
  "forge_active_script_id_v1",
  "hearth_active_script_id",
  "scripts_active_id",
];

type ScriptSummary = {
  id: string;
  title?: string;
  updatedAt?: string | number;
  createdAt?: string | number;
};

type ScriptSnapshot = ScriptSummary & {
  body?: string;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object";
}

function pickString(obj: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string") return value;
  }
  return undefined;
}

function pickStringOrNumber(obj: Record<string, unknown>, keys: string[]): string | number | undefined {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" || typeof value === "number") return value;
  }
  return undefined;
}

function loadFirstJson(keys: string[]): unknown | null {
  for (const key of keys) {
    const raw = localStorage.getItem(key);
    if (!raw) continue;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  return null;
}

function extractScriptList(raw: unknown): Record<string, unknown>[] {
  if (Array.isArray(raw)) return raw.filter(isObject);
  if (isObject(raw) && Array.isArray(raw["scripts"])) {
    return (raw["scripts"] as unknown[]).filter(isObject);
  }
  return [];
}

function extractActiveScriptId(raw: unknown): string | undefined {
  if (isObject(raw)) {
    const fromObj = pickString(raw, ["activeScriptId", "activeScript", "activeId", "active_id"]);
    if (fromObj) return fromObj;
  }
  const fallback = loadFirstJson(ACTIVE_SCRIPT_KEYS);
  return typeof fallback === "string" ? fallback : undefined;
}

function toScriptSummary(raw: Record<string, unknown>): ScriptSummary | null {
  const id = pickString(raw, ["id", "scriptId"]);
  if (!id) return null;
  return {
    id,
    title: pickString(raw, ["title", "name"]),
    updatedAt: pickStringOrNumber(raw, ["updatedAt", "updated_at", "modifiedAt", "modified_at"]),
    createdAt: pickStringOrNumber(raw, ["createdAt", "created_at"]),
  };
}

function toActiveScript(raw: Record<string, unknown>): ScriptSnapshot | null {
  const summary = toScriptSummary(raw);
  if (!summary) return null;
  return {
    ...summary,
    body: pickString(raw, ["body", "content", "text", "script"]),
  };
}

function buildScriptsSnapshot(workspaceId: string, reason: MirrorReason, meta?: Record<string, unknown>) {
  const rawScripts = loadFirstJson(SCRIPT_LIST_KEYS);
  const scriptsRaw = extractScriptList(rawScripts);
  const scripts = scriptsRaw.map(toScriptSummary).filter((s): s is ScriptSummary => !!s);
  const activeScriptId = extractActiveScriptId(rawScripts);
  const activeScriptRaw = activeScriptId
    ? scriptsRaw.find((s) => pickString(s, ["id", "scriptId"]) === activeScriptId) ?? null
    : null;
  const activeScript = activeScriptRaw ? toActiveScript(activeScriptRaw) : null;

  return {
    version: "scripts_snapshot_v1",
    mirroredAt: new Date().toISOString(),
    workspaceId,
    role: "scripts",
    reason,
    meta,
    scripts,
    activeScriptId: activeScriptId ?? null,
    activeScript,
  };
}

export async function mirrorRoleSnapshot(
  role: MountRole,
  workspaceId: string,
  reason: MirrorReason,
  meta?: Record<string, unknown>,
): Promise<MirrorResult> {
  if (!workspaceId) {
    return { ok: false, error: "Missing workspace id." };
  }

  const { registry } = loadMountRegistry("default");
  const resolved = resolveMount(registry, role);
  const mirrorTarget = resolved.mirrorTarget;
  const baseStatus = {
    at: new Date().toISOString(),
    workspaceId,
    role,
    reason,
    vaultKey: mirrorTarget?.vaultKey,
  };

  if (!mirrorTarget?.vaultKey) {
    const error = "Mirror folder not configured for this role.";
    saveLastMirrorStatus({ ...baseStatus, ok: false, error });
    return { ok: false, error };
  }

  const handle = await getHandle(mirrorTarget.vaultKey);
  if (!handle) {
    const error = "Mirror folder handle not found. Choose a folder again.";
    saveLastMirrorStatus({ ...baseStatus, ok: false, error });
    return { ok: false, error };
  }

  const allowed = await ensurePermission(handle);
  if (!allowed) {
    const error = "Mirror folder permission was not granted.";
    saveLastMirrorStatus({ ...baseStatus, ok: false, error });
    return { ok: false, error };
  }

  let payload: unknown;
  let latestName = "latest.json";
  if (role === "barstock") {
    payload = buildBarstockSnapshot(workspaceId, reason, meta);
  } else if (role === "scripts") {
    payload = buildScriptsSnapshot(workspaceId, reason, meta);
    latestName = "scripts-latest.json";
  } else {
    const error = `Mirroring not implemented for role: ${role}.`;
    saveLastMirrorStatus({ ...baseStatus, ok: false, error });
    return { ok: false, error };
  }

  const timestamp = toSafeTimestamp(new Date());
  const snapshotsDir = await handle.getDirectoryHandle("snapshots", { create: true });
  const snapshotName = `${role}-${timestamp}.json`;

  try {
    await writeJson(snapshotsDir, snapshotName, payload);
    await writeJson(handle, latestName, payload);
  } catch (err) {
    const error = err instanceof Error ? err.message : "Mirror write failed.";
    saveLastMirrorStatus({ ...baseStatus, ok: false, error });
    return { ok: false, error };
  }

  const files = { latest: latestName, snapshot: `snapshots/${snapshotName}` };
  saveLastMirrorStatus({ ...baseStatus, ok: true, files });
  return { ok: true, files };
}
