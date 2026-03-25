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
import { useOptionalEpisodeWorkspace } from "../workspace/EpisodeWorkspaceContext";
import EpisodeWorkspaceHeader from "./EpisodeWorkspaceHeader";
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
  const hasEpisode = Boolean(ctx?.episode?.episodeId);

  return (
    <>
      {hasEpisode && ctx?.episode && (
        <EpisodeWorkspaceHeader
          episode={ctx.episode}
          workpieceId={workpieceId}
        />
      )}
      {children}
    </>
  );
}
