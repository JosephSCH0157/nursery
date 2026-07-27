import type { ComponentProps } from "react";
import type MetadataSurface from "../../views/surfaces/MetadataSurface";
import type VisualsSurface from "../../views/surfaces/VisualsSurface";
import type { HearthProductionController } from "./hearth-production-contracts";

type MetadataPresentationInput = Omit<
  ComponentProps<typeof MetadataSurface>,
  "visible" | "metadataPanelMeta" | "metadataPanelProps"
>;

type VisualsPresentationInput = Omit<
  ComponentProps<typeof VisualsSurface>,
  | "visible"
  | "thumbnailPanelProps"
  | "mediaMapPanelProps"
  | "imageMapPanelProps"
  | "brollPlanPanelProps"
  | "referenceClipPlanPanelProps"
>;

export type HearthProductionViewModelInput = {
  controller: HearthProductionController;
  activeTab: string;
  metadataPanelMeta: string;
  summary: {
    visuals: {
      visualCount: number;
      briefCount: number;
      mediaMapStatus: string;
      coverageLevel: string;
    };
    metadata: {
      titleCount: number;
      tagCount: number;
      complete: boolean;
      framingPackReady: boolean;
    };
  };
  metadata: MetadataPresentationInput;
  visuals: VisualsPresentationInput;
};

export type HearthProductionViewModel = {
  activeSurface: "visuals" | "metadata" | "release" | null;
  status: HearthProductionController["status"];
  workflow: HearthProductionController["workflow"];
  tabSummaries: {
    visuals: string;
    metadata: string;
    release: string;
  };
  release: HearthProductionController["surfaces"]["release"] | null;
  metadata: ComponentProps<typeof MetadataSurface>;
  visuals: ComponentProps<typeof VisualsSurface>;
};

export function buildHearthProductionViewModel(
  input: HearthProductionViewModelInput,
): HearthProductionViewModel {
  const activeSurface = input.activeTab === "visuals"
    ? "visuals"
    : input.activeTab === "metadata"
      ? "metadata"
      : input.activeTab === "release"
        ? "release"
        : null;

  return {
    activeSurface,
    status: input.controller.status,
    workflow: input.controller.workflow,
    tabSummaries: {
      visuals: `${input.summary.visuals.visualCount} visuals${input.summary.visuals.briefCount ? ` · ${input.summary.visuals.briefCount} briefs` : ""} · ${input.summary.visuals.mediaMapStatus.toUpperCase()} · ${input.summary.visuals.coverageLevel}`,
      metadata: `${input.summary.metadata.titleCount} title${input.summary.metadata.titleCount === 1 ? "" : "s"} · ${input.summary.metadata.tagCount} tags · ${input.summary.metadata.complete ? "Complete" : input.summary.metadata.framingPackReady ? "Pack ready" : "Needs work"}`,
      release: input.controller.workflow.releaseSummary,
    },
    release: activeSurface === "release" ? input.controller.surfaces.release : null,
    metadata: {
      ...input.metadata,
      visible: activeSurface === "metadata",
      metadataPanelMeta: input.metadataPanelMeta,
      metadataPanelProps: input.controller.surfaces.metadata,
    },
    visuals: {
      ...input.visuals,
      visible: activeSurface === "visuals",
      thumbnailPanelProps: input.controller.surfaces.thumbnails,
      mediaMapPanelProps: input.controller.surfaces.visualPlan,
      imageMapPanelProps: input.controller.surfaces.episodeImages,
      brollPlanPanelProps: input.controller.surfaces.broll,
      referenceClipPlanPanelProps: input.controller.surfaces.referenceClips,
    },
  };
}
