import type { HammerReleasePrepPackage, HammerReleasePrepStatus } from "./hammerReleasePrepPackage";
import type { HammerReadinessGateResult } from "../editor/hammerReadinessGate";

export type HammerReleaseHandoffStatus = "ready" | "needs_review" | "blocked";

export interface HammerReleaseHandoffPosture {
  artifact_status: HammerReleasePrepStatus;
  handoff_status: HammerReleaseHandoffStatus;
  ready_for_quench: boolean;
  artifact_reasons: string[];
  blocking_reasons: string[];
  review_reasons: string[];
  reasons: string[];
}

function describeArtifactStatus(args: {
  label: string;
  status: HammerReleasePrepStatus;
}): string | null {
  switch (args.status) {
    case "ready":
      return null;
    case "missing":
      return `${args.label} is missing.`;
    case "stale":
      return `${args.label} is stale.`;
    case "failed":
      return `${args.label} failed during preparation.`;
    case "unsupported":
      return `${args.label} is unsupported in the current runtime.`;
    case "requires_future_ffmpeg":
      return `${args.label} requires future FFmpeg-backed preparation.`;
    default:
      return `${args.label} is unavailable.`;
  }
}

export function resolveHammerReleasePrepOverallStatus(pkg: HammerReleasePrepPackage): HammerReleasePrepStatus {
  return pkg.readiness.blocking_statuses[0] ?? "ready";
}

export function buildHammerReleasePrepArtifactReasons(pkg: HammerReleasePrepPackage): string[] {
  return [
    describeArtifactStatus({ label: "Transcript output", status: pkg.readiness.transcript_output }),
    describeArtifactStatus({ label: "SRT captions", status: pkg.readiness.subtitles.srt }),
    describeArtifactStatus({ label: "VTT captions", status: pkg.readiness.subtitles.vtt }),
    describeArtifactStatus({ label: "Visual placements", status: pkg.readiness.visuals }),
    describeArtifactStatus({ label: "Audio prep", status: pkg.readiness.audio_polish }),
  ].filter((reason): reason is string => Boolean(reason));
}

export function deriveHammerReleaseHandoffPosture(args: {
  releasePrepPackage: HammerReleasePrepPackage;
  readinessGate: HammerReadinessGateResult;
}): HammerReleaseHandoffPosture {
  const artifactReasons = buildHammerReleasePrepArtifactReasons(args.releasePrepPackage);
  const gateBlockingReasons = args.readinessGate.blocking_reasons.map((reason) => reason.label);
  const gateReviewReasons = args.readinessGate.review_reasons.map((reason) => reason.label);
  const blockingReasons = [...artifactReasons, ...gateBlockingReasons];
  const reviewReasons = blockingReasons.length > 0 ? [] : gateReviewReasons;
  const handoffStatus: HammerReleaseHandoffStatus = blockingReasons.length > 0
    ? "blocked"
    : reviewReasons.length > 0
    ? "needs_review"
    : "ready";

  return {
    artifact_status: resolveHammerReleasePrepOverallStatus(args.releasePrepPackage),
    handoff_status: handoffStatus,
    ready_for_quench: handoffStatus === "ready",
    artifact_reasons: artifactReasons,
    blocking_reasons: blockingReasons,
    review_reasons: reviewReasons,
    reasons: [...blockingReasons, ...reviewReasons],
  };
}
