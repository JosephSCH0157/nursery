import { useEffect } from "react";
import type { HammerLaunchContext } from "../../../../packages/contracts/hammer/launch-context.contract";
import type { HammerPreviewMode } from "../../../../packages/contracts/hammer/edit-plan.contract";
import type { HammerTranscriptSegment } from "../../../../packages/contracts/hammer/transcript.contract";
import type {
  HammerPersistedAudioEdit,
  HammerPersistedStructuredTranscript,
  HammerPersistedVisualPlacements,
} from "../persistence/hammerPersistenceContract";
import type { HammerVisualTimelineState } from "../visuals/model/hammerVisualTypes";
import {
  createHammerHistoryController,
  createHammerHistoryDocument,
  hashEditorState,
  normalizeHammerHistoryDocument,
  cloneEditorState,
  type HammerEditorStateSerializable,
  type HammerHistoryController,
} from "./hammerWorkspaceHistory";
import { syncEditableTranscriptSegments, resolveTranscriptDurationSec } from "./hammerWorkspaceTranscript";
import { createDefaultHammerStudioRackState } from "./hammerStudioRack";
import { projectEditorialAuthorityGraphFromEditPlan } from "./hammerRenderAssembly";
import { resolveActiveSnapshotHeadEntryId } from "./hammerSnapshotProduction";
import { resolveHammerHistoryStatus } from "../lib/hammerHistoryStatus";
import {
  loadHammerHistoryDocument,
  loadHammerHistoryPresence,
  loadHammerRevisionHistoryDocument,
} from "../lib/hammerHistoryArtifactApi";
import {
  loadHammerSnapshotManifest,
  loadHammerSnapshotPayload,
  type HammerSnapshotManifestV1,
} from "../lib/hammerSnapshotArtifactApi";

type DerivedLayersState = HammerPersistedStructuredTranscript["derived_text_layers"];

export type UseHammerWorkspaceShellHistoryControllerArgs = {
  launchContext: HammerLaunchContext;
  recordingRevisionId: string | null;
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
  visualTimeline: HammerVisualTimelineState | null;

  clearPersistTimer: () => void;

  snapshotManifestRef: { current: HammerSnapshotManifestV1 | null };
  lastSnapshottedHeadEntryIdRef: { current: string | null };
  historyBaselineStateRef: { current: HammerEditorStateSerializable | null };
  baselineDerivedLayersRef: { current: DerivedLayersState };
  historyControllerRef: { current: HammerHistoryController | null };
  derivedLayerHistoryRef: { current: Map<string, { before: DerivedLayersState; after: DerivedLayersState }> };

  applyWorkspaceState: (state: HammerEditorStateSerializable) => void;
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
  ) => any;
  resolveOutputSelectionFromTranscript: (structured: HammerPersistedStructuredTranscript | null) => any;
  toEditorState: (args: {
    segments: HammerTranscriptSegment[];
    visualPlacements: HammerPersistedVisualPlacements | null;
    visualTimeline: HammerVisualTimelineState | null;
    audioEdit: HammerPersistedAudioEdit | null;
    studioRack: ReturnType<typeof createDefaultHammerStudioRackState>;
    editorialAuthorityGraph: ReturnType<typeof projectEditorialAuthorityGraphFromEditPlan>;
    outputSelection: any;
    selectedSegmentId: string | null;
    playheadSec: number;
    transcriptTimingHint: string | null;
  }) => HammerEditorStateSerializable;
  cloneHammerDerivedTextLayers: (value: any) => DerivedLayersState;
};

export function useHammerWorkspaceShellHistoryController(args: UseHammerWorkspaceShellHistoryControllerArgs): void {
  useEffect(() => {
    let active = true;
    args.clearPersistTimer();
    args.snapshotManifestRef.current = null;
    args.lastSnapshottedHeadEntryIdRef.current = null;

    const synced = syncEditableTranscriptSegments(args.transcriptSegments, args.selectedSegmentId);
    const baselineOutputSelection = args.resolveOutputSelectionFromTranscript(args.structuredTranscript ?? null);
    const baselineEditPlan = args.launchContext.edit_plan
      ? {
        ...args.launchContext.edit_plan,
        instructions: args.launchContext.edit_plan.instructions.map((instruction) => ({ ...instruction })),
      }
      : args.createFallbackEditPlan(args.launchContext, args.transcriptSourceId, args.previewMode);
    const baselineAuthorityGraph = projectEditorialAuthorityGraphFromEditPlan({
      editPlan: baselineEditPlan,
      workspaceId: args.launchContext.workspace_id,
      workpieceId: args.launchContext.workpiece_id,
      sessionId: args.launchContext.session_id ?? baselineEditPlan.session_id ?? `${args.launchContext.workpiece_id}:session`,
    });
    const baselineState = args.toEditorState({
      segments: synced.segments,
      visualPlacements: args.visualPlacements ?? null,
      visualTimeline: args.visualTimeline ?? null,
      audioEdit: args.audioEdit ?? null,
      studioRack: createDefaultHammerStudioRackState(),
      editorialAuthorityGraph: baselineAuthorityGraph,
      outputSelection: baselineOutputSelection,
      selectedSegmentId: synced.selectedSegmentId,
      playheadSec: Math.max(0, Math.min(args.playheadSec, resolveTranscriptDurationSec(synced.segments))),
      transcriptTimingHint: null,
    });
    args.historyBaselineStateRef.current = cloneEditorState(baselineState);
    args.baselineDerivedLayersRef.current = args.cloneHammerDerivedTextLayers(args.structuredTranscript?.derived_text_layers);
    const baseRevisionId = hashEditorState(baselineState);

    args.historyControllerRef.current = createHammerHistoryController({
      document: createHammerHistoryDocument({
        workpieceId: args.launchContext.workpiece_id,
        sessionId: args.launchContext.session_id ?? `${args.launchContext.workpiece_id}:session`,
        baseRevisionId,
      }),
      initialState: baselineState,
      maxUndoSteps: args.maxUndoSteps,
    });

    args.applyWorkspaceState(baselineState);
    args.setTimelineMarkers([]);
    args.setSelectedClipId(null);
    args.setImagePlacementDraftWindows({});
    args.setTimelineImageDragState(null);
    args.setImagePlacementTransforms({});
    args.setPreviewCanvasDragState(null);
    args.setImageAnimationContextMenu(null);
    args.setEditableDerivedTextLayers(args.cloneHammerDerivedTextLayers(args.structuredTranscript?.derived_text_layers));
    args.derivedLayerHistoryRef.current.clear();
    args.setCaptionBuildState(null);
    args.setCaptionEditedState(null);
    args.setActiveCaptionArtifactMode("built");
    args.setAudioFinalizationCompareMode("after");
    args.setPackagingLogoAssetPath(null);
    args.setPackagingLogoPosition("top_right");
    args.setPackagingLogoSize("medium");
    args.setCaptionBuildFeedback(null);

    void (async () => {
      const revisionId = args.recordingRevisionId ?? null;
      const historyResult = revisionId
        ? await loadHammerRevisionHistoryDocument({
          workpieceId: args.launchContext.workpiece_id,
          revisionId,
        })
        : await loadHammerHistoryDocument(args.launchContext.workpiece_id);
      const snapshotManifestResult = revisionId
        ? { ok: true as const, status: 200, exists: false, data: null as HammerSnapshotManifestV1 | null }
        : await loadHammerSnapshotManifest(args.launchContext.workpiece_id);
      const historyPresenceResult = revisionId
        ? { ok: true as const, status: 200, exists: true, data: null as { version: number } | null }
        : await loadHammerHistoryPresence(args.launchContext.workpiece_id);
      if (!active) return;

      let snapshotRecoveryStatus: string | null = null;
      if (!snapshotManifestResult.ok) {
        args.snapshotManifestRef.current = null;
        args.lastSnapshottedHeadEntryIdRef.current = null;
        snapshotRecoveryStatus = "Snapshot fallback: manifest unavailable. Opened with full history replay.";
      } else {
        args.snapshotManifestRef.current = snapshotManifestResult.exists ? (snapshotManifestResult.data ?? null) : null;
        args.lastSnapshottedHeadEntryIdRef.current = resolveActiveSnapshotHeadEntryId(args.snapshotManifestRef.current);
      }

      if (!historyResult.ok) {
        args.setHistoryStatus(historyResult.error);
        return;
      }
      const snapshotManifestExists = snapshotManifestResult.ok && snapshotManifestResult.exists;
      const historyPresenceSentinelExists = historyPresenceResult.ok
        ? historyPresenceResult.exists
        : true; // unknown -> do not suppress warnings
      const historyExists = historyResult.exists && Boolean(historyResult.data);
      if (!historyExists) {
        args.setHistoryStatus(resolveHammerHistoryStatus({
          historyExists: false,
          snapshotManifestExists,
          historyPresenceSentinelExists,
          snapshotRecoveryStatus,
        }));
        return;
      }

      const loaded = normalizeHammerHistoryDocument(historyResult.data, {
        workpieceId: args.launchContext.workpiece_id,
        sessionId: args.launchContext.session_id ?? `${args.launchContext.workpiece_id}:session`,
        baseRevisionId,
      });

      let replayBaselineState = baselineState;
      if (loaded.baseRevisionId !== baseRevisionId) {
        const legacyNowIso = loaded.createdAt || loaded.updatedAt;
        const legacyAuthorityGraph = legacyNowIso
          ? projectEditorialAuthorityGraphFromEditPlan({
            editPlan: baselineEditPlan,
            workspaceId: args.launchContext.workspace_id,
            workpieceId: args.launchContext.workpiece_id,
            sessionId: args.launchContext.session_id ?? baselineEditPlan.session_id ?? `${args.launchContext.workpiece_id}:session`,
            nowIso: legacyNowIso,
          })
          : null;
        if (legacyAuthorityGraph && legacyNowIso) {
          const legacyBaselineState = args.toEditorState({
            segments: synced.segments,
            visualPlacements: args.visualPlacements ?? null,
            visualTimeline: args.visualTimeline ?? null,
            audioEdit: args.audioEdit ?? null,
            studioRack: createDefaultHammerStudioRackState(),
            editorialAuthorityGraph: legacyAuthorityGraph,
            outputSelection: baselineOutputSelection,
            selectedSegmentId: synced.selectedSegmentId,
            playheadSec: Math.max(0, Math.min(args.playheadSec, resolveTranscriptDurationSec(synced.segments))),
            transcriptTimingHint: null,
          });
          const legacyBaseRevisionId = hashEditorState(legacyBaselineState);
          if (loaded.baseRevisionId === legacyBaseRevisionId) {
            replayBaselineState = legacyBaselineState;
            args.historyBaselineStateRef.current = cloneEditorState(legacyBaselineState);
          } else {
            args.setHistoryStatus("History base revision mismatch detected. Opened baseline without replay.");
            return;
          }
        } else {
          args.setHistoryStatus("History base revision mismatch detected. Opened baseline without replay.");
          return;
        }
      }

      const controller = createHammerHistoryController({
        document: loaded,
        initialState: replayBaselineState,
        maxUndoSteps: args.maxUndoSteps,
      });
      let replayed = controller.getReplayStateFromBaseline(replayBaselineState);

      const manifest = args.snapshotManifestRef.current;
      const activeSnapshotRef = manifest?.activeSnapshotRef ?? null;
      if (activeSnapshotRef) {
        const activeSnapshotEntry = manifest?.snapshots.find((entry) => entry.snapshotRef === activeSnapshotRef) ?? null;
        if (!activeSnapshotEntry) {
          snapshotRecoveryStatus = "Snapshot fallback: active snapshot missing from manifest. Opened with full history replay.";
        } else {
          const snapshotPayloadResult = await loadHammerSnapshotPayload({
            workpieceId: args.launchContext.workpiece_id,
            snapshotRef: activeSnapshotRef,
          });
          if (!active) return;
          if (!snapshotPayloadResult.ok) {
            snapshotRecoveryStatus = "Snapshot fallback: payload unavailable. Opened with full history replay.";
          } else if (!snapshotPayloadResult.exists || !snapshotPayloadResult.data) {
            snapshotRecoveryStatus = "Snapshot fallback: payload missing. Opened with full history replay.";
          } else {
            const snapshot = snapshotPayloadResult.data;
            const workpieceMatches = snapshot.workpieceId === args.launchContext.workpiece_id;
            const baseRevisionMatches = snapshot.baseRevisionId === baseRevisionId;
            const headExistsInLedger = snapshot.headEntryId == null || loaded.undoStack.includes(snapshot.headEntryId);
            if (!workpieceMatches || !baseRevisionMatches || !headExistsInLedger) {
              const reason = !workpieceMatches
                ? "workpiece mismatch"
                : !baseRevisionMatches
                ? "base revision mismatch"
                : "snapshot head not found in ledger";
              snapshotRecoveryStatus = `Snapshot fallback: ${reason}. Opened with full history replay.`;
            } else {
              replayed = controller.getReplayStateFromBaseline(
                snapshot.editorState,
                snapshot.headEntryId,
              );
              snapshotRecoveryStatus = null;
            }
          }
        }
      }

      controller.replaceState(replayed);
      args.historyControllerRef.current = controller;
      args.applyWorkspaceState(replayed);
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
      args.clearPersistTimer();
    };
  }, [
    args.launchContext.workpiece_id,
    args.recordingRevisionId,
    args.structuredTranscriptResetKey,
    args.transcriptSourceId,
    args.visualTimelineResetKey,
  ]);
}
