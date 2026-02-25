import type { MirrorPolicy, MountRole, MountTargetType, WorkspaceMountRegistry } from "../types.js";
import { DEFAULT_MIRROR_POLICY, isCloudCanonicalRole, isLocalOnlyRole } from "./storage-contract.js";
import { assertRoleAllowed } from "./storage-guard.js";

export type ResolvedMountTarget = {
  type: "local" | "cloud";
  target: MountTargetType;
  vaultKey?: string;
  hint?: string;
};

export type ResolvedMount = {
  role: MountRole;
  canonicalTarget: ResolvedMountTarget;
  mirrorTarget?: ResolvedMountTarget;
  mirrorPolicy?: MirrorPolicy;
};

export function resolveMount(
  registry: WorkspaceMountRegistry | null | undefined,
  role: MountRole,
): ResolvedMount {
  const entry = registry?.mounts.find((mount) => mount.role === role);

  let target: MountTargetType = entry?.target ?? "local";
  if (isLocalOnlyRole(role)) target = "local";
  if (isCloudCanonicalRole(role)) target = "tongs_cloud";

  assertRoleAllowed(role, target);

  const canonicalTarget: ResolvedMountTarget =
    target === "tongs_cloud"
      ? { type: "cloud", target }
      : {
          type: "local",
          target,
          vaultKey: entry?.local?.vaultKey,
          hint: entry?.local?.hint,
        };

  if (!isCloudCanonicalRole(role)) {
    return { role, canonicalTarget };
  }

  const mirror = entry?.mirror;
  if (!mirror?.enabled) {
    return { role, canonicalTarget };
  }

  const mirrorPolicy = mirror.policy ?? DEFAULT_MIRROR_POLICY;

  return {
    role,
    canonicalTarget,
    mirrorTarget: {
      type: "local",
      target: "local",
      vaultKey: mirror.vaultKey,
      hint: mirror.hint,
    },
    mirrorPolicy,
  };
}
