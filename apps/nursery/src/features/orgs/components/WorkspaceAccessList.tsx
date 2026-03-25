import type {
  ManageableWorkspaceAccessRole,
  WorkspaceMembership,
} from "../types";
import {
  MANAGEABLE_WORKSPACE_ACCESS_ROLES,
  labelWorkspaceRole,
} from "../types";

interface WorkspaceAccessListProps {
  memberships: WorkspaceMembership[];
  canManage: boolean;
  disabled?: boolean;
  updatingWorkspaceId?: string | null;
  removingWorkspaceId?: string | null;
  onRoleChange: (workspaceId: string, role: ManageableWorkspaceAccessRole) => Promise<void>;
  onRevoke: (workspaceId: string) => Promise<void>;
}

export default function WorkspaceAccessList({
  memberships,
  canManage,
  disabled = false,
  updatingWorkspaceId = null,
  removingWorkspaceId = null,
  onRoleChange,
  onRevoke,
}: WorkspaceAccessListProps) {
  if (memberships.length === 0) {
    return <p className="settings-org__copy">No workspace access assigned.</p>;
  }

  return (
    <div className="settings-org__access-list">
      {memberships.map((membership) => {
        const isUpdating = updatingWorkspaceId === membership.workspaceId;
        const isRemoving = removingWorkspaceId === membership.workspaceId;
        const isOwner = membership.role === "owner";
        const roleValue = isOwner ? "owner" : membership.role;

        return (
          <div key={membership.workspaceId} className="settings-org__access-row">
            <div className="settings-org__access-summary">
              <div className="settings-org__access-name">{membership.workspaceName}</div>
              <div className="settings-org__access-meta">
                Added {membership.createdAt ? new Date(membership.createdAt).toLocaleDateString() : "previously"}
              </div>
            </div>

            <div className="settings-org__access-controls">
              {canManage && !isOwner ? (
                <label className="settings-org__access-role">
                  <span className="settings-org__sr-only">Workspace role</span>
                  <select
                    value={roleValue}
                    disabled={disabled || isUpdating || isRemoving || isOwner}
                    className="settings-org__select"
                    onChange={(event) => void onRoleChange(
                      membership.workspaceId,
                      event.target.value as ManageableWorkspaceAccessRole,
                    )}
                  >
                    {isOwner ? <option value="owner">Owner</option> : null}
                    {MANAGEABLE_WORKSPACE_ACCESS_ROLES.map((option) => (
                      <option key={option} value={option}>{labelWorkspaceRole(option)}</option>
                    ))}
                  </select>
                </label>
              ) : canManage && isOwner ? (
                <span className="settings-org__access-badge settings-org__access-badge--owner">Owner</span>
              ) : (
                <span className="settings-org__access-badge">{labelWorkspaceRole(membership.role)}</span>
              )}

              {canManage && !isOwner ? (
                <button
                  type="button"
                  disabled={disabled || isRemoving}
                  className="settings-org__access-remove"
                  onClick={() => void onRevoke(membership.workspaceId)}
                >
                  {isRemoving ? "Removing..." : "Remove"}
                </button>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}