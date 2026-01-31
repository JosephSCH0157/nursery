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
  if (role === "barstock") {
    payload = buildBarstockSnapshot(workspaceId, reason, meta);
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
    await writeJson(handle, "latest.json", payload);
  } catch (err) {
    const error = err instanceof Error ? err.message : "Mirror write failed.";
    saveLastMirrorStatus({ ...baseStatus, ok: false, error });
    return { ok: false, error };
  }

  const files = { latest: "latest.json", snapshot: `snapshots/${snapshotName}` };
  saveLastMirrorStatus({ ...baseStatus, ok: true, files });
  return { ok: true, files };
}
