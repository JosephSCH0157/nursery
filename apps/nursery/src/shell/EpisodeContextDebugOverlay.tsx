/**
 * EpisodeContextDebugOverlay — dev-only context inspector.
 *
 * Shows the live EpisodeWorkspaceContext state in a small overlay.
 * Only renders in development builds (import.meta.env.DEV).
 */

import { useState } from "react";
import { useOptionalEpisodeWorkspace } from "../workspace/EpisodeWorkspaceContext";
import { useLocation } from "react-router-dom";
import { resolvePhaseFromPathname } from "../workspace/episodePhases";
import "./EpisodeWorkspacePrimitives.css";

export default function EpisodeContextDebugOverlay() {
  if (!import.meta.env.DEV) return null;

  return <EpisodeContextDebugOverlayDev />;
}

function EpisodeContextDebugOverlayDev() {
  const ctx = useOptionalEpisodeWorkspace();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(true);
  const phase = resolvePhaseFromPathname(location.pathname);

  const sourceLabel = ctx?.episode.episodeId ? ctx.episode.source : "none";

  return (
    <div className="episode-debug-overlay">
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        className="episode-debug-overlay__toggle"
      >
        <span className="episode-debug-overlay__caret">▼</span>
        EpisodeWorkspaceCtx
        {ctx?.episode.contextState === "missing" ? (
          <span className="episode-debug-overlay__pill episode-debug-overlay__pill--missing">
            missing
          </span>
        ) : ctx?.episode.episodeId && (
          <span className="episode-debug-overlay__pill episode-debug-overlay__pill--active">
            active
          </span>
        )}
      </button>
      {!collapsed && (
        <div className="episode-debug-overlay__content">
          <Row label="episodeId" value={ctx?.episode.episodeId ?? "—"} />
          <Row label="title" value={ctx?.episode.title || "—"} />
          <Row label="displayStatus" value={ctx?.episode.displayStatus ?? "—"} />
          <Row label="contextState" value={ctx?.episode.contextState ?? "—"} />
          <Row label="sessionId" value={ctx?.episode.sessionId ?? "—"} />
          <Row label="phase (context)" value={ctx?.episode.phase ?? "—"} />
          <Row label="phase (route)" value={phase} />
          <Row label="source" value={sourceLabel} />
          <Row label="pathname" value={location.pathname} />
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="episode-debug-overlay__row">
      <span className="episode-debug-overlay__label">{label}:</span>
      <span className="episode-debug-overlay__value" title={value}>
        {value}
      </span>
    </div>
  );
}
