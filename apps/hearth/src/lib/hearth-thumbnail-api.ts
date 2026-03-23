import {
  buildDefaultMetadataDocument,
  createEmptyEpisodePackageV2,
  hydrateEpisodePackageV2,
  mirrorEpisodePackageV2ToLegacy,
  type EpisodePackageV2,
  type EpisodeThumbnailConcept,
  type EpisodeThumbnailVersion,
} from "./episode-package-v2";
import { resolveAiLaneFromStorage, resolveForgeUserAccessToken } from "./hearth-chat-api";
import { tongsFetch } from "./tongs-fetch";
import { normalizeWorkpieceRelativePathOrNull } from "../../../../packages/contracts/workpiece-paths";

type GeneratedAsset = {
  id: string;
  workspace_id: string;
  episode_id: string;
  path: string;
  storage_bucket: string;
  storage_key: string;
  mime_type: string;
  bytes: number;
  provider: string;
  provider_request_id: string | null;
  request_id: string;
};

type GenerateThumbnailPayload = {
  version?: unknown;
  asset?: unknown;
  updated_episode_package?: unknown;
  primary_version_id?: unknown;
  credits_warning?: unknown;
  token_balance?: unknown;
};

type MetadataReadResult =
  | { ok: true; metadata: Record<string, unknown> | null }
  | { ok: false; status: number; error: string };

export type EpisodePackageReadResult =
  | { ok: true; episodePackage: EpisodePackageV2 }
  | { ok: false; status: number; error: string };

export type GenerateEpisodeThumbnailArgs = {
  workspaceId: string;
  workpieceId: string;
  conceptId?: string | null;
  prompt?: string | null;
  preset?: string | null;
  aspect?: string | null;
  confirmSpend: boolean;
  alwaysApproveAiSpend: boolean;
};

export type GenerateEpisodeThumbnailResult =
  | {
      ok: true;
      status: number;
      version: EpisodeThumbnailVersion;
      asset: GeneratedAsset;
      updatedEpisodePackage: EpisodePackageV2;
      primaryVersionId: string | null;
      creditsWarning?: string;
      tokenBalance?: number | null;
    }
  | {
      ok: false;
      status: number;
      error: string;
      code?: string;
      requiresConfirmation?: boolean;
    };

export type SaveEpisodePackageResult =
  | { ok: true; status: number; episodePackage: EpisodePackageV2; metadataUpdatedAt: string | null }
  | { ok: false; status: number; error: string };

export type ThumbnailPreviewResult =
  | { ok: true; dataUrl: string; path: string }
  | { ok: false; error: string };

export type UploadThumbnailImageResult =
  | { ok: true; version: EpisodeThumbnailVersion }
  | { ok: false; error: string; status?: number };

const DEFAULT_LANE = "forge-managed";
const DEFAULT_TOOL_VERSION = "0.0.0";
let correlationSeq = 0;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function readNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
}

function readErrorBody(body: unknown, fallback: string): { error: string; code?: string; requiresConfirmation?: boolean } {
  if (!isRecord(body)) return { error: fallback };
  const errorRoot = isRecord(body.error)
    ? body.error
    : isRecord(body.data) && isRecord(body.data.error)
      ? body.data.error
      : null;
  if (!errorRoot) return { error: fallback };
  const message = readString(errorRoot.message) ?? fallback;
  const code = readString(errorRoot.code) ?? undefined;
  const details = isRecord(errorRoot.details) ? errorRoot.details : null;
  return {
    error: message,
    ...(code ? { code } : {}),
    ...(details?.requires_confirmation === true ? { requiresConfirmation: true } : {}),
  };
}

function normalizeVersion(row: unknown): EpisodeThumbnailVersion | null {
  if (!isRecord(row)) return null;
  const id = readString(row.id);
  const conceptId = readString(row.concept_id);
  const createdAt = readString(row.created_at);
  const provider = readString(row.provider);
  const prompt = readString(row.prompt);
  const assetId = readString(row.asset_id);
  const status = readString(row.status);
  if (!id || !conceptId || !createdAt || !provider || !prompt || !assetId || !status) {
    return null;
  }
  return {
    id,
    concept_id: conceptId,
    created_at: createdAt,
    provider,
    prompt,
    asset_id: assetId,
    status,
    provider_request_id: readString(row.provider_request_id),
    asset_path: readString(row.asset_path),
    mime_type: readString(row.mime_type),
    error: readString(row.error),
  };
}

function normalizeAsset(row: unknown): GeneratedAsset | null {
  if (!isRecord(row)) return null;
  const id = readString(row.id);
  const workspaceId = readString(row.workspace_id);
  const episodeId = readString(row.episode_id);
  const path = readString(row.path);
  const storageBucket = readString(row.storage_bucket);
  const storageKey = readString(row.storage_key);
  const mimeType = readString(row.mime_type);
  const provider = readString(row.provider);
  const requestId = readString(row.request_id);
  const bytes = readNumber(row.bytes);
  if (
    !id
    || !workspaceId
    || !episodeId
    || !path
    || !storageBucket
    || !storageKey
    || !mimeType
    || !provider
    || !requestId
    || bytes == null
  ) {
    return null;
  }
  return {
    id,
    workspace_id: workspaceId,
    episode_id: episodeId,
    path,
    storage_bucket: storageBucket,
    storage_key: storageKey,
    mime_type: mimeType,
    bytes,
    provider,
    provider_request_id: readString(row.provider_request_id),
    request_id: requestId,
  };
}

async function readBodyAsJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function resolveEpisodePackageFromPayload(payload: unknown): EpisodePackageV2 {
  if (isRecord(payload)) {
    if (isRecord(payload.episode)) {
      return hydrateEpisodePackageV2(payload as Record<string, unknown>);
    }
    return hydrateEpisodePackageV2({
      episode: payload,
    });
  }
  return createEmptyEpisodePackageV2();
}

function resolveLane(): string {
  if (typeof window !== "undefined") {
    try {
      const query = new URLSearchParams(window.location.search || "");
      const fromQuery = readString(query.get("forge_lane") ?? query.get("lane"));
      if (fromQuery) return fromQuery;
    } catch {
      // ignore
    }
    try {
      const runtimeWindow = window as typeof window & { __forgeLane?: unknown; __tpLane?: unknown };
      const fromWindow = readString(runtimeWindow.__forgeLane ?? runtimeWindow.__tpLane);
      if (fromWindow) return fromWindow;
    } catch {
      // ignore
    }
    try {
      const fromStorage = readString(window.localStorage.getItem("forge_lane_v1"));
      if (fromStorage) return fromStorage;
    } catch {
      // ignore
    }
  }
  return DEFAULT_LANE;
}

function resolveToolVersion(): string {
  if (typeof window === "undefined") return DEFAULT_TOOL_VERSION;
  const runtimeWindow = window as typeof window & { APP_VERSION?: unknown };
  return readString(runtimeWindow.APP_VERSION) ?? DEFAULT_TOOL_VERSION;
}

function buildWrittenBy(): { tool: string; tool_version: string; lane: string } {
  return {
    tool: "hearth",
    tool_version: resolveToolVersion(),
    lane: resolveLane(),
  };
}

function nextCorrelationId(prefix: string): string {
  correlationSeq += 1;
  return `${prefix}:${Date.now().toString(36)}:${correlationSeq}`;
}

function isCommitAck(body: unknown): boolean {
  if (!isRecord(body)) return false;
  if (body.ok === true || body.success === true) return true;
  if (isRecord(body.data) && (body.data.ok === true || body.data.success === true)) return true;
  return false;
}

function createClientId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function extensionFromMimeType(mimeType: string): string {
  const normalized = mimeType.trim().toLowerCase();
  if (normalized.includes("png")) return "png";
  if (normalized.includes("jpeg") || normalized.includes("jpg")) return "jpg";
  if (normalized.includes("webp")) return "webp";
  return "png";
}

function resolveUploadMimeType(file: File): string {
  const trimmed = file.type.trim().toLowerCase();
  if (trimmed) return trimmed;
  const lowerName = file.name.toLowerCase();
  if (lowerName.endsWith(".jpg") || lowerName.endsWith(".jpeg")) return "image/jpeg";
  if (lowerName.endsWith(".webp")) return "image/webp";
  return "image/png";
}

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof btoa !== "function") {
    throw new Error("Base64 encoding is unavailable in this browser.");
  }
  const chunkSize = 0x8000;
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const slice = bytes.subarray(offset, Math.min(bytes.length, offset + chunkSize));
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

function resolveCandidateAssetPaths(workpieceId: string, version: EpisodeThumbnailVersion): string[] {
  const candidates: string[] = [];
  const direct = normalizeWorkpieceRelativePathOrNull(workpieceId, version.asset_path);
  if (direct) candidates.push(direct);

  const encodedPathAsset = version.asset_id.startsWith("path:")
    ? normalizeWorkpieceRelativePathOrNull(workpieceId, version.asset_id.slice(5))
    : null;
  if (encodedPathAsset) candidates.push(encodedPathAsset);

  candidates.push(`assets/thumbnails/${workpieceId}/${version.id}.png`);
  candidates.push(`assets/thumbnails/${workpieceId}/${version.id}.jpg`);
  candidates.push(`assets/thumbnails/${workpieceId}/${version.id}.jpeg`);
  return Array.from(new Set(candidates.filter(Boolean)));
}

async function readMetadataDocumentForWorkpiece(workpieceId: string): Promise<MetadataReadResult> {
  const response = await tongsFetch(
    `/tongs/workpieces/${encodeURIComponent(workpieceId)}/read-file?path=${encodeURIComponent("metadata.json")}`,
    { method: "GET" },
  );
  const body = await readBodyAsJson(response);

  if (response.status === 404) {
    return { ok: true, metadata: null };
  }
  if (!response.ok) {
    const parsed = readErrorBody(body, "Unable to read episode metadata.");
    return {
      ok: false,
      status: response.status,
      error: parsed.error,
    };
  }
  if (!isRecord(body) || body.ok !== true) {
    return {
      ok: false,
      status: response.status,
      error: "Invalid metadata response.",
    };
  }
  if (!isRecord(body.data)) {
    return {
      ok: true,
      metadata: null,
    };
  }
  return {
    ok: true,
    metadata: body.data,
  };
}

async function commitMetadataDocument(args: {
  workpieceId: string;
  metadata: Record<string, unknown>;
  eventName: string;
  eventPayload: Record<string, unknown>;
}): Promise<
  | { ok: true; status: number; metadataUpdatedAt: string | null }
  | { ok: false; status: number; error: string }
> {
  const response = await tongsFetch(`/tongs/workpieces/${encodeURIComponent(args.workpieceId)}/commit-file`, {
    method: "POST",
    json: {
      path: "metadata.json",
      content_type: "application/json",
      json: args.metadata,
      written_by: buildWrittenBy(),
      correlation_id: nextCorrelationId("hearth-thumbnail-metadata"),
      event_name: args.eventName,
      event_payload: args.eventPayload,
    },
  });

  const body = await readBodyAsJson(response);
  if (!response.ok || !isCommitAck(body)) {
    const parsed = readErrorBody(body, "Failed to save thumbnail metadata.");
    return {
      ok: false,
      status: response.status,
      error: parsed.error,
    };
  }
  return {
    ok: true,
    status: response.status,
    metadataUpdatedAt: isRecord(body)
      && isRecord(body.data)
      && isRecord(body.data.file_row)
      ? readString(body.data.file_row.updated_at)
      : null,
  };
}

export async function readEpisodePackageForWorkpiece(workpieceId: string): Promise<EpisodePackageReadResult> {
  const metadataRead = await readMetadataDocumentForWorkpiece(workpieceId);
  if (!metadataRead.ok) {
    return metadataRead;
  }
  if (!metadataRead.metadata) {
    return {
      ok: true,
      episodePackage: createEmptyEpisodePackageV2(),
    };
  }
  return {
    ok: true,
    episodePackage: hydrateEpisodePackageV2(metadataRead.metadata),
  };
}

export async function saveEpisodePackageForWorkpiece(args: {
  workpieceId: string;
  workspaceId: string;
  episodePackage: EpisodePackageV2;
  eventName?: string;
  eventPayload?: Record<string, unknown>;
}): Promise<SaveEpisodePackageResult> {
  const metadataRead = await readMetadataDocumentForWorkpiece(args.workpieceId);
  if (!metadataRead.ok) return metadataRead;

  const nowIso = new Date().toISOString();
  const existing = metadataRead.metadata;
  const metadata = existing ?? buildDefaultMetadataDocument({
    workpieceId: args.workpieceId,
    workspaceId: args.workspaceId,
    createdAt: nowIso,
    updatedAt: nowIso,
    status: "draft",
    notes: null,
    origin: null,
  });

  const nextMetadata = mirrorEpisodePackageV2ToLegacy({
    ...metadata,
    updated_at: nowIso,
    episode: args.episodePackage,
  });

  const committed = await commitMetadataDocument({
    workpieceId: args.workpieceId,
    metadata: nextMetadata,
    eventName: args.eventName ?? "hearth.thumbnail.panel.updated.v1",
    eventPayload: args.eventPayload ?? {
      source: "thumbnail_panel",
    },
  });
  if (!committed.ok) return committed;

  return {
    ok: true,
    status: committed.status,
    episodePackage: hydrateEpisodePackageV2(nextMetadata),
    metadataUpdatedAt: committed.metadataUpdatedAt,
  };
}

export async function generateEpisodeThumbnail(args: GenerateEpisodeThumbnailArgs): Promise<GenerateEpisodeThumbnailResult> {
  const accessToken = await resolveForgeUserAccessToken();
  if (!accessToken) {
    return {
      ok: false,
      status: 401,
      error: "Sign in required before generating thumbnails.",
      code: "auth_required",
    };
  }

  const response = await tongsFetch(`/tongs/workpieces/${encodeURIComponent(args.workpieceId)}/generate-thumbnail`, {
    method: "POST",
    headers: {
      "x-forge-user-authorization": `Bearer ${accessToken}`,
    },
    json: {
      workspace_id: args.workspaceId,
      episode_id: args.workpieceId,
      ...(args.conceptId ? { concept_id: args.conceptId } : {}),
      ...(args.prompt ? { prompt: args.prompt } : {}),
      ...(args.preset ? { preset: args.preset } : {}),
      ...(args.aspect ? { aspect: args.aspect } : {}),
      lane: resolveAiLaneFromStorage(),
      confirm_spend: args.confirmSpend,
      always_approve_ai_spend: args.alwaysApproveAiSpend,
    },
  });
  const body = await readBodyAsJson(response);

  if (!response.ok) {
    const parsed = readErrorBody(body, "Thumbnail generation failed.");
    return {
      ok: false,
      status: response.status,
      error: parsed.error,
      ...(parsed.code ? { code: parsed.code } : {}),
      ...(parsed.requiresConfirmation ? { requiresConfirmation: true } : {}),
    };
  }
  if (!isRecord(body) || body.ok !== true || !isRecord(body.data)) {
    return {
      ok: false,
      status: response.status,
      error: "Invalid thumbnail generation response.",
    };
  }

  const payload = body.data as GenerateThumbnailPayload;
  const version = normalizeVersion(payload.version);
  const asset = normalizeAsset(payload.asset);
  if (!version || !asset) {
    return {
      ok: false,
      status: response.status,
      error: "Thumbnail response missing required fields.",
    };
  }

  return {
    ok: true,
    status: response.status,
    version,
    asset,
    updatedEpisodePackage: resolveEpisodePackageFromPayload(payload.updated_episode_package),
    primaryVersionId: readString(payload.primary_version_id),
    ...(readString(payload.credits_warning) ? { creditsWarning: readString(payload.credits_warning) ?? undefined } : {}),
    ...(typeof payload.token_balance === "number" ? { tokenBalance: payload.token_balance } : {}),
  };
}

export async function loadThumbnailPreviewDataUrl(args: {
  workpieceId: string;
  version: EpisodeThumbnailVersion;
}): Promise<ThumbnailPreviewResult> {
  const paths = resolveCandidateAssetPaths(args.workpieceId, args.version);
  for (const path of paths) {
    const response = await tongsFetch(
      `/tongs/workpieces/${encodeURIComponent(args.workpieceId)}/read-file?path=${encodeURIComponent(path)}&encoding=base64`,
      { method: "GET" },
    );
    if (!response.ok) continue;
    const body = await readBodyAsJson(response);
    if (!isRecord(body) || body.ok !== true || !isRecord(body.data)) continue;
    const bytesBase64 = readString(body.data.bytes_base64);
    const contentType = readString(body.data.content_type) ?? readString(args.version.mime_type) ?? "image/png";
    if (!bytesBase64) continue;
    return {
      ok: true,
      dataUrl: `data:${contentType};base64,${bytesBase64}`,
      path,
    };
  }

  return {
    ok: false,
    error: "Preview image is not available yet.",
  };
}

export async function uploadThumbnailImageVersion(args: {
  workpieceId: string;
  concept: EpisodeThumbnailConcept | null;
  file: File;
}): Promise<UploadThumbnailImageResult> {
  const mimeType = resolveUploadMimeType(args.file);
  const extension = extensionFromMimeType(mimeType);
  const versionId = createClientId("thumb-upload-version");
  const uploadPath = `assets/thumbnails/${args.workpieceId}/${versionId}.${extension}`;
  const uploadedAt = new Date().toISOString();

  let bytesBase64: string;
  try {
    const bytes = new Uint8Array(await args.file.arrayBuffer());
    bytesBase64 = bytesToBase64(bytes);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to read selected image file.";
    return {
      ok: false,
      error: message,
    };
  }

  const committed = await tongsFetch(`/tongs/workpieces/${encodeURIComponent(args.workpieceId)}/commit-file`, {
    method: "POST",
    json: {
      path: uploadPath,
      content_type: mimeType,
      file_type: "thumbnail_image",
      bytes_base64: bytesBase64,
      written_by: buildWrittenBy(),
      event_name: "hearth.thumbnail.uploaded.v1",
      event_payload: {
        source: "thumbnail_panel",
        file_name: args.file.name,
        mime_type: mimeType,
      },
      correlation_id: nextCorrelationId("hearth-thumbnail-upload"),
    },
  });
  const body = await readBodyAsJson(committed);
  if (!committed.ok || !isCommitAck(body)) {
    const parsed = readErrorBody(body, "Upload failed.");
    return {
      ok: false,
      error: parsed.error,
      status: committed.status,
    };
  }

  return {
    ok: true,
    version: {
      id: versionId,
      concept_id: args.concept?.id ?? "uploaded",
      created_at: uploadedAt,
      provider: "upload",
      prompt: args.file.name || "uploaded-image",
      asset_id: `path:${uploadPath}`,
      status: "ready",
      asset_path: uploadPath,
      mime_type: mimeType,
      error: null,
      provider_request_id: null,
    },
  };
}
