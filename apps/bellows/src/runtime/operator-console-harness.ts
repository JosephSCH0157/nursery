import type { BellowsSessionAction } from "../engine/actions.js";
import type { BellowsRejectedTransition } from "../engine/errors.js";
import type { ParticipantId } from "../domain/ids.js";
import type { BellowsOffsetMs } from "../domain/primitives.js";
import type { BellowsSession, BellowsSessionDraft } from "../domain/session.js";
import { createBellowsEffectDispatcher } from "./dispatcher.js";
import { createBellowsNoopRuntimeAdapters } from "./noop-adapters.js";
import {
  BellowsPersistenceAdapter,
  type BellowsPersistenceAdapterOptions,
} from "./persistence-adapter.js";
import {
  createBellowsMemoryPersistenceStore,
  type BellowsMemoryPersistenceStore,
  type BellowsPersistenceObservation,
  type BellowsPersistenceSessionSnapshot,
} from "./persistence-store.js";
import type {
  BellowsEffectDispatchReceipt,
  BellowsRuntimeDispatchResult,
  BellowsSessionRuntimeOptions,
} from "./contracts.js";
import {
  BellowsSessionRuntime,
  createBellowsSessionRuntime,
} from "./session-runtime.js";
import {
  BellowsStudioShellAdapter,
  type BellowsStudioShellAdapterOptions,
  type BellowsStudioShellObservation,
} from "./studio-shell-adapter.js";

type HostCommandResult = Promise<BellowsRuntimeDispatchResult>;

type HostCommandAction = Extract<BellowsSessionAction, { readonly source: "host" }>;

type HostCommandType = HostCommandAction["type"];

type HostCommandPayload<TType extends HostCommandType> = Extract<
  HostCommandAction,
  { readonly type: TType }
>["payload"];

export interface BellowsOperatorConsoleHostControlSurface {
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

export interface BellowsOperatorConsoleSystemControlSurface {
  confirmCaptureReady(): Promise<BellowsRuntimeDispatchResult>;
  confirmCaptureStartedDegraded(): Promise<BellowsRuntimeDispatchResult>;
  finalizeLocalSegments(): Promise<BellowsRuntimeDispatchResult>;
  beginIntegrityVerification(): Promise<BellowsRuntimeDispatchResult>;
  archiveSession(): Promise<BellowsRuntimeDispatchResult>;
}

export interface BellowsOperatorDispatchRecord {
  readonly actionSource: BellowsSessionAction["source"];
  readonly actionType: BellowsSessionAction["type"];
  readonly lifecycleBefore: BellowsSession["machineState"]["lifecycle"];
  readonly lifecycleAfter: BellowsSession["machineState"]["lifecycle"];
  readonly transitionKind: BellowsRuntimeDispatchResult["transition"]["kind"];
  readonly rejection: BellowsRejectedTransition | null;
  readonly effectDispatches: readonly BellowsEffectDispatchReceipt[];
}

export interface BellowsOperatorConsoleSnapshot {
  readonly session: BellowsSession;
  readonly studioShellObservations: readonly BellowsStudioShellObservation[];
  readonly persistenceObservations: readonly BellowsPersistenceObservation[];
  readonly persistenceSnapshots: readonly BellowsPersistenceSessionSnapshot[];
  readonly dispatchLog: readonly BellowsOperatorDispatchRecord[];
}

export interface BellowsOperatorConsoleHarnessOptions
  extends Omit<BellowsSessionRuntimeOptions, "effectDispatcher"> {
  readonly hostParticipantId: ParticipantId;
  readonly studioShell?: BellowsStudioShellAdapterOptions;
  readonly persistence?: Omit<BellowsPersistenceAdapterOptions, "store">;
  readonly nextOffsetMs?: () => BellowsOffsetMs;
}

function createMonotonicOffsetClock(startAt = 0): () => BellowsOffsetMs {
  let current = startAt;

  return () => current++ as BellowsOffsetMs;
}

export class BellowsOperatorConsoleHarness {
  private readonly dispatchLog: BellowsOperatorDispatchRecord[] = [];
  private readonly persistenceStore: BellowsMemoryPersistenceStore;
  private readonly runtime: BellowsSessionRuntime;
  private readonly studioShellObservations: BellowsStudioShellObservation[] = [];
  private readonly nextOffsetMs: () => BellowsOffsetMs;

  public readonly host: BellowsOperatorConsoleHostControlSurface;
  public readonly system: BellowsOperatorConsoleSystemControlSurface;

  public constructor(private readonly options: BellowsOperatorConsoleHarnessOptions) {
    this.nextOffsetMs = options.nextOffsetMs ?? createMonotonicOffsetClock();
    this.persistenceStore = createBellowsMemoryPersistenceStore();

    const studioShell = new BellowsStudioShellAdapter({
      ...options.studioShell,
      onObservation: (observation) => {
        this.studioShellObservations.push(observation);
        options.studioShell?.onObservation?.(observation);
      },
    });

    const persistence = new BellowsPersistenceAdapter({
      ...options.persistence,
      store: this.persistenceStore,
    });

    this.runtime = createBellowsSessionRuntime({
      initialState: options.initialState,
      engineContext: options.engineContext,
      effectDispatcher: createBellowsEffectDispatcher(
        createBellowsNoopRuntimeAdapters({
          studioShell,
          persistence,
        }),
      ),
    });

    this.host = {
      beginSetup: () => this.dispatchHost("HOST_BEGIN_SETUP", {}),
      updateDraft: (draft) => this.dispatchHost("HOST_UPDATE_DRAFT", { draft }),
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

    this.system = {
      confirmCaptureReady: () =>
        this.dispatchSystem({
          source: "capture",
          type: "CAPTURE_STARTED_FOR_ALL_REQUIRED_PARTICIPANTS",
          payload: {},
          meta: {
            actorId: "system",
            offsetMs: this.nextOffsetMs(),
          },
        }),
      confirmCaptureStartedDegraded: () =>
        this.dispatchSystem({
          source: "capture",
          type: "CAPTURE_STARTED_WITH_MISSING_PARTICIPANT",
          payload: {},
          meta: {
            actorId: "system",
            offsetMs: this.nextOffsetMs(),
          },
        }),
      finalizeLocalSegments: () =>
        this.dispatchSystem({
          source: "capture",
          type: "LOCAL_SEGMENTS_FINALIZED",
          payload: {},
          meta: {
            actorId: "system",
            offsetMs: this.nextOffsetMs(),
          },
        }),
      beginIntegrityVerification: () =>
        this.dispatchSystem({
          source: "engine",
          type: "BEGIN_INTEGRITY_VERIFICATION",
          payload: {},
          meta: {
            actorId: "engine",
            offsetMs: this.nextOffsetMs(),
          },
        }),
      archiveSession: () =>
        this.dispatchSystem({
          source: "engine",
          type: "ARCHIVE_REQUESTED",
          payload: {},
          meta: {
            actorId: "engine",
            offsetMs: this.nextOffsetMs(),
          },
        }),
    };
  }

  public getState(): BellowsSession {
    return this.runtime.getState();
  }

  public getStudioShellObservations(): readonly BellowsStudioShellObservation[] {
    return this.studioShellObservations;
  }

  public getPersistenceObservations(): readonly BellowsPersistenceObservation[] {
    return this.persistenceStore.getObservations();
  }

  public getPersistenceSnapshots(): readonly BellowsPersistenceSessionSnapshot[] {
    return this.persistenceStore.getSnapshots();
  }

  public getDispatchLog(): readonly BellowsOperatorDispatchRecord[] {
    return this.dispatchLog;
  }

  public getSnapshot(): BellowsOperatorConsoleSnapshot {
    return {
      session: this.getState(),
      studioShellObservations: this.getStudioShellObservations(),
      persistenceObservations: this.getPersistenceObservations(),
      persistenceSnapshots: this.getPersistenceSnapshots(),
      dispatchLog: this.getDispatchLog(),
    };
  }

  public async dispatch(
    action: BellowsSessionAction,
  ): Promise<BellowsRuntimeDispatchResult> {
    const previousState = this.runtime.getState();
    const result = await this.runtime.dispatch(action);

    this.dispatchLog.push({
      actionSource: action.source,
      actionType: action.type,
      lifecycleBefore: previousState.machineState.lifecycle,
      lifecycleAfter: result.currentState.machineState.lifecycle,
      transitionKind: result.transition.kind,
      rejection:
        result.transition.kind === "rejected"
          ? result.transition.rejection
          : null,
      effectDispatches: result.effectDispatches,
    });

    return result;
  }

  private dispatchSystem(
    action: BellowsSessionAction,
  ): Promise<BellowsRuntimeDispatchResult> {
    return this.dispatch(action);
  }

  private dispatchHost<TType extends HostCommandType>(
    type: TType,
    payload: HostCommandPayload<TType>,
  ): HostCommandResult {
    const action = {
      source: "host",
      type,
      payload,
      meta: {
        actorId: this.options.hostParticipantId,
        offsetMs: this.nextOffsetMs(),
      },
    } as Extract<HostCommandAction, { readonly type: TType }>;

    return this.dispatch(action);
  }
}

export function createBellowsOperatorConsoleHarness(
  options: BellowsOperatorConsoleHarnessOptions,
): BellowsOperatorConsoleHarness {
  return new BellowsOperatorConsoleHarness(options);
}
