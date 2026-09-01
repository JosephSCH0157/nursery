import { useEffect, useMemo, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { MediaRef } from "../../../../packages/contracts/hammer/media-resolver.contract";
import type { HammerEditInstruction } from "../../../../packages/contracts/hammer/edit-instruction.contract";
import type { HammerTranscriptSegment } from "../../../../packages/contracts/hammer/transcript.contract";
import type { HammerPersistedAudioPolish } from "../persistence/hammerPersistenceContract";
import { cloneHammerAudioPolish } from "../prep/hammerAudioPolish";
import type { HammerMediaBackboneRuntimeSummary } from "../media/hammerMediaBackbone";
import { executeDialogueAudioRenderWithBackend, processDialogueAudioWithBackend, resolveHammerAudioProcessingBackend, type HammerDialogueRenderExecutionResult } from "./hammerAudioProcessingBackend";
import { buildHammerDevMediaUrl, loadCanonicalAudioPolishPreviewUrl } from "../lib/previewSource";
import { loadWorkpieceMediaPreviewUrl } from "../lib/hammerSourceDeskMediaApi";
import { applyHammerStudioRackNativePreview } from "./hammerStudioRackNativePreview";
import { buildHammerAudioDspPlan, buildHammerAudioRenderIdentity, fingerprintHammerAudio } from "./hammerAudioDspPlan";
import {
  cloneHammerStudioRackState,
  createDefaultHammerStudioRackState,
  isHammerStudioRackIdentity,
  normalizeHammerStudioRackState,
  type HammerStudioRackState,
} from "./hammerStudioRack";
import {
  applyHammerVoicePolishPreset,
  createDefaultHammerVoicePolishState,
  setHammerVoiceCleanupEnabled,
  setHammerVoicePolishDeEsserStrength,
  setHammerVoicePolishEqProfile,
  setHammerVoicePolishFixEnabled,
  type HammerVoicePolishDeEsserStrength,
  type HammerVoicePolishEqProfile,
  type HammerVoicePolishFixId,
  type HammerVoicePolishPresetId,
} from "./hammerVoicePolish";
import type { HammerEditorStateSerializable, HammerHistoryEntry } from "./hammerWorkspaceHistory";
import { createPodcastMasterPassInstruction } from "./hammerAuthorityOps";
import type { HammerHistoryMutationArgs } from "./hammerWorkspaceShellHistoryController";

/**
 * Audio finishing exposes coordinated slot-specific hooks solely to preserve the
 * legacy React hook/effect registration order during behavior-neutral decomposition.
 * Together these entry points are the single Studio Rack and audio-polish authority.
 */
export type HammerAudioFinalizationCompareMode = "before" | "after";

export function createHammerPodcastMasterCommands(args: {
  applyHistoryMutation: (mutation: HammerHistoryMutationArgs) => HammerHistoryEntry | null;
  appendAuthorityInstruction: (state: HammerEditorStateSerializable, instruction: HammerEditInstruction) =>
    HammerEditorStateSerializable["editorialAuthorityGraph"];
}) {
  const applyPodcastMasterPass = (): void => {
    args.applyHistoryMutation({
      label: "Apply Podcast Master pass",
      kind: "editor_state_change",
      toolId: "audio",
      immediatePersist: true,
      computeAfter: (before) => {
        const graph = before.editorialAuthorityGraph;
        if (!graph) return before;
        const existingActive = graph.operations.find((operation) => (
          operation.lifecycle === "active" && operation.instruction.type === "podcast_master_pass"
        ));
        if (existingActive) return before;
        const segment = before.selectedSegmentId
          ? before.transcriptSegments.find((item) => item.segment_id === before.selectedSegmentId) ?? null
          : before.transcriptSegments[0] ?? null;
        if (!segment) return before;
        const instruction = createPodcastMasterPassInstruction({
          segmentId: segment.segment_id,
          noiseCleanup: "light",
          normalizationLufs: -16,
          compressionAmount: "medium",
          limiterCeilingDbtp: -1,
        });
        return { ...before, editorialAuthorityGraph: args.appendAuthorityInstruction(before, instruction) };
      },
    });
  };
  return { applyPodcastMasterPass };
}

export function createHammerAudioFinishingRequestLifecycle(initialIdentity: string) {
  let identity = initialIdentity;
  let generation = 0;
  let requestId = 0;
  return {
    syncIdentity(nextIdentity: string) { if (nextIdentity !== identity) { identity = nextIdentity; generation += 1; } },
    begin() { requestId += 1; return Object.freeze({ identity, generation, requestId }); },
    accepts(token: { identity: string; generation: number; requestId: number }) { return token.identity === identity && token.generation === generation && token.requestId === requestId; },
    invalidate() { generation += 1; },
  };
}

export function useHammerAudioFinishingStudioRackState() {
  const [editableStudioRack, setEditableStudioRack] = useState<HammerStudioRackState>(() => createDefaultHammerStudioRackState());
  const [studioRackOpen, setStudioRackOpen] = useState(false);
  return { editableStudioRack, setEditableStudioRack, studioRackOpen, setStudioRackOpen };
}

export function useHammerAudioFinishingPolishState(initial: HammerPersistedAudioPolish | null | undefined) {
  const [editableAudioPolish, setEditableAudioPolish] = useState<HammerPersistedAudioPolish | null>(() => cloneHammerAudioPolish(initial));
  const [audioLevelingEnabled, setAudioLevelingEnabled] = useState(true);
  const [audioNoiseReductionEnabled, setAudioNoiseReductionEnabled] = useState(true);
  const [audioFinalizationCompareMode, setAudioFinalizationCompareMode] = useState<HammerAudioFinalizationCompareMode>("after");
  return { editableAudioPolish, setEditableAudioPolish, audioLevelingEnabled, setAudioLevelingEnabled, audioNoiseReductionEnabled, setAudioNoiseReductionEnabled, audioFinalizationCompareMode, setAudioFinalizationCompareMode };
}

export function useHammerAudioFinishingRenderStatusState() {
  return useState<HammerDialogueRenderExecutionResult | null>(null);
}

export function useHammerAudioFinishingBackendDerivedState(args: { rack: HammerStudioRackState; runtime: HammerMediaBackboneRuntimeSummary }) {
  const playbackBackendResolution = useMemo(() => resolveHammerAudioProcessingBackend({ requestedBackend: args.rack.backend_preference, mode: "playback", runtimeSummary: args.runtime }), [args.rack.backend_preference, args.runtime]);
  const renderBackendResolution = useMemo(() => resolveHammerAudioProcessingBackend({ requestedBackend: args.rack.backend_preference, mode: "render", runtimeSummary: args.runtime }), [args.rack.backend_preference, args.runtime]);
  const playbackConfig = useMemo(() => processDialogueAudioWithBackend({ rackState: args.rack, mode: "playback", runtimeSummary: args.runtime }), [args.rack, args.runtime]);
  const renderConfig = useMemo(() => processDialogueAudioWithBackend({ rackState: args.rack, mode: "render", runtimeSummary: args.runtime }), [args.rack, args.runtime]);
  return { playbackBackendResolution, renderBackendResolution, playbackConfig, renderConfig };
}

export function useHammerAudioFinishingRackDerivedState(rack: HammerStudioRackState) {
  const voicePolish = useMemo(() => rack.voice_polish ?? createDefaultHammerVoicePolishState(), [rack.voice_polish]);
  const voicePolishHasAnyFixEnabled = useMemo(() => Object.values(voicePolish.fixes).some(Boolean), [voicePolish.fixes]);
  const hasAudibleProcessing = useMemo(() => rack.is_enabled && !rack.is_bypassed && !isHammerStudioRackIdentity(rack), [rack]);
  return { voicePolish, voicePolishHasAnyFixEnabled, hasAudibleProcessing };
}

export function useHammerAudioFinishingEnabledModuleCount(rack: HammerStudioRackState) {
  return useMemo(() => Object.values(rack.modules).filter((module) => module.is_enabled && !module.is_bypassed).length, [rack.modules]);
}

export function useHammerAudioFinishingNativePreviewEffect(args: { mode: HammerAudioFinalizationCompareMode; rack: HammerStudioRackState; mediaSrc: string | null; videoRef: MutableRefObject<HTMLVideoElement | null>; audioRef: MutableRefObject<HTMLVideoElement | null> }) {
  useEffect(() => {
    const previewRack = args.mode === "before" ? { ...args.rack, is_bypassed: true } : args.rack;
    applyHammerStudioRackNativePreview(args.videoRef.current, previewRack);
    applyHammerStudioRackNativePreview(args.audioRef.current, previewRack);
  }, [args.audioRef, args.mediaSrc, args.mode, args.rack, args.videoRef]);
}

export function useHammerAudioFinishingCompareResetEffect(args: { rackBypassed: boolean; setMode: Dispatch<SetStateAction<HammerAudioFinalizationCompareMode>> }) {
  const { rackBypassed, setMode } = args;
  useEffect(() => setMode(rackBypassed ? "before" : "after"), [rackBypassed, setMode]);
}

type ApplyMutation = (args: { label: string; kind: "editor_state_change"; toolId: "audio"; immediatePersist: true; computeAfter: (before: HammerEditorStateSerializable) => HammerEditorStateSerializable }) => HammerHistoryEntry | null;

export function createHammerAudioFinishingCommands(args: { rack: HammerStudioRackState; applyHistoryMutation: ApplyMutation; focusTool: () => void; setCompareMode: Dispatch<SetStateAction<HammerAudioFinalizationCompareMode>>; hasHistoryController: () => boolean }) {
  const applyStudioRackMutation = (label: string, updater: (current: HammerStudioRackState) => HammerStudioRackState): void => {
    args.applyHistoryMutation({ label, kind: "editor_state_change", toolId: "audio", immediatePersist: true, computeAfter: (before) => ({ ...before, studioRack: normalizeHammerStudioRackState(updater(cloneHammerStudioRackState(before.studioRack))) }) });
    args.focusTool();
  };
  const setStudioRackEnabled = (next: boolean) => applyStudioRackMutation(next ? "Enable Studio Rack" : "Disable Studio Rack", (current) => ({ ...current, is_enabled: next }));
  const setStudioRackBypassed = (next: boolean) => applyStudioRackMutation(next ? "Bypass Studio Rack" : "Un-bypass Studio Rack", (current) => ({ ...current, is_bypassed: next }));
  const setStudioRackBackend = (next: "native" | "ffmpeg") => applyStudioRackMutation(next === "ffmpeg" ? "Set Studio Rack backend to FFmpeg" : "Set Studio Rack backend to native", (current) => ({ ...current, backend_preference: next }));
  const setStudioRackModuleEnabled = (id: keyof HammerStudioRackState["modules"], next: boolean) => applyStudioRackMutation(next ? `Enable ${id}` : `Disable ${id}`, (current) => ({ ...current, modules: { ...current.modules, [id]: { ...current.modules[id], is_enabled: next } } }));
  const setStudioRackModuleBypassed = (id: keyof HammerStudioRackState["modules"], next: boolean) => applyStudioRackMutation(next ? `Bypass ${id}` : `Un-bypass ${id}`, (current) => ({ ...current, modules: { ...current.modules, [id]: { ...current.modules[id], is_bypassed: next } } }));
  const setAudioFinalizationCompare = (next: HammerAudioFinalizationCompareMode) => { if (import.meta.env.DEV) console.info("[Hammer][AudioFinalization] compare", { nextMode: next, hasHistoryController: args.hasHistoryController() }); args.setCompareMode(next); };
  const applyVoicePolishPreset = (id: HammerVoicePolishPresetId) => { if (import.meta.env.DEV) console.info("[Hammer][AudioFinalization] preset", { nextPresetId: id, hasHistoryController: args.hasHistoryController(), currentVoicePolish: args.rack.voice_polish ?? null }); applyStudioRackMutation("Apply audio preset", (current) => ({ ...current, is_enabled: true, is_bypassed: false, voice_polish: applyHammerVoicePolishPreset(current.voice_polish ?? createDefaultHammerVoicePolishState(), id) })); args.setCompareMode("after"); };
  const setVoicePolishFixEnabled = (id: HammerVoicePolishFixId, next: boolean) => { if (import.meta.env.DEV) console.info("[Hammer][AudioFinalization] fix", { fixId: id, nextEnabled: next, hasHistoryController: args.hasHistoryController(), currentVoicePolish: args.rack.voice_polish ?? null }); applyStudioRackMutation(next ? `Enable ${id}` : `Disable ${id}`, (current) => ({ ...current, is_enabled: true, is_bypassed: false, voice_polish: setHammerVoicePolishFixEnabled(current.voice_polish ?? createDefaultHammerVoicePolishState(), id, next) })); args.setCompareMode("after"); };
  const setVoicePolishDeEsserStrength = (next: HammerVoicePolishDeEsserStrength) => { applyStudioRackMutation("Update de-esser strength", (current) => ({ ...current, is_enabled: true, is_bypassed: false, voice_polish: setHammerVoicePolishDeEsserStrength(current.voice_polish ?? createDefaultHammerVoicePolishState(), next) })); args.setCompareMode("after"); };
  const setVoicePolishEqProfile = (next: HammerVoicePolishEqProfile) => { applyStudioRackMutation("Update EQ profile", (current) => ({ ...current, is_enabled: true, is_bypassed: false, voice_polish: setHammerVoicePolishEqProfile(current.voice_polish ?? createDefaultHammerVoicePolishState(), next) })); args.setCompareMode("after"); };
  const setVoiceCleanupEnabled = (next: boolean) => { applyStudioRackMutation(next ? "Enable voice cleanup" : "Disable voice cleanup", (current) => ({ ...current, is_enabled: next ? true : current.is_enabled, is_bypassed: next ? false : current.is_bypassed, voice_polish: setHammerVoiceCleanupEnabled(current.voice_polish ?? createDefaultHammerVoicePolishState(), next) })); if (next) args.setCompareMode("after"); };
  return { applyStudioRackMutation, setStudioRackEnabled, setStudioRackBypassed, setStudioRackBackend, setStudioRackModuleEnabled, setStudioRackModuleBypassed, setAudioFinalizationCompare, applyVoicePolishPreset, setVoicePolishFixEnabled, setVoicePolishDeEsserStrength, setVoicePolishEqProfile, setVoiceCleanupEnabled };
}

export function useHammerAudioFinishingPreviewSourceState() {
  return useState<string | null>(null);
}

export function useHammerAudioFinishingPreviewRefs() {
  return {
    previewSrcToRevokeRef: useRef<string | null>(null),
    previewInFlightRef: useRef(false),
    previewKeyRef: useRef<string | null>(null),
    playbackSrcToRevokeRef: useRef<string | null>(null),
    videoSrcToRevokeRef: useRef<string | null>(null),
    requestLifecycleRef: useRef(createHammerAudioFinishingRequestLifecycle("audio-preview:initial")),
  };
}

export type HammerAudioFinishingPreviewRuntimeArgs = {
  activeTool: string; currentPass: string; compareMode: HammerAudioFinalizationCompareMode;
  rack: HammerStudioRackState; transcriptSegments: HammerTranscriptSegment[];
  workspaceId: string; workpieceId: string; historyHeadEntryId: string | null;
  runtime: HammerMediaBackboneRuntimeSummary; mediaRef: MediaRef | null; localRootAbs: string | null;
  preferredPlayback: { kind: string; local_relpath?: string | null; workpiece_path?: string | null; mime_type?: string | null };
  hasAudibleProcessing: boolean; ffmpegAvailable: boolean;
  playbackMediaSrc: string | null; previewVideoSrc: string | null;
  setPlaybackMediaSrc: Dispatch<SetStateAction<string | null>>; setPreviewVideoSrc: Dispatch<SetStateAction<string | null>>;
  setRenderStatus: Dispatch<SetStateAction<HammerDialogueRenderExecutionResult | null>>;
  inferMime: (args: { path: string; kind: MediaRef["kind"] }) => string;
};

export function useHammerAudioFinishingPreviewEffects(
  args: HammerAudioFinishingPreviewRuntimeArgs,
  previewSrc: string | null,
  setPreviewSrc: Dispatch<SetStateAction<string | null>>,
  refs: ReturnType<typeof useHammerAudioFinishingPreviewRefs>,
) {
  const {
    activeTool, currentPass, compareMode, rack, transcriptSegments, workspaceId,
    workpieceId, historyHeadEntryId, runtime, mediaRef, localRootAbs,
    preferredPlayback, hasAudibleProcessing, ffmpegAvailable, playbackMediaSrc,
    previewVideoSrc, setPlaybackMediaSrc, setPreviewVideoSrc, setRenderStatus, inferMime,
  } = args;
  const shouldUseProcessed = activeTool === "audio" && currentPass === "audio_finalization" && compareMode === "after" && hasAudibleProcessing;
  useEffect(() => {
    const current = refs.previewSrcToRevokeRef.current;
    if (current?.startsWith("blob:") && current !== previewSrc) URL.revokeObjectURL(current);
    refs.previewSrcToRevokeRef.current = previewSrc?.startsWith("blob:") ? previewSrc : null;
    return () => { const next = refs.previewSrcToRevokeRef.current; if (next?.startsWith("blob:")) URL.revokeObjectURL(next); refs.previewSrcToRevokeRef.current = null; };
  }, [previewSrc, refs.previewSrcToRevokeRef]);
  useEffect(() => {
    const current = refs.playbackSrcToRevokeRef.current;
    if (current?.startsWith("blob:") && current !== playbackMediaSrc) URL.revokeObjectURL(current);
    refs.playbackSrcToRevokeRef.current = playbackMediaSrc?.startsWith("blob:") && playbackMediaSrc !== previewSrc ? playbackMediaSrc : null;
    return () => { const next = refs.playbackSrcToRevokeRef.current; if (next?.startsWith("blob:")) URL.revokeObjectURL(next); refs.playbackSrcToRevokeRef.current = null; };
  }, [playbackMediaSrc, previewSrc, refs.playbackSrcToRevokeRef]);
  useEffect(() => {
    const current = refs.videoSrcToRevokeRef.current;
    if (current?.startsWith("blob:") && current !== previewVideoSrc) URL.revokeObjectURL(current);
    refs.videoSrcToRevokeRef.current = previewVideoSrc?.startsWith("blob:") ? previewVideoSrc : null;
    return () => { const next = refs.videoSrcToRevokeRef.current; if (next?.startsWith("blob:")) URL.revokeObjectURL(next); refs.videoSrcToRevokeRef.current = null; };
  }, [previewVideoSrc, refs.videoSrcToRevokeRef]);
  useEffect(() => {
    if (!shouldUseProcessed) {
      if (import.meta.env.DEV && currentPass === "audio_finalization" && activeTool === "audio") console.info("[Hammer][AudioComparePreview] inactive", { compareMode: compareMode, studioRackHasAudibleProcessing: hasAudibleProcessing, playbackBackendPreference: rack.backend_preference });
      refs.previewKeyRef.current = null; setPreviewSrc(null); return;
    }
    const renderRackState = { ...rack, backend_preference: "ffmpeg" as const };
    const localRelpath = preferredPlayback.kind === "polished" ? preferredPlayback.local_relpath ?? mediaRef?.local_relpath ?? null : mediaRef?.local_relpath ?? null;
    const workpiecePath = preferredPlayback.kind === "polished" ? preferredPlayback.workpiece_path ?? null : mediaRef?.local_relpath ?? null;
    const dspPlan = buildHammerAudioDspPlan(renderRackState); const renderIdentity = buildHammerAudioRenderIdentity({ sourceIdentity: workpiecePath ?? localRelpath ?? `${workpieceId}:source:unknown`, timelineIdentity: fingerprintHammerAudio(transcriptSegments.map((segment) => ({ id: segment.segment_id, start: segment.start_sec, end: segment.end_sec, disabled: segment.is_disabled, gain: segment.gain_db ?? 0 }))), historyHead: historyHeadEntryId ?? "head:unknown", dspFingerprint: dspPlan.dspFingerprint }); const key = renderIdentity.renderFingerprint;
    refs.requestLifecycleRef.current.syncIdentity(key); if (refs.previewKeyRef.current === key && previewSrc || !ffmpegAvailable || !mediaRef) return;
    const capturedMediaRef = mediaRef; const timer = window.setTimeout(() => { refs.previewInFlightRef.current = true; refs.previewKeyRef.current = key;
      const requestToken = refs.requestLifecycleRef.current.begin(); void (async () => { try {
      const result = await executeDialogueAudioRenderWithBackend({ workspaceId, workpieceId, mediaKind: capturedMediaRef.kind, timelineSegments: transcriptSegments.map((segment) => ({ segment_id: segment.segment_id, start_sec: segment.start_sec, end_sec: segment.end_sec, is_disabled: segment.is_disabled, gain_db: segment.gain_db })), rackState: renderRackState, localRootAbs, localRelpath, canonicalWorkpiecePath: workpiecePath, mimeType: preferredPlayback.kind === "polished" ? preferredPlayback.mime_type ?? null : null, runtimeSummary: runtime });
      if (!refs.requestLifecycleRef.current.accepts(requestToken)) return;
      setRenderStatus(result);
      if (import.meta.env.DEV) console.info("[Hammer][AudioComparePreview] render", { compareMode: compareMode, requestedBackend: result.requestedBackend, resolvedBackend: result.resolvedBackend, status: result.status, outputLocalRelpath: result.outputLocalRelpath, outputWorkpiecePath: result.outputWorkpiecePath });
      if (result.status !== "processed") { setPreviewSrc(null); return; }
      if (result.outputLocalRelpath && localRootAbs) { setPreviewSrc(buildHammerDevMediaUrl(localRootAbs, result.outputLocalRelpath)); return; }
      if (result.outputWorkpiecePath) { setPreviewSrc(await loadCanonicalAudioPolishPreviewUrl({ workpieceId: workpieceId, workpiecePath: result.outputWorkpiecePath, mimeType: result.outputMimeType })); return; }
      setPreviewSrc(null);
    } catch { if (refs.requestLifecycleRef.current.accepts(requestToken)) setPreviewSrc(null); } finally { refs.previewInFlightRef.current = false; } })();
    }, 350); return () => window.clearTimeout(timer);
  }, [
    previewSrc,
    refs.previewInFlightRef,
    refs.previewKeyRef,
    refs.requestLifecycleRef,
    activeTool,
    compareMode,
    currentPass,
    ffmpegAvailable,
    hasAudibleProcessing,
    historyHeadEntryId,
    localRootAbs,
    mediaRef,
    preferredPlayback.kind,
    preferredPlayback.local_relpath,
    preferredPlayback.mime_type,
    preferredPlayback.workpiece_path,
    rack,
    runtime,
    setRenderStatus,
    transcriptSegments,
    workpieceId,
    workspaceId,
    setPreviewSrc,
    shouldUseProcessed,
  ]);
  useEffect(() => {
    let active = true;
    const resolveRaw = async () => {
      const path = mediaRef?.local_relpath ?? null;
      if (!path) { setPreviewVideoSrc(null); return null; }
      if (localRootAbs) { const url = buildHammerDevMediaUrl(localRootAbs, path); setPreviewVideoSrc(url); return url; }
      try { const url = await loadWorkpieceMediaPreviewUrl({ workpieceId: workpieceId, path, mimeType: inferMime({ path, kind: mediaRef?.kind ?? "other" }), surface: "unknown" }); if (!active) { URL.revokeObjectURL(url); return null; } setPreviewVideoSrc(url); return url; } catch { if (active) setPreviewVideoSrc(null); return null; }
    };
    void (async () => { const raw = await resolveRaw(); if (!active) return; if (shouldUseProcessed && previewSrc) { setPlaybackMediaSrc(previewSrc); return; } if (preferredPlayback.kind === "polished") { if (preferredPlayback.local_relpath && localRootAbs) { setPlaybackMediaSrc(buildHammerDevMediaUrl(localRootAbs, preferredPlayback.local_relpath)); return; } if (preferredPlayback.workpiece_path) { try { const url = await loadCanonicalAudioPolishPreviewUrl({ workpieceId: workpieceId, workpiecePath: preferredPlayback.workpiece_path, mimeType: preferredPlayback.mime_type }); if (!active) { URL.revokeObjectURL(url); return; } setPlaybackMediaSrc(url); return; } catch { if (!active) return; } } } setPlaybackMediaSrc(raw); })();
    return () => { active = false; };
  }, [
    previewSrc,
    activeTool,
    compareMode,
    currentPass,
    inferMime,
    localRootAbs,
    mediaRef,
    preferredPlayback.kind,
    preferredPlayback.local_relpath,
    preferredPlayback.mime_type,
    preferredPlayback.workpiece_path,
    setPlaybackMediaSrc,
    setPreviewVideoSrc,
    workpieceId,
    shouldUseProcessed,
  ]);
  return shouldUseProcessed;
}

export function useHammerAudioFinishingCompareStatus(args: { activeTool: string; currentPass: string; compareMode: HammerAudioFinalizationCompareMode; hasAudibleProcessing: boolean; ffmpegAvailable: boolean; previewSrc: string | null; playbackMediaSrc: string | null }) {
  return useMemo(() => {
    if (args.currentPass !== "audio_finalization" || args.activeTool !== "audio") return null;
    if (args.compareMode === "before") return "Before · Source";
    if (!args.hasAudibleProcessing) return "After unavailable · Rack disabled, bypassed, or neutral";
    if (!args.ffmpegAvailable) return "After · Live processed · Exact preview unavailable";
    if (args.previewSrc && args.playbackMediaSrc === args.previewSrc) return "After · Exact processed";
    if (args.previewSrc) return "After · Live processed · Exact preview handoff pending";
    return "After · Rendering exact preview";
  }, [args.activeTool, args.compareMode, args.currentPass, args.ffmpegAvailable, args.hasAudibleProcessing, args.playbackMediaSrc, args.previewSrc]);
}
