export type HammerPrepFailureKind = "session_open_failed" | "ai_failed" | "non_ai_missing" | "auth_missing" | null;

export type HammerAiFallbackSelection = Readonly<{
  targetKey: string;
  preparationAttemptId: string | null;
  clientRequestId: string;
  jobRequestState: "selected" | "requesting" | "created" | "failed" | "cancelled";
  jobId: string | null;
}>;

export function createHammerAiFallbackSelection(args: {
  targetKey: string;
  preparationAttemptId: string | null;
  clientRequestId: string;
}): HammerAiFallbackSelection {
  return {
    ...args,
    jobRequestState: "selected",
    jobId: null,
  };
}

export function preserveHammerAiFallbackSelection(
  selection: HammerAiFallbackSelection | null,
  targetKey: string,
): HammerAiFallbackSelection | null {
  return selection?.targetKey === targetKey
    && selection.jobRequestState !== "failed"
    && selection.jobRequestState !== "cancelled"
    ? selection
    : null;
}

export function claimHammerAiFallbackJobRequest(args: {
  selection: HammerAiFallbackSelection | null;
  targetKey: string;
  preparationAttemptId: string;
}): { selection: HammerAiFallbackSelection | null; claimed: boolean } {
  const { selection } = args;
  if (!selection || selection.targetKey !== args.targetKey || selection.jobRequestState !== "selected") {
    return { selection, claimed: false };
  }
  if (selection.preparationAttemptId && selection.preparationAttemptId !== args.preparationAttemptId) {
    return {
      selection: { ...selection, jobRequestState: "failed" },
      claimed: false,
    };
  }
  return {
    selection: {
      ...selection,
      preparationAttemptId: args.preparationAttemptId,
      jobRequestState: "requesting",
    },
    claimed: true,
  };
}

export function finishHammerAiFallbackJobRequest(args: {
  selection: HammerAiFallbackSelection;
  jobId?: string;
  failed?: boolean;
  cancelled?: boolean;
}): HammerAiFallbackSelection {
  return {
    ...args.selection,
    jobRequestState: args.cancelled ? "cancelled" : args.failed ? "failed" : "created",
    jobId: args.jobId ?? null,
  };
}

export const HAMMER_SESSION_CONFLICT_CODES = [
  "canonical_recording_pointer_failed",
  "canonical_recording_revision_reset_failed",
  "canonical_recording_revision_pointer_reset_failed",
  "canonical_recording_reconciliation_failed",
  "canonical_recording_missing_take",
  "canonical_recording_missing_media_path",
  "canonical_recording_supersession_required",
] as const;

export function classifyHammerSessionOpenFailure(code: string | null): {
  kind: "session_open_failed";
  code: string | null;
} {
  return { kind: "session_open_failed", code };
}

export function canRetryHammerTranscript(args: {
  hydrationReady: boolean;
  transcriptDiscoveryStatus: string;
  failureKind: HammerPrepFailureKind;
}): boolean {
  return args.hydrationReady
    && args.transcriptDiscoveryStatus === "complete"
    && args.failureKind === "non_ai_missing";
}

export function createHammerSessionRetryTransition(reloadNonce: number): {
  reloadNonce: number;
  transcriptDiscoveryStatus: "pending";
} {
  return { reloadNonce: reloadNonce + 1, transcriptDiscoveryStatus: "pending" };
}

export function isActiveHammerTranscriptPrepJob(job: {
  job_type: string;
  status: string;
}): boolean {
  return job.job_type === "hammer_transcript_prep"
    && (job.status === "queued" || job.status === "running");
}

export function shouldPollHammerTranscriptPrepJob(jobId: string | null): jobId is string {
  return Boolean(jobId);
}

export function mapHammerSessionOpenErrorToUserMessage(args: { code: string | null; message: string }): string {
  switch (args.code) {
    case "canonical_recording_missing_take":
      return "No kept take is available for this workpiece. Record a take in Anvil, keep it, then reopen Hammer.";
    case "canonical_recording_missing_media_path":
      return "Kept take receipt is missing a media path. Re-record the take (or repair the receipt) and retry.";
    case "canonical_recording_supersession_required":
      return "A newer kept recording is available, but this sealed Hammer baseline cannot be replaced automatically. Reopen the existing canonical recording or use a separately approved supersession workflow.";
    case "canonical_recording_missing":
      return "Canonical recording is missing for this revision. Reload Hammer; if it persists, contact support.";
    case "AUTH_REQUIRED":
    case "auth_required":
      return "Sign in required to open this Hammer session. Refresh and sign in, then retry.";
    default:
      return args.message || "Failed to open Hammer session.";
  }
}
