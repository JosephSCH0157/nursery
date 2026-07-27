import type {
  HearthReferenceClipsCompletion,
  HearthReferenceClipsProgress,
} from "./hearth-reference-clips-contracts";

export function deriveHearthReferenceClipsCompletion(input: {
  active: boolean;
  loaded: boolean;
  failed: boolean;
  authorityAvailable: boolean;
  progress: HearthReferenceClipsProgress;
}): HearthReferenceClipsCompletion {
  if (!input.active) return { kind: "inactive", complete: false };
  if (!input.authorityAvailable) return { kind: "unavailable", complete: false };
  if (input.failed || !input.loaded) return { kind: "loading", complete: false };
  if (input.progress.planned === 0) return { kind: "empty", complete: false };
  if (input.progress.withCanonicalCandidates !== input.progress.planned) {
    return { kind: "source_incomplete", complete: false };
  }
  if (input.progress.selected !== input.progress.planned) {
    return { kind: "selection_incomplete", complete: false };
  }
  return { kind: "complete", complete: true };
}

export function parseHearthReferenceClipValues(
  value: string,
): Array<number | string> {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const numeric = Number(entry);
      return Number.isFinite(numeric) ? numeric : entry;
    });
}
