import { useMemo, useState } from "react";
import type {
  ManageableWorkspaceAccessRole,
  OrgWorkspace,
  WorkspaceMembership,
} from "../types";
import {
  MANAGEABLE_WORKSPACE_ACCESS_ROLES,
  labelWorkspaceRole,
} from "../types";

interface WorkspaceAccessGrantFormProps {
  workspaces: OrgWorkspace[];
  memberships: WorkspaceMembership[];
  disabled?: boolean;
  granting?: boolean;
  canManage: boolean;
  onGrant: (input: { workspaceId: string; role: ManageableWorkspaceAccessRole }) => Promise<void>;
}

export default function WorkspaceAccessGrantForm({
  workspaces,
  memberships,
  disabled = false,
  granting = false,
  canManage,
  onGrant,
}: WorkspaceAccessGrantFormProps) {
  const [workspaceId, setWorkspaceId] = useState("");
  const [role, setRole] = useState<ManageableWorkspaceAccessRole | "">("");

  const assignedWorkspaceIds = useMemo(
    () => new Set(memberships.map((membership) => membership.workspaceId)),
    [memberships],
  );
  const availableWorkspaces = useMemo(
    () => workspaces.filter((workspace) => !assignedWorkspaceIds.has(workspace.id)),
    [assignedWorkspaceIds, workspaces],
  );

  const canSubmit = canManage && !disabled && !granting && Boolean(workspaceId && role);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit || !role) return;
    await onGrant({ workspaceId, role });
    setWorkspaceId("");
    setRole("");
  }

  if (!canManage) return null;

  return (
    <form className="settings-org__access-grant" onSubmit={(event) => void onSubmit(event)}>
      <div className="settings-org__access-grant-fields">
        <label className="settings-org__label settings-org__access-field">
          <span>Workspace</span>
          <select
            value={workspaceId}
            onChange={(event) => setWorkspaceId(event.target.value)}
            disabled={disabled || granting || availableWorkspaces.length === 0}
            className="settings-org__select"
          >
            <option value="">
              {availableWorkspaces.length > 0 ? "Choose workspace" : "No available workspaces"}
            </option>
            {availableWorkspaces.map((workspace) => (
              <option key={workspace.id} value={workspace.id}>{workspace.name}</option>
            ))}
          </select>
        </label>

        <label className="settings-org__label settings-org__access-field">
          <span>Role</span>
          <select
            value={role}
            onChange={(event) => setRole(event.target.value as ManageableWorkspaceAccessRole | "")}
            disabled={disabled || granting}
            className="settings-org__select"
          >
            <option value="">Choose role</option>
            {MANAGEABLE_WORKSPACE_ACCESS_ROLES.map((option) => (
              <option key={option} value={option}>{labelWorkspaceRole(option)}</option>
            ))}
          </select>
        </label>
      </div>

      <button type="submit" disabled={!canSubmit} className="settings-org__access-button">
        {granting ? "Granting..." : "Grant Access"}
      </button>
    </form>
  );
}