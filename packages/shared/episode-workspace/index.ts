export type EpisodeWorkspacePhase = "script" | "record" | "edit" | "release" | "analytics";

export interface EpisodeWorkspaceReadModel {
  episodeId: string;
  title: string;
  phase: EpisodeWorkspacePhase;
  displayStatus: string;
  sessionId?: string | null;
  seriesTitle?: string | null;
}