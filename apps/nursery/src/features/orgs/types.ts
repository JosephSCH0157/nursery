export type OrgRole = "owner" | "admin" | "member";

export type WorkspaceAccessRole = "owner" | "admin" | "editor" | "viewer";
export type ManageableWorkspaceAccessRole = Exclude<WorkspaceAccessRole, "owner">;

export type OrgMember = {
  userId: string;
  orgRole: OrgRole;
  createdAt: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  email?: string | null;
};

export type OrgWorkspace = {
  id: string;
  name: string;
  createdBy: string | null;
  createdAt?: string | null;
};

export type WorkspaceMembership = {
  workspaceId: string;
  workspaceName: string;
  role: WorkspaceAccessRole;
  createdAt?: string | null;
  createdBy?: string | null;
};

export type UpsertWorkspaceMembershipInput = {
  workspaceId: string;
  userId: string;
  role: ManageableWorkspaceAccessRole;
};

export function normalizeOrgRole(value: string | null | undefined): OrgRole | null {
  const normalized = (value ?? "").trim().toLowerCase();
  if (normalized === "owner" || normalized === "admin" || normalized === "member") {
    return normalized;
  }
  return null;
}

export function normalizeWorkspaceAccessRole(value: string | null | undefined): WorkspaceAccessRole | null {
  const normalized = (value ?? "").trim().toLowerCase();
  if (normalized === "owner" || normalized === "admin" || normalized === "editor" || normalized === "viewer") {
    return normalized;
  }
  return null;
}

export function canManageOrgWorkspaceAccess(role: OrgRole | null): boolean {
  return role === "owner" || role === "admin";
}

export function labelOrgRole(role: OrgRole | null): string {
  if (!role) return "Unknown";
  return `${role[0].toUpperCase()}${role.slice(1)}`;
}

export function labelWorkspaceRole(role: WorkspaceAccessRole | ManageableWorkspaceAccessRole): string {
  return `${role[0].toUpperCase()}${role.slice(1)}`;
}

export const MANAGEABLE_WORKSPACE_ACCESS_ROLES: ManageableWorkspaceAccessRole[] = ["admin", "editor", "viewer"];