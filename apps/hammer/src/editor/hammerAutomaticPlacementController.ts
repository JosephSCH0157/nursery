import type { CanonicalAutomaticPlacementResult } from "../features/auto-placement/canonicalPlacementAuthority";
import {
  evaluatePlacementFrameAgainstDisplay,
  type PlacementDisplaySnapshot,
} from "../features/auto-placement/placementFrameDisplayAuthority";

export type HammerAutomaticPlacementCommand = Readonly<{
  selectedPlacementId: string | null;
  authorityResult: CanonicalAutomaticPlacementResult | null;
  displayedFrame: PlacementDisplaySnapshot | null;
  fallback?: Readonly<{
    transform: { leftPct: number; topPct: number; widthPct: number; heightPct: number };
    zone: string;
  }>;
}>;

export type HammerAutomaticPlacementCommandResult =
  | Readonly<{ kind: "refused"; status: string; invalidateEvidence: boolean }>
  | Readonly<{
    kind: "commit";
    placementId: string;
    transform: { leftPct: number; topPct: number; widthPct: number; heightPct: number };
    zone: string;
  }>;

/**
 * Pure final command boundary for automatic placement. It owns no state and
 * cannot mutate history; only an explicit `commit` result may reach the
 * canonical history command supplied by HammerWorkspaceShell.
 */
export function resolveHammerAutomaticPlacementCommand(
  command: HammerAutomaticPlacementCommand,
): HammerAutomaticPlacementCommandResult {
  if (!command.selectedPlacementId) {
    return { kind: "refused", status: "Automatic placement unavailable: select an image clip first.", invalidateEvidence: false };
  }
  if (command.fallback) {
    return {
      kind: "commit",
      placementId: command.selectedPlacementId,
      transform: command.fallback.transform,
      zone: command.fallback.zone,
    };
  }
  const authority = command.authorityResult;
  if (!authority) {
    return { kind: "refused", status: "Automatic placement is waiting for exact-current matte and face analysis.", invalidateEvidence: false };
  }
  if (authority.decision.kind === "refused" || !authority.placement) {
    const reason = authority.decision.kind === "refused"
      ? authority.decision.detail
      : "No safe placement candidate was returned.";
    return { kind: "refused", status: `Automatic placement refused: ${reason} Manual placement remains available.`, invalidateEvidence: false };
  }
  if (!command.displayedFrame) {
    return {
      kind: "refused",
      status: "Automatic placement refused: the displayed preview frame is unavailable. Manual placement remains available.",
      invalidateEvidence: true,
    };
  }
  const display = evaluatePlacementFrameAgainstDisplay(authority.requestedFrameRef, command.displayedFrame);
  if (display.kind === "changed") {
    return {
      kind: "refused",
      status: `Automatic placement refused: the displayed frame changed (${display.reason}). Manual placement remains available.`,
      invalidateEvidence: true,
    };
  }
  const frame = authority.requestedFrameRef;
  const rect = authority.placement.rect;
  return {
    kind: "commit",
    placementId: command.selectedPlacementId,
    transform: {
      leftPct: (rect.x / frame.width) * 100,
      topPct: (rect.y / frame.height) * 100,
      widthPct: (rect.width / frame.width) * 100,
      heightPct: (rect.height / frame.height) * 100,
    },
    zone: authority.placement.zone,
  };
}
