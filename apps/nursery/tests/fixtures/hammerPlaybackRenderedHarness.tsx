import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import spokenMediaBase64 from "./hammer-playback-spoken.webm.base64?raw";
import { useHammerPlaybackReadiness } from "../../../hammer/src/editor/hammerPlaybackReadiness";
import { useHammerWorkspaceShellPlayback } from "../../../hammer/src/editor/useHammerWorkspaceShellPlayback";
import {
  applyHammerStudioRackNativePreview,
  inspectHammerStudioRackNativePreview,
} from "../../../hammer/src/editor/hammerStudioRackNativePreview";
import { createDefaultHammerStudioRackState } from "../../../hammer/src/editor/hammerStudioRack";

const mediaSrc = `data:video/webm;base64,${spokenMediaBase64.trim()}`;
const noop = (): void => undefined;

export function Harness(): React.JSX.Element {
  const mediaRef = useRef<HTMLVideoElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const selectionOriginRef = useRef<"system" | "transcript" | "timeline" | "playhead">("system");
  const hardSeekRef = useRef(0);
  const cutFadeRef = useRef({ token: 0, timerId: null as number | null });
  const scrubRectRef = useRef<{ left: number; width: number } | null>(null);
  const scrubAutoPlayRef = useRef(false);
  const scrubReturnToPausedRef = useRef(false);
  const playbackOwnerIdRef = useRef("rendered-playback-test");
  const [playhead, setPlayhead] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [windowState, setWindowState] = useState<null>(null);
  const [scrubbing, setScrubbing] = useState(false);
  const [markers, setMarkers] = useState<never[]>([]);
  const [hint, setHint] = useState<string | null>(null);
  const [audioContextState, setAudioContextState] = useState("missing");
  const readiness = useHammerPlaybackReadiness({ mediaRef, source: mediaSrc, expectedDurationSec: 3 });

  useEffect(() => {
    if (mediaRef.current) applyHammerStudioRackNativePreview(mediaRef.current, createDefaultHammerStudioRackState());
  }, []);

  const transport = useHammerWorkspaceShellPlayback({
    editableTranscriptSegments: [{ segment_id: "solo", speaker: "Speaker A", start_sec: 0, end_sec: 3, text: "Hammer playback is working clearly." }],
    effectivePlaybackCutRegions: [], timelineDurationSec: 3, playbackTransportDurationSec: 3,
    playheadBoundaryTimesSec: [0, 3], activeTranscriptTargetRange: null,
    resolveAudibleTransportTime: (time) => time < 3 ? time : null,
    resolveMediaTimeForTransportTime: (time) => time,
    resolveTransportTimeForMediaTime: (time) => time,
    playbackMediaSrc: mediaSrc, playbackReady: readiness.status === "playable", playbackPhase: "content",
    previewVideoSrc: null, visualPolishPreviewActive: false, focusOverride: "time-focus",
    playheadSec: playhead, isPlaybackActive: playing, playbackWindow: windowState,
    isScrubbing: scrubbing, timelineMarkers: markers, scrubRate: 1,
    selectionOriginRef, previewAudioRef: mediaRef, previewVideoRef: videoRef,
    previewVideoHardSeekAtMsRef: hardSeekRef, cutSeekFadeRef: cutFadeRef,
    scrubRectRef, scrubAutoPlayRef, scrubReturnToPausedRef, playbackOwnerIdRef,
    setPlayheadSec: setPlayhead, setIsPlaybackActive: setPlaying,
    setPlaybackWindow: setWindowState, setIsScrubbing: setScrubbing,
    setTimelineMarkers: setMarkers, setFocusOverride: noop,
    setTranscriptTimingHint: setHint, pauseAuxiliaryMediaPlayback: noop,
  });

  return <main>
    <button type="button" onClick={transport.togglePlayback}>{playing ? "Pause (Space)" : "Play (Space)"}</button>
    <video
      ref={mediaRef}
      src={mediaSrc}
      preload="auto"
      playsInline
      onTimeUpdate={(event) => {
        setAudioContextState(inspectHammerStudioRackNativePreview(event.currentTarget).contextState ?? "missing");
        if (playing) transport.handlePlaybackProgress(event.currentTarget.currentTime);
      }}
      onEnded={(event) => transport.handlePlaybackEnded(event.currentTarget.currentTime)}
    />
    <output data-testid="readiness">{readiness.status}</output>
    <output data-testid="playhead">{playhead.toFixed(3)}</output>
    <output data-testid="hint">{hint ?? ""}</output>
    <output data-testid="audio-context">{audioContextState}</output>
  </main>;
}

createRoot(document.getElementById("root")!).render(<Harness />);
