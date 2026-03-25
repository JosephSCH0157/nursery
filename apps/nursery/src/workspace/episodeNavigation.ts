/**
 * Phase-based navigation helpers.
 * Maps episode phases to tool routes and builds safe hrefs using the canonical
 * forge-route-context helpers so query context is preserved correctly.
 */

import type { EpisodePhase } from "./episodePhases";
import { buildForgeRouteHref } from "../lib/forge-route-context";

const PHASE_ROUTE_MAP: Record<EpisodePhase, string> = {
  script: "/apps/hearth",
  record: "/app/anvil",
  edit: "/app/hammer",
  release: "/app/quench",
  analytics: "/app/ledger",
};

export interface GoToPhaseOptions {
  workspaceId?: string | null;
  workpieceId?: string | null;
}

/**
 * Build a navigation href for a given episode phase.
 * Resolves to the canonical tool route and injects workspace/workpiece context
 * via buildForgeRouteHref so existing URL-parsing contracts are respected.
 */
export function buildGoToPhaseHref(
  phase: EpisodePhase,
  options: GoToPhaseOptions = {},
): string {
  return buildForgeRouteHref(PHASE_ROUTE_MAP[phase], {
    workspaceId: options.workspaceId ?? null,
    workpieceId: options.workpieceId ?? null,
  });
}
