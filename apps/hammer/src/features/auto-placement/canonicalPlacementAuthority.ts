import { evaluateFaceAnalysis, sameFaceAnalysisFrame } from "../eye-contact-assist/analysis/faceAnalysisAuthority";
import type { FaceAnalysisFrameRef, FaceAnalysisResult } from "../eye-contact-assist/types";
import type { ForegroundMatte } from "../visual-effects/types";
import { resolveMaskAwarePlacement } from "./maskAwarePlacement";
import { evaluateAutomaticPlacementAuthority } from "./placementAuthorityPolicy";
import type { AutomaticPlacementAuthorityDecision } from "./placementAuthorityPolicy";
import type {
  MaskAwarePlacementResult,
  Rect,
} from "./types";

export type FrameBoundPlacementMatteResult =
  | Readonly<{
    kind: "success";
    frameRef: FaceAnalysisFrameRef;
    matte: ForegroundMatte;
    speakerMaskBounds: readonly Rect[];
  }>
  | Readonly<{
    kind: "failed";
    frameRef: FaceAnalysisFrameRef;
    reason: string;
  }>;

export type CanonicalAutomaticPlacementResult = Readonly<{
  requestedFrameRef: FaceAnalysisFrameRef;
  decision: AutomaticPlacementAuthorityDecision;
  placement: MaskAwarePlacementResult | null;
  speakerMaskBounds: readonly Rect[];
  headSafeBounds: readonly Rect[];
}>;

export function resolveCanonicalAutomaticPlacement(args: {
  requestedFrameRef: FaceAnalysisFrameRef;
  matteResult: FrameBoundPlacementMatteResult | null;
  faceResult: FaceAnalysisResult | null;
  overlay: { width: number; height: number };
  reservedZones?: Rect[];
  recentPlacements?: Array<{ zone: MaskAwarePlacementResult["zone"]; rect: Rect; count?: number }>;
  selectionSeed?: number;
  diagnosticsAvailable?: boolean;
}): CanonicalAutomaticPlacementResult {
  const matteEvidence = (() => {
    if (!args.matteResult) return { kind: "unavailable" as const, reason: "Canonical matte has not completed for the requested frame." };
    if (!sameFaceAnalysisFrame(args.matteResult.frameRef, args.requestedFrameRef)) {
      return { kind: "wrong_frame" as const, reason: "Canonical matte belongs to a different immutable frame reference." };
    }
    if (args.matteResult.kind === "failed") return { kind: "failed" as const, reason: args.matteResult.reason };
    return {
      kind: "current" as const,
      foreground: args.matteResult.matte.alphaMask.some((alpha) => alpha > 0)
        ? "detected" as const
        : "all_background" as const,
    };
  })();

  const faceEvaluation = args.faceResult
    ? evaluateFaceAnalysis(args.faceResult, args.requestedFrameRef)
    : null;
  const faceEvidence = (() => {
    if (!faceEvaluation) return { kind: "unavailable" as const, reason: "Shared face analysis has not completed for the requested frame." };
    if (faceEvaluation.kind === "stale") return { kind: "stale" as const, reason: "Shared face analysis belongs to a different immutable frame reference." };
    if (faceEvaluation.result.kind === "unavailable") return { kind: "unavailable" as const, reason: faceEvaluation.result.reason };
    if (faceEvaluation.result.kind === "failed") return { kind: "failed" as const, reason: faceEvaluation.result.reason };
    return { kind: "current" as const, faceCount: faceEvaluation.result.faces.length };
  })();

  const currentMatte = matteEvidence.kind === "current" && args.matteResult?.kind === "success"
    ? args.matteResult
    : null;
  const currentFaces = faceEvidence.kind === "current"
    && faceEvaluation?.kind === "current"
    && faceEvaluation.result.kind === "success"
    ? faceEvaluation.result.faces
    : null;
  const headSafeBounds = currentFaces?.map((face) => face.headSafeBoundsPx) ?? [];
  const placement = currentMatte && currentFaces
    ? resolveMaskAwarePlacement({
      frame: { width: args.requestedFrameRef.width, height: args.requestedFrameRef.height },
      overlay: args.overlay,
      speakerMaskBounds: [...currentMatte.speakerMaskBounds],
      headSafeBounds,
      canonicalMatte: currentMatte.matte,
      reservedZones: args.reservedZones,
      recentPlacements: args.recentPlacements,
      selectionSeed: args.selectionSeed,
      allowScaleFallback: true,
    })
    : null;
  const candidateEvidence = currentMatte && currentFaces
    ? placement
      ? { kind: "safe" as const }
      : { kind: "no_safe_candidate" as const, reason: "No candidate remained after face safety, matte scoring, reserved zones, and scale fallback." }
    : { kind: "not_evaluated" as const, reason: "Candidate evaluation requires exact-current matte and face analysis." };
  const decision = evaluateAutomaticPlacementAuthority({
    matte: matteEvidence,
    faceAnalysis: faceEvidence,
    candidate: candidateEvidence,
    diagnostics: args.diagnosticsAvailable === false ? "unavailable" : "available",
  });

  return Object.freeze({
    requestedFrameRef: args.requestedFrameRef,
    decision,
    placement: decision.kind === "commit_allowed" ? placement : null,
    speakerMaskBounds: currentMatte?.speakerMaskBounds ?? [],
    headSafeBounds: Object.freeze(headSafeBounds),
  });
}
