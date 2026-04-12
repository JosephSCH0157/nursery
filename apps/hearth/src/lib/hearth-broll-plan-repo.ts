import { tongsFetch } from "./tongs-fetch";
import type { EpisodeBrollAssetCandidate, EpisodeBrollSourceType } from "./episode-package-v2";

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function readBodyAsJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function resolveUploadMimeType(file: File): string {
  const trimmed = readString(file.type)?.toLowerCase();
  if (trimmed) return trimmed;
  const lowerName = file.name.toLowerCase();
  if (lowerName.endsWith(".mp4")) return "video/mp4";
  if (lowerName.endsWith(".webm")) return "video/webm";
  if (lowerName.endsWith(".mov")) return "video/quicktime";
  if (lowerName.endsWith(".png")) return "image/png";
  if (lowerName.endsWith(".jpg") || lowerName.endsWith(".jpeg")) return "image/jpeg";
  return "application/octet-stream";
}

function extensionFromMimeType(mimeType: string): string {
  if (mimeType === "video/mp4") return "mp4";
  if (mimeType === "video/webm") return "webm";
  if (mimeType === "video/quicktime") return "mov";
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/png") return "png";
  const slash = mimeType.lastIndexOf("/");
  return slash >= 0 && slash < mimeType.length - 1 ? mimeType.slice(slash + 1).replace(/[^a-z0-9]+/g, "") : "bin";
}

function createClientId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}:${crypto.randomUUID()}`;
  }
  return `${prefix}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 10)}`;
}

async function waitForVideoEvent(video: HTMLVideoElement, eventName: "loadedmetadata" | "loadeddata" | "seeked"): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out while waiting for video ${eventName}.`));
    }, 12000);
    const onResolve = () => {
      cleanup();
      resolve();
    };
    const onReject = () => {
      cleanup();
      reject(new Error(`Video ${eventName} failed.`));
    };
    const cleanup = () => {
      window.clearTimeout(timeout);
      video.removeEventListener(eventName, onResolve);
      video.removeEventListener("error", onReject);
    };
    video.addEventListener(eventName, onResolve, { once: true });
    video.addEventListener("error", onReject, { once: true });
  });
}

async function renderVideoPosterFromBlob(args: {
  blob: Blob;
}): Promise<{ posterBytes: Uint8Array; durationMs: number | null }> {
  const objectUrl = URL.createObjectURL(args.blob);
  const video = document.createElement("video");
  video.preload = "metadata";
  video.muted = true;
  video.playsInline = true;
  video.src = objectUrl;

  try {
    await waitForVideoEvent(video, "loadedmetadata");
    const durationSec = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
    const captureSec = durationSec > 0
      ? Math.min(Math.max(durationSec * 0.12, 0), Math.max(durationSec - 0.05, 0))
      : 0;
    if (captureSec > 0.05) {
      video.currentTime = captureSec;
      await waitForVideoEvent(video, "seeked");
    } else {
      await waitForVideoEvent(video, "loadeddata");
    }

    const sourceWidth = Math.max(1, Math.trunc(video.videoWidth || 0));
    const sourceHeight = Math.max(1, Math.trunc(video.videoHeight || 0));
    if (sourceWidth <= 1 || sourceHeight <= 1) {
      throw new Error("Uploaded video metadata is incomplete (missing frame dimensions).");
    }

    const maxWidth = 1280;
    const scale = sourceWidth > maxWidth ? (maxWidth / sourceWidth) : 1;
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Browser cannot initialize 2D canvas for poster generation.");
    }
    ctx.drawImage(video, 0, 0, width, height);

    const posterBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error("Poster generation produced an empty image."));
          return;
        }
        resolve(blob);
      }, "image/jpeg", 0.86);
    });

    const posterBytes = new Uint8Array(await posterBlob.arrayBuffer());
    const durationMs = durationSec > 0 ? Math.round(durationSec * 1000) : null;
    return { posterBytes, durationMs };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function loadWorkpieceFileBytes(args: {
  workpieceId: string;
  path: string;
}): Promise<{ ok: true; bytes: Uint8Array; contentType: string | null } | { ok: false; error: string }> {
  const response = await tongsFetch(
    `/tongs/workpieces/${encodeURIComponent(args.workpieceId)}/read-file?path=${encodeURIComponent(args.path)}&encoding=base64`,
    { method: "GET" },
  );
  if (!response.ok) {
    return { ok: false, error: "Uploaded media could not be read back for ingestion." };
  }
  const body = await readBodyAsJson(response);
  if (!isRecord(body) || body.ok !== true || !isRecord(body.data)) {
    return { ok: false, error: "Ingestion readback response was invalid." };
  }
  const bytesBase64 = readString(body.data.bytes_base64);
  if (!bytesBase64) {
    return { ok: false, error: "Ingestion readback returned empty media bytes." };
  }
  return {
    ok: true,
    bytes: base64ToBytes(bytesBase64),
    contentType: readString(body.data.content_type),
  };
}

async function persistGeneratedPoster(args: {
  workpieceId: string;
  beatId: string;
  assetId: string;
  posterBytes: Uint8Array;
}): Promise<{ ok: true; posterPath: string } | { ok: false; error: string }> {
  const posterPath = `assets/broll-plan/previews/${args.beatId}/${args.assetId}.jpg`;
  const response = await tongsFetch(`/tongs/workpieces/${encodeURIComponent(args.workpieceId)}/commit-file`, {
    method: "POST",
    json: {
      path: posterPath,
      content_type: "image/jpeg",
      file_type: "broll_preview_image",
      bytes_base64: bytesToBase64(args.posterBytes),
      written_by: {
        tool: "hearth",
        tool_version: "v1",
        lane: "hearth_broll_ingest",
      },
      event_name: "hearth.broll_plan.asset_ingested.v1",
      event_payload: {
        beat_id: args.beatId,
        asset_id: args.assetId,
        preview_path: posterPath,
      },
      correlation_id: createClientId("hearth-broll-ingest"),
    },
  });
  if (!response.ok) {
    const body = await readBodyAsJson(response);
    let error = "Uploaded media poster could not be persisted.";
    if (isRecord(body) && isRecord(body.error)) {
      const message = readString((body.error as Record<string, unknown>).message);
      if (message) error = message;
    }
    return { ok: false, error };
  }
  return { ok: true, posterPath };
}

function withFailedIngestion(candidateAsset: EpisodeBrollAssetCandidate, error: string): EpisodeBrollAssetCandidate {
  return {
    ...candidateAsset,
    ingest_status: "failed",
    ingest_error: error,
  };
}

export async function ingestBrollBeatAssetCandidate(args: {
  workpieceId: string;
  beatId: string;
  candidateAsset: EpisodeBrollAssetCandidate;
  file?: File | null;
}): Promise<EpisodeBrollAssetCandidate> {
  const mimeType = readString(args.candidateAsset.mime_type)?.toLowerCase()
    ?? (args.file ? resolveUploadMimeType(args.file) : null)
    ?? "application/octet-stream";

  if (mimeType.startsWith("image/")) {
    return {
      ...args.candidateAsset,
      ingest_status: "ready",
      ingest_error: null,
      thumbnail_path: args.candidateAsset.thumbnail_path ?? args.candidateAsset.path ?? null,
      preview_path: args.candidateAsset.preview_path ?? args.candidateAsset.thumbnail_path ?? args.candidateAsset.path ?? null,
    };
  }

  if (!mimeType.startsWith("video/")) {
    return withFailedIngestion(args.candidateAsset, "Unsupported media type for B-roll ingestion.");
  }

  let sourceBlob: Blob | null = null;
  if (args.file) {
    sourceBlob = args.file;
  } else {
    const sourcePath = readString(args.candidateAsset.path);
    if (!sourcePath) {
      return withFailedIngestion(args.candidateAsset, "Uploaded video path is missing.");
    }
    const loaded = await loadWorkpieceFileBytes({
      workpieceId: args.workpieceId,
      path: sourcePath,
    });
    if (!loaded.ok) {
      return withFailedIngestion(args.candidateAsset, loaded.error);
    }
    sourceBlob = new Blob([loaded.bytes], {
      type: loaded.contentType ?? mimeType,
    });
  }

  try {
    const rendered = await renderVideoPosterFromBlob({
      blob: sourceBlob,
    });
    const persistedPoster = await persistGeneratedPoster({
      workpieceId: args.workpieceId,
      beatId: args.beatId,
      assetId: args.candidateAsset.asset_id,
      posterBytes: rendered.posterBytes,
    });
    if (!persistedPoster.ok) {
      return withFailedIngestion(args.candidateAsset, persistedPoster.error);
    }
    return {
      ...args.candidateAsset,
      ingest_status: "ready",
      ingest_error: null,
      thumbnail_path: persistedPoster.posterPath,
      preview_path: persistedPoster.posterPath,
      duration_ms: rendered.durationMs ?? args.candidateAsset.duration_ms ?? null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Video poster generation failed.";
    return withFailedIngestion(args.candidateAsset, message);
  }
}

export type UploadBrollBeatAssetResult =
  | { ok: true; candidateAsset: EpisodeBrollAssetCandidate }
  | { ok: false; status: number; error: string };

export async function uploadBrollBeatAsset(args: {
  workpieceId: string;
  beatId: string;
  file: File;
  source: EpisodeBrollSourceType;
  assetClass?: "broll" | "reference_clip";
  sourceLabel?: string | null;
  sourceUrl?: string | null;
  providerNote?: string | null;
  usageNote?: string | null;
}): Promise<UploadBrollBeatAssetResult> {
  const mimeType = resolveUploadMimeType(args.file);
  const accepted = mimeType.startsWith("video/") || mimeType.startsWith("image/");
  if (!accepted) {
    return {
      ok: false,
      status: 400,
      error: "B-roll beat assets must be image or video files.",
    };
  }

  const candidateId = createClientId("broll-asset");
  const extension = extensionFromMimeType(mimeType) || "bin";
  const uploadPath = `assets/broll-plan/uploads/${args.beatId}/${candidateId}.${extension}`;
  const buffer = new Uint8Array(await args.file.arrayBuffer());

  const response = await tongsFetch(`/tongs/workpieces/${encodeURIComponent(args.workpieceId)}/commit-file`, {
    method: "POST",
    json: {
      path: uploadPath,
      content_type: mimeType,
      bytes_base64: bytesToBase64(buffer),
      written_by: {
        tool: "hearth",
        tool_version: "v1",
        lane: "hearth_broll_plan",
      },
      event_name: "hearth.broll_plan.asset_uploaded.v1",
      event_payload: {
        beat_id: args.beatId,
        source: args.source,
        bytes: buffer.byteLength,
      },
      correlation_id: createClientId("hearth-broll-upload"),
    },
  });

  if (!response.ok) {
    let error = "Unable to upload B-roll asset.";
    try {
      const body = await response.json();
      if (body && typeof body === "object" && body.error && typeof body.error === "object") {
        const message = readString((body.error as { message?: unknown }).message);
        if (message) error = message;
      }
    } catch {
      // ignore parsing errors
    }
    return {
      ok: false,
      status: response.status,
      error,
    };
  }

  const baseCandidate: EpisodeBrollAssetCandidate = {
    asset_id: candidateId,
    source: args.source,
    asset_class: args.assetClass ?? "broll",
    source_beat_id: args.beatId,
    source_label: readString(args.sourceLabel),
    source_url: readString(args.sourceUrl),
    provider_note: readString(args.providerNote),
    usage_note: readString(args.usageNote),
    ingest_status: mimeType.startsWith("video/") ? "processing" : "ready",
    ingest_error: null,
    asset_category: mimeType.startsWith("video/") ? "uploaded_video" : "animated_graphic",
    label: args.file.name,
    path: uploadPath,
    mime_type: mimeType,
    attached_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
  };

  const ingestedCandidate = await ingestBrollBeatAssetCandidate({
    workpieceId: args.workpieceId,
    beatId: args.beatId,
    candidateAsset: baseCandidate,
    file: args.file,
  });

  return {
    ok: true,
    candidateAsset: ingestedCandidate,
  };
}
