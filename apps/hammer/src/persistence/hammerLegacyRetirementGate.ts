export interface HammerLegacyRetirementTelemetryWindow {
  reopen_attempts: number;
  reopen_hydration_failures: number;
  editorial_authority_missing_after_reopen: number;
  reason_loss_events: number;
  hammer_quench_parity_mismatches: number;
  legacy_projection_activations: number;
}

export interface HammerLegacyRetirementGateCriteria {
  min_reopen_attempts: number;
  max_reopen_hydration_failures: number;
  max_editorial_authority_missing_after_reopen: number;
  max_reason_loss_events: number;
  max_hammer_quench_parity_mismatches: number;
  max_legacy_projection_activations: number;
}

export interface HammerLegacyRetirementGateEvaluation {
  ready: boolean;
  blockers: string[];
  criteria: HammerLegacyRetirementGateCriteria;
  telemetry: HammerLegacyRetirementTelemetryWindow;
}

export const DEFAULT_HAMMER_LEGACY_RETIREMENT_GATE_CRITERIA: HammerLegacyRetirementGateCriteria = {
  min_reopen_attempts: 200,
  max_reopen_hydration_failures: 0,
  max_editorial_authority_missing_after_reopen: 0,
  max_reason_loss_events: 0,
  max_hammer_quench_parity_mismatches: 0,
  max_legacy_projection_activations: 0,
};

function clampCount(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

function normalizeTelemetryWindow(
  input: HammerLegacyRetirementTelemetryWindow,
): HammerLegacyRetirementTelemetryWindow {
  return {
    reopen_attempts: clampCount(input.reopen_attempts),
    reopen_hydration_failures: clampCount(input.reopen_hydration_failures),
    editorial_authority_missing_after_reopen: clampCount(input.editorial_authority_missing_after_reopen),
    reason_loss_events: clampCount(input.reason_loss_events),
    hammer_quench_parity_mismatches: clampCount(input.hammer_quench_parity_mismatches),
    legacy_projection_activations: clampCount(input.legacy_projection_activations),
  };
}

export function evaluateHammerLegacyRetirementGate(args: {
  telemetry: HammerLegacyRetirementTelemetryWindow;
  criteria?: Partial<HammerLegacyRetirementGateCriteria>;
}): HammerLegacyRetirementGateEvaluation {
  const criteria: HammerLegacyRetirementGateCriteria = {
    ...DEFAULT_HAMMER_LEGACY_RETIREMENT_GATE_CRITERIA,
    ...(args.criteria ?? {}),
  };
  const telemetry = normalizeTelemetryWindow(args.telemetry);
  const blockers: string[] = [];

  if (telemetry.reopen_attempts < criteria.min_reopen_attempts) {
    blockers.push("insufficient_stability_window");
  }
  if (telemetry.reopen_hydration_failures > criteria.max_reopen_hydration_failures) {
    blockers.push("reopen_hydration_failures_exceeded");
  }
  if (telemetry.editorial_authority_missing_after_reopen > criteria.max_editorial_authority_missing_after_reopen) {
    blockers.push("editorial_authority_missing_after_reopen");
  }
  if (telemetry.reason_loss_events > criteria.max_reason_loss_events) {
    blockers.push("reason_loss_detected");
  }
  if (telemetry.hammer_quench_parity_mismatches > criteria.max_hammer_quench_parity_mismatches) {
    blockers.push("hammer_quench_parity_mismatch_detected");
  }
  if (telemetry.legacy_projection_activations > criteria.max_legacy_projection_activations) {
    blockers.push("legacy_projection_activity_detected");
  }

  return {
    ready: blockers.length === 0,
    blockers,
    criteria,
    telemetry,
  };
}
