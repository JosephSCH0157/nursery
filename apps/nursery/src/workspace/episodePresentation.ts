import type { EpisodeWorkspaceStatus } from "./EpisodeWorkspaceContext";
import type { EpisodeDisplayStatus } from "./resolveEpisodeStatus";

export type EpisodeUiStatus = EpisodeWorkspaceStatus | EpisodeDisplayStatus;

export type EpisodeUiTone = "muted" | "ready" | "active" | "done";

export const EPISODE_UI_STATUS_LABELS: Record<EpisodeUiStatus, string> = {
  draft: "Draft",
  ready: "Ready to Record",
  scripted: "Ready to Record",
  scheduled: "Scheduled",
  recording: "Recording",
  recorded: "Recorded",
  editing: "In Editing",
  edited: "Ready to Release",
  releasing: "Ready to Release",
  released: "Released",
};

export const EPISODE_UI_STATUS_TONES: Record<EpisodeUiStatus, EpisodeUiTone> = {
  draft: "muted",
  ready: "ready",
  scripted: "ready",
  scheduled: "ready",
  recording: "active",
  recorded: "done",
  editing: "active",
  edited: "ready",
  releasing: "ready",
  released: "done",
};

export function formatEpisodeStatusLabel(status?: EpisodeUiStatus | null): string | null {
  if (!status) return null;
  return EPISODE_UI_STATUS_LABELS[status] ?? null;
}

export function getEpisodeStatusTone(status?: EpisodeUiStatus | null): EpisodeUiTone {
  if (!status) return "muted";
  return EPISODE_UI_STATUS_TONES[status] ?? "muted";
}