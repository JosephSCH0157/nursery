import type { MediaBadgeState } from "../../../../packages/contracts/hammer/media-badge.contract";
import type { ResolveMediaResult } from "../../../../packages/contracts/hammer/media-resolver.contract";
import { mediaBadgeAdapter } from "./resolveMediaBadge";

export interface MediaBadgeViewModel {
  badge: MediaBadgeState;
  tooltip?: string;
  debugTooltip?: string;
}

function joinLines(lines: Array<string | undefined | null>): string {
  return lines.filter(Boolean).join("\n");
}

export function toMediaBadgeViewModel(
  result: ResolveMediaResult,
  devMode: boolean,
): MediaBadgeViewModel {
  const badge = mediaBadgeAdapter.toMediaBadge(result);

  const tooltip = badge.detail
    ?? (badge.kind === "LOCAL"
      ? "Media is available."
      : "Media is not currently available.");

  if (!devMode) {
    // In prod mode: never expose debug details or diagnostics.
    return { badge, tooltip };
  }

  // devMode=true: include debug tooltip content if present.
  // Explicitly written for both variants so future readers do not infer
  // differing diagnostics shapes between "ok" and "unresolved".
  const diagnostics = result.status === "ok"
    ? result.diagnostics
    : result.diagnostics;

  const debugLines: string[] = [];

  if (badge.debug_reason) debugLines.push(`reason: ${badge.debug_reason}`);

  if (diagnostics?.attempted_local_abs) {
    debugLines.push(`local: ${diagnostics.attempted_local_abs}`);
  }
  if (diagnostics?.attempted_cloud_uri) {
    debugLines.push(`cloud: ${diagnostics.attempted_cloud_uri}`);
  }

  if (typeof diagnostics?.checked_exists === "boolean") {
    debugLines.push(`probed_exists: ${String(diagnostics.checked_exists)}`);
  }

  if (diagnostics?.notes?.length) {
    for (const note of diagnostics.notes) {
      debugLines.push(`note: ${note}`);
    }
  }

  const debugTooltip = joinLines(debugLines);

  return {
    badge,
    tooltip,
    debugTooltip: debugTooltip.length ? debugTooltip : undefined,
  };
}

