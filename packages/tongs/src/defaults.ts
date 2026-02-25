import type { MountRegistryEntry, WorkspaceMountRegistry } from "./types.js";
import { MOUNT_ROLE_POLICY } from "./roles.js";
import { DEFAULT_MIRROR_POLICY, isCloudCanonicalRole, STORAGE_REGISTRY_VERSION } from "./storage/storage-contract.js";

export function buildDefaultRegistry(workspaceId: string): WorkspaceMountRegistry {
  const nowIso = new Date().toISOString();

  return {
    workspaceId,
    version: STORAGE_REGISTRY_VERSION,
    updatedAtIso: nowIso,
    mounts: MOUNT_ROLE_POLICY.map((policy) => {
      const entry: MountRegistryEntry = {
        role: policy.role,
        target: policy.eligibleTargets[0] ?? "local",
        updatedAtIso: nowIso,
      };

      if (isCloudCanonicalRole(policy.role)) {
        entry.mirror = { enabled: false, policy: DEFAULT_MIRROR_POLICY };
      }

      return entry;
    }),
  };
}
