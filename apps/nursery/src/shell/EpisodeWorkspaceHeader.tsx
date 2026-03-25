/**
 * EpisodeWorkspaceHeader — persistent identity banner.
 *
 * Rendered by EpisodeWorkspaceShell whenever an episode is active.
 * Intentionally narrow — answers "What am I working on?" without
 * consuming significant vertical space or duplicating tool nav.
 */

import { useLocation } from "react-router-dom";
import {
  EPISODE_PHASE_LABELS,
  resolvePhaseFromPathname,
} from "../workspace/episodePhases";
import type { EpisodeWorkspaceState } from "../workspace/EpisodeWorkspaceContext";
import { buildGoToPhaseHref } from "../workspace/episodeNavigation";

interface EpisodeWorkspaceHeaderProps {
  episode: EpisodeWorkspaceState;
  /** Optional explicit workpieceId for phase link building */
  workpieceId?: string | null;
}

export default function EpisodeWorkspaceHeader({
  episode,
  workpieceId,
}: EpisodeWorkspaceHeaderProps) {
  const location = useLocation();
  const currentPhase = resolvePhaseFromPathname(location.pathname);
  const phaseLabel = EPISODE_PHASE_LABELS[currentPhase];
  const displayTitle = episode.title?.trim() || "Episode";

  // Build quick-action hrefs — phase navigation context
  const editHref = buildGoToPhaseHref("edit", { workpieceId: workpieceId ?? episode.episodeId });
  const recordHref = buildGoToPhaseHref("record", {
    workpieceId: workpieceId ?? episode.episodeId,
  });
  const scriptHref = buildGoToPhaseHref("script", {
    workpieceId: workpieceId ?? episode.episodeId,
  });

  return (
    <div className="ew-header" role="banner" aria-label="Active episode">
      <div className="ew-header__identity">
        <span className="ew-header__label" aria-label="Active episode title">
          {displayTitle}
        </span>
        {episode.seriesId && (
          <span className="ew-header__series" aria-label="Series">
            {episode.seriesId}
          </span>
        )}
      </div>

      <div className="ew-header__phase" aria-current="step">
        <span className="ew-header__phase-dot" aria-hidden="true" />
        <span className="ew-header__phase-label">{phaseLabel}</span>
        {episode.status && (
          <span className="ew-header__status">{episode.status}</span>
        )}
      </div>

      <nav className="ew-header__actions" aria-label="Continue workflow">
        {currentPhase !== "script" && (
          <a href={scriptHref} className="ew-header__action-link">
            Script
          </a>
        )}
        {currentPhase !== "record" && (
          <a href={recordHref} className="ew-header__action-link">
            Record
          </a>
        )}
        {currentPhase !== "edit" && (
          <a href={editHref} className="ew-header__action-link">
            Edit
          </a>
        )}
      </nav>
    </div>
  );
}
