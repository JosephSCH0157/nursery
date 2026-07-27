import type { buildHearthReferenceClipPanelProps } from "../../views/modes/buildHearthReferenceClipPanelProps";

export type HearthReferenceClipsProgress = {
  planned: number;
  withCanonicalCandidates: number;
  selected: number;
};

export type HearthReferenceClipsCompletion =
  | { kind: "inactive"; complete: false }
  | { kind: "loading"; complete: false }
  | { kind: "unavailable"; complete: false }
  | { kind: "empty"; complete: false }
  | { kind: "source_incomplete"; complete: false }
  | { kind: "selection_incomplete"; complete: false }
  | { kind: "complete"; complete: true };

export type HearthReferenceClipsController = {
  state: {
    plan: { entryCount: number; orderedIds: readonly string[] };
    prompts: { active: boolean };
    sources: { suppliedCount: number };
    clips: { canonicalCandidateCount: number };
    selection: { selectedCount: number };
    provenance: { sourceTypes: readonly string[] };
    progress: HearthReferenceClipsProgress & {
      completion: HearthReferenceClipsCompletion;
    };
  };
  commands: {
    retryReferenceClips: () => void;
  };
  status: {
    load: "inactive" | "loading" | "loaded" | "unavailable" | "error";
    ingestion: "idle" | "busy" | "error";
    generation: "idle" | "busy" | "error";
    upload: "idle" | "busy" | "error";
    selection: "idle" | "busy" | "error";
    preview: "idle" | "available" | "unavailable";
    authority: "available" | "unavailable";
  };
  surface: ReturnType<typeof buildHearthReferenceClipPanelProps>;
};
