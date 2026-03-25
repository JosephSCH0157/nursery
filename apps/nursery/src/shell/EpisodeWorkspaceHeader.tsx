/**
 * EpisodeWorkspaceHeader — persistent identity banner with phase-progress stepper.
 *
 * Renders when an episode is active. Provides:
 *   - Episode title (P2.5: falls back to "Episode" if not yet resolved)
 *   - Phase progress stepper: completed → current → future (P2.1)
 *   - Smart "Continue Workflow" primary action button (P2.2)
 */

import { Fragment } from "react";
import { useLocation } from "react-router-dom";
import {
  EPISODE_PHASE_LABELS,
  type EpisodePhase,
  resolvePhaseFromPathname,
} from "../workspace/episodePhases";
import type { EpisodeWorkspaceState } from "../workspace/EpisodeWorkspaceContext";
import { buildGoToPhaseHref } from "../workspace/episodeNavigation";
import {
  formatEpisodeStatusLabel,
  getEpisodeStatusTone,
} from "../workspace/episodePresentation";
import type { EpisodeStatusSignals } from "../workspace/resolveEpisodeStatus";
import { resolveNextEpisodeAction } from "../workspace/resolveNextEpisodeAction";
import "./EpisodeWorkspacePrimitives.css";

// Phase order for the stepper
const PHASE_ORDER: EpisodePhase[] = ["script", "record", "edit", "release", "analytics"];

interface EpisodeWorkspaceHeaderProps {
  episode: EpisodeWorkspaceState;
  /** Optional explicit workpieceId for phase link building */
  workpieceId?: string | null;
  /** Optional status signals used to derive the smart Continue Workflow action */
  signals?: EpisodeStatusSignals;
}

export default function EpisodeWorkspaceHeader({
  episode,
  workpieceId,
  signals,
}: EpisodeWorkspaceHeaderProps) {
  const location = useLocation();
  const currentPhase = resolvePhaseFromPathname(location.pathname);
  const currentIndex = PHASE_ORDER.indexOf(currentPhase);

  // P2.5: Title fallback order — context title → safe placeholder
  const displayTitle = episode.title?.trim() || "Episode";
  const statusLabel = formatEpisodeStatusLabel(episode.displayStatus ?? null);
  const statusTone = getEpisodeStatusTone(episode.displayStatus ?? null);

  // P2.2: Smart primary action (may be null if workflow is complete)
  const nextAction = signals
    ? resolveNextEpisodeAction(currentPhase, signals)
    : null;

  const workpieceRef = workpieceId ?? episode.episodeId;

  return (
    <div className="ew-header" role="banner" aria-label="Active episode">
      {/* Identity */}
      <div className="ew-header__identity">
        <span className="ew-header__label" aria-label="Active episode title" title={displayTitle}>
          {displayTitle}
        </span>
        {episode.seriesTitle && (
          <>
            <span className="ew-header__sep" aria-hidden="true">·</span>
            <span className="ew-header__series" aria-label="Series">
              {episode.seriesTitle}
            </span>
          </>
        )}
        {statusLabel && (
          <span className={`forge-status-pill forge-status-pill--${statusTone}`} aria-label="Episode status">
            {statusLabel}
          </span>
        )}
      </div>

      {/* P2.1: Phase progress stepper */}
      <nav className="ew-header__stepper" aria-label="Episode phases">
        {PHASE_ORDER.map((phase, index) => {
          const isCurrent = phase === currentPhase;
          const isCompleted = index < currentIndex;
          const isFuture = index > currentIndex;
          const href = buildGoToPhaseHref(phase, { workpieceId: workpieceRef });
          const label = EPISODE_PHASE_LABELS[phase];
          return (
            <Fragment key={phase}>
              {index > 0 && (
                <span className="ew-header__step-sep" aria-hidden="true">›</span>
              )}
              <a
                href={href}
                className={[
                  "ew-header__step",
                  isCurrent ? "ew-header__step--current" : "",
                  isCompleted ? "ew-header__step--completed" : "",
                  isFuture ? "ew-header__step--future" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                aria-current={isCurrent ? "step" : undefined}
                aria-label={`${label}${isCurrent ? " (current)" : isCompleted ? " (done)" : ""}`}
              >
                <span className="ew-header__step-dot" aria-hidden="true" />
                <span className="ew-header__step-label">{label}</span>
              </a>
            </Fragment>
          );
        })}
      </nav>

      {/* P2.2: Smart Continue Workflow primary action */}
      {nextAction && (
        <a
          href={buildGoToPhaseHref(nextAction.phase, { workpieceId: workpieceRef })}
          className="ew-header__continue"
          aria-label={nextAction.label}
        >
          {nextAction.label}
          <span className="ew-header__continue-arrow" aria-hidden="true">→</span>
        </a>
      )}
    </div>
  );
}
