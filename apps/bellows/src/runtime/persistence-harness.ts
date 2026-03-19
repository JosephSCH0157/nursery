import type { BellowsSessionAction } from "../engine/actions.js";
import type { BellowsSession } from "../domain/session.js";
import { createBellowsEffectDispatcher } from "./dispatcher.js";
import { createBellowsNoopRuntimeAdapters } from "./noop-adapters.js";
import {
  createBellowsMemoryPersistenceStore,
  type BellowsMemoryPersistenceStore,
  type BellowsPersistenceObservation,
  type BellowsPersistenceSessionSnapshot,
} from "./persistence-store.js";
import {
  BellowsPersistenceAdapter,
  type BellowsPersistenceAdapterOptions,
} from "./persistence-adapter.js";
import type {
  BellowsRuntimeDispatchResult,
  BellowsSessionRuntimeOptions,
} from "./contracts.js";
import {
  BellowsSessionRuntime,
  createBellowsSessionRuntime,
} from "./session-runtime.js";

export interface BellowsPersistenceHarnessOptions
  extends Omit<BellowsSessionRuntimeOptions, "effectDispatcher"> {
  readonly persistence?: Omit<BellowsPersistenceAdapterOptions, "store">;
}

export class BellowsPersistenceHarness {
  private readonly runtime: BellowsSessionRuntime;
  private readonly store: BellowsMemoryPersistenceStore;
  private readonly adapter: BellowsPersistenceAdapter;

  public constructor(options: BellowsPersistenceHarnessOptions) {
    this.store = createBellowsMemoryPersistenceStore();
    this.adapter = new BellowsPersistenceAdapter({
      ...options.persistence,
      store: this.store,
    });
    this.runtime = createBellowsSessionRuntime({
      initialState: options.initialState,
      engineContext: options.engineContext,
      effectDispatcher: createBellowsEffectDispatcher(
        createBellowsNoopRuntimeAdapters({
          persistence: this.adapter,
        }),
      ),
    });
  }

  public getState(): BellowsSession {
    return this.runtime.getState();
  }

  public dispatch(
    action: BellowsSessionAction,
  ): Promise<BellowsRuntimeDispatchResult> {
    return this.runtime.dispatch(action);
  }

  public getPersistenceObservations(): readonly BellowsPersistenceObservation[] {
    return this.store.getObservations();
  }

  public getPersistenceSnapshots(): readonly BellowsPersistenceSessionSnapshot[] {
    return this.store.getSnapshots();
  }
}

export function createBellowsPersistenceHarness(
  options: BellowsPersistenceHarnessOptions,
): BellowsPersistenceHarness {
  return new BellowsPersistenceHarness(options);
}
