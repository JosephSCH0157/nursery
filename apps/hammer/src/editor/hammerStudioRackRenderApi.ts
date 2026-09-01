import type { MediaKind } from "../../../../packages/contracts/hammer/media-resolver.contract";
import type { HammerStudioRackState } from "./hammerStudioRack";
import type { HammerAudioTimelineSegmentInput } from "./hammerAudioTimelineRenderPlan";
import type { HammerFinalAudioMasterAuthority, HammerFinalAudioRenderIdentity } from "../composition/hammerFinalAudioAuthority";
import type { HammerAudioDspPlanV1, HammerAudioRenderIdentityV1 } from "./hammerAudioDspPlan";
import type { HammerExactAudioRenderReceiptV1 } from "./hammerExactAudioReceipt";

export const HAMMER_STUDIO_RACK_RENDER_ROUTE = "/api/hammer/render/studio-rack";

export type HammerStudioRackRenderRequestBackend = "native" | "ffmpeg";
export type HammerStudioRackRenderStatus = "processed" | "skipped" | "failed";

export interface HammerStudioRackRenderRequest {
  workspace_id: string;
  workpiece_id: string;
  media_kind: MediaKind;
  requested_backend: HammerStudioRackRenderRequestBackend;
  timeline_segments: HammerAudioTimelineSegmentInput[];
  rack_state: HammerStudioRackState;
  dsp_plan: HammerAudioDspPlanV1;
  render_identity: HammerAudioRenderIdentityV1;
  render_purpose?: "preview" | "final";
  final_audio_identity?: HammerFinalAudioRenderIdentity | null;
  podcast_master?: {
    noise_cleanup: "off" | "light";
    normalization_lufs: number;
    compression_amount: "light" | "medium";
    limiter_ceiling_dbtp: number;
  } | null;
  local_root_abs?: string | null;
  local_relpath?: string | null;
  canonical_workpiece_path?: string | null;
  mime_type?: string | null;
}

export interface HammerStudioRackRenderResponse {
  status: HammerStudioRackRenderStatus;
  requested_backend: HammerStudioRackRenderRequestBackend;
  resolved_backend: HammerStudioRackRenderRequestBackend;
  processed_at: string | null;
  output_local_relpath: string | null;
  output_workpiece_path: string | null;
  output_mime_type: string | null;
  output_duration_ms: number | null;
  failure_reason: string | null;
  settings_summary: Record<string, string | number | boolean | null>;
  canonical_audio_master: HammerFinalAudioMasterAuthority | null;
  exact_audio_receipt: HammerExactAudioRenderReceiptV1 | null;
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
    ?? "Hammer Studio Rack render failed.";
}

function normalizeResponse(payload: unknown): HammerStudioRackRenderResponse | null {
  const root = readObject(payload);
  const data = readObject(root?.data);
  if (!data) return null;

  const status = readString(data.status);
  const requestedBackend = readString(data.requested_backend);
  const resolvedBackend = readString(data.resolved_backend);
  if (
    (status !== "processed" && status !== "skipped" && status !== "failed")
    || (requestedBackend !== "native" && requestedBackend !== "ffmpeg")
    || (resolvedBackend !== "native" && resolvedBackend !== "ffmpeg")
  ) {
    return null;
  }

  const summaryRaw = readObject(data.settings_summary);
  const settings_summary: Record<string, string | number | boolean | null> = {};
  if (summaryRaw) {
    for (const [key, value] of Object.entries(summaryRaw)) {
      if (
        value == null
        || typeof value === "string"
        || typeof value === "number"
        || typeof value === "boolean"
      ) {
        settings_summary[key] = value ?? null;
      }
    }
  }

  return {
    status,
    requested_backend: requestedBackend,
    resolved_backend: resolvedBackend,
    processed_at: readString(data.processed_at),
    output_local_relpath: readString(data.output_local_relpath),
    output_workpiece_path: readString(data.output_workpiece_path),
    output_mime_type: readString(data.output_mime_type),
    output_duration_ms: readNumber(data.output_duration_ms),
    failure_reason: readString(data.failure_reason),
    settings_summary,
    canonical_audio_master: readObject(data.canonical_audio_master) as unknown as HammerFinalAudioMasterAuthority | null,
    exact_audio_receipt: readObject(data.exact_audio_receipt) as unknown as HammerExactAudioRenderReceiptV1 | null,
  };
}

export async function requestHammerStudioRackRender(
  request: HammerStudioRackRenderRequest,
): Promise<HammerStudioRackRenderResponse> {
  const response = await fetch(HAMMER_STUDIO_RACK_RENDER_ROUTE, {
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
    throw new Error("Hammer Studio Rack render returned an invalid response.");
  }
  return normalized;
}
