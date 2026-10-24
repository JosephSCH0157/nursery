/**
 * One timing authority for interactive OpenAI text execution.
 *
 * The provider deadline must expire while the paid attempt lease is still
 * authoritative. The outer browser request remains open long enough for the
 * coordinator to record an ambiguous transport outcome and return it.
 */
export const OPENAI_TEXT_PROVIDER_DEADLINE_MS = 90_000;
export const OPENAI_TEXT_ATTEMPT_LEASE_SECONDS = 120;
export const OPENAI_TEXT_OUTER_REQUEST_DEADLINE_MS = 150_000;

if (!(OPENAI_TEXT_PROVIDER_DEADLINE_MS < OPENAI_TEXT_ATTEMPT_LEASE_SECONDS * 1_000
  && OPENAI_TEXT_ATTEMPT_LEASE_SECONDS * 1_000 <= OPENAI_TEXT_OUTER_REQUEST_DEADLINE_MS)) {
  throw new Error("invalid_openai_text_timing_contract");
}

export class OpenAiTextTransportFailure extends Error {
  readonly ambiguous: boolean;
  readonly evidence: Record<string, unknown>;

  constructor(message: string, ambiguous: boolean, evidence: Record<string, unknown>) {
    super(message);
    this.name = "OpenAiTextTransportFailure";
    this.ambiguous = ambiguous;
    this.evidence = evidence;
  }
}

function safeTransportErrorCode(error: unknown): string | null {
  if (!(error instanceof Error) || !error.cause || typeof error.cause !== "object")
    return null;
  const code = (error.cause as { code?: unknown }).code;
  return typeof code === "string" && /^[A-Z0-9_]{2,64}$/.test(code)
    ? code
    : null;
}

/**
 * Bounds one provider transport. `markTransmissionStarted` is deliberately
 * called by the concrete transport only after fetch() has accepted the
 * request. A synchronous failure before that marker is the only failure this
 * helper classifies as provably pre-transmission.
 */
export async function executeBoundedOpenAiTextTransport<T>(args: {
  routeCode: string;
  execute: (context: {
    signal: AbortSignal;
    markTransmissionStarted: () => void;
  }) => Promise<T>;
  deadlineMs?: number;
}): Promise<T> {
  const deadlineMs = args.deadlineMs ?? OPENAI_TEXT_PROVIDER_DEADLINE_MS;
  if (!Number.isSafeInteger(deadlineMs) || deadlineMs <= 0
    || deadlineMs >= OPENAI_TEXT_ATTEMPT_LEASE_SECONDS * 1_000) {
    throw new Error("invalid_openai_text_provider_deadline");
  }
  const controller = new AbortController();
  let transmissionStarted = false;
  let deadlineExpired = false;
  let rejectDeadline!: (reason: Error) => void;
  const deadline = new Promise<never>((_resolve, reject) => { rejectDeadline = reject; });
  const timer = setTimeout(() => {
    deadlineExpired = true;
    const reason = new Error("openai_text_provider_deadline_exceeded");
    controller.abort(reason);
    rejectDeadline(reason);
  }, deadlineMs);
  try {
    const transport = args.execute({
      signal: controller.signal,
      markTransmissionStarted: () => { transmissionStarted = true; },
    });
    return await Promise.race([transport, deadline]);
  } catch (error) {
    const ambiguous = transmissionStarted;
    const errorCode = safeTransportErrorCode(error);
    throw new OpenAiTextTransportFailure(
      deadlineExpired
        ? "OpenAI provider deadline expired before Forge received a response."
        : error instanceof Error ? error.message : String(error),
      ambiguous,
      {
        phase: "provider_transport",
        route_code: args.routeCode,
        deadline_ms: deadlineMs,
        deadline_expired: deadlineExpired,
        fetch_entered: transmissionStarted,
        transmitted: ambiguous ? "unknown" : false,
        error_name: error instanceof Error ? error.name : "unknown",
        error_code: errorCode,
      },
    );
  } finally {
    clearTimeout(timer);
  }
}
