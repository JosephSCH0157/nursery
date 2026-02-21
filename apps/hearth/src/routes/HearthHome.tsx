import { useCallback, useEffect, useMemo, useState } from "react";
import { createDraft, type Draft } from "../domain/draft";
import { createHearthStore } from "../storage/store-factory";
import type { HearthStoreKind } from "../storage/hearth-store";

function resolveStoreKind(): HearthStoreKind {
  const params = new URLSearchParams(window.location.search);
  const requested = params.get("hearthStore")?.trim().toLowerCase();
  return requested === "tongs" ? "tongs" : "local";
}

function formatUpdatedAt(value: number): string {
  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value);
  }
}

export default function HearthHome() {
  const storeKind = useMemo(resolveStoreKind, []);
  const store = useMemo(() => createHearthStore(storeKind), [storeKind]);

  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [activeDraft, setActiveDraft] = useState<Draft | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshDrafts = useCallback(async () => {
    const list = await store.listDrafts();
    setDrafts(list);
  }, [store]);

  const loadDraft = useCallback(
    async (id: string) => {
      setError(null);
      const found = await store.getDraft(id);
      if (!found) {
        setActiveDraft(null);
        setError("Draft not found.");
        return;
      }
      setActiveDraft(found);
    },
    [store],
  );

  const loadInitial = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const list = await store.listDrafts();
      setDrafts(list);
      if (list.length) {
        setActiveDraft(list[0]);
      } else {
        setActiveDraft(null);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load drafts.";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [store]);

  useEffect(() => {
    void loadInitial();
  }, [loadInitial]);

  async function onCreateDraft() {
    setError(null);
    try {
      const next = createDraft();
      await store.saveDraft(next);
      await refreshDrafts();
      setActiveDraft(next);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create draft.";
      setError(message);
    }
  }

  async function onSaveDraft() {
    if (!activeDraft) return;
    setError(null);
    setIsSaving(true);
    try {
      const now = Date.now();
      const toSave: Draft = {
        ...activeDraft,
        title: activeDraft.title.trim() || "Untitled Draft",
        updatedAt: now,
      };
      await store.saveDraft(toSave);
      setActiveDraft(toSave);
      await refreshDrafts();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save draft.";
      setError(message);
    } finally {
      setIsSaving(false);
    }
  }

  async function onDeleteActive() {
    if (!activeDraft) return;
    setError(null);
    try {
      await store.deleteDraft(activeDraft.id);
      await refreshDrafts();
      setActiveDraft(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to delete draft.";
      setError(message);
    }
  }

  return (
    <section style={{ padding: 24, display: "grid", gap: 16 }}>
      <header style={{ display: "grid", gap: 4 }}>
        <h1 style={{ margin: 0 }}>Hearth</h1>
        <p style={{ margin: 0, opacity: 0.75 }}>Store: {storeKind}</p>
      </header>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button onClick={onCreateDraft}>New Draft</button>
        <button onClick={onSaveDraft} disabled={!activeDraft || isSaving}>
          {isSaving ? "Saving..." : "Save"}
        </button>
        <button onClick={onDeleteActive} disabled={!activeDraft || isSaving}>
          Delete
        </button>
      </div>

      {error ? (
        <div style={{ color: "#b00020", fontSize: 14 }}>{error}</div>
      ) : null}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(240px, 320px) 1fr",
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
          <h3 style={{ marginTop: 0 }}>Drafts</h3>
          {isLoading ? <p>Loading drafts...</p> : null}
          {!isLoading && drafts.length === 0 ? <p>No drafts yet.</p> : null}
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
            {drafts.map((draft) => {
              const isActive = activeDraft?.id === draft.id;
              return (
                <li key={draft.id}>
                  <button
                    onClick={() => {
                      void loadDraft(draft.id);
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
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        <div style={{ display: "grid", gap: 10 }}>
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
      </div>
    </section>
  );
}
