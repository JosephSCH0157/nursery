import type {
  ParticipantId,
} from "../domain/ids.js";
import type { BellowsOffsetMs } from "../domain/primitives.js";
import type {
  BellowsSession,
  BellowsSessionDraft,
} from "../domain/session.js";
import type { BellowsSessionAction } from "../engine/actions.js";
import { createBellowsEffectDispatcher } from "./dispatcher.js";
import { createBellowsNoopRuntimeAdapters } from "./noop-adapters.js";
import type {
  BellowsRuntimeDispatchResult,
  BellowsSessionRuntimeOptions,
} from "./contracts.js";
import {
  BellowsStudioShellAdapter,
  type BellowsStudioShellAdapterOptions,
  type BellowsStudioShellObservation,
} from "./studio-shell-adapter.js";
import {
  BellowsSessionRuntime,
  createBellowsSessionRuntime,
} from "./session-runtime.js";

type HostCommandResult = Promise<BellowsRuntimeDispatchResult>;

type BellowsHostCommandAction = Extract<
  BellowsSessionAction,
  { readonly source: "host" }
>;

type BellowsHostCommandType = BellowsHostCommandAction["type"];

type BellowsHostCommandPayload<TType extends BellowsHostCommandType> = Extract<
  BellowsHostCommandAction,
  { readonly type: TType }
>["payload"];

export interface BellowsStudioShellHostControlSurface {
  beginSetup(): HostCommandResult;
  updateDraft(draft: BellowsSessionDraft): HostCommandResult;
  beginAccountLink(): HostCommandResult;
  beginInvites(): HostCommandResult;
  waitForParticipants(): HostCommandResult;
  runPreflight(): HostCommandResult;
  startShow(): HostCommandResult;
  abortStart(): HostCommandResult;
  endSession(): HostCommandResult;
  startBroadcast(): HostCommandResult;
  stopBroadcast(): HostCommandResult;
}

export interface BellowsStudioShellHarnessOptions
  extends Omit<BellowsSessionRuntimeOptions, "effectDispatcher"> {
  readonly hostParticipantId: ParticipantId;
  readonly studioShell?: BellowsStudioShellAdapterOptions;
  readonly nextOffsetMs?: () => BellowsOffsetMs;
}

function createMonotonicOffsetClock(startAt = 0): () => BellowsOffsetMs {
  let current = startAt;

  return () => current++ as BellowsOffsetMs;
}

export class BellowsStudioShellHarness {
  private readonly observations: BellowsStudioShellObservation[] = [];
  private readonly runtime: BellowsSessionRuntime;
  private readonly nextOffsetMs: () => BellowsOffsetMs;

  public readonly host: BellowsStudioShellHostControlSurface;

  public constructor(private readonly options: BellowsStudioShellHarnessOptions) {
    this.nextOffsetMs = options.nextOffsetMs ?? createMonotonicOffsetClock();

    const studioShell = new BellowsStudioShellAdapter({
      ...options.studioShell,
      onObservation: (observation) => {
        this.observations.push(observation);
        options.studioShell?.onObservation?.(observation);
      },
    });

    this.runtime = createBellowsSessionRuntime({
      initialState: options.initialState,
      engineContext: options.engineContext,
      effectDispatcher: createBellowsEffectDispatcher(
        createBellowsNoopRuntimeAdapters({
          studioShell,
        }),
      ),
    });

    this.host = {
      beginSetup: () => this.dispatchHost("HOST_BEGIN_SETUP", {}),
      updateDraft: (draft) =>
        this.dispatchHost("HOST_UPDATE_DRAFT", { draft }),
      beginAccountLink: () => this.dispatchHost("HOST_BEGIN_ACCOUNT_LINK", {}),
      beginInvites: () => this.dispatchHost("HOST_BEGIN_INVITES", {}),
      waitForParticipants: () => this.dispatchHost("HOST_WAIT_FOR_PARTICIPANTS", {}),
      runPreflight: () => this.dispatchHost("HOST_RUN_PREFLIGHT", {}),
      startShow: () => this.dispatchHost("HOST_START_SHOW", {}),
      abortStart: () => this.dispatchHost("HOST_ABORT_START", {}),
      endSession: () => this.dispatchHost("HOST_END_SESSION", {}),
      startBroadcast: () => this.dispatchHost("HOST_START_BROADCAST", {}),
      stopBroadcast: () => this.dispatchHost("HOST_STOP_BROADCAST", {}),
    };
  }

  public getState(): BellowsSession {
    return this.runtime.getState();
  }

  public getStudioShellObservations(): readonly BellowsStudioShellObservation[] {
    return this.observations;
  }

  private dispatchHost<TType extends BellowsHostCommandType>(
    type: TType,
    payload: BellowsHostCommandPayload<TType>,
  ): HostCommandResult {
    const action = {
      source: "host",
      type,
      payload,
      meta: {
        actorId: this.options.hostParticipantId,
        offsetMs: this.nextOffsetMs(),
      },
    } as Extract<BellowsHostCommandAction, { readonly type: TType }>;

    return this.runtime.dispatch(action);
  }
}

export function createBellowsStudioShellHarness(
  options: BellowsStudioShellHarnessOptions,
): BellowsStudioShellHarness {
  return new BellowsStudioShellHarness(options);
}
