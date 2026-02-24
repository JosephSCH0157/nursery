import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { createDraft, type Draft } from "../domain/draft";
import { createRevision, type Revision, type RevisionKind } from "../domain/revision";
import type { HearthSession } from "../domain/session";
import type { ScriptSource, WorkpieceSourceRef } from "../domain/source";
import {
  type BarStockSpark,
  enqueueBarStockSpark,
  isBarStockKey,
  readBarStockSparks,
  upsertBarStockSpark,
  writeBarStockSparks,
} from "../lib/barstock-sparks";
import { createHearthWorkpiece } from "../lib/hearth-workpiece";
import { readSourceLibrary, readWorkpieceSources, isSourceRegistryKey } from "../lib/source-registry";
import { normalizeSourceId, parseSourceTokens } from "../lib/source-tokens";
import { createHearthStore } from "../storage/store-factory";
import type { HearthStoreKind } from "../storage/hearth-store";
import { LocalSessionStore } from "../storage/local-session-store";

const AUTOSAVE_DELAY_MS = 1200;
const AUTOSAVE_REVISION_GAP_MS = 5 * 60 * 1000;
const SESSION_SAVE_DELAY_MS = 500;
const STORE_KIND_KEY = "hearth_store_kind";
const DEV_MODE_KEY = "tp_dev_mode";

function resolveStoreKind(): HearthStoreKind {
  if (typeof window === "undefined") return "tongs";
  if (!isDevMode()) return "tongs";

  try {
    const params = new URLSearchParams(window.location.search);
    const requested = (params.get("store") ?? params.get("hearthStore") ?? "")
      .trim()
      .toLowerCase();

    if (requested === "tongs" || requested === "local") {
      try {
        window.localStorage.setItem(STORE_KIND_KEY, requested);
      } catch {
        // Ignore storage failures (private mode, access blocked, etc.).
      }
      return requested as HearthStoreKind;
    }
  } catch {
    // Ignore URL parsing failures and fall back to localStorage.
  }

  try {
    const saved = window.localStorage.getItem(STORE_KIND_KEY)?.trim().toLowerCase();
    if (saved === "tongs" || saved === "local") {
      return saved as HearthStoreKind;
    }
  } catch {
    // Ignore storage failures and fall back to tongs.
  }

  return "tongs";
}

function isDevMode(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.has("dev") || params.get("dev") === "1") return true;
  } catch {
    // Ignore query parsing failures.
  }
  try {
    if (window.localStorage.getItem(DEV_MODE_KEY) === "1") return true;
  } catch {
    // Ignore storage failures.
  }
  try {
    const w = window as typeof window & {
      __TP_DEV?: unknown;
      __TP_DEV1?: unknown;
      __tpDevMode?: unknown;
    };
    if (w.__TP_DEV || w.__TP_DEV1 || w.__tpDevMode) return true;
  } catch {
    // Ignore global inspection failures.
  }
  return false;
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

function countWords(text: string): number {
  const matches = text.trim().match(/\b\w+\b/g);
  return matches ? matches.length : 0;
}

function splitLines(text: string): string[] {
  return text.split(/\r?\n/);
}

type SortKey = "updated" | "title";

type DraftSnapshot = {
  title: string;
  body: string;
  updatedAt: number;
};

type DiffLine = {
  left: string;
  right: string;
  status: "same" | "changed" | "added" | "removed" | "separator";
};

function buildDiffLines(current: string, revision: string): DiffLine[] {
  const leftLines = splitLines(current);
  const rightLines = splitLines(revision);
  const maxLen = Math.max(leftLines.length, rightLines.length);
  const out: DiffLine[] = [];

  for (let i = 0; i < maxLen; i += 1) {
    const left = leftLines[i] ?? "";
    const right = rightLines[i] ?? "";
    const leftTrim = left.trim();
    const rightTrim = right.trim();
    if (leftTrim === "---" || rightTrim === "---") {
      out.push({ left, right, status: "separator" });
      continue;
    }
    if (!left && right) {
      out.push({ left, right, status: "added" });
      continue;
    }
    if (left && !right) {
      out.push({ left, right, status: "removed" });
      continue;
    }
    out.push({ left, right, status: left === right ? "same" : "changed" });
  }
  return out;
}

function formatSparkDate(value: number | undefined): string {
  if (!value) return "Unknown";
  try {
    return new Date(value).toLocaleDateString();
  } catch {
    return String(value);
  }
}

function deriveSparkTitle(spark: BarStockSpark): string {
  const title = spark.title?.trim();
  if (title) return title;
  const line = spark.body.split(/\r?\n/).find((chunk) => chunk.trim());
  if (line) return line.trim().slice(0, 60);
  return "Untitled Spark";
}

function buildSparkPreview(text: string): string {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const preview = lines.slice(0, 2).join(" ");
  return preview.length > 180 ? `${preview.slice(0, 177)}...` : preview;
}

function formatSparkStatus(spark: BarStockSpark): { label: string; detail?: string } {
  const workpieceId = spark.links?.hearthWorkpieceId ?? spark.links?.hearthDraftId ?? null;
  if (workpieceId) {
    const shortId = workpieceId.length > 8 ? workpieceId.slice(0, 8) : workpieceId;
    return { label: "Used", detail: shortId };
  }
  if (spark.status === "forged") {
    return { label: "Used" };
  }
  return { label: "Unused" };
}

export default function HearthHome() {
  const storeKind = resolveStoreKind();
  const devMode = isDevMode();
  const store = useMemo(() => createHearthStore(storeKind), [storeKind]);
  const sessionStore = useMemo(() => new LocalSessionStore(), []);

  const [view, setView] = useState<"home" | "editor">("home");
  const [sparks, setSparks] = useState<BarStockSpark[]>(() => readBarStockSparks());
  const [forgeError, setForgeError] = useState<string | null>(null);
  const [isForging, setIsForging] = useState(false);

  const [workpieceSources, setWorkpieceSources] = useState<WorkpieceSourceRef[]>(
    () => readWorkpieceSources(),
  );
  const [librarySources, setLibrarySources] = useState<ScriptSource[]>(
    () => readSourceLibrary(),
  );

  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [activeDraft, setActiveDraft] = useState<Draft | null>(null);
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [selectedRevision, setSelectedRevision] = useState<Revision | null>(null);
  const [draftSnapshot, setDraftSnapshot] = useState<DraftSnapshot | null>(null);

  const [isSaving, setIsSaving] = useState(false);
  const [isSavingRevision, setIsSavingRevision] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchText, setSearchText] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("updated");
  const [showArchived, setShowArchived] = useState(false);
  const [showRevisions, setShowRevisions] = useState(false);
  const [revisionModalOpen, setRevisionModalOpen] = useState(false);
  const [revisionNote, setRevisionNote] = useState("");
  const [revisionKind, setRevisionKind] = useState<RevisionKind>("manual");
  const [revisionView, setRevisionView] = useState<"list" | "preview" | "compare">("list");
  const [session, setSession] = useState<HearthSession | null>(null);
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [cursorPosition, setCursorPosition] = useState<number | null>(null);
  const [scrollTop, setScrollTop] = useState<number | null>(null);

  const autosaveTimer = useRef<number | null>(null);
  const sessionSaveTimer = useRef<number | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  const lastAutosaveRevisionAt = useMemo(() => {
    const match = revisions.find((rev) => rev.kind === "autosave");
    return match?.createdAt ?? null;
  }, [revisions]);

  const isDirty = useMemo(() => {
    if (!activeDraft || !draftSnapshot) return false;
    return activeDraft.title !== draftSnapshot.title || activeDraft.body !== draftSnapshot.body;
  }, [activeDraft, draftSnapshot]);

  const wordCount = useMemo(() => countWords(activeDraft?.body ?? ""), [activeDraft?.body]);
  const charCount = useMemo(() => activeDraft?.body?.length ?? 0, [activeDraft?.body]);
  const statusText = isSaving ? "Saving..." : isDirty ? "Unsaved changes" : "Saved";

  const sourceTokens = useMemo(
    () => parseSourceTokens(activeDraft?.body ?? ""),
    [activeDraft?.body],
  );
  const citedSourceIds = useMemo(
    () => new Set(sourceTokens.map((token) => token.normalized)),
    [sourceTokens],
  );
  const workpieceSourceIds = useMemo(
    () => new Set(workpieceSources.map((ref) => normalizeSourceId(ref.source_id))),
    [workpieceSources],
  );
  const librarySourceIds = useMemo(
    () => new Set(librarySources.map((source) => normalizeSourceId(source.source_id))),
    [librarySources],
  );

  const missingWorkpieceSources = useMemo(() => {
    if (sourceTokens.length === 0) return [];
    const missing = new Map<string, string>();
    for (const token of sourceTokens) {
      if (!workpieceSourceIds.has(token.normalized)) {
        if (!missing.has(token.normalized)) {
          missing.set(token.normalized, token.sourceId);
        }
      }
    }
    return Array.from(missing.values());
  }, [sourceTokens, workpieceSourceIds]);

  const missingLibrarySources = useMemo(() => {
    if (sourceTokens.length === 0 || librarySources.length === 0) return [];
    const missing = new Map<string, string>();
    for (const token of sourceTokens) {
      if (!librarySourceIds.has(token.normalized)) {
        if (!missing.has(token.normalized)) {
          missing.set(token.normalized, token.sourceId);
        }
      }
    }
    return Array.from(missing.values());
  }, [sourceTokens, librarySources.length, librarySourceIds]);

  const unusedWorkpieceSources = useMemo(() => {
    if (workpieceSources.length === 0) return [];
    const unused = new Map<string, string>();
    for (const ref of workpieceSources) {
      const normalized = normalizeSourceId(ref.source_id);
      if (!citedSourceIds.has(normalized)) {
        unused.set(normalized, ref.source_id);
      }
    }
    return Array.from(unused.values());
  }, [workpieceSources, citedSourceIds]);

  const filteredDrafts = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    const filtered = drafts
      .filter((draft) => (showArchived ? true : !draft.archived))
      .filter((draft) => {
        if (!query) return true;
        const title = draft.title.toLowerCase();
        const body = draft.body.toLowerCase();
        return title.includes(query) || body.includes(query);
      });

    const pinned = filtered.filter((draft) => draft.pinned);
    const unpinned = filtered.filter((draft) => !draft.pinned);

    const sortFn = sortKey === "title"
      ? (a: Draft, b: Draft) => a.title.localeCompare(b.title)
      : (a: Draft, b: Draft) => b.updatedAt - a.updatedAt;

    return [...pinned.sort(sortFn), ...unpinned.sort(sortFn)];
  }, [drafts, searchText, sortKey, showArchived]);

  const diffLines = useMemo(() => {
    if (!selectedRevision || !activeDraft) return [];
    return buildDiffLines(activeDraft.body, selectedRevision.bodySnapshot);
  }, [activeDraft, selectedRevision]);

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
        cursorPosition: cursorPosition ?? base.uiState?.cursorPosition,
        scrollTop: scrollTop ?? base.uiState?.scrollTop,
      },
    };
    setSession(next);
    await sessionStore.saveSession(next);
  }, [cursorPosition, scrollTop, session, sessionStore, showRevisions]);

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

  const onSaveDraft = useCallback(async () => {
    if (!activeDraft) return;
    const now = Date.now();
    await persistDraft({ draft: activeDraft, updatedAt: now, createRevision: null });
  }, [activeDraft]);

  const createDraftAndOpen = useCallback(async (seed?: { title?: string; body?: string }) => {
    const next = createDraft(seed);
    await store.saveDraft(next);
    await refreshDrafts();
    await selectDraft(next);
    setView("editor");
    return next;
  }, [refreshDrafts, selectDraft, store]);

  const startFromScratch = useCallback(async () => {
    if (isForging) return;
    setForgeError(null);
    setIsForging(true);
    try {
      const created = await createHearthWorkpiece({ created_from: "scratch" });
      if (!created.ok) {
        setForgeError("Workpiece creation failed; draft created locally.");
      }
      await createDraftAndOpen();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to start workpiece.";
      setForgeError(message);
    } finally {
      setIsForging(false);
    }
  }, [createDraftAndOpen, isForging]);

  const forgeSpark = useCallback(async (spark: BarStockSpark) => {
    if (isForging) return;
    setForgeError(null);
    setIsForging(true);
    let workpieceId: string | undefined;
    try {
      const created = await createHearthWorkpiece({
        created_from: "bar-stock",
        spark_id: spark.id,
      });
      if (!created.ok) {
        workpieceId = created.workpieceId;
        setForgeError("Workpiece creation failed; draft created locally.");
      } else {
        workpieceId = created.workpieceId;
      }

      const draft = await createDraftAndOpen({
        title: spark.title,
        body: spark.body,
      });

      const now = Date.now();
      const updatedSpark: BarStockSpark = {
        ...spark,
        status: "forged",
        updatedAt: now,
        links: {
          ...spark.links,
          hearthDraftId: draft.id,
          hearthWorkpieceId: workpieceId,
        },
      };
      const nextSparks = upsertBarStockSpark(sparks, updatedSpark);
      setSparks(nextSparks);
      writeBarStockSparks(nextSparks);
      enqueueBarStockSpark(updatedSpark);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Forge failed.";
      setForgeError(message);
    } finally {
      setIsForging(false);
    }
  }, [createDraftAndOpen, isForging, sparks]);

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

      setShowRevisions(Boolean(storedSession?.uiState?.splitPane));
      const tab = storedSession?.uiState?.selectedTab;
      if (tab === "preview" || tab === "compare" || tab === "list") {
        setRevisionView(tab);
      }

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
    if (typeof window === "undefined") return;
    const refresh = () => setSparks(readBarStockSparks());
    refresh();
    const onStorage = (event: StorageEvent) => {
      if (!isBarStockKey(event.key)) return;
      refresh();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const refreshSources = () => {
      setWorkpieceSources(readWorkpieceSources());
      setLibrarySources(readSourceLibrary());
    };
    refreshSources();
    const onStorage = (event: StorageEvent) => {
      if (!isSourceRegistryKey(event.key)) return;
      refreshSources();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

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

  useEffect(() => {
    const textarea = bodyRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [activeDraft?.body]);

  useEffect(() => {
    const textarea = bodyRef.current;
    if (!textarea || !session?.uiState || activeDraft?.id !== session.activeDraftId) return;
    if (typeof session.uiState.cursorPosition === "number") {
      const pos = Math.min(session.uiState.cursorPosition, textarea.value.length);
      textarea.setSelectionRange(pos, pos);
      setCursorPosition(pos);
    }
    if (typeof session.uiState.scrollTop === "number") {
      textarea.scrollTop = session.uiState.scrollTop;
      setScrollTop(session.uiState.scrollTop);
    }
  }, [activeDraft?.id, session]);

  useEffect(() => {
    if (sessionSaveTimer.current) {
      window.clearTimeout(sessionSaveTimer.current);
    }
    sessionSaveTimer.current = window.setTimeout(() => {
      const tab = showRevisions ? revisionView : "editor";
      void persistSession(activeDraft?.id ?? null, tab);
    }, SESSION_SAVE_DELAY_MS);

    return () => {
      if (sessionSaveTimer.current) {
        window.clearTimeout(sessionSaveTimer.current);
        sessionSaveTimer.current = null;
      }
    };
  }, [activeDraft?.id, cursorPosition, persistSession, revisionView, scrollTop, showRevisions]);

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      const key = event.key.toLowerCase();
      if ((event.ctrlKey || event.metaKey) && key === "s") {
        event.preventDefault();
        if (event.shiftKey) {
          if (!revisionModalOpen && activeDraft) {
            setRevisionModalOpen(true);
          }
          return;
        }
        void onSaveDraft();
      }

      if ((event.ctrlKey || event.metaKey) && key === "k") {
        event.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    }

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [activeDraft, onSaveDraft, revisionModalOpen]);

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
        return next;
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

  async function saveDraftMeta(draft: Draft, updates: Partial<Draft>) {
    const now = Date.now();
    const toSave: Draft = {
      ...draft,
      ...updates,
      title: normalizeTitle(updates.title ?? draft.title),
      updatedAt: now,
    };
    await store.saveDraft(toSave);
    setDrafts((prev) => prev.map((d) => (d.id === toSave.id ? toSave : d)));
    if (activeDraft?.id === toSave.id) {
      setActiveDraft(toSave);
      setDraftSnapshot({ title: toSave.title, body: toSave.body, updatedAt: toSave.updatedAt });
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

  async function onDeleteDraft(draft: Draft) {
    const confirmDelete = window.confirm("Delete this draft? This cannot be undone.");
    if (!confirmDelete) return;
    setError(null);
    try {
      await store.deleteDraft(draft.id);
      await refreshDrafts();
      if (activeDraft?.id === draft.id) {
        await selectDraft(null);
      }
      await persistSession(activeDraft?.id === draft.id ? null : activeDraft?.id ?? null, "editor");
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

  async function onUpdateRevisionNote(revision: Revision, note: string) {
    setIsSavingRevision(true);
    try {
      const updated: Revision = {
        ...revision,
        note: note.trim() || undefined,
      };
      await store.saveRevision(updated);
      setRevisions((prev) => prev.map((rev) => (rev.id === updated.id ? updated : rev)));
      setSelectedRevision(updated);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update revision note.";
      setError(message);
    } finally {
      setIsSavingRevision(false);
    }
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

  function renderSectionedBody(text: string) {
    const lines = splitLines(text);
    return (
      <div style={{ display: "grid", gap: 6, whiteSpace: "pre-wrap" }}>
        {lines.map((line, idx) => (
          line.trim() === "---"
            ? <hr key={`sep-${idx}`} style={{ borderColor: "rgba(148,163,184,0.35)" }} />
            : <div key={`line-${idx}`}>{line || " "}</div>
        ))}
      </div>
    );
  }

  if (view === "home") {
    const sortedSparks = sparks.slice().sort((a, b) => b.createdAt - a.createdAt);
    return (
      <section style={{ padding: 24, display: "grid", gap: 20 }}>
        <header style={{ display: "grid", gap: 6 }}>
          <h1 style={{ margin: 0 }}>Hearth</h1>
          <p style={{ margin: 0, opacity: 0.75 }}>Select a spark or begin a new workpiece.</p>
        </header>

        {forgeError ? (
          <div style={{ color: "#b00020", fontSize: 12 }}>{forgeError}</div>
        ) : null}

        <section style={{ display: "grid", gap: 12 }}>
          <h2 style={{ margin: 0, fontSize: 16 }}>From Bar Stock</h2>
          {sortedSparks.length === 0 ? (
            <p style={{ margin: 0, fontSize: 13, opacity: 0.7 }}>
              No sparks yet. Capture ideas in Bar Stock first.
            </p>
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              {sortedSparks.map((spark) => {
                const status = formatSparkStatus(spark);
                const preview = buildSparkPreview(spark.body);
                return (
                  <div
                    key={spark.id}
                    style={{
                      border: "1px solid var(--forge-border, #ddd)",
                      borderRadius: 10,
                      padding: 12,
                      background: "var(--forge-bg-elevated, #fff)",
                      display: "grid",
                      gap: 6,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                      <div style={{ fontWeight: 600 }}>{deriveSparkTitle(spark)}</div>
                      <div style={{ fontSize: 12, opacity: 0.7 }}>
                        {formatSparkDate(spark.createdAt)}
                      </div>
                    </div>
                    <div style={{ fontSize: 13, opacity: 0.85 }}>
                      {preview || "No preview available yet."}
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                      <div style={{ fontSize: 12, opacity: 0.7 }}>
                        Status: {status.label}{status.detail ? ` · ${status.detail}` : ""}
                      </div>
                      <button
                        type="button"
                        onClick={() => void forgeSpark(spark)}
                        disabled={isForging}
                      >
                        Forge this
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section style={{ display: "grid", gap: 10 }}>
          <h2 style={{ margin: 0, fontSize: 16 }}>Start New Workpiece</h2>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button type="button" onClick={() => void startFromScratch()} disabled={isForging}>
              Start from scratch
            </button>
            {activeDraft ? (
              <button type="button" onClick={() => setView("editor")}>
                Continue last draft
              </button>
            ) : null}
          </div>
        </section>
      </section>
    );
  }

  return (
    <section style={{ padding: 24, display: "grid", gap: 16 }}>
      <header style={{ display: "grid", gap: 4 }}>
        <h1 style={{ margin: 0 }}>Hearth</h1>
        {devMode ? (
          <p style={{ margin: 0, opacity: 0.75 }}>Dev store: {storeKind}</p>
        ) : null}
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
        <span style={{ fontSize: 12, opacity: 0.75 }}>{statusText}</span>
        <span style={{ fontSize: 12, opacity: 0.6 }}>{wordCount} words · {charCount} chars</span>
      </div>

      {error ? (
        <div style={{ color: "#b00020", fontSize: 14 }}>{error}</div>
      ) : null}

      {missingWorkpieceSources.length ? (
        <div style={{ color: "#b00020", fontSize: 12 }}>
          Missing sources (workpiece): {missingWorkpieceSources.join(", ")}
        </div>
      ) : null}

      {missingLibrarySources.length ? (
        <div style={{ color: "#b06d00", fontSize: 12 }}>
          Missing sources (library): {missingLibrarySources.join(", ")}
        </div>
      ) : null}

      {unusedWorkpieceSources.length ? (
        <div style={{ fontSize: 12, opacity: 0.7 }}>
          Unused sources: {unusedWorkpieceSources.join(", ")}
        </div>
      ) : null}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: showRevisions
            ? "minmax(260px, 340px) minmax(320px, 1fr) minmax(280px, 360px)"
            : "minmax(260px, 340px) 1fr",
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
            display: "grid",
            gap: 12,
          }}
        >
          <div style={{ display: "grid", gap: 8 }}>
            <div style={{ display: "grid", gap: 6 }}>
              <label style={{ fontSize: 12, opacity: 0.8 }}>Search drafts</label>
              <input
                ref={searchRef}
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
            <label style={{ fontSize: 12, opacity: 0.8, display: "flex", gap: 6, alignItems: "center" }}>
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(event) => setShowArchived(event.target.checked)}
              />
              Show archived
            </label>
          </div>

          <h3 style={{ marginTop: 0 }}>Drafts</h3>
          {isLoading ? <p>Loading drafts...</p> : null}
          {!isLoading && drafts.length === 0 ? <p>No drafts yet.</p> : null}
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 10 }}>
            {filteredDrafts.map((draft) => {
              const isActive = activeDraft?.id === draft.id;
              const isEditing = editingDraftId === draft.id;
              return (
                <li key={draft.id}>
                  <div
                    style={{
                      border: isActive ? "1px solid #557" : "1px solid var(--forge-border, #ddd)",
                      borderRadius: 8,
                      padding: 8,
                      background: isActive ? "rgba(85, 119, 255, 0.08)" : "transparent",
                      display: "grid",
                      gap: 6,
                    }}
                  >
                    {isEditing ? (
                      <input
                        value={editingTitle}
                        onChange={(event) => setEditingTitle(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            void saveDraftMeta(draft, { title: editingTitle });
                            setEditingDraftId(null);
                          }
                          if (event.key === "Escape") {
                            setEditingDraftId(null);
                          }
                        }}
                        onBlur={() => {
                          if (editingDraftId === draft.id) {
                            void saveDraftMeta(draft, { title: editingTitle });
                            setEditingDraftId(null);
                          }
                        }}
                      />
                    ) : (
                      <button
                        onClick={() => {
                          void selectDraft(draft);
                        }}
                        style={{
                          textAlign: "left",
                          border: "none",
                          background: "transparent",
                          padding: 0,
                          color: "inherit",
                          cursor: "pointer",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                          <div style={{ fontWeight: 600 }}>{draft.title || "Untitled Draft"}</div>
                          {draft.pinned ? (
                            <span style={{ fontSize: 14, opacity: 0.7 }} aria-label="Pinned" title="Pinned">
                              📌
                            </span>
                          ) : null}
                        </div>
                        <div style={{ fontSize: 12, opacity: 0.75 }}>
                          Updated {formatUpdatedAt(draft.updatedAt)}
                        </div>
                      </button>
                    )}
                    <div style={{ fontSize: 12, opacity: 0.65 }}>
                      Revisions {draft.revisionCount ?? "-"}
                    </div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <button
                        type="button"
                        onClick={() => void saveDraftMeta(draft, { pinned: !draft.pinned })}
                      >
                        {draft.pinned ? "Unpin" : "Pin"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingDraftId(draft.id);
                          setEditingTitle(draft.title);
                        }}
                      >
                        Rename
                      </button>
                      <button
                        type="button"
                        onClick={() => void saveDraftMeta(draft, { archived: !draft.archived })}
                      >
                        {draft.archived ? "Unarchive" : "Archive"}
                      </button>
                      <button type="button" onClick={() => void onDeleteDraft(draft)}>
                        Delete
                      </button>
                    </div>
                  </div>
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
              ref={bodyRef}
              value={activeDraft?.body ?? ""}
              placeholder="Start writing..."
              onChange={(event) => {
                if (!activeDraft) return;
                setActiveDraft({ ...activeDraft, body: event.target.value });
              }}
              onSelect={(event) => {
                const target = event.target as HTMLTextAreaElement;
                setCursorPosition(target.selectionStart);
              }}
              onKeyUp={(event) => {
                const target = event.target as HTMLTextAreaElement;
                setCursorPosition(target.selectionStart);
              }}
              onScroll={(event) => {
                const target = event.target as HTMLTextAreaElement;
                setScrollTop(target.scrollTop);
              }}
              disabled={!activeDraft}
              style={{ minHeight: 320, resize: "vertical", overflow: "hidden" }}
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
              <div style={{ display: "grid", gap: 10, maxHeight: 360, overflowY: "auto" }}>
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
                      <span
                        style={{
                          textTransform: "capitalize",
                          opacity: 0.7,
                          padding: "2px 6px",
                          borderRadius: 999,
                          border: "1px solid rgba(148,163,184,0.4)",
                        }}
                      >
                        {revision.kind}
                      </span>
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
              <div style={{ display: "grid", gap: 10 }}>
                <div style={{ fontWeight: 600 }}>{revisionView === "preview" ? "Preview" : "Compare"}</div>
                <div style={{ fontSize: 12, opacity: 0.7 }}>
                  {formatUpdatedAt(selectedRevision.createdAt)} · {selectedRevision.kind}
                </div>
                <label style={{ display: "grid", gap: 6 }}>
                  <span style={{ fontSize: 12, opacity: 0.7 }}>Revision note</span>
                  <input
                    value={selectedRevision.note ?? ""}
                    onChange={(event) => {
                      setSelectedRevision({ ...selectedRevision, note: event.target.value });
                    }}
                    onBlur={(event) => void onUpdateRevisionNote(selectedRevision, event.target.value)}
                  />
                </label>
                {revisionView === "preview" ? (
                  <div style={{ display: "grid", gap: 8 }}>
                    <div style={{ fontWeight: 600 }}>{selectedRevision.titleSnapshot}</div>
                    {renderSectionedBody(selectedRevision.bodySnapshot)}
                  </div>
                ) : (
                  <div style={{ display: "grid", gap: 8 }}>
                    <div style={{ display: "grid", gap: 6 }}>
                      <span style={{ fontSize: 12, opacity: 0.7 }}>Diff</span>
                      <div style={{ display: "grid", gap: 4 }}>
                        {diffLines.map((line, idx) => {
                          const isSeparator = line.status === "separator";
                          const leftStyle: CSSProperties = {
                            padding: "2px 4px",
                            background: line.status === "removed" || line.status === "changed"
                              ? "rgba(255, 138, 154, 0.18)"
                              : undefined,
                            whiteSpace: "pre-wrap",
                          };
                          const rightStyle: CSSProperties = {
                            padding: "2px 4px",
                            background: line.status === "added" || line.status === "changed"
                              ? "rgba(121, 226, 166, 0.18)"
                              : undefined,
                            whiteSpace: "pre-wrap",
                          };
                          if (isSeparator) {
                            return (
                              <div key={`diff-${idx}`} style={{ gridColumn: "1 / -1" }}>
                                <hr style={{ borderColor: "rgba(148,163,184,0.35)" }} />
                              </div>
                            );
                          }
                          return (
                            <div
                              key={`diff-${idx}`}
                              style={{
                                display: "grid",
                                gridTemplateColumns: "1fr 1fr",
                                gap: 8,
                              }}
                            >
                              <div style={leftStyle}>{line.left || " "}</div>
                              <div style={rightStyle}>{line.right || " "}</div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => void onUpdateRevisionNote(selectedRevision, selectedRevision.note ?? "")}
                  disabled={isSavingRevision}
                >
                  {isSavingRevision ? "Saving note..." : "Save note"}
                </button>
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
