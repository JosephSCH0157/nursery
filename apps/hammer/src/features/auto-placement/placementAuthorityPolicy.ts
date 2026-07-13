export type PlacementEvidenceFailureKind = "unavailable" | "failed" | "stale" | "wrong_frame";

export type PlacementMatteEvidence =
  | Readonly<{ kind: "current"; foreground: "detected" | "all_background" }>
  | Readonly<{ kind: PlacementEvidenceFailureKind; reason: string }>;

export type PlacementFaceEvidence =
  | Readonly<{ kind: "current"; faceCount: number }>
  | Readonly<{ kind: PlacementEvidenceFailureKind; reason: string }>;

export type AutomaticPlacementCandidateEvidence =
  | Readonly<{ kind: "safe" }>
  | Readonly<{ kind: "no_safe_candidate"; reason: string }>
  | Readonly<{ kind: "not_evaluated"; reason: string }>;

export type AutomaticPlacementRefusalReason =
  | "matte_unavailable"
  | "matte_failed"
  | "matte_stale"
  | "matte_wrong_frame"
  | "face_analysis_unavailable"
  | "face_analysis_failed"
  | "face_analysis_stale"
  | "face_analysis_wrong_frame"
  | "candidate_evaluation_not_completed"
  | "no_safe_placement";

export type AutomaticPlacementAuthorityDecision =
  | Readonly<{
    kind: "commit_allowed";
    automaticCommitAllowed: true;
    manualPlacementAvailable: true;
    diagnosticsAvailable: boolean;
    matteForeground: "detected" | "all_background";
    faceAnalysisOutcome: "faces_detected" | "successful_zero_faces";
  }>
  | Readonly<{
    kind: "refused";
    automaticCommitAllowed: false;
    manualPlacementAvailable: true;
    diagnosticsAvailable: boolean;
    reason: AutomaticPlacementRefusalReason;
    detail: string;
  }>;

function refuse(args: {
  reason: AutomaticPlacementRefusalReason;
  detail: string;
  diagnosticsAvailable: boolean;
}): AutomaticPlacementAuthorityDecision {
  return Object.freeze({
    kind: "refused",
    automaticCommitAllowed: false,
    manualPlacementAvailable: true,
    diagnosticsAvailable: args.diagnosticsAvailable,
    reason: args.reason,
    detail: args.detail,
  });
}

const matteFailureReasons: Record<PlacementEvidenceFailureKind, AutomaticPlacementRefusalReason> = {
  unavailable: "matte_unavailable",
  failed: "matte_failed",
  stale: "matte_stale",
  wrong_frame: "matte_wrong_frame",
};

const faceFailureReasons: Record<PlacementEvidenceFailureKind, AutomaticPlacementRefusalReason> = {
  unavailable: "face_analysis_unavailable",
  failed: "face_analysis_failed",
  stale: "face_analysis_stale",
  wrong_frame: "face_analysis_wrong_frame",
};

export function evaluateAutomaticPlacementAuthority(args: {
  matte: PlacementMatteEvidence;
  faceAnalysis: PlacementFaceEvidence;
  candidate: AutomaticPlacementCandidateEvidence;
  diagnostics: "available" | "unavailable";
}): AutomaticPlacementAuthorityDecision {
  const diagnosticsAvailable = args.diagnostics === "available";

  if (args.matte.kind !== "current") {
    return refuse({
      reason: matteFailureReasons[args.matte.kind],
      detail: args.matte.reason,
      diagnosticsAvailable,
    });
  }

  if (args.faceAnalysis.kind !== "current") {
    return refuse({
      reason: faceFailureReasons[args.faceAnalysis.kind],
      detail: args.faceAnalysis.reason,
      diagnosticsAvailable,
    });
  }

  if (!Number.isInteger(args.faceAnalysis.faceCount) || args.faceAnalysis.faceCount < 0) {
    return refuse({
      reason: "face_analysis_failed",
      detail: "Current face analysis reported an invalid face count.",
      diagnosticsAvailable,
    });
  }

  if (args.candidate.kind === "not_evaluated") {
    return refuse({
      reason: "candidate_evaluation_not_completed",
      detail: args.candidate.reason,
      diagnosticsAvailable,
    });
  }

  if (args.candidate.kind === "no_safe_candidate") {
    return refuse({
      reason: "no_safe_placement",
      detail: args.candidate.reason,
      diagnosticsAvailable,
    });
  }

  return Object.freeze({
    kind: "commit_allowed",
    automaticCommitAllowed: true,
    manualPlacementAvailable: true,
    diagnosticsAvailable,
    matteForeground: args.matte.foreground,
    faceAnalysisOutcome: args.faceAnalysis.faceCount === 0
      ? "successful_zero_faces"
      : "faces_detected",
  });
}
