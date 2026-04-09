import type { SegmentationProvider, SegmentationProviderReadiness } from "../types";
import { MediapipeSelfieSegmentationProvider } from "./mediapipeSelfieSegmentationProvider";
import type { HammerSegmentationProviderCapabilities } from "../../../../../../packages/contracts/hammer/visual-effects-export.contract";

export type SegmentationProviderId =
  | "mediapipe_selfie_segmentation";

export type SegmentationProviderDescriptor = {
  id: SegmentationProviderId;
  displayName: string;
  capabilities: HammerSegmentationProviderCapabilities;
};

export const SEGMENTATION_PROVIDER_DESCRIPTORS: readonly SegmentationProviderDescriptor[] = [
  {
    id: "mediapipe_selfie_segmentation",
    displayName: "MediaPipe Selfie Segmentation",
    capabilities: {
      preview_safe: true,
      export_safe: false,
      supports_frame_source: false,
      notes: [
        "Browser-only provider (MediaPipe Selfie Segmentation).",
        "Export path is planned to run in Server/Node + ffmpeg; this provider is preview-safe only.",
      ],
    },
  },
] as const;

export function resolveSegmentationProviderDescriptor(
  id: string | null | undefined,
): SegmentationProviderDescriptor | null {
  const key = String(id || "").trim();
  if (!key) return null;
  return SEGMENTATION_PROVIDER_DESCRIPTORS.find((value) => value.id === key) ?? null;
}

export function createSegmentationProvider(
  id: SegmentationProviderId,
): SegmentationProvider {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return {
      name: "segmentation_unavailable",
      initialize: async () => {},
      isReady: () => false,
      getReadiness: (): SegmentationProviderReadiness => ({ status: "failed", error: "Segmentation requires a browser runtime." }),
      segmentFrame: async () => {
        throw new Error("Segmentation requires a browser runtime.");
      },
      dispose: async () => {},
    };
  }

  switch (id) {
    case "mediapipe_selfie_segmentation":
      return new MediapipeSelfieSegmentationProvider();
    default: {
      const exhaustive: never = id;
      throw new Error(`Unknown segmentation provider id: ${String(exhaustive)}`);
    }
  }
}

export function isSegmentationProviderId(value: unknown): value is SegmentationProviderId {
  return SEGMENTATION_PROVIDER_DESCRIPTORS.some((descriptor) => descriptor.id === value);
}
