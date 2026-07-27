import type { SourcesState } from "../../hooks/useSourcesState";
import type {
  HearthSourcesLoadStatus,
  HearthSourcesMutationStatus,
} from "./hearth-sources-contracts";

export function deriveHearthSourcesLoadStatus(state: SourcesState): HearthSourcesLoadStatus {
  if (state.canonicalLoadFailed) return "failed";
  if (state.workpieceSources.length === 0 && state.sourceIndexEntries.length === 0) return "empty";
  return "loaded";
}

export function deriveHearthSourcesMutationStatus(
  state: SourcesState,
): HearthSourcesMutationStatus {
  if (state.status.kind === "error") return "failed";
  return state.status.kind;
}

export function buildHearthSourceNotes(
  state: SourcesState,
): Record<string, string | null> {
  return Object.fromEntries(
    state.workpieceSources.map((source) => [source.source_id, source.notes ?? null]),
  );
}
