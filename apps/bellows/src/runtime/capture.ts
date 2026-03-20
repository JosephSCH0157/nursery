import type { BellowsEngineEffect } from "../domain/events.js";
import type { BellowsRuntimeEffectContext } from "./contracts.js";

export type BellowsCaptureEffectType =
  | "establish_t0"
  | "emit_sync_marker"
  | "start_local_recording"
  | "finalize_local_segments";

export type BellowsCaptureEffect<
  TType extends BellowsCaptureEffectType = BellowsCaptureEffectType,
> = BellowsEngineEffect<TType>;

export interface BellowsCaptureRuntime {
  establishTimebase(
    effect: BellowsCaptureEffect<"establish_t0">,
    context: BellowsRuntimeEffectContext<"establish_t0">,
  ): Promise<void> | void;
  emitSyncMarker(
    effect: BellowsCaptureEffect<"emit_sync_marker">,
    context: BellowsRuntimeEffectContext<"emit_sync_marker">,
  ): Promise<void> | void;
  startLocalRecording(
    effect: BellowsCaptureEffect<"start_local_recording">,
    context: BellowsRuntimeEffectContext<"start_local_recording">,
  ): Promise<void> | void;
  finalizeLocalSegments(
    effect: BellowsCaptureEffect<"finalize_local_segments">,
    context: BellowsRuntimeEffectContext<"finalize_local_segments">,
  ): Promise<void> | void;
}
