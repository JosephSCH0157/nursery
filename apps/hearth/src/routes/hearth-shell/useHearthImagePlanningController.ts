import { useMediaMapWorkspace } from "../../hooks/visuals/useMediaMapWorkspace";
import { useImageMapWorkspace } from "../../hooks/visuals/useImageMapWorkspace";
import { useMediaMapEntryActions } from "../../hooks/visuals/useMediaMapEntryActions";
import { useMediaMapGenerationActions } from "../../hooks/visuals/useMediaMapGenerationActions";
import { useImageMapReanchorActions } from "../../hooks/visuals/useImageMapReanchorActions";
import { useImageMapCandidateActions } from "../../hooks/visuals/useImageMapCandidateActions";
import { useImageMapEntryCrudActions } from "../../hooks/visuals/useImageMapEntryCrudActions";
import { useImageMapSeedExportActions } from "../../hooks/visuals/useImageMapSeedExportActions";
import { useMediaMapSourcePreparation } from "../../hooks/visuals/useMediaMapSourcePreparation";
import { useImageMapViewActions } from "../../hooks/visuals/useImageMapViewActions";
import { useCanonicalImageMapScriptReader } from "../../hooks/visuals/useCanonicalImageMapScriptReader";
import { useImageMapCandidatePreviewLoader } from "../../hooks/visuals/useImageMapCandidatePreviewLoader";
import { useMediaMapConversationBootstrap } from "../../hooks/visuals/useMediaMapConversationBootstrap";
import { useCanonicalImageMapScriptStateLoader } from "../../hooks/visuals/useCanonicalImageMapScriptStateLoader";
import { buildHearthImageMapPanelProps } from "../../views/modes/buildHearthImageMapPanelProps";
import { buildHearthMediaMapPanelProps } from "../../views/modes/buildHearthMediaMapPanelProps";
import type { HearthImagePlanningController } from "./hearth-image-planning-contracts";
import { buildHearthImageMapProgress } from "./hearth-image-map-progress";
import { deriveHearthImagePlanningCompletion } from "./buildHearthImagePlanningViewModel";

export const useHearthVisualPlanWorkspaceState = useMediaMapWorkspace;
export const useHearthEpisodeImagesWorkspaceState = useImageMapWorkspace;
export const useHearthVisualPlanEntryCommands = useMediaMapEntryActions;
export const useHearthVisualPlanGenerationCommands = useMediaMapGenerationActions;
export const useHearthImageMapReanchorCommands = useImageMapReanchorActions;
export const useHearthImageCandidateCommands = useImageMapCandidateActions;
export const useHearthImageEntryCommands = useImageMapEntryCrudActions;
export const useHearthImageSeedExportCommands = useImageMapSeedExportActions;
export const useHearthVisualPlanSourcePreparation = useMediaMapSourcePreparation;
export const useHearthImageMapViewCommands = useImageMapViewActions;
export const useHearthCanonicalImageMapScriptReader = useCanonicalImageMapScriptReader;
export const useHearthImageCandidatePreviewLifecycle = useImageMapCandidatePreviewLoader;
export const useHearthVisualPlanConversationBootstrap = useMediaMapConversationBootstrap;
export const useHearthCanonicalImageMapScriptLifecycle = useCanonicalImageMapScriptStateLoader;

export function buildHearthImagePlanningController(args: {
  active: boolean;
  authorityAvailable: boolean;
  imageMapLoaded: boolean;
  visualPlanEntryCount: number;
  visualPlanStale: boolean;
  canonicalEntryCount: number;
  selectedEntryCount: number;
  unresolvedEntryCount: number;
  visualPlanBusy: boolean;
  visualPlanError: boolean;
  repairBusy: boolean;
  repairError: boolean;
  generationBusy: boolean;
  generationError: boolean;
  selectionBusy: boolean;
  selectionError: boolean;
  retryImagePlanningLoad: () => void;
  visualPlanSurfaceInput: Parameters<typeof buildHearthMediaMapPanelProps>[0];
  episodeImagesSurfaceInput: Parameters<typeof buildHearthImageMapPanelProps>[0];
}): HearthImagePlanningController {
  const progress = buildHearthImageMapProgress({
    planned: args.visualPlanEntryCount,
    canonical: args.canonicalEntryCount,
    selected: args.selectedEntryCount,
    unresolved: args.unresolvedEntryCount,
  });
  const completion = deriveHearthImagePlanningCompletion({
    active: args.active,
    loaded: args.imageMapLoaded,
    authorityAvailable: args.authorityAvailable,
    progress,
  });
  return {
    state: {
      visualPlan: { entryCount: args.visualPlanEntryCount, stale: args.visualPlanStale },
      imageMap: { entryCount: args.canonicalEntryCount, loaded: args.imageMapLoaded },
      moments: { planned: progress.planned, canonical: progress.canonical },
      candidates: { selected: progress.selected },
      selection: { complete: completion.complete },
      anchorVerification: { unresolved: progress.unresolved },
      progress: { ...progress, completion },
    },
    commands: { retryImagePlanningLoad: args.retryImagePlanningLoad },
    status: {
      visualPlan: args.visualPlanError ? "error" : args.visualPlanBusy ? "busy" : "idle",
      imageMap: !args.active
        ? "inactive"
        : !args.authorityAvailable
          ? "unavailable"
          : args.imageMapLoaded
            ? "loaded"
            : "loading",
      repair: args.repairError ? "error" : args.repairBusy ? "busy" : "idle",
      generation: args.generationError ? "error" : args.generationBusy ? "busy" : "idle",
      upload: args.generationError ? "error" : args.generationBusy ? "busy" : "idle",
      selection: args.selectionError ? "error" : args.selectionBusy ? "busy" : "idle",
      authority: args.authorityAvailable ? "available" : "unavailable",
    },
    surfaces: {
      visualPlan: buildHearthMediaMapPanelProps(args.visualPlanSurfaceInput),
      episodeImages: buildHearthImageMapPanelProps(args.episodeImagesSurfaceInput),
    },
    brollEligibilityInput: Object.freeze({
      eligible: completion.brollEligible,
      reason: completion.kind,
    }),
  };
}
