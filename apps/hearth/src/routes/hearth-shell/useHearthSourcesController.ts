import { createElement, useState } from "react";
import { useSourcesState } from "../../hooks/useSourcesState";
import type { HearthOperationAuthority } from "../../lib/hearth-operation-authority";
import { selectActiveHearthResearchResult, type ScopedHearthResearchResult } from "../../lib/hearth-research-scope";
import SourcesView from "../../views/SourcesView";
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
  const researchResult = selectActiveHearthResearchResult(recordedResearchResult, workspaceId, workpieceId);

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
      recordResearchResult: (result) => setRecordedResearchResult({ workspaceId, workpieceId, result }),
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
        createElement(SourcesView, {
          state: sources,
          workspaceId,
          workpieceId,
          draftId,
          researchResult,
        }),
      ),
    },
  };
}
