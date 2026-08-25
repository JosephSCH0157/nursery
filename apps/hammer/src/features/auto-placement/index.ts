export { evaluateMaskAwarePlacementCandidates, resolveMaskAwarePlacement, resolveMaskAwarePlacementWithScaleFallback } from "./maskAwarePlacement";
export { evaluateAutomaticPlacementAuthority } from "./placementAuthorityPolicy";
export { resolveCanonicalAutomaticPlacement } from "./canonicalPlacementAuthority";
export type {
  CanonicalAutomaticPlacementResult,
  FrameBoundPlacementMatteResult,
} from "./canonicalPlacementAuthority";
export { PlacementAnalysisLifecycle } from "./placementAnalysisLifecycle";
export type { FrameBoundPlacementEvidencePair } from "./placementAnalysisLifecycle";
export { PlacementFrameAnalysisAuthority } from "./placementFrameAnalysisAuthority";
export type { PlacementFrameAnalysisRequest, PlacementFrameEvidence, PlacementSegmentationBundleResult } from "./placementFrameAnalysisAuthority";
export { TimelinePlacementAnalysisQueue, timelinePlacementWorkKey } from "./timelinePlacementAnalysisQueue";
export type { TimelinePlacementAnalysisEntry, TimelinePlacementAnalysisResult, TimelinePlacementAnalysisStatus, TimelinePlacementAnalysisWorkItem } from "./timelinePlacementAnalysisQueue";
export {
  evaluatePlacementFrameAgainstDisplay,
  readPlacementDisplaySnapshot,
} from "./placementFrameDisplayAuthority";
export type {
  PlacementDisplaySnapshot,
  PlacementFrameDisplayEvaluation,
} from "./placementFrameDisplayAuthority";
export {
  createPlacementMatteOverlapIndex,
  PLACEMENT_FOREGROUND_ALPHA_THRESHOLD,
} from "./matteOverlap";
export type { PlacementMatteOverlapIndex } from "./matteOverlap";
export {
  extractSpeakerMaskBoundsFromMatte,
  MAX_SPEAKER_MASK_COMPONENTS,
  SPEAKER_MASK_ALPHA_THRESHOLD,
  SPEAKER_MASK_MIN_AREA_RATIO,
  SPEAKER_MASK_MIN_PIXELS,
} from "./speakerMaskAnalysis";
export type {
  AutomaticPlacementAuthorityDecision,
  AutomaticPlacementCandidateEvidence,
  PlacementFaceEvidence,
  PlacementMatteEvidence,
} from "./placementAuthorityPolicy";
export type {
  DebugPlacementCandidate,
  PlacementLayoutMode,
  PlacementForegroundMatte,
  PlacementMatteOverlap,
  MaskAwarePlacementInput,
  MaskAwarePlacementResult,
  PlacementZone,
  Rect,
} from "./types";
