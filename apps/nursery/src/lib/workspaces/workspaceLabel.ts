import type { Workspace } from "@barstock/lib/tongs-api";

export type WorkspaceSourceBucket = "personal" | "shared";

export function workspaceSourceLabel(workspace: Workspace): string {
  if (workspace.sourceType === "personal" || workspace.orgId === null) {
    return "Personal";
  }
  if (workspace.sourceType === "shared") {
    const org = typeof workspace.orgName === "string" && workspace.orgName.trim()
      ? workspace.orgName.trim()
      : "Shared";
    return `Shared - ${org}`;
  }
  if (workspace.orgName && workspace.orgName.trim()) {
    return `Shared - ${workspace.orgName.trim()}`;
  }
  return "Shared";
}

export function workspaceSelectOptionLabel(workspace: Workspace): string {
  return `${workspace.name} (${workspaceSourceLabel(workspace)})`;
}

export function workspaceSourceBucket(workspace: Workspace): WorkspaceSourceBucket {
  if (workspace.sourceType === "personal" || workspace.orgId === null) return "personal";
  return "shared";
}

export function groupWorkspacesBySource(workspaces: Workspace[]): {
  personal: Workspace[];
  shared: Workspace[];
} {
  const personal: Workspace[] = [];
  const shared: Workspace[] = [];
  for (const workspace of workspaces) {
    if (workspaceSourceBucket(workspace) === "personal") {
      personal.push(workspace);
    } else {
      shared.push(workspace);
    }
  }
  return { personal, shared };
}
