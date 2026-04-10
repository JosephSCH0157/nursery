import type { FaceLandmarkProvider, FaceLandmarkProviderReadiness } from "../types";
import { MediapipeFaceLandmarkerProvider } from "./mediapipeFaceLandmarkerProvider";

export type FaceLandmarkProviderId =
  | "mediapipe_face_landmarker";

export type FaceLandmarkProviderDescriptor = {
  id: FaceLandmarkProviderId;
  displayName: string;
  capabilities: {
    preview_safe: true;
    export_safe: false;
    notes?: string[];
  };
};

export const FACE_LANDMARK_PROVIDER_DESCRIPTORS: readonly FaceLandmarkProviderDescriptor[] = [
  {
    id: "mediapipe_face_landmarker",
    displayName: "MediaPipe Face Landmarker",
    capabilities: {
      preview_safe: true,
      export_safe: false,
      notes: [
        "Browser-only provider (MediaPipe Tasks Vision Face Landmarker).",
        "Phase 1: preview-only. Export rendering is intentionally not supported.",
      ],
    },
  },
] as const;

export function resolveFaceLandmarkProviderDescriptor(
  id: string | null | undefined,
): FaceLandmarkProviderDescriptor | null {
  const key = String(id || "").trim();
  if (!key) return null;
  return FACE_LANDMARK_PROVIDER_DESCRIPTORS.find((value) => value.id === key) ?? null;
}

export function isFaceLandmarkProviderId(value: unknown): value is FaceLandmarkProviderId {
  return FACE_LANDMARK_PROVIDER_DESCRIPTORS.some((descriptor) => descriptor.id === value);
}

export function createFaceLandmarkProvider(
  id: FaceLandmarkProviderId,
): FaceLandmarkProvider {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return {
      name: "face_landmarks_unavailable",
      initialize: async () => {},
      isReady: () => false,
      getReadiness: (): FaceLandmarkProviderReadiness => ({ status: "failed", error: "Face landmark analysis requires a browser runtime." }),
      analyzeFrame: async () => {
        throw new Error("Face landmark analysis requires a browser runtime.");
      },
      dispose: async () => {},
    };
  }

  switch (id) {
    case "mediapipe_face_landmarker":
      return new MediapipeFaceLandmarkerProvider();
    default: {
      const exhaustive: never = id;
      throw new Error(`Unknown face landmark provider id: ${String(exhaustive)}`);
    }
  }
}

