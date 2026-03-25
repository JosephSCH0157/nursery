import type { EpisodeWorkspaceReadModel } from "@forge/shared/episode-workspace";
import { useEffect, useRef } from "react";
import { useOptionalEpisodeWorkspace } from "./EpisodeWorkspaceContext";

export function useEpisodeWorkspaceReadModel(readModel: EpisodeWorkspaceReadModel | null): void {
  const ctx = useOptionalEpisodeWorkspace();
  const hydrateEpisodeFromReadModel = ctx?.hydrateEpisodeFromReadModel;
  const lastSignatureRef = useRef<string | null>(null);

  useEffect(() => {
    if (!hydrateEpisodeFromReadModel || !readModel) return;
    const signature = [
      readModel.episodeId,
      readModel.title ?? "",
      readModel.phase ?? "",
      readModel.displayStatus ?? "",
      readModel.sessionId ?? "",
      readModel.seriesTitle ?? "",
    ].join("\u001f");
    if (lastSignatureRef.current === signature) return;
    lastSignatureRef.current = signature;
    hydrateEpisodeFromReadModel(readModel);
  }, [hydrateEpisodeFromReadModel, readModel]);
}

export function useEpisodeWorkspaceLoading(
  episodeId: string | null | undefined,
  loading: boolean,
): void {
  const ctx = useOptionalEpisodeWorkspace();
  const setEpisodeContextLoading = ctx?.setEpisodeContextLoading;

  useEffect(() => {
    if (!setEpisodeContextLoading || !loading || !episodeId) return;
    setEpisodeContextLoading(episodeId);
  }, [setEpisodeContextLoading, episodeId, loading]);
}
