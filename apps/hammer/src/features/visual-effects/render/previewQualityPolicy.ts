import type { BackgroundBlurSettings } from "../types";

export type VisualPreviewQualityPolicy = {
  mode: BackgroundBlurSettings["qualityMode"];
  maxSegmentationFps: number;
  maxAnalysisLongEdgePx: number;
  edgeFeatherCapPx: number;
  subjectExpansionCapPx: number;
  temporalSmoothingCap: number; // 0..1
};

const QUALITY_POLICIES: Record<BackgroundBlurSettings["qualityMode"], VisualPreviewQualityPolicy> = {
  low: {
    mode: "low",
    maxSegmentationFps: 6,
    maxAnalysisLongEdgePx: 256,
    edgeFeatherCapPx: 10,
    subjectExpansionCapPx: 6,
    temporalSmoothingCap: 0.5,
  },
  medium: {
    mode: "medium",
    maxSegmentationFps: 10,
    maxAnalysisLongEdgePx: 384,
    edgeFeatherCapPx: 16,
    subjectExpansionCapPx: 12,
    temporalSmoothingCap: 0.7,
  },
  high: {
    mode: "high",
    maxSegmentationFps: 15,
    maxAnalysisLongEdgePx: 512,
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

