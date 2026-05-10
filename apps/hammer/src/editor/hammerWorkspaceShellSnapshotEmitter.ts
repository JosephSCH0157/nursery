import { useLayoutEffect, useRef } from "react";
import type { HammerLaunchContext } from "../../../../packages/contracts/hammer/launch-context.contract";
import type { HammerPreviewMode } from "../../../../packages/contracts/hammer/edit-plan.contract";
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
  exportCanonicalGraph: any;

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
  ) => any;
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
      visualPlacements: args.editableVisualPlacements?.placements.map((placement) => ({
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
