import type { MountRole, MountTargetType } from "../types.js";
import { isTargetEligibleForRole } from "../roles.js";

export function assertRoleAllowed(role: MountRole, targetType: MountTargetType): void {
  if (!isTargetEligibleForRole(role, targetType)) {
    throw new Error(`Mount role "${role}" cannot target ${targetType} storage.`);
  }
}
