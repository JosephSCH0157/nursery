import type {
  MediaBadgeAdapter,
  MediaBadgeState,
} from "../../../../packages/contracts/hammer/media-badge.contract";
import type { ResolveMediaResult } from "../../../../packages/contracts/hammer/media-resolver.contract";

function fallbackDetail(result: ResolveMediaResult): string {
  if (result.status === "ok") return "Media is available on this machine.";
  return result.user_message || "Hammer cannot resolve this media reference.";
}

export const mediaBadgeAdapter: MediaBadgeAdapter = {
  toMediaBadge(result: ResolveMediaResult): MediaBadgeState {
    if (result.status === "ok") {
      return {
        kind: "LOCAL",
        severity: "ok",
        label: "Media: Local",
        detail: fallbackDetail(result),
      };
    }

    switch (result.reason) {
      case "CLOUD_DISABLED":
        return {
          kind: "CLOUD_DISABLED",
          severity: "block",
          label: "Media: Cloud disabled",
          cta: "Enable cloud",
          detail:
            "This media is referenced in the cloud, but cloud media is currently disabled.",
          next_action: result.next_action,
          debug_reason: result.reason,
        };

      case "NO_WORKSPACE_MAPPING":
        return {
          kind: "MISSING",
          severity: "block",
          label: "Media: Not mapped",
          cta: "Map folder",
          detail:
            "This workspace does not have a media folder mapped on this machine.",
          next_action: result.next_action,
          debug_reason: result.reason,
        };

      case "MISSING_LOCAL_FILE":
        return {
          kind: "MISSING",
          severity: "warn",
          label: "Media: Missing",
          cta: "Relink",
          detail: "The media file was not found in the mapped folder.",
          next_action: result.next_action,
          debug_reason: result.reason,
        };

      case "CLOUD_UNREACHABLE":
        return {
          kind: "MISSING",
          severity: "warn",
          label: "Media: Cloud unavailable",
          cta: "Retry",
          detail: fallbackDetail(result),
          next_action: result.next_action,
          debug_reason: result.reason,
        };

      case "PERMISSION_DENIED":
        return {
          kind: "MISSING",
          severity: "block",
          label: "Media: Access denied",
          cta: result.next_action !== "NONE" ? "Retry" : undefined,
          detail: fallbackDetail(result),
          next_action: result.next_action,
          debug_reason: result.reason,
        };

      case "NO_USABLE_POINTER":
      case "UNKNOWN":
      default:
        return {
          kind: "MISSING",
          severity: "warn",
          label: "Media: Unavailable",
          cta: result.next_action !== "NONE" ? "Fix" : undefined,
          detail: fallbackDetail(result),
          next_action: result.next_action,
          debug_reason: result.reason,
        };
    }
  },
};

