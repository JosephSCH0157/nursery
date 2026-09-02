import {
  createEmptyEpisodePackageV2,
  ensureImageMapV2,
  ensureSpokenBeatsV2,
  type EpisodeImageMapAssetSource,
  type EpisodeImageMapEntry,
  type EpisodeSpokenBeat,
} from "./episode-package-v2";
import { recordHearthBandwidthFetch } from "./hearthBandwidthTelemetry";
import { tongsFetch } from "./tongs-fetch";

const imageMapCandidatePreviewCache = new Map<string, { dataUrl: string; path: string }>();

export type WorkpieceImageMapView = {
  workpieceId: string;
  workspaceId: string;
  entries: EpisodeImageMapEntry[];
  spokenBeats: EpisodeSpokenBeat[];
  metadataUpdatedAt: string | null;
  authoritySource?: "canonical" | "legacy";
  revisionId?: string | null;
  revision?: number;
  sourceScriptApprovalId?: string | null;
  sourceScriptApprovalRevision?: number | null;
  provenanceState?: "current" | "stale" | "unresolved" | "provenance_unknown";
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
  | { ok: false; status: number; reason: string; error?: string; code?: string };

export type SaveWorkpieceImageMapResult =
  | { ok: true; imageMap: WorkpieceImageMapView }
  | {
    ok: false;
    status: number;
    reason: "request_failed" | "conflict" | "invalid_response";
    error?: string;
    latest?: WorkpieceImageMapView;
  };

export type GenerateWorkpieceImageMapCandidatesResult =
  | {
    ok: true;
    imageMap: WorkpieceImageMapView;
    generatedAssets: WorkpieceImageMapCandidateAssetView[];
    creditsWarning?: string;
    tokenBalance?: number | null;
    aiCreditsUsed?: number;
    aiCreditsReleased?: number;
  }
  | {
    ok: false;
    status: number;
    reason: "request_failed" | "conflict" | "invalid_response";
    error?: string;
    latest?: WorkpieceImageMapView;
    requiresConfirmation?: boolean;
    authorizedCustomerCeiling?: number;
    authorizationMessage?: string;
  };

export type SelectWorkpieceImageMapCandidateResult =
  | {
    ok: true;
    imageMap: WorkpieceImageMapView;
  }
  | {
    ok: false;
    status: number;
    reason: "entry_not_found" | "candidate_not_attached" | "conflict" | "request_failed" | "invalid_response";
    error?: string;
    latest?: WorkpieceImageMapView;
  };

export type UploadWorkpieceImageMapCandidateAssetResult =
  | {
    ok: true;
    candidateAsset: {
      asset_id: string;
      path: string;
      variant_label: string;
      visual_mode: null;
      mime_type: string;
      source: EpisodeImageMapAssetSource;
    };
  }
  | {
    ok: false;
    status: number;
    reason: "invalid_file" | "request_failed" | "invalid_response";
    error: string;
  };

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

function readApiErrorCode(body: unknown): string | null {
  if (!isRecord(body) || !isRecord(body.error)) return null;
  return readString(body.error.code);
}

function normalizeWorkpieceRelativePathOrNull(workpieceId: string, rawPath: string | null | undefined): string | null {
  const path = readString(rawPath);
  if (!path) return null;
  const workpiecePrefix = `workpieces/${workpieceId}/`;
  let normalized = path.replace(/^\/+/, "");
  while (normalized.startsWith(workpiecePrefix)) {
    normalized = normalized.slice(workpiecePrefix.length);
  }
  return normalized;
}

function buildWrittenBy(): { tool: string; tool_version: string; lane: string } {
  return {
    tool: "hearth",
    tool_version: "v1",
    lane: "hearth_visual_beats",
  };
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function resolveUploadMimeType(file: File): string {
  const normalized = readString(file.type)?.toLowerCase();
  if (normalized?.startsWith("image/")) return normalized;
  if (normalized?.startsWith("video/")) return normalized;
  if (normalized) return normalized;
  return "application/octet-stream";
}

function extensionFromMimeType(mimeType: string): string {
  const normalized = mimeType.toLowerCase();
  if (normalized === "image/jpeg") return "jpg";
  if (normalized === "image/png") return "png";
  if (normalized === "image/webp") return "webp";
  if (normalized === "video/mp4") return "mp4";
  if (normalized === "video/webm") return "webm";
  const slash = normalized.lastIndexOf("/");
  if (slash >= 0 && slash < normalized.length - 1) {
    return normalized.slice(slash + 1).replace(/[^a-z0-9]+/g, "") || "bin";
  }
  return "bin";
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

function normalizeSpokenBeats(value: unknown): EpisodeSpokenBeat[] {
  const pkg = ensureSpokenBeatsV2({
    ...createEmptyEpisodePackageV2(),
    spoken_beats: Array.isArray(value) ? value as EpisodeSpokenBeat[] : [],
  });
  return pkg.spoken_beats;
}

export function normalizeWorkpieceImageMapView(
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
    spokenBeats: normalizeSpokenBeats(imageMapRoot.spoken_beats),
    metadataUpdatedAt: readString(imageMapRoot.metadata_updated_at),
    authoritySource: imageMapRoot.authority_source === "canonical" ? "canonical" : "legacy",
    revisionId: readString(imageMapRoot.image_map_revision_id),
    revision: typeof imageMapRoot.image_map_revision === "number" ? imageMapRoot.image_map_revision : 0,
    sourceScriptApprovalId: readString(imageMapRoot.source_script_approval_id),
    sourceScriptApprovalRevision: typeof imageMapRoot.source_script_approval_revision === "number" ? imageMapRoot.source_script_approval_revision : null,
    provenanceState: ["current", "stale", "unresolved", "provenance_unknown"].includes(String(imageMapRoot.provenance_state)) ? imageMapRoot.provenance_state as WorkpieceImageMapView["provenanceState"] : "provenance_unknown",
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
  let response: Response;
  try {
    response = await tongsFetch(`/tongs/workpieces/${encodeURIComponent(workpieceId)}/image-map`, {
      method: "GET",
    });
  } catch {
    return {
      ok: false,
      status: 0,
      reason: "request_failed",
      error: "Unable to load the canonical image map.",
    };
  }
  const body = await readBodyAsJson(response);
  if (!response.ok) {
    const error = readApiErrorMessage(body);
    const code = readApiErrorCode(body);
    return {
      ok: false,
      status: response.status,
      reason: "request_failed",
      ...(error ? { error } : {}),
      ...(code ? { code } : {}),
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
  spokenBeats?: EpisodeSpokenBeat[] | null;
  expectedMetadataUpdatedAt?: string | null;
}): Promise<SaveWorkpieceImageMapResult> {
  const response = await tongsFetch(`/tongs/workpieces/${encodeURIComponent(args.workpieceId)}/image-map`, {
    method: "PUT",
    json: {
      workspace_id: args.workspaceId,
      entries: args.entries,
      ...(typeof args.spokenBeats !== "undefined" ? { spoken_beats: args.spokenBeats } : {}),
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
    const error = readApiErrorMessage(body);
    return {
      ok: false,
      status: response.status,
      reason: "request_failed",
      ...(error ? { error } : {}),
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
  promptRevisionId?: string;
  promptRevision?: number;
  promptContentHash?: string;
  expectedMetadataUpdatedAt?: string | null;
  contextBefore?: string | null;
  contextAfter?: string | null;
  aspect?: string | null;
  size?: string | null;
  confirmSpend?: boolean;
  alwaysApproveAiSpend?: boolean;
  generationReference?: import("./hearth-generation-reference").HearthGenerationReferenceImage | null;
}): Promise<GenerateWorkpieceImageMapCandidatesResult> {
  const response = await tongsFetch(
    `/tongs/workpieces/${encodeURIComponent(args.workpieceId)}/image-map/generate-candidates`,
    {
      method: "POST",
      json: {
        workspace_id: args.workspaceId,
        image_map_entry_id: args.imageMapEntryId,
        ...(args.promptRevisionId ? { prompt_revision_id: args.promptRevisionId } : {}),
        ...(typeof args.promptRevision === "number" ? { prompt_revision: args.promptRevision } : {}),
        ...(args.promptContentHash ? { prompt_content_hash: args.promptContentHash } : {}),
        ...(typeof args.expectedMetadataUpdatedAt !== "undefined"
          ? { expected_metadata_updated_at: args.expectedMetadataUpdatedAt }
          : {}),
        ...(typeof args.contextBefore !== "undefined" ? { context_before: args.contextBefore } : {}),
        ...(typeof args.contextAfter !== "undefined" ? { context_after: args.contextAfter } : {}),
        ...(typeof args.aspect !== "undefined" ? { aspect: args.aspect } : {}),
        ...(typeof args.size !== "undefined" ? { size: args.size } : {}),
        confirm_spend: args.confirmSpend,
        always_approve_ai_spend: args.alwaysApproveAiSpend,
        generation_reference: args.generationReference ?? null,
      },
    },
  );
  const body = await readBodyAsJson(response);

  if (response.status === 409) {
    const code = readApiErrorCode(body);
    const error = readApiErrorMessage(body) ?? "Image generation was rejected by canonical authority.";
    const isImageMapConflict = code === "image_map_conflict" || code === "image_map_revision_conflict";
    const latest = isImageMapConflict ? await readLatestImageMap(args.workpieceId) : undefined;
    const details = isRecord(body) && isRecord(body.error) && isRecord(body.error.details) ? body.error.details : null;
    return {
      ok: false,
      status: 409,
      reason: isImageMapConflict ? "conflict" : "request_failed",
      error,
      ...(latest ? { latest } : {}),
      ...(details?.requires_confirmation === true ? { requiresConfirmation: true } : {}),
      ...(typeof details?.authorized_customer_ceiling === "number" ? { authorizedCustomerCeiling: details.authorized_customer_ceiling } : {}),
      ...(readString(details?.message) ? { authorizationMessage: readString(details?.message) ?? undefined } : {}),
    };
  }

  if (!response.ok) {
    const error = readApiErrorMessage(body);
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
      ...(typeof body.data.ai_credits_used === "number" ? { aiCreditsUsed: body.data.ai_credits_used } : {}),
      ...(typeof body.data.ai_credits_released === "number" ? { aiCreditsReleased: body.data.ai_credits_released } : {}),
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
  const path = normalizeWorkpieceRelativePathOrNull(args.workpieceId, args.path);
  if (!path) {
    return { ok: false, error: "Candidate preview path is missing." };
  }
  const cacheKey = `${args.workpieceId}:${path}:preview:v1`;
  const cached = imageMapCandidatePreviewCache.get(cacheKey);
  if (cached) {
    return {
      ok: true,
      dataUrl: cached.dataUrl,
      path: cached.path,
    };
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
  const result = {
    ok: true,
    dataUrl: `data:${contentType};base64,${bytesBase64}`,
    path,
  } as const;
  imageMapCandidatePreviewCache.set(cacheKey, { dataUrl: result.dataUrl, path: result.path });
  const padding = bytesBase64.endsWith("==") ? 2 : bytesBase64.endsWith("=") ? 1 : 0;
  const estimatedBytes = Math.max(0, Math.floor((bytesBase64.length * 3) / 4) - padding);
  recordHearthBandwidthFetch({
    assetKey: cacheKey,
    surface: "image_map_candidate_preview",
    bytes: estimatedBytes,
  });
  return result;
}

export async function uploadWorkpieceImageMapCandidateAsset(args: {
  workpieceId: string;
  entryId: string;
  file: File;
  source?: EpisodeImageMapAssetSource;
  preparationEvidence?: Record<string, unknown> | null;
}): Promise<UploadWorkpieceImageMapCandidateAssetResult> {
  const mimeType = resolveUploadMimeType(args.file);
  const source = args.source ?? "upload";
  if (!mimeType.startsWith("image/") && !mimeType.startsWith("video/")) {
    return {
      ok: false,
      status: 400,
      reason: "invalid_file",
      error: "Visual Beats accepts image or video files only.",
    };
  }

  const extension = extensionFromMimeType(mimeType);
  const candidateId = crypto.randomUUID();
  const uploadPath = `assets/image-map/uploads/${args.entryId}/${candidateId}.${extension}`;
  const variantLabel = args.file.name?.trim() || "uploaded-asset";

  let bytesBase64 = "";
  try {
    const bytes = new Uint8Array(await args.file.arrayBuffer());
    bytesBase64 = bytesToBase64(bytes);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to read uploaded visual asset.";
    return {
      ok: false,
      status: 400,
      reason: "invalid_file",
      error: message,
    };
  }

  const response = await tongsFetch(`/tongs/workpieces/${encodeURIComponent(args.workpieceId)}/commit-file`, {
    method: "POST",
    json: {
      path: uploadPath,
      content_type: mimeType,
      file_type: mimeType.startsWith("video/") ? "video_clip" : "image_map_candidate",
      bytes_base64: bytesBase64,
      written_by: buildWrittenBy(),
      event_name: "hearth.image_map.asset.uploaded.v1",
      event_payload: {
        source: "visual_beats_panel",
        entry_id: args.entryId,
        file_name: args.file.name,
        mime_type: mimeType,
        preparation_evidence: args.preparationEvidence ?? null,
      },
      correlation_id: `hearth-image-map-upload-${Date.now().toString(36)}`,
    },
  });
  const body = await readBodyAsJson(response);
  if (!response.ok || !isRecord(body) || body.ok !== true) {
    return {
      ok: false,
      status: response.status,
      reason: "request_failed",
      error: readApiErrorMessage(body) ?? "Upload failed.",
    };
  }

  const verified = await tongsFetch(
    `/tongs/workpieces/${encodeURIComponent(args.workpieceId)}/read-file?path=${encodeURIComponent(uploadPath)}&encoding=base64`,
    { method: "GET" },
  );
  const verifiedBody = await readBodyAsJson(verified);
  const verifiedData = isRecord(verifiedBody) && isRecord(verifiedBody.data) ? verifiedBody.data : null;
  if (!verified.ok || readString(verifiedData?.bytes_base64) !== bytesBase64) {
    return {
      ok: false,
      status: verified.status,
      reason: "invalid_response",
      error: "The image was uploaded, but Tongs could not verify the stored bytes. It was not attached to the episode.",
    };
  }

  return {
    ok: true,
    candidateAsset: {
      asset_id: candidateId,
      path: uploadPath,
      variant_label: variantLabel,
      visual_mode: null,
      mime_type: mimeType,
      source,
    },
  };
}

export async function selectWorkpieceImageMapCandidate(args: {
  workpieceId: string;
  workspaceId: string;
  imageMapEntryId: string;
  candidateAssetId: string;
  expectedMetadataUpdatedAt?: string | null;
  currentImageMap?: WorkpieceImageMapView | null;
}): Promise<SelectWorkpieceImageMapCandidateResult> {
  const currentImageMap = args.currentImageMap ?? null;
  const canonical = currentImageMap?.authoritySource === "canonical" && currentImageMap.revisionId && currentImageMap.revision
    ? currentImageMap
    : await (async () => {
    const fetched = await getWorkpieceImageMap(args.workpieceId);
    return fetched.ok ? fetched.imageMap : null;
  })();

  if (!canonical || canonical.workpieceId !== args.workpieceId || canonical.workspaceId !== args.workspaceId) {
    return {
      ok: false,
      status: 400,
      reason: "invalid_response",
      error: "Image map could not be loaded for selection.",
    };
  }

  const entry = canonical.entries.find((candidate) => candidate.id === args.imageMapEntryId) ?? null;
  if (!entry) {
    return {
      ok: false,
      status: 404,
      reason: "entry_not_found",
      error: "Image map entry was not found.",
    };
  }
  if (!entry.candidate_assets.some((asset) => asset.asset_id === args.candidateAssetId)) {
    return {
      ok: false,
      status: 400,
      reason: "candidate_not_attached",
      error: "Selected image is no longer attached to this visual beat.",
    };
  }
  const authorityResponse = await tongsFetch(
    `/tongs/workspaces/${encodeURIComponent(args.workspaceId)}/assets/${encodeURIComponent(args.candidateAssetId)}/resolve-authority`,
    {
      method: "POST",
      json: {
        expected_workpiece_id: args.workpieceId,
        required_asset_kind: "image_map_candidate_image",
      },
    },
  );
  const authorityBody = await readBodyAsJson(authorityResponse);
  const authority = isRecord(authorityBody) && isRecord(authorityBody.data) && isRecord(authorityBody.data.authority)
    ? authorityBody.data.authority
    : null;
  if (!authorityResponse.ok || authority?.state !== "ready") {
    return {
      ok: false,
      status: authorityResponse.ok ? 409 : authorityResponse.status,
      reason: "request_failed",
      error: readApiErrorMessage(authorityBody) ?? "Tongs has not validated this media as a ready canonical asset for this episode.",
    };
  }
  if (entry.selected_asset_id === args.candidateAssetId) {
    return {
      ok: true,
      imageMap: canonical,
    };
  }

  if (canonical.authoritySource !== "canonical" || !canonical.revisionId || !canonical.revision) {
    return {
      ok: false,
      status: 409,
      reason: "conflict",
      error: "Apply the visual plan before selecting an image.",
      latest: canonical,
    };
  }

  const response = await tongsFetch(`/tongs/workpieces/${encodeURIComponent(args.workpieceId)}/image-map/select-candidate`, {
    method: "POST",
    json: {
      workspace_id: args.workspaceId,
      image_map_entry_id: args.imageMapEntryId,
      candidate_asset_id: args.candidateAssetId,
      expected_current_revision: canonical.revision,
      expected_current_revision_id: canonical.revisionId,
      operation_id: `forge:image-map:select:${canonical.revisionId}:${args.candidateAssetId}`,
    },
  });
  const body = await readBodyAsJson(response);

  if (!response.ok) {
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
    return {
      ok: false,
      status: response.status,
      reason: "request_failed",
      error: readApiErrorMessage(body) ?? "Unable to save image selection.",
    };
  }

  const imageMap = normalizeWorkpieceImageMapView(body, { workpieceId: args.workpieceId, workspaceId: args.workspaceId });
  if (!imageMap) return { ok: false, status: response.status, reason: "invalid_response", error: "Image map selection returned an invalid response." };

  return {
    ok: true,
    imageMap,
  };
}
