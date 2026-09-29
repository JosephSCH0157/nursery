import { Buffer } from "node:buffer";
import {
  ForgeOwnerExecutionCoordinator,
  ForgeOwnerProviderBoundaryError,
  forgeOwnerCredentialIdentityHash,
  forgeOwnerSha256,
  type ForgeOwnerOperationIdentity,
  type OwnerAttemptSnapshot,
  type OwnerFinancialEnvironment,
  type OwnerRuntimeEnvironment,
} from "../accounting/forge-owner-execution-coordinator";
import { OwnerResearchSubmissionUnknownError, type OwnerResearchPlan } from "./owner-hearth-research-execution";
import { deriveOwnerHearthTextOperation } from "./owner-hearth-text-execution";

const BRAVE_HOST = "api.search.brave.com";
const MAX_RESPONSE_BYTES = 1024 * 1024;
type Json = Record<string, unknown>;

type BraveCapture = {
  status: number;
  body: string;
  headers: Record<string, string>;
  elapsedMs: number;
};

export type OwnerHearthResearchCostSession = {
  operationIdentity: ForgeOwnerOperationIdentity;
  fetch: typeof fetch;
  nextAttemptNumber(): number;
  braveAttemptCount(): number;
};

type Input = {
  coordinator: ForgeOwnerExecutionCoordinator;
  authenticatedUserId: string;
  workspaceId: string;
  workpieceId: string;
  operationIntentId: string;
  financialEnvironment: OwnerFinancialEnvironment;
  runtimeEnvironment: OwnerRuntimeEnvironment;
  braveCredential: string;
  plan: OwnerResearchPlan;
  providerFetch?: typeof fetch;
  now?: () => number;
};

function object(value: unknown): Json | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Json : null;
}

function headerEvidence(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of ["x-request-id", "request-id", "x-brave-request-id", "x-ratelimit-policy", "x-ratelimit-limit", "x-ratelimit-remaining", "x-ratelimit-reset"]) {
    const value = headers.get(name);
    if (value) out[name] = value;
  }
  return out;
}

function captured(attempt: OwnerAttemptSnapshot): BraveCapture | null {
  const event = attempt.events?.find((entry) => entry.lifecycle_state === "response_captured");
  const evidence = object(event?.private_provider_evidence);
  const body = typeof evidence?.response_body === "string" ? evidence.response_body : null;
  const status = Number(evidence?.http_status);
  if (body == null || !Number.isSafeInteger(status)) return null;
  return { status, body, headers: object(evidence?.response_headers) as Record<string, string> | null ?? {}, elapsedMs: Number(evidence?.elapsed_ms ?? 0) };
}

function parse(capture: BraveCapture): Json {
  const payload = object(JSON.parse(capture.body));
  if (!payload) throw new Error("Brave response must be a JSON object");
  return payload;
}

function evidenceOnlyBraveValuation(queryFingerprint: string) {
  return {
    costComponent: "brave_search",
    basis: "estimated" as const,
    amountMicros: 0,
    currency: "USD",
    recognitionMode: "evidence_only" as const,
    unresolvedReason: "hearth_owner_brave_credential_rate_not_verified",
    normalizedUsage: { request_units: 1, unit: "web_search_request", query_fingerprint: queryFingerprint },
    privateEvidence: {
      schema: "forge.hearth.owner-brave-rate-evidence.v1",
      zero_is_not_asserted_provider_cost: true,
      customer_markup_applied: false,
      bar_stock_rate_not_reused: true,
    },
  };
}

export function createOwnerHearthResearchCostSession(input: Input): OwnerHearthResearchCostSession {
  if (!input.braveCredential.trim()) throw new Error("Hearth owner Brave credential is required");
  const operationIdentity = deriveOwnerHearthTextOperation({
    financialEnvironment: input.financialEnvironment,
    workspaceId: input.workspaceId,
    workpieceId: input.workpieceId,
    routeCode: "hearth.research_synthesis",
    operationIntentId: input.operationIntentId,
    logicalRequest: input.plan,
  });
  const credentialIdentityHash = forgeOwnerCredentialIdentityHash(input.braveCredential);
  const providerFetch = input.providerFetch ?? fetch;
  const now = input.now ?? Date.now;
  let attempts = 0;

  const accountedFetch: typeof fetch = async (rawInput, init) => {
    const url = new URL(typeof rawInput === "string" || rawInput instanceof URL ? rawInput.toString() : rawInput.url);
    if (url.hostname !== BRAVE_HOST) return providerFetch(rawInput, init);
    attempts += 1;
    const attemptNumber = attempts;
    const query = url.searchParams.get("q") ?? "";
    const queryFingerprint = forgeOwnerSha256(query);
    const exactProviderRequest = { method: init?.method ?? "GET", url: url.toString(), query };
    const result = await input.coordinator.executeAttempt<BraveCapture, Json>({
      authenticatedUserId: input.authenticatedUserId,
      routeCode: "hearth.research_synthesis",
      operation: {
        identity: operationIdentity,
        runtimeEnvironment: input.runtimeEnvironment,
        originatingTool: "hearth",
        operationType: "hearth.research_synthesis",
        attribution: { workspaceId: input.workspaceId, workpieceId: input.workpieceId },
        creationEvidence: { schema: "forge.hearth.owner-research-operation.v1", operation_intent_id: input.operationIntentId },
      },
      attempt: {
        attemptNumber,
        provider: "brave",
        service: "web_search",
        sku: "search",
        credentialIdentityHash,
        exactProviderRequest,
        defaultCostComponent: "brave_search",
        authorizationEvidence: { query_fingerprint: queryFingerprint },
        submissionEvidence: { query_fingerprint: queryFingerprint },
      },
      readPersistedResult: async () => ({ found: false }),
      submitProvider: async () => {
        const startedAt = now();
        let response: Response;
        try {
          const headers = new Headers(init?.headers);
          headers.set("accept", "application/json");
          headers.set("x-subscription-token", input.braveCredential);
          response = await providerFetch(rawInput, { ...init, headers });
        } catch (error) {
          throw new ForgeOwnerProviderBoundaryError({
            message: "Brave submission outcome is unknown",
            outcome: "submission_unknown",
            privateProviderEvidence: { query_fingerprint: queryFingerprint, elapsed_ms: Math.max(0, now() - startedAt) },
            cause: error,
          });
        }
        const headers = headerEvidence(response.headers);
        const providerReferenceId = headers["x-request-id"] ?? headers["request-id"] ?? headers["x-brave-request-id"] ?? null;
        let body: string;
        try { body = await response.text(); } catch (error) {
          throw new ForgeOwnerProviderBoundaryError({
            message: "Brave response capture is incomplete",
            outcome: "submission_unknown",
            providerReferenceId,
            privateProviderEvidence: { http_status: response.status, query_fingerprint: queryFingerprint },
            cause: error,
          });
        }
        const bytes = Buffer.byteLength(body, "utf8");
        if (!response.ok) {
          throw new ForgeOwnerProviderBoundaryError({
            message: `Brave definitively rejected the request with HTTP ${response.status}`,
            outcome: "definitively_rejected",
            providerReferenceId,
            normalizedUsage: { request_units: 1, http_status: response.status },
            privateProviderEvidence: { http_status: response.status, response_headers: headers, response_body_sha256: forgeOwnerSha256(body), response_bytes: bytes, query_fingerprint: queryFingerprint },
            valuations: [evidenceOnlyBraveValuation(queryFingerprint)],
          });
        }
        if (bytes > MAX_RESPONSE_BYTES) {
          throw new ForgeOwnerProviderBoundaryError({
            message: "Hearth owner Brave response exceeded its evidence bound",
            outcome: "submission_unknown",
            providerReferenceId,
            normalizedUsage: { request_units: 1, http_status: response.status, response_bytes: bytes },
            privateProviderEvidence: {
              http_status: response.status,
              response_headers: headers,
              response_body_sha256: forgeOwnerSha256(body),
              response_bytes: bytes,
              query_fingerprint: queryFingerprint,
              response_capture_exceeded_bound: true,
            },
            valuations: [evidenceOnlyBraveValuation(queryFingerprint)],
          });
        }
        return {
          capture: { status: response.status, body, headers, elapsedMs: Math.max(0, now() - startedAt) },
          providerReferenceId,
          normalizedUsage: { request_units: 1, http_status: response.status, response_bytes: bytes },
          privateProviderEvidence: { http_status: response.status, response_headers: headers, response_body: body, response_body_sha256: forgeOwnerSha256(body), response_bytes: bytes, elapsed_ms: Math.max(0, now() - startedAt), query_fingerprint: queryFingerprint },
          valuations: [evidenceOnlyBraveValuation(queryFingerprint)],
        };
      },
      parseResult: parse,
      validateResult: (payload) => {
        const web = payload.web == null ? null : object(payload.web);
        if (payload.web != null && !web) throw new Error("Brave web evidence is invalid");
        if (web?.results != null && !Array.isArray(web.results)) throw new Error("Brave result list is invalid");
      },
      persistResult: async () => undefined,
      recoverCapturedResult: async (attempt) => {
        const capture = captured(attempt);
        return capture ? { value: parse(capture), valuations: [evidenceOnlyBraveValuation(queryFingerprint)] } : null;
      },
    });
    if (result.state === "submission_unknown") throw new OwnerResearchSubmissionUnknownError("owner_research_submission_unknown");
    if (result.state === "definitively_rejected") return new Response(JSON.stringify({ error: "provider_failed" }), { status: 502, headers: { "content-type": "application/json" } });
    return new Response(JSON.stringify(result.value), { status: 200, headers: { "content-type": "application/json" } });
  };

  return {
    operationIdentity,
    fetch: accountedFetch,
    nextAttemptNumber: () => attempts + 1,
    braveAttemptCount: () => attempts,
  };
}
