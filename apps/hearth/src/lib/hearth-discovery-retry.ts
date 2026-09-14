import { HearthDependencyError } from "./hearth-dependency-state";

export type HearthLoadGuard = { assertCurrent: () => void };

/** Coordination hint only: an ordinary focus-open already owns this UI handoff. */
export type HearthFocusHandoff = {
  scopeKey: string;
  workspaceId: string | null;
  workpieceId: string;
};

export class HearthDiscoveryError extends HearthDependencyError {
  constructor(
    message: string,
    readonly reason: "transport" | "timeout" | "temporary_service" | "terminal",
    status?: number,
    readonly code?: string,
    cause?: unknown,
  ) {
    super({ dependency: "workpieces", kind: reason === "temporary_service" ? "unavailable" : "failed", message, status, cause });
  }
}

export function hearthLoadCancelled(): DOMException {
  return new DOMException("Hearth loading was superseded or cancelled.", "AbortError");
}

function abortableDelay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, ms);
    signal.addEventListener("abort", abort, { once: true });
  });
}

async function discoveryAttempt<T>(discover: (signal: AbortSignal) => Promise<T>, parent: AbortSignal): Promise<T> {
  parent.throwIfAborted();
  const controller = new AbortController();
  let rejectAbort: (reason: unknown) => void = () => undefined;
  const aborted = new Promise<never>((_resolve, reject) => { rejectAbort = reject; });
  const cancel = () => { controller.abort(parent.reason); rejectAbort(parent.reason); };
  parent.addEventListener("abort", cancel, { once: true });
  const timer = setTimeout(() => {
    const error = new HearthDiscoveryError("Episode discovery timed out.", "timeout");
    controller.abort(error);
    rejectAbort(error);
  }, 5_000);
  try {
    // The deadline includes auth resolution, fetch and complete response parsing.
    return await Promise.race([Promise.resolve().then(() => {
      controller.signal.throwIfAborted();
      return discover(controller.signal);
    }), aborted]);
  } finally {
    clearTimeout(timer);
    parent.removeEventListener("abort", cancel);
  }
}

/** Discovery GET only. Never wrap hydration, focus changes, or persistence. */
export async function recoverInitialHearthDiscovery<T>(
  discover: (signal: AbortSignal) => Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  const delays = [250, 750] as const;
  for (let attempt = 0; ; attempt += 1) {
    signal.throwIfAborted();
    try {
      const value = await discoveryAttempt(discover, signal);
      signal.throwIfAborted();
      return value;
    } catch (error) {
      signal.throwIfAborted();
      if (!(error instanceof HearthDiscoveryError) || error.reason === "terminal" || attempt === 2) throw error;
      await abortableDelay(delays[attempt], signal);
    }
  }
}
