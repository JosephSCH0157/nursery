import { roundToTenth } from "./hammerWorkspaceTimeline";

export const PRE_ROLL_SEC = 2;
export const POST_ROLL_SEC = 1;
export const SCRUB_SEEK_THRESHOLD_SEC = 0.05;
export const VIDEO_HARD_SEEK_THRESHOLD_SEC = 0.35;
export const VIDEO_DRIFT_RATE_K = 0.15;
export const VIDEO_PLAYBACK_RATE_MIN = 0.97;
export const VIDEO_PLAYBACK_RATE_MAX = 1.03;
export const VIDEO_HARD_SEEK_COOLDOWN_MS = 2000;
export const PLAYHEAD_WINDOW_EPSILON_SEC = 0.001;
export const SCRUB_RATE_OPTIONS = [1, 0.75, 0.5] as const;

export type HammerPlaybackAuthorityWindow = Window & typeof globalThis & {
  __forgeHammerActivePreviewOwnerId__?: string;
  __forgeHammerActivePreviewAudio__?: HTMLMediaElement;
  __forgeHammerIsPlaybackActive__?: boolean;
};

export type HammerPlaybackWindowMode = "loop" | "roll";

export type HammerPlaybackWindow = {
  mode: HammerPlaybackWindowMode;
  startSec: number;
  endSec: number;
  label: string;
};

export type HammerTimelineMarker = {
  id: string;
  label: string;
  timeSec: number;
};

export type HammerScrubRate = (typeof SCRUB_RATE_OPTIONS)[number];

export type HammerPlaybackTargetRange = {
  startSec: number;
  endSec: number;
  label: string;
};

export function createTimelineMarkerId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `marker:${crypto.randomUUID()}`;
  }
  return `marker:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 10)}`;
}

export function resolvePlaybackWindowProgress(args: {
  nextTimeSec: number;
  timelineDurationSec: number;
  playbackWindow: HammerPlaybackWindow | null;
}): {
  nextPlayheadSec: number;
  shouldLoop: boolean;
  shouldStop: boolean;
} {
  const clamped = Math.max(0, Math.min(args.timelineDurationSec, roundToTenth(args.nextTimeSec)));
  if (!args.playbackWindow) {
    return {
      nextPlayheadSec: clamped,
      shouldLoop: false,
      shouldStop: false,
    };
  }

  const windowStart = Math.max(0, Math.min(args.timelineDurationSec, roundToTenth(args.playbackWindow.startSec)));
  const windowEnd = Math.max(windowStart, Math.min(args.timelineDurationSec, roundToTenth(args.playbackWindow.endSec)));
  if (clamped < windowStart) {
    return {
      nextPlayheadSec: windowStart,
      shouldLoop: false,
      shouldStop: false,
    };
  }
  if (clamped >= windowEnd) {
    if (args.playbackWindow.mode === "loop") {
      return {
        nextPlayheadSec: windowStart,
        shouldLoop: true,
        shouldStop: false,
      };
    }
    return {
      nextPlayheadSec: windowEnd,
      shouldLoop: false,
      shouldStop: true,
    };
  }

  return {
    nextPlayheadSec: clamped,
    shouldLoop: false,
    shouldStop: false,
  };
}

export function resolveSelectionPlaybackRange(args: {
  activeTranscriptTargetRange: HammerPlaybackTargetRange | null;
  preRollSec: number;
  postRollSec: number;
  labelPrefix: string;
  timelineDurationSec: number;
}): HammerPlaybackWindow | null {
  if (!args.activeTranscriptTargetRange) return null;
  const startSec = Math.max(0, roundToTenth(args.activeTranscriptTargetRange.startSec - args.preRollSec));
  const endSec = Math.min(args.timelineDurationSec, roundToTenth(args.activeTranscriptTargetRange.endSec + args.postRollSec));
  if (endSec <= startSec) return null;
  return {
    mode: "roll",
    startSec,
    endSec,
    label: `${args.labelPrefix} ${args.activeTranscriptTargetRange.label}`,
  };
}