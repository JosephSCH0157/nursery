import type { WorkspaceMountRegistry } from "./types";
import { MOUNT_ROLE_POLICY } from "./roles";

export function buildDefaultRegistry(workspaceId: string): WorkspaceMountRegistry {
  return {
    workspaceId,
    mounts: MOUNT_ROLE_POLICY.map((policy) => ({
      role: policy.role,
      target: policy.eligibleTargets[0] ?? "local",
    })),
  };
}
