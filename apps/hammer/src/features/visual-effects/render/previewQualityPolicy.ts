import type { BackgroundBlurSettings } from "../types";

export type VisualPreviewQualityPolicy = {
  mode: BackgroundBlurSettings["qualityMode"];
  maxSegmentationFps: number;
  edgeFeatherCapPx: number;
  subjectExpansionCapPx: number;
  temporalSmoothingCap: number; // 0..1
};

const QUALITY_POLICIES: Record<BackgroundBlurSettings["qualityMode"], VisualPreviewQualityPolicy> = {
  low: {
    mode: "low",
    maxSegmentationFps: 6,
    edgeFeatherCapPx: 10,
    subjectExpansionCapPx: 6,
    temporalSmoothingCap: 0.5,
  },
  medium: {
    mode: "medium",
    maxSegmentationFps: 10,
    edgeFeatherCapPx: 16,
    subjectExpansionCapPx: 12,
    temporalSmoothingCap: 0.7,
  },
  high: {
    mode: "high",
    maxSegmentationFps: 15,
    edgeFeatherCapPx: 24,
    subjectExpansionCapPx: 18,
    temporalSmoothingCap: 0.85,
  },
};

export function resolveVisualPreviewQualityPolicy(
  mode: BackgroundBlurSettings["qualityMode"],
): VisualPreviewQualityPolicy {
  return QUALITY_POLICIES[mode] ?? QUALITY_POLICIES.medium;
}

