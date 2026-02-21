import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createDraft, type Draft } from "../domain/draft";
import { createRevision, type Revision, type RevisionKind } from "../domain/revision";
import type { HearthSession } from "../domain/session";
import { createHearthStore } from "../storage/store-factory";
import type { HearthStoreKind } from "../storage/hearth-store";
import { LocalSessionStore } from "../storage/local-session-store";

const AUTOSAVE_DELAY_MS = 1200;
const AUTOSAVE_REVISION_GAP_MS = 5 * 60 * 1000;

function resolveStoreKind(): HearthStoreKind {
  const params = new URLSearchParams(window.location.search);
  const requested = params.get("hearthStore")?.trim().toLowerCase();
  return requested === "tongs" ? "tongs" : "local";
}

function formatUpdatedAt(value: number | undefined): string {
  if (!value) return "Unknown";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value);
  }
}

function normalizeTitle(title: string): string {
  const trimmed = title.trim();
  return trimmed || "Untitled Draft";
}

type SortKey = "updated" | "title";

type DraftSnapshot = {
  title: string;
  body: string;
  updatedAt: number;
};

export default function HearthHome() {
  const storeKind = useMemo(resolveStoreKind, []);
  const store = useMemo(() => createHearthStore(storeKind), [storeKind]);
  const sessionStore = useMemo(() => new LocalSessionStore(), []);

  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [activeDraft, setActiveDraft] = useState<Draft | null>(null);
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [selectedRevision, setSelectedRevision] = useState<Revision | null>(null);
  const [draftSnapshot, setDraftSnapshot] = useState<DraftSnapshot | null>(null);

  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchText, setSearchText] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("updated");
  const [showRevisions, setShowRevisions] = useState(false);
  const [revisionModalOpen, setRevisionModalOpen] = useState(false);
  const [revisionNote, setRevisionNote] = useState("");
  const [revisionKind, setRevisionKind] = useState<RevisionKind>("manual");
  const [revisionView, setRevisionView] = useState<"list" | "preview" | "compare">("list");
  const [session, setSession] = useState<HearthSession | null>(null);

  const autosaveTimer = useRef<number | null>(null);

  const lastAutosaveRevisionAt = useMemo(() => {
    const match = revisions.find((rev) => rev.kind === "autosave");
    return match?.createdAt ?? null;
  }, [revisions]);

  const isDirty = useMemo(() => {
    if (!activeDraft || !draftSnapshot) return false;
    return activeDraft.title !== draftSnapshot.title || activeDraft.body !== draftSnapshot.body;
  }, [activeDraft, draftSnapshot]);

  const statusText = isSaving ? "Saving..." : isDirty ? "Unsaved changes" : "Saved";

  const filteredDrafts = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    const filtered = !query
      ? drafts
      : drafts.filter((draft) => {
        const title = draft.title.toLowerCase();
        const body = draft.body.toLowerCase();
        return title.includes(query) || body.includes(query);
      });

    if (sortKey === "title") {
      return [...filtered].sort((a, b) => a.title.localeCompare(b.title));
    }

    return [...filtered].sort((a, b) => b.updatedAt - a.updatedAt);
  }, [drafts, searchText, sortKey]);

  const refreshDrafts = useCallback(async () => {
    const list = await store.listDrafts();
    setDrafts(list);
  }, [store]);

  const refreshRevisions = useCallback(async (draftId: string) => {
    const list = await store.listRevisions(draftId);
    setRevisions(list);
  }, [store]);

  const persistSession = useCallback(async (draftId: string | null, uiSelectedTab?: string) => {
    const now = Date.now();
    const base: HearthSession = session ?? {
      id: "default",
      createdAt: now,
      updatedAt: now,
    };
    const next: HearthSession = {
      ...base,
      activeDraftId: draftId ?? undefined,
      lastOpenedAt: now,
      updatedAt: now,
      uiState: {
        splitPane: showRevisions,
        selectedTab: uiSelectedTab ?? base.uiState?.selectedTab,
      },
    };
    setSession(next);
    await sessionStore.saveSession(next);
  }, [session, sessionStore, showRevisions]);

  const selectDraft = useCallback(async (draft: Draft | null) => {
    if (!draft) {
      setActiveDraft(null);
      setDraftSnapshot(null);
      setRevisions([]);
      setSelectedRevision(null);
      return;
    }
    setActiveDraft(draft);
    setDraftSnapshot({ title: draft.title, body: draft.body, updatedAt: draft.updatedAt });
    await refreshRevisions(draft.id);
    await persistSession(draft.id, "editor");
  }, [persistSession, refreshRevisions]);

  const loadInitial = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [storedSession, list] = await Promise.all([
        sessionStore.getSession(),
        store.listDrafts(),
      ]);

      setSession(storedSession);
      setDrafts(list);

      const preferredId = storedSession?.activeDraftId;
      const first = preferredId ? list.find((draft) => draft.id === preferredId) : list[0];
      if (first) {
        setActiveDraft(first);
        setDraftSnapshot({ title: first.title, body: first.body, updatedAt: first.updatedAt });
        await refreshRevisions(first.id);
      } else {
        setActiveDraft(null);
        setDraftSnapshot(null);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load drafts.";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [store, refreshRevisions, sessionStore]);

  useEffect(() => {
    void loadInitial();
  }, [loadInitial]);

  useEffect(() => {
    if (!activeDraft) return;
    void refreshRevisions(activeDraft.id);
  }, [activeDraft?.id, refreshRevisions]);

  useEffect(() => {
    if (!activeDraft) return;
    if (!isDirty) return;

    if (autosaveTimer.current) {
      window.clearTimeout(autosaveTimer.current);
    }

    autosaveTimer.current = window.setTimeout(() => {
      void handleAutosave();
    }, AUTOSAVE_DELAY_MS);

    return () => {
      if (autosaveTimer.current) {
        window.clearTimeout(autosaveTimer.current);
        autosaveTimer.current = null;
      }
    };
  }, [activeDraft?.title, activeDraft?.body, activeDraft?.id, isDirty]);

  async function handleAutosave() {
    if (!activeDraft) return;
    const now = Date.now();
    const shouldAutoRevision = !lastAutosaveRevisionAt
      || now - lastAutosaveRevisionAt >= AUTOSAVE_REVISION_GAP_MS;

    await persistDraft({
      draft: activeDraft,
      updatedAt: now,
      createRevision: shouldAutoRevision ? {
        kind: "autosave",
        note: "Autosave",
      } : null,
    });
  }

  async function persistDraft(args: {
    draft: Draft;
    updatedAt: number;
    createRevision: { kind: RevisionKind; note?: string } | null;
  }) {
    setIsSaving(true);
    setError(null);
    try {
      let revisionCount = args.draft.revisionCount;
      let lastRevisionAt = args.draft.lastRevisionAt;
      let createdRevision: Revision | null = null;

      if (args.createRevision) {
        createdRevision = createRevision({
          draftId: args.draft.id,
          title: normalizeTitle(args.draft.title),
          body: args.draft.body,
          kind: args.createRevision.kind,
          note: args.createRevision.note,
        });
        await store.saveRevision(createdRevision);
        revisionCount = (revisionCount ?? revisions.length) + 1;
        lastRevisionAt = createdRevision.createdAt;
        setRevisions((prev) => [createdRevision!, ...prev]);
      }

      const toSave: Draft = {
        ...args.draft,
        title: normalizeTitle(args.draft.title),
        updatedAt: args.updatedAt,
        revisionCount,
        lastRevisionAt,
      };

      await store.saveDraft(toSave);

      setActiveDraft(toSave);
      setDraftSnapshot({ title: toSave.title, body: toSave.body, updatedAt: toSave.updatedAt });
      setDrafts((prev) => {
        const exists = prev.some((d) => d.id === toSave.id);
        const next = exists
          ? prev.map((d) => (d.id === toSave.id ? toSave : d))
          : [toSave, ...prev];
        return next.sort((a, b) => b.updatedAt - a.updatedAt);
      });

      if (createdRevision) {
        setSelectedRevision(createdRevision);
        setRevisionView("preview");
      }

      await persistSession(toSave.id, revisionView === "list" ? "editor" : revisionView);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save draft.";
      setError(message);
    } finally {
      setIsSaving(false);
    }
  }

  async function onCreateDraft() {
    setError(null);
    try {
      const next = createDraft();
      await store.saveDraft(next);
      await refreshDrafts();
      await selectDraft(next);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create draft.";
      setError(message);
    }
  }

  async function onSaveDraft() {
    if (!activeDraft) return;
    const now = Date.now();
    await persistDraft({ draft: activeDraft, updatedAt: now, createRevision: null });
  }

  async function onDeleteActive() {
    if (!activeDraft) return;
    setError(null);
    try {
      await store.deleteDraft(activeDraft.id);
      await refreshDrafts();
      await selectDraft(null);
      await persistSession(null, "editor");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to delete draft.";
      setError(message);
    }
  }

  async function onConfirmRevision() {
    if (!activeDraft) return;
    const now = Date.now();
    await persistDraft({
      draft: activeDraft,
      updatedAt: now,
      createRevision: { kind: revisionKind, note: revisionNote.trim() || undefined },
    });
    setRevisionModalOpen(false);
    setRevisionNote("");
    setRevisionKind("manual");
  }

  async function onRestoreRevision(revision: Revision) {
    if (!activeDraft) return;
    const confirmRestore = window.confirm("Restore this revision? This will overwrite the current draft content.");
    if (!confirmRestore) return;

    const snapshot = await store.restoreRevision(revision.id);
    if (!snapshot) {
      setError("Revision not found.");
      return;
    }

    const now = Date.now();
    const restored: Draft = {
      ...activeDraft,
      title: snapshot.title,
      body: snapshot.body,
      updatedAt: now,
    };
    await persistDraft({ draft: restored, updatedAt: now, createRevision: null });
    setSelectedRevision(revision);
    setRevisionView("preview");
  }

  function openRevisionPanel() {
    setShowRevisions(true);
    setRevisionView("list");
    setSelectedRevision(null);
    void persistSession(activeDraft?.id ?? null, "list");
  }

  function closeRevisionPanel() {
    setShowRevisions(false);
    setRevisionView("list");
    setSelectedRevision(null);
    void persistSession(activeDraft?.id ?? null, "editor");
  }

  return (
    <section style={{ padding: 24, display: "grid", gap: 16 }}>
      <header style={{ display: "grid", gap: 4 }}>
        <h1 style={{ margin: 0 }}>Hearth</h1>
        <p style={{ margin: 0, opacity: 0.75 }}>Store: {storeKind}</p>
      </header>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <button onClick={onCreateDraft}>New Draft</button>
        <button onClick={onSaveDraft} disabled={!activeDraft || isSaving}>
          {isSaving ? "Saving..." : "Save"}
        </button>
        <button onClick={() => setRevisionModalOpen(true)} disabled={!activeDraft || isSaving}>
          Create Revision
        </button>
        {showRevisions ? (
          <button onClick={closeRevisionPanel}>Close Revisions</button>
        ) : (
          <button onClick={openRevisionPanel} disabled={!activeDraft}>
            Revisions
          </button>
        )}
        <button onClick={onDeleteActive} disabled={!activeDraft || isSaving}>
          Delete
        </button>
        <span style={{ fontSize: 12, opacity: 0.75 }}>{statusText}</span>
      </div>

      {error ? (
        <div style={{ color: "#b00020", fontSize: 14 }}>{error}</div>
      ) : null}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: showRevisions
            ? "minmax(240px, 320px) minmax(320px, 1fr) minmax(260px, 340px)"
            : "minmax(240px, 320px) 1fr",
          gap: 16,
          alignItems: "start",
        }}
      >
        <aside
          style={{
            border: "1px solid var(--forge-border, #ddd)",
            borderRadius: 8,
            padding: 12,
            background: "var(--forge-bg-elevated, #fff)",
            minHeight: 220,
          }}
        >
          <div style={{ display: "grid", gap: 8 }}>
            <div style={{ display: "grid", gap: 6 }}>
              <label style={{ fontSize: 12, opacity: 0.8 }}>Search drafts</label>
              <input
                type="search"
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder="Search title or body"
              />
            </div>
            <div style={{ display: "grid", gap: 6 }}>
              <label style={{ fontSize: 12, opacity: 0.8 }}>Sort</label>
              <select value={sortKey} onChange={(event) => setSortKey(event.target.value as SortKey)}>
                <option value="updated">Recently updated</option>
                <option value="title">Title A-Z</option>
              </select>
            </div>
          </div>

          <h3 style={{ marginTop: 12 }}>Drafts</h3>
          {isLoading ? <p>Loading drafts...</p> : null}
          {!isLoading && drafts.length === 0 ? <p>No drafts yet.</p> : null}
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
            {filteredDrafts.map((draft) => {
              const isActive = activeDraft?.id === draft.id;
              return (
                <li key={draft.id}>
                  <button
                    onClick={() => {
                      void selectDraft(draft);
                    }}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      border: isActive ? "1px solid #557" : "1px solid var(--forge-border, #ddd)",
                      borderRadius: 6,
                      padding: "8px 10px",
                      background: isActive ? "rgba(85, 119, 255, 0.08)" : "transparent",
                    }}
                  >
                    <div style={{ fontWeight: 600 }}>{draft.title || "Untitled Draft"}</div>
                    <div style={{ fontSize: 12, opacity: 0.75 }}>
                      Updated {formatUpdatedAt(draft.updatedAt)}
                    </div>
                    <div style={{ fontSize: 12, opacity: 0.65 }}>
                      Revisions {draft.revisionCount ?? "-"}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: 12, opacity: 0.75 }}>
              Last updated {formatUpdatedAt(activeDraft?.updatedAt)}
            </div>
            <div style={{ fontSize: 12, opacity: 0.6 }}>
              Last revision {formatUpdatedAt(activeDraft?.lastRevisionAt)}
            </div>
          </div>

          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontWeight: 600 }}>Title</span>
            <input
              type="text"
              value={activeDraft?.title ?? ""}
              placeholder="Draft title"
              onChange={(event) => {
                if (!activeDraft) return;
                setActiveDraft({ ...activeDraft, title: event.target.value });
              }}
              disabled={!activeDraft}
            />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontWeight: 600 }}>Body</span>
            <textarea
              value={activeDraft?.body ?? ""}
              placeholder="Start writing..."
              onChange={(event) => {
                if (!activeDraft) return;
                setActiveDraft({ ...activeDraft, body: event.target.value });
              }}
              disabled={!activeDraft}
              style={{ minHeight: 320, resize: "vertical" }}
            />
          </label>
        </div>

        {showRevisions ? (
          <aside
            style={{
              border: "1px solid var(--forge-border, #ddd)",
              borderRadius: 8,
              padding: 12,
              background: "var(--forge-bg-elevated, #fff)",
              minHeight: 220,
              display: "grid",
              gap: 12,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ margin: 0 }}>Revisions</h3>
              <span style={{ fontSize: 12, opacity: 0.7 }}>{revisions.length} total</span>
            </div>

            {revisions.length === 0 ? (
              <p style={{ fontSize: 13, opacity: 0.7 }}>No revisions yet.</p>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {revisions.map((revision) => (
                  <div
                    key={revision.id}
                    style={{
                      border: "1px solid var(--forge-border, #ddd)",
                      borderRadius: 6,
                      padding: 8,
                      background: selectedRevision?.id === revision.id
                        ? "rgba(85, 119, 255, 0.08)"
                        : "transparent",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                      <span>{formatUpdatedAt(revision.createdAt)}</span>
                      <span style={{ textTransform: "capitalize", opacity: 0.7 }}>{revision.kind}</span>
                    </div>
                    <div style={{ fontSize: 13, marginTop: 4 }}>
                      {revision.note || "No note"}
                    </div>
                    <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedRevision(revision);
                          setRevisionView("preview");
                        }}
                      >
                        Preview
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedRevision(revision);
                          setRevisionView("compare");
                        }}
                      >
                        Compare
                      </button>
                      <button type="button" onClick={() => void onRestoreRevision(revision)}>
                        Restore
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {revisionView !== "list" && selectedRevision ? (
              <div style={{ display: "grid", gap: 8 }}>
                <div style={{ fontWeight: 600 }}>{revisionView === "preview" ? "Preview" : "Compare"}</div>
                {revisionView === "preview" ? (
                  <div style={{ display: "grid", gap: 8 }}>
                    <div style={{ fontSize: 12, opacity: 0.7 }}>
                      {formatUpdatedAt(selectedRevision.createdAt)} · {selectedRevision.kind}
                    </div>
                    <div style={{ fontWeight: 600 }}>{selectedRevision.titleSnapshot}</div>
                    <textarea
                      readOnly
                      value={selectedRevision.bodySnapshot}
                      style={{ minHeight: 180, resize: "vertical" }}
                    />
                  </div>
                ) : (
                  <div style={{ display: "grid", gap: 8 }}>
                    <div style={{ display: "grid", gap: 6 }}>
                      <span style={{ fontSize: 12, opacity: 0.7 }}>Current</span>
                      <textarea
                        readOnly
                        value={activeDraft?.body ?? ""}
                        style={{ minHeight: 140, resize: "vertical" }}
                      />
                    </div>
                    <div style={{ display: "grid", gap: 6 }}>
                      <span style={{ fontSize: 12, opacity: 0.7 }}>Revision</span>
                      <textarea
                        readOnly
                        value={selectedRevision.bodySnapshot}
                        style={{ minHeight: 140, resize: "vertical" }}
                      />
                    </div>
                  </div>
                )}
              </div>
            ) : null}
          </aside>
        ) : null}
      </div>

      {revisionModalOpen ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.65)",
            display: "grid",
            placeItems: "center",
            padding: 16,
          }}
        >
          <div
            style={{
              width: "min(460px, 90vw)",
              background: "var(--forge-bg-elevated, #fff)",
              borderRadius: 12,
              padding: 16,
              border: "1px solid var(--forge-border, #ddd)",
              display: "grid",
              gap: 12,
            }}
          >
            <div style={{ fontWeight: 700 }}>Create Revision</div>
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 12, opacity: 0.7 }}>Kind</span>
              <select value={revisionKind} onChange={(event) => setRevisionKind(event.target.value as RevisionKind)}>
                <option value="manual">Manual</option>
                <option value="milestone">Milestone</option>
              </select>
            </label>
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 12, opacity: 0.7 }}>Note (optional)</span>
              <textarea
                value={revisionNote}
                onChange={(event) => setRevisionNote(event.target.value)}
                placeholder="Why this change?"
                style={{ minHeight: 90, resize: "vertical" }}
              />
            </label>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => {
                  setRevisionModalOpen(false);
                  setRevisionNote("");
                  setRevisionKind("manual");
                }}
              >
                Cancel
              </button>
              <button type="button" onClick={() => void onConfirmRevision()} disabled={!activeDraft}>
                Create
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
