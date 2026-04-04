import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useOutletContext } from "react-router-dom";
import { supabase } from "../lib/supabase";
import OrgMemberWorkspaceAccessPanel from "../features/orgs/components/OrgMemberWorkspaceAccessPanel";
import { loadOrgMembers } from "../features/orgs/data/workspaceAccessRepo";
import {
  canManageOrgWorkspaceAccess,
  labelOrgRole,
  normalizeOrgRole,
  type OrgMember,
} from "../features/orgs/types";
import type { AppShellContext } from "./AppShell";
import "./SettingsOrg.css";

type OrgRow = {
  org_id: string;
  org_name: string;
  my_org_role: string;
  created_at: string | null;
};

type AiMode = "AI_DISABLED" | "ORG_ONLY" | "PERSONAL_ONLY" | "ORG_FIRST_PERSONAL_FALLBACK";
type OverrideMode = AiMode | "INHERIT";

type OrgPolicyRow = {
  org_id: string;
  default_mode: string;
  shared_org_ai_enabled: boolean;
  member_byo_allowed: boolean;
};

type MemberPolicyRow = {
  org_id: string;
  user_id: string;
  mode_override: string | null;
  allow_heavy_tasks: boolean;
};

type TongsSelectQuery = {
  eq: (column: string, value: string) => TongsSelectQuery;
  maybeSingle: () => Promise<{ data: unknown; error: unknown }>;
};

type TongsTableClient = {
  from: (table: string) => {
    select: (columns: string) => TongsSelectQuery;
    upsert: (
      values: Record<string, unknown>,
      options: { onConflict: string },
    ) => Promise<{ error: unknown }>;
  };
};

const AI_MODE_OPTIONS: Array<{ value: AiMode; label: string }> = [
  { value: "AI_DISABLED", label: "AI Disabled" },
  { value: "ORG_ONLY", label: "Org Only" },
  { value: "PERSONAL_ONLY", label: "Personal Only" },
  { value: "ORG_FIRST_PERSONAL_FALLBACK", label: "Org First + Personal Fallback" },
];

function normalizeAiMode(value: unknown): AiMode | null {
  if (value === "AI_DISABLED" || value === "ORG_ONLY" || value === "PERSONAL_ONLY" || value === "ORG_FIRST_PERSONAL_FALLBACK") {
    return value;
  }
  return null;
}

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
    || text.includes("list_org_members")
    || text.includes("count_missing_org_members_for_org")
    || text.includes("repair_org_members_from_teams")
    || text.includes("could not find the function")
    || (text.includes("function") && text.includes("not found"));
}

function readCountField(data: unknown, key: string): number {
  const rows = Array.isArray(data) ? data : [];
  const first = rows[0];
  if (!first || typeof first !== "object") return 0;
  const value = (first as Record<string, unknown>)[key];
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return Math.trunc(value);
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number.parseInt(value.trim(), 10);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  return 0;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "Unknown";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Unknown";
  return parsed.toLocaleString();
}

function shortId(value: string): string {
  return value.length <= 12 ? value : `${value.slice(0, 8)}...`;
}

export default function SettingsOrg() {
  const shell = useOutletContext<AppShellContext>();
  const session = shell?.session ?? null;
  const location = useLocation();
  const tongsRpcClient = useMemo(
    () => supabase.schema("tongs") as unknown as {
      rpc: (
        fn: string,
        args?: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: unknown }>;
    },
    [],
  );
  const tongsTableClient = useMemo(
    () => supabase.schema("tongs") as unknown as TongsTableClient,
    [],
  );

  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [loadingOrgs, setLoadingOrgs] = useState(false);
  const [orgsError, setOrgsError] = useState<string | null>(null);
  const [selectedOrgId, setSelectedOrgId] = useState<string>("");

  const [members, setMembers] = useState<OrgMember[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [membersError, setMembersError] = useState<string | null>(null);
  const [selectedMemberId, setSelectedMemberId] = useState<string>("");
  const [missingMemberCount, setMissingMemberCount] = useState<number>(0);
  const [loadingMismatch, setLoadingMismatch] = useState(false);
  const [mismatchError, setMismatchError] = useState<string | null>(null);
  const [repairingMismatch, setRepairingMismatch] = useState(false);
  const [repairNotice, setRepairNotice] = useState<string | null>(null);
  const [orgPolicyLoading, setOrgPolicyLoading] = useState(false);
  const [orgPolicySaving, setOrgPolicySaving] = useState(false);
  const [orgPolicyError, setOrgPolicyError] = useState<string | null>(null);
  const [orgPolicyNotice, setOrgPolicyNotice] = useState<string | null>(null);
  const [orgPolicyDraft, setOrgPolicyDraft] = useState<{
    defaultMode: AiMode;
    sharedOrgAiEnabled: boolean;
    memberByoAllowed: boolean;
  }>({
    defaultMode: "ORG_FIRST_PERSONAL_FALLBACK",
    sharedOrgAiEnabled: true,
    memberByoAllowed: true,
  });
  const [memberPolicyLoading, setMemberPolicyLoading] = useState(false);
  const [memberPolicySaving, setMemberPolicySaving] = useState(false);
  const [memberPolicyError, setMemberPolicyError] = useState<string | null>(null);
  const [memberPolicyNotice, setMemberPolicyNotice] = useState<string | null>(null);
  const [memberPolicyDraft, setMemberPolicyDraft] = useState<{
    modeOverride: OverrideMode;
    allowHeavyTasks: boolean;
  }>({
    modeOverride: "INHERIT",
    allowHeavyTasks: true,
  });

  const activeOrg = useMemo(
    () => orgs.find((org) => org.org_id === selectedOrgId) ?? null,
    [orgs, selectedOrgId],
  );
  const actingOrgRole = normalizeOrgRole(activeOrg?.my_org_role);
  const actingOrgRoleLabel = labelOrgRole(actingOrgRole);
  const canManageWorkspaceAccess = canManageOrgWorkspaceAccess(actingOrgRole);
  const selectedMember = useMemo(
    () => members.find((member) => member.userId === selectedMemberId) ?? members[0] ?? null,
    [members, selectedMemberId],
  );
  const isLikelyPersonalOrg = useMemo(() => {
    if (!activeOrg || !session?.user.id) return false;
    if (actingOrgRole !== "owner") return false;
    if (!members.length) return false;
    return members.length === 1 && members[0]?.userId === session.user.id;
  }, [activeOrg, actingOrgRole, members, session?.user.id]);
  const orgContextLabel = isLikelyPersonalOrg ? "Personal Organization" : "Collaborative Organization";

  useEffect(() => {
    if (!session || !selectedOrgId) {
      setOrgPolicyDraft({
        defaultMode: "ORG_FIRST_PERSONAL_FALLBACK",
        sharedOrgAiEnabled: true,
        memberByoAllowed: true,
      });
      setOrgPolicyError(null);
      setOrgPolicyNotice(null);
      setOrgPolicyLoading(false);
      return;
    }

    let cancelled = false;
    setOrgPolicyLoading(true);
    setOrgPolicyError(null);
    setOrgPolicyNotice(null);

    void (async () => {
      try {
        const { data, error } = await tongsTableClient
          .from("organization_ai_policy")
          .select("org_id,default_mode,shared_org_ai_enabled,member_byo_allowed")
          .eq("org_id", selectedOrgId)
          .maybeSingle();
        if (cancelled) return;
        if (error) throw error;
        const row = (data ?? null) as OrgPolicyRow | null;

        setOrgPolicyDraft({
          defaultMode: normalizeAiMode(row?.default_mode) ?? "ORG_FIRST_PERSONAL_FALLBACK",
          sharedOrgAiEnabled: row?.shared_org_ai_enabled ?? true,
          memberByoAllowed: row?.member_byo_allowed ?? true,
        });
      } catch (error: unknown) {
        if (cancelled) return;
        setOrgPolicyError(toErrorMessage(error, "Failed loading organization AI policy."));
      } finally {
        if (!cancelled) setOrgPolicyLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedOrgId, session, tongsTableClient]);

  useEffect(() => {
    if (!session || !selectedOrgId || !selectedMember) {
      setMemberPolicyDraft({
        modeOverride: "INHERIT",
        allowHeavyTasks: true,
      });
      setMemberPolicyError(null);
      setMemberPolicyNotice(null);
      setMemberPolicyLoading(false);
      return;
    }

    let cancelled = false;
    setMemberPolicyLoading(true);
    setMemberPolicyError(null);
    setMemberPolicyNotice(null);

    void (async () => {
      try {
        const { data, error } = await tongsTableClient
          .from("member_ai_policy")
          .select("org_id,user_id,mode_override,allow_heavy_tasks")
          .eq("org_id", selectedOrgId)
          .eq("user_id", selectedMember.userId)
          .maybeSingle();
        if (cancelled) return;
        if (error) throw error;
        const row = (data ?? null) as MemberPolicyRow | null;

        setMemberPolicyDraft({
          modeOverride: normalizeAiMode(row?.mode_override) ?? "INHERIT",
          allowHeavyTasks: row?.allow_heavy_tasks ?? true,
        });
      } catch (error: unknown) {
        if (cancelled) return;
        setMemberPolicyError(toErrorMessage(error, "Failed loading member AI override."));
      } finally {
        if (!cancelled) setMemberPolicyLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedMember, selectedOrgId, session, tongsTableClient]);

  async function onSaveOrgPolicy() {
    if (!session || !selectedOrgId || !canManageWorkspaceAccess || orgPolicySaving) return;
    setOrgPolicySaving(true);
    setOrgPolicyError(null);
    setOrgPolicyNotice(null);
    try {
      const { error } = await tongsTableClient
        .from("organization_ai_policy")
        .upsert(
          {
            org_id: selectedOrgId,
            default_mode: orgPolicyDraft.defaultMode,
            shared_org_ai_enabled: orgPolicyDraft.sharedOrgAiEnabled,
            member_byo_allowed: orgPolicyDraft.memberByoAllowed,
          },
          { onConflict: "org_id" },
        );
      if (error) throw error;
      setOrgPolicyNotice("Organization AI policy saved.");
    } catch (error: unknown) {
      setOrgPolicyError(toErrorMessage(error, "Failed saving organization AI policy."));
    } finally {
      setOrgPolicySaving(false);
    }
  }

  async function onSaveMemberPolicy() {
    if (!session || !selectedOrgId || !selectedMember || !canManageWorkspaceAccess || memberPolicySaving) return;
    setMemberPolicySaving(true);
    setMemberPolicyError(null);
    setMemberPolicyNotice(null);
    try {
      const { error } = await tongsTableClient
        .from("member_ai_policy")
        .upsert(
          {
            org_id: selectedOrgId,
            user_id: selectedMember.userId,
            mode_override: memberPolicyDraft.modeOverride === "INHERIT" ? null : memberPolicyDraft.modeOverride,
            allow_heavy_tasks: memberPolicyDraft.allowHeavyTasks,
          },
          { onConflict: "org_id,user_id" },
        );
      if (error) throw error;
      setMemberPolicyNotice("Member AI override saved.");
    } catch (error: unknown) {
      setMemberPolicyError(toErrorMessage(error, "Failed saving member AI override."));
    } finally {
      setMemberPolicySaving(false);
    }
  }

  useEffect(() => {
    if (!session) {
      setOrgs([]);
      setSelectedOrgId("");
      setOrgsError(null);
      setLoadingOrgs(false);
      return;
    }

    let cancelled = false;
    setLoadingOrgs(true);
    setOrgsError(null);

    void (async () => {
      try {
        const { data, error } = await tongsRpcClient.rpc("list_my_orgs");
        if (cancelled) return;
        if (error) throw error;
        const rows = Array.isArray(data) ? data as OrgRow[] : [];
        setOrgs(rows);
        setSelectedOrgId((current) => {
          if (current && rows.some((row) => row.org_id === current)) return current;
          return rows[0]?.org_id ?? "";
        });
      } catch (error: unknown) {
        if (cancelled) return;
        setOrgs([]);
        setSelectedOrgId("");
        setOrgsError(
          isMissingOrgServicesError(error)
            ? "Org services are not available yet - deploy the DB migration, then retry."
            : toErrorMessage(error, "Failed loading organizations."),
        );
      } finally {
        if (!cancelled) {
          setLoadingOrgs(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [session, tongsRpcClient]);

  useEffect(() => {
    if (!session || !selectedOrgId) {
      setMembers([]);
      setMembersError(null);
      setLoadingMembers(false);
      setMissingMemberCount(0);
      setMismatchError(null);
      setLoadingMismatch(false);
      setRepairNotice(null);
      return;
    }

    let cancelled = false;
    setLoadingMembers(true);
    setMembersError(null);

    void (async () => {
      try {
        const rows = await loadOrgMembers(selectedOrgId);
        if (cancelled) return;
        setMembers(rows);
        setSelectedMemberId((current) => {
          if (current && rows.some((row) => row.userId === current)) return current;
          return rows[0]?.userId ?? "";
        });
      } catch (error: unknown) {
        if (cancelled) return;
        setMembers([]);
        setSelectedMemberId("");
        setMembersError(
          isMissingOrgServicesError(error)
            ? "Org services are not available yet - deploy the DB migration, then retry."
            : toErrorMessage(error, "Failed loading organization members."),
        );
      } finally {
        if (!cancelled) {
          setLoadingMembers(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [session, selectedOrgId, tongsRpcClient]);

  useEffect(() => {
    if (!session || !selectedOrgId) {
      setMissingMemberCount(0);
      setMismatchError(null);
      setLoadingMismatch(false);
      return;
    }

    let cancelled = false;
    setLoadingMismatch(true);
    setMismatchError(null);

    void (async () => {
      try {
        const { data, error } = await tongsRpcClient.rpc("count_missing_org_members_for_org", {
          p_org_id: selectedOrgId,
        });
        if (cancelled) return;
        if (error) throw error;
        setMissingMemberCount(readCountField(data, "missing_members_count"));
      } catch (error: unknown) {
        if (cancelled) return;
        setMissingMemberCount(0);
        setMismatchError(
          isMissingOrgServicesError(error)
            ? "Org services are not available yet - deploy the DB migration, then retry."
            : toErrorMessage(error, "Failed loading org/team membership diagnostics."),
        );
      } finally {
        if (!cancelled) {
          setLoadingMismatch(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedOrgId, session, tongsRpcClient]);

  async function onRepairMembershipMismatch() {
    if (!session || !selectedOrgId || repairingMismatch) return;
    setRepairingMismatch(true);
    setMismatchError(null);
    setRepairNotice(null);
    try {
      const { data, error } = await tongsRpcClient.rpc("repair_org_members_from_teams", {
        p_org_id: selectedOrgId,
      });
      if (error) throw error;
      const repaired = readCountField(data, "repaired_members_count");
      setRepairNotice(
        repaired > 0
          ? `Repaired ${repaired} org member record(s).`
          : "No org/team membership mismatches found.",
      );

      const [membersResponse, countResponse] = await Promise.all([
        loadOrgMembers(selectedOrgId),
        tongsRpcClient.rpc("count_missing_org_members_for_org", { p_org_id: selectedOrgId }),
      ]);
      if (countResponse.error) throw countResponse.error;
      setMembers(membersResponse);
      setSelectedMemberId((current) => {
        if (current && membersResponse.some((row) => row.userId === current)) return current;
        return membersResponse[0]?.userId ?? "";
      });
      setMissingMemberCount(readCountField(countResponse.data, "missing_members_count"));
    } catch (error: unknown) {
      setMismatchError(
        isMissingOrgServicesError(error)
          ? "Org services are not available yet - deploy the DB migration, then retry."
          : toErrorMessage(error, "Failed repairing membership mismatch."),
      );
    } finally {
      setRepairingMismatch(false);
    }
  }

  return (
    <section className="settings-org">
      <header className="settings-org__header">
        <div className="settings-org__header-row">
          <h3 className="settings-org__title">Organization</h3>
          <Link
            to={{
              pathname: "/app/settings/org/teams",
              search: location.search,
              hash: location.hash,
            }}
          >
            Manage Teams
          </Link>
        </div>
        <p className="settings-org__copy">
          Organization details and member visibility. Team management lives under Manage Teams.
        </p>
      </header>

      {!session ? (
        <p className="settings-org__copy">
          Sign in to view organizations.
        </p>
      ) : null}

      {session ? (
        <>
          <div className="settings-org__picker">
            <label htmlFor="org-picker" className="settings-org__label">
              Organization
            </label>
            <select
              id="org-picker"
              value={selectedOrgId}
              onChange={(event) => setSelectedOrgId(event.target.value)}
              disabled={loadingOrgs || orgs.length === 0}
              className="settings-org__select"
            >
              {orgs.length === 0 ? (
                <option value="">
                  {loadingOrgs ? "Loading organizations..." : "No organizations"}
                </option>
              ) : null}
              {orgs.map((org) => (
                <option key={org.org_id} value={org.org_id}>
                  {org.org_name} ({labelOrgRole(normalizeOrgRole(org.my_org_role))})
                </option>
              ))}
            </select>
            {orgsError ? <div className="settings-org__error">{orgsError}</div> : null}
            {repairNotice ? <div className="settings-org__notice">{repairNotice}</div> : null}
          </div>

          {activeOrg ? (
            <section className="settings-org__context" aria-label="Organization context">
              <div className="settings-org__context-grid">
                <div>
                  <div className="settings-org__label">Current org</div>
                  <div className="settings-org__context-value">{activeOrg.org_name}</div>
                </div>
                <div>
                  <div className="settings-org__label">Your role</div>
                  <div className="settings-org__context-value">{actingOrgRoleLabel}</div>
                </div>
              </div>
              <div className="settings-org__context-chip">{orgContextLabel}</div>
            </section>
          ) : null}

          {activeOrg ? (
            <div className="settings-org__meta">
              <div><strong>Name:</strong> {activeOrg.org_name}</div>
              <div><strong>Your role:</strong> {actingOrgRoleLabel}</div>
              <div><strong>Created:</strong> {formatDate(activeOrg.created_at)}</div>
              <div><strong>Org ID:</strong> {activeOrg.org_id}</div>
            </div>
          ) : null}

          <section className="settings-org__policy">
            <h4 className="settings-org__members-title">AI Policy</h4>
            {!canManageWorkspaceAccess ? (
              <p className="settings-org__copy">Owner/Admin role is required to manage organization AI policy.</p>
            ) : null}

            <div className="settings-org__policy-grid">
              <article className="settings-org__member-panel">
                <h5 className="settings-org__panel-title">Org Defaults</h5>
                {orgPolicyLoading ? <p className="settings-org__copy">Loading policy...</p> : null}
                <label className="settings-org__access-field">
                  <span className="settings-org__label">Default AI Mode</span>
                  <select
                    className="settings-org__select"
                    value={orgPolicyDraft.defaultMode}
                    disabled={!canManageWorkspaceAccess || orgPolicyLoading || orgPolicySaving}
                    onChange={(event) => {
                      const mode = normalizeAiMode(event.target.value);
                      if (!mode) return;
                      setOrgPolicyDraft((current) => ({ ...current, defaultMode: mode }));
                    }}
                  >
                    {AI_MODE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
                <label className="settings-org__toggle">
                  <input
                    type="checkbox"
                    checked={orgPolicyDraft.sharedOrgAiEnabled}
                    disabled={!canManageWorkspaceAccess || orgPolicyLoading || orgPolicySaving}
                    onChange={(event) => {
                      const checked = event.target.checked;
                      setOrgPolicyDraft((current) => ({ ...current, sharedOrgAiEnabled: checked }));
                    }}
                  />
                  <span>Shared org AI enabled</span>
                </label>
                <label className="settings-org__toggle">
                  <input
                    type="checkbox"
                    checked={orgPolicyDraft.memberByoAllowed}
                    disabled={!canManageWorkspaceAccess || orgPolicyLoading || orgPolicySaving}
                    onChange={(event) => {
                      const checked = event.target.checked;
                      setOrgPolicyDraft((current) => ({ ...current, memberByoAllowed: checked }));
                    }}
                  />
                  <span>Personal BYO allowed</span>
                </label>
                <button
                  type="button"
                  className="settings-org__access-button"
                  disabled={!canManageWorkspaceAccess || orgPolicyLoading || orgPolicySaving}
                  onClick={() => void onSaveOrgPolicy()}
                >
                  {orgPolicySaving ? "Saving..." : "Save Org Policy"}
                </button>
                {orgPolicyError ? <div className="settings-org__error">{orgPolicyError}</div> : null}
                {orgPolicyNotice ? <div className="settings-org__notice">{orgPolicyNotice}</div> : null}
              </article>

              <article className="settings-org__member-panel">
                <h5 className="settings-org__panel-title">Member Override</h5>
                {!selectedMember ? (
                  <p className="settings-org__copy">Select a member to edit override policy.</p>
                ) : (
                  <>
                    <p className="settings-org__copy">
                      Target: {selectedMember.displayName ?? selectedMember.email ?? selectedMember.userId}
                    </p>
                    {memberPolicyLoading ? <p className="settings-org__copy">Loading override...</p> : null}
                    <label className="settings-org__access-field">
                      <span className="settings-org__label">Mode Override</span>
                      <select
                        className="settings-org__select"
                        value={memberPolicyDraft.modeOverride}
                        disabled={!canManageWorkspaceAccess || memberPolicyLoading || memberPolicySaving}
                        onChange={(event) => {
                          const value = event.target.value;
                          if (value === "INHERIT") {
                            setMemberPolicyDraft((current) => ({ ...current, modeOverride: "INHERIT" }));
                            return;
                          }
                          const mode = normalizeAiMode(value);
                          if (!mode) return;
                          setMemberPolicyDraft((current) => ({ ...current, modeOverride: mode }));
                        }}
                      >
                        <option value="INHERIT">Inherit Org Default</option>
                        {AI_MODE_OPTIONS.map((option) => (
                          <option key={`member-${option.value}`} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </label>
                    <label className="settings-org__toggle">
                      <input
                        type="checkbox"
                        checked={memberPolicyDraft.allowHeavyTasks}
                        disabled={!canManageWorkspaceAccess || memberPolicyLoading || memberPolicySaving}
                        onChange={(event) => {
                          const checked = event.target.checked;
                          setMemberPolicyDraft((current) => ({ ...current, allowHeavyTasks: checked }));
                        }}
                      />
                      <span>Allow heavy tasks</span>
                    </label>
                    <button
                      type="button"
                      className="settings-org__access-button"
                      disabled={!canManageWorkspaceAccess || memberPolicyLoading || memberPolicySaving}
                      onClick={() => void onSaveMemberPolicy()}
                    >
                      {memberPolicySaving ? "Saving..." : "Save Member Override"}
                    </button>
                    {memberPolicyError ? <div className="settings-org__error">{memberPolicyError}</div> : null}
                    {memberPolicyNotice ? <div className="settings-org__notice">{memberPolicyNotice}</div> : null}
                  </>
                )}
              </article>
            </div>
          </section>

          <div className="settings-org__members">
            <h4 className="settings-org__members-title">Members</h4>
            {loadingMismatch ? (
              <p className="settings-org__copy">Checking org/team membership consistency...</p>
            ) : null}
            {!loadingMismatch && missingMemberCount > 0 ? (
              <div className="settings-org__warning">
                <p className="settings-org__warning-copy">
                  Membership mismatch detected: {missingMemberCount} user(s) are in teams but missing org membership.
                </p>
                <button
                  type="button"
                  onClick={() => void onRepairMembershipMismatch()}
                  disabled={repairingMismatch}
                  className="settings-org__warning-button"
                >
                  {repairingMismatch ? "Repairing..." : "Repair"}
                </button>
              </div>
            ) : null}
            {mismatchError ? <div className="settings-org__error">{mismatchError}</div> : null}
            {loadingMembers ? (
              <p className="settings-org__copy">Loading members...</p>
            ) : null}
            {membersError ? (
              <div className="settings-org__error">{membersError}</div>
            ) : null}
            {!loadingMembers && !membersError && selectedOrgId && members.length === 0 ? (
              <p className="settings-org__copy">No members found.</p>
            ) : null}
            {!loadingMembers && !membersError && members.length > 0 ? (
              <div className="settings-org__members-layout">
                <table className="settings-org__table settings-org__table--selectable">
                  <thead>
                    <tr>
                      <th className="settings-org__th">
                        Member
                      </th>
                      <th className="settings-org__th">
                        Role
                      </th>
                      <th className="settings-org__th">
                        Joined
                      </th>
                      <th className="settings-org__th">
                        User ID
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {members.map((member) => (
                      <tr
                        key={member.userId}
                        className={member.userId === selectedMember?.userId ? "settings-org__row settings-org__row--selected" : "settings-org__row"}
                        onClick={() => setSelectedMemberId(member.userId)}
                      >
                        <td className="settings-org__td">
                          <div className="settings-org__member-cell">
                            <div className="settings-org__member-name">{member.displayName ?? member.email ?? "Unknown"}</div>
                            {member.email ? <div className="settings-org__member-email">{member.email}</div> : null}
                          </div>
                        </td>
                        <td className="settings-org__td">
                          {labelOrgRole(member.orgRole)}
                        </td>
                        <td className="settings-org__td">
                          {formatDate(member.createdAt)}
                        </td>
                        <td className="settings-org__td">
                          <code>{shortId(member.userId)}</code>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {canManageWorkspaceAccess ? (
                  <OrgMemberWorkspaceAccessPanel
                    orgId={selectedOrgId}
                    selectedMember={selectedMember}
                    actingUserId={session?.user.id ?? null}
                    canManage={canManageWorkspaceAccess}
                  />
                ) : (
                  <aside className="settings-org__member-panel settings-org__member-panel--empty">
                    <h5 className="settings-org__panel-title">Workspace Access</h5>
                    <p className="settings-org__copy">
                      Workspace access is managed by organization owners and admins.
                    </p>
                  </aside>
                )}
              </div>
            ) : null}
          </div>
        </>
      ) : null}
    </section>
  );
}
