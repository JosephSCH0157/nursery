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

  const title = episode.title?.trim() || "Episode";
  const statusLabel = formatEpisodeStatusLabel(episode.status ?? null);
  const statusTone = getEpisodeStatusTone(episode.status ?? null);
  const workpieceRef = workpieceId ?? episode.episodeId;
  const ctaHref = ctaLabel && ctaPhase
    ? buildGoToPhaseHref(ctaPhase, { workpieceId: workpieceRef })
    : null;

  return (
    <div className={`forge-episode-strip${compact ? " forge-episode-strip--compact" : ""}`}>
      <div className="forge-episode-strip__meta">
        <div className="forge-episode-strip__top">
          <span className="forge-phase-badge">{EPISODE_PHASE_LABELS[phase]}</span>
          <h2 className="forge-episode-strip__title">{title}</h2>
          {statusLabel ? (
            <span className={`forge-status-pill forge-status-pill--${statusTone}`}>{statusLabel}</span>
          ) : null}
        </div>
        {detail ? <p className="forge-episode-strip__detail">{detail}</p> : null}
      </div>
      {ctaHref && ctaLabel ? (
        <a className="forge-workflow-link" href={ctaHref}>{ctaLabel}</a>
      ) : null}
    </div>
  );
}