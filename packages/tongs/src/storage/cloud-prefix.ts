import { ALL_MOUNT_ROLES, type MountRole } from "./storage-contract.js";

export type TongsCloudWorkspaceIdentity = {
  workspaceId: string;
  ownerUserId?: string | null;
  fallbackUserId?: string | null;
};

export type WorkspaceCloudWriteTarget = {
  key: string;
  mode: "canonical_role" | "legacy_workspace";
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

function resolveCloudOwnerUserId(identity: TongsCloudWorkspaceIdentity): string | null {
  return normalizeNonEmpty(identity.ownerUserId) ?? normalizeNonEmpty(identity.fallbackUserId);
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

export function resolveLegacyWorkspaceObjectKey(workspaceId: string, path: string): string {
  return `workspaces/${workspaceId}/${path}`;
}

export function resolveLegacyWorkspaceRolePrefix(workspaceId: string, role: MountRole, relativePath?: string | null): string {
  return joinPath(`workspaces/${workspaceId}/${role}`, normalizeNonEmpty(relativePath));
}

export function resolveCanonicalWorkspaceRolePrefix(
  identity: TongsCloudWorkspaceIdentity,
  role: MountRole,
  relativePath?: string | null,
): string | null {
  const ownerUserId = resolveCloudOwnerUserId(identity);
  if (!ownerUserId) return null;
  return joinPath(`${ownerUserId}/${identity.workspaceId}/${role}`, normalizeNonEmpty(relativePath));
}

export function resolveWorkspaceCloudWriteTarget(
  identity: TongsCloudWorkspaceIdentity,
  path: string,
): WorkspaceCloudWriteTarget {
  const rolePath = splitMountRolePath(path);
  if (!rolePath) {
    return {
      key: resolveLegacyWorkspaceObjectKey(identity.workspaceId, path),
      mode: "legacy_workspace",
    };
  }

  const canonicalKey = resolveCanonicalWorkspaceRolePrefix(identity, rolePath.role, rolePath.relativePath);
  if (!canonicalKey) {
    return {
      key: resolveLegacyWorkspaceObjectKey(identity.workspaceId, path),
      mode: "legacy_workspace",
      role: rolePath.role,
      legacyFallbackKey: resolveLegacyWorkspaceObjectKey(identity.workspaceId, path),
    };
  }

  return {
    key: canonicalKey,
    mode: "canonical_role",
    role: rolePath.role,
    legacyFallbackKey: resolveLegacyWorkspaceObjectKey(identity.workspaceId, path),
  };
}

export function resolveWorkspaceCloudReadCandidates(
  identity: TongsCloudWorkspaceIdentity,
  path: string,
): string[] {
  const rolePath = splitMountRolePath(path);
  if (!rolePath) {
    return [resolveLegacyWorkspaceObjectKey(identity.workspaceId, path)];
  }

  const candidates = [
    resolveCanonicalWorkspaceRolePrefix(identity, rolePath.role, rolePath.relativePath),
    resolveLegacyWorkspaceObjectKey(identity.workspaceId, path),
  ].filter((value): value is string => typeof value === "string" && value.length > 0);

  return Array.from(new Set(candidates));
}

export function resolveWorkspaceCloudListingPrefixes(
  identity: TongsCloudWorkspaceIdentity,
  role: MountRole,
  relativePath?: string | null,
): string[] {
  const candidates = [
    resolveCanonicalWorkspaceRolePrefix(identity, role, relativePath),
    resolveLegacyWorkspaceRolePrefix(identity.workspaceId, role, relativePath),
  ].filter((value): value is string => typeof value === "string" && value.length > 0);

  return Array.from(new Set(candidates));
}