import type { HearthOp } from "./hearth-ai-ops";
import { normalizeHearthOps } from "./hearth-ai-runtime-contract";
import { resolveTongsUserAccessToken } from "./tongs-fetch";

type JsonRecord = Record<string, unknown>;
type RpcResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string };

export type HearthPersistedScriptProposal = Readonly<{
  proposalId: string;
  proposalState: "proposed";
  createdAt: string;
  operationId: string;
  sourcePaidResultId: string | null;
  assistantText: string;
  scriptText: string;
  ops: HearthOp[];
  expectedDraftRevision: number;
  expectedDraftHash: string;
  applicationStarted: boolean;
}>;

export type HearthScriptProposalApplication = HearthPersistedScriptProposal & Readonly<{
  disposition: "started" | "resume";
  currentDraftRevision: number;
  currentDraftHash: string;
  canonicalRevisionId: string;
}>;

export type HearthScriptProposalCompletion = Readonly<{
  disposition: "applied" | "applied_replay";
  proposalId: string;
  appliedDraftRevision: number;
  appliedDraftHash: string;
  canonicalRevisionId: string;
}>;

function record(value: unknown): value is JsonRecord {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function string(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function integer(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

function runtimeValue(name: "VITE_SUPABASE_URL" | "VITE_SUPABASE_ANON_KEY"): string {
  const meta = import.meta as ImportMeta & { env?: Record<string, unknown> };
  const compileTime = meta.env?.[name];
  if (typeof compileTime === "string" && compileTime.trim()) return compileTime.trim();
  const globals = globalThis as {
    __FORGE_RUNTIME_CONFIG__?: Record<string, unknown>;
    __forge_supabase_client__?: { supabaseUrl?: unknown; supabaseKey?: unknown };
    __forgeSupabaseUrl?: unknown;
    __forgeSupabaseAnonKey?: unknown;
    __tpSupabaseUrl?: unknown;
    __tpSupabaseAnonKey?: unknown;
  };
  const clientValue = name === "VITE_SUPABASE_URL"
    ? globals.__forge_supabase_client__?.supabaseUrl
    : globals.__forge_supabase_client__?.supabaseKey;
  if (typeof clientValue === "string" && clientValue.trim()) return clientValue.trim();
  const globalValue = name === "VITE_SUPABASE_URL"
    ? globals.__forgeSupabaseUrl ?? globals.__tpSupabaseUrl
    : globals.__forgeSupabaseAnonKey ?? globals.__tpSupabaseAnonKey;
  if (typeof globalValue === "string" && globalValue.trim()) return globalValue.trim();
  const runtime = globals.__FORGE_RUNTIME_CONFIG__;
  const key = name === "VITE_SUPABASE_URL" ? "supabaseUrl" : "supabaseAnonKey";
  const value = runtime?.[key];
  return typeof value === "string" ? value.trim() : "";
}

async function rpc<T>(name: string, payload: JsonRecord): Promise<RpcResult<T>> {
  const url = runtimeValue("VITE_SUPABASE_URL");
  const anon = runtimeValue("VITE_SUPABASE_ANON_KEY");
  const token = await resolveTongsUserAccessToken();
  if (!url || !anon || !token) {
    return { ok: false, status: 401, error: "Sign in to load the canonical script proposal." };
  }
  let response: Response;
  try {
    response = await fetch(`${url}/rest/v1/rpc/${encodeURIComponent(name)}`, {
      method: "POST",
      headers: {
        apikey: anon,
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "accept-profile": "tongs",
        "content-profile": "tongs",
      },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    return { ok: false, status: 0, error: error instanceof Error ? error.message : "Canonical proposal request failed." };
  }
  const data = await response.json().catch(() => null) as T;
  if (response.ok) return { ok: true, data };
  const message = record(data) && string(data.message)
    ? string(data.message)!
    : `Canonical proposal request failed (${response.status}).`;
  return { ok: false, status: response.status, error: message };
}

function normalizeProposal(value: unknown): HearthPersistedScriptProposal | null {
  if (!record(value)) return null;
  const proposalId = string(value.proposal_id);
  const createdAt = string(value.created_at);
  const operationId = string(value.operation_id);
  const assistantText = string(value.assistant_text);
  const scriptText = string(value.script_text);
  const expectedDraftRevision = integer(value.expected_draft_revision);
  const expectedDraftHash = string(value.expected_draft_hash)?.toLowerCase() ?? null;
  const ops = normalizeHearthOps(value.ops);
  const bodyOp = ops.find((op) => op.op === "set_body");
  if (!proposalId || value.proposal_state !== "proposed" || !createdAt || !operationId
    || !assistantText || !scriptText || !expectedDraftRevision || !expectedDraftHash
    || !/^[0-9a-f]{64}$/.test(expectedDraftHash)
    || bodyOp?.op !== "set_body" || bodyOp.value !== scriptText) return null;
  return {
    proposalId,
    proposalState: "proposed",
    createdAt,
    operationId,
    sourcePaidResultId: string(value.source_paid_result_id),
    assistantText,
    scriptText,
    ops,
    expectedDraftRevision,
    expectedDraftHash,
    applicationStarted: value.application_started === true,
  };
}

export async function readPendingHearthScriptProposal(
  workspaceId: string,
  workpieceId: string,
): Promise<RpcResult<HearthPersistedScriptProposal | null>> {
  const result = await rpc<unknown>("read_my_pending_hearth_script_proposal", {
    p_workspace_id: workspaceId,
    p_workpiece_id: workpieceId,
  });
  if (!result.ok) return result;
  if (result.data == null) return { ok: true, data: null };
  const proposal = normalizeProposal(result.data);
  return proposal
    ? { ok: true, data: proposal }
    : { ok: false, status: 502, error: "Tongs returned an invalid script proposal." };
}

export async function beginHearthScriptProposalApplication(args: {
  workspaceId: string;
  workpieceId: string;
  proposalId: string;
}): Promise<RpcResult<HearthScriptProposalApplication>> {
  const result = await rpc<unknown>("begin_my_hearth_script_proposal_application", {
    p_workspace_id: args.workspaceId,
    p_workpiece_id: args.workpieceId,
    p_proposal_id: args.proposalId,
  });
  if (!result.ok) return result;
  if (!record(result.data)) return { ok: false, status: 502, error: "Tongs returned an invalid proposal application receipt." };
  const disposition = string(result.data.disposition);
  if (disposition !== "started" && disposition !== "resume") {
    const message = disposition === "stale"
      ? "The working script changed after this proposal was generated. Reload before applying it."
      : disposition === "applied"
        ? "This script proposal has already been applied."
        : "This script proposal is no longer pending.";
    return { ok: false, status: disposition === "not_found" ? 404 : 409, error: message };
  }
  const proposal = normalizeProposal({
    ...result.data,
    created_at: string(result.data.created_at) ?? new Date(0).toISOString(),
    operation_id: string(result.data.operation_id) ?? "application-recovery",
    source_paid_result_id: result.data.source_paid_result_id ?? null,
    application_started: true,
  });
  const currentDraftRevision = integer(result.data.current_draft_revision);
  const currentDraftHash = string(result.data.current_draft_hash)?.toLowerCase() ?? null;
  const canonicalRevisionId = string(result.data.canonical_revision_id);
  if (!proposal || !currentDraftRevision || !currentDraftHash || !canonicalRevisionId) {
    return { ok: false, status: 502, error: "Tongs returned incomplete proposal application authority." };
  }
  return { ok: true, data: { ...proposal, disposition, currentDraftRevision, currentDraftHash, canonicalRevisionId } };
}

export async function completeHearthScriptProposalApplication(args: {
  workspaceId: string;
  workpieceId: string;
  proposalId: string;
  canonicalRevisionId: string;
}): Promise<RpcResult<HearthScriptProposalCompletion>> {
  const result = await rpc<unknown>("complete_my_hearth_script_proposal_application", {
    p_workspace_id: args.workspaceId,
    p_workpiece_id: args.workpieceId,
    p_proposal_id: args.proposalId,
    p_canonical_revision_id: args.canonicalRevisionId,
  });
  if (!result.ok) return result;
  if (!record(result.data)) return { ok: false, status: 502, error: "Tongs returned an invalid proposal completion receipt." };
  const disposition = string(result.data.disposition);
  const proposalId = string(result.data.proposal_id);
  const appliedDraftRevision = integer(result.data.applied_draft_revision);
  const appliedDraftHash = string(result.data.applied_draft_hash)?.toLowerCase() ?? null;
  const canonicalRevisionId = string(result.data.canonical_revision_id);
  if ((disposition !== "applied" && disposition !== "applied_replay") || !proposalId
    || !appliedDraftRevision || !appliedDraftHash || !canonicalRevisionId) {
    return { ok: false, status: 409, error: "The canonical script commit could not be verified; the proposal remains retryable." };
  }
  return { ok: true, data: { disposition, proposalId, appliedDraftRevision, appliedDraftHash, canonicalRevisionId } };
}

export async function rejectHearthScriptProposal(args: {
  workspaceId: string;
  workpieceId: string;
  proposalId: string;
}): Promise<RpcResult<{ disposition: string; proposalId: string }>> {
  const result = await rpc<unknown>("reject_my_hearth_script_proposal", {
    p_workspace_id: args.workspaceId,
    p_workpiece_id: args.workpieceId,
    p_proposal_id: args.proposalId,
  });
  if (!result.ok) return result;
  if (!record(result.data)) return { ok: false, status: 502, error: "Tongs returned an invalid proposal rejection receipt." };
  const disposition = string(result.data.disposition);
  const proposalId = string(result.data.proposal_id);
  if (!disposition || !proposalId || !["rejected", "rejected_replay"].includes(disposition)) {
    return { ok: false, status: 409, error: "This script proposal could not be rejected." };
  }
  return { ok: true, data: { disposition, proposalId } };
}
