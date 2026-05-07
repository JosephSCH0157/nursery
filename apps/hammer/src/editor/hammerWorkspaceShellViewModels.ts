/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  resolveHammerPolishPreviewTarget,
  resolveVisualPreviewEmptyStateMessage,
} from "./hammerPolishPreviewTarget";

function isTruthyDevToggle(value: string | null): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "on" || normalized === "yes";
}

function shouldShowDiagnosticsPanel(): boolean {
  const isDev = Boolean((import.meta as any)?.env?.DEV);
  if (!isDev || typeof window === "undefined") return false;
  try {
    const params = new URLSearchParams(window.location.search ?? "");
    if (isTruthyDevToggle(params.get("dev"))) return true;
    if (isTruthyDevToggle(params.get("tp_dev_mode"))) return true;
  } catch {
    // ignore
  }
  return false;
}

export function buildTimelineDockVM(args: any) {
  return {
    isScrubbing: args.isScrubbing,
    setFocusOverride: args.setFocusOverride,
    waveformProxy: args.editableAudioPolish?.analysis?.waveform_proxy ?? null,
    playbackTransportDurationSec: args.playbackTransportDurationSec,
    effectivePlaybackCutRegions: args.effectivePlaybackCutRegions,
    playheadSec: args.playheadSec,
    seekPlayheadToTime: args.seekPlayheadToTime,
    togglePlayback: args.togglePlayback,
    isPlaybackActive: args.isPlaybackActive,
    toggleSelectionLoopPlayback: args.toggleSelectionLoopPlayback,
    isLoopPlaybackActive: args.isLoopPlaybackActive,
    playSelectionWithRoll: args.playSelectionWithRoll,
    selectedSegment: args.selectedSegment,
    selectAdjacentSegment: args.selectAdjacentSegment,
    jumpToSelectionBoundary: args.jumpToSelectionBoundary,
    jumpToEditPoint: args.jumpToEditPoint,
    sortedTimelineMarkers: args.sortedTimelineMarkers,
    jumpToMarker: args.jumpToMarker,
    addMarkerAtPlayhead: args.addMarkerAtPlayhead,
    scrubRate: args.scrubRate,
    scrubRateOptions: args.SCRUB_RATE_OPTIONS,
    setScrubRate: (rate: number) => {
      if (!args.SCRUB_RATE_OPTIONS.includes(rate)) return;
      args.setScrubRate(rate);
    },
    zoomTimelineOut: args.zoomTimelineOut,
    zoomTimelineIn: args.zoomTimelineIn,
    resetTimelineZoom: args.resetTimelineZoom,
    timelineZoomPercent: args.timelineZoomPercent,
    nudgePlayhead: args.nudgePlayhead,
    smallPlayheadNudgeSec: args.SMALL_PLAYHEAD_NUDGE_SEC,
    splitSelectedSegmentAtPlayhead: args.splitSelectedSegmentAtPlayhead,
    deleteSelectedSegmentAndRipple: args.deleteSelectedSegmentAndRipple,
    toggleSelectedSegmentDisabled: args.toggleSelectedSegmentDisabled,
    transcriptDurationSec: args.transcriptDurationSec,
    audioCutSelectionStatus: args.audioCutSelectionStatus,
    persistedAudioCutCount: args.persistedAudioCutCount,
    canMarkAudioCutSelection: args.canMarkAudioCutSelection,
    canApplyAudioCutSelection: args.canApplyAudioCutSelection,
    hasPendingAudioCutSelection: args.hasPendingAudioCutSelection,
    markAudioCutBoundary: args.markAudioCutBoundary,
    applyAudioCutSelection: args.applyAudioCutSelection,
    clearAudioCutSelection: args.clearAudioCutSelection,
    jumpToMarkerById: args.jumpToMarkerById,
    removeMarker: args.removeMarker,
    moveSegment: args.moveSegment,
    trimSegmentStart: args.trimSegmentStart,
    trimSegmentEnd: args.trimSegmentEnd,
    adjustSelectedSegmentGain: args.adjustSelectedSegmentGain,
    visualTimelineDock: {
      clips: args.visualTimelineLaneClips,
      playheadSec: args.playheadSec,
      durationSec: args.timelineDurationSec,
      selectedClipId: args.linkedPrimaryVisualId,
      editable: args.visualPlacementEditingEnabled,
      focusToken: args.visualTimelineFocusNonce,
      onSelectClip: (clipId: string) => {
        args.selectVisualClip({
          clipId,
          origin: "timeline",
          revealUI: true,
          allowSurfaceSwitch: true,
        });
      },
      onMoveClip: (event: any, clip: { clipId: string; startSec: number; endSec: number }) => {
        if (!args.visualPlacementEditingEnabled) return;
        args.beginTimelineImagePlacementDrag(event as any, {
          placementId: clip.clipId,
          mode: "move",
          startSec: Math.max(0, clip.startSec - args.compositionOffsetSec),
          endSec: Math.max(0, clip.endSec - args.compositionOffsetSec),
        });
      },
      onTrimClipStart: (event: any, clip: { clipId: string; startSec: number; endSec: number }) => {
        if (!args.visualPlacementEditingEnabled) return;
        args.beginTimelineImagePlacementDrag(event as any, {
          placementId: clip.clipId,
          mode: "resize_start",
          startSec: Math.max(0, clip.startSec - args.compositionOffsetSec),
          endSec: Math.max(0, clip.endSec - args.compositionOffsetSec),
        });
      },
      onTrimClipEnd: (event: any, clip: { clipId: string; startSec: number; endSec: number }) => {
        if (!args.visualPlacementEditingEnabled) return;
        args.beginTimelineImagePlacementDrag(event as any, {
          placementId: clip.clipId,
          mode: "resize_end",
          startSec: Math.max(0, clip.startSec - args.compositionOffsetSec),
          endSec: Math.max(0, clip.endSec - args.compositionOffsetSec),
        });
      },
    },
    timelineTrackScrollRef: args.timelineTrackScrollRef,
    handleTimelineTrackWheelZoom: args.handleTimelineTrackWheelZoom,
    editableTranscriptSegmentsLength: args.editableTranscriptSegments.length,
    timelineBoardZoomClassName: args.timelineBoardZoomClassName,
    beginTimelineScrub: args.beginTimelineScrub,
    timelineMinorTicks: args.timelineMinorTicks,
    timelineTicks: args.timelineTicks,
    timelineDurationSec: args.timelineDurationSec,
    playheadRatioPercent: args.playheadRatioPercent,
    timelineLanes: args.timelineLanes,
    laneGapsById: args.laneGapsById,
    visualPlacementEditingEnabled: args.visualPlacementEditingEnabled,
    currentPass: args.currentPass,
    resolvePlacementAnimationPreset: args.resolvePlacementAnimationPreset,
    visualPlacementsById: args.visualPlacementsById,
    beginTimelineImagePlacementDrag: args.beginTimelineImagePlacementDrag,
    openImageAnimationContextMenu: args.openImageAnimationContextMenu,
  };
}

export function buildSourceBayVM(args: any) {
  const layerOptions = args.outputLayerCandidates.map((layer: any) => ({
    id: layer.layer_id,
    label: args.formatOutputLayerLabel(layer),
  }));
  const historyEntries = args.recentHistoryEntries.map((entry: any) => {
    const isCurrent = entry.id === args.historyHeadEntryId;
    const derivedTransition = args.derivedLayerHistoryRef.current.get(entry.id) ?? null;
    const derivedLayerCreated = Boolean(derivedTransition);
    return {
      id: entry.id,
      label: entry.label,
      timestampLabel: args.formatHistoryTimestamp(entry.timestamp),
      scopeLabel: args.formatHistoryEntryScope(entry),
      layerActionLabel: derivedLayerCreated ? "yes" : "no",
      derivedLayerLabel: derivedLayerCreated ? "yes" : "no",
      layerLabel: derivedTransition?.layerLabel ?? null,
      isCurrent,
      isLayerTransition: derivedLayerCreated,
      isActiveLayerTransition: Boolean(isCurrent && derivedTransition),
      onSelect: () => {
        args.setFocusOverride("source-focus");
        args.jumpToHistoryEntry(entry.id);
      },
    };
  });

  return {
    aiInUse: Boolean(args.props.aiInUse),
    onRequestRegenerateAiTranscript: args.props.onRequestRegenerateAiTranscript,
    regenerateAiTranscriptDisabled: args.props.regenerateAiTranscriptDisabled ?? false,
    transcriptVersionRegistry: args.props.transcriptVersionRegistry ?? null,
    undo: {
      canUndo: args.canUndo,
      label: args.undoLabel,
      compactLabel: args.undoLabelCompact,
      depth: args.undoDepth,
      onUndo: args.undoHistory,
    },
    redo: {
      canRedo: args.canRedo,
      label: args.redoLabel,
      compactLabel: args.redoLabelCompact,
      depth: args.redoDepth,
      onRedo: args.redoHistory,
    },
    tabs: args.SOURCE_TABS.map((tab: any) => ({
      id: tab.id,
      label: tab.label,
      isActive: args.selectedSourceTab === tab.id,
      onSelect: () => args.selectEditorMode(args.resolveEditorModeFromSourceTab(tab.id), { focusOverride: "source-focus" }),
    })),
    sourceDeskLoading: args.sourceDeskLoading,
    sourceDeskError: args.sourceDeskError
      ? {
        message: args.sourceDeskError,
        className: args.isSourceDeskAuthMessage(args.sourceDeskError)
          ? "hammer-source-status hammer-source-status--info"
          : "hammer-source-status hammer-source-status--error",
      }
      : null,
    viewingLayer: {
      value: args.activeOutputLayerId ?? "__raw__",
      disabled: !args.workspaceStructuredTranscript,
      options: layerOptions,
      onChange: (nextLayerId: string | null) => {
        args.setFocusOverride("source-focus");
        args.selectViewingLayer(nextLayerId);
      },
    },
    exportBasis: {
      value: args.editableOutputSelection.layerId ?? "__raw__",
      options: layerOptions,
      onChange: (nextLayerId: string | null) => {
        args.setFocusOverride("source-focus");
        args.selectOutputLayerForExport(nextLayerId);
      },
    },
    historyPanel: {
      canRestoreState: args.canRedo,
      onRestoreState: args.restoreCurrentHistoryState,
      shownCountLabel: `${args.recentHistoryEntries.length} shown`,
      resetToRaw: args.props.onRequestResetToRaw ? {
        inFlight: Boolean(args.props.resetToRawInFlight),
        error: args.props.resetToRawError ?? null,
        onRequest: () => args.props.onRequestResetToRaw?.(),
      } : null,
      entries: historyEntries,
    },

    selectedSourceTab: args.selectedSourceTab,
    editableTranscriptSegments: args.editableTranscriptSegments,
    selectedSegment: args.selectedSegment,
    selectedSegmentId: args.selectedSegmentId,
    linkedSelection: args.linkedSelection,
    linkedTranscriptSegmentIdSet: args.linkedTranscriptSegmentIdSet,
    linkedVisualIdSet: args.linkedVisualIdSet,
    linkedPrimaryVisualId: args.linkedPrimaryVisualId,
    setFocusOverride: args.setFocusOverride,
    roundToTenth: args.roundToTenth,
    applyHistoryMutation: args.applyHistoryMutation,
    updateSegmentInTimeline: args.updateSegmentInTimeline,
    transcriptTimingHint: args.transcriptTimingHint,
    activeTool: args.activeTool,
    updateTranscriptSegmentSpeaker: args.updateTranscriptSegmentSpeaker,
    applyTranscriptSelection: args.applyTranscriptSelection,
    disableTranscriptSelection: args.disableTranscriptSelection,
    cutTranscriptSelection: args.cutTranscriptSelection,
    tightenTranscriptSelection: args.tightenTranscriptSelection,
    clearTranscriptSelection: args.clearTranscriptSelection,
    hasTranscriptSelection: args.hasTranscriptSelection,
    transcriptSelectionAllDisabled: args.transcriptSelectionAllDisabled,
    transcriptSelectionRange: args.transcriptSelectionRange,
    transcriptSelectionSegmentIdSet: args.transcriptSelectionSegmentIdSet,
    modifiedTranscriptSegmentIds: args.modifiedTranscriptSegmentIds,
    modifiedSegmentCount: args.modifiedSegmentCount,
    candidateSegmentIdSet: args.candidateSegmentIdSet,
    activeCandidateSegmentIdSet: args.activeCandidateSegmentIdSet,
    transcriptLineRefs: args.transcriptLineRefs,
    selectedTranscriptRange: args.selectedTranscriptRange,
    onTranscriptSelection: args.setSelectedTranscriptRangeDetail,
    isSubtractiveTranscriptEdit: args.isSubtractiveTranscriptEdit,
    commitTranscriptTextEdits: args.commitTranscriptTextEdits,
    commitDeleteOnlyTranscriptEdits: args.commitDeleteOnlyTranscriptEdits,
    setTranscriptTimingHint: args.setTranscriptTimingHint,

    formatBytes: args.formatBytes,
    selectedVisualFlowStep: args.selectedVisualFlowStep,
    uploadingCategory: args.uploadingCategory,
    savingIntroOutro: args.savingIntroOutro,
    workspaceIntroOutroDefaults: args.workspaceIntroOutroDefaults,
    savingWorkspaceIntroOutroDefaults: args.savingWorkspaceIntroOutroDefaults,
    applyIntroOutroSelectionToFutureEpisodes: args.applyIntroOutroSelectionToFutureEpisodes,
    setApplyIntroOutroSelectionToFutureEpisodes: args.setApplyIntroOutroSelectionToFutureEpisodes,
    persistWorkspaceIntroOutroDefaultsNow: args.persistWorkspaceIntroOutroDefaultsNow,
    sourceDeskPreviewUrls: args.sourceDeskPreviewUrls,
    sourceDeskPreviewFailures: args.sourceDeskPreviewFailures,
    sourceDeskRequestedPreviewPathSet: args.sourceDeskRequestedPreviewPathSet,
    sourceDeskPreviewPendingPathSet: args.sourceDeskPreviewPendingPathSet,
    sourceDeskRemainingPreviewCount: args.sourceDeskRemainingPreviewPaths.length,
    requestSourceDeskPreviews: args.requestSourceDeskPreviews,
    reportSourceDeskPreviewLoadError: args.reportSourceDeskPreviewLoadError,
    loadRemainingSourceDeskPreviews: () => args.requestSourceDeskPreviews(args.sourceDeskRemainingPreviewPaths),
    reportVisibleSourceDeskPreviewPaths: args.reportVisibleSourceDeskPreviewPaths,
    imageUploadInputRef: args.imageUploadInputRef,
    brollUploadInputRef: args.brollUploadInputRef,
    introOutroUploadInputRef: args.introOutroUploadInputRef,
    sourceImageItems: args.sourceImageItems,
    sourceImageLibraryItems: args.sourceImageLibraryItems,
    imageUsageByPath: args.imageUsageByPath,
    handleSourceDeskUpload: args.handleSourceDeskUpload,
    persistIntroOutroSelection: args.persistIntroOutroSelection,
    addImagePlacementFromLibrary: args.addImagePlacementFromLibrary,
    addVisualAssetPlacementFromLibrary: args.addVisualAssetPlacementFromLibrary,
    updatePlacementKindFromMediaMap: args.updatePlacementKindFromMediaMap,
    redoMediaMapFromScript: args.redoMediaMapFromScript,
    sourceReferenceClipItems: args.sourceReferenceClipItems,
    sourceBrollOnlyItems: args.sourceBrollOnlyItems,
    referenceClipPlannedBeats: args.referenceClipPlannedBeats,
    seekPlayheadToTime: args.seekPlayheadToTime,
    introOutroSelection: args.introOutroSelection,
    introOutroSelectedIntroPath: args.introOutroSelectedIntroPath,
    introOutroSelectedOutroPath: args.introOutroSelectedOutroPath,
    introOutroCandidateItems: args.introOutroCandidateItems,

    transcriptSegmentsById: args.transcriptSegmentsById,
    visualPlacementCardRefs: args.visualPlacementCardRefs,
    effectiveSelectedClipId: args.effectiveSelectedClipId,
    selectVisualClip: args.selectVisualClip,
    selectionOriginRef: args.selectionOriginRef,
    setSelectedClipId: args.setSelectedClipId,
    setSelectedSegmentId: args.setSelectedSegmentId,
    setTranscriptSelectionAnchorSegmentId: args.setTranscriptSelectionAnchorSegmentId,
    setTranscriptSelectionFocusSegmentId: args.setTranscriptSelectionFocusSegmentId,
    setVisualTimelineFocusNonce: args.setVisualTimelineFocusNonce,
    updateVisualPlacementTiming: args.updateVisualPlacementTiming,
    removeVisualPlacement: args.removeVisualPlacement,
    sourceAssetItems: args.sourceAssetItems,
    workspaceMapping: args.workspaceMapping,
    mediaMapBeats: args.mediaMapBeats,
    setSelectedVisualFlowStep: args.setSelectedVisualFlowStep,
    setMediaMapBeats: args.setMediaMapBeats,
    setRemovedMediaMapSegmentIds: args.setRemovedMediaMapSegmentIds,
    unresolvedBrollSuggestionItems: args.unresolvedBrollSuggestionItems,
  };
}

export function buildPreviewBayVM(args: any) {
  const polishPreviewTarget = resolveHammerPolishPreviewTarget({
    visualPolishPreviewActive: args.visualPolishPreviewActive,
    previewVideoSrc: args.effectivePreviewVideoSrc,
    activePreviewOverlays: args.activePreviewOverlays ?? [],
  });
  const segmentationSourceVideoRef = args.segmentationSourceVideoRef ?? args.previewVideoRef;
  const segmentationSourceVideoSrc = typeof args.segmentationSourceVideoSrc === "string"
    ? args.segmentationSourceVideoSrc
    : (typeof args.effectivePreviewVideoSrc === "string" ? args.effectivePreviewVideoSrc : null);
  const segmentationUsesDisplayedPreviewRef = segmentationSourceVideoRef === args.previewVideoRef;
  const segmentationSourceMatchesDisplayedBase = Boolean(
    segmentationUsesDisplayedPreviewRef
      || (segmentationSourceVideoSrc
        && args.effectivePreviewVideoSrc
        && segmentationSourceVideoSrc === args.effectivePreviewVideoSrc),
  );
  const hasBackgroundEffectRequest = Boolean(
    args.visualBackgroundBlur || args.visualBackgroundReplaceEnabled || args.visualBackgroundWashEnabled,
  );
  const hiddenSegmentationVideoMounted = segmentationSourceVideoRef !== args.previewVideoRef;
  const blurRuntime = args.visualBackgroundBlurRuntimeStatus ?? null;
  const audioPolish = args.editableAudioPolish ?? null;
  const audioAnalysis = audioPolish?.analysis ?? null;
  const loudness = audioAnalysis?.loudness ?? null;
  const transcriptPrep = audioAnalysis?.transcript_prep ?? null;
  const channelCharacterization = audioAnalysis?.channel_characterization ?? null;
  const audioPolishSettingsSummary = audioPolish?.settings_summary ?? {};
  const filterChain = Object.entries(audioPolishSettingsSummary)
    .filter(([, value]) => Boolean(value))
    .map(([key]) => key);
  const playbackPipelineMode = args.isPlaybackActive
    ? "playback"
    : args.isScrubbing
    ? "scrub"
    : "paused preview";
  const exportPipelineActive = args.currentPass === "packaging" || args.activeTool === "export";
  const previewPipelineActive = !args.isPlaybackActive;
  const visualDiagnostics = {
    blurEnabled: Boolean(args.backgroundBlurSettings?.enabled),
    blurStrength: Number(args.backgroundBlurSettings?.blurPx ?? 0),
    edgeFeather: Number(args.backgroundBlurSettings?.edgeFeatherPx ?? 0),
    subjectExpansion: Number(args.backgroundBlurSettings?.subjectExpansionPx ?? 0),
    temporalSmoothing: Number(args.backgroundBlurSettings?.temporalSmoothing ?? 0),
    qualityMode: args.backgroundBlurSettings?.qualityMode ?? "medium",
    maskPresent: blurRuntime?.mask?.status === "ok",
    maskStatus: blurRuntime?.mask?.status ?? "unknown",
    segmentationProvider: blurRuntime?.provider?.name ?? args.visualBackgroundBlurProviderId ?? "mediapipe_selfie_segmentation",
    providerLoaded: blurRuntime?.provider?.readiness?.status === "ready",
    maskPreviewMode: Boolean(args.visualBackgroundMaskPreviewMode),
    maskPreviewStage: args.visualBackgroundMaskPreviewStage ?? "raw",
    fallbackMode: args.backgroundBlurSettings?.fallbackMode ?? "disable",
    lastSegmentationError: blurRuntime?.warnings?.[0] ?? null,
    videoFrameSize: blurRuntime?.frameInput ? `${blurRuntime.frameInput.width}x${blurRuntime.frameInput.height}` : "unknown",
    segmentationInputSize: blurRuntime?.frameInput ? `${blurRuntime.frameInput.width}x${blurRuntime.frameInput.height}` : "unknown",
    providerMaskSize: blurRuntime?.mask?.resolution ? `${blurRuntime.mask.resolution.width}x${blurRuntime.mask.resolution.height}` : "unknown",
    matteCanvasSize: blurRuntime?.mask?.resolution ? `${blurRuntime.mask.resolution.width}x${blurRuntime.mask.resolution.height}` : "unknown",
    renderCanvasSize: args.visualBackgroundEffectCanvasRef?.current
      ? `${args.visualBackgroundEffectCanvasRef.current.width}x${args.visualBackgroundEffectCanvasRef.current.height}`
      : "unknown",
    maskAgeMs: blurRuntime?.mask?.reason === "reused_recent_mask" ? "reused_recent_mask" : "live_or_unknown",
    maskFps: blurRuntime?.effectiveSegmentationFps ?? null,
    avgMaskGenerationMs: blurRuntime?.avgSegmentationMs ?? null,
    maxMaskGenerationMs: blurRuntime?.maxSegmentationMs ?? null,
    lastMaskAgeMs: blurRuntime?.lastMaskAgeMs ?? null,
    droppedMaskFrames: blurRuntime?.droppedFrames ?? 0,
    skippedMaskFrames: blurRuntime?.skippedSegmentationFrames ?? 0,
  };
  const diagnosticsSnapshot = {
    pipeline: {
      activePipeline: playbackPipelineMode,
      previewPipelineActive,
      playbackPipelineActive: Boolean(args.isPlaybackActive),
      exportPipelineActive,
      currentFrameSource: "previewVideoRef",
      segmentationFrameSource: hiddenSegmentationVideoMounted ? "segmentationSourceVideoRef" : "previewVideoRef",
      displayedVideoRef: "previewVideoRef",
      hiddenSegmentationVideoMounted,
      segmentationUsesDisplayedVideoRef: !hiddenSegmentationVideoMounted,
      maskEligibleDuringPlayback: Boolean(
        args.isPlaybackActive
          ? (segmentationSourceMatchesDisplayedBase && hasBackgroundEffectRequest)
          : segmentationSourceMatchesDisplayedBase,
      ),
    },
    media: {
      inputCodec: args.mediaPrepOutputs?.audio?.raw_source?.kind ?? "unknown",
      outputCodec: args.mediaPrepOutputs?.audio?.polish?.output_mime_type ?? "unknown",
      inputSampleRate: "unknown",
      outputSampleRate: "unknown",
      channels: channelCharacterization?.channel_count ?? "unknown",
      durationSec: typeof args.playbackTransportDurationSec === "number" ? Math.max(0, args.playbackTransportDurationSec) : null,
      transcriptPrepFormat: transcriptPrep ? `${transcriptPrep.strategy}` : "unknown",
      exportAudioFormat: args.mediaPrepOutputs?.audio?.polish?.output_mime_type ?? "unknown",
    },
    audio: {
      filterChainApplied: filterChain,
      normalizationApplied: filterChain.some((item) => item.includes("normalization")),
      loudnessLufs: loudness?.integrated_lufs ?? null,
      peakDbtp: loudness?.true_peak_dbtp ?? null,
      clippingDetected: typeof loudness?.true_peak_dbtp === "number" ? loudness.true_peak_dbtp > 0 : null,
      transcriptPrepChunkCount: transcriptPrep?.chunk_count ?? null,
    },
    visualEffects: visualDiagnostics,
  };

  return {
    previewModeLabel: args.previewMode,
    activeVisualTool: args.activeTool === "video" ? args.activeVisualTool : null,
    visualPolishPreviewActive: args.visualPolishPreviewActive,
    previewSurfaceRef: args.previewSurfaceRef,
    previewVideoRef: args.previewVideoRef,
    segmentationSourceVideoRef,
    previewAudioRef: args.previewAudioRef,
    previewBrollVideoRefs: args.previewBrollVideoRefs,
    previewVideoSrc: args.effectivePreviewVideoSrc,
    segmentationSourceVideoSrc,
    playbackMediaSrc: args.effectivePlaybackMediaSrc,
    isPlaybackActive: args.isPlaybackActive,
    playbackWindow: args.playbackWindow,
    handlePlaybackProgress: args.handlePlaybackProgressWithOrigin,
    handlePlaybackEnded: args.handlePlaybackEnded,
    setIsPlaybackActive: args.setIsPlaybackActive,
    clearPlaybackWindow: () => args.setPlaybackWindow(null),
    togglePlayback: args.togglePlayback,
    playheadSec: args.playheadSec,
    playbackModeLabel: args.playbackModeLabel,
    playbackSourceLabel: args.playbackSourceLabel,
    mediaLabelMismatchWarning: args.mediaLabelMismatchWarning,
    actualRecordingMismatchWarning: args.actualRecordingMismatchWarning,
    playbackBackendLabel: args.studioRackPlaybackConfig.backend,
    currentPassId: args.currentPass,
    selectedImageAnimationLabel: args.selectedImageAnimationLabel,
    audioFinalizationCompareModeLabel: args.audioFinalizationCompareMode === "before" ? "Before" : "After",
    audioComparePreviewStatusLabel: args.studioRackComparePreviewStatusLabel,
    packagingSummaryLabel: args.currentPass === "packaging"
      ? `Packaging: intro ${args.packagingIntroPlacement ? "on" : "off"} · outro ${args.packagingOutroPlacement ? "on" : "off"} · logo ${args.packagingLogoPlacement ? "on" : "off"}`
      : null,
    previewSurfaceLabel: args.previewSurfaceLabel,
    backgroundEffect: {
      enabled: polishPreviewTarget.segmentationEligible
        && hasBackgroundEffectRequest
        && segmentationSourceMatchesDisplayedBase,
      settings: args.backgroundBlurSettings,
      providerId: args.visualBackgroundBlurProviderId,
      // Use the displayed preview surface as segmentation input so playback-visible
      // decoded frames always satisfy blur/segmentation readiness.
      sourceVideoRef: args.previewVideoRef,
      debugMasks: args.visualBackgroundBlurDebugMask,
      maskPreviewMode: args.visualBackgroundMaskPreviewMode,
      maskPreviewStage: args.visualBackgroundMaskPreviewStage,
      onStatus: args.setVisualBackgroundBlurRuntimeStatus,
      onCanvas: args.handleBackgroundEffectCanvas,
    },
    diagnostics: {
      enabled: shouldShowDiagnosticsPanel(),
      snapshot: diagnosticsSnapshot,
    },
    eyeContactAssist: {
      enabled: polishPreviewTarget.segmentationEligible
        && segmentationSourceMatchesDisplayedBase
        && args.visualEyeContactAssistEnabled,
      strength: Math.max(0, Math.min(1, Number(args.visualEyeContactAssistStrength) || 0)),
      backgroundCanvasRef: args.visualBackgroundEffectCanvasRef,
      useBackgroundCanvasAsSource: args.eyeContactUseBackgroundCanvasAsSource,
      debugOverlay: args.visualEyeContactAssistDebugOverlay,
      onStatus: args.setVisualEyeContactAssistRuntimeStatus,
    },
    visualPreview: {
      isAuthority: args.isVisualPreviewAuthority,
      overlays: args.activePreviewOverlays,
      emptyStateMessage: resolveVisualPreviewEmptyStateMessage({ target: polishPreviewTarget }),
      editable: args.visualPlacementEditingEnabled,
      onSelectClip: (clipId: string) => {
        args.selectVisualClip({
          clipId,
          origin: "preview",
          revealUI: true,
          allowSurfaceSwitch: true,
          snapPlayhead: false,
        });
      },
      onBeginMove: (event: any, clipId: string) => {
        args.beginPreviewCanvasDrag(event as any, {
          placementId: clipId,
          mode: "move",
        });
      },
      onBeginResize: (event: any, clipId: string) => {
        args.beginPreviewCanvasDrag(event as any, {
          placementId: clipId,
          mode: "resize",
        });
      },
    },
  };
}

export function buildToolbarVM(args: any) {
  return {
    stats: [
      {
        id: "transcript",
        label: "Tx",
        value: String(args.editableTranscriptSegments.length),
        title: `Transcript: ${args.editableTranscriptSegments.length} segments`,
      },
      {
        id: "visuals",
        label: "Vis",
        value: (() => {
          const total = args.editableVisualPlacements?.placements.length ?? args.editableVisualTimeline?.clips.length ?? 0;
          const uncertain = (args.editableVisualPlacements?.placements ?? []).reduce(
            (count: number, placement: any) => count + (placement.status === "uncertain" ? 1 : 0),
            0,
          );
          return uncertain > 0 ? `${total}/${uncertain}?` : String(total);
        })(),
        title: (() => {
          const total = args.editableVisualPlacements?.placements.length ?? args.editableVisualTimeline?.clips.length ?? 0;
          const uncertain = (args.editableVisualPlacements?.placements ?? []).reduce(
            (count: number, placement: any) => count + (placement.status === "uncertain" ? 1 : 0),
            0,
          );
          return uncertain > 0
            ? `Visual placements: ${total} (${uncertain} uncertain)`
            : `Visual placements: ${total}`;
        })(),
      },
    ],
    passes: (() => {
      const summarize = (passIds: any[]): any => args.summarizePassStatuses(
        passIds.map((passId) => args.passSelectorResults.get(passId)?.status ?? args.getPassStatus(passId, args.passSelectorContext).status),
      );
      const transcriptPassIds: any[] = ["transcript_cleanup", "retakes", "gap_pacing"];
      const visualPassIds: any[] = ["visual_finishing", "image_placement", "image_animation"];
      const transcriptRepresentativePass: any = args.activeTool === "polish" && transcriptPassIds.includes(args.currentPass)
        ? args.currentPass
        : "transcript_cleanup";
      const visualRepresentativePass: any = args.activeVisualTool === "images"
        ? "image_placement"
        : args.activeVisualTool === "broll"
        ? "image_animation"
        : "visual_finishing";
      const visiblePasses = [
        {
          id: transcriptRepresentativePass,
          shortLabel: "T",
          label: "Transcript",
          toolId: "polish",
          statusLabel: summarize(transcriptPassIds),
          isActive: args.activeTool === "polish",
        },
        {
          id: visualRepresentativePass,
          shortLabel: "V",
          label: "Visuals",
          toolId: "video",
          statusLabel: summarize(visualPassIds),
          isActive: args.activeTool === "video",
        },
        {
          id: "audio_finalization",
          shortLabel: "A",
          label: "Audio",
          toolId: "audio",
          statusLabel: args.passSelectorResults.get("audio_finalization")?.humanLabel
            ?? args.getPassStatus("audio_finalization", args.passSelectorContext).humanLabel,
          isActive: args.activeTool === "audio",
        },
        {
          id: "packaging",
          shortLabel: "P",
          label: "Packaging",
          toolId: "finishing",
          statusLabel: args.passSelectorResults.get("packaging")?.humanLabel
            ?? args.getPassStatus("packaging", args.passSelectorContext).humanLabel,
          isActive: args.currentPass === "packaging",
        },
      ];
      return visiblePasses;
    })(),
    onSelectPass: args.selectPass,
  };
}

export function buildToolBayVM(args: any) {
  return {
    passLabel: args.passLabel,
    passStatus: args.passStatus,
    onMarkComplete: args.markCurrentPassComplete,
    activeVisualTool: args.activeVisualTool,
    onSelectVisualTool: args.selectVisualTool,
    shellProps: args.props,
    hasSilenceSuggestionAnalysis: args.hasSilenceSuggestionAnalysis,
    silenceSuggestionCount: args.silenceSuggestionCount,
    silenceCutSuggestions: args.silenceCutSuggestions,
    visibleSilenceCutSuggestions: args.visibleSilenceCutSuggestions,
    acceptSilenceCutSuggestion: args.acceptSilenceCutSuggestion,
    dismissSilenceCutSuggestion: args.dismissSilenceCutSuggestion,
    seekPlayheadToTime: args.seekPlayheadToTime,
    activeCaptionArtifactText: args.activeCaptionArtifactText,
    activeCaptionMode: args.activeCaptionMode,
    activeCaptionState: args.activeCaptionState,
    activeExposureAdjustment: args.activeExposureAdjustment,
    activeFillerCandidateCard: args.activeFillerCandidateCard,
    activeFillerCandidateDiffOps: args.activeFillerCandidateDiffOps,
    activeLookPreset: args.activeLookPreset,
    activeRetakeCandidateCard: args.activeRetakeCandidateCard,
    activeReviewKind: args.activeReviewKind,
    activeTool: args.activeTool,
    addMinimalTransition: args.addMinimalTransition,
    analyzeDeadAirClosure: args.analyzeDeadAirClosure,
    anchorLabelDraft: args.anchorLabelDraft,
    anchorTextDraft: args.anchorTextDraft,
    applyCleanup: args.applyCleanup,
    applyDeadAirClosureBatch: args.applyDeadAirClosureBatch,
    applyExposureAdjustment: args.applyExposureAdjustment,
    applyIntroPlacement: args.applyIntroPlacement,
    applyLogoOverlayStyle: args.applyLogoOverlayStyle,
    applyLookPresetSelection: args.applyLookPresetSelection,
    applyOutroPlacement: args.applyOutroPlacement,
    applyPodcastMasterPass: args.applyPodcastMasterPass,
    applyStudioRackMutation: args.applyStudioRackMutation,
    applyVoicePolishPreset: args.applyVoicePolishPreset,
    audioFinalizationCompareMode: args.audioFinalizationCompareMode,
    audioLevelingEnabled: args.audioLevelingEnabled,
    audioNoiseReductionEnabled: args.audioNoiseReductionEnabled,
    setVoicePolishDeEsserStrength: args.setVoicePolishDeEsserStrength,
    setVoicePolishEqProfile: args.setVoicePolishEqProfile,
    setVoicePolishFixEnabled: args.setVoicePolishFixEnabled,
    setVoiceCleanupEnabled: args.setVoiceCleanupEnabled,
    voicePolish: args.voicePolish,
    voicePolishHasAnyFixEnabled: args.voicePolishHasAnyFixEnabled,
    backgroundBlurProviderDescriptor: args.backgroundBlurProviderDescriptor,
    boundAttentionQueue: args.boundAttentionQueue,
    boundAttentionSummary: args.boundAttentionSummary,
    candidateProposedRemovalById: args.candidateProposedRemovalById,
    candidateReceiptByKind: args.candidateReceiptByKind,
    selectedTranscriptRange: args.selectedTranscriptRange,
    captionActiveModeLabel: args.captionActiveModeLabel,
    captionActiveModeSourceLabel: args.captionActiveModeSourceLabel,
    captionArtifactStatusLabel: args.captionArtifactStatusLabel,
    captionBuildFeedback: args.captionBuildFeedback,
    captionBuildFreshness: args.captionBuildFreshness,
    captionBuildState: args.captionBuildState,
    captionBuiltSummary: args.captionBuiltSummary,
    captionBuiltTone: args.captionBuiltTone,
    captionDiscardConsequenceLabel: args.captionDiscardConsequenceLabel,
    captionEditedBasisDetail: args.captionEditedBasisDetail,
    captionEditedChangeSummary: args.captionEditedChangeSummary,
    captionEditedState: args.captionEditedState,
    captionEditedSummary: args.captionEditedSummary,
    captionEditedTone: args.captionEditedTone,
    captionEditorRefs: args.captionEditorRefs,
    captionFormatting: args.captionFormatting,
    captionRebuildConsequenceLabel: args.captionRebuildConsequenceLabel,
    captionReleasePrepSafetyDetail: args.captionReleasePrepSafetyDetail,
    captionReleasePrepSafetyLabel: args.captionReleasePrepSafetyLabel,
    captionReleasePrepSafetyState: args.captionReleasePrepSafetyState,
    captionReleasePrepSummaryLine: args.captionReleasePrepSummaryLine,
    captionReleaseSourceLabel: args.captionReleaseSourceLabel,
    captionSourceLabel: args.captionSourceLabel,
    clampImagePlacementTransform: args.clampImagePlacementTransform,
    cleanupPreview: args.cleanupPreview,
    cleanupPreviewSummary: args.cleanupPreviewSummary,
    cleanupReceipt: args.cleanupReceipt,
    commitImagePlacementTransform: args.commitImagePlacementTransform,
    commitVisualAnchorRefinement: args.commitVisualAnchorRefinement,
    commitVisualPlacementWindow: args.commitVisualPlacementWindow,
    currentPass: args.currentPass,
    deadAirAnalysis: args.deadAirAnalysis,
    deadAirApplyInFlight: args.deadAirApplyInFlight,
    deadAirThresholdSec: args.deadAirThresholdSec,
    DEFAULT_IMAGE_PLACEMENT_TRANSFORM: args.DEFAULT_IMAGE_PLACEMENT_TRANSFORM,
    detailTag: args.detailTag,
    discardHearthBrollSuggestion: args.discardHearthBrollSuggestion,
    editableAudioPolish: args.editableAudioPolish,
    editableStudioRack: args.editableStudioRack,
    editableTranscriptSegments: args.editableTranscriptSegments,
    editableVisualPlacements: args.editableVisualPlacements,
    effectivePlaybackCutRegions: args.effectivePlaybackCutRegions,
    exportStatusLabel: args.exportStatusLabel,
    exportTruthPosture: args.exportTruthPosture,
    exportTruthState: args.exportTruthState,
    fillerActiveCandidateIndex: args.fillerActiveCandidateIndex,
    fillerCandidateCards: args.fillerCandidateCards,
    fillerCleanupOptions: args.fillerCleanupOptions,
    fillerDecisionInFlight: args.fillerDecisionInFlight,
    finishingChecklist: args.finishingChecklist,
    focusBoundAttentionOperation: args.focusBoundAttentionOperation,
    focusReadinessIssue: args.focusReadinessIssue,
    gapCleanupOptions: args.gapCleanupOptions,
    handleCandidateDecision: args.handleCandidateDecision,
    handleDiscardEditedCaptions: args.handleDiscardEditedCaptions,
    handleEditCaptionChunkText: args.handleEditCaptionChunkText,
    handleEnableCaptionEdits: args.handleEnableCaptionEdits,
    handleMergeEditedCaptionChunk: args.handleMergeEditedCaptionChunk,
    handleNormalizeEditedCaptionChunkPunctuation: args.handleNormalizeEditedCaptionChunkPunctuation,
    handleRebuildCaptionArtifacts: args.handleRebuildCaptionArtifacts,
    handleSendToQuench: args.handleSendToQuench,
    handleSplitEditedCaptionChunk: args.handleSplitEditedCaptionChunk,
    handleToggleEditedCaptionChunkSpeakerLabel: args.handleToggleEditedCaptionChunkSpeakerLabel,
    handoffTruthPosture: args.handoffTruthPosture,
    hasTranscriptSelection: args.hasTranscriptSelection,
    introOutroSelectedIntroPath: args.introOutroSelectedIntroPath,
    introOutroSelectedOutroPath: args.introOutroSelectedOutroPath,
    introOutroSelection: args.introOutroSelection,
    loadedPreparedPackage: args.loadedPreparedPackage,
    LOGO_POSITION_OPTIONS: args.LOGO_POSITION_OPTIONS,
    LOGO_SIZE_OPTIONS: args.LOGO_SIZE_OPTIONS,
    MIN_IMAGE_PLACEMENT_DURATION_SEC: args.MIN_IMAGE_PLACEMENT_DURATION_SEC,
    moveResolvedBrollBinding: args.moveResolvedBrollBinding,
    navigateBoundAttention: args.navigateBoundAttention,
    outputSelectionSummary: args.outputSelectionSummary,
    PACKAGING_INTRO_ENTRY_ID: args.PACKAGING_INTRO_ENTRY_ID,
    PACKAGING_OUTRO_ENTRY_ID: args.PACKAGING_OUTRO_ENTRY_ID,
    packagingIntroPlacement: args.packagingIntroPlacement,
    packagingLogoAssetPath: args.packagingLogoAssetPath,
    packagingLogoPlacement: args.packagingLogoPlacement,
    packagingLogoPosition: args.packagingLogoPosition,
    packagingLogoSize: args.packagingLogoSize,
    packagingOutroPlacement: args.packagingOutroPlacement,
    persistedAudioCutCount: args.persistedAudioCutCount,
    podcastMasterLayer: args.podcastMasterLayer,
    podcastMasterUiStatus: args.podcastMasterUiStatus,
    polishStrength: args.polishStrength,
    previewQuickClean: args.previewQuickClean,
    previewRemoveFillers: args.previewRemoveFillers,
    previewRemoveRetakes: args.previewRemoveRetakes,
    previewShortenGaps: args.previewShortenGaps,
    previewSpeakerInterview: args.previewSpeakerInterview,
    previewSpeakerMonologue: args.previewSpeakerMonologue,
    previewSpeakerPanel: args.previewSpeakerPanel,
    previewSpeakerSolo: args.previewSpeakerSolo,
    previewTruthPosture: args.previewTruthPosture,
    props: args.props,
    quenchHandoffStatus: args.quenchHandoffStatus,
    readinessStatusLabel: args.readinessStatusLabel,
    readinessVerdict: args.readinessVerdict,
    readySummaryAreas: args.readySummaryAreas,
    refreshCandidateQueue: args.refreshCandidateQueue,
    releasePrepError: args.releasePrepError,
    releasePrepLoading: args.releasePrepLoading,
    releasePrepOpenHref: args.releasePrepOpenHref,
    releasePrepSaved: args.releasePrepSaved,
    releasePrepSaving: args.releasePrepSaving,
    releasePrepStaleReasons: args.releasePrepStaleReasons,
    removePackagingPlacement: args.removePackagingPlacement,
    removeVisualPlacement: args.removeVisualPlacement,
    replaceResolvedBrollBinding: args.replaceResolvedBrollBinding,
    resolvedBrollBindingItems: args.resolvedBrollBindingItems,
    resolveHearthBrollSuggestion: args.resolveHearthBrollSuggestion,
    retakeActiveCandidateIndex: args.retakeActiveCandidateIndex,
    retakeCandidateCards: args.retakeCandidateCards,
    retakeCleanupOptions: args.retakeCleanupOptions,
    retakeDecisionInFlight: args.retakeDecisionInFlight,
    revertResolvedBrollBinding: args.revertResolvedBrollBinding,
    roundToTenth: args.roundToTenth,
    SEGMENTATION_PROVIDER_DESCRIPTORS: args.SEGMENTATION_PROVIDER_DESCRIPTORS,
    selectedBoundBrollInspectorState: args.selectedBoundBrollInspectorState,
    selectedBoundBrollOperationId: args.selectedBoundBrollOperationId,
    selectedCaptionArtifactFormat: args.selectedCaptionArtifactFormat,
    selectedImageAnimationLabel: args.selectedImageAnimationLabel,
    selectedImagePlacement: args.selectedImagePlacement,
    selectedImagePlacementTransform: args.selectedImagePlacementTransform,
    selectedTransitionBoundObject: args.selectedTransitionBoundObject,
    selectedVisualAnchorSegment: args.selectedVisualAnchorSegment,
    selectedVisualAnchorSegmentId: args.selectedVisualAnchorSegmentId,
    selectedVisualClip: args.selectedVisualClip,
    sendToQuenchButtonLabel: args.sendToQuenchButtonLabel,
    setActiveCaptionArtifactMode: args.setActiveCaptionArtifactMode,
    setActiveReviewKind: args.setActiveReviewKind,
    setActiveTranscriptToolSection: args.setActiveTranscriptToolSection,
    setAnchorLabelDraft: args.setAnchorLabelDraft,
    setAnchorTextDraft: args.setAnchorTextDraft,
    setAudioFinalizationCompare: args.setAudioFinalizationCompare,
    setAudioLevelingEnabled: args.setAudioLevelingEnabled,
    setAudioNoiseReductionEnabled: args.setAudioNoiseReductionEnabled,
    updateCandidateProposedRemoval: args.updateCandidateProposedRemoval,
    setCaptionFormatting: args.setCaptionFormatting,
    setCleanupPreview: args.setCleanupPreview,
    setDeadAirThresholdSec: args.setDeadAirThresholdSec,
    setDetailTag: args.setDetailTag,
    setFillerCleanupOptions: args.setFillerCleanupOptions,
    setFinishingChecklist: args.setFinishingChecklist,
    setFocusOverride: args.setFocusOverride,
    setGapCleanupOptions: args.setGapCleanupOptions,
    setPolishStrength: args.setPolishStrength,
    setRetakeCleanupOptions: args.setRetakeCleanupOptions,
    setSelectedCaptionArtifactFormat: args.setSelectedCaptionArtifactFormat,
    setSpeakerInterviewOptions: args.setSpeakerInterviewOptions,
    setSpeakerMonologueOptions: args.setSpeakerMonologueOptions,
    setSpeakerPanelOptions: args.setSpeakerPanelOptions,
    setSpeakerSoloOptions: args.setSpeakerSoloOptions,
    setStudioRackBackend: args.setStudioRackBackend,
    setStudioRackBypassed: args.setStudioRackBypassed,
    setStudioRackEnabled: args.setStudioRackEnabled,
    setStudioRackModuleBypassed: args.setStudioRackModuleBypassed,
    setStudioRackModuleEnabled: args.setStudioRackModuleEnabled,
    setStudioRackOpen: args.setStudioRackOpen,
    setTranscriptTimingHint: args.setTranscriptTimingHint,
    setVideoSnapMode: args.setVideoSnapMode,
    setVisualBackgroundBlur: args.setVisualBackgroundBlur,
    setVisualBackgroundBlurDebugMask: args.setVisualBackgroundBlurDebugMask,
    setVisualBackgroundMaskPreviewMode: args.setVisualBackgroundMaskPreviewMode,
    setVisualBackgroundMaskPreviewStage: args.setVisualBackgroundMaskPreviewStage,
    setVisualBackgroundBlurFallbackMode: args.setVisualBackgroundBlurFallbackMode,
    setVisualBackgroundBlurFeatherPx: args.setVisualBackgroundBlurFeatherPx,
    setVisualBackgroundBlurSubjectExpansionPx: args.setVisualBackgroundBlurSubjectExpansionPx,
    setVisualBackgroundBlurProviderId: args.setVisualBackgroundBlurProviderId,
    setVisualBackgroundBlurPx: args.setVisualBackgroundBlurPx,
    setVisualBackgroundBlurQualityMode: args.setVisualBackgroundBlurQualityMode,
    setVisualBackgroundBlurRuntimeStatus: args.setVisualBackgroundBlurRuntimeStatus,
    setVisualBackgroundBlurTemporalSmoothing: args.setVisualBackgroundBlurTemporalSmoothing,
    setVisualBackgroundReplaceColor: args.setVisualBackgroundReplaceColor,
    setVisualBackgroundReplaceEnabled: args.setVisualBackgroundReplaceEnabled,
    setVisualBackgroundReplaceImageUrl: args.setVisualBackgroundReplaceImageUrl,
    setVisualBackgroundReplaceMode: args.setVisualBackgroundReplaceMode,
    setVisualBackgroundWashDesaturateAmount: args.setVisualBackgroundWashDesaturateAmount,
    setVisualBackgroundWashDimAmount: args.setVisualBackgroundWashDimAmount,
    setVisualBackgroundWashEnabled: args.setVisualBackgroundWashEnabled,
    setVisualColorAmount: args.setVisualColorAmount,
    setVisualEyeContactAssistDebugOverlay: args.setVisualEyeContactAssistDebugOverlay,
    setVisualEyeContactAssistEnabled: args.setVisualEyeContactAssistEnabled,
    setVisualEyeContactAssistRuntimeStatus: args.setVisualEyeContactAssistRuntimeStatus,
    setVisualEyeContactAssistStrength: args.setVisualEyeContactAssistStrength,
    setVisualWhiteBalance: args.setVisualWhiteBalance,
    sourceBrollItems: args.sourceBrollItems,
    sourceImageLibraryItems: args.sourceImageLibraryItems,
    speakerInterviewOptions: args.speakerInterviewOptions,
    speakerMonologueOptions: args.speakerMonologueOptions,
    speakerOptions: args.speakerOptions,
    speakerPanelOptions: args.speakerPanelOptions,
    speakerSoloOptions: args.speakerSoloOptions,
    studioRackEnabledModuleCount: args.studioRackEnabledModuleCount,
    studioRackOpen: args.studioRackOpen,
    studioRackPlaybackBackendResolution: args.studioRackPlaybackBackendResolution,
    studioRackPlaybackConfig: args.studioRackPlaybackConfig,
    studioRackRenderAppliedModules: args.studioRackRenderAppliedModules,
    studioRackRenderBackendResolution: args.studioRackRenderBackendResolution,
    studioRackRenderConfig: args.studioRackRenderConfig,
    studioRackRenderDeferredModules: args.studioRackRenderDeferredModules,
    studioRackRenderStatus: args.studioRackRenderStatus,
    studioRackComparePreviewStatusLabel: args.studioRackComparePreviewStatusLabel,
    toggleLogoOverlay: args.toggleLogoOverlay,
    transcriptSegmentsById: args.transcriptSegmentsById,
    transcriptSelectionRange: args.transcriptSelectionRange,
    trimResolvedBrollBinding: args.trimResolvedBrollBinding,
    unresolvedBrollSuggestionItems: args.unresolvedBrollSuggestionItems,
    updateImagePlacementTransform: args.updateImagePlacementTransform,
    updateVisualPlacementTiming: args.updateVisualPlacementTiming,
    videoSnapMode: args.videoSnapMode,
    viewingModeSummary: args.viewingModeSummary,
    visualBackgroundBlur: args.visualBackgroundBlur,
    visualBackgroundBlurDebugMask: args.visualBackgroundBlurDebugMask,
    visualBackgroundMaskPreviewMode: args.visualBackgroundMaskPreviewMode,
    visualBackgroundMaskPreviewStage: args.visualBackgroundMaskPreviewStage,
    visualBackgroundBlurFallbackMode: args.visualBackgroundBlurFallbackMode,
    visualBackgroundBlurFeatherPx: args.visualBackgroundBlurFeatherPx,
    visualBackgroundBlurSubjectExpansionPx: args.visualBackgroundBlurSubjectExpansionPx,
    visualBackgroundBlurPx: args.visualBackgroundBlurPx,
    visualBackgroundBlurQualityMode: args.visualBackgroundBlurQualityMode,
    visualBackgroundBlurRuntimeStatus: args.visualBackgroundBlurRuntimeStatus,
    visualBackgroundBlurStatusSummary: args.visualBackgroundBlurStatusSummary,
    visualBackgroundBlurTemporalSmoothing: args.visualBackgroundBlurTemporalSmoothing,
    visualBackgroundReplaceColor: args.visualBackgroundReplaceColor,
    visualBackgroundReplaceEnabled: args.visualBackgroundReplaceEnabled,
    visualBackgroundReplaceImageUrl: args.visualBackgroundReplaceImageUrl,
    visualBackgroundReplaceMode: args.visualBackgroundReplaceMode,
    visualBackgroundWashDesaturateAmount: args.visualBackgroundWashDesaturateAmount,
    visualBackgroundWashDimAmount: args.visualBackgroundWashDimAmount,
    visualBackgroundWashEnabled: args.visualBackgroundWashEnabled,
    visualColorAmount: args.visualColorAmount,
    visualEyeContactAssistDebugOverlay: args.visualEyeContactAssistDebugOverlay,
    visualEyeContactAssistEnabled: args.visualEyeContactAssistEnabled,
    visualEyeContactAssistRuntimeStatus: args.visualEyeContactAssistRuntimeStatus,
    visualEyeContactAssistStatusSummary: args.visualEyeContactAssistStatusSummary,
    visualEyeContactAssistStrength: args.visualEyeContactAssistStrength,
    visualWhiteBalance: args.visualWhiteBalance,
    workspaceFocusMode: args.workspaceFocusMode,
  };
}
