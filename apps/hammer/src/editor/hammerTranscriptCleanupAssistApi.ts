import type { HammerTranscriptSegment } from "../../../../packages/contracts/hammer/transcript.contract";
import type { HammerCleanupPreview } from "./hammerCleanupTools";
import { tongsFetch } from "../lib/tongsFetch";
import { deriveCustomerOperationId, readCustomerSpendingQuote, requestCustomerSpendingAcceptance } from "../../../../packages/tongs/src/customer-spending-confirmation";

export const HAMMER_TRANSCRIPT_CLEANUP_ASSIST_ROUTE = "/api/hammer/editorial/transcript-cleanup";

type HammerTranscriptCleanupAssistResponse = {
  preview: HammerCleanupPreview;
};

export class HammerTranscriptCleanupAssistError extends Error {
  readonly code: string | null;
  constructor(message: string, code: string | null) {
    super(message);
    this.name = "HammerTranscriptCleanupAssistError";
    this.code = code;
  }
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
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function readErrorMessage(payload: unknown): string {
  const row = readObject(payload);
  const error = readObject(row?.error);
  return readString(error?.message)
    ?? readString(row?.message)
    ?? readString(row?.detail)
    ?? "Hammer transcript cleanup assist failed.";
}

function readErrorCode(payload: unknown): string | null {
  const row = readObject(payload);
  return readString(readObject(row?.error)?.code);
}

function normalizeSegment(value: unknown, fallbackId: string): HammerTranscriptSegment | null {
  const row = readObject(value);
  if (!row) return null;
  const segmentId = readString(row.segment_id) ?? fallbackId;
  const startSec = readNumber(row.start_sec);
  const endSec = readNumber(row.end_sec);
  const speaker = readString(row.speaker);
  const text = readString(row.text);
  if (!segmentId || startSec == null || endSec == null || endSec <= startSec || !speaker || !text) {
    return null;
  }
  return {
    segment_id: segmentId,
    start_sec: startSec,
    end_sec: endSec,
    speaker,
    text,
    ...(typeof row.is_disabled === "boolean" ? { is_disabled: row.is_disabled } : {}),
    ...(typeof row.gain_db === "number" && Number.isFinite(row.gain_db) ? { gain_db: row.gain_db } : {}),
  };
}

function normalizePreview(payload: unknown): HammerCleanupPreview | null {
  const row = readObject(payload);
  const data = readObject(row?.data);
  const preview = readObject(data?.preview);
  if (!preview) return null;
  const label = readString(preview.label);
  const summary = readObject(preview.summary);
  const resultRaw = Array.isArray(preview.resultSegments) ? preview.resultSegments : null;
  const suggestionsRaw = Array.isArray(preview.suggestions) ? preview.suggestions : null;
  if (!label || !summary || !resultRaw || !suggestionsRaw) return null;

  const resultSegments = resultRaw
    .map((item, index) => normalizeSegment(item, `segment_${index + 1}`))
    .filter((item): item is HammerTranscriptSegment => Boolean(item));
  if (resultSegments.length === 0) return null;

  const suggestions = suggestionsRaw
    .map((item, index) => {
      const rowItem = readObject(item);
      if (!rowItem) return null;
      const id = readString(rowItem.id) ?? `suggestion_${index + 1}`;
      const type = readString(rowItem.type);
      const segmentId = readString(rowItem.segmentId);
      const description = readString(rowItem.description);
      const confidence = readNumber(rowItem.confidence);
      const timeSavedSec = readNumber(rowItem.timeSavedSec);
      if (!type || !segmentId || !description || confidence == null || timeSavedSec == null) return null;
      return {
        id,
        type: type as HammerCleanupPreview["suggestions"][number]["type"],
        segmentId,
        description,
        confidence,
        timeSavedSec,
      };
    })
    .filter((item): item is HammerCleanupPreview["suggestions"][number] => Boolean(item));

  const changedSegments = readNumber(summary.changedSegments);
  const removedSegments = readNumber(summary.removedSegments);
  const timeSavedSec = readNumber(summary.timeSavedSec);
  if (changedSegments == null || removedSegments == null || timeSavedSec == null) return null;

  return {
    label,
    resultSegments,
    suggestions,
    summary: {
      changedSegments,
      removedSegments,
      timeSavedSec,
    },
  };
}

export async function requestHammerTranscriptCleanupAssist(args: {
  workspace_id: string;
  workpiece_id: string;
  segments: HammerTranscriptSegment[];
  segment_ids: string[];
}): Promise<HammerTranscriptCleanupAssistResponse> {
  const operationPayload = {
    workspace_id: args.workspace_id,
    workpiece_id: args.workpiece_id,
    segments: args.segments,
    segment_ids: args.segment_ids,
  };
  const requestBody: Record<string, unknown> = {
    ...operationPayload,
    operation_id: await deriveCustomerOperationId("forge:hammer-transcript-cleanup", operationPayload),
  };
  let payload: unknown = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await tongsFetch(HAMMER_TRANSCRIPT_CLEANUP_ASSIST_ROUTE, {
      method: "POST",
      json: requestBody,
      timeoutMs: 120_000,
    });
    payload = await response.json().catch(() => null);
    if (response.ok) break;
    const quote = readCustomerSpendingQuote(payload);
    const acceptance = attempt === 0 && quote ? requestCustomerSpendingAcceptance(quote) : null;
    if (acceptance) {
      requestBody.spending_acceptance = acceptance;
      continue;
    }
    throw new HammerTranscriptCleanupAssistError(
      quote && !quote.funding_eligible
        ? `${readErrorMessage(payload)} ${quote.funding_label}.`
        : readErrorMessage(payload),
      readErrorCode(payload),
    );
  }

  const preview = normalizePreview(payload);
  if (!preview) {
    throw new Error("Hammer transcript cleanup assist returned an invalid preview payload.");
  }

  return { preview };
}
