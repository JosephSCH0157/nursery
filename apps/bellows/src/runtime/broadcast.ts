import type { BellowsEngineEffect } from "../domain/events.js";
import type { BellowsRuntimeEffectContext } from "./contracts.js";

export type BellowsBroadcastEffectType =
  | "start_broadcast"
  | "stop_broadcast";

export type BellowsBroadcastEffect<
  TType extends BellowsBroadcastEffectType = BellowsBroadcastEffectType,
> = BellowsEngineEffect<TType>;

export interface BellowsBroadcastRuntime {
  startBroadcast(
    effect: BellowsBroadcastEffect<"start_broadcast">,
    context: BellowsRuntimeEffectContext<"start_broadcast">,
  ): Promise<void> | void;
  stopBroadcast(
    effect: BellowsBroadcastEffect<"stop_broadcast">,
    context: BellowsRuntimeEffectContext<"stop_broadcast">,
  ): Promise<void> | void;
}
