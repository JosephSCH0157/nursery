import type { MediaKind } from "../../../../packages/contracts/hammer/media-resolver.contract";
import type {
  HammerAudioPolishFailureCode,
  HammerAudioPolishPass,
} from "../persistence/hammerPersistenceContract";

export const HAMMER_AUDIO_POLISH_ROUTE = "/api/hammer/prep/audio-polish";

export interface HammerAudioPolishRequest {
  workspace_id: string;
  workpiece_id: string;
  media_kind: MediaKind;
  local_root_abs: string;
  local_relpath: string;
  mime_type?: string | null;
}

export interface HammerAudioPolishResponse {
  status: "prepared" | "failed";
  prepared_at: string | null;
  prepared_passes: HammerAudioPolishPass[];
  processor_version: string;
  output_local_relpath: string | null;
  output_mime_type: string | null;
  output_duration_ms: number | null;
  failure_code: HammerAudioPolishFailureCode | null;
  failure_reason: string | null;
  settings_summary: Record<string, string | number | boolean | null>;
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

function readErrorMessage(payload: unknown): string {
  const row = readObject(payload);
  const error = readObject(row?.error);
  return readString(error?.message)
    ?? readString(row?.message)
    ?? readString(row?.detail)
    ?? "Hammer audio polish failed.";
}

function normalizeResponse(payload: unknown): HammerAudioPolishResponse | null {
  const root = readObject(payload);
  const data = readObject(root?.data);
  const status = readString(data?.status);
  const processorVersion = readString(data?.processor_version);
  const passesRaw = Array.isArray(data?.prepared_passes) ? data.prepared_passes : [];
  const preparedPasses = passesRaw
    .map((value) => readString(value))
    .filter((value): value is HammerAudioPolishPass => (
      value === "studio_sound" || value === "noise_cleanup" || value === "level_consistency"
    ));
  if ((status !== "prepared" && status !== "failed") || !processorVersion) {
    return null;
  }

  const settingsSummaryRow = readObject(data?.settings_summary);
  const settingsSummary: Record<string, string | number | boolean | null> = {};
  if (settingsSummaryRow) {
    for (const [key, value] of Object.entries(settingsSummaryRow)) {
      if (
        value == null
        || typeof value === "string"
        || typeof value === "number"
        || typeof value === "boolean"
      ) {
        settingsSummary[key] = value ?? null;
      }
    }
  }

  const failureCode = readString(data?.failure_code);
  return {
    status,
    prepared_at: readString(data?.prepared_at),
    prepared_passes: preparedPasses,
    processor_version: processorVersion,
    output_local_relpath: readString(data?.output_local_relpath),
    output_mime_type: readString(data?.output_mime_type),
    output_duration_ms: readNumber(data?.output_duration_ms),
    failure_code: failureCode === "unsupported_source"
      || failureCode === "source_unavailable"
      || failureCode === "processing_failed"
      ? failureCode
      : null,
    failure_reason: readString(data?.failure_reason),
    settings_summary: settingsSummary,
  };
}

export async function requestHammerAudioPolish(
  request: HammerAudioPolishRequest,
): Promise<HammerAudioPolishResponse> {
  const response = await fetch(HAMMER_AUDIO_POLISH_ROUTE, {
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
    throw new Error("Hammer audio polish returned an invalid response.");
  }

  return normalized;
}
