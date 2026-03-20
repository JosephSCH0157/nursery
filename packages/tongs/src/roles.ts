import type { MountRole, MountTargetType } from "./types.js";

export type MountRolePolicy = {
  role: MountRole;
  label: string;
  eligibleTargets: readonly MountTargetType[];
  defaultTarget: MountTargetType;
  defaultMirrorEnabled: boolean;
};

export const MOUNT_ROLE_POLICY = [
  { role: "scripts", label: "Scripts", eligibleTargets: ["tongs_cloud", "local"], defaultTarget: "tongs_cloud", defaultMirrorEnabled: false },
  { role: "barstock", label: "Barstock", eligibleTargets: ["tongs_cloud", "local"], defaultTarget: "tongs_cloud", defaultMirrorEnabled: false },
  { role: "projects", label: "Projects", eligibleTargets: ["tongs_cloud", "local"], defaultTarget: "tongs_cloud", defaultMirrorEnabled: false },
  { role: "assets", label: "Assets", eligibleTargets: ["tongs_cloud", "local"], defaultTarget: "tongs_cloud", defaultMirrorEnabled: false },
  { role: "recordings", label: "Recordings", eligibleTargets: ["local", "tongs_cloud"], defaultTarget: "tongs_cloud", defaultMirrorEnabled: true },
  { role: "exports", label: "Exports", eligibleTargets: ["local", "tongs_cloud"], defaultTarget: "tongs_cloud", defaultMirrorEnabled: true },
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
    defaultMirrorEnabled: false,
  };
}

export function getDefaultMountTarget(role: MountRole): MountTargetType {
  return getMountRolePolicy(role).defaultTarget;
}

export function isTargetEligibleForRole(role: MountRole, target: MountTargetType): boolean {
  return getMountRolePolicy(role).eligibleTargets.includes(target);
}

export function getDefaultMirrorEnabled(role: MountRole): boolean {
  return getMountRolePolicy(role).defaultMirrorEnabled;
}
