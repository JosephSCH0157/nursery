import type {
  HammerEditPlan,
  HammerPreviewMode,
} from "../../../../packages/contracts/hammer/edit-plan.contract";
import type { HammerLaunchSourceMode } from "../../../../packages/contracts/hammer/launch-context.contract";
import type {
  MediaRef,
  WorkspaceMediaMapping,
} from "../../../../packages/contracts/hammer/media-resolver.contract";
import type { HammerTranscriptSegment } from "../../../../packages/contracts/hammer/transcript.contract";

export type HammerWorkspaceEditPlanStatus = "clean" | "dirty" | "reloaded";

export interface HammerWorkspaceSnapshot {
  workspaceId: string;
  workpieceId: string;
  sessionId: string;
  sourceMode: HammerLaunchSourceMode;
  previewMode: HammerPreviewMode;
  editPlanStatus: HammerWorkspaceEditPlanStatus;
  editPlanSignature: string;
  transcriptSourceId: string;
  transcriptSegments: HammerTranscriptSegment[];
  selectedSegmentId: string | null;
  selectedOverlayRowId: string | null;
  mediaRef: MediaRef | null;
  workspaceMapping: WorkspaceMediaMapping | null;
  mediaSourceLabel: string | null;
  editPlan: HammerEditPlan;
  studioSoundPrepared: boolean;
  noiseCleanupPrepared: boolean;
  levelConsistencyPrepared: boolean;
}
