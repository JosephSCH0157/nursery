import type {
  ParticipantId,
  SessionEventId,
  SessionId,
  UserId,
} from "./ids.js";
import type { BellowsOffsetMs } from "./primitives.js";

export type BellowsSessionLifecycleEventType =
  | "session_created"
  | "session_configured"
  | "session_started"
  | "session_stopped"
  | "session_sealing_started"
  | "session_sealed";

export type BellowsParticipantEventType =
  | "participant_joined"
  | "participant_ready"
  | "participant_disconnected"
  | "participant_reconnected"
  | "participant_removed"
  | "participant_role_changed";

export type BellowsRecordingEventType =
  | "recording_started"
  | "recording_segment_started"
  | "recording_segment_ended"
  | "recording_stopped";

export type BellowsSyncEventType =
  | "sync_emitted"
  | "sync_detected"
  | "drift_estimated";

export type BellowsBroadcastEventType =
  | "broadcast_started"
  | "broadcast_degraded"
  | "broadcast_disconnected"
  | "broadcast_resumed"
  | "broadcast_ended";

export type BellowsUploadEventType =
  | "upload_started"
  | "upload_chunk_received"
  | "upload_paused"
  | "upload_resumed"
  | "upload_completed";

export type BellowsFailureEventType =
  | "connection_lost"
  | "storage_low"
  | "artifact_missing"
  | "integrity_warning";

export type BellowsEngineEventType =
  | "transition_rejected"
  | "authority_promoted"
  | "recovery_entered";

export type BellowsUserActionEventType =
  | "host_command_issued"
  | "participant_exit_attempted"
  | "safeguard_triggered";

export type BellowsSessionEventType =
  | BellowsSessionLifecycleEventType
  | BellowsParticipantEventType
  | BellowsRecordingEventType
  | BellowsSyncEventType
  | BellowsBroadcastEventType
  | BellowsUploadEventType
  | BellowsFailureEventType
  | BellowsEngineEventType
  | BellowsUserActionEventType;

export type BellowsEventActorType =
  | "host"
  | "co_host"
  | "participant"
  | "engine"
  | "system";

export type BellowsSessionEventPayload = Readonly<Record<string, unknown>>;

export type BellowsEventActorId = ParticipantId | UserId | "engine" | "system";

export interface BellowsSessionEvent {
  readonly eventId: SessionEventId;
  readonly sessionId: SessionId;
  readonly type: BellowsSessionEventType;
  readonly actorType: BellowsEventActorType;
  readonly actorId: BellowsEventActorId;
  readonly offsetMs: BellowsOffsetMs;
  readonly payload: BellowsSessionEventPayload;
}

export type BellowsActionSource =
  | "host"
  | "co_host"
  | "participant"
  | "capture"
  | "connectivity"
  | "broadcast"
  | "upload"
  | "recovery"
  | "engine";

export interface BellowsEngineAction<
  TType extends string = string,
  TPayload extends BellowsSessionEventPayload = BellowsSessionEventPayload,
> {
  readonly source: BellowsActionSource;
  readonly type: TType;
  readonly payload: TPayload;
}

export type HostAction<
  TType extends string = string,
  TPayload extends BellowsSessionEventPayload = BellowsSessionEventPayload,
> = BellowsEngineAction<TType, TPayload> & {
  readonly source: "host";
};

export type CoHostAction<
  TType extends string = string,
  TPayload extends BellowsSessionEventPayload = BellowsSessionEventPayload,
> = BellowsEngineAction<TType, TPayload> & {
  readonly source: "co_host";
};

export type ParticipantAction<
  TType extends string = string,
  TPayload extends BellowsSessionEventPayload = BellowsSessionEventPayload,
> = BellowsEngineAction<TType, TPayload> & {
  readonly source: "participant";
};

export type CaptureSignal<
  TType extends string = string,
  TPayload extends BellowsSessionEventPayload = BellowsSessionEventPayload,
> = BellowsEngineAction<TType, TPayload> & {
  readonly source: "capture";
};

export type ConnectivitySignal<
  TType extends string = string,
  TPayload extends BellowsSessionEventPayload = BellowsSessionEventPayload,
> = BellowsEngineAction<TType, TPayload> & {
  readonly source: "connectivity";
};

export type BroadcastSignal<
  TType extends string = string,
  TPayload extends BellowsSessionEventPayload = BellowsSessionEventPayload,
> = BellowsEngineAction<TType, TPayload> & {
  readonly source: "broadcast";
};

export type UploadSignal<
  TType extends string = string,
  TPayload extends BellowsSessionEventPayload = BellowsSessionEventPayload,
> = BellowsEngineAction<TType, TPayload> & {
  readonly source: "upload";
};

export type RecoverySignal<
  TType extends string = string,
  TPayload extends BellowsSessionEventPayload = BellowsSessionEventPayload,
> = BellowsEngineAction<TType, TPayload> & {
  readonly source: "recovery";
};

export type BellowsEngineEffectType =
  | "run_preflight_checks"
  | "generate_invite_links"
  | "start_countdown"
  | "establish_t0"
  | "emit_sync_marker"
  | "start_local_recording"
  | "start_broadcast"
  | "stop_broadcast"
  | "finalize_local_segments"
  | "resume_pending_uploads"
  | "verify_integrity"
  | "assemble_manifest"
  | "seal_session_record"
  | "promote_co_host"
  | "enter_engine_stewardship";

export interface BellowsEngineEffect<
  TType extends BellowsEngineEffectType = BellowsEngineEffectType,
  TPayload extends BellowsSessionEventPayload = BellowsSessionEventPayload,
> {
  readonly type: TType;
  readonly payload: TPayload;
}
