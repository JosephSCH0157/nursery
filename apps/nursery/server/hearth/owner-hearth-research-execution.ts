import crypto from "node:crypto";
import type { OpenAiTextGateClient } from "../../../../packages/tongs/src/providers/paid-openai-text-execution-coordinator";
import {
  boundedProviderRequestEvidence,
  buildBoundedOpenAiProviderRequest,
  type BoundedProviderRequest,
} from "../../../../packages/tongs/src/providers/bounded-provider-request";
import type {
  HearthPaidExecutionHandle,
  HearthSpendingQuoteAcceptance,
} from "./hearth-paid-chat-execution";

type RpcResult = { data: unknown; error: { message: string } | null };
type JsonRow = Record<string, unknown>;

export const OWNER_RESEARCH_ROUTE = "hearth.research_synthesis" as const;
export const OWNER_RESEARCH_PLAN_SCHEMA = "forge.hearth.owner-research-plan.v1" as const;
export const OWNER_RESEARCH_INSTRUCTION_REVISION = "hearth-research-synthesis-v1" as const;
export const OWNER_RESEARCH_QUERY_POLICY_REVISION = "hearth-research-query-v1" as const;
export const OWNER_RESEARCH_EXTRACTION_POLICY_REVISION = "hearth-research-extraction-v1" as const;
export const OWNER_RESEARCH_PERSISTENCE_REVISION = "hearth-research-package-v1" as const;
export const OWNER_RESEARCH_DEADLINE_MS = 60_000;
export const OWNER_RESEARCH_SEARCH_REQUEST_MICROS = 5_000;
export const OWNER_RESEARCH_PLATFORM_CEILING_MICROS = 1_456;
export const OWNER_RESEARCH_AGGREGATE_RISK_MICROS = 3;
export const OWNER_RESEARCH_MAX_CAPTURE_BYTES = 256 * 1024;
export const OWNER_RESEARCH_MAX_CAPTURE_TOTAL_BYTES = 1024 * 1024;
export const CUSTOMER_RESEARCH_AGGREGATE_CAPTURE_BUDGET_EXHAUSTED = "aggregate_capture_budget_exhausted" as const;
export const CUSTOMER_RESEARCH_SOURCE_CAPTURE_TRUNCATED = "source_capture_truncated" as const;
export const CUSTOMER_RESEARCH_EVIDENCE_LIMITATION_HEADER = "x-forge-hearth-evidence-limitation" as const;
export const CUSTOMER_RESEARCH_PLAN_SCHEMA = "forge.hearth.customer-research-plan.v1" as const;
export const CUSTOMER_RESEARCH_MODEL = "gpt-5.6-luna" as const;
export const CUSTOMER_RESEARCH_CREDITS = 21;

export const OWNER_RESEARCH_LIMIT_PROFILES = Object.freeze({
  canary: {
    code: "canary",
    maximumSearches: 1,
    maximumSources: 2,
    maximumHttpAttempts: 24,
    maximumInputTokens: 8_000,
    maximumOutputTokens: 1_000,
    requiredModel: "gpt-6-astra",
  },
  creator_session: {
    code: "creator_session",
    maximumSearches: 6,
    maximumSources: 6,
    maximumHttpAttempts: 24,
    maximumInputTokens: 128_000,
    maximumOutputTokens: 16_384,
    requiredModel: null,
  },
} as const);

export type OwnerResearchLimitProfile = keyof typeof OWNER_RESEARCH_LIMIT_PROFILES;
export const OWNER_RESEARCH_MAX_SEARCHES = OWNER_RESEARCH_LIMIT_PROFILES.creator_session.maximumSearches;
export const OWNER_RESEARCH_MAX_SOURCES = OWNER_RESEARCH_LIMIT_PROFILES.creator_session.maximumSources;
export const OWNER_RESEARCH_MAX_HTTP_ATTEMPTS = OWNER_RESEARCH_LIMIT_PROFILES.creator_session.maximumHttpAttempts;
export const OWNER_RESEARCH_MAX_INPUT_TOKENS = OWNER_RESEARCH_LIMIT_PROFILES.creator_session.maximumInputTokens;
export const OWNER_RESEARCH_MAX_OUTPUT_TOKENS = OWNER_RESEARCH_LIMIT_PROFILES.creator_session.maximumOutputTokens;
export const OWNER_RESEARCH_SEARCH_CEILING_MICROS = OWNER_RESEARCH_MAX_SEARCHES * OWNER_RESEARCH_SEARCH_REQUEST_MICROS;

export const OWNER_RESEARCH_MODEL_TERMS = Object.freeze({
  "gpt-6-astra": { displayName: "GPT-6 Astra", inputMicrosPerMillion: 10_000_000, outputMicrosPerMillion: 50_000_000, directCeilingMicros: 2_099_200 },
  "gpt-5.6-sol": { displayName: "GPT-5.6 Sol", inputMicrosPerMillion: 4_000_000, outputMicrosPerMillion: 20_000_000, directCeilingMicros: 839_680 },
  "gpt-5.6-terra": { displayName: "GPT-5.6 Terra", inputMicrosPerMillion: 2_000_000, outputMicrosPerMillion: 12_000_000, directCeilingMicros: 452_608 },
  "gpt-5.4-mini-2026-03-17": { displayName: "GPT-5.4 Mini", inputMicrosPerMillion: 750_000, outputMicrosPerMillion: 4_500_000, directCeilingMicros: 169_728 },
  "gpt-5.6-luna": { displayName: "GPT-5.6 Luna", inputMicrosPerMillion: 200_000, outputMicrosPerMillion: 1_200_000, directCeilingMicros: 45_261 },
} as const);

export type OwnerResearchModel = keyof typeof OWNER_RESEARCH_MODEL_TERMS;

export type OwnerResearchPlan = {
  schema: typeof OWNER_RESEARCH_PLAN_SCHEMA;
  route_code: typeof OWNER_RESEARCH_ROUTE;
  workspace_id: string;
  workpiece_id: string;
  user_authored_text: string;
  query: string;
  brief_fingerprint: string;
  requested_model: string | null;
  limit_profile: OwnerResearchLimitProfile;
  maximum_search_requests: number;
  maximum_sources: number;
  maximum_http_attempts: number;
  maximum_input_tokens: number;
  maximum_output_tokens: number;
  instruction_revision: string;
  query_policy_revision: string;
  extraction_policy_revision: string;
  persistence_revision: string;
};

export type CustomerResearchPlan = Omit<OwnerResearchPlan, "schema" | "requested_model" | "limit_profile"> & {
  schema: typeof CUSTOMER_RESEARCH_PLAN_SCHEMA;
  requested_model: typeof CUSTOMER_RESEARCH_MODEL;
  limit_profile: "standard_customer";
};

export type OwnerResearchQuote = {
  quote_id: string;
  operation_id: string;
  quote_hash: string;
  request_fingerprint: string;
  currency: "USD";
  maximum_customer_charge_micros: 0;
  failure_customer_charge_micros: 0;
  maximum_owner_commitment_micros: number;
  funding_eligible: boolean;
  funding_source: "owner_budget";
  funding_label: string;
  model_display_name: string;
  provider_model_id: OwnerResearchModel;
  catalog_revision: number;
  expires_at: string;
  cost_components: {
    openai_synthesis_micros: number;
    brave_search_micros: number;
    platform_support_micros: number;
    continuing_storage_micros: number;
    aggregate_risk_micros: number;
  };
  limits: {
    profile: OwnerResearchLimitProfile;
    search_requests: number;
    retained_sources: number;
    http_attempts: number;
    input_tokens: number;
    output_tokens: number;
  };
};

export class OwnerResearchSubmissionUnknownError extends Error {
  readonly stageKey: string;

  constructor(stageKey: string, message = "Research supplier submission outcome is unknown") {
    super(message);
    this.stageKey = stageKey;
    this.name = "OwnerResearchSubmissionUnknownError";
  }
}

function row(value: unknown): JsonRow {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRow : {};
}

function integer(value: unknown, name: string, minimum = 0): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum) throw new Error(`${name}_invalid`);
  return parsed;
}

function string(value: unknown, name: string): string {
  const parsed = typeof value === "string" ? value.trim() : "";
  if (!parsed) throw new Error(`${name}_required`);
  return parsed;
}

async function rpc(gate: OpenAiTextGateClient, name: string, args: JsonRow): Promise<JsonRow> {
  const result = await gate.rpc(name, args);
  if (result.error) throw new Error(`${name}: ${result.error.message}`);
  return row(result.data);
}

function canonical(value: unknown): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean" || typeof value === "number") return value;
  if (Array.isArray(value)) return value.map(canonical);
  const valueRow = row(value);
  return Object.fromEntries(Object.keys(valueRow).sort().flatMap((key) => (
    valueRow[key] === undefined ? [] : [[key, canonical(valueRow[key])]]
  )));
}

export function sha256Canonical(value: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}

export function buildOwnerResearchPlan(args: {
  workspaceId: string;
  workpieceId: string;
  userAuthoredText: string;
  query: string;
  briefFingerprint: string;
  requestedModel?: string | null;
  limitProfile?: OwnerResearchLimitProfile;
}): OwnerResearchPlan {
  const limitProfile = args.limitProfile ?? "creator_session";
  const limits = OWNER_RESEARCH_LIMIT_PROFILES[limitProfile];
  return {
    schema: OWNER_RESEARCH_PLAN_SCHEMA,
    route_code: OWNER_RESEARCH_ROUTE,
    workspace_id: args.workspaceId,
    workpiece_id: args.workpieceId,
    user_authored_text: args.userAuthoredText.trim(),
    query: args.query.trim(),
    brief_fingerprint: args.briefFingerprint.trim(),
    requested_model: limits.requiredModel ?? (args.requestedModel?.trim() || null),
    limit_profile: limitProfile,
    maximum_search_requests: limits.maximumSearches,
    maximum_sources: limits.maximumSources,
    maximum_http_attempts: limits.maximumHttpAttempts,
    maximum_input_tokens: limits.maximumInputTokens,
    maximum_output_tokens: limits.maximumOutputTokens,
    instruction_revision: OWNER_RESEARCH_INSTRUCTION_REVISION,
    query_policy_revision: OWNER_RESEARCH_QUERY_POLICY_REVISION,
    extraction_policy_revision: OWNER_RESEARCH_EXTRACTION_POLICY_REVISION,
    persistence_revision: OWNER_RESEARCH_PERSISTENCE_REVISION,
  };
}

export function fingerprintOwnerResearchPlan(plan: OwnerResearchPlan): string {
  return sha256Canonical(plan);
}

export function buildCustomerResearchPlan(args: {
  workspaceId: string;
  workpieceId: string;
  userAuthoredText: string;
  query: string;
}): CustomerResearchPlan {
  const limits = OWNER_RESEARCH_LIMIT_PROFILES.creator_session;
  const userAuthoredText = args.userAuthoredText.trim();
  const query = args.query.trim();
  // Customer billing identity must not inherit the research brief's
  // requestAuthority. That authority is a per-submission chat action id, so
  // including it turns an otherwise exact replay into a second paid operation.
  // Keep the owner plan unchanged and bind customer execution to only the
  // stable, workspace-scoped inputs that determine this research request.
  const briefFingerprint = sha256Canonical({
    schema: "forge.hearth.customer-research-brief-identity.v1",
    workspace_id: args.workspaceId,
    workpiece_id: args.workpieceId,
    user_authored_text: userAuthoredText,
    query,
  });
  return {
    schema: CUSTOMER_RESEARCH_PLAN_SCHEMA,
    route_code: OWNER_RESEARCH_ROUTE,
    workspace_id: args.workspaceId,
    workpiece_id: args.workpieceId,
    user_authored_text: userAuthoredText,
    query,
    brief_fingerprint: briefFingerprint,
    requested_model: CUSTOMER_RESEARCH_MODEL,
    limit_profile: "standard_customer",
    maximum_search_requests: limits.maximumSearches,
    maximum_sources: limits.maximumSources,
    maximum_http_attempts: limits.maximumHttpAttempts,
    maximum_input_tokens: limits.maximumInputTokens,
    maximum_output_tokens: limits.maximumOutputTokens,
    instruction_revision: OWNER_RESEARCH_INSTRUCTION_REVISION,
    query_policy_revision: OWNER_RESEARCH_QUERY_POLICY_REVISION,
    extraction_policy_revision: OWNER_RESEARCH_EXTRACTION_POLICY_REVISION,
    persistence_revision: OWNER_RESEARCH_PERSISTENCE_REVISION,
  };
}

export function fingerprintCustomerResearchPlan(plan: CustomerResearchPlan): string {
  return sha256Canonical(plan);
}

export function ownerResearchCostCeiling(
  model: OwnerResearchModel,
  limitProfile: OwnerResearchLimitProfile = "creator_session",
): {
  directProviderCeilingMicros: number;
  fullCostCeilingMicros: number;
  aggregateAdmissionMicros: number;
} {
  const limits = OWNER_RESEARCH_LIMIT_PROFILES[limitProfile];
  if (limits.requiredModel && model !== limits.requiredModel) throw new Error("owner_research_profile_model_mismatch");
  const terms = OWNER_RESEARCH_MODEL_TERMS[model];
  const directProviderCeilingMicros = Math.ceil(limits.maximumInputTokens * terms.inputMicrosPerMillion / 1_000_000)
    + Math.ceil(limits.maximumOutputTokens * terms.outputMicrosPerMillion / 1_000_000);
  const searchCeilingMicros = limits.maximumSearches * OWNER_RESEARCH_SEARCH_REQUEST_MICROS;
  const fullCostCeilingMicros = directProviderCeilingMicros
    + searchCeilingMicros
    + OWNER_RESEARCH_PLATFORM_CEILING_MICROS;
  return {
    directProviderCeilingMicros,
    fullCostCeilingMicros,
    aggregateAdmissionMicros: fullCostCeilingMicros + OWNER_RESEARCH_AGGREGATE_RISK_MICROS,
  };
}

export async function readOwnerHearthResearchExecutionRequirement(args: {
  gate: OpenAiTextGateClient;
  userId: string;
  workspaceId: string;
}): Promise<JsonRow> {
  return rpc(args.gate, "read_owner_hearth_research_execution_requirement", {
    p_owner_user_id: args.userId,
    p_workspace_id: args.workspaceId,
    p_route_code: OWNER_RESEARCH_ROUTE,
  });
}

export async function quoteOwnerHearthResearchOperation(args: {
  gate: OpenAiTextGateClient;
  userId: string;
  plan: OwnerResearchPlan;
  requestFingerprint: string;
}): Promise<OwnerResearchQuote> {
  const quoted = await rpc(args.gate, "quote_owner_hearth_research_operation", {
    p_owner_user_id: args.userId,
    p_workspace_id: args.plan.workspace_id,
    p_workpiece_id: args.plan.workpiece_id,
    p_request_fingerprint: args.requestFingerprint,
    p_plan_json: args.plan,
    p_requested_provider_model_id: args.plan.requested_model,
    p_expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
  });
  const components = row(quoted.cost_components);
  const limits = row(quoted.limits);
  const model = string(quoted.provider_model_id, "provider_model_id") as OwnerResearchModel;
  if (!(model in OWNER_RESEARCH_MODEL_TERMS)) throw new Error("owner_research_model_not_allowed");
  const profile = string(limits.profile, "limit_profile") as OwnerResearchLimitProfile;
  if (!(profile in OWNER_RESEARCH_LIMIT_PROFILES) || profile !== args.plan.limit_profile) {
    throw new Error("owner_research_limit_profile_mismatch");
  }
  const parsedLimits = {
    profile,
    search_requests: integer(limits.search_requests, "search_requests"),
    retained_sources: integer(limits.retained_sources, "retained_sources"),
    http_attempts: integer(limits.http_attempts, "http_attempts"),
    input_tokens: integer(limits.input_tokens, "input_tokens"),
    output_tokens: integer(limits.output_tokens, "output_tokens"),
  };
  if (parsedLimits.search_requests !== args.plan.maximum_search_requests
    || parsedLimits.retained_sources !== args.plan.maximum_sources
    || parsedLimits.http_attempts !== args.plan.maximum_http_attempts
    || parsedLimits.input_tokens !== args.plan.maximum_input_tokens
    || parsedLimits.output_tokens !== args.plan.maximum_output_tokens) {
    throw new Error("owner_research_quote_limits_mismatch");
  }
  const expectedCeiling = ownerResearchCostCeiling(model, profile);
  if (integer(components.openai_synthesis_micros, "openai_synthesis_micros") !== expectedCeiling.directProviderCeilingMicros
    || integer(components.brave_search_micros, "brave_search_micros") !== args.plan.maximum_search_requests * OWNER_RESEARCH_SEARCH_REQUEST_MICROS
    || integer(components.platform_support_micros, "platform_support_micros") !== OWNER_RESEARCH_PLATFORM_CEILING_MICROS
    || integer(components.aggregate_risk_micros, "aggregate_risk_micros") !== OWNER_RESEARCH_AGGREGATE_RISK_MICROS) {
    throw new Error("owner_research_quote_cost_mismatch");
  }
  return {
    quote_id: string(quoted.quote_id, "quote_id"),
    operation_id: string(quoted.operation_id, "operation_id"),
    quote_hash: string(quoted.quote_hash, "quote_hash"),
    request_fingerprint: string(quoted.request_fingerprint, "request_fingerprint"),
    currency: "USD",
    maximum_customer_charge_micros: 0,
    failure_customer_charge_micros: 0,
    maximum_owner_commitment_micros: integer(quoted.maximum_owner_commitment_micros, "maximum_owner_commitment_micros", 1),
    funding_eligible: quoted.funding_eligible === true,
    funding_source: "owner_budget",
    funding_label: string(quoted.funding_label, "funding_label"),
    model_display_name: string(quoted.model_display_name, "model_display_name"),
    provider_model_id: model,
    catalog_revision: integer(quoted.catalog_revision, "catalog_revision", 1),
    expires_at: string(quoted.expires_at, "expires_at"),
    cost_components: {
      openai_synthesis_micros: integer(components.openai_synthesis_micros, "openai_synthesis_micros"),
      brave_search_micros: integer(components.brave_search_micros, "brave_search_micros"),
      platform_support_micros: integer(components.platform_support_micros, "platform_support_micros"),
      continuing_storage_micros: integer(components.continuing_storage_micros, "continuing_storage_micros"),
      aggregate_risk_micros: integer(components.aggregate_risk_micros, "aggregate_risk_micros"),
    },
    limits: {
      ...parsedLimits,
    },
  };
}

export async function acceptOwnerHearthResearchOperation(args: {
  gate: OpenAiTextGateClient;
  userId: string;
  plan: OwnerResearchPlan;
  acceptance: HearthSpendingQuoteAcceptance;
}): Promise<{
  handle: HearthPaidExecutionHandle;
  model: OwnerResearchModel;
  maximumOutputTokens: number;
  deadlineAt: number;
}> {
  const accepted = await rpc(args.gate, "accept_owner_hearth_research_operation", {
    p_owner_user_id: args.userId,
    p_workspace_id: args.plan.workspace_id,
    p_workpiece_id: args.plan.workpiece_id,
    p_operation_id: args.acceptance.operationId,
    p_quote_id: args.acceptance.quoteId,
    p_quote_hash: args.acceptance.quoteHash,
    p_request_fingerprint: args.acceptance.requestFingerprint,
    p_plan_json: args.plan,
  });
  const model = string(accepted.provider_model_id, "provider_model_id") as OwnerResearchModel;
  if (!(model in OWNER_RESEARCH_MODEL_TERMS)) throw new Error("owner_research_model_not_allowed");
  return {
    handle: {
      operationId: string(accepted.operation_id, "operation_id"),
      reservationId: string(accepted.reservation_id, "reservation_id"),
      requestFingerprint: string(accepted.request_fingerprint, "request_fingerprint"),
    },
    model,
    maximumOutputTokens: integer(accepted.maximum_output_tokens, "maximum_output_tokens", 1),
    deadlineAt: Date.now() + OWNER_RESEARCH_DEADLINE_MS,
  };
}

export async function acquireOwnerHearthResearchAdmission(args: {
  gate: OpenAiTextGateClient;
  reservationId: string;
}): Promise<void> {
  const admission = await rpc(args.gate, "acquire_owner_hearth_research_aggregate_admission", {
    p_reservation_id: args.reservationId,
    p_caller_class: "interactive",
    p_provider_mode: "real",
  });
  if (admission.authorized !== true) throw new Error(`owner_research_aggregate_denied:${String(admission.reason ?? "unknown")}`);
}

function responseHeaders(response: Response): JsonRow {
  const allowed = ["content-type", "content-length", "etag", "last-modified", "x-request-id"];
  return Object.fromEntries(allowed.flatMap((name) => {
    const value = response.headers.get(name);
    return value ? [[name, value]] : [];
  }));
}

function stageType(url: string): "search" | "retrieval" {
  return new URL(url).hostname.toLowerCase() === "api.search.brave.com" ? "search" : "retrieval";
}

export type CustomerHearthResearchCaptureBudgetState = {
  retainedBytes: number;
  remainingBytes: number;
  maximumBytes: number;
  maximumCaptureBytes: number;
  canAdmitMaximumCapture: boolean;
};

const CUSTOMER_RESEARCH_CAPTURE_BUDGET_STATE = Symbol("forge.customer-research-capture-budget-state");

type CustomerResearchBudgetedFetch = typeof fetch & {
  [CUSTOMER_RESEARCH_CAPTURE_BUDGET_STATE]?: () => CustomerHearthResearchCaptureBudgetState;
};

export function readCustomerHearthResearchCaptureBudgetState(
  fetchImpl: typeof fetch,
): CustomerHearthResearchCaptureBudgetState | null {
  return (fetchImpl as CustomerResearchBudgetedFetch)[CUSTOMER_RESEARCH_CAPTURE_BUDGET_STATE]?.() ?? null;
}

function aggregateCaptureBudgetMarker(args: {
  retainedBytes: number;
  supplierCallSkipped: boolean;
  observedBytesAtLeast?: number;
}): JsonRow {
  return {
    status: 200,
    headers: { "content-type": "text/plain; charset=utf-8" },
    body_base64: "",
    response_bytes: 0,
    capture_outcome: CUSTOMER_RESEARCH_AGGREGATE_CAPTURE_BUDGET_EXHAUSTED,
    retained_bytes: 0,
    aggregate_retained_bytes: args.retainedBytes,
    aggregate_remaining_bytes: Math.max(0, OWNER_RESEARCH_MAX_CAPTURE_TOTAL_BYTES - args.retainedBytes),
    aggregate_maximum_bytes: OWNER_RESEARCH_MAX_CAPTURE_TOTAL_BYTES,
    supplier_call_skipped: args.supplierCallSkipped,
    ...(args.observedBytesAtLeast === undefined
      ? {}
      : { source_observed_bytes_at_least: args.observedBytesAtLeast }),
  };
}

function capturedResponse(capture: JsonRow): Response | null {
  if (capture.capture_outcome === CUSTOMER_RESEARCH_AGGREGATE_CAPTURE_BUDGET_EXHAUSTED) {
    return new Response(null, {
      status: 200,
      headers: {
        "content-type": "text/plain; charset=utf-8",
        [CUSTOMER_RESEARCH_EVIDENCE_LIMITATION_HEADER]: CUSTOMER_RESEARCH_AGGREGATE_CAPTURE_BUDGET_EXHAUSTED,
      },
    });
  }
  const bodyBase64 = typeof capture.body_base64 === "string" ? capture.body_base64 : "";
  const status = Number(capture.status);
  if (!bodyBase64 || !Number.isInteger(status) || status < 100 || status > 599) return null;
  const headers = row(capture.headers);
  const capturedBody = Buffer.from(bodyBase64, "base64");
  // An oversized source is a definitive per-source extraction failure, not a
  // failure of the entire paid research operation. Recreate one byte beyond
  // the extraction ceiling on replay so the research runtime reaches the same
  // bounded failure without contacting the source again.
  const replayBody = capture.body_truncated === true
    ? Buffer.concat([capturedBody, Buffer.from([0])])
    : capturedBody;
  return new Response(replayBody, {
    status,
    headers: Object.fromEntries(Object.entries(headers).filter((entry): entry is [string, string] => typeof entry[1] === "string")),
  });
}

async function readCaptureBytes(
  response: Response,
  truncateOversizedCapture: boolean,
  maximumBytes = OWNER_RESEARCH_MAX_CAPTURE_BYTES,
): Promise<{ bytes: Uint8Array; truncated: boolean }> {
  if (!response.body) return { bytes: new Uint8Array(), truncated: false };
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let truncated = false;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      const remaining = maximumBytes - total;
      if (next.value.byteLength > remaining) {
        if (!truncateOversizedCapture) {
          await reader.cancel("owner_research_capture_size_exceeded").catch(() => undefined);
          throw new Error("owner_research_capture_size_exceeded");
        }
        if (remaining > 0) chunks.push(next.value.slice(0, remaining));
        total += Math.max(remaining, 0);
        truncated = true;
        // A cloned stream can defer cancellation until the original branch is
        // consumed. Do not block delivery of that original response here.
        void reader.cancel("owner_research_capture_size_exceeded").catch(() => undefined);
        break;
      }
      chunks.push(next.value);
      total += next.value.byteLength;
    }
  } finally {
    reader.releaseLock();
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { bytes: merged, truncated };
}

function createBoundedHearthResearchFetch(args: {
  gate: OpenAiTextGateClient;
  handle: HearthPaidExecutionHandle;
  deadlineAt: number;
  plan: Pick<OwnerResearchPlan, "maximum_http_attempts" | "maximum_search_requests">;
  rpcNames: {
    begin: string;
    complete: string;
    fail: string;
    unknown: string;
  };
  truncateOversizedCapture?: boolean;
  customerCaptureBudgetPolicy?: boolean;
  fetchImpl?: typeof fetch;
}): typeof fetch {
  let attemptOrdinal = 0;
  let searchCount = 0;
  let capturedBytes = 0;
  const boundedFetch: CustomerResearchBudgetedFetch = async (input, init) => {
    const url = typeof input === "string" || input instanceof URL ? String(input) : input.url;
    const kind = stageType(url);
    attemptOrdinal += 1;
    if (attemptOrdinal > args.plan.maximum_http_attempts) throw new Error("owner_research_http_attempt_limit");
    if (kind === "search" && ++searchCount > args.plan.maximum_search_requests) throw new Error("owner_research_search_attempt_limit");
    if (Date.now() >= args.deadlineAt) throw new Error("owner_research_deadline_exhausted");
    const method = String(init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    const stageKey = `${args.handle.operationId}:${attemptOrdinal}:${sha256Canonical({ method, url })}`;
    const aggregateRemainingBytes = Math.max(0, OWNER_RESEARCH_MAX_CAPTURE_TOTAL_BYTES - capturedBytes);
    if (args.customerCaptureBudgetPolicy === true && aggregateRemainingBytes === 0) {
      return capturedResponse(aggregateCaptureBudgetMarker({
        retainedBytes: capturedBytes,
        supplierCallSkipped: true,
      }))!;
    }
    const begun = await rpc(args.gate, args.rpcNames.begin, {
      p_reservation_id: args.handle.reservationId,
      p_stage_key: stageKey,
      p_stage_type: kind,
      p_stage_ordinal: attemptOrdinal,
      p_request_fingerprint: args.handle.requestFingerprint,
      p_request_json: { method, url_fingerprint: sha256Canonical(url) },
      p_maximum_supplier_cost_micros: kind === "search" ? OWNER_RESEARCH_SEARCH_REQUEST_MICROS : 0,
    });
    if (begun.replay === true) {
      const capture = row(begun.capture);
      const replay = capturedResponse(capture);
      if (replay) {
        const replayBytes = integer(capture.response_bytes ?? 0, "response_bytes");
        if (capturedBytes + replayBytes > OWNER_RESEARCH_MAX_CAPTURE_TOTAL_BYTES) {
          throw new Error("owner_research_capture_total_size_exceeded");
        }
        capturedBytes += replayBytes;
        return replay;
      }
      throw new OwnerResearchSubmissionUnknownError(stageKey, "A prior research stage has no replayable capture");
    }
    let response: Response;
    try {
      response = await (args.fetchImpl ?? fetch)(input, init);
    } catch (error) {
      await rpc(args.gate, args.rpcNames.unknown, {
        p_reservation_id: args.handle.reservationId,
        p_stage_key: stageKey,
        p_evidence_json: { error: error instanceof Error ? error.message : String(error) },
      });
      throw new OwnerResearchSubmissionUnknownError(stageKey);
    }
    let bytes: Uint8Array;
    let bodyTruncated = false;
    try {
      const maximumCaptureBytes = args.customerCaptureBudgetPolicy === true
        ? Math.min(OWNER_RESEARCH_MAX_CAPTURE_BYTES, aggregateRemainingBytes)
        : OWNER_RESEARCH_MAX_CAPTURE_BYTES;
      const captured = await readCaptureBytes(
        response.clone(),
        args.truncateOversizedCapture === true,
        maximumCaptureBytes,
      );
      bytes = captured.bytes;
      bodyTruncated = captured.truncated;
      if (args.customerCaptureBudgetPolicy === true
        && bodyTruncated
        && maximumCaptureBytes < OWNER_RESEARCH_MAX_CAPTURE_BYTES) {
        const capture = aggregateCaptureBudgetMarker({
          retainedBytes: capturedBytes,
          supplierCallSkipped: false,
          observedBytesAtLeast: maximumCaptureBytes + 1,
        });
        await rpc(args.gate, args.rpcNames.complete, {
          p_reservation_id: args.handle.reservationId,
          p_stage_key: stageKey,
          p_actual_supplier_cost_micros: kind === "search" ? OWNER_RESEARCH_SEARCH_REQUEST_MICROS : 0,
          p_capture_json: capture,
        });
        void response.body?.cancel(CUSTOMER_RESEARCH_AGGREGATE_CAPTURE_BUDGET_EXHAUSTED).catch(() => undefined);
        return capturedResponse(capture)!;
      }
      if (capturedBytes + bytes.byteLength > OWNER_RESEARCH_MAX_CAPTURE_TOTAL_BYTES) {
        throw new Error("owner_research_capture_total_size_exceeded");
      }
    } catch (error) {
      const failureCode = error instanceof Error && error.message === "owner_research_capture_total_size_exceeded"
        ? CUSTOMER_RESEARCH_AGGREGATE_CAPTURE_BUDGET_EXHAUSTED
        : "source_capture_size_exceeded";
      await rpc(args.gate, args.rpcNames.fail, {
        p_reservation_id: args.handle.reservationId,
        p_stage_key: stageKey,
        p_failure_code: failureCode,
        p_actual_supplier_cost_micros: kind === "search" ? OWNER_RESEARCH_SEARCH_REQUEST_MICROS : 0,
        p_evidence_json: failureCode === CUSTOMER_RESEARCH_AGGREGATE_CAPTURE_BUDGET_EXHAUSTED
          ? {
              aggregate_retained_bytes: capturedBytes,
              aggregate_maximum_bytes: OWNER_RESEARCH_MAX_CAPTURE_TOTAL_BYTES,
            }
          : { maximum_bytes: OWNER_RESEARCH_MAX_CAPTURE_BYTES },
      });
      throw new Error("owner_research_capture_size_exceeded");
    }
    capturedBytes += bytes.byteLength;
    const capture = {
      status: response.status,
      headers: responseHeaders(response),
      body_base64: Buffer.from(bytes).toString("base64"),
      response_bytes: bytes.byteLength,
      ...(bodyTruncated ? {
        body_truncated: true,
        capture_outcome: CUSTOMER_RESEARCH_SOURCE_CAPTURE_TRUNCATED,
      } : {}),
    };
    await rpc(args.gate, args.rpcNames.complete, {
      p_reservation_id: args.handle.reservationId,
      p_stage_key: stageKey,
      p_actual_supplier_cost_micros: kind === "search" ? OWNER_RESEARCH_SEARCH_REQUEST_MICROS : 0,
      p_capture_json: capture,
    });
    return response;
  };
  if (args.customerCaptureBudgetPolicy === true) {
    Object.defineProperty(boundedFetch, CUSTOMER_RESEARCH_CAPTURE_BUDGET_STATE, {
      value: (): CustomerHearthResearchCaptureBudgetState => {
        const remainingBytes = Math.max(0, OWNER_RESEARCH_MAX_CAPTURE_TOTAL_BYTES - capturedBytes);
        return {
          retainedBytes: capturedBytes,
          remainingBytes,
          maximumBytes: OWNER_RESEARCH_MAX_CAPTURE_TOTAL_BYTES,
          maximumCaptureBytes: OWNER_RESEARCH_MAX_CAPTURE_BYTES,
          canAdmitMaximumCapture: remainingBytes >= OWNER_RESEARCH_MAX_CAPTURE_BYTES,
        };
      },
    });
  }
  return boundedFetch;
}

export function createOwnerHearthResearchFetch(args: {
  gate: OpenAiTextGateClient;
  handle: HearthPaidExecutionHandle;
  deadlineAt: number;
  plan: OwnerResearchPlan;
  fetchImpl?: typeof fetch;
}): typeof fetch {
  return createBoundedHearthResearchFetch({
    ...args,
    rpcNames: {
      begin: "begin_owner_hearth_research_stage",
      complete: "complete_owner_hearth_research_stage",
      fail: "fail_owner_hearth_research_stage",
      unknown: "mark_owner_hearth_research_stage_unknown",
    },
  });
}

export function createCustomerHearthResearchFetch(args: {
  gate: OpenAiTextGateClient;
  handle: HearthPaidExecutionHandle;
  deadlineAt: number;
  plan: CustomerResearchPlan;
  fetchImpl?: typeof fetch;
}): typeof fetch {
  return createBoundedHearthResearchFetch({
    ...args,
    truncateOversizedCapture: true,
    customerCaptureBudgetPolicy: true,
    rpcNames: {
      begin: "begin_customer_hearth_research_stage",
      complete: "complete_customer_hearth_research_stage",
      fail: "fail_customer_hearth_research_stage",
      unknown: "mark_customer_hearth_research_stage_unknown",
    },
  });
}

export async function bindCustomerHearthResearchSynthesis(args: {
  gate: OpenAiTextGateClient;
  handle: HearthPaidExecutionHandle;
  bounded: BoundedProviderRequest;
}): Promise<void> {
  const evidence = boundedProviderRequestEvidence(args.bounded);
  const bound = await rpc(args.gate, "bind_customer_hearth_research_quote_request", {
    p_reservation_id: args.handle.reservationId,
    p_request_fingerprint: args.handle.requestFingerprint,
    p_model: args.bounded.model,
    p_service_tier: args.bounded.serviceTier,
    p_estimator_revision: args.bounded.estimatorRevision,
    p_tokenizer_revision: args.bounded.tokenizerRevision,
    p_serialized_body_sha256: evidence.serialized_body_sha256,
    p_serialized_bytes: evidence.serialized_bytes,
    p_tokenizer_input_tokens: evidence.tokenizer_input_tokens,
    p_protocol_overhead_tokens: evidence.protocol_overhead_tokens,
    p_utf8_byte_token_upper_bound: evidence.utf8_byte_token_upper_bound,
    p_bounded_input_tokens: evidence.bounded_input_tokens,
    p_maximum_output_tokens: args.bounded.maximumOutputTokens,
    p_maximum_attempts: args.bounded.maximumAttempts,
  });
  if (bound.authorized !== true) throw new Error(`customer_research_bind_denied:${String(bound.reason ?? "unknown")}`);
}

export async function settleCustomerHearthResearchBeforeSynthesis(args: {
  gate: OpenAiTextGateClient;
  reservationId: string;
  failureClass: string;
  evidence?: JsonRow;
}): Promise<void> {
  await rpc(args.gate, "settle_customer_hearth_research_before_synthesis", {
    p_reservation_id: args.reservationId,
    p_failure_class: args.failureClass,
    p_evidence_json: args.evidence ?? {},
  });
}

export async function freezeOwnerHearthResearchSynthesis(args: {
  gate: OpenAiTextGateClient;
  handle: HearthPaidExecutionHandle;
  model: OwnerResearchModel;
  messages: Array<{ role: string; content: string }>;
  maximumOutputTokens: number;
  deadlineAt: number;
  sourceRevisionFingerprint: string;
  plan: OwnerResearchPlan;
}): Promise<BoundedProviderRequest> {
  if (Date.now() >= args.deadlineAt) throw new Error("owner_research_deadline_exhausted");
  const bounded = await buildBoundedOpenAiProviderRequest({
    body: {
      model: args.model,
      messages: args.messages,
      max_completion_tokens: args.maximumOutputTokens,
    },
    model: args.model,
    maximumOutputTokens: args.maximumOutputTokens,
    maximumAttempts: 1,
    serviceTier: "standard",
  });
  if (bounded.boundedInputTokens > args.plan.maximum_input_tokens
    || bounded.maximumOutputTokens > args.plan.maximum_output_tokens
    || bounded.maximumOutputTokens !== args.maximumOutputTokens) {
    throw new Error("owner_research_frozen_request_out_of_bounds");
  }
  const frozen = await rpc(args.gate, "freeze_owner_hearth_research_synthesis_request", {
    p_reservation_id: args.handle.reservationId,
    p_operation_id: args.handle.operationId,
    p_request_fingerprint: args.handle.requestFingerprint,
    p_source_revision_fingerprint: args.sourceRevisionFingerprint,
    p_model: args.model,
    p_instruction_revision: OWNER_RESEARCH_INSTRUCTION_REVISION,
    p_serialized_body: bounded.serializedBody,
    p_serialized_body_sha256: bounded.serializedBodySha256,
    p_serialized_bytes: bounded.serializedBytes,
    p_tokenizer_revision: bounded.tokenizerRevision,
    p_tokenizer_input_tokens: bounded.tokenizerInputTokens,
    p_protocol_overhead_tokens: bounded.protocolOverheadTokens,
    p_bounded_input_tokens: bounded.boundedInputTokens,
    p_maximum_output_tokens: bounded.maximumOutputTokens,
  });
  if (frozen.authorized !== true) throw new Error(`owner_research_freeze_denied:${String(frozen.reason ?? "unknown")}`);
  return bounded;
}

export async function settleOwnerHearthResearchBeforeSynthesis(args: {
  gate: OpenAiTextGateClient;
  reservationId: string;
  failureClass: string;
  evidence?: JsonRow;
}): Promise<void> {
  await rpc(args.gate, "settle_owner_hearth_research_before_synthesis", {
    p_reservation_id: args.reservationId,
    p_failure_class: args.failureClass,
    p_evidence_json: args.evidence ?? {},
  });
}

export function ownerHearthResearchExecutionGate(gate: OpenAiTextGateClient): OpenAiTextGateClient {
  const names: Record<string, string> = {
    resolve_openai_text_paid_execution_context: "resolve_owner_hearth_research_paid_execution_context",
    acquire_openai_text_aggregate_admission: "acquire_owner_hearth_research_aggregate_admission",
    authorize_openai_text_provider_attempt_with_aggregate: "authorize_owner_hearth_research_openai_attempt",
    bind_bounded_provider_request: "bind_owner_hearth_research_bounded_provider_request",
    settle_owner_operation: "settle_owner_hearth_research_operation",
  };
  return {
    rpc(name: string, args: JsonRow): Promise<RpcResult> {
      if (name === "resolve_openai_text_paid_execution_context") {
        const mapped = { ...args };
        delete mapped.p_route_code;
        return gate.rpc(names[name], mapped);
      }
      return gate.rpc(names[name] ?? name, args);
    },
  };
}
