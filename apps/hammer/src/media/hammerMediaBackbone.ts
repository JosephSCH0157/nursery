import type { MediaKind } from "../../../../packages/contracts/hammer/media-resolver.contract";

export type HammerMediaBackendPreference = "auto" | "builtin" | "ffmpeg";
export type HammerMediaBackboneInstallState = "not_configured" | "partial" | "ready";
export type HammerMediaBackboneFutureOperation =
  | "ensure_working_audio"
  | "generate_waveform_proxy"
  | "render_clip_export";

export interface HammerMediaBackboneRuntimeSummary {
  schema_version: 1;
  preferred_backend: HammerMediaBackendPreference;
  ffmpeg: {
    install_state: HammerMediaBackboneInstallState;
    ffmpeg_bin: string | null;
    ffprobe_bin: string | null;
    ffmpeg_configured: boolean;
    ffprobe_configured: boolean;
    ffmpeg_available: boolean;
    ffprobe_available: boolean;
  };
  future_operations: Array<{
    operation: HammerMediaBackboneFutureOperation;
    backend: "ffmpeg";
    install_state: HammerMediaBackboneInstallState;
    detail: string;
  }>;
}

export type HammerAudioPolishPlanReadiness =
  | "ready_now"
  | "requires_future_ffmpeg"
  | "unsupported";

export interface HammerAudioPolishExecutionPlan {
  schema_version: 1;
  readiness: HammerAudioPolishPlanReadiness;
  executable: boolean;
  backend: "builtin" | "ffmpeg" | "none";
  current_strategy: "builtin_wav_v1" | "ffmpeg_working_audio_v1" | null;
  future_strategy: "ffmpeg_working_audio_v1" | null;
  requires_ffmpeg: boolean;
  detail: string;
}

const FUTURE_FFMPEG_OPERATIONS: Array<{
  operation: HammerMediaBackboneFutureOperation;
  detail: string;
}> = [
  {
    operation: "ensure_working_audio",
    detail: "Future FFmpeg-backed working-audio extraction and normalization for video containers and non-WAV sources.",
  },
  {
    operation: "generate_waveform_proxy",
    detail: "Future FFmpeg-backed waveform and proxy generation for review and timeline prep.",
  },
  {
    operation: "render_clip_export",
    detail: "Future FFmpeg-backed clip and export rendering once Hammer owns the release render path.",
  },
];

function readTrimmed(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeExtension(value: string | null | undefined): string | null {
  const trimmed = readTrimmed(value);
  if (!trimmed) return null;
  return trimmed.startsWith(".") ? trimmed.toLowerCase() : `.${trimmed.toLowerCase()}`;
}

export function buildHammerMediaBackboneRuntimeSummary(input?: {
  preferredBackend?: HammerMediaBackendPreference | null;
  ffmpegBin?: string | null;
  ffprobeBin?: string | null;
  ffmpegAvailable?: boolean;
  ffprobeAvailable?: boolean;
}): HammerMediaBackboneRuntimeSummary {
  const ffmpegBin = readTrimmed(input?.ffmpegBin);
  const ffprobeBin = readTrimmed(input?.ffprobeBin);
  const ffmpegConfigured = Boolean(ffmpegBin);
  const ffprobeConfigured = Boolean(ffprobeBin);
  const ffmpegAvailable = Boolean(input?.ffmpegAvailable && ffmpegConfigured);
  const ffprobeAvailable = Boolean(input?.ffprobeAvailable && ffprobeConfigured);
  const installState: HammerMediaBackboneInstallState = ffmpegAvailable && ffprobeAvailable
    ? "ready"
    : ffmpegConfigured || ffprobeConfigured
    ? "partial"
    : "not_configured";

  return {
    schema_version: 1,
    preferred_backend: input?.preferredBackend ?? "auto",
    ffmpeg: {
      install_state: installState,
      ffmpeg_bin: ffmpegBin,
      ffprobe_bin: ffprobeBin,
      ffmpeg_configured: ffmpegConfigured,
      ffprobe_configured: ffprobeConfigured,
      ffmpeg_available: ffmpegAvailable,
      ffprobe_available: ffprobeAvailable,
    },
    future_operations: FUTURE_FFMPEG_OPERATIONS.map((entry) => ({
      operation: entry.operation,
      backend: "ffmpeg",
      install_state: installState,
      detail: entry.detail,
    })),
  };
}

export function resolveHammerAudioPolishExecutionPlan(args: {
  runtime: HammerMediaBackboneRuntimeSummary;
  mediaKind: MediaKind;
  sourceExtension?: string | null;
}): HammerAudioPolishExecutionPlan {
  const extension = normalizeExtension(args.sourceExtension);
  const ffmpegReady = args.runtime.ffmpeg.ffmpeg_available;

  if (args.mediaKind === "recording_audio" || args.mediaKind === "export_audio") {
    if (extension === ".wav") {
      return {
        schema_version: 1,
        readiness: "ready_now",
        executable: true,
        backend: "builtin",
        current_strategy: "builtin_wav_v1",
        future_strategy: null,
        requires_ffmpeg: false,
        detail: "Current Hammer baseline audio polish can run directly on WAV audio without FFmpeg.",
      };
    }

    if (ffmpegReady) {
      return {
        schema_version: 1,
        readiness: "ready_now",
        executable: true,
        backend: "ffmpeg",
        current_strategy: "ffmpeg_working_audio_v1",
        future_strategy: null,
        requires_ffmpeg: true,
        detail: "FFmpeg working-audio normalization is available for this non-WAV audio source, so Hammer can prepare canonical WAV audio before baseline polish runs.",
      };
    }

    return {
      schema_version: 1,
      readiness: "requires_future_ffmpeg",
      executable: false,
      backend: "none",
      current_strategy: null,
      future_strategy: "ffmpeg_working_audio_v1",
      requires_ffmpeg: true,
      detail: "This audio source would need FFmpeg-backed working-audio normalization before baseline polish can run. Hammer will stay on raw playback until that future media backbone is installed and enabled.",
    };
  }

  if (args.mediaKind === "recording_video" || args.mediaKind === "export_video") {
    if (ffmpegReady) {
      return {
        schema_version: 1,
        readiness: "ready_now",
        executable: true,
        backend: "ffmpeg",
        current_strategy: "ffmpeg_working_audio_v1",
        future_strategy: null,
        requires_ffmpeg: true,
        detail: "FFmpeg working-audio extraction is available for this video source, so Hammer can prepare canonical WAV audio before baseline polish runs.",
      };
    }

    return {
      schema_version: 1,
      readiness: "requires_future_ffmpeg",
      executable: false,
      backend: "none",
      current_strategy: null,
      future_strategy: "ffmpeg_working_audio_v1",
      requires_ffmpeg: true,
      detail: "Video sources will need FFmpeg-backed audio extraction into canonical working audio before Hammer can run baseline polish. Hammer will stay on raw playback until FFmpeg working audio is configured and available.",
    };
  }

  return {
    schema_version: 1,
    readiness: "unsupported",
    executable: false,
    backend: "none",
    current_strategy: null,
    future_strategy: null,
    requires_ffmpeg: false,
    detail: "This media kind is outside Hammer's planned audio-polish pipeline.",
  };
}
