import { tongsFetch } from "./tongs-fetch";
import type { EpisodeBrollAssetCandidate, EpisodeBrollSourceType } from "./episode-package-v2";

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
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

  return {
    ok: true,
    candidateAsset: {
      asset_id: candidateId,
      source: args.source,
      asset_class: args.assetClass ?? "broll",
      source_beat_id: args.beatId,
      source_label: readString(args.sourceLabel),
      source_url: readString(args.sourceUrl),
      provider_note: readString(args.providerNote),
      usage_note: readString(args.usageNote),
      asset_category: "uploaded_video",
      label: args.file.name,
      path: uploadPath,
      mime_type: mimeType,
      attached_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    },
  };
}
