import type { BellowsSession } from "../domain/session.js";
import type { BellowsSessionAction } from "../engine/actions.js";
import { reduceBellowsSession } from "../engine/reducer.js";
import type {
  BellowsRuntimeActionDispatcher,
  BellowsRuntimeDispatchResult,
  BellowsSessionRuntimeOptions,
} from "./contracts.js";

export class BellowsSessionRuntime implements BellowsRuntimeActionDispatcher {
  private state: BellowsSession;

  public constructor(private readonly options: BellowsSessionRuntimeOptions) {
    this.state = options.initialState;
  }

  public getState(): BellowsSession {
    return this.state;
  }

  public async dispatch(
    action: BellowsSessionAction,
  ): Promise<BellowsRuntimeDispatchResult> {
    const previousState = this.state;
    const transition = reduceBellowsSession(
      previousState,
      action,
      this.options.engineContext,
    );

    this.state = transition.state;

    const effectDispatches =
      transition.kind === "accepted" && transition.effects.length > 0
        ? await this.options.effectDispatcher.dispatchEffects(transition.effects, {
            action,
            previousState,
            nextState: transition.state,
            transition,
            dispatch: (nextAction) => this.dispatch(nextAction),
          })
        : [];

    return {
      previousState,
      currentState: this.state,
      transition,
      effectDispatches,
    };
  }
}

export function createBellowsSessionRuntime(
  options: BellowsSessionRuntimeOptions,
): BellowsSessionRuntime {
  return new BellowsSessionRuntime(options);
}
