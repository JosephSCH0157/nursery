import type { BellowsBroadcastRuntime } from "./broadcast.js";
import type { BellowsCaptureRuntime } from "./capture.js";
import type { BellowsPersistenceRuntime } from "./persistence.js";
import type { BellowsSignalingRuntime } from "./signaling.js";
import type { BellowsStudioShellRuntime } from "./studio-shell.js";

export interface BellowsRuntimeAdapters {
  readonly studioShell: BellowsStudioShellRuntime;
  readonly capture: BellowsCaptureRuntime;
  readonly broadcast: BellowsBroadcastRuntime;
  readonly persistence: BellowsPersistenceRuntime;
  readonly signaling: BellowsSignalingRuntime;
}
