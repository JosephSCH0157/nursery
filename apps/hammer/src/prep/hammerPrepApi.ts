import type { MediaKind } from "../../../../packages/contracts/hammer/media-resolver.contract";

export const HAMMER_TRANSCRIPT_PREP_ROUTE = "/api/hammer/prep/transcript";

export interface HammerTranscriptPrepRequest {
  workspace_id: string;
  workpiece_id: string;
  media_kind: MediaKind;
  local_root_abs: string;
  local_relpath: string;
  mime_type?: string | null;
}

export interface HammerTranscriptPrepSegment {
  id?: string | null;
  start: number;
  end: number;
  text: string;
  speaker: string | null;
  confidence?: number | null;
}

export interface HammerTranscriptPrepResponse {
  provider: "openai";
  model: string;
  provider_request_id: string | null;
  text: string | null;
  segments: HammerTranscriptPrepSegment[];
}

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function readNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function readObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function normalizeSegment(value: unknown, index: number): HammerTranscriptPrepSegment | null {
  const row = readObject(value);
  if (!row) return null;

  const start = readNumber(row.start);
  const end = readNumber(row.end);
  const text = readString(row.text);
  if (start == null || end == null || end <= start || !text) {
    return null;
  }

  return {
    id: readString(row.id) ?? `seg_${index + 1}`,
    start,
    end,
    text,
    speaker: readString(row.speaker),
    confidence: readNumber(row.confidence),
  };
}

function readErrorMessage(payload: unknown): string {
  const row = readObject(payload);
  const error = readObject(row?.error);
  return readString(error?.message)
    ?? readString(row?.message)
    ?? readString(row?.detail)
    ?? "Hammer transcript prep failed.";
}

function normalizeResponse(payload: unknown): HammerTranscriptPrepResponse | null {
  const root = readObject(payload);
  const data = readObject(root?.data);
  const segmentsRaw = Array.isArray(data?.segments) ? data.segments : null;
  const model = readString(data?.model);
  if (!segmentsRaw || !model) {
    return null;
  }

  const segments = segmentsRaw
    .map((segment, index) => normalizeSegment(segment, index))
    .filter((segment): segment is HammerTranscriptPrepSegment => Boolean(segment));

  return {
    provider: "openai",
    model,
    provider_request_id: readString(data?.provider_request_id),
    text: readString(data?.text),
    segments,
  };
}

export async function requestHammerTranscriptPrep(
  request: HammerTranscriptPrepRequest,
): Promise<HammerTranscriptPrepResponse> {
  const response = await fetch(HAMMER_TRANSCRIPT_PREP_ROUTE, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(request),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(readErrorMessage(payload));
  }

  const normalized = normalizeResponse(payload);
  if (!normalized) {
    throw new Error("Hammer transcript prep returned an invalid response.");
  }

  return normalized;
}
