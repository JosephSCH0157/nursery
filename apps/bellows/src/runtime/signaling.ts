import type { BellowsEngineEffect } from "../domain/events.js";
import type { BellowsRuntimeEffectContext } from "./contracts.js";

export type BellowsSignalingEffectType =
  | "generate_invite_links"
  | "promote_co_host"
  | "enter_engine_stewardship";

export type BellowsSignalingEffect<
  TType extends BellowsSignalingEffectType = BellowsSignalingEffectType,
> = BellowsEngineEffect<TType>;

export interface BellowsSignalingRuntime {
  generateInviteLinks(
    effect: BellowsSignalingEffect<"generate_invite_links">,
    context: BellowsRuntimeEffectContext<"generate_invite_links">,
  ): Promise<void> | void;
  promoteCoHost(
    effect: BellowsSignalingEffect<"promote_co_host">,
    context: BellowsRuntimeEffectContext<"promote_co_host">,
  ): Promise<void> | void;
  enterEngineStewardship(
    effect: BellowsSignalingEffect<"enter_engine_stewardship">,
    context: BellowsRuntimeEffectContext<"enter_engine_stewardship">,
  ): Promise<void> | void;
}
