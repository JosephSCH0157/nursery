import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type JSX,
  type KeyboardEvent,
} from "react";
import {
  deriveDeleteOnlyTranscriptCutSelection,
  resolveDeleteOnlyTranscriptDeletion,
  type HammerDeleteOnlyTranscriptDirection,
} from "./hammerDeleteOnlyTranscriptEditing";

export type HammerWorkspaceShellSourceTabVM = {
  id: string;
  label: string;
  isActive: boolean;
  onSelect: () => void;
};

export type HammerWorkspaceShellLayerOptionVM = {
  id: string;
  label: string;
};

export type HammerWorkspaceShellHistoryEntryVM = {
  id: string;
  label: string;
  timestampLabel: string;
  scopeLabel: string;
  layerActionLabel: string;
  derivedLayerLabel: string;
  layerLabel: string | null;
  isCurrent: boolean;
  isLayerTransition: boolean;
  isActiveLayerTransition: boolean;
  onSelect: () => void;
};

export type HammerWorkspaceShellSourceBayVM = {
  aiInUse: boolean;
  onRequestRegenerateAiTranscript?: () => void;
  regenerateAiTranscriptDisabled?: boolean;

  undo: {
    canUndo: boolean;
    label: string | null;
    compactLabel: string | null;
    depth: number;
    onUndo: () => void;
  };
  redo: {
    canRedo: boolean;
    label: string | null;
    compactLabel: string | null;
    depth: number;
    onRedo: () => void;
  };

  tabs: HammerWorkspaceShellSourceTabVM[];

  sourceDeskLoading: boolean;
  sourceDeskError: { message: string; className: string } | null;

  viewingLayer: {
    value: string;
    disabled: boolean;
    options: HammerWorkspaceShellLayerOptionVM[];
    onChange: (nextLayerId: string | null) => void;
  };
  exportBasis: {
    value: string;
    options: HammerWorkspaceShellLayerOptionVM[];
    onChange: (nextLayerId: string | null) => void;
  };

  historyPanel: {
    canRestoreState: boolean;
    onRestoreState: () => void;
    shownCountLabel: string;
    resetToRaw: null | {
      inFlight: boolean;
      error: string | null;
      onRequest: () => void;
    };
    entries: HammerWorkspaceShellHistoryEntryVM[];
  };
};

export default function HammerWorkspaceShellSourceBay(props: { vm: HammerWorkspaceShellSourceBayVM }): JSX.Element {
  const vm = props.vm;

  const ctx = vm as any;
  const selectedSourceTab = ctx.selectedSourceTab as string;
  const editableTranscriptSegments = ctx.editableTranscriptSegments as any[];
  const selectedSegmentId = ctx.selectedSegmentId as string | null;
  const setFocusOverride = ctx.setFocusOverride as (mode: "auto" | "source-focus" | "tool-focus" | "time-focus") => void;
  const transcriptTimingHint = ctx.transcriptTimingHint as string | null;
  const applyTranscriptSelection = ctx.applyTranscriptSelection as (segmentId: string, extend: boolean) => void;
  const commitDeleteOnlyTranscriptEdits = ctx.commitDeleteOnlyTranscriptEdits as ((edits: Array<{
    segmentId: string;
    nextText: string;
    deletion: {
      nextText: string;
      deletedText: string;
      deletedTokenCount: number;
      startTokenIndex: number;
      endTokenIndexExclusive: number;
      totalTokenCount: number;
    };
    cutSelection: { startSec: number; endSec: number } | null;
  }>) => { applied: boolean; playbackChanged: boolean; deletedTokenCount: number }) | undefined;
  const disableTranscriptSelection = ctx.disableTranscriptSelection as () => void;
  const cutTranscriptSelection = ctx.cutTranscriptSelection as () => void;
  const tightenTranscriptSelection = ctx.tightenTranscriptSelection as () => void;
  const clearTranscriptSelection = ctx.clearTranscriptSelection as () => void;
  const hasTranscriptSelection = ctx.hasTranscriptSelection as boolean;
  const transcriptSelectionAllDisabled = ctx.transcriptSelectionAllDisabled as boolean;
  const transcriptSelectionRange = ctx.transcriptSelectionRange as any;
  const transcriptSelectionSegmentIdSet = ctx.transcriptSelectionSegmentIdSet as Set<string>;
  const modifiedTranscriptSegmentIds = ctx.modifiedTranscriptSegmentIds as Set<string>;
  const modifiedSegmentCount = ctx.modifiedSegmentCount as number;
  const candidateSegmentIdSet = ctx.candidateSegmentIdSet as Set<string>;
  const activeCandidateSegmentIdSet = ctx.activeCandidateSegmentIdSet as Set<string>;
  const transcriptLineRefs = ctx.transcriptLineRefs as { current: Map<string, HTMLElement> };
  const setTranscriptTimingHint = ctx.setTranscriptTimingHint as (message: string | null) => void;

  const [inlineEditHint, setInlineEditHint] = useState<string | null>(null);
  const hintTimerRef = useRef<number | null>(null);

  useEffect(() => {
    setInlineEditHint(null);
  }, [editableTranscriptSegments]);

  const transcriptTurns = useMemo(() => {
    const turns: Array<{ speaker: string; segments: any[] }> = [];
    for (const segment of editableTranscriptSegments) {
      const speaker = String(segment.speaker ?? "");
      const last = turns[turns.length - 1] ?? null;
      if (last && last.speaker === speaker) {
        last.segments.push(segment);
      } else {
        turns.push({ speaker, segments: [segment] });
      }
    }
    return turns;
  }, [editableTranscriptSegments]);

  function getSegmentJoiner(prevText: string, nextText: string): string {
    const prevEndsWithSpace = /\s$/.test(prevText);
    const nextStartsWithSpace = /^\s/.test(nextText);
    if (prevEndsWithSpace || nextStartsWithSpace) return "";
    return " ";
  }

  const showTranscriptSegmentDiagnostics = useMemo(() => (
    import.meta.env.DEV
    && typeof window !== "undefined"
    && Boolean((window as any).__forgeHammerDebugTranscriptSegments__)
  ), []);
  const showAdvancedLayerState = useMemo(() => (
    import.meta.env.DEV
    || vm.viewingLayer.options.length > 0
    || vm.exportBasis.options.length > 0
  ), [vm.exportBasis.options.length, vm.viewingLayer.options.length]);
  const exportBasisLabel = useMemo(() => {
    if (vm.exportBasis.value === "__raw__") return "Raw transcript";
    const match = vm.exportBasis.options.find((layer) => layer.id === vm.exportBasis.value);
    return match?.label ?? "Derived layer";
  }, [vm.exportBasis.options, vm.exportBasis.value]);
  const viewingLayerLabel = useMemo(() => {
    if (vm.viewingLayer.value === "__raw__") return "Raw transcript";
    const match = vm.viewingLayer.options.find((layer) => layer.id === vm.viewingLayer.value);
    return match?.label ?? "Derived layer";
  }, [vm.viewingLayer.options, vm.viewingLayer.value]);

  function hashToHue(value: string): number {
    let hash = 0;
    for (let i = 0; i < value.length; i += 1) {
      hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0;
    }
    return Math.abs(hash) % 360;
  }

  function showInlineEditHint(message: string): void {
    setInlineEditHint(message);
    if (hintTimerRef.current != null) {
      window.clearTimeout(hintTimerRef.current);
    }
    hintTimerRef.current = window.setTimeout(() => {
      setInlineEditHint(null);
    }, 2200);
  }

  useEffect(() => () => {
    if (hintTimerRef.current != null) {
      window.clearTimeout(hintTimerRef.current);
    }
  }, []);

  function commitDeleteOnlySegmentEdit(
    segment: any,
    selectionStart: number,
    selectionEnd: number,
    direction: HammerDeleteOnlyTranscriptDirection,
  ): boolean {
    const deletion = resolveDeleteOnlyTranscriptDeletion({
      text: String(segment.text ?? ""),
      selectionStart,
      selectionEnd,
      direction,
    });
    if (!deletion) {
      return false;
    }

    const cutSelection = deriveDeleteOnlyTranscriptCutSelection({
      segment,
      deletion,
    });
    if (!cutSelection) {
      showInlineEditHint("Hammer could not map that delete to a timed playback span.");
      return true;
    }

    const result = commitDeleteOnlyTranscriptEdits
      ? commitDeleteOnlyTranscriptEdits([{
        segmentId: segment.segment_id,
        nextText: deletion.nextText,
        deletion,
        cutSelection,
      }])
      : { applied: false, playbackChanged: false, deletedTokenCount: 0 };
    if (!result.applied) {
      showInlineEditHint("Transcript delete did not commit any canonical changes.");
      return true;
    }

    setInlineEditHint(null);
    setTranscriptTimingHint(
      `Deleted ${result.deletedTokenCount} token${result.deletedTokenCount === 1 ? "" : "s"}. Playback now follows the canonical transcript cut.`,
    );
    return true;
  }

  function handleBlockedTranscriptTyping(event: KeyboardEvent<HTMLTextAreaElement>, reason: string): void {
    event.preventDefault();
    showInlineEditHint(reason);
  }

  function handleDeleteOnlyTranscriptKeyDown(event: KeyboardEvent<HTMLTextAreaElement>, segment: any): void {
    if (event.altKey) {
      event.preventDefault();
      showInlineEditHint("Delete-only transcript editing removes transcript tokens from playback. Typing is disabled.");
      return;
    }

    const target = event.currentTarget;
    const hasModifier = event.ctrlKey || event.metaKey;
    const selectionStart = target.selectionStart ?? 0;
    const selectionEnd = target.selectionEnd ?? selectionStart;

    if (hasModifier && (
      event.key === "c" || event.key === "C"
      || event.key === "a" || event.key === "A"
      || event.key === "z" || event.key === "Z"
      || event.key === "y" || event.key === "Y"
    )) {
      return;
    }

    if (hasModifier && (event.key === "v" || event.key === "V")) {
      handleBlockedTranscriptTyping(event, "Paste is blocked in delete-only transcript editing.");
      return;
    }

    if (hasModifier && (event.key === "x" || event.key === "X")) {
      return;
    }

    if (event.key === "Backspace" || event.key === "Delete") {
      event.preventDefault();
      const direction: HammerDeleteOnlyTranscriptDirection = selectionStart !== selectionEnd
        ? "selection"
        : event.key === "Delete"
        ? "forward"
        : "backward";
      commitDeleteOnlySegmentEdit(segment, selectionStart, selectionEnd, direction);
      return;
    }

    const navigationKeys = new Set([
      "ArrowLeft",
      "ArrowRight",
      "ArrowUp",
      "ArrowDown",
      "Home",
      "End",
      "PageUp",
      "PageDown",
      "Tab",
      "Escape",
    ]);
    if (navigationKeys.has(event.key)) {
      return;
    }

    if (event.key.length === 1 || hasModifier) {
      handleBlockedTranscriptTyping(event, "Typing is disabled in delete-only transcript editing.");
    }
  }

  function handleDeleteOnlyTranscriptCut(event: ClipboardEvent<HTMLTextAreaElement>, segment: any): void {
    const target = event.currentTarget;
    const selectionStart = target.selectionStart ?? 0;
    const selectionEnd = target.selectionEnd ?? selectionStart;
    const deletion = resolveDeleteOnlyTranscriptDeletion({
      text: String(segment.text ?? ""),
      selectionStart,
      selectionEnd,
      direction: "selection",
    });
    if (!deletion) {
      event.preventDefault();
      showInlineEditHint("Select transcript tokens to cut from playback.");
      return;
    }

    event.preventDefault();
    event.clipboardData.setData("text/plain", deletion.deletedText);
    commitDeleteOnlySegmentEdit(segment, selectionStart, selectionEnd, "selection");
  }

  const sourceImageItems = ctx.sourceImageItems as any[];
  const sourceImageLibraryItems = ctx.sourceImageLibraryItems as any[];
  const imageUploadInputRef = ctx.imageUploadInputRef as { current: HTMLInputElement | null };
  const uploadingCategory = ctx.uploadingCategory as string | null;
  const handleSourceDeskUpload = ctx.handleSourceDeskUpload as (category: any, files: FileList | null) => void;
  const sourceDeskPreviewUrls = ctx.sourceDeskPreviewUrls as Record<string, string>;
  const sourceDeskPreviewFailures = ctx.sourceDeskPreviewFailures as Record<string, true>;
  const sourceDeskRequestedPreviewPathSet = ctx.sourceDeskRequestedPreviewPathSet as Set<string>;
  const sourceDeskPreviewPendingPathSet = ctx.sourceDeskPreviewPendingPathSet as Set<string>;
  const sourceDeskRemainingPreviewCount = ctx.sourceDeskRemainingPreviewCount as number;
  const requestSourceDeskPreviews = ctx.requestSourceDeskPreviews as (paths: Array<string | null | undefined>) => void;
  const loadRemainingSourceDeskPreviews = ctx.loadRemainingSourceDeskPreviews as () => void;
  const reportVisibleSourceDeskPreviewPaths = ctx.reportVisibleSourceDeskPreviewPaths as ((paths: string[]) => void) | undefined;
  const imageUsageByPath = ctx.imageUsageByPath as Map<string, any>;
  const addImagePlacementFromLibrary = ctx.addImagePlacementFromLibrary as (...args: any[]) => void;
  const buildTimelineImagePrompt = ctx.buildTimelineImagePrompt as (prompt: any) => string;
  const formatBytes = ctx.formatBytes as (bytes: number) => string;
  const queueMediaMapBeatSuggestion = ctx.queueMediaMapBeatSuggestion as (...args: any[]) => void;
  const redoMediaMapFromScript = ctx.redoMediaMapFromScript as (...args: any[]) => void;
  const updatePlacementKindFromMediaMap = ctx.updatePlacementKindFromMediaMap as (...args: any[]) => void;
  const generateReferenceClipFromBeat = ctx.generateReferenceClipFromBeat as (...args: any[]) => void;
  const sourceReferenceClipItems = ctx.sourceReferenceClipItems as any[];
  const sourceBrollOnlyItems = ctx.sourceBrollOnlyItems as any[];
  const referenceClipPlannedBeats = ctx.referenceClipPlannedBeats as any[];
  const seekPlayheadToTime = ctx.seekPlayheadToTime as (...args: any[]) => void;
  const transcriptSegmentsById = ctx.transcriptSegmentsById as Map<string, any>;
  const visualPlacementCardRefs = ctx.visualPlacementCardRefs as { current: Map<string, HTMLElement> };
  const effectiveSelectedClipId = ctx.effectiveSelectedClipId as string | null;
  const selectVisualClip = ctx.selectVisualClip as (...args: any[]) => void;
  const copyPromptToClipboard = ctx.copyPromptToClipboard as (...args: any[]) => void;
  const copiedPromptKey = ctx.copiedPromptKey as string | null;
  const sendPromptToProvider = ctx.sendPromptToProvider as (...args: any[]) => void;
  const selectionOriginRef = ctx.selectionOriginRef as { current: any };
  const setSelectedClipId = ctx.setSelectedClipId as (next: string | null) => void;
  const setSelectedSegmentId = ctx.setSelectedSegmentId as (next: string | null) => void;
  const setTranscriptSelectionAnchorSegmentId = ctx.setTranscriptSelectionAnchorSegmentId as (next: string | null) => void;
  const setTranscriptSelectionFocusSegmentId = ctx.setTranscriptSelectionFocusSegmentId as (next: string | null) => void;
  const setVisualTimelineFocusNonce = ctx.setVisualTimelineFocusNonce as (next: number | ((current: number) => number)) => void;
  const updateVisualPlacementTiming = ctx.updateVisualPlacementTiming as (...args: any[]) => void;
  const removeVisualPlacement = ctx.removeVisualPlacement as (...args: any[]) => void;
  const sourceAssetItems = ctx.sourceAssetItems as any[];
  const workspaceMapping = ctx.workspaceMapping as any;
  const mediaMapBeats = ctx.mediaMapBeats as any[];
  const selectedVisualFlowStep = ctx.selectedVisualFlowStep as string;
  const setSelectedVisualFlowStep = ctx.setSelectedVisualFlowStep as (next: string) => void;
  const buildMediaMapPrompt = ctx.buildMediaMapPrompt as (...args: any[]) => any;
  const setMediaMapBeats = ctx.setMediaMapBeats as (next: any[] | ((current: any[]) => any[])) => void;
  const setRemovedMediaMapSegmentIds = ctx.setRemovedMediaMapSegmentIds as (next: string[] | ((current: string[]) => string[])) => void;
  const unresolvedBrollSuggestionItems = ctx.unresolvedBrollSuggestionItems as any[];
  const analyzeReferenceClipInput = ctx.analyzeReferenceClipInput as (...args: any[]) => any;
  const visualPlacementsById = ctx.visualPlacementsById as Map<string, any>;
  const sourceDeskImagesViewportRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const root = sourceDeskImagesViewportRef.current;
    if (selectedSourceTab !== "images" || !root || !reportVisibleSourceDeskPreviewPaths) {
      reportVisibleSourceDeskPreviewPaths?.([]);
      return;
    }

    const readOrderedVisiblePaths = (visibleElements?: Set<Element>): string[] => {
      const seen = new Set<string>();
      const next: string[] = [];
      const nodes = root.querySelectorAll<HTMLElement>("[data-source-desk-preview-path]");
      nodes.forEach((node) => {
        if (visibleElements && !visibleElements.has(node)) return;
        const path = node.dataset.sourceDeskPreviewPath?.trim();
        if (!path || seen.has(path)) return;
        seen.add(path);
        next.push(path);
      });
      return next;
    };

    if (typeof IntersectionObserver === "undefined") {
      reportVisibleSourceDeskPreviewPaths(readOrderedVisiblePaths());
      return () => {
        reportVisibleSourceDeskPreviewPaths([]);
      };
    }

    const visibleElements = new Set<Element>();
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          visibleElements.add(entry.target);
        } else {
          visibleElements.delete(entry.target);
        }
      }
      reportVisibleSourceDeskPreviewPaths(readOrderedVisiblePaths(visibleElements));
    }, { threshold: 0.25 });

    const nodes = root.querySelectorAll<HTMLElement>("[data-source-desk-preview-path]");
    nodes.forEach((node) => observer.observe(node));
    reportVisibleSourceDeskPreviewPaths(readOrderedVisiblePaths(visibleElements));

    return () => {
      observer.disconnect();
      reportVisibleSourceDeskPreviewPaths([]);
    };
  }, [reportVisibleSourceDeskPreviewPaths, selectedSourceTab, sourceImageItems, sourceImageLibraryItems]);

  function renderSourceDeskPreviewThumb(args: { assetPath: string | null; label: string }): JSX.Element {
    const assetPath = args.assetPath?.trim() ?? "";
    if (assetPath && sourceDeskPreviewUrls[assetPath]) {
      return (
        <img
          className="hammer-source-card__thumb"
          src={sourceDeskPreviewUrls[assetPath]}
          alt={args.label}
        />
      );
    }

    let message = "Not provided";
    let action: JSX.Element | null = null;
    if (assetPath) {
      if (sourceDeskPreviewFailures[assetPath]) {
        message = "Preview unavailable";
      } else if (sourceDeskPreviewPendingPathSet.has(assetPath) || sourceDeskRequestedPreviewPathSet.has(assetPath)) {
        message = "Loading preview...";
      } else {
        message = "Preview not loaded";
        action = (
          <button
            type="button"
            className="hammer-source-card__thumb-action"
            onClick={() => requestSourceDeskPreviews([assetPath])}
          >
            Load preview
          </button>
        );
      }
    }

    return (
      <div className="hammer-source-card__thumb hammer-source-card__thumb--placeholder">
        <span>{message}</span>
        {action}
      </div>
    );
  }
  const generatingReferenceBeatId = ctx.generatingReferenceBeatId as string | null;

  const brollUploadInputRef = ctx.brollUploadInputRef as { current: HTMLInputElement | null };
  const introOutroUploadInputRef = ctx.introOutroUploadInputRef as { current: HTMLInputElement | null };
  const introOutroSelection = ctx.introOutroSelection as any;
  const introOutroSelectedIntroPath = ctx.introOutroSelectedIntroPath as string | null;
  const introOutroSelectedOutroPath = ctx.introOutroSelectedOutroPath as string | null;
  const introOutroCandidateItems = ctx.introOutroCandidateItems as any[];
  const persistIntroOutroSelection = ctx.persistIntroOutroSelection as (next: any) => void;
  const savingIntroOutro = ctx.savingIntroOutro as boolean;
  const applyIntroOutroSelectionToFutureEpisodes = ctx.applyIntroOutroSelectionToFutureEpisodes as boolean;
  const setApplyIntroOutroSelectionToFutureEpisodes = ctx.setApplyIntroOutroSelectionToFutureEpisodes as ((next: boolean) => void) | undefined;
  const persistWorkspaceIntroOutroDefaultsNow = ctx.persistWorkspaceIntroOutroDefaultsNow as (() => void) | undefined;
  const savingWorkspaceIntroOutroDefaults = ctx.savingWorkspaceIntroOutroDefaults as boolean | undefined;
  const workspaceIntroOutroDefaults = ctx.workspaceIntroOutroDefaults as { updated_at?: string } | null | undefined;
  return (
    <>
      <header className="hammer-bay-head">
        <strong>Source Desk</strong>
        {vm.aiInUse ? (
          <div className="hammer-tool-hint" role="status" aria-live="polite">
            AI in use now. Live processing is active.
          </div>
        ) : null}
        <div className="hammer-bay-tabs">
          <button
            type="button"
            onClick={vm.undo.onUndo}
            disabled={!vm.undo.canUndo}
            title={vm.undo.label ? `Undo ${vm.undo.label}` : "Undo"}
          >
            {vm.undo.canUndo && vm.undo.compactLabel ? `Undo ${vm.undo.compactLabel}` : "Undo"}
          </button>
          <button
            type="button"
            onClick={vm.redo.onRedo}
            disabled={!vm.redo.canRedo}
            title={vm.redo.label ? `Redo ${vm.redo.label}` : "Redo"}
          >
            {vm.redo.canRedo && vm.redo.compactLabel ? `Redo ${vm.redo.compactLabel}` : "Redo"}
          </button>
        </div>
        <div className="hammer-bay-tabs">
          {vm.tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={tab.isActive ? "is-active" : ""}
              onClick={tab.onSelect}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {selectedSourceTab === "transcript" && vm.onRequestRegenerateAiTranscript ? (
          <div className="hammer-bay-tabs">
            <button
              type="button"
              onClick={vm.onRequestRegenerateAiTranscript}
              disabled={Boolean(vm.regenerateAiTranscriptDisabled)}
              title="Regenerate AI transcript and optionally refresh visual placements"
            >
              Regenerate AI Transcript
            </button>
          </div>
        ) : null}
      </header>
      <div className="hammer-bay-body">
        {vm.sourceDeskLoading ? (
          <div className="hammer-source-status">Loading stored Source Desk media...</div>
        ) : null}
        {vm.sourceDeskError ? (
          <div
            className={vm.sourceDeskError.className}
            role="status"
          >
            {vm.sourceDeskError.message}
          </div>
        ) : null}
        <div className="hammer-source-status hammer-source-status--info" role="status">
          History: {vm.undo.depth} undo / {vm.redo.depth} redo
        </div>
        {showAdvancedLayerState ? (
          <details className="hammer-layer-selector" aria-label="Advanced transcript layer controls">
            <summary className="hammer-layer-selector__head">
              <strong>Advanced</strong>
              <span>Export basis: {exportBasisLabel}</span>
            </summary>
            {import.meta.env.DEV ? (
              <label className="hammer-layer-selector__field">
                <span>Viewing layer (debug)</span>
                <select
                  value={vm.viewingLayer.value}
                  onChange={(event) => {
                    const nextLayerId = event.target.value === "__raw__" ? null : event.target.value;
                    vm.viewingLayer.onChange(nextLayerId);
                  }}
                  disabled={vm.viewingLayer.disabled}
                >
                  <option value="__raw__">Raw transcript</option>
                  {vm.viewingLayer.options.map((layer) => (
                    <option key={layer.id} value={layer.id}>
                      {layer.label}
                    </option>
                  ))}
                </select>
                <div className="hammer-layer-selector__hint">
                  Viewing layer is a debug control and does not change the transcript editor content yet.
                  Current: {viewingLayerLabel}
                </div>
              </label>
            ) : null}
            <label className="hammer-layer-selector__field">
              <span>Export basis</span>
              <select
                value={vm.exportBasis.value}
                onChange={(event) => {
                  const nextLayerId = event.target.value === "__raw__" ? null : event.target.value;
                  vm.exportBasis.onChange(nextLayerId);
                }}
              >
                <option value="__raw__">Raw transcript</option>
                {vm.exportBasis.options.map((layer) => (
                  <option key={layer.id} value={layer.id}>
                    {layer.label}
                  </option>
                ))}
              </select>
              <div className="hammer-layer-selector__hint">
                Controls which transcript layer is used for captions/export.
              </div>
            </label>
          </details>
        ) : null}
        <section className="hammer-history-panel" aria-label="Edit history">
          <header className="hammer-history-panel__head">
            <strong>History</strong>
            <div className="hammer-history-panel__head-actions">
              {vm.historyPanel.resetToRaw ? (
                <button
                  type="button"
                  onClick={() => {
                    const ok = window.confirm(
                      "Reset to Original discards the current revision edits (cleanup cuts, timing shifts, visuals, audio edits) and restores the immutable canonical baseline. Continue?",
                    );
                    if (!ok) return;
                    vm.historyPanel.resetToRaw?.onRequest();
                  }}
                  className="hammer-history-panel__action"
                  disabled={vm.historyPanel.resetToRaw.inFlight}
                  title="Restore this episode to its original imported state (clears all Hammer edits)"
                >
                  {vm.historyPanel.resetToRaw.inFlight ? "Resetting..." : "Reset to Original"}
                </button>
              ) : null}
              {vm.historyPanel.canRestoreState ? (
                <button
                  type="button"
                  onClick={vm.historyPanel.onRestoreState}
                  className="hammer-history-panel__action"
                >
                  Restore this state
                </button>
              ) : null}
              <span>{vm.historyPanel.shownCountLabel}</span>
            </div>
          </header>
          {vm.historyPanel.resetToRaw?.error ? (
            <div className="hammer-history-panel__empty" role="status">
              {vm.historyPanel.resetToRaw.error}
            </div>
          ) : null}
          {vm.historyPanel.entries.length === 0 ? (
            <div className="hammer-history-panel__empty">No edits recorded yet.</div>
          ) : (
            <div className="hammer-history-panel__list">
              {vm.historyPanel.entries.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  className={[
                    "hammer-history-panel__item",
                    entry.isCurrent ? "is-current" : "",
                    entry.isLayerTransition ? "is-layer-transition" : "",
                  ].filter(Boolean).join(" ")}
                  onClick={entry.onSelect}
                >
                  <div className="hammer-history-panel__row">
                    <strong>{entry.label}</strong>
                    <span>{entry.timestampLabel}</span>
                  </div>
                  <div className="hammer-history-panel__meta">
                    <span>Scope: {entry.scopeLabel}</span>
                    <span>Layer action: {entry.layerActionLabel}</span>
                    <span>Derived layer: {entry.derivedLayerLabel}</span>
                    {entry.layerLabel ? <span>Layer: {entry.layerLabel}</span> : null}
                    {entry.isCurrent ? <span>Current head</span> : null}
                    {entry.isActiveLayerTransition ? <span>Active layer transition</span> : null}
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>
              {selectedSourceTab === "transcript" ? (
                editableTranscriptSegments.length > 0 ? (
                  <>
                    <section className="hammer-transcript-page-actions" aria-label="Transcript editor actions">
                      <div className="hammer-transcript-page-actions__meta">
                        <span>Delete-only transcript editing</span>
                        <span>Deleting removes transcript tokens from playback. Typing, replace, and paste are blocked.</span>
                      </div>
                    </section>
                    {inlineEditHint || transcriptTimingHint ? (
                      <div className="hammer-tool-hint" role="status">
                        {inlineEditHint ?? transcriptTimingHint}
                      </div>
                    ) : null}
                    <section className="hammer-transcript-selection-actions" aria-label="Transcript structural actions">
                      {hasTranscriptSelection ? (
                        <div className="hammer-transcript-selection-actions__meta">
                          <span>
                            Selected {transcriptSelectionRange.segmentIds.length} segment
                            {transcriptSelectionRange.segmentIds.length === 1 ? "" : "s"}
                            {transcriptSelectionRange.startSec != null && transcriptSelectionRange.endSec != null
                              ? ` · ${transcriptSelectionRange.startSec.toFixed(1)}s-${transcriptSelectionRange.endSec.toFixed(1)}s`
                              : ""}
                          </span>
                          <span>Affects timeline span and transcript-linked structural edits.</span>
                        </div>
                      ) : (
                        <div className="hammer-transcript-selection-actions__meta">
                          <span>Select transcript segments to drive timeline edits.</span>
                          <span>Shift-click extends the range. Escape clears selection.</span>
                        </div>
                      )}
                      <div className="hammer-transcript-selection-actions__buttons">
                        <button type="button" onClick={cutTranscriptSelection} disabled={!hasTranscriptSelection}>
                          Cut Selection
                        </button>
                        <button type="button" onClick={disableTranscriptSelection} disabled={!hasTranscriptSelection}>
                          {transcriptSelectionAllDisabled ? "Enable Selection" : "Disable Selection"}
                        </button>
                        <button type="button" onClick={tightenTranscriptSelection} disabled={!hasTranscriptSelection}>
                          Tighten Selection
                        </button>
                        <button type="button" onClick={clearTranscriptSelection} disabled={!hasTranscriptSelection}>
                          Clear Selection
                        </button>
                      </div>
                    </section>
                    <div className="hammer-transcript-status-rail" role="status">
                      <span>{editableTranscriptSegments.length} segments</span>
                      <span>{modifiedSegmentCount} modified</span>
                      <span>{modifiedSegmentCount > 0 ? "recompute needed" : "in sync"}</span>
                    </div>
                    <article className="hammer-transcript-doc" aria-label="Transcript document view">
                      {transcriptTurns.map((turn, turnIndex) => (
                        <section
                          key={`doc-turn-${turnIndex}-${turn.speaker}`}
                          className="hammer-transcript-doc-turn"
                          data-speaker-hue={hashToHue(turn.speaker)}
                        >
                          <header className="hammer-transcript-doc-turn__head">
                            <span className="hammer-transcript-doc-turn__label">{turn.speaker || "Speaker"}</span>
                          </header>
                          <p className="hammer-transcript-doc-turn__para">
                            {turn.segments.map((segment, segmentIndex) => {
                              const value = segment.text;
                              const prevText = segmentIndex > 0 ? String(turn.segments[segmentIndex - 1]?.text ?? "") : "";
                              const joiner = segmentIndex > 0 ? getSegmentJoiner(prevText, String(value ?? "")) : "";
                              return (
                                <span
                                  key={segment.segment_id}
                                  className={[
                                    "hammer-transcript-doc-seg",
                                    segment.segment_id === selectedSegmentId ? "is-active" : "",
                                    transcriptSelectionSegmentIdSet.has(segment.segment_id) ? "is-range" : "",
                                    modifiedTranscriptSegmentIds.has(segment.segment_id) ? "is-modified" : "",
                                    candidateSegmentIdSet.has(segment.segment_id) ? "is-candidate" : "",
                                    activeCandidateSegmentIdSet.has(segment.segment_id) ? "is-candidate-active" : "",
                                    segment.is_disabled ? "is-disabled" : "",
                                  ].filter(Boolean).join(" ")}
                                  title={`${segment.start_sec.toFixed(1)}s - ${segment.end_sec.toFixed(1)}s`}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    setFocusOverride("source-focus");
                                    applyTranscriptSelection(segment.segment_id, event.shiftKey);
                                  }}
                                  ref={(element) => {
                                    if (element) {
                                      transcriptLineRefs.current.set(segment.segment_id, element);
                                    } else {
                                      transcriptLineRefs.current.delete(segment.segment_id);
                                    }
                                  }}
                                >
                                  {joiner}
                                  {value}
                                </span>
                              );
                            })}
                          </p>
                        </section>
                      ))}
                    </article>
                    {showTranscriptSegmentDiagnostics ? (
                      <article className="hammer-transcript-page" aria-label="Transcript segment diagnostics">
                        {transcriptTurns.map((turn, turnIndex) => (
                          <section
                            key={`turn-${turnIndex}-${turn.speaker}`}
                            className="hammer-transcript-turn"
                            data-speaker-hue={hashToHue(turn.speaker)}
                          >
                            <header className="hammer-transcript-turn__head">
                              <span className="hammer-transcript-turn__label">{turn.speaker || "Speaker"}</span>
                            </header>
                            <div className="hammer-transcript-turn__body">
                              {turn.segments.map((segment) => {
                                const value = segment.text;
                                return (
                                  <div
                                    key={`diag-${segment.segment_id}`}
                                    className={[
                                      "hammer-transcript-page-seg",
                                      segment.segment_id === selectedSegmentId ? "is-active" : "",
                                      transcriptSelectionSegmentIdSet.has(segment.segment_id) ? "is-range" : "",
                                      modifiedTranscriptSegmentIds.has(segment.segment_id) ? "is-modified" : "",
                                      candidateSegmentIdSet.has(segment.segment_id) ? "is-candidate" : "",
                                      activeCandidateSegmentIdSet.has(segment.segment_id) ? "is-candidate-active" : "",
                                      segment.is_disabled ? "is-disabled" : "",
                                    ].filter(Boolean).join(" ")}
                                    onClick={(event) => {
                                      const target = event.target as HTMLElement;
                                      if (target.closest("textarea")) return;
                                      applyTranscriptSelection(segment.segment_id, event.shiftKey);
                                    }}
                                    ref={(element) => {
                                      if (element) {
                                        transcriptLineRefs.current.set(`diag:${segment.segment_id}`, element);
                                      } else {
                                        transcriptLineRefs.current.delete(`diag:${segment.segment_id}`);
                                      }
                                    }}
                                  >
                                    <div className="hammer-transcript-page-seg__meta">
                                      <span>
                                        {segment.start_sec.toFixed(1)}s - {segment.end_sec.toFixed(1)}s
                                        {" · "}
                                        {(segment.end_sec - segment.start_sec).toFixed(1)}s
                                        {modifiedTranscriptSegmentIds.has(segment.segment_id) ? " · modified" : ""}
                                        {segment.is_disabled ? " · disabled" : ""}
                                        {segment.gain_db != null && segment.gain_db !== 0 ? ` · gain ${segment.gain_db.toFixed(1)}dB` : ""}
                                      </span>
                                    </div>
                                    <textarea
                                      className="hammer-transcript-page-seg__text"
                                      aria-label={`Transcript segment ${segment.segment_id} (diagnostics)`}
                                      value={value}
                                      disabled={segment.is_disabled}
                                      readOnly
                                      rows={1}
                                      onMouseDown={(event) => {
                                        event.stopPropagation();
                                      }}
                                      onFocus={() => {
                                        setFocusOverride("source-focus");
                                        applyTranscriptSelection(segment.segment_id, false);
                                      }}
                                      onKeyDown={(event) => {
                                        setFocusOverride("source-focus");
                                        handleDeleteOnlyTranscriptKeyDown(event, segment);
                                      }}
                                      onCut={(event) => {
                                        setFocusOverride("source-focus");
                                        handleDeleteOnlyTranscriptCut(event, segment);
                                      }}
                                      onPaste={(event) => {
                                        event.preventDefault();
                                        showInlineEditHint("Paste is blocked in delete-only transcript editing.");
                                      }}
                                      onDrop={(event) => {
                                        event.preventDefault();
                                        showInlineEditHint("Dragging text into the transcript is blocked in delete-only transcript editing.");
                                      }}
                                    />
                                  </div>
                                );
                              })}
                            </div>
                          </section>
                        ))}
                      </article>
                    ) : null}
                  </>
                ) : <div className="hammer-empty-state">Transcript is not loaded yet.</div>
              ) : null}

              {selectedSourceTab === "images" ? (
                sourceImageItems.length > 0 || sourceImageLibraryItems.length > 0 ? (
                  <div ref={sourceDeskImagesViewportRef}>
                    <div className="hammer-source-summary">
                      <span>{sourceImageItems.length} placements</span>
                      <span>{sourceImageItems.filter((item) => item.status === "uncertain").length} uncertain</span>
                    </div>
                    <div className="hammer-source-summary">
                      <span>{sourceImageLibraryItems.length} stored images</span>
                      <div className="hammer-source-summary__actions">
                        {sourceDeskRemainingPreviewCount > 0 ? (
                          <button
                            type="button"
                            className="hammer-source-upload-button is-secondary"
                            onClick={loadRemainingSourceDeskPreviews}
                          >
                            Load remaining previews ({sourceDeskRemainingPreviewCount})
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="hammer-source-upload-button is-secondary"
                          onClick={() => imageUploadInputRef.current?.click()}
                          disabled={uploadingCategory != null}
                        >
                          {uploadingCategory === "images" ? "Uploading..." : "Upload Image"}
                        </button>
                      </div>
                    </div>
                    <input
                      ref={imageUploadInputRef}
                      type="file"
                      aria-label="Upload source desk image file"
                      accept="image/*"
                      className="hammer-source-upload-input"
                      onChange={(event) => {
                        void handleSourceDeskUpload("images", event.currentTarget.files);
                        event.currentTarget.value = "";
                      }}
                    />
                    {sourceImageItems.map((item) => (
                      (() => {
                        const anchorSegment = transcriptSegmentsById.get(item.anchorSegmentId) ?? null;
                        const timelinePrompt = buildTimelineImagePrompt({
                          text: item.anchorText ?? anchorSegment?.text ?? item.label,
                          tweak: "",
                        });
                        const imageCopyKey = `timeline-image:${item.id}`;
                        return (
                          <article
                            key={item.id}
                            data-source-desk-preview-path={item.assetPath ?? undefined}
                            ref={(node) => {
                              if (node) {
                                visualPlacementCardRefs.current.set(item.id, node);
                              } else {
                                visualPlacementCardRefs.current.delete(item.id);
                              }
                            }}
                            className={effectiveSelectedClipId === item.id ? "hammer-source-card is-selected" : "hammer-source-card"}
                          >
                            {renderSourceDeskPreviewThumb({ assetPath: item.assetPath ?? null, label: item.label })}
                            <header className="hammer-source-card__head">
                              <strong>{item.label}</strong>
                              <span className={item.status === "uncertain" ? "is-warning" : "is-ready"}>{item.status}</span>
                            </header>
                            <div className="hammer-source-card__meta">
                              <span>Type: image</span>
                              <span>{item.startSec.toFixed(1)}s - {item.endSec.toFixed(1)}s</span>
                              <span>Uses: 1</span>
                              <span>{item.assetPath ? "Asset linked" : "Asset: not provided"}</span>
                              <span>{item.visualMode ?? "visual"}</span>
                              <span>{item.confidence != null ? `${Math.round(item.confidence * 100)}% match` : "match n/a"}</span>
                            </div>
                            <div className="hammer-source-card__path">Prompt: {timelinePrompt}</div>
                            <div className="hammer-source-card__actions">
                              <button
                                type="button"
                                onClick={() => {
                                  if (item.assetPath && !sourceDeskPreviewUrls[item.assetPath] && !sourceDeskPreviewFailures[item.assetPath]) {
                                    requestSourceDeskPreviews([item.assetPath]);
                                  }
                                  selectVisualClip({ clipId: item.id, origin: "tool_window", revealUI: true });
                                }}
                              >
                                Select
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  void copyPromptToClipboard({
                                    key: imageCopyKey,
                                    prompt: timelinePrompt,
                                  });
                                }}
                              >
                                {copiedPromptKey === imageCopyKey ? "Copied" : "Copy Prompt"}
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  void sendPromptToProvider({
                                    key: imageCopyKey,
                                    prompt: timelinePrompt,
                                    label: "timeline image",
                                  });
                                }}
                              >
                                Send to Provider
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  selectionOriginRef.current = "timeline";
                                  setFocusOverride("time-focus");
                                  setSelectedClipId(item.id);
                                  setSelectedSegmentId(item.anchorSegmentId);
                                  setTranscriptSelectionAnchorSegmentId(item.anchorSegmentId);
                                  setTranscriptSelectionFocusSegmentId(item.anchorSegmentId);
                                  setVisualTimelineFocusNonce((current) => current + 1);
                                  seekPlayheadToTime(item.startSec, "playhead");
                                }}
                              >
                                Send to timeline
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setFocusOverride("time-focus");
                                  updateVisualPlacementTiming(item.id, -0.5);
                                }}
                              >
                                -0.5s
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setFocusOverride("time-focus");
                                  updateVisualPlacementTiming(item.id, 0.5);
                                }}
                              >
                                +0.5s
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setFocusOverride("tool-focus");
                                  removeVisualPlacement(item.id);
                                }}
                              >
                                Remove
                              </button>
                            </div>
                          </article>
                        );
                      })()
                    ))}
                    {sourceImageLibraryItems.map((file) => (
                      <article key={file.path} data-source-desk-preview-path={file.path} className="hammer-source-card">
                        {renderSourceDeskPreviewThumb({ assetPath: file.path, label: file.name })}
                        <header className="hammer-source-card__head">
                          <strong>{file.name}</strong>
                          <span>stored</span>
                        </header>
                        <div className="hammer-source-card__meta">
                          <span>Type: image</span>
                          <span>Uses: {imageUsageByPath.get(file.path) ?? 0}</span>
                          <span>{formatBytes(file.bytes)}</span>
                          <span>{file.updatedAt ?? "updated time unavailable"}</span>
                        </div>
                        <div className="hammer-source-card__path">{file.path}</div>
                        <div className="hammer-source-card__actions">
                          <button
                            type="button"
                            onClick={() => {
                              if (!sourceDeskPreviewUrls[file.path] && !sourceDeskPreviewFailures[file.path]) {
                                requestSourceDeskPreviews([file.path]);
                              }
                              setFocusOverride("tool-focus");
                              addImagePlacementFromLibrary({
                                assetPath: file.path,
                                label: file.name,
                              });
                            }}
                          >
                            Add placement
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <>
                    <div className="hammer-source-summary">
                      <span>No image placements are available yet.</span>
                      <button
                        type="button"
                        className="hammer-source-upload-button is-secondary"
                        onClick={() => imageUploadInputRef.current?.click()}
                        disabled={uploadingCategory != null}
                      >
                        {uploadingCategory === "images" ? "Uploading..." : "Upload Image"}
                      </button>
                    </div>
                    <input
                      ref={imageUploadInputRef}
                      type="file"
                      aria-label="Upload source desk image file"
                      accept="image/*"
                      className="hammer-source-upload-input"
                      onChange={(event) => {
                        void handleSourceDeskUpload("images", event.currentTarget.files);
                        event.currentTarget.value = "";
                      }}
                    />
                  </>
                )
              ) : null}

              {selectedSourceTab === "assets" ? (
                sourceAssetItems.length > 0 ? (
                  <>
                    <div className="hammer-source-summary">
                      <span>{sourceAssetItems.length} assets linked</span>
                      <span>{workspaceMapping ? "workspace mapped" : "mapping unavailable"}</span>
                    </div>
                    {sourceAssetItems.map((item) => (
                      <article key={item.id} className="hammer-source-card">
                        <header className="hammer-source-card__head">
                          <strong>{item.label}</strong>
                          <span>{item.kind}</span>
                        </header>
                        <div className="hammer-source-card__meta">
                          <span>Uses: {item.usageCount}</span>
                          <span>{item.firstStartSec.toFixed(1)}s - {item.lastEndSec.toFixed(1)}s</span>
                          <span>{item.visualMode ?? "mode n/a"}</span>
                        </div>
                        <div className="hammer-source-card__path">{item.assetPath ?? "asset path unavailable"}</div>
                        <div className="hammer-source-card__actions">
                          <button
                            type="button"
                            onClick={() => {
                              setFocusOverride("time-focus");
                              seekPlayheadToTime(item.firstStartSec, "playhead");
                            }}
                          >
                            Reveal in timeline
                          </button>
                        </div>
                      </article>
                    ))}
                  </>
                ) : <div className="hammer-empty-state">No linked assets found for this workpiece.</div>
              ) : null}

              {selectedSourceTab === "broll" ? (
                <section className="hammer-visual-flow">
                  <div className="hammer-visual-flow__steps">
                    {([
                      { id: "media_map", label: "Media Map", done: mediaMapBeats.length > 0 },
                      { id: "images", label: "Images", done: sourceImageLibraryItems.length > 0 },
                      { id: "broll", label: "B-roll", done: sourceBrollOnlyItems.length > 0 },
                      { id: "reference_clips", label: "Reference Clips", done: sourceReferenceClipItems.length > 0 },
                    ] as Array<{ id: string; label: string; done: boolean }>).map((step) => (
                      <button
                        key={step.id}
                        type="button"
                        className={selectedVisualFlowStep === step.id ? "hammer-visual-flow__step is-active" : "hammer-visual-flow__step"}
                        onClick={() => setSelectedVisualFlowStep(step.id)}
                      >
                        <span>{step.label}</span>
                        <small>{step.done ? "complete" : "pending"}</small>
                      </button>
                    ))}
                  </div>

                  {selectedVisualFlowStep === "media_map" ? (
                    <>
                      <div className="hammer-source-summary">
                        <span>{mediaMapBeats.length} beats</span>
                        <button type="button" className="hammer-source-upload-button is-secondary" onClick={redoMediaMapFromScript}>
                          Redo Media Map
                        </button>
                      </div>
                      {mediaMapBeats.map((beat) => {
                        const brollPrompt = buildMediaMapPrompt({ type: "broll", text: beat.sourceText, tweak: beat.tweak });
                        const referencePrompt = buildMediaMapPrompt({ type: "reference_clip", text: beat.sourceText, tweak: beat.tweak });
                        const timelineImagePrompt = buildTimelineImagePrompt({ text: beat.sourceText, tweak: beat.tweak });
                        const timelineCopyKey = `timeline:${beat.id}`;
                        return (
                          <article key={beat.id} className="hammer-source-card">
                            <header className="hammer-source-card__head">
                              <strong>{beat.sourceText.slice(0, 92)}</strong>
                              <span>{beat.reason}</span>
                            </header>
                            <div className="hammer-source-card__meta">
                              <span>Suggested: {beat.suggestedType === "reference_clip" ? "Reference Clip" : "B-roll"}</span>
                              <span>Selected: {beat.selectedType === "reference_clip" ? "Reference Clip" : "B-roll"}</span>
                              <span>{beat.linkedPlacementId ? "linked placement" : "not linked"}</span>
                            </div>
                            <label className="hammer-tool-field">
                              <span>Type</span>
                              <select
                                value={beat.selectedType}
                                onChange={(event) => {
                                  const nextType = event.target.value === "reference_clip" ? "reference_clip" : "broll";
                                  setMediaMapBeats((current) => current.map((item) => (
                                    item.id === beat.id ? { ...item, selectedType: nextType } : item
                                  )));
                                  if (beat.linkedPlacementId) {
                                    updatePlacementKindFromMediaMap(beat.linkedPlacementId, nextType);
                                  }
                                }}
                              >
                                <option value="broll">B-roll</option>
                                <option value="reference_clip">Reference Clip</option>
                              </select>
                            </label>
                            <label className="hammer-tool-field">
                              <span>Tweak</span>
                              <input
                                type="text"
                                value={beat.tweak}
                                onChange={(event) => {
                                  const next = event.target.value;
                                  setMediaMapBeats((current) => current.map((item) => (
                                    item.id === beat.id ? { ...item, tweak: next } : item
                                  )));
                                }}
                                placeholder="Add a light prompt tweak"
                              />
                            </label>
                            <div className="hammer-source-card__path">B-roll prompt: {brollPrompt}</div>
                            <div className="hammer-source-card__path">Reference prompt: {referencePrompt}</div>
                            <div className="hammer-source-card__path">Timeline image prompt: {timelineImagePrompt}</div>
                            <div className="hammer-source-card__actions">
                              <button
                                type="button"
                                onClick={() => {
                                  setMediaMapBeats((current) => current.filter((item) => item.id !== beat.id));
                                  setRemovedMediaMapSegmentIds((current) => (
                                    current.includes(beat.segmentId) ? current : [...current, beat.segmentId]
                                  ));
                                  if (beat.linkedPlacementId) {
                                    removeVisualPlacement(beat.linkedPlacementId);
                                  }
                                }}
                              >
                                Remove visual
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  void copyPromptToClipboard({
                                    key: timelineCopyKey,
                                    prompt: timelineImagePrompt,
                                  });
                                }}
                              >
                                {copiedPromptKey === timelineCopyKey ? "Copied" : "Copy Prompt"}
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  void sendPromptToProvider({
                                    key: timelineCopyKey,
                                    prompt: timelineImagePrompt,
                                    label: "timeline image beat",
                                  });
                                }}
                              >
                                Send to Provider
                              </button>
                              <button type="button" onClick={() => queueMediaMapBeatSuggestion(beat)}>
                                Queue Suggestion
                              </button>
                            </div>
                          </article>
                        );
                      })}
                    </>
                  ) : null}

                  {selectedVisualFlowStep === "images" ? (
                    <>
                      <div className="hammer-source-summary">
                        <span>{sourceImageLibraryItems.length} stored images</span>
                        <button
                          type="button"
                          className="hammer-source-upload-button is-secondary"
                          onClick={() => imageUploadInputRef.current?.click()}
                          disabled={uploadingCategory != null}
                        >
                          {uploadingCategory === "images" ? "Uploading..." : "Upload Image"}
                        </button>
                      </div>
                      <input
                        ref={imageUploadInputRef}
                        type="file"
                        aria-label="Upload source desk image file"
                        accept="image/*"
                        className="hammer-source-upload-input"
                        onChange={(event) => {
                          void handleSourceDeskUpload("images", event.currentTarget.files);
                          event.currentTarget.value = "";
                        }}
                      />
                      {sourceImageLibraryItems.map((file) => (
                        <article key={`img-step-${file.path}`} className="hammer-source-card">
                          <header className="hammer-source-card__head">
                            <strong>{file.name}</strong>
                            <span>image</span>
                          </header>
                          <div className="hammer-source-card__path">{file.path}</div>
                        </article>
                      ))}
                    </>
                  ) : null}

                  {selectedVisualFlowStep === "broll" ? (
                    <>
                      <div className="hammer-source-summary">
                        <span>{sourceBrollOnlyItems.length} B-roll assets</span>
                        <span>{unresolvedBrollSuggestionItems.length} unresolved suggestions</span>
                        <button
                          type="button"
                          className="hammer-source-upload-button is-secondary"
                          onClick={() => brollUploadInputRef.current?.click()}
                          disabled={uploadingCategory != null}
                        >
                          {uploadingCategory === "broll" ? "Uploading..." : "Upload B-roll"}
                        </button>
                      </div>
                      <input
                        ref={brollUploadInputRef}
                        type="file"
                        aria-label="Upload source desk b-roll file"
                        accept="video/*"
                        className="hammer-source-upload-input"
                        onChange={(event) => {
                          void handleSourceDeskUpload("broll", event.currentTarget.files);
                          event.currentTarget.value = "";
                        }}
                      />
                      {sourceBrollOnlyItems.map((item) => (
                        <article key={`broll-step-${item.id}`} className="hammer-source-card">
                          <header className="hammer-source-card__head">
                            <strong>{item.label}</strong>
                            <span>B-roll</span>
                          </header>
                          <div className="hammer-source-card__meta">
                            <span>{item.firstStartSec.toFixed(1)}s - {item.lastEndSec.toFixed(1)}s</span>
                            <span>Uses: {item.usageCount}</span>
                          </div>
                          <div className="hammer-source-card__actions">
                            <button
                              type="button"
                              onClick={() => {
                                void copyPromptToClipboard({
                                  key: `broll:${item.id}`,
                                  prompt: `B-roll: ${item.label}.`,
                                });
                              }}
                            >
                              {copiedPromptKey === `broll:${item.id}` ? "Copied" : "Copy Prompt"}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                void sendPromptToProvider({
                                  key: `broll:${item.id}`,
                                  prompt: `B-roll: ${item.label}.`,
                                  label: "B-roll",
                                });
                              }}
                            >
                              Send to Provider
                            </button>
                            <button type="button" onClick={() => seekPlayheadToTime(item.firstStartSec, "playhead")}>Cue</button>
                          </div>
                        </article>
                      ))}
                    </>
                  ) : null}

                  {selectedVisualFlowStep === "reference_clips" ? (
                    <>
                      <div className="hammer-source-summary">
                        <span>{referenceClipPlannedBeats.length} planned reference beats</span>
                        <span>{sourceReferenceClipItems.length} generated assets</span>
                      </div>
                      {referenceClipPlannedBeats.length === 0 ? (
                        <div className="hammer-empty-state">No reference clip beats selected in Media Map yet.</div>
                      ) : null}
                      {referenceClipPlannedBeats.map((beat) => {
                        const referenceInput = {
                          beatId: beat.id,
                          anchorText: beat.sourceText,
                          promptBasis: buildMediaMapPrompt({
                            type: "reference_clip",
                            text: beat.sourceText,
                            tweak: beat.tweak,
                          }),
                          chartType: "auto",
                        };
                        const analysis = analyzeReferenceClipInput(referenceInput);
                        const linkedPlacement = beat.linkedPlacementId
                          ? (visualPlacementsById.get(beat.linkedPlacementId) ?? null)
                          : null;
                        const previewPath = linkedPlacement?.asset_path ?? null;
                        const previewUrl = previewPath ? (sourceDeskPreviewUrls[previewPath] ?? null) : null;
                        const referencePrompt = buildMediaMapPrompt({
                          type: "reference_clip",
                          text: beat.sourceText,
                          tweak: beat.tweak,
                        });
                        return (
                          <article key={`ref-plan-${beat.id}`} className="hammer-source-card">
                            <header className="hammer-source-card__head">
                              <strong>{beat.sourceText.slice(0, 92)}</strong>
                              <span>{beat.reason}</span>
                            </header>
                            {previewUrl ? (
                              <img
                                className="hammer-source-card__thumb"
                                src={previewUrl}
                                alt={analysis.title}
                              />
                            ) : null}
                            <div className="hammer-source-card__meta">
                              <span>Type: {analysis.outputType}</span>
                              <span>Selected: {beat.selectedType === "reference_clip" ? "Reference Clip" : "B-roll"}</span>
                              <span>{beat.linkedPlacementId ? "generated" : "not generated"}</span>
                            </div>
                            <div className="hammer-source-card__path">Title: {analysis.title}</div>
                            <div className="hammer-source-card__path">Summary: {analysis.summary}</div>
                            <div className="hammer-source-card__path">Prompt: {referencePrompt}</div>
                            <div className="hammer-source-card__actions">
                              <button
                                type="button"
                                onClick={() => {
                                  void generateReferenceClipFromBeat(beat);
                                }}
                                disabled={generatingReferenceBeatId != null}
                              >
                                {generatingReferenceBeatId === beat.id
                                  ? "Generating..."
                                  : beat.linkedPlacementId
                                  ? "Regenerate"
                                  : "Generate"}
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  void copyPromptToClipboard({
                                    key: `ref-clip:${beat.id}`,
                                    prompt: referencePrompt,
                                  });
                                }}
                              >
                                {copiedPromptKey === `ref-clip:${beat.id}` ? "Copied" : "Copy Prompt"}
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  if (!beat.linkedPlacementId) return;
                                  setTranscriptTimingHint("Reference clip already saved to Source Desk.");
                                }}
                                disabled={!beat.linkedPlacementId}
                              >
                                Save Reference Clip
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  if (!beat.linkedPlacementId) return;
                                  removeVisualPlacement(beat.linkedPlacementId);
                                  setMediaMapBeats((current) => current.map((item) => (
                                    item.id === beat.id ? { ...item, linkedPlacementId: null } : item
                                  )));
                                }}
                                disabled={!beat.linkedPlacementId}
                              >
                                Delete Reference Clip
                              </button>
                            </div>
                          </article>
                        );
                      })}
                      {sourceReferenceClipItems.map((item) => (
                        <article key={`ref-step-${item.id}`} className="hammer-source-card">
                          <header className="hammer-source-card__head">
                            <strong>{item.label}</strong>
                            <span>Reference Clip</span>
                          </header>
                          <div className="hammer-source-card__meta">
                            <span>{item.firstStartSec.toFixed(1)}s - {item.lastEndSec.toFixed(1)}s</span>
                            <span>Uses: {item.usageCount}</span>
                          </div>
                          <div className="hammer-source-card__path">{item.assetPath ?? "asset path unavailable"}</div>
                          <div className="hammer-source-card__actions">
                            <button
                              type="button"
                              onClick={() => seekPlayheadToTime(item.firstStartSec, "playhead")}
                            >
                              {item.assetPath ? "Regenerate" : "Generate"}
                            </button>
                            <button type="button" onClick={() => seekPlayheadToTime(item.firstStartSec, "playhead")}>Cue</button>
                          </div>
                        </article>
                      ))}
                    </>
                  ) : null}
                </section>
              ) : null}

              {selectedSourceTab === "introoutro" ? (
                <>
                  <div className="hammer-source-summary">
                    <span>Choose project intro and outro media</span>
                    <button
                      type="button"
                      className="hammer-source-upload-button"
                      onClick={() => introOutroUploadInputRef.current?.click()}
                      disabled={uploadingCategory != null}
                    >
                      {uploadingCategory === "introoutro" ? "Uploading..." : "Upload Intro/Outro"}
                    </button>
                  </div>
                  <input
                    ref={introOutroUploadInputRef}
                    type="file"
                    aria-label="Upload source desk intro or outro file"
                    accept="video/*,audio/*"
                    className="hammer-source-upload-input"
                    onChange={(event) => {
                      void handleSourceDeskUpload("introoutro", event.currentTarget.files);
                      event.currentTarget.value = "";
                    }}
                  />

                  <section className="hammer-source-card">
                    <header className="hammer-source-card__head">
                      <strong>Project Intro</strong>
                      <span>
                        {introOutroSelection.intro_asset_id
                          ? (introOutroSelectedIntroPath ? "selected" : "selected (unresolved)")
                          : "not set"}
                      </span>
                    </header>
                    <select
                      className="hammer-source-select"
                      aria-label="Project intro media selection"
                      value={introOutroSelection.intro_asset_id ?? ""}
                      onChange={(event) => {
                        const next = {
                          ...introOutroSelection,
                          intro_asset_id: event.target.value || null,
                          updated_at: new Date().toISOString(),
                        };
                        void persistIntroOutroSelection(next);
                      }}
                      disabled={savingIntroOutro}
                    >
                      <option value="">No intro</option>
                      {introOutroSelection.intro_asset_id && !introOutroSelectedIntroPath ? (
                        <option value={introOutroSelection.intro_asset_id} disabled>
                          Missing intro asset ({introOutroSelection.intro_asset_id})
                        </option>
                      ) : null}
                      {introOutroCandidateItems.map((item) => (
                        <option key={`intro-${item.assetId}`} value={item.assetId}>
                          {item.name} ({item.kind})
                        </option>
                      ))}
                    </select>
                    <div className="hammer-source-card__path">
                      {introOutroSelection.intro_asset_id
                        ? (introOutroSelectedIntroPath ?? `Unresolved intro selection (${introOutroSelection.intro_asset_id})`)
                        : "No intro selected"}
                    </div>
                  </section>

                  <section className="hammer-source-card">
                    <header className="hammer-source-card__head">
                      <strong>Project Outro</strong>
                      <span>
                        {introOutroSelection.outro_asset_id
                          ? (introOutroSelectedOutroPath ? "selected" : "selected (unresolved)")
                          : "not set"}
                      </span>
                    </header>
                    <select
                      className="hammer-source-select"
                      aria-label="Project outro media selection"
                      value={introOutroSelection.outro_asset_id ?? ""}
                      onChange={(event) => {
                        const next = {
                          ...introOutroSelection,
                          outro_asset_id: event.target.value || null,
                          updated_at: new Date().toISOString(),
                        };
                        void persistIntroOutroSelection(next);
                      }}
                      disabled={savingIntroOutro}
                    >
                      <option value="">No outro</option>
                      {introOutroSelection.outro_asset_id && !introOutroSelectedOutroPath ? (
                        <option value={introOutroSelection.outro_asset_id} disabled>
                          Missing outro asset ({introOutroSelection.outro_asset_id})
                        </option>
                      ) : null}
                      {introOutroCandidateItems.map((item) => (
                        <option key={`outro-${item.assetId}`} value={item.assetId}>
                          {item.name} ({item.kind})
                        </option>
                      ))}
                    </select>
                    <div className="hammer-source-card__path">
                      {introOutroSelection.outro_asset_id
                        ? (introOutroSelectedOutroPath ?? `Unresolved outro selection (${introOutroSelection.outro_asset_id})`)
                        : "No outro selected"}
                    </div>
                  </section>
                  <div className="hammer-source-summary">
                    <span>Saved to Tongs workpiece storage</span>
                    <span>{savingIntroOutro ? "Saving..." : `Updated ${introOutroSelection.updated_at}`}</span>
                  </div>
                  <div className="hammer-source-summary">
                    <label className="hammer-source-checkbox">
                      <input
                        type="checkbox"
                        checked={Boolean(applyIntroOutroSelectionToFutureEpisodes)}
                        onChange={(event) => setApplyIntroOutroSelectionToFutureEpisodes?.(event.currentTarget.checked)}
                        disabled={!setApplyIntroOutroSelectionToFutureEpisodes}
                      />
                      Apply this intro/outro selection to future episodes
                    </label>
                    <button
                      type="button"
                      onClick={() => persistWorkspaceIntroOutroDefaultsNow?.()}
                      disabled={Boolean(savingWorkspaceIntroOutroDefaults) || !persistWorkspaceIntroOutroDefaultsNow}
                    >
                      {savingWorkspaceIntroOutroDefaults ? "Saving defaults..." : "Save as workspace default"}
                    </button>
                    <span>
                      {workspaceIntroOutroDefaults?.updated_at
                        ? `Workspace default updated ${workspaceIntroOutroDefaults.updated_at}`
                        : "No workspace default saved yet"}
                    </span>
                  </div>
                </>
              ) : null}

        
      </div>
    </>
  );
}
