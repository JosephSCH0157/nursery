export const OPENAI_TRANSCRIPTION_ROUTE_CODES = [
  "hearth.speech_transcription",
  "anvil.realtime_transcription",
  "hammer.transcript_prep",
  "hammer.transcript_regeneration",
] as const;

export type OpenAiTranscriptionRouteCode =
  (typeof OPENAI_TRANSCRIPTION_ROUTE_CODES)[number];

export type OpenAiTranscriptionRolloutMode =
  | "inactive"
  | "shadow"
  | "enforce"
  | "halt_new";

export class OpenAiTranscriptionBoundaryError extends Error {
  readonly code:
    | "funding_context_required"
    | "byo_credential_required"
    | "pricing_not_configured"
    | "submission_unknown";

  constructor(code: OpenAiTranscriptionBoundaryError["code"]) {
    super(code);
    this.code = code;
    this.name = "OpenAiTranscriptionBoundaryError";
  }
}

export function configuredOpenAiTranscriptionMode(): OpenAiTranscriptionRolloutMode {
  const value = typeof process !== "undefined"
    ? process.env.FORGE_OPENAI_TRANSCRIPTION_EXECUTION_MODE
    : undefined;
  return value === "shadow" || value === "enforce" || value === "halt_new"
    ? value
    : "inactive";
}

/**
 * A separate rollout switch prevents the active Hearth text canary from
 * implicitly activating audio transcription. Inactive and shadow preserve the
 * current transport; enforce requires the route's coordinated callback.
 */
export async function executeOpenAiTranscriptionTransport<T>(input: {
  executeLegacy: () => Promise<T>;
  coordinatedExecution?: () => Promise<T>;
  mode?: OpenAiTranscriptionRolloutMode;
}): Promise<T> {
  const mode = input.mode ?? configuredOpenAiTranscriptionMode();
  if (mode === "inactive" || mode === "shadow") return input.executeLegacy();
  if (mode === "halt_new") {
    throw new OpenAiTranscriptionBoundaryError("funding_context_required");
  }
  if (!input.coordinatedExecution) {
    throw new OpenAiTranscriptionBoundaryError("funding_context_required");
  }
  return input.coordinatedExecution();
}
