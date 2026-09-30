import { resolveTongsUserAccessTokenResult, tongsFetch } from "./tongs-fetch";
import type { MediaMapGenerationScope } from "./hearth-media-map-conversation";
import { readCustomerSpendingQuote, requestCustomerSpendingAcceptance } from "../../../../packages/tongs/src/customer-spending-confirmation";
import { OPENAI_TEXT_OUTER_REQUEST_DEADLINE_MS } from "../../../../packages/tongs/src/providers/openai-text-timing-contract";

type JsonRecord = Record<string, unknown>;
type Result<T> = { ok: true; data: T } | { ok: false; status: number; code: string; error: string; stage: string | null };

export type UnifiedVisualPlanReceipt = {
  disposition: "verified";
  operationId: string;
  operationFingerprint: string;
  scriptApprovalId: string;
  scriptApprovalRevision: number;
  imageMapRevisionId: string;
  imageMapRevision: number;
  brollPlanRevisionId: string;
  brollPlanRevision: number;
  referenceClipPlanRevisionId: string;
  referenceClipPlanRevision: number;
  referenceVisualPlanRevisionId: string;
  referenceVisualPlanRevision: number;
};

const record = (value: unknown): value is JsonRecord => !!value && typeof value === "object" && !Array.isArray(value);
const string = (value: unknown): string | null => typeof value === "string" && value.trim() ? value.trim() : null;
const integer = (value: unknown): number => Number.isInteger(Number(value)) ? Number(value) : 0;

function supabaseBrowserConfig(): { url: string; anonKey: string } | null {
  const runtime = typeof window === "undefined" ? null : window as typeof window & {
    __forge_supabase_client__?: { supabaseUrl?: unknown; supabaseKey?: unknown };
  };
  const url = string(runtime?.__forge_supabase_client__?.supabaseUrl)
    ?? string(import.meta.env?.VITE_SUPABASE_URL)
    ?? string(import.meta.env?.VITE_SUPABASE_DATABASE_URL);
  const anonKey = string(runtime?.__forge_supabase_client__?.supabaseKey)
    ?? string(import.meta.env?.VITE_SUPABASE_ANON_KEY);
  return url && anonKey ? { url, anonKey } : null;
}

function normalize(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(normalize);
  return Object.fromEntries(Object.keys(value as JsonRecord).sort().flatMap((key) => typeof (value as JsonRecord)[key] === "undefined" ? [] : [[key, normalize((value as JsonRecord)[key])]]));
}

async function hash(value: unknown): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(normalize(value))));
  return Array.from(new Uint8Array(digest), (part) => part.toString(16).padStart(2, "0")).join("");
}

async function json(response: Response): Promise<unknown> { try { return await response.json(); } catch { return null; } }

function requestBodyFromInputs(inputs: JsonRecord, operationId: string, operationFingerprint: string): JsonRecord {
  return {
    workspace_id: inputs.workspace_id, script_approval_id: inputs.script_approval_id,
    expected_image_revision_id: inputs.expected_image_revision_id, expected_image_revision: inputs.expected_image_revision,
    expected_broll_revision_id: inputs.expected_broll_revision_id, expected_broll_revision: inputs.expected_broll_revision,
    expected_reference_revision_id: inputs.expected_reference_revision_id, expected_reference_revision: inputs.expected_reference_revision,
    expected_reference_visual_revision_id: inputs.expected_reference_visual_revision_id, expected_reference_visual_revision: inputs.expected_reference_visual_revision,
    creator_direction: inputs.creator_direction, generation_scope: string(inputs.generation_scope) ?? "full_media_plan",
    operation_id: operationId, operation_fingerprint: operationFingerprint,
  };
}

function failure(response: Response, value: unknown, fallback: string): Result<never> {
  const root = record(value) ? value : null;
  const nested = record(root?.error) ? root.error : null;
  const detail = record(nested?.details) ? nested.details : record(root?.details) ? root.details : null;
  return {
    ok: false,
    status: response.status,
    code: string(nested?.code) ?? string(root?.code) ?? "unified_visual_plan_failed",
    error: string(nested?.message) ?? string(root?.message) ?? fallback,
    stage: string(detail?.failed_stage) ?? string(detail?.stage),
  };
}

async function postgrest(path: string): Promise<Result<unknown>> {
  const config = supabaseBrowserConfig();
  if (!config) return { ok: false, status: 503, code: "unified_visual_plan_runtime_config_unavailable", error: "Visual Plan authentication configuration is unavailable.", stage: "authentication" };
  const token = await resolveTongsUserAccessTokenResult();
  if (!token.ok) return {
    ok: false,
    status: 401,
    code: token.reason === "refresh_failed" ? "unified_visual_plan_token_refresh_failed" : "unified_visual_plan_auth_unavailable",
    error: token.reason === "refresh_failed" ? "Your sign-in session could not be refreshed." : "Sign in to generate the canonical Visual Plan.",
    stage: "authentication",
  };
  const response = await fetch(`${config.url}/rest/v1/${path}`, { headers: { apikey: config.anonKey, authorization: `Bearer ${token.accessToken}`, "accept-profile": "tongs" } });
  const value = await json(response);
  if (response.status === 401) return { ok: false, status: 401, code: "unified_visual_plan_bearer_rejected", error: "The current sign-in token was rejected. Refresh your session and try again.", stage: "authentication" };
  return response.ok ? { ok: true, data: value } : failure(response, value, "Tongs canonical Visual Plan readback failed.");
}

async function currentInputs(workspaceId: string, workpieceId: string, generationScope: MediaMapGenerationScope): Promise<Result<JsonRecord>> {
  const approvalResponse = await tongsFetch(`/tongs/workpieces/${encodeURIComponent(workpieceId)}/script-approval`, { method: "GET" });
  const approvalBody = await json(approvalResponse);
  const approval = record(approvalBody) && record(approvalBody.data) && record(approvalBody.data.current_approval) ? approvalBody.data.current_approval : null;
  const approvalId = string(approval?.id);
  const approvalRevision = integer(approval?.approval_revision);
  const scriptContentHash = string(approval?.script_content_hash);
  if (!approvalResponse.ok || !approvalId || approvalRevision < 1 || !scriptContentHash) return failure(approvalResponse, approvalBody, "Approve the current script before generating a Visual Plan.");
  const [image, broll, reference, referenceVisual] = await Promise.all([
    postgrest(`workpiece_image_map_sequences?workspace_id=eq.${workspaceId}&workpiece_id=eq.${workpieceId}&select=current_revision_id,current_revision`),
    postgrest(`broll_plan_sequences?workspace_id=eq.${workspaceId}&workpiece_id=eq.${workpieceId}&select=current_plan_revision_id,current_plan_revision`),
    postgrest(`reference_clip_plan_sequences?workspace_id=eq.${workspaceId}&workpiece_id=eq.${workpieceId}&select=current_plan_revision_id,current_plan_revision`),
    postgrest(`reference_visual_plan_sequences?workspace_id=eq.${workspaceId}&workpiece_id=eq.${workpieceId}&select=current_plan_revision_id,current_plan_revision`),
  ]);
  if (!image.ok) return image;
  if (!broll.ok) return broll;
  if (!reference.ok) return reference;
  if (!referenceVisual.ok) return referenceVisual;
  const sourcesResponse=await tongsFetch(`/tongs/workpieces/${encodeURIComponent(workpieceId)}/sources?workspace_id=${encodeURIComponent(workspaceId)}`,{method:"GET"});
  const sourcesBody=await json(sourcesResponse);if(!sourcesResponse.ok)return failure(sourcesResponse,sourcesBody,"Canonical episode Sources could not be read.");
  const sourcesRoot=record(sourcesBody)&&record(sourcesBody.data)?sourcesBody.data:null;
  const sourceCatalog=(sourcesRoot&&Array.isArray(sourcesRoot.links)?sourcesRoot.links:[]).flatMap((entry)=>{if(!record(entry)||!record(entry.link_revision)||!record(entry.source_revision))return[];const linkId=string(entry.link_revision.id),title=string(entry.source_revision.title),sourceType=string(entry.source_revision.source_type),canonicalUrl=string(entry.source_revision.canonical_url);if(!linkId||!title||!sourceType||!canonicalUrl)return[];const provenance=record(entry.source_revision.provenance_json)?entry.source_revision.provenance_json:{};return[{source_key:`src_${linkId.replaceAll("-","")}`,title,publisher:string(entry.source_revision.publisher),source_type:sourceType,canonical_url:canonicalUrl,user_supplied:provenance.user_supplied===true}];});
  const imageRow = Array.isArray(image.data) && record(image.data[0]) ? image.data[0] : null;
  const brollRow = Array.isArray(broll.data) && record(broll.data[0]) ? broll.data[0] : null;
  const referenceRow = Array.isArray(reference.data) && record(reference.data[0]) ? reference.data[0] : null;
  const referenceVisualRow = Array.isArray(referenceVisual.data) && record(referenceVisual.data[0]) ? referenceVisual.data[0] : null;
  return { ok: true, data: {
    workspace_id: workspaceId, workpiece_id: workpieceId, script_approval_id: approvalId,
    script_approval_revision: approvalRevision, script_content_hash: scriptContentHash,
    expected_image_revision_id: string(imageRow?.current_revision_id), expected_image_revision: integer(imageRow?.current_revision),
    expected_broll_revision_id: string(brollRow?.current_plan_revision_id), expected_broll_revision: integer(brollRow?.current_plan_revision),
    expected_reference_revision_id: string(referenceRow?.current_plan_revision_id), expected_reference_revision: integer(referenceRow?.current_plan_revision),
    expected_reference_visual_revision_id: string(referenceVisualRow?.current_plan_revision_id), expected_reference_visual_revision: integer(referenceVisualRow?.current_plan_revision),
    creator_direction: null, generation_scope: generationScope, source_catalog:sourceCatalog, contract_version: "forge.unified-visual-plan.v3",
    provider_contract_version: "forge.unified-visual-plan-provider.v5",
    model_configuration: { model: "gpt-5.6-luna" },
  } };
}

export async function readLatestUnifiedVisualPlanOperation(workspaceId: string, workpieceId: string): Promise<Result<JsonRecord | null>> {
  const result = await postgrest(`unified_visual_plan_operations?workspace_id=eq.${workspaceId}&workpiece_id=eq.${workpieceId}&select=*&order=created_at.desc&limit=1`);
  if (!result.ok) return result;
  return { ok: true, data: Array.isArray(result.data) && record(result.data[0]) ? result.data[0] : null };
}

export async function preflightUnifiedVisualPlanAuthentication(args: {
  workspaceId: string;
  workpieceId: string;
  generationScope: MediaMapGenerationScope;
}): Promise<Result<JsonRecord>> {
  const inputs = await currentInputs(args.workspaceId, args.workpieceId, args.generationScope);
  if (!inputs.ok) return inputs;
  const response = await tongsFetch(`/tongs/workpieces/${encodeURIComponent(args.workpieceId)}/visual-plan-v2/preflight`, {
    method: "POST",
    json: { workspace_id: args.workspaceId },
  });
  const value = await json(response);
  if (!response.ok) return failure(response, value, "Unified Visual Plan authentication preflight failed.");
  const data = record(value) && record(value.data) ? value.data : null;
  return data ? { ok: true, data } : { ok: false, status: 502, code: "unified_visual_plan_preflight_invalid", error: "Unified Visual Plan authentication preflight returned an invalid result.", stage: "authentication" };
}

function receipt(value: unknown): Result<UnifiedVisualPlanReceipt> {
  const row = record(value) && record(value.data) ? value.data : value;
  if (!record(row) || row.disposition !== "verified") return { ok: false, status: 502, code: "unified_visual_plan_receipt_invalid", error: "Tongs did not return an immutable verified Visual Plan receipt.", stage: "verification" };
  const imagePlan = record(row.image_plan) ? row.image_plan : null;
  const brollPlan = record(row.broll_plan) ? row.broll_plan : null;
  const referenceClipPlan = record(row.reference_clip_plan) ? row.reference_clip_plan : null;
  const referenceVisualPlan = record(row.reference_visual_plan) ? row.reference_visual_plan : null;
  const mapped: UnifiedVisualPlanReceipt = {
    disposition: "verified", operationId: string(row.operation_id) ?? "", operationFingerprint: string(row.operation_fingerprint) ?? "",
    scriptApprovalId: string(row.script_approval_id) ?? "", scriptApprovalRevision: integer(row.script_approval_revision),
    imageMapRevisionId: string(row.image_map_revision_id) ?? string(imagePlan?.revision_id) ?? "", imageMapRevision: integer(row.image_map_revision ?? imagePlan?.revision),
    brollPlanRevisionId: string(row.broll_plan_revision_id) ?? string(brollPlan?.revision_id) ?? "", brollPlanRevision: integer(row.broll_plan_revision ?? brollPlan?.revision),
    referenceClipPlanRevisionId: string(row.reference_clip_plan_revision_id) ?? string(referenceClipPlan?.revision_id) ?? "", referenceClipPlanRevision: integer(row.reference_clip_plan_revision ?? referenceClipPlan?.revision),
    referenceVisualPlanRevisionId: string(row.reference_visual_plan_revision_id) ?? string(referenceVisualPlan?.revision_id) ?? "", referenceVisualPlanRevision: integer(row.reference_visual_plan_revision ?? referenceVisualPlan?.revision),
  };
  return Object.values(mapped).some((entry) => entry === "") ? { ok: false, status: 502, code: "unified_visual_plan_receipt_incomplete", error: "The verified Visual Plan receipt omitted canonical child identities.", stage: "verification" } : { ok: true, data: mapped };
}

export async function generateOrResumeUnifiedVisualPlan(args: { workspaceId: string; workpieceId: string; generationScope: MediaMapGenerationScope; creatorDirection?: string | null }): Promise<Result<UnifiedVisualPlanReceipt>> {
  const latest = await readLatestUnifiedVisualPlanOperation(args.workspaceId, args.workpieceId);
  if (!latest.ok) return latest;
  let inputs: JsonRecord;
  let operationId: string;
  let operationFingerprint: string;
  const latestState = string(latest.data?.state);
  if (latest.data && latestState !== "verified" && latestState !== "failed" && latestState !== "submission_unknown") {
    return { ok: false, status: 409, code: "unified_visual_plan_recovery_required", error: "A durable Visual Plan operation already exists. Use recovery readback; a normal retry is disabled to prevent another provider submission.", stage: latestState };
  } else {
    const current = await currentInputs(args.workspaceId, args.workpieceId, args.generationScope);
    if (!current.ok) return current;
    inputs = { ...current.data, creator_direction: args.creatorDirection?.trim() || null };
    operationFingerprint = await hash(inputs);
    operationId = `forge:unified-visual-plan:${operationFingerprint}:${crypto.randomUUID()}`;
  }
  const requestBody = requestBodyFromInputs(inputs, operationId, operationFingerprint);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await tongsFetch(`/tongs/workpieces/${encodeURIComponent(args.workpieceId)}/visual-plan-v2/generate`, {
      method: "POST", json: requestBody, signal: AbortSignal.timeout(OPENAI_TEXT_OUTER_REQUEST_DEADLINE_MS),
    });
    const value = await json(response);
    if (response.ok) return receipt(value);
    const quote = readCustomerSpendingQuote(value);
    const acceptance = attempt === 0 && quote ? requestCustomerSpendingAcceptance(quote) : null;
    if (acceptance) {
      requestBody.spending_acceptance = acceptance;
      continue;
    }
    const failed = failure(response, value, "Tongs could not generate the canonical Visual Plan.");
    if (quote && !quote.funding_eligible && !failed.ok) return { ...failed, error: `${failed.error} ${quote.funding_label}.` };
    return failed;
  }
  return { ok: false, status: 409, code: "quote_retry_exhausted", error: "The accepted Visual Plan quote could not be used.", stage: "billing" };
}

export async function recoverUnifiedVisualPlanOperation(args: { workspaceId: string; workpieceId: string }): Promise<Result<UnifiedVisualPlanReceipt>> {
  const latest = await readLatestUnifiedVisualPlanOperation(args.workspaceId, args.workpieceId);
  if (!latest.ok) return latest;
  if (!latest.data) return { ok: false, status: 404, code: "unified_visual_plan_operation_missing", error: "No durable Visual Plan operation is available for recovery.", stage: "recovery" };
  const state = string(latest.data.state);
  if (state === "verified" && record(latest.data.receipt_json)) return receipt(latest.data.receipt_json);
  if (state === "failed") return { ok: false, status: 409, code: "unified_visual_plan_terminal_failure", error: string(latest.data.failure_message) ?? "The Visual Plan operation failed terminally.", stage: string(latest.data.failed_stage) ?? "failed" };
  if (state === "submission_unknown") return { ok: false, status: 202, code: "paid_submission_unknown", error: "OpenAI may have received this Visual Plan request. No automatic retry is allowed; recovery remains read-only until reconciliation.", stage: "submission_unknown" };
  const inputs = record(latest.data.normalized_inputs_json) ? latest.data.normalized_inputs_json : null;
  const operationId = string(latest.data.operation_id), operationFingerprint = string(latest.data.operation_fingerprint);
  if (!inputs || !operationId || !operationFingerprint) return { ok: false, status: 502, code: "unified_visual_plan_resume_evidence_missing", error: "The durable Visual Plan operation is missing its canonical recovery evidence.", stage: state };
  try {
    const response = await tongsFetch(`/tongs/workpieces/${encodeURIComponent(args.workpieceId)}/visual-plan-v2/recover`, {
      method: "POST",
      json: requestBodyFromInputs(inputs, operationId, operationFingerprint),
      signal: AbortSignal.timeout(OPENAI_TEXT_OUTER_REQUEST_DEADLINE_MS),
    });
    const value = await json(response);
    return response.ok ? receipt(value) : failure(response, value, "Tongs could not recover the durable Visual Plan operation.");
  } catch (error) {
    return { ok: false, status: 504, code: "unified_visual_plan_recovery_deadline", error: error instanceof Error ? error.message : "Visual Plan recovery timed out.", stage: "recovery" };
  }
}
