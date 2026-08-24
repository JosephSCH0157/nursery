import type { HammerSelectedVisualContext } from "./hammerSelectedVisualContext";
import type { HammerToolBayRouteDecision, HammerToolBayUnsupportedReason } from "./hammerToolBayRouteDecision";
import type { HammerCaptionArtifactMode, HammerCaptionBuildState, HammerCaptionEditedState, HammerCaptionFormattingState } from "./hammerWorkspaceShellCaptionUtils";
import type { HammerLogoOverlayPosition, HammerLogoOverlaySize } from "./hammerWorkspaceShellVisualUtils";

export type HammerResolvedToolBayRoute = Extract<HammerToolBayRouteDecision, { status: "resolved" }>;
export type HammerToolBayContextUnsupportedReason =
  | HammerToolBayUnsupportedReason
  | "route_not_resolved"
  | "required_data_missing"
  | "route_surface_mismatch"
  | "selected_visual_missing"
  | "selected_visual_kind_mismatch"
  | "selected_visual_capability_mismatch";

type SurfaceContext<Surface extends string, Data, Commands> = Readonly<{
  surface: Surface;
  route: HammerResolvedToolBayRoute;
  data: Readonly<Data>;
  commands: Readonly<Commands>;
}>;

export type TranscriptCleanupCommands = Readonly<{
  refreshCandidates(): void;
  previewCandidate(candidateId: string): void;
  acceptCandidate(candidateId: string): void;
  dismissCandidate(candidateId: string): void;
  applyCleanup(previewId: string): void;
  discardCleanup(previewId: string): void;
}>;
export type RetakePacingCommands = Readonly<{
  previewRange(rangeId: string): void;
  acceptRange(rangeId: string): void;
  dismissRange(rangeId: string): void;
}>;
export type TranscriptPolishCommands = Readonly<{
  previewCleanup(): void;
  applyCleanup(previewId: string): void;
  discardCleanup(previewId: string): void;
}>;
export type VisualPolishCommands = Readonly<{
  updateLook(lookId: string): void;
  updateExposure(stops: number): void;
  updateBackground(mode: "none" | "blur" | "replace" | "wash"): void;
  toggleEyeContact(enabled: boolean): void;
}>;
export type ImagePlacementRetimeInput = Readonly<{ placementId: string; startSec: number; endSec: number }>;
export type ImageAnchorUpdateInput = Readonly<{ placementId: string; segmentId: string | null; label: string }>;
export type ImageTransformInput = Readonly<{ placementId: string; leftPct: number; topPct: number; widthPct: number; heightPct: number }>;
export type ImagePlacementCommands = Readonly<{
  removePlacement(placementId: string): void;
  updateAnchor(input: ImageAnchorUpdateInput): void;
}>;
export type ImageTimingCommands = Readonly<{ retimePlacement(input: ImagePlacementRetimeInput): void }>;
export type ImageTransformCommands = Readonly<{ updateTransform(input: ImageTransformInput): void; resetTransform(placementId: string): void }>;
export type ImageAnimationCommands = Readonly<{ updateAnimation(placementId: string, animation: string): void }>;
export type BrollRebindInput = Readonly<{ placementId: string; targetSegmentId: string }>;
export type BrollReplaceInput = Readonly<{ placementId: string; assetId: string }>;
export type BrollCommands = Readonly<{
  removePlacement(placementId: string): void;
  rebindPlacement(input: BrollRebindInput): void;
  replaceBinding(input: BrollReplaceInput): void;
  revertBinding(placementId: string): void;
  addTransition(placementId: string): void;
}>;
export type AudioCommands = Readonly<{ updateVoicePreset(presetId: string): void; toggleCompare(enabled: boolean): void; applyPodcastMaster(): void }>;
export type CaptionCommands = Readonly<{
  focusTool(): void; buildCaptions(): void; enableEdits(): void; selectMode(mode: HammerCaptionArtifactMode): void; discardEdits(): void;
  updateFormatting(next: HammerCaptionFormattingState | ((current: HammerCaptionFormattingState) => HammerCaptionFormattingState)): void;
  selectArtifactFormat(format: "srt" | "vtt"): void; editCaption(captionId: string, text: string): void; splitCaption(captionId: string): void;
  mergeCaption(input: Readonly<{ chunkId: string; direction: "up" | "down" }>): void; normalizePunctuation(captionId: string): void; toggleSpeakerLabel(captionId: string): void;
}>;
export type MetadataCommands = Readonly<{ focusTool(): void; setTag(tag: string): void }>;
export type PackagingCommands = Readonly<{
  focusTool(): void; applyIntro(): void; applyOutro(): void; removePlacement(id: string, label: string): void;
  updateLogoStyle(input: Readonly<{ assetPath?: string | null; position?: HammerLogoOverlayPosition; size?: HammerLogoOverlaySize }>): void; toggleLogo(): void;
}>;
export type FinishingCommands = Readonly<{ focusTool(): void; setReviewFlag(flag: "transcript" | "visual" | "audio", complete: boolean): void }>;
export type ReleaseCommands = Readonly<{ focusIssue(): void; sendToQuench(): void }>;
export type PassCompletionCommands = Readonly<{ markPassComplete(): void }>;

type VisualData = { selectedVisual: HammerSelectedVisualContext; placementId: string; model: unknown };

export type HammerTranscriptCleanupToolBayContext = SurfaceContext<"transcript_cleanup", MigratedEditorSurfaceData, TranscriptCleanupCommands>;
export type HammerRetakesToolBayContext = SurfaceContext<"retakes", MigratedEditorSurfaceData, RetakePacingCommands>;
export type HammerGapPacingToolBayContext = SurfaceContext<"gap_pacing", MigratedEditorSurfaceData, RetakePacingCommands>;
export type HammerTranscriptPolishToolBayContext = SurfaceContext<"transcript_polish", MigratedEditorSurfaceData, TranscriptPolishCommands>;
export type HammerVisualPolishToolBayContext = SurfaceContext<"visual_polish", MigratedEditorSurfaceData, VisualPolishCommands>;
export type HammerImagePlacementToolBayContext = SurfaceContext<"image_placement", VisualData, ImagePlacementCommands>;
export type HammerImageTimingToolBayContext = SurfaceContext<"image_timing", VisualData, ImageTimingCommands>;
export type HammerImageTransformToolBayContext = SurfaceContext<"image_transform", VisualData, ImageTransformCommands>;
export type HammerImageAnimationToolBayContext = SurfaceContext<"image_animation", VisualData, ImageAnimationCommands>;
export type HammerBrollToolBayContext = SurfaceContext<"broll", VisualData, BrollCommands>;
export type HammerReferenceClipToolBayContext = SurfaceContext<"reference_clip", VisualData, BrollCommands>;
type MigratedEditorSurfaceData = { model: unknown };
export type HammerCaptionsToolBayData = Readonly<{
  activeCaptionArtifactText: string; activeCaptionMode: HammerCaptionArtifactMode; activeCaptionState: HammerCaptionBuildState | HammerCaptionEditedState | null;
  captionActiveModeLabel: string; captionActiveModeSourceLabel: string; captionArtifactStatusLabel: string; captionBuildFeedback: string | null; captionBuildFreshness: string;
  captionBuildState: HammerCaptionBuildState | null; captionBuiltSummary: string; captionBuiltTone: string; captionDiscardConsequenceLabel: string | null;
  captionEditedBasisDetail: string; captionEditedChangeSummary: string; captionEditedState: HammerCaptionEditedState | null; captionEditedSummary: string; captionEditedTone: string;
  captionEditorRefs: { current: Map<string, HTMLTextAreaElement> }; captionFormatting: HammerCaptionFormattingState; captionRebuildConsequenceLabel: string;
  captionReleasePrepSafetyDetail: string; captionReleasePrepSafetyLabel: string; captionReleasePrepSafetyState: string; captionReleaseSourceLabel: string; captionSourceLabel: string;
  selectedCaptionArtifactFormat: "srt" | "vtt";
}>;
export type HammerMetadataToolBayData = Readonly<{ detailTag: string }>;
export type HammerPackagingToolBayData = Readonly<{
  selectedIntroPath: string | null; selectedOutroPath: string | null; selectedIntroAssetId: string | null; selectedOutroAssetId: string | null;
  introPlaced: boolean; outroPlaced: boolean; logoAssetPath: string | null; logoPlaced: boolean; logoPosition: HammerLogoOverlayPosition; logoSize: HammerLogoOverlaySize;
  sourceImageLibraryItems: readonly Readonly<{ path: string; name: string }>[]; logoPositionOptions: readonly Readonly<{ id: HammerLogoOverlayPosition; label: string }>[];
  logoSizeOptions: readonly Readonly<{ id: HammerLogoOverlaySize; label: string }>[]; introEntryId: string; outroEntryId: string;
}>;
export type HammerFinishingChecklist = Readonly<{ transcriptReviewed: boolean; visualsReviewed: boolean; audioReviewed: boolean }>;
export type HammerFinishingToolBayData = Readonly<{ checklist: HammerFinishingChecklist }>;
export type HammerAudioFinalizationToolBayContext = SurfaceContext<"audio_finalization", MigratedEditorSurfaceData, AudioCommands>;
export type HammerAudioAdjustmentsToolBayContext = SurfaceContext<"audio_adjustments", MigratedEditorSurfaceData, AudioCommands>;
export type HammerCaptionsToolBayContext = SurfaceContext<"captions", HammerCaptionsToolBayData, CaptionCommands>;
export type HammerMetadataToolBayContext = SurfaceContext<"metadata", HammerMetadataToolBayData, MetadataCommands>;
export type HammerPackagingToolBayContext = SurfaceContext<"packaging", HammerPackagingToolBayData, PackagingCommands>;
export type HammerFinishingToolBayContext = SurfaceContext<"finishing", HammerFinishingToolBayData, FinishingCommands>;
export type HammerReleaseSummaryArea = Readonly<{ id: string; label: string; status: string }>;
export type HammerReleaseReason = Readonly<{ label: string }>;
export type HammerQuenchHandoffStatus = Readonly<{ status: string; message: string }>;
export type HammerPreparedReleaseSummary = Readonly<{
  preparedAt: string;
  overallStatus: string;
  subtitleArtifactCount: number;
  transcriptFingerprint: string | null;
}>;
export type HammerRenderStatusSummary = Readonly<{
  message: string;
  requestedBackend: string;
  resolvedBackend: string;
  status: string;
  outputWorkpiecePath: string | null;
  appliedModules: readonly string[];
  deferredModules: readonly string[];
}>;
export type HammerReleaseReadinessToolBayContext = SurfaceContext<"release_readiness", {
  summaryAreas: readonly HammerReleaseSummaryArea[];
  readinessLabel: string;
  blockerCount: number;
  reviewCount: number;
  exportStatusLabel: string;
  sending: boolean;
  loading: boolean;
  blocked: boolean;
  sendLabel: string;
  handoffStatus: HammerQuenchHandoffStatus | null;
}, ReleaseCommands>;
export type HammerExportToolBayContext = SurfaceContext<"export", {
  handoffAvailable: boolean;
  openHref: string | null;
  exportStatusLabel: string;
  readinessLabel: string;
  readinessStatus: "ready" | "blocked" | "needs_review";
  blockerCount: number;
  reviewCount: number;
  outputSelectionSummary: string;
  previewTruthPosture: string;
  exportTruthPosture: string;
  handoffTruthPosture: string;
  unresolvedBrollCount: number;
  blockingReasons: readonly HammerReleaseReason[];
  reviewReasons: readonly HammerReleaseReason[];
  captionSafetyState: string;
  captionSafetyLabel: string;
  captionSummaryLine: string;
  captionSourceLabel: string;
  captionSafetyDetail: string;
  renderStatus: HammerRenderStatusSummary | null;
  loading: boolean;
  sending: boolean;
  sendLabel: string;
  preparedPackage: HammerPreparedReleaseSummary | null;
  exportTruthState: "never_prepared" | "current" | "stale";
  staleReasons: readonly string[];
  handoffStatus: HammerQuenchHandoffStatus | null;
  savedPackage: HammerPreparedReleaseSummary | null;
  error: string | null;
}, ReleaseCommands>;
export type HammerPassCompletionToolBayContext = SurfaceContext<"pass_completion", { passLabel: string; passStatus: string; complete: boolean }, PassCompletionCommands>;
export type HammerUnsupportedToolBayContext = Readonly<{
  surface: "unsupported";
  route: HammerToolBayRouteDecision;
  data: Readonly<{ reason: HammerToolBayContextUnsupportedReason; selectedPlacementId: string | null }>;
  commands: Readonly<Record<never, never>>;
}>;

export type HammerToolBayContext =
  | HammerTranscriptCleanupToolBayContext | HammerRetakesToolBayContext | HammerGapPacingToolBayContext
  | HammerTranscriptPolishToolBayContext | HammerVisualPolishToolBayContext
  | HammerImagePlacementToolBayContext | HammerImageTimingToolBayContext | HammerImageTransformToolBayContext | HammerImageAnimationToolBayContext
  | HammerBrollToolBayContext | HammerReferenceClipToolBayContext
  | HammerAudioFinalizationToolBayContext | HammerAudioAdjustmentsToolBayContext | HammerCaptionsToolBayContext
  | HammerMetadataToolBayContext | HammerPackagingToolBayContext | HammerFinishingToolBayContext
  | HammerReleaseReadinessToolBayContext | HammerExportToolBayContext | HammerPassCompletionToolBayContext
  | HammerUnsupportedToolBayContext;

export type HammerToolBayContextSurface = Exclude<HammerToolBayContext["surface"], "unsupported">;
export const HAMMER_TOOL_BAY_CONTEXT_SURFACES = [
  "transcript_cleanup", "retakes", "gap_pacing", "transcript_polish", "visual_polish",
  "image_placement", "image_timing", "image_transform", "image_animation", "broll", "reference_clip",
  "audio_finalization", "audio_adjustments", "captions", "metadata", "packaging", "finishing",
  "release_readiness", "export", "pass_completion",
] as const satisfies readonly HammerToolBayContextSurface[];

type ContextBySurface<S extends HammerToolBayContextSurface> = Extract<HammerToolBayContext, { surface: S }>;
export type HammerToolBayContextBuildInput = {
  [S in HammerToolBayContextSurface]: Readonly<{ surface: S; route: HammerToolBayRouteDecision; data: ContextBySurface<S>["data"] | null; commands: ContextBySurface<S>["commands"] }>
}[HammerToolBayContextSurface];

function unsupported(route: HammerToolBayRouteDecision, reason: HammerToolBayContextUnsupportedReason, placementId: string | null = null): HammerUnsupportedToolBayContext {
  return { surface: "unsupported", route, data: { reason, selectedPlacementId: placementId }, commands: {} };
}

function visualRequirement(input: HammerToolBayContextBuildInput): HammerUnsupportedToolBayContext | null {
  if (input.data === null) return unsupported(input.route, "required_data_missing");
  if (!("selectedVisual" in input.data)) return null;
  const selected = input.data.selectedVisual;
  if (selected.status !== "selected") return unsupported(input.route, "selected_visual_missing", selected.status === "unsupported" ? selected.placementId : null);
  if (selected.placementId !== input.data.placementId) return unsupported(input.route, "required_data_missing", selected.placementId);
  const imageSurface = input.surface.startsWith("image_");
  if ((imageSurface && selected.kind !== "image") || (input.surface === "broll" && selected.kind !== "broll") || (input.surface === "reference_clip" && selected.kind !== "reference_clip")) {
    return unsupported(input.route, "selected_visual_kind_mismatch", selected.placementId);
  }
  const requiredCapability = input.surface === "image_placement" ? "remove"
    : input.surface === "image_timing" ? "retime"
    : input.surface === "image_transform" ? "transform"
    : input.surface === "image_animation" ? "animate"
    : "rebind";
  if (!selected.capabilities[requiredCapability]) return unsupported(input.route, "selected_visual_capability_mismatch", selected.placementId);
  if ((input.surface === "broll" || input.surface === "reference_clip")
    && (!selected.capabilities.remove || !selected.capabilities.retime || !selected.capabilities.replace || !selected.capabilities.revert || !selected.capabilities.transition)) {
    return unsupported(input.route, "selected_visual_capability_mismatch", selected.placementId);
  }
  return null;
}

function routeMatchesSurface(surface: HammerToolBayContextSurface, route: HammerResolvedToolBayRoute): boolean {
  return surface === "pass_completion" || surface === route.surface;
}

export function buildHammerToolBayContext(input: HammerToolBayContextBuildInput): HammerToolBayContext {
  if (input.route.status !== "resolved") {
    const reason = input.route.status === "unsupported" ? input.route.reason : "route_not_resolved";
    const placementId = input.route.status === "unsupported" ? input.route.selectedPlacementId : null;
    return unsupported(input.route, reason, placementId);
  }
  if (!routeMatchesSurface(input.surface, input.route)) return unsupported(input.route, "route_surface_mismatch");
  if (input.data === null) return unsupported(input.route, "required_data_missing");
  const visualFailure = visualRequirement(input);
  if (visualFailure) return visualFailure;
  return { surface: input.surface, route: input.route, data: input.data, commands: input.commands } as HammerToolBayContext;
}
