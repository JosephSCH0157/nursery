import type {
  HearthProductionController,
  HearthProductionControllerInput,
} from "./hearth-production-contracts";

export function buildHearthProductionController(
  input: HearthProductionControllerInput,
): HearthProductionController {
  return {
    state: {
      package: input.package,
      thumbnails: input.thumbnails.state,
      imagePlanning: input.imagePlanning.state,
      broll: input.broll.state,
      referenceClips: input.referenceClips.state,
      metadata: input.metadata.state,
      releasePreparation: input.releasePreparation.state,
    },
    commands: {
      package: { refresh: input.refreshPackage },
      thumbnails: input.thumbnails.commands,
      imagePlanning: input.imagePlanning.commands,
      broll: input.broll.commands,
      referenceClips: input.referenceClips.commands,
      metadata: input.metadata.commands,
      releasePreparation: input.releasePreparation.commands,
    },
    status: {
      package: input.packageStatus,
      thumbnails: input.thumbnails.status,
      imagePlanning: input.imagePlanning.status,
      broll: input.broll.status,
      referenceClips: input.referenceClips.status,
      metadata: input.metadata.status,
      releasePreparation: input.releasePreparation.status,
    },
    surfaces: {
      thumbnails: input.thumbnails.surface,
      visualPlan: input.imagePlanning.surfaces.visualPlan,
      episodeImages: input.imagePlanning.surfaces.episodeImages,
      broll: input.broll.surface,
      referenceClips: input.referenceClips.surface,
      metadata: input.metadata.surface,
      release: input.releasePreparation.surface,
    },
    workflow: {
      releaseSummary: input.releasePreparation.summary,
      blockedReasons: input.releasePreparation.handoff.blockingReasons,
      handoffReady: input.releasePreparation.handoff.ready,
    },
  };
}
