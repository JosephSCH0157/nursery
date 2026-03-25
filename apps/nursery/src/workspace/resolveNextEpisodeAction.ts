/**
 * resolveNextEpisodeAction — P2.2 smart Continue Workflow resolver.
 *
 * Pure read-model. Returns the recommended primary action for the current
 * episode based on existing signals. Never writes any state.
 */

import type { EpisodePhase } from "./episodePhases";
import type { EpisodeStatusSignals } from "./resolveEpisodeStatus";

export interface NextEpisodeAction {
  /** User-facing button label */
  label: string;
  /** Target phase to navigate to */
  phase: EpisodePhase;
}

/**
 * Given current phase and status signals, returns the highest-priority
 * recommended next action, or null if the workflow is complete/blocked.
 *
 * Precedence:
 *   1. If released → nothing to do (null)
 *   2. If in release prep → continue release
 *   3. If edit complete → prepare release
 *   4. If recording kept + no edit session → begin editing
 *   5. If active recording → continue recording
 *   6. If script ready + no recording → start recording
 *   7. Otherwise → continue scripting
 */
export function resolveNextEpisodeAction(
  currentPhase: EpisodePhase,
  signals: EpisodeStatusSignals,
): NextEpisodeAction | null {
  const {
    hasApprovedScript = false,
    recordingSessionStatus = null,
    hammerPrepStatus = null,
    hasKeptTake = false,
    hasEditorSession = false,
    releaseState = null,
  } = signals;

  // Nothing left to do
  if (releaseState === "published") return null;

  // Already in or past release prep
  if (releaseState === "prepared" || releaseState === "scheduled") {
    return { label: "Continue Release", phase: "release" };
  }
  if (currentPhase === "release") {
    return { label: "Continue Release", phase: "release" };
  }

  // Edit phase is complete → push to release
  if (hammerPrepStatus === "prepared") {
    return { label: "Prepare Release", phase: "release" };
  }

  // Active edit session → stay in editing
  if (hasEditorSession || hammerPrepStatus === "preparing") {
    return { label: "Continue Editing", phase: "edit" };
  }

  // Has a take but no edit session started → move to editing
  if (hasKeptTake || recordingSessionStatus === "completed") {
    return { label: "Begin Editing", phase: "edit" };
  }

  // Active recording session
  if (recordingSessionStatus === "active" || recordingSessionStatus === "planned") {
    return { label: "Continue Recording", phase: "record" };
  }

  // Script is approved → ready to record
  if (hasApprovedScript) {
    return { label: "Start Recording", phase: "record" };
  }

  // Default: still scripting
  if (currentPhase !== "script") {
    return { label: "Back to Script", phase: "script" };
  }

  return null;
}
