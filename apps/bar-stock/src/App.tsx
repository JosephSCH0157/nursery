import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./index.css";

import type { Assignment, AssignmentId, Spark, SparkStatus } from "./lib/model";
import { makeSpark, now } from "./lib/model";

import { loadSparks, removeSpark, saveSparks, upsertSpark } from "./lib/store";
import {
  buildAssignmentNameFromSpark,
  loadAssignments,
  makeAssignment,
  makeAssignmentFromSpark,
  saveAssignments,
  upsertAssignment
} from "./lib/assignments";

import { extractTags, normalizeTag, querySparks, type SparkQuery } from "./lib/query";
import { copyText } from "./lib/clip";
import { buildExportPayload, downloadJson, mergeSparks, parseImportJson } from "./lib/io";
import { compactOutbox, drainOutbox, loadOutbox, peekOutbox, pushOutbox, saveOutbox } from "./lib/outbox";
import { buildHearthPacket, packetToClipboardText } from "./lib/hearth-packet";
import { supabase, supabaseAvailable } from "./lib/supabase";
import { listMyWorkspaces, type Workspace } from "./lib/tongs-api";
import type { Session as SupabaseSession } from "@supabase/supabase-js";
import { flushOutboxToTongs, checkTongsOnline } from "./lib/tongs-sync";

type AssignmentFilter = "all" | AssignmentId;

const STANDALONE = import.meta.env.VITE_BARSTOCK_STANDALONE === "true";

const ACTIVE_WORKSPACE_KEY = "forge_workspace_id_v1";
const LEGACY_WORKSPACE_KEY = "barstock_workspace_id";

function loadStoredWorkspaceId(): string | null {
  return localStorage.getItem(ACTIVE_WORKSPACE_KEY)
    ?? localStorage.getItem(LEGACY_WORKSPACE_KEY);
}

function saveStoredWorkspaceId(id: string | null) {
  if (id) {
    localStorage.setItem(ACTIVE_WORKSPACE_KEY, id);
    localStorage.setItem(LEGACY_WORKSPACE_KEY, id);
    return;
  }
  localStorage.removeItem(ACTIVE_WORKSPACE_KEY);
  localStorage.removeItem(LEGACY_WORKSPACE_KEY);
}

type WorkspaceState = {
  workspaces: Workspace[];
  workspaceId: string | null;
  onWorkspaceChange: (id: string | null) => void;
};

type BarstockAppProps = {
  workspaceState?: WorkspaceState;
  showWorkspacePicker?: boolean;
};

export default function App(props: BarstockAppProps = {}) {
  const [body, setBody] = useState("");
  const [sparks, setSparks] = useState<Spark[]>(() => loadSparks());

  const [assignments, setAssignments] = useState<Assignment[]>(() => loadAssignments());
  const [activeAssignment, setActiveAssignment] = useState<AssignmentFilter>("all");
  const [newAssignmentName, setNewAssignmentName] = useState("");
  const [session, setSession] = useState<SupabaseSession | null>(null);
  const [email, setEmail] = useState("");
  const hasExternalWorkspaceState = !!props.workspaceState;
  const externalWorkspaces = props.workspaceState?.workspaces;
  const externalWorkspaceId = props.workspaceState?.workspaceId;
  const externalWorkspaceChange = props.workspaceState?.onWorkspaceChange;
  const showWorkspacePicker = props.showWorkspacePicker ?? !hasExternalWorkspaceState;

  const [workspaces, setWorkspaces] = useState<Workspace[]>(
    () => externalWorkspaces ?? [],
  );
  const [workspaceId, setWorkspaceId] = useState<string | null>(
    () => (hasExternalWorkspaceState ? (externalWorkspaceId ?? null) : loadStoredWorkspaceId()),
  );

  const [q, setQ] = useState<SparkQuery>({ status: "all", pinned: "all" });
  const [tongsStatus, setTongsStatus] = useState<"offline" | "online">("offline");
  const [outboxCount, setOutboxCount] = useState(() => loadOutbox().length);
  const [syncing, setSyncing] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingBody, setEditingBody] = useState("");
  const [toast, setToast] = useState<string | null>(null);

  const importRef = useRef<HTMLInputElement | null>(null);

  function popToast(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(null), 1200);
  }

  function enqueue(op: any) {
    pushOutbox(op);
    const items = compactOutbox(loadOutbox());
    saveOutbox(items);
    setOutboxCount(items.length);
  }

  function normalizeAssignmentsState(inputSparks: Spark[], inputAssignments: Assignment[]) {
    const assignmentById = new Map(inputAssignments.map(a => [a.id, a]));
    const nextAssignments = inputAssignments.slice();
    const updatedAssignments: Assignment[] = [];
    const updatedSparks: Spark[] = [];

    const legacyKey = "session" + "Id";

    const nextSparks = inputSparks.map((s) => {
      const legacyId = (s as any)[legacyKey] as string | undefined;
      let assignmentId = s.assignmentId ?? legacyId;

      if (!assignmentId) {
        const createdAt = s.createdAt ?? now();
        const assignment = makeAssignmentFromSpark(s.body, createdAt);
        assignmentId = assignment.id;
        nextAssignments.push(assignment);
        assignmentById.set(assignmentId, assignment);
        updatedAssignments.push(assignment);
      } else if (!assignmentById.has(assignmentId)) {
        const createdAt = s.createdAt ?? now();
        const name = buildAssignmentNameFromSpark(s.body, createdAt);
        const assignment = makeAssignment(name, { id: assignmentId, createdAt, updatedAt: createdAt });
        nextAssignments.push(assignment);
        assignmentById.set(assignmentId, assignment);
        updatedAssignments.push(assignment);
      }

      if (s.assignmentId !== assignmentId || legacyId) {
        const next = { ...s, assignmentId };
        updatedSparks.push(next);
        return next;
      }
      return s;
    });

    return { sparks: nextSparks, assignments: nextAssignments, updatedSparks, updatedAssignments };
  }

  useEffect(() => {
    const res = normalizeAssignmentsState(sparks, assignments);
    if (res.updatedAssignments.length === 0 && res.updatedSparks.length === 0) return;

    setAssignments(res.assignments);
    setSparks(res.sparks);

    const ts = now();
    for (const a of res.updatedAssignments) {
      enqueue({ op: "upsert_assignment", at: ts, assignment: a });
    }
    for (const s of res.updatedSparks) {
      enqueue({ op: "upsert_spark", at: ts, spark: s });
    }
  }, []);

  const onSyncNow = useCallback(async () => {
    if (!supabaseAvailable) return popToast("Cloud sync unavailable.");
    if (!session) return popToast("Sign in first.");
    if (!workspaceId) return popToast("Pick a workspace first.");

    const ops = peekOutbox();
    if (!ops.length) return popToast("Nothing to sync.");

    try {
      setSyncing(true);

      const res = await flushOutboxToTongs({
        workspaceId,
        userId: session.user.id,
        ops
      });

      if (res.errors.length) {
        console.error(res.errors);
        popToast(`Sync had issues: ${res.errors[0]}`);
        return;
      }

      drainOutbox();
      setOutboxCount(0);
      popToast(`Synced ${res.sent} item(s).`);
    } catch (e: any) {
      console.error(e);
      popToast(`Sync failed: ${e?.message ?? "Unknown error"}`);
    } finally {
      setSyncing(false);
    }
  }, [session, workspaceId, supabaseAvailable]);

  useEffect(() => {
    if (!supabaseAvailable) return;
    if (tongsStatus !== "online") return;
    if (outboxCount === 0) return;
    onSyncNow();
  }, [supabaseAvailable, tongsStatus, outboxCount, onSyncNow]);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_evt, s) => setSession(s));
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!hasExternalWorkspaceState) return;
    setWorkspaces(externalWorkspaces ?? []);
  }, [hasExternalWorkspaceState, externalWorkspaces]);

  useEffect(() => {
    if (!hasExternalWorkspaceState) return;
    setWorkspaceId(externalWorkspaceId ?? null);
  }, [hasExternalWorkspaceState, externalWorkspaceId]);

  useEffect(() => {
    saveSparks(sparks);
  }, [sparks]);

  useEffect(() => {
    saveAssignments(assignments);
  }, [assignments]);

  useEffect(() => {
    if (!supabaseAvailable || !session || !workspaceId) {
      setTongsStatus("offline");
      return;
    }

    let cancelled = false;

    (async () => {
      const online = await checkTongsOnline(workspaceId, { reason: "effect" });
      if (!cancelled) {
        setTongsStatus(online ? "online" : "offline");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [supabaseAvailable, session, workspaceId]);

  useEffect(() => {
    if (hasExternalWorkspaceState) return;
    if (!session) {
      setWorkspaces([]);
      setWorkspaceId(null);
      return;
    }

    (async () => {
      try {
        const ws = await listMyWorkspaces();
        setWorkspaces(ws);
        const saved = loadStoredWorkspaceId();
        const pick = (saved && ws.find(x => x.id === saved)) ? saved : (ws[0]?.id ?? null);
        setWorkspaceId(pick);
        if (pick) saveStoredWorkspaceId(pick);
      } catch (err) {
        console.error(err);
        popToast("Failed loading workspaces");
      }
    })();
  }, [session, hasExternalWorkspaceState]);

  const count = sparks.length;
  const canAdd = useMemo(() => body.trim().length > 0, [body]);
  const syncLabel = !supabaseAvailable ? "LOCAL-ONLY" : tongsStatus.toUpperCase();
  const syncHint = !supabaseAvailable
    ? "Cloud sync unavailable."
    : (tongsStatus === "offline" ? "Offline / local-only." : "Online.");

  const setActiveWorkspace = useCallback((next: string | null) => {
    if (hasExternalWorkspaceState && externalWorkspaceChange) {
      externalWorkspaceChange(next);
      return;
    }
    setWorkspaceId(next);
    saveStoredWorkspaceId(next);
  }, [hasExternalWorkspaceState, externalWorkspaceChange]);

  function navigateToHearthForEpisode(episodeId: string) {
    const normalizedEpisodeId = episodeId.trim();
    if (!normalizedEpisodeId) return;

    const params = new URLSearchParams();
    params.set("workpiece_id", normalizedEpisodeId);
    if (workspaceId) {
      params.set("workspace_id", workspaceId);
    }

    const isNurseryAppRoute = window.location.pathname.startsWith("/app/");
    const targetPath = isNurseryAppRoute ? "/app/hearth" : "/hearth";
    window.location.assign(`${targetPath}?${params.toString()}`);
  }

  function updateSpark(s: Spark, patch: Partial<Spark>) {
    const ts = now();
    const next: Spark = { ...s, ...patch, updatedAt: ts };
    setSparks(prev => upsertSpark(prev, next));
    enqueue({ op: "upsert_spark", at: ts, spark: next });
  }

  function setStatus(s: Spark, status: SparkStatus) {
    updateSpark(s, { status });
  }

  function togglePin(s: Spark) {
    updateSpark(s, { pinned: !s.pinned });
  }

  function deleteSpark(id: string) {
    setSparks(prev => removeSpark(prev, id));
    enqueue({ op: "delete_spark", at: now(), sparkId: id });
  }

  function onTagClick(tag: string) {
    setQ(prev => ({ ...prev, tag: normalizeTag(tag) }));
  }


  function addAssignment() {
    const name = newAssignmentName.trim();
    if (!name) return;
    const a = makeAssignment(name);
    setAssignments(prev => upsertAssignment(prev, a));
    enqueue({ op: "upsert_assignment", at: now(), assignment: a });
    setNewAssignmentName("");
    setActiveAssignment(a.id);
    popToast("Assignment created.");
  }

  function addSpark() {
    if (!canAdd) return;

    const tags = extractTags(body);

    let assignmentId: AssignmentId;
    if (activeAssignment === "all") {
      const assignment = makeAssignmentFromSpark(body, now());
      assignmentId = assignment.id;
      setAssignments(prev => upsertAssignment(prev, assignment));
      enqueue({ op: "upsert_assignment", at: now(), assignment });
    } else {
      assignmentId = activeAssignment;
    }

    const s = makeSpark(body, assignmentId, {
      source: "typed",
      tags
    });

    setSparks(prev => upsertSpark(prev, s));
    enqueue({ op: "upsert_spark", at: now(), spark: s });
    setBody("");
  }

  const filteredByAssignment = useMemo(() => {
    if (activeAssignment === "all") return sparks;
    return sparks.filter(s => s.assignmentId === activeAssignment);
  }, [sparks, activeAssignment]);

  const filtered = useMemo(() => querySparks(filteredByAssignment, q), [filteredByAssignment, q]);

  const sortedAssignments = useMemo(() => {
    // pinned first then alpha
    return [...assignments].sort((a, b) => {
      const ap = a.pinned ? 1 : 0;
      const bp = b.pinned ? 1 : 0;
      if (ap !== bp) return bp - ap;
      return a.name.localeCompare(b.name);
    });
  }, [assignments]);

  async function onImportFile(file: File) {
    const text = await file.text();
    const parsed = parseImportJson(text);

    if (parsed.sparks.length === 0) {
      popToast("Import failed (no sparks found).");
      return;
    }

    const res = mergeSparks(sparks, parsed.sparks);
    setSparks(res.merged);

    const msgParts = [`Imported ${res.imported}`];
    if (res.skipped) msgParts.push(`skipped ${res.skipped}`);
    if (parsed.errors) msgParts.push(`errors ${parsed.errors}`);
    popToast(msgParts.join(", ") + ".");
  }

  const assignmentNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of assignments) m.set(a.id, a.name);
    return m;
  }, [assignments]);

  return (
    <div
      className="barstock-root"
      style={{
        display: "grid",
        gridTemplateColumns: "260px 1fr",
        minHeight: "100vh",
        fontFamily: "system-ui, sans-serif",
        color: "var(--barstock-text)",
        background: "var(--barstock-bg)",
      }}
    >
      {/* Sidebar */}
      <aside
        style={{
          borderRight: "1px solid var(--barstock-border)",
          padding: 14
        }}
      >
        <div style={{ fontWeight: 800, fontSize: 18 }}>Bar-Stock</div>
        <div style={{ opacity: 0.75, marginTop: 6, fontSize: 13 }}>
          {count} sparks • idea mine
        </div>
        {showWorkspacePicker ? (
          <div style={{ marginTop: 12, display: "flex", gap: 10, alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <strong>Bar-Stock</strong>
              {session ? (
                <span style={{ opacity: 0.7 }}>{session.user.email}</span>
              ) : null}
            </div>

            {!supabaseAvailable ? (
              <div style={{ fontSize: 12, opacity: 0.7 }}>Cloud sync unavailable.</div>
            ) : session ? (
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <select
                  value={workspaceId ?? ""}
                  onChange={(e) => {
                    const v = e.target.value || null;
                    setActiveWorkspace(v);
                  }}
                  style={{ padding: "6px", fontSize: 12 }}
                >
                  {workspaces.map(w => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </select>
                {STANDALONE ? (
                  <button onClick={() => supabase?.auth.signOut()} style={{ cursor: "pointer" }}>
                    Sign out
                  </button>
                ) : null}
              </div>
            ) : STANDALONE ? (
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="email for magic link"
                  style={{ padding: "6px", fontSize: 12 }}
                />
                <button
                  onClick={async () => {
                    if (!supabase) return;
                    const { error } = await supabase.auth.signInWithOtp({
                      email,
                      options: { emailRedirectTo: window.location.origin }
                    });
                    popToast(error ? error.message : "Magic link sent.");
                  }}
                  style={{ cursor: "pointer" }}
                >
                  Send link
                </button>
              </div>
            ) : (
              <div style={{ fontSize: 12, opacity: 0.7 }}>Signed in via Nursery.</div>
            )}
          </div>
        ) : null}

        <div style={{ marginTop: 14 }}>
          <div style={{ fontWeight: 700, fontSize: 13, opacity: 0.85, marginBottom: 8 }}>
            Assignments
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <SidebarItem
              label="All"
              active={activeAssignment === "all"}
              onClick={() => setActiveAssignment("all")}
            />

            <div style={{ marginTop: 10, opacity: 0.7, fontSize: 12 }}>
              —
            </div>

            {sortedAssignments.length === 0 ? (
              <div style={{ opacity: 0.7, fontSize: 13, marginTop: 6 }}>
                No assignments yet.
              </div>
            ) : (
              sortedAssignments.map(a => (
                <SidebarItem
                  key={a.id}
                  label={a.name}
                  active={activeAssignment === a.id}
                  onClick={() => setActiveAssignment(a.id)}
                />
              ))
            )}
          </div>

          <div style={{ marginTop: 14, display: "flex", gap: 8 }}>
            <input
              value={newAssignmentName}
              onChange={(e) => setNewAssignmentName(e.target.value)}
              placeholder="New assignment…"
              style={{ flex: 1, padding: 8 }}
              onKeyDown={(e) => {
                if (e.key === "Enter") addAssignment();
              }}
            />
            <button
              onClick={addAssignment}
              disabled={!newAssignmentName.trim()}
              style={{
                padding: "8px 10px",
                cursor: newAssignmentName.trim() ? "pointer" : "not-allowed"
              }}
            >
              Add
            </button>
          </div>

          <div style={{ marginTop: 16, display: "flex", gap: 10, alignItems: "center" }}>
            <button
              onClick={() => {
                const d = new Date();
                const y = d.getFullYear();
                const m = String(d.getMonth() + 1).padStart(2, "0");
                const day = String(d.getDate()).padStart(2, "0");
                const filename = `bar-stock_sparks_${y}-${m}-${day}.json`;
                downloadJson(filename, buildExportPayload(sparks));
                popToast("Exported.");
              }}
              style={{ cursor: "pointer" }}
            >
              Export
            </button>

            <button onClick={() => importRef.current?.click()} style={{ cursor: "pointer" }}>
              Import
            </button>

            <input
              ref={importRef}
              type="file"
              accept="application/json"
              style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void onImportFile(f);
              }}
            />
          </div>
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--barstock-border)" }}>
            <div style={{ fontWeight: 700, fontSize: 13, opacity: 0.85 }}>Forge Sync</div>
            <div style={{ marginTop: 6, fontSize: 13, opacity: 0.8 }}>
              Status: <b>{syncLabel}</b> - Outbox: <b>{outboxCount}</b>
            </div>
            <div style={{ marginTop: 6, fontSize: 12, opacity: 0.7 }}>
              {syncHint}
            </div>
            <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
              <button
                onClick={onSyncNow}
                disabled={!supabaseAvailable || tongsStatus !== "online" || !session || !workspaceId || syncing || outboxCount === 0}
                style={{
                  cursor: !supabaseAvailable || tongsStatus !== "online" || !session || !workspaceId || syncing || outboxCount === 0
                    ? "not-allowed"
                    : "pointer"
                }}
              >
                {syncing ? "Syncing..." : "Sync now"}
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main style={{ padding: 20, maxWidth: 980 }}>
        <h1 style={{ margin: 0 }}>Sparks</h1>
        <p style={{ marginTop: 8, opacity: 0.8 }}>
          Dump the spark. No polish. No pressure.
        </p>

        {toast && (
          <div
            style={{
              marginTop: 10,
              padding: "8px 10px",
              border: "1px solid var(--barstock-border)",
              borderRadius: 8,
              background: "var(--barstock-surface)",
            }}
          >
            {toast}
          </div>
        )}

        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Type here… try #tags if you want."
            rows={4}
            style={{ flex: 1, padding: 12, fontSize: 14 }}
          />
          <button
            onClick={addSpark}
            disabled={!canAdd}
            style={{
              padding: "10px 14px",
              fontWeight: 600,
              cursor: canAdd ? "pointer" : "not-allowed"
            }}
          >
            Add Spark
          </button>
        </div>

        {/* Filters */}
        <div style={{ display: "flex", gap: 10, marginTop: 12, alignItems: "center" }}>
          <input
            value={q.text ?? ""}
            onChange={(e) => setQ(prev => ({ ...prev, text: e.target.value }))}
            placeholder="Search sparks…"
            style={{ flex: 1, padding: 10 }}
          />
          <select
            value={q.status ?? "all"}
            onChange={(e) => setQ(prev => ({ ...prev, status: e.target.value as any }))}
            style={{ padding: 10 }}
          >
            <option value="all">All</option>
            <option value="raw">Raw</option>
            <option value="warming">Warming</option>
            <option value="forged">Forged</option>
            <option value="archived">Archived</option>
          </select>
        </div>

        {q.tag && (
          <div style={{ marginTop: 8, fontSize: 12, opacity: 0.8 }}>
            Filtering by tag: <b>#{q.tag}</b>{" "}
            <button onClick={() => setQ(prev => ({ ...prev, tag: undefined }))} style={{ cursor: "pointer" }}>
              clear
            </button>
          </div>
        )}

        <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 10 }}>
          {filtered.length === 0 ? (
            <div style={{ opacity: 0.75, marginTop: 8 }}>
              No sparks yet. Toss one in.
            </div>
          ) : (
            filtered.map((s) => (
              <div
                key={s.id}
                onClick={(e) => {
                  const target = e.target as HTMLElement;
                  if (target.closest("button,select,input,textarea,option")) return;
                  setActiveAssignment(s.assignmentId);
                }}
                style={{
                  border: "1px solid var(--barstock-border)",
                  borderRadius: 10,
                  padding: 12,
                  background: "var(--barstock-surface)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                  <div style={{ opacity: 0.7, fontSize: 12 }}>
                    {new Date(s.createdAt).toLocaleString()}
                    {s.pinned ? " • pinned" : ""}
                    {" • "}
                    {assignmentNameById.get(s.assignmentId) ?? "Unknown assignment"}
                  </div>

                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <select
                      value={s.status}
                      onChange={(e) => setStatus(s, e.target.value as SparkStatus)}
                      style={{ padding: "4px 6px" }}
                      title="Status"
                    >
                      <option value="raw">Raw</option>
                      <option value="warming">Warming</option>
                      <option value="forged">Forged</option>
                      <option value="archived">Archived</option>
                    </select>

                    <select
                      value={s.assignmentId}
                      onChange={(e) => {
                        const v = e.target.value;
                        updateSpark(s, { assignmentId: v });
                      }}
                      style={{ padding: "4px 6px" }}
                      title="Assignment"
                    >
                      {sortedAssignments.map(a => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>

                    <button onClick={() => togglePin(s)} style={{ cursor: "pointer" }}>
                      {s.pinned ? "Unpin" : "Pin"}
                    </button>

                    <button
                      onClick={async () => {
                        const ok = await copyText(s.body);
                        popToast(ok ? "Copied." : "Copy failed.");
                      }}
                      style={{ cursor: "pointer" }}
                    >
                      Copy
                    </button>

                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        const episodeId =
                          typeof s.assignmentId === "string" ? s.assignmentId.trim() : "";
                        if (episodeId) {
                          popToast("Opening Hearth...");
                          navigateToHearthForEpisode(episodeId);
                          return;
                        }

                        const assignmentName = assignmentNameById.get(s.assignmentId) ?? "episode";
                        const packet = buildHearthPacket(s, assignmentName);
                        const ok = await copyText(packetToClipboardText(packet));
                        popToast(ok ? "Hearth packet copied (fallback)." : "Copy failed.");
                      }}
                      style={{ cursor: "pointer" }}
                    >
                      Send to Hearth
                    </button>

                    {editingId === s.id ? (
                      <>
                        <button
                          onClick={() => {
                            updateSpark(s, { body: editingBody });
                            setEditingId(null);
                            setEditingBody("");
                            popToast("Saved.");
                          }}
                          style={{ cursor: "pointer" }}
                        >
                          Save
                        </button>
                        <button
                          onClick={() => {
                            setEditingId(null);
                            setEditingBody("");
                          }}
                          style={{ cursor: "pointer" }}
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => {
                          setEditingId(s.id);
                          setEditingBody(s.body);
                        }}
                        style={{ cursor: "pointer" }}
                      >
                        Edit
                      </button>
                    )}

                    <button onClick={() => deleteSpark(s.id)} style={{ cursor: "pointer" }}>
                      Delete
                    </button>
                  </div>
                </div>

                {editingId === s.id ? (
                  <textarea
                    value={editingBody}
                    onChange={(e) => setEditingBody(e.target.value)}
                    rows={4}
                    style={{ width: "100%", marginTop: 10, padding: 10, fontSize: 14 }}
                  />
                ) : (
                  <pre style={{ margin: "10px 0 0", whiteSpace: "pre-wrap", fontFamily: "inherit" }}>
                    {s.body}
                  </pre>
                )}

                {s.tags.length > 0 && (
                  <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {s.tags.map((t) => (
                      <button
                        key={t}
                        onClick={() => onTagClick(t)}
                        style={{
                          cursor: "pointer",
                          border: "1px solid var(--barstock-border)",
                          borderRadius: 999,
                          padding: "4px 10px",
                          fontSize: 12,
                          opacity: 0.9,
                          background: "rgba(26, 38, 61, 0.65)",
                        }}
                        title="Filter by tag"
                      >
                        #{normalizeTag(t)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </main>
    </div>
  );
}

function SidebarItem(props: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={props.onClick}
      style={{
        textAlign: "left",
        width: "100%",
        padding: "8px 10px",
        borderRadius: 10,
        border: "1px solid var(--barstock-border)",
        cursor: "pointer",
        fontWeight: props.active ? 800 : 600,
        opacity: props.active ? 1 : 0.85,
        background: props.active ? "var(--barstock-surface-strong)" : "transparent"
      }}
    >
      {props.label}
    </button>
  );
}
