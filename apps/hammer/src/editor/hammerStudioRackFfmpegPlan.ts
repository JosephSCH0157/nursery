import type { HammerStudioRackState } from "./hammerStudioRack";

export type HammerStudioRackModuleId =
  | "gate"
  | "compressor"
  | "eq"
  | "reverb"
  | "tubeMicCharacter";

export interface HammerStudioRackFfmpegModuleDecision {
  moduleId: HammerStudioRackModuleId;
  requested: boolean;
  applied: boolean;
  reason: "module_disabled" | "module_bypassed" | "applied_in_v1" | "reserved_for_future_slice";
}

export interface HammerStudioRackFfmpegPlan {
  filters: string[];
  filterChain: string;
  appliedModules: HammerStudioRackModuleId[];
  decisions: HammerStudioRackFfmpegModuleDecision[];
  summary: Record<string, string | number | boolean | null>;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function toLinearFromDb(dbValue: number): number {
  return Math.pow(10, dbValue / 20);
}

function moduleRequested(state: { is_enabled: boolean; is_bypassed: boolean }): {
  requested: boolean;
  reason: "module_disabled" | "module_bypassed" | null;
} {
  if (!state.is_enabled) {
    return { requested: false, reason: "module_disabled" };
  }
  if (state.is_bypassed) {
    return { requested: false, reason: "module_bypassed" };
  }
  return { requested: true, reason: null };
}

function buildGateFilter(rackState: HammerStudioRackState): string {
  const gate = rackState.modules.gate;
  const threshold = toLinearFromDb(clamp(gate.threshold_db, -80, 0));
  const range = toLinearFromDb(clamp(gate.range_db, -60, 0));
  const attack = clamp(gate.attack_ms, 0.5, 120);
  const release = clamp(gate.release_ms, 10, 1200);
  return [
    "agate",
    `threshold=${threshold.toFixed(6)}`,
    `range=${range.toFixed(6)}`,
    `attack=${attack.toFixed(1)}`,
    `release=${release.toFixed(1)}`,
  ].join(":");
}

function buildCompressorFilter(rackState: HammerStudioRackState): string {
  const compressor = rackState.modules.compressor;
  const threshold = toLinearFromDb(clamp(compressor.threshold_db, -60, 0));
  const ratio = clamp(compressor.ratio, 1, 20);
  const attack = clamp(compressor.attack_ms, 0.5, 120);
  const release = clamp(compressor.release_ms, 10, 1200);
  const makeup = toLinearFromDb(clamp(compressor.makeup_gain_db, -12, 18));
  return [
    "acompressor",
    `threshold=${threshold.toFixed(6)}`,
    `ratio=${ratio.toFixed(2)}`,
    `attack=${attack.toFixed(1)}`,
    `release=${release.toFixed(1)}`,
    `makeup=${makeup.toFixed(3)}`,
  ].join(":");
}

function createDecision(moduleId: HammerStudioRackModuleId, state: { is_enabled: boolean; is_bypassed: boolean }): HammerStudioRackFfmpegModuleDecision {
  const requested = moduleRequested(state);
  if (!requested.requested) {
    return {
      moduleId,
      requested: false,
      applied: false,
      reason: requested.reason ?? "module_disabled",
    };
  }
  return {
    moduleId,
    requested: true,
    applied: false,
    reason: "reserved_for_future_slice",
  };
}

export function buildHammerStudioRackFfmpegPlan(rackState: HammerStudioRackState): HammerStudioRackFfmpegPlan {
  const filters: string[] = [];
  const appliedModules: HammerStudioRackModuleId[] = [];
  const decisions: HammerStudioRackFfmpegModuleDecision[] = [];

  const gateRequest = moduleRequested(rackState.modules.gate);
  if (gateRequest.requested) {
    filters.push(buildGateFilter(rackState));
    appliedModules.push("gate");
    decisions.push({
      moduleId: "gate",
      requested: true,
      applied: true,
      reason: "applied_in_v1",
    });
  } else {
    decisions.push({
      moduleId: "gate",
      requested: false,
      applied: false,
      reason: gateRequest.reason ?? "module_disabled",
    });
  }

  const compressorRequest = moduleRequested(rackState.modules.compressor);
  if (compressorRequest.requested) {
    filters.push(buildCompressorFilter(rackState));
    appliedModules.push("compressor");
    decisions.push({
      moduleId: "compressor",
      requested: true,
      applied: true,
      reason: "applied_in_v1",
    });
  } else {
    decisions.push({
      moduleId: "compressor",
      requested: false,
      applied: false,
      reason: compressorRequest.reason ?? "module_disabled",
    });
  }

  decisions.push(createDecision("eq", rackState.modules.eq));
  decisions.push(createDecision("reverb", rackState.modules.reverb));
  decisions.push(createDecision("tubeMicCharacter", rackState.modules.tubeMicCharacter));

  const summary: Record<string, string | number | boolean | null> = {
    rack_enabled: rackState.is_enabled,
    rack_bypassed: rackState.is_bypassed,
    filter_count: filters.length,
    filter_chain: filters.join(","),
    applied_modules: appliedModules.join(","),
  };
  for (const decision of decisions) {
    summary[`${decision.moduleId}_requested`] = decision.requested;
    summary[`${decision.moduleId}_applied`] = decision.applied;
    summary[`${decision.moduleId}_reason`] = decision.reason;
  }

  return {
    filters,
    filterChain: filters.join(","),
    appliedModules,
    decisions,
    summary,
  };
}
