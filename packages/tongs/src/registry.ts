import type { MountRegistryEntry, MountRole, MountTargetType, WorkspaceMountRegistry } from "./types";
import { MOUNT_ROLE_POLICY } from "./roles";

export type RegistryIssueCode =
  | "MISSING_WORKSPACE_ID"
  | "MISSING_MOUNTS"
  | "DUPLICATE_ROLE"
  | "INVALID_ROLE"
  | "INVALID_TARGET"
  | "INVALID_META"
  | "UNKNOWN";

export type RegistryIssue = {
  code: RegistryIssueCode;
  message: string;
  role?: string;
};

const ROLE_SET: ReadonlySet<MountRole> = new Set(MOUNT_ROLE_POLICY.map((policy) => policy.role));

const TARGET_SET: ReadonlySet<MountTargetType> = new Set(["local", "tongs_cloud"]);

function isPlainObject(x: unknown): x is Record<string, unknown> {
  return !!x && typeof x === "object" && !Array.isArray(x);
}

export function validateRegistry(
  input: unknown,
): { ok: true } | { ok: false; issues: RegistryIssue[] } {
  const issues: RegistryIssue[] = [];

  if (!isPlainObject(input)) {
    return { ok: false, issues: [{ code: "UNKNOWN", message: "Registry must be an object." }] };
  }

  const workspaceId = input["workspaceId"];
  if (typeof workspaceId !== "string" || !workspaceId.trim()) {
    issues.push({ code: "MISSING_WORKSPACE_ID", message: "workspaceId is required." });
  }

  const mounts = input["mounts"];
  if (!Array.isArray(mounts)) {
    issues.push({ code: "MISSING_MOUNTS", message: "mounts must be an array." });
    return { ok: false, issues };
  }

  const seenRoles = new Set<string>();

  for (const m of mounts) {
    if (!isPlainObject(m)) {
      issues.push({ code: "UNKNOWN", message: "Each mount must be an object." });
      continue;
    }

    const role = m["role"];
    const target = m["target"];
    const meta = m["meta"];

    if (typeof role !== "string" || !ROLE_SET.has(role as MountRole)) {
      issues.push({ code: "INVALID_ROLE", message: "Invalid mount role.", role: String(role) });
      continue;
    }

    if (seenRoles.has(role)) {
      issues.push({ code: "DUPLICATE_ROLE", message: "Duplicate mount role.", role });
      continue;
    }
    seenRoles.add(role);

    if (typeof target !== "string" || !TARGET_SET.has(target as MountTargetType)) {
      issues.push({ code: "INVALID_TARGET", message: "Invalid mount target.", role });
    }

    if (meta !== undefined && !isPlainObject(meta)) {
      issues.push({ code: "INVALID_META", message: "meta must be an object if provided.", role });
    }
  }

  return issues.length ? { ok: false, issues } : { ok: true };
}

/**
 * Normalize unknown input into a safe WorkspaceMountRegistry shape.
 * - Drops invalid mounts
 * - Dedupes by role (first wins)
 * - Ensures stable fields
 */
export function normalizeRegistry(
  input: unknown,
  fallbackWorkspaceId = "default",
): WorkspaceMountRegistry {
  if (!isPlainObject(input)) {
    return { workspaceId: fallbackWorkspaceId, mounts: [] };
  }

  const workspaceId =
    typeof input["workspaceId"] === "string" && input["workspaceId"].trim()
      ? (input["workspaceId"] as string)
      : fallbackWorkspaceId;

  const mountsRaw = Array.isArray(input["mounts"]) ? input["mounts"] : [];
  const mounts: MountRegistryEntry[] = [];
  const seen = new Set<MountRole>();

  for (const m of mountsRaw) {
    if (!isPlainObject(m)) continue;

    const role = m["role"];
    const target = m["target"];
    const meta = m["meta"];

    if (typeof role !== "string" || !ROLE_SET.has(role as MountRole)) continue;
    if (seen.has(role as MountRole)) continue;
    seen.add(role as MountRole);

    if (typeof target !== "string" || !TARGET_SET.has(target as MountTargetType)) continue;

    const entry: MountRegistryEntry = {
      role: role as MountRole,
      target: target as MountTargetType,
    };

    if (meta !== undefined && isPlainObject(meta)) {
      entry.meta = meta;
    }

    mounts.push(entry);
  }

  return { workspaceId, mounts };
}
