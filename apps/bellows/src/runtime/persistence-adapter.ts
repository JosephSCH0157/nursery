import type { BellowsSessionAction } from "../engine/actions.js";
import type { BellowsRuntimeEffectContext } from "./contracts.js";
import type {
  BellowsPersistenceEffect,
  BellowsPersistenceRuntime,
} from "./persistence.js";
import {
  snapshotBellowsSessionForPersistence,
  type BellowsPersistenceFollowUpActionType,
  type BellowsPersistenceObservation,
  type BellowsPersistenceStore,
} from "./persistence-store.js";
import { createBellowsMemoryPersistenceStore } from "./persistence-store.js";

export type BellowsResumeUploadsResolution =
  | "complete"
  | "degraded"
  | "paused"
  | "manual";

export type BellowsIntegrityResolution =
  | "verified"
  | "partial"
  | "fatal"
  | "manual";

export type BellowsManifestResolution = "assembled" | "manual";

export type BellowsSealResolution =
  | "sealed"
  | "sealed_with_gaps"
  | "fatal"
  | "manual";

export interface BellowsPersistenceAdapterOptions {
  readonly store?: BellowsPersistenceStore;
  readonly resumeUploadsResolution?: BellowsResumeUploadsResolution;
  readonly integrityResolution?: BellowsIntegrityResolution;
  readonly manifestResolution?: BellowsManifestResolution;
  readonly sealResolution?: BellowsSealResolution;
  readonly onObservation?: (observation: BellowsPersistenceObservation) => void;
}

function buildObservation(
  effect: BellowsPersistenceEffect,
  context: BellowsRuntimeEffectContext,
  followUpActionType: BellowsPersistenceFollowUpActionType | null,
): BellowsPersistenceObservation {
  return {
    effectType: effect.type,
    triggerActionType: context.action.type,
    lifecycleAtDispatch: context.nextState.machineState.lifecycle,
    followUpActionType,
    snapshot: snapshotBellowsSessionForPersistence(context.nextState),
  };
}

async function dispatchPersistenceFollowUp(
  context: BellowsRuntimeEffectContext,
  type: BellowsPersistenceFollowUpActionType,
): Promise<void> {
  const action = buildPersistenceFollowUpAction(context, type);
  await context.dispatch(action);
}

function buildPersistenceFollowUpAction(
  context: BellowsRuntimeEffectContext,
  type: BellowsPersistenceFollowUpActionType,
): BellowsSessionAction {
  const offsetMs = context.action.meta.offsetMs;

  switch (type) {
    case "UPLOADS_COMPLETE":
      return {
        source: "upload",
        type: "UPLOADS_COMPLETE",
        payload: {},
        meta: {
          actorId: "system",
          offsetMs,
        },
      };
    case "UPLOAD_DEGRADED":
      return {
        source: "upload",
        type: "UPLOAD_DEGRADED",
        payload: {},
        meta: {
          actorId: "system",
          offsetMs,
        },
      };
    case "UPLOAD_PAUSED":
      return {
        source: "upload",
        type: "UPLOAD_PAUSED",
        payload: {},
        meta: {
          actorId: "system",
          offsetMs,
        },
      };
    case "INTEGRITY_VERIFIED":
      return {
        source: "engine",
        type: "INTEGRITY_VERIFIED",
        payload: {},
        meta: {
          actorId: "engine",
          offsetMs,
        },
      };
    case "INTEGRITY_PARTIAL_BUT_USABLE":
      return {
        source: "engine",
        type: "INTEGRITY_PARTIAL_BUT_USABLE",
        payload: {},
        meta: {
          actorId: "engine",
          offsetMs,
        },
      };
    case "INTEGRITY_FATAL":
      return {
        source: "engine",
        type: "INTEGRITY_FATAL",
        payload: {},
        meta: {
          actorId: "engine",
          offsetMs,
        },
      };
    case "MANIFEST_ASSEMBLED":
      return {
        source: "engine",
        type: "MANIFEST_ASSEMBLED",
        payload: {},
        meta: {
          actorId: "engine",
          offsetMs,
        },
      };
    case "SESSION_SEALED":
      return {
        source: "engine",
        type: "SESSION_SEALED",
        payload: {},
        meta: {
          actorId: "engine",
          offsetMs,
        },
      };
    case "SESSION_SEALED_WITH_GAPS":
      return {
        source: "engine",
        type: "SESSION_SEALED_WITH_GAPS",
        payload: {},
        meta: {
          actorId: "engine",
          offsetMs,
        },
      };
    case "SESSION_SEAL_FAILED_FATAL":
      return {
        source: "engine",
        type: "SESSION_SEAL_FAILED_FATAL",
        payload: {},
        meta: {
          actorId: "engine",
          offsetMs,
        },
      };
  }
}

export class BellowsPersistenceAdapter implements BellowsPersistenceRuntime {
  public readonly store: BellowsPersistenceStore;

  public constructor(
    private readonly options: BellowsPersistenceAdapterOptions = {},
  ) {
    this.store = options.store ?? createBellowsMemoryPersistenceStore();
  }

  public async resumePendingUploads(
    effect: BellowsPersistenceEffect<"resume_pending_uploads">,
    context: BellowsRuntimeEffectContext<"resume_pending_uploads">,
  ): Promise<void> {
    const resolution = this.options.resumeUploadsResolution ?? "complete";
    const followUpActionType =
      resolution === "manual"
        ? null
        : resolution === "complete"
          ? "UPLOADS_COMPLETE"
          : resolution === "degraded"
            ? "UPLOAD_DEGRADED"
            : "UPLOAD_PAUSED";

    await this.recordAndMaybeDispatch(effect, context, followUpActionType);
  }

  public async verifyIntegrity(
    effect: BellowsPersistenceEffect<"verify_integrity">,
    context: BellowsRuntimeEffectContext<"verify_integrity">,
  ): Promise<void> {
    const resolution = this.options.integrityResolution ?? "verified";
    const followUpActionType =
      resolution === "manual"
        ? null
        : resolution === "verified"
          ? "INTEGRITY_VERIFIED"
          : resolution === "partial"
            ? "INTEGRITY_PARTIAL_BUT_USABLE"
            : "INTEGRITY_FATAL";

    await this.recordAndMaybeDispatch(effect, context, followUpActionType);
  }

  public async assembleManifest(
    effect: BellowsPersistenceEffect<"assemble_manifest">,
    context: BellowsRuntimeEffectContext<"assemble_manifest">,
  ): Promise<void> {
    const resolution = this.options.manifestResolution ?? "assembled";
    const followUpActionType =
      resolution === "assembled" ? "MANIFEST_ASSEMBLED" : null;

    await this.recordAndMaybeDispatch(effect, context, followUpActionType);
  }

  public async sealSessionRecord(
    effect: BellowsPersistenceEffect<"seal_session_record">,
    context: BellowsRuntimeEffectContext<"seal_session_record">,
  ): Promise<void> {
    const resolution = this.options.sealResolution ?? "sealed";
    const followUpActionType =
      resolution === "manual"
        ? null
        : resolution === "sealed"
          ? "SESSION_SEALED"
          : resolution === "sealed_with_gaps"
            ? "SESSION_SEALED_WITH_GAPS"
            : "SESSION_SEAL_FAILED_FATAL";

    await this.recordAndMaybeDispatch(effect, context, followUpActionType);
  }

  private async recordAndMaybeDispatch(
    effect: BellowsPersistenceEffect,
    context: BellowsRuntimeEffectContext,
    followUpActionType: BellowsPersistenceFollowUpActionType | null,
  ): Promise<void> {
    const observation = buildObservation(effect, context, followUpActionType);
    await this.store.appendObservation(observation);
    this.options.onObservation?.(observation);

    if (followUpActionType) {
      await dispatchPersistenceFollowUp(context, followUpActionType);
    }
  }
}

export function createBellowsPersistenceAdapter(
  options: BellowsPersistenceAdapterOptions = {},
): BellowsPersistenceAdapter {
  return new BellowsPersistenceAdapter(options);
}
