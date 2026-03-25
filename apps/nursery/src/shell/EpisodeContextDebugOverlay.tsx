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
    <div
      style={{
        position: "fixed",
        bottom: 12,
        right: 12,
        zIndex: 9999,
        fontFamily: "monospace",
        fontSize: 11,
        background: "rgba(0,0,0,0.88)",
        color: "#c0ffc0",
        border: "1px solid rgba(0,255,0,0.3)",
        borderRadius: 6,
        minWidth: 220,
        maxWidth: 340,
        boxShadow: "0 4px 16px rgba(0,0,0,0.5)",
        userSelect: "text",
      }}
    >
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        style={{
          width: "100%",
          background: "none",
          border: "none",
          color: "#80ff80",
          fontFamily: "monospace",
          fontSize: 11,
          padding: "6px 10px",
          textAlign: "left",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <span style={{ opacity: 0.5 }}>▼</span>
        EpisodeWorkspaceCtx
        {ctx?.episode.contextState === "missing" ? (
          <span
            style={{
              background: "rgba(200,80,80,0.4)",
              borderRadius: 3,
              padding: "1px 4px",
              color: "#ffd0c8",
              marginLeft: "auto",
            }}
          >
            missing
          </span>
        ) : ctx?.episode.episodeId && (
          <span
            style={{
              background: "rgba(108,99,255,0.5)",
              borderRadius: 3,
              padding: "1px 4px",
              color: "#e0d8ff",
              marginLeft: "auto",
            }}
          >
            active
          </span>
        )}
      </button>
      {!collapsed && (
        <div style={{ padding: "0 10px 8px", display: "grid", rowGap: 3 }}>
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
    <div style={{ display: "flex", gap: 8 }}>
      <span style={{ color: "#6c6c8a", minWidth: 80, flexShrink: 0 }}>{label}:</span>
      <span
        style={{
          color: "#c0ffc0",
          wordBreak: "break-all",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          maxWidth: 200,
        }}
        title={value}
      >
        {value}
      </span>
    </div>
  );
}
