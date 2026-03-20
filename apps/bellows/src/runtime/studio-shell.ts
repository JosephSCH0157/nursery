import type { BellowsEngineEffect } from "../domain/events.js";
import type { BellowsRuntimeEffectContext } from "./contracts.js";

export type BellowsStudioShellEffectType =
  | "run_preflight_checks"
  | "start_countdown";

export type BellowsStudioShellEffect<
  TType extends BellowsStudioShellEffectType = BellowsStudioShellEffectType,
> = BellowsEngineEffect<TType>;

export interface BellowsStudioShellRuntime {
  runPreflightChecks(
    effect: BellowsStudioShellEffect<"run_preflight_checks">,
    context: BellowsRuntimeEffectContext<"run_preflight_checks">,
  ): Promise<void> | void;
  startCountdown(
    effect: BellowsStudioShellEffect<"start_countdown">,
    context: BellowsRuntimeEffectContext<"start_countdown">,
  ): Promise<void> | void;
}
