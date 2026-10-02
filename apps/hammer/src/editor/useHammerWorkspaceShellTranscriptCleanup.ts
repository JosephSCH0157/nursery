import { useCallback, useRef, useState } from "react";
import type { HammerTranscriptSegment } from "../../../../packages/contracts/hammer/transcript.contract";
import type { HammerPersistedStructuredTranscript } from "../persistence/hammerPersistenceContract";
import {
  previewQuickClean as buildQuickCleanPreview,
  previewRemoveFillers as buildRemoveFillersPreview,
  previewRemoveRetakes as buildRemoveRetakesPreview,
  previewShortenGaps as buildShortenGapsPreview,
  previewSpeakerInterview as buildSpeakerInterviewPreview,
  previewSpeakerMonologue as buildSpeakerMonologuePreview,
  previewSpeakerPanel as buildSpeakerPanelPreview,
  previewSpeakerSolo as buildSpeakerSoloPreview,
  type FillerCleanupOptions,
  type GapCleanupOptions,
  type HammerCleanupPreview,
  type RetakeCleanupOptions,
  type SpeakerInterviewOptions,
  type SpeakerMonologueOptions,
  type SpeakerPanelOptions,
  type SpeakerSoloOptions,
} from "./hammerCleanupTools";
import {
  HammerTranscriptCleanupAssistError,
  requestHammerTranscriptCleanupAssist,
} from "./hammerTranscriptCleanupAssistApi";
import {
  buildPolishResultSummaryFromCleanupPreview,
  type HammerPolishResultSummary,
} from "./PolishResultSummary";
import {
  appendHammerDerivedTextLayer,
  cloneHammerDerivedTextLayers,
  createHammerDerivedTextLayer,
  setHammerDerivedTextLayerActive,
} from "../macros/hammerDerivedTranscriptLayers";
import { formatOutputLayerLabelFromRecipeRef } from "./hammerWorkspaceShellFormatters";
import type {
  HammerEditorStateSerializable,
  HammerHistoryEntry,
  HammerOutputSelectionState,
} from "./hammerWorkspaceHistory";

type DerivedLayers = HammerPersistedStructuredTranscript["derived_text_layers"];

export type HammerTranscriptCleanupRequestToken = Readonly<{
  identityKey: string;
  generation: number;
  requestId: number;
}>;

export function createHammerTranscriptCleanupLifecycle(initialIdentityKey: string) {
  let identityKey = initialIdentityKey;
  let generation = 0;
  let requestId = 0;
  let boundPreview: object | null = null;
  const consumedPreviews = new WeakSet<object>();
  return {
    syncIdentity(nextIdentityKey: string): void {
      if (nextIdentityKey === identityKey) return;
      identityKey = nextIdentityKey;
      generation += 1;
      requestId += 1;
      boundPreview = null;
    },
    beginRequest(): HammerTranscriptCleanupRequestToken {
      requestId += 1;
      return Object.freeze({ identityKey, generation, requestId });
    },
    accepts(token: HammerTranscriptCleanupRequestToken): boolean {
      return token.identityKey === identityKey
        && token.generation === generation
        && token.requestId === requestId;
    },
    bindPreview(preview: object | null): void {
      boundPreview = preview;
    },
    isBound(preview: object | null): boolean {
      return preview != null && preview === boundPreview;
    },
    canApply(preview: object): boolean {
      return preview === boundPreview && !consumedPreviews.has(preview);
    },
    markApplied(preview: object): void {
      consumedPreviews.add(preview);
    },
    invalidate(): void {
      requestId += 1;
      boundPreview = null;
    },
  };
}

export type UseHammerWorkspaceShellTranscriptCleanupArgs = {
  identityKey: string;
  workspaceId: string;
  workpieceId: string;
  transcriptSegments: HammerTranscriptSegment[];
  selectedSegmentIds: string[];
  hasTranscriptSelection: boolean;
  workspaceStructuredTranscript: HammerPersistedStructuredTranscript | null;
  editableDerivedTextLayers: DerivedLayers;
  selectCleanupPass: () => void;
  focusTool: () => void;
  openTranscriptCleanupModelSettings?: () => void;
  setTranscriptTimingHint: (value: string | null) => void;
  createCheckpoint: (label: string) => void;
  applyHistoryMutation: (args: {
    label: string;
    kind: "cleanup_tool";
    affectedSegments: string[];
    toolId: string;
    immediatePersist: true;
    computeAfter: (before: HammerEditorStateSerializable) => HammerEditorStateSerializable;
  }) => HammerHistoryEntry | null;
  applyCompositionCleanup: (args: {
    preview: HammerCleanupPreview;
    toolId: string;
  }) => boolean;
  installDerivedLayers: (args: {
    historyEntry: HammerHistoryEntry;
    before: DerivedLayers;
    after: DerivedLayers;
    layerLabel: string;
    transcript: HammerPersistedStructuredTranscript;
  }) => void;
  normalizeOutputSelection: (
    selection: HammerOutputSelectionState,
    transcript: HammerPersistedStructuredTranscript,
  ) => HammerOutputSelectionState;
  updateOutputSelection: (updater: (current: HammerOutputSelectionState) => HammerOutputSelectionState) => void;
};

export function useHammerWorkspaceShellTranscriptCleanup(args: UseHammerWorkspaceShellTranscriptCleanupArgs) {
  const [gapCleanupOptions, setGapCleanupOptions] = useState<GapCleanupOptions>({
    maxGapSec: 0.4,
    minPauseSec: 0.1,
    preserveDramaticPauses: true,
  });
  const [fillerCleanupOptions, setFillerCleanupOptions] = useState<FillerCleanupOptions>({
    aggressiveness: "medium",
    protectIntentionalPhrasing: true,
  });
  const [retakeCleanupOptions, setRetakeCleanupOptions] = useState<RetakeCleanupOptions>({
    detection: "normal",
    preferLaterCleanerTake: true,
    honorExplicitRetakePhrases: true,
    sameSpeakerOnly: true,
  });
  const [speakerSoloOptions, setSpeakerSoloOptions] = useState<SpeakerSoloOptions>(() => ({
    targetSpeaker: args.transcriptSegments[0]?.speaker ?? "S1",
    collapseInterruptions: true,
    compressGaps: false,
    maxInterruptionSec: 0.8,
  }));
  const [speakerInterviewOptions, setSpeakerInterviewOptions] = useState<SpeakerInterviewOptions>(() => ({
    hostSpeaker: args.transcriptSegments[0]?.speaker ?? "S1",
    respondentSpeaker: args.transcriptSegments[1]?.speaker ?? args.transcriptSegments[0]?.speaker ?? "S2",
    tightness: "medium",
    removeBackchannels: true,
    collapseInterruptions: true,
    maxInterruptionSec: 0.8,
  }));
  const [speakerMonologueOptions, setSpeakerMonologueOptions] = useState<SpeakerMonologueOptions>(() => ({
    targetSpeaker: args.transcriptSegments[0]?.speaker ?? "S1",
    removeBackchannels: true,
    suppressInterruptions: true,
    maxInterruptionSec: 0.8,
    tightenTargetRuns: true,
    compressGaps: false,
  }));
  const [speakerPanelOptions, setSpeakerPanelOptions] = useState<SpeakerPanelOptions>(() => ({
    hostSpeaker: args.transcriptSegments[0]?.speaker ?? "S1",
    primarySpeakerBias: "balanced",
    removeShortBackchannels: true,
    suppressShortCrossTalk: true,
    maxInterruptionSec: 0.8,
  }));
  const [storedPreview, setStoredPreview] = useState<HammerCleanupPreview | null>(null);
  const [storedReceipt, setStoredReceipt] = useState<HammerPolishResultSummary | null>(null);
  const lifecycleRef = useRef(createHammerTranscriptCleanupLifecycle(args.identityKey));
  const applyInFlightRef = useRef(false);
  const lifecycle = lifecycleRef.current;
  const previewWasBound = lifecycle.isBound(storedPreview);
  lifecycle.syncIdentity(args.identityKey);
  if (previewWasBound && !lifecycle.isBound(storedPreview)) {
    applyInFlightRef.current = false;
  }
  const cleanupPreview = lifecycle.isBound(storedPreview) ? storedPreview : null;
  const cleanupReceipt = cleanupPreview ? storedReceipt : null;
  const cleanupPreviewSummary = cleanupPreview
    ? buildPolishResultSummaryFromCleanupPreview(cleanupPreview)
    : null;

  const setCleanupPreview = (preview: HammerCleanupPreview | null): void => {
    if (preview) lifecycle.bindPreview(preview);
    else lifecycle.invalidate();
    setStoredPreview(preview);
  };

  const clearCleanup = (): void => {
    lifecycle.invalidate();
    applyInFlightRef.current = false;
    setStoredPreview(null);
    setStoredReceipt(null);
  };
  const invalidateCleanupPreview = (): void => {
    lifecycle.invalidate();
    applyInFlightRef.current = false;
    setStoredPreview(null);
  };

  const tightenTranscriptSelection = (): void => {
    if (!args.hasTranscriptSelection) {
      args.setTranscriptTimingHint("Select transcript segments to tighten.");
      return;
    }
    args.focusTool();
    args.selectCleanupPass();
    setStoredReceipt(null);
    const token = lifecycle.beginRequest();
    const segments = args.transcriptSegments.map((segment) => ({ ...segment }));
    const segmentIds = [...args.selectedSegmentIds];
    void (async () => {
      try {
        const assisted = await requestHammerTranscriptCleanupAssist({
          workspace_id: args.workspaceId,
          workpiece_id: args.workpieceId,
          segments,
          segment_ids: segmentIds,
        });
        if (
          !lifecycle.accepts(token)
        ) return;
        setCleanupPreview(assisted.preview);
        args.setTranscriptTimingHint(null);
      } catch (error) {
        if (!lifecycle.accepts(token)) return;
        if (error instanceof HammerTranscriptCleanupAssistError
          && error.code === "model_selection_unavailable") {
          args.openTranscriptCleanupModelSettings?.();
        }
        args.setTranscriptTimingHint(
          error instanceof Error && error.message.trim()
            ? error.message
            : "Hammer could not run transcript cleanup assist.",
        );
      }
    })();
  };

  const applyCleanup = (preview: HammerCleanupPreview): void => {
    if (
      applyInFlightRef.current
      || preview !== cleanupPreview
      || !lifecycle.canApply(preview)
    ) return;
    applyInFlightRef.current = true;
    try {
      const toolId = preview.label.toLowerCase().replace(/\s+/g, "-");
      const summary = buildPolishResultSummaryFromCleanupPreview(preview);
      args.createCheckpoint(`Before ${preview.label}`);
      const isSpeakerSoloApply = Boolean(preview.metadata?.speakerSolo);
      const isSpeakerInterviewApply = Boolean(preview.metadata?.speakerInterview);
      const isSpeakerMonologueApply = Boolean(preview.metadata?.speakerMonologue);
      const isSpeakerPanelApply = Boolean(preview.metadata?.speakerPanel);
      if ((isSpeakerSoloApply || isSpeakerInterviewApply || isSpeakerMonologueApply || isSpeakerPanelApply) && args.workspaceStructuredTranscript) {
        const nextLayerChanges = args.transcriptSegments
          .map((segment) => {
            const nextSegment = preview.resultSegments.find((item) => item.segment_id === segment.segment_id) ?? null;
            if (!nextSegment) return null;
            const newlySuppressed = Boolean(nextSegment.is_disabled === true && segment.is_disabled !== true);
            const textChanged = nextSegment.text !== segment.text;
            if (!newlySuppressed && !textChanged) return null;
            return {
              segment_id: segment.segment_id,
              original_text: segment.text,
              cleaned_text: newlySuppressed ? "" : nextSegment.text,
              operations: [{
                kind: newlySuppressed ? "retake_fragment_removed" as const : "filler_removed" as const,
                value: segment.text,
                start: 0,
                end: segment.text.length,
              }],
            };
          })
          .filter((change): change is NonNullable<typeof change> => Boolean(change));
        if (nextLayerChanges.length === 0) {
          args.setTranscriptTimingHint(
            isSpeakerSoloApply
              ? "Solo Mode found no non-target segments to suppress."
              : isSpeakerInterviewApply
              ? "Interview Mode found no respondent changes to apply."
              : isSpeakerPanelApply
              ? "Panel Mode found no low-signal cross-talk or backchannels to suppress."
              : "Monologue Cleanup found no qualifying interruptions or target-speaker cleanup to apply.",
          );
          return;
        }
        const recipeRef = isSpeakerSoloApply
          ? `speaker_solo:${preview.metadata?.speakerSolo?.targetSpeaker.trim().toLowerCase() || "speaker"}`
          : isSpeakerInterviewApply
          ? `speaker_interview:${preview.metadata?.speakerInterview?.hostSpeaker.trim().toLowerCase() || "host"}->${preview.metadata?.speakerInterview?.respondentSpeaker.trim().toLowerCase() || "guest"}`
          : isSpeakerPanelApply
          ? `speaker_panel:${preview.metadata?.speakerPanel?.primarySpeakerBias ?? "balanced"}`
          : `speaker_monologue:${preview.metadata?.speakerMonologue?.targetSpeaker.trim().toLowerCase() || "speaker"}`;
        const layerLabel = formatOutputLayerLabelFromRecipeRef(recipeRef);
        const layer = createHammerDerivedTextLayer({
          transcriptId: args.workspaceStructuredTranscript.transcript_id,
          recipeRef,
          macroKind: isSpeakerSoloApply
            ? "speaker_solo"
            : isSpeakerInterviewApply
            ? "speaker_interview"
            : isSpeakerPanelApply
            ? "speaker_panel"
            : "speaker_monologue",
          changes: nextLayerChanges,
          nowIso: new Date().toISOString(),
        });
        const beforeDerived = cloneHammerDerivedTextLayers(args.editableDerivedTextLayers);
        const withLayer = appendHammerDerivedTextLayer(args.workspaceStructuredTranscript, layer);
        const withLayerActive = setHammerDerivedTextLayerActive(withLayer, layer.layer_id);
        const afterDerived = cloneHammerDerivedTextLayers(withLayerActive.derived_text_layers);
        const historyEntry = args.applyHistoryMutation({
          label: `Apply ${layerLabel} as derived layer`,
          kind: "cleanup_tool",
          affectedSegments: nextLayerChanges.map((change) => change.segment_id),
          toolId,
          immediatePersist: true,
          computeAfter: (before) => ({ ...before, transcriptTimingHint: null }),
        });
        if (!historyEntry) return;
        args.installDerivedLayers({
          historyEntry,
          before: beforeDerived,
          after: afterDerived,
          layerLabel,
          transcript: withLayerActive,
        });
        args.updateOutputSelection((current) => args.normalizeOutputSelection(current, withLayerActive));
        lifecycle.markApplied(preview);
        setStoredReceipt(summary);
        args.setTranscriptTimingHint("Applied as a derived transcript layer. Playback of source media is unchanged until a timeline edit or render is committed.");
        return;
      }
      const applied = args.applyCompositionCleanup({ preview, toolId });
      if (!applied) return;
      lifecycle.markApplied(preview);
      setStoredReceipt(summary);
      args.setTranscriptTimingHint(
        summary.estimatedSecondsSaved > 0
          ? `Applied ${preview.label}. Playback now follows the shortened timeline (${summary.estimatedSecondsSaved.toFixed(1)}s saved).`
          : `Applied ${preview.label}. Playback is unchanged because this edit only changed transcript text.`,
      );
    } finally {
      applyInFlightRef.current = false;
    }
  };

  const reconcileSpeakerSoloOptions = useCallback((speakers: string[]): void => {
    if (speakers.length === 0 || speakers.includes(speakerSoloOptions.targetSpeaker)) return;
    setSpeakerSoloOptions((current) => ({ ...current, targetSpeaker: speakers[0] ?? "S1" }));
  }, [speakerSoloOptions.targetSpeaker]);
  const reconcileSpeakerMonologueOptions = useCallback((speakers: string[]): void => {
    if (speakers.length === 0 || speakers.includes(speakerMonologueOptions.targetSpeaker)) return;
    setSpeakerMonologueOptions((current) => ({ ...current, targetSpeaker: speakers[0] ?? "S1" }));
  }, [speakerMonologueOptions.targetSpeaker]);
  const reconcileSpeakerInterviewOptions = useCallback((speakers: string[]): void => {
    if (speakers.length === 0) return;
    setSpeakerInterviewOptions((current) => {
      const nextHost = speakers.includes(current.hostSpeaker) ? current.hostSpeaker : (speakers[0] ?? "S1");
      const nextRespondent = speakers.includes(current.respondentSpeaker) && current.respondentSpeaker !== nextHost
        ? current.respondentSpeaker
        : (speakers.find((speaker) => speaker !== nextHost) ?? nextHost);
      return nextHost === current.hostSpeaker && nextRespondent === current.respondentSpeaker
        ? current
        : { ...current, hostSpeaker: nextHost, respondentSpeaker: nextRespondent };
    });
  }, []);
  const reconcileSpeakerPanelOptions = useCallback((speakers: string[]): void => {
    if (speakers.length === 0 || speakers.includes(speakerPanelOptions.hostSpeaker)) return;
    setSpeakerPanelOptions((current) => ({ ...current, hostSpeaker: speakers[0] ?? "S1" }));
  }, [speakerPanelOptions.hostSpeaker]);

  return {
    gapCleanupOptions,
    setGapCleanupOptions,
    fillerCleanupOptions,
    setFillerCleanupOptions,
    retakeCleanupOptions,
    setRetakeCleanupOptions,
    speakerSoloOptions,
    setSpeakerSoloOptions,
    speakerInterviewOptions,
    setSpeakerInterviewOptions,
    speakerMonologueOptions,
    setSpeakerMonologueOptions,
    speakerPanelOptions,
    setSpeakerPanelOptions,
    cleanupPreview,
    cleanupPreviewSummary,
    cleanupReceipt,
    setCleanupPreview,
    clearCleanup,
    invalidateCleanupPreview,
    tightenTranscriptSelection,
    applyCleanup,
    previewQuickClean: buildQuickCleanPreview,
    previewRemoveFillers: buildRemoveFillersPreview,
    previewRemoveRetakes: buildRemoveRetakesPreview,
    previewShortenGaps: buildShortenGapsPreview,
    previewSpeakerInterview: buildSpeakerInterviewPreview,
    previewSpeakerMonologue: buildSpeakerMonologuePreview,
    previewSpeakerPanel: buildSpeakerPanelPreview,
    previewSpeakerSolo: buildSpeakerSoloPreview,
    reconcileSpeakerSoloOptions,
    reconcileSpeakerMonologueOptions,
    reconcileSpeakerInterviewOptions,
    reconcileSpeakerPanelOptions,
  };
}
