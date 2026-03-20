import type {
  BellowsEngineAction,
  BellowsEventActorId,
  BellowsSessionEventPayload,
  CaptureSignal,
  CoHostAction,
  ConnectivitySignal,
  HostAction,
  RecoverySignal,
  UploadSignal,
} from "../domain/events.js";
import type { BellowsBroadcastState } from "../domain/broadcast.js";
import type {
  ParticipantId,
  SessionEventId,
} from "../domain/ids.js";
import type { BellowsOffsetMs } from "../domain/primitives.js";
import type { BellowsSessionDraft } from "../domain/session.js";
import type { BellowsParticipant } from "../domain/participant.js";

export interface BellowsActionMeta<TActorId extends BellowsEventActorId = BellowsEventActorId> {
  readonly actorId: TActorId;
  readonly offsetMs: BellowsOffsetMs;
}

export interface BellowsEngineContext {
  readonly nextEventId: () => SessionEventId;
}

type EmptyPayload = Record<string, never>;

type HostEngineAction<
  TType extends string,
  TPayload extends BellowsSessionEventPayload = EmptyPayload,
> = HostAction<TType, TPayload> & {
  readonly meta: BellowsActionMeta<ParticipantId>;
};

type CoHostEngineAction<
  TType extends string,
  TPayload extends BellowsSessionEventPayload = EmptyPayload,
> = CoHostAction<TType, TPayload> & {
  readonly meta: BellowsActionMeta<ParticipantId>;
};

type EngineSignal<
  TType extends string,
  TPayload extends BellowsSessionEventPayload = EmptyPayload,
> = BellowsEngineAction<TType, TPayload> & {
  readonly source: "engine";
  readonly meta: BellowsActionMeta<"engine">;
};

type CaptureEngineSignal<
  TType extends string,
  TPayload extends BellowsSessionEventPayload = EmptyPayload,
> = CaptureSignal<TType, TPayload> & {
  readonly meta: BellowsActionMeta<"system">;
};

type ConnectivityEngineSignal<
  TType extends string,
  TPayload extends BellowsSessionEventPayload = EmptyPayload,
> = ConnectivitySignal<TType, TPayload> & {
  readonly meta: BellowsActionMeta<ParticipantId | "system">;
};

type UploadEngineSignal<
  TType extends string,
  TPayload extends BellowsSessionEventPayload = EmptyPayload,
> = UploadSignal<TType, TPayload> & {
  readonly meta: BellowsActionMeta<"system">;
};

type RecoveryEngineSignal<
  TType extends string,
  TPayload extends BellowsSessionEventPayload = EmptyPayload,
> = RecoverySignal<TType, TPayload> & {
  readonly meta: BellowsActionMeta<"engine">;
};

export type HostBeginSetupAction = HostEngineAction<"HOST_BEGIN_SETUP">;
export type HostUpdateDraftAction = HostEngineAction<
  "HOST_UPDATE_DRAFT",
  { readonly draft: BellowsSessionDraft }
>;
export type HostBeginAccountLinkAction = HostEngineAction<"HOST_BEGIN_ACCOUNT_LINK">;
export type HostBeginInvitesAction = HostEngineAction<"HOST_BEGIN_INVITES">;
export type HostWaitForParticipantsAction = HostEngineAction<"HOST_WAIT_FOR_PARTICIPANTS">;
export type HostRunPreflightAction = HostEngineAction<"HOST_RUN_PREFLIGHT">;
export type HostStartShowAction = HostEngineAction<"HOST_START_SHOW">;
export type HostAbortStartAction = HostEngineAction<"HOST_ABORT_START">;
export type HostEndSessionAction = HostEngineAction<"HOST_END_SESSION">;
export type CoHostEndSessionAction = CoHostEngineAction<"CO_HOST_END_SESSION">;
export type HostStartBroadcastAction = HostEngineAction<"HOST_START_BROADCAST">;
export type HostStopBroadcastAction = HostEngineAction<"HOST_STOP_BROADCAST">;

export type PlatformLinkSucceededAction = EngineSignal<"PLATFORM_LINK_SUCCEEDED">;
export type PlatformLinkFailedAction = EngineSignal<"PLATFORM_LINK_FAILED">;
export type InvitesGeneratedAction = EngineSignal<"INVITES_GENERATED">;
export type PreflightPassedAction = EngineSignal<"PREFLIGHT_PASSED">;
export type PreflightFailedAction = EngineSignal<"PREFLIGHT_FAILED">;
export type CountdownCompletedAction = EngineSignal<"COUNTDOWN_COMPLETED">;
export type BeginIntegrityVerificationAction = EngineSignal<"BEGIN_INTEGRITY_VERIFICATION">;
export type IntegrityVerifiedAction = EngineSignal<"INTEGRITY_VERIFIED">;
export type IntegrityPartialButUsableAction = EngineSignal<"INTEGRITY_PARTIAL_BUT_USABLE">;
export type IntegrityFatalAction = EngineSignal<"INTEGRITY_FATAL">;
export type ManifestAssembledAction = EngineSignal<"MANIFEST_ASSEMBLED">;
export type SessionSealedAction = EngineSignal<"SESSION_SEALED">;
export type SessionSealedWithGapsAction = EngineSignal<"SESSION_SEALED_WITH_GAPS">;
export type SessionSealFailedFatalAction = EngineSignal<"SESSION_SEAL_FAILED_FATAL">;
export type ArchiveRequestedAction = EngineSignal<"ARCHIVE_REQUESTED">;

export type ParticipantJoinedAction = ConnectivityEngineSignal<
  "PARTICIPANT_JOINED",
  { readonly participant: BellowsParticipant }
>;
export type ParticipantReadyAction = ConnectivityEngineSignal<
  "PARTICIPANT_READY",
  { readonly participantId: ParticipantId }
>;
export type ParticipantBecameUnreadyAction = ConnectivityEngineSignal<
  "PARTICIPANT_BECAME_UNREADY",
  { readonly participantId: ParticipantId }
>;
export type ParticipantDisconnectedAction = ConnectivityEngineSignal<
  "PARTICIPANT_DISCONNECTED",
  { readonly participantId: ParticipantId }
>;
export type ParticipantNetworkLostLocalCaptureOkAction = ConnectivityEngineSignal<
  "PARTICIPANT_NETWORK_LOST_LOCAL_CAPTURE_OK",
  { readonly participantId: ParticipantId }
>;
export type ParticipantRejoinStartedAction = ConnectivityEngineSignal<
  "PARTICIPANT_REJOIN_STARTED",
  { readonly participantId: ParticipantId }
>;
export type ParticipantRejoinConfirmedAction = ConnectivityEngineSignal<
  "PARTICIPANT_REJOIN_CONFIRMED",
  { readonly participantId: ParticipantId }
>;
export type ParticipantRejoinFailedAction = ConnectivityEngineSignal<
  "PARTICIPANT_REJOIN_FAILED",
  { readonly participantId: ParticipantId }
>;
export type HostDisconnectedAction = ConnectivityEngineSignal<
  "HOST_DISCONNECTED",
  { readonly participantId: ParticipantId }
>;

export type CaptureStartedForAllRequiredParticipantsAction =
  CaptureEngineSignal<"CAPTURE_STARTED_FOR_ALL_REQUIRED_PARTICIPANTS">;
export type CaptureStartedWithMissingParticipantAction = CaptureEngineSignal<
  "CAPTURE_STARTED_WITH_MISSING_PARTICIPANT"
>;
export type LocalSegmentsFinalizedAction = CaptureEngineSignal<"LOCAL_SEGMENTS_FINALIZED">;

export type UploadProgressRecordedAction = UploadEngineSignal<"UPLOAD_PROGRESS_RECORDED">;
export type UploadDegradedAction = UploadEngineSignal<"UPLOAD_DEGRADED">;
export type UploadPausedAction = UploadEngineSignal<"UPLOAD_PAUSED">;
export type UploadResumeRequestedAction = UploadEngineSignal<"UPLOAD_RESUME_REQUESTED">;
export type UploadResumeFailedAction = UploadEngineSignal<"UPLOAD_RESUME_FAILED">;
export type UploadsCompleteAction = UploadEngineSignal<"UPLOADS_COMPLETE">;

export type RecoverRecordingActiveAction = RecoveryEngineSignal<
  "RECOVER_RECORDING_ACTIVE",
  {
    readonly lifecycle:
      | "recording_active"
      | "recording_degraded"
      | "recording_offline_local";
    readonly broadcastState?: BellowsBroadcastState;
  }
>;
export type RecoverUploadInProgressAction = RecoveryEngineSignal<
  "RECOVER_UPLOAD_IN_PROGRESS"
>;
export type RecoverFinalizingLocalAction = RecoveryEngineSignal<
  "RECOVER_FINALIZING_LOCAL"
>;
export type RecoverIncompleteCaptureAction = RecoveryEngineSignal<
  "RECOVER_INCOMPLETE_CAPTURE"
>;

export type BellowsSessionAction =
  | ArchiveRequestedAction
  | BeginIntegrityVerificationAction
  | CaptureStartedForAllRequiredParticipantsAction
  | CaptureStartedWithMissingParticipantAction
  | CoHostEndSessionAction
  | CountdownCompletedAction
  | HostAbortStartAction
  | HostBeginAccountLinkAction
  | HostBeginInvitesAction
  | HostBeginSetupAction
  | HostDisconnectedAction
  | HostEndSessionAction
  | HostRunPreflightAction
  | HostStartBroadcastAction
  | HostStartShowAction
  | HostStopBroadcastAction
  | HostUpdateDraftAction
  | HostWaitForParticipantsAction
  | IntegrityFatalAction
  | IntegrityPartialButUsableAction
  | IntegrityVerifiedAction
  | InvitesGeneratedAction
  | LocalSegmentsFinalizedAction
  | ManifestAssembledAction
  | ParticipantBecameUnreadyAction
  | ParticipantDisconnectedAction
  | ParticipantJoinedAction
  | ParticipantNetworkLostLocalCaptureOkAction
  | ParticipantReadyAction
  | ParticipantRejoinConfirmedAction
  | ParticipantRejoinFailedAction
  | ParticipantRejoinStartedAction
  | PlatformLinkFailedAction
  | PlatformLinkSucceededAction
  | PreflightFailedAction
  | PreflightPassedAction
  | RecoverFinalizingLocalAction
  | RecoverIncompleteCaptureAction
  | RecoverRecordingActiveAction
  | RecoverUploadInProgressAction
  | SessionSealedAction
  | SessionSealedWithGapsAction
  | SessionSealFailedFatalAction
  | UploadDegradedAction
  | UploadPausedAction
  | UploadProgressRecordedAction
  | UploadResumeFailedAction
  | UploadResumeRequestedAction
  | UploadsCompleteAction;

export type BellowsRecoveryAction =
  | RecoverFinalizingLocalAction
  | RecoverIncompleteCaptureAction
  | RecoverRecordingActiveAction
  | RecoverUploadInProgressAction;

export function isRecoveryAction(
  action: BellowsSessionAction,
): action is BellowsRecoveryAction {
  return action.source === "recovery";
}
