import type { HammerPersistedVisualPlacements, HammerVisualPlacementRecord } from "../persistence/hammerPersistenceContract";

export type PreviewPlacementDefaults = {
  fit: "contain";
  x: 0.5;
  y: 0.5;
  scale: 1;
};

export type HammerVisualApprovalState = "suggested" | "approved";

export type HammerResolvedActiveVisual = {
  visual: HammerVisualPlacementRecord | null;
  approval_state: HammerVisualApprovalState | null;
  defaults: PreviewPlacementDefaults;
  change_at_sec: number | null;
  reason: "active_match" | "held_previous" | "none";
};

export const HAMMER_PREVIEW_PLACEMENT_DEFAULTS: PreviewPlacementDefaults = {
  fit: "contain",
  x: 0.5,
  y: 0.5,
  scale: 1,
};

function isUsableVisual(placement: HammerVisualPlacementRecord): boolean {
  return Boolean(placement.asset_path || placement.storage_key);
}

function approvalStateForPlacement(placement: HammerVisualPlacementRecord): HammerVisualApprovalState {
  return placement.ingest_state === "approved" ? "approved" : "suggested";
}

export function resolveActiveHammerVisualAtTime(args: {
  visualPlacements: HammerPersistedVisualPlacements | null | undefined;
  timeSec: number;
}): HammerResolvedActiveVisual {
  const placements = (args.visualPlacements?.placements ?? [])
    .filter(isUsableVisual)
    .sort((left, right) => {
      if (left.start_sec !== right.start_sec) return left.start_sec - right.start_sec;
      return left.entry_id.localeCompare(right.entry_id);
    });

  const active = placements.find((placement) => args.timeSec >= placement.start_sec && args.timeSec < placement.end_sec) ?? null;
  if (active) {
    const next = placements.find((placement) => placement.start_sec > active.start_sec) ?? null;
    return {
      visual: active,
      approval_state: approvalStateForPlacement(active),
      defaults: HAMMER_PREVIEW_PLACEMENT_DEFAULTS,
      change_at_sec: next?.start_sec ?? null,
      reason: "active_match",
    };
  }

  const held = [...placements]
    .reverse()
    .find((placement) => placement.start_sec <= args.timeSec) ?? null;
  if (held) {
    const next = placements.find((placement) => placement.start_sec > args.timeSec) ?? null;
    return {
      visual: held,
      approval_state: approvalStateForPlacement(held),
      defaults: HAMMER_PREVIEW_PLACEMENT_DEFAULTS,
      change_at_sec: next?.start_sec ?? null,
      reason: "held_previous",
    };
  }

  return {
    visual: null,
    approval_state: null,
    defaults: HAMMER_PREVIEW_PLACEMENT_DEFAULTS,
    change_at_sec: placements[0]?.start_sec ?? null,
    reason: "none",
  };
}

