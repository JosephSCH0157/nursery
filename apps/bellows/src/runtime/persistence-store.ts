import type { BellowsSessionAction } from "../engine/actions.js";
import type { BellowsSession } from "../domain/session.js";
import type { BellowsPersistenceEffectType } from "./persistence.js";

export type BellowsPersistenceFollowUpActionType =
  | "UPLOADS_COMPLETE"
  | "UPLOAD_DEGRADED"
  | "UPLOAD_PAUSED"
  | "INTEGRITY_VERIFIED"
  | "INTEGRITY_PARTIAL_BUT_USABLE"
  | "INTEGRITY_FATAL"
  | "MANIFEST_ASSEMBLED"
  | "SESSION_SEALED"
  | "SESSION_SEALED_WITH_GAPS"
  | "SESSION_SEAL_FAILED_FATAL";

export interface BellowsPersistenceSessionSnapshot {
  readonly lifecycle: BellowsSession["machineState"]["lifecycle"];
  readonly recordingState: BellowsSession["recordingState"];
  readonly broadcastState: BellowsSession["broadcastState"];
  readonly uploadState: BellowsSession["uploadState"];
  readonly sealState: BellowsSession["sealState"];
  readonly integrityFlags: readonly BellowsSession["integrityFlags"][number][];
  readonly eventCount: number;
}

export interface BellowsPersistenceObservation {
  readonly effectType: BellowsPersistenceEffectType;
  readonly triggerActionType: BellowsSessionAction["type"];
  readonly lifecycleAtDispatch: BellowsSession["machineState"]["lifecycle"];
  readonly followUpActionType: BellowsPersistenceFollowUpActionType | null;
  readonly snapshot: BellowsPersistenceSessionSnapshot;
}

export interface BellowsPersistenceStore {
  appendObservation(
    observation: BellowsPersistenceObservation,
  ): Promise<void> | void;
}

export function snapshotBellowsSessionForPersistence(
  session: BellowsSession,
): BellowsPersistenceSessionSnapshot {
  return {
    lifecycle: session.machineState.lifecycle,
    recordingState: session.recordingState,
    broadcastState: session.broadcastState,
    uploadState: session.uploadState,
    sealState: session.sealState,
    integrityFlags: [...session.integrityFlags],
    eventCount: session.events.length,
  };
}

export class BellowsMemoryPersistenceStore implements BellowsPersistenceStore {
  private readonly observations: BellowsPersistenceObservation[] = [];

  public appendObservation(observation: BellowsPersistenceObservation): void {
    this.observations.push(observation);
  }

  public getObservations(): readonly BellowsPersistenceObservation[] {
    return this.observations;
  }

  public getSnapshots(): readonly BellowsPersistenceSessionSnapshot[] {
    return this.observations.map((observation) => observation.snapshot);
  }
}

export function createBellowsMemoryPersistenceStore(): BellowsMemoryPersistenceStore {
  return new BellowsMemoryPersistenceStore();
}
