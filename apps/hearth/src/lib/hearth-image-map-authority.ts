import type { EpisodeImageMapEntry } from "./episode-package-v2";
import {
  getWorkpieceImageMap,
  normalizeWorkpieceImageMapView,
  type SaveWorkpieceImageMapResult,
} from "./hearth-image-map-repo";
import { tongsFetch } from "./tongs-fetch";

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function readApiErrorMessage(body: unknown): string | null {
  if (!isRecord(body) || !isRecord(body.error)) return null;
  const message = readString(body.error.message);
  const details = isRecord(body.error.details) ? body.error.details : null;
  const reason = details ? readString(details.reason) : null;
  if (message && reason && !message.includes(reason)) {
    return `${message} (${reason})`;
  }
  return message ?? reason ?? null;
}

async function readBodyAsJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function buildRepairOperationId(parts: readonly (string | number)[]): Promise<string> {
  const bytes = new TextEncoder().encode(parts.join("\u001f"));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
  return `forge:image-map:repair:${hex}`;
}

async function readCurrentScriptApproval(workpieceId: string): Promise<
  | { ok: true; id: string; revision: number }
  | { ok: false; status: number; error: string }
> {
  const response = await tongsFetch(`/tongs/workpieces/${encodeURIComponent(workpieceId)}/script-approval`, { method: "GET" });
  const body = await readBodyAsJson(response);
  if (!response.ok || !isRecord(body) || body.ok !== true || !isRecord(body.data) || !isRecord(body.data.current_approval)) {
    return { ok: false, status: response.status, error: readApiErrorMessage(body) ?? "Canonical script approval state could not be read." };
  }
  const id = readString(body.data.current_approval.id);
  const revision = Number(body.data.current_approval.approval_revision ?? body.data.current_revision);
  return id && Number.isInteger(revision) && revision > 0
    ? { ok: true, id, revision }
    : { ok: false, status: response.status, error: "Canonical script approval state was malformed." };
}

export async function repairWorkpieceImageMapAuthority(args: {
  workpieceId: string;
  workspaceId: string;
  entryId?: string;
}): Promise<SaveWorkpieceImageMapResult> {
  const [currentImageMap, currentApproval] = await Promise.all([
    getWorkpieceImageMap(args.workpieceId),
    readCurrentScriptApproval(args.workpieceId),
  ]);
  if (!currentImageMap.ok) return { ok: false, status: currentImageMap.status, reason: currentImageMap.status === 409 ? "conflict" : "request_failed", ...(currentImageMap.error ? { error: currentImageMap.error } : {}) };
  if (!currentApproval.ok) return { ok: false, status: currentApproval.status, reason: currentApproval.status === 409 ? "conflict" : "request_failed", error: currentApproval.error };
  const source = currentImageMap.imageMap;
  if (!source.revisionId || !source.revision || source.authoritySource !== "canonical") {
    return { ok: false, status: 409, reason: "conflict", error: "Canonical image-plan revision is not ready for repair." };
  }
  const sourceEntry = args.entryId ? source.entries.find((entry) => entry.id === args.entryId) : null;
  if (args.entryId && !sourceEntry) return { ok: false, status: 404, reason: "request_failed", error: "Image moment was not found in the canonical image plan." };
  const operationId = await buildRepairOperationId([
    "exact-display-anchor-v2",
    args.workspaceId,
    args.workpieceId,
    args.entryId ?? "all",
    source.revisionId,
    source.revision,
    currentApproval.id,
    currentApproval.revision,
  ]);
  const response = await tongsFetch(`/tongs/workpieces/${encodeURIComponent(args.workpieceId)}/image-map/repair`, {
    method: "POST",
    json: {
      workspace_id: args.workspaceId,
      ...(args.entryId ? { entry_id: args.entryId } : {}),
      expected_current_revision: source.revision,
      expected_current_revision_id: source.revisionId,
      expected_script_approval_id: currentApproval.id,
      expected_script_approval_revision: currentApproval.revision,
      operation_id: operationId,
    },
  });
  const body = await readBodyAsJson(response);
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      reason: response.status === 409 ? "conflict" : "request_failed",
      error: readApiErrorMessage(body) ?? undefined,
    };
  }
  const imageMap = normalizeWorkpieceImageMapView(body, {
    workpieceId: args.workpieceId,
    workspaceId: args.workspaceId,
  });
  if (!imageMap) return { ok: false, status: response.status, reason: "invalid_response" };
  const repairedEntry = args.entryId ? imageMap.entries.find((entry) => entry.id === args.entryId) : null;
  if (
    imageMap.authoritySource !== "canonical"
    || imageMap.sourceScriptApprovalId !== currentApproval.id
    || imageMap.sourceScriptApprovalRevision !== currentApproval.revision
    || (args.entryId ? repairedEntry?.canonical_anchor_assessment?.state !== "current" : imageMap.entries.some((entry) => entry.canonical_anchor_assessment?.state !== "current"))
  ) {
    return {
      ok: false,
      status: 502,
      reason: "invalid_response",
      error: `Tongs did not return a canonically verified image-moment repair (authority=${imageMap.authoritySource ?? "missing"}, approval=${imageMap.sourceScriptApprovalId ?? "missing"}@${imageMap.sourceScriptApprovalRevision ?? "missing"}, anchor=${repairedEntry?.canonical_anchor_assessment?.state ?? "missing"}).`,
    };
  }
  const beforeAssets = source.entries.map((entry) => ({ id: entry.id, candidates: entry.candidate_assets.map((candidate) => candidate.asset_id), selected: entry.selected_asset_id }));
  const afterAssets = imageMap.entries.map((entry) => ({ id: entry.id, candidates: entry.candidate_assets.map((candidate) => candidate.asset_id), selected: entry.selected_asset_id }));
  if (JSON.stringify(beforeAssets) !== JSON.stringify(afterAssets)) {
    return { ok: false, status: 502, reason: "invalid_response", error: "Image-moment repair changed existing candidates or selection." };
  }
  return { ok: true, imageMap };
}

export async function resolveWorkpieceImageMapManualAnchorAuthority(args: {
  workpieceId: string;
  workspaceId: string;
  entryId: string;
  scriptAnchor: EpisodeImageMapEntry["script_anchor"];
}): Promise<SaveWorkpieceImageMapResult> {
  if (!args.scriptAnchor) {
    return {
      ok: false,
      status: 400,
      reason: "request_failed",
      error: "An exact script anchor is required.",
    };
  }
  const response = await tongsFetch(`/tongs/workpieces/${encodeURIComponent(args.workpieceId)}/image-map/manual-anchor`, {
    method: "POST",
    json: {
      workspace_id: args.workspaceId,
      entry_id: args.entryId,
      script_anchor: args.scriptAnchor,
      operation_id: `forge:image-map:manual:${crypto.randomUUID()}`,
    },
  });
  const body = await readBodyAsJson(response);
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      reason: response.status === 409 ? "conflict" : "request_failed",
      error: readApiErrorMessage(body) ?? undefined,
    };
  }
  const imageMap = normalizeWorkpieceImageMapView(body, {
    workpieceId: args.workpieceId,
    workspaceId: args.workspaceId,
  });
  return imageMap
    ? { ok: true, imageMap }
    : { ok: false, status: response.status, reason: "invalid_response" };
}
