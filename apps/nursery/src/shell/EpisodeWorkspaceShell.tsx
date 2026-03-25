/**
 * EpisodeWorkspaceShell — thin wrapper that injects the episode identity banner
 * above any tool when an episode is active.
 *
 * Usage in routes:
 *   <EpisodeWorkspaceShell>
 *     <HearthStandalone />
 *   </EpisodeWorkspaceShell>
 *
 * When no episode context exists the shell renders children without any banner,
 * preserving the original tool experience exactly.
 */

import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { parseForgeRouteContext } from "../lib/forge-route-context";
import { EPISODE_PHASE_LABELS, resolvePhaseFromPathname } from "../workspace/episodePhases";
import { useOptionalEpisodeWorkspace } from "../workspace/EpisodeWorkspaceContext";
import EpisodeWorkspaceHeader from "./EpisodeWorkspaceHeader";
import EpisodeContextDebugOverlay from "./EpisodeContextDebugOverlay";
import "./EpisodeWorkspacePrimitives.css";
import "./EpisodeWorkspaceShell.css";

interface EpisodeWorkspaceShellProps {
  children: ReactNode;
  /** Forward the current URL workpiece_id so the header can build phase links */
  workpieceId?: string | null;
}

export default function EpisodeWorkspaceShell({
  children,
  workpieceId,
}: EpisodeWorkspaceShellProps) {
  const ctx = useOptionalEpisodeWorkspace();
  const location = useLocation();
  const routeContext = parseForgeRouteContext(location.search);
  const requestedEpisodeId = workpieceId ?? routeContext.workpieceId;
  const hasEpisode = Boolean(
    requestedEpisodeId
    && ctx?.episode?.episodeId
    && ctx.episode.episodeId === requestedEpisodeId
    && ctx.episode.contextState === "active",
  );
  const isLoading = Boolean(
    requestedEpisodeId
    && ctx?.episode?.episodeId
    && ctx.episode.episodeId === requestedEpisodeId
    && ctx.episode.contextState === "loading",
  );
  const isMissing = Boolean(
    requestedEpisodeId
    && ctx?.episode?.episodeId
    && ctx.episode.episodeId === requestedEpisodeId
    && ctx.episode.contextState === "missing",
  );
  const routePhase = resolvePhaseFromPathname(location.pathname);

  return (
    <>
      {isLoading && (
        <div className="ew-header ew-header--loading" role="status" aria-live="polite">
          <div className="ew-header__loading">
            <span className="forge-phase-badge">{EPISODE_PHASE_LABELS[routePhase]}</span>
            <span className="ew-header__loading-title">
              <span className="ew-header__loading-pulse" aria-hidden="true" />
              Resolving episode…
            </span>
          </div>
        </div>
      )}
      {isMissing && (
        <div className="ew-header ew-header--missing" role="alert">
          <div className="ew-header__missing">
            <span className="forge-phase-badge forge-phase-badge--muted">{EPISODE_PHASE_LABELS[routePhase]}</span>
            <span className="ew-header__missing-label">Episode not found</span>
            <span className="ew-header__missing-hint">This episode may have been removed or the link is no longer valid.</span>
          </div>
        </div>
      )}
      {hasEpisode && ctx?.episode && (
        <EpisodeWorkspaceHeader
          episode={ctx.episode}
          workpieceId={requestedEpisodeId}
        />
      )}
      {children}
      <EpisodeContextDebugOverlay />
    </>
  );
}
