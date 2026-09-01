import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../../../packages/tongs/src/db.types.ts";
import { HammerShortsAuthorityClient } from "../../../packages/tongs/src/hammer-shorts-authority.ts";
import {
  HAMMER_SHORTS_AI_PROPOSAL_SCHEMA,
  type HammerShortsAiProposalV1,
  type HammerShortsDiscoveryRequestV1,
} from "../../../packages/contracts/hammer/shorts.contract.ts";
import { fingerprintHammerShortsValue, resolveHammerShortCandidates, type HammerShortsOutputSegment } from "../../hammer/src/editor/hammerShortsResolver.ts";

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
}

export interface HammerShortsDiscoveryDependencies {
  userClient: SupabaseClient<Database>;
  model: string;
  apiKey: string;
  policyPreflight(): Promise<{ ok: true } | { ok: false; status: number; error: string }>;
  recordUsage(args: { status: "success" | "error"; providerRequestId: string | null; payload: unknown }): Promise<void>;
  fetchImpl?: typeof fetch;
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

export async function executeHammerShortsDiscovery(body: HammerShortsDiscoveryBody, dependencies: HammerShortsDiscoveryDependencies): Promise<{ status: number; payload: unknown }> {
  if (!valid(body)) return { status: 400, payload: { ok: false, error: { code: "hammer_shorts_request_invalid" } } };
  const policy = await dependencies.policyPreflight();
  if (!policy.ok) return { status: policy.status || 503, payload: { ok: false, error: { code: "hammer_shorts_policy_denied", message: policy.error } } };
  const authority = new HammerShortsAuthorityClient(dependencies.userClient);
  const promptVersion = "hammer.shorts.discovery.prompt.v1";
  const contractVersion = "HammerShortsDiscoveryRequestV1";
  const requestUnsigned = {
    schema_version: "HammerShortsDiscoveryRequestV1", basis_lock_id: body.basis_lock_id, basis_fingerprint: body.basis_fingerprint,
    goal: body.goal, duration_preset: body.duration_preset, minimum_duration_sec: body.minimum_duration_sec,
    maximum_duration_sec: body.maximum_duration_sec, target_candidate_count: body.target_candidate_count,
    prompt_version: promptVersion, contract_version: contractVersion, provider: "openai", model: dependencies.model,
  };
  const request = { ...requestUnsigned, request_fingerprint: await fingerprintHammerShortsValue(requestUnsigned) } satisfies HammerShortsDiscoveryRequestV1;
  const operationFingerprint = await fingerprintHammerShortsValue({ operation_id: body.operation_id, request });
  const reserved = await authority.reserveDiscovery(request as unknown as Json, body.operation_id, operationFingerprint) as Record<string, unknown>;
  const discoveryId = String(reserved.id ?? "");
  if (!discoveryId) return { status: 502, payload: { ok: false, error: { code: "hammer_shorts_reservation_invalid" } } };
  const activeSegments = body.output_segments.filter((segment) => !segment.disabled).map((segment) => ({ id: segment.segment_id, text: segment.text, start: segment.output_start_sec, end: segment.output_end_sec }));
  let providerPayload: unknown = null;
  let providerRequestId: string | null = null;
  let failureCode = "provider_failed";
  try {
    const response = await (dependencies.fetchImpl ?? fetch)("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { authorization: `Bearer ${dependencies.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: dependencies.model,
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
      }),
    });
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
