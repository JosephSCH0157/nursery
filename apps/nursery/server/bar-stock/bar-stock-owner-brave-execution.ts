import { Buffer } from "node:buffer";
import {
  ForgeOwnerExecutionCoordinator,
  ForgeOwnerProviderBoundaryError,
  deriveForgeOwnerOperationIdentity,
  forgeOwnerCredentialIdentityHash,
  forgeOwnerSha256,
  type ForgeOwnerDirectValuation,
  type OwnerAttemptSnapshot,
  type OwnerFinancialEnvironment,
  type OwnerRouteAuthorization,
  type OwnerRuntimeEnvironment,
} from "../accounting/forge-owner-execution-coordinator";

const BRAVE_SEARCH_URL = "https://api.search.brave.com/res/v1/web/search";
const BRAVE_RESPONSE_LIMIT_BYTES = 1024 * 1024;
const BRAVE_SEARCH_REQUEST_MICROS = 5_000;
const BRAVE_SEARCH_RATE_REVISION = "brave-search-web-usd-5-per-1000-2026-09-29";
const BRAVE_SEARCH_RATE_SOURCE = "https://api-dashboard.search.brave.com/app/plans";

type Json = Record<string, unknown>;

export type BarStockOwnerBraveQueryResult = {
  queryFingerprint: string;
  payload: Json;
};

export type BarStockOwnerBraveExecutionInput = {
  coordinator: ForgeOwnerExecutionCoordinator;
  authenticatedUserId: string;
  workspaceId: string;
  discoveryRunId: string;
  preferenceRevision: number;
  queries: string[];
  financialEnvironment: OwnerFinancialEnvironment;
  runtimeEnvironment: OwnerRuntimeEnvironment;
  credential: string;
  routeAuthorization: OwnerRouteAuthorization;
  providerFetch?: typeof fetch;
  providerCallAlreadyRecorded(requestKey: string): Promise<boolean>;
  recordProviderCall(requestKey: string): Promise<void>;
  now?: () => number;
};

type BraveCapture = {
  status: number;
  responseBody: string;
  responseHeaders: Record<string, string>;
  elapsedMs: number;
};

export class BarStockOwnerBraveAttemptError extends Error {
  readonly outcome: "definitively_rejected" | "submission_unknown";
  readonly attemptNumber: number;

  constructor(
    outcome: "definitively_rejected" | "submission_unknown",
    attemptNumber: number,
  ) {
    super(`Bar Stock owner Brave attempt ${attemptNumber} ended as ${outcome}`);
    this.name = "BarStockOwnerBraveAttemptError";
    this.outcome = outcome;
    this.attemptNumber = attemptNumber;
  }
}

function readObject(value: unknown): Json | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Json : null;
}

function responseEvidenceHeaders(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {};
  for (const name of [
    "x-request-id",
    "request-id",
    "x-brave-request-id",
    "x-ratelimit-policy",
    "x-ratelimit-limit",
    "x-ratelimit-remaining",
    "x-ratelimit-reset",
  ]) {
    const value = headers.get(name);
    if (value) result[name] = value;
  }
  return result;
}

function providerReference(headers: Record<string, string>, body: string): string | null {
  const header = headers["x-request-id"] ?? headers["request-id"] ?? headers["x-brave-request-id"];
  if (header) return header;
  try {
    const parsed = readObject(JSON.parse(body));
    const error = readObject(parsed?.error);
    return typeof error?.id === "string" && error.id.trim() ? error.id.trim() : null;
  } catch {
    return null;
  }
}

function parseBravePayload(capture: BraveCapture): Json {
  const payload = readObject(JSON.parse(capture.responseBody));
  if (!payload) throw new Error("Brave Search response must be a JSON object");
  return payload;
}

function validateBravePayload(payload: Json): void {
  const web = payload.web == null ? null : readObject(payload.web);
  if (payload.web != null && !web) throw new Error("Brave Search web evidence is invalid");
  if (web?.results != null && !Array.isArray(web.results)) {
    throw new Error("Brave Search results evidence is invalid");
  }
}

function successValuation(queryFingerprint: string): ForgeOwnerDirectValuation {
  return {
    costComponent: "brave_search",
    basis: "usage_calculated",
    amountMicros: BRAVE_SEARCH_REQUEST_MICROS,
    currency: "USD",
    recognitionMode: "journal_recognized",
    rateRevisionId: BRAVE_SEARCH_RATE_REVISION,
    normalizedUsage: {
      request_units: 1,
      unit: "web_search_request",
      query_fingerprint: queryFingerprint,
    },
    privateEvidence: {
      schema: "forge.bar-stock.brave-rate-evidence.v1",
      rate_source: BRAVE_SEARCH_RATE_SOURCE,
      rate_observed_on: "2026-09-29",
      provider_price_usd_per_1000_requests: 5,
      unit_amount_micros: BRAVE_SEARCH_REQUEST_MICROS,
      free_credit_or_invoice_adjustment_pending_reconciliation: true,
      customer_markup_applied: false,
    },
  };
}

function capturedResponse(attempt: OwnerAttemptSnapshot): BraveCapture | null {
  const response = attempt.events?.find((event) => event.lifecycle_state === "response_captured");
  const evidence = readObject(response?.private_provider_evidence);
  const body = typeof evidence?.response_body === "string" ? evidence.response_body : null;
  const status = Number(evidence?.http_status);
  const elapsedMs = Number(evidence?.elapsed_ms);
  if (body == null || !Number.isSafeInteger(status)) return null;
  return {
    status,
    responseBody: body,
    responseHeaders: readObject(evidence?.response_headers) as Record<string, string> | null ?? {},
    elapsedMs: Number.isFinite(elapsedMs) && elapsedMs >= 0 ? elapsedMs : 0,
  };
}

export function deriveBarStockOwnerDiscoveryIdentity(args: {
  financialEnvironment: OwnerFinancialEnvironment;
  runtimeEnvironment: OwnerRuntimeEnvironment;
  workspaceId: string;
  discoveryRunId: string;
  preferenceRevision: number;
  queries: string[];
}) {
  const querySet = args.queries.map((query) => ({
    query,
    query_fingerprint: forgeOwnerSha256(query),
  }));
  return deriveForgeOwnerOperationIdentity({
    financialEnvironment: args.financialEnvironment,
    runtimeEnvironment: args.runtimeEnvironment,
    originatingTool: "bar-stock",
    operationType: "brave_topic_discovery",
    stableOperationInput: {
      workspace_id: args.workspaceId,
      discovery_run_id: args.discoveryRunId,
    },
    exactRequestInput: {
      preference_revision: args.preferenceRevision,
      query_set: querySet,
      provider: "brave",
      service: "web_search",
      count: 10,
      result_filter: "web",
      freshness: "pw",
    },
  });
}

export async function executeBarStockOwnerBraveQueries(
  input: BarStockOwnerBraveExecutionInput,
): Promise<BarStockOwnerBraveQueryResult[]> {
  if (!input.credential.trim()) throw new Error("Bar Stock owner Brave credential is required");
  const operationIdentity = deriveBarStockOwnerDiscoveryIdentity(input);
  const credentialIdentityHash = forgeOwnerCredentialIdentityHash(input.credential);
  const providerFetch = input.providerFetch ?? fetch;
  const now = input.now ?? Date.now;
  const results: BarStockOwnerBraveQueryResult[] = [];

  for (const [index, query] of input.queries.entries()) {
    const attemptNumber = index + 1;
    const queryFingerprint = forgeOwnerSha256(query);
    const requestKey = `search:${index}:${queryFingerprint}`;
    const requestUrl = `${BRAVE_SEARCH_URL}?q=${encodeURIComponent(query)}&count=10&result_filter=web&freshness=pw`;
    const execution = await input.coordinator.executeAttempt<BraveCapture, Json>({
      authenticatedUserId: input.authenticatedUserId,
      routeCode: "bar-stock.topic-discovery.refresh",
      routeAuthorization: input.routeAuthorization,
      operation: {
        identity: operationIdentity,
        runtimeEnvironment: input.runtimeEnvironment,
        originatingTool: "bar-stock",
        operationType: "brave_topic_discovery",
        attribution: { workspaceId: input.workspaceId },
        creationEvidence: {
          schema: "forge.bar-stock.owner-brave-operation.v1",
          discovery_run_id: input.discoveryRunId,
          preference_revision: input.preferenceRevision,
          query_set_fingerprint: forgeOwnerSha256(JSON.stringify(input.queries)),
          provider: "brave",
          service: "web_search",
        },
      },
      attempt: {
        attemptNumber,
        provider: "brave",
        service: "web_search",
        sku: "search",
        credentialIdentityHash,
        exactProviderRequest: {
          method: "GET",
          url: BRAVE_SEARCH_URL,
          query,
          count: 10,
          result_filter: "web",
          freshness: "pw",
        },
        defaultCostComponent: "brave_search",
        authorizationEvidence: {
          schema: "forge.bar-stock.owner-brave-authorization.v1",
          discovery_run_id: input.discoveryRunId,
          request_key: requestKey,
          query_fingerprint: queryFingerprint,
        },
        submissionEvidence: {
          schema: "forge.bar-stock.owner-brave-submission.v1",
          discovery_run_id: input.discoveryRunId,
          request_key: requestKey,
          query_fingerprint: queryFingerprint,
        },
      },
      readPersistedResult: async () => ({ found: false }),
      submitProvider: async () => {
        if (await input.providerCallAlreadyRecorded(requestKey)) {
          throw new ForgeOwnerProviderBoundaryError({
            message: "A legacy Bar Stock provider-call marker exists without owner-cost response evidence",
            outcome: "submission_unknown",
            privateProviderEvidence: {
              schema: "forge.bar-stock.owner-brave-legacy-ambiguity.v1",
              discovery_run_id: input.discoveryRunId,
              request_key: requestKey,
              query_fingerprint: queryFingerprint,
            },
          });
        }
        await input.recordProviderCall(requestKey);
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 8_000);
        const startedAt = now();
        let response: Response;
        try {
          response = await providerFetch(requestUrl, {
            headers: {
              accept: "application/json",
              "x-subscription-token": input.credential,
            },
            signal: controller.signal,
          });
        } catch (error) {
          throw new ForgeOwnerProviderBoundaryError({
            message: "Brave Search submission outcome is unknown",
            outcome: "submission_unknown",
            privateProviderEvidence: {
              schema: "forge.bar-stock.owner-brave-transport-failure.v1",
              discovery_run_id: input.discoveryRunId,
              request_key: requestKey,
              query_fingerprint: queryFingerprint,
              elapsed_ms: Math.max(0, now() - startedAt),
              transport_error_name: error instanceof Error ? error.name : "unknown",
            },
            cause: error,
          });
        } finally {
          clearTimeout(timer);
        }

        const headers = responseEvidenceHeaders(response.headers);
        let responseBody: string;
        try {
          responseBody = await response.text();
        } catch (error) {
          throw new ForgeOwnerProviderBoundaryError({
            message: "Brave Search response capture is incomplete",
            outcome: "submission_unknown",
            providerReferenceId: providerReference(headers, ""),
            normalizedUsage: { request_units: 1, http_status: response.status },
            privateProviderEvidence: {
              schema: "forge.bar-stock.owner-brave-response-capture-failure.v1",
              discovery_run_id: input.discoveryRunId,
              request_key: requestKey,
              query_fingerprint: queryFingerprint,
              http_status: response.status,
              response_headers: headers,
            },
            cause: error,
          });
        }
        const bodyBytes = Buffer.byteLength(responseBody, "utf8");
        if (!response.ok) {
          throw new ForgeOwnerProviderBoundaryError({
            message: `Brave Search rejected the request with HTTP ${response.status}`,
            outcome: "definitively_rejected",
            providerReferenceId: providerReference(headers, responseBody),
            normalizedUsage: { request_units: 1, http_status: response.status },
            privateProviderEvidence: {
              schema: "forge.bar-stock.owner-brave-provider-rejection.v1",
              discovery_run_id: input.discoveryRunId,
              request_key: requestKey,
              query_fingerprint: queryFingerprint,
              http_status: response.status,
              elapsed_ms: Math.max(0, now() - startedAt),
              response_headers: headers,
              response_body_sha256: forgeOwnerSha256(responseBody),
              response_body_excerpt: responseBody.slice(0, 2_048),
            },
          });
        }
        if (bodyBytes > BRAVE_RESPONSE_LIMIT_BYTES) {
          return {
            capture: {
              status: response.status,
              responseBody: "",
              responseHeaders: headers,
              elapsedMs: Math.max(0, now() - startedAt),
            },
            providerReferenceId: providerReference(headers, responseBody),
            normalizedUsage: { request_units: 1, http_status: response.status, response_bytes: bodyBytes },
            privateProviderEvidence: {
              schema: "forge.bar-stock.owner-brave-response.v1",
              discovery_run_id: input.discoveryRunId,
              request_key: requestKey,
              query_fingerprint: queryFingerprint,
              http_status: response.status,
              elapsed_ms: Math.max(0, now() - startedAt),
              response_headers: headers,
              response_body: "",
              response_body_sha256: forgeOwnerSha256(responseBody),
              response_bytes: bodyBytes,
              response_body_omitted: true,
            },
            valuations: [successValuation(queryFingerprint)],
          };
        }
        return {
          capture: {
            status: response.status,
            responseBody,
            responseHeaders: headers,
            elapsedMs: Math.max(0, now() - startedAt),
          },
          providerReferenceId: providerReference(headers, responseBody),
          normalizedUsage: { request_units: 1, http_status: response.status, response_bytes: bodyBytes },
          privateProviderEvidence: {
            schema: "forge.bar-stock.owner-brave-response.v1",
            discovery_run_id: input.discoveryRunId,
            request_key: requestKey,
            query_fingerprint: queryFingerprint,
            http_status: response.status,
            elapsed_ms: Math.max(0, now() - startedAt),
            response_headers: headers,
            response_body: responseBody,
            response_body_sha256: forgeOwnerSha256(responseBody),
            response_bytes: bodyBytes,
          },
          valuations: [successValuation(queryFingerprint)],
        };
      },
      parseResult: parseBravePayload,
      validateResult: validateBravePayload,
      persistResult: async () => undefined,
      recoverCapturedResult: async (attempt) => {
        const capture = capturedResponse(attempt);
        if (!capture) return null;
        return {
          value: parseBravePayload(capture),
          valuations: [successValuation(queryFingerprint)],
        };
      },
    });

    if (execution.state !== "succeeded") {
      throw new BarStockOwnerBraveAttemptError(execution.state, attemptNumber);
    }
    results.push({ queryFingerprint, payload: execution.value });
  }
  return results;
}

export const BAR_STOCK_OWNER_BRAVE_RATE = Object.freeze({
  amountMicros: BRAVE_SEARCH_REQUEST_MICROS,
  revisionId: BRAVE_SEARCH_RATE_REVISION,
  source: BRAVE_SEARCH_RATE_SOURCE,
});
