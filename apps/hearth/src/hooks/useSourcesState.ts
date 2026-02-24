import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ScriptSource, SourceIndexEntry, WorkpieceSourceRef } from "../domain/source";
import {
  isSourceRegistryKey,
  readSourceIndex,
  readWorkpieceSources,
  writeSourceIndexCache,
  writeWorkpieceSourcesCache,
} from "../lib/source-registry";
import { createSourceId } from "../lib/source-ids";
import { normalizeSourceId, parseSourceTokens } from "../lib/source-tokens";
import {
  commitWorkpieceSourceRefs,
  commitWorkspaceSource,
  commitWorkspaceSourcesIndex,
  readWorkpieceSourceRefs,
  readWorkspaceSource,
  readWorkspaceSourcesIndex,
} from "../lib/sources-repo";

type SourcesStatusKind = "idle" | "saving" | "success" | "error";

export type SourcesStatus = {
  kind: SourcesStatusKind;
  message?: string;
};

export type NewSourceInput = {
  title: string;
  type: string;
  url?: string | null;
  author?: string | null;
  publisher?: string | null;
  published_at?: string | null;
  notes?: string | null;
  source_id?: string | null;
};

type WorkpieceCommitRequest = {
  refs: WorkpieceSourceRef[];
  allowEmpty?: boolean;
  silent?: boolean;
};

function normalizeOptional(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function buildIndexEntryFromSource(source: ScriptSource): SourceIndexEntry {
  return {
    source_id: source.source_id,
    title: source.title,
    type: source.type,
    url: source.url ?? null,
    publisher: source.publisher ?? null,
    published_at: source.published_at ?? null,
  };
}

function upsertIndexEntry(entries: SourceIndexEntry[], entry: SourceIndexEntry): SourceIndexEntry[] {
  const normalized = normalizeSourceId(entry.source_id);
  const idx = entries.findIndex((item) => normalizeSourceId(item.source_id) === normalized);
  if (idx === -1) return [...entries, entry];
  const next = [...entries];
  next[idx] = { ...next[idx], ...entry };
  return next;
}

export type SourcesState = {
  workpieceSources: WorkpieceSourceRef[];
  sourceIndexEntries: SourceIndexEntry[];
  sourceIndexById: Map<string, SourceIndexEntry>;
  sourceDetails: Record<string, ScriptSource>;
  missingWorkpieceSources: string[];
  missingLibrarySources: string[];
  unusedWorkpieceSources: string[];
  missingCitedCount: number;
  unusedRefsCount: number;
  hasWorkspaceIndex: boolean;
  citedSourceIds: Set<string>;
  status: SourcesStatus;
  attachSourceToWorkpiece: (sourceId: string) => void;
  removeSourceFromWorkpiece: (sourceId: string) => void;
  updateWorkpieceSourceNotes: (sourceId: string, notes: string) => void;
  addSourceToLibrary: (input: NewSourceInput, options?: { attachToWorkpiece?: boolean }) => Promise<ScriptSource | null>;
  loadSourceDetails: (sourceId: string) => Promise<ScriptSource | null>;
  syncSources: (options?: { silent?: boolean }) => void;
};

export function useSourcesState(
  workspaceId: string | null,
  workpieceId: string | null,
  draftText: string | null | undefined,
  options?: { mode?: "summary" | "full" },
): SourcesState {
  const mode = options?.mode ?? "summary";
  const [workpieceSources, setWorkpieceSources] = useState<WorkpieceSourceRef[]>(() => readWorkpieceSources());
  const [sourceIndexEntries, setSourceIndexEntries] = useState<SourceIndexEntry[]>(() => readSourceIndex());
  const [workspaceIndexExists, setWorkspaceIndexExists] = useState<boolean | null>(null);
  const [sourceDetails, setSourceDetails] = useState<Record<string, ScriptSource>>({});
  const [status, setStatus] = useState<SourcesStatus>({ kind: "idle" });

  const statusTimer = useRef<number | null>(null);
  const workpieceCommitRef = useRef<string | null>(null);
  const workpieceCommitInFlight = useRef(false);
  const workpieceCommitQueued = useRef(false);
  const pendingWorkpieceCommit = useRef<WorkpieceCommitRequest | null>(null);

  const sourceTokens = useMemo(() => parseSourceTokens(draftText ?? ""), [draftText]);
  const citedSourceIds = useMemo(
    () => new Set(sourceTokens.map((token) => token.normalized)),
    [sourceTokens],
  );
  const workpieceSourceIds = useMemo(
    () => new Set(workpieceSources.map((ref) => normalizeSourceId(ref.source_id))),
    [workpieceSources],
  );
  const sourceIndexById = useMemo(() => {
    const map = new Map<string, SourceIndexEntry>();
    for (const entry of sourceIndexEntries) {
      map.set(normalizeSourceId(entry.source_id), entry);
    }
    return map;
  }, [sourceIndexEntries]);

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
    if (sourceTokens.length === 0 || sourceIndexEntries.length === 0) return [];
    const missing = new Map<string, string>();
    for (const token of sourceTokens) {
      if (!sourceIndexById.has(token.normalized)) {
        if (!missing.has(token.normalized)) {
          missing.set(token.normalized, token.sourceId);
        }
      }
    }
    return Array.from(missing.values());
  }, [sourceTokens, sourceIndexById, sourceIndexEntries.length]);

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

  const missingCitedCount = missingWorkpieceSources.length;
  const unusedRefsCount = unusedWorkpieceSources.length;
  const hasWorkspaceIndex = workspaceIndexExists ?? sourceIndexEntries.length > 0;

  const setStatusWithTimeout = useCallback((next: SourcesStatus, timeoutMs = 2200) => {
    setStatus(next);
    if (statusTimer.current) {
      window.clearTimeout(statusTimer.current);
    }
    if (timeoutMs > 0 && next.kind !== "saving") {
      statusTimer.current = window.setTimeout(() => {
        setStatus({ kind: "idle" });
      }, timeoutMs);
    }
  }, []);

  const queueWorkpieceCommit = useCallback((refs: WorkpieceSourceRef[], options?: { allowEmpty?: boolean; silent?: boolean }) => {
    if (!workpieceId) return;
    pendingWorkpieceCommit.current = { refs, allowEmpty: options?.allowEmpty, silent: options?.silent };
    if (workpieceCommitInFlight.current) {
      workpieceCommitQueued.current = true;
      return;
    }

    workpieceCommitInFlight.current = true;
    const run = async () => {
      try {
        do {
          workpieceCommitQueued.current = false;
          const pending = pendingWorkpieceCommit.current;
          if (!pending) return;
          const fingerprint = JSON.stringify({ workpieceId, refs: pending.refs });
          if (fingerprint === workpieceCommitRef.current) {
            continue;
          }
          if (!pending.silent) {
            setStatusWithTimeout({ kind: "saving", message: "Saving sources..." }, 0);
          }
          const result = await commitWorkpieceSourceRefs(workpieceId, pending.refs, {
            allowEmpty: pending.allowEmpty,
          });
          if (result.ok && !result.skipped) {
            workpieceCommitRef.current = fingerprint;
            if (!pending.silent) {
              setStatusWithTimeout({ kind: "success", message: "Sources saved." });
            }
          } else if (!result.ok) {
            setStatusWithTimeout({ kind: "error", message: "Failed to save workpiece sources." });
          }
        } while (workpieceCommitQueued.current);
      } finally {
        workpieceCommitInFlight.current = false;
      }
    };

    void run();
  }, [workpieceId, setStatusWithTimeout]);

  const attachSourceToWorkpiece = useCallback((sourceId: string) => {
    if (!workpieceId) {
      setStatusWithTimeout({ kind: "error", message: "No workpiece selected." });
      return;
    }
    const trimmed = sourceId.trim();
    if (!trimmed) return;
    const normalized = normalizeSourceId(trimmed);
    setWorkpieceSources((prev) => {
      if (prev.some((ref) => normalizeSourceId(ref.source_id) === normalized)) return prev;
      const next = [...prev, { source_id: trimmed }];
      writeWorkpieceSourcesCache(next);
      queueWorkpieceCommit(next, { allowEmpty: true });
      return next;
    });
  }, [setStatusWithTimeout, workpieceId, queueWorkpieceCommit]);

  const removeSourceFromWorkpiece = useCallback((sourceId: string) => {
    if (!workpieceId) {
      setStatusWithTimeout({ kind: "error", message: "No workpiece selected." });
      return;
    }
    const normalized = normalizeSourceId(sourceId);
    setWorkpieceSources((prev) => {
      const next = prev.filter((ref) => normalizeSourceId(ref.source_id) !== normalized);
      if (next.length === prev.length) return prev;
      writeWorkpieceSourcesCache(next);
      queueWorkpieceCommit(next, { allowEmpty: true });
      return next;
    });
  }, [setStatusWithTimeout, workpieceId, queueWorkpieceCommit]);

  const updateWorkpieceSourceNotes = useCallback((sourceId: string, notes: string) => {
    const normalized = normalizeSourceId(sourceId);
    setWorkpieceSources((prev) => {
      let changed = false;
      const next = prev.map((ref) => {
        if (normalizeSourceId(ref.source_id) !== normalized) return ref;
        const nextNotes = normalizeOptional(notes);
        if ((ref.notes ?? null) !== (nextNotes ?? null)) {
          changed = true;
          return { ...ref, notes: nextNotes ?? null };
        }
        return ref;
      });
      if (!changed) return prev;
      writeWorkpieceSourcesCache(next);
      queueWorkpieceCommit(next, { allowEmpty: true, silent: true });
      return next;
    });
  }, [queueWorkpieceCommit]);

  const loadSourceDetails = useCallback(async (sourceId: string) => {
    if (mode !== "full") return null;
    const normalized = normalizeSourceId(sourceId);
    if (sourceDetails[normalized]) return sourceDetails[normalized];
    if (!workspaceId) {
      setStatusWithTimeout({ kind: "error", message: "Workspace not resolved." });
      return null;
    }
    const result = await readWorkspaceSource(workspaceId, sourceId);
    if (result) {
      setSourceDetails((prev) => ({ ...prev, [normalized]: result }));
      if (!sourceIndexById.has(normalized)) {
        const nextIndex = upsertIndexEntry(sourceIndexEntries, buildIndexEntryFromSource(result));
        setSourceIndexEntries(nextIndex);
        writeSourceIndexCache(nextIndex);
      }
    }
    return result;
  }, [mode, sourceDetails, workspaceId, setStatusWithTimeout, sourceIndexById, sourceIndexEntries]);

  const addSourceToLibrary = useCallback(async (
    input: NewSourceInput,
    options?: { attachToWorkpiece?: boolean },
  ) => {
    if (!workspaceId) {
      setStatusWithTimeout({ kind: "error", message: "Workspace not resolved." });
      return null;
    }
    const sourceId = normalizeOptional(input.source_id) ?? createSourceId();
    const source: ScriptSource = {
      source_id: sourceId,
      title: input.title.trim() || "Untitled Source",
      type: input.type || "other",
      url: normalizeOptional(input.url),
      author: normalizeOptional(input.author),
      publisher: normalizeOptional(input.publisher),
      published_at: normalizeOptional(input.published_at),
      notes: normalizeOptional(input.notes),
    };

    setStatusWithTimeout({ kind: "saving", message: "Saving source..." }, 0);
    const sourceResult = await commitWorkspaceSource(workspaceId, source);
    if (!sourceResult.ok) {
      setStatusWithTimeout({ kind: "error", message: "Failed to save source." });
      return null;
    }

    const nextIndex = upsertIndexEntry(sourceIndexEntries, buildIndexEntryFromSource(source));
    setSourceIndexEntries(nextIndex);
    writeSourceIndexCache(nextIndex);
    setSourceDetails((prev) => ({ ...prev, [normalizeSourceId(source.source_id)]: source }));

    const indexResult = await commitWorkspaceSourcesIndex(workspaceId, nextIndex);
    if (!indexResult.ok) {
      setStatusWithTimeout({ kind: "error", message: "Saved source, but index update failed." });
      return source;
    }

    setStatusWithTimeout({ kind: "success", message: "Source saved." });

    if (options?.attachToWorkpiece && workpieceId) {
      attachSourceToWorkpiece(source.source_id);
    }

    return source;
  }, [workspaceId, sourceIndexEntries, setStatusWithTimeout, workpieceId, attachSourceToWorkpiece]);

  const syncSources = useCallback((options?: { silent?: boolean }) => {
    if (!workpieceId) return;
    queueWorkpieceCommit(workpieceSources, { allowEmpty: false, silent: options?.silent });
  }, [queueWorkpieceCommit, workpieceId, workpieceSources]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const refreshSources = () => {
      setWorkpieceSources(readWorkpieceSources());
      setSourceIndexEntries(readSourceIndex());
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
    if (!workspaceId && !workpieceId) return;
    let cancelled = false;

    const refreshFromTongs = async () => {
      const tasks: Promise<void>[] = [];

      if (workpieceId) {
        tasks.push(
          readWorkpieceSourceRefs(workpieceId)
            .then((refs) => {
              if (cancelled || !refs) return;
              setWorkpieceSources(refs);
              writeWorkpieceSourcesCache(refs);
              workpieceCommitRef.current = JSON.stringify({ workpieceId, refs });
            })
            .catch(() => {}),
        );
      }

      if (workspaceId) {
        tasks.push(
          readWorkspaceSourcesIndex(workspaceId)
            .then((index) => {
              if (cancelled || !index) return;
              setSourceIndexEntries(index.entries);
              writeSourceIndexCache(index.entries);
              setWorkspaceIndexExists(index.exists);
            })
            .catch(() => {}),
        );
      }

      if (tasks.length) {
        await Promise.all(tasks);
      }
    };

    void refreshFromTongs();
    return () => {
      cancelled = true;
    };
  }, [workspaceId, workpieceId]);

  useEffect(() => () => {
    if (statusTimer.current) {
      window.clearTimeout(statusTimer.current);
    }
  }, []);

  return {
    workpieceSources,
    sourceIndexEntries,
    sourceIndexById,
    sourceDetails,
    missingWorkpieceSources,
    missingLibrarySources,
    unusedWorkpieceSources,
    missingCitedCount,
    unusedRefsCount,
    hasWorkspaceIndex,
    citedSourceIds,
    status,
    attachSourceToWorkpiece,
    removeSourceFromWorkpiece,
    updateWorkpieceSourceNotes,
    addSourceToLibrary,
    loadSourceDetails,
    syncSources,
  };
}
