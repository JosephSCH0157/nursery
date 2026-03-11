import {
  createEmptyEpisodePackageV2,
  ensureImageMapV2,
  type EpisodeImageMapEntry,
} from "./episode-package-v2";
import { tongsFetch } from "./tongs-fetch";

export type WorkpieceImageMapView = {
  workpieceId: string;
  workspaceId: string;
  entries: EpisodeImageMapEntry[];
  metadataUpdatedAt: string | null;
  asset: {
    id: string;
    path: "assets/image-map/image-map.v1.json";
    assetKind: "image_map_json";
    status: "ready";
    storageBucket: string;
    storageKey: string;
    entryCount: number;
    updatedAt: string;
    supersedesAssetId: string | null;
  } | null;
};

export type WorkpieceImageMapCandidateAssetView = {
  id: string;
  workpieceId: string;
  workspaceId: string;
  entryId: string;
  path: string;
  storageBucket: string;
  storageKey: string;
  mimeType: string;
  bytes: number;
  provider: string;
  providerRequestId: string | null;
  requestId: string;
  variantLabel: string;
  visualMode: string;
  prompt: string;
  status: "ready";
};

export type GetWorkpieceImageMapResult =
  | { ok: true; imageMap: WorkpieceImageMapView }
  | { ok: false; status: number; reason: string };

export type SaveWorkpieceImageMapResult =
  | { ok: true; imageMap: WorkpieceImageMapView }
  | { ok: false; status: number; reason: "request_failed" | "conflict" | "invalid_response"; latest?: WorkpieceImageMapView };

export type GenerateWorkpieceImageMapCandidatesResult =
  | {
    ok: true;
    imageMap: WorkpieceImageMapView;
    generatedAssets: WorkpieceImageMapCandidateAssetView[];
    creditsWarning?: string;
    tokenBalance?: number | null;
  }
  | {
    ok: false;
    status: number;
    reason: "request_failed" | "conflict" | "invalid_response";
    error?: string;
    latest?: WorkpieceImageMapView;
  };

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

async function readBodyAsJson(response: Response): Promise<unknown> {
  const text = await response.text();
  const raw = readString(text);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return { raw };
  }
}

function normalizeImageMapEntries(value: unknown): EpisodeImageMapEntry[] {
  const pkg = ensureImageMapV2({
    ...createEmptyEpisodePackageV2(),
    image_map: {
      entries: Array.isArray(value) ? value as EpisodeImageMapEntry[] : [],
    },
  });
  return pkg.image_map.entries;
}

function normalizeWorkpieceImageMapView(
  body: unknown,
  expected?: {
    workpieceId?: string;
    workspaceId?: string;
  },
): WorkpieceImageMapView | null {
  if (!isRecord(body) || body.ok !== true || !isRecord(body.data)) return null;

  const imageMapRoot = isRecord(body.data.image_map) ? body.data.image_map : null;
  if (!imageMapRoot) return null;

  const workpieceId = readString(imageMapRoot.workpiece_id);
  const workspaceId = readString(imageMapRoot.workspace_id);
  if (!workpieceId || !workspaceId) return null;
  if (expected?.workpieceId && expected.workpieceId !== workpieceId) return null;
  if (expected?.workspaceId && expected.workspaceId !== workspaceId) return null;

  const assetRoot = isRecord(body.data.asset) ? body.data.asset : null;
  const entryCount = assetRoot && isRecord(assetRoot.metadata_json) && typeof assetRoot.metadata_json.entry_count === "number"
    ? Math.max(0, Math.trunc(assetRoot.metadata_json.entry_count))
    : 0;

  return {
    workpieceId,
    workspaceId,
    entries: normalizeImageMapEntries(imageMapRoot.entries),
    metadataUpdatedAt: readString(imageMapRoot.metadata_updated_at),
    asset: assetRoot
      ? {
        id: readString(assetRoot.id) ?? "",
        path: "assets/image-map/image-map.v1.json",
        assetKind: "image_map_json",
        status: "ready",
        storageBucket: readString(assetRoot.storage_bucket) ?? "",
        storageKey: readString(assetRoot.storage_key) ?? "",
        entryCount,
        updatedAt: readString(assetRoot.updated_at) ?? "",
        supersedesAssetId: readString(assetRoot.supersedes_asset_id),
      }
      : null,
  };
}

function normalizeCandidateAssetView(
  value: unknown,
  expected?: { workpieceId?: string; workspaceId?: string },
): WorkpieceImageMapCandidateAssetView | null {
  if (!isRecord(value)) return null;
  const workpieceId = readString(value.episode_id);
  const workspaceId = readString(value.workspace_id);
  const entryId = readString(value.image_map_entry_id);
  const path = readString(value.path);
  const storageBucket = readString(value.storage_bucket);
  const storageKey = readString(value.storage_key);
  const mimeType = readString(value.mime_type);
  const provider = readString(value.provider);
  const requestId = readString(value.request_id);
  const variantLabel = readString(value.variant_label);
  const visualMode = readString(value.visual_mode);
  const prompt = readString(value.prompt);
  const bytes = typeof value.bytes === "number" && Number.isFinite(value.bytes) ? Math.max(0, Math.trunc(value.bytes)) : null;
  if (
    !workpieceId || !workspaceId || !entryId || !path || !storageBucket || !storageKey || !mimeType
    || !provider || !requestId || !variantLabel || !visualMode || !prompt || bytes == null
  ) {
    return null;
  }
  if (expected?.workpieceId && expected.workpieceId !== workpieceId) return null;
  if (expected?.workspaceId && expected.workspaceId !== workspaceId) return null;
  return {
    id: readString(value.id) ?? "",
    workpieceId,
    workspaceId,
    entryId,
    path,
    storageBucket,
    storageKey,
    mimeType,
    bytes,
    provider,
    providerRequestId: readString(value.provider_request_id),
    requestId,
    variantLabel,
    visualMode,
    prompt,
    status: "ready",
  };
}

async function readLatestImageMap(workpieceId: string): Promise<WorkpieceImageMapView | undefined> {
  const result = await getWorkpieceImageMap(workpieceId);
  return result.ok ? result.imageMap : undefined;
}

export async function getWorkpieceImageMap(workpieceId: string): Promise<GetWorkpieceImageMapResult> {
  const response = await tongsFetch(`/tongs/workpieces/${encodeURIComponent(workpieceId)}/image-map`, {
    method: "GET",
  });
  const body = await readBodyAsJson(response);
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      reason: "request_failed",
    };
  }

  const imageMap = normalizeWorkpieceImageMapView(body, { workpieceId });
  if (!imageMap) {
    return {
      ok: false,
      status: response.status,
      reason: "invalid_response",
    };
  }

  return { ok: true, imageMap };
}

export async function saveWorkpieceImageMap(args: {
  workpieceId: string;
  workspaceId: string;
  entries: EpisodeImageMapEntry[];
  expectedMetadataUpdatedAt?: string | null;
}): Promise<SaveWorkpieceImageMapResult> {
  const response = await tongsFetch(`/tongs/workpieces/${encodeURIComponent(args.workpieceId)}/image-map`, {
    method: "PUT",
    json: {
      workspace_id: args.workspaceId,
      entries: args.entries,
      ...(typeof args.expectedMetadataUpdatedAt !== "undefined"
        ? { expected_metadata_updated_at: args.expectedMetadataUpdatedAt }
        : {}),
    },
  });
  const body = await readBodyAsJson(response);

  if (response.status === 409) {
    const latest = await readLatestImageMap(args.workpieceId);
    return {
      ok: false,
      status: 409,
      reason: "conflict",
      ...(latest ? { latest } : {}),
    };
  }

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      reason: "request_failed",
    };
  }

  const imageMap = normalizeWorkpieceImageMapView(body, {
    workpieceId: args.workpieceId,
    workspaceId: args.workspaceId,
  });
  if (!imageMap) {
    return {
      ok: false,
      status: response.status,
      reason: "invalid_response",
    };
  }

  return { ok: true, imageMap };
}

export async function generateWorkpieceImageMapCandidates(args: {
  workpieceId: string;
  workspaceId: string;
  imageMapEntryId: string;
  expectedMetadataUpdatedAt?: string | null;
  contextBefore?: string | null;
  contextAfter?: string | null;
  aspect?: string | null;
  size?: string | null;
  confirmSpend?: boolean;
  alwaysApproveAiSpend?: boolean;
}): Promise<GenerateWorkpieceImageMapCandidatesResult> {
  const response = await tongsFetch(
    `/tongs/workpieces/${encodeURIComponent(args.workpieceId)}/image-map/generate-candidates`,
    {
      method: "POST",
      json: {
        workspace_id: args.workspaceId,
        image_map_entry_id: args.imageMapEntryId,
        ...(typeof args.expectedMetadataUpdatedAt !== "undefined"
          ? { expected_metadata_updated_at: args.expectedMetadataUpdatedAt }
          : {}),
        ...(typeof args.contextBefore !== "undefined" ? { context_before: args.contextBefore } : {}),
        ...(typeof args.contextAfter !== "undefined" ? { context_after: args.contextAfter } : {}),
        ...(typeof args.aspect !== "undefined" ? { aspect: args.aspect } : {}),
        ...(typeof args.size !== "undefined" ? { size: args.size } : {}),
        confirm_spend: args.confirmSpend,
        always_approve_ai_spend: args.alwaysApproveAiSpend,
      },
    },
  );
  const body = await readBodyAsJson(response);

  if (response.status === 409) {
    const latest = await readLatestImageMap(args.workpieceId);
    return {
      ok: false,
      status: 409,
      reason: "conflict",
      error: "Image map changed since last load.",
      ...(latest ? { latest } : {}),
    };
  }

  if (!response.ok) {
    const error = isRecord(body) && isRecord(body.error) ? readString(body.error.message) : null;
    return {
      ok: false,
      status: response.status,
      reason: "request_failed",
      ...(error ? { error } : {}),
    };
  }

  if (!isRecord(body) || body.ok !== true || !isRecord(body.data)) {
    return {
      ok: false,
      status: response.status,
      reason: "invalid_response",
    };
  }

  const imageMap = normalizeWorkpieceImageMapView({ ok: true, data: body.data }, {
    workpieceId: args.workpieceId,
    workspaceId: args.workspaceId,
  });
  if (!imageMap) {
    return {
      ok: false,
      status: response.status,
      reason: "invalid_response",
    };
  }

  const generatedAssetsRaw = Array.isArray(body.data.generated_assets) ? body.data.generated_assets : [];
  const generatedAssets = generatedAssetsRaw
    .map((entry) => normalizeCandidateAssetView(entry, {
      workpieceId: args.workpieceId,
      workspaceId: args.workspaceId,
    }))
    .filter(Boolean) as WorkpieceImageMapCandidateAssetView[];
  if (generatedAssets.length < 2) {
    return {
      ok: false,
      status: response.status,
      reason: "invalid_response",
    };
  }

  return {
    ok: true,
    imageMap,
    generatedAssets,
    ...(readString(body.data.credits_warning) ? { creditsWarning: readString(body.data.credits_warning) ?? undefined } : {}),
    ...(typeof body.data.token_balance === "number" ? { tokenBalance: body.data.token_balance } : {}),
  };
}

export async function loadImageMapCandidatePreviewDataUrl(args: {
  workpieceId: string;
  path: string | null | undefined;
  mimeType?: string | null;
}): Promise<
  | { ok: true; dataUrl: string; path: string }
  | { ok: false; error: string }
> {
  const path = readString(args.path);
  if (!path) {
    return { ok: false, error: "Candidate preview path is missing." };
  }

  const response = await tongsFetch(
    `/tongs/workpieces/${encodeURIComponent(args.workpieceId)}/read-file?path=${encodeURIComponent(path)}&encoding=base64`,
    { method: "GET" },
  );
  if (!response.ok) {
    return { ok: false, error: "Candidate preview is not available yet." };
  }

  const body = await readBodyAsJson(response);
  if (!isRecord(body) || body.ok !== true || !isRecord(body.data)) {
    return { ok: false, error: "Candidate preview response was invalid." };
  }
  const bytesBase64 = readString(body.data.bytes_base64);
  const contentType = readString(body.data.content_type) ?? readString(args.mimeType) ?? "image/png";
  if (!bytesBase64) {
    return { ok: false, error: "Candidate preview image is empty." };
  }
  return {
    ok: true,
    dataUrl: `data:${contentType};base64,${bytesBase64}`,
    path,
  };
}
