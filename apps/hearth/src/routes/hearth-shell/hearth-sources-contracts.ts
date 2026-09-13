import type { ReactNode } from "react";
import type { ScriptSource, SourceIndexEntry, WorkpieceSourceRef } from "../../domain/source";
import type { HearthResearchResult } from "../../lib/hearth-research-contract";
import type { NewSourceInput, SourcesStatus } from "../../hooks/useSourcesState";

export type HearthSourcesLoadStatus = "idle" | "loaded" | "empty" | "failed";
export type HearthSourcesMutationStatus = "idle" | "saving" | "success" | "failed";

export type HearthSourcesController = {
  state: {
    sources: {
      workpiece: WorkpieceSourceRef[];
      library: SourceIndexEntry[];
      details: Record<string, ScriptSource>;
      indexById: Map<string, SourceIndexEntry>;
      missingWorkpiece: string[];
      missingLibrary: string[];
      unusedWorkpiece: string[];
      missingCitedCount: number;
      unusedRefsCount: number;
    };
    selectedSource: ScriptSource | null;
    search: { query: string };
    notes: Record<string, string | null>;
    provenance: {
      hasWorkspaceIndex: boolean;
      citedSourceIds: Set<string>;
      researchResult: HearthResearchResult | null;
      canonicalPersistence: "idle" | "loading" | "saving" | "saved" | "failed";
      canonicalPersistenceError: string | null;
      canonicalContentHash: string | null;
    };
  };
  commands: {
    refreshSources: (options?: { silent?: boolean }) => void;
    addSource: (
      input: NewSourceInput,
      options?: { attachToWorkpiece?: boolean },
    ) => Promise<ScriptSource | null>;
    removeSource: (sourceId: string) => void;
    selectSource: (sourceId: string) => Promise<ScriptSource | null>;
    updateSourceNotes: (sourceId: string, notes: string) => void;
    updateSource: (
      sourceId: string,
      patch: { title?: string; url?: string | null; notes?: string | null },
    ) => Promise<ScriptSource | null>;
    attachSourceToWorkpiece: (sourceId: string) => void;
    detachSourceFromWorkpiece: (sourceId: string) => void;
    retrySourceLoad: () => void;
    recordResearchResult: (result: HearthResearchResult | null) => void;
  };
  status: {
    load: HearthSourcesLoadStatus;
    mutation: HearthSourcesMutationStatus;
    provenance: "available" | "unavailable";
    detail: SourcesStatus;
  };
  surface: {
    render: () => ReactNode;
  };
};
