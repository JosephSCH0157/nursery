import type { BellowsSession } from "../domain/session.js";
import type { BellowsSessionEvent } from "../domain/events.js";
import {
  type BellowsRecoveryAction,
  type BellowsEngineContext,
  type BellowsSessionAction,
  isRecoveryAction,
} from "./actions.js";
import type { BellowsTransitionResult } from "./errors.js";

export function isBellowsRecoveryAction(
  action: BellowsSessionAction,
): action is BellowsRecoveryAction {
  return isRecoveryAction(action);
}

export function applyBellowsRecoveryTransition(
  session: BellowsSession,
  action: BellowsRecoveryAction,
  context: BellowsEngineContext,
  accept: (
    nextState: BellowsSession,
    actionEventType: BellowsSessionEvent["type"],
    actionEventPayload?: Readonly<Record<string, unknown>>,
  ) => BellowsTransitionResult,
): BellowsTransitionResult {
  switch (action.type) {
    case "RECOVER_RECORDING_ACTIVE": {
      const lifecycle = action.payload.lifecycle;
      const recordingState =
        lifecycle === "recording_active"
          ? "active"
          : lifecycle === "recording_degraded"
            ? "degraded"
            : "offline_local";
      const nextState: BellowsSession = {
        ...session,
        machineState: {
          ...session.machineState,
          lifecycle,
          broadcast: action.payload.broadcastState ?? session.machineState.broadcast,
          outcome: null,
        },
        recordingState,
      };

      void context;

      return accept(nextState, "recovery_entered", { lifecycle });
    }

    case "RECOVER_UPLOAD_IN_PROGRESS": {
      const nextState: BellowsSession = {
        ...session,
        machineState: {
          ...session.machineState,
          lifecycle: "upload_resuming",
          outcome: null,
        },
        uploadState: "resuming",
      };

      void context;

      return accept(nextState, "recovery_entered", {
        lifecycle: "upload_resuming",
      });
    }

    case "RECOVER_FINALIZING_LOCAL": {
      const nextState: BellowsSession = {
        ...session,
        machineState: {
          ...session.machineState,
          lifecycle: "finalizing_local",
          outcome: null,
        },
        recordingState: "stopping",
        uploadState: "finalizing_local",
      };

      void context;

      return accept(nextState, "recovery_entered", {
        lifecycle: "finalizing_local",
      });
    }

    case "RECOVER_INCOMPLETE_CAPTURE": {
      const nextState: BellowsSession = {
        ...session,
        machineState: {
          ...session.machineState,
          lifecycle: "incomplete_capture",
          outcome: "incomplete_capture",
        },
      };

      void context;

      return accept(nextState, "recovery_entered", {
        lifecycle: "incomplete_capture",
      });
    }
  }
}
