import { useCallback, useEffect, useMemo, useRef } from "react";
import type { Dispatch, MouseEvent as ReactMouseEvent, MutableRefObject, SetStateAction } from "react";
import type { HammerTranscriptSegment } from "../../../../packages/contracts/hammer/transcript.contract";
import { resolveNextAudiblePlaybackTime, type HammerEffectiveCutRegion } from "./hammerAudioEditPlayback";
import {
  DEFAULT_PLAYHEAD_SNAP_TOLERANCE_SEC,
  resolveAdjacentJumpPointTime,
  resolveFocusAfterPlayheadChange,
  roundToTenth,
  snapPlayheadToBoundary,
  type HammerWorkspaceFocusOverride,
} from "./hammerWorkspaceTimeline";
import {
  createTimelineMarkerId,
  type HammerPlaybackTargetRange,
  type HammerPlaybackAuthorityWindow,
  type HammerPlaybackWindow,
  type HammerScrubRate,
  type HammerTimelineMarker,
  PLAYHEAD_WINDOW_EPSILON_SEC,
  POST_ROLL_SEC,
  PRE_ROLL_SEC,
  resolvePlaybackWindowProgress,
  resolveSelectionPlaybackRange,
  SCRUB_SEEK_THRESHOLD_SEC,
  VIDEO_DRIFT_RATE_K,
  VIDEO_HARD_SEEK_COOLDOWN_MS,
  VIDEO_HARD_SEEK_THRESHOLD_SEC,
  VIDEO_PLAYBACK_RATE_MAX,
  VIDEO_PLAYBACK_RATE_MIN,
} from "./hammerWorkspaceShellPlaybackUtils";

type PlaybackSelectionOrigin = "system" | "transcript" | "timeline" | "playhead";

export type UseHammerWorkspaceShellPlaybackArgs = {
  editableTranscriptSegments: HammerTranscriptSegment[];
  effectivePlaybackCutRegions: HammerEffectiveCutRegion[];
  timelineDurationSec: number;
  playbackTransportDurationSec: number;
  playheadBoundaryTimesSec: number[];
  activeTranscriptTargetRange: HammerPlaybackTargetRange | null;
  resolveMediaTimeForTransportTime: (transportTimeSec: number) => number;
  resolveTransportTimeForMediaTime: (mediaTimeSec: number) => number;
  playbackMediaSrc: string | null;
  previewVideoSrc: string | null;
  visualPolishPreviewActive: boolean;
  focusOverride: HammerWorkspaceFocusOverride;
  playheadSec: number;
  isPlaybackActive: boolean;
  playbackWindow: HammerPlaybackWindow | null;
  isScrubbing: boolean;
  timelineMarkers: HammerTimelineMarker[];
  scrubRate: HammerScrubRate;
  selectionOriginRef: MutableRefObject<PlaybackSelectionOrigin>;
  previewAudioRef: MutableRefObject<HTMLVideoElement | null>;
  previewVideoRef: MutableRefObject<HTMLVideoElement | null>;
  previewVideoHardSeekAtMsRef: MutableRefObject<number>;
  cutSeekFadeRef: MutableRefObject<{ token: number; timerId: number | null }>;
  scrubRectRef: MutableRefObject<{ left: number; width: number } | null>;
  scrubAutoPlayRef: MutableRefObject<boolean>;
  scrubReturnToPausedRef: MutableRefObject<boolean>;
  playbackOwnerIdRef: MutableRefObject<string>;
  setPlayheadSec: Dispatch<SetStateAction<number>>;
  setIsPlaybackActive: Dispatch<SetStateAction<boolean>>;
  setPlaybackWindow: Dispatch<SetStateAction<HammerPlaybackWindow | null>>;
  setIsScrubbing: Dispatch<SetStateAction<boolean>>;
  setTimelineMarkers: Dispatch<SetStateAction<HammerTimelineMarker[]>>;
  setFocusOverride: Dispatch<SetStateAction<HammerWorkspaceFocusOverride>>;
  setTranscriptTimingHint: Dispatch<SetStateAction<string | null>>;
  pauseAuxiliaryMediaPlayback: () => void;
};

export type UseHammerWorkspaceShellPlaybackResult = {
  isLoopPlaybackActive: boolean;
  playbackModeLabel: string;
  sortedTimelineMarkers: HammerTimelineMarker[];
  markerTimesSec: number[];
  resolveAudibleSeekTarget: (requestedTimeSec: number) => number | null;
  handlePlaybackProgress: (nextTimeSec: number) => void;
  handlePlaybackEnded: (endedMediaTimeSec: number) => void;
  togglePlayback: () => void;
  seekPlayheadToTime: (
    nextTimeSec: number,
    origin?: "timeline" | "playhead",
    options?: { snapToBoundary?: boolean },
  ) => void;
  jumpToSelectionBoundary: (boundary: "start" | "end") => void;
  jumpToEditPoint: (direction: "previous" | "next") => void;
  addMarkerAtPlayhead: () => void;
  removeMarker: (markerId: string) => void;
  jumpToMarker: (direction: "previous" | "next") => void;
  jumpToMarkerById: (markerId: string) => void;
  toggleSelectionLoopPlayback: () => void;
  playSelectionWithRoll: () => void;
  beginTimelineScrub: (event: ReactMouseEvent<HTMLElement>) => void;
  endTimelineScrub: () => void;
  nudgePlayhead: (deltaSec: number) => void;
};

export function useHammerWorkspaceShellPlayback(
  args: UseHammerWorkspaceShellPlaybackArgs,
): UseHammerWorkspaceShellPlaybackResult {
  const lastPlaybackMediaSrcRef = useRef<string | null>(null);
  const lastPreviewVideoSrcRef = useRef<string | null>(null);
  const resolveAudibleSeekTarget = useCallback((requestedTimeSec: number): number | null => (
    resolveNextAudiblePlaybackTime({
      requestedTimeSec,
      durationSec: args.playbackTransportDurationSec,
      effectiveCutRegions: args.effectivePlaybackCutRegions,
      transcriptSegments: args.editableTranscriptSegments,
    })
  ), [args.editableTranscriptSegments, args.effectivePlaybackCutRegions, args.playbackTransportDurationSec]);

  const resolvePlaybackTransportProgress = useCallback((requestedTimeSec: number): {
    nextPlayheadSec: number;
    shouldLoop: boolean;
    shouldStop: boolean;
    shouldSyncMediaTime: boolean;
  } => {
    if (args.playbackTransportDurationSec <= 0) {
      return {
        nextPlayheadSec: 0,
        shouldLoop: false,
        shouldStop: true,
        shouldSyncMediaTime: false,
      };
    }

    let candidate = Math.max(0, Math.min(args.playbackTransportDurationSec, requestedTimeSec));
    let shouldLoop = false;
    let shouldSyncMediaTime = false;
    const maxIterations = Math.max(2, args.effectivePlaybackCutRegions.length + 4);

    for (let index = 0; index < maxIterations; index += 1) {
      const audibleTarget = resolveNextAudiblePlaybackTime({
        requestedTimeSec: candidate,
        durationSec: args.playbackTransportDurationSec,
        effectiveCutRegions: args.effectivePlaybackCutRegions,
        transcriptSegments: args.editableTranscriptSegments,
      });

      if (audibleTarget == null) {
        return {
          nextPlayheadSec: args.playbackTransportDurationSec,
          shouldLoop: false,
          shouldStop: true,
          shouldSyncMediaTime: true,
        };
      }

      if (Math.abs(audibleTarget - candidate) > PLAYHEAD_WINDOW_EPSILON_SEC) {
        shouldSyncMediaTime = true;
      }

      const windowProgress = resolvePlaybackWindowProgress({
        nextTimeSec: audibleTarget,
        timelineDurationSec: args.timelineDurationSec,
        playbackWindow: args.playbackWindow,
      });
      if (windowProgress.shouldStop) {
        return {
          nextPlayheadSec: windowProgress.nextPlayheadSec,
          shouldLoop: false,
          shouldStop: true,
          shouldSyncMediaTime: shouldSyncMediaTime
            || Math.abs(windowProgress.nextPlayheadSec - audibleTarget) > PLAYHEAD_WINDOW_EPSILON_SEC,
        };
      }

      if (
        windowProgress.shouldLoop
        || Math.abs(windowProgress.nextPlayheadSec - audibleTarget) > PLAYHEAD_WINDOW_EPSILON_SEC
      ) {
        candidate = windowProgress.nextPlayheadSec;
        shouldLoop = shouldLoop || windowProgress.shouldLoop;
        shouldSyncMediaTime = true;
        continue;
      }

      return {
        nextPlayheadSec: audibleTarget,
        shouldLoop,
        shouldStop: false,
        shouldSyncMediaTime,
      };
    }

    return {
      nextPlayheadSec: candidate,
      shouldLoop,
      shouldStop: false,
      shouldSyncMediaTime,
    };
  }, [
    args.editableTranscriptSegments,
    args.effectivePlaybackCutRegions,
    args.playbackTransportDurationSec,
    args.playbackWindow,
    args.timelineDurationSec,
  ]);

  const sortedTimelineMarkers = useMemo(
    () => [...args.timelineMarkers].sort((left, right) => left.timeSec - right.timeSec),
    [args.timelineMarkers],
  );
  const markerTimesSec = useMemo(
    () => sortedTimelineMarkers.map((marker) => marker.timeSec),
    [sortedTimelineMarkers],
  );
  const isLoopPlaybackActive = args.playbackWindow?.mode === "loop";
  const playbackModeLabel = args.isScrubbing
    ? "Scrubbing"
    : args.playbackWindow?.mode === "loop"
    ? `Looping ${args.playbackWindow.label}`
    : args.playbackWindow?.mode === "roll"
    ? `Auditioning ${args.playbackWindow.label}`
    : args.isPlaybackActive
    ? "Playing"
    : "Paused";

  const seekPreviewAudioWithOptionalSeamFade = useCallback((seekArgs: {
    audio: HTMLVideoElement;
    targetTime: number;
    applySeamFade: boolean;
  }): void => {
    const targetTime = seekArgs.targetTime;
    if (!Number.isFinite(targetTime) || targetTime < 0) {
      seekArgs.audio.currentTime = 0;
      return;
    }

    if (!seekArgs.applySeamFade || seekArgs.audio.muted || seekArgs.audio.volume <= 0) {
      seekArgs.audio.currentTime = targetTime;
      return;
    }

    const restoreVolume = seekArgs.audio.volume;
    const ref = args.cutSeekFadeRef.current;
    ref.token += 1;
    const token = ref.token;
    if (ref.timerId != null) {
      window.clearTimeout(ref.timerId);
      ref.timerId = null;
    }

    const nearSilent = 0.0001;
    seekArgs.audio.volume = nearSilent;
    seekArgs.audio.currentTime = targetTime;

    ref.timerId = window.setTimeout(() => {
      if (args.cutSeekFadeRef.current.token !== token) return;
      const audio = seekArgs.audio;
      if (!audio) return;
      if (!audio.muted) {
        audio.volume = restoreVolume;
      }
      args.cutSeekFadeRef.current.timerId = null;
    }, 60);
  }, [args.cutSeekFadeRef]);

  const claimGlobalPlaybackAuthority = useCallback((previewAudio: HTMLMediaElement): void => {
    const runtimeWindow = window as HammerPlaybackAuthorityWindow;
    const activePreviewAudio = runtimeWindow.__forgeHammerActivePreviewAudio__;
    if (activePreviewAudio && activePreviewAudio !== previewAudio) {
      activePreviewAudio.pause();
      if (!activePreviewAudio.ended) {
        activePreviewAudio.currentTime = 0;
      }
    }
    runtimeWindow.__forgeHammerActivePreviewAudio__ = previewAudio;
    runtimeWindow.__forgeHammerActivePreviewOwnerId__ = args.playbackOwnerIdRef.current;
    args.pauseAuxiliaryMediaPlayback();
  }, [args.pauseAuxiliaryMediaPlayback, args.playbackOwnerIdRef]);

  const releaseGlobalPlaybackAuthority = useCallback((previewAudio: HTMLMediaElement | null): void => {
    const runtimeWindow = window as HammerPlaybackAuthorityWindow;
    if (
      runtimeWindow.__forgeHammerActivePreviewOwnerId__ === args.playbackOwnerIdRef.current
      && runtimeWindow.__forgeHammerActivePreviewAudio__ === previewAudio
    ) {
      runtimeWindow.__forgeHammerActivePreviewAudio__ = undefined;
      runtimeWindow.__forgeHammerActivePreviewOwnerId__ = undefined;
    }
  }, [args.playbackOwnerIdRef]);

  useEffect(() => {
    if (args.playbackTransportDurationSec <= 0) return;

    const audibleTarget = resolveAudibleSeekTarget(args.playheadSec);
    if (audibleTarget == null) {
      const terminalPlayheadSec = roundToTenth(args.playbackTransportDurationSec);
      if (Math.abs(args.playheadSec - terminalPlayheadSec) >= SCRUB_SEEK_THRESHOLD_SEC) {
        args.setPlayheadSec(terminalPlayheadSec);
      }
      if (
        args.previewAudioRef.current
        && Math.abs(
          args.previewAudioRef.current.currentTime - args.resolveMediaTimeForTransportTime(args.playbackTransportDurationSec),
        ) > SCRUB_SEEK_THRESHOLD_SEC
      ) {
        args.previewAudioRef.current.currentTime = args.resolveMediaTimeForTransportTime(args.playbackTransportDurationSec);
      }
      if (args.isPlaybackActive) {
        args.setIsPlaybackActive(false);
      }
      if (args.playbackWindow?.mode === "roll") {
        args.setPlaybackWindow(null);
      }
      return;
    }

    if (Math.abs(args.playheadSec - audibleTarget) < SCRUB_SEEK_THRESHOLD_SEC) {
      return;
    }

    const nextPlayheadSec = roundToTenth(audibleTarget);
    args.setPlayheadSec(nextPlayheadSec);
    if (
      args.previewAudioRef.current
      && Math.abs(args.previewAudioRef.current.currentTime - audibleTarget) > SCRUB_SEEK_THRESHOLD_SEC
    ) {
      args.previewAudioRef.current.currentTime = audibleTarget;
    }
  }, [
    args.isPlaybackActive,
    args.playbackTransportDurationSec,
    args.playbackWindow?.mode,
    args.playheadSec,
    args.previewAudioRef,
    args.setIsPlaybackActive,
    args.setPlaybackWindow,
    args.setPlayheadSec,
    resolveAudibleSeekTarget,
  ]);

  useEffect(() => {
    const previewAudio = args.previewAudioRef.current;
    if (!previewAudio) return;
    const previewVideo = args.previewVideoRef.current;
    const runtimeWindow = window as HammerPlaybackAuthorityWindow;
    const activeOwnerId = runtimeWindow.__forgeHammerActivePreviewOwnerId__;
    if (args.isPlaybackActive && activeOwnerId && activeOwnerId !== args.playbackOwnerIdRef.current) {
      previewAudio.pause();
      args.setIsPlaybackActive(false);
      return;
    }

    let srcChanged = false;
    if (lastPlaybackMediaSrcRef.current !== args.playbackMediaSrc) {
      lastPlaybackMediaSrcRef.current = args.playbackMediaSrc;
      previewAudio.pause();
      srcChanged = true;
    }

    let previewVideoSrcChanged = false;
    if (previewVideo && lastPreviewVideoSrcRef.current !== args.previewVideoSrc) {
      lastPreviewVideoSrcRef.current = args.previewVideoSrc;
      previewVideo.pause();
      previewVideoSrcChanged = true;
    }

    if (!args.playbackMediaSrc) {
      previewAudio.pause();
      if (args.isPlaybackActive) args.setIsPlaybackActive(false);
      return;
    }

    if (previewVideo && !args.previewVideoSrc) {
      previewVideo.pause();
    }

    const transportProgress = args.isPlaybackActive
      ? resolvePlaybackTransportProgress(args.playheadSec)
      : {
        nextPlayheadSec: resolveAudibleSeekTarget(args.playheadSec) ?? args.playbackTransportDurationSec,
        shouldLoop: false,
        shouldStop: false,
        shouldSyncMediaTime: false,
      };
    const targetTransportTime = Math.max(
      0,
      Math.min(
        transportProgress.nextPlayheadSec,
        args.playbackTransportDurationSec > 0 ? args.playbackTransportDurationSec : transportProgress.nextPlayheadSec,
      ),
    );
    const targetMediaTime = args.resolveMediaTimeForTransportTime(targetTransportTime);
    if (Math.abs(args.playheadSec - targetTransportTime) >= SCRUB_SEEK_THRESHOLD_SEC) {
      args.setPlayheadSec(roundToTenth(targetTransportTime));
    }
    const shouldSynchronizeCurrentTime = srcChanged || !args.isPlaybackActive || args.isScrubbing || transportProgress.shouldSyncMediaTime;
    if (shouldSynchronizeCurrentTime && Math.abs(previewAudio.currentTime - targetMediaTime) > SCRUB_SEEK_THRESHOLD_SEC) {
      seekPreviewAudioWithOptionalSeamFade({
        audio: previewAudio,
        targetTime: targetMediaTime,
        applySeamFade: transportProgress.shouldSyncMediaTime,
      });
    }
    if (args.previewVideoSrc && previewVideo) {
      previewVideo.muted = true;
      previewVideo.volume = 0;

      const allowAdaptiveRateSync =
        args.isPlaybackActive
        && !args.isScrubbing
        && !srcChanged
        && !previewVideoSrcChanged
        && !transportProgress.shouldSyncMediaTime;

      if (allowAdaptiveRateSync) {
        const driftSec = previewVideo.currentTime - previewAudio.currentTime;
        if (Number.isFinite(driftSec)) {
          if (Math.abs(driftSec) > VIDEO_HARD_SEEK_THRESHOLD_SEC) {
            const nowMs = Date.now();
            const elapsed = nowMs - args.previewVideoHardSeekAtMsRef.current;
            if (elapsed >= VIDEO_HARD_SEEK_COOLDOWN_MS) {
              args.previewVideoHardSeekAtMsRef.current = nowMs;
              previewVideo.currentTime = previewAudio.currentTime;
            }
            previewVideo.playbackRate = previewAudio.playbackRate;
          } else {
            const correction = Math.max(
              VIDEO_PLAYBACK_RATE_MIN,
              Math.min(VIDEO_PLAYBACK_RATE_MAX, 1 - (driftSec * VIDEO_DRIFT_RATE_K)),
            );
            previewVideo.playbackRate = previewAudio.playbackRate * correction;
          }
        } else {
          previewVideo.playbackRate = previewAudio.playbackRate;
        }
      } else {
        previewVideo.playbackRate = previewAudio.playbackRate;
        if (shouldSynchronizeCurrentTime && Math.abs(previewVideo.currentTime - targetMediaTime) > SCRUB_SEEK_THRESHOLD_SEC) {
          previewVideo.currentTime = targetMediaTime;
        }
      }
    }

    if (transportProgress.shouldStop) {
      previewAudio.pause();
      previewVideo?.pause();
      if (args.isPlaybackActive) args.setIsPlaybackActive(false);
      if (args.playbackWindow?.mode === "roll") {
        args.setPlaybackWindow(null);
      }
      return;
    }

    if (!args.isPlaybackActive) {
      previewAudio.pause();
      previewVideo?.pause();
      return;
    }

    previewAudio.muted = false;
    if (previewAudio.volume <= 0) {
      previewAudio.volume = 1;
    }
    claimGlobalPlaybackAuthority(previewAudio);
    if (previewAudio.paused) {
      void previewAudio.play().catch(() => {
        args.setIsPlaybackActive(false);
      });
    }

    if (args.previewVideoSrc && previewVideo) {
      previewVideo.muted = true;
      previewVideo.volume = 0;
      if (previewVideo.paused) {
        void previewVideo.play().catch(() => {
          // keep base video best-effort; audio continues as authority
        });
      }
    }
  }, [
    args.isPlaybackActive,
    args.isScrubbing,
    args.playbackMediaSrc,
    args.playbackOwnerIdRef,
    args.playbackTransportDurationSec,
    args.playbackWindow,
    args.playheadSec,
    args.previewAudioRef,
    args.resolveMediaTimeForTransportTime,
    args.previewVideoHardSeekAtMsRef,
    args.previewVideoRef,
    args.previewVideoSrc,
    args.setIsPlaybackActive,
    args.setPlaybackWindow,
    args.setPlayheadSec,
    args.visualPolishPreviewActive,
    claimGlobalPlaybackAuthority,
    releaseGlobalPlaybackAuthority,
    resolveAudibleSeekTarget,
    resolvePlaybackTransportProgress,
    seekPreviewAudioWithOptionalSeamFade,
  ]);

  useEffect(() => () => {
    const previewAudio = args.previewAudioRef.current;
    previewAudio?.pause();
    releaseGlobalPlaybackAuthority(previewAudio);
    args.pauseAuxiliaryMediaPlayback();
  }, [args.pauseAuxiliaryMediaPlayback, args.previewAudioRef, releaseGlobalPlaybackAuthority]);

  useEffect(() => () => {
    const timerId = args.cutSeekFadeRef.current.timerId;
    if (timerId != null) {
      window.clearTimeout(timerId);
      args.cutSeekFadeRef.current.timerId = null;
    }
    args.cutSeekFadeRef.current.token += 1;
  }, [args.cutSeekFadeRef]);

  useEffect(() => {
    if (args.isPlaybackActive) return;
    releaseGlobalPlaybackAuthority(args.previewAudioRef.current);
  }, [args.isPlaybackActive, args.previewAudioRef, releaseGlobalPlaybackAuthority]);

  useEffect(() => {
    const previewAudio = args.previewAudioRef.current;
    if (!previewAudio) return;
    previewAudio.playbackRate = args.isScrubbing ? args.scrubRate : 1;
  }, [args.isScrubbing, args.previewAudioRef, args.scrubRate]);

  useEffect(() => {
    if (!args.isPlaybackActive) return;
    if (args.playbackTransportDurationSec <= 0) {
      args.setIsPlaybackActive(false);
      return;
    }
    if (args.playbackMediaSrc) return;

    const intervalId = window.setInterval(() => {
      args.setPlayheadSec((current) => {
        const next = Math.min(roundToTenth(current + 0.1), args.playbackTransportDurationSec);
        const transportProgress = resolvePlaybackTransportProgress(next);
        if (transportProgress.shouldStop) {
          window.clearInterval(intervalId);
          args.setIsPlaybackActive(false);
          if (args.playbackWindow?.mode === "roll") {
            args.setPlaybackWindow(null);
          }
        }
        if (!args.playbackWindow && transportProgress.nextPlayheadSec >= args.playbackTransportDurationSec) {
          window.clearInterval(intervalId);
          args.setIsPlaybackActive(false);
        }
        return roundToTenth(transportProgress.nextPlayheadSec);
      });
    }, 100);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [
    args.isPlaybackActive,
    args.playbackMediaSrc,
    args.playbackTransportDurationSec,
    args.playbackWindow,
    args.setIsPlaybackActive,
    args.setPlaybackWindow,
    args.setPlayheadSec,
    resolvePlaybackTransportProgress,
  ]);

  useEffect(() => {
    const runtimeWindow = window as HammerPlaybackAuthorityWindow;
    runtimeWindow.__forgeHammerIsPlaybackActive__ = Boolean(args.isPlaybackActive);
    return () => {
      runtimeWindow.__forgeHammerIsPlaybackActive__ = false;
    };
  }, [args.isPlaybackActive]);

  const handlePlaybackProgress = useCallback((nextTimeSec: number): void => {
    const transportProgress = resolvePlaybackTransportProgress(args.resolveTransportTimeForMediaTime(nextTimeSec));
    const nextPlayhead = roundToTenth(transportProgress.nextPlayheadSec);

    args.setPlayheadSec((current) => (
      Math.abs(current - nextPlayhead) >= SCRUB_SEEK_THRESHOLD_SEC ? nextPlayhead : current
    ));

    if (
      args.previewAudioRef.current
      && (transportProgress.shouldLoop || transportProgress.shouldSyncMediaTime)
      && Math.abs(
        args.previewAudioRef.current.currentTime - args.resolveMediaTimeForTransportTime(transportProgress.nextPlayheadSec),
      ) > SCRUB_SEEK_THRESHOLD_SEC
    ) {
      args.previewAudioRef.current.currentTime = args.resolveMediaTimeForTransportTime(transportProgress.nextPlayheadSec);
    }

    if (transportProgress.shouldLoop) {
      return;
    }

    if (transportProgress.shouldStop) {
      args.setIsPlaybackActive(false);
      if (args.playbackWindow?.mode === "roll") {
        args.setPlaybackWindow(null);
      }
    }
  }, [
    args.playbackWindow?.mode,
    args.previewAudioRef,
    args.resolveMediaTimeForTransportTime,
    args.resolveTransportTimeForMediaTime,
    args.setIsPlaybackActive,
    args.setPlaybackWindow,
    args.setPlayheadSec,
    resolvePlaybackTransportProgress,
  ]);

  const handlePlaybackEnded = useCallback((endedMediaTimeSec: number): void => {
    const requestedTransportTime = Math.min(
      args.playbackTransportDurationSec,
      args.resolveTransportTimeForMediaTime(endedMediaTimeSec) + 0.01,
    );
    const transportProgress = resolvePlaybackTransportProgress(requestedTransportTime);
    if (transportProgress.shouldStop || transportProgress.nextPlayheadSec >= args.playbackTransportDurationSec) {
      args.setIsPlaybackActive(false);
      if (args.playbackWindow?.mode === "roll") {
        args.setPlaybackWindow(null);
      }
      args.setPlayheadSec(roundToTenth(Math.min(transportProgress.nextPlayheadSec, args.playbackTransportDurationSec)));
      return;
    }
    args.setPlayheadSec(roundToTenth(transportProgress.nextPlayheadSec));
  }, [
    args.playbackTransportDurationSec,
    args.playbackWindow?.mode,
    args.resolveTransportTimeForMediaTime,
    args.setIsPlaybackActive,
    args.setPlaybackWindow,
    args.setPlayheadSec,
    resolvePlaybackTransportProgress,
  ]);

  const togglePlayback = useCallback((): void => {
    if (args.editableTranscriptSegments.length === 0) return;
    if (!args.playbackMediaSrc) {
      args.setTranscriptTimingHint("Mapped media unavailable. Check workspace media mapping or source media link.");
      return;
    }
    args.setIsPlaybackActive((current) => {
      if (current && args.playbackWindow?.mode === "roll") {
        args.setPlaybackWindow(null);
      }
      return !current;
    });
  }, [args.editableTranscriptSegments.length, args.playbackMediaSrc, args.playbackWindow?.mode, args.setIsPlaybackActive, args.setPlaybackWindow, args.setTranscriptTimingHint]);

  const seekPlayheadToTime = useCallback((
    nextTimeSec: number,
    origin: "timeline" | "playhead" = "timeline",
    options?: { snapToBoundary?: boolean },
  ): void => {
    const clamped = Math.max(0, Math.min(args.timelineDurationSec, roundToTenth(nextTimeSec)));
    const snapped = options?.snapToBoundary === false
      ? clamped
      : snapPlayheadToBoundary({
        nextPlayheadSec: clamped,
        boundaryTimesSec: args.playheadBoundaryTimesSec,
        toleranceSec: DEFAULT_PLAYHEAD_SNAP_TOLERANCE_SEC,
      });
    const audibleTarget = resolveAudibleSeekTarget(snapped);
    args.selectionOriginRef.current = origin;
    args.setPlayheadSec(roundToTenth(audibleTarget ?? args.playbackTransportDurationSec));
    args.setFocusOverride(resolveFocusAfterPlayheadChange(args.focusOverride));
  }, [
    args.focusOverride,
    args.playbackTransportDurationSec,
    args.playheadBoundaryTimesSec,
    args.selectionOriginRef,
    args.setFocusOverride,
    args.setPlayheadSec,
    args.timelineDurationSec,
    resolveAudibleSeekTarget,
  ]);

  const jumpToSelectionBoundary = useCallback((boundary: "start" | "end"): void => {
    if (!args.activeTranscriptTargetRange) {
      args.setTranscriptTimingHint("Select one or more segments to jump to selection boundaries.");
      return;
    }
    args.setTranscriptTimingHint(null);
    seekPlayheadToTime(boundary === "start" ? args.activeTranscriptTargetRange.startSec : args.activeTranscriptTargetRange.endSec, "playhead");
  }, [args.activeTranscriptTargetRange, args.setTranscriptTimingHint, seekPlayheadToTime]);

  const jumpToEditPoint = useCallback((direction: "previous" | "next"): void => {
    if (args.playheadBoundaryTimesSec.length === 0) return;
    const target = resolveAdjacentJumpPointTime({
      jumpPointsSec: args.playheadBoundaryTimesSec,
      playheadSec: args.playheadSec,
      direction,
    });
    seekPlayheadToTime(target, "playhead");
  }, [args.playheadBoundaryTimesSec, args.playheadSec, seekPlayheadToTime]);

  const addMarkerAtPlayhead = useCallback((): void => {
    const markerTimeSec = roundToTenth(args.playheadSec);
    const markerAtTime = args.timelineMarkers.find((marker) => marker.timeSec === markerTimeSec) ?? null;
    if (markerAtTime) {
      args.setTranscriptTimingHint(`Marker already exists at ${markerTimeSec.toFixed(1)}s.`);
      return;
    }

    args.setTimelineMarkers((current) => {
      const nextIndex = current.length + 1;
      return [
        ...current,
        {
          id: createTimelineMarkerId(),
          label: `M${nextIndex}`,
          timeSec: markerTimeSec,
        },
      ];
    });
    args.setTranscriptTimingHint(`Added marker at ${markerTimeSec.toFixed(1)}s.`);
  }, [args.playheadSec, args.setTimelineMarkers, args.setTranscriptTimingHint, args.timelineMarkers]);

  const removeMarker = useCallback((markerId: string): void => {
    args.setTimelineMarkers((current) => current.filter((marker) => marker.id !== markerId));
  }, [args.setTimelineMarkers]);

  const jumpToMarker = useCallback((direction: "previous" | "next"): void => {
    if (markerTimesSec.length === 0) {
      args.setTranscriptTimingHint("No timeline markers are set.");
      return;
    }
    const target = resolveAdjacentJumpPointTime({
      jumpPointsSec: markerTimesSec,
      playheadSec: args.playheadSec,
      direction,
    });
    seekPlayheadToTime(target, "playhead");
    args.setTranscriptTimingHint(null);
  }, [args.playheadSec, args.setTranscriptTimingHint, markerTimesSec, seekPlayheadToTime]);

  const jumpToMarkerById = useCallback((markerId: string): void => {
    const marker = sortedTimelineMarkers.find((item) => item.id === markerId) ?? null;
    if (!marker) return;
    seekPlayheadToTime(marker.timeSec, "playhead");
    args.setTranscriptTimingHint(null);
  }, [args.setTranscriptTimingHint, seekPlayheadToTime, sortedTimelineMarkers]);

  const toggleSelectionLoopPlayback = useCallback((): void => {
    if (isLoopPlaybackActive) {
      args.setPlaybackWindow(null);
      args.setTranscriptTimingHint("Loop playback disabled.");
      return;
    }
    if (!args.playbackMediaSrc) {
      args.setTranscriptTimingHint("Mapped media unavailable. Check workspace media mapping or source media link.");
      return;
    }
    if (!args.activeTranscriptTargetRange) {
      args.setTranscriptTimingHint("Select one or more segments to loop playback.");
      return;
    }

    const nextWindow: HammerPlaybackWindow = {
      mode: "loop",
      startSec: args.activeTranscriptTargetRange.startSec,
      endSec: args.activeTranscriptTargetRange.endSec,
      label: args.activeTranscriptTargetRange.label,
    };

    args.setPlaybackWindow(nextWindow);
    seekPlayheadToTime(nextWindow.startSec, "playhead");
    args.setIsPlaybackActive(true);
    args.setFocusOverride("time-focus");
    args.setTranscriptTimingHint(null);
  }, [
    args.activeTranscriptTargetRange,
    args.playbackMediaSrc,
    args.setFocusOverride,
    args.setIsPlaybackActive,
    args.setPlaybackWindow,
    args.setTranscriptTimingHint,
    isLoopPlaybackActive,
    seekPlayheadToTime,
  ]);

  const playSelectionWithRoll = useCallback((): void => {
    if (!args.playbackMediaSrc) {
      args.setTranscriptTimingHint("Mapped media unavailable. Check workspace media mapping or source media link.");
      return;
    }
    const nextWindow = resolveSelectionPlaybackRange({
      activeTranscriptTargetRange: args.activeTranscriptTargetRange,
      preRollSec: PRE_ROLL_SEC,
      postRollSec: POST_ROLL_SEC,
      labelPrefix: "Pre/Post Roll",
      timelineDurationSec: args.timelineDurationSec,
    });
    if (!nextWindow) {
      args.setTranscriptTimingHint("Select one or more segments to audition with pre/post roll.");
      return;
    }

    args.setPlaybackWindow(nextWindow);
    seekPlayheadToTime(nextWindow.startSec, "playhead", { snapToBoundary: false });
    args.setIsPlaybackActive(true);
    args.setFocusOverride("time-focus");
    args.setTranscriptTimingHint(null);
  }, [
    args.activeTranscriptTargetRange,
    args.playbackMediaSrc,
    args.setFocusOverride,
    args.setIsPlaybackActive,
    args.setPlaybackWindow,
    args.setTranscriptTimingHint,
    args.timelineDurationSec,
    seekPlayheadToTime,
  ]);

  const seekPlayheadFromScrubClientX = useCallback((clientX: number): void => {
    const rect = args.scrubRectRef.current;
    if (!rect || rect.width <= 0) return;
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    seekPlayheadToTime(ratio * args.timelineDurationSec, "playhead", { snapToBoundary: false });
  }, [args.scrubRectRef, args.timelineDurationSec, seekPlayheadToTime]);

  const beginTimelineScrub = useCallback((event: ReactMouseEvent<HTMLElement>): void => {
    const target = event.target;
    if (target instanceof HTMLElement && target.closest(".hammer-timeline-block")) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;

    event.preventDefault();
    args.scrubRectRef.current = { left: rect.left, width: rect.width };
    args.scrubAutoPlayRef.current = false;
    args.scrubReturnToPausedRef.current = !args.isPlaybackActive;
    args.setFocusOverride("time-focus");
    args.setIsScrubbing(true);
    seekPlayheadFromScrubClientX(event.clientX);

    if (!args.isPlaybackActive && args.playbackMediaSrc && args.previewAudioRef.current) {
      const previewAudio = args.previewAudioRef.current;
      claimGlobalPlaybackAuthority(previewAudio);
      previewAudio.playbackRate = args.scrubRate;
      void previewAudio.play()
        .then(() => {
          args.scrubAutoPlayRef.current = true;
        })
        .catch(() => {
          args.scrubAutoPlayRef.current = false;
          releaseGlobalPlaybackAuthority(previewAudio);
        });
    }
  }, [
    args.isPlaybackActive,
    args.playbackMediaSrc,
    args.previewAudioRef,
    args.scrubAutoPlayRef,
    args.scrubRate,
    args.scrubRectRef,
    args.scrubReturnToPausedRef,
    args.setFocusOverride,
    args.setIsScrubbing,
    claimGlobalPlaybackAuthority,
    releaseGlobalPlaybackAuthority,
    seekPlayheadFromScrubClientX,
  ]);

  const endTimelineScrub = useCallback((): void => {
    args.setIsScrubbing(false);
    args.scrubRectRef.current = null;
    if (args.previewAudioRef.current) {
      args.previewAudioRef.current.playbackRate = 1;
    }
    if (args.scrubAutoPlayRef.current && args.scrubReturnToPausedRef.current) {
      args.previewAudioRef.current?.pause();
      releaseGlobalPlaybackAuthority(args.previewAudioRef.current);
      args.setIsPlaybackActive(false);
    }
    args.scrubAutoPlayRef.current = false;
    args.scrubReturnToPausedRef.current = false;
  }, [
    args.previewAudioRef,
    args.scrubAutoPlayRef,
    args.scrubRectRef,
    args.scrubReturnToPausedRef,
    args.setIsPlaybackActive,
    args.setIsScrubbing,
    releaseGlobalPlaybackAuthority,
  ]);

  const nudgePlayhead = useCallback((deltaSec: number): void => {
    seekPlayheadToTime(args.playheadSec + deltaSec, "playhead");
  }, [args.playheadSec, seekPlayheadToTime]);

  useEffect(() => {
    if (!args.isScrubbing) return;

    const handleMouseMove = (event: globalThis.MouseEvent): void => {
      if (event.buttons === 0) {
        endTimelineScrub();
        return;
      }
      const rect = args.scrubRectRef.current;
      if (!rect || rect.width <= 0) return;
      const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
      seekPlayheadToTime(ratio * args.timelineDurationSec, "playhead", { snapToBoundary: false });
    };

    const handleMouseUp = (): void => {
      endTimelineScrub();
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [args.isScrubbing, args.scrubRectRef, args.timelineDurationSec, endTimelineScrub, seekPlayheadToTime]);

  return {
    isLoopPlaybackActive,
    playbackModeLabel,
    sortedTimelineMarkers,
    markerTimesSec,
    resolveAudibleSeekTarget,
    handlePlaybackProgress,
    handlePlaybackEnded,
    togglePlayback,
    seekPlayheadToTime,
    jumpToSelectionBoundary,
    jumpToEditPoint,
    addMarkerAtPlayhead,
    removeMarker,
    jumpToMarker,
    jumpToMarkerById,
    toggleSelectionLoopPlayback,
    playSelectionWithRoll,
    beginTimelineScrub,
    endTimelineScrub,
    nudgePlayhead,
  };
}