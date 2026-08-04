import { getWorkpieceImageMap } from "./hearth-image-map-repo";
import { tongsFetch } from "./tongs-fetch";

export type CanonicalImagePromptRevision = {
  id: string;
  revision: number;
  contentHash: string;
  imageMomentId: string;
  imageMapRevisionId: string;
  imageMapRevision: number;
  scriptApprovalId: string;
  scriptApprovalRevision: number;
  creatorDirection: string;
  visualBrief: Record<string, unknown>;
  aiSynthesizedPrompt: string;
  finalPrompt: string;
  promptSource: "ai_derived" | "creator_edited";
};

export type CanonicalImagePromptReadback = {
  revision: CanonicalImagePromptRevision;
  sequenceRevision: number;
};

type PromptApiResult<T> = { ok: true; data: T } | { ok: false; status: number; code: string; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeCanonical(value: unknown): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Canonical prompt intent contains a non-finite number.");
    return value;
  }
  if (Array.isArray(value)) return value.map(normalizeCanonical);
  if (isRecord(value)) {
    return Object.fromEntries(Object.keys(value).sort().flatMap((key) => (
      typeof value[key] === "undefined" ? [] : [[key, normalizeCanonical(value[key])]]
    )));
  }
  throw new Error("Canonical prompt intent contains an unsupported value.");
}

async function sha256Canonical(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(normalizeCanonical(value)));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (part) => part.toString(16).padStart(2, "0")).join("");
}

async function readJson(response: Response): Promise<unknown> {
  try { return await response.json(); } catch { return null; }
}

function apiFailure(response: Response, body: unknown, fallback: string): PromptApiResult<never> {
  const error = isRecord(body) && isRecord(body.error) ? body.error : null;
  const details = isRecord(error?.details) ? error.details : null;
  const invalidFields = Array.isArray(details?.invalid_fields) ? details.invalid_fields.filter((value): value is string => typeof value === "string") : [];
  const message = readString(error?.message) ?? fallback;
  return {
    ok: false,
    status: response.status,
    code: readString(error?.code) ?? "image_prompt_request_failed",
    error: invalidFields.length ? `${message} Invalid fields: ${invalidFields.join(", ")}.` : message,
  };
}

function normalizeRevision(value: unknown): CanonicalImagePromptRevision | null {
  if (!isRecord(value)) return null;
  const id = readString(value.id);
  const contentHash = readString(value.content_hash);
  const imageMomentId = readString(value.image_moment_id);
  const imageMapRevisionId = readString(value.image_map_revision_id);
  const scriptApprovalId = readString(value.script_approval_id);
  const creatorDirection = readString(value.creator_direction);
  const aiSynthesizedPrompt = readString(value.ai_synthesized_prompt);
  const finalPrompt = readString(value.final_prompt);
  const promptSource = value.prompt_source;
  const revision = Number(value.revision);
  const imageMapRevision = Number(value.image_map_revision);
  const scriptApprovalRevision = Number(value.script_approval_revision);
  if (!id || !contentHash || !imageMomentId || !imageMapRevisionId || !scriptApprovalId || !creatorDirection || !aiSynthesizedPrompt || !finalPrompt || !isRecord(value.visual_brief_json) || !Number.isInteger(revision) || !Number.isInteger(imageMapRevision) || !Number.isInteger(scriptApprovalRevision) || (promptSource !== "ai_derived" && promptSource !== "creator_edited")) return null;
  return { id, revision, contentHash, imageMomentId, imageMapRevisionId, imageMapRevision, scriptApprovalId, scriptApprovalRevision, creatorDirection, visualBrief: value.visual_brief_json, aiSynthesizedPrompt, finalPrompt, promptSource };
}

function normalizeReadback(value: unknown): CanonicalImagePromptReadback | null {
  if (!isRecord(value)) return null;
  const revision = normalizeRevision(value.prompt_revision);
  const sequenceRevision = isRecord(value.sequence) ? Number(value.sequence.current_prompt_revision) : revision?.revision;
  return revision && Number.isInteger(sequenceRevision) && sequenceRevision === revision.revision ? { revision, sequenceRevision } : null;
}

export async function readCurrentCanonicalImagePrompt(args: { workpieceId: string; workspaceId: string; imageMomentId: string }): Promise<PromptApiResult<CanonicalImagePromptReadback | null>> {
  const response = await tongsFetch(`/tongs/workpieces/${encodeURIComponent(args.workpieceId)}/image-prompts/current`, { method: "POST", json: { workspace_id: args.workspaceId, image_moment_id: args.imageMomentId } });
  const body = await readJson(response);
  if (!response.ok) return apiFailure(response, body, "Tongs could not read the canonical image prompt.");
  if (!isRecord(body) || body.ok !== true) return { ok: false, status: response.status, code: "invalid_prompt_readback", error: "Tongs returned an invalid image-prompt readback." };
  if (body.data === null) return { ok: true, data: null };
  const data = normalizeReadback(body.data);
  return data ? { ok: true, data } : { ok: false, status: response.status, code: "invalid_prompt_readback", error: "Tongs returned a malformed image-prompt revision." };
}

export async function interpretCanonicalImagePrompt(args: { workpieceId: string; workspaceId: string; imageMomentId: string; sourceContext: Record<string, unknown>; creatorDirection: string; style: string | null }): Promise<PromptApiResult<CanonicalImagePromptRevision>> {
  const imageMap = await getWorkpieceImageMap(args.workpieceId);
  if (!imageMap.ok) return { ok: false, status: imageMap.status, code: imageMap.code ?? "image_map_read_failed", error: imageMap.error ?? "Canonical image-map authority could not be read." };
  const authority = imageMap.imageMap;
  if (authority.authoritySource !== "canonical" || !authority.revisionId || !authority.revision || !authority.sourceScriptApprovalId || !authority.sourceScriptApprovalRevision) return { ok: false, status: 409, code: "canonical_image_map_required", error: "The current image moment is not bound to a canonical image-map and approved-script revision." };
  const current = await readCurrentCanonicalImagePrompt({ workpieceId: args.workpieceId, workspaceId: args.workspaceId, imageMomentId: args.imageMomentId });
  if (!current.ok) return current;
  const expectedId = current.data?.revision.id ?? null;
  const expectedRevision = current.data?.revision.revision ?? 0;
  const contracts = { interpretation: "forge.image-prompt-interpretation.v2", validator: "forge.image-prompt-validator.v1", synthesis: "forge.image-prompt-synthesis.v3" };
  const intent = { workspace_id: args.workspaceId, workpiece_id: args.workpieceId, image_moment_id: args.imageMomentId, image_map_revision_id: authority.revisionId, script_approval_id: authority.sourceScriptApprovalId, expected_prompt_revision_id: expectedId, expected_prompt_revision: expectedRevision, source_context: args.sourceContext, creator_direction: args.creatorDirection, style: args.style, contracts };
  const fingerprint = await sha256Canonical(intent);
  const operationId = `forge:image-prompt:interpret:${fingerprint}`;
  const response = await tongsFetch(`/tongs/workpieces/${encodeURIComponent(args.workpieceId)}/image-prompts/interpret`, { method: "POST", json: { workspace_id: args.workspaceId, image_moment_id: args.imageMomentId, image_map_revision_id: authority.revisionId, script_approval_id: authority.sourceScriptApprovalId, expected_prompt_revision_id: expectedId, expected_prompt_revision: expectedRevision, operation_id: operationId, operation_fingerprint: fingerprint, source_context: args.sourceContext, creator_direction: args.creatorDirection, style: args.style } });
  const body = await readJson(response);
  if (!response.ok) return apiFailure(response, body, "Tongs could not interpret this image moment.");
  const revision = isRecord(body) && isRecord(body.data) ? normalizeRevision(body.data.prompt_revision) : null;
  if (!revision) return { ok: false, status: response.status, code: "invalid_prompt_commit", error: "Tongs did not return a committed image-prompt revision." };
  const readback = await readCurrentCanonicalImagePrompt({ workpieceId: args.workpieceId, workspaceId: args.workspaceId, imageMomentId: args.imageMomentId });
  if (!readback.ok) return readback;
  if (!readback.data || readback.data.revision.id !== revision.id || readback.data.revision.contentHash !== revision.contentHash) return { ok: false, status: 409, code: "prompt_readback_mismatch", error: "Canonical prompt readback did not match the committed interpretation." };
  return { ok: true, data: readback.data.revision };
}

export async function editCanonicalImagePrompt(args: { workpieceId: string; workspaceId: string; current: CanonicalImagePromptRevision; finalPrompt: string }): Promise<PromptApiResult<CanonicalImagePromptRevision>> {
  const intent = { workspace_id: args.workspaceId, workpiece_id: args.workpieceId, image_moment_id: args.current.imageMomentId, expected_prompt_revision_id: args.current.id, expected_prompt_revision: args.current.revision, final_prompt: args.finalPrompt, operation_type: "creator_edit" };
  const fingerprint = await sha256Canonical(intent);
  const response = await tongsFetch(`/tongs/workpieces/${encodeURIComponent(args.workpieceId)}/image-prompts/edit`, { method: "POST", json: { workspace_id: args.workspaceId, image_moment_id: args.current.imageMomentId, expected_prompt_revision_id: args.current.id, expected_prompt_revision: args.current.revision, final_prompt: args.finalPrompt, operation_id: `forge:image-prompt:edit:${fingerprint}`, operation_fingerprint: fingerprint } });
  const body = await readJson(response);
  if (!response.ok) return apiFailure(response, body, "Tongs could not save the canonical image prompt.");
  const revision = isRecord(body) && isRecord(body.data) ? normalizeRevision(body.data.prompt_revision) : null;
  if (!revision) return { ok: false, status: response.status, code: "invalid_prompt_edit", error: "Tongs did not return a committed creator-edit revision." };
  const readback = await readCurrentCanonicalImagePrompt({ workpieceId: args.workpieceId, workspaceId: args.workspaceId, imageMomentId: args.current.imageMomentId });
  if (!readback.ok) return readback;
  if (!readback.data || readback.data.revision.id !== revision.id || readback.data.revision.finalPrompt !== args.finalPrompt) return { ok: false, status: 409, code: "prompt_readback_mismatch", error: "Canonical prompt readback did not match the creator edit." };
  return { ok: true, data: readback.data.revision };
}
