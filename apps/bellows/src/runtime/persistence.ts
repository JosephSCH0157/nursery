import type { BellowsEngineEffect } from "../domain/events.js";
import type { BellowsRuntimeEffectContext } from "./contracts.js";

export type BellowsPersistenceEffectType =
  | "resume_pending_uploads"
  | "verify_integrity"
  | "assemble_manifest"
  | "seal_session_record";

export type BellowsPersistenceEffect<
  TType extends BellowsPersistenceEffectType = BellowsPersistenceEffectType,
> = BellowsEngineEffect<TType>;

export interface BellowsPersistenceRuntime {
  resumePendingUploads(
    effect: BellowsPersistenceEffect<"resume_pending_uploads">,
    context: BellowsRuntimeEffectContext<"resume_pending_uploads">,
  ): Promise<void> | void;
  verifyIntegrity(
    effect: BellowsPersistenceEffect<"verify_integrity">,
    context: BellowsRuntimeEffectContext<"verify_integrity">,
  ): Promise<void> | void;
  assembleManifest(
    effect: BellowsPersistenceEffect<"assemble_manifest">,
    context: BellowsRuntimeEffectContext<"assemble_manifest">,
  ): Promise<void> | void;
  sealSessionRecord(
    effect: BellowsPersistenceEffect<"seal_session_record">,
    context: BellowsRuntimeEffectContext<"seal_session_record">,
  ): Promise<void> | void;
}
