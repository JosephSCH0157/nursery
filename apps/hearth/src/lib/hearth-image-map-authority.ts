import type { EpisodeImageMapEntry } from "./episode-package-v2";
import {
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

export async function repairWorkpieceImageMapAuthority(args: {
  workpieceId: string;
  workspaceId: string;
}): Promise<SaveWorkpieceImageMapResult> {
  const response = await tongsFetch(`/tongs/workpieces/${encodeURIComponent(args.workpieceId)}/image-map/repair`, {
    method: "POST",
    json: {
      workspace_id: args.workspaceId,
      operation_id: `forge:image-map:repair:${crypto.randomUUID()}`,
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
