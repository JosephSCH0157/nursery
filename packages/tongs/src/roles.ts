import type { MountRole, MountTargetType } from "./types.js";

export type MountRolePolicy = {
  role: MountRole;
  label: string;
  eligibleTargets: readonly MountTargetType[];
  defaultTarget: MountTargetType;
};

export const MOUNT_ROLE_POLICY = [
  { role: "scripts", label: "Scripts", eligibleTargets: ["tongs_cloud", "local"], defaultTarget: "tongs_cloud" },
  { role: "barstock", label: "Barstock", eligibleTargets: ["tongs_cloud", "local"], defaultTarget: "tongs_cloud" },
  { role: "projects", label: "Projects", eligibleTargets: ["tongs_cloud", "local"], defaultTarget: "tongs_cloud" },
  { role: "assets", label: "Assets", eligibleTargets: ["tongs_cloud", "local"], defaultTarget: "tongs_cloud" },
  { role: "recordings", label: "Recordings", eligibleTargets: ["local", "tongs_cloud"], defaultTarget: "local" },
  { role: "exports", label: "Exports", eligibleTargets: ["local", "tongs_cloud"], defaultTarget: "local" },
] as const satisfies readonly MountRolePolicy[];

const ROLE_POLICY_MAP = new Map<MountRole, MountRolePolicy>(
  MOUNT_ROLE_POLICY.map((policy) => [policy.role, policy]),
);

export function getMountRolePolicy(role: MountRole): MountRolePolicy {
  return ROLE_POLICY_MAP.get(role) ?? {
    role,
    label: role,
    eligibleTargets: ["local", "tongs_cloud"],
    defaultTarget: "local",
  };
}

export function getDefaultMountTarget(role: MountRole): MountTargetType {
  return getMountRolePolicy(role).defaultTarget;
}

export function isTargetEligibleForRole(role: MountRole, target: MountTargetType): boolean {
  return getMountRolePolicy(role).eligibleTargets.includes(target);
}
