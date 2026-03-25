import WorkspaceAccessGrantForm from "./WorkspaceAccessGrantForm";
import WorkspaceAccessList from "./WorkspaceAccessList";
import { useOrgWorkspaceAccess } from "../hooks/useOrgWorkspaceAccess";
import type { OrgMember } from "../types";

interface OrgMemberWorkspaceAccessPanelProps {
  orgId: string;
  selectedMember: OrgMember | null;
  actingUserId: string | null;
  canManage: boolean;
}

export default function OrgMemberWorkspaceAccessPanel({
  orgId,
  selectedMember,
  actingUserId,
  canManage,
}: OrgMemberWorkspaceAccessPanelProps) {
  const access = useOrgWorkspaceAccess(orgId, selectedMember?.userId ?? null, actingUserId);

  if (!selectedMember) {
    return (
      <aside className="settings-org__member-panel settings-org__member-panel--empty">
        <h5 className="settings-org__panel-title">Workspace Access</h5>
        <p className="settings-org__copy">Select a member to view workspace access.</p>
      </aside>
    );
  }

  return (
    <aside className="settings-org__member-panel">
      <div className="settings-org__member-panel-header">
        <div>
          <h5 className="settings-org__panel-title">Workspace Access</h5>
          <p className="settings-org__copy settings-org__member-subcopy">
            {selectedMember.displayName ?? selectedMember.email ?? selectedMember.userId}
          </p>
        </div>
      </div>

      {!canManage ? (
        <p className="settings-org__copy">
          You can view assigned workspaces, but only organization owners and admins can change access.
        </p>
      ) : null}

      <WorkspaceAccessGrantForm
        workspaces={access.workspaces}
        memberships={access.memberships}
        disabled={access.isLoading}
        granting={access.granting}
        canManage={canManage}
        ownerContext={selectedMember.orgRole === "owner" || access.memberships.some((membership) => membership.role === "owner")}
        onGrant={async ({ workspaceId, role }) => {
          if (!selectedMember) return;
          await access.grantAccess({
            workspaceId,
            userId: selectedMember.userId,
            role,
          });
        }}
      />

      {access.error ? <div className="settings-org__error">{access.error}</div> : null}
      {access.isLoading ? <p className="settings-org__copy">Loading workspace access...</p> : null}
      {!access.isLoading ? (
        <WorkspaceAccessList
          memberships={access.memberships}
          canManage={canManage}
          disabled={access.isSaving}
          updatingWorkspaceId={access.updatingWorkspaceId}
          removingWorkspaceId={access.removingWorkspaceId}
          onRoleChange={access.updateRole}
          onRevoke={access.revokeAccess}
        />
      ) : null}
    </aside>
  );
}