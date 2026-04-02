import type { HammerMediaPrepOutputsPackage } from "../lib/hammerMediaPrepOutputsPackage";
import type { HammerPrepState } from "../prep/hammerPrep";

export type HammerSessionStateCode =
  | "reload_required"
  | "recovery_available"
  | "save_failed"
  | "unsaved_changes"
  | "media_unresolved"
  | "prep_incomplete"
  | "degraded_mode"
  | "saving"
  | "saved"
  | "idle";

export type HammerSessionReasonCode =
  | "stale_snapshot_detected"
  | "conflict_detected"
  | "save_failed"
  | "pending_changes"
  | "media_source_missing"
  | "visual_asset_unresolved"
  | "prep_running"
  | "prep_failed"
  | "visuals_stale"
  | "visuals_uncertain"
  | "audio_polish_stale"
  | "audio_polish_failed";

export interface HammerSessionStateInput {
  prepState: HammerPrepState;
  saveState: {
    isSaving: boolean;
    hasPendingChanges: boolean;
    failedMessage: string | null;
    lastSavedAt: string | null;
  };
  recoveryState?: {
    recoveryAvailable?: boolean;
    reloadRequired?: boolean;
    conflictDetected?: boolean;
  } | null;
  mediaPrepOutputs?: HammerMediaPrepOutputsPackage | null;
  editorVisible?: boolean;
}

export interface HammerSessionStateResult {
  status: HammerSessionStateCode;
  reasonCodes: HammerSessionReasonCode[];
  humanLabel: string;
  detail: string | null;
  isBlocking: boolean;
  isDegraded: boolean;
}

function buildMediaReasonCodes(
  mediaPrepOutputs: HammerMediaPrepOutputsPackage | null | undefined,
): HammerSessionReasonCode[] {
  if (!mediaPrepOutputs) return [];

  const reasons: HammerSessionReasonCode[] = [];
  if (mediaPrepOutputs.audio.preferred_playback.kind === "none") {
    reasons.push("media_source_missing");
  }
  if (mediaPrepOutputs.visuals.placements.some((placement) => !placement.asset_path && !placement.storage_key)) {
    reasons.push("visual_asset_unresolved");
  }
  if (mediaPrepOutputs.visuals.freshness === "stale") {
    reasons.push("visuals_stale");
  }
  if (
    mediaPrepOutputs.visuals.uncertain_placement_count > 0
    || mediaPrepOutputs.visuals.uncertainty_flags.length > 0
  ) {
    reasons.push("visuals_uncertain");
  }
  if (mediaPrepOutputs.audio.polish.freshness === "stale") {
    reasons.push("audio_polish_stale");
  }
  if (mediaPrepOutputs.audio.polish.status === "failed") {
    reasons.push("audio_polish_failed");
  }

  return [...new Set(reasons)];
}

function formatSavedDetail(lastSavedAt: string | null): string | null {
  if (!lastSavedAt) return null;
  const parsed = Date.parse(lastSavedAt);
  if (!Number.isFinite(parsed)) return null;
  return `Saved ${new Date(parsed).toLocaleTimeString()}`;
}

export function deriveHammerSessionState(
  input: HammerSessionStateInput,
): HammerSessionStateResult {
  const recoveryAvailable = input.recoveryState?.recoveryAvailable === true;
  const reloadRequired = input.recoveryState?.reloadRequired === true;
  const conflictDetected = input.recoveryState?.conflictDetected === true;
  const mediaReasons = buildMediaReasonCodes(input.mediaPrepOutputs);

  if (reloadRequired || conflictDetected) {
    return {
      status: "reload_required",
      reasonCodes: conflictDetected
        ? ["conflict_detected"]
        : ["stale_snapshot_detected"],
      humanLabel: "Reload required",
      detail: conflictDetected
        ? "Another session changed this workspace. Reload before continuing."
        : "A newer canonical state is available. Reload before continuing.",
      isBlocking: true,
      isDegraded: false,
    };
  }

  if (recoveryAvailable) {
    return {
      status: "recovery_available",
      reasonCodes: ["stale_snapshot_detected"],
      humanLabel: "Recovery available",
      detail: "Hammer found a recoverable canonical state for this session.",
      isBlocking: false,
      isDegraded: true,
    };
  }

  if (input.saveState.failedMessage) {
    return {
      status: "save_failed",
      reasonCodes: ["save_failed"],
      humanLabel: "Unsaved changes",
      detail: input.saveState.failedMessage,
      isBlocking: false,
      isDegraded: true,
    };
  }

  if (input.saveState.hasPendingChanges) {
    return {
      status: "unsaved_changes",
      reasonCodes: ["pending_changes"],
      humanLabel: "Unsaved changes",
      detail: "Edits are waiting to be persisted.",
      isBlocking: false,
      isDegraded: true,
    };
  }

  if (mediaReasons.includes("media_source_missing") || mediaReasons.includes("visual_asset_unresolved")) {
    return {
      status: "media_unresolved",
      reasonCodes: mediaReasons.filter((reason) => (
        reason === "media_source_missing" || reason === "visual_asset_unresolved"
      )),
      humanLabel: "Media unresolved",
      detail: "One or more media sources are missing or unresolved.",
      isBlocking: false,
      isDegraded: true,
    };
  }

  if (input.prepState.status === "preparing" || (input.editorVisible === false && input.prepState.status !== "prepared")) {
    return {
      status: "prep_incomplete",
      reasonCodes: ["prep_running"],
      humanLabel: "Prep incomplete",
      detail: input.prepState.message,
      isBlocking: input.editorVisible === false,
      isDegraded: input.editorVisible !== false,
    };
  }

  if (input.prepState.status === "prep_failed") {
    return {
      status: "prep_incomplete",
      reasonCodes: ["prep_failed"],
      humanLabel: "Prep incomplete",
      detail: input.prepState.error ?? input.prepState.message,
      isBlocking: input.editorVisible === false,
      isDegraded: input.editorVisible !== false,
    };
  }

  if (
    mediaReasons.includes("visuals_stale")
    || mediaReasons.includes("visuals_uncertain")
    || mediaReasons.includes("audio_polish_stale")
    || mediaReasons.includes("audio_polish_failed")
  ) {
    return {
      status: "degraded_mode",
      reasonCodes: mediaReasons.filter((reason) => (
        reason === "visuals_stale"
        || reason === "visuals_uncertain"
        || reason === "audio_polish_stale"
        || reason === "audio_polish_failed"
      )),
      humanLabel: "Degraded mode",
      detail: "Hammer is usable, but some prep or media artifacts need attention.",
      isBlocking: false,
      isDegraded: true,
    };
  }

  if (input.saveState.isSaving) {
    return {
      status: "saving",
      reasonCodes: [],
      humanLabel: "Saving",
      detail: "Persisting your latest edits to canonical storage.",
      isBlocking: false,
      isDegraded: false,
    };
  }

  if (input.saveState.lastSavedAt) {
    return {
      status: "saved",
      reasonCodes: [],
      humanLabel: "Saved",
      detail: formatSavedDetail(input.saveState.lastSavedAt),
      isBlocking: false,
      isDegraded: false,
    };
  }

  return {
    status: "idle",
    reasonCodes: [],
    humanLabel: "Editing",
    detail: "Session state is waiting for the next canonical update.",
    isBlocking: false,
    isDegraded: false,
  };
}
