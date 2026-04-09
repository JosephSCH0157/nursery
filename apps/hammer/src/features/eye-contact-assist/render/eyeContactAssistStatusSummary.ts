import type { HammerEyeContactAssistRuntimeStatus } from "./eyeContactAssistPreviewLayer";

type StatusSummary = {
  primaryLine: string;
  primaryDisabledReason: string | null;
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

function formatWarnings(warnings: string[], maxItems = 3): string | null {
  if (warnings.length === 0) return null;
  const head = warnings.slice(0, maxItems);
  const extra = warnings.length - head.length;
  const base = head.join(", ");
  return extra > 0 ? `${base} (+${extra} more)` : base;
}

export function summarizeEyeContactAssistRuntimeStatus(args: {
  status: HammerEyeContactAssistRuntimeStatus;
  providerLabel?: string | null;
  showDebugDetails?: boolean;
}): StatusSummary {
  const providerLabel = args.providerLabel?.trim() || args.status.provider.name;
  const readiness = args.status.provider.readiness.status;
  const warnings = uniqStrings(args.status.warnings);

  const disabled = args.status.active ? null : (args.status.disabledReason ?? "disabled");
  const primaryParts = [
    `Eye Contact: ${providerLabel}`,
    readiness,
    args.status.enabled ? `strength ${args.status.strength.toFixed(2)}` : "toggle off",
    disabled ? `disabled: ${disabled}` : "active",
    warnings.length > 0 ? `warnings: ${formatWarnings(warnings)}` : null,
  ].filter(Boolean);

  let debugLine: string | null = null;
  if (args.showDebugDetails) {
    const debugParts: string[] = [];
    if (args.status.confidence.frame != null) debugParts.push(`frame ${args.status.confidence.frame.toFixed(2)}`);
    if (args.status.confidence.gaze != null) debugParts.push(`gaze ${args.status.confidence.gaze.toFixed(2)}`);
    if (args.status.pose?.yawDeg != null) debugParts.push(`yaw ${args.status.pose.yawDeg.toFixed(1)}°`);
    if (args.status.pose?.pitchDeg != null) debugParts.push(`pitch ${args.status.pose.pitchDeg.toFixed(1)}°`);
    if (args.status.pose?.rollDeg != null) debugParts.push(`roll ${args.status.pose.rollDeg.toFixed(1)}°`);
    if (args.status.correction.smoothingWeight != null) debugParts.push(`smooth ${args.status.correction.smoothingWeight.toFixed(2)}`);
    if (args.status.timing.lastProviderMs != null) debugParts.push(`provider ${args.status.timing.lastProviderMs.toFixed(1)}ms`);
    if (args.status.timing.lastRenderMs != null) debugParts.push(`render ${args.status.timing.lastRenderMs.toFixed(1)}ms`);
    debugLine = debugParts.length > 0 ? debugParts.join(" · ") : null;
  }

  return {
    primaryLine: primaryParts.join(" · "),
    primaryDisabledReason: disabled,
    warnings,
    debugLine,
  };
}

