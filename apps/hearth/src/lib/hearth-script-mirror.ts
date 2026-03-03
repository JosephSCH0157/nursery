type MirrorWriteFailureReason =
  | "missing_workpiece_id"
  | "missing_script_path"
  | "missing_registry"
  | "missing_target"
  | "missing_handle"
  | "permission_denied"
  | "write_failed";

export type MirrorApprovedScriptResult =
  | {
      ok: true;
      workspaceId: string;
      vaultKey: string;
      relativePath: string;
    }
  | {
      ok: false;
      workspaceId: string;
      reason: MirrorWriteFailureReason;
      message: string;
    };

const REGISTRY_KEY = "forge_mount_registry_v2";
const VAULT_DB_NAME = "forge_handle_vault";
const VAULT_STORE_NAME = "handles";
const WORKSPACE_KEYS = ["forge_workspace_id_v1", "barstock_workspace_id"] as const;

type VaultRecord = {
  key?: unknown;
  handle?: FileSystemDirectoryHandle;
};

type MountSide = {
  vaultKey?: unknown;
  hint?: unknown;
} | null;

type MountEntry = {
  role?: unknown;
  target?: unknown;
  local?: MountSide;
  mirror?: (MountSide & {
    enabled?: unknown;
    policy?: unknown;
  }) | null;
};

type RegistryShape = {
  workspaceId?: unknown;
  mounts?: unknown;
};

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object";
}

function resolveWorkspaceId(workspaceId?: string | null): string {
  const explicit = readString(workspaceId);
  if (explicit) return explicit;

  if (typeof window !== "undefined") {
    for (const key of WORKSPACE_KEYS) {
      try {
        const value = readString(window.localStorage.getItem(key));
        if (value) return value;
      } catch {
        // ignore
      }
    }
  }

  return "default";
}

function readMountRegistry(workspaceId: string): RegistryShape | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(REGISTRY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!isObject(parsed)) return null;
    if (!Array.isArray(parsed["mounts"])) return null;
    return {
      ...(parsed as RegistryShape),
      workspaceId,
    };
  } catch {
    return null;
  }
}

function getScriptsMountEntry(registry: RegistryShape): MountEntry | null {
  const mounts = Array.isArray(registry.mounts) ? registry.mounts : [];
  for (const mount of mounts) {
    if (!isObject(mount)) continue;
    const entry = mount as MountEntry;
    if (readString(entry.role) === "scripts") return entry;
  }
  return null;
}

function resolveScriptsTargetVaultKey(entry: MountEntry | null): string | null {
  const mirrorEnabled = entry?.mirror?.enabled === true;
  const mirrorVaultKey = readString(entry?.mirror?.vaultKey);
  const localVaultKey = readString(entry?.local?.vaultKey);
  if (mirrorEnabled && mirrorVaultKey) return mirrorVaultKey;
  if (localVaultKey) return localVaultKey;
  if (mirrorVaultKey) return mirrorVaultKey;
  return null;
}

function openVaultDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(VAULT_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(VAULT_STORE_NAME)) {
        db.createObjectStore(VAULT_STORE_NAME, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getHandleFromVault(vaultKey: string): Promise<FileSystemDirectoryHandle | null> {
  const db = await openVaultDb();
  return await new Promise<FileSystemDirectoryHandle | null>((resolve, reject) => {
    const tx = db.transaction(VAULT_STORE_NAME, "readonly");
    const request = tx.objectStore(VAULT_STORE_NAME).get(vaultKey);
    request.onsuccess = () => {
      const record = request.result as VaultRecord | undefined;
      resolve(record?.handle ?? null);
    };
    request.onerror = () => reject(request.error);
  });
}

async function ensureWritePermission(handle: FileSystemDirectoryHandle): Promise<boolean> {
  const opts = { mode: "readwrite" } as const;
  const anyHandle = handle as FileSystemDirectoryHandle & {
    queryPermission?: (options: { mode: "readwrite" | "read" }) => Promise<PermissionState>;
    requestPermission?: (options: { mode: "readwrite" | "read" }) => Promise<PermissionState>;
  };
  if (anyHandle.queryPermission && (await anyHandle.queryPermission(opts)) === "granted") return true;
  if (anyHandle.requestPermission && (await anyHandle.requestPermission(opts)) === "granted") return true;
  return true;
}

function sanitizePathSegment(segment: string): string {
  const trimmed = segment.trim();
  if (!trimmed) return "";
  if (trimmed === "." || trimmed === "..") return "";
  return trimmed.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_");
}

function normalizeRelativePath(workpieceId: string, scriptPath: string): string | null {
  const episodeId = sanitizePathSegment(workpieceId);
  if (!episodeId) return null;

  const scriptSegments = scriptPath
    .split("/")
    .map((segment) => sanitizePathSegment(segment))
    .filter((segment) => segment.length > 0);

  if (scriptSegments.length === 0) return null;

  return ["workpieces", episodeId, ...scriptSegments].join("/");
}

async function writeMirrorFile(
  root: FileSystemDirectoryHandle,
  relativePath: string,
  text: string,
): Promise<void> {
  const parts = relativePath.split("/").filter((segment) => segment.length > 0);
  const fileName = parts.pop();
  if (!fileName) throw new Error("Missing mirror file name.");

  let current = root;
  for (const part of parts) {
    current = await current.getDirectoryHandle(part, { create: true });
  }

  const fileHandle = await current.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(text);
  await writable.close();
}

export async function mirrorApprovedScriptToLocal(args: {
  workspaceId?: string | null;
  workpieceId: string;
  scriptPath: string;
  scriptText: string;
}): Promise<MirrorApprovedScriptResult> {
  const workspaceId = resolveWorkspaceId(args.workspaceId);
  const workpieceId = readString(args.workpieceId);
  const scriptPath = readString(args.scriptPath);

  if (!workpieceId) {
    return {
      ok: false,
      workspaceId,
      reason: "missing_workpiece_id",
      message: "Missing workpiece id.",
    };
  }
  if (!scriptPath) {
    return {
      ok: false,
      workspaceId,
      reason: "missing_script_path",
      message: "Missing script path.",
    };
  }

  const registry = readMountRegistry(workspaceId);
  if (!registry) {
    return {
      ok: false,
      workspaceId,
      reason: "missing_registry",
      message: "Storage registry not found.",
    };
  }

  const mountEntry = getScriptsMountEntry(registry);
  const targetVaultKey = resolveScriptsTargetVaultKey(mountEntry);
  if (!targetVaultKey) {
    return {
      ok: false,
      workspaceId,
      reason: "missing_target",
      message: "Scripts mirror/local folder is not configured.",
    };
  }

  let handle: FileSystemDirectoryHandle | null = null;
  try {
    handle = await getHandleFromVault(targetVaultKey);
  } catch (err) {
    return {
      ok: false,
      workspaceId,
      reason: "missing_handle",
      message: err instanceof Error ? err.message : "Unable to read scripts folder handle.",
    };
  }
  if (!handle) {
    return {
      ok: false,
      workspaceId,
      reason: "missing_handle",
      message: "Scripts folder handle not found.",
    };
  }

  const hasPermission = await ensureWritePermission(handle);
  if (!hasPermission) {
    return {
      ok: false,
      workspaceId,
      reason: "permission_denied",
      message: "Scripts folder permission was not granted.",
    };
  }

  const relativePath = normalizeRelativePath(workpieceId, scriptPath);
  if (!relativePath) {
    return {
      ok: false,
      workspaceId,
      reason: "missing_script_path",
      message: "Script path was invalid.",
    };
  }

  try {
    await writeMirrorFile(handle, relativePath, args.scriptText);
    return {
      ok: true,
      workspaceId,
      vaultKey: targetVaultKey,
      relativePath,
    };
  } catch (err) {
    return {
      ok: false,
      workspaceId,
      reason: "write_failed",
      message: err instanceof Error ? err.message : "Mirror write failed.",
    };
  }
}
