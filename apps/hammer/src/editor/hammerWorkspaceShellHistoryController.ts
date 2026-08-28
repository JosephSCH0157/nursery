import { useEffect, useRef } from "react";
import type { HammerLaunchContext } from "../../../../packages/contracts/hammer/launch-context.contract";
import type { HammerEditPlan, HammerPreviewMode } from "../../../../packages/contracts/hammer/edit-plan.contract";
import { cloneHammerEditorialAuthorityGraph, type HammerEditorialAuthorityGraph } from "../../../../packages/contracts/hammer/editorial-authority.contract";
import type { HammerTranscriptSegment } from "../../../../packages/contracts/hammer/transcript.contract";
import type { HammerPersistedAudioEdit, HammerPersistedStructuredTranscript, HammerPersistedVisualPlacements } from "../persistence/hammerPersistenceContract";
import type { HammerVisualTimelineState } from "../visuals/model/hammerVisualTypes";
import {
  createHammerHistoryController,
  createHammerHistoryDocument,
  hashEditorState,
  normalizeHammerHistoryDocument,
  verifyHammerHistoryAgainstCanonicalHead, projectHammerHistoryOwnedSessionHead,
  HammerHistoryVerificationError,
  cloneEditorState,
  type HammerEditorStateSerializable,
  type HammerHistoryController,
  type HammerHistoryDocumentV1,
  type HammerHistoryEntry,
  type HammerHistoryKind,
  type HammerOutputSelectionState,
} from "./hammerWorkspaceHistory";
import { syncEditableTranscriptSegments, resolveTranscriptDurationSec } from "./hammerWorkspaceTranscript";
import { createDefaultHammerStudioRackState } from "./hammerStudioRack";
import { projectEditorialAuthorityGraphFromEditPlan } from "./hammerRenderAssembly";
import { resolveHammerHistoryStatus } from "../lib/hammerHistoryStatus";
import { loadHammerHistoryDocument, loadHammerHistoryPresence, saveHammerHistoryDocument, saveHammerRevisionHistoryDocument } from "../lib/hammerHistoryArtifactApi";
import type { HammerWorkspaceShellSnapshotAuthority } from "./hammerWorkspaceShellSnapshotEmitter";
import { buildVisualTimelineDiagnostics, preservePlacementRichTimelineDuringHydration } from "./hammerVisualTimelineHydrationGuard";
import { cloneHammerDerivedTextLayers, listHammerDerivedTextLayers, setHammerDerivedTextLayerActive } from "../macros/hammerDerivedTranscriptLayers";
import { resolveHammerDerivedLayersForUndoStack } from "./hammerCompositionHistoryCommands";
import { startAndHydrateHammerHistoryEpoch, type HammerHistoryEpochPersistenceAuthority, type HammerHistoryEpochPersistenceState } from "./hammerHistoryEpochPersistence";
import type { HammerHistoryEpochStartCandidate } from "./hammerHistoryEpochStartWorkflow";
import { loadHammerRevisionHistoryHydration, type HammerHistoryEpochTransportRequest, type HammerRevisionHistoryHydration } from "../lib/hammerHistoryEpochApi";
import { reconstructLegacyEditorStateHashInput, verifyEpochAnchorBaseHash } from "./hammerHistoryHashCompatibility";
import { applyHammerHistoryCommandState } from "./hammerHistoryCommandState"; import { attachHammerMutationPersistenceReceipt, createHammerMutationPersistenceReceipt, type HammerAppliedHistoryMutation, type HammerMutationPersistenceResult } from "./hammerMutationPersistenceReceipt";
export { captureHammerHistoryPostSaveSnapshotRequest, persistHammerHistorySaveBoundary, type HammerHistoryPostSaveSnapshotRequest } from "./hammerHistorySaveBoundary";
import { cloneHammerHistoryDocument, persistHammerHistorySaveBoundary, type HammerHistoryPostSaveSnapshotRequest } from "./hammerHistorySaveBoundary";
export type HammerHistoryCommandAuthorityConfig = {
  workspaceId: string;
  workpieceId: string;
  revisionId: string | null;
  historyPath?: string | null;
  selectionSegmentId: string | null;
  activeTool: string | null;
  captureState: () => HammerEditorStateSerializable;
  normalizeState: (state: HammerEditorStateSerializable) => HammerEditorStateSerializable;
  applyState: (state: HammerEditorStateSerializable, reason: string) => void;
  setDerivedLayers: (layers: DerivedLayersState) => void;
  onHistoryNavigation: () => void;
  getViewingTranscript: () => HammerPersistedStructuredTranscript | null;
  formatDerivedLayerLabel: (layer: NonNullable<DerivedLayersState>["layers"][number]) => string;
  setHistoryStatus: (status: string | null) => void;
  captureSnapshotRequest: (
    document: HammerHistoryDocumentV1,
    state: HammerEditorStateSerializable,
  ) => HammerHistoryPostSaveSnapshotRequest;
  onHistorySaved: (request: HammerHistoryPostSaveSnapshotRequest) => Promise<void>;
  saveDocument?: (document: HammerHistoryDocumentV1) => Promise<{ ok: true } | { ok: false; error: string }>;
  epochPersistence?: HammerHistoryEpochPersistenceAuthority;
  isTransitionPending?: () => boolean;
};
export type HammerHistoryMutationArgs = {
  label: string;
  kind?: HammerHistoryKind;
  affectedSegments?: string[];
  affectedPlacementIds?: string[];
  toolId?: string;
  transactionId?: string;
  allowCoalesce?: boolean;
  immediatePersist?: boolean;
  computeAfter: (before: HammerEditorStateSerializable) => HammerEditorStateSerializable;
};
export interface HammerHistoryCommandAuthority {
  configure(config: HammerHistoryCommandAuthorityConfig): void;
  getController(): HammerHistoryController | null;
  installController(controller: HammerHistoryController | null): void;
  installHydration(hydration: HammerRevisionHistoryHydration, controller: HammerHistoryController | null, identity: { workspaceId: string; workpieceId: string; canonicalRecordingId: string; revisionId: string }, baseMatch?: { canonicalHash: string; algorithm: import("./hammerWorkspaceHistory").HammerEditorStateHashAlgorithm }): void;
  getEpochPersistenceState(): HammerHistoryEpochPersistenceState | null; startHistoryEpoch(request: HammerHistoryEpochTransportRequest, frozenState?: HammerEditorStateSerializable): Promise<import("../lib/hammerHistoryEpochApi").HammerHistoryTransitionResult>;
  applyMutation(args: HammerHistoryMutationArgs): HammerAppliedHistoryMutation | null;
  undo(): void;
  redo(): void;
  createCheckpoint(label: string): void;
  installBaseline(state: HammerEditorStateSerializable, derivedLayers: DerivedLayersState): void;
  updateBaselineState(state: HammerEditorStateSerializable): void;
  installDerivedLayerTransition(entryId: string, transition: DerivedLayerHistoryTransition): void;
  getDerivedLayerTransition(entryId: string): DerivedLayerHistoryTransition | null;
  jumpToEntry(entryId: string): { undoStack: string[]; hasRedo: boolean } | null;
  restoreCurrentState(): boolean;
  selectViewingLayer(layerId: string | null): void;
  schedulePersist(immediate?: boolean): void;
  clearPersistTimer(): void;
  invalidate(): void;
}
export function createHammerHistoryCommandAuthority(initialConfig: HammerHistoryCommandAuthorityConfig, debounceMs: number, coalesceWindowMs: number): HammerHistoryCommandAuthority {
  let config = initialConfig;
  let controller: HammerHistoryController | null = null;
  let persistTimer: ReturnType<typeof setTimeout> | null = null;
  let generation = 0;
  let baselineState: HammerEditorStateSerializable | null = null;
  let baselineDerivedLayers: DerivedLayersState = cloneHammerDerivedTextLayers(undefined);
  const derivedLayerTransitions = new Map<string, DerivedLayerHistoryTransition>();
  const pendingPersistenceReceipts: Array<{ settle: (result: HammerMutationPersistenceResult) => void }> = [];
  const resolveDerivedLayers = (undoStack: readonly string[]): DerivedLayersState => (
    resolveHammerDerivedLayersForUndoStack({
      undoStack,
      baseline: baselineDerivedLayers,
      transitions: derivedLayerTransitions,
    })
  );

  const clearPersistTimer = (): void => {
    if (persistTimer != null) {
      clearTimeout(persistTimer);
      persistTimer = null;
    }
  };

  const persist = async (): Promise<void> => {
    if (!controller) return;
    const receiptBatch = pendingPersistenceReceipts.splice(0); const saveGeneration = generation;
    const saveConfig = config;
    const document = cloneHammerHistoryDocument(controller.document);
    document.metadata = {
      ...(document.metadata ?? {}),
      lastKnownSelectionSegmentId: saveConfig.selectionSegmentId,
      lastKnownTool: saveConfig.activeTool,
    };
    document.updatedAt = new Date().toISOString();
    const editorState = cloneEditorState(controller.getState());
    const snapshotRequest = saveConfig.captureSnapshotRequest(document, editorState);
    const saveHistory = async (): Promise<{ ok: true } | { ok: false; error: string }> => {
      if (saveConfig.epochPersistence?.getState()) {
        const result = await saveConfig.epochPersistence.enqueue(document, editorState);
        return result.outcome === "conflict" ? { ok: false, error: result.code } : { ok: true };
      }
      if (saveConfig.saveDocument) return saveConfig.saveDocument(document);
      const result = saveConfig.revisionId
        ? await saveHammerRevisionHistoryDocument({
          workspaceId: saveConfig.workspaceId,
          workpieceId: saveConfig.workpieceId,
          revisionId: saveConfig.revisionId,
          historyPath: saveConfig.historyPath,
          document,
        })
        : await saveHammerHistoryDocument({ workpieceId: saveConfig.workpieceId, document });
      return result.ok ? { ok: true } : { ok: false, error: result.error };
    };
    if (saveGeneration !== generation) { receiptBatch.forEach((receipt) => receipt.settle({ state: "failed", error: "history_persistence_generation_changed" })); return; }
    const resultPromise = persistHammerHistorySaveBoundary({
      saveHistory,
      snapshotRequest,
      onHistorySaved: async (request) => {
        if (saveGeneration !== generation || saveConfig.revisionId) return;
        await saveConfig.onHistorySaved(request);
      },
    });
    await Promise.resolve(); if (saveGeneration === generation) config.setHistoryStatus("Saving canonical edit…");
    const result = await resultPromise;
    if (saveGeneration !== generation) { receiptBatch.forEach((receipt) => receipt.settle({ state: "failed", error: "history_persistence_generation_changed" })); return; }
    const persistenceResult: HammerMutationPersistenceResult = result.ok ? { state: "acknowledged" } : { state: "failed", error: result.error }; receiptBatch.forEach((receipt) => receipt.settle(persistenceResult));
    config.setHistoryStatus(result.ok ? null : `Unsaved canonical edit: ${result.error}`);
  };

  const schedulePersist = (immediate = false): void => {
    clearPersistTimer();
    if (immediate) {
      void persist();
      return;
    }
    persistTimer = setTimeout(() => {
      persistTimer = null;
      void persist();
    }, debounceMs);
  };

  const authority: HammerHistoryCommandAuthority = {
    configure(nextConfig) {
      config = nextConfig;
    },
    getController: () => controller,
    installController(nextController) {
      if (controller !== nextController) {
        clearPersistTimer(); generation += 1;
        pendingPersistenceReceipts.splice(0).forEach((receipt) => receipt.settle({ state: "failed", error: "history_controller_replaced" }));
      }
      controller = nextController;
    },
    installHydration(hydration, nextController, identity, baseMatch) {
      authority.installController(nextController);
      if (hydration.kind === "epoch_anchor" || hydration.kind === "epoch_head") config.epochPersistence?.install(hydration, identity, baseMatch);
      else config.epochPersistence?.clear();
    },
    getEpochPersistenceState: () => config.epochPersistence?.getState() ?? null,
    startHistoryEpoch: async (request, frozenState) => {
      if (!config.epochPersistence) return { outcome: "conflict", code: "history_epoch_authority_unavailable", terminal: true, retryable: false };
      const startGeneration = generation, canonicalState = cloneEditorState(frozenState ?? config.captureState());
      const started = await startAndHydrateHammerHistoryEpoch({ persistence: config.epochPersistence, request, canonicalState, maxUndoSteps: 100 });
      if (startGeneration !== generation) return { outcome: "conflict", code: "history_epoch_install_stale_generation", terminal: true, retryable: false };
      if (!started.hydration || !started.controller) return started.result;
      authority.installHydration(started.hydration, started.controller, { workspaceId: request.envelope.workspace_id,
        workpieceId: request.envelope.workpiece_id, canonicalRecordingId: request.envelope.canonical_recording_id,
        revisionId: request.envelope.recording_revision_id });
      return started.result;
    },
    applyMutation(args) {
      if (config.isTransitionPending?.()) return null;
      if (!controller) return null;
      const durableAfter = applyHammerHistoryCommandState({ liveBefore: config.captureState(), computeAfter: args.computeAfter, durableBefore: controller.getState(), normalize: config.normalizeState });
      if (!durableAfter) return null;
      const entry = controller.applyMutation({
        label: args.label,
        kind: args.kind,
        toolId: args.toolId,
        affectedSegmentIds: args.affectedSegments,
        affectedPlacementIds: args.affectedPlacementIds,
        transactionId: args.transactionId ?? null,
        allowCoalesce: args.allowCoalesce,
        coalesceWindowMs,
        nextState: durableAfter,
      });
      if (!entry) return null;
      const persistenceReceipt = createHammerMutationPersistenceReceipt(); pendingPersistenceReceipts.push(persistenceReceipt);
      config.applyState(controller.getState(), "history:mutation_apply");
      schedulePersist(args.immediatePersist === true);
      return attachHammerMutationPersistenceReceipt(entry, persistenceReceipt.promise);
    },
    undo() {
      if (config.isTransitionPending?.()) return;
      if (!controller) return;
      const entry = controller.undo();
      if (!entry) return;
      const transition = derivedLayerTransitions.get(entry.id);
      if (transition) config.setDerivedLayers(cloneHammerDerivedTextLayers(transition.before));
      config.onHistoryNavigation();
      config.applyState(controller.getState(), "history:undo");
      schedulePersist();
    },
    redo() {
      if (config.isTransitionPending?.()) return;
      if (!controller) return;
      const entry = controller.redo();
      if (!entry) return;
      const transition = derivedLayerTransitions.get(entry.id);
      if (transition) config.setDerivedLayers(cloneHammerDerivedTextLayers(transition.after));
      config.onHistoryNavigation();
      config.applyState(controller.getState(), "history:redo");
      schedulePersist();
    },
    createCheckpoint(label) {
      controller?.createCheckpoint(label);
    },
    installBaseline(state, derivedLayers) {
      baselineState = cloneEditorState(state);
      baselineDerivedLayers = cloneHammerDerivedTextLayers(derivedLayers);
      derivedLayerTransitions.clear();
    },
    updateBaselineState(state) {
      baselineState = cloneEditorState(state);
    },
    installDerivedLayerTransition(entryId, transition) {
      config.setDerivedLayers(cloneHammerDerivedTextLayers(transition.after));
      derivedLayerTransitions.set(entryId, {
        before: cloneHammerDerivedTextLayers(transition.before),
        after: cloneHammerDerivedTextLayers(transition.after),
        layerLabel: transition.layerLabel,
      });
    },
    getDerivedLayerTransition(entryId) {
      const transition = derivedLayerTransitions.get(entryId);
      return transition ? {
        before: cloneHammerDerivedTextLayers(transition.before),
        after: cloneHammerDerivedTextLayers(transition.after),
        layerLabel: transition.layerLabel,
      } : null;
    },
    jumpToEntry(entryId) {
      if (!baselineState) return null;
      if (!controller || !controller.document.entries.some((entry) => entry.id === entryId)) return null;
      const currentPath = [
        ...controller.document.undoStack,
        ...[...controller.document.redoStack].reverse(),
      ];
      const targetIndex = currentPath.indexOf(entryId);
      let undoStack: string[];
      if (targetIndex >= 0) {
        undoStack = currentPath.slice(0, targetIndex + 1);
      } else {
        const entries = new Map(controller.document.entries.map((entry) => [entry.id, entry]));
        const reversePath: string[] = [];
        const visited = new Set<string>();
        let cursor: string | null = entryId;
        while (cursor && !visited.has(cursor)) {
          const entry: HammerHistoryEntry | undefined = entries.get(cursor);
          if (!entry) break;
          reversePath.push(entry.id);
          visited.add(cursor);
          cursor = entry.parentEntryId;
        }
        undoStack = reversePath.reverse();
      }
      const redoStack = targetIndex >= 0 ? currentPath.slice(targetIndex + 1).reverse() : [];
      const replayed = controller.getReplayStateFromBaseline(baselineState, entryId);
      controller.document.undoStack = [...undoStack];
      controller.document.redoStack = [...redoStack];
      controller.document.headEntryId = entryId;
      controller.document.updatedAt = new Date().toISOString();
      controller.replaceState(replayed);
      config.applyState(replayed, "history:jump");
      config.setDerivedLayers(resolveDerivedLayers(undoStack));
      config.setHistoryStatus(redoStack.length > 0 ? "History jump mode: reviewing a past state." : null);
      config.onHistoryNavigation();
      schedulePersist();
      return { undoStack, hasRedo: redoStack.length > 0 };
    },
    restoreCurrentState() {
      if (!controller || controller.document.redoStack.length === 0) return false;
      controller.document.redoStack = [];
      controller.document.updatedAt = new Date().toISOString();
      schedulePersist(true);
      config.setHistoryStatus("Restored this state. Future history steps were cleared.");
      return true;
    },
    selectViewingLayer(layerId) {
      const transcript = config.getViewingTranscript();
      if (!transcript) return;
      const currentLayerId = transcript.derived_text_layers?.active_layer_id ?? null;
      if (currentLayerId === layerId) return;
      const withActiveLayer = setHammerDerivedTextLayerActive(transcript, layerId);
      const before = cloneHammerDerivedTextLayers(transcript.derived_text_layers);
      const after = cloneHammerDerivedTextLayers(withActiveLayer.derived_text_layers);
      const targetLayer = layerId
        ? listHammerDerivedTextLayers(withActiveLayer, { includeDiscarded: false })
          .find((layer) => layer.layer_id === layerId) ?? null
        : null;
      const layerLabel = targetLayer ? config.formatDerivedLayerLabel(targetLayer) : "Raw transcript";
      const entry = authority.applyMutation({
        label: targetLayer ? `Switch viewing layer to ${layerLabel}` : "Switch viewing layer to Raw transcript",
        kind: "editor_state_change",
        toolId: "polish",
        immediatePersist: true,
        computeAfter: (beforeState) => ({ ...beforeState, transcriptTimingHint: null }),
      });
      if (!entry) return;
      authority.installDerivedLayerTransition(entry.id, { before, after, layerLabel });
    },
    schedulePersist,
    clearPersistTimer,
    invalidate() {
      clearPersistTimer();
      generation += 1;
    },
  };
  return authority;
}

export function useHammerHistoryCommandAuthority(
  config: HammerHistoryCommandAuthorityConfig,
  debounceMs: number,
  coalesceWindowMs: number,
): HammerHistoryCommandAuthority {
  const authorityRef = useRef<HammerHistoryCommandAuthority | null>(null);
  if (!authorityRef.current) {
    authorityRef.current = createHammerHistoryCommandAuthority(config, debounceMs, coalesceWindowMs);
  }
  authorityRef.current.configure(config);
  return authorityRef.current;
}

type DerivedLayersState = HammerPersistedStructuredTranscript["derived_text_layers"];

export type DerivedLayerHistoryTransition = {
  before: DerivedLayersState;
  after: DerivedLayersState;
  layerLabel: string;
};

export type UseHammerWorkspaceShellHistoryControllerArgs = {
  launchContext: HammerLaunchContext;
  actualRecordingMismatchWarning: string | null;
  recordingRevisionId: string | null;
  recordingRevisionHistoryPath: string | null;
  recordingRevisionUpdatedAt: string | null; canonicalRecordingId: string | null;
  historyEpochComponentPaths: import("../lib/hammerHistoryEpochApi").HammerHistoryComponentPaths | null;
  setHistoryEpochStartCandidate: (candidate: HammerHistoryEpochStartCandidate | null) => void;
  setHistoryEpochArchivedNotice: (visible: boolean) => void;
  editorialAuthorityGraph: HammerEditorialAuthorityGraph | null;
  structuredTranscriptResetKey: string;
  visualTimelineResetKey: string;
  transcriptSourceId: string;
  previewMode: HammerPreviewMode;
  audioEdit: HammerPersistedAudioEdit | null;
  maxUndoSteps: number;
  playheadSec: number;
  selectedSegmentId: string | null;
  transcriptSegments: HammerTranscriptSegment[];
  structuredTranscript: HammerPersistedStructuredTranscript | null;
  visualPlacements: HammerPersistedVisualPlacements | null;
  visualTimeline: HammerVisualTimelineState | null; legacyHashVisualTimeline: HammerVisualTimelineState | null;
  historyAuthority: HammerHistoryCommandAuthority;
  snapshotAuthority: HammerWorkspaceShellSnapshotAuthority;
  applyWorkspaceState: (state: HammerEditorStateSerializable, reason?: string) => void;
  setHistoryStatus: (status: string | null) => void;
  toErrorMessage: (error: unknown, fallback: string) => string;

  setTimelineMarkers: (markers: Array<{ id: string; label: string; timeSec: number }>) => void;
  setSelectedClipId: (clipId: string | null) => void;
  setImagePlacementDraftWindows: (value: any) => void;
  setTimelineImageDragState: (value: any) => void;
  setImagePlacementTransforms: (value: any) => void;
  setPreviewCanvasDragState: (value: any) => void;
  setImageAnimationContextMenu: (value: any) => void;
  setEditableDerivedTextLayers: (value: DerivedLayersState) => void;
  setCaptionBuildState: (value: any) => void;
  setCaptionEditedState: (value: any) => void;
  setActiveCaptionArtifactMode: (value: any) => void;
  setAudioFinalizationCompareMode: (value: any) => void;
  setPackagingLogoAssetPath: (value: string | null) => void;
  setPackagingLogoPosition: (value: any) => void;
  setPackagingLogoSize: (value: any) => void;
  setCaptionBuildFeedback: (value: any) => void;

  createFallbackEditPlan: (
    launchContext: HammerLaunchContext,
    transcriptSourceId: string,
    previewMode: HammerPreviewMode,
  ) => HammerEditPlan;
  resolveOutputSelectionFromTranscript: (structured: HammerPersistedStructuredTranscript | null) => HammerOutputSelectionState;
  toEditorState: (args: {
    segments: HammerTranscriptSegment[];
    visualPlacements: HammerPersistedVisualPlacements | null;
    visualTimeline: HammerVisualTimelineState | null;
    audioEdit: HammerPersistedAudioEdit | null;
    studioRack: ReturnType<typeof createDefaultHammerStudioRackState>;
    editorialAuthorityGraph: ReturnType<typeof projectEditorialAuthorityGraphFromEditPlan>;
    outputSelection: HammerOutputSelectionState;
    selectedSegmentId: string | null;
    playheadSec: number;
    transcriptTimingHint: string | null;
  }) => HammerEditorStateSerializable;
  cloneHammerDerivedTextLayers: (value: DerivedLayersState) => DerivedLayersState;
};

export function resolveBaselineAuthorityGraph(args: {
  persistedEditorialAuthorityGraph: HammerEditorialAuthorityGraph | null;
  projectedAuthorityGraph: HammerEditorialAuthorityGraph;
}): HammerEditorialAuthorityGraph {
  if (args.persistedEditorialAuthorityGraph) {
    return cloneHammerEditorialAuthorityGraph(args.persistedEditorialAuthorityGraph);
  }
  return args.projectedAuthorityGraph;
}

export function useHammerWorkspaceShellHistoryController(args: UseHammerWorkspaceShellHistoryControllerArgs): void {
  useEffect(() => {
    let active = true;
    args.historyAuthority.invalidate();
    args.setHistoryEpochStartCandidate(null);
    args.setHistoryEpochArchivedNotice(false);
    args.snapshotAuthority.reset();

    const synced = syncEditableTranscriptSegments(args.transcriptSegments, args.selectedSegmentId);
    const baselineOutputSelection = args.resolveOutputSelectionFromTranscript(args.structuredTranscript ?? null);
    const baselineEditPlan = args.launchContext.edit_plan
      ? {
        ...args.launchContext.edit_plan,
        instructions: args.launchContext.edit_plan.instructions.map((instruction) => ({ ...instruction })),
      }
      : args.createFallbackEditPlan(args.launchContext, args.transcriptSourceId, args.previewMode);
    const projectedBaselineAuthorityGraph = projectEditorialAuthorityGraphFromEditPlan({
      editPlan: baselineEditPlan,
      workspaceId: args.launchContext.workspace_id,
      workpieceId: args.launchContext.workpiece_id,
      sessionId: args.launchContext.session_id ?? baselineEditPlan.session_id ?? `${args.launchContext.workpiece_id}:session`,
    });
    const baselineAuthorityGraph = resolveBaselineAuthorityGraph({
      persistedEditorialAuthorityGraph: args.editorialAuthorityGraph,
      projectedAuthorityGraph: projectedBaselineAuthorityGraph,
    });
    const previousTimeline = args.historyAuthority.getController()?.getState().visualTimeline ?? null;
    const protectedTimeline = preservePlacementRichTimelineDuringHydration({
      previous: previousTimeline,
      incoming: args.visualTimeline ?? null,
    });
    const baselineState = args.toEditorState({
      segments: synced.segments,
      visualPlacements: args.visualPlacements ?? null,
      visualTimeline: protectedTimeline.timeline,
      audioEdit: args.audioEdit ?? null,
      studioRack: createDefaultHammerStudioRackState(),
      editorialAuthorityGraph: baselineAuthorityGraph,
      outputSelection: baselineOutputSelection,
      selectedSegmentId: synced.selectedSegmentId,
      playheadSec: Math.max(0, Math.min(args.playheadSec, resolveTranscriptDurationSec(synced.segments))),
      transcriptTimingHint: null,
    });
    args.historyAuthority.installBaseline(
      baselineState,
      args.cloneHammerDerivedTextLayers(args.structuredTranscript?.derived_text_layers),
    );
    const baseRevisionId = hashEditorState(baselineState);
    const legacyBaselineState = reconstructLegacyEditorStateHashInput(baselineState, args.legacyHashVisualTimeline);

    args.historyAuthority.installController(createHammerHistoryController({
      document: createHammerHistoryDocument({
        workpieceId: args.launchContext.workpiece_id,
        sessionId: args.launchContext.session_id ?? `${args.launchContext.workpiece_id}:session`,
        baseRevisionId,
      }),
      initialState: baselineState,
      maxUndoSteps: args.maxUndoSteps,
    }));

    if (protectedTimeline.reason === "preserved_anchor_rich_timeline") {
      console.debug("[hammer][hydration] preserved placement-rich timeline during baseline init", {
        workpieceId: args.launchContext.workpiece_id,
        previous: buildVisualTimelineDiagnostics(previousTimeline),
        incoming: buildVisualTimelineDiagnostics(args.visualTimeline ?? null),
        applied: buildVisualTimelineDiagnostics(protectedTimeline.timeline),
      });
    }
    args.applyWorkspaceState(baselineState, "history:baseline_init");
    args.setTimelineMarkers([]);
    args.setSelectedClipId(null);
    args.setImagePlacementDraftWindows({});
    args.setTimelineImageDragState(null);
    args.setImagePlacementTransforms({});
    args.setPreviewCanvasDragState(null);
    args.setImageAnimationContextMenu(null);
    args.setEditableDerivedTextLayers(args.cloneHammerDerivedTextLayers(args.structuredTranscript?.derived_text_layers));
    args.setCaptionBuildState(null);
    args.setCaptionEditedState(null);
    args.setActiveCaptionArtifactMode("built");
    args.setAudioFinalizationCompareMode("after");
    args.setPackagingLogoAssetPath(null);
    args.setPackagingLogoPosition("top_right");
    args.setPackagingLogoSize("medium");
    args.setCaptionBuildFeedback(null);

    if (args.actualRecordingMismatchWarning) {
      args.setHistoryStatus("Actual recording mismatch detected. Opened baseline without replay.");
      return () => {
        active = false;
        args.historyAuthority.invalidate();
      };
    }

    void (async () => {
      const revisionId = args.recordingRevisionId ?? null;
      const historyResult = revisionId
        ? args.recordingRevisionHistoryPath
          ? args.recordingRevisionUpdatedAt && args.canonicalRecordingId
            ? await loadHammerRevisionHistoryHydration({ workspaceId: args.launchContext.workspace_id,
              workpieceId: args.launchContext.workpiece_id, canonicalRecordingId: args.canonicalRecordingId,
              revisionId, historyPath: args.recordingRevisionHistoryPath, revisionUpdatedAt: args.recordingRevisionUpdatedAt })
            : { ok: false as const, status: 409, classification: "identity_conflict" as const, error: "Revision identity tokens are unavailable." }
          : { ok: true as const, status: 200, exists: false, data: null as null }
        : await loadHammerHistoryDocument(args.launchContext.workpiece_id);
      const snapshotManifestResult = await args.snapshotAuthority.loadManifest(
        args.launchContext.workpiece_id,
        revisionId,
      );
      const historyPresenceResult = revisionId
        ? { ok: true as const, status: 200, exists: true, data: null as { version: number } | null }
        : await loadHammerHistoryPresence(args.launchContext.workpiece_id);
      if (!active) return;

      let snapshotRecoveryStatus: string | null = null;
      snapshotRecoveryStatus = snapshotManifestResult.status;

      if (!historyResult.ok) {
        if (revisionId && args.recordingRevisionHistoryPath) args.historyAuthority.installController(null);
        args.setHistoryStatus(historyResult.error);
        return;
      }
      const snapshotManifestExists = snapshotManifestResult.ok && snapshotManifestResult.exists;
      const historyPresenceSentinelExists = historyPresenceResult.ok
        ? historyPresenceResult.exists
        : true; // unknown -> do not suppress warnings
      const hydration = "hydration" in historyResult ? historyResult.hydration : null;
      args.setHistoryEpochArchivedNotice(hydration?.kind === "epoch_anchor" || hydration?.kind === "epoch_head");
      const historyData = hydration?.document ?? ("data" in historyResult ? historyResult.data : null);
      const historyExists = Boolean(hydration) || ("exists" in historyResult && historyResult.exists && Boolean(historyData));
      if (!historyExists) {
        args.setHistoryStatus(resolveHammerHistoryStatus({
          historyExists: false,
          snapshotManifestExists,
          historyPresenceSentinelExists,
          snapshotRecoveryStatus,
        }));
        return;
      }

      const loaded = normalizeHammerHistoryDocument(historyData, {
        workpieceId: args.launchContext.workpiece_id,
        sessionId: args.launchContext.session_id ?? `${args.launchContext.workpiece_id}:session`,
        baseRevisionId,
      });

      let replayBaselineState = baselineState;
      const epochBaseVerification = hydration?.kind === "epoch_anchor"
        ? await verifyEpochAnchorBaseHash({ expectedHash: loaded.baseRevisionId, canonicalState: baselineState,
          legacyReconstruction: legacyBaselineState, workpieceId: args.launchContext.workpiece_id,
          componentPaths: args.historyEpochComponentPaths, componentHashes: hydration.epoch.base.component_sha256 })
        : null;
      if (epochBaseVerification && !epochBaseVerification.ok) {
        args.historyAuthority.installController(null); args.setHistoryStatus(epochBaseVerification.error); return;
      }
      if (hydration?.kind !== "epoch_anchor" && loaded.baseRevisionId !== baseRevisionId) {
        try {
          replayBaselineState = verifyHammerHistoryAgainstCanonicalHead({ document: loaded, canonicalHead: projectHammerHistoryOwnedSessionHead({ document: loaded, canonicalHead: baselineState }),
            legacyCanonicalHeadReconstruction: legacyBaselineState,
            canonicalBaseHash: hydration?.kind === "epoch_head" ? hydration.base.canonical_editor_state_hash ?? null : null }).baseline;
          args.historyAuthority.updateBaselineState(replayBaselineState);
        } catch (error) {
          const code = error instanceof HammerHistoryVerificationError
            ? error.code
            : "history_current_head_mismatch";
          args.historyAuthority.installController(null);
          args.setHistoryStatus(`History verification failed (${code}). Canonical history was not installed.`);
          if (hydration?.kind === "legacy_history" && hydration.registry && args.recordingRevisionUpdatedAt && args.canonicalRecordingId && args.historyEpochComponentPaths) args.setHistoryEpochStartCandidate({
            workspaceId: args.launchContext.workspace_id, workpieceId: args.launchContext.workpiece_id,
            canonicalRecordingId: args.canonicalRecordingId, revisionId: revisionId!, revisionUpdatedAt: args.recordingRevisionUpdatedAt,
            historyPath: hydration.pointer, registry: hydration.registry, canonicalBaseHash: baseRevisionId,
            canonicalState: cloneEditorState(baselineState), componentPaths: args.historyEpochComponentPaths,
          });
          return;
        }
      }

      const controller = createHammerHistoryController({
        document: loaded,
        initialState: replayBaselineState,
        maxUndoSteps: args.maxUndoSteps,
      });
      let replayed = controller.getReplayStateFromBaseline(replayBaselineState);

      const snapshotRecovery = await args.snapshotAuthority.recover({
        workpieceId: args.launchContext.workpiece_id,
        baseRevisionId,
        historyDocument: loaded,
        controller,
        fallbackState: replayed,
      });
      if (!active) return;
      replayed = snapshotRecovery.state;
      snapshotRecoveryStatus = snapshotRecovery.status ?? snapshotRecoveryStatus;

      controller.replaceState(replayed);
      if (hydration && revisionId && args.canonicalRecordingId) args.historyAuthority.installHydration(hydration, controller, {
        workspaceId: args.launchContext.workspace_id, workpieceId: args.launchContext.workpiece_id,
        canonicalRecordingId: args.canonicalRecordingId, revisionId,
      }, epochBaseVerification?.ok && epochBaseVerification.match.algorithm ? { canonicalHash: epochBaseVerification.match.canonicalHash, algorithm: epochBaseVerification.match.algorithm } : undefined);
      else args.historyAuthority.installController(controller);
      args.applyWorkspaceState(replayed, "history:replay_apply");
      args.setHistoryStatus(resolveHammerHistoryStatus({
        historyExists: true,
        snapshotManifestExists,
        historyPresenceSentinelExists,
        snapshotRecoveryStatus,
      }));
    })().catch((error) => {
      if (!active) return;
      args.setHistoryStatus(args.toErrorMessage(error, "Hammer could not recover persistent history."));
    });

    return () => {
      active = false;
      args.historyAuthority.invalidate();
    };
  }, [
    args.actualRecordingMismatchWarning,
    args.launchContext.workpiece_id,
    args.recordingRevisionId,
    args.recordingRevisionHistoryPath,
    args.recordingRevisionUpdatedAt,
    args.canonicalRecordingId,
    args.structuredTranscriptResetKey,
    args.transcriptSourceId,
    args.visualTimelineResetKey,
    args.legacyHashVisualTimeline,
  ]);
}
