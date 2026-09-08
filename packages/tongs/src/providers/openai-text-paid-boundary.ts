export const OPENAI_TEXT_ROUTE_CODES = [
  "hearth.chat_completion",
  "hearth.research_synthesis",
  "visual.unified_plan",
  "visual.narrative_interpretation",
  "motion.broll_interpretation",
  "hammer.transcript_cleanup",
  "shorts.discovery",
  "quench.metadata",
] as const;

export type OpenAiTextRouteCode = typeof OPENAI_TEXT_ROUTE_CODES[number];
export type OpenAiTextRolloutMode = "inactive" | "shadow" | "enforce";

export class OpenAiTextBoundaryError extends Error {
  constructor(public readonly code: "funding_context_required" | "byo_credential_required" | "pricing_not_configured") {
    super(code);
    this.name = "OpenAiTextBoundaryError";
  }
}

function configuredMode(): OpenAiTextRolloutMode {
  const value = typeof process !== "undefined" ? process.env.FORGE_OPENAI_TEXT_EXECUTION_MODE : undefined;
  return value === "shadow" || value === "enforce" ? value : "inactive";
}

/**
 * Marks every legacy OpenAI text transport boundary. Inactive is intentionally pass-through.
 * Enforce fails closed until the caller supplies a fully accepted coordinator operation.
 */
export async function executeOpenAiTextTransport<T>(input: {
  routeCode: OpenAiTextRouteCode;
  executeLegacy: () => Promise<T>;
  coordinatedExecution?: () => Promise<T>;
  mode?: OpenAiTextRolloutMode;
}): Promise<T> {
  const mode = input.mode ?? configuredMode();
  if (mode === "inactive") return input.executeLegacy();
  if (!input.coordinatedExecution) throw new OpenAiTextBoundaryError("funding_context_required");
  return input.coordinatedExecution();
}

