import type { MountRole, MountTargetType } from "../types.js";
import { isLocalOnlyRole } from "./storage-contract.js";

export function assertRoleAllowed(role: MountRole, targetType: MountTargetType): void {
  if (isLocalOnlyRole(role) && targetType === "tongs_cloud") {
    throw new Error(`Mount role "${role}" is local-only and cannot target cloud storage.`);
  }
}
