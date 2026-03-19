import type { BellowsSessionAction } from "../engine/actions.js";
import type { BellowsOffsetMs } from "../domain/primitives.js";
import type { BellowsRuntimeEffectContext } from "./contracts.js";
import type {
  BellowsStudioShellEffect,
  BellowsStudioShellEffectType,
  BellowsStudioShellRuntime,
} from "./studio-shell.js";

export type BellowsStudioShellPreflightResolution = "pass" | "fail" | "manual";
export type BellowsStudioShellCountdownResolution = "complete" | "manual";

export type BellowsStudioShellFollowUpActionType =
  | "PREFLIGHT_FAILED"
  | "PREFLIGHT_PASSED"
  | "COUNTDOWN_COMPLETED";

export interface BellowsStudioShellObservation {
  readonly effectType: BellowsStudioShellEffectType;
  readonly triggerActionType: BellowsSessionAction["type"];
  readonly lifecycleAtDispatch: string;
  readonly followUpActionType: BellowsStudioShellFollowUpActionType | null;
}

export interface BellowsStudioShellAdapterOptions {
  readonly preflightResolution?: BellowsStudioShellPreflightResolution;
  readonly countdownResolution?: BellowsStudioShellCountdownResolution;
  readonly onObservation?: (observation: BellowsStudioShellObservation) => void;
}

function recordObservation(
  effect: BellowsStudioShellEffect,
  context: BellowsRuntimeEffectContext,
  followUpActionType: BellowsStudioShellFollowUpActionType | null,
  options: BellowsStudioShellAdapterOptions,
): void {
  options.onObservation?.({
    effectType: effect.type,
    triggerActionType: context.action.type,
    lifecycleAtDispatch: context.nextState.machineState.lifecycle,
    followUpActionType,
  });
}

async function dispatchEngineFollowUp(
  context: BellowsRuntimeEffectContext,
  type: BellowsStudioShellFollowUpActionType,
): Promise<void> {
  await context.dispatch({
    source: "engine",
    type,
    payload: {},
    meta: {
      actorId: "engine",
      offsetMs: context.action.meta.offsetMs as BellowsOffsetMs,
    },
  });
}

export class BellowsStudioShellAdapter implements BellowsStudioShellRuntime {
  public constructor(
    private readonly options: BellowsStudioShellAdapterOptions = {},
  ) {}

  public async runPreflightChecks(
    effect: BellowsStudioShellEffect<"run_preflight_checks">,
    context: BellowsRuntimeEffectContext<"run_preflight_checks">,
  ): Promise<void> {
    const resolution = this.options.preflightResolution ?? "pass";
    const followUpActionType =
      resolution === "manual"
        ? null
        : resolution === "pass"
          ? "PREFLIGHT_PASSED"
          : "PREFLIGHT_FAILED";

    recordObservation(effect, context, followUpActionType, this.options);

    if (followUpActionType) {
      await dispatchEngineFollowUp(context, followUpActionType);
    }
  }

  public async startCountdown(
    effect: BellowsStudioShellEffect<"start_countdown">,
    context: BellowsRuntimeEffectContext<"start_countdown">,
  ): Promise<void> {
    const resolution = this.options.countdownResolution ?? "complete";
    const followUpActionType =
      resolution === "complete" ? "COUNTDOWN_COMPLETED" : null;

    recordObservation(effect, context, followUpActionType, this.options);

    if (followUpActionType) {
      await dispatchEngineFollowUp(context, followUpActionType);
    }
  }
}

export function createBellowsStudioShellAdapter(
  options: BellowsStudioShellAdapterOptions = {},
): BellowsStudioShellAdapter {
  return new BellowsStudioShellAdapter(options);
}
