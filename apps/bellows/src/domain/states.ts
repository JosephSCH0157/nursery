import type { BellowsBroadcastState } from "./broadcast.js";

export type BellowsLifecycleState =
  | "idle"
  | "configuring"
  | "linking_accounts"
  | "inviting"
  | "waiting_for_participants"
  | "preflight_ready"
  | "preflight_checks"
  | "ready_to_start"
  | "countdown"
  | "sync_initializing"
  | "recording_active"
  | "recording_degraded"
  | "recording_offline_local"
  | "recording_rejoining"
  | "finalizing_local"
  | "uploading"
  | "upload_degraded"
  | "upload_paused"
  | "upload_resuming"
  | "upload_complete_pending_verification"
  | "verifying_integrity"
  | "assembling_manifest"
  | "sealing_session"
  | "sealed"
  | "incomplete_capture"
  | "failed_capture"
  | "archived";

export type BellowsRecordingState =
  | "idle"
  | "countdown"
  | "sync_initializing"
  | "active"
  | "degraded"
  | "offline_local"
  | "rejoining"
  | "stopping"
  | "stopped";

export type BellowsUploadState =
  | "not_started"
  | "finalizing_local"
  | "uploading"
  | "degraded"
  | "paused"
  | "resuming"
  | "complete_pending_verification";

export type BellowsSealState =
  | "not_started"
  | "verifying_integrity"
  | "assembling_manifest"
  | "sealing_session"
  | "sealed";

export type BellowsSessionOutcome =
  | "sealed"
  | "incomplete_capture"
  | "failed_capture"
  | "archived";

export type BellowsIntegrityFlag =
  | "missing_track"
  | "degraded_quality"
  | "participant_dropout"
  | "upload_interrupted"
  | "resync_required"
  | "corrupted_capture";

export type BellowsFailureClass =
  | "minor_disruption"
  | "participant_disruption"
  | "critical_disruption";

export interface BellowsMachineState {
  readonly lifecycle: BellowsLifecycleState;
  readonly broadcast: BellowsBroadcastState;
  readonly outcome: BellowsSessionOutcome | null;
}
