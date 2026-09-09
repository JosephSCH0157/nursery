import crypto from "node:crypto";

import {
  normalizeOpenAiTextPaidExecutionHandle,
  type OpenAiTextPaidExecutionHandle,
} from "./paid-openai-text-route-execution.js";
import type { OpenAiTextRouteCode } from "./openai-text-paid-boundary.js";
import type { OpenAiTextGateClient } from "./paid-openai-text-execution-coordinator.js";

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
  fundingSource: "customer_deposit" | "paid_allowance" | "none";
  fundingLabel: string;
  expiresAt: string;
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
      : lower.includes("insufficient")
        ? "insufficient_verified_funds"
        : lower.includes("pricing_not_configured") || lower.includes("pricing is required")
          ? "pricing_not_configured"
          : lower.includes("halt") || lower.includes("not active")
            ? "paid_execution_halted"
            : "funding_preparation_failed";
    throw new OpenAiTextFundingPreparationError(
      code === "quote_expired" ? 409 : code === "insufficient_verified_funds" ? 402 : 503,
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

function deriveIdentifiers(routeCode: string, userId: string, operationId: string, acceptedQuoteId?: string): {
  quoteId: string;
  acceptanceId: string;
  reservationId: string;
} {
  const base = `${routeCode}:${userId}:${operationId}`;
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

function normalizeQuote(value: unknown): CustomerOpenAiTextQuote {
  const row = object(value);
  const quoteId = string(row.quote_id);
  const operationId = string(row.operation_id);
  const quoteHash = string(row.quote_hash).toLowerCase();
  const requestFingerprint = string(row.request_fingerprint).toLowerCase();
  const maximum = integer(row.maximum_customer_charge_micros);
  const failure = integer(row.failure_customer_charge_micros);
  const fundingSource = string(row.funding_source);
  const expiresAt = string(row.expires_at);
  if (!UUID_RE.test(quoteId) || operationId.length < 8 || !SHA256_RE.test(quoteHash)
    || !SHA256_RE.test(requestFingerprint) || row.currency !== "USD" || maximum < 0
    || failure !== 0 || !["customer_deposit", "paid_allowance", "none"].includes(fundingSource)
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
    fundingLabel: string(row.funding_label) || "No verified eligible funds",
    expiresAt,
  };
}

export async function resolveOrdinaryOpenAiTextFunding(args: {
  routeCode: Exclude<OpenAiTextRouteCode, "hearth.chat_completion">;
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

  const identifiers = deriveIdentifiers(args.routeCode, args.userId, args.operationId, args.acceptance?.quoteId);
  const quote = normalizeQuote(await rpc(args.serviceGate, "create_customer_openai_text_quote", {
    p_quote_id: identifiers.quoteId,
    p_user_id: args.userId,
    p_operation_id: args.operationId,
    p_route_code: args.routeCode,
    p_workspace_id: args.workspaceId,
    p_workpiece_id: args.workpieceId,
    p_request_fingerprint: args.requestFingerprint,
    p_model: args.model,
    p_credential_funding: args.credentialFunding,
    p_expires_at: new Date(Date.now() + Math.max(60, Math.min(args.quoteLifetimeSeconds ?? 600, 3600)) * 1000).toISOString(),
  }));

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
    });
  }

  await rpc(args.userGate, "accept_quote", {
    p_quote_id: quote.quoteId,
    p_acceptance_id: identifiers.acceptanceId,
    p_acceptance_key: `openai-text:${args.routeCode}:${quote.quoteId}`,
    p_quote_hash: quote.quoteHash,
  });
  const reserved = object(await rpc(args.serviceGate, "reserve_customer_openai_text_quote", {
    p_quote_id: quote.quoteId,
    p_reservation_id: identifiers.reservationId,
    p_user_id: args.userId,
    p_operation_id: args.operationId,
    p_route_code: args.routeCode,
    p_workspace_id: args.workspaceId,
    p_workpiece_id: args.workpieceId,
    p_request_fingerprint: args.requestFingerprint,
    p_model: args.model,
    p_credential_funding: args.credentialFunding,
    p_idempotency_key: `openai-text:${args.routeCode}:${quote.quoteId}`,
  }));
  const handle = normalizeOpenAiTextPaidExecutionHandle(object(reserved.paid_execution));
  if (!handle || handle.operationId !== args.operationId || handle.requestFingerprint !== args.requestFingerprint) {
    throw new OpenAiTextFundingPreparationError(502, "invalid_funding_handle", "The server could not establish exact bounded funding authority.");
  }
  return handle;
}
