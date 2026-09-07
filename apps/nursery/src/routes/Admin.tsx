import { useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import type { AppShellContext } from "./AppShell";
import { supabase } from "../lib/supabase";
import { loadOrgMembers } from "../features/orgs/data/workspaceAccessRepo";
import type { OrgMember } from "../features/orgs/types";
import {
  canAccessAdminPanel,
  parseAdminOverview,
  parseAdminUsageEvents,
  parseAdminUserInspection,
  type AdminOverview,
  type AdminUsageEvent,
  type AdminUserInspection,
} from "../lib/admin/adminPanel";
import "./Admin.css";

type OrgRow = {
  org_id: string;
  org_name: string;
  my_org_role: string;
};

type TongsRpcClient = {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
};

function toErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleString();
}

function shortId(value: string | null | undefined): string {
  if (!value) return "n/a";
  return value.length <= 12 ? value : `${value.slice(0, 8)}...`;
}

function csvEscape(value: unknown): string {
  if (value == null) return "";
  const text = String(value);
  if (text.includes(",") || text.includes("\"") || text.includes("\n")) {
    return `"${text.replaceAll("\"", "\"\"")}"`;
  }
  return text;
}

function triggerCsvDownload(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export default function AdminRoute() {
  const shell = useOutletContext<AppShellContext>();
  const session = shell?.session ?? null;

  const tongsRpcClient = useMemo(
    () => supabase.schema("tongs") as unknown as TongsRpcClient,
    [],
  );

  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string>("");
  const [orgLoadError, setOrgLoadError] = useState<string | null>(null);
  const [orgLoading, setOrgLoading] = useState(false);

  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [overviewEvents, setOverviewEvents] = useState<AdminUsageEvent[]>([]);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [overviewError, setOverviewError] = useState<string | null>(null);

  const [members, setMembers] = useState<OrgMember[]>([]);
  const [memberLoading, setMemberLoading] = useState(false);
  const [memberError, setMemberError] = useState<string | null>(null);
  const [userSearch, setUserSearch] = useState("");
  const [selectedUserId, setSelectedUserId] = useState("");

  const [inspection, setInspection] = useState<AdminUserInspection | null>(null);
  const [inspectionEvents, setInspectionEvents] = useState<AdminUsageEvent[]>([]);
  const [inspectionLoading, setInspectionLoading] = useState(false);
  const [inspectionError, setInspectionError] = useState<string | null>(null);

  const [sharedAiEnabledDraft, setSharedAiEnabledDraft] = useState<boolean>(true);
  const [sharedAiSaving, setSharedAiSaving] = useState(false);
  const [sharedAiNotice, setSharedAiNotice] = useState<string | null>(null);
  const [sharedAiError, setSharedAiError] = useState<string | null>(null);
  const [downloadBusyWindow, setDownloadBusyWindow] = useState<"daily" | "weekly" | "monthly" | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const selectedOrg = useMemo(
    () => orgs.find((org) => org.org_id === selectedOrgId) ?? null,
    [orgs, selectedOrgId],
  );
  const canManageAdmin = canAccessAdminPanel(selectedOrg?.my_org_role ?? null);

  const filteredMembers = useMemo(() => {
    const search = userSearch.trim().toLowerCase();
    if (!search) return members;
    return members.filter((member) => {
      const display = (member.displayName ?? "").toLowerCase();
      const email = (member.email ?? "").toLowerCase();
      const userId = member.userId.toLowerCase();
      return display.includes(search) || email.includes(search) || userId.includes(search);
    });
  }, [members, userSearch]);

  useEffect(() => {
    if (!session) {
      setOrgs([]);
      setSelectedOrgId("");
      setOrgLoadError(null);
      return;
    }

    let cancelled = false;
    setOrgLoading(true);
    setOrgLoadError(null);

    void (async () => {
      try {
        const { data, error } = await tongsRpcClient.rpc("list_my_orgs");
        if (cancelled) return;
        if (error) throw error;
        const rows = Array.isArray(data) ? (data as OrgRow[]) : [];
        setOrgs(rows);
        setSelectedOrgId((current) => {
          if (current && rows.some((row) => row.org_id === current)) return current;
          return rows[0]?.org_id ?? "";
        });
      } catch (error: unknown) {
        if (cancelled) return;
        setOrgs([]);
        setSelectedOrgId("");
        setOrgLoadError(toErrorMessage(error, "Failed loading organizations."));
      } finally {
        if (!cancelled) setOrgLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [session, tongsRpcClient]);

  useEffect(() => {
    if (!session || !selectedOrgId || !canManageAdmin) {
      setOverview(null);
      setOverviewEvents([]);
      setOverviewError(null);
      setOverviewLoading(false);
      return;
    }

    let cancelled = false;
    setOverviewLoading(true);
    setOverviewError(null);

    void (async () => {
      try {
        const [overviewResponse, eventsResponse] = await Promise.all([
          tongsRpcClient.rpc("admin_get_ai_activity_overview", { p_org_id: selectedOrgId }),
          tongsRpcClient.rpc("admin_list_ai_activity_events", { p_org_id: selectedOrgId, p_limit: 40 }),
        ]);

        if (cancelled) return;
        if (overviewResponse.error) throw overviewResponse.error;
        if (eventsResponse.error) throw eventsResponse.error;

        const overviewRow = Array.isArray(overviewResponse.data)
          ? (overviewResponse.data[0] as Record<string, unknown> | undefined)
          : null;

        setOverview(parseAdminOverview(overviewRow ?? null));
        setOverviewEvents(parseAdminUsageEvents(eventsResponse.data));
      } catch (error: unknown) {
        if (cancelled) return;
        setOverview(null);
        setOverviewEvents([]);
        setOverviewError(toErrorMessage(error, "Failed loading AI overview."));
      } finally {
        if (!cancelled) setOverviewLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [canManageAdmin, selectedOrgId, session, tongsRpcClient]);

  useEffect(() => {
    if (!session || !selectedOrgId || !canManageAdmin) {
      setMembers([]);
      setSelectedUserId("");
      setMemberError(null);
      setMemberLoading(false);
      return;
    }

    let cancelled = false;
    setMemberLoading(true);
    setMemberError(null);

    void (async () => {
      try {
        const rows = await loadOrgMembers(selectedOrgId);
        if (cancelled) return;
        setMembers(rows);
        setSelectedUserId((current) => {
          if (current && rows.some((member) => member.userId === current)) return current;
          return rows[0]?.userId ?? "";
        });
      } catch (error: unknown) {
        if (cancelled) return;
        setMembers([]);
        setSelectedUserId("");
        setMemberError(toErrorMessage(error, "Failed loading org members."));
      } finally {
        if (!cancelled) setMemberLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [canManageAdmin, selectedOrgId, session]);

  useEffect(() => {
    if (!session || !selectedOrgId || !selectedUserId || !canManageAdmin) {
      setInspection(null);
      setInspectionEvents([]);
      setInspectionError(null);
      setInspectionLoading(false);
      return;
    }

    let cancelled = false;
    setInspectionLoading(true);
    setInspectionError(null);

    void (async () => {
      try {
        const [inspectionResponse, eventsResponse] = await Promise.all([
          tongsRpcClient.rpc("admin_get_user_ai_access_inspection", {
            p_org_id: selectedOrgId,
            p_target_user_id: selectedUserId,
          }),
          tongsRpcClient.rpc("admin_list_ai_activity_events", {
            p_org_id: selectedOrgId,
            p_user_id: selectedUserId,
            p_limit: 30,
          }),
        ]);
        if (cancelled) return;
        if (inspectionResponse.error) throw inspectionResponse.error;
        if (eventsResponse.error) throw eventsResponse.error;

        const parsedInspection = parseAdminUserInspection(inspectionResponse.data);
        setInspection(parsedInspection);
        setInspectionEvents(parseAdminUsageEvents(eventsResponse.data));
        setSharedAiEnabledDraft(parsedInspection?.orgSharedAiEnabled ?? true);
      } catch (error: unknown) {
        if (cancelled) return;
        setInspection(null);
        setInspectionEvents([]);
        setInspectionError(toErrorMessage(error, "Failed loading user AI inspection."));
      } finally {
        if (!cancelled) setInspectionLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [canManageAdmin, selectedOrgId, selectedUserId, session, tongsRpcClient]);

  async function onSaveSharedAiEnabled() {
    if (!selectedOrgId || !canManageAdmin || sharedAiSaving) return;
    setSharedAiSaving(true);
    setSharedAiError(null);
    setSharedAiNotice(null);
    try {
      const { error } = await tongsRpcClient.rpc("admin_set_org_shared_ai_enabled", {
        p_org_id: selectedOrgId,
        p_enabled: sharedAiEnabledDraft,
      });
      if (error) throw error;
      setSharedAiNotice("Saved org shared AI setting.");
    } catch (error: unknown) {
      setSharedAiError(toErrorMessage(error, "Failed saving org shared AI setting."));
    } finally {
      setSharedAiSaving(false);
    }
  }

  async function onDownloadWindow(window: "daily" | "weekly" | "monthly") {
    if (!selectedOrgId || !canManageAdmin || downloadBusyWindow) return;
    const days = window === "daily" ? 1 : window === "weekly" ? 7 : 30;
    setDownloadBusyWindow(window);
    setDownloadError(null);
    try {
      const [overviewResponse, rowsResponse] = await Promise.all([
        tongsRpcClient.rpc("admin_get_ai_activity_overview_window", {
          p_org_id: selectedOrgId,
          p_days: days,
        }),
        tongsRpcClient.rpc("admin_get_ai_activity_export_rows", {
          p_org_id: selectedOrgId,
          p_days: days,
          p_limit: 5000,
        }),
      ]);
      if (overviewResponse.error) throw overviewResponse.error;
      if (rowsResponse.error) throw rowsResponse.error;

      const overviewRow = Array.isArray(overviewResponse.data)
        ? (overviewResponse.data[0] as Record<string, unknown> | undefined)
        : null;
      const exportOverview = parseAdminOverview(overviewRow ?? null);
      const exportRows = parseAdminUsageEvents(rowsResponse.data);

      const lines: string[] = [];
      lines.push("section,metric,value");
      lines.push(`summary,window_days,${days}`);
      lines.push(`summary,total_usage,${exportOverview.totalUsageToday}`);
      lines.push(`summary,total_billable_tokens,${exportOverview.totalBillableTokensToday}`);
      lines.push("");

      lines.push("section,feature,subfeature,call_count,billable_tokens");
      for (const row of exportOverview.usageByFeature) {
        lines.push([
          "usage_by_feature",
          csvEscape(row.feature),
          csvEscape(row.subfeature ?? ""),
          row.callCount,
          row.billableTokens,
        ].join(","));
      }
      lines.push("");

      lines.push("section,lane,call_count,billable_tokens");
      for (const row of exportOverview.usageByLane) {
        lines.push([
          "usage_by_lane",
          csvEscape(row.lane),
          row.callCount,
          row.billableTokens,
        ].join(","));
      }
      lines.push("");

      lines.push(
        "section,created_at,user_id,workspace_id,feature,subfeature,lane,status,billable_tokens,model,provider,action_id,effective_ai_key_source,effective_billing_lane,policy_decision_type,key_resolution_status",
      );
      for (const row of exportRows) {
        lines.push([
          "events",
          csvEscape(row.createdAt),
          csvEscape(row.userId),
          csvEscape(row.workspaceId ?? ""),
          csvEscape(row.feature),
          csvEscape(row.subfeature ?? ""),
          csvEscape(row.lane),
          csvEscape(row.status),
          row.billableTokens,
          csvEscape(row.model),
          csvEscape(row.provider ?? ""),
          csvEscape(row.actionId ?? ""),
          csvEscape(row.effectiveAiKeySource ?? ""),
          csvEscape(row.effectiveBillingLane ?? ""),
          csvEscape(row.policyDecisionType ?? ""),
          csvEscape(row.keyResolutionStatus ?? ""),
        ].join(","));
      }

      const stamp = new Date().toISOString().slice(0, 10);
      triggerCsvDownload(`forge-admin-ai-${window}-${stamp}.csv`, `${lines.join("\n")}\n`);
    } catch (error: unknown) {
      setDownloadError(toErrorMessage(error, "Failed preparing admin export."));
    } finally {
      setDownloadBusyWindow(null);
    }
  }

  return (
    <section className="admin-route">
      <header className="admin-route__header">
        <div>
          <h2 className="admin-route__title">Admin Panel (v1)</h2>
          <p className="admin-route__subtitle">Early operational controls for AI usage, user policy inspection, and safe beta flags.</p>
        </div>
        <label className="admin-route__org-picker">
          <span>Organization</span>
          <select
            value={selectedOrgId}
            onChange={(event) => setSelectedOrgId(event.target.value)}
            disabled={orgLoading || orgs.length === 0}
          >
            {orgs.map((org) => (
              <option key={org.org_id} value={org.org_id}>
                {org.org_name}
              </option>
            ))}
          </select>
        </label>
      </header>

      {orgLoadError ? <div className="admin-route__error">{orgLoadError}</div> : null}
      {!session ? <div className="admin-route__hint">Sign in to access admin controls.</div> : null}
      {session && !selectedOrgId && !orgLoading ? <div className="admin-route__hint">No organization found for this account.</div> : null}
      {session && selectedOrgId && !canManageAdmin ? (
        <div className="admin-route__error">Admin or owner role is required for this organization.</div>
      ) : null}

      {session && selectedOrgId && canManageAdmin ? (
        <>
          <section className="admin-route__panel">
            <h3>AI Overview</h3>
            <div className="admin-route__export-actions">
              <button
                type="button"
                onClick={() => void onDownloadWindow("daily")}
                disabled={downloadBusyWindow !== null}
              >
                {downloadBusyWindow === "daily" ? "Preparing..." : "Download Daily CSV"}
              </button>
              <button
                type="button"
                onClick={() => void onDownloadWindow("weekly")}
                disabled={downloadBusyWindow !== null}
              >
                {downloadBusyWindow === "weekly" ? "Preparing..." : "Download Weekly CSV"}
              </button>
              <button
                type="button"
                onClick={() => void onDownloadWindow("monthly")}
                disabled={downloadBusyWindow !== null}
              >
                {downloadBusyWindow === "monthly" ? "Preparing..." : "Download Monthly CSV"}
              </button>
            </div>
            {downloadError ? <p className="admin-route__error">{downloadError}</p> : null}
            {overviewLoading ? <p className="admin-route__hint">Loading AI overview...</p> : null}
            {overviewError ? <p className="admin-route__error">{overviewError}</p> : null}
            {overview ? (
              <>
                <div className="admin-route__cards">
                  <article className="admin-route__card">
                    <div className="admin-route__card-label">Total AI Usage Today</div>
                    <div className="admin-route__card-value">{overview.totalUsageToday}</div>
                  </article>
                  <article className="admin-route__card">
                    <div className="admin-route__card-label">Billable Tokens Today</div>
                    <div className="admin-route__card-value">{overview.totalBillableTokensToday}</div>
                  </article>
                </div>

                <div className="admin-route__split">
                  <div>
                    <h4>Usage By Feature/Subfeature</h4>
                    {overview.usageByFeature.length === 0 ? <p className="admin-route__hint">No usage rows for today.</p> : (
                      <table className="admin-route__table">
                        <thead>
                          <tr>
                            <th>Feature</th>
                            <th>Subfeature</th>
                            <th>Calls</th>
                            <th>Billable Tokens</th>
                          </tr>
                        </thead>
                        <tbody>
                          {overview.usageByFeature.map((row) => (
                            <tr key={`${row.feature}:${row.subfeature ?? "-"}`}>
                              <td>{row.feature}</td>
                              <td>{row.subfeature ?? "n/a"}</td>
                              <td>{row.callCount}</td>
                              <td>{row.billableTokens.toLocaleString("en-US")}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                  <div>
                    <h4>Usage By Lane</h4>
                    {overview.usageByLane.length === 0 ? <p className="admin-route__hint">No lane rows for today.</p> : (
                      <table className="admin-route__table">
                        <thead>
                          <tr>
                            <th>Lane</th>
                            <th>Calls</th>
                            <th>Billable Tokens</th>
                          </tr>
                        </thead>
                        <tbody>
                          {overview.usageByLane.map((row) => (
                            <tr key={row.lane}>
                              <td>{row.lane}</td>
                              <td>{row.callCount}</td>
                              <td>{row.billableTokens.toLocaleString("en-US")}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>

                <h4>Recent AI Events</h4>
                {overviewEvents.length === 0 ? <p className="admin-route__hint">No recent events.</p> : (
                  <table className="admin-route__table">
                    <thead>
                      <tr>
                        <th>Time</th>
                        <th>User</th>
                        <th>Feature</th>
                        <th>Lane</th>
                        <th>Status</th>
                        <th>Billable Tokens</th>
                      </tr>
                    </thead>
                    <tbody>
                      {overviewEvents.map((event) => (
                        <tr key={`${event.createdAt}:${event.userId}:${event.feature}:${event.actionId ?? "-"}`}>
                          <td>{formatDateTime(event.createdAt)}</td>
                          <td>{shortId(event.userId)}</td>
                          <td>{event.feature}:{event.subfeature ?? "-"}</td>
                          <td>{event.lane}</td>
                          <td>{event.status}</td>
                          <td>{event.billableTokens.toLocaleString("en-US")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </>
            ) : null}
          </section>

          <section className="admin-route__panel">
            <h3>User Lookup</h3>
            <div className="admin-route__lookup">
              <label>
                <span>Search user</span>
                <input
                  value={userSearch}
                  onChange={(event) => setUserSearch(event.target.value)}
                  placeholder="Email, display name, or user id"
                />
              </label>
              <label>
                <span>Member</span>
                <select
                  value={selectedUserId}
                  onChange={(event) => setSelectedUserId(event.target.value)}
                  disabled={memberLoading || filteredMembers.length === 0}
                >
                  {filteredMembers.map((member) => (
                    <option key={member.userId} value={member.userId}>
                      {(member.email ?? member.displayName ?? shortId(member.userId))} ({member.orgRole})
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {memberError ? <p className="admin-route__error">{memberError}</p> : null}
            {inspectionLoading ? <p className="admin-route__hint">Loading user AI state...</p> : null}
            {inspectionError ? <p className="admin-route__error">{inspectionError}</p> : null}
            {inspection ? (
              <>
                <div className="admin-route__cards">
                  <article className="admin-route__card">
                    <div className="admin-route__card-label">Effective AI Key Source</div>
                    <div className="admin-route__card-value">{inspection.effectiveAiKeySource ?? "n/a"}</div>
                  </article>
                  <article className="admin-route__card">
                    <div className="admin-route__card-label">Policy Decision</div>
                    <div className="admin-route__card-value">{inspection.policyDecisionType}</div>
                  </article>
                  <article className="admin-route__card">
                    <div className="admin-route__card-label">Forge AI Enabled</div>
                    <div className="admin-route__card-value">{inspection.orgSharedAiEnabled ? "Yes" : "No"}</div>
                  </article>
                  <article className="admin-route__card">
                    <div className="admin-route__card-label">BYO Configured</div>
                    <div className="admin-route__card-value">{inspection.byoConfigured ? "Yes" : "No"}</div>
                  </article>
                </div>

                <div className="admin-route__split">
                  <div>
                    <h4>Effective AI Policy</h4>
                    <ul className="admin-route__key-list">
                      <li>Org default mode: {inspection.orgPolicyDefaultMode}</li>
                      <li>Member mode override: {inspection.memberModeOverride ?? "INHERIT"}</li>
                      <li>Org shared AI enabled: {inspection.orgSharedAiEnabled ? "true" : "false"}</li>
                      <li>Org member BYO allowed: {inspection.orgMemberByoAllowed ? "true" : "false"}</li>
                      <li>Policy reason code: {inspection.policyReasonCode ?? "none"}</li>
                      <li>Selected funding source: {inspection.selectedFundingSource ?? "none"}</li>
                    </ul>
                  </div>
                  <div>
                    <h4>Beta / Access Flags</h4>
                    <ul className="admin-route__key-list">
                      <li>Profile tier: {inspection.profileTier ?? "free"}</li>
                      <li>Plan code: {inspection.activePlanCode ?? "none"}</li>
                      <li>Founders club flag: {inspection.foundersClubFlag ? "true" : "false"}</li>
                      <li>Founder entitled: {inspection.isFounderEntitled ? "true" : "false"}</li>
                      <li>Studio entitled: {inspection.isStudioEntitled ? "true" : "false"}</li>
                      <li>Org toolbox allowed: {inspection.orgToolboxAllowed ? "true" : "false"}</li>
                    </ul>
                  </div>
                </div>

                <h4>Recent AI Events (User)</h4>
                {inspectionEvents.length === 0 ? <p className="admin-route__hint">No recent AI events for this user in this org.</p> : (
                  <table className="admin-route__table">
                    <thead>
                      <tr>
                        <th>Time</th>
                        <th>Feature</th>
                        <th>Lane</th>
                        <th>Status</th>
                        <th>Billable Tokens</th>
                        <th>Model</th>
                      </tr>
                    </thead>
                    <tbody>
                      {inspectionEvents.map((event) => (
                        <tr key={`${event.createdAt}:${event.feature}:${event.actionId ?? "-"}`}>
                          <td>{formatDateTime(event.createdAt)}</td>
                          <td>{event.feature}:{event.subfeature ?? "-"}</td>
                          <td>{event.lane}</td>
                          <td>{event.status}</td>
                          <td>{event.billableTokens.toLocaleString("en-US")}</td>
                          <td>{event.model}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </>
            ) : null}
          </section>

          <section className="admin-route__panel">
            <h3>Beta Controls</h3>
            <p className="admin-route__hint">This v1 slice only exposes controls with explicit backend contracts and permission checks.</p>

            <label className="admin-route__toggle">
              <input
                type="checkbox"
                checked={sharedAiEnabledDraft}
                onChange={(event) => setSharedAiEnabledDraft(event.target.checked)}
                disabled={sharedAiSaving}
              />
              <span>Organization shared AI enabled</span>
            </label>

            <div className="admin-route__actions">
              <button
                type="button"
                onClick={() => void onSaveSharedAiEnabled()}
                disabled={sharedAiSaving}
              >
                {sharedAiSaving ? "Saving..." : "Save"}
              </button>
            </div>

            {sharedAiError ? <p className="admin-route__error">{sharedAiError}</p> : null}
            {sharedAiNotice ? <p className="admin-route__notice">{sharedAiNotice}</p> : null}
            <p className="admin-route__hint">Beta approval mutation is read-only in v1 because no dedicated admin contract exists yet.</p>
          </section>
        </>
      ) : null}
    </section>
  );
}
