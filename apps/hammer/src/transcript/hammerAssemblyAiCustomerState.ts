export type HammerAssemblyAiPersistedState =
  | "quoted"
  | "reserved"
  | "queued"
  | "processing"
  | "submission_unknown"
  | "failed"
  | "completed";

export type HammerAssemblyAiCustomerView = {
  state: "queued" | "processing" | "failed" | "completed";
  title: string;
  detail: string;
  transcriptSucceeded: boolean;
  retryAllowed: false;
};

/** Customer projection deliberately collapses financial/internal states. */
export function projectHammerAssemblyAiCustomerState(
  state: HammerAssemblyAiPersistedState,
): HammerAssemblyAiCustomerView {
  switch (state) {
    case "quoted":
    case "reserved":
    case "queued":
      return {
        state: "queued",
        title: "Transcription queued",
        detail: "Your accepted transcription is waiting for its single bounded provider attempt.",
        transcriptSucceeded: false,
        retryAllowed: false,
      };
    case "processing":
      return {
        state: "processing",
        title: "Preparing transcript",
        detail: "Hammer is validating speaker and timing evidence before saving the transcript.",
        transcriptSucceeded: false,
        retryAllowed: false,
      };
    case "submission_unknown":
      return {
        state: "failed",
        title: "Transcription needs review",
        detail: "The provider submission could not be confirmed. Hammer will not retry or charge again automatically.",
        transcriptSucceeded: false,
        retryAllowed: false,
      };
    case "failed":
      return {
        state: "failed",
        title: "Transcription did not complete",
        detail: "No transcript was accepted. Any funding relief is handled through the original reservation.",
        transcriptSucceeded: false,
        retryAllowed: false,
      };
    case "completed":
      return {
        state: "completed",
        title: "Transcript ready",
        detail: "The validated transcript is saved and ready in Hammer.",
        transcriptSucceeded: true,
        retryAllowed: false,
      };
  }
}
