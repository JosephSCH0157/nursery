import { useReferenceClipWorkspace } from "../../hooks/visuals/useReferenceClipWorkspace";
import { useReferenceClipCoreActions } from "../../hooks/visuals/useReferenceClipCoreActions";
import { useReferenceClipBridgeActions } from "../../hooks/visuals/useReferenceClipBridgeActions";
import { buildHearthReferenceClipPanelProps } from "../../views/modes/buildHearthReferenceClipPanelProps";
import type { EpisodeContextualDataCompositePlan } from "../../lib/episode-package-v2";
import type { HearthReferenceClipsController } from "./hearth-reference-clips-contracts";
import { buildHearthReferenceClipsProgress } from "./hearth-reference-clips-progress";
import { deriveHearthReferenceClipsCompletion } from "./buildHearthReferenceClipsViewModel";

export const useHearthReferenceClipsWorkspaceState = useReferenceClipWorkspace;
export const useHearthReferenceClipsCoreCommands = useReferenceClipCoreActions;
export const useHearthReferenceClipsBridgeCommands = useReferenceClipBridgeActions;

export function buildHearthReferenceClipsController(args: {
  active: boolean;
  loaded: boolean;
  loadFailed: boolean;
  authorityAvailable: boolean;
  entries: readonly EpisodeContextualDataCompositePlan[];
  promptActive: boolean;
  busy: boolean;
  error: boolean;
  previewAvailable: boolean;
  retryReferenceClips: () => void;
  surfaceInput: Parameters<typeof buildHearthReferenceClipPanelProps>[0];
}): HearthReferenceClipsController {
  const progress = buildHearthReferenceClipsProgress(args.entries);
  const completion = deriveHearthReferenceClipsCompletion({
    active: args.active,
    loaded: args.loaded,
    failed: args.loadFailed,
    authorityAvailable: args.authorityAvailable,
    progress,
  });
  const candidateCount = args.entries.reduce(
    (total, entry) => total + (entry.candidate_assets?.length ?? 0),
    0,
  );
  return {
    state: {
      plan: {
        entryCount: args.entries.length,
        orderedIds: Object.freeze(args.entries.map((entry) => entry.id)),
      },
      prompts: { active: args.promptActive },
      sources: { suppliedCount: progress.withCanonicalCandidates },
      clips: { canonicalCandidateCount: candidateCount },
      selection: { selectedCount: progress.selected },
      provenance: {
        sourceTypes: Object.freeze(args.entries.map((entry) => entry.source_type)),
      },
      progress: { ...progress, completion },
    },
    commands: { retryReferenceClips: args.retryReferenceClips },
    status: {
      load: !args.active
        ? "inactive"
        : !args.authorityAvailable
          ? "unavailable"
          : args.loadFailed
            ? "error"
            : args.loaded
              ? "loaded"
              : "loading",
      ingestion: args.error ? "error" : args.busy ? "busy" : "idle",
      generation: args.error ? "error" : args.busy ? "busy" : "idle",
      upload: args.error ? "error" : args.busy ? "busy" : "idle",
      selection: args.error ? "error" : args.busy ? "busy" : "idle",
      preview: args.previewAvailable ? "available" : "unavailable",
      authority: args.authorityAvailable ? "available" : "unavailable",
    },
    surface: buildHearthReferenceClipPanelProps(args.surfaceInput),
  };
}
