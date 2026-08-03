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
};

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
  return { ok: false, status: response.status, code: string(row?.code) ?? "broll_v2_request_failed", error: string(row?.message) ?? string(row?.error) ?? fallback };
}

async function rpc(name: string, args: JsonRecord): Promise<Result<unknown>> {
  const response = await postgrest(`rpc/${name}`, { method: "POST", body: JSON.stringify(args) });
  const body = await json(response);
  return response.ok ? { ok: true, data: body } : failure(response, body, `Tongs RPC ${name} failed.`);
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

async function signedAssetUrl(bucket: string | null, key: string | null): Promise<string | null> {
  if (!bucket || !key) return null;
  const base = runtimeEnv("VITE_SUPABASE_URL");
  const anon = runtimeEnv("VITE_SUPABASE_ANON_KEY");
  const accessToken = await resolveTongsUserAccessToken();
  if (!base || !anon || !accessToken) return null;
  const response = await fetch(`${base}/storage/v1/object/sign/${encodeURIComponent(bucket)}/${key.split("/").map(encodeURIComponent).join("/")}`, {
    method: "POST", headers: { apikey: anon, authorization: `Bearer ${accessToken}`, "content-type": "application/json" }, body: JSON.stringify({ expiresIn: 3600 }),
  });
  const body = await json(response);
  const signed = record(body) ? string(body.signedURL) ?? string(body.signedUrl) : null;
  return signed && base ? (signed.startsWith("http") ? signed : `${base}/storage/v1${signed}`) : null;
}

async function readCanonicalAssetDataUrl(workpieceId: string, storageKey: string | null, mimeType: string): Promise<string | null> {
  if (!storageKey) return null;
  const prefix = `workpieces/${workpieceId}/`;
  const path = storageKey.startsWith(prefix) ? storageKey.slice(prefix.length) : storageKey;
  const response = await tongsFetch(`/tongs/workpieces/${encodeURIComponent(workpieceId)}/read-file?path=${encodeURIComponent(path)}&encoding=base64`, { method: "GET" });
  const body = await json(response);
  const data = record(body) && record(body.data) ? body.data : null;
  const bytes = string(data?.bytes_base64);
  return response.ok && bytes ? `data:${string(data?.content_type) ?? mimeType};base64,${bytes}` : null;
}

function mapCandidate(row: JsonRecord, videoUrl: string | null, posterUrl: string | null): EpisodeBrollAssetCandidate {
  return {
    asset_id: string(row.id) ?? "",
    source: (string(row.source_kind) as EpisodeBrollAssetCandidate["source"]) ?? "upload",
    source_beat_id: string(row.beat_id) ?? "",
    label: `${string(row.provider) ?? "Verified"} clip`,
    uri: videoUrl,
    path: string(row.asset_path),
    preview_path: posterUrl,
    thumbnail_path: posterUrl,
    mime_type: string(row.mime_type),
    ingest_status: "ready",
    ingest_error: null,
    source_url: string(row.source_url),
    asset_category: "uploaded_video",
    created_at: string(row.created_at) ?? new Date(0).toISOString(),
  };
}

export async function readCanonicalBrollV2(args: { workspaceId: string; workpieceId: string }): Promise<Result<CanonicalBrollV2State>> {
  const read = await rpc("read_current_broll_plan", { p_workspace_id: args.workspaceId, p_workpiece_id: args.workpieceId });
  if (!read.ok) return read;
  if (read.data === null) return { ok: true, data: { plan: null, planRevisionId: null, planRevision: 0, selectionRevision: 0, scriptApprovalId: null } };
  if (!record(read.data) || !record(read.data.sequence) || !record(read.data.plan_revision) || !Array.isArray(read.data.beats)) return { ok: false, status: 502, code: "invalid_broll_readback", error: "Tongs returned malformed B-roll V2 state." };
  const candidateResponse = await postgrest(`broll_candidate_revisions?workpiece_id=eq.${encodeURIComponent(args.workpieceId)}&select=*`);
  const candidateBody = await json(candidateResponse);
  if (!candidateResponse.ok || !Array.isArray(candidateBody)) return failure(candidateResponse, candidateBody, "Canonical B-roll candidates could not be read.");
  const assetIds = Array.from(new Set(candidateBody.flatMap((value) => record(value) ? [string(value.asset_id), string(value.poster_asset_id)].filter((id): id is string => !!id) : [])));
  let assets: JsonRecord[] = [];
  if (assetIds.length) {
    const assetResponse = await postgrest(`assets?id=in.(${assetIds.join(",")})&select=id,storage_bucket,storage_key`);
    const assetBody = await json(assetResponse);
    if (!assetResponse.ok || !Array.isArray(assetBody)) return failure(assetResponse, assetBody, "Canonical B-roll assets could not be read.");
    assets = assetBody.filter(record);
  }
  const assetById = new Map(assets.map((asset) => [string(asset.id), asset]));
  const mappedCandidates = await Promise.all(candidateBody.filter(record).map(async (candidate) => {
    const video = assetById.get(string(candidate.asset_id));
    const poster = assetById.get(string(candidate.poster_asset_id));
    const videoKey = string(video?.storage_key);
    const posterKey = string(poster?.storage_key);
    const videoUrl = await signedAssetUrl(string(video?.storage_bucket), videoKey)
      ?? await readCanonicalAssetDataUrl(args.workpieceId, videoKey, string(candidate.mime_type) ?? "video/mp4");
    const posterUrl = await signedAssetUrl(string(poster?.storage_bucket), posterKey)
      ?? await readCanonicalAssetDataUrl(args.workpieceId, posterKey, "image/jpeg");
    return mapCandidate(candidate, videoUrl, posterUrl);
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
      id: beatId, workpiece_id: args.workpieceId,
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
  return { ok: true, data: {
    plan: { id: string(planRevision.id) ?? "canonical-broll-v2", workpiece_id: args.workpieceId, version: integer(planRevision.revision, 1), beats, coverage_strength: "low", generated_at: string(planRevision.created_at) ?? new Date(0).toISOString() },
    planRevisionId: string(planRevision.id), planRevision: integer(planRevision.revision), selectionRevision: integer(sequence.current_selection_revision), scriptApprovalId: string(planRevision.script_approval_id),
  } };
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
