import {
  Fragment,
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
  transcriptVersionRegistry?: import("../../../../packages/contracts/hammer/transcript-versions.contract").HammerPersistedTranscriptVersionRegistry | null;

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
  historyEpochArchivedNotice?: boolean;
};

export default function HammerWorkspaceShellSourceBay(props: { vm: HammerWorkspaceShellSourceBayVM }): JSX.Element {
  const vm = props.vm;
  const [pendingTranscriptPlacement, setPendingTranscriptPlacement] = useState<{ canonicalAssetId: string | null; assetPath: string; label: string } | null>(null);

  const ctx = vm as any;
  const selectedSourceTab = ctx.selectedSourceTab as string;
  const editableTranscriptSegments = ctx.editableTranscriptSegments as any[];
  const linkedSelection = ctx.linkedSelection as { anchorId?: string | null; isLinked?: boolean } | null;
  const selectedSegmentId = (linkedSelection?.anchorId ?? ctx.selectedSegmentId) as string | null;
  const activeTranscriptSegmentId = (ctx.activeTranscriptSegmentId ?? selectedSegmentId) as string | null;
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
  const transcriptSelectionSegmentIdSet = (ctx.linkedTranscriptSegmentIdSet ?? ctx.transcriptSelectionSegmentIdSet) as Set<string>;
  const modifiedTranscriptSegmentIds = ctx.modifiedTranscriptSegmentIds as Set<string>;
  const modifiedSegmentCount = ctx.modifiedSegmentCount as number;
  const candidateSegmentIdSet = ctx.candidateSegmentIdSet as Set<string>;
  const activeCandidateSegmentIdSet = ctx.activeCandidateSegmentIdSet as Set<string>;
  const transcriptLineRefs = ctx.transcriptLineRefs as { current: Map<string, HTMLElement> };
  const playbackTransportDurationSec = Number(ctx.playbackTransportDurationSec ?? 0);
  const onTranscriptSelection = ctx.onTranscriptSelection as ((next: {
    start: number;
    end: number;
    text: string;
    segments: Array<{
      segmentId: string;
      selectionStart: number;
      selectionEnd: number;
      text: string;
    }>;
  } | null) => void) | undefined;
  const setTranscriptTimingHint = ctx.setTranscriptTimingHint as (message: string | null) => void;
  const waveformProxy = ctx.editableAudioPolish?.analysis?.waveform_proxy ?? null;

  const [inlineEditHint, setInlineEditHint] = useState<string | null>(null);
  const hintTimerRef = useRef<number | null>(null);
  const transcriptDocumentRef = useRef<HTMLElement | null>(null);

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
  const transcriptSegmentById = useMemo(() => {
    const byId = new Map<string, any>();
    for (const segment of editableTranscriptSegments) {
      byId.set(segment.segment_id, segment);
    }
    return byId;
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

  function setSelectedTranscriptTextRange(nextRange: {
    start: number;
    end: number;
    text: string;
    segments: Array<{
      segmentId: string;
      selectionStart: number;
      selectionEnd: number;
      text: string;
    }>;
  } | null): void {
    onTranscriptSelection?.(nextRange);
  }

  function reportSingleSegmentSelection(segment: any, selectionStart: number, selectionEnd: number): void {
    const segmentText = String(segment.text ?? "");
    const start = Math.max(0, Math.min(segmentText.length, selectionStart));
    const end = Math.max(start, Math.min(segmentText.length, selectionEnd));
    if (end <= start) {
      setSelectedTranscriptTextRange(null);
      return;
    }
    const text = segmentText.slice(start, end);
    if (!text.trim()) {
      setSelectedTranscriptTextRange(null);
      return;
    }
    setSelectedTranscriptTextRange({
      start,
      end,
      text,
      segments: [{
        segmentId: segment.segment_id,
        selectionStart: start,
        selectionEnd: end,
        text,
      }],
    });
  }

  function reportTranscriptDocumentSelection(root: HTMLElement): void {
    if (!onTranscriptSelection || typeof window === "undefined") return;
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      setSelectedTranscriptTextRange(null);
      return;
    }
    const range = selection.getRangeAt(0);
    if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) {
      setSelectedTranscriptTextRange(null);
      return;
    }

    const resolveSegmentElement = (node: Node | null): HTMLElement | null => {
      if (!node) return null;
      if (node instanceof HTMLElement) {
        return node.closest("[data-transcript-segment-id]");
      }
      return node.parentElement?.closest("[data-transcript-segment-id]") ?? null;
    };

    const startElement = resolveSegmentElement(range.startContainer);
    const endElement = resolveSegmentElement(range.endContainer);
    if (!startElement || !endElement) {
      setSelectedTranscriptTextRange(null);
      return;
    }

    const segmentElements = Array.from(root.querySelectorAll<HTMLElement>("[data-transcript-segment-id]"));
    const startIndex = segmentElements.findIndex((element) => element === startElement);
    const endIndex = segmentElements.findIndex((element) => element === endElement);
    if (startIndex < 0 || endIndex < 0 || endIndex < startIndex) {
      setSelectedTranscriptTextRange(null);
      return;
    }

    const segments = segmentElements.slice(startIndex, endIndex + 1).flatMap((element, index, list) => {
      const segmentId = element.dataset.transcriptSegmentId ?? "";
      const segment = transcriptSegmentById.get(segmentId) ?? null;
      if (!segment) return [];
      const segmentText = String(segment.text ?? "");
      const selectionStart = index === 0
        ? Math.max(0, Math.min(segmentText.length, range.startOffset))
        : 0;
      const selectionEnd = index === list.length - 1
        ? Math.max(selectionStart, Math.min(segmentText.length, range.endOffset))
        : segmentText.length;
      if (selectionEnd <= selectionStart) return [];
      return [{
        segmentId,
        selectionStart,
        selectionEnd,
        text: segmentText.slice(selectionStart, selectionEnd),
      }];
    });

    const text = selection.toString();
    if (segments.length === 0 || !text.trim()) {
      setSelectedTranscriptTextRange(null);
      return;
    }

    setSelectedTranscriptTextRange({
      start: segments[0]?.selectionStart ?? 0,
      end: segments[segments.length - 1]?.selectionEnd ?? 0,
      text,
      segments,
    });
  }

  useEffect(() => {
    if (!onTranscriptSelection || typeof document === "undefined" || selectedSourceTab !== "transcript") return;

    let frameRequestId: number | null = null;
    const runSelectionSync = (): void => {
      frameRequestId = null;
      const root = transcriptDocumentRef.current;
      if (!root) return;
      reportTranscriptDocumentSelection(root);
    };
    const handleSelectionChange = (): void => {
      if (frameRequestId != null) return;
      frameRequestId = window.requestAnimationFrame(runSelectionSync);
    };

    document.addEventListener("selectionchange", handleSelectionChange);
    return () => {
      document.removeEventListener("selectionchange", handleSelectionChange);
      if (frameRequestId != null) {
        window.cancelAnimationFrame(frameRequestId);
      }
    };
  }, [onTranscriptSelection, selectedSourceTab, transcriptSegmentById]);

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
      audioDurationSec: playbackTransportDurationSec,
      waveformProxy,
      editKind: "delete_only",
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
  const reportSourceDeskPreviewLoadError = ctx.reportSourceDeskPreviewLoadError as ((path: string) => void) | undefined;
  const loadRemainingSourceDeskPreviews = ctx.loadRemainingSourceDeskPreviews as () => void;
  const reportVisibleSourceDeskPreviewPaths = ctx.reportVisibleSourceDeskPreviewPaths as ((paths: string[]) => void) | undefined;
  const imageUsageByPath = ctx.imageUsageByPath as Map<string, any>;
  const addImagePlacementFromLibrary = ctx.addImagePlacementFromLibrary as (...args: any[]) => void;
  const addVisualAssetPlacementFromLibrary = ctx.addVisualAssetPlacementFromLibrary as (...args: any[]) => void;
  const formatBytes = ctx.formatBytes as (bytes: number) => string;
  const redoMediaMapFromScript = ctx.redoMediaMapFromScript as (...args: any[]) => void;
  const updatePlacementKindFromMediaMap = ctx.updatePlacementKindFromMediaMap as (...args: any[]) => void;
  const sourceReferenceClipItems = ctx.sourceReferenceClipItems as any[];
  const sourceBrollOnlyItems = ctx.sourceBrollOnlyItems as any[];
  const seekPlayheadToTime = ctx.seekPlayheadToTime as (...args: any[]) => void;
  const visualPlacementCardRefs = ctx.visualPlacementCardRefs as { current: Map<string, HTMLElement> };
  const effectiveSelectedClipId = ctx.effectiveSelectedClipId as string | null;
  const linkedPrimaryVisualId = (ctx.linkedPrimaryVisualId ?? effectiveSelectedClipId) as string | null;
  const linkedVisualIdSet = (ctx.linkedVisualIdSet ?? new Set<string>()) as Set<string>;
  const selectVisualClip = ctx.selectVisualClip as (...args: any[]) => void;
  const updateVisualPlacementTiming = ctx.updateVisualPlacementTiming as (...args: any[]) => void;
  const removeVisualPlacement = ctx.removeVisualPlacement as (...args: any[]) => void;
  const sourceAssetItems = ctx.sourceAssetItems as any[];
  const workspaceMapping = ctx.workspaceMapping as any;
  const mediaMapBeats = ctx.mediaMapBeats as any[];
  const selectedVisualFlowStep = ctx.selectedVisualFlowStep as string;
  const setSelectedVisualFlowStep = ctx.setSelectedVisualFlowStep as (next: string) => void;
  const setMediaMapBeats = ctx.setMediaMapBeats as (next: any[] | ((current: any[]) => any[])) => void;
  const setRemovedMediaMapSegmentIds = ctx.setRemovedMediaMapSegmentIds as (next: string[] | ((current: string[]) => string[])) => void;
  const unresolvedBrollSuggestionItems = ctx.unresolvedBrollSuggestionItems as any[];
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
      const normalizedPath = assetPath.toLowerCase().split(/[?#]/, 1)[0] ?? "";
      const handlePreviewError = () => {
        if (reportSourceDeskPreviewLoadError) reportSourceDeskPreviewLoadError(assetPath);
      };
      if (/\.(mp4|mov|m4v|webm)$/.test(normalizedPath)) {
        return (
          <video
            className="hammer-source-card__thumb"
            src={sourceDeskPreviewUrls[assetPath]}
            aria-label={args.label}
            muted
            playsInline
            preload="metadata"
            onError={handlePreviewError}
          />
        );
      }
      if (/\.(wav|mp3|aac|m4a)$/.test(normalizedPath)) {
        return (
          // Raw source audio has no caption artifact at this preview boundary.
          // eslint-disable-next-line jsx-a11y/media-has-caption
          <audio
            className="hammer-source-card__thumb"
            src={sourceDeskPreviewUrls[assetPath]}
            aria-label={args.label}
            controls
            preload="metadata"
            onError={handlePreviewError}
          />
        );
      }
      return (
        <img
          className="hammer-source-card__thumb"
          src={sourceDeskPreviewUrls[assetPath]}
          alt={args.label}
          onError={handlePreviewError}
        />
      );
    }

    let message = "Not provided";
    let action: JSX.Element | null = null;
    if (assetPath) {
      if (sourceDeskPreviewFailures[assetPath]) {
        message = "Preview unavailable";
        action = (
          <button
            type="button"
            className="hammer-source-card__thumb-action"
            onClick={() => requestSourceDeskPreviews([assetPath])}
          >
            Retry preview
          </button>
        );
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
  const introOutroUploadInputRef = ctx.introOutroUploadInputRef as { current: HTMLInputElement | null };
  const introOutroSelection = ctx.introOutroSelection as any;
  const introOutroSelectedIntroPath = ctx.introOutroSelectedIntroPath as string | null;
  const introOutroSelectedOutroPath = ctx.introOutroSelectedOutroPath as string | null;
  const introTimelinePlaced = Boolean(ctx.introTimelinePlaced);
  const outroTimelinePlaced = Boolean(ctx.outroTimelinePlaced);
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
        <div className="hammer-source-control-group" aria-label="History controls">
          <span className="hammer-source-control-group__label">History</span>
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
        <div className="hammer-source-control-group hammer-source-control-group--primary">
          {vm.tabs.filter((tab) => tab.id === "transcript").map((tab) => (
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
        <details className="hammer-source-menu">
          <summary>Sources</summary>
          <div className="hammer-source-menu__items">
            {vm.tabs.filter((tab) => tab.id !== "transcript").map((tab) => (
              <button key={tab.id} type="button" className={tab.isActive ? "is-active" : ""} onClick={tab.onSelect}>{tab.label}</button>
            ))}
          </div>
        </details>
        {selectedSourceTab === "transcript" && vm.onRequestRegenerateAiTranscript ? (
          <details className="hammer-source-menu">
            <summary>More</summary>
            <div className="hammer-source-menu__items"><button
              type="button"
              onClick={vm.onRequestRegenerateAiTranscript}
              disabled={Boolean(vm.regenerateAiTranscriptDisabled)}
              title="Regenerate AI transcript and optionally refresh visual placements"
            >
              Regenerate AI Transcript
            </button></div>
          </details>
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
        {selectedSourceTab === "transcript" && vm.transcriptVersionRegistry ? (
          <details className="hammer-transcript-versions" open>
            <summary className="hammer-transcript-versions__head">
              <strong>Transcript Versions</strong>
              <span>{vm.transcriptVersionRegistry.versions.length} version{vm.transcriptVersionRegistry.versions.length !== 1 ? "s" : ""}</span>
            </summary>
            <ul className="hammer-transcript-versions__list">
              {vm.transcriptVersionRegistry.versions.map((v) => {
                const isActive = v.version_id === vm.transcriptVersionRegistry!.active_version_id;
                const sourceLabel = v.source === "anvil" ? "Anvil original" : v.source === "hammer_ai" ? "AI regeneration" : "Imported";
                return (
                  <li
                    key={v.version_id}
                    className={`hammer-transcript-versions__entry${isActive ? " is-active" : ""}`}
                    aria-current={isActive ? "true" : undefined}
                  >
                    <span className="hammer-transcript-versions__label">{v.label}</span>
                    <span className="hammer-transcript-versions__source">{sourceLabel}</span>
                    {v.segment_count != null ? (
                      <span className="hammer-transcript-versions__meta">{v.segment_count} segments</span>
                    ) : null}
                    {v.model ? (
                      <span className="hammer-transcript-versions__meta">Model: {v.model}</span>
                    ) : null}
                    {isActive ? <span className="hammer-transcript-versions__active-badge">Active</span> : null}
                  </li>
                );
              })}
            </ul>
          </details>
        ) : null}
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
          {vm.historyEpochArchivedNotice ? (
            <div className="hammer-history-panel__epoch" role="status">
              Earlier history archived · Undo begins here
            </div>
          ) : null}
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
                    {pendingTranscriptPlacement ? (
                      <div className="hammer-source-status" role="status">
                        <strong>Place {pendingTranscriptPlacement.label} from transcript</strong>
                        <span>Select the spoken segment where this image belongs, then confirm.</span>
                        <div className="hammer-source-card__actions">
                          <button
                            type="button"
                            disabled={!selectedSegmentId}
                            onClick={() => {
                              addImagePlacementFromLibrary({ ...pendingTranscriptPlacement, mode: "transcript" });
                              setPendingTranscriptPlacement(null);
                            }}
                          >
                            Confirm transcript placement
                          </button>
                          <button type="button" onClick={() => setPendingTranscriptPlacement(null)}>Cancel</button>
                        </div>
                      </div>
                    ) : null}
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
                    <article
                      className="hammer-transcript-doc"
                      aria-label="Transcript document view"
                      ref={(element) => {
                        transcriptDocumentRef.current = element;
                      }}
                    >
                      {transcriptTurns.map((turn, turnIndex) => (
                        <section
                          key={`doc-turn-${turnIndex}-${turn.speaker}`}
                          className="hammer-transcript-doc-turn"
                          data-speaker-hue={hashToHue(turn.speaker)}
                        >
                          <header className="hammer-transcript-doc-turn__head">
                            <span className="hammer-transcript-doc-turn__label">{turn.speaker || "Speaker"}</span>
                          </header>
                          <div
                            className="hammer-transcript-doc-turn__para"
                            role="textbox"
                            aria-readonly="true"
                            tabIndex={0}
                            onMouseUp={(event) => {
                              reportTranscriptDocumentSelection(event.currentTarget);
                            }}
                            onKeyUp={(event) => {
                              reportTranscriptDocumentSelection(event.currentTarget);
                            }}
                          >
                            {turn.segments.map((segment, segmentIndex) => {
                              const value = segment.text;
                              const prevText = segmentIndex > 0 ? String(turn.segments[segmentIndex - 1]?.text ?? "") : "";
                              const joiner = segmentIndex > 0 ? getSegmentJoiner(prevText, String(value ?? "")) : "";
                              return (
                                <Fragment key={segment.segment_id}>
                                  {joiner}
                                  <span
                                    data-transcript-segment-id={segment.segment_id}
                                    className={[
                                      "hammer-transcript-doc-seg",
                                      segment.segment_id === activeTranscriptSegmentId ? "is-active" : "",
                                      transcriptSelectionSegmentIdSet.has(segment.segment_id) ? "is-range" : "",
                                      modifiedTranscriptSegmentIds.has(segment.segment_id) ? "is-modified" : "",
                                      candidateSegmentIdSet.has(segment.segment_id) ? "is-candidate" : "",
                                      activeCandidateSegmentIdSet.has(segment.segment_id) ? "is-candidate-active" : "",
                                      segment.is_disabled ? "is-disabled" : "",
                                    ].filter(Boolean).join(" ")}
                                    title={`${segment.start_sec.toFixed(1)}s - ${segment.end_sec.toFixed(1)}s`}
                                    role="button"
                                    tabIndex={0}
                                    onClick={(event) => {
                                      if (typeof window !== "undefined") {
                                        const selection = window.getSelection();
                                        if (selection && !selection.isCollapsed && selection.toString().trim()) {
                                          const root = transcriptDocumentRef.current;
                                          if (root) {
                                            reportTranscriptDocumentSelection(root);
                                          }
                                          return;
                                        }
                                      }
                                      event.stopPropagation();
                                      setFocusOverride("source-focus");
                                      applyTranscriptSelection(segment.segment_id, event.shiftKey);
                                    }}
                                    onKeyDown={(event) => {
                                      if (event.key !== "Enter" && event.key !== " ") return;
                                      event.preventDefault();
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
                                    {value}
                                  </span>
                                </Fragment>
                              );
                            })}
                          </div>
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
                                      segment.segment_id === activeTranscriptSegmentId ? "is-active" : "",
                                      transcriptSelectionSegmentIdSet.has(segment.segment_id) ? "is-range" : "",
                                      modifiedTranscriptSegmentIds.has(segment.segment_id) ? "is-modified" : "",
                                      candidateSegmentIdSet.has(segment.segment_id) ? "is-candidate" : "",
                                      activeCandidateSegmentIdSet.has(segment.segment_id) ? "is-candidate-active" : "",
                                      segment.is_disabled ? "is-disabled" : "",
                                    ].filter(Boolean).join(" ")}
                                    ref={(element) => {
                                      if (element) {
                                        transcriptLineRefs.current.set(`diag:${segment.segment_id}`, element);
                                      } else {
                                        transcriptLineRefs.current.delete(`diag:${segment.segment_id}`);
                                      }
                                    }}
                                  >
                                    <button
                                      type="button"
                                      className="hammer-transcript-page-seg__meta"
                                      onClick={(event) => {
                                        applyTranscriptSelection(segment.segment_id, event.shiftKey);
                                      }}
                                    >
                                      <span>
                                        {segment.start_sec.toFixed(1)}s - {segment.end_sec.toFixed(1)}s
                                        {" · "}
                                        {(segment.end_sec - segment.start_sec).toFixed(1)}s
                                        {modifiedTranscriptSegmentIds.has(segment.segment_id) ? " · modified" : ""}
                                        {segment.is_disabled ? " · disabled" : ""}
                                        {segment.gain_db != null && segment.gain_db !== 0 ? ` · gain ${segment.gain_db.toFixed(1)}dB` : ""}
                                      </span>
                                    </button>
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
                                      onSelect={(event) => {
                                        reportSingleSegmentSelection(
                                          segment,
                                          event.currentTarget.selectionStart ?? 0,
                                          event.currentTarget.selectionEnd ?? 0,
                                        );
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
                            className={[
                              "hammer-source-card",
                              linkedPrimaryVisualId === item.id ? "is-selected" : "",
                              linkedVisualIdSet.has(item.id) ? "is-linked" : "",
                              linkedSelection && !linkedSelection.isLinked && linkedPrimaryVisualId === item.id ? "is-unlinked" : "",
                            ].filter(Boolean).join(" ")}
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
                              <span>{({
                                anchored: "Anchored",
                                anchor_supplied_resolution_failed: "Anchor supplied—resolution failed",
                                ambiguous_match: "Ambiguous match",
                                detached: "Detached from current script/transcript",
                                no_placement_intent: "No placement intent supplied",
                              } as Record<string, string>)[item.anchorStatus] ?? item.anchorStatus}</span>
                              <span>{item.confidence != null ? `${Math.round(item.confidence * 100)}% match` : "match n/a"}</span>
                            </div>
                            <div className="hammer-source-card__actions">
                              <button
                                type="button"
                                onClick={() => {
                                  if (item.assetPath && !sourceDeskPreviewUrls[item.assetPath] && !sourceDeskPreviewFailures[item.assetPath]) {
                                    requestSourceDeskPreviews([item.assetPath]);
                                  }
                                  selectVisualClip({
                                    clipId: item.id,
                                    origin: "tool_window",
                                    revealUI: true,
                                    allowSurfaceSwitch: true,
                                    snapTarget: {
                                      editableStartSec: item.startSec,
                                      editableEndSec: item.endSec,
                                      firstVisibleEditableSec: item.firstVisibleEditableSec ?? null,
                                      preservePlayheadIfWithinEditableWindow: true,
                                    },
                                  });
                                }}
                              >
                                Select
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setFocusOverride("time-focus");
                                  selectVisualClip({
                                    clipId: item.id,
                                    origin: "timeline",
                                    revealUI: true,
                                    allowSurfaceSwitch: true,
                                    snapTarget: {
                                      editableStartSec: item.startSec,
                                      editableEndSec: item.endSec,
                                      firstVisibleEditableSec: item.firstVisibleEditableSec ?? null,
                                      preservePlayheadIfWithinEditableWindow: true,
                                    },
                                  });
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
                              setPendingTranscriptPlacement({ canonicalAssetId: file.assetId, assetPath: file.path, label: file.name });
                              setFocusOverride("source-focus");
                              vm.tabs.find((tab) => tab.id === "transcript")?.onSelect();
                            }}
                          >
                            Place from Transcript
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setFocusOverride("time-focus");
                              void addImagePlacementFromLibrary({ canonicalAssetId: file.assetId, assetPath: file.path, label: file.name, mode: "timeline" });
                            }}
                          >
                            Send to Timeline
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
                        <span>{sourceBrollOnlyItems.length} B-roll assets available</span>
                        <span>{unresolvedBrollSuggestionItems.length} unresolved suggestions</span>
                      </div>
                      <div className="hammer-tool-hint">
                        Hammer only places existing B-roll assets. Create or upload new B-roll in Hearth.
                      </div>
                      {sourceBrollOnlyItems.length === 0 ? (
                        <div className="hammer-empty-state">No existing B-roll assets are available in workspace state.</div>
                      ) : null}
                      {sourceBrollOnlyItems.map((item) => (
                        <article key={`broll-step-${item.id}`} className="hammer-source-card">
                          <header className="hammer-source-card__head">
                            <strong>{item.label}</strong>
                            <span className={item.usageCount > 0 ? "is-ready" : ""}>
                              {item.usageCount > 0 ? "placed" : "not placed"}
                            </span>
                          </header>
                          {renderSourceDeskPreviewThumb({ assetPath: item.assetPath ?? null, label: item.label })}
                          <div className="hammer-source-card__meta">
                            <span>{item.firstStartSec.toFixed(1)}s - {item.lastEndSec.toFixed(1)}s</span>
                            <span>Uses: {item.usageCount}</span>
                          </div>
                          <div className="hammer-source-card__path">{item.assetPath ?? "asset path unavailable"}</div>
                          <div className="hammer-source-card__actions">
                            <button
                              type="button"
                              onClick={() => addVisualAssetPlacementFromLibrary({
                                assetPath: item.assetPath,
                                canonicalAssetId: item.canonicalAssetId,
                                label: item.label,
                                kind: "broll",
                              })}
                              disabled={!item.assetPath || !item.canonicalAssetId}
                            >
                              {item.usageCount > 0 ? "Place another instance" : "Place in timeline"}
                            </button>
                            {item.usageCount > 0 ? (
                              <button type="button" onClick={() => seekPlayheadToTime(item.firstStartSec, "playhead")}>Cue</button>
                            ) : null}
                          </div>
                        </article>
                      ))}
                    </>
                  ) : null}

                  {selectedVisualFlowStep === "reference_clips" ? (
                    <>
                      <div className="hammer-source-summary">
                        <span>{sourceReferenceClipItems.length} reference clip assets available</span>
                      </div>
                      <div className="hammer-tool-hint">
                        Reference clips are created in Hearth. Hammer only places existing reference clip assets.
                      </div>
                      {sourceReferenceClipItems.length === 0 ? (
                        <div className="hammer-empty-state">No existing reference clip assets are available in workspace state.</div>
                      ) : null}
                      {sourceReferenceClipItems.map((item) => (
                        <article key={`ref-step-${item.id}`} className="hammer-source-card">
                          <header className="hammer-source-card__head">
                            <strong>{item.label}</strong>
                            <span className={item.usageCount > 0 ? "is-ready" : ""}>
                              {item.usageCount > 0 ? "placed" : "not placed"}
                            </span>
                          </header>
                          {renderSourceDeskPreviewThumb({ assetPath: item.assetPath ?? null, label: item.label })}
                          <div className="hammer-source-card__meta">
                            <span>{item.firstStartSec.toFixed(1)}s - {item.lastEndSec.toFixed(1)}s</span>
                            <span>Uses: {item.usageCount}</span>
                          </div>
                          <div className="hammer-source-card__path">{item.assetPath ?? "asset path unavailable"}</div>
                          <div className="hammer-source-card__actions">
                            <button
                              type="button"
                              onClick={() => addVisualAssetPlacementFromLibrary({
                                assetPath: item.assetPath,
                                canonicalAssetId: item.canonicalAssetId,
                                label: item.label,
                                kind: "reference_clip",
                              })}
                              disabled={!item.assetPath || !item.canonicalAssetId}
                            >
                              {item.usageCount > 0 ? "Place another instance" : "Place in timeline"}
                            </button>
                            {item.usageCount > 0 ? (
                              <button
                                type="button"
                                onClick={() => seekPlayheadToTime(item.firstStartSec, "playhead")}
                              >
                                Cue
                              </button>
                            ) : null}
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
                          ? (introOutroSelectedIntroPath
                            ? (introTimelinePlaced ? "placed" : "selected — not placed")
                            : "selected (unresolved)")
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
                          ? (introOutroSelectedOutroPath
                            ? (outroTimelinePlaced ? "placed" : "selected — not placed")
                            : "selected (unresolved)")
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
