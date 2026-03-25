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
  extends Partial<Pick<EpisodeWorkspaceState, "title" | "seriesId" | "status" | "sessionId">> {
  /** Explicit episodeId override. If not provided, falls back to URL workpiece_id. */
  episodeId?: string | null;
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

    ctx.hydrateEpisodeFromPayload({
      episodeId,
      title: payload?.title ?? undefined,
      seriesId: payload?.seriesId ?? undefined,
      status: payload?.status ?? undefined,
      sessionId: payload?.sessionId ?? undefined,
    });
    // Intentionally omit ctx from deps — hydrateEpisodeFromPayload is stable
    // (useCallback with no deps in provider). Re-running when location changes
    // handles navigating to a different workpiece.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    location.search,
    payload?.episodeId,
    payload?.seriesId,
    payload?.sessionId,
    payload?.status,
    payload?.title,
  ]);
}
