import { useEffect } from "react";
import type { HammerLaunchContext } from "../../../../packages/contracts/hammer/launch-context.contract";
import type { HammerPreviewMode } from "../../../../packages/contracts/hammer/edit-plan.contract";
import type { MediaRef, WorkspaceMediaMapping } from "../../../../packages/contracts/hammer/media-resolver.contract";
import type { HammerTranscriptSegment } from "../../../../packages/contracts/hammer/transcript.contract";
import type { HammerWorkspaceSnapshot } from "./hammerWorkspaceSnapshot";
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

export type UseHammerWorkspaceShellSnapshotEmitterArgs = {
  onWorkspaceSnapshotChange?: (snapshot: HammerWorkspaceSnapshot) => void;
  launchContext: HammerLaunchContext;
  transcriptSourceId: string;
  previewMode: HammerPreviewMode;
  mediaRef: MediaRef | null;
  workspaceMapping: WorkspaceMediaMapping | null;
  mediaSourceLabel: string | null;
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

  createFallbackEditPlan: (
    launchContext: HammerLaunchContext,
    transcriptSourceId: string,
    previewMode: HammerPreviewMode,
  ) => any;
};

export function useHammerWorkspaceShellSnapshotEmitter(args: UseHammerWorkspaceShellSnapshotEmitterArgs): void {
  useEffect(() => {
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

    const snapshot: HammerWorkspaceSnapshot = {
      workspaceId: args.launchContext.workspace_id,
      workpieceId: args.launchContext.workpiece_id,
      sessionId: args.launchContext.session_id ?? editPlan.session_id ?? `${args.launchContext.workpiece_id}:session`,
      sourceMode: args.launchContext.source_mode,
      previewMode: args.previewMode,
      editPlanStatus: "clean",
      editPlanSignature: createSemanticEditPlanSignature(args.transcriptSourceId, args.previewMode, canonicalEditPlan.instructions),
      transcriptSourceId: args.transcriptSourceId,
      currentPass: args.currentPass,
      passOrderVersion: HAMMER_PASS_ORDER_VERSION,
      passStatus: args.passStatus,
      transcriptSegments: args.editableTranscriptSegments,
      selectedSegmentId: args.selectedSegmentId,
      selectedOverlayRowId: args.selectedOverlayRowId,
      visualPreviewSettings: {
        ...args.visualPreviewSettings,
        background_replace_image_url: args.visualBackgroundReplaceImageUrl.trim()
          ? args.visualBackgroundReplaceImageUrl.trim()
          : null,
      },
      mediaRef: args.mediaRef,
      workspaceMapping: args.workspaceMapping,
      mediaSourceLabel: args.mediaSourceLabel,
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

    args.onWorkspaceSnapshotChange(snapshot);
  }, [
    args.launchContext,
    args.mediaRef,
    args.mediaSourceLabel,
    args.previewMode,
    args.lastMacroRunRef,
    args.onWorkspaceSnapshotChange,
    args.selectedMacroRecipeRef,
    args.canonicalStructuredTranscript,
    args.editableVisualPlacements,
    args.editableVisualTimeline,
    args.editableAudioPolish,
    args.currentPass,
    args.passStatus,
    args.selectedSegmentId,
    args.visualPreviewSettings,
    args.visualBackgroundReplaceImageUrl,
    args.editableTranscriptSegments,
    args.transcriptSourceId,
    args.workspaceMapping,
    args.visualTimelineProp,
  ]);
}
