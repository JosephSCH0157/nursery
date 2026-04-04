export type Workspace = {
  id: string;
  name: string;
  role?: string | null;
  createdAt?: string | null;
  sourceType?: "personal" | "shared" | null;
  orgId?: string | null;
  orgName?: string | null;
};

export type WorkspaceAccessRow = {
  workspace_id?: string | null;
  workspace_name?: string | null;
  role?: string | null;
  created_at?: string | null;
  source_type?: string | null;
  org_id?: string | null;
  org_name?: string | null;
};

function parseTimestampToMs(value: unknown): number {
  if (typeof value !== "string") return Date.now();
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : Date.now();
}

function workspaceRoleRank(value: string | null | undefined): number {
  switch (value) {
    case "owner":
      return 4;
    case "admin":
      return 3;
    case "editor":
      return 2;
    case "viewer":
      return 1;
    default:
      return 0;
  }
}

function workspaceSourceRank(workspace: Workspace): number {
  if (workspace.sourceType === "personal" || workspace.orgId === null) return 2;
  if (workspace.sourceType === "shared") return 1;
  return 0;
}

export function normalizeWorkspaceAccessRows(rows: WorkspaceAccessRow[] | null | undefined): Workspace[] {
  const byId = new Map<string, Workspace>();

  for (const row of rows ?? []) {
    const id = typeof row.workspace_id === "string" ? row.workspace_id : null;
    const name = typeof row.workspace_name === "string" ? row.workspace_name : null;
    const role = typeof row.role === "string" ? row.role : null;
    const createdAt = typeof row.created_at === "string" ? row.created_at : null;
    const sourceType = row.source_type === "personal" || row.source_type === "shared"
      ? row.source_type
      : null;
    const orgId = typeof row.org_id === "string" ? row.org_id : null;
    const orgName = typeof row.org_name === "string" ? row.org_name : null;
    if (!id || !name) continue;

    const next: Workspace = { id, name, role, createdAt, sourceType, orgId, orgName };
    const current = byId.get(id);
    if (!current) {
      byId.set(id, next);
      continue;
    }

    const currentSourceRank = workspaceSourceRank(current);
    const nextSourceRank = workspaceSourceRank(next);
    const currentRoleRank = workspaceRoleRank(current.role);
    const nextRoleRank = workspaceRoleRank(next.role);
    if (nextSourceRank > currentSourceRank || (nextSourceRank === currentSourceRank && nextRoleRank > currentRoleRank)) {
      byId.set(id, next);
    }
  }

  return [...byId.values()].sort((a, b) => {
    const aRole = workspaceRoleRank(a.role);
    const bRole = workspaceRoleRank(b.role);
    if (aRole !== bRole) return bRole - aRole;
    const aCreated = parseTimestampToMs(a.createdAt);
    const bCreated = parseTimestampToMs(b.createdAt);
    if (aCreated !== bCreated) return aCreated - bCreated;
    return a.name.localeCompare(b.name);
  });
}
