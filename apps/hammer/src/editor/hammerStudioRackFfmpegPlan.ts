import type { HammerStudioRackState } from "./hammerStudioRack";
import { buildHammerVoicePolishTier2FfmpegFilters } from "./hammerVoicePolish";
import { buildHammerAudioDspPlan, type HammerAudioDspPlanV1 } from "./hammerAudioDspPlan";

export type HammerStudioRackModuleId =
  | "gate"
  | "compressor"
  | "eq"
  | "reverb"
  | "tubeMicCharacter"
  | "voice_polish_tier2";

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
  dspFingerprint: string;
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
    "agate=",
    `threshold=${threshold.toFixed(6)}`,
    `range=${range.toFixed(6)}`,
    `attack=${attack.toFixed(1)}`,
    `release=${release.toFixed(1)}`,
  ].join(":").replace("=:", "=");
}

function buildCompressorFilter(rackState: HammerStudioRackState): string {
  const compressor = rackState.modules.compressor;
  const threshold = toLinearFromDb(clamp(compressor.threshold_db, -60, 0));
  const ratio = clamp(compressor.ratio, 1, 20);
  const attack = clamp(compressor.attack_ms, 0.5, 120);
  const release = clamp(compressor.release_ms, 10, 1200);
  const makeup = toLinearFromDb(clamp(compressor.makeup_gain_db, -12, 18));
  return [
    "acompressor=",
    `threshold=${threshold.toFixed(6)}`,
    `ratio=${ratio.toFixed(2)}`,
    `attack=${attack.toFixed(1)}`,
    `release=${release.toFixed(1)}`,
    `makeup=${makeup.toFixed(3)}`,
  ].join(":").replace("=:", "=");
}

export function buildHammerStudioRackFfmpegPlan(rackState: HammerStudioRackState): HammerStudioRackFfmpegPlan {
  const filters: string[] = [];
  const appliedModules: HammerStudioRackModuleId[] = [];
  const decisions: HammerStudioRackFfmpegModuleDecision[] = [];

  if (!rackState.is_enabled || rackState.is_bypassed) {
    const summary: Record<string, string | number | boolean | null> = {
      rack_enabled: rackState.is_enabled,
      rack_bypassed: rackState.is_bypassed,
      filter_count: 0,
      filter_chain: "",
      applied_modules: "",
      voice_cleanup_enabled: rackState.voice_polish?.voice_cleanup_enabled ?? false,
    };
    return {
      filters,
      filterChain: "",
      appliedModules,
      decisions,
      summary,
      dspFingerprint: buildHammerAudioDspPlan(rackState).dspFingerprint,
    };
  }

  const voicePolishFilters = rackState.voice_polish
    ? buildHammerVoicePolishTier2FfmpegFilters(rackState.voice_polish)
    : [];
  if (voicePolishFilters.length > 0) {
    filters.push(...voicePolishFilters);
    appliedModules.push("voice_polish_tier2");
    decisions.push({
      moduleId: "voice_polish_tier2",
      requested: true,
      applied: true,
      reason: "applied_in_v1",
    });

  }

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

  const eqRequest = moduleRequested(rackState.modules.eq);
  if (eqRequest.requested) {
    const eq = rackState.modules.eq;
    filters.push(`lowshelf=f=${clamp(eq.low_shelf_hz, 20, 20000).toFixed(1)}:g=${clamp(eq.low_shelf_gain_db, -12, 12).toFixed(2)}`);
    filters.push(`equalizer=f=${clamp(eq.mid_hz, 20, 20000).toFixed(1)}:t=q:w=${clamp(eq.mid_q, 0.1, 20).toFixed(2)}:g=${clamp(eq.mid_gain_db, -12, 12).toFixed(2)}`);
    filters.push(`highshelf=f=${clamp(eq.high_shelf_hz, 20, 20000).toFixed(1)}:g=${clamp(eq.high_shelf_gain_db, -12, 12).toFixed(2)}`);
    appliedModules.push("eq"); decisions.push({ moduleId: "eq", requested: true, applied: true, reason: "applied_in_v1" });
  } else decisions.push({ moduleId: "eq", requested: false, applied: false, reason: eqRequest.reason ?? "module_disabled" });

  const reverbRequest = moduleRequested(rackState.modules.reverb);
  if (reverbRequest.requested) {
    const reverb = rackState.modules.reverb;
    const mix = clamp(reverb.mix, 0, 0.35);
    const delay = clamp(reverb.predelay_ms + (reverb.decay_sec * 90), 1, 1000);
    const decay = clamp(mix * 1.8, 0, 0.9);
    filters.push(`aecho=in_gain=1:out_gain=${clamp(1 - (mix * 0.35), 0.5, 1).toFixed(3)}:delays=${delay.toFixed(1)}:decays=${decay.toFixed(3)}`);
    appliedModules.push("reverb"); decisions.push({ moduleId: "reverb", requested: true, applied: true, reason: "applied_in_v1" });
  } else decisions.push({ moduleId: "reverb", requested: false, applied: false, reason: reverbRequest.reason ?? "module_disabled" });

  const tubeRequest = moduleRequested(rackState.modules.tubeMicCharacter);
  if (tubeRequest.requested) {
    const tube = rackState.modules.tubeMicCharacter;
    const amount = clamp(tube.amount, 0, 1);
    filters.push(`lowshelf=f=180:g=${(clamp(tube.warmth, 0, 1) * 2.5).toFixed(2)}`);
    filters.push(`highshelf=f=8000:g=${(clamp(tube.air, 0, 1) * 2).toFixed(2)}`);
    filters.push(`asoftclip=type=tanh:threshold=${(1 - (amount * 0.35)).toFixed(3)}:output=${(1 - (amount * 0.08)).toFixed(3)}:param=${(1 + amount).toFixed(3)}:oversample=4`);
    appliedModules.push("tubeMicCharacter"); decisions.push({ moduleId: "tubeMicCharacter", requested: true, applied: true, reason: "applied_in_v1" });
  } else decisions.push({ moduleId: "tubeMicCharacter", requested: false, applied: false, reason: tubeRequest.reason ?? "module_disabled" });

  const summary: Record<string, string | number | boolean | null> = {
    rack_enabled: rackState.is_enabled,
    rack_bypassed: rackState.is_bypassed,
    filter_count: filters.length,
    filter_chain: filters.join(","),
    applied_modules: appliedModules.join(","),
    voice_cleanup_enabled: rackState.voice_polish?.voice_cleanup_enabled ?? false,
    voice_polish_preset: rackState.voice_polish?.preset_id ?? null,
    voice_polish_de_esser_strength: rackState.voice_polish?.advanced.de_esser_strength ?? null,
    voice_polish_eq_profile: rackState.voice_polish?.advanced.eq_profile ?? null,
  };
  for (const decision of decisions) {
    summary[`${decision.moduleId}_requested`] = decision.requested;
    summary[`${decision.moduleId}_applied`] = decision.applied;
    summary[`${decision.moduleId}_reason`] = decision.reason;
  }

  const dspPlan = buildHammerAudioDspPlan(rackState);
  summary.dsp_schema_version = dspPlan.schemaVersion;
  summary.dsp_implementation_version = dspPlan.implementationVersion;
  summary.dsp_fingerprint = dspPlan.dspFingerprint;
  return {
    filters,
    filterChain: filters.join(","),
    appliedModules,
    decisions,
    summary,
    dspFingerprint: dspPlan.dspFingerprint,
  };
}

export function buildHammerExactDspFfmpegPlan(plan: HammerAudioDspPlanV1): { preLoudnessFilters: string[]; decisions: { id: string; order: number; applied: boolean; detail: string | null }[] } {
  const filters: string[] = [];
  const decisions: { id: string; order: number; applied: boolean; detail: string | null }[] = [];
  const number = (parameters: Readonly<Record<string, string | number | boolean>>, key: string): number => {
    const value = Number(parameters[key]); if (!Number.isFinite(value)) throw new Error(`Invalid exact DSP parameter ${key}.`); return value;
  };
  for (const operation of plan.operations) {
    if (!operation.enabled) { decisions.push({ id: operation.id, order: operation.order, applied: false, detail: operation.bypassed ? "rack_bypassed" : "operation_disabled" }); continue; }
    const p = operation.parameters;
    switch (operation.id) {
      case "input_gain": filters.push(`volume=${number(p, "gain_db")}dB`); break;
      case "highpass_cleanup": filters.push(`highpass=f=${number(p, "frequency_hz")}`); break;
      case "noise_reduction": filters.push(`afftdn=nf=${(-20 - number(p, "amount") * 20).toFixed(1)}`); break;
      case "gate": filters.push(`agate=threshold=${toLinearFromDb(number(p, "threshold_db")).toFixed(6)}:range=${toLinearFromDb(number(p, "range_db")).toFixed(6)}:attack=${number(p, "attack_ms")}:release=${number(p, "release_ms")}`); break;
      case "corrective_eq": filters.push(`equalizer=f=${number(p, "frequency_hz")}:t=q:w=${number(p, "q")}:g=${number(p, "gain_db")}`); break;
      case "de_esser": filters.push(`deesser=i=${p.strength === "high" ? "0.55" : p.strength === "low" ? "0.25" : "0.40"}:m=0.65:f=0.58:s=o`); break;
      case "compression_level": filters.push(`acompressor=threshold=${toLinearFromDb(number(p, "threshold_db")).toFixed(6)}:ratio=${number(p, "ratio").toFixed(2)}:attack=${number(p, "attack_ms")}:release=${number(p, "release_ms")}:makeup=${toLinearFromDb(number(p, "makeup_gain_db")).toFixed(6)}`); break;
      case "tonal_eq": filters.push(`lowshelf=f=${number(p, "low_hz")}:g=${number(p, "low_gain_db")}`, `equalizer=f=${number(p, "mid_hz")}:t=q:w=${number(p, "mid_q")}:g=${number(p, "mid_gain_db")}`, `highshelf=f=${number(p, "high_hz")}:g=${number(p, "high_gain_db")}`); break;
      case "tube_saturation": filters.push(`lowshelf=f=180:g=${(number(p, "warmth") * 2.5).toFixed(2)}`, `highshelf=f=8000:g=${(number(p, "air") * 2).toFixed(2)}`, `asoftclip=type=tanh:threshold=${(1 - number(p, "amount") * 0.35).toFixed(3)}:output=${(1 - number(p, "amount") * 0.08).toFixed(3)}:param=${(1 + number(p, "amount")).toFixed(3)}:oversample=4`); break;
      case "reverb": filters.push(`aecho=in_gain=1:out_gain=${(1 - number(p, "mix") * 0.35).toFixed(3)}:delays=${(number(p, "predelay_ms") + number(p, "decay_sec") * 90).toFixed(1)}:decays=${Math.min(0.9, number(p, "mix") * 1.8).toFixed(3)}`); break;
      case "loudness_normalization":
      case "output_limiter": break;
    }
    decisions.push({ id: operation.id, order: operation.order, applied: true, detail: null });
  }
  return { preLoudnessFilters: filters, decisions };
}
