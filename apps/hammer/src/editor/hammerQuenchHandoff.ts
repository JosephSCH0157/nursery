import type { HammerRenderAssemblyResult } from "./hammerRenderAssembly";
import type { HammerReadinessGateResult } from "./hammerReadinessGate";
import {
  createHammerReadinessReason,
  type HammerReadinessReason,
  type HammerReadinessReasonCode,
} from "./hammerReadinessTypes";
import type { HammerQuenchReleasePacketArtifacts } from "../lib/hammerQuenchReleasePacket";
import type { HammerReleasePrepPackage } from "../lib/hammerReleasePrepPackage";
import { deriveHammerReleaseHandoffPosture } from "../lib/hammerReleaseHandoffPosture";

export type HammerQuenchHandoffStatus =
  | "sent"
  | "blocked"
  | "failed_validation"
  | "failed_persistence"
  | "failed_handoff";

export const HAMMER_QUENCH_HANDOFF_PACKAGE_SAVED_MESSAGE = "Release package saved.";

export interface HammerQuenchHandoffDecision {
  status: "allowed" | "requires_confirmation" | "blocked";
  reasonCodes: HammerReadinessReasonCode[];
  reasonDetails: HammerReadinessReason[];
  reasons: string[];
}

export interface HammerQuenchPacketValidationResult {
  ok: boolean;
  reasonCodes: HammerReadinessReasonCode[];
  reasonDetails: HammerReadinessReason[];
  reasons: string[];
}

export function decideHammerQuenchHandoff(args: {
  releasePrepPackage: HammerReleasePrepPackage;
  readinessGate: HammerReadinessGateResult;
}): HammerQuenchHandoffDecision {
  const posture = deriveHammerReleaseHandoffPosture(args);
  if (posture.handoff_status === "blocked") {
    return {
      status: "blocked",
      reasonCodes: posture.blocking_reason_codes,
      reasonDetails: posture.blocking_reason_details,
      reasons: posture.blocking_reasons,
    };
  }
  if (posture.handoff_status === "needs_review") {
    return {
      status: "requires_confirmation",
      reasonCodes: posture.review_reason_codes,
      reasonDetails: posture.review_reason_details,
      reasons: posture.review_reasons,
    };
  }
  return {
    status: "allowed",
    reasonCodes: [],
    reasonDetails: [],
    reasons: [],
  };
}

export function validateHammerQuenchPacketForHandoff(args: {
  releasePrepPackage: HammerReleasePrepPackage;
  packet: HammerQuenchReleasePacketArtifacts;
  renderAssembly: HammerRenderAssemblyResult;
  readinessGate: HammerReadinessGateResult;
}): HammerQuenchPacketValidationResult {
  const posture = deriveHammerReleaseHandoffPosture({
    releasePrepPackage: args.releasePrepPackage,
    readinessGate: args.readinessGate,
  });
  const reasonDetails: HammerReadinessReason[] = [];
  if (!args.packet.manifest.workpiece_id) {
    reasonDetails.push(createHammerReadinessReason({
      code: "packet_workpiece_id_missing",
      label: "Missing workpiece id in release packet.",
      severity: "blocking",
      source: "packet",
    }));
  }
  if (!args.packet.manifest.packet_kind || args.packet.manifest.packet_kind !== "quench_release_packet") {
    reasonDetails.push(createHammerReadinessReason({
      code: "packet_kind_invalid",
      label: "Invalid release packet kind.",
      severity: "blocking",
      source: "packet",
    }));
  }
  if (!args.packet.manifest.editorial_truth) {
    reasonDetails.push(createHammerReadinessReason({
      code: "packet_editorial_truth_missing",
      label: "Missing editorial truth payload.",
      severity: "blocking",
      source: "packet",
    }));
  } else if (!args.packet.manifest.editorial_truth.export_timeline_snapshot) {
    reasonDetails.push(createHammerReadinessReason({
      code: "packet_timeline_snapshot_missing",
      label: "Missing export timeline snapshot in editorial truth.",
      severity: "blocking",
      source: "packet",
    }));
  }
  if (
    args.packet.manifest.audio.kind !== "final_master"
    || !args.packet.manifest.audio.canonical_asset_id
    || !args.packet.manifest.audio.canonical_content_hash
  ) {
    reasonDetails.push(createHammerReadinessReason({
      code: "packet_final_audio_master_missing",
      label: "The release packet does not contain a validated canonical final-audio master.",
      severity: "blocking",
      source: "packet",
    }));
  }
  if (args.renderAssembly.export_timeline.export_posture === "unavailable") {
    reasonDetails.push(createHammerReadinessReason({
      code: "packet_timeline_snapshot_missing",
      label: "Export posture is unavailable.",
      severity: "blocking",
      source: "packet",
    }));
  }
  if (posture.handoff_status === "blocked") {
    reasonDetails.push(...posture.blocking_reason_details);
    reasonDetails.push(createHammerReadinessReason({
      code: "handoff_blocked",
      label: "Handoff is blocked.",
      severity: "blocking",
      source: "handoff",
    }));
  } else if (posture.handoff_status === "needs_review") {
    reasonDetails.push(...posture.review_reason_details);
    reasonDetails.push(createHammerReadinessReason({
      code: "handoff_needs_review",
      label: "Handoff needs review.",
      severity: "review",
      source: "handoff",
    }));
  }
  const dedupedReasonDetails = reasonDetails.filter((reason, index, rows) => (
    rows.findIndex((candidate) => (
      candidate.code === reason.code
      && candidate.operationId === reason.operationId
      && candidate.severity === reason.severity
      && candidate.source === reason.source
    )) === index
  ));
  return {
    ok: !dedupedReasonDetails.some((reason) => reason.severity === "blocking"),
    reasonCodes: dedupedReasonDetails.map((reason) => reason.code),
    reasonDetails: dedupedReasonDetails,
    reasons: dedupedReasonDetails.map((reason) => reason.label),
  };
}
