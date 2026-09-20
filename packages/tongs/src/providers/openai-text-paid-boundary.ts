export const OPENAI_TEXT_ROUTE_CODES = [
  "hearth.chat_completion",
  "hearth.title_generation",
  "hearth.tag_generation",
  "hearth.script_generation",
  "hearth.research_synthesis",
  "visual.unified_plan",
  "visual.narrative_interpretation",
  "motion.broll_interpretation",
  "hammer.transcript_cleanup",
  "shorts.discovery",
  "quench.metadata",
] as const;

export type OpenAiTextRouteCode = typeof OPENAI_TEXT_ROUTE_CODES[number];
export type OpenAiTextRolloutMode = "inactive" | "shadow" | "enforce" | "halt_new";

export type OpenAiTextTransportRequest<T> = {
  routeCode: OpenAiTextRouteCode;
  executeProviderTransport: () => Promise<T>;
};

export type OpenAiTextExecutionAdapter = {
  execute<T>(request: OpenAiTextTransportRequest<T>): Promise<T>;
};

let installedAdapter: OpenAiTextExecutionAdapter | null = null;

/**
 * Installs the one server-owned adapter that resolves request-scoped accepted quote and
 * reservation context. Every marked OpenAI text caller reaches this adapter when enabled.
 * Replacing an adapter is forbidden so a test or legacy caller cannot reopen transport.
 */
export function installOpenAiTextExecutionAdapter(adapter: OpenAiTextExecutionAdapter): void {
  if (installedAdapter && installedAdapter !== adapter) throw new Error("openai_text_execution_adapter_already_installed");
  installedAdapter = adapter;
}

export function clearOpenAiTextExecutionAdapterForTests(): void {
  if (typeof process === "undefined" || process.env.NODE_ENV !== "test") {
    throw new Error("openai_text_execution_adapter_reset_forbidden");
  }
  installedAdapter = null;
}

export class OpenAiTextBoundaryError extends Error {
  readonly code: "funding_context_required" | "byo_credential_required" | "pricing_not_configured" | "platform_risk_unavailable";
  constructor(code: "funding_context_required" | "byo_credential_required" | "pricing_not_configured" | "platform_risk_unavailable") {
    super(code);
    this.code = code;
    this.name = "OpenAiTextBoundaryError";
  }
}

export function configuredOpenAiTextMode(): OpenAiTextRolloutMode {
  const value = typeof process !== "undefined" ? process.env.FORGE_OPENAI_TEXT_EXECUTION_MODE : undefined;
  if (!value || value === "inactive") return "inactive";
  return value === "shadow" || value === "enforce" || value === "halt_new" ? value : "halt_new";
}

/** Environment controls are a safety floor, never an authorization. Database
 * modes are Forge-funded modes; BYO eligibility must be resolved separately
 * from exact server-owned component coverage, not from a client lane flag. */
export function effectiveOpenAiMode(databaseMode: string, environmentMode: OpenAiTextRolloutMode): OpenAiTextRolloutMode {
  if (!["inactive", "shadow", "enforce", "halt_new"].includes(databaseMode)) return "halt_new";
  if (databaseMode === "halt_new" || environmentMode === "halt_new") return "halt_new";
  if (databaseMode === "enforce" || environmentMode === "enforce") return "enforce";
  return databaseMode === "shadow" || environmentMode === "shadow" ? "shadow" : "inactive";
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
  const mode = effectiveOpenAiMode(input.mode ?? configuredOpenAiTextMode(), configuredOpenAiTextMode());
  if (mode === "inactive") return input.executeLegacy();
  if (mode === "halt_new") throw new OpenAiTextBoundaryError("funding_context_required");
  if (input.coordinatedExecution) return input.coordinatedExecution();
  if (installedAdapter) {
    return installedAdapter.execute({ routeCode: input.routeCode, executeProviderTransport: input.executeLegacy });
  }
  throw new OpenAiTextBoundaryError("funding_context_required");
}
