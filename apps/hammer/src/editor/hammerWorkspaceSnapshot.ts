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
import type {
  HammerPassId,
  HammerPassStatusMap,
  HammerPersistedAudioPolish,
  HammerPersistedVisualPreviewSettings,
  HammerPersistedStructuredTranscript,
  HammerPersistedVisualPlacements,
} from "../persistence/hammerPersistenceContract";
import type { HammerEditorialAuthorityGraph } from "../../../../packages/contracts/hammer/editorial-authority.contract";

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
  currentPass: HammerPassId;
  passOrderVersion: number;
  passStatus: HammerPassStatusMap;
  transcriptSegments: HammerTranscriptSegment[];
  selectedSegmentId: string | null;
  selectedOverlayRowId: string | null;
  visualPreviewSettings: HammerPersistedVisualPreviewSettings;
  mediaRef: MediaRef | null;
  workspaceMapping: WorkspaceMediaMapping | null;
  mediaSourceLabel: string | null;
  selectedMacroRecipeRef: string | null;
  lastMacroRunRef: string | null;
  structuredTranscript: HammerPersistedStructuredTranscript | null;
  editPlan: HammerEditPlan;
  editorialAuthorityGraph?: HammerEditorialAuthorityGraph | null;
  visualPlacements: HammerPersistedVisualPlacements | null;
  audioPolish: HammerPersistedAudioPolish | null;
}
