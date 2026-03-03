import { useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
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
        setOrgsError(toErrorMessage(error, "Failed loading organizations."));
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
        setMembersError(toErrorMessage(error, "Failed loading organization members."));
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

  return (
    <section className="settings-org">
      <header className="settings-org__header">
        <h3 className="settings-org__title">Organization</h3>
        <p className="settings-org__copy">
          Read-only organization details for this slice. Team grants and org-managed access land in later slices.
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
