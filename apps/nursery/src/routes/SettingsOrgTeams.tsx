import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useOutletContext, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import type { AppShellContext } from "./AppShell";
import "./SettingsOrgTeams.css";

type OrgRole = "owner" | "admin" | "member";
type TeamRole = "lead" | "member";

type OrgRow = {
  org_id: string;
  org_name: string;
  my_org_role: string;
  created_at: string | null;
};

type TeamRow = {
  team_id: string;
  org_id: string;
  team_name: string;
  member_count: number;
  created_at: string | null;
  updated_at: string | null;
};

type TeamMemberRow = {
  team_id: string;
  user_id: string;
  user_email: string;
  team_role: string;
  created_at: string | null;
  created_by: string | null;
};

function toErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

function isMissingOrgServicesError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const row = error as {
    code?: unknown;
    message?: unknown;
    details?: unknown;
    hint?: unknown;
    status?: unknown;
  };

  const code = typeof row.code === "string" ? row.code.trim().toUpperCase() : "";
  if (code === "PGRST202" || code === "404") return true;
  if (typeof row.status === "number" && row.status === 404) return true;

  const text = [
    typeof row.message === "string" ? row.message : "",
    typeof row.details === "string" ? row.details : "",
    typeof row.hint === "string" ? row.hint : "",
  ].join(" ").toLowerCase();

  return text.includes("list_my_orgs")
    || text.includes("list_org_teams")
    || text.includes("list_team_members")
    || text.includes("resolve_org_user_by_email")
    || text.includes("create_org_team")
    || text.includes("rename_org_team")
    || text.includes("delete_org_team")
    || text.includes("add_team_member")
    || text.includes("add_team_member_by_email")
    || text.includes("remove_team_member")
    || text.includes("could not find the function")
    || (text.includes("function") && text.includes("not found"));
}

function normalizeOrgRole(value: string | null | undefined): OrgRole | null {
  const normalized = (value ?? "").trim().toLowerCase();
  if (normalized === "owner" || normalized === "admin" || normalized === "member") {
    return normalized;
  }
  return null;
}

function orgRoleLabel(role: OrgRole | null): string {
  if (!role) return "Unknown";
  return `${role[0].toUpperCase()}${role.slice(1)}`;
}

function canManageOrgTeams(role: OrgRole | null): boolean {
  return role === "owner" || role === "admin";
}

function normalizeTeamRole(value: string | null | undefined): TeamRole {
  const normalized = (value ?? "").trim().toLowerCase();
  return normalized === "lead" ? "lead" : "member";
}

function teamRoleLabel(role: TeamRole): string {
  return role === "lead" ? "Lead" : "Member";
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "Unknown";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Unknown";
  return parsed.toLocaleString();
}

function shortUserId(value: string): string {
  return value.length <= 12 ? value : `${value.slice(0, 8)}...`;
}

const TEAM_ROLE_OPTIONS: TeamRole[] = ["member", "lead"];

export default function SettingsOrgTeams() {
  const shell = useOutletContext<AppShellContext>();
  const session = shell?.session ?? null;
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams<{ teamId?: string }>();
  const routeTeamId = (params.teamId ?? "").trim();

  const tongsRpcClient = useMemo(
    () => supabase.schema("tongs") as unknown as {
      rpc: (
        fn: string,
        args?: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: unknown }>;
    },
    [],
  );

  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [loadingOrgs, setLoadingOrgs] = useState(false);
  const [orgError, setOrgError] = useState<string | null>(null);
  const [selectedOrgId, setSelectedOrgId] = useState("");

  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [loadingTeams, setLoadingTeams] = useState(false);
  const [teamError, setTeamError] = useState<string | null>(null);

  const [members, setMembers] = useState<TeamMemberRow[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [memberError, setMemberError] = useState<string | null>(null);

  const [newTeamName, setNewTeamName] = useState("");
  const [creatingTeam, setCreatingTeam] = useState(false);
  const [renameTeamName, setRenameTeamName] = useState("");
  const [renamingTeam, setRenamingTeam] = useState(false);
  const [deletingTeam, setDeletingTeam] = useState(false);

  const [newMemberEmail, setNewMemberEmail] = useState("");
  const [newMemberRole, setNewMemberRole] = useState<TeamRole>("member");
  const [addingMember, setAddingMember] = useState(false);
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);

  const [notice, setNotice] = useState<string | null>(null);

  const activeOrg = useMemo(
    () => orgs.find((org) => org.org_id === selectedOrgId) ?? null,
    [orgs, selectedOrgId],
  );
  const orgRole = normalizeOrgRole(activeOrg?.my_org_role);
  const canManage = canManageOrgTeams(orgRole);

  const activeTeam = useMemo(
    () => teams.find((team) => team.team_id === routeTeamId) ?? null,
    [teams, routeTeamId],
  );

  const goToTeamsHome = useCallback(() => {
    navigate({
      pathname: "/app/settings/org/teams",
      search: location.search,
      hash: location.hash,
    });
  }, [location.hash, location.search, navigate]);

  const goToTeam = useCallback((teamId: string) => {
    navigate({
      pathname: `/app/settings/org/teams/${teamId}`,
      search: location.search,
      hash: location.hash,
    });
  }, [location.hash, location.search, navigate]);

  const loadOrgs = useCallback(async () => {
    if (!session) {
      setOrgs([]);
      setSelectedOrgId("");
      setOrgError(null);
      return;
    }

    setLoadingOrgs(true);
    setOrgError(null);

    try {
      const { data, error } = await tongsRpcClient.rpc("list_my_orgs");
      if (error) throw error;
      const rows = Array.isArray(data) ? data as OrgRow[] : [];
      setOrgs(rows);
      setSelectedOrgId((current) => {
        if (current && rows.some((row) => row.org_id === current)) return current;
        return rows[0]?.org_id ?? "";
      });
    } catch (error: unknown) {
      setOrgs([]);
      setSelectedOrgId("");
      setOrgError(
        isMissingOrgServicesError(error)
          ? "Org services are not available yet - deploy the DB migration, then retry."
          : toErrorMessage(error, "Failed loading organizations."),
      );
    } finally {
      setLoadingOrgs(false);
    }
  }, [session, tongsRpcClient]);

  const loadTeams = useCallback(async () => {
    if (!session || !selectedOrgId) {
      setTeams([]);
      setTeamError(null);
      return;
    }

    setLoadingTeams(true);
    setTeamError(null);
    try {
      const { data, error } = await tongsRpcClient.rpc("list_org_teams", {
        p_org_id: selectedOrgId,
      });
      if (error) throw error;
      const rows = Array.isArray(data) ? data as TeamRow[] : [];
      setTeams(rows);
    } catch (error: unknown) {
      setTeams([]);
      setTeamError(
        isMissingOrgServicesError(error)
          ? "Org services are not available yet - deploy the DB migration, then retry."
          : toErrorMessage(error, "Failed loading teams."),
      );
    } finally {
      setLoadingTeams(false);
    }
  }, [selectedOrgId, session, tongsRpcClient]);

  const loadMembers = useCallback(async () => {
    if (!session || !activeTeam) {
      setMembers([]);
      setMemberError(null);
      return;
    }

    setLoadingMembers(true);
    setMemberError(null);
    try {
      const { data, error } = await tongsRpcClient.rpc("list_team_members", {
        p_team_id: activeTeam.team_id,
      });
      if (error) throw error;
      const rows = Array.isArray(data) ? data as TeamMemberRow[] : [];
      setMembers(rows);
    } catch (error: unknown) {
      setMembers([]);
      setMemberError(
        isMissingOrgServicesError(error)
          ? "Org services are not available yet - deploy the DB migration, then retry."
          : toErrorMessage(error, "Failed loading team members."),
      );
    } finally {
      setLoadingMembers(false);
    }
  }, [activeTeam, session, tongsRpcClient]);

  useEffect(() => {
    void loadOrgs();
  }, [loadOrgs]);

  useEffect(() => {
    void loadTeams();
  }, [loadTeams]);

  useEffect(() => {
    if (!routeTeamId) {
      setRenameTeamName("");
      return;
    }
    if (!loadingTeams && teams.length > 0 && !teams.some((team) => team.team_id === routeTeamId)) {
      goToTeamsHome();
      return;
    }
    const selectedTeam = teams.find((team) => team.team_id === routeTeamId) ?? null;
    setRenameTeamName(selectedTeam?.team_name ?? "");
  }, [goToTeamsHome, loadingTeams, routeTeamId, teams]);

  useEffect(() => {
    void loadMembers();
  }, [loadMembers]);

  async function onCreateTeam() {
    if (!session || !selectedOrgId || !canManage || creatingTeam) return;
    const teamName = newTeamName.trim();
    if (!teamName) {
      setTeamError("Team name is required.");
      return;
    }

    setCreatingTeam(true);
    setTeamError(null);
    setNotice(null);
    try {
      const { data, error } = await tongsRpcClient.rpc("create_org_team", {
        p_org_id: selectedOrgId,
        p_name: teamName,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      const teamId = row && typeof row === "object" && "team_id" in row
        ? (row as { team_id?: unknown }).team_id
        : null;
      const createdTeamId = typeof teamId === "string" && teamId.trim() ? teamId : null;
      setNewTeamName("");
      setNotice("Team created.");
      await loadTeams();
      if (createdTeamId) goToTeam(createdTeamId);
    } catch (error: unknown) {
      setTeamError(
        isMissingOrgServicesError(error)
          ? "Org services are not available yet - deploy the DB migration, then retry."
          : toErrorMessage(error, "Failed creating team."),
      );
    } finally {
      setCreatingTeam(false);
    }
  }

  async function onRenameTeam() {
    if (!session || !activeTeam || !canManage || renamingTeam) return;
    const teamName = renameTeamName.trim();
    if (!teamName) {
      setTeamError("Team name is required.");
      return;
    }

    setRenamingTeam(true);
    setTeamError(null);
    setNotice(null);
    try {
      const { error } = await tongsRpcClient.rpc("rename_org_team", {
        p_team_id: activeTeam.team_id,
        p_name: teamName,
      });
      if (error) throw error;
      setNotice("Team renamed.");
      await loadTeams();
    } catch (error: unknown) {
      setTeamError(
        isMissingOrgServicesError(error)
          ? "Org services are not available yet - deploy the DB migration, then retry."
          : toErrorMessage(error, "Failed renaming team."),
      );
    } finally {
      setRenamingTeam(false);
    }
  }

  async function onDeleteTeam() {
    if (!session || !activeTeam || !canManage || deletingTeam) return;
    const confirmed = window.confirm(`Delete team "${activeTeam.team_name}"?`);
    if (!confirmed) return;

    setDeletingTeam(true);
    setTeamError(null);
    setNotice(null);
    try {
      const { error } = await tongsRpcClient.rpc("delete_org_team", {
        p_team_id: activeTeam.team_id,
      });
      if (error) throw error;
      setNotice("Team deleted.");
      await loadTeams();
      goToTeamsHome();
    } catch (error: unknown) {
      setTeamError(
        isMissingOrgServicesError(error)
          ? "Org services are not available yet - deploy the DB migration, then retry."
          : toErrorMessage(error, "Failed deleting team."),
      );
    } finally {
      setDeletingTeam(false);
    }
  }

  async function onAddTeamMember() {
    if (!session || !activeTeam || !canManage || addingMember) return;
    const email = newMemberEmail.trim().toLowerCase();
    if (!email) {
      setMemberError("Email is required.");
      return;
    }

    setAddingMember(true);
    setMemberError(null);
    setNotice(null);
    try {
      const { data, error } = await tongsRpcClient.rpc("add_team_member_by_email", {
        p_team_id: activeTeam.team_id,
        p_email: email,
        p_team_role: newMemberRole,
      });
      if (error) throw error;
      const rows = Array.isArray(data) ? data : [];
      if (rows.length === 0) {
        setMemberError("User not found.");
        return;
      }
      setNewMemberEmail("");
      setNewMemberRole("member");
      setNotice("Added to team. Org access granted as Member.");
      await Promise.all([loadMembers(), loadTeams()]);
    } catch (error: unknown) {
      setMemberError(
        isMissingOrgServicesError(error)
          ? "Org services are not available yet - deploy the DB migration, then retry."
          : toErrorMessage(error, "Failed adding team member."),
      );
    } finally {
      setAddingMember(false);
    }
  }

  async function onRemoveTeamMember(member: TeamMemberRow) {
    if (!session || !activeTeam || !canManage) return;
    const confirmed = window.confirm(
      `Remove ${member.user_email || shortUserId(member.user_id)} from team "${activeTeam.team_name}"?`,
    );
    if (!confirmed) return;

    setRemovingMemberId(member.user_id);
    setMemberError(null);
    setNotice(null);
    try {
      const { error } = await tongsRpcClient.rpc("remove_team_member", {
        p_team_id: activeTeam.team_id,
        p_user_id: member.user_id,
      });
      if (error) throw error;
      setNotice("Team member removed.");
      await Promise.all([loadMembers(), loadTeams()]);
    } catch (error: unknown) {
      setMemberError(
        isMissingOrgServicesError(error)
          ? "Org services are not available yet - deploy the DB migration, then retry."
          : toErrorMessage(error, "Failed removing team member."),
      );
    } finally {
      setRemovingMemberId(null);
    }
  }

  return (
    <section className="settings-org-teams">
      <header className="settings-org-teams__header">
        <h3 className="settings-org-teams__title">Organization Teams</h3>
        <p className="settings-org-teams__copy">
          Manage teams and members at the org level. Workspace permissions are unchanged in this slice.
        </p>
      </header>

      {!session ? (
        <p className="settings-org-teams__copy">Sign in to manage organization teams.</p>
      ) : (
        <>
          <div className="settings-org-teams__picker">
            <label htmlFor="org-team-picker" className="settings-org-teams__label">
              Organization
            </label>
            <select
              id="org-team-picker"
              value={selectedOrgId}
              onChange={(event) => {
                setSelectedOrgId(event.target.value);
                setNotice(null);
              }}
              disabled={loadingOrgs || orgs.length === 0}
              className="settings-org-teams__select"
            >
              {orgs.length === 0 ? (
                <option value="">{loadingOrgs ? "Loading organizations..." : "No organizations"}</option>
              ) : null}
              {orgs.map((org) => (
                <option key={org.org_id} value={org.org_id}>
                  {org.org_name} ({orgRoleLabel(normalizeOrgRole(org.my_org_role))})
                </option>
              ))}
            </select>
            {activeOrg ? (
              <div className="settings-org-teams__meta">
                Your role in {activeOrg.org_name}: <strong>{orgRoleLabel(orgRole)}</strong>
              </div>
            ) : null}
            {orgError ? <div className="settings-org-teams__error">{orgError}</div> : null}
            {notice ? <div className="settings-org-teams__notice">{notice}</div> : null}
          </div>

          <div className="settings-org-teams__grid">
            <article className="settings-org-teams__panel">
              <div className="settings-org-teams__panel-head">
                <h4 className="settings-org-teams__panel-title">Teams</h4>
                <button
                  type="button"
                  onClick={() => void loadTeams()}
                  disabled={loadingTeams}
                >
                  {loadingTeams ? "Refreshing..." : "Refresh"}
                </button>
              </div>

              {canManage ? (
                <div className="settings-org-teams__create-row">
                  <input
                    type="text"
                    aria-label="New team name"
                    placeholder="New team name"
                    value={newTeamName}
                    onChange={(event) => setNewTeamName(event.target.value)}
                  />
                  <button type="button" onClick={() => void onCreateTeam()} disabled={creatingTeam || !selectedOrgId}>
                    {creatingTeam ? "Creating..." : "Create team"}
                  </button>
                </div>
              ) : (
                <p className="settings-org-teams__hint">Owner/Admin role is required for team changes.</p>
              )}

              {teamError ? <div className="settings-org-teams__error">{teamError}</div> : null}

              <div className="settings-org-teams__list">
                {teams.map((team) => {
                  const isActive = team.team_id === routeTeamId;
                  return (
                    <button
                      key={team.team_id}
                      type="button"
                      onClick={() => goToTeam(team.team_id)}
                      className={`settings-org-teams__team-button${isActive ? " is-active" : ""}`}
                    >
                      <span className="settings-org-teams__team-name">{team.team_name}</span>
                      <span className="settings-org-teams__team-meta">{team.member_count} member(s)</span>
                    </button>
                  );
                })}
                {!loadingTeams && teams.length === 0 ? (
                  <div className="settings-org-teams__hint">No teams yet.</div>
                ) : null}
              </div>
            </article>

            <article className="settings-org-teams__panel">
              <div className="settings-org-teams__panel-head">
                <h4 className="settings-org-teams__panel-title">
                  {activeTeam ? activeTeam.team_name : "Team detail"}
                </h4>
                {activeTeam ? (
                  <button type="button" onClick={goToTeamsHome}>
                    Clear
                  </button>
                ) : null}
              </div>

              {!activeTeam ? (
                <p className="settings-org-teams__hint">Select a team to manage members.</p>
              ) : (
                <>
                  <div className="settings-org-teams__hint">
                    Created: {formatDate(activeTeam.created_at)} • Updated: {formatDate(activeTeam.updated_at)}
                  </div>

                  {canManage ? (
                    <div className="settings-org-teams__edit-row">
                      <input
                        type="text"
                        aria-label="Team name"
                        value={renameTeamName}
                        onChange={(event) => setRenameTeamName(event.target.value)}
                        placeholder="Team name"
                      />
                      <button type="button" onClick={() => void onRenameTeam()} disabled={renamingTeam}>
                        {renamingTeam ? "Saving..." : "Rename"}
                      </button>
                      <button
                        type="button"
                        className="settings-org-teams__danger"
                        onClick={() => void onDeleteTeam()}
                        disabled={deletingTeam}
                      >
                        {deletingTeam ? "Deleting..." : "Delete"}
                      </button>
                    </div>
                  ) : null}

                  <div className="settings-org-teams__panel-head">
                    <h5 className="settings-org-teams__subhead">Members</h5>
                    <button type="button" onClick={() => void loadMembers()} disabled={loadingMembers}>
                      {loadingMembers ? "Refreshing..." : "Refresh"}
                    </button>
                  </div>

                  {canManage ? (
                    <div>
                      <div className="settings-org-teams__create-row">
                        <input
                          type="email"
                          aria-label="Member email"
                          value={newMemberEmail}
                          onChange={(event) => setNewMemberEmail(event.target.value)}
                          placeholder="User email"
                        />
                        <select
                          aria-label="Member role"
                          value={newMemberRole}
                          onChange={(event) => setNewMemberRole(normalizeTeamRole(event.target.value))}
                        >
                          {TEAM_ROLE_OPTIONS.map((roleOption) => (
                            <option key={roleOption} value={roleOption}>
                              {teamRoleLabel(roleOption)}
                            </option>
                          ))}
                        </select>
                        <button type="button" onClick={() => void onAddTeamMember()} disabled={addingMember}>
                          {addingMember ? "Adding..." : "Add member"}
                        </button>
                      </div>
                      <p className="settings-org-teams__hint">
                        Team members are automatically added to the organization as Members.
                      </p>
                    </div>
                  ) : null}

                  {memberError ? <div className="settings-org-teams__error">{memberError}</div> : null}

                  <table className="settings-org-teams__table">
                    <thead>
                      <tr>
                        <th className="settings-org-teams__th">User</th>
                        <th className="settings-org-teams__th">Role</th>
                        <th className="settings-org-teams__th">Joined</th>
                        <th className="settings-org-teams__th">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {members.map((member) => {
                        const memberRole = normalizeTeamRole(member.team_role);
                        const removeTitle = canManage ? "Remove member from team" : "Owner/Admin required";
                        return (
                          <tr key={`${member.team_id}:${member.user_id}`}>
                            <td className="settings-org-teams__td">
                              <div>{member.user_email || "Unknown"}</div>
                              <div className="settings-org-teams__hint">ID: {shortUserId(member.user_id)}</div>
                            </td>
                            <td className="settings-org-teams__td">{teamRoleLabel(memberRole)}</td>
                            <td className="settings-org-teams__td">{formatDate(member.created_at)}</td>
                            <td className="settings-org-teams__td">
                              <button
                                type="button"
                                onClick={() => void onRemoveTeamMember(member)}
                                disabled={!canManage || removingMemberId === member.user_id}
                                title={removeTitle}
                                className="settings-org-teams__danger"
                              >
                                {removingMemberId === member.user_id ? "Removing..." : "Remove"}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                      {!loadingMembers && members.length === 0 ? (
                        <tr>
                          <td className="settings-org-teams__td" colSpan={4}>
                            <span className="settings-org-teams__hint">No members in this team.</span>
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </>
              )}
            </article>
          </div>
        </>
      )}
    </section>
  );
}
