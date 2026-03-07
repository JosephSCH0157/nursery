import type {
  ResolveMediaResult,
  ResolveNextAction,
  ResolveUnresolvedReason,
} from "./media-resolver.contract";

export type MediaBadgeSeverity = "ok" | "warn" | "block";

export type MediaBadgeKind =
  | "LOCAL"
  | "MISSING"
  | "CLOUD_DISABLED";

export interface MediaBadgeState {
  kind: MediaBadgeKind;
  severity: MediaBadgeSeverity;
  label: string;

  /**
   * CTA is optional UI copy indicating the likely next user action.
   * Keep short. Examples: "Map folder", "Relink", "Enable cloud".
   */
  cta?: string;

  /**
   * Tooltip detail. Can include resolver reason codes in debug mode,
   * but default should be user-readable.
   */
  detail?: string;

  /**
   * Useful for UI click-handlers:
   * - OPEN_WORKSPACE_SETTINGS
   * - RELINK_MEDIA
   * - ENABLE_CLOUD_MEDIA
   */
  next_action?: ResolveNextAction;

  // Optional diagnostics for dev mode UI.
  debug_reason?: ResolveUnresolvedReason;
}

export interface MediaBadgeAdapter {
  toMediaBadge(result: ResolveMediaResult): MediaBadgeState;
}

