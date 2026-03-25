import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { MobilePage, useLayoutMode } from "@forge/ui-mobile";
import type { AppShellContext } from "./AppShell";
import WorkspaceRequiredNotice from "./WorkspaceRequiredNotice";
import { tongsApiRequest } from "../lib/tongs-api";
import "./TongsRecordingSessions.css";

type RecordingSessionSummary = {
  id: string;
  workspace_id: string;
  title: string;
  created_at?: string | null;
  updated_at?: string | null;
  calendar_event_id?: string | null;
};

type RecordingSessionItem = {
  position: number;
  episode_id: string;
  script_path: string;
};

type RecordingSessionDetail = {
  id: string;
  workspace_id: string;
  title: string;
  calendar_event_id?: string | null;
  items: RecordingSessionItem[];
};

type ReadyScriptCandidate = {
  workspace_id: string;
  workpiece_id: string;
  path: string;
  primary_script_path: string;
  script_paths: string[];
  title: string;
  updated_at: string;
  content_category: string | null;
  marked_ready_by?: string | null;
  marked_ready_at?: string | null;
};

type SessionPlannerItem = {
  episode_id: string;
  script_path: string;
};

type WorkspaceRole = "viewer" | "editor" | "admin" | "owner";

const WORKSPACE_ROLE_RANK: Record<WorkspaceRole, number> = {
  viewer: 10,
  editor: 20,
  admin: 30,
  owner: 40,
};

function readErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
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
  return `${role.slice(0, 1).toUpperCase()}${role.slice(1)}`;
}

function itemSignature(items: readonly SessionPlannerItem[]): string {
  return items.map((item) => `${item.episode_id}::${item.script_path}`).join("|");
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "Unknown date";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  return date.toLocaleString();
}

function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return "unknown";
  const timestamp = Date.parse(iso);
  if (!Number.isFinite(timestamp)) return "unknown";
  const diffMs = Date.now() - timestamp;
  const absMs = Math.abs(diffMs);
  const minuteMs = 60 * 1000;
  const hourMs = 60 * minuteMs;
  const dayMs = 24 * hourMs;
  const weekMs = 7 * dayMs;

  const formatUnit = (unit: Intl.RelativeTimeFormatUnit, amount: number): string => {
    try {
      return new Intl.RelativeTimeFormat(undefined, { numeric: "auto" }).format(amount, unit);
    } catch {
      const abs = Math.abs(amount);
      const suffix = amount <= 0 ? "ago" : "from now";
      return `${abs} ${unit}${abs === 1 ? "" : "s"} ${suffix}`;
    }
  };

  if (absMs < hourMs) return formatUnit("minute", -Math.max(1, Math.round(absMs / minuteMs)));
  if (absMs < dayMs) return formatUnit("hour", -Math.round(absMs / hourMs));
  if (absMs < weekMs) return formatUnit("day", -Math.round(absMs / dayMs));
  return formatUnit("week", -Math.round(absMs / weekMs));
}

function shortUserId(value: string | null | undefined): string {
  const userId = (value ?? "").trim();
  if (!userId) return "Unknown";
  if (userId.length <= 12) return userId;
  return `${userId.slice(0, 8)}...`;
}

function formatReadyAttribution(candidate: ReadyScriptCandidate | null | undefined): string {
  if (!candidate) return "Ready attribution unavailable";
  const readyBy = shortUserId(candidate.marked_ready_by ?? null);
  const readyAt = candidate.marked_ready_at ?? candidate.updated_at ?? null;
  if (readyAt) {
    return `Ready by ${readyBy} • ${formatRelativeTime(readyAt)}`;
  }
  return `Ready by ${readyBy}`;
}

function plannerKey(item: SessionPlannerItem): string {
  return `${item.episode_id}::${item.script_path}`;
}

function toPlannerItems(items: readonly RecordingSessionItem[]): SessionPlannerItem[] {
  const sorted = [...items].sort((a, b) => a.position - b.position);
  return sorted.map((item) => ({
    episode_id: item.episode_id,
    script_path: item.script_path,
  }));
}

export default function TongsRecordingSessions() {
  const shell = useOutletContext<AppShellContext>();
  const workspaceId = shell?.workspaceId ?? null;
  const session = shell?.session ?? null;
  const activeWorkspace = useMemo(
    () => shell?.workspaces?.find((workspace) => workspace.id === workspaceId) ?? null,
    [shell?.workspaces, workspaceId],
  );
  const workspaceRole = useMemo(
    () => normalizeWorkspaceRole(activeWorkspace?.role ?? null),
    [activeWorkspace?.role],
  );
  const canReadSessions = workspaceRole
    ? workspaceRoleAtLeast(workspaceRole, "viewer")
    : Boolean(session && workspaceId);
  const canEditSessions = workspaceRole ? workspaceRoleAtLeast(workspaceRole, "editor") : false;
  const canDeleteSessions = workspaceRole ? workspaceRoleAtLeast(workspaceRole, "admin") : false;
  const layoutMode = useLayoutMode();
  const isMobile = layoutMode === "mobile";

  const [sessions, setSessions] = useState<RecordingSessionSummary[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  const [sessionDetail, setSessionDetail] = useState<RecordingSessionDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const [readyCandidates, setReadyCandidates] = useState<ReadyScriptCandidate[]>([]);
  const [readyCandidatesWorkspaceId, setReadyCandidatesWorkspaceId] = useState<string | null>(null);
  const [readyLoading, setReadyLoading] = useState(false);
  const [readyError, setReadyError] = useState<string | null>(null);
  const [readyDeleteBusyKey, setReadyDeleteBusyKey] = useState<string | null>(null);
  const [readyDeleteError, setReadyDeleteError] = useState<string | null>(null);

  const [planItems, setPlanItems] = useState<SessionPlannerItem[]>([]);
  const [savedPlanSignature, setSavedPlanSignature] = useState("");
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [createTitle, setCreateTitle] = useState("Recording Session");
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [deleteBusyId, setDeleteBusyId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [dragFromIndex, setDragFromIndex] = useState<number | null>(null);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const readyCandidatesRequestSeqRef = useRef(0);

  const currentPlanSignature = useMemo(() => itemSignature(planItems), [planItems]);
  const isDirty = currentPlanSignature !== savedPlanSignature;

  const planEpisodeIdSet = useMemo(() => {
    return new Set(planItems.map((item) => item.episode_id));
  }, [planItems]);

  const duplicatePlanKeys = useMemo(() => {
    const keyCounts = new Map<string, number>();
    const episodeCounts = new Map<string, number>();
    for (const item of planItems) {
      const key = plannerKey(item);
      keyCounts.set(key, (keyCounts.get(key) ?? 0) + 1);
      episodeCounts.set(item.episode_id, (episodeCounts.get(item.episode_id) ?? 0) + 1);
    }
    const duplicates = new Set<string>();
    for (const item of planItems) {
      const key = plannerKey(item);
      if ((keyCounts.get(key) ?? 0) > 1 || (episodeCounts.get(item.episode_id) ?? 0) > 1) {
        duplicates.add(key);
      }
    }
    return duplicates;
  }, [planItems]);
  const hasDuplicatePlanItems = duplicatePlanKeys.size > 0;

  const readyCandidatesForDisplay = useMemo(() => {
    if (!workspaceId || readyCandidatesWorkspaceId !== workspaceId) return [];
    return readyCandidates;
  }, [readyCandidates, readyCandidatesWorkspaceId, workspaceId]);

  const candidateByPlannerKey = useMemo(() => {
    const out = new Map<string, ReadyScriptCandidate>();
    for (const candidate of readyCandidatesForDisplay) {
      for (const path of candidate.script_paths) {
        out.set(`${candidate.workpiece_id}::${path}`, candidate);
      }
      out.set(`${candidate.workpiece_id}::${candidate.primary_script_path}`, candidate);
    }
    return out;
  }, [readyCandidatesForDisplay]);

  const stalePlanItemCount = useMemo(() => {
    let count = 0;
    for (const item of planItems) {
      if (!candidateByPlannerKey.has(plannerKey(item))) {
        count += 1;
      }
    }
    return count;
  }, [candidateByPlannerKey, planItems]);

  const loadSessions = useCallback(async (preferredId?: string | null) => {
    if (!workspaceId || !session || !canReadSessions) {
      setSessions([]);
      setSelectedSessionId(null);
      return;
    }
    setSessionsLoading(true);
    setSessionsError(null);
    try {
      const data = await tongsApiRequest<{ sessions: RecordingSessionSummary[] }>(
        `/tongs/recording-sessions?workspace_id=${encodeURIComponent(workspaceId)}&limit=100`,
        { method: "GET" },
      );
      const nextSessions = Array.isArray(data.sessions) ? data.sessions : [];
      setSessions(nextSessions);
      setSelectedSessionId((prev) => {
        const candidate = preferredId ?? prev;
        if (candidate && nextSessions.some((row) => row.id === candidate)) return candidate;
        return nextSessions[0]?.id ?? null;
      });
    } catch (error: unknown) {
      setSessionsError(readErrorMessage(error, "Failed loading recording sessions."));
    } finally {
      setSessionsLoading(false);
    }
  }, [workspaceId, session, canReadSessions]);

  const loadReadyCandidates = useCallback(async () => {
    if (!workspaceId || !session || !canReadSessions) {
      setReadyCandidates([]);
      setReadyCandidatesWorkspaceId(null);
      return;
    }
    const requestSeq = readyCandidatesRequestSeqRef.current + 1;
    readyCandidatesRequestSeqRef.current = requestSeq;
    setReadyLoading(true);
    setReadyError(null);
    try {
      const data = await tongsApiRequest<{ scripts: ReadyScriptCandidate[] }>(
        `/tongs/workspaces/${encodeURIComponent(workspaceId)}/ready-scripts?unrecorded=1`,
        { method: "GET" },
      );
      if (readyCandidatesRequestSeqRef.current !== requestSeq) return;
      setReadyCandidates(Array.isArray(data.scripts) ? data.scripts : []);
      setReadyCandidatesWorkspaceId(workspaceId);
    } catch (error: unknown) {
      if (readyCandidatesRequestSeqRef.current !== requestSeq) return;
      setReadyCandidates([]);
      setReadyCandidatesWorkspaceId(null);
      setReadyError(readErrorMessage(error, "Failed loading ready candidates."));
    } finally {
      if (readyCandidatesRequestSeqRef.current === requestSeq) {
        setReadyLoading(false);
      }
    }
  }, [workspaceId, session, canReadSessions]);

  const loadSessionDetail = useCallback(async (sessionId: string) => {
    setDetailLoading(true);
    setDetailError(null);
    try {
      const detail = await tongsApiRequest<RecordingSessionDetail>(
        `/tongs/recording-sessions/${encodeURIComponent(sessionId)}`,
        { method: "GET" },
      );
      const nextPlanItems = toPlannerItems(detail.items);
      setSessionDetail(detail);
      setPlanItems(nextPlanItems);
      setSavedPlanSignature(itemSignature(nextPlanItems));
      setSaveError(null);
      setSaveNotice(null);
    } catch (error: unknown) {
      setSessionDetail(null);
      setPlanItems([]);
      setSavedPlanSignature("");
      setDetailError(readErrorMessage(error, "Failed loading session details."));
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!workspaceId || !session || !canReadSessions) {
      setSessions([]);
      setSelectedSessionId(null);
      setSessionDetail(null);
      setPlanItems([]);
      setSavedPlanSignature("");
      setReadyCandidates([]);
      setReadyCandidatesWorkspaceId(null);
      return;
    }
    void loadSessions();
    void loadReadyCandidates();
  }, [workspaceId, session, canReadSessions, loadReadyCandidates, loadSessions]);

  useEffect(() => {
    if (!selectedSessionId || !canReadSessions) {
      setSessionDetail(null);
      setPlanItems([]);
      setSavedPlanSignature("");
      return;
    }
    void loadSessionDetail(selectedSessionId);
  }, [selectedSessionId, canReadSessions, loadSessionDetail]);

  useEffect(() => {
    setCreateOpen(false);
    setCreateError(null);
    setMobileDetailOpen(false);
  }, [workspaceId]);

  useEffect(() => {
    setReadyCandidates([]);
    setReadyCandidatesWorkspaceId(null);
    setReadyError(null);
    setReadyDeleteError(null);
  }, [workspaceId]);

  useEffect(() => {
    if (!selectedSessionId) {
      setMobileDetailOpen(false);
    }
  }, [selectedSessionId]);

  useEffect(() => {
    if (!isMobile) {
      setMobileDetailOpen(false);
    }
  }, [isMobile]);

  useEffect(() => {
    if (!canEditSessions) {
      setCreateOpen(false);
    }
  }, [canEditSessions]);

  const openSession = useCallback((sessionId: string) => {
    setSelectedSessionId(sessionId);
    if (isMobile) {
      setMobileDetailOpen(true);
    }
  }, [isMobile]);

  const addCandidate = useCallback((candidate: ReadyScriptCandidate) => {
    if (!canEditSessions) {
      setSaveNotice(null);
      setSaveError("Editor access is required to change session plans.");
      return;
    }
    if (planEpisodeIdSet.has(candidate.workpiece_id)) {
      setSaveError("That episode+script is already in the session plan.");
      setSaveNotice(null);
      return;
    }
    setPlanItems((prev) => [
      ...prev,
      {
        episode_id: candidate.workpiece_id,
        script_path: candidate.primary_script_path,
      },
    ]);
    setSaveNotice(null);
    setSaveError(null);
  }, [canEditSessions, planEpisodeIdSet]);

  const deleteReadyCandidate = useCallback(async (candidate: ReadyScriptCandidate) => {
    if (!session || !canEditSessions) {
      setReadyDeleteError("Editor access is required to delete ready scripts.");
      return;
    }
    const label = candidate.title?.trim() || "Ready Script";
    const path = candidate.primary_script_path;
    const confirmed = window.confirm(
      `Delete ready script "${label}" (${path})? This removes the script file and cannot be undone.`,
    );
    if (!confirmed) return;

    const busyKey = `${candidate.workpiece_id}::${path}`;
    setReadyDeleteBusyKey(busyKey);
    setReadyDeleteError(null);
    setSaveNotice(null);
    try {
      const result = await tongsApiRequest<{
        deleted: boolean;
        already_deleted?: boolean;
        workpiece_id: string;
        path: string;
        removed_session_item_count?: number;
        ready_meta_deleted?: boolean;
        warnings?: string[];
      }>(
        `/tongs/workpieces/${encodeURIComponent(candidate.workpiece_id)}/ready-script?path=${encodeURIComponent(path)}`,
        { method: "DELETE" },
      );
      await loadReadyCandidates();
      if (selectedSessionId) {
        await loadSessionDetail(selectedSessionId);
      }

      const removedCount = Number(result.removed_session_item_count ?? 0);
      const warningCount = Array.isArray(result.warnings) ? result.warnings.length : 0;
      const alreadyDeleted = !!result.already_deleted;
      const readyMetaDeleted = !!result.ready_meta_deleted;
      const actionLabel = alreadyDeleted ? "Already removed" : "Deleted";
      const cleanupSuffix = removedCount > 0
        ? ` Removed ${removedCount} stale plan item${removedCount === 1 ? "" : "s"}.`
        : "";
      const metaSuffix = readyMetaDeleted ? " Ready attribution cleared." : "";
      const warningSuffix = warningCount > 0
        ? " Storage cleanup warning logged."
        : "";
      setSaveNotice(`${actionLabel} ready script "${label}".${cleanupSuffix}${metaSuffix}${warningSuffix}`);
    } catch (error: unknown) {
      setReadyDeleteError(readErrorMessage(error, "Failed deleting ready script."));
    } finally {
      setReadyDeleteBusyKey(null);
    }
  }, [session, canEditSessions, loadReadyCandidates, loadSessionDetail, selectedSessionId]);

  const removePlanItem = useCallback((index: number) => {
    if (!canEditSessions) return;
    setPlanItems((prev) => prev.filter((_, itemIndex) => itemIndex !== index));
    setSaveNotice(null);
    setSaveError(null);
  }, [canEditSessions]);

  const movePlanItem = useCallback((index: number, direction: -1 | 1) => {
    if (!canEditSessions) return;
    setPlanItems((prev) => {
      const targetIndex = index + direction;
      if (index < 0 || index >= prev.length) return prev;
      if (targetIndex < 0 || targetIndex >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(index, 1);
      if (!moved) return prev;
      next.splice(targetIndex, 0, moved);
      return next;
    });
    setSaveNotice(null);
    setSaveError(null);
  }, [canEditSessions]);

  const dropAtIndex = useCallback((toIndex: number) => {
    if (!canEditSessions) {
      setDragFromIndex(null);
      return;
    }
    setPlanItems((prev) => {
      if (dragFromIndex == null) return prev;
      if (dragFromIndex < 0 || dragFromIndex >= prev.length) return prev;
      if (toIndex < 0 || toIndex >= prev.length) return prev;
      if (dragFromIndex === toIndex) return prev;
      const next = [...prev];
      const [moved] = next.splice(dragFromIndex, 1);
      if (!moved) return prev;
      next.splice(toIndex, 0, moved);
      return next;
    });
    setDragFromIndex(null);
    setSaveNotice(null);
    setSaveError(null);
  }, [canEditSessions, dragFromIndex]);

  const moveToEnd = useCallback(() => {
    if (!canEditSessions) {
      setDragFromIndex(null);
      return;
    }
    setPlanItems((prev) => {
      if (dragFromIndex == null) return prev;
      if (dragFromIndex < 0 || dragFromIndex >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(dragFromIndex, 1);
      if (!moved) return prev;
      next.push(moved);
      return next;
    });
    setDragFromIndex(null);
    setSaveNotice(null);
    setSaveError(null);
  }, [canEditSessions, dragFromIndex]);

  const savePlan = useCallback(async () => {
    if (!selectedSessionId) return;
    if (!canEditSessions) {
      setSaveNotice(null);
      setSaveError("Editor access is required to save session plans.");
      return;
    }
    if (planItems.length === 0) {
      setSaveError(null);
      setSaveNotice("Nothing to save.");
      return;
    }
    if (hasDuplicatePlanItems) {
      setSaveNotice(null);
      setSaveError("That episode+script is already in the session plan.");
      return;
    }
    setSaveBusy(true);
    setSaveError(null);
    setSaveNotice(null);
    try {
      const payload = {
        items: planItems.map((item) => ({
          episode_id: item.episode_id,
          script_path: item.script_path,
        })),
      };
      const data = await tongsApiRequest<{ items: RecordingSessionItem[] }>(
        `/tongs/recording-sessions/${encodeURIComponent(selectedSessionId)}/items`,
        {
          method: "PUT",
          body: JSON.stringify(payload),
        },
      );
      const persisted = toPlannerItems(data.items ?? []);
      setPlanItems(persisted);
      setSavedPlanSignature(itemSignature(persisted));
      setSaveNotice(`Saved ${persisted.length} item${persisted.length === 1 ? "" : "s"}.`);
      await loadSessions(selectedSessionId);
    } catch (error: unknown) {
      const message = readErrorMessage(error, "Failed saving session plan.");
      setSaveError(
        message.toLowerCase().includes("duplicate")
          ? "That episode+script is already in the session plan."
          : message,
      );
    } finally {
      setSaveBusy(false);
    }
  }, [selectedSessionId, canEditSessions, planItems, hasDuplicatePlanItems, loadSessions]);

  const createSession = useCallback(async () => {
    if (!workspaceId) return;
    if (!canEditSessions) {
      setCreateError("Editor access is required to create sessions.");
      return;
    }
    setCreateBusy(true);
    setCreateError(null);
    try {
      const payload = {
        workspace_id: workspaceId,
        title: createTitle.trim() || "Recording Session",
      };
      const row = await tongsApiRequest<RecordingSessionSummary>("/tongs/recording-sessions", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setCreateOpen(false);
      setCreateTitle("Recording Session");
      await loadSessions(row.id);
      setSelectedSessionId(row.id);
      if (isMobile) {
        setMobileDetailOpen(true);
      }
    } catch (error: unknown) {
      setCreateError(readErrorMessage(error, "Failed creating recording session."));
    } finally {
      setCreateBusy(false);
    }
  }, [workspaceId, canEditSessions, createTitle, loadSessions, isMobile]);

  const deleteSession = useCallback(async (entry: RecordingSessionSummary) => {
    if (!workspaceId || !session || !canDeleteSessions) {
      setDeleteError("Admin access is required to delete sessions.");
      return;
    }
    const label = entry.title?.trim() || "Recording Session";
    const confirmed = window.confirm(`Delete recording session "${label}"? This cannot be undone.`);
    if (!confirmed) return;

    setDeleteBusyId(entry.id);
    setDeleteError(null);
    setSaveNotice(null);
    setSaveError(null);

    try {
      await tongsApiRequest<{ deleted: boolean; session_id: string }>(
        `/tongs/recording-sessions/${encodeURIComponent(entry.id)}`,
        { method: "DELETE" },
      );

      const remaining = sessions.filter((row) => row.id !== entry.id);
      const preferredId = selectedSessionId === entry.id
        ? (remaining[0]?.id ?? null)
        : selectedSessionId;

      if (selectedSessionId === entry.id) {
        setSessionDetail(null);
        setPlanItems([]);
        setSavedPlanSignature("");
        setDetailError(null);
        setMobileDetailOpen(false);
      }

      setSelectedSessionId(preferredId);
      await loadSessions(preferredId);
      setSaveNotice(`Deleted session "${label}".`);
    } catch (error: unknown) {
      setDeleteError(readErrorMessage(error, "Failed deleting recording session."));
    } finally {
      setDeleteBusyId(null);
    }
  }, [workspaceId, session, canDeleteSessions, sessions, selectedSessionId, loadSessions]);

  if (!workspaceId) {
    return <WorkspaceRequiredNotice toolName="Tongs Recording Sessions" />;
  }

  const selectedSessionSummary = sessions.find((entry) => entry.id === selectedSessionId) ?? null;
  const selectedSessionTitle = sessionDetail?.title || selectedSessionSummary?.title || "Session Plan";
  const saveDisabled = !canEditSessions
    || !selectedSessionId
    || saveBusy
    || !isDirty
    || planItems.length === 0
    || hasDuplicatePlanItems;

  const detailBody = (
    <>
      <div className="trs-detail__meta">
        {selectedSessionId ? `Session ID: ${selectedSessionId}` : "Select a session to edit the plan."}
      </div>
      {detailLoading ? <div className="trs-message trs-message--subtle">Loading session plan...</div> : null}
      {detailError ? <div className="trs-message trs-message--error">{detailError}</div> : null}
      {selectedSessionId && planItems.length === 0 ? (
        <div className="trs-message trs-message--subtle">Nothing to save.</div>
      ) : null}
      {hasDuplicatePlanItems ? (
        <div className="trs-message trs-message--warning">
          Duplicate entry detected. Remove duplicate episode/script before saving.
        </div>
      ) : null}
      {!canEditSessions ? (
        <div className="trs-message trs-message--warning">Viewer access is read-only for session planning.</div>
      ) : null}
      {saveError ? <div className="trs-message trs-message--error">{saveError}</div> : null}
      {saveNotice ? <div className="trs-message trs-message--success">{saveNotice}</div> : null}

      <div className="trs-detail-grid">
        <section className="trs-subcard">
          <div className="trs-subcard__head">
            <div className="trs-subcard__title">Ready Candidates</div>
            <span className="trs-count-pill">{readyCandidatesForDisplay.length}</span>
          </div>
          {readyLoading ? <div className="trs-message trs-message--subtle">Loading ready candidates...</div> : null}
          {readyError ? <div className="trs-message trs-message--error">{readyError}</div> : null}
          {readyDeleteError ? <div className="trs-message trs-message--error">{readyDeleteError}</div> : null}
          {readyCandidatesForDisplay.length === 0 ? (
            <div className="trs-message trs-message--subtle">No ready scripts.</div>
          ) : (
            <ul className="trs-list-reset trs-ready-list">
              {readyCandidatesForDisplay.map((candidate) => {
                const alreadyInPlan = planEpisodeIdSet.has(candidate.workpiece_id);
                const candidateKey = `${candidate.workpiece_id}::${candidate.primary_script_path}`;
                const deletingCandidate = readyDeleteBusyKey === candidateKey;
                return (
                  <li
                    key={`${candidate.workpiece_id}:${candidate.primary_script_path}`}
                    className="trs-ready-item"
                  >
                    <div className="trs-ready-item__title">{candidate.title}</div>
                    <div className="trs-ready-item__path">{candidate.primary_script_path}</div>
                    <div className="trs-ready-attribution">{formatReadyAttribution(candidate)}</div>
                    <div className="trs-ready-item__footer">
                      <span className="trs-ready-item__updated">{formatDateTime(candidate.updated_at)}</span>
                      <div className="trs-ready-item__actions">
                        <button
                          type="button"
                          onClick={() => addCandidate(candidate)}
                          disabled={!canEditSessions || !selectedSessionId || alreadyInPlan || deletingCandidate}
                          title={alreadyInPlan ? "Already in session plan" : undefined}
                        >
                          {alreadyInPlan ? "Added" : "Add"}
                        </button>
                        {canEditSessions ? (
                          <button
                            type="button"
                            className="trs-button-danger-subtle"
                            onClick={() => void deleteReadyCandidate(candidate)}
                            disabled={deletingCandidate}
                          >
                            {deletingCandidate ? "Deleting..." : "Delete"}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="trs-subcard">
          <div className="trs-subcard__head">
            <div className="trs-subcard__title">Session Plan</div>
            <span className="trs-count-pill">{planItems.length}</span>
          </div>
          {stalePlanItemCount > 0 ? (
            <div className="trs-message trs-message--warning">
              {stalePlanItemCount} plan item{stalePlanItemCount === 1 ? "" : "s"} no longer in Ready.
            </div>
          ) : null}
          {!selectedSessionId ? (
            <div className="trs-message trs-message--subtle">Select a session to build an ordered plan.</div>
          ) : planItems.length === 0 ? (
            <div className="trs-message trs-message--subtle">No items yet. Add from ready candidates.</div>
          ) : (
            <>
              <ul className="trs-list-reset trs-plan-list">
                {planItems.map((item, index) => {
                  const key = plannerKey(item);
                  const candidate = candidateByPlannerKey.get(key);
                  const title = candidate?.title ?? `Episode ${item.episode_id.slice(0, 8)}`;
                  const duplicateEntry = duplicatePlanKeys.has(key);
                  const classNames = [
                    "trs-plan-item",
                    duplicateEntry ? "trs-plan-item--duplicate" : "",
                    dragFromIndex === index ? "trs-plan-item--dragging" : "",
                  ].filter(Boolean).join(" ");

                  return (
                    <li
                      key={`${key}:${index}`}
                      className={classNames}
                      draggable={canEditSessions && !isMobile}
                      onDragStart={() => {
                        if (!canEditSessions || isMobile) return;
                        setDragFromIndex(index);
                      }}
                      onDragEnd={() => setDragFromIndex(null)}
                      onDragOver={(event) => {
                        if (!canEditSessions || isMobile) return;
                        event.preventDefault();
                      }}
                      onDrop={(event) => {
                        if (!canEditSessions || isMobile) return;
                        event.preventDefault();
                        dropAtIndex(index);
                      }}
                    >
                      <div className="trs-plan-item__position">Position {index + 1}</div>
                      <div className="trs-plan-item__title">{title}</div>
                      <div className="trs-plan-item__path">{item.script_path}</div>
                      <div className="trs-ready-attribution">{formatReadyAttribution(candidate)}</div>
                      {!candidate ? (
                        <div className="trs-message trs-message--warning trs-plan-item__stale">
                          No longer in active Ready candidates. Restore or re-ready in Hearth before recording.
                        </div>
                      ) : null}
                      {duplicateEntry ? (
                        <div className="trs-message trs-message--warning">Duplicate entry</div>
                      ) : null}
                      {canEditSessions ? (
                        <div className="trs-plan-item__actions">
                          <button
                            type="button"
                            onClick={() => movePlanItem(index, -1)}
                            disabled={index === 0}
                          >
                            Up
                          </button>
                          <button
                            type="button"
                            onClick={() => movePlanItem(index, 1)}
                            disabled={index === planItems.length - 1}
                          >
                            Down
                          </button>
                          <button type="button" onClick={() => removePlanItem(index)}>Remove</button>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
              {canEditSessions && !isMobile && planItems.length > 1 ? (
                <div
                  className="trs-plan-dropzone"
                  onDragOver={(event) => {
                    event.preventDefault();
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    moveToEnd();
                  }}
                >
                  Drop here to move to end
                </div>
              ) : null}
            </>
          )}
        </section>
      </div>
    </>
  );

  return (
    <div className={`trs${isMobile ? " trs--mobile" : ""}`}>
      <header className="trs-header">
        <div className="trs-header__title-wrap">
          <h2 className="trs-header__title">Recording Sessions</h2>
          <p className="trs-header__subtitle">Build deterministic session plans from ready scripts.</p>
        </div>
        <div className="trs-header__actions">
          <span className="trs-role">Your role: {workspaceRoleLabel(workspaceRole)}</span>
          <button
            type="button"
            onClick={() => setCreateOpen((prev) => !prev)}
            disabled={!canEditSessions}
            title={!canEditSessions ? "Editor access required" : undefined}
          >
            {createOpen ? "Close" : "Create Session"}
          </button>
          <button
            type="button"
            onClick={() => {
              void loadSessions();
              void loadReadyCandidates();
            }}
            disabled={sessionsLoading || readyLoading}
          >
            Refresh
          </button>
        </div>
      </header>

      {!canReadSessions ? (
        <section className="trs-card">
          <div className="trs-message trs-message--warning">
            You do not have workspace access to view recording sessions.
          </div>
        </section>
      ) : null}

      {createOpen ? (
        <section className="trs-card trs-create">
          <div className="trs-card__title">Create Session</div>
          <label className="trs-field">
            <span className="trs-field__label">Title</span>
            <input
              value={createTitle}
              onChange={(event) => setCreateTitle(event.target.value)}
              placeholder="Recording Session"
              disabled={!canEditSessions}
            />
          </label>
          {createError ? <div className="trs-message trs-message--error">{createError}</div> : null}
          <div className="trs-create__actions">
            <button
              type="button"
              onClick={() => {
                setCreateOpen(false);
                setCreateError(null);
              }}
              disabled={createBusy}
            >
              Cancel
            </button>
            <button type="button" onClick={() => void createSession()} disabled={!canEditSessions || createBusy}>
              {createBusy ? "Creating..." : "Create"}
            </button>
          </div>
        </section>
      ) : null}

      <section className="trs-card">
        <div className="trs-card__header">
          <div className="trs-subcard__head">
            <div className="trs-card__title">Sessions</div>
            <span className="trs-count-pill">{sessions.length}</span>
          </div>
          {sessionsLoading ? <span className="trs-message trs-message--subtle">Loading...</span> : null}
        </div>
        {sessionsError ? <div className="trs-message trs-message--error">{sessionsError}</div> : null}
        {deleteError ? <div className="trs-message trs-message--error">{deleteError}</div> : null}
        {sessions.length === 0 ? (
          <div className="trs-message trs-message--subtle">No sessions yet.</div>
        ) : (
          <div className="trs-sessions-list">
            {sessions.map((entry) => {
              const active = entry.id === selectedSessionId;
              const deletingThis = deleteBusyId === entry.id;
              return (
                <div key={entry.id} className="trs-session-row">
                  <button
                    type="button"
                    className={`trs-session-row__select${active ? " trs-session-row__select--active" : ""}`}
                    onClick={() => openSession(entry.id)}
                  >
                    <div className="trs-session-row__title">{entry.title || "Recording Session"}</div>
                    <div className="trs-session-row__date">
                      {formatDateTime(entry.created_at ?? entry.updated_at ?? null)}
                    </div>
                  </button>
                  {canDeleteSessions ? (
                    <button
                      type="button"
                      className="trs-session-row__delete trs-session-row__delete--quiet"
                      onClick={() => void deleteSession(entry)}
                      disabled={deletingThis}
                      aria-label={`Delete session ${entry.title || "Recording Session"}`}
                    >
                      {deletingThis ? "Deleting..." : "Delete"}
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {!isMobile ? (
        <section className="trs-card">
          <div className="trs-detail-header">
            <div className="trs-detail-header__left">
              <div className="trs-card__title">{selectedSessionTitle}</div>
              {isDirty ? <span className="trs-dirty-pill">Unsaved changes</span> : null}
            </div>
            {canEditSessions ? (
              <button type="button" onClick={() => void savePlan()} disabled={saveDisabled}>
                {saveBusy ? "Saving..." : "Save Plan"}
              </button>
            ) : null}
          </div>
          {detailBody}
        </section>
      ) : null}

      {isMobile && mobileDetailOpen ? (
        <div className="trs-mobile-overlay">
          <MobilePage
            title={selectedSessionTitle}
            onBack={() => setMobileDetailOpen(false)}
            rightAction={
              canDeleteSessions && selectedSessionSummary ? (
                <button
                  type="button"
                  onClick={() => {
                    void deleteSession(selectedSessionSummary);
                  }}
                  disabled={deleteBusyId === selectedSessionSummary.id}
                >
                  {deleteBusyId === selectedSessionSummary.id ? "Deleting..." : "Delete"}
                </button>
              ) : null
            }
            bottomBar={
              canEditSessions ? (
                <div className="trs-mobile-actions">
                  <button type="button" onClick={() => void savePlan()} disabled={saveDisabled}>
                    {saveBusy ? "Saving..." : "Save Plan"}
                  </button>
                </div>
              ) : null
            }
          >
            <div className="trs-mobile-detail-body">{detailBody}</div>
          </MobilePage>
        </div>
      ) : null}
    </div>
  );
}
