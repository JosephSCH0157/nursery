import type { MountRole, MountTargetType } from "./types";
import { MOUNT_ROLE_POLICY } from "./roles";
import { ALL_MOUNT_ROLES } from "./storage/storage-contract";
import { normalizeRegistry } from "./storage/registry-normalize";

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

const ROLE_SET: ReadonlySet<MountRole> = new Set(ALL_MOUNT_ROLES);

const TARGET_SET: ReadonlySet<MountTargetType> = new Set(["local", "tongs_cloud"]);

const ROLE_POLICY = new Map<MountRole, (typeof MOUNT_ROLE_POLICY)[number]>(
  MOUNT_ROLE_POLICY.map((policy) => [policy.role, policy]),
);

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
    const mirror = m["mirror"];
    const local = m["local"];

    if (typeof role !== "string" || !ROLE_SET.has(role as MountRole)) {
      issues.push({ code: "INVALID_ROLE", message: "Invalid mount role.", role: String(role) });
      continue;
    }

    if (seenRoles.has(role)) {
      issues.push({ code: "DUPLICATE_ROLE", message: "Duplicate mount role.", role });
      continue;
    }
    seenRoles.add(role);

    const targetIsValidType = typeof target === "string" && TARGET_SET.has(target as MountTargetType);
    if (!targetIsValidType) {
      issues.push({ code: "INVALID_TARGET", message: "Invalid mount target.", role });
    }
    if (targetIsValidType) {
      const allowedTargets = (ROLE_POLICY.get(role as MountRole)?.eligibleTargets ??
        ["local"]) as readonly MountTargetType[];
      if (!allowedTargets.includes(target as MountTargetType)) {
        issues.push({ code: "INVALID_TARGET", message: "Invalid mount target.", role });
      }
    }

    if (meta !== undefined && !isPlainObject(meta)) {
      issues.push({ code: "INVALID_META", message: "meta must be an object if provided.", role });
    }

    if (mirror !== undefined) {
      if (!isPlainObject(mirror)) {
        issues.push({ code: "INVALID_META", message: "mirror must be an object if provided.", role });
      } else {
        if ("enabled" in mirror && typeof mirror["enabled"] !== "boolean") {
          issues.push({ code: "INVALID_META", message: "mirror.enabled must be boolean.", role });
        }
        if ("policy" in mirror && typeof mirror["policy"] !== "string") {
          issues.push({ code: "INVALID_META", message: "mirror.policy must be a string.", role });
        }
        if ("vaultKey" in mirror && typeof mirror["vaultKey"] !== "string") {
          issues.push({ code: "INVALID_META", message: "mirror.vaultKey must be a string.", role });
        }
        if ("hint" in mirror && typeof mirror["hint"] !== "string") {
          issues.push({ code: "INVALID_META", message: "mirror.hint must be a string.", role });
        }
      }
    }

    if (local !== undefined) {
      if (!isPlainObject(local)) {
        issues.push({ code: "INVALID_META", message: "local must be an object if provided.", role });
      } else {
        if ("vaultKey" in local && typeof local["vaultKey"] !== "string") {
          issues.push({ code: "INVALID_META", message: "local.vaultKey must be a string.", role });
        }
        if ("hint" in local && typeof local["hint"] !== "string") {
          issues.push({ code: "INVALID_META", message: "local.hint must be a string.", role });
        }
      }
    }
  }

  return issues.length ? { ok: false, issues } : { ok: true };
}
export { normalizeRegistry };
