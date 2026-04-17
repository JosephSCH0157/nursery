import type { HammerReleasePrepPackage, HammerReleasePrepStatus } from "./hammerReleasePrepPackage";
import type { HammerReadinessGateResult } from "../editor/hammerReadinessGate";
import {
  buildHammerReadinessVerdict,
  createHammerReadinessReason,
  type HammerReadinessReason,
  type HammerReadinessReasonCode,
  type HammerReadinessVerdictStatus,
} from "../editor/hammerReadinessTypes";

export type HammerReleaseHandoffStatus = HammerReadinessVerdictStatus;

export interface HammerReleaseHandoffPosture {
  artifact_status: HammerReleasePrepStatus;
  verdict: HammerReadinessGateResult;
  handoff_status: HammerReleaseHandoffStatus;
  ready_for_quench: boolean;
  artifact_reason_codes: HammerReadinessReasonCode[];
  artifact_reason_details: HammerReadinessReason[];
  artifact_reasons: string[];
  blocking_reason_codes: HammerReadinessReasonCode[];
  blocking_reason_details: HammerReadinessReason[];
  blocking_reasons: string[];
  review_reason_codes: HammerReadinessReasonCode[];
  review_reason_details: HammerReadinessReason[];
  review_reasons: string[];
  reason_codes: HammerReadinessReasonCode[];
  reason_details: HammerReadinessReason[];
  reasons: string[];
}

function resolveArtifactReason(args: {
  label: string;
  linkingVerb?: "is" | "are";
  status: HammerReleasePrepStatus;
  codes: {
    missing?: HammerReadinessReasonCode;
    stale?: HammerReadinessReasonCode;
    failed?: HammerReadinessReasonCode;
    unsupported?: HammerReadinessReasonCode;
    requiresFutureFfmpeg?: HammerReadinessReasonCode;
  };
}): HammerReadinessReason | null {
  const linkingVerb = args.linkingVerb ?? "is";
  switch (args.status) {
    case "ready":
      return null;
    case "missing":
      return args.codes.missing
        ? createHammerReadinessReason({
          code: args.codes.missing,
          label: `${args.label} ${linkingVerb} missing.`,
          severity: "blocking",
          source: "artifact",
        })
        : null;
    case "stale":
      return args.codes.stale
        ? createHammerReadinessReason({
          code: args.codes.stale,
          label: `${args.label} ${linkingVerb} stale.`,
          severity: "blocking",
          source: "artifact",
        })
        : null;
    case "failed":
      return args.codes.failed
        ? createHammerReadinessReason({
          code: args.codes.failed,
          label: `${args.label} failed during preparation.`,
          severity: "blocking",
          source: "artifact",
        })
        : null;
    case "unsupported":
      return args.codes.unsupported
        ? createHammerReadinessReason({
          code: args.codes.unsupported,
          label: `${args.label} is unsupported in the current runtime.`,
          severity: "blocking",
          source: "artifact",
        })
        : null;
    case "requires_future_ffmpeg":
      return args.codes.requiresFutureFfmpeg
        ? createHammerReadinessReason({
          code: args.codes.requiresFutureFfmpeg,
          label: `${args.label} requires future FFmpeg-backed preparation.`,
          severity: "blocking",
          source: "artifact",
        })
        : null;
    default:
      return null;
  }
}

export function resolveHammerReleasePrepOverallStatus(pkg: HammerReleasePrepPackage): HammerReleasePrepStatus {
  return pkg.readiness.blocking_statuses[0] ?? "ready";
}

export function buildHammerReleasePrepArtifactReasonDetails(pkg: HammerReleasePrepPackage): HammerReadinessReason[] {
  return [
    resolveArtifactReason({
      label: "Transcript output",
      linkingVerb: "is",
      status: pkg.readiness.transcript_output,
      codes: {
        missing: "artifact_transcript_missing",
        stale: "artifact_transcript_stale",
        failed: "artifact_transcript_failed",
      },
    }),
    resolveArtifactReason({
      label: "SRT captions",
      linkingVerb: "are",
      status: pkg.readiness.subtitles.srt,
      codes: {
        missing: "artifact_subtitles_srt_missing",
        stale: "artifact_subtitles_srt_stale",
      },
    }),
    resolveArtifactReason({
      label: "VTT captions",
      linkingVerb: "are",
      status: pkg.readiness.subtitles.vtt,
      codes: {
        missing: "artifact_subtitles_vtt_missing",
        stale: "artifact_subtitles_vtt_stale",
      },
    }),
    resolveArtifactReason({
      label: "Visual placements",
      linkingVerb: "are",
      status: pkg.readiness.visuals,
      codes: {
        missing: "artifact_visuals_missing",
        stale: "artifact_visuals_stale",
      },
    }),
    resolveArtifactReason({
      label: "Audio prep",
      linkingVerb: "is",
      status: pkg.readiness.audio_polish,
      codes: {
        missing: "artifact_audio_missing",
        stale: "artifact_audio_stale",
        failed: "artifact_audio_failed",
        unsupported: "artifact_audio_unsupported",
        requiresFutureFfmpeg: "artifact_audio_requires_future_ffmpeg",
      },
    }),
  ].filter((reason): reason is HammerReadinessReason => Boolean(reason));
}

export function buildHammerReleasePrepArtifactReasons(pkg: HammerReleasePrepPackage): string[] {
  return buildHammerReleasePrepArtifactReasonDetails(pkg).map((reason) => reason.label);
}

export function deriveHammerReleaseHandoffPosture(args: {
  releasePrepPackage: HammerReleasePrepPackage;
  readinessGate: HammerReadinessGateResult;
}): HammerReleaseHandoffPosture {
  const artifactReasonDetails = buildHammerReleasePrepArtifactReasonDetails(args.releasePrepPackage);
  const blockingReasonDetails = [...artifactReasonDetails, ...args.readinessGate.blockingReasons];
  const reviewReasonDetails = blockingReasonDetails.length > 0 ? [] : args.readinessGate.reviewReasons;
  const verdict = buildHammerReadinessVerdict({
    blockingReasons: blockingReasonDetails,
    reviewReasons: reviewReasonDetails,
  });
  const handoffStatus: HammerReleaseHandoffStatus = verdict.status;
  const artifactReasons = artifactReasonDetails.map((reason) => reason.label);
  const blockingReasons = verdict.blockingReasons.map((reason) => reason.label);
  const reviewReasons = verdict.reviewReasons.map((reason) => reason.label);
  const reasons = verdict.reasons.map((reason) => reason.label);

  return {
    artifact_status: resolveHammerReleasePrepOverallStatus(args.releasePrepPackage),
    verdict,
    handoff_status: handoffStatus,
    ready_for_quench: verdict.readyForQuench,
    artifact_reason_codes: artifactReasonDetails.map((reason) => reason.code),
    artifact_reason_details: artifactReasonDetails,
    artifact_reasons: artifactReasons,
    blocking_reason_codes: verdict.blockingReasons.map((reason) => reason.code),
    blocking_reason_details: verdict.blockingReasons,
    blocking_reasons: blockingReasons,
    review_reason_codes: verdict.reviewReasons.map((reason) => reason.code),
    review_reason_details: verdict.reviewReasons,
    review_reasons: reviewReasons,
    reason_codes: verdict.reasons.map((reason) => reason.code),
    reason_details: verdict.reasons,
    reasons,
  };
}
