import type {
  BellowsEngineEffect,
  BellowsSessionEvent,
} from "../domain/events.js";
import type { BellowsLifecycleState } from "../domain/states.js";
import type { BellowsSession } from "../domain/session.js";
import type { BellowsSessionAction } from "./actions.js";

export type BellowsTransitionRejectionCode =
  | "illegal_transition"
  | "unauthorized_actor"
  | "invalid_session_draft"
  | "insufficient_ready_participants"
  | "live_targets_not_configured"
  | "recovery_unavailable";

export interface BellowsRejectedTransition {
  readonly code: BellowsTransitionRejectionCode;
  readonly message: string;
  readonly lifecycle: BellowsLifecycleState;
  readonly actionType: BellowsSessionAction["type"];
}

export interface BellowsAcceptedTransitionResult {
  readonly kind: "accepted";
  readonly state: BellowsSession;
  readonly effects: readonly BellowsEngineEffect[];
  readonly events: readonly BellowsSessionEvent[];
}

export interface BellowsRejectedTransitionResult {
  readonly kind: "rejected";
  readonly state: BellowsSession;
  readonly effects: readonly BellowsEngineEffect[];
  readonly events: readonly BellowsSessionEvent[];
  readonly rejection: BellowsRejectedTransition;
}

export type BellowsTransitionResult =
  | BellowsAcceptedTransitionResult
  | BellowsRejectedTransitionResult;
