import { tongsFetch } from "./tongs-fetch";

export type HearthAttachmentParseStatus = "pending" | "attached" | "failed" | "needs_text_extraction";

export type HearthAttachmentRecord = {
  id: string;
  workspace_id: string;
  episode_id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  storage_path: string;
  storage_key: string;
  extracted_text: string | null;
  parse_status: HearthAttachmentParseStatus;
  parse_error: string | null;
  text_source: "parser_a" | "parser_b" | "manual" | null;
  created_at: string;
  updated_at: string;
};

export type HearthUploadAttachmentResult =
  | { ok: true; status: number; attachment: HearthAttachmentRecord }
  | { ok: false; status: number; error: string };

export type HearthUpdateExtractedTextResult =
  | { ok: true; status: number; attachment: HearthAttachmentRecord }
  | { ok: false; status: number; error: string };

export type HearthListAttachmentsResult =
  | { ok: true; status: number; attachments: HearthAttachmentRecord[] }
  | { ok: false; status: number; reason: "unavailable" | "failed"; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function readTrimmed(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function normalizeAttachment(value: unknown): HearthAttachmentRecord | null {
  if (!isRecord(value)) return null;
  const id = readTrimmed(value.id);
  const workspaceId = readTrimmed(value.workspace_id);
  const episodeId = readTrimmed(value.episode_id);
  if (!id || !workspaceId || !episodeId) return null;

  const parseStatus = value.parse_status === "attached"
    || value.parse_status === "failed"
    || value.parse_status === "needs_text_extraction"
    ? value.parse_status
    : "pending";

  const sizeBytes = typeof value.size_bytes === "number" && Number.isFinite(value.size_bytes)
    ? value.size_bytes
    : Number.parseInt(String(value.size_bytes ?? "0"), 10) || 0;

  return {
    id,
    workspace_id: workspaceId,
    episode_id: episodeId,
    filename: readTrimmed(value.filename) ?? "attachment",
    mime_type: readTrimmed(value.mime_type) ?? "application/octet-stream",
    size_bytes: sizeBytes,
    storage_path: readTrimmed(value.storage_path) ?? "",
    storage_key: readTrimmed(value.storage_key) ?? "",
    extracted_text: typeof value.extracted_text === "string" ? value.extracted_text : null,
    parse_status: parseStatus,
    parse_error: typeof value.parse_error === "string" ? value.parse_error : null,
    text_source: value.text_source === "parser_a" || value.text_source === "parser_b" || value.text_source === "manual"
      ? value.text_source
      : null,
    created_at: readTrimmed(value.created_at) ?? new Date().toISOString(),
    updated_at: readTrimmed(value.updated_at) ?? new Date().toISOString(),
  };
}

function readApiError(payload: unknown, fallback: string): string {
  if (!isRecord(payload)) return fallback;
  if (typeof payload.error === "string" && payload.error.trim()) return payload.error;
  if (typeof payload.message === "string" && payload.message.trim()) return payload.message;
  return fallback;
}

function isUnauthorizedStatus(status: number): boolean {
  return status === 401 || status === 403;
}

export async function listHearthAttachments(args: {
  workspaceId: string;
  episodeId: string;
}): Promise<HearthListAttachmentsResult> {
  const params = new URLSearchParams({
    workspace_id: args.workspaceId,
    episode_id: args.episodeId,
  });

  let response: Response;
  try {
    response = await tongsFetch(`/tongs/hearth/attachments?${params.toString()}`, {
      method: "GET",
    });
  } catch {
    return {
      ok: false,
      status: 0,
      reason: "failed",
      error: "Unable to load attachments.",
    };
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (response.status === 404) {
    return {
      ok: false,
      status: response.status,
      reason: "unavailable",
      error: "Attachment discovery is currently unavailable.",
    };
  }

  if (!response.ok) {
    const fallback = isUnauthorizedStatus(response.status)
      ? "Sign in to load attachments."
      : `Attachment list failed (${response.status}).`;
    return {
      ok: false,
      status: response.status,
      reason: response.status === 501 || response.status === 503 ? "unavailable" : "failed",
      error: readApiError(payload, fallback),
    };
  }

  if (!isRecord(payload) || payload.ok !== true || !isRecord(payload.data) || !Array.isArray(payload.data.attachments)) {
    return {
      ok: false,
      status: response.status,
      reason: "failed",
      error: "Attachment discovery returned a malformed response.",
    };
  }
  const rows = payload.data.attachments;
  const attachments = rows
    .map((row) => normalizeAttachment(row))
    .filter((row): row is HearthAttachmentRecord => !!row);
  if (rows.length > 0 && attachments.length === 0) {
    return {
      ok: false,
      status: response.status,
      reason: "failed",
      error: "Attachment discovery returned no structurally usable entries.",
    };
  }
  return {
    ok: true,
    status: response.status,
    attachments,
  };
}

export async function uploadHearthAttachment(args: {
  workspaceId: string;
  episodeId: string;
  file: File;
}): Promise<HearthUploadAttachmentResult> {
  const formData = new FormData();
  formData.set("workspace_id", args.workspaceId);
  formData.set("episode_id", args.episodeId);
  formData.set("original_filename", args.file.name);
  formData.set("mime_type", args.file.type || "application/octet-stream");
  formData.set("file", args.file, args.file.name);

  const response = await tongsFetch("/tongs/hearth/attachments", {
    method: "POST",
    body: formData,
  });

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const fallback = response.status === 404
      ? "Attachments are unavailable in this environment."
      : isUnauthorizedStatus(response.status)
        ? "Sign in to upload attachments."
        : `Attachment upload failed (${response.status}).`;
    return {
      ok: false,
      status: response.status,
      error: readApiError(payload, fallback),
    };
  }

  const attachment = isRecord(payload) && isRecord(payload.data)
    ? normalizeAttachment(payload.data.attachment)
    : null;

  if (!attachment) {
    return {
      ok: false,
      status: response.status,
      error: "Attachment upload succeeded but response payload was invalid.",
    };
  }

  return {
    ok: true,
    status: response.status,
    attachment,
  };
}

export async function updateHearthAttachmentExtractedText(args: {
  attachmentId: string;
  workspaceId: string;
  extractedText: string;
}): Promise<HearthUpdateExtractedTextResult> {
  const response = await tongsFetch(
    `/tongs/hearth/attachments/${encodeURIComponent(args.attachmentId)}/extracted-text`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workspace_id: args.workspaceId,
        extracted_text: args.extractedText,
      }),
    },
  );

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const fallback = isUnauthorizedStatus(response.status)
      ? "Sign in to update attachment text."
      : `Failed to save text (${response.status}).`;
    return {
      ok: false,
      status: response.status,
      error: readApiError(payload, fallback),
    };
  }

  const attachment = isRecord(payload) && isRecord(payload.data)
    ? normalizeAttachment(payload.data.attachment)
    : null;

  if (!attachment) {
    return {
      ok: false,
      status: response.status,
      error: "Save succeeded but response payload was invalid.",
    };
  }

  return {
    ok: true,
    status: response.status,
    attachment,
  };
}
