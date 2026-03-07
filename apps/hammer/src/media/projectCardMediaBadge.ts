import type {
  ResolveMediaResult,
  ResolveNextAction,
} from "../../../../packages/contracts/hammer/media-resolver.contract";
import { toMediaBadgeViewModel } from "./mediaBadgeViewModel";

export type BadgeVariant = "success" | "warning" | "danger" | "neutral";

export interface MediaCtaPayload {
  action: "OPEN_WORKSPACE_SETTINGS" | "RELINK_MEDIA" | "ENABLE_CLOUD_MEDIA";
  workspaceId?: string;
  mediaId?: string;
}

export interface BadgeChipProps {
  text: string;
  variant: BadgeVariant;
  tooltip?: string;
  ctaText?: string;
  ctaPayload?: MediaCtaPayload;
  debugTooltip?: string;
}

function variantFrom(severity: "ok" | "warn" | "block"): BadgeVariant {
  switch (severity) {
    case "ok":
      return "success";
    case "warn":
      return "warning";
    case "block":
      return "danger";
    default:
      return "neutral";
  }
}

function ctaPayloadFrom(
  nextAction: ResolveNextAction | undefined,
  mediaId: string,
  workspaceId?: string,
): MediaCtaPayload | undefined {
  if (!nextAction || nextAction === "NONE") return undefined;

  if (
    nextAction === "OPEN_WORKSPACE_SETTINGS" ||
    nextAction === "RELINK_MEDIA" ||
    nextAction === "ENABLE_CLOUD_MEDIA"
  ) {
    return {
      action: nextAction,
      workspaceId,
      mediaId,
    };
  }

  // Intentionally ignore unsupported actions until UI semantics are defined.
  return undefined;
}

function ctaTextFrom(nextAction: ResolveNextAction | undefined): string | undefined {
  switch (nextAction) {
    case "OPEN_WORKSPACE_SETTINGS":
      return "Map folder";
    case "RELINK_MEDIA":
      return "Relink";
    case "ENABLE_CLOUD_MEDIA":
      return "Enable cloud";
    default:
      return undefined;
  }
}

export function toProjectCardBadgeChip(
  result: ResolveMediaResult,
  devMode: boolean,
  ctx?: { workspaceId?: string },
): BadgeChipProps {
  const vm = toMediaBadgeViewModel(result, devMode);
  const mediaId = result.media_id;

  return {
    text: vm.badge.label,
    variant: variantFrom(vm.badge.severity),
    tooltip: vm.tooltip,
    debugTooltip: vm.debugTooltip,
    ctaText: vm.badge.cta ?? ctaTextFrom(vm.badge.next_action),
    ctaPayload: ctaPayloadFrom(vm.badge.next_action, mediaId, ctx?.workspaceId),
  };
}

