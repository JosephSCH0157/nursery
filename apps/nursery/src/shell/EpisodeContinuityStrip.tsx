import type { EpisodePhase } from "../workspace/episodePhases";
import { EPISODE_PHASE_LABELS } from "../workspace/episodePhases";
import { buildGoToPhaseHref } from "../workspace/episodeNavigation";
import { useOptionalEpisodeWorkspace } from "../workspace/EpisodeWorkspaceContext";
import {
  formatEpisodeStatusLabel,
  getEpisodeStatusTone,
} from "../workspace/episodePresentation";
import "./EpisodeWorkspacePrimitives.css";

interface EpisodeContinuityStripProps {
  phase: EpisodePhase;
  workpieceId?: string | null;
  detail?: string;
  compact?: boolean;
  ctaLabel?: string;
  ctaPhase?: EpisodePhase;
}

export default function EpisodeContinuityStrip({
  phase,
  workpieceId,
  detail,
  compact = false,
  ctaLabel,
  ctaPhase,
}: EpisodeContinuityStripProps) {
  const ctx = useOptionalEpisodeWorkspace();
  const episode = ctx?.episode;

  if (!episode?.episodeId) return null;
  if (workpieceId && episode.episodeId !== workpieceId) return null;

  const isLoading = episode.contextState === "loading";
  const isMissing = episode.contextState === "missing";
  const title = isLoading
    ? null
    : isMissing
    ? null
    : episode.title?.trim() || "Episode";
  const statusLabel = (isLoading || isMissing) ? null : formatEpisodeStatusLabel(episode.displayStatus ?? null);
  const statusTone = getEpisodeStatusTone(episode.displayStatus ?? null);
  const workpieceRef = workpieceId ?? episode.episodeId;
  const ctaHref = ctaLabel && ctaPhase
    ? buildGoToPhaseHref(ctaPhase, { workpieceId: workpieceRef })
    : null;

  return (
    <div className={`forge-episode-strip${compact ? " forge-episode-strip--compact" : ""}${isMissing ? " forge-episode-strip--missing" : ""}`}>
      <div className="forge-episode-strip__meta">
        <div className="forge-episode-strip__top">
          <span className={`forge-phase-badge${isMissing ? " forge-phase-badge--muted" : ""}`}>{EPISODE_PHASE_LABELS[phase]}</span>
          {isLoading ? (
            <span className="forge-episode-strip__title forge-episode-strip__title--loading" aria-label="Resolving episode">
              Resolving\u2026
            </span>
          ) : isMissing ? (
            <span className="forge-episode-strip__title forge-episode-strip__title--missing">
              Episode not found
            </span>
          ) : (
            <h2 className="forge-episode-strip__title">{title}</h2>
          )}
          {statusLabel ? (
            <span className={`forge-status-pill forge-status-pill--${statusTone}`}>{statusLabel}</span>
          ) : null}
        </div>
        <p className="forge-episode-strip__detail">
          {isMissing
            ? "This episode may have been removed or the link is no longer valid."
            : (detail ?? "")}
        </p>
      </div>
      {ctaHref && ctaLabel ? (
        <a className="forge-workflow-link" href={ctaHref}>{ctaLabel}</a>
      ) : null}
    </div>
  );
}