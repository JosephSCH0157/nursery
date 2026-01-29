import type { MountRole, MountTargetType } from "./types";

export type MountRolePolicy = {
  role: MountRole;
  label: string;
  eligibleTargets: readonly MountTargetType[];
};

export const MOUNT_ROLE_POLICY = [
  { role: "scripts", label: "Scripts", eligibleTargets: ["local", "tongs_cloud"] },
  { role: "projects", label: "Projects", eligibleTargets: ["local", "tongs_cloud"] },
  { role: "assets", label: "Assets", eligibleTargets: ["local", "tongs_cloud"] },

  // Local-only for v1 (reduce support load)
  { role: "recordings", label: "Recordings", eligibleTargets: ["local"] },
  { role: "exports", label: "Exports", eligibleTargets: ["local"] },
] as const satisfies readonly MountRolePolicy[];
