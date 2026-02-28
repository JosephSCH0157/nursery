import {
  createEmptyEpisodePackageV2,
  hydrateEpisodePackageV2,
  type EpisodePackageV2,
  type EpisodeThumbnailVersion,
} from "./episode-package-v2";
import { resolveAiLaneFromStorage, resolveForgeUserAccessToken } from "./hearth-chat-api";
import { tongsFetch } from "./tongs-fetch";

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

type EpisodePackageReadResult =
  | { ok: true; episodePackage: EpisodePackageV2 }
  | { ok: false; status: number; error: string };

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

export async function readEpisodePackageForWorkpiece(workpieceId: string): Promise<EpisodePackageReadResult> {
  const response = await tongsFetch(
    `/tongs/workpieces/${encodeURIComponent(workpieceId)}/read-file?path=${encodeURIComponent("metadata.json")}`,
    { method: "GET" },
  );
  const body = await readBodyAsJson(response);

  if (response.status === 404) {
    return { ok: true, episodePackage: createEmptyEpisodePackageV2() };
  }
  if (!response.ok) {
    const parsed = readErrorBody(body, "Unable to read episode metadata.");
    return {
      ok: false,
      status: response.status,
      error: parsed.error,
    };
  }
  if (!isRecord(body) || body.ok !== true || !isRecord(body.data)) {
    return {
      ok: false,
      status: response.status,
      error: "Invalid metadata response.",
    };
  }

  return {
    ok: true,
    episodePackage: hydrateEpisodePackageV2(body.data),
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
