import type { EpisodeWorkspaceReadModel } from "@forge/shared";
import { useEffect } from "react";
import { useOptionalEpisodeWorkspace } from "./EpisodeWorkspaceContext";

export function useEpisodeWorkspaceReadModel(readModel: EpisodeWorkspaceReadModel | null): void {
  const ctx = useOptionalEpisodeWorkspace();

  useEffect(() => {
    if (!ctx || !readModel) return;
    ctx.hydrateEpisodeFromReadModel(readModel);
  }, [ctx, readModel]);
}

export function useEpisodeWorkspaceLoading(
  episodeId: string | null | undefined,
  loading: boolean,
): void {
  const ctx = useOptionalEpisodeWorkspace();

  useEffect(() => {
    if (!ctx || !loading || !episodeId) return;
    ctx.setEpisodeContextLoading(episodeId);
  }, [ctx, episodeId, loading]);
}