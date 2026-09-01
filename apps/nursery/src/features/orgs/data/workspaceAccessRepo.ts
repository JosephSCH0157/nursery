import { supabase } from "../../../lib/supabase";
import type {
  OrgMember,
  OrgWorkspace,
  UpsertWorkspaceMembershipInput,
  WorkspaceMembership,
} from "../types";
import {
  normalizeOrgRole,
  normalizeWorkspaceAccessRole,
} from "../types";

type RawOrgMemberRow = {
  user_id?: unknown;
  user_email?: unknown;
  org_role?: unknown;
  created_at?: unknown;
};

type RawWorkspaceRow = {
  id?: unknown;
  name?: unknown;
  created_by?: unknown;
  created_at?: unknown;
};

type RawWorkspaceMembershipRow = {
  workspace_id?: unknown;
  role?: unknown;
  created_at?: unknown;
  created_by?: unknown;
  workspace?: {
    id?: unknown;
    name?: unknown;
    org_id?: unknown;
  } | null;
  workspaces?: {
    id?: unknown;
    name?: unknown;
    org_id?: unknown;
  } | null;
};

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function toErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

function fail(message: string): never {
  throw new Error(message);
}

export async function loadOrgMembers(orgId: string): Promise<OrgMember[]> {
  const normalizedOrgId = orgId.trim();
  if (!normalizedOrgId) return [];

  const tongsClient = supabase.schema("tongs") as unknown as {
    rpc: (fn: "list_org_members", args: { p_org_id: string }) => Promise<{ data: unknown; error: unknown }>;
  };

  const { data, error } = await tongsClient.rpc("list_org_members", {
    p_org_id: normalizedOrgId,
  });

  if (error) {
    throw new Error(toErrorMessage(error, "Failed loading organization members."));
  }

  const rows = Array.isArray(data) ? data as RawOrgMemberRow[] : [];
  return rows.map((row) => {
    const userId = readString(row.user_id) ?? fail("Organization member row is missing user_id.");
    const orgRole = normalizeOrgRole(readString(row.org_role)) ?? fail(`Unsupported org role for user ${userId}.`);
    const createdAt = readString(row.created_at) ?? fail(`Organization member row is missing created_at for user ${userId}.`);
    return {
      userId,
      orgRole,
      createdAt,
      displayName: null,
      avatarUrl: null,
      email: readString(row.user_email),
    } satisfies OrgMember;
  });
}

export async function loadOrgWorkspaces(orgId: string): Promise<OrgWorkspace[]> {
  const normalizedOrgId = orgId.trim();
  if (!normalizedOrgId) return [];

  const tongsClient = supabase.schema("tongs") as unknown as {
    from: (table: "workspaces") => {
      select: (columns: string) => {
        eq: (column: string, value: string) => {
          order: (column: string, options?: { ascending?: boolean }) => Promise<{ data: unknown; error: unknown }>;
        };
      };
    };
  };

  const { data, error } = await tongsClient
    .from("workspaces")
    .select("id, name, created_by, created_at")
    .eq("org_id", normalizedOrgId)
    .order("name", { ascending: true });

  if (error) {
    throw new Error(toErrorMessage(error, "Failed loading organization workspaces."));
  }

  const rows = Array.isArray(data) ? data as RawWorkspaceRow[] : [];
  return rows.map((row) => ({
    id: readString(row.id) ?? fail("Workspace row is missing id."),
    name: readString(row.name) ?? fail("Workspace row is missing name."),
    createdBy: readString(row.created_by),
    createdAt: readString(row.created_at),
  } satisfies OrgWorkspace));
}

export async function loadWorkspaceMembershipsForMember(orgId: string, userId: string): Promise<WorkspaceMembership[]> {
  const normalizedOrgId = orgId.trim();
  const normalizedUserId = userId.trim();
  if (!normalizedOrgId || !normalizedUserId) return [];

  const tongsClient = supabase.schema("tongs") as unknown as {
    from: (table: "workspace_members") => {
      select: (columns: string) => {
        eq: (column: string, value: string) => {
          order: (column: string, options?: { ascending?: boolean }) => Promise<{ data: unknown; error: unknown }>;
        };
      };
    };
  };

  const { data, error } = await tongsClient
    .from("workspace_members")
    .select("workspace_id, role, created_at, created_by, workspace:workspaces!inner(id, name, org_id)")
    .eq("user_id", normalizedUserId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(toErrorMessage(error, "Failed loading workspace access."));
  }

  const rows = Array.isArray(data) ? data as RawWorkspaceMembershipRow[] : [];
  return rows.flatMap((row) => {
    const workspace = row.workspace ?? row.workspaces ?? null;
    if (readString(workspace?.org_id) !== normalizedOrgId) return [];
    const workspaceId = readString(row.workspace_id) ?? readString(workspace?.id);
    const workspaceName = readString(workspace?.name);
    const role = normalizeWorkspaceAccessRole(readString(row.role));
    if (!workspaceId || !workspaceName || !role) return [];
    return [{
      workspaceId,
      workspaceName,
      role,
      createdAt: readString(row.created_at),
      createdBy: readString(row.created_by),
    } satisfies WorkspaceMembership];
  });
}

async function assertWorkspaceAccessTarget(orgId: string, userId: string, workspaceId: string): Promise<void> {
  const normalizedOrgId = orgId.trim();
  const normalizedUserId = userId.trim();
  const normalizedWorkspaceId = workspaceId.trim();
  if (!normalizedOrgId || !normalizedUserId || !normalizedWorkspaceId) {
    fail("Workspace access update requires orgId, userId, and workspaceId.");
  }

  type MaybeSingleQueryBuilder = {
    eq: (column: string, value: string) => MaybeSingleQueryBuilder;
    maybeSingle: () => Promise<{ data: unknown; error: unknown }>;
  };

  const tongsClient = supabase.schema("tongs") as unknown as {
    from: (table: "org_members" | "workspaces") => {
      select: (columns: string) => MaybeSingleQueryBuilder;
    };
  };

  const [{ data: memberRow, error: memberError }, { data: workspaceRow, error: workspaceError }] = await Promise.all([
    tongsClient
      .from("org_members")
      .select("user_id")
      .eq("org_id", normalizedOrgId)
      .eq("user_id", normalizedUserId)
      .maybeSingle(),
    tongsClient
      .from("workspaces")
      .select("id")
      .eq("org_id", normalizedOrgId)
      .eq("id", normalizedWorkspaceId)
      .maybeSingle(),
  ]);

  if (memberError) {
    throw new Error(toErrorMessage(memberError, "Failed validating organization membership."));
  }
  if (workspaceError) {
    throw new Error(toErrorMessage(workspaceError, "Failed validating workspace target."));
  }
  if (!memberRow) {
    throw new Error("Selected user is not a member of the current organization.");
  }
  if (!workspaceRow) {
    throw new Error("Selected workspace does not belong to the current organization.");
  }
}

export async function upsertWorkspaceMembership(
  orgId: string,
  input: UpsertWorkspaceMembershipInput,
  actingUserId: string,
): Promise<void> {
  await assertWorkspaceAccessTarget(orgId, input.userId, input.workspaceId);

  const normalizedActingUserId = actingUserId.trim();
  if (!normalizedActingUserId) {
    throw new Error("Acting user is required to grant workspace access.");
  }

  const tongsClient = supabase.schema("tongs") as unknown as {
    from: (table: "workspace_members") => {
      upsert: (values: Record<string, unknown>, options: { onConflict: string }) => Promise<{ error: unknown }>;
    };
  };

  const { error } = await tongsClient
    .from("workspace_members")
    .upsert(
      {
        workspace_id: input.workspaceId,
        user_id: input.userId,
        role: input.role,
        created_by: normalizedActingUserId,
      },
      { onConflict: "workspace_id,user_id" },
    );

  if (error) {
    throw new Error(toErrorMessage(error, "Failed saving workspace access."));
  }
}

export async function revokeWorkspaceMembership(orgId: string, workspaceId: string, userId: string): Promise<void> {
  await assertWorkspaceAccessTarget(orgId, userId, workspaceId);

  const tongsClient = supabase.schema("tongs") as unknown as {
    from: (table: "workspace_members") => {
      delete: () => {
        eq: (column: string, value: string) => {
          eq: (column: string, value: string) => Promise<{ error: unknown }>;
        };
      };
    };
  };

  const { error } = await tongsClient
    .from("workspace_members")
    .delete()
    .eq("workspace_id", workspaceId.trim())
    .eq("user_id", userId.trim());

  if (error) {
    throw new Error(toErrorMessage(error, "Failed revoking workspace access."));
  }
}

export type WorkspaceAccessRepo = {
  loadOrgMembers: typeof loadOrgMembers;
  loadOrgWorkspaces: typeof loadOrgWorkspaces;
  loadWorkspaceMembershipsForMember: typeof loadWorkspaceMembershipsForMember;
  upsertWorkspaceMembership: typeof upsertWorkspaceMembership;
  revokeWorkspaceMembership: typeof revokeWorkspaceMembership;
};

export const workspaceAccessRepo: WorkspaceAccessRepo = {
  loadOrgMembers,
  loadOrgWorkspaces,
  loadWorkspaceMembershipsForMember,
  upsertWorkspaceMembership,
  revokeWorkspaceMembership,
};
