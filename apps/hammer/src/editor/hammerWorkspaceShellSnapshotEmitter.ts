import { useLayoutEffect, useRef } from "react";
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
  onWorkspaceSnapshotChange?: (
    snapshot: HammerWorkspaceSnapshot,
    options?: { persistNow?: boolean },
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
  const lastEmittedKeyRef = useRef<string | null>(null);
  const lastPersistNowRequestNonceRef = useRef<number>(args.persistNowRequestNonce);

  const objectIdsRef = useRef<{ map: WeakMap<object, number>; nextId: number } | null>(null);
  if (!objectIdsRef.current) {
    objectIdsRef.current = { map: new WeakMap(), nextId: 1 };
  }

  const refId = (value: unknown): number => {
    if (!value) return 0;
    const t = typeof value;
    if (t !== "object" && t !== "function") return 0;
    const state = objectIdsRef.current;
    if (!state) return 0;
    const obj = value as object;
    const existing = state.map.get(obj);
    if (existing) return existing;
    const next = state.nextId++;
    state.map.set(obj, next);
    return next;
  };

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
      args.selectedMacroRecipeRef ?? "",
      args.lastMacroRunRef ?? "",
      normalizedBackgroundReplaceUrl ?? "",
      // Stable-by-identity payloads
      String(refId(args.passStatus)),
      String(refId(args.editableTranscriptSegments)),
      String(refId(args.canonicalStructuredTranscript)),
      String(refId(args.exportCanonicalGraph)),
      String(refId(args.editableVisualTimeline)),
      String(refId(args.editableVisualPlacements)),
      String(refId(args.editableAudioPolish)),
      String(refId(args.mediaRef)),
      String(refId(args.workspaceMapping)),
      String(refId(args.visualTimelineProp)),
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

    args.onWorkspaceSnapshotChange(snapshot, persistNowRequested ? { persistNow: true } : undefined);
  }, [
    args.launchContext,
    args.mediaRef,
    args.mediaSourceLabel,
    args.canonicalWorkpieceLabel,
    args.legacyCaptureLabel,
    args.mediaLabelMismatchWarning,
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
  ]);
}
