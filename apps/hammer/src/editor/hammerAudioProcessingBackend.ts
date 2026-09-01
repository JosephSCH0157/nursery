import {
  buildHammerMediaBackboneRuntimeSummary,
  type HammerMediaBackboneRuntimeSummary,
} from "../media/hammerMediaBackbone";
import type { MediaKind } from "../../../../packages/contracts/hammer/media-resolver.contract";
import {
  requestHammerStudioRackRender,
  type HammerStudioRackRenderRequest,
  type HammerStudioRackRenderResponse,
} from "./hammerStudioRackRenderApi";
import type { HammerStudioRackState } from "./hammerStudioRack";
import type { HammerAudioTimelineSegmentInput } from "./hammerAudioTimelineRenderPlan";
import type { HammerFinalAudioRenderIdentity } from "../composition/hammerFinalAudioAuthority";
import { buildHammerAudioDspPlan, buildHammerAudioRenderIdentity, fingerprintHammerAudio, type HammerAudioRenderIdentityV1 } from "./hammerAudioDspPlan";
import type { HammerExactAudioRenderReceiptV1 } from "./hammerExactAudioReceipt";

export type HammerAudioProcessingBackendId = "native" | "ffmpeg";
export type HammerAudioProcessingMode = "playback" | "render";

export interface HammerAudioProcessingBackendResolution {
  requestedBackend: HammerAudioProcessingBackendId;
  resolvedBackend: HammerAudioProcessingBackendId;
  mode: HammerAudioProcessingMode;
  ffmpegAvailable: boolean;
  degraded: boolean;
  status: string;
}

export function resolveHammerAudioProcessingBackend(args: {
  requestedBackend: HammerAudioProcessingBackendId;
  mode: HammerAudioProcessingMode;
  runtimeSummary?: HammerMediaBackboneRuntimeSummary | null;
}): HammerAudioProcessingBackendResolution {
  const runtimeSummary = args.runtimeSummary ?? buildHammerMediaBackboneRuntimeSummary();
  const ffmpegAvailable = runtimeSummary.ffmpeg.ffmpeg_available === true;

  if (args.requestedBackend === "ffmpeg" && args.mode === "playback") {
    return {
      requestedBackend: args.requestedBackend,
      resolvedBackend: "native",
      mode: args.mode,
      ffmpegAvailable,
      degraded: true,
      status: ffmpegAvailable
        ? "FFmpeg power lane is render-focused. Playback preview stays on native lane."
        : "FFmpeg unavailable. Playback preview stays on native lane.",
    };
  }

  if (args.requestedBackend === "ffmpeg" && !ffmpegAvailable) {
    return {
      requestedBackend: args.requestedBackend,
      resolvedBackend: "native",
      mode: args.mode,
      ffmpegAvailable,
      degraded: true,
      status: "FFmpeg is unavailable. Falling back to native lane.",
    };
  }

  return {
    requestedBackend: args.requestedBackend,
    resolvedBackend: args.requestedBackend,
    mode: args.mode,
    ffmpegAvailable,
    degraded: false,
    status: args.requestedBackend === "ffmpeg"
      ? "FFmpeg power lane active."
      : "Native lane active.",
  };
}

export interface HammerProcessedDialogueAudioConfig {
  backend: HammerAudioProcessingBackendId;
  mode: HammerAudioProcessingMode;
  rackState: HammerStudioRackState;
}

export function processDialogueAudioWithBackend(args: {
  rackState: HammerStudioRackState;
  mode: HammerAudioProcessingMode;
  runtimeSummary?: HammerMediaBackboneRuntimeSummary | null;
}): HammerProcessedDialogueAudioConfig {
  const resolution = resolveHammerAudioProcessingBackend({
    requestedBackend: args.rackState.backend_preference,
    mode: args.mode,
    runtimeSummary: args.runtimeSummary,
  });
  return {
    backend: resolution.resolvedBackend,
    mode: args.mode,
    rackState: args.rackState,
  };
}

export interface HammerDialogueRenderExecutionResult {
  status: "processed" | "skipped" | "failed";
  requestedBackend: HammerAudioProcessingBackendId;
  resolvedBackend: HammerAudioProcessingBackendId;
  mode: HammerAudioProcessingMode;
  message: string;
  outputLocalRelpath: string | null;
  outputWorkpiecePath: string | null;
  outputMimeType: string | null;
  outputDurationMs: number | null;
  rawResponse: HammerStudioRackRenderResponse | null;
  exactAudioReceipt: HammerExactAudioRenderReceiptV1 | null;
}

function mapRenderResponseMessage(response: HammerStudioRackRenderResponse): string {
  if (response.status === "processed") {
    const output = response.output_workpiece_path
      ?? response.output_local_relpath
      ?? "derived artifact";
    return response.exact_audio_receipt
      ? `Exact audio verified via ${response.resolved_backend} lane (${output}).`
      : `Studio Rack render completed via ${response.resolved_backend} lane (${output}), but exact-audio verification is unavailable.`;
  }
  if (response.status === "skipped") {
    return response.failure_reason
      ?? "Studio Rack render was skipped. No derived processing artifact was produced.";
  }
  return response.failure_reason
    ?? "Studio Rack render failed before producing an artifact.";
}

export async function executeDialogueAudioRenderWithBackend(args: {
  workspaceId: string;
  workpieceId: string;
  mediaKind: MediaKind;
  timelineSegments: HammerAudioTimelineSegmentInput[];
  rackState: HammerStudioRackState;
  localRootAbs?: string | null;
  localRelpath?: string | null;
  canonicalWorkpiecePath?: string | null;
  mimeType?: string | null;
  runtimeSummary?: HammerMediaBackboneRuntimeSummary | null;
  renderPurpose?: "preview" | "final";
  finalAudioIdentity?: HammerFinalAudioRenderIdentity | null;
  podcastMaster?: HammerStudioRackRenderRequest["podcast_master"];
  renderIdentity?: HammerAudioRenderIdentityV1;
  executor?: (request: HammerStudioRackRenderRequest) => Promise<HammerStudioRackRenderResponse>;
}): Promise<HammerDialogueRenderExecutionResult> {
  const mode: HammerAudioProcessingMode = "render";
  const resolution = resolveHammerAudioProcessingBackend({
    requestedBackend: args.rackState.backend_preference,
    mode,
    runtimeSummary: args.runtimeSummary,
  });
  if (!resolution.ffmpegAvailable) {
    return {
      status: "skipped",
      requestedBackend: resolution.requestedBackend,
      resolvedBackend: resolution.resolvedBackend,
      mode,
      message: resolution.status,
      outputLocalRelpath: null,
      outputWorkpiecePath: null,
      outputMimeType: null,
      outputDurationMs: null,
      rawResponse: null,
      exactAudioReceipt: null,
    };
  }
  if (!Array.isArray(args.timelineSegments) || args.timelineSegments.length === 0) {
    return {
      status: "skipped",
      requestedBackend: resolution.requestedBackend,
      resolvedBackend: resolution.resolvedBackend,
      mode,
      message: "Timeline render has no segments. No derived artifact was produced.",
      outputLocalRelpath: null,
      outputWorkpiecePath: null,
      outputMimeType: null,
      outputDurationMs: null,
      rawResponse: null,
      exactAudioReceipt: null,
    };
  }

  const execute = args.executor ?? requestHammerStudioRackRender;
  try {
    const dspPlan = buildHammerAudioDspPlan(args.rackState, { podcastMaster: args.podcastMaster ?? null });
    const renderIdentity = args.renderIdentity ?? buildHammerAudioRenderIdentity({
      sourceIdentity: args.finalAudioIdentity?.recording_revision_id ?? args.canonicalWorkpiecePath ?? args.localRelpath ?? `${args.workpieceId}:source:unknown`,
      timelineIdentity: fingerprintHammerAudio(args.timelineSegments),
      historyHead: args.finalAudioIdentity?.composition_fingerprint ?? "head:preview",
      dspFingerprint: dspPlan.dspFingerprint,
    });
    const response = await execute({
      workspace_id: args.workspaceId,
      workpiece_id: args.workpieceId,
      media_kind: args.mediaKind,
      requested_backend: resolution.requestedBackend,
      timeline_segments: args.timelineSegments,
      rack_state: args.rackState,
      dsp_plan: dspPlan,
      render_identity: renderIdentity,
      render_purpose: args.renderPurpose ?? "preview",
      final_audio_identity: args.finalAudioIdentity ?? null,
      podcast_master: args.podcastMaster ?? null,
      local_root_abs: args.localRootAbs ?? null,
      local_relpath: args.localRelpath ?? null,
      canonical_workpiece_path: args.canonicalWorkpiecePath ?? null,
      mime_type: args.mimeType ?? null,
    });

    return {
      status: response.status,
      requestedBackend: response.requested_backend,
      resolvedBackend: response.resolved_backend,
      mode,
      message: mapRenderResponseMessage(response),
      outputLocalRelpath: response.output_local_relpath,
      outputWorkpiecePath: response.output_workpiece_path,
      outputMimeType: response.output_mime_type,
      outputDurationMs: response.output_duration_ms,
      rawResponse: response,
      exactAudioReceipt: response.exact_audio_receipt,
    };
  } catch (error) {
    const message = error instanceof Error && error.message.trim()
      ? error.message
      : "Studio Rack render failed.";
    return {
      status: "failed",
      requestedBackend: resolution.requestedBackend,
      resolvedBackend: resolution.resolvedBackend,
      mode,
      message,
      outputLocalRelpath: null,
      outputWorkpiecePath: null,
      outputMimeType: null,
      outputDurationMs: null,
      rawResponse: null,
      exactAudioReceipt: null,
    };
  }
}
