import { createElement, useCallback, useEffect, useRef, useState } from "react";
import { useSourcesState } from "../../hooks/useSourcesState";
import type { HearthOperationAuthority } from "../../lib/hearth-operation-authority";
import { selectActiveHearthResearchResult, type ScopedHearthResearchResult } from "../../lib/hearth-research-scope";
import HearthSourcesPresentation from "./HearthSourcesPresentation";
import {
  buildHearthSourceNotes,
  deriveHearthSourcesLoadStatus,
  deriveHearthSourcesMutationStatus,
} from "./buildHearthSourcesViewModel";
import type { HearthSourcesController } from "./hearth-sources-contracts";

type UseHearthSourcesControllerArgs = {
  workspaceId: string | null;
  workpieceId: string | null;
  draftId: string | null;
  draftText: string;
  mode: "summary" | "full";
  operationAuthority: HearthOperationAuthority;
};

export function useHearthSourcesController({
  workspaceId,
  workpieceId,
  draftId,
  draftText,
  mode,
  operationAuthority,
}: UseHearthSourcesControllerArgs): HearthSourcesController {
  const sources = useSourcesState(workspaceId, workpieceId, draftText, {
    mode,
    operationAuthority,
  });
  const [recordedResearchResult, setRecordedResearchResult] = useState<ScopedHearthResearchResult | null>(null);
  const [canonicalPersistence, setCanonicalPersistence] = useState<"idle" | "loading" | "saving" | "saved" | "failed">("idle");
  const [canonicalPersistenceError, setCanonicalPersistenceError] = useState<string | null>(null);
  const [canonicalContentHash, setCanonicalContentHash] = useState<string | null>(null);
  const authorityScopeRef = useRef("");
  authorityScopeRef.current = `${workspaceId ?? ""}:${workpieceId ?? ""}`;
  const researchResult = selectActiveHearthResearchResult(recordedResearchResult, workspaceId, workpieceId);

  useEffect(() => {
    if (!workspaceId || !workpieceId) {
      setRecordedResearchResult(null);
      setCanonicalPersistence("idle");
      setCanonicalPersistenceError(null);
      setCanonicalContentHash(null);
      return;
    }
    let cancelled = false;
    setCanonicalPersistence("loading");
    setCanonicalPersistenceError(null);
    void import("../../lib/hearth-research-preflight-authority")
      .then(({ readCanonicalHearthResearch }) => readCanonicalHearthResearch({ workspaceId, workpieceId }))
      .then((authority) => {
      if (cancelled) return;
      if (authority) setRecordedResearchResult({ workspaceId, workpieceId, result: authority.result });
      setCanonicalContentHash(authority?.contentHash ?? null);
      setCanonicalPersistence(authority ? "saved" : "idle");
    }).catch((error: unknown) => {
      if (cancelled) return;
      setCanonicalPersistence("failed");
      setCanonicalPersistenceError(error instanceof Error ? error.message : "Canonical research could not be loaded.");
    });
    return () => { cancelled = true; };
  }, [workspaceId, workpieceId]);

  const recordResearchResult = useCallback((result: Parameters<HearthSourcesController["commands"]["recordResearchResult"]>[0]) => {
    setRecordedResearchResult({ workspaceId, workpieceId, result });
    if (!result || !workspaceId || !workpieceId) return;
    setCanonicalPersistence("saving");
    setCanonicalPersistenceError(null);
    const authorityScope = `${workspaceId}:${workpieceId}`;
    void import("../../lib/hearth-research-preflight-authority")
      .then(({ commitCanonicalHearthResearch }) => commitCanonicalHearthResearch({ workspaceId, workpieceId, result }))
      .then((authority) => {
      if (authorityScopeRef.current !== authorityScope) return;
      if (authority) setRecordedResearchResult({ workspaceId, workpieceId, result: authority.result });
      if (authority) setCanonicalContentHash(authority.contentHash);
      setCanonicalPersistence(authority ? "saved" : "idle");
    }).catch((error: unknown) => {
      if (authorityScopeRef.current !== authorityScope) return;
      const message = error instanceof Error ? error.message : "Canonical research was not saved.";
      setCanonicalPersistence("failed");
      setCanonicalPersistenceError(`${message} The result remains visible in this session; retry research or reload after connectivity returns.`);
      try { console.warn("[hearth-research] canonical evidence save pending retry", { message }); } catch { /* logging is best effort */ }
    });
  }, [workspaceId, workpieceId]);

  return {
    state: {
      sources: {
        workpiece: sources.workpieceSources,
        library: sources.sourceIndexEntries,
        details: sources.sourceDetails,
        indexById: sources.sourceIndexById,
        missingWorkpiece: sources.missingWorkpieceSources,
        missingLibrary: sources.missingLibrarySources,
        unusedWorkpiece: sources.unusedWorkpieceSources,
        missingCitedCount: sources.missingCitedCount,
        unusedRefsCount: sources.unusedRefsCount,
      },
      selectedSource: null,
      search: { query: "" },
      notes: buildHearthSourceNotes(sources),
      provenance: {
        hasWorkspaceIndex: sources.hasWorkspaceIndex,
        citedSourceIds: sources.citedSourceIds,
        researchResult,
        canonicalPersistence,
        canonicalPersistenceError,
        canonicalContentHash,
      },
    },
    commands: {
      refreshSources: sources.syncSources,
      addSource: sources.addSourceToLibrary,
      removeSource: sources.removeSourceFromWorkpiece,
      selectSource: sources.loadSourceDetails,
      updateSourceNotes: sources.updateWorkpieceSourceNotes,
      updateSource: sources.updateSourceInLibrary,
      attachSourceToWorkpiece: sources.attachSourceToWorkpiece,
      detachSourceFromWorkpiece: sources.removeSourceFromWorkpiece,
      retrySourceLoad: sources.syncSources,
      recordResearchResult,
    },
    status: {
      load: deriveHearthSourcesLoadStatus(sources),
      mutation: deriveHearthSourcesMutationStatus(sources),
      provenance: sources.hasWorkspaceIndex ? "available" : "unavailable",
      detail: sources.status,
    },
    surface: {
      render: () => createElement(
        "section",
        { className: "hs-sources-view" },
        createElement(HearthSourcesPresentation, {
          state: sources,
          workspaceId,
          workpieceId,
          draftId,
          researchResult,
          canonicalPersistence,
          canonicalPersistenceError,
        }),
      ),
    },
  };
}
