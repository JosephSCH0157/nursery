type ManagedRole = "scripts" | "recordings";

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

export type NurseryManagedDirectory = {
  managed: boolean;
  localPersistenceExpected: boolean;
  role: ManagedRole;
  workspaceId: string | null;
  vaultKey?: string;
  hint?: string;
  handle: FileSystemDirectoryHandle | null;
};

const REGISTRY_KEY = "forge_mount_registry_v2";
const ACTIVE_WORKSPACE_KEYS = ["forge_workspace_id_v1", "barstock_workspace_id"] as const;
const VAULT_DB_NAME = "forge_handle_vault";
const VAULT_STORE_NAME = "handles";

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function readRegistry(): RegistryShape | null {
  try {
    const raw = localStorage.getItem(REGISTRY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RegistryShape;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function getActiveWorkspaceId(registry: RegistryShape | null): string | null {
  for (const key of ACTIVE_WORKSPACE_KEYS) {
    try {
      const value = readString(localStorage.getItem(key));
      if (value) return value;
    } catch {
      // ignore
    }
  }
  return readString(registry?.workspaceId) ?? "default";
}

function getMountEntry(registry: RegistryShape | null, role: ManagedRole): MountEntry | null {
  const mounts = Array.isArray(registry?.mounts) ? (registry?.mounts as unknown[]) : [];
  for (const mount of mounts) {
    if (!mount || typeof mount !== "object") continue;
    const entry = mount as MountEntry;
    if (readString(entry.role) === role) return entry;
  }
  return null;
}

function buildFallbackVaultKey(
  workspaceId: string | null,
  role: ManagedRole,
  side: "local" | "mirror" = "local",
): string {
  return `mount:${workspaceId ?? "default"}:${role}:${side}`;
}

function pickVaultAndHint(
  role: ManagedRole,
  workspaceId: string | null,
  entry: MountEntry | null,
): { vaultKey?: string; hint?: string; localPersistenceExpected: boolean } {
  const localVaultKey = readString(entry?.local?.vaultKey);
  const localHint = readString(entry?.local?.hint) ?? undefined;
  const mirrorVaultKey = readString(entry?.mirror?.vaultKey);
  const mirrorHint = readString(entry?.mirror?.hint) ?? undefined;
  const mirrorEnabled = entry?.mirror?.enabled === true;
  const target = readString(entry?.target);

  // Cloud-canonical recordings use the explicitly configured local mirror.
  // A stale local binding may coexist with a cloud target after a target change,
  // so the target and mirror setting must be evaluated before the local binding.
  if (role === "recordings" && target === "tongs_cloud") {
    if (!mirrorEnabled) {
      return { localPersistenceExpected: false };
    }
    return {
      vaultKey: mirrorVaultKey ?? buildFallbackVaultKey(workspaceId, role, "mirror"),
      hint: mirrorHint,
      localPersistenceExpected: true,
    };
  }

  if (localVaultKey) {
    return { vaultKey: localVaultKey, hint: localHint ?? mirrorHint, localPersistenceExpected: true };
  }

  // Scripts are cloud-canonical in Nursery; when mirrored locally, Anvil reads from mirror.
  if (role === "scripts" && mirrorVaultKey && (mirrorEnabled || !localVaultKey)) {
    return { vaultKey: mirrorVaultKey, hint: mirrorHint ?? localHint, localPersistenceExpected: true };
  }

  return {
    vaultKey: buildFallbackVaultKey(workspaceId, role),
    hint: localHint ?? mirrorHint,
    localPersistenceExpected: true,
  };
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

async function getHandleFromVault(key: string): Promise<FileSystemDirectoryHandle | null> {
  try {
    const db = await openVaultDb();
    return await new Promise<FileSystemDirectoryHandle | null>((resolve, reject) => {
      const tx = db.transaction(VAULT_STORE_NAME, "readonly");
      const request = tx.objectStore(VAULT_STORE_NAME).get(key);
      request.onsuccess = () => {
        const result = request.result as { key?: string; handle?: FileSystemDirectoryHandle } | undefined;
        resolve(result?.handle ?? null);
      };
      request.onerror = () => reject(request.error);
    });
  } catch {
    return null;
  }
}

function getForgeHubOrigin(): string {
  try {
    const w = window as any;
    const fromEnv = readString(w.FORGE_HUB_ORIGIN);
    if (fromEnv) return fromEnv;
    const fromForgeConfig = readString(w.__forgeAppOrigin);
    if (fromForgeConfig) return fromForgeConfig;
  } catch {
    // ignore
  }
  return "";
}

export function getNurseryStorageSettingsUrl(): string {
  const origin = getForgeHubOrigin();
  if (!origin) return "/app/settings/storage";
  try {
    return new URL("/app/settings/storage", origin).toString();
  } catch {
    return "/app/settings/storage";
  }
}

export async function getNurseryManagedDirectory(role: ManagedRole): Promise<NurseryManagedDirectory> {
  const registry = readRegistry();
  if (!registry) {
    return {
      managed: false,
      localPersistenceExpected: false,
      role,
      workspaceId: null,
      handle: null,
    };
  }

  const workspaceId = getActiveWorkspaceId(registry);
  const entry = getMountEntry(registry, role);
  const { vaultKey, hint, localPersistenceExpected } = pickVaultAndHint(role, workspaceId, entry);
  const handle = vaultKey ? await getHandleFromVault(vaultKey) : null;

  return {
    managed: true,
    localPersistenceExpected,
    role,
    workspaceId,
    vaultKey,
    hint,
    handle,
  };
}
