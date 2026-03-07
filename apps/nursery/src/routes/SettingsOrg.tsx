import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useOutletContext } from "react-router-dom";
import { supabase } from "../lib/supabase";
import type { AppShellContext } from "./AppShell";
import "./SettingsOrg.css";

type OrgRow = {
  org_id: string;
  org_name: string;
  my_org_role: string;
  created_at: string | null;
};

type OrgMemberRow = {
  org_id: string;
  user_id: string;
  user_email: string;
  org_role: string;
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

function labelRole(role: string | null | undefined): string {
  const normalized = (role ?? "").trim().toLowerCase();
  if (normalized === "owner" || normalized === "admin" || normalized === "member") {
    return `${normalized[0].toUpperCase()}${normalized.slice(1)}`;
  }
  return "Unknown";
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

  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [loadingOrgs, setLoadingOrgs] = useState(false);
  const [orgsError, setOrgsError] = useState<string | null>(null);
  const [selectedOrgId, setSelectedOrgId] = useState<string>("");

  const [members, setMembers] = useState<OrgMemberRow[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [membersError, setMembersError] = useState<string | null>(null);
  const [missingMemberCount, setMissingMemberCount] = useState<number>(0);
  const [loadingMismatch, setLoadingMismatch] = useState(false);
  const [mismatchError, setMismatchError] = useState<string | null>(null);
  const [repairingMismatch, setRepairingMismatch] = useState(false);
  const [repairNotice, setRepairNotice] = useState<string | null>(null);

  const activeOrg = useMemo(
    () => orgs.find((org) => org.org_id === selectedOrgId) ?? null,
    [orgs, selectedOrgId],
  );

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
        const { data, error } = await tongsRpcClient.rpc("list_org_members", {
          p_org_id: selectedOrgId,
        });
        if (cancelled) return;
        if (error) throw error;
        const rows = Array.isArray(data) ? data as OrgMemberRow[] : [];
        setMembers(rows);
      } catch (error: unknown) {
        if (cancelled) return;
        setMembers([]);
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
        tongsRpcClient.rpc("list_org_members", { p_org_id: selectedOrgId }),
        tongsRpcClient.rpc("count_missing_org_members_for_org", { p_org_id: selectedOrgId }),
      ]);
      if (membersResponse.error) throw membersResponse.error;
      if (countResponse.error) throw countResponse.error;
      setMembers(Array.isArray(membersResponse.data) ? membersResponse.data as OrgMemberRow[] : []);
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
                  {org.org_name} ({labelRole(org.my_org_role)})
                </option>
              ))}
            </select>
            {orgsError ? <div className="settings-org__error">{orgsError}</div> : null}
            {repairNotice ? <div className="settings-org__notice">{repairNotice}</div> : null}
          </div>

          {activeOrg ? (
            <div className="settings-org__meta">
              <div><strong>Name:</strong> {activeOrg.org_name}</div>
              <div><strong>Your role:</strong> {labelRole(activeOrg.my_org_role)}</div>
              <div><strong>Created:</strong> {formatDate(activeOrg.created_at)}</div>
              <div><strong>Org ID:</strong> {activeOrg.org_id}</div>
            </div>
          ) : null}

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
              <table className="settings-org__table">
                <thead>
                  <tr>
                    <th className="settings-org__th">
                      Email
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
                    <tr key={member.user_id}>
                      <td className="settings-org__td">
                        {member.user_email || "Unknown"}
                      </td>
                      <td className="settings-org__td">
                        {labelRole(member.org_role)}
                      </td>
                      <td className="settings-org__td">
                        {formatDate(member.created_at)}
                      </td>
                      <td className="settings-org__td">
                        <code>{shortId(member.user_id)}</code>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
          </div>
        </>
      ) : null}
    </section>
  );
}
