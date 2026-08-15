import { HAMMER_RUNTIME_WRITTEN_BY } from "../prep/hammerPrep";
import { tongsFetch } from "./tongsFetch";
import { normalizeWorkpieceRelativePath } from "../../../../packages/contracts/workpiece-paths";
import { recordHammerBandwidthFetch } from "./hammerBandwidthTelemetry";
import { deriveStableHammerAssetIdFromPath } from "./hammerAssetIdentity";
export { normalizeWorkpieceRelativePath } from "../../../../packages/contracts/workpiece-paths";

const INTRO_OUTRO_SELECTION_PATH = "hammer/session/intro-outro.v1.json";
const WORKSPACE_INTRO_OUTRO_DEFAULTS_PATH = "hammer/settings/intro-outro-defaults.v1.json";
const SOURCE_DESK_UPLOAD_BASE_PATH = "assets/uploads";

export type HammerStoredMediaKind = "image" | "broll" | "reference_clip" | "audio" | "other";
export type HammerStoredMediaRole = "thumbnail" | "timeline_visual";
export type HammerSourceDeskUploadCategory = "images" | "broll" | "introoutro";

export type HammerStoredMediaFile = {
  path: string;
  name: string;
  kind: HammerStoredMediaKind;
  bytes: number | null;
  updatedAt: string | null;
  roles: HammerStoredMediaRole[];
};

export type HammerIntroOutroSelection = {
  schema_version: 1;
  intro_asset_id: string | null;
  outro_asset_id: string | null;
  updated_at: string;
};

export type HammerIntroOutroDefaultsSource = {
  workpiece_id: string;
  path: string;
};

export type HammerWorkspaceIntroOutroDefaults = {
  schema_version: 1;
  intro: HammerIntroOutroDefaultsSource | null;
  outro: HammerIntroOutroDefaultsSource | null;
  updated_at: string;
};

type StorageNode = {
  kind: "directory" | "file";
  path: string;
  bytes?: number | null;
  updated_at?: string | null;
  children?: StorageNode[];
  roles?: HammerStoredMediaRole[];
};

type TongsFetcher = typeof tongsFetch;

function readJsonObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function readNullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function classifyHammerStoredMediaKind(path: string): HammerStoredMediaKind {
  const normalized = path.toLowerCase();
  const isBrollPlanUpload = normalized.includes("assets/broll-plan/uploads/");
  const isExplicitBroll = (
    normalized.includes("assets/broll-plan/")
    || normalized.includes("assets/uploads/broll/")
    || normalized.includes("assets/broll/")
  );
  const isImage = (
    normalized.endsWith(".jpg")
    || normalized.endsWith(".jpeg")
    || normalized.endsWith(".png")
    || normalized.endsWith(".gif")
    || normalized.endsWith(".webp")
  );
  const isVideo = (
    normalized.endsWith(".mp4")
    || normalized.endsWith(".mov")
    || normalized.endsWith(".m4v")
    || normalized.endsWith(".webm")
  );
  if (normalized.includes("reference_clip") || normalized.includes("reference-clips") || normalized.includes("reference_clips")) {
    return "reference_clip";
  }
  if (normalized.includes("contextual_data_composite") || normalized.includes("/cdc") || normalized.includes("cdc-")) {
    return "reference_clip";
  }
  if (isBrollPlanUpload && isImage) {
    return "reference_clip";
  }
  if (isImage) {
    return "image";
  }
  if (isVideo && isExplicitBroll) {
    return "broll";
  }
  if (
    normalized.endsWith(".wav")
    || normalized.endsWith(".mp3")
    || normalized.endsWith(".aac")
    || normalized.endsWith(".m4a")
  ) {
    return "audio";
  }
  return "other";
}

export function classifyHammerStoredMediaRoles(
  path: string,
  explicitRoles?: readonly HammerStoredMediaRole[] | null,
): HammerStoredMediaRole[] {
  if (explicitRoles?.length) return [...new Set(explicitRoles)];
  const normalized = `/${path.replace(/\\/g, "/").toLowerCase()}`;
  if (normalized.includes("/thumbnails/") || normalized.includes("/thumbnail/")) {
    return ["thumbnail"];
  }
  if (
    normalized.includes("/assets/image-map/candidates/")
    || normalized.includes("/assets/uploads/images/")
    || normalized.includes("/assets/broll-plan/")
    || normalized.includes("/reference-clips/")
    || normalized.includes("/reference_clips/")
    || normalized.includes("/reference-visuals/")
    || normalized.includes("/reference_visuals/")
  ) {
    return ["timeline_visual"];
  }
  return [];
}

function basename(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const parts = normalized.split("/");
  return parts[parts.length - 1] ?? path;
}

type HammerMediaPreviewErrorDiagnostics = {
  workpieceId: string;
  originalPath: string;
  normalizedPath: string;
  status: number | null;
};

type HammerPreviewCacheEntry = {
  bytes: ArrayBuffer;
  contentType: string;
};

const previewResponseCache = new Map<string, HammerPreviewCacheEntry>();
const previewResponseInflight = new Map<string, Promise<HammerPreviewCacheEntry>>();

export function buildHammerAssetIdentityKey(args: {
  workpieceId: string;
  assetId: string;
  variantKind: "thumb" | "preview" | "original";
  variantVersion: number;
}): string {
  const version = Number.isFinite(args.variantVersion) && args.variantVersion > 0
    ? Math.trunc(args.variantVersion)
    : 1;
  return `${args.workpieceId}:${args.assetId}:${args.variantKind}:v${version}`;
}

type HammerMediaPreviewLoadError = Error & HammerMediaPreviewErrorDiagnostics;

function createMediaPreviewLoadError(args: HammerMediaPreviewErrorDiagnostics): HammerMediaPreviewLoadError {
  return Object.assign(new Error("Hammer could not load Source Desk media preview."), args);
}

export function readHammerMediaPreviewErrorDiagnostics(error: unknown): HammerMediaPreviewErrorDiagnostics | null {
  if (!(error instanceof Error)) return null;
  const diagnostics = error as Partial<HammerMediaPreviewErrorDiagnostics>;
  if (
    typeof diagnostics.workpieceId !== "string"
    || typeof diagnostics.originalPath !== "string"
    || typeof diagnostics.normalizedPath !== "string"
  ) {
    return null;
  }
  return {
    workpieceId: diagnostics.workpieceId,
    originalPath: diagnostics.originalPath,
    normalizedPath: diagnostics.normalizedPath,
    status: typeof diagnostics.status === "number" ? diagnostics.status : null,
  };
}

function flattenStorageFiles(nodes: StorageNode[], workpieceId: string): HammerStoredMediaFile[] {
  const files: HammerStoredMediaFile[] = [];
  const walk = (node: StorageNode) => {
    if (node.kind === "file") {
      const workpieceRelativePath = normalizeWorkpieceRelativePath(workpieceId, node.path);
      files.push({
        path: workpieceRelativePath,
        name: basename(workpieceRelativePath),
        kind: classifyHammerStoredMediaKind(workpieceRelativePath),
        bytes: readNullableNumber(node.bytes),
        updatedAt: readString(node.updated_at),
        roles: classifyHammerStoredMediaRoles(workpieceRelativePath, node.roles),
      });
      return;
    }
    for (const child of node.children ?? []) walk(child);
  };
  for (const node of nodes) walk(node);
  return files;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i] ?? 0);
  }
  return btoa(binary);
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-");
}

function normalizeMimeType(file: File): string {
  const value = file.type.trim().toLowerCase();
  if (value) return value;
  const filename = file.name.toLowerCase();
  if (filename.endsWith(".jpg") || filename.endsWith(".jpeg")) return "image/jpeg";
  if (filename.endsWith(".png")) return "image/png";
  if (filename.endsWith(".webp")) return "image/webp";
  if (filename.endsWith(".gif")) return "image/gif";
  if (filename.endsWith(".mp4")) return "video/mp4";
  if (filename.endsWith(".mov")) return "video/quicktime";
  if (filename.endsWith(".webm")) return "video/webm";
  if (filename.endsWith(".wav")) return "audio/wav";
  if (filename.endsWith(".mp3")) return "audio/mpeg";
  if (filename.endsWith(".m4a")) return "audio/mp4";
  if (filename.endsWith(".aac")) return "audio/aac";
  return "application/octet-stream";
}

export function buildSourceDeskUploadPath(args: {
  category: HammerSourceDeskUploadCategory;
  filename: string;
  timestampMs?: number;
}): string {
  const safeName = sanitizeFilename(args.filename || "upload.bin");
  const stamp = Number.isFinite(args.timestampMs) ? Math.trunc(args.timestampMs ?? Date.now()) : Date.now();
  return `${SOURCE_DESK_UPLOAD_BASE_PATH}/${args.category}/${stamp}-${safeName}`;
}

export function isAcceptedSourceDeskMediaUpload(args: {
  category: HammerSourceDeskUploadCategory;
  mimeType: string;
  filename: string;
}): boolean {
  const mimeType = args.mimeType.trim().toLowerCase();
  const filename = args.filename.trim().toLowerCase();
  const isImage = mimeType.startsWith("image/") || /\.(jpg|jpeg|png|gif|webp)$/.test(filename);
  const isVideo = mimeType.startsWith("video/") || /\.(mp4|mov|m4v|webm)$/.test(filename);
  const isAudio = mimeType.startsWith("audio/") || /\.(wav|mp3|m4a|aac)$/.test(filename);

  if (args.category === "images") return isImage;
  if (args.category === "broll") return isVideo;
  return isVideo || isAudio;
}

export async function listWorkpieceStoredMedia(
  workpieceId: string,
  fetcher: TongsFetcher = tongsFetch,
): Promise<HammerStoredMediaFile[]> {
  const response = await fetcher(
    `/tongs/workpieces/${encodeURIComponent(workpieceId)}/storage`,
    {
      method: "GET",
      timeoutMs: 30_000,
    },
  );
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const root = readJsonObject(payload);
    const message = readString(readJsonObject(root?.error)?.message) ?? "Hammer could not list workpiece storage.";
    throw new Error(message);
  }

  const root = readJsonObject(payload);
  const data = readJsonObject(root?.data);
  const listing = readJsonObject(data?.listing ?? root?.listing);
  const nodes = Array.isArray(listing?.nodes) ? listing?.nodes as StorageNode[] : [];
  return flattenStorageFiles(nodes, workpieceId);
}

export async function uploadWorkpieceMediaFile(args: {
  workpieceId: string;
  file: File;
  category: HammerSourceDeskUploadCategory;
  timestampMs?: number;
  fetcher?: TongsFetcher;
}): Promise<{ path: string }> {
  const mimeType = normalizeMimeType(args.file);
  if (!isAcceptedSourceDeskMediaUpload({
    category: args.category,
    mimeType,
    filename: args.file.name,
  })) {
    throw new Error(`Hammer rejected unsupported ${args.category} media type.`);
  }

  const path = buildSourceDeskUploadPath({
    category: args.category,
    filename: args.file.name || "upload.bin",
    timestampMs: args.timestampMs,
  });
  const bytes = new Uint8Array(await args.file.arrayBuffer());
  const response = await (args.fetcher ?? tongsFetch)(
    `/tongs/workpieces/${encodeURIComponent(args.workpieceId)}/commit-file`,
    {
      method: "POST",
      json: {
        path,
        content_type: mimeType,
        written_by: { ...HAMMER_RUNTIME_WRITTEN_BY },
        bytes_base64: toBase64(bytes),
      },
      timeoutMs: 60_000,
    },
  );
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const root = readJsonObject(payload);
    const message = readString(readJsonObject(root?.error)?.message) ?? "Hammer could not upload media to workpiece storage.";
    throw new Error(message);
  }
  return { path };
}

export async function loadIntroOutroSelection(
  workpieceId: string,
  fetcher: TongsFetcher = tongsFetch,
): Promise<HammerIntroOutroSelection | null> {
  const response = await fetcher(
    `/tongs/workpieces/${encodeURIComponent(workpieceId)}/read-file?path=${encodeURIComponent(INTRO_OUTRO_SELECTION_PATH)}`,
    {
      method: "GET",
      timeoutMs: 30_000,
    },
  );
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    return null;
  }
  const root = readJsonObject(payload);
  if (root?.exists === false) return null;
  const data = readJsonObject(root?.data);
  if (!data) return null;
  const schemaVersion = data.schema_version === 1 ? 1 : 1;
  const introAssetId = readString(data.intro_asset_id);
  const outroAssetId = readString(data.outro_asset_id);
  const legacyIntroPath = readString(data.intro_path);
  const legacyOutroPath = readString(data.outro_path);
  return {
    schema_version: schemaVersion,
    intro_asset_id: introAssetId ?? (legacyIntroPath ? deriveStableHammerAssetIdFromPath(legacyIntroPath) : null),
    outro_asset_id: outroAssetId ?? (legacyOutroPath ? deriveStableHammerAssetIdFromPath(legacyOutroPath) : null),
    updated_at: readString(data.updated_at) ?? new Date().toISOString(),
  };
}

export async function saveIntroOutroSelection(args: {
  workpieceId: string;
  selection: HammerIntroOutroSelection;
  fetcher?: TongsFetcher;
}): Promise<void> {
  const response = await (args.fetcher ?? tongsFetch)(
    `/tongs/workpieces/${encodeURIComponent(args.workpieceId)}/commit-file`,
    {
      method: "POST",
      json: {
        path: INTRO_OUTRO_SELECTION_PATH,
        content_type: "application/json",
        written_by: { ...HAMMER_RUNTIME_WRITTEN_BY },
        json: args.selection,
      },
      timeoutMs: 30_000,
    },
  );
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const root = readJsonObject(payload);
    const message = readString(readJsonObject(root?.error)?.message) ?? "Hammer could not save intro/outro selection.";
    throw new Error(message);
  }
}

export async function loadWorkspaceIntroOutroDefaults(
  workspaceId: string,
  fetcher: TongsFetcher = tongsFetch,
): Promise<HammerWorkspaceIntroOutroDefaults | null> {
  const response = await fetcher(
    `/tongs/workspaces/${encodeURIComponent(workspaceId)}/read-file?path=${encodeURIComponent(WORKSPACE_INTRO_OUTRO_DEFAULTS_PATH)}`,
    {
      method: "GET",
      timeoutMs: 30_000,
    },
  );
  const payload = await response.json().catch(() => null);
  if (!response.ok) return null;
  const root = readJsonObject(payload);
  if (root?.exists === false) return null;
  const data = readJsonObject(root?.data);
  if (!data) return null;

  const intro = readJsonObject(data.intro);
  const outro = readJsonObject(data.outro);
  const introWorkpieceId = readString(intro?.workpiece_id);
  const introPath = readString(intro?.path);
  const outroWorkpieceId = readString(outro?.workpiece_id);
  const outroPath = readString(outro?.path);

  return {
    schema_version: 1,
    intro: introWorkpieceId && introPath ? { workpiece_id: introWorkpieceId, path: introPath } : null,
    outro: outroWorkpieceId && outroPath ? { workpiece_id: outroWorkpieceId, path: outroPath } : null,
    updated_at: readString(data.updated_at) ?? new Date().toISOString(),
  };
}

export async function saveWorkspaceIntroOutroDefaults(args: {
  workspaceId: string;
  defaults: HammerWorkspaceIntroOutroDefaults;
  fetcher?: TongsFetcher;
}): Promise<void> {
  const response = await (args.fetcher ?? tongsFetch)(
    `/tongs/workspaces/${encodeURIComponent(args.workspaceId)}/commit-file`,
    {
      method: "POST",
      json: {
        path: WORKSPACE_INTRO_OUTRO_DEFAULTS_PATH,
        content_type: "application/json",
        written_by: { ...HAMMER_RUNTIME_WRITTEN_BY },
        json: args.defaults,
      },
      timeoutMs: 30_000,
    },
  );
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const root = readJsonObject(payload);
    const message = readString(readJsonObject(root?.error)?.message) ?? "Hammer could not save workspace intro/outro defaults.";
    throw new Error(message);
  }
}

export async function copyWorkpieceMediaFile(args: {
  sourceWorkpieceId: string;
  sourcePath: string;
  destWorkpieceId: string;
  destPath: string;
  fetcher?: TongsFetcher;
}): Promise<void> {
  const fetcher = args.fetcher ?? tongsFetch;
  const sourcePath = normalizeWorkpieceRelativePath(args.sourceWorkpieceId, args.sourcePath);
  const destPath = normalizeWorkpieceRelativePath(args.destWorkpieceId, args.destPath);
  const sourceParams = new URLSearchParams({
    path: sourcePath,
    encoding: "base64",
  });
  const readResponse = await fetcher(
    `/tongs/workpieces/${encodeURIComponent(args.sourceWorkpieceId)}/read-file?${sourceParams.toString()}`,
    { method: "GET", timeoutMs: 60_000 },
  );
  const readPayload = await readResponse.json().catch(() => null);
  if (!readResponse.ok) {
    const root = readJsonObject(readPayload);
    const message = readString(readJsonObject(root?.error)?.message) ?? "Hammer could not read intro/outro defaults source media.";
    throw new Error(message);
  }

  const readRoot = readJsonObject(readPayload);
  const readData = readJsonObject(readRoot?.data);
  const bytesBase64 = readString(readData?.bytes_base64) ?? readString(readRoot?.bytes_base64);
  const contentType = readString(readData?.content_type) ?? readString(readRoot?.content_type) ?? "application/octet-stream";
  if (!bytesBase64) {
    throw new Error("Hammer could not read intro/outro defaults source media bytes.");
  }

  const commitResponse = await fetcher(
    `/tongs/workpieces/${encodeURIComponent(args.destWorkpieceId)}/commit-file`,
    {
      method: "POST",
      json: {
        path: destPath,
        content_type: contentType,
        written_by: { ...HAMMER_RUNTIME_WRITTEN_BY },
        bytes_base64: bytesBase64,
      },
      timeoutMs: 60_000,
    },
  );
  const commitPayload = await commitResponse.json().catch(() => null);
  if (!commitResponse.ok) {
    const root = readJsonObject(commitPayload);
    const message = readString(readJsonObject(root?.error)?.message) ?? "Hammer could not copy intro/outro defaults media into this episode.";
    throw new Error(message);
  }
}

export async function loadWorkpieceMediaPreviewUrl(args: {
  workpieceId: string;
  path: string;
  mimeType?: string | null;
  variantKind?: "thumb" | "preview";
  variantVersion?: number;
  assetId?: string | null;
  surface?: "source_desk_preview" | "project_library_preview" | "recording_card_preview" | "unknown";
  fetcher?: TongsFetcher;
}): Promise<string> {
  const normalizedPath = normalizeWorkpieceRelativePath(args.workpieceId, args.path);
  const variantKind = args.variantKind ?? "preview";
  const variantVersion = Number.isFinite(args.variantVersion) && (args.variantVersion ?? 0) > 0
    ? Math.trunc(args.variantVersion ?? 1)
    : 1;
  const assetIdentity = (args.assetId?.trim() || normalizedPath);
  const cacheKey = buildHammerAssetIdentityKey({
    workpieceId: args.workpieceId,
    assetId: assetIdentity,
    variantKind,
    variantVersion,
  });
  const params = new URLSearchParams({
    path: normalizedPath,
    encoding: "binary",
  });
  try {
    let cached = previewResponseCache.get(cacheKey) ?? null;
    if (!cached) {
      const inflight = previewResponseInflight.get(cacheKey);
      if (inflight) {
        cached = await inflight;
      } else {
        const requestPromise = (async () => {
          const response = await (args.fetcher ?? tongsFetch)(
            `/tongs/workpieces/${encodeURIComponent(args.workpieceId)}/read-file?${params.toString()}`,
            {
              method: "GET",
              headers: {
                accept: "application/octet-stream",
              },
              timeoutMs: 45_000,
            },
          );

          if (!response.ok) {
            throw createMediaPreviewLoadError({
              workpieceId: args.workpieceId,
              originalPath: args.path,
              normalizedPath,
              status: response.status,
            });
          }
          const bytes = await response.arrayBuffer();
          const contentType = response.headers.get("content-type")?.trim() || args.mimeType?.trim() || "application/octet-stream";
          const entry: HammerPreviewCacheEntry = { bytes, contentType };
          previewResponseCache.set(cacheKey, entry);
          previewResponseInflight.delete(cacheKey);
          recordHammerBandwidthFetch({
            assetKey: cacheKey,
            surface: args.surface ?? "source_desk_preview",
            bytes: bytes.byteLength,
          });
          return entry;
        })();
        previewResponseInflight.set(cacheKey, requestPromise);
        try {
          cached = await requestPromise;
        } catch (error) {
          previewResponseInflight.delete(cacheKey);
          throw error;
        }
      }
    }

    return URL.createObjectURL(new Blob([cached.bytes], { type: cached.contentType }));
  } catch (error) {
    const diagnostics = readHammerMediaPreviewErrorDiagnostics(error);
    if (diagnostics) throw error;
    throw createMediaPreviewLoadError({
      workpieceId: args.workpieceId,
      originalPath: args.path,
      normalizedPath,
      status: null,
    });
  }
}
