import { useLayoutEffect, useRef, useState } from "react";
import type { HammerLaunchContext } from "../../../../packages/contracts/hammer/launch-context.contract";
import type { HammerEditPlan, HammerPreviewMode } from "../../../../packages/contracts/hammer/edit-plan.contract";
import type { HammerEditorialAuthorityGraph } from "../../../../packages/contracts/hammer/editorial-authority.contract";
import type { MediaRef, WorkspaceMediaMapping } from "../../../../packages/contracts/hammer/media-resolver.contract";
import type { HammerTranscriptSegment } from "../../../../packages/contracts/hammer/transcript.contract";
import type { HammerPlacementOutboundDiagnostics, HammerWorkspaceSnapshot } from "./hammerWorkspaceSnapshot";
import { HAMMER_PASS_ORDER_VERSION } from "../persistence/hammerPersistenceContract";
import type {
  HammerPassId,
  HammerPassStatusMap,
  HammerPersistedAudioPolish,
  HammerPersistedStructuredTranscript,
  HammerPersistedVisualPlacements,
  HammerPersistedVisualPreviewSettings,
} from "../persistence/hammerPersistenceContract";
import type { HammerVisualTimelineState } from "../visuals/model/hammerVisualTypes";
import { deriveLegacyVisualPlacementsFromTimeline } from "../visuals/persistence/hammerVisualTimelineLegacyAdapter";
import { createSemanticEditPlanSignature } from "../lib/editPlanSignature";
import { projectEditPlanFromEditorialAuthorityGraph } from "./hammerRenderAssembly";
import type { HammerHistoryPostSaveSnapshotRequest } from "./hammerWorkspaceShellHistoryController";
import type {
  HammerEditorStateSerializable,
  HammerHistoryController,
  HammerHistoryDocumentV1,
} from "./hammerWorkspaceHistory";
import {
  loadHammerSnapshotManifest,
  loadHammerSnapshotPayload,
  saveHammerSnapshotManifest,
  saveHammerSnapshotPayload,
  type HammerSnapshotManifestV1,
} from "../lib/hammerSnapshotArtifactApi";
import {
  buildHammerHistorySnapshot,
  resolveActiveSnapshotHeadEntryId,
  shouldCreateHammerSnapshot,
  upsertHammerSnapshotManifest,
} from "./hammerSnapshotProduction";

export type HammerSnapshotRecoveryResult = {
  state: HammerEditorStateSerializable;
  status: string | null;
};

export interface HammerWorkspaceShellSnapshotAuthority {
  reset(): void;
  loadManifest(workpieceId: string, revisionId: string | null): Promise<{
    ok: boolean;
    exists: boolean;
    status: string | null;
  }>;
  recover(args: {
    workpieceId: string;
    baseRevisionId: string;
    historyDocument: HammerHistoryDocumentV1;
    controller: HammerHistoryController;
    fallbackState: HammerEditorStateSerializable;
  }): Promise<HammerSnapshotRecoveryResult>;
  produce(request: HammerHistoryPostSaveSnapshotRequest): Promise<void>;
}

type SnapshotAuthorityDependencies = {
  loadManifest: typeof loadHammerSnapshotManifest;
  loadPayload: typeof loadHammerSnapshotPayload;
  savePayload: typeof saveHammerSnapshotPayload;
  saveManifest: typeof saveHammerSnapshotManifest;
  warn: typeof console.warn;
};

export function createHammerWorkspaceShellSnapshotAuthority(
  dependencies: Partial<SnapshotAuthorityDependencies> = {},
): HammerWorkspaceShellSnapshotAuthority {
  const deps: SnapshotAuthorityDependencies = {
    loadManifest: dependencies.loadManifest ?? loadHammerSnapshotManifest,
    loadPayload: dependencies.loadPayload ?? loadHammerSnapshotPayload,
    savePayload: dependencies.savePayload ?? saveHammerSnapshotPayload,
    saveManifest: dependencies.saveManifest ?? saveHammerSnapshotManifest,
    warn: dependencies.warn ?? console.warn,
  };
  let manifest: HammerSnapshotManifestV1 | null = null;
  let lastSnapshottedHeadEntryId: string | null = null;
  let generation = 0;
  let requestOrdinal = 0;
  const inFlightHeads = new Set<string>();

  return {
    reset() {
      generation += 1;
      requestOrdinal = 0;
      manifest = null;
      lastSnapshottedHeadEntryId = null;
      inFlightHeads.clear();
    },
    async loadManifest(workpieceId, revisionId) {
      const loadGeneration = generation;
      const result = revisionId
        ? { ok: true as const, status: 200, exists: false, data: null as HammerSnapshotManifestV1 | null }
        : await deps.loadManifest(workpieceId);
      if (loadGeneration !== generation) return { ok: false, exists: false, status: null };
      if (!result.ok) {
        manifest = null;
        lastSnapshottedHeadEntryId = null;
        return {
          ok: false,
          exists: false,
          status: "Snapshot fallback: manifest unavailable. Opened with full history replay.",
        };
      }
      manifest = result.exists ? (result.data ?? null) : null;
      lastSnapshottedHeadEntryId = resolveActiveSnapshotHeadEntryId(manifest);
      return { ok: true, exists: result.exists, status: null };
    },
    async recover(args) {
      const recoveryGeneration = generation;
      const activeSnapshotRef = manifest?.activeSnapshotRef ?? null;
      if (!activeSnapshotRef) return { state: args.fallbackState, status: null };
      const activeSnapshotEntry = manifest?.snapshots.find((entry) => entry.snapshotRef === activeSnapshotRef) ?? null;
      if (!activeSnapshotEntry) {
        return {
          state: args.fallbackState,
          status: "Snapshot fallback: active snapshot missing from manifest. Opened with full history replay.",
        };
      }
      const result = await deps.loadPayload({ workpieceId: args.workpieceId, snapshotRef: activeSnapshotRef });
      if (recoveryGeneration !== generation) return { state: args.fallbackState, status: null };
      if (!result.ok) {
        return { state: args.fallbackState, status: "Snapshot fallback: payload unavailable. Opened with full history replay." };
      }
      if (!result.exists || !result.data) {
        return { state: args.fallbackState, status: "Snapshot fallback: payload missing. Opened with full history replay." };
      }
      const snapshot = result.data;
      const workpieceMatches = snapshot.workpieceId === args.workpieceId;
      const baseRevisionMatches = snapshot.baseRevisionId === args.baseRevisionId;
      const headExistsInLedger = snapshot.headEntryId == null || args.historyDocument.undoStack.includes(snapshot.headEntryId);
      if (!workpieceMatches || !baseRevisionMatches || !headExistsInLedger) {
        const reason = !workpieceMatches
          ? "workpiece mismatch"
          : !baseRevisionMatches
          ? "base revision mismatch"
          : "snapshot head not found in ledger";
        return { state: args.fallbackState, status: `Snapshot fallback: ${reason}. Opened with full history replay.` };
      }
      return {
        state: args.controller.getReplayStateFromBaseline(snapshot.editorState, snapshot.headEntryId),
        status: null,
      };
    },
    async produce(request) {
      const productionGeneration = generation;
      const headKey = request.headEntryId ?? "<baseline>";
      if (inFlightHeads.has(headKey)) return;
      const eligible = shouldCreateHammerSnapshot({
        undoDepth: request.undoDepth,
        headEntryId: request.headEntryId,
        lastSnapshottedHeadEntryId,
      });
      if (!eligible) return;
      const ordinal = ++requestOrdinal;
      inFlightHeads.add(headKey);
      try {
        const snapshot = buildHammerHistorySnapshot({ ...request });
        const payloadSaved = await deps.savePayload({ workpieceId: request.workpieceId, snapshot });
        if (productionGeneration !== generation) return;
        if (!payloadSaved.ok) {
          deps.warn("Hammer snapshot payload write skipped", {
            workpieceId: request.workpieceId,
            status: payloadSaved.status,
            error: payloadSaved.error,
          });
          return;
        }
        if (ordinal !== requestOrdinal) return;
        const nextManifest = upsertHammerSnapshotManifest({ manifest, workpieceId: request.workpieceId, snapshot });
        const manifestSaved = await deps.saveManifest({ workpieceId: request.workpieceId, manifest: nextManifest });
        if (productionGeneration !== generation || ordinal !== requestOrdinal) return;
        if (!manifestSaved.ok) {
          deps.warn("Hammer snapshot manifest write skipped", {
            workpieceId: request.workpieceId,
            status: manifestSaved.status,
            error: manifestSaved.error,
          });
          return;
        }
        manifest = manifestSaved.data ?? nextManifest;
        lastSnapshottedHeadEntryId = resolveActiveSnapshotHeadEntryId(manifest);
      } finally {
        inFlightHeads.delete(headKey);
      }
    },
  };
}

export function useHammerSnapshotImmediatePersistenceSignal(): {
  persistNowRequestNonce: number;
  requestImmediatePersist: () => void;
} {
  const [persistNowRequestNonce, setPersistNowRequestNonce] = useState(0);
  const requestImmediatePersist = (): void => {
    setPersistNowRequestNonce((current) => current + 1);
  };
  return { persistNowRequestNonce, requestImmediatePersist };
}

function stableHashToken(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0).toString(36);
}

export type UseHammerWorkspaceShellSnapshotEmitterArgs = {
  onWorkspaceSnapshotChange?: (
    snapshot: HammerWorkspaceSnapshot,
    options?: { persistNow?: boolean; placementDiagnostics?: HammerPlacementOutboundDiagnostics },
  ) => void;
  persistNowRequestNonce: number;
  launchContext: HammerLaunchContext;
  transcriptSourceId: string;
  previewMode: HammerPreviewMode;
  mediaRef: MediaRef | null;
  workspaceMapping: WorkspaceMediaMapping | null;
  mediaSourceLabel: string | null;
  canonicalWorkpieceLabel: string | null;
  legacyCaptureLabel: string | null;
  mediaLabelMismatchWarning: string | null;
  actualRecordingMismatchWarning: string | null;
  selectedMacroRecipeRef: string | null;
  lastMacroRunRef: string | null;
  canonicalStructuredTranscript: HammerPersistedStructuredTranscript | null;
  exportCanonicalGraph: HammerEditorialAuthorityGraph;

  currentPass: HammerPassId;
  passStatus: HammerPassStatusMap;
  editableTranscriptSegments: HammerTranscriptSegment[];
  selectedSegmentId: string | null;
  selectedOverlayRowId: string | null;

  editableVisualPlacements: HammerPersistedVisualPlacements | null;
  editableVisualTimeline: HammerVisualTimelineState | null;
  editableAudioPolish: HammerPersistedAudioPolish | null;

  visualPreviewSettings: HammerPersistedVisualPreviewSettings;
  visualBackgroundReplaceImageUrl: string;

  visualTimelineProp: HammerVisualTimelineState | null;
  placementOutboundDiagnostics: HammerPlacementOutboundDiagnostics;

  createFallbackEditPlan: (
    launchContext: HammerLaunchContext,
    transcriptSourceId: string,
    previewMode: HammerPreviewMode,
  ) => HammerEditPlan;
};

export function useHammerWorkspaceShellSnapshotEmitter(args: UseHammerWorkspaceShellSnapshotEmitterArgs): void {
  const lastEmittedKeyRef = useRef<string | null>(null);
  const lastPersistNowRequestNonceRef = useRef<number>(args.persistNowRequestNonce);

  // NOTE: We intentionally use a layout effect here so that committed canonical workspace
  // mutations (history/apply actions) produce a parent-visible snapshot as soon as possible.
  // This reduces the "commit gap" where a user can close the page before autosave has a
  // chance to queue the new revision payload.
  useLayoutEffect(() => {
    if (!args.onWorkspaceSnapshotChange) return;

    const editPlan = args.launchContext.edit_plan
      ? {
        ...args.launchContext.edit_plan,
        instructions: args.launchContext.edit_plan.instructions.map((instruction) => ({ ...instruction })),
      }
      : args.createFallbackEditPlan(args.launchContext, args.transcriptSourceId, args.previewMode);
    const canonicalEditPlan = projectEditPlanFromEditorialAuthorityGraph({
      graph: args.exportCanonicalGraph,
      fallback: editPlan,
    });

    const normalizedBackgroundReplaceUrl = args.visualBackgroundReplaceImageUrl.trim()
      ? args.visualBackgroundReplaceImageUrl.trim()
      : null;

    const editPlanSignature = createSemanticEditPlanSignature(
      args.transcriptSourceId,
      args.previewMode,
      canonicalEditPlan.instructions,
    );

    const sessionId = args.launchContext.session_id ?? editPlan.session_id ?? `${args.launchContext.workpiece_id}:session`;
    const contentSignature = stableHashToken(JSON.stringify({
      currentPass: args.currentPass,
      passStatus: args.passStatus,
      selectedSegmentId: args.selectedSegmentId,
      selectedOverlayRowId: args.selectedOverlayRowId,
      transcriptSegments: args.editableTranscriptSegments.map((segment) => ({
        id: segment.segment_id,
        text: segment.text,
        speaker: segment.speaker,
        start: segment.start_sec,
        end: segment.end_sec,
        disabled: segment.is_disabled === true,
      })),
      visualTimeline: args.editableVisualTimeline
        ? {
          revision: args.editableVisualTimeline.revision,
          updatedAt: args.editableVisualTimeline.updated_at,
          selectedClipId: args.editableVisualTimeline.selected_clip_id,
          assets: args.editableVisualTimeline.assets.map((asset) => ({
            id: asset.asset_id,
            ref: asset.asset_ref,
            path: asset.path,
            updatedAt: asset.updated_at,
          })),
          clips: args.editableVisualTimeline.clips.map((clip) => ({
            id: clip.clip_id,
            laneId: clip.lane_id,
            assetId: clip.asset_id,
            start: clip.start_sec,
            end: clip.end_sec,
            opacity: clip.opacity,
            zIndex: clip.z_index,
            enabled: clip.enabled,
            updatedAt: clip.updated_at,
          })),
        }
        : null,
      // Once a canonical timeline exists, derived compatibility placements are not
      // an independent emission authority. Including both lets hydration churn in the
      // adapter change the key and re-emit an otherwise identical canonical timeline.
      visualPlacements: args.editableVisualTimeline
        ? null
        : args.editableVisualPlacements?.placements.map((placement) => ({
          id: placement.placement_id,
          assetId: placement.asset_id,
          start: placement.start_sec,
          end: placement.end_sec,
          status: placement.status,
        })) ?? null,
      audioPolish: args.editableAudioPolish
        ? {
          status: args.editableAudioPolish.status,
          preparedAt: args.editableAudioPolish.prepared_at,
          preparedPasses: args.editableAudioPolish.prepared_passes,
          sourceMediaSignature: args.editableAudioPolish.source_media_signature,
          outputLocalRelpath: args.editableAudioPolish.output_local_relpath,
          analysisAnalyzedAt: args.editableAudioPolish.analysis?.analyzed_at ?? null,
        }
        : null,
      visualPreviewSettings: args.visualPreviewSettings,
      backgroundReplaceImageUrl: normalizedBackgroundReplaceUrl,
      mediaSourceLabel: args.mediaSourceLabel,
      canonicalWorkpieceLabel: args.canonicalWorkpieceLabel,
      legacyCaptureLabel: args.legacyCaptureLabel,
      mediaLabelMismatchWarning: args.mediaLabelMismatchWarning,
      actualRecordingMismatchWarning: args.actualRecordingMismatchWarning,
      selectedMacroRecipeRef: args.selectedMacroRecipeRef,
      lastMacroRunRef: args.lastMacroRunRef,
    }));

    // Snapshot emission must be idempotent to avoid referential churn loops where parents store
    // snapshots in state and immediately re-render, causing the emitter to run again.
    const emissionKey = [
      args.launchContext.workspace_id,
      args.launchContext.workpiece_id,
      sessionId,
      args.launchContext.source_mode,
      args.previewMode,
      editPlanSignature,
      args.currentPass,
      args.selectedSegmentId ?? "",
      args.selectedOverlayRowId ?? "",
      args.mediaSourceLabel ?? "",
      args.canonicalWorkpieceLabel ?? "",
      args.legacyCaptureLabel ?? "",
      args.mediaLabelMismatchWarning ?? "",
      args.actualRecordingMismatchWarning ?? "",
      args.selectedMacroRecipeRef ?? "",
      args.lastMacroRunRef ?? "",
      normalizedBackgroundReplaceUrl ?? "",
      contentSignature,
    ].join("|");

    const persistNowRequested = args.persistNowRequestNonce !== lastPersistNowRequestNonceRef.current;
    if (emissionKey === lastEmittedKeyRef.current && !persistNowRequested) {
      return;
    }
    lastEmittedKeyRef.current = emissionKey;
    lastPersistNowRequestNonceRef.current = args.persistNowRequestNonce;

    const snapshot: HammerWorkspaceSnapshot = {
      workspaceId: args.launchContext.workspace_id,
      workpieceId: args.launchContext.workpiece_id,
      sessionId,
      sourceMode: args.launchContext.source_mode,
      previewMode: args.previewMode,
      editPlanStatus: "clean",
      editPlanSignature,
      transcriptSourceId: args.transcriptSourceId,
      currentPass: args.currentPass,
      passOrderVersion: HAMMER_PASS_ORDER_VERSION,
      passStatus: args.passStatus,
      transcriptSegments: args.editableTranscriptSegments,
      selectedSegmentId: args.selectedSegmentId,
      selectedOverlayRowId: args.selectedOverlayRowId,
      visualPreviewSettings: {
        ...args.visualPreviewSettings,
        background_replace_image_url: normalizedBackgroundReplaceUrl,
      },
      mediaRef: args.mediaRef,
      workspaceMapping: args.workspaceMapping,
      mediaSourceLabel: args.mediaSourceLabel,
      diagnostics: {
        canonicalWorkpieceLabel: args.canonicalWorkpieceLabel,
        legacyCaptureLabel: args.legacyCaptureLabel,
        mediaLabelMismatchWarning: args.mediaLabelMismatchWarning,
        actualRecordingMismatchWarning: args.actualRecordingMismatchWarning,
      },
      selectedMacroRecipeRef: args.selectedMacroRecipeRef ?? null,
      lastMacroRunRef: args.lastMacroRunRef ?? null,
      structuredTranscript: args.canonicalStructuredTranscript,
      editPlan: canonicalEditPlan,
      editorialAuthorityGraph: args.exportCanonicalGraph,
      visualPlacements: args.editableVisualTimeline
        ? deriveLegacyVisualPlacementsFromTimeline(args.editableVisualTimeline)
        : args.editableVisualPlacements,
      visualTimeline: args.editableVisualTimeline,
      audioPolish: args.editableAudioPolish,
    };

    args.onWorkspaceSnapshotChange(snapshot, {
      ...(persistNowRequested ? { persistNow: true } : {}),
      placementDiagnostics: args.placementOutboundDiagnostics,
    });
  }, [
    args.launchContext,
    args.mediaRef,
    args.mediaSourceLabel,
    args.canonicalWorkpieceLabel,
    args.legacyCaptureLabel,
    args.mediaLabelMismatchWarning,
    args.actualRecordingMismatchWarning,
    args.previewMode,
    args.lastMacroRunRef,
    args.onWorkspaceSnapshotChange,
    args.selectedMacroRecipeRef,
    args.canonicalStructuredTranscript,
    args.exportCanonicalGraph,
    args.editableVisualPlacements,
    args.editableVisualTimeline,
    args.editableAudioPolish,
    args.currentPass,
    args.passStatus,
    args.selectedSegmentId,
    args.selectedOverlayRowId,
    args.visualPreviewSettings,
    args.visualBackgroundReplaceImageUrl,
    args.editableTranscriptSegments,
    args.transcriptSourceId,
    args.workspaceMapping,
    args.visualTimelineProp,
    args.persistNowRequestNonce,
    args.placementOutboundDiagnostics,
  ]);
}
