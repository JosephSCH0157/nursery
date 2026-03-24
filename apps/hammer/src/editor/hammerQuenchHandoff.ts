import type { HammerRenderAssemblyResult } from "./hammerRenderAssembly";
import type { HammerReadinessGateResult } from "./hammerReadinessGate";
import type { HammerQuenchReleasePacketArtifacts } from "../lib/hammerQuenchReleasePacket";

export type HammerQuenchHandoffStatus =
  | "sent"
  | "blocked"
  | "failed_validation"
  | "failed_persistence"
  | "failed_handoff";

export interface HammerQuenchHandoffDecision {
  status: "allowed" | "requires_confirmation" | "blocked";
  reasons: string[];
}

export interface HammerQuenchPacketValidationResult {
  ok: boolean;
  reasons: string[];
}

export function decideHammerQuenchHandoff(args: {
  readinessGate: HammerReadinessGateResult;
}): HammerQuenchHandoffDecision {
  if (args.readinessGate.status === "blocked") {
    return {
      status: "blocked",
      reasons: args.readinessGate.blocking_reasons.map((reason) => reason.label),
    };
  }
  if (args.readinessGate.status === "needs_review") {
    return {
      status: "requires_confirmation",
      reasons: args.readinessGate.review_reasons.map((reason) => reason.label),
    };
  }
  return {
    status: "allowed",
    reasons: [],
  };
}

export function validateHammerQuenchPacketForHandoff(args: {
  packet: HammerQuenchReleasePacketArtifacts;
  renderAssembly: HammerRenderAssemblyResult;
  readinessGate: HammerReadinessGateResult;
}): HammerQuenchPacketValidationResult {
  const reasons: string[] = [];
  if (!args.packet.manifest.workpiece_id) {
    reasons.push("Missing workpiece id in release packet.");
  }
  if (!args.packet.manifest.packet_kind || args.packet.manifest.packet_kind !== "quench_release_packet") {
    reasons.push("Invalid release packet kind.");
  }
  if (!args.packet.manifest.editorial_truth) {
    reasons.push("Missing editorial truth payload.");
  } else if (!args.packet.manifest.editorial_truth.export_timeline_snapshot) {
    reasons.push("Missing export timeline snapshot in editorial truth.");
  }
  if (args.renderAssembly.export_timeline.export_posture === "unavailable") {
    reasons.push("Export posture is unavailable.");
  }
  if (args.readinessGate.status === "blocked") {
    reasons.push("Readiness gate is blocked.");
  }
  return {
    ok: reasons.length === 0,
    reasons,
  };
}
