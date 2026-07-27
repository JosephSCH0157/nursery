import type { EpisodePackageV2 } from "../../lib/episode-package-v2";
import type { HearthBrollController } from "./hearth-broll-contracts";
import type { HearthImagePlanningController } from "./hearth-image-planning-contracts";
import type { HearthMetadataController } from "./hearth-metadata-contracts";
import type { HearthReferenceClipsController } from "./hearth-reference-clips-contracts";
import type { HearthReleasePreparationController } from "./hearth-release-preparation-contracts";
import type { HearthThumbnailController } from "./hearth-thumbnail-contracts";

export type HearthProductionPackageStatus = "idle" | "loading" | "loaded" | "error";

export type HearthProductionController = {
  state: {
    package: EpisodePackageV2 | null;
    thumbnails: HearthThumbnailController["state"];
    imagePlanning: HearthImagePlanningController["state"];
    broll: HearthBrollController["state"];
    referenceClips: HearthReferenceClipsController["state"];
    metadata: HearthMetadataController["state"];
    releasePreparation: HearthReleasePreparationController["state"];
  };
  commands: {
    package: { refresh: () => void };
    thumbnails: HearthThumbnailController["commands"];
    imagePlanning: HearthImagePlanningController["commands"];
    broll: HearthBrollController["commands"];
    referenceClips: HearthReferenceClipsController["commands"];
    metadata: HearthMetadataController["commands"];
    releasePreparation: HearthReleasePreparationController["commands"];
  };
  status: {
    package: HearthProductionPackageStatus;
    thumbnails: HearthThumbnailController["status"];
    imagePlanning: HearthImagePlanningController["status"];
    broll: HearthBrollController["status"];
    referenceClips: HearthReferenceClipsController["status"];
    metadata: HearthMetadataController["status"];
    releasePreparation: HearthReleasePreparationController["status"];
  };
  surfaces: {
    thumbnails: HearthThumbnailController["surface"];
    visualPlan: HearthImagePlanningController["surfaces"]["visualPlan"];
    episodeImages: HearthImagePlanningController["surfaces"]["episodeImages"];
    broll: HearthBrollController["surface"];
    referenceClips: HearthReferenceClipsController["surface"];
    metadata: HearthMetadataController["surface"];
    release: HearthReleasePreparationController["surface"];
  };
  workflow: {
    releaseSummary: string;
    blockedReasons: ReadonlyArray<string>;
    handoffReady: boolean;
  };
};

export type HearthProductionControllerInput = {
  package: EpisodePackageV2 | null;
  packageStatus: HearthProductionPackageStatus;
  refreshPackage: () => void;
  thumbnails: HearthThumbnailController;
  imagePlanning: HearthImagePlanningController;
  broll: HearthBrollController;
  referenceClips: HearthReferenceClipsController;
  metadata: HearthMetadataController;
  releasePreparation: HearthReleasePreparationController;
};
