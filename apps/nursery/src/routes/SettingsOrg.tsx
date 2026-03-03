import { useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { supabase } from "../lib/supabase";
import type { AppShellContext } from "./AppShell";

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

    void supabase
      .schema("tongs")
      .rpc("list_my_orgs")
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) throw error;
        const rows = Array.isArray(data) ? data as OrgRow[] : [];
        setOrgs(rows);
        setSelectedOrgId((current) => {
          if (current && rows.some((row) => row.org_id === current)) return current;
          return rows[0]?.org_id ?? "";
        });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setOrgs([]);
        setSelectedOrgId("");
        setOrgsError(toErrorMessage(error, "Failed loading organizations."));
      })
      .finally(() => {
        if (cancelled) return;
        setLoadingOrgs(false);
      });

    return () => {
      cancelled = true;
    };
  }, [session]);

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

    void supabase
      .schema("tongs")
      .rpc("list_org_members", { p_org_id: selectedOrgId })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) throw error;
        const rows = Array.isArray(data) ? data as OrgMemberRow[] : [];
        setMembers(rows);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setMembers([]);
        setMembersError(toErrorMessage(error, "Failed loading organization members."));
      })
      .finally(() => {
        if (cancelled) return;
        setLoadingMembers(false);
      });

    return () => {
      cancelled = true;
    };
  }, [session, selectedOrgId]);

  return (
    <section
      style={{
        border: "1px solid var(--forge-border)",
        borderRadius: 12,
        background: "var(--forge-bg-elevated)",
        padding: 16,
        maxWidth: 860,
        display: "grid",
        gap: 12,
      }}
    >
      <header style={{ display: "grid", gap: 6 }}>
        <h3 style={{ margin: 0 }}>Organization</h3>
        <p style={{ margin: 0, color: "var(--forge-text-muted)" }}>
          Read-only organization details for this slice. Team grants and org-managed access land in later slices.
        </p>
      </header>

      {!session ? (
        <p style={{ margin: 0, color: "var(--forge-text-muted)" }}>
          Sign in to view organizations.
        </p>
      ) : null}

      {session ? (
        <>
          <div style={{ display: "grid", gap: 8, maxWidth: 420 }}>
            <label htmlFor="org-picker" style={{ fontSize: 12, color: "var(--forge-text-muted)" }}>
              Organization
            </label>
            <select
              id="org-picker"
              value={selectedOrgId}
              onChange={(event) => setSelectedOrgId(event.target.value)}
              disabled={loadingOrgs || orgs.length === 0}
              style={{ padding: "6px 8px" }}
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
            {orgsError ? <div style={{ color: "var(--forge-danger)", fontSize: 13 }}>{orgsError}</div> : null}
          </div>

          {activeOrg ? (
            <div style={{ display: "grid", gap: 4 }}>
              <div><strong>Name:</strong> {activeOrg.org_name}</div>
              <div><strong>Your role:</strong> {labelRole(activeOrg.my_org_role)}</div>
              <div><strong>Created:</strong> {formatDate(activeOrg.created_at)}</div>
              <div><strong>Org ID:</strong> {activeOrg.org_id}</div>
            </div>
          ) : null}

          <div style={{ borderTop: "1px solid var(--forge-border)", paddingTop: 10, display: "grid", gap: 8 }}>
            <h4 style={{ margin: 0 }}>Members</h4>
            {loadingMembers ? (
              <p style={{ margin: 0, color: "var(--forge-text-muted)" }}>Loading members...</p>
            ) : null}
            {membersError ? (
              <div style={{ color: "var(--forge-danger)", fontSize: 13 }}>{membersError}</div>
            ) : null}
            {!loadingMembers && !membersError && selectedOrgId && members.length === 0 ? (
              <p style={{ margin: 0, color: "var(--forge-text-muted)" }}>No members found.</p>
            ) : null}
            {!loadingMembers && !membersError && members.length > 0 ? (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", padding: "6px 8px", borderBottom: "1px solid var(--forge-border)" }}>
                      Email
                    </th>
                    <th style={{ textAlign: "left", padding: "6px 8px", borderBottom: "1px solid var(--forge-border)" }}>
                      Role
                    </th>
                    <th style={{ textAlign: "left", padding: "6px 8px", borderBottom: "1px solid var(--forge-border)" }}>
                      Joined
                    </th>
                    <th style={{ textAlign: "left", padding: "6px 8px", borderBottom: "1px solid var(--forge-border)" }}>
                      User ID
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((member) => (
                    <tr key={member.user_id}>
                      <td style={{ padding: "6px 8px", borderBottom: "1px solid var(--forge-border)" }}>
                        {member.user_email || "Unknown"}
                      </td>
                      <td style={{ padding: "6px 8px", borderBottom: "1px solid var(--forge-border)" }}>
                        {labelRole(member.org_role)}
                      </td>
                      <td style={{ padding: "6px 8px", borderBottom: "1px solid var(--forge-border)" }}>
                        {formatDate(member.created_at)}
                      </td>
                      <td style={{ padding: "6px 8px", borderBottom: "1px solid var(--forge-border)" }}>
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
