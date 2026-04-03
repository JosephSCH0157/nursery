import { tongsFetch } from "../lib/tongsFetch";
import { loadWorkpieceMediaPreviewUrl, normalizeWorkpieceRelativePath } from "../lib/hammerSourceDeskMediaApi";

const RECORDING_CARD_THUMBNAIL_STATE_PATH = "hammer/session/recording-card-thumbnail.v1.json";

function readObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i] ?? 0);
  }
  return btoa(binary);
}

function sanitizePathToken(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-");
}

function inferVideoMimeTypeFromPath(path: string): string {
  const value = path.trim().toLowerCase();
  if (value.endsWith(".webm")) return "video/webm";
  if (value.endsWith(".mov")) return "video/quicktime";
  if (value.endsWith(".m4v")) return "video/x-m4v";
  return "video/mp4";
}

function buildRecordingCardThumbnailPath(workpieceId: string): string {
  return `assets/thumbnails/recording-card-${sanitizePathToken(workpieceId)}.jpg`;
}

async function commitWorkpieceBinaryFile(args: {
  workpieceId: string;
  path: string;
  bytes: Uint8Array;
  contentType: string;
}): Promise<void> {
  const response = await tongsFetch(
    `/tongs/workpieces/${encodeURIComponent(args.workpieceId)}/commit-file`,
    {
      method: "POST",
      json: {
        path: args.path,
        content_type: args.contentType,
        bytes_base64: toBase64(args.bytes),
      },
      timeoutMs: 45_000,
    },
  );
  if (!response.ok) {
    throw new Error("Hammer could not save recording thumbnail image.");
  }
}

async function commitWorkpieceJsonFile(args: {
  workpieceId: string;
  path: string;
  value: Record<string, unknown>;
}): Promise<void> {
  const response = await tongsFetch(
    `/tongs/workpieces/${encodeURIComponent(args.workpieceId)}/commit-file`,
    {
      method: "POST",
      json: {
        path: args.path,
        content_type: "application/json",
        json: args.value,
      },
      timeoutMs: 30_000,
    },
  );
  if (!response.ok) {
    throw new Error("Hammer could not save recording thumbnail metadata.");
  }
}

function isFrameTooDark(pixels: Uint8ClampedArray): boolean {
  let totalLuma = 0;
  const sampleCount = Math.max(1, Math.floor(pixels.length / 4));
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i] ?? 0;
    const g = pixels[i + 1] ?? 0;
    const b = pixels[i + 2] ?? 0;
    totalLuma += (0.2126 * r) + (0.7152 * g) + (0.0722 * b);
  }
  const averageLuma = totalLuma / sampleCount;
  return averageLuma < 16;
}

async function awaitVideoEvent(video: HTMLVideoElement, eventName: "loadedmetadata" | "seeked"): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const onResolve = () => {
      cleanup();
      resolve();
    };
    const onReject = () => {
      cleanup();
      reject(new Error(`Video event failed: ${eventName}`));
    };
    const cleanup = () => {
      video.removeEventListener(eventName, onResolve);
      video.removeEventListener("error", onReject);
    };
    video.addEventListener(eventName, onResolve, { once: true });
    video.addEventListener("error", onReject, { once: true });
  });
}

async function captureVideoFrameThumbnail(args: {
  src: string;
  seekCandidatesSec: number[];
}): Promise<{ jpegBytes: Uint8Array; selectedSec: number } | null> {
  if (typeof document === "undefined") return null;

  const video = document.createElement("video");
  video.preload = "auto";
  video.muted = true;
  video.src = args.src;
  await awaitVideoEvent(video, "loadedmetadata");
  const duration = Number.isFinite(video.duration) ? video.duration : 0;
  const safeDuration = Math.max(0, duration);
  const width = Math.max(320, Math.min(960, Math.round(video.videoWidth || 640)));
  const height = Math.max(180, Math.min(540, Math.round((width / Math.max(1, video.videoWidth || 640)) * (video.videoHeight || 360))));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return null;

  const normalizedCandidates = args.seekCandidatesSec
    .map((candidate) => Math.max(0.05, Math.min(Math.max(0.05, safeDuration - 0.05), candidate)))
    .filter((candidate, index, list) => list.indexOf(candidate) === index);

  let fallbackBlob: Blob | null = null;
  let fallbackSec: number | null = null;

  for (const candidateSec of normalizedCandidates) {
    video.currentTime = candidateSec;
    await awaitVideoEvent(video, "seeked");
    context.drawImage(video, 0, 0, width, height);
    const frame = context.getImageData(0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.86));
    if (!blob) continue;
    if (!fallbackBlob) {
      fallbackBlob = blob;
      fallbackSec = candidateSec;
    }
    if (isFrameTooDark(frame.data)) {
      continue;
    }
    const bytes = new Uint8Array(await blob.arrayBuffer());
    return { jpegBytes: bytes, selectedSec: candidateSec };
  }

  if (!fallbackBlob || fallbackSec == null) return null;
  return {
    jpegBytes: new Uint8Array(await fallbackBlob.arrayBuffer()),
    selectedSec: fallbackSec,
  };
}

export async function ensureWorkpieceRecordingCardThumbnail(args: {
  workpieceId: string;
  recordingPath: string;
  existingThumbnailPath?: string | null;
}): Promise<string | null> {
  const normalizedRecordingPath = normalizeWorkpieceRelativePath(args.workpieceId, args.recordingPath);
  if (!normalizedRecordingPath) return null;

  if (args.existingThumbnailPath) {
    return args.existingThumbnailPath;
  }
  const persistedState = await loadWorkpieceRecordingCardThumbnailState(args.workpieceId).catch(() => ({ thumbnailPath: null }));
  if (persistedState.thumbnailPath) {
    return persistedState.thumbnailPath;
  }

  const recordingUrl = await loadWorkpieceMediaPreviewUrl({
    workpieceId: args.workpieceId,
    path: normalizedRecordingPath,
    mimeType: inferVideoMimeTypeFromPath(normalizedRecordingPath),
  });
  try {
    const capture = await captureVideoFrameThumbnail({
      src: recordingUrl,
      seekCandidatesSec: [3, 2, 4, 5],
    });
    if (!capture) return null;

    const thumbnailPath = buildRecordingCardThumbnailPath(args.workpieceId);
    await commitWorkpieceBinaryFile({
      workpieceId: args.workpieceId,
      path: thumbnailPath,
      bytes: capture.jpegBytes,
      contentType: "image/jpeg",
    });
    await commitWorkpieceJsonFile({
      workpieceId: args.workpieceId,
      path: RECORDING_CARD_THUMBNAIL_STATE_PATH,
      value: {
        schema_version: 1,
        recording_path: normalizedRecordingPath,
        thumbnail_path: thumbnailPath,
        selected_frame_sec: capture.selectedSec,
        updated_at: new Date().toISOString(),
      },
    });
    return thumbnailPath;
  } finally {
    URL.revokeObjectURL(recordingUrl);
  }
}

export async function loadWorkpieceRecordingCardThumbnailState(workpieceId: string): Promise<{ thumbnailPath: string | null }> {
  const response = await tongsFetch(
    `/tongs/workpieces/${encodeURIComponent(workpieceId)}/read-file?path=${encodeURIComponent(RECORDING_CARD_THUMBNAIL_STATE_PATH)}`,
    {
      method: "GET",
      headers: {
        accept: "application/json",
      },
      timeoutMs: 30_000,
    },
  );
  if (response.status === 404) {
    return { thumbnailPath: null };
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    return { thumbnailPath: null };
  }
  const root = readObject(payload);
  if (root?.exists !== true) return { thumbnailPath: null };
  const data = readObject(root?.data);
  return {
    thumbnailPath: typeof data?.thumbnail_path === "string" ? data.thumbnail_path : null,
  };
}
