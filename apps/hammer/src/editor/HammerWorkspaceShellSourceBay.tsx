import { useEffect, useMemo, useRef, useState, type JSX } from "react";

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
  const applyHistoryMutation = ctx.applyHistoryMutation as (args: { computeAfter: (before: any) => any } & Record<string, any>) => void;
  const updateSegmentInTimeline = ctx.updateSegmentInTimeline as (segments: any[], segmentId: string, updater: (segment: any) => any) => any[];
  const transcriptTimingHint = ctx.transcriptTimingHint as string | null;
  const applyTranscriptSelection = ctx.applyTranscriptSelection as (segmentId: string, extend: boolean) => void;
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
  const isSubtractiveTranscriptEdit = ctx.isSubtractiveTranscriptEdit as (before: string, after: string) => boolean;
  const setTranscriptTimingHint = ctx.setTranscriptTimingHint as (message: string | null) => void;

  const [draftTextBySegmentId, setDraftTextBySegmentId] = useState<Record<string, string>>({});
  const [inlineEditHint, setInlineEditHint] = useState<string | null>(null);
  const hintTimerRef = useRef<number | null>(null);

  const segmentById = useMemo(() => {
    const next = new Map<string, any>();
    for (const segment of editableTranscriptSegments) {
      next.set(segment.segment_id, segment);
    }
    return next;
  }, [editableTranscriptSegments]);

  useEffect(() => {
    setDraftTextBySegmentId({});
    setInlineEditHint(null);
  }, [editableTranscriptSegments]);

  const dirtyTranscriptEdits = useMemo(() => {
    const dirtyIds = new Set<string>();
    for (const [segmentId, draftText] of Object.entries(draftTextBySegmentId)) {
      const segment = segmentById.get(segmentId);
      if (!segment) continue;
      if (draftText !== segment.text) {
        dirtyIds.add(segmentId);
      }
    }
    return dirtyIds;
  }, [draftTextBySegmentId, segmentById]);
  const hasDirtyTranscriptEdits = dirtyTranscriptEdits.size > 0;

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

  const sourceImageItems = ctx.sourceImageItems as any[];
  const sourceImageLibraryItems = ctx.sourceImageLibraryItems as any[];
  const imageUploadInputRef = ctx.imageUploadInputRef as { current: HTMLInputElement | null };
  const uploadingCategory = ctx.uploadingCategory as string | null;
  const handleSourceDeskUpload = ctx.handleSourceDeskUpload as (category: any, files: FileList | null) => void;
  const sourceDeskPreviewUrls = ctx.sourceDeskPreviewUrls as Record<string, string>;
  const sourceDeskPreviewFailures = ctx.sourceDeskPreviewFailures as Record<string, true>;
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
  const generatingReferenceBeatId = ctx.generatingReferenceBeatId as string | null;

  const brollUploadInputRef = ctx.brollUploadInputRef as { current: HTMLInputElement | null };
  const introOutroUploadInputRef = ctx.introOutroUploadInputRef as { current: HTMLInputElement | null };
  const introOutroSelection = ctx.introOutroSelection as any;
  const introOutroSelectedIntroPath = ctx.introOutroSelectedIntroPath as string | null;
  const introOutroSelectedOutroPath = ctx.introOutroSelectedOutroPath as string | null;
  const introOutroCandidateItems = ctx.introOutroCandidateItems as any[];
  const persistIntroOutroSelection = ctx.persistIntroOutroSelection as (next: any) => void;
  const savingIntroOutro = ctx.savingIntroOutro as boolean;
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
        <section className="hammer-layer-selector" aria-label="Layer state">
          <header className="hammer-layer-selector__head">
            <strong>Layer State</strong>
          </header>
          <label className="hammer-layer-selector__field">
            <span>Viewing layer</span>
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
          </label>
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
          </label>
        </section>
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
                        <span>{hasDirtyTranscriptEdits ? "Unsaved transcript edits" : "Transcript edits saved"}</span>
                        <span>Subtractive-only: delete words/phrases, no additions.</span>
                      </div>
                      <div className="hammer-transcript-page-actions__buttons">
                        <button
                          type="button"
                          disabled={!hasDirtyTranscriptEdits}
                          onClick={() => {
                            setFocusOverride("source-focus");
                            const dirtyIds = Array.from(dirtyTranscriptEdits);
                            for (const segmentId of dirtyIds) {
                              const baseline = segmentById.get(segmentId)?.text ?? null;
                              const draft = draftTextBySegmentId[segmentId];
                              if (baseline == null || draft == null) continue;
                              if (!isSubtractiveTranscriptEdit(baseline, draft)) {
                                showInlineEditHint("Subtractive-only editing: delete words/phrases, but you cannot add new words.");
                                return;
                              }
                            }
                            applyHistoryMutation({
                              label: "Edit transcript",
                              kind: "transcript_text_edit",
                              affectedSegments: dirtyIds,
                              immediatePersist: true,
                              computeAfter: (before) => {
                                let updatedSegments = before.transcriptSegments;
                                for (const segmentId of dirtyIds) {
                                  const draftText = draftTextBySegmentId[segmentId];
                                  if (draftText == null) continue;
                                  updatedSegments = updateSegmentInTimeline(
                                    updatedSegments,
                                    segmentId,
                                    (segment) => ({ ...segment, text: draftText }),
                                  );
                                }
                                return {
                                  ...before,
                                  transcriptSegments: updatedSegments,
                                  transcriptTimingHint: null,
                                };
                              },
                            });
                            setDraftTextBySegmentId({});
                            setInlineEditHint(null);
                          }}
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          disabled={!hasDirtyTranscriptEdits}
                          onClick={() => {
                            setFocusOverride("source-focus");
                            setDraftTextBySegmentId({});
                            setInlineEditHint(null);
                            setTranscriptTimingHint(null);
                          }}
                        >
                          Discard
                        </button>
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
                              const draftText = draftTextBySegmentId[segment.segment_id];
                              const value = draftText ?? segment.text;
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
                                const draftText = draftTextBySegmentId[segment.segment_id];
                                const value = draftText ?? segment.text;
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
                                      rows={1}
                                      onMouseDown={(event) => {
                                        event.stopPropagation();
                                      }}
                                      onFocus={() => {
                                        setFocusOverride("source-focus");
                                        applyTranscriptSelection(segment.segment_id, false);
                                      }}
                                      onChange={(event) => {
                                        const nextValue = event.target.value;
                                        if (!isSubtractiveTranscriptEdit(segment.text, nextValue)) {
                                          showInlineEditHint(
                                            "Subtractive-only editing: delete words/phrases, but you cannot add new words.",
                                          );
                                          return;
                                        }
                                        setFocusOverride("source-focus");
                                        setDraftTextBySegmentId((current) => ({
                                          ...current,
                                          [segment.segment_id]: nextValue,
                                        }));
                                        setTranscriptTimingHint(null);
                                        event.currentTarget.style.height = "auto";
                                        event.currentTarget.style.height = `${event.currentTarget.scrollHeight}px`;
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
                  <>
                    <div className="hammer-source-summary">
                      <span>{sourceImageItems.length} placements</span>
                      <span>{sourceImageItems.filter((item) => item.status === "uncertain").length} uncertain</span>
                    </div>
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
                            ref={(node) => {
                              if (node) {
                                visualPlacementCardRefs.current.set(item.id, node);
                              } else {
                                visualPlacementCardRefs.current.delete(item.id);
                              }
                            }}
                            className={effectiveSelectedClipId === item.id ? "hammer-source-card is-selected" : "hammer-source-card"}
                          >
                            {item.assetPath && sourceDeskPreviewUrls[item.assetPath] ? (
                              <img
                                className="hammer-source-card__thumb"
                                src={sourceDeskPreviewUrls[item.assetPath]}
                                alt={item.label}
                              />
                            ) : (
                              <div className="hammer-source-card__thumb hammer-source-card__thumb--placeholder">
                                {item.assetPath
                                  ? (sourceDeskPreviewFailures[item.assetPath] ? "Preview unavailable" : "No thumbnail")
                                  : "Not provided"}
                              </div>
                            )}
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
                                onClick={() => selectVisualClip({ clipId: item.id, origin: "tool_window", revealUI: true })}
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
                      <article key={file.path} className="hammer-source-card">
                        {sourceDeskPreviewUrls[file.path] ? (
                          <img
                            className="hammer-source-card__thumb"
                            src={sourceDeskPreviewUrls[file.path]}
                            alt={file.name}
                          />
                        ) : (
                          <div className="hammer-source-card__thumb hammer-source-card__thumb--placeholder">
                            {sourceDeskPreviewFailures[file.path] ? "Preview unavailable" : "No thumbnail"}
                          </div>
                        )}
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
                  </>
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
                </>
              ) : null}

        
      </div>
    </>
  );
}
