import type { HammerTranscriptSegment } from "../../../../packages/contracts/hammer/transcript.contract";
import type { MediaRef, WorkspaceMediaMapping } from "../../../../packages/contracts/hammer/media-resolver.contract";
import type { HammerPreviewMode } from "../../../../packages/contracts/hammer/edit-plan.contract";
import type { HammerLaunchSourceMode } from "../../../../packages/contracts/hammer/launch-context.contract";
import type { HammerPersistedAudioPolish, HammerPersistedStructuredTranscript, HammerPersistedVisualPlacements, HammerPersistedVisualPreviewSettings } from "../persistence/hammerPersistenceContract";
import type { HammerVisualTimelineState } from "../visuals/model/hammerVisualTypes";
import type { HammerStudioRackState } from "./hammerStudioRack";
import type { HammerHistoryEpochPersistenceState } from "./hammerHistoryEpochPersistence";
import { hashEditorState, type HammerEditorStateSerializable } from "./hammerWorkspaceHistory";
import type { HammerShortsToolBayAuthority } from "./HammerShortsToolBay";

export function buildHammerShortsToolBayAuthority(args: {
  workspaceId: string; workpieceId: string; parentLabel: string | null; canonicalRecordingId: string | null | undefined; recordingRevisionId: string | null | undefined;
  historyState: HammerHistoryEpochPersistenceState | null; historyEpochPending: boolean; editorState: HammerEditorStateSerializable | null;
  structuredTranscript: HammerPersistedStructuredTranscript | null; transcriptSegments: HammerTranscriptSegment[]; sourceMode: HammerLaunchSourceMode;
  sessionId: string; previewMode: HammerPreviewMode; transcriptSourceId: string; mediaRef: MediaRef | null; workspaceMapping: WorkspaceMediaMapping | null; mediaSourceLabel: string | null;
  visualPreview: HammerPersistedVisualPreviewSettings; visualTimeline: HammerVisualTimelineState | null; visualPlacements: HammerPersistedVisualPlacements | null;
  audioPolish: HammerPersistedAudioPolish | null; studioRack: HammerStudioRackState;
}): HammerShortsToolBayAuthority | null {
  const basis = args.historyState?.basis;
  if (!basis?.headId || !args.editorState || !args.canonicalRecordingId || !args.recordingRevisionId || !args.structuredTranscript || args.historyEpochPending || args.historyState?.pending) return null;
  let outputCursor = 0;
  const timingMap = [...args.transcriptSegments].sort((left, right) => left.start_sec - right.start_sec).flatMap((segment) => {
    if (segment.is_disabled) return [];
    const durationSec = Math.max(0, segment.end_sec - segment.start_sec);
    if (durationSec <= 0) return [];
    const interval = { segment_id: segment.segment_id, source_start_sec: segment.start_sec, source_end_sec: segment.end_sec, output_start_sec: outputCursor, output_end_sec: outputCursor + durationSec };
    outputCursor += durationSec;
    return [interval];
  });
  const byId = new Map(args.transcriptSegments.map((segment) => [segment.segment_id, segment]));
  return {
    workspaceId: args.workspaceId, workpieceId: args.workpieceId, parentLabel: args.parentLabel ?? "Episode", canonicalRecordingId: args.canonicalRecordingId,
    recordingRevisionId: args.recordingRevisionId, historyEpochId: basis.epochId, historyHeadId: basis.headId, historySequence: basis.sequence,
    editorStateHash: hashEditorState(args.editorState), transcriptFingerprint: basis.componentHashes.transcript,
    timelineFingerprint: basis.componentHashes.visual_timeline, renderAssemblyFingerprint: basis.componentHashes.editorial_authority,
    timingMap, outputSegments: timingMap.map((interval) => ({ ...interval, text: byId.get(interval.segment_id)?.text ?? "" })),
    structuredTranscript: args.structuredTranscript, transcriptSegments: args.transcriptSegments,
    editorSession: { schema_version: 1, session_id: args.sessionId, source_mode: args.sourceMode, preview_mode: args.previewMode, transcript_source_id: args.transcriptSourceId,
      selected_segment_id: null, selected_overlay_row_id: null, media_ref: args.mediaRef, workspace_mapping: args.workspaceMapping, media_source_label: args.mediaSourceLabel,
      visual_preview: args.visualPreview, last_opened_at: new Date().toISOString() },
    visualTimeline: args.visualTimeline, visualPlacements: args.visualPlacements, audioPolish: args.audioPolish, studioRack: args.studioRack,
  };
}
