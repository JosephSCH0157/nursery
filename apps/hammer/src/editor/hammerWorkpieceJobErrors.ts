export const PAID_SUBMISSIONS_HALTED_CODE = "paid_submissions_halted";

export const PAID_SUBMISSIONS_HALTED_MESSAGE =
  "New transcript creation is not yet enabled for this recording. No charge was made.";

export type HammerWorkpieceJobApiError = {
  code?: string;
  message: string;
};

export function readWorkpieceJobApiError(
  payload: unknown,
  fallback: string,
): HammerWorkpieceJobApiError {
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const row = payload as Record<string, unknown>;
    const error = row.error && typeof row.error === "object" && !Array.isArray(row.error)
      ? row.error as Record<string, unknown>
      : null;
    const code = typeof error?.code === "string" && error.code.trim()
      ? error.code.trim()
      : undefined;
    const message = typeof error?.message === "string" && error.message.trim()
      ? error.message.trim()
      : fallback;
    return { ...(code ? { code } : {}), message };
  }
  return { message: fallback };
}

export function isRetryableWorkpieceJobFailure(args: {
  status: number;
  code?: string;
}): boolean {
  if (args.code === PAID_SUBMISSIONS_HALTED_CODE) return false;
  return args.status === 502 || args.status === 503 || args.status === 504;
}

export function buildTranscriptJobFailureMessage(args: {
  status: number;
  code?: string;
  error: string;
  retryAfterMs?: number;
}): string {
  if (args.code === PAID_SUBMISSIONS_HALTED_CODE) {
    return PAID_SUBMISSIONS_HALTED_MESSAGE;
  }

  const retryHint = typeof args.retryAfterMs === "number" && args.retryAfterMs > 0
    ? ` Retry in about ${Math.max(1, Math.ceil(args.retryAfterMs / 1000))}s.`
    : "";

  if (args.status === 503 || args.status === 504 || args.status === 502) {
    return `Transcript service is temporarily unavailable.${retryHint} ${args.error}`.trim();
  }
  if (args.status === 401 || args.status === 403) {
    return `Transcript job is blocked by auth or policy checks. ${args.error}`.trim();
  }
  if (args.status === 404) {
    return `Transcript job route is unavailable for this workspace context. ${args.error}`.trim();
  }
  return args.error;
}
