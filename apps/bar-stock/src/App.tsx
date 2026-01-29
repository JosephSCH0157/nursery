import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { Session, SessionId, Spark, SparkStatus } from "./lib/model";
import { makeSpark, now } from "./lib/model";

import { loadSparks, removeSpark, saveSparks, upsertSpark } from "./lib/store";
import { loadSessions, makeSession, saveSessions, upsertSession } from "./lib/sessions";

import { extractTags, normalizeTag, querySparks, type SparkQuery } from "./lib/query";
import { copyText } from "./lib/clip";
import { buildExportPayload, downloadJson, mergeSparks, parseImportJson } from "./lib/io";
import { compactOutbox, drainOutbox, loadOutbox, peekOutbox, pushOutbox, saveOutbox } from "./lib/outbox";
import { buildHearthPacket, packetToClipboardText } from "./lib/hearth-packet";
import { supabase, supabaseAvailable } from "./lib/supabase";
import { listMyWorkspaces, type Workspace } from "./lib/tongs-api";
import type { Session as SupabaseSession } from "@supabase/supabase-js";
import { flushOutboxToTongs, checkTongsOnline } from "./lib/tongs-sync";

type SessionFilter = "all" | "unassigned" | SessionId;

const STANDALONE = import.meta.env.VITE_BARSTOCK_STANDALONE === "true";

export default function App() {
  const [body, setBody] = useState("");
  const [sparks, setSparks] = useState<Spark[]>(() => loadSparks());

  const [sessions, setSessions] = useState<Session[]>(() => loadSessions());
  const [activeSession, setActiveSession] = useState<SessionFilter>("all");
  const [newSessionName, setNewSessionName] = useState("");
  const [session, setSession] = useState<SupabaseSession | null>(null);
  const [email, setEmail] = useState("");
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);

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
    saveSparks(sparks);
  }, [sparks]);

  useEffect(() => {
    saveSessions(sessions);
  }, [sessions]);

  useEffect(() => {
    if (!supabaseAvailable || !session || !workspaceId) {
      setTongsStatus("offline");
      return;
    }

    let cancelled = false;

    (async () => {
      const online = await checkTongsOnline(workspaceId);
      if (!cancelled) {
        setTongsStatus(online ? "online" : "offline");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [supabaseAvailable, session, workspaceId]);

  useEffect(() => {
    if (!session) {
      setWorkspaces([]);
      setWorkspaceId(null);
      return;
    }

    (async () => {
      try {
        const ws = await listMyWorkspaces();
        setWorkspaces(ws);
        const saved = localStorage.getItem("barstock_workspace_id");
        const pick = (saved && ws.find(x => x.id === saved)) ? saved : (ws[0]?.id ?? null);
        setWorkspaceId(pick);
        if (pick) localStorage.setItem("barstock_workspace_id", pick);
      } catch (err) {
        console.error(err);
        popToast("Failed loading workspaces");
      }
    })();
  }, [session]);

  const count = sparks.length;
  const canAdd = useMemo(() => body.trim().length > 0, [body]);
  const syncLabel = !supabaseAvailable ? "LOCAL-ONLY" : tongsStatus.toUpperCase();
  const syncHint = !supabaseAvailable
    ? "Cloud sync unavailable."
    : (tongsStatus === "offline" ? "Offline / local-only." : "Online.");

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

  function addSession() {
    const name = newSessionName.trim();
    if (!name) return;
    const s = makeSession(name);
    setSessions(prev => upsertSession(prev, s));
    enqueue({ op: "upsert_session", at: now(), session: s });
    setNewSessionName("");
    setActiveSession(s.id);
    popToast("Session created.");
  }

  function addSpark() {
    if (!canAdd) return;

    const tags = extractTags(body);

    const sessionId =
      activeSession === "all" || activeSession === "unassigned" ? undefined : activeSession;

    const s = makeSpark(body, {
      source: "typed",
      tags,
      sessionId
    });

    setSparks(prev => upsertSpark(prev, s));
    enqueue({ op: "upsert_spark", at: now(), spark: s });
    setBody("");
  }

  const filteredBySession = useMemo(() => {
    if (activeSession === "all") return sparks;
    if (activeSession === "unassigned") return sparks.filter(s => !s.sessionId);
    return sparks.filter(s => s.sessionId === activeSession);
  }, [sparks, activeSession]);

  const filtered = useMemo(() => querySparks(filteredBySession, q), [filteredBySession, q]);

  const sortedSessions = useMemo(() => {
    // pinned first then alpha
    return [...sessions].sort((a, b) => {
      const ap = a.pinned ? 1 : 0;
      const bp = b.pinned ? 1 : 0;
      if (ap !== bp) return bp - ap;
      return a.name.localeCompare(b.name);
    });
  }, [sessions]);

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

  const sessionNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of sessions) m.set(s.id, s.name);
    return m;
  }, [sessions]);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "260px 1fr",
        minHeight: "100vh",
        fontFamily: "system-ui, sans-serif"
      }}
    >
      {/* Sidebar */}
      <aside
        style={{
          borderRight: "1px solid #e5e5e5",
          padding: 14
        }}
      >
        <div style={{ fontWeight: 800, fontSize: 18 }}>Bar-Stock</div>
        <div style={{ opacity: 0.75, marginTop: 6, fontSize: 13 }}>
          {count} sparks • idea mine
        </div>
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
                  setWorkspaceId(v);
                  if (v) localStorage.setItem("barstock_workspace_id", v);
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

        <div style={{ marginTop: 14 }}>
          <div style={{ fontWeight: 700, fontSize: 13, opacity: 0.85, marginBottom: 8 }}>
            Sessions
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <SidebarItem
              label="All"
              active={activeSession === "all"}
              onClick={() => setActiveSession("all")}
            />
            <SidebarItem
              label="Unassigned"
              active={activeSession === "unassigned"}
              onClick={() => setActiveSession("unassigned")}
            />

            <div style={{ marginTop: 10, opacity: 0.7, fontSize: 12 }}>
              —
            </div>

            {sortedSessions.length === 0 ? (
              <div style={{ opacity: 0.7, fontSize: 13, marginTop: 6 }}>
                No sessions yet.
              </div>
            ) : (
              sortedSessions.map(s => (
                <SidebarItem
                  key={s.id}
                  label={s.name}
                  active={activeSession === s.id}
                  onClick={() => setActiveSession(s.id)}
                />
              ))
            )}
          </div>

          <div style={{ marginTop: 14, display: "flex", gap: 8 }}>
            <input
              value={newSessionName}
              onChange={(e) => setNewSessionName(e.target.value)}
              placeholder="New session…"
              style={{ flex: 1, padding: 8 }}
              onKeyDown={(e) => {
                if (e.key === "Enter") addSession();
              }}
            />
            <button
              onClick={addSession}
              disabled={!newSessionName.trim()}
              style={{
                padding: "8px 10px",
                cursor: newSessionName.trim() ? "pointer" : "not-allowed"
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
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid #e5e5e5" }}>
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
          <div style={{ marginTop: 10, padding: "8px 10px", border: "1px solid #ddd", borderRadius: 8 }}>
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
                style={{
                  border: "1px solid #ddd",
                  borderRadius: 10,
                  padding: 12
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                  <div style={{ opacity: 0.7, fontSize: 12 }}>
                    {new Date(s.createdAt).toLocaleString()}
                    {s.pinned ? " • pinned" : ""}
                    {" • "}
                    {s.sessionId ? (sessionNameById.get(s.sessionId) ?? "Unknown session") : "Unassigned"}
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
                      value={s.sessionId ?? "unassigned"}
                      onChange={(e) => {
                        const v = e.target.value;
                        updateSpark(s, { sessionId: v === "unassigned" ? undefined : v });
                      }}
                      style={{ padding: "4px 6px" }}
                      title="Session"
                    >
                      <option value="unassigned">Unassigned</option>
                      {sortedSessions.map(sess => (
                        <option key={sess.id} value={sess.id}>
                          {sess.name}
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
                      onClick={async () => {
                        const sessionName = s.sessionId ? (sessionNameById.get(s.sessionId) ?? undefined) : undefined;
                        const packet = buildHearthPacket(s, sessionName);
                        const ok = await copyText(packetToClipboardText(packet));
                        popToast(ok ? "Hearth packet copied." : "Copy failed.");
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
                          border: "1px solid #ddd",
                          borderRadius: 999,
                          padding: "4px 10px",
                          fontSize: 12,
                          opacity: 0.9
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
        border: "1px solid #e5e5e5",
        cursor: "pointer",
        fontWeight: props.active ? 800 : 600,
        opacity: props.active ? 1 : 0.85,
        background: props.active ? "#f5f5f5" : "transparent"
      }}
    >
      {props.label}
    </button>
  );
}
