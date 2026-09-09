import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../../../packages/tongs/src/db.types.ts";
import { HammerShortsAuthorityClient } from "../../../packages/tongs/src/hammer-shorts-authority.ts";
import {
  HAMMER_SHORTS_AI_PROPOSAL_SCHEMA,
  type HammerShortsAiProposalV1,
  type HammerShortsDiscoveryRequestV1,
} from "../../../packages/contracts/hammer/shorts.contract.ts";
import { fingerprintHammerShortsValue, resolveHammerShortCandidates, type HammerShortsOutputSegment } from "../../hammer/src/editor/hammerShortsResolver.ts";
import { executeOpenAiTextTransport } from "../../../packages/tongs/src/providers/openai-text-paid-boundary.ts";
import type { OpenAiTextPaidExecutionHandle } from "../../../packages/tongs/src/providers/paid-openai-text-route-execution.ts";
import type { OpenAiTextSpendingAcceptance } from "../../../packages/tongs/src/providers/openai-text-customer-funding.ts";
import type { OpenAiTextGateClient } from "../../../packages/tongs/src/providers/paid-openai-text-execution-coordinator.ts";
import { executePaidJsonOpenAiRoute } from "../server/billing/paid-json-openai-route.ts";

export const HAMMER_SHORTS_DISCOVERY_ROUTE = "/api/hammer/shorts/discover";

export interface HammerShortsDiscoveryBody {
  workspace_id: string;
  parent_workpiece_id: string;
  basis_lock_id: string;
  basis_fingerprint: string;
  goal: "drive_to_full_episode" | "standalone";
  duration_preset: "about_30s" | "about_60s" | "about_90s" | "custom";
  minimum_duration_sec: number;
  maximum_duration_sec: number;
  target_candidate_count: 3 | 4;
  output_segments: HammerShortsOutputSegment[];
  operation_id: string;
  paid_execution?: OpenAiTextPaidExecutionHandle | null;
  spending_acceptance?: OpenAiTextSpendingAcceptance | null;
}

export interface HammerShortsDiscoveryDependencies {
  userClient: SupabaseClient<Database>;
  model: string;
  apiKey: string;
  policyPreflight(): Promise<{ ok: true } | { ok: false; status: number; error: string }>;
  recordUsage(args: { status: "success" | "error"; providerRequestId: string | null; payload: unknown }): Promise<void>;
  fetchImpl?: typeof fetch;
  paid?: {
    gate: OpenAiTextGateClient;
    userId: string;
    credentialSource: "forge_managed" | "user_byo" | "org_shared";
  };
  recover?: () => Promise<{ result: Record<string, unknown>; providerRequestId: string | null; inputUnits: number; outputUnits: number } | null>;
}

function valid(body: HammerShortsDiscoveryBody): boolean {
  return Boolean(body.workspace_id && body.parent_workpiece_id && body.basis_lock_id && /^[0-9a-f]{64}$/.test(body.basis_fingerprint)
    && body.operation_id && body.minimum_duration_sec > 0 && body.maximum_duration_sec >= body.minimum_duration_sec
    && (body.target_candidate_count === 3 || body.target_candidate_count === 4) && Array.isArray(body.output_segments));
}

function readOutputText(payload: unknown): string | null {
  const row = payload && typeof payload === "object" ? payload as Record<string, unknown> : null;
  if (typeof row?.output_text === "string") return row.output_text;
  const output = Array.isArray(row?.output) ? row.output : [];
  for (const item of output) {
    const content = item && typeof item === "object" && Array.isArray((item as Record<string, unknown>).content) ? (item as Record<string, unknown>).content as unknown[] : [];
    for (const part of content) if (part && typeof part === "object" && typeof (part as Record<string, unknown>).text === "string") return (part as Record<string, string>).text;
  }
  return null;
}

export async function buildHammerShortsPaidRequestIdentity(
  body: HammerShortsDiscoveryBody,
  model: string,
): Promise<{ request: HammerShortsDiscoveryRequestV1; operationFingerprint: string }> {
  const promptVersion = "hammer.shorts.discovery.prompt.v1";
  const contractVersion = "HammerShortsDiscoveryRequestV1";
  const requestUnsigned = {
    schema_version: "HammerShortsDiscoveryRequestV1" as const,
    basis_lock_id: body.basis_lock_id,
    basis_fingerprint: body.basis_fingerprint,
    goal: body.goal,
    duration_preset: body.duration_preset,
    minimum_duration_sec: body.minimum_duration_sec,
    maximum_duration_sec: body.maximum_duration_sec,
    target_candidate_count: body.target_candidate_count,
    prompt_version: promptVersion,
    contract_version: contractVersion,
    provider: "openai" as const,
    model,
  };
  const request = {
    ...requestUnsigned,
    request_fingerprint: await fingerprintHammerShortsValue(requestUnsigned),
  } satisfies HammerShortsDiscoveryRequestV1;
  return {
    request,
    operationFingerprint: await fingerprintHammerShortsValue({ operation_id: body.operation_id, request }),
  };
}

export async function executeHammerShortsDiscovery(body: HammerShortsDiscoveryBody, dependencies: HammerShortsDiscoveryDependencies): Promise<{ status: number; payload: unknown }> {
  if (!valid(body)) return { status: 400, payload: { ok: false, error: { code: "hammer_shorts_request_invalid" } } };
  const policy = await dependencies.policyPreflight();
  if (!policy.ok) return { status: policy.status || 503, payload: { ok: false, error: { code: "hammer_shorts_policy_denied", message: policy.error } } };
  const authority = new HammerShortsAuthorityClient(dependencies.userClient);
  const promptVersion = "hammer.shorts.discovery.prompt.v1";
  const { request, operationFingerprint } = await buildHammerShortsPaidRequestIdentity(body, dependencies.model);
  const reserved = await authority.reserveDiscovery(request as unknown as Json, body.operation_id, operationFingerprint) as Record<string, unknown>;
  const discoveryId = String(reserved.id ?? "");
  if (!discoveryId) return { status: 502, payload: { ok: false, error: { code: "hammer_shorts_reservation_invalid" } } };
  const activeSegments = body.output_segments.filter((segment) => !segment.disabled).map((segment) => ({ id: segment.segment_id, text: segment.text, start: segment.output_start_sec, end: segment.output_end_sec }));
  const providerRequestBody = (model: string) => ({
    model,
    input: [{ role: "system", content: "Identify only strong short-form moments. Return segment anchors; never invent timestamps or text." }, { role: "user", content: JSON.stringify({ goal: body.goal, duration_bounds_seconds: [body.minimum_duration_sec, body.maximum_duration_sec], target_count: body.target_candidate_count, segments: activeSegments }) }],
    text: { format: { type: "json_schema", name: "hammer_shorts_proposals", strict: true, schema: {
      type: "object", additionalProperties: false, required: ["proposals"], properties: {
        proposals: { type: "array", maxItems: 6, items: {
          type: "object", additionalProperties: false,
          required: ["proposal_id", "rank", "first_segment_id", "last_segment_id", "rationale", "goal_fit"],
          properties: { proposal_id: { type: "string" }, rank: { type: "integer", minimum: 1 }, first_segment_id: { type: "string" }, last_segment_id: { type: "string" }, rationale: { type: "string" }, goal_fit: { type: "string" } },
        } },
      },
    } } },
  });
  if (body.paid_execution) {
    if (!dependencies.paid || body.paid_execution.requestFingerprint !== operationFingerprint) {
      return { status: 403, payload: { ok: false, error: { code: "funding_context_required" } } };
    }
    try {
      let resolution: { outcome: string; rejected: unknown[] } | null = null;
      const paid = await executePaidJsonOpenAiRoute({
        gate: dependencies.paid.gate,
        routeCode: "shorts.discovery",
        handle: body.paid_execution,
        userId: dependencies.paid.userId,
        workspaceId: body.workspace_id,
        workpieceId: body.parent_workpiece_id,
        credentialSource: dependencies.paid.credentialSource,
        apiKey: dependencies.apiKey,
        requestFingerprintPayload: { operation_id: body.operation_id, request },
        providerUrl: "https://api.openai.com/v1/responses",
        providerRequestBody,
        fetchImpl: dependencies.fetchImpl,
        recover: dependencies.recover,
        validate: (payload) => {
          const outputText = readOutputText(payload);
          if (!outputText) throw new Error("structured_output_missing");
          const parsed = JSON.parse(outputText) as { proposals?: unknown };
          if (!Array.isArray(parsed.proposals)) throw new Error("structured_output_invalid");
          return { proposals: parsed.proposals };
        },
        persist: async (validated, providerPayload) => {
          const providerRequestId = typeof providerPayload.id === "string" ? providerPayload.id : null;
          const usage = providerPayload.usage && typeof providerPayload.usage === "object" && !Array.isArray(providerPayload.usage)
            ? providerPayload.usage as Record<string, unknown> : {};
          const proposal = {
            schema_version: HAMMER_SHORTS_AI_PROPOSAL_SCHEMA,
            discovery_id: discoveryId,
            provider: "openai",
            model: dependencies.model,
            provider_request_id: providerRequestId,
            prompt_fingerprint: await fingerprintHammerShortsValue({ promptVersion, goal: body.goal, segments: activeSegments }),
            proposals: validated.proposals,
            provider_usage: {
              input_units: Number(usage.input_tokens ?? usage.prompt_tokens ?? 0),
              output_units: Number(usage.output_tokens ?? usage.completion_tokens ?? 0),
            },
          } as HammerShortsAiProposalV1;
          const resolved = await resolveHammerShortCandidates({ discoveryId, basisLockId: body.basis_lock_id, basisFingerprint: body.basis_fingerprint, minimumDurationSec: body.minimum_duration_sec, maximumDurationSec: body.maximum_duration_sec, proposal, outputSegments: body.output_segments });
          const completed = await authority.completeDiscovery(discoveryId, proposal as unknown as Json, resolved.candidates as unknown as Json, resolved.outcome, await fingerprintHammerShortsValue(proposal));
          resolution = { outcome: resolved.outcome, rejected: resolved.rejected };
          return { data: completed as unknown as Record<string, unknown>, resolution };
        },
      });
      return { status: 200, payload: { ok: true, ...paid.result, billing_receipt: paid.receipt } };
    } catch (error) {
      await authority.failDiscovery(discoveryId, "paid_execution_failed").catch(() => undefined);
      return { status: 502, payload: { ok: false, error: { code: "hammer_shorts_discovery_failed", message: error instanceof Error ? error.message : String(error) }, discovery_id: discoveryId } };
    }
  }
  let providerPayload: unknown = null;
  let providerRequestId: string | null = null;
  let failureCode = "provider_failed";
  try {
    const response = await executeOpenAiTextTransport({ routeCode: "shorts.discovery", executeLegacy: () => (dependencies.fetchImpl ?? fetch)("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { authorization: `Bearer ${dependencies.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify(providerRequestBody(dependencies.model)),
    }) });
    providerPayload = await response.json().catch(() => null);
    providerRequestId = response.headers.get("x-request-id") ?? (providerPayload && typeof providerPayload === "object" && typeof (providerPayload as Record<string, unknown>).id === "string" ? (providerPayload as Record<string, string>).id : null);
    if (!response.ok) throw new Error(`provider_${response.status}`);
    failureCode = "validation_failed";
    const outputText = readOutputText(providerPayload);
    if (!outputText) throw new Error("structured_output_missing");
    const parsed = JSON.parse(outputText) as { proposals?: unknown };
    if (!Array.isArray(parsed.proposals)) throw new Error("structured_output_invalid");
    const proposalUnsigned = {
      schema_version: HAMMER_SHORTS_AI_PROPOSAL_SCHEMA, discovery_id: discoveryId, provider: "openai", model: dependencies.model,
      provider_request_id: providerRequestId, prompt_fingerprint: await fingerprintHammerShortsValue({ promptVersion, goal: body.goal, segments: activeSegments }), proposals: parsed.proposals,
    };
    const proposal = proposalUnsigned as HammerShortsAiProposalV1;
    const resolved = await resolveHammerShortCandidates({ discoveryId, basisLockId: body.basis_lock_id, basisFingerprint: body.basis_fingerprint, minimumDurationSec: body.minimum_duration_sec, maximumDurationSec: body.maximum_duration_sec, proposal, outputSegments: body.output_segments });
    failureCode = "persistence_failed";
    const completed = await authority.completeDiscovery(discoveryId, proposal as unknown as Json, resolved.candidates as unknown as Json, resolved.outcome, await fingerprintHammerShortsValue(proposal));
    await dependencies.recordUsage({ status: "success", providerRequestId, payload: providerPayload });
    return { status: 200, payload: { ok: true, data: completed, resolution: { outcome: resolved.outcome, rejected: resolved.rejected } } };
  } catch (error) {
    await authority.failDiscovery(discoveryId, failureCode).catch(() => undefined);
    await dependencies.recordUsage({ status: "error", providerRequestId, payload: providerPayload });
    return { status: 502, payload: { ok: false, error: { code: "hammer_shorts_discovery_failed", message: error instanceof Error ? error.message : String(error) }, discovery_id: discoveryId } };
  }
}
