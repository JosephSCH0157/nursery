import { tongsFetch } from "./tongs-fetch";

export type HearthGenerationReferencePurpose = "subject" | "composition" | "style";
export type HearthGenerationReferenceImage = {
  schema_version: "hearth-generation-reference-image-v1";
  asset_id: string;
  path: string;
  content_hash: string;
  mime_type: "image/png" | "image/jpeg" | "image/webp";
  bytes: number;
  purpose: HearthGenerationReferencePurpose;
  original_filename: string;
  created_at: string;
};

function bytesToBase64(bytes: Uint8Array): string {
  let value = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) value += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return btoa(value);
}

function extension(mimeType: HearthGenerationReferenceImage["mime_type"]): string {
  return mimeType === "image/jpeg" ? "jpg" : mimeType.split("/")[1];
}

export async function uploadHearthGenerationReference(args: {
  workpieceId: string;
  targetKind: "thumbnail_direction" | "timeline_image";
  targetId: string;
  purpose: HearthGenerationReferencePurpose;
  file: File;
}): Promise<HearthGenerationReferenceImage> {
  const mimeType = args.file.type.toLowerCase() as HearthGenerationReferenceImage["mime_type"];
  if (!["image/png", "image/jpeg", "image/webp"].includes(mimeType)) throw new Error("Reference photos must be PNG, JPEG, or WebP.");
  if (args.file.size <= 0 || args.file.size > 20 * 1024 * 1024) throw new Error("Reference photos must be between 1 byte and 20 MB.");
  const bytes = new Uint8Array(await args.file.arrayBuffer());
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hash = Array.from(new Uint8Array(digest), (part) => part.toString(16).padStart(2, "0")).join("");
  const assetId = crypto.randomUUID();
  const path = `assets/generation-references/${args.targetKind}/${args.targetId}/${hash}.${extension(mimeType)}`;
  const response = await tongsFetch(`/tongs/workpieces/${encodeURIComponent(args.workpieceId)}/commit-file`, { method: "POST", json: {
    path, content_type: mimeType, file_type: "generation_reference_image", bytes_base64: bytesToBase64(bytes),
    written_by: { tool: "hearth", tool_version: "0.0.0", lane: "forge-managed" },
    event_name: "hearth.generation-reference.uploaded.v1",
    event_payload: { asset_id: assetId, target_kind: args.targetKind, target_id: args.targetId, purpose: args.purpose, content_hash: hash },
    correlation_id: `hearth-generation-reference-${assetId}`,
  } });
  const body = await response.json().catch(() => null) as { data?: { hash?: string; bytes?: number } } | null;
  if (!response.ok || body?.data?.hash !== hash || body.data.bytes !== bytes.length) throw new Error("Tongs could not verify the uploaded reference photo.");
  return { schema_version: "hearth-generation-reference-image-v1", asset_id: assetId, path, content_hash: hash,
    mime_type: mimeType, bytes: bytes.length, purpose: args.purpose, original_filename: args.file.name, created_at: new Date().toISOString() };
}
