/**
 * useWorkspaceBootstrap — lightweight tool-entry adapter.
 *
 * Reads workpiece/workspace identity from URL params (via parseForgeRouteContext)
 * and an optional explicit payload, then hydrates EpisodeWorkspaceContext
 * idempotently. Safe to call on every render; actual context writes are
 * batched via the hydrate function which no-ops on matching IDs.
 *
 * Does NOT override canonical persisted state. Fails gracefully when
 * EpisodeWorkspaceContext is not available (tools launched standalone
 * without the provider still work normally).
 */

import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { parseForgeRouteContext } from "../lib/forge-route-context";
import { useOptionalEpisodeWorkspace } from "../workspace/EpisodeWorkspaceContext";
import type { EpisodeWorkspaceState } from "../workspace/EpisodeWorkspaceContext";

export interface WorkspaceBootstrapPayload
  extends Partial<Pick<EpisodeWorkspaceState, "title" | "seriesTitle" | "displayStatus" | "sessionId" | "phase">> {
  /** Explicit episodeId override. If not provided, falls back to URL workpiece_id. */
  episodeId?: string | null;
  /** Legacy alias; maps to seriesTitle. */
  seriesId?: string | null;
  /** Legacy alias; maps to displayStatus. */
  status?: string | null;
}

/**
 * Call at the entry point of each tool to sync URL/payload identity into the
 * shared EpisodeWorkspaceContext.
 *
 * @param payload Optional explicit launch payload values. URL params are always
 *                read as well; payload values take precedence for non-null fields.
 */
export function useWorkspaceBootstrap(payload?: WorkspaceBootstrapPayload): void {
  const location = useLocation();
  const ctx = useOptionalEpisodeWorkspace();

  useEffect(() => {
    if (!ctx) return;

    const routeCtx = parseForgeRouteContext(location.search);
    const episodeId = payload?.episodeId ?? routeCtx.workpieceId;

    if (!episodeId) return;

    ctx.setEpisodeContextLoading(episodeId);

    ctx.hydrateEpisodeFromPayload({
      episodeId,
      title: payload?.title ?? undefined,
      seriesTitle: payload?.seriesTitle ?? payload?.seriesId ?? undefined,
      displayStatus: payload?.displayStatus ?? payload?.status ?? undefined,
      phase: payload?.phase ?? undefined,
      sessionId: payload?.sessionId ?? undefined,
    });
    // Intentionally omit ctx from deps — hydrateEpisodeFromPayload is stable
    // (useCallback with no deps in provider). Re-running when location changes
    // handles navigating to a different workpiece.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    location.search,
    payload?.displayStatus,
    payload?.episodeId,
    payload?.phase,
    payload?.seriesId,
    payload?.seriesTitle,
    payload?.sessionId,
    payload?.status,
    payload?.title,
  ]);
}
