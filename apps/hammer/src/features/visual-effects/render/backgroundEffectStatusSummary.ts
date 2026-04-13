import type { HammerBackgroundBlurRuntimeStatus } from "./backgroundBlurPreviewLayer";

type StatusSummary = {
  primaryLine: string;
  primaryDegradedReason: string | null;
  warnings: string[];
  debugLine: string | null;
};

function uniqStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

function resolvePrimaryDegradedReason(status: HammerBackgroundBlurRuntimeStatus): string | null {
  const readiness = status.provider.readiness;
  if (readiness.status === "failed") {
    return readiness.error ? `provider_failed:${readiness.error}` : "provider_failed";
  }
  return status.degradedReason ?? null;
}

function formatWarnings(warnings: string[], maxItems = 3): string | null {
  if (warnings.length === 0) return null;
  const head = warnings.slice(0, maxItems);
  const extra = warnings.length - head.length;
  const base = head.join(", ");
  return extra > 0 ? `${base} (+${extra} more)` : base;
}

export function summarizeBackgroundEffectRuntimeStatus(args: {
  status: HammerBackgroundBlurRuntimeStatus;
  providerLabel?: string | null;
  showDebugDetails?: boolean;
}): StatusSummary {
  const providerLabel = args.providerLabel?.trim() || args.status.provider.name;
  const readiness = args.status.provider.readiness.status;
  const warnings = uniqStrings(args.status.warnings);
  const primaryDegradedReason = resolvePrimaryDegradedReason(args.status);

  const quality = args.status.quality;
  const primaryParts = [
    `Segmentation: ${providerLabel}`,
    readiness,
    `mask ${args.status.mask.status}`,
    args.status.mask.reason ? `reason ${args.status.mask.reason}` : null,
    `quality ${quality.mode} (${quality.policy.maxSegmentationFps}fps)`,
    primaryDegradedReason ? `degraded: ${primaryDegradedReason}` : null,
    args.status.statusMessage,
    warnings.length > 0 ? `warnings: ${formatWarnings(warnings)}` : null,
  ].filter(Boolean);

  let debugLine: string | null = null;
  if (args.showDebugDetails) {
    const debugParts: string[] = [];
    if (args.status.initMs != null) debugParts.push(`init ${args.status.initMs.toFixed(1)}ms`);
    if (args.status.lastConfidence != null) debugParts.push(`confidence ${args.status.lastConfidence.toFixed(2)}`);
    debugParts.push(`provider ${args.status.mask.providerStatus}`);
    debugParts.push(`source ${args.status.mask.providerSource}`);
    if (args.status.mask.resolution) {
      debugParts.push(`mask ${args.status.mask.resolution.width}x${args.status.mask.resolution.height}`);
    }
    if (args.status.mask.generationMs != null) {
      debugParts.push(`mask gen ${args.status.mask.generationMs.toFixed(1)}ms`);
    }
    if (args.status.lastSegmentationMs != null) debugParts.push(`seg ${args.status.lastSegmentationMs.toFixed(1)}ms`);
    if (args.status.lastCompositeMs != null) debugParts.push(`comp ${args.status.lastCompositeMs.toFixed(1)}ms`);
    if (args.status.avgSegmentationMs != null) debugParts.push(`avg seg ${args.status.avgSegmentationMs.toFixed(1)}ms`);
    if (args.status.avgCompositeMs != null) debugParts.push(`avg comp ${args.status.avgCompositeMs.toFixed(1)}ms`);
    if (args.status.effectiveSegmentationFps != null) debugParts.push(`seg fps ${args.status.effectiveSegmentationFps.toFixed(1)}`);
    if (args.status.effectiveCompositeFps != null) debugParts.push(`comp fps ${args.status.effectiveCompositeFps.toFixed(1)}`);
    if (args.status.droppedFrames > 0) debugParts.push(`dropped ${args.status.droppedFrames}`);
    if (args.status.skippedSegmentationFrames > 0) debugParts.push(`skipped seg ${args.status.skippedSegmentationFrames}`);
    if (args.status.reusedMaskFrames > 0) debugParts.push(`reused mask ${args.status.reusedMaskFrames}`);
    debugLine = debugParts.length > 0 ? debugParts.join(" · ") : null;
  }

  return {
    primaryLine: primaryParts.join(" · "),
    primaryDegradedReason,
    warnings,
    debugLine,
  };
}

