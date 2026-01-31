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
  if (!mirrorTarget?.vaultKey) {
    return { ok: false, error: "Mirror folder not configured for this role." };
  }

  const handle = await getHandle(mirrorTarget.vaultKey);
  if (!handle) {
    return { ok: false, error: "Mirror folder handle not found. Choose a folder again." };
  }

  const allowed = await ensurePermission(handle);
  if (!allowed) {
    return { ok: false, error: "Mirror folder permission was not granted." };
  }

  let payload: unknown;
  if (role === "barstock") {
    payload = buildBarstockSnapshot(workspaceId, reason, meta);
  } else {
    return { ok: false, error: `Mirroring not implemented for role: ${role}.` };
  }

  const timestamp = toSafeTimestamp(new Date());
  const snapshotsDir = await handle.getDirectoryHandle("snapshots", { create: true });
  const snapshotName = `${role}-${timestamp}.json`;

  await writeJson(snapshotsDir, snapshotName, payload);
  await writeJson(handle, "latest.json", payload);

  return { ok: true, files: { latest: "latest.json", snapshot: `snapshots/${snapshotName}` } };
}
