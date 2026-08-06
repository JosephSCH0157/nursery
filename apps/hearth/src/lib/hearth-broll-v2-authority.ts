import type { EpisodeBrollAssetCandidate, EpisodeBrollPlan, EpisodeBrollPlanBeat } from "./episode-package-v2";
import { resolveTongsUserAccessToken, tongsFetch } from "./tongs-fetch";

type JsonRecord = Record<string, unknown>;
type Result<T> = { ok: true; data: T } | { ok: false; status: number; code: string; error: string };

export type CanonicalBrollV2State = {
  plan: EpisodeBrollPlan | null;
  planRevisionId: string | null;
  planRevision: number;
  selectionRevision: number;
  scriptApprovalId: string | null;
  promptsByBeat: Record<string, CanonicalBrollPromptState>;
};

export type CanonicalBrollPromptState = {
  status: "missing" | "current" | "creator_edited" | "stale" | "legacy_unverified";
  revisionId: string | null;
  revision: number;
  contentHash: string | null;
  creatorDirection: string;
  finalPrompt: string | null;
  motionBrief: JsonRecord | null;
  mismatchReasons: string[];
};

const EMPTY_PROMPT: CanonicalBrollPromptState = { status: "missing", revisionId: null, revision: 0, contentHash: null, creatorDirection: "", finalPrompt: null, motionBrief: null, mismatchReasons: [] };

function record(value: unknown): value is JsonRecord { return !!value && typeof value === "object" && !Array.isArray(value); }
function string(value: unknown): string | null { return typeof value === "string" && value.trim() ? value.trim() : null; }
function integer(value: unknown, fallback = 0): number { const parsed = Number(value); return Number.isInteger(parsed) ? parsed : fallback; }
function assetCategory(value: unknown): EpisodeBrollPlanBeat["asset_category"] {
  const parsed = string(value);
  return parsed === "stock_video" || parsed === "ai_video" || parsed === "uploaded_video"
    || parsed === "animated_chart" || parsed === "animated_graphic" || parsed === "timeline_graphic"
    || parsed === "map_animation" || parsed === "stat_card" ? parsed : "uploaded_video";
}

function runtimeEnv(name: string): string | null {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
  return string(env?.[name]);
}

async function canonicalHash(value: unknown): Promise<string> {
  const normalize = (input: unknown): unknown => {
    if (input === null || typeof input === "string" || typeof input === "boolean" || typeof input === "number") return input;
    if (Array.isArray(input)) return input.map(normalize);
    if (record(input)) return Object.fromEntries(Object.keys(input).sort().flatMap((key) => typeof input[key] === "undefined" ? [] : [[key, normalize(input[key])]]));
    return String(input);
  };
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(normalize(value))));
  return Array.from(new Uint8Array(digest), (part) => part.toString(16).padStart(2, "0")).join("");
}

async function postgrest(path: string, init: RequestInit = {}): Promise<Response> {
  const url = runtimeEnv("VITE_SUPABASE_URL");
  const anon = runtimeEnv("VITE_SUPABASE_ANON_KEY");
  const accessToken = await resolveTongsUserAccessToken();
  if (!url || !anon || !accessToken) return new Response(JSON.stringify({ message: "Authenticated Tongs access is unavailable." }), { status: 401 });
  const headers = new Headers(init.headers);
  headers.set("apikey", anon);
  headers.set("authorization", `Bearer ${accessToken}`);
  headers.set("accept-profile", "tongs");
  headers.set("content-profile", "tongs");
  if (!headers.has("content-type")) headers.set("content-type", "application/json");
  return fetch(`${url}/rest/v1/${path}`, { ...init, headers });
}

async function json(response: Response): Promise<unknown> { try { return await response.json(); } catch { return null; } }
function failure(response: Response, body: unknown, fallback: string): Result<never> {
  const row = record(body) ? body : null;
  const nested = record(row?.error) ? row.error : null;
  return { ok: false, status: response.status, code: string(nested?.code) ?? string(row?.code) ?? "broll_v2_request_failed", error: string(nested?.message) ?? string(row?.message) ?? (typeof row?.error === "string" ? string(row.error) : null) ?? fallback };
}

async function rpc(name: string, args: JsonRecord): Promise<Result<unknown>> {
  const response = await postgrest(`rpc/${name}`, { method: "POST", body: JSON.stringify(args) });
  const body = await json(response);
  return response.ok ? { ok: true, data: body } : failure(response, body, `Tongs RPC ${name} failed.`);
}

function mapPromptStatus(value: unknown): CanonicalBrollPromptState {
  if (!record(value)) return EMPTY_PROMPT;
  const prompt = record(value.prompt_revision) ? value.prompt_revision : null;
  const sequence = record(value.sequence) ? value.sequence : null;
  const rawStatus = string(value.status);
  const status = rawStatus === "current" || rawStatus === "creator_edited" || rawStatus === "stale" || rawStatus === "legacy_unverified" ? rawStatus : "missing";
  return {
    status,
    revisionId: string(prompt?.id), revision: integer(prompt?.revision), contentHash: string(prompt?.content_hash),
    creatorDirection: string(sequence?.creator_direction) ?? string(prompt?.creator_direction) ?? "",
    finalPrompt: string(prompt?.final_prompt), motionBrief: record(prompt?.motion_brief_json) ? prompt.motion_brief_json : null,
    mismatchReasons: Array.isArray(value.mismatch_reasons) ? value.mismatch_reasons.flatMap((reason) => string(reason) ? [string(reason)!] : []) : [],
  };
}

export async function readCanonicalBrollPromptStatus(args: { workspaceId: string; workpieceId: string; beatId: string }): Promise<Result<CanonicalBrollPromptState>> {
  const response = await tongsFetch(`/tongs/workpieces/${encodeURIComponent(args.workpieceId)}/broll-v2/prompt-status`, { method: "POST", json: { workspace_id: args.workspaceId, beat_id: args.beatId } });
  const body = await json(response);
  if (!response.ok) return failure(response, body, "Tongs could not read the canonical motion prompt.");
  const data = record(body) && record(body.data) ? body.data : body;
  return { ok: true, data: mapPromptStatus(data) };
}

async function currentActorId(): Promise<string | null> {
  const token = await resolveTongsUserAccessToken();
  if (!token) return null;
  try {
    const encoded = token.split(".")[1]!.replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, "="))) as JsonRecord;
    return string(payload.sub);
  } catch { return null; }
}

async function canonicalMediaUrl(workpieceId: string, storageKey: string | null): Promise<string | null> {
  if (!storageKey) return null;
  const prefix = `workpieces/${workpieceId}/`;
  const path = storageKey.startsWith(prefix) ? storageKey.slice(prefix.length) : storageKey;
  const response = await tongsFetch(`/tongs/workpieces/${encodeURIComponent(workpieceId)}/media-url?path=${encodeURIComponent(path)}`, { method: "GET" });
  const body = await json(response);
  const data = record(body) && record(body.data) ? body.data : null;
  return response.ok ? string(data?.url) : null;
}

export function mapCanonicalBrollCandidate(row: JsonRecord, videoUrl: string | null, posterUrl: string | null): EpisodeBrollAssetCandidate {
  const source = (string(row.source_kind) as EpisodeBrollAssetCandidate["source"]) ?? "upload";
  return {
    asset_id: string(row.id) ?? "",
    source,
    source_beat_id: string(row.beat_id) ?? "",
    label: `${string(row.provider) ?? "Verified"} clip`,
    uri: videoUrl,
    path: string(row.asset_path),
    preview_path: posterUrl,
    thumbnail_path: posterUrl,
    mime_type: string(row.mime_type),
    duration_ms: integer(row.duration_ms),
    ingest_status: "ready",
    ingest_error: null,
    source_url: string(row.source_url),
    asset_category: source === "generated" ? "ai_video" : "uploaded_video",
    created_at: string(row.created_at) ?? new Date(0).toISOString(),
  };
}

export async function readCanonicalBrollV2(args: { workspaceId: string; workpieceId: string }): Promise<Result<CanonicalBrollV2State>> {
  const read = await rpc("read_current_broll_plan", { p_workspace_id: args.workspaceId, p_workpiece_id: args.workpieceId });
  if (!read.ok) return read;
  if (read.data === null) return { ok: true, data: { plan: null, planRevisionId: null, planRevision: 0, selectionRevision: 0, scriptApprovalId: null, promptsByBeat: {} } };
  if (!record(read.data) || !record(read.data.sequence) || !record(read.data.plan_revision) || !Array.isArray(read.data.beats)) return { ok: false, status: 502, code: "invalid_broll_readback", error: "Tongs returned malformed B-roll V2 state." };
  const projectedCandidates = read.data.beats.flatMap((entry) => record(entry) && Array.isArray(entry.candidate_revisions) ? entry.candidate_revisions : []);
  let canonicalCandidates: Array<{ candidate: JsonRecord; video: JsonRecord | null; poster: JsonRecord | null }> = projectedCandidates.flatMap((entry) => {
    if (!record(entry) || !record(entry.candidate_revision)) return [];
    return [{ candidate: entry.candidate_revision, video: record(entry.video_asset) ? entry.video_asset : null, poster: record(entry.poster_asset) ? entry.poster_asset : null }];
  });
  const hasProjectedCandidateContract = read.data.beats.every((entry) => record(entry) && Array.isArray(entry.candidate_revisions));
  if (!hasProjectedCandidateContract) {
    const candidateResponse = await postgrest(`broll_candidate_revisions?workpiece_id=eq.${encodeURIComponent(args.workpieceId)}&select=*`);
    const candidateBody = await json(candidateResponse);
    if (!candidateResponse.ok || !Array.isArray(candidateBody)) return failure(candidateResponse, candidateBody, "Canonical B-roll candidates could not be read.");
    const candidates = candidateBody.filter(record);
    const assetIds = Array.from(new Set(candidates.flatMap((value) => [string(value.asset_id), string(value.poster_asset_id)].filter((id): id is string => !!id))));
    let assets: JsonRecord[] = [];
    if (assetIds.length) {
      const assetResponse = await postgrest(`assets?id=in.(${assetIds.join(",")})&select=id,storage_bucket,storage_key`);
      const assetBody = await json(assetResponse);
      if (!assetResponse.ok || !Array.isArray(assetBody)) return failure(assetResponse, assetBody, "Canonical B-roll assets could not be read.");
      assets = assetBody.filter(record);
    }
    const assetById = new Map(assets.map((asset) => [string(asset.id), asset]));
    canonicalCandidates = candidates.map((candidate) => ({ candidate, video: assetById.get(string(candidate.asset_id)) ?? null, poster: assetById.get(string(candidate.poster_asset_id)) ?? null }));
  }
  const mappedCandidates = await Promise.all(canonicalCandidates.map(async ({ candidate, video, poster }) => {
    const videoKey = string(video?.storage_key);
    const posterKey = string(poster?.storage_key);
    const videoUrl = await canonicalMediaUrl(args.workpieceId, videoKey);
    const posterUrl = await canonicalMediaUrl(args.workpieceId, posterKey);
    return mapCanonicalBrollCandidate(candidate, videoUrl, posterUrl);
  }));
  const candidatesByBeat = new Map<string, EpisodeBrollAssetCandidate[]>();
  for (const candidate of mappedCandidates) {
    const beatId = candidate.source_beat_id;
    if (!beatId) continue;
    candidatesByBeat.set(beatId, [...(candidatesByBeat.get(beatId) ?? []), candidate]);
  }
  const beats: EpisodeBrollPlanBeat[] = read.data.beats.flatMap((entry) => {
    if (!record(entry) || !record(entry.beat_revision) || !record(entry.membership)) return [];
    const beat = entry.beat_revision;
    const prompt = record(entry.prompt_revision) ? entry.prompt_revision : null;
    const selected = record(entry.selected_candidate_revision) ? entry.selected_candidate_revision : null;
    const beatId = string(beat.beat_id);
    if (!beatId) return [];
    const assessment = record(beat.canonical_anchor_assessment) ? beat.canonical_anchor_assessment : null;
    const exact = record(assessment?.exact_anchor) ? assessment.exact_anchor : null;
    const candidates = candidatesByBeat.get(beatId) ?? [];
    return [{
      id: beatId, canonical_revision_id: string(beat.id), workpiece_id: args.workpieceId,
      anchor_text: string(exact?.span_text) ?? string(beat.context_focus) ?? "Script-bound beat",
      description: string(beat.narrative_purpose) ?? string(beat.context_focus) ?? "B-roll coverage",
      purpose: "coverage",
      motion_intent: (string(beat.motion_intent) as EpisodeBrollPlanBeat["motion_intent"]) ?? "broll",
      asset_category: assetCategory(beat.asset_category), priority: "supporting", keywords: [],
      mood: string(beat.mood_pacing), shot_type: (string(beat.shot_type) as EpisodeBrollPlanBeat["shot_type"]) ?? "mixed",
      motion_suggestion: prompt ? string(prompt.final_prompt) : null,
      suggested_duration_ms: integer(beat.duration_target_ms, 4000), placement_hint: (string(beat.placement_hint) as EpisodeBrollPlanBeat["placement_hint"]) ?? "first_occurrence",
      source_type: "planned", candidate_assets: candidates, selected_asset_id: string(selected?.id),
      fulfillment_state: selected ? "resolved" : candidates.length ? "candidate_assets_available" : "unresolved",
      origin: "hearth", external_request: null, data_visual_spec: null,
      created_at: string(beat.created_at) ?? new Date(0).toISOString(), updated_at: string(beat.created_at) ?? new Date(0).toISOString(),
    } satisfies EpisodeBrollPlanBeat];
  });
  const planRevision = read.data.plan_revision;
  const sequence = read.data.sequence;
  const promptEntries = await Promise.all(beats.map(async (beat) => [beat.id, await readCanonicalBrollPromptStatus({ ...args, beatId: beat.id })] as const));
  const failedPrompt = promptEntries.find(([, result]) => !result.ok);
  if (failedPrompt && !failedPrompt[1].ok) return failedPrompt[1];
  const promptsByBeat = Object.fromEntries(promptEntries.map(([beatId, result]) => [beatId, result.ok ? result.data : EMPTY_PROMPT]));
  return { ok: true, data: {
    plan: { id: string(planRevision.id) ?? "canonical-broll-v2", workpiece_id: args.workpieceId, version: integer(planRevision.revision, 1), beats, coverage_strength: "low", generated_at: string(planRevision.created_at) ?? new Date(0).toISOString() },
    planRevisionId: string(planRevision.id), planRevision: integer(planRevision.revision), selectionRevision: integer(sequence.current_selection_revision), scriptApprovalId: string(planRevision.script_approval_id),
    promptsByBeat,
  } };
}

export async function generateCanonicalBrollPrompt(args: { workspaceId: string; workpieceId: string; beatId: string; creatorDirection: string; current: CanonicalBrollPromptState }): Promise<Result<CanonicalBrollV2State>> {
  const interpretation = "forge.broll-motion-interpretation.v1";
  const synthesis = "forge.broll-motion-synthesis.v1";
  const validator = "forge.broll-motion-validator.v1";
  const creative = await rpc("broll_current_creative_input", { p_workspace_id: args.workspaceId, p_workpiece_id: args.workpieceId, p_beat_id: args.beatId, p_creator_direction: args.creatorDirection, p_interpretation_contract_version: interpretation, p_synthesis_contract_version: synthesis });
  if (!creative.ok) return creative;
  if (!record(creative.data) || string(creative.data.disposition) !== "current" || !string(creative.data.creative_input_hash)) return { ok: false, status: 409, code: string(record(creative.data) ? creative.data.disposition : null) ?? "creative_input_unavailable", error: "Tongs could not reconstruct current B-roll creative inputs." };
  const fingerprint = await canonicalHash({ workspace_id: args.workspaceId, workpiece_id: args.workpieceId, beat_id: args.beatId, expected_prompt_revision_id: args.current.revisionId, expected_prompt_revision: args.current.revision, creator_direction: args.creatorDirection, creative_input_hash: creative.data.creative_input_hash, contracts: { interpretation, validator, synthesis } });
  const response = await tongsFetch(`/tongs/workpieces/${encodeURIComponent(args.workpieceId)}/broll-v2/prompt-interpret`, { method: "POST", json: { workspace_id: args.workspaceId, beat_id: args.beatId, expected_prompt_revision_id: args.current.revisionId, expected_prompt_revision: args.current.revision, creator_direction: args.creatorDirection, operation_id: `forge:broll:prompt:${fingerprint}`, operation_fingerprint: fingerprint } });
  const body = await json(response);
  if (!response.ok) return failure(response, body, "Tongs could not generate the canonical motion prompt.");
  return readCanonicalBrollV2({ workspaceId: args.workspaceId, workpieceId: args.workpieceId });
}

export async function editCanonicalBrollPrompt(args: { workspaceId: string; workpieceId: string; beatId: string; finalPrompt: string; current: CanonicalBrollPromptState }): Promise<Result<CanonicalBrollV2State>> {
  if (!args.current.revisionId) return { ok: false, status: 409, code: "prompt_revision_missing", error: "Generate a canonical motion prompt before editing it." };
  const fingerprint = await canonicalHash({ workspace_id: args.workspaceId, workpiece_id: args.workpieceId, beat_id: args.beatId, expected_prompt_revision_id: args.current.revisionId, expected_prompt_revision: args.current.revision, final_prompt: args.finalPrompt, operation_type: "prompt_edit" });
  const response = await tongsFetch(`/tongs/workpieces/${encodeURIComponent(args.workpieceId)}/broll-v2/prompt-edit`, { method: "POST", json: { workspace_id: args.workspaceId, beat_id: args.beatId, expected_prompt_revision_id: args.current.revisionId, expected_prompt_revision: args.current.revision, final_prompt: args.finalPrompt, operation_id: `forge:broll:prompt-edit:${fingerprint}`, operation_fingerprint: fingerprint } });
  const body = await json(response);
  if (!response.ok) return failure(response, body, "Tongs could not save the canonical motion prompt edit.");
  return readCanonicalBrollV2({ workspaceId: args.workspaceId, workpieceId: args.workpieceId });
}

export async function proposeRunwayReadyBrollPrompt(args: { workspaceId:string;workpieceId:string;beatId:string;current:CanonicalBrollPromptState }):Promise<Result<{finalPrompt:string;lengthUtf16:number}>>{
  if(!args.current.revisionId)return{ok:false,status:409,code:"prompt_revision_missing",error:"Generate a canonical motion prompt before creating a Runway-ready prompt."};
  const response=await tongsFetch(`/tongs/workpieces/${encodeURIComponent(args.workpieceId)}/broll-v2/prompt-runway-ready`,{method:"POST",json:{workspace_id:args.workspaceId,beat_id:args.beatId,expected_prompt_revision_id:args.current.revisionId,expected_prompt_revision:args.current.revision}});
  const body=await json(response);if(!response.ok)return failure(response,body,"Tongs could not create a Runway-ready prompt proposal.");
  const data=record(body)&&record(body.data)?body.data:null;const finalPrompt=string(data?.final_prompt);const length=typeof data?.prompt_length_utf16==="number"?data.prompt_length_utf16:null;
  if(!finalPrompt||length==null)return{ok:false,status:502,code:"runway_prompt_proposal_invalid",error:"Tongs returned an incomplete Runway-ready prompt proposal."};
  return{ok:true,data:{finalPrompt,lengthUtf16:length}};
}

export async function commitCanonicalBrollPlan(args: { workspaceId: string; workpieceId: string; scriptApprovalId: string; current: CanonicalBrollV2State; beats: JsonRecord[] }): Promise<Result<CanonicalBrollV2State>> {
  const actor = await currentActorId();
  if (!actor) return { ok: false, status: 401, code: "missing_actor", error: "The signed-in creator identity is unavailable." };
  const intent = { workspace_id: args.workspaceId, workpiece_id: args.workpieceId, expected_revision_id: args.current.planRevisionId, expected_revision: args.current.planRevision, script_approval_id: args.scriptApprovalId, beats: args.beats, contract: "forge.broll-source-context.v1" };
  const fingerprint = await canonicalHash(intent);
  const committed = await rpc("commit_broll_plan", { p_workspace_id: args.workspaceId, p_workpiece_id: args.workpieceId, p_expected_revision_id: args.current.planRevisionId, p_expected_revision: args.current.planRevision, p_script_approval_id: args.scriptApprovalId, p_source_context_contract_version: "forge.broll-source-context.v1", p_beats: args.beats, p_operation_id: `forge:broll:plan:${fingerprint}`, p_operation_fingerprint: fingerprint, p_actor_id: actor });
  if (!committed.ok) return committed;
  const disposition = record(committed.data) ? string(committed.data.disposition) : null;
  if (disposition !== "committed") return { ok: false, status: 409, code: disposition ?? "broll_plan_rejected", error: "Tongs rejected the canonical B-roll plan revision." };
  return readCanonicalBrollV2(args);
}

async function fileBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = ""; for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export async function acquireCanonicalBroll(args: { workspaceId: string; workpieceId: string; beatId: string; sourceKind: "upload" | "external"; file?: File; sourceUrl?: string }): Promise<Result<CanonicalBrollV2State>> {
  const bytesBase64 = args.file ? await fileBase64(args.file) : null;
  const intent = { workspace_id: args.workspaceId, workpiece_id: args.workpieceId, beat_id: args.beatId, source_kind: args.sourceKind, file_name: args.file?.name ?? null, file_size: args.file?.size ?? null, source_url: args.sourceUrl ?? null, poster_required: true };
  const fingerprint = await canonicalHash(intent);
  const response = await tongsFetch(`/tongs/workpieces/${encodeURIComponent(args.workpieceId)}/broll-v2/acquire`, { method: "POST", json: { workspace_id: args.workspaceId, beat_id: args.beatId, operation_id: `forge:broll:acquire:${fingerprint}`, operation_fingerprint: fingerprint, source_kind: args.sourceKind, bytes_base64: bytesBase64, source_url: args.sourceUrl ?? null, prompt_revision_id: null, provider: args.sourceKind === "upload" ? "creator_upload" : "external_fetch", provider_request_id: null, final_prompt: null, poster_required: true, license_json: {}, provenance_json: { initiated_by: "hearth_broll_v2" } } });
  const body = await json(response);
  if (!response.ok) return failure(response, body, "Tongs could not acquire this B-roll clip.");
  return readCanonicalBrollV2(args);
}

export async function generateCanonicalBrollVideo(args: { workspaceId: string; workpieceId: string; beatId: string; prompt: CanonicalBrollPromptState; durationSeconds?: number; ratio?: "1280:720" | "720:1280" }): Promise<Result<CanonicalBrollV2State>> {
  if (!args.prompt.revisionId || !args.prompt.contentHash || !args.prompt.finalPrompt || (args.prompt.status !== "current" && args.prompt.status !== "creator_edited")) {
    return { ok: false, status: 409, code: "broll_prompt_not_current", error: "A current canonical motion prompt is required before generating video." };
  }
  if(args.prompt.finalPrompt.length>1000)return{ok:false,status:409,code:"runway_prompt_too_long",error:`Runway Gen-4.5 accepts at most 1000 UTF-16 code units. Current canonical prompt: ${args.prompt.finalPrompt.length}. Create and confirm a Runway-ready prompt before generating video.`};
  const durationSeconds = args.durationSeconds ?? 5;
  const ratio = args.ratio ?? "1280:720";
  const intent = { workspace_id: args.workspaceId, workpiece_id: args.workpieceId, beat_id: args.beatId, source_kind: "generated", source_url: null, prompt_revision_id: args.prompt.revisionId, prompt_revision: args.prompt.revision, prompt_content_hash: args.prompt.contentHash, final_prompt: args.prompt.finalPrompt, runway_model: "gen4.5", duration_seconds: durationSeconds, ratio, poster_required: true };
  const fingerprint = await canonicalHash(intent);
  const request = { workspace_id: args.workspaceId, beat_id: args.beatId, operation_id: `forge:broll:acquire:${fingerprint}`, operation_fingerprint: fingerprint, source_kind: "generated", bytes_base64: null, source_url: null, prompt_revision_id: args.prompt.revisionId, prompt_revision: args.prompt.revision, prompt_content_hash: args.prompt.contentHash, provider: "runway", provider_request_id: null, final_prompt: args.prompt.finalPrompt, runway_model: "gen4.5", duration_seconds: durationSeconds, ratio, poster_required: true, license_json: {}, provenance_json: { initiated_by: "hearth_broll_v2", prompt_revision_id: args.prompt.revisionId, prompt_revision: args.prompt.revision, prompt_content_hash: args.prompt.contentHash } };
  const deadline = Date.now() + 15 * 60_000;
  while (Date.now() < deadline) {
    const response = await tongsFetch(`/tongs/workpieces/${encodeURIComponent(args.workpieceId)}/broll-v2/acquire`, { method: "POST", json: request });
    const body = await json(response);
    if (!response.ok) return failure(response, body, "Tongs could not generate this B-roll clip.");
    const data = record(body) && record(body.data) ? body.data : body;
    if (!record(data) || string(data.disposition) !== "provider_pending") return readCanonicalBrollV2(args);
    const retryAt = string(data.retry_at);
    const delay = retryAt ? Math.max(5_000, new Date(retryAt).getTime() - Date.now()) : 5_000;
    await new Promise((resolve) => window.setTimeout(resolve, Math.min(delay, 60_000)));
  }
  return { ok: false, status: 408, code: "runway_generation_timeout", error: "Runway generation is still pending. Refresh to resume the same operation without another paid submission." };
}

export async function selectCanonicalBrollCandidate(args: { workspaceId: string; workpieceId: string; beatId: string; candidateRevisionId: string; current: CanonicalBrollV2State }): Promise<Result<CanonicalBrollV2State>> {
  const actor = await currentActorId();
  if (!actor || !args.current.planRevisionId) return { ok: false, status: 409, code: "broll_selection_context_missing", error: "Canonical selection context is unavailable." };
  const intent = { workspace_id: args.workspaceId, workpiece_id: args.workpieceId, beat_id: args.beatId, candidate_revision_id: args.candidateRevisionId, plan_revision_id: args.current.planRevisionId, plan_revision: args.current.planRevision, selection_revision: args.current.selectionRevision };
  const fingerprint = await canonicalHash(intent);
  const selected = await rpc("select_broll_candidate", { p_workspace_id: args.workspaceId, p_workpiece_id: args.workpieceId, p_beat_id: args.beatId, p_candidate_revision_id: args.candidateRevisionId, p_expected_plan_revision_id: args.current.planRevisionId, p_expected_plan_revision: args.current.planRevision, p_expected_selection_revision: args.current.selectionRevision, p_operation_id: `forge:broll:select:${fingerprint}`, p_operation_fingerprint: fingerprint, p_actor_id: actor });
  if (!selected.ok) return selected;
  const disposition = record(selected.data) ? string(selected.data.disposition) : null;
  if (disposition !== "committed") return { ok: false, status: 409, code: disposition ?? "broll_selection_rejected", error: "Tongs rejected the B-roll selection." };
  return readCanonicalBrollV2(args);
}
