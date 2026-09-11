import crypto from "node:crypto";

import {
  normalizeOpenAiTextPaidExecutionHandle,
  type OpenAiTextPaidExecutionHandle,
} from "./paid-openai-text-route-execution.js";
import type { OpenAiTextRouteCode } from "./openai-text-paid-boundary.js";
import type { OpenAiTranscriptionRouteCode } from "./openai-transcription-paid-boundary.js";
import type { OpenAiTextGateClient } from "./paid-openai-text-execution-coordinator.js";
import {
  boundedProviderRequestEvidence,
  type BoundedProviderRequest,
} from "./bounded-provider-request.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_RE = /^[0-9a-f]{64}$/i;

type JsonObject = Record<string, unknown>;

export type OpenAiTextSpendingAcceptance = {
  operationId: string;
  quoteId: string;
  quoteHash: string;
  requestFingerprint: string;
};

export type CustomerOpenAiTextQuote = {
  quoteId: string;
  operationId: string;
  quoteHash: string;
  requestFingerprint: string;
  currency: "USD";
  maximumCustomerChargeMicros: number;
  failureCustomerChargeMicros: 0;
  failureTerms: string;
  fundingEligible: boolean;
  fundingSource: "customer_deposit" | "paid_allowance" | "owner_budget" | "none";
  payerKind: "personal" | "organization_shared" | "owner_testing";
  fundingLabel: string;
  modelDisplayName: string;
  providerModelId: string;
  modelTradeoffSummary: string;
  catalogRevision: number;
  estimatedCustomerChargeMicros: number;
  expiresAt: string;
};

type OpenAiTextModelSelection = {
  catalogRevisionId: string;
  catalogRevision: number;
  modelCatalogEntryId: string;
  runtimeModelId: string;
  providerModelId: string;
  displayName: string;
  tradeoffSummary: string;
};

export class OpenAiTextQuoteRequiredError extends Error {
  readonly status = 402;
  readonly code = "openai_text_quote_required";
  readonly quote: CustomerOpenAiTextQuote;
  constructor(quote: CustomerOpenAiTextQuote) {
    super("Accept the exact customer price before this OpenAI operation can run.");
    this.name = "OpenAiTextQuoteRequiredError";
    this.quote = quote;
  }
}

export class OpenAiTextFundingPreparationError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: JsonObject;
  constructor(
    status: number,
    code: string,
    message: string,
    details: JsonObject = {},
  ) {
    super(message);
    this.name = "OpenAiTextFundingPreparationError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function object(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObject
    : {};
}

function string(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function integer(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(parsed) ? parsed : -1;
}

async function rpc(
  client: OpenAiTextGateClient,
  name: string,
  args: JsonObject,
): Promise<unknown> {
  const result = await client.rpc(name, args);
  if (result.error) {
    const message = result.error.message || `${name} failed`;
    const lower = message.toLowerCase();
    const code = lower.includes("expired")
      ? "quote_expired"
      : lower.includes("replay conflict") || lower.includes("request changed")
        ? "quote_request_changed"
      : lower.includes("insufficient")
        ? "insufficient_verified_funds"
        : lower.includes("pricing_not_configured") || lower.includes("pricing is required")
          ? "pricing_not_configured"
          : lower.includes("halt") || lower.includes("not active")
            ? "paid_execution_halted"
            : "funding_preparation_failed";
    throw new OpenAiTextFundingPreparationError(
      code === "quote_expired" || code === "quote_request_changed" ? 409 : code === "insufficient_verified_funds" ? 402 : 503,
      code,
      message,
    );
  }
  return result.data;
}

function uuidFromDigest(digest: string): string {
  const value = digest.slice(0, 32).split("");
  value[12] = "4";
  value[16] = ["8", "9", "a", "b"][Number.parseInt(value[16] ?? "0", 16) % 4] ?? "8";
  const joined = value.join("");
  return `${joined.slice(0, 8)}-${joined.slice(8, 12)}-${joined.slice(12, 16)}-${joined.slice(16, 20)}-${joined.slice(20)}`;
}

function deriveIdentifiers(routeCode: string, userId: string, operationId: string, modelIdentity: string, acceptedQuoteId?: string): {
  quoteId: string;
  acceptanceId: string;
  reservationId: string;
} {
  const base = `${routeCode}:${userId}:${operationId}:${modelIdentity}`;
  const quoteId = acceptedQuoteId && UUID_RE.test(acceptedQuoteId)
    ? acceptedQuoteId
    : uuidFromDigest(crypto.createHash("sha256").update(
      `openai-text:quote:${base}:${Math.floor(Date.now() / 600_000)}`,
    ).digest("hex"));
  return {
    quoteId,
    acceptanceId: uuidFromDigest(crypto.createHash("sha256").update(`openai-text:acceptance:${quoteId}`).digest("hex")),
    reservationId: uuidFromDigest(crypto.createHash("sha256").update(`openai-text:reservation:${quoteId}`).digest("hex")),
  };
}

export function normalizeOpenAiTextSpendingAcceptance(
  value: unknown,
): OpenAiTextSpendingAcceptance | null {
  const row = object(value);
  const operationId = string(row.operation_id);
  const quoteId = string(row.quote_id);
  const quoteHash = string(row.quote_hash).toLowerCase();
  const requestFingerprint = string(row.request_fingerprint).toLowerCase();
  return operationId.length >= 8 && UUID_RE.test(quoteId) && SHA256_RE.test(quoteHash)
    && SHA256_RE.test(requestFingerprint)
    ? { operationId, quoteId, quoteHash, requestFingerprint }
    : null;
}

function normalizeModelSelection(value: unknown): OpenAiTextModelSelection {
  const row = object(value);
  const selection = {
    catalogRevisionId: string(row.catalog_revision_id),
    catalogRevision: integer(row.catalog_revision),
    modelCatalogEntryId: string(row.model_catalog_entry_id),
    runtimeModelId: string(row.runtime_model_id),
    providerModelId: string(row.provider_model_id),
    displayName: string(row.display_name),
    tradeoffSummary: string(row.tradeoff_summary),
  };
  if (!UUID_RE.test(selection.catalogRevisionId) || !UUID_RE.test(selection.modelCatalogEntryId)
    || selection.catalogRevision < 1 || !selection.runtimeModelId || !selection.providerModelId
    || !selection.displayName || !selection.tradeoffSummary) {
    throw new OpenAiTextFundingPreparationError(503, "model_selection_unavailable", "No eligible model is available for this operation.");
  }
  return selection;
}

function normalizeQuote(value: unknown, selection: OpenAiTextModelSelection): CustomerOpenAiTextQuote {
  const row = object(value);
  const quoteId = string(row.quote_id);
  const operationId = string(row.operation_id);
  const quoteHash = string(row.quote_hash).toLowerCase();
  const requestFingerprint = string(row.request_fingerprint).toLowerCase();
  const maximum = integer(row.maximum_customer_charge_micros);
  const failure = integer(row.failure_customer_charge_micros);
  const fundingSource = string(row.funding_source);
  const payerKind = string(row.payer_kind);
  const expiresAt = string(row.expires_at);
  if (!UUID_RE.test(quoteId) || operationId.length < 8 || !SHA256_RE.test(quoteHash)
    || !SHA256_RE.test(requestFingerprint) || row.currency !== "USD" || maximum < 0
    || failure !== 0 || !["customer_deposit", "paid_allowance", "owner_budget", "none"].includes(fundingSource)
    || (payerKind && !["personal", "organization_shared", "owner_testing"].includes(payerKind))
    || !expiresAt) {
    throw new OpenAiTextFundingPreparationError(502, "invalid_customer_quote", "The billing service returned an invalid customer quote.");
  }
  return {
    quoteId,
    operationId,
    quoteHash,
    requestFingerprint,
    currency: "USD",
    maximumCustomerChargeMicros: maximum,
    failureCustomerChargeMicros: 0,
    failureTerms: string(row.failure_terms) || "Forge-caused and provider-caused failures cost you $0.",
    fundingEligible: row.funding_eligible === true,
    fundingSource: fundingSource as CustomerOpenAiTextQuote["fundingSource"],
    payerKind: (payerKind || "personal") as CustomerOpenAiTextQuote["payerKind"],
    fundingLabel: string(row.funding_label) || "No verified eligible funds",
    modelDisplayName: selection.displayName,
    providerModelId: selection.providerModelId,
    modelTradeoffSummary: selection.tradeoffSummary,
    catalogRevision: selection.catalogRevision,
    // Until a measured-request estimator is approved, the only defensible
    // customer estimate is the conservative server maximum.
    estimatedCustomerChargeMicros: maximum,
    expiresAt,
  };
}

export async function resolveOrdinaryOpenAiTextFunding(args: {
  routeCode: OpenAiTextRouteCode | OpenAiTranscriptionRouteCode;
  operationId: string;
  userId: string;
  workspaceId: string;
  workpieceId: string;
  requestFingerprint: string;
  model: string;
  credentialFunding: "forge" | "byo_customer";
  acceptance?: OpenAiTextSpendingAcceptance | null;
  serviceGate: OpenAiTextGateClient;
  userGate: OpenAiTextGateClient;
  quoteLifetimeSeconds?: number;
  prepareBoundedRequest?: (limits: {
    model: string;
    maximumInputTokens: number;
    maximumOutputTokens: number;
    maximumAttempts: number;
  }) => BoundedProviderRequest | Promise<BoundedProviderRequest>;
  transcriptionSource?: {
    assetRevision: string;
    sha256: string;
    bytes: number;
    maximumDurationSeconds: number | null;
    maximumChunks: number;
    outputContract: string;
  };
}): Promise<OpenAiTextPaidExecutionHandle | null> {
  const requirement = object(await rpc(args.serviceGate, "read_openai_text_route_execution_requirement", {
    p_route_code: args.routeCode,
  }));
  const mode = string(requirement.mode);
  if (mode === "inactive" || mode === "shadow" || !mode) return null;
  if (mode === "halt_new") {
    throw new OpenAiTextFundingPreparationError(423, "paid_execution_halted", "New paid executions are temporarily halted; existing operations can still reconcile.");
  }
  if (mode !== "enforce") {
    throw new OpenAiTextFundingPreparationError(503, "paid_execution_control_unavailable", "The paid-execution mode is invalid.");
  }

  const existing = object(await rpc(args.serviceGate, "read_existing_openai_text_funding_handle", {
    p_user_id: args.userId,
    p_operation_id: args.operationId,
    p_route_code: args.routeCode,
    p_request_fingerprint: args.requestFingerprint,
  }));
  if (Object.keys(existing).length > 0) {
    const handle = normalizeOpenAiTextPaidExecutionHandle(existing);
    if (!handle) throw new OpenAiTextFundingPreparationError(502, "invalid_funding_handle", "Stored funding authority is invalid.");
    return handle;
  }

  const transcriptionRoute = args.routeCode === "hearth.speech_transcription"
    || args.routeCode === "anvil.realtime_transcription"
    || args.routeCode === "hammer.transcript_prep"
    || args.routeCode === "hammer.transcript_regeneration";
  const selection = normalizeModelSelection(await rpc(args.serviceGate, transcriptionRoute
    ? "resolve_openai_transcription_model_for_quote"
    : "resolve_openai_text_model_for_funding_quote", {
    p_user_id: args.userId,
    ...(!transcriptionRoute ? { p_workspace_id: args.workspaceId } : {}),
    p_route_code: args.routeCode,
    p_credential_funding: args.credentialFunding,
  }));
  const modelIdentity = `${selection.catalogRevisionId}:${selection.modelCatalogEntryId}:${selection.providerModelId}`;
  const identifiers = deriveIdentifiers(args.routeCode, args.userId, args.operationId, modelIdentity, args.acceptance?.quoteId);
  if (transcriptionRoute && !args.transcriptionSource) {
    throw new OpenAiTextFundingPreparationError(422, "transcription_source_required", "The exact source asset and transcription bounds are required before pricing.");
  }
  const quote = normalizeQuote(await rpc(args.serviceGate, transcriptionRoute
    ? "create_customer_openai_transcription_quote"
    : "create_customer_openai_text_quote", {
    p_quote_id: identifiers.quoteId,
    p_user_id: args.userId,
    p_operation_id: args.operationId,
    p_route_code: args.routeCode,
    p_workspace_id: args.workspaceId,
    p_workpiece_id: args.workpieceId,
    p_request_fingerprint: args.requestFingerprint,
    p_model: selection.runtimeModelId,
    p_credential_funding: args.credentialFunding,
    p_expires_at: new Date(Date.now() + Math.max(60, Math.min(args.quoteLifetimeSeconds ?? 600, 3600)) * 1000).toISOString(),
    ...(transcriptionRoute && args.transcriptionSource ? {
      p_source_asset_revision: args.transcriptionSource.assetRevision,
      p_source_sha256: args.transcriptionSource.sha256,
      p_source_bytes: args.transcriptionSource.bytes,
      p_maximum_duration_seconds: args.transcriptionSource.maximumDurationSeconds,
      p_maximum_chunks: args.transcriptionSource.maximumChunks,
      p_output_contract: args.transcriptionSource.outputContract,
    } : {}),
  }), selection);

  // Transcription binds its exact source bytes, hash, duration, chunks, and
  // multipart output contract through the dedicated transcription authority.
  // JSON text routes additionally bind the complete provider-visible payload
  // to the quote before it can be shown or accepted.
  if (!transcriptionRoute) {
    if (!args.prepareBoundedRequest) {
      throw new OpenAiTextFundingPreparationError(
        503,
        "complete_provider_request_required",
        "The complete serialized provider request is required before this quote can be accepted.",
      );
    }
    const boundContext = object(await rpc(args.serviceGate, "read_openai_text_quote_bounding_context", {
      p_quote_id: quote.quoteId,
      p_user_id: args.userId,
      p_operation_id: args.operationId,
      p_route_code: args.routeCode,
      p_request_fingerprint: args.requestFingerprint,
    }));
    const maximumInputTokens = integer(boundContext.maximum_input_units);
    const maximumOutputTokens = integer(boundContext.maximum_output_units);
    const maximumAttempts = integer(boundContext.maximum_attempts);
    const acceptedModel = string(boundContext.model);
    if (maximumInputTokens < 1 || maximumOutputTokens < 1 || maximumAttempts < 1
      || acceptedModel !== selection.runtimeModelId) {
      throw new OpenAiTextFundingPreparationError(
        502,
        "invalid_quote_bounding_context",
        "The billing service returned invalid provider-request limits.",
      );
    }
    const bounded = await args.prepareBoundedRequest({
      model: acceptedModel,
      maximumInputTokens,
      maximumOutputTokens,
      maximumAttempts,
    });
    if (bounded.model !== acceptedModel || bounded.boundedInputTokens > maximumInputTokens
      || bounded.maximumOutputTokens !== maximumOutputTokens
      || bounded.maximumAttempts !== maximumAttempts) {
      throw new OpenAiTextFundingPreparationError(
        422,
        "provider_request_out_of_bounds",
        "The complete provider request exceeds the accepted cost-policy limits.",
      );
    }
    const evidence = boundedProviderRequestEvidence(bounded);
    await rpc(args.serviceGate, "bind_bounded_provider_quote_request", {
      p_quote_id: quote.quoteId,
      p_user_id: args.userId,
      p_operation_id: args.operationId,
      p_route_code: args.routeCode,
      p_request_fingerprint: args.requestFingerprint,
      p_model: bounded.model,
      p_service_tier: bounded.serviceTier,
      p_estimator_revision: bounded.estimatorRevision,
      p_tokenizer_revision: bounded.tokenizerRevision,
      p_serialized_body_sha256: evidence.serialized_body_sha256,
      p_serialized_bytes: evidence.serialized_bytes,
      p_tokenizer_input_tokens: evidence.tokenizer_input_tokens,
      p_protocol_overhead_tokens: evidence.protocol_overhead_tokens,
      p_utf8_byte_token_upper_bound: evidence.utf8_byte_token_upper_bound,
      p_bounded_input_tokens: evidence.bounded_input_tokens,
      p_maximum_output_tokens: bounded.maximumOutputTokens,
      p_maximum_attempts: bounded.maximumAttempts,
    });
  }

  const acceptance = args.acceptance;
  if (!acceptance) throw new OpenAiTextQuoteRequiredError(quote);
  if (acceptance.operationId !== args.operationId || acceptance.quoteId !== quote.quoteId
    || acceptance.quoteHash !== quote.quoteHash || acceptance.requestFingerprint !== args.requestFingerprint) {
    throw new OpenAiTextFundingPreparationError(409, "quote_request_changed", "The request changed after pricing. Review and accept a new quote.");
  }
  if (new Date(quote.expiresAt).getTime() <= Date.now()) {
    throw new OpenAiTextFundingPreparationError(409, "quote_expired", "The quote expired. Review and accept a new quote.");
  }
  if (!quote.fundingEligible) {
    throw new OpenAiTextFundingPreparationError(402, "insufficient_verified_funds", "No verified eligible funding can cover this maximum charge.", {
      funding_source: quote.fundingSource,
      payer_kind: quote.payerKind,
      funding_label: quote.fundingLabel,
    });
  }

  await rpc(args.userGate, "accept_quote", {
    p_quote_id: quote.quoteId,
    p_acceptance_id: identifiers.acceptanceId,
    p_acceptance_key: `openai-text:${args.routeCode}:${quote.quoteId}`,
    p_quote_hash: quote.quoteHash,
  });
  const reserved = object(await rpc(args.serviceGate, transcriptionRoute
    ? "reserve_customer_openai_transcription_quote"
    : "reserve_customer_openai_text_quote", {
    p_quote_id: quote.quoteId,
    p_reservation_id: identifiers.reservationId,
    p_user_id: args.userId,
    p_operation_id: args.operationId,
    p_route_code: args.routeCode,
    p_workspace_id: args.workspaceId,
    p_workpiece_id: args.workpieceId,
    p_request_fingerprint: args.requestFingerprint,
    p_model: selection.runtimeModelId,
    p_credential_funding: args.credentialFunding,
    p_idempotency_key: `openai-text:${args.routeCode}:${quote.quoteId}`,
  }));
  const handle = normalizeOpenAiTextPaidExecutionHandle(object(reserved.paid_execution));
  if (!handle || handle.operationId !== args.operationId || handle.requestFingerprint !== args.requestFingerprint) {
    throw new OpenAiTextFundingPreparationError(502, "invalid_funding_handle", "The server could not establish exact bounded funding authority.");
  }
  return handle;
}
