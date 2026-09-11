import { getEncoding } from "js-tiktoken";

export const OPENAI_PROVIDER_REQUEST_ESTIMATOR_REVISION =
  "openai-json-o200k-byte-ceiling-v1";
export const OPENAI_PROVIDER_TOKENIZER_REVISION = "o200k_base-js-tiktoken-1.0.21";

export type BoundedProviderRequest = {
  body: Readonly<Record<string, unknown>>;
  serializedBody: string;
  serializedBodySha256: string;
  serializedBytes: number;
  tokenizerRevision: string;
  tokenizerInputTokens: number;
  protocolOverheadTokens: number;
  utf8ByteTokenUpperBound: number;
  boundedInputTokens: number;
  maximumOutputTokens: number;
  maximumAttempts: number;
  estimatorRevision: string;
  model: string;
  serviceTier: string;
};

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

function normalizeJson(value: unknown, seen = new Set<object>()): JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("provider_request_contains_non_finite_number");
    return value;
  }
  if (Array.isArray(value)) return value.map((item) => normalizeJson(item, seen));
  if (typeof value !== "object") throw new Error("provider_request_contains_non_json_value");
  if (seen.has(value)) throw new Error("provider_request_contains_cycle");
  seen.add(value);
  const normalized: Record<string, JsonValue> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))) {
    if (item === undefined) continue;
    normalized[key] = normalizeJson(item, seen);
  }
  seen.delete(value);
  return normalized;
}

async function sha256Hex(value: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", Uint8Array.from(value).buffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function positiveSafeInteger(value: number, code: string, maximum = Number.MAX_SAFE_INTEGER): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) throw new Error(code);
  return value;
}

/**
 * Builds the exact JSON byte sequence used at the OpenAI boundary. The byte
 * count is deliberately retained as a conservative token upper ceiling because one
 * token cannot consume fewer than one UTF-8 byte. The tokenizer result is
 * recorded separately; neither value is presented as authoritative usage.
 */
export async function buildBoundedOpenAiProviderRequest(args: {
  body: Record<string, unknown>;
  model: string;
  maximumOutputTokens: number;
  maximumAttempts: number;
  serviceTier?: string;
  protocolOverheadTokens?: number;
}): Promise<BoundedProviderRequest> {
  const maximumOutputTokens = positiveSafeInteger(
    args.maximumOutputTokens,
    "provider_request_output_bound_invalid",
  );
  const maximumAttempts = positiveSafeInteger(
    args.maximumAttempts,
    "provider_request_attempt_bound_invalid",
    4,
  );
  const protocolOverheadTokens = args.protocolOverheadTokens ?? 16;
  if (!Number.isSafeInteger(protocolOverheadTokens) || protocolOverheadTokens < 0 || protocolOverheadTokens > 4_096) {
    throw new Error("provider_request_protocol_bound_invalid");
  }
  const model = args.model.trim();
  if (!model) throw new Error("provider_request_model_required");
  const body = normalizeJson(args.body) as Record<string, JsonValue>;
  if (body.model !== model) throw new Error("provider_request_model_mismatch");
  const serializedBody = JSON.stringify(body);
  const bytes = new TextEncoder().encode(serializedBody);
  const tokenizer = getEncoding("o200k_base");
  const tokenizerInputTokens = tokenizer.encode(serializedBody).length;
  const serializedBytes = bytes.byteLength;
  const tokenizerWithProtocol = tokenizerInputTokens + protocolOverheadTokens;
  const boundedInputTokens = Math.max(tokenizerWithProtocol, serializedBytes);
  if (!Number.isSafeInteger(boundedInputTokens) || boundedInputTokens < 1) {
    throw new Error("provider_request_input_bound_invalid");
  }
  return {
    body,
    serializedBody,
    serializedBodySha256: await sha256Hex(bytes),
    serializedBytes,
    tokenizerRevision: OPENAI_PROVIDER_TOKENIZER_REVISION,
    tokenizerInputTokens,
    protocolOverheadTokens,
    utf8ByteTokenUpperBound: serializedBytes,
    boundedInputTokens,
    maximumOutputTokens,
    maximumAttempts,
    estimatorRevision: OPENAI_PROVIDER_REQUEST_ESTIMATOR_REVISION,
    model,
    serviceTier: args.serviceTier?.trim() || "standard",
  };
}

export function boundedProviderRequestEvidence(
  request: BoundedProviderRequest,
): Record<string, unknown> {
  return {
    estimator_revision: request.estimatorRevision,
    tokenizer_revision: request.tokenizerRevision,
    serialized_body_sha256: request.serializedBodySha256,
    serialized_bytes: request.serializedBytes,
    tokenizer_input_tokens: request.tokenizerInputTokens,
    protocol_overhead_tokens: request.protocolOverheadTokens,
    utf8_byte_token_upper_bound: request.utf8ByteTokenUpperBound,
    bounded_input_tokens: request.boundedInputTokens,
    maximum_output_tokens: request.maximumOutputTokens,
    maximum_attempts: request.maximumAttempts,
    model: request.model,
    service_tier: request.serviceTier,
  };
}
