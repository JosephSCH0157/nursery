import crypto from "node:crypto";

import {
  OpenAiTextFundingPreparationError,
  OpenAiTextQuoteRequiredError,
  resolveOrdinaryOpenAiTextFunding,
  type OpenAiTextSpendingAcceptance,
} from "../../../../packages/tongs/src/providers/openai-text-customer-funding";
import {
  executePaidOpenAiTranscriptionRoute,
  type OpenAiTranscriptionProviderResult,
} from "../../../../packages/tongs/src/providers/paid-openai-transcription-route-execution";
import type {
  OpenAiTextCredentialSource,
  OpenAiTextPaidExecutionHandle,
  PaidOpenAiTextRouteContext,
} from "../../../../packages/tongs/src/providers/paid-openai-text-route-execution";
import type { OpenAiTextGateClient } from "../../../../packages/tongs/src/providers/paid-openai-text-execution-coordinator";
import type { OpenAiTranscriptionRouteCode } from "../../../../packages/tongs/src/providers/openai-transcription-paid-boundary";
import type { AggregateAdmissionCallerClass } from "../../../../packages/tongs/src/providers/aggregate-financial-admission";

export { OpenAiTextFundingPreparationError, OpenAiTextQuoteRequiredError };

export type TranscriptionSourceAuthority = {
  assetRevision: string;
  sha256: string;
  bytes: number;
  maximumDurationSeconds: number | null;
  maximumChunks: number;
  outputContract: string;
  providerInputUnitUpperBound?: number;
};

export function sha256Bytes(bytes: Uint8Array): string {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function transcriptionRequestFingerprint(value: unknown): string {
  return crypto.createHash("sha256").update(stable(value)).digest("hex");
}

export function transcriptionOperationId(
  routeCode: OpenAiTranscriptionRouteCode,
  userId: string,
  sourceSha256: string,
  requestFingerprint: string,
): string {
  return `openai-transcription:${routeCode}:${crypto.createHash("sha256")
    .update(`${userId}:${sourceSha256}:${requestFingerprint}`)
    .digest("hex")}`;
}

export async function coordinateOpenAiTranscription<
  TProvider,
  TCanonical extends Record<string, unknown>,
>(args: {
  routeCode: OpenAiTranscriptionRouteCode;
  userId: string;
  workspaceId: string;
  workpieceId: string;
  model: string;
  credentialSource: OpenAiTextCredentialSource;
  serviceGate: OpenAiTextGateClient;
  userGate: OpenAiTextGateClient;
  paidExecution?: OpenAiTextPaidExecutionHandle | null;
  acceptance?: OpenAiTextSpendingAcceptance | null;
  source: TranscriptionSourceAuthority;
  requestTerms: Record<string, unknown>;
  callerClass?: AggregateAdmissionCallerClass;
  executeProvider: (
    context: PaidOpenAiTextRouteContext,
    attemptNumber: number,
  ) => Promise<OpenAiTranscriptionProviderResult<TProvider>>;
  validateResult: (value: TProvider) => Promise<void> | void;
  persistCanonical: (
    value: TProvider,
    operationId: string,
    reservationId: string,
  ) => Promise<TCanonical>;
  recoverCanonical?: () => Promise<{
    result: TCanonical;
    providerRequestId: string | null;
    inputUnits: number;
    outputUnits: number;
  } | null>;
}) {
  const requestFingerprint = transcriptionRequestFingerprint({
    route_code: args.routeCode,
    workspace_id: args.workspaceId,
    workpiece_id: args.workpieceId,
    model: args.model,
    source_asset_revision: args.source.assetRevision,
    source_sha256: args.source.sha256,
    source_bytes: args.source.bytes,
    maximum_duration_seconds: args.source.maximumDurationSeconds,
    maximum_chunks: args.source.maximumChunks,
    output_contract: args.source.outputContract,
    request_terms: args.requestTerms,
  });
  const operationId = transcriptionOperationId(
    args.routeCode,
    args.userId,
    args.source.sha256,
    requestFingerprint,
  );
  const handle = args.paidExecution ?? await resolveOrdinaryOpenAiTextFunding({
    routeCode: args.routeCode,
    operationId,
    userId: args.userId,
    workspaceId: args.workspaceId,
    workpieceId: args.workpieceId,
    requestFingerprint,
    model: args.model,
    credentialFunding: args.credentialSource === "user_byo" ? "byo_customer" : "forge",
    acceptance: args.acceptance,
    serviceGate: args.serviceGate,
    userGate: args.userGate,
    transcriptionSource: args.source,
  });
  if (!handle) {
    throw new OpenAiTextFundingPreparationError(
      503,
      "transcription_funding_context_required",
      "Coordinated transcription was requested without an active funded policy.",
    );
  }
  if (handle.operationId !== operationId || handle.requestFingerprint !== requestFingerprint) {
    throw new OpenAiTextFundingPreparationError(
      409,
      "quote_request_changed",
      "The audio source or transcription request changed after acceptance.",
    );
  }
  let providerRequestId: string | null = null;
  const outcome = await executePaidOpenAiTranscriptionRoute({
    gate: args.serviceGate,
    routeCode: args.routeCode,
    handle,
    userId: args.userId,
    workspaceId: args.workspaceId,
    workpieceId: args.workpieceId,
    credentialSource: args.credentialSource,
    callerClass: args.callerClass,
    inputUnitUpperBound: args.source.providerInputUnitUpperBound ?? 16_000,
    requestFingerprintPayload: {
      route_code: args.routeCode,
      workspace_id: args.workspaceId,
      workpiece_id: args.workpieceId,
      model: args.model,
      source_asset_revision: args.source.assetRevision,
      source_sha256: args.source.sha256,
      source_bytes: args.source.bytes,
      maximum_duration_seconds: args.source.maximumDurationSeconds,
      maximum_chunks: args.source.maximumChunks,
      output_contract: args.source.outputContract,
      request_terms: args.requestTerms,
    },
    executeProvider: async (context, attemptNumber) => {
      const result = await args.executeProvider(context, attemptNumber);
      providerRequestId = result.requestId;
      return result;
    },
    validateResult: args.validateResult,
    persistCanonical: (value) => args.persistCanonical(
      value,
      operationId,
      handle.reservationId,
    ),
    recoverCanonical: args.recoverCanonical,
  });
  return { ...outcome, operationId, reservationId: handle.reservationId, providerRequestId };
}
