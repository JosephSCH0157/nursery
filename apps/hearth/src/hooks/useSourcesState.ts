import { useCallback, useEffect, useMemo, useRef, useState, type SetStateAction } from "react";
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
import type { HearthOperationAuthority, HearthOperationToken } from "../lib/hearth-operation-authority";

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
  workspaceId: string;
  workpieceId: string;
  refs: WorkpieceSourceRef[];
  operation: HearthOperationToken;
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
  updateSourceInLibrary: (
    sourceId: string,
    patch: { title?: string; url?: string | null; notes?: string | null },
  ) => Promise<ScriptSource | null>;
  loadSourceDetails: (sourceId: string) => Promise<ScriptSource | null>;
  syncSources: (options?: { silent?: boolean }) => void;
};

export function useSourcesState(
  workspaceId: string | null,
  workpieceId: string | null,
  draftText: string | null | undefined,
  options: { mode?: "summary" | "full"; operationAuthority: HearthOperationAuthority },
): SourcesState {
  const mode = options.mode ?? "summary";
  const operationAuthority = options.operationAuthority;
  const workspaceScopeKey = workspaceId?.trim().toLowerCase() ?? "";
  const sourceScopeKey = `${workspaceScopeKey}:${workpieceId?.trim().toLowerCase() ?? ""}`;
  const [workpieceSourcesState, setWorkpieceSourcesState] = useState(() => ({
    scopeKey: sourceScopeKey,
    refs: readWorkpieceSources(workspaceId, workpieceId),
  }));
  const [sourceIndexState, setSourceIndexState] = useState(() => ({
    scopeKey: workspaceScopeKey,
    entries: readSourceIndex(workspaceId),
  }));
  const [sourceDetailsState, setSourceDetailsState] = useState<{
    scopeKey: string;
    details: Record<string, ScriptSource>;
  }>({ scopeKey: workspaceScopeKey, details: {} });
  const [workspaceIndexState, setWorkspaceIndexState] = useState<{
    scopeKey: string;
    exists: boolean | null;
  }>({ scopeKey: workspaceScopeKey, exists: null });
  const workpieceSources = workpieceSourcesState.scopeKey === sourceScopeKey ? workpieceSourcesState.refs : [];
  const sourceIndexEntries = sourceIndexState.scopeKey === workspaceScopeKey ? sourceIndexState.entries : [];
  const sourceDetails = sourceDetailsState.scopeKey === workspaceScopeKey ? sourceDetailsState.details : {};
  const workspaceIndexExists = workspaceIndexState.scopeKey === workspaceScopeKey ? workspaceIndexState.exists : null;
  const setWorkpieceSources = useCallback((next: SetStateAction<WorkpieceSourceRef[]>) => {
    setWorkpieceSourcesState((previous) => {
      const current = previous.scopeKey === sourceScopeKey ? previous.refs : [];
      const refs = typeof next === "function" ? next(current) : next;
      return { scopeKey: sourceScopeKey, refs };
    });
  }, [sourceScopeKey]);
  const setSourceIndexEntries = useCallback((next: SetStateAction<SourceIndexEntry[]>) => {
    setSourceIndexState((previous) => {
      const current = previous.scopeKey === workspaceScopeKey ? previous.entries : [];
      const entries = typeof next === "function" ? next(current) : next;
      return { scopeKey: workspaceScopeKey, entries };
    });
  }, [workspaceScopeKey]);
  const setSourceDetails = useCallback((next: SetStateAction<Record<string, ScriptSource>>) => {
    setSourceDetailsState((previous) => {
      const current = previous.scopeKey === workspaceScopeKey ? previous.details : {};
      const details = typeof next === "function" ? next(current) : next;
      return { scopeKey: workspaceScopeKey, details };
    });
  }, [workspaceScopeKey]);
  const setWorkspaceIndexExists = useCallback((exists: boolean | null) => {
    setWorkspaceIndexState({ scopeKey: workspaceScopeKey, exists });
  }, [workspaceScopeKey]);
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
    const activeWorkspaceId = workspaceId?.trim() ?? "";
    const activeWorkpieceId = workpieceId?.trim() ?? "";
    if (!activeWorkspaceId || !activeWorkpieceId) return;
    const operation = operationAuthority.begin("sources.workpiece.commit");
    pendingWorkpieceCommit.current = {
      workspaceId: activeWorkspaceId,
      workpieceId: activeWorkpieceId,
      refs,
      operation,
      allowEmpty: options?.allowEmpty,
      silent: options?.silent,
    };
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
          if (!operationAuthority.isCurrent(pending.operation)) continue;
          const fingerprint = JSON.stringify({
            workspaceId: pending.workspaceId,
            workpieceId: pending.workpieceId,
            refs: pending.refs,
          });
          if (fingerprint === workpieceCommitRef.current) {
            continue;
          }
          if (!pending.silent) {
            setStatusWithTimeout({ kind: "saving", message: "Saving sources..." }, 0);
          }
          const result = await commitWorkpieceSourceRefs(pending.workpieceId, pending.refs, {
            allowEmpty: pending.allowEmpty,
          });
          if (!operationAuthority.isCurrent(pending.operation)) continue;
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
  }, [operationAuthority, workpieceId, workspaceId, setStatusWithTimeout]);

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
      writeWorkpieceSourcesCache(workspaceId, workpieceId, next);
      queueWorkpieceCommit(next, { allowEmpty: true });
      return next;
    });
  }, [setStatusWithTimeout, workspaceId, workpieceId, queueWorkpieceCommit]);

  const removeSourceFromWorkpiece = useCallback((sourceId: string) => {
    if (!workpieceId) {
      setStatusWithTimeout({ kind: "error", message: "No workpiece selected." });
      return;
    }
    const normalized = normalizeSourceId(sourceId);
    setWorkpieceSources((prev) => {
      const next = prev.filter((ref) => normalizeSourceId(ref.source_id) !== normalized);
      if (next.length === prev.length) return prev;
      writeWorkpieceSourcesCache(workspaceId, workpieceId, next);
      queueWorkpieceCommit(next, { allowEmpty: true });
      return next;
    });
  }, [setStatusWithTimeout, workspaceId, workpieceId, queueWorkpieceCommit]);

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
      writeWorkpieceSourcesCache(workspaceId, workpieceId, next);
      queueWorkpieceCommit(next, { allowEmpty: true, silent: true });
      return next;
    });
  }, [queueWorkpieceCommit, workspaceId, workpieceId]);

  const loadSourceDetails = useCallback(async (sourceId: string) => {
    if (mode !== "full") return null;
    const normalized = normalizeSourceId(sourceId);
    if (sourceDetails[normalized]) return sourceDetails[normalized];
    if (!workspaceId) {
      setStatusWithTimeout({ kind: "error", message: "Workspace not resolved." });
      return null;
    }
    const operation = operationAuthority.begin(`sources.details:${normalized}`);
    const result = await readWorkspaceSource(workspaceId, sourceId);
    if (!operationAuthority.isCurrent(operation)) return null;
    if (result) {
      setSourceDetails((prev) => ({ ...prev, [normalized]: result }));
      if (!sourceIndexById.has(normalized)) {
        const nextIndex = upsertIndexEntry(sourceIndexEntries, buildIndexEntryFromSource(result));
        setSourceIndexEntries(nextIndex);
        writeSourceIndexCache(workspaceId, nextIndex);
      }
    }
    return result;
  }, [mode, operationAuthority, sourceDetails, workspaceId, setStatusWithTimeout, sourceIndexById, sourceIndexEntries]);

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
    const operation = operationAuthority.begin("sources.library.add");

    setStatusWithTimeout({ kind: "saving", message: "Saving source..." }, 0);
    const sourceResult = await commitWorkspaceSource(workspaceId, source);
    if (!operationAuthority.isCurrent(operation)) return null;
    if (!sourceResult.ok) {
      setStatusWithTimeout({ kind: "error", message: "Failed to save source." });
      return null;
    }

    const nextIndex = upsertIndexEntry(sourceIndexEntries, buildIndexEntryFromSource(source));
    setSourceIndexEntries(nextIndex);
    writeSourceIndexCache(workspaceId, nextIndex);
    setSourceDetails((prev) => ({ ...prev, [normalizeSourceId(source.source_id)]: source }));

    const indexResult = await commitWorkspaceSourcesIndex(workspaceId, nextIndex);
    if (!operationAuthority.isCurrent(operation)) return null;
    if (!indexResult.ok) {
      setStatusWithTimeout({ kind: "error", message: "Saved source, but index update failed." });
      return source;
    }

    setStatusWithTimeout({ kind: "success", message: "Source saved." });

    if (options?.attachToWorkpiece && workpieceId) {
      attachSourceToWorkpiece(source.source_id);
    }

    return source;
  }, [operationAuthority, workspaceId, sourceIndexEntries, setStatusWithTimeout, workpieceId, attachSourceToWorkpiece]);

  const updateSourceInLibrary = useCallback(async (
    sourceId: string,
    patch: { title?: string; url?: string | null; notes?: string | null },
  ) => {
    if (!workspaceId) {
      setStatusWithTimeout({ kind: "error", message: "Workspace not resolved." });
      return null;
    }

    const normalized = normalizeSourceId(sourceId);
    const operation = operationAuthority.begin(`sources.library.update:${normalized}`);
    const existing = sourceDetails[normalized] ?? await readWorkspaceSource(workspaceId, sourceId);
    if (!operationAuthority.isCurrent(operation)) return null;
    if (!existing) {
      setStatusWithTimeout({ kind: "error", message: "Source not found." });
      return null;
    }

    const nextSource: ScriptSource = {
      ...existing,
      title: typeof patch.title === "string" ? patch.title.trim() || existing.title : existing.title,
      url: patch.url !== undefined ? normalizeOptional(patch.url) : (existing.url ?? null),
      notes: patch.notes !== undefined ? normalizeOptional(patch.notes) : (existing.notes ?? null),
    };

    setStatusWithTimeout({ kind: "saving", message: "Updating source..." }, 0);
    const sourceResult = await commitWorkspaceSource(workspaceId, nextSource);
    if (!operationAuthority.isCurrent(operation)) return null;
    if (!sourceResult.ok) {
      setStatusWithTimeout({ kind: "error", message: "Failed to update source." });
      return null;
    }

    const nextIndex = upsertIndexEntry(sourceIndexEntries, buildIndexEntryFromSource(nextSource));
    setSourceIndexEntries(nextIndex);
    writeSourceIndexCache(workspaceId, nextIndex);
    setSourceDetails((prev) => ({ ...prev, [normalized]: nextSource }));

    const indexResult = await commitWorkspaceSourcesIndex(workspaceId, nextIndex);
    if (!operationAuthority.isCurrent(operation)) return null;
    if (!indexResult.ok) {
      setStatusWithTimeout({ kind: "error", message: "Updated source, but index update failed." });
      return nextSource;
    }

    setStatusWithTimeout({ kind: "success", message: "Source updated." });
    return nextSource;
  }, [operationAuthority, workspaceId, setStatusWithTimeout, sourceDetails, sourceIndexEntries]);

  const syncSources = useCallback((options?: { silent?: boolean }) => {
    if (!workpieceId) return;
    queueWorkpieceCommit(workpieceSources, { allowEmpty: false, silent: options?.silent });
  }, [queueWorkpieceCommit, workpieceId, workpieceSources]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const refreshSources = () => {
      setWorkpieceSources(readWorkpieceSources(workspaceId, workpieceId));
      setSourceIndexEntries(readSourceIndex(workspaceId));
      setSourceDetails({});
      setWorkspaceIndexExists(null);
      setStatus({ kind: "idle" });
      workpieceCommitRef.current = null;
    };
    refreshSources();
    const onStorage = (event: StorageEvent) => {
      if (!isSourceRegistryKey(event.key)) return;
      refreshSources();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [workspaceId, workpieceId]);

  useEffect(() => {
    const shouldReadWorkspaceIndex = Boolean(workspaceId) && mode === "full";
    if (!shouldReadWorkspaceIndex && !workpieceId) return;
    let cancelled = false;
    const operation = operationAuthority.begin("sources.canonical.refresh");

    const refreshFromTongs = async () => {
      const tasks: Promise<void>[] = [];

      if (workpieceId) {
        tasks.push(
          readWorkpieceSourceRefs(workpieceId)
            .then((refs) => {
              if (cancelled || !operationAuthority.isCurrent(operation) || !refs) return;
              setWorkpieceSources(refs);
              writeWorkpieceSourcesCache(workspaceId, workpieceId, refs);
              workpieceCommitRef.current = JSON.stringify({ workspaceId, workpieceId, refs });
            })
            .catch(() => {}),
        );
      }

      if (shouldReadWorkspaceIndex && workspaceId) {
        tasks.push(
          readWorkspaceSourcesIndex(workspaceId)
            .then((index) => {
              if (cancelled || !operationAuthority.isCurrent(operation) || !index) return;
              setSourceIndexEntries(index.entries);
              writeSourceIndexCache(workspaceId, index.entries);
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
  }, [mode, operationAuthority, workspaceId, workpieceId]);

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
    updateSourceInLibrary,
    loadSourceDetails,
    syncSources,
  };
}
