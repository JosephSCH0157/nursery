import type { MountRole } from "@forge/tongs";
import { resolveMount } from "@forge/tongs";
import { loadMountRegistry } from "./mount-registry";
import { getHandle } from "./handle-vault";
import { loadSparks } from "@barstock/lib/store";
import { loadAssignments } from "@barstock/lib/assignments";
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
  const assignments = loadAssignments();
  return {
    version: "barstock_snapshot_v1",
    mirroredAt: new Date().toISOString(),
    workspaceId,
    role: "barstock",
    reason,
    meta,
    data: buildExportPayload(sparks),
    assignments,
    sessions: assignments,
  };
}

type ScriptsSnapshotSource = "forge" | "hearth" | "legacy" | "none";

const SCRIPT_SOURCES_ORDER: Exclude<ScriptsSnapshotSource, "none">[] = ["forge", "hearth", "legacy"];

const SCRIPT_LIST_SOURCES: { key: string; source: ScriptsSnapshotSource }[] = [
  { key: "forge_scripts_v1", source: "forge" },
  { key: "hearth_scripts_v1", source: "hearth" },
  { key: "scripts_v1", source: "legacy" },
];

const ACTIVE_SCRIPT_KEYS_BY_SOURCE: Record<Exclude<ScriptsSnapshotSource, "none">, string> = {
  forge: "forge_active_script_id_v1",
  hearth: "hearth_active_script_id",
  legacy: "scripts_active_id",
};

type ScriptSummary = {
  id: string;
  title?: string;
  updatedAt?: string;
};

type ScriptSnapshot = ScriptSummary & {
  body?: string;
};

type ScriptsSnapshotV1 = {
  /**
   * Stable mirror output for Scripts. Used by Storage UI and future imports/diffs.
   * Shape is stable; adapter may change. Bump schemaVersion on breaking changes.
   */
  schemaVersion: 1;
  mirroredAt: string;
  workspaceId: string;
  role: "scripts";
  reason: MirrorReason;
  source: ScriptsSnapshotSource;
  counts: { total: number; active: 0 | 1 };
  activeScriptId: string | null;
  scripts: ScriptSummary[];
  activeScript: ScriptSnapshot | null;
  meta: {
    keysChecked: string[];
    keysFound: string[];
    parseErrors?: string[];
    warnings?: string[];
  };
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

function loadScriptsSource(): {
  value: unknown | null;
  source: ScriptsSnapshotSource;
  key?: string;
  keysChecked: string[];
  keysFound: string[];
  parseErrors: string[];
} {
  const keysChecked: string[] = [];
  const keysFound: string[] = [];
  const parseErrors: string[] = [];

  for (const entry of SCRIPT_LIST_SOURCES) {
    keysChecked.push(entry.key);
    const raw = localStorage.getItem(entry.key);
    if (!raw) continue;
    keysFound.push(entry.key);
    try {
      return {
        value: JSON.parse(raw),
        source: entry.source,
        key: entry.key,
        keysChecked,
        keysFound,
        parseErrors,
      };
    } catch {
      parseErrors.push(entry.key);
    }
  }

  return {
    value: null,
    source: "none",
    keysChecked,
    keysFound,
    parseErrors,
  };
}

function extractScriptList(raw: unknown): Record<string, unknown>[] {
  if (Array.isArray(raw)) return raw.filter(isObject);
  if (isObject(raw) && Array.isArray(raw["scripts"])) {
    return (raw["scripts"] as unknown[]).filter(isObject);
  }
  return [];
}

function extractActiveScriptId(raw: unknown, source: ScriptsSnapshotSource): string | undefined {
  if (isObject(raw)) {
    const fromObj = pickString(raw, ["activeScriptId", "activeScript", "activeId", "active_id"]);
    if (fromObj) return fromObj;
  }
  const orderedSources: Exclude<ScriptsSnapshotSource, "none">[] =
    source === "none"
      ? SCRIPT_SOURCES_ORDER
      : [source, ...SCRIPT_SOURCES_ORDER.filter((s) => s !== source)];

  for (const src of orderedSources) {
    const key = ACTIVE_SCRIPT_KEYS_BY_SOURCE[src];
    const rawActive = localStorage.getItem(key);
    if (!rawActive) continue;
    try {
      const parsed = JSON.parse(rawActive);
      if (typeof parsed === "string") return parsed;
    } catch {
      // ignore parse failures
    }
  }
  return undefined;
}

function toScriptSummary(raw: Record<string, unknown>): ScriptSummary | null {
  const id = pickString(raw, ["id", "scriptId"]);
  if (!id) return null;
  const updatedAt = pickStringOrNumber(raw, ["updatedAt", "updated_at", "modifiedAt", "modified_at"]);
  const normalizedUpdatedAt =
    typeof updatedAt === "number" ? new Date(updatedAt).toISOString() : updatedAt;
  return {
    id,
    title: pickString(raw, ["title", "name"]),
    updatedAt: normalizedUpdatedAt,
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
  const loaded = loadScriptsSource();
  const rawScripts = loaded.value ?? null;
  const source = loaded.source;
  const scriptsRaw = extractScriptList(rawScripts);
  const scripts = scriptsRaw.map(toScriptSummary).filter((s): s is ScriptSummary => !!s);
  const activeScriptId = extractActiveScriptId(rawScripts, source);
  const activeScriptRaw = activeScriptId
    ? scriptsRaw.find((s) => pickString(s, ["id", "scriptId"]) === activeScriptId) ?? null
    : null;
  const activeScript = activeScriptRaw ? toActiveScript(activeScriptRaw) : null;
  const warnings: string[] = [];
  if (activeScriptId && !activeScript) {
    warnings.push("activeScriptId_not_found_in_scripts");
  }
  if (loaded.keysFound.length > 1) {
    warnings.push("multiple_script_stores_present");
  }

  const snapshot: ScriptsSnapshotV1 = {
    schemaVersion: 1,
    mirroredAt: new Date().toISOString(),
    workspaceId,
    role: "scripts",
    reason,
    source,
    counts: { total: scripts.length, active: activeScriptId ? 1 : 0 },
    scripts,
    activeScriptId: activeScriptId ?? null,
    activeScript,
    meta: {
      ...meta,
      keysChecked: loaded.keysChecked,
      keysFound: loaded.keysFound,
      parseErrors: loaded.parseErrors.length ? loaded.parseErrors : undefined,
      warnings: warnings.length ? warnings : undefined,
    },
  };

  return snapshot;
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

  const { registry } = loadMountRegistry(workspaceId);
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
