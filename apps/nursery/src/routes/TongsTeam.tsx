import { useCallback, useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { supabase } from "../lib/supabase";
import type { AppShellContext } from "./AppShell";
import WorkspaceRequiredNotice from "./WorkspaceRequiredNotice";
import "./TongsTeam.css";

type WorkspaceRole = "viewer" | "editor" | "admin" | "owner";

type MemberRow = {
  workspace_id: string;
  user_id: string;
  user_email: string;
  role: string;
  created_at: string | null;
  created_by: string | null;
  created_by_email: string;
};

type InviteRow = {
  id: string;
  workspace_id: string;
  email: string;
  role: string;
  created_by: string;
  created_by_email: string;
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
};

type CreateInviteResult = {
  invite_id: string;
  workspace_id: string;
  email: string;
  role: string;
  token: string;
  expires_at: string;
  created_at: string;
};

type UpdateMemberRoleResult = {
  workspace_id: string;
  user_id: string;
  role: string;
};

type RemoveMemberResult = {
  removed: boolean;
  workspace_id: string;
  user_id: string;
};

type LeaveWorkspaceResult = {
  left_workspace: boolean;
  workspace_id: string;
  user_id: string;
};

type RevokeInviteResult = {
  revoked: boolean;
  invite_id: string;
};

type RpcResponse<T> = Promise<{ data: T | null; error: unknown }>;

type TongsClient = {
  rpc: (fn: string, args?: Record<string, unknown>) => {
    single: () => RpcResponse<unknown>;
  };
};

type TongsReadRpcClient = {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
};

const WORKSPACE_ROLE_RANK: Record<WorkspaceRole, number> = {
  viewer: 10,
  editor: 20,
  admin: 30,
  owner: 40,
};

const INVITE_ROLE_OPTIONS: WorkspaceRole[] = ["editor", "viewer", "admin", "owner"];
const MEMBER_ROLE_OPTIONS: WorkspaceRole[] = ["viewer", "editor", "admin", "owner"];

function toErrorMessage(error: unknown, fallback: string): string {
  let message: string | null = null;
  let code: string | null = null;
  let requestId: string | null = null;
  if (error && typeof error === "object" && "message" in error) {
    const err = error as { message?: unknown; code?: unknown; request_id?: unknown };
    if (typeof err.message === "string" && err.message.trim().length > 0) {
      message = err.message;
    }
    if (typeof err.code === "string" && err.code.trim().length > 0) {
      code = err.code;
    }
    if (typeof err.request_id === "string" && err.request_id.trim().length > 0) {
      requestId = err.request_id;
    }
  }
  const base = message ?? fallback;
  const codeSuffix = code ? ` (code: ${code})` : "";
  const requestSuffix = requestId ? ` [request: ${requestId}]` : "";
  return `${base}${codeSuffix}${requestSuffix}`;
}

function normalizeWorkspaceRole(value: unknown): WorkspaceRole | null {
  if (value === "viewer" || value === "editor" || value === "admin" || value === "owner") {
    return value;
  }
  return null;
}

function workspaceRoleAtLeast(role: WorkspaceRole | null, minimum: WorkspaceRole): boolean {
  if (!role) return false;
  return WORKSPACE_ROLE_RANK[role] >= WORKSPACE_ROLE_RANK[minimum];
}

function workspaceRoleLabel(role: WorkspaceRole | null): string {
  if (!role) return "Unknown";
  return `${role[0].toUpperCase()}${role.slice(1)}`;
}

function shortUserId(value: string | null | undefined): string {
  const input = (value ?? "").trim();
  if (!input) return "Unknown";
  if (input.length <= 12) return input;
  return `${input.slice(0, 8)}...`;
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleString();
}

function formatRelativeTime(value: string | null | undefined): string {
  if (!value) return "unknown";
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return "unknown";

  const diffMs = Date.now() - parsed;
  const absMs = Math.abs(diffMs);
  const minuteMs = 60 * 1000;
  const hourMs = 60 * minuteMs;
  const dayMs = 24 * hourMs;
  const weekMs = 7 * dayMs;

  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  if (absMs < hourMs) return formatter.format(-Math.max(1, Math.round(absMs / minuteMs)), "minute");
  if (absMs < dayMs) return formatter.format(-Math.round(absMs / hourMs), "hour");
  if (absMs < weekMs) return formatter.format(-Math.round(absMs / dayMs), "day");
  return formatter.format(-Math.round(absMs / weekMs), "week");
}

function canAssignRole(actorRole: WorkspaceRole | null, targetRole: WorkspaceRole): boolean {
  if (targetRole === "owner") return actorRole === "owner";
  return workspaceRoleAtLeast(actorRole, "admin");
}

function isExpired(iso: string): boolean {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return false;
  return ms <= Date.now();
}

export default function TongsTeam() {
  const shell = useOutletContext<AppShellContext>();
  const workspaceId = shell?.workspaceId ?? null;
  const session = shell?.session ?? null;
  const tongsClient = supabase.schema("tongs") as unknown as TongsClient;
  const tongsReadRpcClient = supabase.schema("tongs") as unknown as TongsReadRpcClient;

  const activeWorkspace = useMemo(
    () => shell?.workspaces?.find((workspace) => workspace.id === workspaceId) ?? null,
    [shell?.workspaces, workspaceId],
  );
  const workspaceRole = useMemo(
    () => normalizeWorkspaceRole(activeWorkspace?.role ?? null),
    [activeWorkspace?.role],
  );

  const canManageMembers = workspaceRoleAtLeast(workspaceRole, "admin");

  const [members, setMembers] = useState<MemberRow[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersError, setMembersError] = useState<string | null>(null);

  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [invitesLoading, setInvitesLoading] = useState(false);
  const [invitesError, setInvitesError] = useState<string | null>(null);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<WorkspaceRole>("editor");
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteNotice, setInviteNotice] = useState<string | null>(null);
  const [latestInviteLink, setLatestInviteLink] = useState<string | null>(null);

  const [roleBusyUserId, setRoleBusyUserId] = useState<string | null>(null);
  const [removeBusyUserId, setRemoveBusyUserId] = useState<string | null>(null);
  const [memberActionError, setMemberActionError] = useState<string | null>(null);
  const [memberNotice, setMemberNotice] = useState<string | null>(null);

  const [revokeBusyInviteId, setRevokeBusyInviteId] = useState<string | null>(null);
  const [revokeError, setRevokeError] = useState<string | null>(null);

  const [leaveBusy, setLeaveBusy] = useState(false);
  const [leaveError, setLeaveError] = useState<string | null>(null);

  const currentUserId = session?.user?.id ?? null;

  const loadMembers = useCallback(async () => {
    if (!workspaceId || !session) {
      setMembers([]);
      return;
    }
    setMembersLoading(true);
    setMembersError(null);
    try {
      const { data, error } = await tongsReadRpcClient.rpc("list_workspace_members", {
        p_workspace_id: workspaceId,
      });

      if (error) throw error;
      const rows = Array.isArray(data) ? (data as MemberRow[]) : [];
      rows.sort((a, b) => {
        const rankDelta = (WORKSPACE_ROLE_RANK[normalizeWorkspaceRole(b.role) ?? "viewer"] ?? 0)
          - (WORKSPACE_ROLE_RANK[normalizeWorkspaceRole(a.role) ?? "viewer"] ?? 0);
        if (rankDelta !== 0) return rankDelta;
        return (a.created_at ?? "").localeCompare(b.created_at ?? "");
      });
      setMembers(rows);
    } catch (error: unknown) {
      setMembersError(toErrorMessage(error, "Failed loading workspace members."));
    } finally {
      setMembersLoading(false);
    }
  }, [session, tongsReadRpcClient, workspaceId]);

  const loadInvites = useCallback(async () => {
    if (!workspaceId || !session) {
      setInvites([]);
      return;
    }
    setInvitesLoading(true);
    setInvitesError(null);
    try {
      const { data, error } = await tongsReadRpcClient.rpc("list_workspace_invites", {
        p_workspace_id: workspaceId,
        p_only_pending: true,
      });

      if (error) throw error;
      setInvites(Array.isArray(data) ? (data as InviteRow[]) : []);
    } catch (error: unknown) {
      setInvitesError(toErrorMessage(error, "Failed loading workspace invites."));
    } finally {
      setInvitesLoading(false);
    }
  }, [session, tongsReadRpcClient, workspaceId]);

  useEffect(() => {
    if (!workspaceId || !session) {
      setMembers([]);
      setInvites([]);
      return;
    }
    void loadMembers();
    void loadInvites();
  }, [workspaceId, session, loadMembers, loadInvites]);

  const onCreateInvite = useCallback(async () => {
    if (!workspaceId || !session || !canManageMembers) return;
    const email = inviteEmail.trim().toLowerCase();
    if (!email) {
      setInviteError("Invite email is required.");
      return;
    }
    setInviteBusy(true);
    setInviteError(null);
    setInviteNotice(null);
    try {
      const { data, error } = await tongsClient
        .rpc("create_workspace_invite", {
          p_workspace_id: workspaceId,
          p_email: email,
          p_role: inviteRole,
          p_expires_hours: 72,
        })
        .single();
      if (error) throw error;

      const row = data as CreateInviteResult | null;
      const token = row?.token?.trim();
      if (!token) throw new Error("Invite token was not returned.");

      const inviteUrl = `${window.location.origin}/app?invite_token=${encodeURIComponent(token)}`;
      setLatestInviteLink(inviteUrl);

      try {
        await navigator.clipboard.writeText(inviteUrl);
        setInviteNotice(`Invite created and copied for ${email}.`);
      } catch {
        setInviteNotice(`Invite created for ${email}. Copy link manually.`);
      }

      setInviteEmail("");
      await loadInvites();
    } catch (error: unknown) {
      setInviteError(toErrorMessage(error, "Failed creating invite."));
    } finally {
      setInviteBusy(false);
    }
  }, [canManageMembers, inviteEmail, inviteRole, loadInvites, session, tongsClient, workspaceId]);

  const onRevokeInvite = useCallback(async (inviteId: string) => {
    if (!canManageMembers) return;
    setRevokeBusyInviteId(inviteId);
    setRevokeError(null);
    setInviteNotice(null);
    try {
      const { data, error } = await tongsClient
        .rpc("revoke_workspace_invite", { p_invite_id: inviteId })
        .single();
      if (error) throw error;
      const result = data as RevokeInviteResult | null;
      if (!result?.revoked) {
        setInviteNotice("Invite was already revoked.");
      }
      await loadInvites();
    } catch (error: unknown) {
      setRevokeError(toErrorMessage(error, "Failed revoking invite."));
    } finally {
      setRevokeBusyInviteId(null);
    }
  }, [canManageMembers, loadInvites, tongsClient]);

  const onChangeMemberRole = useCallback(async (member: MemberRow, nextRole: WorkspaceRole) => {
    if (!workspaceId || !canManageMembers) return;
    if (!canAssignRole(workspaceRole, nextRole)) {
      setMemberActionError("You do not have permission to assign that role.");
      return;
    }

    setRoleBusyUserId(member.user_id);
    setMemberActionError(null);
    setMemberNotice(null);
    try {
      const { data, error } = await tongsClient
        .rpc("update_workspace_member_role", {
          p_workspace_id: workspaceId,
          p_user_id: member.user_id,
          p_role: nextRole,
        })
        .single();
      if (error) throw error;

      const result = data as UpdateMemberRoleResult | null;
      setMemberNotice(
        `Updated ${shortUserId(result?.user_id ?? member.user_id)} to ${result?.role ?? nextRole}.`,
      );
      await loadMembers();
      await shell.refreshWorkspaces({ force: true, preferId: workspaceId });
    } catch (error: unknown) {
      setMemberActionError(toErrorMessage(error, "Failed updating member role."));
    } finally {
      setRoleBusyUserId(null);
    }
  }, [canManageMembers, loadMembers, shell, tongsClient, workspaceId, workspaceRole]);

  const onRemoveMember = useCallback(async (member: MemberRow) => {
    if (!workspaceId || !canManageMembers) return;
    const confirmed = window.confirm(`Remove ${shortUserId(member.user_id)} from this workspace?`);
    if (!confirmed) return;

    setRemoveBusyUserId(member.user_id);
    setMemberActionError(null);
    setMemberNotice(null);
    try {
      const { data, error } = await tongsClient
        .rpc("remove_workspace_member", {
          p_workspace_id: workspaceId,
          p_user_id: member.user_id,
        })
        .single();
      if (error) throw error;

      const result = data as RemoveMemberResult | null;
      if (result?.removed) {
        setMemberNotice(`Removed ${shortUserId(member.user_id)} from this workspace.`);
      } else {
        setMemberNotice(`${shortUserId(member.user_id)} was already removed.`);
      }

      await loadMembers();
      await shell.refreshWorkspaces({ force: true, preferId: workspaceId });
    } catch (error: unknown) {
      setMemberActionError(toErrorMessage(error, "Failed removing workspace member."));
    } finally {
      setRemoveBusyUserId(null);
    }
  }, [canManageMembers, loadMembers, shell, tongsClient, workspaceId]);

  const onLeaveWorkspace = useCallback(async () => {
    if (!workspaceId || !session) return;
    const confirmed = window.confirm("Leave this workspace? You will lose access until invited again.");
    if (!confirmed) return;

    setLeaveBusy(true);
    setLeaveError(null);
    setMemberNotice(null);
    try {
      const { data, error } = await tongsClient
        .rpc("leave_workspace", {
          p_workspace_id: workspaceId,
        })
        .single();
      if (error) throw error;

      const result = data as LeaveWorkspaceResult | null;
      if (result?.left_workspace !== true) {
        throw new Error("Workspace leave was not confirmed.");
      }

      await shell.refreshWorkspaces({ force: true, preferId: null });
    } catch (error: unknown) {
      setLeaveError(toErrorMessage(error, "Failed leaving workspace."));
    } finally {
      setLeaveBusy(false);
    }
  }, [session, shell, tongsClient, workspaceId]);

  if (!workspaceId) {
    return <WorkspaceRequiredNotice toolName="Team" />;
  }

  return (
    <section className="tt-page">
      <header className="tt-header">
        <div>
          <h2 className="tt-title">Team</h2>
          <p className="tt-subtitle">Manage members and invites for this workspace.</p>
        </div>
        <div className="tt-workspace-meta">
          <span className="tt-workspace-name">{activeWorkspace?.name ?? "Workspace"}</span>
          <span className="tt-role-badge">{workspaceRoleLabel(workspaceRole)}</span>
        </div>
      </header>

      <div className="tt-grid">
        <article className="tt-panel">
          <div className="tt-panel-header">
            <h3 className="tt-panel-title">Members</h3>
            <button
              type="button"
              onClick={() => void loadMembers()}
              disabled={membersLoading}
            >
              {membersLoading ? "Refreshing..." : "Refresh"}
            </button>
          </div>
          {membersError ? <div className="tt-error">{membersError}</div> : null}
          {memberActionError ? <div className="tt-error">{memberActionError}</div> : null}
          {memberNotice ? <div className="tt-notice">{memberNotice}</div> : null}

          <div className="tt-table-wrap">
            <table className="tt-table">
              <thead>
                <tr>
                  <th>Member</th>
                  <th>Role</th>
                  <th>Added</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {members.map((member) => {
                  const memberRole = normalizeWorkspaceRole(member.role);
                  const isSelf = currentUserId != null && member.user_id === currentUserId;
                  const canChangeRole = canManageMembers && !isSelf;
                  const canRemove = canManageMembers && !isSelf;
                  const roleOptions = MEMBER_ROLE_OPTIONS.filter((roleOption) => canAssignRole(workspaceRole, roleOption));
                  return (
                    <tr key={`${member.workspace_id}:${member.user_id}`}>
                      <td>
                        <div className="tt-cell-primary">{member.user_email || shortUserId(member.user_id)}</div>
                        <div className="tt-cell-secondary">
                          User ID: {shortUserId(member.user_id)}
                        </div>
                        <div className="tt-cell-secondary">
                          Added by {member.created_by_email || shortUserId(member.created_by)}
                        </div>
                      </td>
                      <td>
                        {canChangeRole ? (
                          <select
                            className="tt-role-select"
                            value={memberRole ?? "viewer"}
                            onChange={(event) => {
                              const nextRole = normalizeWorkspaceRole(event.target.value);
                              if (!nextRole) return;
                              void onChangeMemberRole(member, nextRole);
                            }}
                            disabled={roleBusyUserId === member.user_id}
                          >
                            {roleOptions.map((roleOption) => (
                              <option key={roleOption} value={roleOption}>
                                {workspaceRoleLabel(roleOption)}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="tt-role-pill">{workspaceRoleLabel(memberRole)}</span>
                        )}
                      </td>
                      <td>
                        <div className="tt-cell-primary">{formatRelativeTime(member.created_at)}</div>
                        <div className="tt-cell-secondary">{formatDateTime(member.created_at)}</div>
                      </td>
                      <td>
                        {canRemove ? (
                          <button
                            type="button"
                            className="tt-danger-button"
                            onClick={() => void onRemoveMember(member)}
                            disabled={removeBusyUserId === member.user_id}
                          >
                            {removeBusyUserId === member.user_id ? "Removing..." : "Remove"}
                          </button>
                        ) : (
                          <span className="tt-cell-secondary">{isSelf ? "You" : "-"}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {members.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="tt-empty-cell">
                      {membersLoading ? "Loading members..." : "No members found."}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <div className="tt-leave-row">
            <button
              type="button"
              className="tt-danger-button"
              onClick={() => void onLeaveWorkspace()}
              disabled={leaveBusy}
            >
              {leaveBusy ? "Leaving..." : "Leave workspace"}
            </button>
            {leaveError ? <span className="tt-error">{leaveError}</span> : null}
          </div>
        </article>

        <article className="tt-panel">
          <div className="tt-panel-header">
            <h3 className="tt-panel-title">Invites</h3>
            <button
              type="button"
              onClick={() => void loadInvites()}
              disabled={invitesLoading}
            >
              {invitesLoading ? "Refreshing..." : "Refresh"}
            </button>
          </div>

          {canManageMembers ? (
            <div className="tt-invite-form">
              <label className="tt-field">
                <span>Email</span>
                <input
                  type="email"
                  placeholder="teammate@example.com"
                  value={inviteEmail}
                  onChange={(event) => setInviteEmail(event.target.value)}
                />
              </label>
              <label className="tt-field">
                <span>Role</span>
                <select
                  value={inviteRole}
                  onChange={(event) => {
                    const next = normalizeWorkspaceRole(event.target.value);
                    if (next) setInviteRole(next);
                  }}
                >
                  {INVITE_ROLE_OPTIONS.filter((roleOption) => canAssignRole(workspaceRole, roleOption)).map((roleOption) => (
                    <option key={roleOption} value={roleOption}>
                      {workspaceRoleLabel(roleOption)}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={() => void onCreateInvite()}
                disabled={inviteBusy}
              >
                {inviteBusy ? "Creating..." : "Create invite"}
              </button>
              {inviteError ? <div className="tt-error">{inviteError}</div> : null}
              {inviteNotice ? <div className="tt-notice">{inviteNotice}</div> : null}
              {latestInviteLink ? (
                <label className="tt-field">
                  <span>Latest invite link</span>
                  <input
                    type="text"
                    value={latestInviteLink}
                    readOnly
                    onFocus={(event) => event.currentTarget.select()}
                  />
                </label>
              ) : null}
            </div>
          ) : (
            <div className="tt-cell-secondary">
              Invite creation requires Admin or Owner role.
            </div>
          )}

          {invitesError ? <div className="tt-error">{invitesError}</div> : null}
          {revokeError ? <div className="tt-error">{revokeError}</div> : null}

          <div className="tt-invites-list">
            {invites.map((invite) => {
              const expired = isExpired(invite.expires_at);
              return (
                <div key={invite.id} className="tt-invite-row">
                  <div>
                    <div className="tt-cell-primary">{invite.email}</div>
                    <div className="tt-cell-secondary">
                      {workspaceRoleLabel(normalizeWorkspaceRole(invite.role))}
                      {" • "}
                      Created {formatRelativeTime(invite.created_at)}
                    </div>
                    <div className="tt-cell-secondary">
                      Created by {invite.created_by_email || shortUserId(invite.created_by)}
                    </div>
                    <div className="tt-cell-secondary">
                      Expires {formatDateTime(invite.expires_at)}
                      {expired ? " (expired)" : ""}
                    </div>
                  </div>
                  {canManageMembers ? (
                    <button
                      type="button"
                      onClick={() => void onRevokeInvite(invite.id)}
                      disabled={revokeBusyInviteId === invite.id}
                    >
                      {revokeBusyInviteId === invite.id ? "Revoking..." : "Revoke"}
                    </button>
                  ) : null}
                </div>
              );
            })}
            {invites.length === 0 ? (
              <div className="tt-empty-cell">
                {invitesLoading ? "Loading invites..." : "No pending invites."}
              </div>
            ) : null}
          </div>
        </article>
      </div>
    </section>
  );
}
