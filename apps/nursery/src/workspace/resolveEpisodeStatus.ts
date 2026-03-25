/**
 * Episode display status resolver — read-model only, no DB writes.
 *
 * Derives a single user-visible status string from existing Tongs/Hammer/Hearth
 * signals. All inputs come from already-loaded data; this function is pure.
 */

import type { EpisodePhase } from "./episodePhases";

export type EpisodeDisplayStatus =
  | "draft"
  | "scripted"
  | "scheduled"
  | "recording"
  | "recorded"
  | "editing"
  | "edited"
  | "releasing"
  | "released";

export const EPISODE_STATUS_LABELS: Record<EpisodeDisplayStatus, string> = {
  draft: "Draft",
  scripted: "Ready to Record",
  scheduled: "Scheduled",
  recording: "Recording",
  recorded: "Recorded",
  editing: "In Editing",
  edited: "Ready to Release",
  releasing: "Ready to Release",
  released: "Released",
};

export interface EpisodeStatusSignals {
  /** true when Hearth has emitted hearth.script.published.v1 */
  hasApprovedScript?: boolean;
  /** from tongs recording_sessions.status */
  recordingSessionStatus?: "planned" | "active" | "completed" | "canceled" | null;
  /** from tongs hammer_prep_status column */
  hammerPrepStatus?: "idle" | "preparing" | "prepared" | "prep_failed" | null;
  /** true when at least one take has been kept */
  hasKeptTake?: boolean;
  /** true when a Hammer editor session JSON exists */
  hasEditorSession?: boolean;
  /** coarse release progress */
  releaseState?: "none" | "prepared" | "scheduled" | "published" | null;
}

/**
 * Derives a single display status from available signals.
 * Precedence: release > edit > record > script > draft.
 */
export function resolveEpisodeDisplayStatus(
  signals: EpisodeStatusSignals,
): EpisodeDisplayStatus {
  const {
    hasApprovedScript = false,
    recordingSessionStatus = null,
    hammerPrepStatus = null,
    hasKeptTake = false,
    hasEditorSession = false,
    releaseState = null,
  } = signals;

  if (releaseState === "published") return "released";
  if (releaseState === "prepared" || releaseState === "scheduled") return "releasing";
  if (hasEditorSession) return "editing";
  if (hammerPrepStatus === "preparing") return "editing";
  if (hammerPrepStatus === "prepared") return "edited";
  if (hasKeptTake || recordingSessionStatus === "completed") return "recorded";
  if (recordingSessionStatus === "active") return "recording";
  if (recordingSessionStatus === "planned") return "scheduled";
  if (hasApprovedScript) return "scripted";
  return "draft";
}

/** Maps a display status back to the canonical episode phase for shell display purposes. */
export function resolveEpisodePhaseFromStatus(status: EpisodeDisplayStatus): EpisodePhase {
  switch (status) {
    case "draft":
    case "scripted":
      return "script";
    case "scheduled":
    case "recording":
    case "recorded":
      return "record";
    case "editing":
    case "edited":
      return "edit";
    case "releasing":
    case "released":
      return "release";
  }
}
