import type { Workspace } from "@barstock/lib/tongs-api";

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
