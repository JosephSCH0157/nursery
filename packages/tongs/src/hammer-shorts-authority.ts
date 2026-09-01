import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "./db.types.js";

export const HAMMER_SHORTS_ROUTE_PREFIX = "/tongs/hammer/shorts";

type RpcClient = { rpc(name: string, args?: Record<string, unknown>): Promise<{ data: unknown; error: { message: string; code?: string } | null }> };
type TableClient = {
  select(columns?: string): TableClient;
  eq(column: string, value: unknown): TableClient;
  order(column: string, options?: { ascending?: boolean }): TableClient;
  maybeSingle(): Promise<{ data: unknown; error: { message: string } | null }>;
  then<TResult1 = { data: unknown; error: { message: string } | null }>(onfulfilled?: ((value: { data: unknown; error: { message: string } | null }) => TResult1 | PromiseLike<TResult1>) | null): Promise<TResult1>;
};

function schema(client: SupabaseClient<Database>): { rpc: RpcClient["rpc"]; from(table: string): TableClient } {
  return client.schema("tongs") as unknown as { rpc: RpcClient["rpc"]; from(table: string): TableClient };
}

function assertResult(result: { data: unknown; error: { message: string; code?: string } | null }, code: string): unknown {
  if (result.error) throw new Error(`${code}:${result.error.code ?? "unknown"}:${result.error.message}`);
  return result.data;
}

export class HammerShortsAuthorityClient {
  private readonly client: SupabaseClient<Database>;
  constructor(client: SupabaseClient<Database>) { this.client = client; }

  async lockBasis(basis: Json, operationId: string, operationFingerprint: string): Promise<unknown> {
    return assertResult(await schema(this.client).rpc("lock_hammer_shorts_basis", { p_basis: basis, p_operation_id: operationId, p_operation_fingerprint: operationFingerprint }), "hammer_shorts_lock_failed");
  }
  async readBasis(parentWorkpieceId: string): Promise<unknown> {
    return assertResult(await schema(this.client).from("hammer_shorts_basis_locks").select("*").eq("parent_workpiece_id", parentWorkpieceId).order("locked_at", { ascending: false }), "hammer_shorts_basis_read_failed");
  }
  async reserveDiscovery(request: Json, operationId: string, operationFingerprint: string): Promise<unknown> {
    return assertResult(await schema(this.client).rpc("reserve_hammer_shorts_discovery", { p_request: request, p_operation_id: operationId, p_operation_fingerprint: operationFingerprint }), "hammer_shorts_discovery_reserve_failed");
  }
  async completeDiscovery(discoveryId: string, proposal: Json, candidates: Json, outcome: string, proposalFingerprint: string): Promise<unknown> {
    return assertResult(await schema(this.client).rpc("complete_hammer_shorts_discovery", { p_discovery_id: discoveryId, p_ai_proposal: proposal, p_candidates: candidates, p_outcome: outcome, p_proposal_fingerprint: proposalFingerprint }), "hammer_shorts_discovery_complete_failed");
  }
  async readDiscoveries(parentWorkpieceId: string): Promise<unknown> {
    return assertResult(await schema(this.client).from("hammer_shorts_discoveries").select("*").eq("parent_workpiece_id", parentWorkpieceId).order("created_at", { ascending: false }), "hammer_shorts_discovery_read_failed");
  }
  async readCandidates(discoveryId: string): Promise<unknown> {
    return assertResult(await schema(this.client).from("hammer_short_candidates").select("*").eq("discovery_id", discoveryId).order("rank", { ascending: true }), "hammer_shorts_candidate_read_failed");
  }
  async failDiscovery(discoveryId: string, failureCode: string): Promise<unknown> {
    return assertResult(await schema(this.client).rpc("fail_hammer_shorts_discovery", { p_discovery_id: discoveryId, p_failure_code: failureCode }), "hammer_shorts_discovery_fail_failed");
  }
  async rejectCandidate(candidateId: string): Promise<unknown> {
    return assertResult(await schema(this.client).rpc("reject_hammer_short_candidate", { p_candidate_id: candidateId }), "hammer_shorts_candidate_reject_failed");
  }
  async reserveDerivative(candidateId: string, label: string, operationId: string, operationFingerprint: string): Promise<unknown> {
    return assertResult(await schema(this.client).rpc("reserve_hammer_short_derivative", { p_candidate_id: candidateId, p_display_label: label, p_operation_id: operationId, p_operation_fingerprint: operationFingerprint }), "hammer_short_derivative_reserve_failed");
  }
  async readDerivative(candidateId: string): Promise<unknown> {
    return assertResult(await schema(this.client).from("hammer_short_derivatives").select("*").eq("candidate_id", candidateId).maybeSingle(), "hammer_short_derivative_read_failed");
  }
  async readDerivativeById(derivativeId: string): Promise<unknown> {
    return assertResult(await schema(this.client).from("hammer_short_derivatives").select("*").eq("id", derivativeId).maybeSingle(), "hammer_short_derivative_read_failed");
  }
  async authorizeDerivativePreparation(derivativeId: string): Promise<unknown> {
    return assertResult(await schema(this.client).rpc("authorize_hammer_short_derivative_preparation", { p_derivative_id: derivativeId }), "hammer_short_derivative_preparation_denied");
  }
  async failDerivative(derivativeId: string, failureCode: string): Promise<unknown> {
    return assertResult(await schema(this.client).rpc("fail_hammer_short_derivative", { p_derivative_id: derivativeId, p_failure_code: failureCode }), "hammer_short_derivative_fail_failed");
  }
  async finalizeDerivative(derivativeId: string, artifactAuthority: Json): Promise<unknown> {
    return assertResult(await schema(this.client).rpc("finalize_hammer_short_derivative", { p_derivative_id: derivativeId, p_artifact_authority: artifactAuthority }), "hammer_short_derivative_finalize_failed");
  }
}

function response(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const copy = Uint8Array.from(bytes);
  const digest = await crypto.subtle.digest("SHA-256", copy.buffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

const SHORT_ARTIFACT_FILENAMES: Readonly<Record<string, string>> = Object.freeze({
  transcript: "transcript.v1.json", timing_map: "timing-map.v1.json", editor_session: "editor-session.v1.json",
  visual_timeline: "visual-timeline.v2.json", visual_placements: "visual-placements.v1.json", audio_polish: "audio-polish.v1.json", history: "history.v1.json",
});

async function writeDerivativeArtifacts(args: { api: HammerShortsAuthorityClient; serviceClient: SupabaseClient<Database>; derivativeId: string; artifacts: Record<string, Json> }): Promise<unknown> {
  const derivative = await args.api.authorizeDerivativePreparation(args.derivativeId) as Record<string, unknown> | null;
  if (!derivative || derivative.state === "ready") return derivative;
  const childWorkpieceId = String(derivative.child_workpiece_id ?? "");
  const childRevisionId = String(derivative.child_recording_revision_id ?? "");
  if (!childWorkpieceId || !childRevisionId || !Object.keys(SHORT_ARTIFACT_FILENAMES).every((key) => Object.hasOwn(args.artifacts, key))) throw new Error("hammer_short_artifacts_invalid");
  const authority: Record<string, Json> = {};
  for (const [key, filename] of Object.entries(SHORT_ARTIFACT_FILENAMES)) {
    const path = `hammer/revisions/${childRevisionId}/${filename}`;
    const storageKey = `workpieces/${childWorkpieceId}/${path}`;
    const bytes = new TextEncoder().encode(JSON.stringify(args.artifacts[key]));
    const hash = await sha256(bytes);
    const existing = await args.serviceClient.storage.from("forge-workpieces").download(storageKey);
    if (existing.data) {
      const existingBytes = new Uint8Array(await existing.data.arrayBuffer());
      if (await sha256(existingBytes) !== hash) throw new Error("hammer_short_artifact_storage_conflict");
    } else {
      const uploaded = await args.serviceClient.storage.from("forge-workpieces").upload(storageKey, bytes, { contentType: "application/json", upsert: false });
      if (uploaded.error) throw new Error(`hammer_short_artifact_upload_failed:${uploaded.error.message}`);
    }
    const verify = await args.serviceClient.storage.from("forge-workpieces").download(storageKey);
    if (!verify.data) throw new Error("hammer_short_artifact_readback_failed");
    const verifiedBytes = new Uint8Array(await verify.data.arrayBuffer());
    if (verifiedBytes.byteLength !== bytes.byteLength || await sha256(verifiedBytes) !== hash) throw new Error("hammer_short_artifact_readback_mismatch");
    const table = args.serviceClient.schema("tongs") as unknown as { from(name: string): { upsert(row: Record<string, unknown>, options: { onConflict: string }): Promise<{ error: { message: string } | null }> } };
    const registry = await table.from("workpiece_files").upsert({ workpiece_id: childWorkpieceId, path, file_type: `hammer_short_${key}`, content_type: "application/json", bytes: bytes.byteLength, hash_algo: "sha256", hash_value: hash, storage_bucket: "forge-workpieces", storage_key: storageKey, written_by_tool: "hammer", written_by_tool_version: "short-projection-v1", written_by_lane: "forge-managed" }, { onConflict: "workpiece_id,path" });
    if (registry.error) throw new Error(`hammer_short_artifact_registry_failed:${registry.error.message}`);
    authority[key] = { path, sha256: hash, bytes: bytes.byteLength } as Json;
  }
  return args.api.finalizeDerivative(args.derivativeId, authority as Json);
}

export async function handleHammerShortsAuthorityRequest(request: Request, client: SupabaseClient<Database>, serviceClient?: SupabaseClient<Database>): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith(HAMMER_SHORTS_ROUTE_PREFIX)) return null;
  const action = url.pathname.slice(HAMMER_SHORTS_ROUTE_PREFIX.length).replace(/^\/+/, "");
  const api = new HammerShortsAuthorityClient(client);
  try {
    const body = request.method === "POST" ? await request.json() as Record<string, Json> : {};
    const get = (name: string): string => String(body[name] ?? url.searchParams.get(name) ?? "");
    let data: unknown;
    if (action === "basis/lock" && request.method === "POST") data = await api.lockBasis(body.basis as Json, get("operation_id"), get("operation_fingerprint"));
    else if (action === "basis" && request.method === "GET") data = await api.readBasis(get("parent_workpiece_id"));
    else if (action === "discovery/reserve" && request.method === "POST") data = await api.reserveDiscovery(body.request as Json, get("operation_id"), get("operation_fingerprint"));
    else if (action === "discovery/complete" && request.method === "POST") data = await api.completeDiscovery(get("discovery_id"), body.ai_proposal as Json, body.candidates as Json, get("outcome"), get("proposal_fingerprint"));
    else if (action === "discoveries" && request.method === "GET") data = await api.readDiscoveries(get("parent_workpiece_id"));
    else if (action === "candidates" && request.method === "GET") data = await api.readCandidates(get("discovery_id"));
    else if (action === "discovery/fail" && request.method === "POST") data = await api.failDiscovery(get("discovery_id"), get("failure_code"));
    else if (action === "candidate/reject" && request.method === "POST") data = await api.rejectCandidate(get("candidate_id"));
    else if (action === "derivative/reserve" && request.method === "POST") data = await api.reserveDerivative(get("candidate_id"), get("display_label"), get("operation_id"), get("operation_fingerprint"));
    else if (action === "derivative" && request.method === "GET") data = await api.readDerivative(get("candidate_id"));
    else if (action === "derivative/artifacts" && request.method === "POST" && serviceClient) data = await writeDerivativeArtifacts({ api, serviceClient, derivativeId: get("derivative_id"), artifacts: body.artifacts as Record<string, Json> });
    else if (action === "derivative/fail" && request.method === "POST") data = await api.failDerivative(get("derivative_id"), get("failure_code"));
    else if (action === "derivative/finalize" && request.method === "POST") data = await api.finalizeDerivative(get("derivative_id"), body.artifact_authority as Json);
    else return response(404, { ok: false, error: { code: "hammer_shorts_route_not_found" } });
    return response(200, { ok: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = /required|denied|42501/.test(message) ? 403 : /stale|conflict|40001/.test(message) ? 409 : 502;
    return response(status, { ok: false, error: { code: message.split(":", 1)[0], message } });
  }
}
