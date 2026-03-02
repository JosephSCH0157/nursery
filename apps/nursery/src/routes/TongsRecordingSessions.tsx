import { useCallback, useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import type { AppShellContext } from "./AppShell";
import WorkspaceRequiredNotice from "./WorkspaceRequiredNotice";
import { tongsApiRequest } from "../lib/tongs-api";

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
};

type SessionPlannerItem = {
  episode_id: string;
  script_path: string;
};

function readErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
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

  const [sessions, setSessions] = useState<RecordingSessionSummary[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  const [sessionDetail, setSessionDetail] = useState<RecordingSessionDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const [readyCandidates, setReadyCandidates] = useState<ReadyScriptCandidate[]>([]);
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

  const candidateByPlannerKey = useMemo(() => {
    const out = new Map<string, ReadyScriptCandidate>();
    for (const candidate of readyCandidates) {
      for (const path of candidate.script_paths) {
        out.set(`${candidate.workpiece_id}::${path}`, candidate);
      }
      out.set(`${candidate.workpiece_id}::${candidate.primary_script_path}`, candidate);
    }
    return out;
  }, [readyCandidates]);

  const loadSessions = useCallback(async (preferredId?: string | null) => {
    if (!workspaceId || !session) {
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
  }, [workspaceId, session]);

  const loadReadyCandidates = useCallback(async () => {
    if (!workspaceId || !session) {
      setReadyCandidates([]);
      return;
    }
    setReadyLoading(true);
    setReadyError(null);
    try {
      const data = await tongsApiRequest<{ scripts: ReadyScriptCandidate[] }>(
        `/tongs/workspaces/${encodeURIComponent(workspaceId)}/ready-scripts?unrecorded=1`,
        { method: "GET" },
      );
      setReadyCandidates(Array.isArray(data.scripts) ? data.scripts : []);
    } catch (error: unknown) {
      setReadyError(readErrorMessage(error, "Failed loading ready candidates."));
    } finally {
      setReadyLoading(false);
    }
  }, [workspaceId, session]);

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
    if (!workspaceId || !session) {
      setSessions([]);
      setSelectedSessionId(null);
      setSessionDetail(null);
      setPlanItems([]);
      setSavedPlanSignature("");
      setReadyCandidates([]);
      return;
    }
    void loadSessions();
    void loadReadyCandidates();
  }, [workspaceId, session, loadReadyCandidates, loadSessions]);

  useEffect(() => {
    if (!selectedSessionId) {
      setSessionDetail(null);
      setPlanItems([]);
      setSavedPlanSignature("");
      return;
    }
    void loadSessionDetail(selectedSessionId);
  }, [selectedSessionId, loadSessionDetail]);

  const addCandidate = useCallback((candidate: ReadyScriptCandidate) => {
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
  }, [planEpisodeIdSet]);

  const deleteReadyCandidate = useCallback(async (candidate: ReadyScriptCandidate) => {
    if (!session) return;
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
      await tongsApiRequest<{ deleted: boolean; workpiece_id: string; path: string }>(
        `/tongs/workpieces/${encodeURIComponent(candidate.workpiece_id)}/ready-script?path=${encodeURIComponent(path)}`,
        { method: "DELETE" },
      );
      await loadReadyCandidates();
      setSaveNotice(`Deleted ready script "${label}".`);
    } catch (error: unknown) {
      setReadyDeleteError(readErrorMessage(error, "Failed deleting ready script."));
    } finally {
      setReadyDeleteBusyKey(null);
    }
  }, [session, loadReadyCandidates]);

  const removePlanItem = useCallback((index: number) => {
    setPlanItems((prev) => prev.filter((_, itemIndex) => itemIndex !== index));
    setSaveNotice(null);
    setSaveError(null);
  }, []);

  const dropAtIndex = useCallback((toIndex: number) => {
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
  }, [dragFromIndex]);

  const moveToEnd = useCallback(() => {
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
  }, [dragFromIndex]);

  const savePlan = useCallback(async () => {
    if (!selectedSessionId) return;
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
  }, [selectedSessionId, planItems, hasDuplicatePlanItems, loadSessions]);

  const createSession = useCallback(async () => {
    if (!workspaceId) return;
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
    } catch (error: unknown) {
      setCreateError(readErrorMessage(error, "Failed creating recording session."));
    } finally {
      setCreateBusy(false);
    }
  }, [workspaceId, createTitle, loadSessions]);

  const deleteSession = useCallback(async (entry: RecordingSessionSummary) => {
    if (!workspaceId || !session) return;
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
      }

      setSelectedSessionId(preferredId);
      await loadSessions(preferredId);
      setSaveNotice(`Deleted session "${label}".`);
    } catch (error: unknown) {
      setDeleteError(readErrorMessage(error, "Failed deleting recording session."));
    } finally {
      setDeleteBusyId(null);
    }
  }, [workspaceId, session, sessions, selectedSessionId, loadSessions]);

  if (!workspaceId) {
    return <WorkspaceRequiredNotice toolName="Tongs Recording Sessions" />;
  }

  return (
    <div style={{ padding: 8, maxWidth: 1200, display: "grid", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: 0 }}>Recording Sessions</h2>
          <p style={{ marginTop: 6, opacity: 0.72 }}>
            Build deterministic session plans from Ready scripts.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button type="button" onClick={() => setCreateOpen((prev) => !prev)}>
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
      </div>

      {createOpen ? (
        <div
          style={{
            border: "1px solid rgba(255,255,255,0.15)",
            borderRadius: 10,
            padding: 12,
            display: "grid",
            gap: 10,
            maxWidth: 520,
          }}
        >
          <div style={{ fontWeight: 700 }}>Create Session</div>
          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: 12, opacity: 0.75 }}>Title</span>
            <input
              value={createTitle}
              onChange={(event) => setCreateTitle(event.target.value)}
              placeholder="Recording Session"
            />
          </label>
          {createError ? <div style={{ color: "#ffb3b3", fontSize: 13 }}>{createError}</div> : null}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
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
            <button type="button" onClick={() => void createSession()} disabled={createBusy}>
              {createBusy ? "Creating..." : "Create"}
            </button>
          </div>
        </div>
      ) : null}

      <div
        style={{
          border: "1px solid rgba(255,255,255,0.15)",
          borderRadius: 12,
          padding: 12,
          background: "rgba(255,255,255,0.04)",
          display: "grid",
          gap: 10,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
          <div style={{ fontWeight: 700 }}>Sessions</div>
          {sessionsLoading ? <span style={{ fontSize: 12, opacity: 0.72 }}>Loading...</span> : null}
        </div>
        {sessionsError ? <div style={{ color: "#ffb3b3", fontSize: 13 }}>{sessionsError}</div> : null}
        {deleteError ? <div style={{ color: "#ffb3b3", fontSize: 13 }}>{deleteError}</div> : null}
        {sessions.length === 0 ? (
          <div style={{ fontSize: 13, opacity: 0.7 }}>No sessions yet.</div>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {sessions.map((entry) => {
              const active = entry.id === selectedSessionId;
              const deletingThis = deleteBusyId === entry.id;
              return (
                <div
                  key={entry.id}
                  style={{
                    display: "flex",
                    gap: 8,
                    alignItems: "stretch",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedSessionId(entry.id)}
                    style={{
                      textAlign: "left",
                      borderRadius: 8,
                      border: active ? "1px solid rgba(255,255,255,0.55)" : "1px solid rgba(255,255,255,0.14)",
                      background: active ? "rgba(255,255,255,0.14)" : "rgba(0,0,0,0.18)",
                      color: "inherit",
                      padding: "8px 10px",
                      flex: 1,
                    }}
                  >
                    <div style={{ fontWeight: 700 }}>{entry.title || "Recording Session"}</div>
                    <div style={{ fontSize: 12, opacity: 0.72 }}>
                      {formatDateTime(entry.created_at ?? entry.updated_at ?? null)}
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => void deleteSession(entry)}
                    disabled={deletingThis}
                    style={{
                      borderRadius: 8,
                      border: "1px solid rgba(255,120,120,0.45)",
                      background: "rgba(120,0,0,0.28)",
                      color: "inherit",
                      padding: "8px 10px",
                      minWidth: 88,
                    }}
                  >
                    {deletingThis ? "Deleting..." : "Delete"}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div
        style={{
          border: "1px solid rgba(255,255,255,0.15)",
          borderRadius: 12,
          padding: 12,
          background: "rgba(255,255,255,0.04)",
          display: "grid",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontWeight: 700 }}>
              {sessionDetail?.title ?? "Session Plan"}
            </div>
            <div style={{ fontSize: 12, opacity: 0.72 }}>
              {selectedSessionId ? `Session ID: ${selectedSessionId}` : "Select a session to edit the plan."}
            </div>
          </div>
          <button
            type="button"
            onClick={() => void savePlan()}
            disabled={!selectedSessionId || saveBusy || !isDirty || planItems.length === 0 || hasDuplicatePlanItems}
          >
            {saveBusy ? "Saving..." : "Save Plan"}
          </button>
        </div>
        {detailLoading ? <div style={{ fontSize: 12, opacity: 0.72 }}>Loading session plan...</div> : null}
        {detailError ? <div style={{ color: "#ffb3b3", fontSize: 13 }}>{detailError}</div> : null}
        {selectedSessionId && planItems.length === 0 ? <div style={{ fontSize: 12, opacity: 0.72 }}>Nothing to save.</div> : null}
        {hasDuplicatePlanItems ? (
          <div style={{ color: "#ffd599", fontSize: 13 }}>
            Duplicate entry detected. Remove duplicate episode/script before saving.
          </div>
        ) : null}
        {saveError ? <div style={{ color: "#ffb3b3", fontSize: 13 }}>{saveError}</div> : null}
        {saveNotice ? <div style={{ color: "#b3f4c8", fontSize: 13 }}>{saveNotice}</div> : null}

        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
          <section
            style={{
              border: "1px solid rgba(255,255,255,0.14)",
              borderRadius: 10,
              padding: 10,
              background: "rgba(0,0,0,0.2)",
              display: "grid",
              gap: 10,
              alignContent: "start",
            }}
          >
            <div style={{ fontWeight: 700 }}>Ready Candidates</div>
            {readyLoading ? <div style={{ fontSize: 12, opacity: 0.72 }}>Loading ready candidates...</div> : null}
            {readyError ? <div style={{ color: "#ffb3b3", fontSize: 13 }}>{readyError}</div> : null}
            {readyDeleteError ? <div style={{ color: "#ffb3b3", fontSize: 13 }}>{readyDeleteError}</div> : null}
            {readyCandidates.length === 0 ? (
              <div style={{ fontSize: 13, opacity: 0.7 }}>No ready scripts.</div>
            ) : (
              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
                {readyCandidates.map((candidate) => {
                  const alreadyInPlan = planEpisodeIdSet.has(candidate.workpiece_id);
                  const candidateKey = `${candidate.workpiece_id}::${candidate.primary_script_path}`;
                  const deletingCandidate = readyDeleteBusyKey === candidateKey;
                  return (
                    <li
                      key={`${candidate.workpiece_id}:${candidate.primary_script_path}`}
                      style={{
                        border: "1px solid rgba(255,255,255,0.14)",
                        borderRadius: 8,
                        padding: "8px 10px",
                        display: "grid",
                        gap: 6,
                      }}
                    >
                      <div style={{ fontWeight: 700 }}>{candidate.title}</div>
                      <div style={{ fontSize: 12, opacity: 0.7 }}>{candidate.primary_script_path}</div>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                        <span style={{ fontSize: 12, opacity: 0.66 }}>
                          {formatDateTime(candidate.updated_at)}
                        </span>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button
                            type="button"
                            onClick={() => addCandidate(candidate)}
                            disabled={!selectedSessionId || alreadyInPlan || deletingCandidate}
                            title={alreadyInPlan ? "Already in session plan" : undefined}
                          >
                            {alreadyInPlan ? "Added" : "Add"}
                          </button>
                          <button
                            type="button"
                            onClick={() => void deleteReadyCandidate(candidate)}
                            disabled={deletingCandidate}
                          >
                            {deletingCandidate ? "Deleting..." : "Delete"}
                          </button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section
            style={{
              border: "1px solid rgba(255,255,255,0.14)",
              borderRadius: 10,
              padding: 10,
              background: "rgba(0,0,0,0.2)",
              display: "grid",
              gap: 10,
              alignContent: "start",
            }}
          >
            <div style={{ fontWeight: 700 }}>Session Plan</div>
            {!selectedSessionId ? (
              <div style={{ fontSize: 13, opacity: 0.7 }}>Select a session to build an ordered plan.</div>
            ) : planItems.length === 0 ? (
              <div style={{ fontSize: 13, opacity: 0.7 }}>No items yet. Add from Ready candidates.</div>
            ) : (
              <>
                <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
                  {planItems.map((item, index) => {
                    const candidate = candidateByPlannerKey.get(plannerKey(item));
                    const title = candidate?.title ?? `Episode ${item.episode_id.slice(0, 8)}`;
                    const duplicateEntry = duplicatePlanKeys.has(plannerKey(item));
                    return (
                      <li
                        key={plannerKey(item)}
                        draggable
                        onDragStart={() => setDragFromIndex(index)}
                        onDragEnd={() => setDragFromIndex(null)}
                        onDragOver={(event) => {
                          event.preventDefault();
                        }}
                        onDrop={(event) => {
                          event.preventDefault();
                          dropAtIndex(index);
                        }}
                        style={{
                          border: duplicateEntry ? "1px solid rgba(255,160,120,0.8)" : "1px solid rgba(255,255,255,0.14)",
                          borderRadius: 8,
                          padding: "8px 10px",
                          display: "grid",
                          gap: 6,
                          background: dragFromIndex === index ? "rgba(255,255,255,0.16)" : "transparent",
                          cursor: "grab",
                        }}
                      >
                        <div style={{ fontSize: 12, opacity: 0.75 }}>Position {index + 1}</div>
                        <div style={{ fontWeight: 700 }}>{title}</div>
                        <div style={{ fontSize: 12, opacity: 0.72 }}>{item.script_path}</div>
                        {duplicateEntry ? <div style={{ fontSize: 12, color: "#ffd599" }}>Duplicate entry</div> : null}
                        <div style={{ display: "flex", justifyContent: "flex-end" }}>
                          <button type="button" onClick={() => removePlanItem(index)}>Remove</button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
                <div
                  onDragOver={(event) => {
                    event.preventDefault();
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    moveToEnd();
                  }}
                  style={{
                    border: "1px dashed rgba(255,255,255,0.3)",
                    borderRadius: 8,
                    padding: "8px 10px",
                    fontSize: 12,
                    opacity: 0.72,
                    textAlign: "center",
                  }}
                >
                  Drop here to move to end
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
