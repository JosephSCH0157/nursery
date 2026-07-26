export type HearthProductionSurfaceId =
  | "visual-plan"
  | "thumbnails"
  | "episode-images"
  | "broll"
  | "reference-clips"
  | "metadata";

export type HearthProductionSurfaceModule = {
  default: unknown;
};

export type HearthProductionSurfaceLoader = () => Promise<HearthProductionSurfaceModule>;

export type HearthProductionSurfaceLoaderRegistry = Record<
  HearthProductionSurfaceId,
  HearthProductionSurfaceLoader
>;

export const HEARTH_PRODUCTION_SURFACE_LOADERS: HearthProductionSurfaceLoaderRegistry = {
  "visual-plan": () => import("../../components/visuals/EpisodeMediaMapPanel"),
  thumbnails: () => import("../../components/visuals/ThumbnailV3Panel"),
  "episode-images": () => import("../../components/visuals/ImageMapPanel"),
  broll: () => import("../../components/visuals/BrollPlanPanel"),
  "reference-clips": () => import("../../components/visuals/ReferenceClipPlanPanel"),
  metadata: () => import("../../components/metadata/MetadataPanel"),
};

export function loadHearthProductionSurface(
  surface: HearthProductionSurfaceId,
  registry: HearthProductionSurfaceLoaderRegistry = HEARTH_PRODUCTION_SURFACE_LOADERS,
): Promise<HearthProductionSurfaceModule> {
  return registry[surface]();
}
