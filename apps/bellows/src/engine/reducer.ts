import type { BellowsSession } from "../domain/session.js";
import type { BellowsTransitionResult } from "./errors.js";
import type { BellowsEngineContext, BellowsSessionAction } from "./actions.js";
import { applyBellowsTransition } from "./transitions.js";

export function reduceBellowsSession(
  state: BellowsSession,
  action: BellowsSessionAction,
  context: BellowsEngineContext,
): BellowsTransitionResult {
  return applyBellowsTransition(state, action, context);
}
