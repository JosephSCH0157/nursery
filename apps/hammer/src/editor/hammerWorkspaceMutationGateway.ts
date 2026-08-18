import type { HammerEditorialAuthorityGraph } from "../../../../packages/contracts/hammer/editorial-authority.contract";
import type { HammerTranscriptSegment } from "../../../../packages/contracts/hammer/transcript.contract";
import type { HammerPlacementOutboundDiagnostics } from "./hammerWorkspaceSnapshot";
import type { HammerPersistedAudioEdit } from "../persistence/hammerPersistenceContract";
import { deriveLegacyVisualPlacementsFromTimeline } from "../visuals/persistence/hammerVisualTimelineLegacyAdapter";
import { createEmptyVisualTimelineState } from "../visuals/model/hammerVisualDefaults";
import { migrateLegacyPlacementRecordsToTimelineState } from "../visuals/model/hammerVisualMigrations";
import type { HammerVisualTimelineState } from "../visuals/model/hammerVisualTypes";
import { hammerVisualTimelineReducer } from "../visuals/state/hammerVisualReducer";
import { resolveSelectionFromTranscript, resolveSelectionFromVisual, type HammerLinkedSelection } from "./hammerLinkedSelection";
import type { HammerStudioRackState } from "./hammerStudioRack";
import type { HammerEditorStateSerializable, HammerOutputSelectionState } from "./hammerWorkspaceHistory";
import { buildVisualTimelineDiagnostics } from "./hammerVisualTimelineHydrationGuard";
import { toEditorState, toShellState, type HammerShellStateProjection } from "./hammerWorkspaceShellStateAdapters";

/** Canonical workspace mutation gateway. It normalizes and applies workspace state while preserving
 * timeline compatibility, reducer ordering, selection reconciliation, and placement diagnostics. */

export type HammerVisualTimelineAction = Parameters<typeof hammerVisualTimelineReducer>[1];

export function resolveCanonicalWorkspaceVisualTimeline(
  state: HammerEditorStateSerializable,
  nowIso = () => new Date().toISOString(),
): HammerVisualTimelineState {
  if (state.visualTimeline) return state.visualTimeline;
  if (state.visualPlacements) {
    return migrateLegacyPlacementRecordsToTimelineState({
      placements: state.visualPlacements.placements,
      selected_overlay_row_id: null,
      updated_at: nowIso(),
    });
  }
  return createEmptyVisualTimelineState({ updated_at: nowIso(), debug_origin: "empty_init" });
}

export function applyWorkspaceVisualTimelineAction(
  state: HammerEditorStateSerializable,
  action: HammerVisualTimelineAction,
): HammerEditorStateSerializable {
  const nextTimeline = hammerVisualTimelineReducer(resolveCanonicalWorkspaceVisualTimeline(state), action);
  return { ...state, visualTimeline: nextTimeline, visualPlacements: deriveLegacyVisualPlacementsFromTimeline(nextTimeline) };
}

export function applyWorkspaceVisualTimelineActions(
  state: HammerEditorStateSerializable,
  actions: HammerVisualTimelineAction[],
): HammerEditorStateSerializable {
  return actions.reduce((current, action) => applyWorkspaceVisualTimelineAction(current, action), state);
}

export function replaceWorkspaceVisualTimelineState(
  state: HammerEditorStateSerializable,
  updater: (timeline: HammerVisualTimelineState) => HammerVisualTimelineState,
): HammerEditorStateSerializable {
  const nextTimeline = hammerVisualTimelineReducer(
    resolveCanonicalWorkspaceVisualTimeline(state),
    { type: "LOAD_TIMELINE", timeline: updater(resolveCanonicalWorkspaceVisualTimeline(state)) },
  );
  return { ...state, visualTimeline: nextTimeline, visualPlacements: deriveLegacyVisualPlacementsFromTimeline(nextTimeline) };
}

type GatewayConfig = {
  capture: HammerShellStateProjection;
  getCurrentTimeline: () => HammerVisualTimelineState | null;
  getMediaUpdateReason: () => string;
  setTimelineUpdateReason: (reason: string) => void;
  setPlacementOutboundDiagnostics: (diagnostics: HammerPlacementOutboundDiagnostics) => void;
  setTranscriptSegments: (segments: HammerTranscriptSegment[]) => void;
  setVisualTimeline: (timeline: HammerVisualTimelineState | null) => void;
  setStudioRack: (rack: HammerStudioRackState) => void;
  setEditorialAuthorityGraph: (graph: HammerEditorialAuthorityGraph | null) => void;
  setOutputSelection: (selection: HammerOutputSelectionState) => void;
  setSelectedSegmentId: (segmentId: string | null) => void;
  setPlayheadSec: (playheadSec: number) => void;
  setTranscriptTimingHint: (hint: string | null) => void;
  linkedSelectionVisualItems: Parameters<typeof resolveSelectionFromVisual>[0]["visualItems"];
  setLinkedSelection: (selection: HammerLinkedSelection | null) => void;
  applyAudioEdit: (audioEdit: HammerPersistedAudioEdit | null) => void;
  invalidateCleanupPreview: () => void;
  reportBlockedRefresh?: (details: Record<string, unknown>) => void;
};

export function createHammerWorkspaceMutationGateway(config: GatewayConfig) {
  const captureWorkspaceState = (): HammerEditorStateSerializable => toEditorState(config.capture);
  const applyWorkspaceState = (nextState: HammerEditorStateSerializable, reason = "workspace_state_apply"): void => {
    config.setTimelineUpdateReason(reason);
    const normalized = toShellState(nextState);
    const previousTimeline = config.getCurrentTimeline();
    const previousDiagnostics = buildVisualTimelineDiagnostics(previousTimeline);
    const incomingDiagnostics = buildVisualTimelineDiagnostics(normalized.visualTimeline);
    const isDestructiveSourceDeskRefresh = (
      (reason === "history:baseline_init" || reason === "history:mutation_apply")
      && config.getMediaUpdateReason() === "source_desk_refresh"
      && (previousDiagnostics.anchorCount > 0 || previousDiagnostics.clipCount > 0)
      && incomingDiagnostics.anchorCount === 0
      && incomingDiagnostics.clipCount === 0
    );
    const protectedTimeline = isDestructiveSourceDeskRefresh ? previousTimeline : normalized.visualTimeline;
    if (isDestructiveSourceDeskRefresh) {
      config.reportBlockedRefresh?.({ reason, mediaReason: config.getMediaUpdateReason(), beforeVisualPlacementsCount: previousDiagnostics.clipCount,
        afterVisualPlacementsCount: incomingDiagnostics.clipCount, beforeAnchorsCount: previousDiagnostics.anchorCount,
        afterAnchorsCount: incomingDiagnostics.anchorCount });
    }
    const protectedDiagnostics = buildVisualTimelineDiagnostics(protectedTimeline);
    config.setPlacementOutboundDiagnostics({ reason, source: config.getMediaUpdateReason(), explicitUserAction: false,
      placementCount: protectedDiagnostics.clipCount, anchorCount: protectedDiagnostics.anchorCount });
    config.setTranscriptSegments(normalized.segments);
    config.setVisualTimeline(protectedTimeline);
    config.setStudioRack(normalized.studioRack);
    config.setEditorialAuthorityGraph(normalized.editorialAuthorityGraph);
    config.setOutputSelection(normalized.outputSelection);
    config.setSelectedSegmentId(normalized.selectedSegmentId);
    config.setPlayheadSec(normalized.playheadSec);
    config.setTranscriptTimingHint(normalized.transcriptTimingHint);
    config.setLinkedSelection(protectedTimeline?.selected_clip_id
      ? resolveSelectionFromVisual({ transcriptSegments: normalized.segments, visualItems: config.linkedSelectionVisualItems,
        visualId: protectedTimeline.selected_clip_id })
      : resolveSelectionFromTranscript({ transcriptSegments: normalized.segments, visualItems: config.linkedSelectionVisualItems,
        anchorSegmentId: normalized.selectedSegmentId, focusSegmentId: normalized.selectedSegmentId }));
    config.applyAudioEdit(normalized.audioEdit);
    config.invalidateCleanupPreview();
  };
  return {
    captureWorkspaceState,
    resolveCanonicalVisualTimeline: resolveCanonicalWorkspaceVisualTimeline,
    applyVisualTimelineAction: applyWorkspaceVisualTimelineAction,
    applyVisualTimelineActions: applyWorkspaceVisualTimelineActions,
    replaceVisualTimelineState: replaceWorkspaceVisualTimelineState,
    applyWorkspaceState,
  };
}

export function captureHammerWorkspaceState(projection: HammerShellStateProjection): HammerEditorStateSerializable {
  return toEditorState(projection);
}
