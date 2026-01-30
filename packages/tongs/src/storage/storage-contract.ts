export type MountRole =
  | "scripts"
  | "barstock"
  | "assets"
  | "projects"
  | "recordings"
  | "exports";

export const LOCAL_ONLY_ROLES = new Set<MountRole>(["recordings", "exports"]);

export const CLOUD_CANONICAL_ROLES = new Set<MountRole>(["scripts", "barstock", "assets", "projects"]);

export const ALL_MOUNT_ROLES: readonly MountRole[] = [
  "scripts",
  "barstock",
  "assets",
  "projects",
  "recordings",
  "exports",
];

export const DEFAULT_MIRROR_POLICY = "readThrough" as const;

export type MirrorPolicy = typeof DEFAULT_MIRROR_POLICY;

export const STORAGE_REGISTRY_VERSION = 2;

export function isLocalOnlyRole(role: MountRole): boolean {
  return LOCAL_ONLY_ROLES.has(role);
}

export function isCloudCanonicalRole(role: MountRole): boolean {
  return CLOUD_CANONICAL_ROLES.has(role);
}
