import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { HammerAudibleMedia } from "../../../hammer/src/editor/HammerAudibleMedia";
import { bindLaunchContextToCanonicalRecording } from "../../../hammer/src/editor/hammerCanonicalMediaBinding";
import type { CanonicalRecordingRecord, RecordingRevisionRecord } from "@forge/tongs/workpiece-commit-api";
import { resolveHammerRawPlaybackSource, type HammerRawPlaybackSource } from "../../../hammer/src/editor/hammerCanonicalPlayback";
import { resolveHammerTransportDurationAuthority } from "../../../hammer/src/editor/hammerTransportDurationAuthority";
import { useHammerPlaybackReadiness } from "../../../hammer/src/editor/hammerPlaybackReadiness";
import { useHammerWorkspaceShellPlayback } from "../../../hammer/src/editor/useHammerWorkspaceShellPlayback";
import { applyHammerStudioRackNativePreview, inspectHammerStudioRackNativePreview } from "../../../hammer/src/editor/hammerStudioRackNativePreview";
import { createDefaultHammerStudioRackState } from "../../../hammer/src/editor/hammerStudioRack";

const ids = {
  workspace: "cc5478ff-37be-403e-824c-467fa7da061e",
  workpiece: "21d16d6a-905b-491e-8761-028789612ae5",
  recording: "4cc846e3-187c-46d9-8733-e7402488236c",
  revision: "9c991aa7-f551-4f03-a4d6-41eb40ef81ec",
};
const transcriptDurationSec = 2;
const noop = (): void => undefined;

function isTextEditingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || target.isContentEditable;
}

export function Harness(): React.JSX.Element {
  const mediaRef = useRef<HTMLVideoElement | null>(null);
  const previewVideoRef = useRef<HTMLVideoElement | null>(null);
  const selectionOriginRef = useRef<"system" | "transcript" | "timeline" | "playhead">("system");
  const hardSeekRef = useRef(0);
  const cutFadeRef = useRef({ token: 0, timerId: null as number | null });
  const scrubRectRef = useRef<{ left: number; width: number } | null>(null);
  const scrubAutoPlayRef = useRef(false);
  const scrubReturnToPausedRef = useRef(false);
  const playbackOwnerIdRef = useRef("canonical-rendered-playback-test");
  const [source, setSource] = useState<HammerRawPlaybackSource | null>(null);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [endpointCalls, setEndpointCalls] = useState(0);
  const [binaryFallbackCalls, setBinaryFallbackCalls] = useState(0);
  const [playhead, setPlayhead] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [windowState, setWindowState] = useState<null>(null);
  const [scrubbing, setScrubbing] = useState(false);
  const [markers, setMarkers] = useState<never[]>([]);
  const [hint, setHint] = useState<string | null>(null);
  const [audioContextState, setAudioContextState] = useState("missing");
  const [nativeDuration, setNativeDuration] = useState("missing");
  const [openedSession, setOpenedSession] = useState<{
    canonical_recording: CanonicalRecordingRecord;
    revision: RecordingRevisionRecord;
  } | null>(null);

  useEffect(() => {
    let active = true;
    void fetch("/test/hammer/session", { method: "POST" })
      .then((response) => response.json())
      .then((payload: { data?: { canonical_recording?: CanonicalRecordingRecord; revision?: RecordingRevisionRecord } }) => {
        if (active && payload.data?.canonical_recording && payload.data.revision) {
          setOpenedSession({
            canonical_recording: payload.data.canonical_recording,
            revision: payload.data.revision,
          });
        }
      })
      .catch((error: unknown) => {
        if (active) setSourceError(error instanceof Error ? error.message : String(error));
      });
    return () => { active = false; };
  }, []);

  const boundLaunchContext = useMemo(() => openedSession ? bindLaunchContextToCanonicalRecording({
    workspace_id: ids.workspace,
    workpiece_id: ids.workpiece,
    session_id: "normal-open-session",
    source_mode: "tongs",
    transcript: { kind: "tongs-stub", transcript_id: "saved-transcript", segments: [], label: "Saved transcript" },
    media: {
      kind: "tongs-stub",
      ref: {
        media_id: "workspace-default-intro",
        kind: "recording_video",
        source_hint: "cloud",
        local_relpath: "assets/default-intro.webm",
        sha256: "a".repeat(64),
        duration_ms: 1_000,
      },
      label: "Stale preview asset",
    },
    preview_mode: "edit-aware",
  }, openedSession.canonical_recording) : null, [openedSession]);
  const canonicalMediaRef = boundLaunchContext?.media.kind === "tongs-stub" ? boundLaunchContext.media.ref : null;

  useEffect(() => {
    if (!canonicalMediaRef?.local_relpath) return;
    let active = true;
    void resolveHammerRawPlaybackSource({
      workspaceId: ids.workspace,
      workpieceId: ids.workpiece,
      canonicalRecordingId: ids.recording,
      recordingRevisionId: ids.revision,
      mediaRef: canonicalMediaRef,
      path: canonicalMediaRef.local_relpath,
      mimeType: "video/webm;codecs=vp9,opus",
      fetcher: (async (url: string, options?: { method?: string; json?: unknown }) => {
        if (url.includes("/hammer/playable-media")) setEndpointCalls((current) => current + 1);
        if (url.includes("read-file") && url.includes("encoding=binary")) setBinaryFallbackCalls((current) => current + 1);
        return fetch(url, {
          method: options?.method ?? "GET",
          headers: options?.json ? { "content-type": "application/json" } : undefined,
          body: options?.json ? JSON.stringify(options.json) : undefined,
        });
      }) as never,
    }).then((resolved) => {
      if (active) setSource(resolved);
    }).catch((error: unknown) => {
      if (active) setSourceError(error instanceof Error ? error.message : String(error));
    });
    return () => { active = false; };
  }, [canonicalMediaRef]);

  const durationAuthority = useMemo(() => resolveHammerTransportDurationAuthority({
    mediaRef: canonicalMediaRef,
    transcriptDurationSec,
    canonicalRecordingId: ids.recording,
    recordingRevisionId: ids.revision,
    rawPlaybackSource: source,
  }), [canonicalMediaRef, source]);
  const durationSec = durationAuthority.durationSec;

  const readiness = useHammerPlaybackReadiness({
    mediaRef,
    source: source?.url ?? null,
    expectedDurationSec: durationSec,
    verifiedDurationAuthority: durationAuthority.verifiedDurationAuthority,
  });

  useEffect(() => {
    if (mediaRef.current) applyHammerStudioRackNativePreview(mediaRef.current, createDefaultHammerStudioRackState());
  }, [source?.url]);

  const transport = useHammerWorkspaceShellPlayback({
    editableTranscriptSegments: [{ segment_id: "episode", speaker: "Speaker A", start_sec: 0, end_sec: transcriptDurationSec, text: "Hammer canonical playback is working clearly." }],
    effectivePlaybackCutRegions: [],
    timelineDurationSec: durationSec,
    playbackTransportDurationSec: durationSec,
    playbackMediaDurationSec: readiness.durationSec,
    playheadBoundaryTimesSec: [0, durationSec],
    activeTranscriptTargetRange: null,
    resolveAudibleTransportTime: (time) => time < durationSec ? time : null,
    resolveMediaTimeForTransportTime: (time) => time,
    resolveTransportTimeForMediaTime: (time) => time,
    playbackMediaSrc: source?.url ?? null,
    playbackReady: readiness.status === "playable",
    playbackPhase: "content",
    previewVideoSrc: null,
    visualPolishPreviewActive: false,
    focusOverride: "time-focus",
    playheadSec: playhead,
    isPlaybackActive: playing,
    playbackWindow: windowState,
    isScrubbing: scrubbing,
    timelineMarkers: markers,
    scrubRate: 1,
    selectionOriginRef,
    previewAudioRef: mediaRef,
    previewVideoRef,
    previewVideoHardSeekAtMsRef: hardSeekRef,
    cutSeekFadeRef: cutFadeRef,
    scrubRectRef,
    scrubAutoPlayRef,
    scrubReturnToPausedRef,
    playbackOwnerIdRef,
    setPlayheadSec: setPlayhead,
    setIsPlaybackActive: setPlaying,
    setPlaybackWindow: setWindowState,
    setIsScrubbing: setScrubbing,
    setTimelineMarkers: setMarkers,
    setFocusOverride: noop,
    setTranscriptTimingHint: setHint,
    pauseAuxiliaryMediaPlayback: noop,
  });
  const togglePlayback = transport.togglePlayback;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.key !== " " && event.code !== "Space") || isTextEditingTarget(event.target)) return;
      event.preventDefault();
      togglePlayback();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [togglePlayback]);

  return <main tabIndex={-1}>
    <button type="button" onClick={togglePlayback}>{playing ? "Pause" : "Play"}</button>
    <button type="button" onClick={() => transport.seekPlayheadToTime(0.35, "timeline")}>Seek early</button>
    <button type="button" onClick={() => transport.seekPlayheadToTime(2.35, "timeline")}>Seek late</button>
    <button type="button" onClick={() => transport.seekPlayheadToTime(transcriptDurationSec, "timeline")}>Seek transcript end</button>
    <div tabIndex={0} data-testid="shortcut-focus">Keyboard shortcut focus</div>
    <HammerAudibleMedia
      ref={mediaRef}
      src={source?.url ?? undefined}
      preload="auto"
      playsInline
      onLoadedMetadata={(event) => setNativeDuration(String(event.currentTarget.duration))}
      onDurationChange={(event) => setNativeDuration(String(event.currentTarget.duration))}
      onTimeUpdate={(event) => {
        setAudioContextState(inspectHammerStudioRackNativePreview(event.currentTarget).contextState ?? "missing");
        if (playing) transport.handlePlaybackProgress(event.currentTarget.currentTime);
      }}
      onEnded={(event) => transport.handlePlaybackEnded(event.currentTarget.currentTime)}
    />
    <output data-testid="readiness">{readiness.status}</output>
    <output data-testid="duration-source">{readiness.durationSource ?? "none"}</output>
    <output data-testid="transport-duration">{durationSec.toFixed(3)}</output>
    <output data-testid="native-duration">{nativeDuration}</output>
    <output data-testid="playhead">{playhead.toFixed(3)}</output>
    <output data-testid="hint">{hint ?? ""}</output>
    <output data-testid="audio-context">{audioContextState}</output>
    <output data-testid="source-kind">{source?.kind ?? "pending"}</output>
    <output data-testid="source-sha">{canonicalMediaRef?.sha256 ?? "missing"}</output>
    <output data-testid="transcript-id">{boundLaunchContext?.transcript.kind === "tongs-stub" ? boundLaunchContext.transcript.transcript_id : "missing"}</output>
    <output data-testid="provider-attempt-count">1</output>
    <output data-testid="endpoint-calls">{endpointCalls}</output>
    <output data-testid="binary-fallback-calls">{binaryFallbackCalls}</output>
    <output data-testid="source-error">{sourceError ?? ""}</output>
  </main>;
}

createRoot(document.getElementById("root")!).render(<Harness />);
