import type { BellowsRecordOnlyStatus } from "@forge/bellows";

export type BellowsCreatorWorkflowState =
  | "create"
  | "recover"
  | "device_setup"
  | "ready"
  | "recording"
  | "saving"
  | "retry_saving"
  | "incomplete_decision"
  | "hammer_handoff"
  | "complete";

export interface BellowsRecordingViewInput {
  readonly hasWorkpiece: boolean;
  readonly hasSession: boolean;
  readonly devicesReady: boolean;
  readonly capture: BellowsRecordOnlyStatus;
  readonly packageSealed: boolean;
  readonly hammerHandoffComplete: boolean;
  readonly hasIntegrityFindings: boolean;
  readonly authorityNeedsRecovery?: boolean;
}

/** Pure creator-facing projection. It owns no lifecycle state. */
export function deriveBellowsRecordingView(input: BellowsRecordingViewInput): BellowsCreatorWorkflowState {
  if (!input.hasWorkpiece || !input.hasSession) return "create";
  if (input.capture.phase === "recording") return "recording";
  if (input.capture.phase === "uploading") return "saving";
  if (input.capture.phase === "recoverable" || input.authorityNeedsRecovery) return "recover";
  if (input.hasIntegrityFindings && !input.packageSealed) return "incomplete_decision";
  if (input.packageSealed && !input.hammerHandoffComplete) return "hammer_handoff";
  if (input.hammerHandoffComplete) return "complete";
  if (input.capture.phase === "failed") return "retry_saving";
  return input.devicesReady ? "ready" : "device_setup";
}
