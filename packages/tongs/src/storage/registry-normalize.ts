import type {
  MountLocalConfig,
  MountMirrorConfig,
  MountRegistryEntry,
  MountRole,
  MountTargetType,
  WorkspaceMountRegistry,
} from "../types";
import {
  ALL_MOUNT_ROLES,
  DEFAULT_MIRROR_POLICY,
  STORAGE_REGISTRY_VERSION,
  isCloudCanonicalRole,
  isLocalOnlyRole,
} from "./storage-contract";

const TARGET_SET: ReadonlySet<MountTargetType> = new Set(["local", "tongs_cloud"]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function sanitizeMirror(input: unknown): MountMirrorConfig | undefined {
  if (!isPlainObject(input)) return undefined;
  const enabled = typeof input["enabled"] === "boolean" ? input["enabled"] : false;
  const policy = typeof input["policy"] === "string" ? (input["policy"] as MountMirrorConfig["policy"]) : undefined;
  const vaultKey = typeof input["vaultKey"] === "string" ? input["vaultKey"] : undefined;
  const hint = typeof input["hint"] === "string" ? input["hint"] : undefined;
  const mirror: MountMirrorConfig = { enabled, policy };
  if (vaultKey) mirror.vaultKey = vaultKey;
  if (hint) mirror.hint = hint;
  return mirror;
}

function sanitizeLocal(input: unknown): MountLocalConfig | undefined {
  if (!isPlainObject(input)) return undefined;
  const vaultKey = typeof input["vaultKey"] === "string" ? input["vaultKey"] : undefined;
  const hint = typeof input["hint"] === "string" ? input["hint"] : undefined;
  if (!vaultKey && !hint) return undefined;
  const local: MountLocalConfig = {};
  if (vaultKey) local.vaultKey = vaultKey;
  if (hint) local.hint = hint;
  return local;
}

function defaultTargetForRole(role: MountRole): MountTargetType {
  if (isLocalOnlyRole(role)) return "local";
  if (isCloudCanonicalRole(role)) return "tongs_cloud";
  return "local";
}

export function normalizeRegistry(
  input: unknown,
  fallbackWorkspaceId = "default",
): WorkspaceMountRegistry {
  const nowIso = new Date().toISOString();
  let mutated = false;

  if (!isPlainObject(input)) {
    return {
      workspaceId: fallbackWorkspaceId,
      version: STORAGE_REGISTRY_VERSION,
      updatedAtIso: nowIso,
      mounts: ALL_MOUNT_ROLES.map((role) => ({
        role,
        target: defaultTargetForRole(role),
        mirror: isCloudCanonicalRole(role) ? { enabled: false, policy: DEFAULT_MIRROR_POLICY } : undefined,
        updatedAtIso: nowIso,
      })),
    };
  }

  const workspaceId =
    typeof input["workspaceId"] === "string" && input["workspaceId"].trim()
      ? (input["workspaceId"] as string)
      : fallbackWorkspaceId;

  const version = typeof input["version"] === "number" ? input["version"] : undefined;
  if (version !== STORAGE_REGISTRY_VERSION) {
    mutated = true;
  }

  const mountsRaw = Array.isArray(input["mounts"]) ? input["mounts"] : [];
  const byRole = new Map<MountRole, MountRegistryEntry>();

  for (const mount of mountsRaw) {
    if (!isPlainObject(mount)) continue;
    const role = mount["role"];
    if (typeof role !== "string" || !ALL_MOUNT_ROLES.includes(role as MountRole)) continue;

    if (byRole.has(role as MountRole)) continue;

    const target = mount["target"];
    const normalizedTarget =
      typeof target === "string" && TARGET_SET.has(target as MountTargetType)
        ? (target as MountTargetType)
        : undefined;

    const entry: MountRegistryEntry = {
      role: role as MountRole,
      target: normalizedTarget ?? defaultTargetForRole(role as MountRole),
    };

    const local = sanitizeLocal(mount["local"]);
    if (local) entry.local = local;

    const mirror = sanitizeMirror(mount["mirror"]);
    if (mirror) entry.mirror = mirror;

    if (isPlainObject(mount["meta"])) {
      entry.meta = mount["meta"];
    }

    byRole.set(role as MountRole, entry);
  }

  const mounts: MountRegistryEntry[] = [];

  for (const role of ALL_MOUNT_ROLES) {
    let entry = byRole.get(role) ?? { role, target: defaultTargetForRole(role) };
    let entryMutated = !byRole.has(role);

    if (entry.target !== "local" && entry.target !== "tongs_cloud") {
      entry.target = defaultTargetForRole(role);
      entryMutated = true;
    }

    if (isLocalOnlyRole(role)) {
      if (entry.target !== "local") {
        console.warn(`[tongs] mount registry override: "${role}" forced to local-only.`);
        entry.target = "local";
        entryMutated = true;
      }
      if (entry.mirror) {
        console.warn(`[tongs] mount registry override: "${role}" mirror disabled for local-only role.`);
        entry.mirror = undefined;
        entryMutated = true;
      }
    }

    if (isCloudCanonicalRole(role)) {
      if (entry.target !== "tongs_cloud") {
        console.warn(`[tongs] mount registry override: "${role}" forced to cloud canonical.`);
        entry.target = "tongs_cloud";
        entryMutated = true;
      }

      if (!entry.mirror) {
        entry.mirror = { enabled: false, policy: DEFAULT_MIRROR_POLICY };
        entryMutated = true;
      } else {
        const nextMirror: MountMirrorConfig = {
          enabled: entry.mirror.enabled ?? false,
          policy: entry.mirror.policy ?? DEFAULT_MIRROR_POLICY,
          vaultKey: entry.mirror.vaultKey,
          hint: entry.mirror.hint,
        };
        entry.mirror = nextMirror;
      }
    }

    if (entryMutated) {
      entry = { ...entry, updatedAtIso: nowIso };
      mutated = true;
    }

    mounts.push(entry);
  }

  const updatedAtIso =
    mutated || typeof input["updatedAtIso"] !== "string" ? nowIso : (input["updatedAtIso"] as string);

  return {
    workspaceId,
    version: STORAGE_REGISTRY_VERSION,
    updatedAtIso,
    mounts,
  };
}
