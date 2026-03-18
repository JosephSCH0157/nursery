import { ALL_MOUNT_ROLES, type MountRole } from "./storage-contract.js";

export type TongsCloudWorkspaceIdentity = {
  workspaceId: string;
  legacyOwnerUserId?: string | null;
};

export type WorkspaceCloudWriteTarget = {
  key: string;
  mode: "canonical_role" | "workspace_support";
  role?: MountRole;
  legacyFallbackKey?: string;
};

const MOUNT_ROLE_SET = new Set<MountRole>(ALL_MOUNT_ROLES);

function normalizeNonEmpty(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function joinPath(prefix: string, relativePath: string | null): string {
  return relativePath ? `${prefix}/${relativePath}` : prefix;
}

export function isMountRoleSegment(value: string): value is MountRole {
  return MOUNT_ROLE_SET.has(value as MountRole);
}

export function splitMountRolePath(path: string): { role: MountRole; relativePath: string | null } | null {
  const [first, ...rest] = path.split("/");
  if (!first || !isMountRoleSegment(first)) return null;
  return {
    role: first,
    relativePath: rest.length > 0 ? rest.join("/") : null,
  };
}

export function resolveWorkspaceSupportObjectKey(workspaceId: string, path: string): string {
  return `workspaces/${workspaceId}/${path}`;
}

export function resolveCanonicalWorkspaceRolePrefix(workspaceId: string, role: MountRole, relativePath?: string | null): string {
  return joinPath(`workspaces/${workspaceId}/${role}`, normalizeNonEmpty(relativePath));
}

export function resolveLegacyOwnerWorkspaceRolePrefix(
  identity: TongsCloudWorkspaceIdentity,
  role: MountRole,
  relativePath?: string | null,
): string | null {
  const legacyOwnerUserId = normalizeNonEmpty(identity.legacyOwnerUserId);
  if (!legacyOwnerUserId) return null;
  return joinPath(`${legacyOwnerUserId}/${identity.workspaceId}/${role}`, normalizeNonEmpty(relativePath));
}

export function resolveWorkspaceCloudWriteTarget(
  identity: TongsCloudWorkspaceIdentity,
  path: string,
): WorkspaceCloudWriteTarget {
  const rolePath = splitMountRolePath(path);
  if (!rolePath) {
    return {
      key: resolveWorkspaceSupportObjectKey(identity.workspaceId, path),
      mode: "workspace_support",
    };
  }

  return {
    key: resolveCanonicalWorkspaceRolePrefix(identity.workspaceId, rolePath.role, rolePath.relativePath),
    mode: "canonical_role",
    role: rolePath.role,
    legacyFallbackKey: resolveLegacyOwnerWorkspaceRolePrefix(identity, rolePath.role, rolePath.relativePath) ?? undefined,
  };
}

export function resolveWorkspaceCloudReadCandidates(
  identity: TongsCloudWorkspaceIdentity,
  path: string,
): string[] {
  const rolePath = splitMountRolePath(path);
  if (!rolePath) {
    return [resolveWorkspaceSupportObjectKey(identity.workspaceId, path)];
  }

  const candidates = [
    resolveCanonicalWorkspaceRolePrefix(identity.workspaceId, rolePath.role, rolePath.relativePath),
    resolveLegacyOwnerWorkspaceRolePrefix(identity, rolePath.role, rolePath.relativePath),
  ].filter((value): value is string => typeof value === "string" && value.length > 0);

  return Array.from(new Set(candidates));
}

export function resolveWorkspaceCloudListingPrefixes(
  identity: TongsCloudWorkspaceIdentity,
  role: MountRole,
  relativePath?: string | null,
): string[] {
  const candidates = [
    resolveCanonicalWorkspaceRolePrefix(identity.workspaceId, role, relativePath),
    resolveLegacyOwnerWorkspaceRolePrefix(identity, role, relativePath),
  ].filter((value): value is string => typeof value === "string" && value.length > 0);

  return Array.from(new Set(candidates));
}