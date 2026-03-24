import {
  buildHammerMediaBackboneRuntimeSummary,
  type HammerMediaBackboneRuntimeSummary,
} from "../media/hammerMediaBackbone";
import type { HammerStudioRackState } from "./hammerStudioRack";

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
