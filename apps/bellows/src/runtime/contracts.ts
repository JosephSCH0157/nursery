import type {
  BellowsEngineEffect,
  BellowsEngineEffectType,
} from "../domain/events.js";
import type { BellowsSession } from "../domain/session.js";
import type {
  BellowsEngineContext,
  BellowsSessionAction,
} from "../engine/actions.js";
import type { BellowsTransitionResult } from "../engine/errors.js";

export type BellowsRuntimeAdapterKind =
  | "studio_shell"
  | "capture"
  | "broadcast"
  | "persistence"
  | "signaling";

export interface BellowsEffectDispatchReceipt<
  TType extends BellowsEngineEffectType = BellowsEngineEffectType,
> {
  readonly effectType: TType;
  readonly adapter: BellowsRuntimeAdapterKind;
}

export interface BellowsRuntimeDispatchResult {
  readonly previousState: BellowsSession;
  readonly currentState: BellowsSession;
  readonly transition: BellowsTransitionResult;
  readonly effectDispatches: readonly BellowsEffectDispatchReceipt[];
}

export interface BellowsRuntimeActionDispatcher {
  dispatch(action: BellowsSessionAction): Promise<BellowsRuntimeDispatchResult>;
}

export interface BellowsRuntimeEffectContext<
  TType extends BellowsEngineEffectType = BellowsEngineEffectType,
> {
  readonly effect: BellowsEngineEffect<TType>;
  readonly action: BellowsSessionAction;
  readonly previousState: BellowsSession;
  readonly nextState: BellowsSession;
  readonly transition: BellowsTransitionResult;
  readonly dispatch: BellowsRuntimeActionDispatcher["dispatch"];
}

export type BellowsEffectDispatchBatchContext = Omit<
  BellowsRuntimeEffectContext,
  "effect"
>;

export interface BellowsEffectDispatcher {
  dispatchEffects(
    effects: readonly BellowsEngineEffect[],
    context: BellowsEffectDispatchBatchContext,
  ): Promise<readonly BellowsEffectDispatchReceipt[]>;
}

export interface BellowsSessionRuntimeOptions {
  readonly initialState: BellowsSession;
  readonly engineContext: BellowsEngineContext;
  readonly effectDispatcher: BellowsEffectDispatcher;
}
