import {
  type OpenAiCredentialFunding,
  type OpenAiTextGateClient,
  type OpenAiTextProviderResult,
} from "./paid-openai-text-execution-coordinator.js";
import {
  OpenAiTextBoundaryError,
} from "./openai-text-paid-boundary.js";
import {
  executePaidOpenAiTextRoute,
  type OpenAiTextCredentialSource,
  type OpenAiTextPaidExecutionHandle,
  type PaidOpenAiTextRouteContext,
} from "./paid-openai-text-route-execution.js";
import type { AggregateAdmissionCallerClass } from "./aggregate-financial-admission.js";
import type { OpenAiTranscriptionRouteCode } from "./openai-transcription-paid-boundary.js";

export type OpenAiTranscriptionUsage = {
  audioInputTokens: number;
  textInputTokens: number;
  outputTokens: number;
  durationSeconds: number | null;
  providerReported: boolean;
};

export type OpenAiTranscriptionProviderResult<T> = {
  value: T;
  requestId: string | null;
  usage: OpenAiTranscriptionUsage;
  evidence?: Record<string, unknown>;
};

export type OpenAiTranscriptionPaidOutcome<T extends Record<string, unknown>> =
  | {
      state: "settled" | "settled_replay";
      result: T;
      requestId: string | null;
      customerChargeMicros: number;
    }
  | {
      state: "failed_released" | "submission_unknown" | "duplicate_in_progress";
      customerChargeMicros: 0;
    };

function bounded(value: number): number {
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

export function readOpenAiTranscriptionUsage(payload: unknown): OpenAiTranscriptionUsage {
  const root = payload && typeof payload === "object" && !Array.isArray(payload)
    ? payload as Record<string, unknown>
    : {};
  const usage = root.usage && typeof root.usage === "object" && !Array.isArray(root.usage)
    ? root.usage as Record<string, unknown>
    : {};
  const inputDetails = usage.input_token_details && typeof usage.input_token_details === "object"
    ? usage.input_token_details as Record<string, unknown>
    : usage.input_tokens_details && typeof usage.input_tokens_details === "object"
      ? usage.input_tokens_details as Record<string, unknown>
      : {};
  const audioInputTokens = bounded(Number(inputDetails.audio_tokens ?? usage.audio_input_tokens ?? 0));
  const textInputTokens = bounded(Number(inputDetails.text_tokens ?? usage.text_input_tokens ?? 0));
  const outputTokens = bounded(Number(usage.output_tokens ?? usage.completion_tokens ?? 0));
  const duration = Number(root.duration ?? usage.duration_seconds);
  return {
    audioInputTokens,
    textInputTokens,
    outputTokens,
    durationSeconds: Number.isFinite(duration) && duration >= 0 ? duration : null,
    providerReported: Object.keys(usage).length > 0,
  };
}

export function estimateOpenAiTranscriptionDirectCostMicros(
  context: PaidOpenAiTextRouteContext,
  usage: OpenAiTranscriptionUsage,
): number {
  const amount = Math.ceil((
    usage.audioInputTokens * context.audioInputMicrosPerMillionTokens
    + usage.textInputTokens * context.textInputMicrosPerMillionTokens
    + usage.outputTokens * context.outputMicrosPerMillionTokens
  ) / 1_000_000);
  if (!Number.isSafeInteger(amount) || amount < 0 || amount > context.directProviderCeilingMicros) {
    throw new OpenAiTextBoundaryError("pricing_not_configured");
  }
  return amount;
}

/**
 * Audio-specific façade over the shared reservation, failure-relief, supplier
 * expense, and aggregate-admission coordinator. Provider usage is captured by
 * the shared coordinator before validation and canonical persistence.
 */
export async function executePaidOpenAiTranscriptionRoute<
  TProvider,
  TCanonical extends Record<string, unknown>,
>(args: {
  gate: OpenAiTextGateClient;
  routeCode: OpenAiTranscriptionRouteCode;
  handle: OpenAiTextPaidExecutionHandle;
  userId: string;
  workspaceId: string;
  workpieceId: string;
  credentialSource: OpenAiTextCredentialSource;
  callerClass?: AggregateAdmissionCallerClass;
  inputUnitUpperBound: number;
  requestFingerprintPayload: unknown;
  executeProvider: (
    context: PaidOpenAiTextRouteContext,
    attemptNumber: number,
  ) => Promise<OpenAiTranscriptionProviderResult<TProvider>>;
  validateResult: (value: TProvider) => Promise<void> | void;
  persistCanonical: (value: TProvider) => Promise<TCanonical>;
  recoverCanonical?: () => Promise<{
    result: TCanonical;
    providerRequestId: string | null;
    inputUnits: number;
    outputUnits: number;
  } | null>;
}): Promise<OpenAiTranscriptionPaidOutcome<TCanonical>> {
  const outcome = await executePaidOpenAiTextRoute<TProvider, TCanonical>({
    ...args,
    executeProvider: async (context, attemptNumber): Promise<OpenAiTextProviderResult<TProvider>> => {
      const provider = await args.executeProvider(context, attemptNumber);
      const inputUnits = provider.usage.audioInputTokens + provider.usage.textInputTokens;
      const supplierCostMicros = context.credentialFunding === "forge"
        ? provider.usage.providerReported
          ? estimateOpenAiTranscriptionDirectCostMicros(context, provider.usage)
          : null
        : 0;
      return {
        value: provider.value,
        requestId: provider.requestId,
        inputUnits,
        outputUnits: provider.usage.outputTokens,
        supplierCostMicros,
        supplierCostAuthoritative: false,
        supportingCostMicros: context.supportingCostCeilingMicros,
        supportingCostAuthoritative: false,
        costCoverageComplete: provider.usage.providerReported,
        evidence: {
          ...(provider.evidence ?? {}),
          operation_kind: "audio_transcription",
          provider: "openai",
          route_code: args.routeCode,
          model: context.model,
          request_fingerprint: args.handle.requestFingerprint,
          audio_input_tokens: provider.usage.audioInputTokens,
          text_input_tokens: provider.usage.textInputTokens,
          output_tokens: provider.usage.outputTokens,
          duration_seconds: provider.usage.durationSeconds,
          provider_reported_usage: provider.usage.providerReported,
          supplier_cost_status: context.credentialFunding === "forge" ? "estimated" : "customer_direct",
        },
      };
    },
  });
  if (outcome.state === "settled" || outcome.state === "settled_replay") {
    return {
      state: outcome.state,
      result: outcome.result,
      requestId: outcome.requestId,
      customerChargeMicros: outcome.customerChargeMicros,
    };
  }
  return { state: outcome.state, customerChargeMicros: 0 };
}

export type OpenAiTranscriptionCredentialFunding = OpenAiCredentialFunding;
