import crypto from "node:crypto";

import {
  normalizeOpenAiTextPaidExecutionHandle,
  type OpenAiTextPaidExecutionHandle,
} from "./paid-openai-text-route-execution.js";
import { configuredOpenAiTextMode, effectiveOpenAiMode, type OpenAiTextRouteCode } from "./openai-text-paid-boundary.js";
import { configuredOpenAiTranscriptionMode } from "./openai-transcription-paid-boundary.js";
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
  customerCreditUnits: number;
  failureCustomerChargeMicros: 0;
  failureTerms: string;
  fundingEligible: boolean;
  fundingSource: "customer_deposit" | "paid_allowance" | "beta_grant" | "owner_budget" | "none";
  fundingEnvironment: "test" | "live" | "owner_internal";
  payerKind: "personal" | "organization_shared" | "owner_testing";
  fundingLabel: string;
  modelDisplayName: string;
  providerModelId: string;
  modelTradeoffSummary: string;
  catalogRevision: number;
  estimatedCustomerChargeMicros: number;
  expiresAt: string;
};

export type OpenAiTextModelSelection = {
  catalogRevisionId: string;
  catalogRevision: number;
  modelCatalogEntryId: string;
  customerSelectionKey: string;
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
  readonly diagnosticMessage: string | null;
  constructor(
    status: number,
    code: string,
    message: string,
    details: JsonObject = {},
    diagnosticMessage: string | null = null,
  ) {
    super(message);
    this.name = "OpenAiTextFundingPreparationError";
    this.status = status;
    this.code = code;
    this.details = details;
    this.diagnosticMessage = diagnosticMessage;
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
    const diagnosticMessage = result.error.message || `${name} failed`;
    const lower = diagnosticMessage.toLowerCase();
    const code = lower.includes("model_selection_unavailable") || lower.includes("selected model is no longer available")
      ? "model_selection_unavailable"
      : lower.includes("expired")
      ? "quote_expired"
      : lower.includes("replay conflict") || lower.includes("request changed")
        ? "quote_request_changed"
      : lower.includes("insufficient")
        ? "insufficient_verified_funds"
        : lower.includes("concurrency") || lower.includes("already active")
          ? "operation_already_in_progress"
        : lower.includes("pricing_not_configured") || lower.includes("pricing is required")
          ? "pricing_not_configured"
          : lower.includes("halt") || lower.includes("not active") || lower.includes("operation limit")
              || lower.includes("not authorized for this scope")
            ? "paid_execution_halted"
            : "funding_preparation_failed";
    const customerMessage = code === "model_selection_unavailable"
      ? "Your selected model is no longer available. Select another model in AI Controls."
      : code === "insufficient_verified_funds"
      ? "Not enough Forge Credits for this operation."
      : code === "operation_already_in_progress"
        ? "Another AI operation is already in progress."
        : code === "quote_expired"
          ? "The quote expired. Review and accept a new quote."
          : code === "quote_request_changed"
            ? "The request changed after pricing. Review and accept a new quote."
            : code === "pricing_not_configured" || code === "paid_execution_halted"
              ? "AI is temporarily unavailable."
              : "AI could not be prepared. Please try again.";
    throw new OpenAiTextFundingPreparationError(
      code === "quote_expired" || code === "quote_request_changed" || code === "operation_already_in_progress"
        ? 409 : code === "insufficient_verified_funds" ? 402 : 503,
      code,
      customerMessage,
      {},
      diagnosticMessage,
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

function normalizeModelSelection(value: unknown, requireCustomerSelectionKey = false): OpenAiTextModelSelection {
  const row = object(value);
  const selection = {
    catalogRevisionId: string(row.catalog_revision_id),
    catalogRevision: integer(row.catalog_revision),
    modelCatalogEntryId: string(row.model_catalog_entry_id),
    customerSelectionKey: string(row.customer_selection_key),
    runtimeModelId: string(row.runtime_model_id),
    providerModelId: string(row.provider_model_id),
    displayName: string(row.display_name),
    tradeoffSummary: string(row.tradeoff_summary),
  };
  if (!UUID_RE.test(selection.catalogRevisionId) || !UUID_RE.test(selection.modelCatalogEntryId)
    || (requireCustomerSelectionKey && !UUID_RE.test(selection.customerSelectionKey))
    || selection.catalogRevision < 1 || !selection.runtimeModelId || !selection.providerModelId
    || !selection.displayName || !selection.tradeoffSummary) {
    throw new OpenAiTextFundingPreparationError(503, "model_selection_unavailable", "No eligible model is available for this operation.");
  }
  return selection;
}

export async function resolveOpenAiTextModelSelection(args: {
  routeCode: OpenAiTextRouteCode;
  userId: string;
  workspaceId: string;
  credentialFunding: "forge" | "byo_customer";
  serviceGate: OpenAiTextGateClient;
}): Promise<OpenAiTextModelSelection> {
  return normalizeModelSelection(await rpc(args.serviceGate, "resolve_openai_text_model_for_funding_quote", {
    p_user_id: args.userId,
    p_workspace_id: args.workspaceId,
    p_route_code: args.routeCode,
    p_credential_funding: args.credentialFunding,
  }), true);
}

export async function resolveOwnerOpenAiTextCanaryEligibility(args: {
  routeCode: OpenAiTextRouteCode;
  userId: string;
  workspaceId: string;
  model: string;
  serviceGate: OpenAiTextGateClient;
}): Promise<boolean> {
  const result = object(await rpc(args.serviceGate, "resolve_owner_openai_text_canary_eligibility", {
    p_user_id: args.userId,
    p_workspace_id: args.workspaceId,
    p_route_code: args.routeCode,
    p_model: args.model,
  }));
  return result.eligible === true
    && string(result.financial_environment) === "test"
    && string(result.route_code) === args.routeCode
    && string(result.model) === args.model;
}

function normalizeQuote(value: unknown, selection: OpenAiTextModelSelection): CustomerOpenAiTextQuote {
  const row = object(value);
  const quoteId = string(row.quote_id);
  const operationId = string(row.operation_id);
  const quoteHash = string(row.quote_hash).toLowerCase();
  const requestFingerprint = string(row.request_fingerprint).toLowerCase();
  const maximum = integer(row.maximum_customer_charge_micros);
  const customerCreditUnits = integer(row.customer_credit_units);
  const failure = integer(row.failure_customer_charge_micros);
  const fundingSource = string(row.funding_source);
  const fundingEnvironment = string(row.funding_environment);
  const payerKind = string(row.payer_kind);
  const expiresAt = string(row.expires_at);
  if (!UUID_RE.test(quoteId) || operationId.length < 8 || !SHA256_RE.test(quoteHash)
    || !SHA256_RE.test(requestFingerprint) || row.currency !== "USD" || maximum < 0
    || failure !== 0 || !["customer_deposit", "paid_allowance", "beta_grant", "owner_budget", "none"].includes(fundingSource)
    || !["test", "live", "owner_internal"].includes(fundingEnvironment)
    || (payerKind && !["personal", "organization_shared", "owner_testing"].includes(payerKind))
    || customerCreditUnits < 0 || !expiresAt) {
    throw new OpenAiTextFundingPreparationError(502, "invalid_customer_quote", "The billing service returned an invalid customer quote.");
  }
  return {
    quoteId,
    operationId,
    quoteHash,
    requestFingerprint,
    currency: "USD",
    maximumCustomerChargeMicros: maximum,
    customerCreditUnits,
    failureCustomerChargeMicros: 0,
    failureTerms: "Failed operations do not consume Forge Credits.",
    fundingEligible: row.funding_eligible === true,
    fundingSource: fundingSource as CustomerOpenAiTextQuote["fundingSource"],
    fundingEnvironment: fundingEnvironment as CustomerOpenAiTextQuote["fundingEnvironment"],
    payerKind: (payerKind || "personal") as CustomerOpenAiTextQuote["payerKind"],
    fundingLabel: row.funding_eligible === true ? "Forge Credits" : "Not enough Forge Credits",
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
  /**
   * Research is priced from an immutable retrieval plan before any paid search
   * occurs. Its final provider-visible synthesis body can only be frozen after
   * those bounded sources are captured, so that one route binds the body later
   * and still before provider transmission.
   */
  deferProviderRequestBinding?: boolean;
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
  const requirement = object(await rpc(args.serviceGate, "read_openai_execution_requirement", {
    p_route_code: args.routeCode,
    p_credential_funding: args.credentialFunding,
  }));
  const mode = effectiveOpenAiMode(string(requirement.mode), args.transcriptionSource
    ? configuredOpenAiTranscriptionMode() : configuredOpenAiTextMode());
  const existing = object(await rpc(args.serviceGate, "read_existing_openai_text_funding_handle", {
    p_user_id: args.userId,
    p_operation_id: args.operationId,
    p_route_code: args.routeCode,
    p_request_fingerprint: args.requestFingerprint,
  }));
  if (Object.keys(existing).length > 0) {
    const handle = normalizeOpenAiTextPaidExecutionHandle(existing);
    if (!handle || handle.operationId !== args.operationId
      || handle.requestFingerprint !== args.requestFingerprint) {
      throw new OpenAiTextFundingPreparationError(502, "invalid_funding_handle", "Stored funding authority is invalid.");
    }
    return handle;
  }

  if (mode === "halt_new") {
    throw new OpenAiTextFundingPreparationError(423, "paid_execution_halted", "This operation is unavailable for new Forge-funded execution; existing operations can still reconcile.");
  }
  if (mode === "inactive" || mode === "shadow") return null;

  const transcriptionRoute = args.routeCode === "hearth.speech_transcription"
    || args.routeCode === "anvil.realtime_transcription"
    || args.routeCode === "hammer.transcript_prep"
    || args.routeCode === "hammer.transcript_regeneration";
  if (args.deferProviderRequestBinding && args.routeCode !== "hearth.research_synthesis") {
    throw new OpenAiTextFundingPreparationError(
      422,
      "deferred_provider_binding_not_allowed",
      "Deferred provider-request binding is allowed only for bounded Hearth research.",
    );
  }
  const selection = normalizeModelSelection(await rpc(args.serviceGate, transcriptionRoute
    ? "resolve_openai_transcription_model_for_quote"
    : "resolve_openai_text_model_for_funding_quote", {
    p_user_id: args.userId,
    ...(!transcriptionRoute ? { p_workspace_id: args.workspaceId } : {}),
    p_route_code: args.routeCode,
    p_credential_funding: args.credentialFunding,
  }), !transcriptionRoute);
  if (!transcriptionRoute && args.model !== selection.runtimeModelId) {
    throw new OpenAiTextFundingPreparationError(
      409,
      "model_selection_changed",
      "The selected model changed. Review this operation again.",
      {},
      `requested model ${args.model} did not match resolved model ${selection.runtimeModelId}`,
    );
  }
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
  if (!transcriptionRoute && !args.deferProviderRequestBinding) {
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
    throw new OpenAiTextFundingPreparationError(402, "insufficient_verified_funds", "Not enough Forge Credits for this operation.", {
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

/**
 * Resolves the private owner-only Test lane. Eligibility must be established by
 * canonical server-side authority; this function never falls back to ordinary
 * customer funding and never treats owner_only as normal_customer.
 */
export async function resolveOwnerCanaryOpenAiTextFunding(args: {
  routeCode: OpenAiTextRouteCode;
  operationId: string;
  userId: string;
  workspaceId: string;
  workpieceId: string;
  requestFingerprint: string;
  model: string;
  acceptance?: OpenAiTextSpendingAcceptance | null;
  serviceGate: OpenAiTextGateClient;
  userGate: OpenAiTextGateClient;
  quoteLifetimeSeconds?: number;
  prepareBoundedRequest: (limits: {
    model: string;
    maximumInputTokens: number;
    maximumOutputTokens: number;
    maximumAttempts: number;
  }) => BoundedProviderRequest | Promise<BoundedProviderRequest>;
}): Promise<OpenAiTextPaidExecutionHandle> {
  const eligible = await resolveOwnerOpenAiTextCanaryEligibility({
    routeCode: args.routeCode,
    userId: args.userId,
    workspaceId: args.workspaceId,
    model: args.model,
    serviceGate: args.serviceGate,
  });
  if (!eligible) {
    throw new OpenAiTextFundingPreparationError(
      423,
      "paid_execution_halted",
      "This operation is unavailable for owner Test execution.",
    );
  }
  const existing = object(await rpc(args.serviceGate, "read_existing_openai_text_funding_handle", {
    p_user_id: args.userId,
    p_operation_id: args.operationId,
    p_route_code: args.routeCode,
    p_request_fingerprint: args.requestFingerprint,
  }));
  if (Object.keys(existing).length > 0) {
    const handle = normalizeOpenAiTextPaidExecutionHandle(existing);
    if (!handle || handle.operationId !== args.operationId
      || handle.requestFingerprint !== args.requestFingerprint
      || handle.fundingEnvironment !== "test") {
      throw new OpenAiTextFundingPreparationError(502, "invalid_funding_handle", "Stored owner Test funding authority is invalid.");
    }
    return handle;
  }
  const selection = normalizeModelSelection(await rpc(
    args.serviceGate,
    "resolve_openai_text_model_for_funding_quote",
    {
      p_user_id: args.userId,
      p_workspace_id: args.workspaceId,
      p_route_code: args.routeCode,
      p_credential_funding: "forge",
    },
  ), true);
  if (args.model !== selection.runtimeModelId) {
    throw new OpenAiTextFundingPreparationError(
      409,
      "model_selection_changed",
      "The selected model changed. Review this operation again.",
    );
  }
  const modelIdentity = `${selection.catalogRevisionId}:${selection.modelCatalogEntryId}:${selection.providerModelId}`;
  const identifiers = deriveIdentifiers(args.routeCode, args.userId, args.operationId, modelIdentity, args.acceptance?.quoteId);
  const quote = normalizeQuote(await rpc(args.serviceGate, "create_owner_openai_text_canary_quote", {
    p_quote_id: identifiers.quoteId,
    p_user_id: args.userId,
    p_operation_id: args.operationId,
    p_route_code: args.routeCode,
    p_workspace_id: args.workspaceId,
    p_workpiece_id: args.workpieceId,
    p_request_fingerprint: args.requestFingerprint,
    p_model: selection.runtimeModelId,
    p_credential_funding: "forge",
    p_expires_at: new Date(Date.now() + Math.max(60, Math.min(args.quoteLifetimeSeconds ?? 600, 3600)) * 1000).toISOString(),
  }), selection);
  const boundedContext = object(await rpc(args.serviceGate, "read_openai_text_quote_bounding_context", {
    p_quote_id: quote.quoteId,
    p_user_id: args.userId,
    p_operation_id: args.operationId,
    p_route_code: args.routeCode,
    p_request_fingerprint: args.requestFingerprint,
  }));
  const maximumInputTokens = integer(boundedContext.maximum_input_units);
  const maximumOutputTokens = integer(boundedContext.maximum_output_units);
  const maximumAttempts = integer(boundedContext.maximum_attempts);
  const acceptedModel = string(boundedContext.model);
  if (maximumInputTokens < 1 || maximumOutputTokens < 1 || maximumAttempts !== 1
    || acceptedModel !== selection.runtimeModelId) {
    throw new OpenAiTextFundingPreparationError(502, "invalid_quote_bounding_context", "The billing service returned invalid provider-request limits.");
  }
  const bounded = await args.prepareBoundedRequest({
    model: acceptedModel,
    maximumInputTokens,
    maximumOutputTokens,
    maximumAttempts,
  });
  if (bounded.model !== acceptedModel || bounded.boundedInputTokens > maximumInputTokens
    || bounded.maximumOutputTokens !== maximumOutputTokens || bounded.maximumAttempts !== 1) {
    throw new OpenAiTextFundingPreparationError(422, "provider_request_out_of_bounds", "The complete provider request exceeds the accepted cost-policy limits.");
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
  if (!args.acceptance) throw new OpenAiTextQuoteRequiredError(quote);
  if (args.acceptance.operationId !== args.operationId || args.acceptance.quoteId !== quote.quoteId
    || args.acceptance.quoteHash !== quote.quoteHash || args.acceptance.requestFingerprint !== args.requestFingerprint) {
    throw new OpenAiTextFundingPreparationError(409, "quote_request_changed", "The request changed after pricing. Review and accept a new quote.");
  }
  if (new Date(quote.expiresAt).getTime() <= Date.now()) {
    throw new OpenAiTextFundingPreparationError(409, "quote_expired", "The quote expired. Review and accept a new quote.");
  }
  await rpc(args.userGate, "accept_quote", {
    p_quote_id: quote.quoteId,
    p_acceptance_id: identifiers.acceptanceId,
    p_acceptance_key: `openai-text-owner-canary:${args.routeCode}:${quote.quoteId}`,
    p_quote_hash: quote.quoteHash,
  });
  const reserved = object(await rpc(args.serviceGate, "reserve_owner_openai_text_canary_quote", {
    p_quote_id: quote.quoteId,
    p_reservation_id: identifiers.reservationId,
    p_user_id: args.userId,
    p_operation_id: args.operationId,
    p_route_code: args.routeCode,
    p_workspace_id: args.workspaceId,
    p_workpiece_id: args.workpieceId,
    p_request_fingerprint: args.requestFingerprint,
    p_model: selection.runtimeModelId,
    p_credential_funding: "forge",
    p_idempotency_key: `openai-text-owner-canary:${args.routeCode}:${quote.quoteId}`,
  }));
  const handle = normalizeOpenAiTextPaidExecutionHandle(object(reserved.paid_execution));
  if (!handle || handle.operationId !== args.operationId
    || handle.requestFingerprint !== args.requestFingerprint || handle.fundingEnvironment !== "test") {
    throw new OpenAiTextFundingPreparationError(502, "invalid_funding_handle", "The server could not establish exact owner Test funding authority.");
  }
  return handle;
}
